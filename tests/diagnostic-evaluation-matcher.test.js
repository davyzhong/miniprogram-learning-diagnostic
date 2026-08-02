'use strict';

const assert = require('node:assert/strict');
const test = require('node:test');

const {
  NORMALIZER_VERSION,
  answerMatches,
  normalizeText,
  textSimilarity,
} = require('../evaluation/diagnostic-accuracy/normalizers');
const {
  MATCHER_VERSION,
  matchEvaluationItems,
  regionIou,
} = require('../evaluation/diagnostic-accuracy/matcher');

const region = (x, y, width = 10, height = 10) => ({ x, y, width, height });
const gold = (sampleId, overrides = {}) => ({
  sampleId,
  subject: 'english',
  documentId: 'doc-1',
  pageId: 'page-1',
  ...overrides,
});
const prediction = (predictionId, overrides = {}) => ({
  predictionId,
  subject: 'english',
  documentId: 'doc-1',
  pageId: 'page-1',
  ...overrides,
});

test('normalization is versioned and subject-safe', () => {
  assert.match(NORMALIZER_VERSION, /^\d+\.\d+\.\d+$/u);
  assert.equal(normalizeText('Ａ＋Ｂ ＝ ３。', 'math'), 'a+b=3');
  assert.equal(normalizeText('  colour\n', 'english'), 'colour');
  assert.equal(normalizeText('Rock ’N’ Roll', 'english'), "rock 'n' roll");
  assert.equal(normalizeText(' 学 \n 习，中文。 ', 'chinese'), '学习,中文.');
  assert.equal(normalizeText('Colour', 'english'), 'colour');
  assert.notEqual(normalizeText('colour', 'english'), normalizeText('color', 'english'));
  assert.notEqual(normalizeText('未', 'chinese'), normalizeText('末', 'chinese'));
  assert.equal(normalizeText(null, 'english'), '');
});

test('answer matching uses only accepted string variants after normalization', () => {
  assert.equal(answerMatches(' Ａ ＋ Ｂ ', ['a+b', 'b+a'], 'math'), true);
  assert.equal(answerMatches('colour', ['color', 'colour'], 'english'), true);
  assert.equal(answerMatches('color', ['colour'], 'english'), false);
  assert.equal(answerMatches('', [''], 'english'), true);
  assert.equal(answerMatches(undefined, ['undefined'], 'english'), false);
  assert.equal(answerMatches('answer', null, 'english'), false);
  assert.equal(answerMatches('answer', [null, 7], 'english'), false);
});

test('text similarity is deterministic, bounded, and explicit for empty text', () => {
  assert.equal(textSimilarity('', ''), 1);
  assert.equal(textSimilarity('', 'a'), 0);
  assert.equal(textSimilarity('abcdefghij', 'abcdefghiX'), 0.9);
  assert.equal(textSimilarity('same', 'same'), 1);
  assert.ok(textSimilarity('a', 'very different') >= 0);
  assert.ok(textSimilarity('a', 'very different') <= 1);
});

test('region IoU validates coordinates and calculates overlap', () => {
  assert.equal(regionIou(region(0, 0), region(5, 0)), 1 / 3);
  assert.equal(regionIou(region(0, 0), region(0, 0)), 1);
  assert.equal(regionIou(region(0, 0), region(10, 0)), 0);
  assert.equal(regionIou(region(0, 0, 0, 10), region(0, 0)), 0);
  assert.equal(regionIou({ x: -1, y: 0, width: 10, height: 10 }, region(0, 0)), 0);
  assert.equal(regionIou({ x: NaN, y: 0, width: 10, height: 10 }, region(0, 0)), 0);
  assert.equal(regionIou(null, region(0, 0)), 0);
});

test('exact unambiguous sample ID matching is first and context-compatible', () => {
  const result = matchEvaluationItems(
    [gold('sample-1', { region: region(0, 0), text: 'other' })],
    [prediction('prediction-1', { sampleId: 'sample-1', region: region(50, 50), text: 'wrong' })],
  );

  assert.match(MATCHER_VERSION, /^\d+\.\d+\.\d+$/u);
  assert.deepEqual(result, {
    matches: [{ sampleId: 'sample-1', predictionId: 'prediction-1', method: 'sampleId', score: 1 }],
    missed: [],
    hallucinated: [],
    unresolved: [],
  });
});

test('region matching accepts the IoU threshold boundary', () => {
  const result = matchEvaluationItems(
    [gold('sample-1', { region: region(0, 0) })],
    [prediction('prediction-1', { region: region(10 / 3, 0) })],
  );

  assert.equal(result.matches.length, 1);
  assert.equal(result.matches[0].method, 'region-iou');
  assert.equal(result.matches[0].score, 0.5);
});

test('text matching accepts threshold boundary and rejects a near-tied runner-up', () => {
  const boundary = matchEvaluationItems(
    [gold('sample-1', { text: 'abcdefghij' })],
    [prediction('prediction-1', { text: 'abcdefghiX' })],
  );
  assert.deepEqual(boundary.matches, [
    { sampleId: 'sample-1', predictionId: 'prediction-1', method: 'text-similarity', score: 0.9 },
  ]);

  const ambiguous = matchEvaluationItems(
    [gold('sample-1', { text: 'abcdefghij' })],
    [
      prediction('prediction-1', { text: 'abcdefghiX' }),
      prediction('prediction-2', { text: 'abcdefghYj' }),
    ],
  );
  assert.deepEqual(ambiguous.matches, []);
  assert.deepEqual(ambiguous.unresolved, [{
    reason: 'ambiguous-text',
    goldIds: ['sample-1'],
    predictionIds: ['prediction-1', 'prediction-2'],
  }]);
  assert.deepEqual(ambiguous.hallucinated, []);
});

test('text matching accepts a winner at the exact ambiguity margin', () => {
  const result = matchEvaluationItems(
    [gold('sample-1', { text: 'abcdefghijklmnopqrst' })],
    [
      prediction('prediction-best', { text: 'abcdefghijklmnopqrsX' }),
      prediction('prediction-second', { text: 'abcdefghijklmnopqrXY' }),
    ],
  );

  assert.deepEqual(result.matches, [{
    sampleId: 'sample-1',
    predictionId: 'prediction-best',
    method: 'text-similarity',
    score: 0.95,
  }]);
  assert.deepEqual(result.hallucinated, [{
    predictionId: 'prediction-second',
    subject: 'english',
    documentId: 'doc-1',
    pageId: 'page-1',
  }]);
});

test('duplicate gold IDs, prediction IDs, and claimed sample IDs are unresolved', () => {
  const result = matchEvaluationItems(
    [gold('duplicate'), gold('duplicate'), gold('unique')],
    [
      prediction('prediction-duplicate', { sampleId: 'unique' }),
      prediction('prediction-duplicate', { sampleId: 'unique' }),
      prediction('claim-a', { sampleId: 'claimed-twice' }),
      prediction('claim-b', { sampleId: 'claimed-twice' }),
    ],
  );

  assert.deepEqual(result.matches, []);
  assert.equal(result.unresolved.length, 3);
  assert.ok(result.unresolved.some((entry) => entry.reason === 'duplicate-gold-id'));
  assert.ok(result.unresolved.some((entry) => entry.reason === 'duplicate-prediction-id'));
  assert.ok(result.unresolved.some((entry) => entry.reason === 'duplicate-sample-claim'));
  assert.deepEqual(result.missed, []);
  assert.deepEqual(result.hallucinated, []);
});

test('context conflicts and cross-subject, document, or page candidates are never matched', () => {
  for (const differingField of ['subject', 'documentId', 'pageId']) {
    const conflicting = prediction('prediction-1', {
      sampleId: 'sample-1',
      text: 'identical',
      region: region(0, 0),
      [differingField]: `different-${differingField}`,
    });
    const result = matchEvaluationItems(
      [gold('sample-1', { text: 'identical', region: region(0, 0) })],
      [conflicting],
    );
    assert.deepEqual(result.matches, [], differingField);
    assert.deepEqual(result.unresolved, [{
      reason: 'context-conflict',
      goldIds: ['sample-1'],
      predictionIds: ['prediction-1'],
    }], differingField);
  }
});

test('missing context is conservative for region matching but compatible for exact ID and text', () => {
  const regionOnly = matchEvaluationItems(
    [gold('sample-region', { region: region(0, 0) })],
    [prediction('prediction-region', { pageId: undefined, region: region(0, 0) })],
  );
  assert.deepEqual(regionOnly.matches, []);
  assert.deepEqual(regionOnly.unresolved, [{
    reason: 'insufficient-evidence',
    goldIds: ['sample-region'],
    predictionIds: ['prediction-region'],
  }]);

  const exact = matchEvaluationItems(
    [gold('sample-exact')],
    [prediction('prediction-exact', { sampleId: 'sample-exact', pageId: undefined })],
  );
  assert.equal(exact.matches[0].method, 'sampleId');

  const text = matchEvaluationItems(
    [gold('sample-text', { text: 'planet' })],
    [prediction('prediction-text', { pageId: undefined, text: 'PLANET' })],
  );
  assert.equal(text.matches[0].method, 'text-similarity');
});

test('invalid localization and text remain unresolved rather than guessed', () => {
  const result = matchEvaluationItems(
    [gold('sample-1', { region: region(0, 0, 0, 10), text: null })],
    [prediction('prediction-1', { region: region(0, 0), text: 42 })],
  );

  assert.deepEqual(result, {
    matches: [],
    missed: [],
    hallucinated: [],
    unresolved: [{
      reason: 'insufficient-evidence',
      goldIds: ['sample-1'],
      predictionIds: ['prediction-1'],
    }],
  });
});

test('one-to-one consumption refuses overlapping multi-candidate regions', () => {
  const result = matchEvaluationItems(
    [
      gold('gold-a', { region: region(0, 0) }),
      gold('gold-b', { region: region(1, 0) }),
    ],
    [prediction('prediction-1', { region: region(0, 0) })],
  );

  assert.deepEqual(result.matches, []);
  assert.deepEqual(result.unresolved, [{
    reason: 'ambiguous-region',
    goldIds: ['gold-a', 'gold-b'],
    predictionIds: ['prediction-1'],
  }]);
  assert.deepEqual(result.missed, []);
});

test('unrelated leftovers become minimal stable missed and hallucinated entries', () => {
  const result = matchEvaluationItems(
    [gold('missed', { text: 'gold' })],
    [prediction('hallucinated', { subject: 'math', documentId: 'doc-2', pageId: 'page-2', text: 'prediction' })],
  );

  assert.deepEqual(result.missed, [{
    sampleId: 'missed', subject: 'english', documentId: 'doc-1', pageId: 'page-1',
  }]);
  assert.deepEqual(result.hallucinated, [{
    predictionId: 'hallucinated', subject: 'math', documentId: 'doc-2', pageId: 'page-2',
  }]);
  assert.deepEqual(result.unresolved, []);
});

test('empty arrays and non-array inputs are handled safely', () => {
  const empty = { matches: [], missed: [], hallucinated: [], unresolved: [] };
  assert.deepEqual(matchEvaluationItems([], []), empty);
  assert.deepEqual(matchEvaluationItems(null, undefined), empty);
});

test('results are stable across shuffled input and inputs are not mutated', () => {
  const goldItems = [
    gold('id-match'),
    gold('region-match', { region: region(0, 0) }),
    gold('text-match', { pageId: 'page-2', text: 'abcdefghij' }),
    gold('missed', { pageId: 'page-3' }),
  ];
  const predictions = [
    prediction('pred-id', { sampleId: 'id-match' }),
    prediction('pred-region', { region: region(0, 0) }),
    prediction('pred-text', { pageId: 'page-2', text: 'abcdefghiX' }),
    prediction('hallucinated', { subject: 'math', documentId: 'doc-x', pageId: 'page-x' }),
  ];
  const goldSnapshot = structuredClone(goldItems);
  const predictionSnapshot = structuredClone(predictions);

  const forward = matchEvaluationItems(goldItems, predictions);
  const reverse = matchEvaluationItems([...goldItems].reverse(), [...predictions].reverse());

  assert.deepEqual(reverse, forward);
  assert.deepEqual(goldItems, goldSnapshot);
  assert.deepEqual(predictions, predictionSnapshot);
  assert.deepEqual(forward.matches.map((entry) => entry.sampleId), ['id-match', 'region-match', 'text-match']);
});

test('stable ID sorting uses locale-independent code-unit order', () => {
  const result = matchEvaluationItems(
    [gold('a'), gold('A')],
    [],
  );

  assert.deepEqual(result.missed.map((entry) => entry.sampleId), ['A', 'a']);
});

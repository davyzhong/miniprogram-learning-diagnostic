'use strict';

const assert = require('node:assert/strict');
const test = require('node:test');

const { CORE_GUARDRAILS } = require('../evaluation/diagnostic-accuracy/constants');
const { scoreChinese } = require('../evaluation/diagnostic-accuracy/scorers/chinese');
const { scoreEnglish } = require('../evaluation/diagnostic-accuracy/scorers/english');
const { scoreMath } = require('../evaluation/diagnostic-accuracy/scorers/math');
const { highestSeverity, stableTags } = require('../evaluation/diagnostic-accuracy/scorers/common');
const { ratioMetric, setMetrics } = require('../evaluation/diagnostic-accuracy/scorers/statistics');
const { scoreEvaluation } = require('../evaluation/diagnostic-accuracy/scorers');

function atPath(value, path) {
  return path.split('.').reduce((current, key) => current?.[key], value);
}

test('ratio metrics validate counts, handle empty denominators, and use bounded Wilson intervals', () => {
  assert.deepEqual(ratioMetric(0, 0), { numerator: 0, denominator: 0, rate: null, interval95: null });
  const half = ratioMetric(5, 10);
  assert.equal(half.rate, 0.5);
  assert.ok(Math.abs(half.interval95.low - 0.2366) < 0.0001);
  assert.ok(Math.abs(half.interval95.high - 0.7634) < 0.0001);
  assert.deepEqual(ratioMetric(0, 1).interval95.low, 0);
  assert.deepEqual(ratioMetric(1, 1).interval95.high, 1);
  assert.throws(() => ratioMetric(-1, 2), /nonnegative integer/u);
  assert.throws(() => ratioMetric(3, 2), /cannot exceed/u);
});

test('subject scorers distinguish required primary and optional diagnostic checks', () => {
  const math = scoreMath({
    gold: {
      text: ' 1 / 2 ', acceptedAnswers: ['1/2', '0.5'],
      attribution: { math: {
        primaryNodeId: 'leaf', ancestorNodeIds: ['ancestor'], bottleneckId: 'b1',
        errorReason: 'common-denominator', nodeIds: ['leaf', 'support'], bottleneckIds: ['b1', 'b2'],
      } },
    },
    prediction: { text: '0.5', attribution: { math: {
      primaryNodeId: 'ancestor', bottleneckId: 'b1', errorReason: 'sign-error',
      nodeIds: ['leaf', 'extra'], bottleneckIds: ['b1'],
    } } },
  });
  assert.equal(math.checks.answer, true);
  assert.equal(math.checks.nodeTop1, false);
  assert.equal(math.checks.ancestorHit, true);
  assert.equal(math.checks.bottleneckTop1, true);
  assert.equal(math.checks.errorReason, false);
  assert.deepEqual(math.sets.nodes, { precision: 0.5, recall: 0.5, f1: 0.5 });
  assert.deepEqual(math.sets.bottlenecks, { precision: 1, recall: 0.5, f1: 2 / 3 });

  const chinese = scoreChinese({
    gold: { attribution: { chinese: {
      originalItemLocation: 'page-1:item-1', errorType: 'character-form', review: 'review-character',
      migration: 'migration-character', allowedMigrationTypes: ['migration-character', 'migration-copy'],
    } } },
    prediction: { attribution: { chinese: {
      originalItemLocation: 'page-1:item-1', errorType: 'character-form', review: 'wrong-review', migration: 'migration-copy',
    } } },
  });
  assert.deepEqual(chinese.checks, {
    originalItemLocation: true, errorType: true, originalReviewBinding: false, migrationTypeLegal: true,
  });

  const english = scoreEnglish({
    gold: { attribution: { english: {
      wordIdentity: 'Bridge', recognitionSpelling: 'recognized-but-misspelled',
      stateUpdate: 'recognition-mastered-spelling-needs-practice',
    } } },
    prediction: { attribution: { english: {
      wordIdentity: 'bridge', recognitionSpelling: 'recognized-correctly',
      stateUpdate: 'recognition-mastered-spelling-mastered',
    } } },
  });
  assert.deepEqual(english.checks, {
    wordIdentity: true, recognition: true, spelling: false,
    recognitionSpelling: false, stateUpdate: false,
  });
});

test('set metrics define empty sets and calculate precision, recall, and F1', () => {
  assert.deepEqual(setMetrics([], []), { precision: 1, recall: 1, f1: 1 });
  assert.deepEqual(setMetrics(['a'], []), { precision: 0, recall: 0, f1: 0 });
});

test('error tags retain stable detail while severity uses S0 to S3 precedence', () => {
  const tags = stableTags([
    { tag: 'format', severity: 'S3' }, { tag: 'attribution', severity: 'S2' },
    { tag: 'flip', severity: 'S1' }, { tag: 'context', severity: 'S0' },
    { tag: 'flip', severity: 'S1' },
  ]);
  assert.equal(tags.length, 4);
  assert.equal(highestSeverity(tags), 'S0');
  assert.deepEqual(tags.map(({ severity }) => severity), ['S0', 'S1', 'S2', 'S3']);
});

function aggregateInput() {
  const item = (sampleId, role = 'standalone', imageQuality = 'clear') => ({
    sampleId, composite: { role }, imageQuality,
  });
  const document = (subject, items, pageId = `${subject}-page`) => ({
    documentId: `${subject}-doc`, subject, pages: [{ pageId, items }],
  });
  const label = (conclusion, subject, values, extra = {}) => ({
    conclusion, text: extra.text, acceptedAnswers: extra.acceptedAnswers,
    attribution: { subject, [subject]: values },
  });
  const annotation = (sampleId, humanLabel) => ({ sampleId, lockState: { status: 'locked' }, humanLabel });
  const record = (sampleId, subject, conclusion, values, extra = {}) => ({
    predictionId: `p-${sampleId}`, sampleId, documentId: `${subject}-doc`, pageId: `${subject}-page`,
    status: 'success', prediction: { conclusion, text: extra.text ?? '', attribution: { subject, [subject]: values } },
  });

  const dataset = { profile: 'fixture', documents: [
    document('math', [item('parent', 'parent'), item('m-ok'), item('m-missed'), item('m-failed')]),
    document('chinese', [item('c-blank')]),
    document('english', [item('e-unreadable'), item('e-readable'), item('e-unresolved', 'standalone', 'blurred')]),
  ] };
  const annotations = { annotations: [
    annotation('m-ok', label('incorrect', 'math', { primaryNodeId: 'leaf', bottleneckId: 'b1' }, { text: '1/2', acceptedAnswers: ['1/2', '0.5'] })),
    annotation('m-missed', label('correct', 'math', { primaryNodeId: 'n2', bottleneckId: 'b2' })),
    annotation('m-failed', label('incorrect', 'math', { primaryNodeId: 'n3', bottleneckId: 'b3' })),
    annotation('c-blank', label('not-an-item', 'chinese', { originalItemLocation: 'p:i', errorType: 'blank' })),
    annotation('e-unreadable', label('unreadable', 'english', { wordIdentity: 'unknown', recognitionSpelling: 'unreadable', stateUpdate: 'no-state-update' })),
    annotation('e-readable', label('correct', 'english', { wordIdentity: 'planet', recognitionSpelling: 'recognized-correctly', stateUpdate: 'recognition-mastered-spelling-mastered' })),
    annotation('e-unresolved', label('incorrect', 'english', { wordIdentity: 'bridge', recognitionSpelling: 'recognized-but-misspelled', stateUpdate: 'recognition-mastered-spelling-needs-practice' })),
  ] };
  const systemOutput = { records: [
    record('m-ok', 'math', 'incorrect', { primaryNodeId: 'leaf', bottleneckId: 'b1' }, { text: '0.5' }),
    record('m-failed', 'math', undefined, {}, {}),
    record('c-blank', 'chinese', 'not-an-item', { originalItemLocation: 'p:i', errorType: 'blank' }),
    record('e-unreadable', 'english', 'unreadable', { wordIdentity: 'unknown', recognitionSpelling: 'unreadable', stateUpdate: 'no-state-update' }),
    record('e-readable', 'english', 'unreadable', { wordIdentity: 'planet', recognitionSpelling: 'unreadable', stateUpdate: 'no-state-update' }),
    { predictionId: 'hallucination', sampleId: 'ghost', documentId: 'english-doc', pageId: 'english-page', status: 'success', prediction: { conclusion: 'incorrect', text: 'ghost', attribution: { subject: 'english', english: { wordIdentity: 'ghost' } } } },
  ] };
  systemOutput.records[1].status = 'failed';
  delete systemOutput.records[1].prediction;
  const matchResult = {
    matches: [
      { sampleId: 'm-ok', predictionId: 'p-m-ok', method: 'sampleId', score: 1 },
      { sampleId: 'c-blank', predictionId: 'p-c-blank', method: 'sampleId', score: 1 },
      { sampleId: 'e-unreadable', predictionId: 'p-e-unreadable', method: 'sampleId', score: 1 },
      { sampleId: 'e-readable', predictionId: 'p-e-readable', method: 'sampleId', score: 1 },
    ],
    missed: [{ sampleId: 'm-missed' }, { sampleId: 'm-failed' }],
    hallucinated: [{ predictionId: 'hallucination' }],
    unresolved: [{ reason: 'ambiguous-text', goldIds: ['e-unresolved'], predictionIds: [] }],
  };
  const runManifest = { counts: { total: 7, success: 5, failure: 1, unresolved: 1, retry: 2 } };
  return { dataset, annotations, systemOutput, matchResult, runManifest };
}

test('aggregate scoring keeps operational items, four classes, abstentions, hallucinations, and guardrails visible', () => {
  const input = aggregateInput();
  const before = structuredClone(input);
  const result = scoreEvaluation(input);

  assert.deepEqual(input, before, 'scoring must not mutate inputs');
  assert.deepEqual(result.overall.discoveryRecall, ratioMetric(4, 7));
  assert.deepEqual(result.overall.clearImageDiscoveryRecall, ratioMetric(4, 6));
  assert.deepEqual(result.overall.missedRate, ratioMetric(2, 7));
  assert.deepEqual(result.overall.unresolvedGoldRate, ratioMetric(1, 7));
  assert.deepEqual(result.overall.failedGoldRate, ratioMetric(1, 7));
  assert.deepEqual(result.overall.hallucinationRate, ratioMetric(1, 7));
  assert.deepEqual(result.overall.classificationAccuracy, ratioMetric(3, 4));
  assert.deepEqual(result.overall.unreadableCorrectRejection, ratioMetric(1, 1));
  assert.deepEqual(result.overall.runCompletion, ratioMetric(5, 7));
  assert.deepEqual(result.overall.confusionMatrix, {
    correct: { correct: 0, incorrect: 0, blank: 0, unreadable: 1 },
    incorrect: { correct: 0, incorrect: 1, blank: 0, unreadable: 0 },
    blank: { correct: 0, incorrect: 0, blank: 1, unreadable: 0 },
    unreadable: { correct: 0, incorrect: 0, blank: 0, unreadable: 1 },
  });
  assert.equal(result.severityCounts.S1, 2, 'false abstention plus severe hallucination');
  assert.deepEqual(result.overall.s1Rate, { numerator: 2, denominator: 7, rate: 2 / 7, interval95: result.overall.s1Rate.interval95 });
  assert.deepEqual(result.unresolvedGoldIds, ['e-unresolved']);
  assert.deepEqual(result.failedSampleIds, ['m-failed']);
  assert.equal(result.itemResults.find((entry) => entry.sampleId === 'm-ok').diagnosisFullyCorrect, true);
  assert.equal(result.itemResults.find((entry) => entry.sampleId === 'e-readable').highestSeverity, 'S1');
  assert.equal(result.hallucinationResults[0].highestSeverity, 'S1');
  for (const { key } of CORE_GUARDRAILS) {
    const metric = atPath(result, key);
    assert.ok(metric && Object.hasOwn(metric, 'numerator'), `${key} must be a metric`);
  }
});

test('missing prediction conclusion is classified as incorrect and tagged, not excluded', () => {
  const input = aggregateInput();
  input.matchResult.matches.push({ sampleId: 'm-failed', predictionId: 'p-m-failed', method: 'sampleId', score: 1 });
  input.matchResult.missed = input.matchResult.missed.filter(({ sampleId }) => sampleId !== 'm-failed');
  input.systemOutput.records[1].status = 'success';
  input.systemOutput.records[1].prediction = { text: '', attribution: { subject: 'math', math: { primaryNodeId: 'n3', bottleneckId: 'b3' } } };
  const result = scoreEvaluation(input);
  assert.equal(result.overall.classificationAccuracy.denominator, 5);
  const failed = result.itemResults.find(({ sampleId }) => sampleId === 'm-failed');
  assert.ok(failed.errorTags.includes('invalid-prediction-conclusion'));
  assert.equal(failed.checks.conclusion, false);
});

test('severity precedence deduplicates per item and S1 overflow avoids a binomial interval', () => {
  const input = aggregateInput();
  input.dataset.documents = [input.dataset.documents[2]];
  input.dataset.documents[0].pages[0].items = input.dataset.documents[0].pages[0].items
    .filter(({ sampleId }) => sampleId === 'e-readable');
  input.annotations.annotations = [input.annotations.annotations.find(({ sampleId }) => sampleId === 'e-readable')];
  input.matchResult = {
    matches: [{ sampleId: 'e-readable', predictionId: 'p-e-readable' }], missed: [], unresolved: [],
    hallucinated: [{ predictionId: 'hallucination' }, { predictionId: 'hallucination-2' }],
  };
  input.systemOutput.records.push({ predictionId: 'hallucination-2', sampleId: 'ghost-2', status: 'success', prediction: { conclusion: 'incorrect', attribution: { subject: 'english', english: { wordIdentity: 'ghost-2' } } } });
  input.systemOutput.records.find(({ predictionId }) => predictionId === 'p-e-readable').documentId = 'wrong-context';
  input.runManifest.counts = { total: 1, success: 1, failure: 0, unresolved: 0, retry: 0 };
  const result = scoreEvaluation(input);
  assert.equal(result.overall.s1Rate.numerator, 3);
  assert.equal(result.overall.s1Rate.denominator, 1);
  assert.equal(result.overall.s1Rate.rate, 3);
  assert.equal(result.overall.s1Rate.interval95, null);
  assert.equal(result.severityCounts.S0, 1, 'the gold item dedupes to its highest severity');
  assert.equal(result.severityCounts.S1, 2, 'hallucinations retain their own S1 counts');
});

test('aggregate scoring is input-order independent', () => {
  const input = aggregateInput();
  const forward = scoreEvaluation(input);
  const shuffled = structuredClone(input);
  shuffled.dataset.documents.reverse();
  shuffled.dataset.documents.forEach((document) => document.pages[0].items.reverse());
  shuffled.annotations.annotations.reverse();
  shuffled.systemOutput.records.reverse();
  shuffled.matchResult.matches.reverse();
  shuffled.matchResult.missed.reverse();
  assert.deepEqual(scoreEvaluation(shuffled), forward);
});

'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const { CORE_GUARDRAILS } = require('../evaluation/diagnostic-accuracy/constants');
const { scoreChinese } = require('../evaluation/diagnostic-accuracy/scorers/chinese');
const { scoreEnglish } = require('../evaluation/diagnostic-accuracy/scorers/english');
const { scoreMath } = require('../evaluation/diagnostic-accuracy/scorers/math');
const { highestSeverity, stableTags } = require('../evaluation/diagnostic-accuracy/scorers/common');
const { ratioMetric, setMetrics } = require('../evaluation/diagnostic-accuracy/scorers/statistics');
const { scoreEvaluation } = require('../evaluation/diagnostic-accuracy/scorers');
const { matchEvaluationItems } = require('../evaluation/diagnostic-accuracy/matcher');

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
  assert.deepEqual(math.sets.nodes.precision, ratioMetric(1, 2));
  assert.deepEqual(math.sets.nodes.recall, ratioMetric(1, 2));
  assert.deepEqual(math.sets.nodes.f1, { numerator: 2, denominator: 4, rate: 0.5, interval95: null });
  assert.deepEqual(math.sets.bottlenecks.precision, ratioMetric(1, 1));
  assert.deepEqual(math.sets.bottlenecks.recall, ratioMetric(1, 2));
  assert.deepEqual(math.sets.bottlenecks.f1, { numerator: 2, denominator: 3, rate: 2 / 3, interval95: null });

  const chinese = scoreChinese({
    gold: { attribution: { chinese: {
      originalItemLocation: 'page-1:item-1', errorType: 'character-form', review: 'review-character',
      migrationType: 'migration-character', allowedMigrationTypes: ['migration-character', 'migration-copy'],
    } } },
    prediction: { attribution: { chinese: {
      originalItemLocation: 'page-1:item-1', errorType: 'character-form', review: 'wrong-review', migrationType: 'migration-copy',
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
  assert.deepEqual(setMetrics([], []), {
    precision: ratioMetric(0, 0), recall: ratioMetric(0, 0), f1: ratioMetric(0, 0),
  });
  assert.deepEqual(setMetrics(['a'], []), {
    precision: ratioMetric(0, 0), recall: ratioMetric(0, 1),
    f1: { numerator: 0, denominator: 1, rate: 0, interval95: null },
  });
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

function oneItemInput({ conclusion = 'unreadable', predictionConclusion, disposition = 'matched' } = {}) {
  const subjectValues = { wordIdentity: 'unknown', recognitionSpelling: 'unreadable', stateUpdate: 'no-state-update' };
  const dataset = { profile: 'fixture', documents: [{
    documentId: 'english-doc', subject: 'english', pages: [{ pageId: 'english-page', imageQuality: 'clear', items: [{ sampleId: 'one', composite: { role: 'standalone' } }] }],
  }] };
  const annotations = { annotations: [{ sampleId: 'one', lockState: { status: 'locked' }, humanLabel: {
    conclusion, attribution: { subject: 'english', english: subjectValues },
  } }] };
  const successful = { predictionId: 'p-one', sampleId: 'one', documentId: 'english-doc', pageId: 'english-page', status: 'success', prediction: {
    conclusion: predictionConclusion, text: '', attribution: { subject: 'english', english: subjectValues },
  } };
  const failed = { predictionId: 'p-one', sampleId: 'one', documentId: 'english-doc', pageId: 'english-page', status: 'failed' };
  const matchResult = { matches: [], missed: [], unresolved: [], hallucinated: [] };
  let counts = { total: 1, success: 1, failure: 0, unresolved: 0, retry: 0 };
  let systemOutput = { records: [successful] };
  if (disposition === 'matched') matchResult.matches.push({ sampleId: 'one', predictionId: 'p-one' });
  if (disposition === 'missed') matchResult.missed.push({ sampleId: 'one' });
  if (disposition === 'unresolved') {
    matchResult.unresolved.push({ reason: 'ambiguous-text', goldIds: ['one'], predictionIds: [] });
    counts = { total: 1, success: 0, failure: 0, unresolved: 1, retry: 0 };
    systemOutput = { records: [] };
  }
  if (disposition === 'failed') {
    matchResult.missed.push({ sampleId: 'one' });
    counts = { total: 1, success: 0, failure: 1, unresolved: 0, retry: 0 };
    systemOutput = { records: [failed] };
  }
  return { dataset, annotations, systemOutput, matchResult, runManifest: { counts } };
}

test('unreadable gold forced to every readable conclusion is S1', () => {
  for (const predictionConclusion of ['correct', 'incorrect', 'not-an-item']) {
    const result = scoreEvaluation(oneItemInput({ predictionConclusion }));
    assert.equal(result.itemResults[0].highestSeverity, 'S1', predictionConclusion);
    assert.ok(result.itemResults[0].errorTags.includes('unreadable-forced-conclusion'));
  }
});

test('undiscovered unreadable gold stays in rejection and discovery denominators without creating S1', () => {
  for (const disposition of ['missed', 'unresolved', 'failed']) {
    const result = scoreEvaluation(oneItemInput({ disposition }));
    assert.deepEqual(result.overall.unreadableCorrectRejection, ratioMetric(0, 1), disposition);
    assert.deepEqual(result.overall.discoveryRecall, ratioMetric(0, 1), disposition);
    assert.deepEqual(result.overall.s1Rate, ratioMetric(0, 1), disposition);
  }
});

test('contradictory run counts fail clearly', () => {
  const input = oneItemInput({ predictionConclusion: 'unreadable' });
  input.runManifest.counts = { total: 2, success: 1, failure: 0, unresolved: 0, retry: 0 };
  assert.throws(() => scoreEvaluation(input), /contradictory|total/u);
});

test('optional subject metrics stay inapplicable for missing or empty locked gold fields', () => {
  const input = aggregateInput();
  const mathGold = input.annotations.annotations.find(({ sampleId }) => sampleId === 'm-ok').humanLabel.attribution.math;
  mathGold.nodeIds = [];
  mathGold.bottleneckIds = [];
  for (const annotation of input.annotations.annotations.filter(({ sampleId }) => sampleId.startsWith('e-'))) {
    delete annotation.humanLabel.attribution.english.recognitionSpelling;
    delete annotation.humanLabel.attribution.english.stateUpdate;
  }
  const result = scoreEvaluation(input);
  for (const key of ['nodeSetPrecision', 'nodeSetRecall', 'nodeSetF1', 'bottleneckSetPrecision', 'bottleneckSetRecall', 'bottleneckSetF1']) {
    assert.deepEqual(result.math[key], ratioMetric(0, 0), key);
  }
  assert.deepEqual(result.math.errorReason, ratioMetric(0, 0));
  assert.deepEqual(result.math.errorType, ratioMetric(0, 0));
  assert.deepEqual(result.math.ancestorHit, ratioMetric(0, 0));
  assert.deepEqual(result.chinese.originalReviewBinding, ratioMetric(0, 0));
  assert.deepEqual(result.chinese.migrationTypeLegal, ratioMetric(0, 0));
  assert.deepEqual(result.english.recognition, ratioMetric(0, 0));
  assert.deepEqual(result.english.spelling, ratioMetric(0, 0));
  assert.deepEqual(result.english.recognitionSpelling, ratioMetric(0, 0));
  assert.deepEqual(result.english.stateUpdate, ratioMetric(0, 0));
});

test('answer scoring uses locked gold variants and never dataset answer-like fallback', () => {
  const input = oneItemInput({ conclusion: 'correct', predictionConclusion: 'correct' });
  input.dataset.documents[0].pages[0].items[0].text = 'tempting-dataset-answer';
  input.dataset.documents[0].pages[0].items[0].acceptedAnswers = ['tempting-dataset-answer'];
  input.systemOutput.records[0].prediction.text = 'tempting-dataset-answer';
  let result = scoreEvaluation(input);
  assert.equal(result.itemResults[0].checks.answer, undefined);

  input.annotations.annotations[0].humanLabel.acceptedAnswers = ['locked-answer', 'LOCKED ANSWER'];
  result = scoreEvaluation(input);
  assert.equal(result.itemResults[0].checks.answer, false);
  input.systemOutput.records[0].prediction.text = 'locked answer';
  result = scoreEvaluation(input);
  assert.equal(result.itemResults[0].checks.answer, true);
});

test('validated fixtures exercise clear-image, answer, hierarchy, multilabel, reason, and migration scoring', () => {
  const fixture = (name) => JSON.parse(fs.readFileSync(path.join(
    __dirname, '..', 'evaluation', 'diagnostic-accuracy', 'fixtures', name,
  ), 'utf8'));
  const dataset = fixture('dataset.json');
  const annotations = fixture('annotations.json');
  const systemOutput = fixture('system-output-candidate.json');
  const labels = new Map(annotations.annotations.map((annotation) => [annotation.sampleId, annotation.humanLabel]));
  const goldItems = dataset.documents.flatMap((document) => document.pages.flatMap((page) => page.items
    .filter((item) => item.composite.role !== 'parent')
    .map((item) => ({
      ...item, subject: document.subject, documentId: document.documentId, pageId: page.pageId,
      text: labels.get(item.sampleId)?.text,
    }))));
  const matchResult = matchEvaluationItems(goldItems, systemOutput.records.filter((record) => record.status === 'success'));
  const result = scoreEvaluation({
    dataset, annotations, systemOutput, matchResult,
    runManifest: { counts: { total: 7, success: 6, failure: 1, unresolved: 0, retry: 0 } },
  });

  assert.deepEqual(result.overall.clearImageDiscoveryRecall, ratioMetric(4, 4));
  assert.deepEqual(result.math.ancestorHit, ratioMetric(1, 1));
  assert.deepEqual(result.math.errorReason, ratioMetric(1, 1));
  assert.deepEqual(result.math.nodeSetF1, { numerator: 4, denominator: 4, rate: 1, interval95: null });
  assert.deepEqual(result.chinese.migrationTypeLegal, ratioMetric(1, 2));
  assert.equal(result.itemResults.find(({ sampleId }) => sampleId === 'fixture.math.fraction').checks.answer, true);
});

test('diagnosisFullyCorrect requires every applicable primary subject check', () => {
  const mathInput = aggregateInput();
  const mathGold = mathInput.annotations.annotations.find(({ sampleId }) => sampleId === 'm-ok').humanLabel.attribution.math;
  const mathPrediction = mathInput.systemOutput.records.find(({ predictionId }) => predictionId === 'p-m-ok').prediction.attribution.math;
  mathGold.errorType = 'fraction-error';
  mathPrediction.errorType = 'sign-error';
  assert.equal(scoreEvaluation(mathInput).itemResults.find(({ sampleId }) => sampleId === 'm-ok').diagnosisFullyCorrect, false);

  const chineseInput = aggregateInput();
  const chineseGold = chineseInput.annotations.annotations.find(({ sampleId }) => sampleId === 'c-blank').humanLabel.attribution.chinese;
  const chinesePrediction = chineseInput.systemOutput.records.find(({ predictionId }) => predictionId === 'p-c-blank').prediction.attribution.chinese;
  chineseGold.review = 'review-completion';
  chinesePrediction.review = 'wrong-review';
  assert.equal(scoreEvaluation(chineseInput).itemResults.find(({ sampleId }) => sampleId === 'c-blank').diagnosisFullyCorrect, false);

  const englishInput = aggregateInput();
  const englishPrediction = englishInput.systemOutput.records.find(({ predictionId }) => predictionId === 'p-e-unreadable').prediction.attribution.english;
  englishPrediction.stateUpdate = 'recognition-mastered-spelling-needs-practice';
  assert.equal(scoreEvaluation(englishInput).itemResults.find(({ sampleId }) => sampleId === 'e-unreadable').diagnosisFullyCorrect, false);
});

test('validated unknown conclusion remains a matched classification error', () => {
  const fixture = (name) => JSON.parse(fs.readFileSync(path.join(
    __dirname, '..', 'evaluation', 'diagnostic-accuracy', 'fixtures', name,
  ), 'utf8'));
  const dataset = fixture('dataset.json');
  const annotations = fixture('annotations.json');
  const systemOutput = fixture('system-output-candidate.json');
  systemOutput.records[0].prediction.conclusion = 'unknown';
  const matchResult = matchEvaluationItems(
    dataset.documents.flatMap((document) => document.pages.flatMap((page) => page.items
      .filter((item) => item.composite.role !== 'parent')
      .map((item) => ({ ...item, subject: document.subject, documentId: document.documentId, pageId: page.pageId })))),
    systemOutput.records.filter(({ status }) => status === 'success'),
  );
  const result = scoreEvaluation({
    dataset, annotations, systemOutput, matchResult,
    runManifest: { counts: { total: 7, success: 6, failure: 1, unresolved: 0, retry: 0 } },
  });
  const item = result.itemResults.find(({ sampleId }) => sampleId === 'fixture.math.correct');
  assert.equal(item.checks.conclusion, false);
  assert.ok(item.errorTags.includes('invalid-prediction-conclusion'));
  assert.equal(result.overall.classificationAccuracy.denominator, 6);
});

test('validated page-scoped hallucinations reach matcher and scorer with severe and benign behavior', () => {
  const fixture = (name) => JSON.parse(fs.readFileSync(path.join(
    __dirname, '..', 'evaluation', 'diagnostic-accuracy', 'fixtures', name,
  ), 'utf8'));
  const dataset = fixture('dataset.json');
  const annotations = fixture('annotations.json');
  const systemOutput = fixture('system-output-candidate.json');
  const base = systemOutput.records.find(({ sampleId }) => sampleId === 'fixture.english.correct');
  const hallucination = structuredClone(base);
  hallucination.predictionId = 'prediction.hallucination';
  delete hallucination.sampleId;
  hallucination.prediction.localization = { x: 10, y: 10, width: 1, height: 1, unit: 'normalized' };
  hallucination.prediction.text = 'ghost';
  hallucination.prediction.conclusion = 'incorrect';
  hallucination.prediction.attribution.english.wordIdentity = 'ghost';
  systemOutput.records.push(hallucination);
  const goldItems = dataset.documents.flatMap((document) => document.pages.flatMap((page) => page.items
    .filter((item) => item.composite.role !== 'parent')
    .map((item) => ({ ...item, subject: document.subject, documentId: document.documentId, pageId: page.pageId }))));
  let matchResult = matchEvaluationItems(goldItems, systemOutput.records.filter(({ status }) => status === 'success'));
  assert.ok(matchResult.hallucinated.some(({ predictionId }) => predictionId === 'prediction.hallucination'));
  let result = scoreEvaluation({
    dataset, annotations, systemOutput, matchResult,
    runManifest: { counts: { total: 8, success: 7, failure: 1, unresolved: 0, retry: 0 } },
  });
  assert.equal(result.hallucinationResults.find(({ predictionId }) => predictionId === 'prediction.hallucination').highestSeverity, 'S1');

  hallucination.prediction.conclusion = 'correct';
  hallucination.prediction.attribution.english.stateUpdate = 'no-state-update';
  matchResult = matchEvaluationItems(goldItems, systemOutput.records.filter(({ status }) => status === 'success'));
  result = scoreEvaluation({
    dataset, annotations, systemOutput, matchResult,
    runManifest: { counts: { total: 8, success: 7, failure: 1, unresolved: 0, retry: 0 } },
  });
  assert.equal(result.hallucinationResults.find(({ predictionId }) => predictionId === 'prediction.hallucination').highestSeverity, null);
});

'use strict';

const { CORE_GUARDRAILS } = require('../constants');
const {
  CLASSES, SEVERITIES, classifyConclusion, contextMismatch, highestSeverity, stableTags,
} = require('./common');
const { scoreMath } = require('./math');
const { scoreChinese } = require('./chinese');
const { scoreEnglish } = require('./english');
const { confusionMatrix, ratioMetric } = require('./statistics');

const SUBJECT_SCORERS = Object.freeze({ math: scoreMath, chinese: scoreChinese, english: scoreEnglish });
const SUBJECT_METRICS = Object.freeze({
  math: ['nodeTop1', 'ancestorHit', 'bottleneckTop1', 'errorReason', 'errorType'],
  chinese: ['originalItemLocation', 'errorType', 'originalReviewBinding', 'migrationTypeLegal'],
  english: ['wordIdentity', 'recognition', 'spelling', 'recognitionSpelling', 'stateUpdate'],
});

function stableCompare(left, right) {
  const leftString = String(left);
  const rightString = String(right);
  return leftString < rightString ? -1 : leftString > rightString ? 1 : 0;
}

function recordPredictionId(record) {
  return record?.predictionId ?? record?.id ?? record?.sampleId;
}

function goldLabel(annotation) {
  return annotation?.review?.adjudicationStatus === 'resolved'
    ? annotation.review.adjudicationLabel
    : annotation?.humanLabel;
}

function flattenDataset(dataset) {
  const items = [];
  for (const document of dataset?.documents ?? []) {
    for (const page of document?.pages ?? []) {
      for (const item of page?.items ?? []) {
        if (item?.composite?.role === 'parent' || item?.scorable === false) continue;
        items.push({
          ...item,
          subject: document.subject,
          documentId: document.documentId,
          pageId: page.pageId,
          imageQuality: item.imageQuality ?? page.imageQuality,
        });
      }
    }
  }
  return items;
}

function metricAccumulator(names) {
  return Object.fromEntries(names.map((name) => [name, { numerator: 0, denominator: 0 }]));
}

function finishMetrics(accumulator) {
  return Object.fromEntries(Object.entries(accumulator).map(([name, counts]) => [
    name, ratioMetric(counts.numerator, counts.denominator),
  ]));
}

function addCheck(accumulator, name, value) {
  if (value === null || value === undefined || !accumulator[name]) return;
  accumulator[name].denominator += 1;
  if (value === true) accumulator[name].numerator += 1;
}

function assertRunCounts(runManifest) {
  const counts = runManifest?.counts;
  if (!counts) throw new TypeError('runManifest.counts is required.');
  for (const key of ['total', 'success', 'failure', 'unresolved', 'retry']) {
    if (!Number.isFinite(counts[key]) || !Number.isInteger(counts[key]) || counts[key] < 0) {
      throw new TypeError(`runManifest.counts.${key} must be a nonnegative integer.`);
    }
  }
  if (counts.total !== counts.success + counts.failure + counts.unresolved) {
    throw new RangeError('runManifest counts are contradictory: total must equal success + failure + unresolved.');
  }
  if (counts.retry > counts.total) throw new RangeError('runManifest retry attempts cannot exceed total items.');
  return counts;
}

function getPath(value, path) {
  return path.split('.').reduce((current, key) => current?.[key], value);
}

/** Pure aggregate scorer; all matching and filesystem work must be completed by callers. */
function scoreEvaluation({ dataset, annotations, systemOutput, matchResult, runManifest }) {
  if (!['formal', 'fixture'].includes(dataset?.profile)) {
    throw new TypeError('Scoring requires a formal or fixture dataset profile.');
  }
  const runCounts = assertRunCounts(runManifest);
  const annotationBySample = new Map();
  for (const entry of annotations?.annotations ?? []) {
    if (annotationBySample.has(entry.sampleId)) throw new Error(`Duplicate gold annotation for ${entry.sampleId}.`);
    annotationBySample.set(entry.sampleId, entry);
  }
  const predictionById = new Map((systemOutput?.records ?? []).map((entry) => [recordPredictionId(entry), entry]));
  const goldRecords = flattenDataset(dataset).map((entry) => {
    const annotation = annotationBySample.get(entry.sampleId);
    if (!annotation || annotation.lockState?.status !== 'locked' || !goldLabel(annotation)) {
      throw new Error(`Scorable item ${entry.sampleId} does not resolve to a locked gold label.`);
    }
    const label = goldLabel(annotation);
    return {
      ...entry,
      imageQuality: entry.imageQuality ?? label.imageQuality,
      label: { ...label },
    };
  });
  // 只校验 manifest 自身计数一致性；与 gold 数 / 记录数解耦（幻觉记录无 gold、漏检 gold 无记录，
  // 两者的合法分离正是评测要度量的对象，一致性由 validateSystemOutput 与 run schema 承担）
  // 与 validateRunManifest 同一口径：total = success + failure + unresolved；retry 是阶段一
  // 每记录至多一次的重试计数（≤ total，不加法）
  const runCountSum = (runCounts.success ?? 0) + (runCounts.failure ?? 0) + (runCounts.unresolved ?? 0);
  if (runCounts.total !== runCountSum || (runCounts.retry ?? 0) > runCounts.total) {
    throw new RangeError(`contradictory runManifest counts: total ${runCounts.total} does not match success+failure+unresolved ${runCountSum} (retry ${(runCounts.retry ?? 0)} > total).`);
  }
  const goldById = new Map(goldRecords.map((entry) => [entry.sampleId, entry]));

  const matchesByGold = new Map();
  const matchedPredictionIds = new Set();
  for (const match of matchResult?.matches ?? []) {
    if (!goldById.has(match.sampleId)) throw new Error(`Match references unknown gold item ${match.sampleId}.`);
    if (matchesByGold.has(match.sampleId)) throw new Error(`Scoring requires one-to-one matches; duplicate gold match ${match.sampleId}.`);
    if (matchedPredictionIds.has(match.predictionId)) throw new Error(`Scoring requires one-to-one matches; duplicate prediction match ${match.predictionId}.`);
    matchesByGold.set(match.sampleId, match);
    matchedPredictionIds.add(match.predictionId);
  }
  for (const entry of matchResult?.missed ?? []) {
    if (!goldById.has(entry.sampleId)) throw new Error(`Missed result references unknown gold item ${entry.sampleId}.`);
  }
  for (const entry of matchResult?.unresolved ?? []) {
    for (const sampleId of entry.goldIds ?? []) {
      if (!goldById.has(sampleId)) throw new Error(`Unresolved result references unknown gold item ${sampleId}.`);
    }
  }
  const unresolvedGoldIds = [...new Set((matchResult?.unresolved ?? []).flatMap((entry) => entry.goldIds ?? []))]
    .filter((id) => goldById.has(id)).sort(stableCompare);
  const unresolvedPredictionIds = [...new Set((matchResult?.unresolved ?? []).flatMap((entry) => entry.predictionIds ?? []))]
    .sort(stableCompare);
  const unresolvedSet = new Set(unresolvedGoldIds);
  const missedSet = new Set((matchResult?.missed ?? []).map((entry) => entry.sampleId).filter((id) => goldById.has(id)));
  const failedSampleIds = [...new Set((systemOutput?.records ?? [])
    .filter((entry) => entry.status === 'failed' && goldById.has(entry.sampleId)).map((entry) => entry.sampleId))].sort(stableCompare);
  const failedSet = new Set(failedSampleIds);
  const failedPageIds = [...new Set((systemOutput?.records ?? [])
    .filter((entry) => entry.status === 'failed').map((entry) => entry.pageId).filter(Boolean))].sort(stableCompare);

  const subjectAccumulators = Object.fromEntries(Object.entries(SUBJECT_METRICS)
    .map(([subject, names]) => [subject, metricAccumulator(names)]));
  const mathSetCounts = {
    nodes: { intersection: 0, gold: 0, predicted: 0, applicable: 0 },
    bottlenecks: { intersection: 0, gold: 0, predicted: 0, applicable: 0 },
  };
  const matrix = confusionMatrix(CLASSES);
  let classificationNumerator = 0;
  let classificationDenominator = 0;
  let invalidPredictionConclusions = 0;
  let correctRejections = 0;
  let unreadableGold = 0;
  let discovered = 0;
  let clearGold = 0;
  let clearDiscovered = 0;
  const itemResults = [];

  for (const gold of goldRecords.sort((left, right) => stableCompare(left.sampleId, right.sampleId))) {
    const match = matchesByGold.get(gold.sampleId);
    const predictionRecord = match ? predictionById.get(match.predictionId) : undefined;
    const successfullyMatched = Boolean(match && predictionRecord?.status === 'success');
    if (match && !predictionRecord) throw new Error(`Matched prediction ${match.predictionId} is absent from systemOutput.`);
    if (successfullyMatched) discovered += 1;
    if (gold.imageQuality === 'clear') {
      clearGold += 1;
      if (successfullyMatched) clearDiscovered += 1;
    }

    const goldConclusion = classifyConclusion(gold.label.conclusion, undefined).gold;
    if (!goldConclusion) throw new Error(`Gold item ${gold.sampleId} has an invalid four-class conclusion.`);
    if (goldConclusion === 'unreadable') unreadableGold += 1;
    const tags = [];
    const checks = { discovered: successfullyMatched, conclusion: false };
    let subjectResult = null;
    let conclusion = { gold: goldConclusion, prediction: null, correct: false, errors: [] };

    if (successfullyMatched) {
      const prediction = predictionRecord.prediction;
      conclusion = classifyConclusion(gold.label.conclusion, prediction?.conclusion);
      checks.conclusion = conclusion.correct;
      tags.push(...conclusion.errors);
      classificationDenominator += 1;
      if (conclusion.correct) classificationNumerator += 1;
      if (conclusion.prediction) matrix[conclusion.gold][conclusion.prediction] += 1;
      else invalidPredictionConclusions += 1;
      if (goldConclusion === 'unreadable' && conclusion.prediction === 'unreadable') correctRejections += 1;

      const expectedContext = { subject: gold.subject, documentId: gold.documentId, pageId: gold.pageId };
      const actualContext = {
        subject: prediction?.attribution?.subject,
        documentId: predictionRecord.documentId,
        pageId: predictionRecord.pageId,
      };
      if (contextMismatch(expectedContext, actualContext)) tags.push({ tag: 'scoring-context-mismatch', severity: 'S0' });
      const scorer = SUBJECT_SCORERS[gold.subject];
      subjectResult = scorer?.({ gold: gold.label, prediction });
      if (subjectResult) {
        Object.assign(checks, subjectResult.checks);
        tags.push(...subjectResult.errorTags);
        for (const name of SUBJECT_METRICS[gold.subject]) addCheck(subjectAccumulators[gold.subject], name, subjectResult.checks[name]);
        for (const [name, counts] of Object.entries(subjectResult.setCounts ?? {})) {
          mathSetCounts[name].intersection += counts.intersection;
          mathSetCounts[name].gold += counts.gold;
          mathSetCounts[name].predicted += counts.predicted;
          mathSetCounts[name].applicable += 1;
        }
      }
    }

    const requiredPrimaryChecks = gold.subject === 'math'
      ? ['nodeTop1', 'bottleneckTop1', ...(checks.errorReason == null ? [] : ['errorReason']), ...(checks.errorType == null ? [] : ['errorType'])]
      : gold.subject === 'chinese'
        ? ['originalItemLocation', 'errorType', ...['originalReviewBinding', 'migrationTypeLegal']
          .filter((name) => checks[name] != null)]
        : ['wordIdentity', ...['recognitionSpelling', 'stateUpdate'].filter((name) => checks[name] != null)];
    const orderedTags = stableTags(tags);
    itemResults.push({
      sampleId: gold.sampleId,
      subject: gold.subject,
      status: successfullyMatched ? 'matched' : failedSet.has(gold.sampleId) ? 'failed'
        : unresolvedSet.has(gold.sampleId) ? 'unresolved' : missedSet.has(gold.sampleId) ? 'missed' : 'undiscovered',
      predictionId: match?.predictionId ?? null,
      diagnosisFullyCorrect: successfullyMatched && checks.conclusion === true
        && requiredPrimaryChecks.every((name) => checks[name] === true),
      checks,
      sets: subjectResult?.sets ?? {},
      errorTags: orderedTags.map((entry) => entry.tag),
      errorTagDetails: orderedTags,
      highestSeverity: highestSeverity(orderedTags),
    });
  }

  const hallucinationResults = [];
  for (const hallucination of [...(matchResult?.hallucinated ?? [])].sort((left, right) => stableCompare(left.predictionId, right.predictionId))) {
    const record = predictionById.get(hallucination.predictionId);
    if (!record) throw new Error(`Hallucinated prediction ${hallucination.predictionId} is absent from systemOutput.`);
    const prediction = record.prediction;
    const attribution = prediction?.attribution ?? {};
    const claimsAction = Boolean(
      prediction?.actionTarget ?? prediction?.action ?? attribution.actionTarget
      ?? attribution.chinese?.review ?? attribution.chinese?.migrationType
      ?? (attribution.english?.stateUpdate && attribution.english.stateUpdate !== 'no-state-update'),
    );
    const claimsStudentError = prediction?.conclusion === 'incorrect' || claimsAction;
    const tags = claimsStudentError ? [{ tag: 'hallucinated-student-error-claim', severity: 'S1' }] : [];
    hallucinationResults.push({
      predictionId: hallucination.predictionId,
      errorTags: tags.map((entry) => entry.tag),
      errorTagDetails: tags,
      highestSeverity: highestSeverity(tags),
    });
  }

  const severityCounts = Object.fromEntries(SEVERITIES.map((severity) => [severity, 0]));
  for (const result of [...itemResults, ...hallucinationResults]) {
    if (result.highestSeverity) severityCounts[result.highestSeverity] += 1;
  }
  const s1Numerator = itemResults.filter((entry) => entry.errorTagDetails.some((tag) => tag.severity === 'S1')).length
    + hallucinationResults.filter((entry) => entry.errorTagDetails.some((tag) => tag.severity === 'S1')).length;
  const totalGold = goldRecords.length;
  const hallucinationCount = hallucinationResults.length;
  const discoveryRecall = ratioMetric(discovered, totalGold);
  const clearImageDiscoveryRecall = ratioMetric(clearDiscovered, clearGold);
  const missedRate = ratioMetric(missedSet.size, totalGold);
  const unresolvedGoldRate = ratioMetric(unresolvedGoldIds.length, totalGold);
  const hallucinationRate = ratioMetric(hallucinationCount, totalGold, { binomial: hallucinationCount <= totalGold });
  const failedGoldRate = ratioMetric(failedSampleIds.length, totalGold);
  const allPageIds = new Set(flattenDataset(dataset).map((entry) => entry.pageId));
  const failedPageRate = ratioMetric(failedPageIds.length, allPageIds.size);
  const classificationAccuracy = ratioMetric(classificationNumerator, classificationDenominator);
  const overall = {
    discoveryRecall,
    clearImageDiscoveryRecall,
    missedRate,
    unresolvedGoldRate,
    hallucinationRate,
    failedGoldRate,
    failedPageRate,
    classificationAccuracy,
    unreadableCorrectRejection: ratioMetric(correctRejections, unreadableGold),
    runCompletion: ratioMetric(runCounts.total - runCounts.failure - runCounts.unresolved, runCounts.total),
    s1Rate: ratioMetric(s1Numerator, totalGold, { binomial: s1Numerator <= totalGold }),
    confusionMatrix: matrix,
    discovery: {
      recall: discoveryRecall,
      clearImageRecall: clearImageDiscoveryRecall,
      missed: missedRate,
      unresolvedGold: unresolvedGoldRate,
      hallucinated: hallucinationRate,
      failedGold: failedGoldRate,
      failedPages: failedPageRate,
    },
    classification: { accuracy: classificationAccuracy, confusionMatrix: matrix, invalidPredictionConclusions },
    counts: {
      scorableGold: totalGold, matched: discovered, missed: missedSet.size,
      unresolvedGold: unresolvedGoldIds.length, hallucinated: hallucinationCount, failedGold: failedSampleIds.length,
    },
  };
  const math = finishMetrics(subjectAccumulators.math);
  const addSetMetrics = (prefix, counts) => {
    if (counts.applicable === 0) {
      math[`${prefix}SetPrecision`] = ratioMetric(0, 0);
      math[`${prefix}SetRecall`] = ratioMetric(0, 0);
      math[`${prefix}SetF1`] = ratioMetric(0, 0);
      return;
    }
    math[`${prefix}SetPrecision`] = ratioMetric(counts.intersection, counts.predicted);
    math[`${prefix}SetRecall`] = ratioMetric(counts.intersection, counts.gold);
    // Micro-F1 is a Dice ratio, not a binomial proportion; omit Wilson confidence bounds.
    math[`${prefix}SetF1`] = ratioMetric(2 * counts.intersection, counts.predicted + counts.gold, { binomial: false });
  };
  addSetMetrics('node', mathSetCounts.nodes);
  addSetMetrics('bottleneck', mathSetCounts.bottlenecks);
  const result = {
    overall,
    math,
    chinese: finishMetrics(subjectAccumulators.chinese),
    english: finishMetrics(subjectAccumulators.english),
    itemResults,
    hallucinationResults,
    severityCounts,
    unresolvedGoldIds,
    unresolvedPredictionIds,
    failedSampleIds,
    failedPageIds,
  };
  for (const { key } of CORE_GUARDRAILS) {
    const metric = getPath(result, key);
    if (!metric || !Object.hasOwn(metric, 'numerator')) throw new Error(`Core guardrail metric is absent: ${key}.`);
  }
  return result;
}

module.exports = Object.freeze({ scoreEvaluation });

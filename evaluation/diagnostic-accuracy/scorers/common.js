'use strict';

const { answerMatches, normalizeText } = require('../normalizers');

const CLASSES = Object.freeze(['correct', 'incorrect', 'blank', 'unreadable']);
const SEVERITIES = Object.freeze(['S0', 'S1', 'S2', 'S3']);
const SEVERITY_RANK = Object.freeze({ S0: 0, S1: 1, S2: 2, S3: 3 });

function canonicalConclusion(value) {
  if (value === 'not-an-item') return 'blank';
  return CLASSES.includes(value) ? value : null;
}

function textCheck(gold, prediction, subject) {
  if (Array.isArray(gold?.acceptedAnswers)) {
    return answerMatches(prediction?.text, gold.acceptedAnswers, subject);
  }
  if (typeof gold?.text !== 'string') return null;
  return typeof prediction?.text === 'string'
    && normalizeText(prediction.text, subject) === normalizeText(gold.text, subject);
}

function highestSeverity(errorTags) {
  let highest = null;
  for (const tag of errorTags) {
    if (!Object.hasOwn(SEVERITY_RANK, tag.severity)) continue;
    if (highest === null || SEVERITY_RANK[tag.severity] < SEVERITY_RANK[highest]) highest = tag.severity;
  }
  return highest;
}

function stableTags(tags) {
  const unique = new Map();
  for (const tag of tags) unique.set(`${tag.severity}:${tag.tag}`, { tag: tag.tag, severity: tag.severity });
  const compare = (left, right) => (left < right ? -1 : left > right ? 1 : 0);
  return [...unique.values()].sort((left, right) => SEVERITY_RANK[left.severity] - SEVERITY_RANK[right.severity]
    || compare(left.tag, right.tag));
}

function classifyConclusion(goldValue, predictedValue) {
  const gold = canonicalConclusion(goldValue);
  const prediction = canonicalConclusion(predictedValue);
  const errors = [];
  if (!prediction) errors.push({ tag: 'invalid-prediction-conclusion', severity: 'S3' });
  if (gold === 'unreadable' && prediction && prediction !== 'unreadable') {
    errors.push({ tag: 'unreadable-forced-conclusion', severity: 'S1' });
  } else if (gold !== 'unreadable' && prediction === 'unreadable') {
    errors.push({ tag: 'false-unreadable-abstention', severity: 'S1' });
  } else if (gold && prediction && gold !== prediction) {
    errors.push({ tag: 'conclusion-flip', severity: 'S1' });
  }
  return { gold, prediction, correct: Boolean(gold && prediction && gold === prediction), errors };
}

function contextMismatch(gold, prediction) {
  const fields = ['subject', 'documentId', 'pageId'];
  return fields.some((field) => gold?.[field] !== prediction?.[field]);
}

module.exports = Object.freeze({
  CLASSES, SEVERITIES, canonicalConclusion, classifyConclusion, contextMismatch,
  highestSeverity, stableTags, textCheck,
});

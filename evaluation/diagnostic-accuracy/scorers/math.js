'use strict';

const { setMetrics } = require('./statistics');
const { textCheck } = require('./common');

function equalWhenApplicable(gold, predicted) {
  return gold === undefined ? null : gold === predicted;
}

function list(value, fallback) {
  if (Array.isArray(value)) return value;
  return fallback === undefined ? [] : [fallback];
}

function scoreMath({ gold, prediction }) {
  const expected = gold?.attribution?.math ?? {};
  const actual = prediction?.attribution?.math ?? {};
  const checks = {
    answer: textCheck(gold, prediction, 'math'),
    nodeTop1: equalWhenApplicable(expected.primaryNodeId, actual.primaryNodeId),
    ancestorHit: Array.isArray(expected.ancestorNodeIds)
      ? actual.primaryNodeId === expected.primaryNodeId || expected.ancestorNodeIds.includes(actual.primaryNodeId)
      : null,
    bottleneckTop1: equalWhenApplicable(expected.bottleneckId, actual.bottleneckId),
    errorReason: equalWhenApplicable(expected.errorReason ?? expected.errorType, actual.errorReason ?? actual.errorType),
  };
  const sets = {};
  const setCounts = {};
  const addSet = (name, goldValues, predictedValues) => {
    const goldSet = new Set(goldValues);
    const predictedSet = new Set(predictedValues);
    let intersection = 0;
    for (const value of predictedSet) if (goldSet.has(value)) intersection += 1;
    sets[name] = setMetrics(goldValues, predictedValues);
    setCounts[name] = { intersection, gold: goldSet.size, predicted: predictedSet.size };
  };
  if (Array.isArray(expected.nodeIds)) addSet('nodes', expected.nodeIds, list(actual.nodeIds, actual.primaryNodeId));
  if (Array.isArray(expected.bottleneckIds)) addSet('bottlenecks', expected.bottleneckIds, list(actual.bottleneckIds, actual.bottleneckId));
  const errorTags = [];
  if (checks.nodeTop1 === false) errorTags.push({ tag: 'math-primary-node-mismatch', severity: 'S2' });
  if (checks.bottleneckTop1 === false) errorTags.push({ tag: 'math-primary-bottleneck-mismatch', severity: 'S2' });
  if (checks.errorReason === false) errorTags.push({ tag: 'math-error-reason-mismatch', severity: 'S2' });
  if (checks.answer === false) errorTags.push({ tag: 'answer-text-mismatch', severity: 'S3' });
  return { checks, sets, setCounts, errorTags };
}

module.exports = Object.freeze({ scoreMath });

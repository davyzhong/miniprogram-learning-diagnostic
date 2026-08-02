'use strict';

const Z_95 = 1.959963984540054;

function count(value, name) {
  if (!Number.isFinite(value) || !Number.isInteger(value) || value < 0) {
    throw new TypeError(`${name} must be a nonnegative integer.`);
  }
}

function ratioMetric(numerator, denominator, { binomial = true } = {}) {
  count(numerator, 'numerator');
  count(denominator, 'denominator');
  if (denominator === 0) {
    if (binomial && numerator !== 0) throw new RangeError('numerator cannot exceed a zero denominator.');
    return { numerator, denominator, rate: null, interval95: null };
  }
  if (binomial && numerator > denominator) throw new RangeError('numerator cannot exceed denominator for a binomial ratio.');
  const rate = numerator / denominator;
  if (!binomial || numerator > denominator) return { numerator, denominator, rate, interval95: null };
  const zSquared = Z_95 ** 2;
  const scale = 1 + (zSquared / denominator);
  const center = (rate + (zSquared / (2 * denominator))) / scale;
  const margin = (Z_95 / scale) * Math.sqrt(
    (rate * (1 - rate) / denominator) + (zSquared / (4 * denominator ** 2)),
  );
  return {
    numerator,
    denominator,
    rate,
    interval95: { low: Math.max(0, center - margin), high: Math.min(1, center + margin) },
  };
}

function wilson95(numerator, denominator) {
  return ratioMetric(numerator, denominator).interval95;
}

function f1Score(precision, recall) {
  if (![precision, recall].every((value) => Number.isFinite(value) && value >= 0 && value <= 1)) {
    throw new TypeError('precision and recall must be finite values in [0, 1].');
  }
  return precision + recall === 0 ? 0 : (2 * precision * recall) / (precision + recall);
}

function setMetrics(goldValues, predictedValues) {
  const gold = new Set(Array.isArray(goldValues) ? goldValues : []);
  const predicted = new Set(Array.isArray(predictedValues) ? predictedValues : []);
  let intersection = 0;
  for (const value of predicted) if (gold.has(value)) intersection += 1;
  return {
    precision: ratioMetric(intersection, predicted.size),
    recall: ratioMetric(intersection, gold.size),
    // F1/Dice is not a binomial proportion, so a Wilson interval would be misleading.
    f1: ratioMetric(2 * intersection, predicted.size + gold.size, { binomial: false }),
  };
}

function confusionMatrix(labels) {
  return Object.fromEntries(labels.map((gold) => [gold, Object.fromEntries(labels.map((prediction) => [prediction, 0]))]));
}

module.exports = Object.freeze({ ratioMetric, wilson95, f1Score, setMetrics, confusionMatrix });

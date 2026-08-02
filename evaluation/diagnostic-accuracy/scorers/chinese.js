'use strict';

const { textCheck } = require('./common');

function equalWhenApplicable(gold, predicted) {
  return gold === undefined ? null : gold === predicted;
}

function scoreChinese({ gold, prediction }) {
  const expected = gold?.attribution?.chinese ?? {};
  const actual = prediction?.attribution?.chinese ?? {};
  const allowedMigrations = expected.allowedMigrationTypes
    ?? (expected.migration === undefined ? undefined : [expected.migration]);
  const checks = {
    originalItemLocation: equalWhenApplicable(expected.originalItemLocation, actual.originalItemLocation),
    errorType: equalWhenApplicable(expected.errorType, actual.errorType),
    originalReviewBinding: equalWhenApplicable(expected.review, actual.review),
    migrationTypeLegal: allowedMigrations === undefined ? null : allowedMigrations.includes(actual.migration),
  };
  const answer = textCheck(gold, prediction, 'chinese');
  if (answer !== null) checks.answer = answer;
  const errorTags = [];
  if (checks.originalItemLocation === false) errorTags.push({ tag: 'chinese-original-location-mismatch', severity: 'S2' });
  if (checks.errorType === false) errorTags.push({ tag: 'chinese-error-type-mismatch', severity: 'S2' });
  if (checks.originalReviewBinding === false) errorTags.push({ tag: 'chinese-review-binding-mismatch', severity: 'S2' });
  if (checks.migrationTypeLegal === false) errorTags.push({ tag: 'chinese-illegal-migration-type', severity: 'S2' });
  if (checks.answer === false) errorTags.push({ tag: 'answer-text-mismatch', severity: 'S3' });
  return { checks, errorTags };
}

module.exports = Object.freeze({ scoreChinese });

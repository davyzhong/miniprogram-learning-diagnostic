'use strict';

const { normalizeText } = require('../normalizers');
const { textCheck } = require('./common');

function equalWhenApplicable(gold, predicted) {
  return gold === undefined ? null : gold === predicted;
}

function dimensions(value) {
  if (value === 'recognized-correctly') return { recognition: true, spelling: true };
  if (value === 'recognized-but-misspelled') return { recognition: true, spelling: false };
  if (value === 'unreadable') return { recognition: false, spelling: null };
  return null;
}

function scoreEnglish({ gold, prediction }) {
  const expected = gold?.attribution?.english ?? {};
  const actual = prediction?.attribution?.english ?? {};
  const expectedDimensions = dimensions(expected.recognitionSpelling);
  const actualDimensions = dimensions(actual.recognitionSpelling);
  const checks = {
    wordIdentity: expected.wordIdentity === undefined ? null
      : normalizeText(expected.wordIdentity, 'english') === normalizeText(actual.wordIdentity, 'english'),
    recognition: expectedDimensions === null ? null : expectedDimensions.recognition === actualDimensions?.recognition,
    spelling: expectedDimensions?.spelling === null || expectedDimensions === null
      ? null : expectedDimensions.spelling === actualDimensions?.spelling,
    recognitionSpelling: equalWhenApplicable(expected.recognitionSpelling, actual.recognitionSpelling),
    stateUpdate: equalWhenApplicable(expected.stateUpdate, actual.stateUpdate),
  };
  const answer = textCheck(gold, prediction, 'english');
  if (answer !== null) checks.answer = answer;
  const errorTags = [];
  if (checks.wordIdentity === false) errorTags.push({ tag: 'english-word-identity-mismatch', severity: 'S2' });
  if (checks.recognition === false) errorTags.push({ tag: 'english-recognition-mismatch', severity: 'S2' });
  if (checks.spelling === false) errorTags.push({ tag: 'english-spelling-mismatch', severity: 'S2' });
  if (checks.stateUpdate === false) errorTags.push({ tag: 'english-state-update-mismatch', severity: 'S2' });
  if (checks.answer === false) errorTags.push({ tag: 'answer-text-mismatch', severity: 'S3' });
  return { checks, errorTags };
}

module.exports = Object.freeze({ scoreEnglish, dimensions });

'use strict';

const NORMALIZER_VERSION = '1.0.0';

const PUNCTUATION_MAP = Object.freeze({
  '\u2018': "'",
  '\u2019': "'",
  '\u201c': '"',
  '\u201d': '"',
  '\u2013': '-',
  '\u2014': '-',
  '\u2212': '-',
  '\u3001': ',',
  '\uff0c': ',',
  '\u3002': '.',
  '\uff1a': ':',
  '\uff1b': ';',
  '\uff01': '!',
  '\uff1f': '?',
});

const PUNCTUATION_PATTERN = new RegExp(`[${Object.keys(PUNCTUATION_MAP).join('')}]`, 'gu');

function normalizeText(value, subject) {
  if (typeof value !== 'string') return '';

  const normalizedSubject = typeof subject === 'string' ? subject.toLowerCase() : '';
  let normalized = value
    .normalize('NFKC')
    .replace(PUNCTUATION_PATTERN, (character) => PUNCTUATION_MAP[character])
    .replace(/\p{Script=Latin}/gu, (character) => character.toLowerCase());

  if (normalizedSubject === 'math' || normalizedSubject === 'chinese') {
    normalized = normalized.replace(/\s+/gu, '');
  } else {
    normalized = normalized.replace(/\s+/gu, ' ').trim();
  }

  if (normalizedSubject === 'math') normalized = normalized.replace(/[.,;!?]+$/gu, '');
  return normalized;
}

function answerMatches(predicted, acceptedAnswers, subject) {
  if (typeof predicted !== 'string' || !Array.isArray(acceptedAnswers)) return false;
  const normalizedPrediction = normalizeText(predicted, subject);
  return acceptedAnswers.some((answer) => (
    typeof answer === 'string' && normalizeText(answer, subject) === normalizedPrediction
  ));
}

function textSimilarity(left, right) {
  if (typeof left !== 'string' || typeof right !== 'string') return 0;
  const leftCharacters = Array.from(left);
  const rightCharacters = Array.from(right);
  if (leftCharacters.length === 0 && rightCharacters.length === 0) return 1;
  if (leftCharacters.length === 0 || rightCharacters.length === 0) return 0;

  let previous = Array.from({ length: rightCharacters.length + 1 }, (_, index) => index);
  for (let leftIndex = 1; leftIndex <= leftCharacters.length; leftIndex += 1) {
    const current = [leftIndex];
    for (let rightIndex = 1; rightIndex <= rightCharacters.length; rightIndex += 1) {
      const substitutionCost = leftCharacters[leftIndex - 1] === rightCharacters[rightIndex - 1] ? 0 : 1;
      current[rightIndex] = Math.min(
        current[rightIndex - 1] + 1,
        previous[rightIndex] + 1,
        previous[rightIndex - 1] + substitutionCost,
      );
    }
    previous = current;
  }

  const distance = previous[rightCharacters.length];
  const similarity = 1 - (distance / Math.max(leftCharacters.length, rightCharacters.length));
  return Math.min(1, Math.max(0, similarity));
}

module.exports = Object.freeze({
  NORMALIZER_VERSION,
  normalizeText,
  answerMatches,
  textSimilarity,
});

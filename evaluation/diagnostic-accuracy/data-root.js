'use strict';

const fs = require('node:fs');
const path = require('node:path');

const SYNCHRONIZED_SEGMENTS = new Set([
  'google drive',
  'googledrive',
  'icloud',
  'dropbox',
  'onedrive',
  'box',
]);
const SYNCHRONIZED_PREFIX_SEGMENTS = [
  /^googledrive-.+$/iu,
  /^onedrive-.+$/iu,
];

function canonicalizeWithExistingAncestor(value) {
  let existingAncestor = value;
  const suffix = [];

  while (!fs.existsSync(existingAncestor)) {
    const parent = path.dirname(existingAncestor);
    if (parent === existingAncestor) break;
    suffix.push(path.basename(existingAncestor));
    existingAncestor = parent;
  }

  const canonicalAncestor = fs.realpathSync(existingAncestor);
  return path.join(canonicalAncestor, ...suffix.reverse());
}

function isInside(root, candidate) {
  const relative = path.relative(root, candidate);
  return relative === '' || (
    !relative.startsWith(`..${path.sep}`)
    && relative !== '..'
    && !path.isAbsolute(relative)
  );
}

function hasSynchronizedSegment(value) {
  return value
    .split(/[\\/]+/u)
    .filter(Boolean)
    .some((segment) => (
      SYNCHRONIZED_SEGMENTS.has(segment.toLowerCase())
      || SYNCHRONIZED_PREFIX_SEGMENTS.some((pattern) => pattern.test(segment))
    ));
}

function macOsSynchronizedRoots(homeDir) {
  if (typeof homeDir !== 'string' || !path.isAbsolute(homeDir)) return [];

  const normalizedHomeDir = path.normalize(homeDir);
  const canonicalHomeDir = canonicalizeWithExistingAncestor(normalizedHomeDir);
  const relativeRoots = [
    ['Library', 'CloudStorage'],
    ['Library', 'Mobile Documents', 'com~apple~CloudDocs'],
  ];

  return relativeRoots.flatMap((segments) => {
    const lexicalRoot = path.join(normalizedHomeDir, ...segments);
    const canonicalRoot = canonicalizeWithExistingAncestor(path.join(canonicalHomeDir, ...segments));
    return [lexicalRoot, canonicalRoot];
  });
}

function resolveDataRoot({ value, repoRoot, homeDir }) {
  if (typeof value !== 'string' || value.trim() === '') {
    throw new Error('Diagnostic evaluation data root must be a non-empty absolute path.');
  }

  if (!path.isAbsolute(value)) {
    throw new Error('Diagnostic evaluation data root must be an absolute path.');
  }

  const dataRoot = path.normalize(value);
  if (dataRoot === path.parse(dataRoot).root) {
    throw new Error('Diagnostic evaluation data root cannot be a filesystem root.');
  }

  if (typeof repoRoot !== 'string' || !path.isAbsolute(repoRoot)) {
    throw new Error('Repository root must be an absolute path.');
  }

  const normalizedRepoRoot = path.normalize(repoRoot);
  const canonicalRepoRoot = canonicalizeWithExistingAncestor(normalizedRepoRoot);
  const canonicalDataRoot = canonicalizeWithExistingAncestor(dataRoot);
  if (isInside(normalizedRepoRoot, dataRoot) || isInside(canonicalRepoRoot, canonicalDataRoot)) {
    throw new Error('Diagnostic evaluation data root must be outside the repository.');
  }

  const synchronizedRoots = macOsSynchronizedRoots(homeDir);
  const isUnderSynchronizedRoot = synchronizedRoots.some((root) => (
    isInside(root, dataRoot) || isInside(root, canonicalDataRoot)
  ));
  if (
    hasSynchronizedSegment(dataRoot)
    || hasSynchronizedSegment(canonicalDataRoot)
    || isUnderSynchronizedRoot
  ) {
    throw new Error('Diagnostic evaluation data root must be outside synchronized folders.');
  }

  return dataRoot;
}

module.exports = {
  resolveDataRoot,
};

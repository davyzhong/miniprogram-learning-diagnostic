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
    .some((segment) => SYNCHRONIZED_SEGMENTS.has(segment.toLowerCase()));
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

  if (hasSynchronizedSegment(dataRoot) || hasSynchronizedSegment(canonicalDataRoot)) {
    throw new Error('Diagnostic evaluation data root must be outside synchronized folders.');
  }

  // Retained in the explicit API so callers can supply deterministic environment context.
  void homeDir;
  return dataRoot;
}

module.exports = {
  resolveDataRoot,
};

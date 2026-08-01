'use strict';

const path = require('node:path');

const SYNCHRONIZED_SEGMENTS = new Set([
  'google drive',
  'googledrive',
  'icloud',
  'dropbox',
  'onedrive',
  'box',
]);

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
  const relativeToRepo = path.relative(normalizedRepoRoot, dataRoot);
  if (
    relativeToRepo === ''
    || (!relativeToRepo.startsWith(`..${path.sep}`) && relativeToRepo !== '..' && !path.isAbsolute(relativeToRepo))
  ) {
    throw new Error('Diagnostic evaluation data root must be outside the repository.');
  }

  const segments = dataRoot.split(/[\\/]+/u).filter(Boolean);
  if (segments.some((segment) => SYNCHRONIZED_SEGMENTS.has(segment.toLowerCase()))) {
    throw new Error('Diagnostic evaluation data root must be outside synchronized folders.');
  }

  // Retained in the explicit API so callers can supply deterministic environment context.
  void homeDir;
  return dataRoot;
}

module.exports = {
  resolveDataRoot,
};

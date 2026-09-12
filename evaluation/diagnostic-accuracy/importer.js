'use strict';

const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { resolveDataRoot } = require('./data-root');
const { canonicalJson, validateDataset } = require('./validate');

const repoRoot = path.resolve(__dirname, '..', '..');

function isInside(root, candidate) {
  const relative = path.relative(root, candidate);
  return relative === '' || (!relative.startsWith(`..${path.sep}`) && relative !== '..' && !path.isAbsolute(relative));
}

function lstatIfPresent(value) {
  try {
    return fs.lstatSync(value);
  } catch (error) {
    if (error.code === 'ENOENT') return null;
    throw error;
  }
}

function validateDescendantDirectory({ canonicalRoot, lexicalRoot, candidate, label }) {
  if (!isInside(lexicalRoot, candidate)) throw new Error(`Unsafe ${label}: path is outside the diagnostic data root.`);
  const stat = lstatIfPresent(candidate);
  if (!stat) throw new Error(`Unsafe ${label}: expected directory does not exist.`);
  if (stat.isSymbolicLink()) throw new Error(`Unsafe ${label}: symlink descendants are not allowed.`);
  if (!stat.isDirectory()) throw new Error(`Unsafe ${label}: expected a directory.`);
  const canonicalCandidate = fs.realpathSync(candidate);
  if (!isInside(canonicalRoot, canonicalCandidate)) throw new Error(`Unsafe ${label}: canonical path is outside the diagnostic data root.`);
  return canonicalCandidate;
}

function validateParentChain({ canonicalRoot, lexicalRoot, datasetsRoot, versionRoot, includeVersion }) {
  validateDescendantDirectory({ canonicalRoot, lexicalRoot, candidate: datasetsRoot, label: 'datasets directory' });
  if (includeVersion) validateDescendantDirectory({ canonicalRoot, lexicalRoot, candidate: versionRoot, label: 'dataset version directory' });
}

function importDataset({ sourceFile, dataRoot, profile }) {
  if (typeof sourceFile !== 'string' || sourceFile.trim() === '') throw new Error('sourceFile must be a non-empty path.');
  let bundle;
  try {
    bundle = JSON.parse(fs.readFileSync(sourceFile, 'utf8'));
  } catch (error) {
    throw new Error(`Unable to read dataset JSON from ${sourceFile}: ${error.message}`);
  }
  const validation = validateDataset(bundle, { profile });
  if (!validation.valid) throw new Error(`Invalid dataset:\n- ${validation.errors.join('\n- ')}`);
  if (bundle.redactionVerification?.status !== 'verified') throw new Error('Dataset redaction must be verified before import.');
  const canonicalPrettyJson = JSON.stringify(JSON.parse(canonicalJson(bundle)), null, 2);

  // Re-resolve immediately before the first mutation so symlink/path changes are caught.
  const resolvedRoot = resolveDataRoot({ value: dataRoot, repoRoot, homeDir: os.homedir() });
  const rootStat = lstatIfPresent(resolvedRoot);
  if (!rootStat) throw new Error('Diagnostic evaluation data root must exist before import.');
  if (!rootStat.isDirectory() && !rootStat.isSymbolicLink()) throw new Error('Diagnostic evaluation data root must be a directory.');
  const canonicalRoot = fs.realpathSync(resolvedRoot);
  if (!fs.statSync(canonicalRoot).isDirectory()) throw new Error('Diagnostic evaluation data root must resolve to a directory.');
  const datasetsRoot = path.join(resolvedRoot, 'datasets');
  const versionRoot = path.join(datasetsRoot, bundle.datasetId);
  const destination = path.join(versionRoot, 'dataset.json');

  const datasetsStat = lstatIfPresent(datasetsRoot);
  if (datasetsStat) {
    validateDescendantDirectory({ canonicalRoot, lexicalRoot: resolvedRoot, candidate: datasetsRoot, label: 'datasets directory' });
  } else {
    // The root is revalidated immediately before each mutation, then the new component before descent.
    if (fs.realpathSync(resolvedRoot) !== canonicalRoot) throw new Error('Unsafe data root: canonical path changed before directory creation.');
    fs.mkdirSync(datasetsRoot);
    validateDescendantDirectory({ canonicalRoot, lexicalRoot: resolvedRoot, candidate: datasetsRoot, label: 'datasets directory' });
  }

  validateParentChain({ canonicalRoot, lexicalRoot: resolvedRoot, datasetsRoot, versionRoot, includeVersion: false });
  const versionStat = lstatIfPresent(versionRoot);
  if (versionStat) {
    if (versionStat.isSymbolicLink()) throw new Error(`Unsafe dataset version ${bundle.datasetId}: symlink descendants are not allowed.`);
    validateDescendantDirectory({ canonicalRoot, lexicalRoot: resolvedRoot, candidate: versionRoot, label: 'dataset version directory' });
    throw new Error(`Dataset version ${bundle.datasetId} already exists; refusing to overwrite.`);
  }
  fs.mkdirSync(versionRoot);
  validateParentChain({ canonicalRoot, lexicalRoot: resolvedRoot, datasetsRoot, versionRoot, includeVersion: true });

  // Node has no portable openat-style directory-relative API. These repeated checks plus O_NOFOLLOW
  // are the strongest built-ins available; callers must still exclude hostile concurrent local mutation.
  validateParentChain({ canonicalRoot, lexicalRoot: resolvedRoot, datasetsRoot, versionRoot, includeVersion: true });
  const destinationStat = lstatIfPresent(destination);
  if (destinationStat?.isSymbolicLink()) throw new Error(`Unsafe dataset file ${destination}: final symlinks are not allowed.`);
  if (destinationStat) throw new Error(`Dataset file ${destination} already exists; refusing to overwrite.`);

  const noFollow = typeof fs.constants.O_NOFOLLOW === 'number' ? fs.constants.O_NOFOLLOW : 0;
  const flags = fs.constants.O_CREAT | fs.constants.O_EXCL | fs.constants.O_WRONLY | noFollow;
  let descriptor;
  let writeError;
  try {
    descriptor = fs.openSync(destination, flags, 0o600);
    if (!fs.fstatSync(descriptor).isFile()) throw new Error(`Unsafe dataset file ${destination}: created descriptor is not a regular file.`);
    fs.writeFileSync(descriptor, `${canonicalPrettyJson}\n`, 'utf8');
  } catch (error) {
    writeError = error;
  } finally {
    if (descriptor !== undefined) {
      try {
        fs.closeSync(descriptor);
      } catch (error) {
        if (!writeError) writeError = error;
      }
    }
  }
  if (writeError) {
    if (['EEXIST', 'ELOOP'].includes(writeError.code)) throw new Error(`Unsafe dataset file ${destination}: refusing to follow or overwrite an existing path.`);
    throw writeError;
  }
  return { destination, summary: validation.summary };
}

module.exports = { importDataset };

'use strict';

const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { resolveDataRoot } = require('./data-root');
const { canonicalJson, validateDataset } = require('./validate');

const repoRoot = path.resolve(__dirname, '..', '..');

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

  // Re-resolve immediately before the first mutation so symlink/path changes are caught.
  const resolvedRoot = resolveDataRoot({ value: dataRoot, repoRoot, homeDir: os.homedir() });
  const datasetsRoot = path.join(resolvedRoot, 'datasets');
  const versionRoot = path.join(datasetsRoot, bundle.datasetId);
  const destination = path.join(versionRoot, 'dataset.json');
  fs.mkdirSync(datasetsRoot, { recursive: true });
  try {
    fs.mkdirSync(versionRoot);
  } catch (error) {
    if (error.code === 'EEXIST') throw new Error(`Dataset version ${bundle.datasetId} already exists; refusing to overwrite.`);
    throw error;
  }
  try {
    const canonicalPrettyJson = JSON.stringify(JSON.parse(canonicalJson(bundle)), null, 2);
    fs.writeFileSync(destination, `${canonicalPrettyJson}\n`, { flag: 'wx' });
  } catch (error) {
    if (error.code === 'EEXIST') throw new Error(`Dataset file ${destination} already exists; refusing to overwrite.`);
    throw error;
  }
  return { destination, summary: validation.summary };
}

module.exports = { importDataset };

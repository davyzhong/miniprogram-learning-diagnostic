'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');

const constants = require('../evaluation/diagnostic-accuracy/constants');
const { resolveDataRoot } = require('../evaluation/diagnostic-accuracy/data-root');
const annotationSchema = require('../evaluation/diagnostic-accuracy/schemas/annotation.schema.json');
const datasetSchema = require('../evaluation/diagnostic-accuracy/schemas/dataset.schema.json');
const runSchema = require('../evaluation/diagnostic-accuracy/schemas/run.schema.json');
const systemOutputSchema = require('../evaluation/diagnostic-accuracy/schemas/system-output.schema.json');

const repoRoot = path.resolve(__dirname, '..');
const homeDir = os.homedir();

test('rejects relative data roots with an absolute-path error', () => {
  assert.throws(
    () => resolveDataRoot({ value: 'evaluation-data', repoRoot, homeDir }),
    /absolute path/i,
  );
});

test('rejects empty data-root values', () => {
  for (const value of [undefined, null, '', '   ']) {
    assert.throws(
      () => resolveDataRoot({ value, repoRoot, homeDir }),
      /data root/i,
    );
  }
});

test('rejects filesystem roots', () => {
  assert.throws(
    () => resolveDataRoot({ value: path.parse(repoRoot).root, repoRoot, homeDir }),
    /filesystem root/i,
  );
});

test('rejects the repository and directories inside it', () => {
  for (const value of [repoRoot, path.join(repoRoot, 'evaluation-data')]) {
    assert.throws(
      () => resolveDataRoot({ value, repoRoot, homeDir }),
      /repository/i,
    );
  }
});

test('rejects synchronized-folder path segments case-insensitively', () => {
  const synchronizedSegments = [
    'Google Drive',
    'GoogleDrive',
    'iCloud',
    'Dropbox',
    'OneDrive',
    'Box',
  ];

  for (const segment of synchronizedSegments) {
    const value = path.join(path.parse(repoRoot).root, 'private', segment.toUpperCase(), 'evaluation');
    assert.throws(
      () => resolveDataRoot({ value, repoRoot, homeDir }),
      /synchronized/i,
      segment,
    );
  }
});

test('synchronized-folder checks are path-segment aware', () => {
  const value = path.join(path.parse(repoRoot).root, 'private', 'DropboxArchive', 'evaluation');
  assert.equal(resolveDataRoot({ value, repoRoot, homeDir }), path.normalize(value));
});

test('accepts a separate local absolute directory without creating it', () => {
  const value = path.join(
    os.tmpdir(),
    `ldx-eval-data-root-${process.pid}-${Date.now()}`,
  );

  assert.equal(fs.existsSync(value), false);
  assert.equal(resolveDataRoot({ value, repoRoot, homeDir }), path.normalize(value));
  assert.equal(fs.existsSync(value), false);
});

test('exports the exact immutable evaluation constants', () => {
  assert.equal(constants.DATASET_SCHEMA_VERSION, '1.0.0');
  assert.equal(constants.SCORER_VERSION, '1.0.0');
  assert.deepEqual(constants.MATCH_THRESHOLDS, {
    regionIou: 0.5,
    textSimilarity: 0.9,
    ambiguityMargin: 0.05,
  });
  assert.deepEqual(constants.FORMAL_MINIMUMS, {
    documentsPerSubject: 20,
    itemsPerSubject: 150,
    historical: 100,
    challenge: 40,
  });
  assert.deepEqual(constants.CORE_GUARDRAILS, [
    { key: 'overall.clearImageDiscoveryRecall', regression: 'decrease' },
    { key: 'overall.classificationAccuracy', regression: 'decrease' },
    { key: 'overall.s1Rate', regression: 'increase' },
    { key: 'overall.unreadableCorrectRejection', regression: 'decrease' },
    { key: 'overall.runCompletion', regression: 'decrease' },
    { key: 'math.nodeTop1', regression: 'decrease' },
    { key: 'math.bottleneckTop1', regression: 'decrease' },
    { key: 'chinese.originalItemLocation', regression: 'decrease' },
    { key: 'chinese.errorType', regression: 'decrease' },
    { key: 'english.wordIdentity', regression: 'decrease' },
    { key: 'english.recognitionSpelling', regression: 'decrease' },
  ]);

  assert.equal(Object.isFrozen(constants), true);
  assert.equal(Object.isFrozen(constants.MATCH_THRESHOLDS), true);
  assert.equal(Object.isFrozen(constants.FORMAL_MINIMUMS), true);
  assert.equal(Object.isFrozen(constants.CORE_GUARDRAILS), true);
  assert.equal(constants.CORE_GUARDRAILS.every(Object.isFrozen), true);
  assert.throws(() => {
    constants.CORE_GUARDRAILS[0].key = 'changed';
  }, TypeError);
});

test('all evaluation JSON schemas parse and use draft 2020-12', () => {
  for (const schema of [datasetSchema, annotationSchema, runSchema, systemOutputSchema]) {
    assert.equal(schema.$schema, 'https://json-schema.org/draft/2020-12/schema');
  }
});

test('dataset, annotation, and system output share required sampleId linkage', () => {
  assert.ok(datasetSchema.$defs.item.required.includes('sampleId'));
  assert.equal(Object.hasOwn(datasetSchema.$defs.item.properties, 'itemId'), false);
  assert.ok(annotationSchema.required.includes('sampleId'));
  assert.equal(Object.hasOwn(annotationSchema.properties, 'itemId'), false);
  assert.ok(systemOutputSchema.required.includes('sampleId'));
  assert.equal(Object.hasOwn(systemOutputSchema.properties, 'itemId'), false);
});

test('dataset import contract only permits verified redaction', () => {
  assert.deepEqual(
    datasetSchema.$defs.redactionVerification.properties.status.enum,
    ['verified'],
  );
});

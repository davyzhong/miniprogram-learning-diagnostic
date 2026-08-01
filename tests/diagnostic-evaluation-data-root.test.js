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

test('rejects standard macOS CloudStorage and iCloud Drive layouts', () => {
  const localHome = path.join(os.tmpdir(), 'ldx-eval-layout-home');
  const synchronizedRoots = [
    path.join(localHome, 'Library', 'CloudStorage', 'Workspace', 'evaluation'),
    path.join(localHome, 'Library', 'Mobile Documents', 'com~apple~CloudDocs', 'evaluation'),
  ];

  for (const value of synchronizedRoots) {
    assert.throws(
      () => resolveDataRoot({ value, repoRoot, homeDir: localHome }),
      /synchronized/i,
    );
  }
});

test('recognizes provider-prefixed mount segments without broad prefix matching', () => {
  for (const segment of ['GoogleDrive-user@example.com', 'ONEDRIVE-PERSONAL']) {
    const value = path.join(os.tmpdir(), segment, 'evaluation');
    assert.throws(
      () => resolveDataRoot({ value, repoRoot, homeDir }),
      /synchronized/i,
    );
  }

  for (const segment of ['Boxing', 'DropboxNotes', 'GoogleDriver']) {
    const value = path.join(os.tmpdir(), segment, 'evaluation');
    assert.equal(resolveDataRoot({ value, repoRoot, homeDir }), path.normalize(value));
  }
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

function withTemporarySymlink(testContext, target, assertion) {
  const temporaryRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'ldx-eval-symlink-'));
  const alias = path.join(temporaryRoot, 'alias');

  try {
    try {
      fs.symlinkSync(target, alias, 'dir');
    } catch (error) {
      if (['EACCES', 'ENOSYS', 'ENOTSUP', 'EPERM'].includes(error.code)) {
        testContext.skip(`directory symlinks unavailable: ${error.code}`);
        return;
      }
      throw error;
    }
    assertion(alias, temporaryRoot);
  } finally {
    fs.rmSync(temporaryRoot, { recursive: true, force: true });
  }
}

test('rejects an outside symlink alias whose target is inside the repository', (t) => {
  withTemporarySymlink(t, repoRoot, (alias) => {
    assert.throws(
      () => resolveDataRoot({ value: path.join(alias, 'evaluation-data'), repoRoot, homeDir }),
      /repository/i,
    );
  });
});

test('rejects a symlink alias whose canonical target has a synchronized segment', (t) => {
  const temporaryRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'ldx-eval-sync-target-'));
  const syncTarget = path.join(temporaryRoot, 'Dropbox');
  fs.mkdirSync(syncTarget);

  try {
    withTemporarySymlink(t, syncTarget, (alias) => {
      const value = path.join(alias, 'evaluation');
      assert.equal(fs.existsSync(value), false);
      assert.throws(
        () => resolveDataRoot({ value, repoRoot, homeDir }),
        /synchronized/i,
      );
      assert.equal(fs.existsSync(value), false);
    });
  } finally {
    fs.rmSync(temporaryRoot, { recursive: true, force: true });
  }
});

test('rejects a symlink alias into the canonical macOS CloudStorage tree', (t) => {
  const temporaryRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'ldx-eval-cloud-home-'));
  const localHome = path.join(temporaryRoot, 'home');
  const cloudTarget = path.join(localHome, 'Library', 'CloudStorage', 'Workspace');
  fs.mkdirSync(cloudTarget, { recursive: true });

  try {
    withTemporarySymlink(t, cloudTarget, (alias) => {
      assert.throws(
        () => resolveDataRoot({ value: path.join(alias, 'evaluation'), repoRoot, homeDir: localHome }),
        /synchronized/i,
      );
    });
  } finally {
    fs.rmSync(temporaryRoot, { recursive: true, force: true });
  }
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

test('linked identifiers use the same non-whitespace stable-ID contract', () => {
  const stablePattern = datasetSchema.$defs.stableId.pattern;
  assert.equal(stablePattern, '^[A-Za-z0-9][A-Za-z0-9._:-]*$');
  assert.equal(annotationSchema.$defs.stableId.pattern, stablePattern);
  assert.equal(runSchema.$defs.stableId.pattern, stablePattern);
  assert.equal(systemOutputSchema.$defs.stableId.pattern, stablePattern);

  assert.equal(datasetSchema.$defs.item.properties.sampleId.$ref, '#/$defs/stableId');
  assert.equal(datasetSchema.$defs.document.properties.documentId.$ref, '#/$defs/stableId');
  assert.equal(datasetSchema.$defs.page.properties.pageId.$ref, '#/$defs/stableId');
  assert.equal(datasetSchema.$defs.item.properties.annotationRefs.items.$ref, '#/$defs/stableId');
  assert.equal(annotationSchema.properties.sampleId.$ref, '#/$defs/stableId');
  assert.equal(runSchema.properties.runId.$ref, '#/$defs/stableId');
  assert.equal(systemOutputSchema.properties.runId.$ref, '#/$defs/stableId');
  assert.equal(systemOutputSchema.properties.sampleId.$ref, '#/$defs/stableId');
  assert.equal(new RegExp(stablePattern).test('   '), false);
  assert.equal(new RegExp(stablePattern).test('run with spaces'), false);
});

test('system outputs distinguish successful predictions from terminal failures', () => {
  assert.ok(systemOutputSchema.required.includes('status'));
  assert.equal(systemOutputSchema.required.includes('prediction'), false);
  assert.equal(systemOutputSchema.oneOf.length, 2);

  const success = systemOutputSchema.oneOf.find((branch) => branch.properties.status.const === 'success');
  const failure = systemOutputSchema.oneOf.find((branch) => branch.properties.status.const === 'failed');
  assert.ok(success.required.includes('prediction'));
  assert.equal(success.properties.failures.maxItems, 0);
  assert.equal(failure.required.includes('failures'), true);
  assert.equal(failure.properties.failures.minItems, 1);
  assert.equal(failure.required.includes('prediction'), false);
  assert.deepEqual(failure.not, { required: ['prediction'] });
});

test('gold and predicted attribution share subject-specific contract shapes', () => {
  assert.deepEqual(annotationSchema.$defs.attribution, systemOutputSchema.$defs.attribution);
  assert.equal(annotationSchema.$defs.label.properties.attribution.$ref, '#/$defs/attribution');

  const attribution = annotationSchema.$defs.attribution;
  assert.ok(attribution.required.includes('subject'));
  assert.equal(attribution.oneOf.length, 3);
  assert.deepEqual(
    Object.keys(attribution.properties.math.properties).sort(),
    ['bottleneckId', 'bottleneckLabel', 'primaryNodeId', 'primaryNodeLabel'],
  );
  assert.deepEqual(
    Object.keys(attribution.properties.chinese.properties).sort(),
    ['errorType', 'migration', 'originalItemLocation', 'review'],
  );
  assert.deepEqual(
    Object.keys(attribution.properties.english.properties).sort(),
    ['recognitionSpelling', 'stateUpdate', 'wordIdentity'],
  );
});

test('subject attribution branches forbid irrelevant subject payloads', () => {
  for (const schema of [annotationSchema, systemOutputSchema]) {
    const branches = schema.$defs.attribution.oneOf;
    for (const subject of ['math', 'chinese', 'english']) {
      const branch = branches.find((candidate) => candidate.properties.subject.const === subject);
      const irrelevantSubjects = ['math', 'chinese', 'english'].filter((name) => name !== subject);
      for (const irrelevantSubject of irrelevantSubjects) {
        assert.equal(branch.properties[irrelevantSubject], false);
      }
    }
  }
});

test('annotation locked and resolved states require auditable actors and timestamps', () => {
  const lockRule = annotationSchema.properties.lockState.allOf[0];
  assert.deepEqual(lockRule.if.properties.status, { const: 'locked' });
  assert.deepEqual(lockRule.then.required.sort(), ['lockedAt', 'lockedBy']);

  const reviewRules = annotationSchema.properties.review.allOf;
  assert.equal(reviewRules.length, 3);
  assert.deepEqual(reviewRules[0].then.required.sort(), ['qcReviewedAt', 'qcReviewerId']);
  assert.deepEqual(
    reviewRules[1].then.required.sort(),
    ['adjudicatedAt', 'adjudicationLabel', 'adjudicatorId'],
  );
  assert.deepEqual(
    reviewRules[2].then.required.sort(),
    ['disputeResolution', 'disputeResolvedAt', 'disputeResolvedBy'],
  );
});

test('dataset import contract only permits verified redaction', () => {
  assert.deepEqual(
    datasetSchema.$defs.redactionVerification.properties.status.enum,
    ['verified'],
  );
});

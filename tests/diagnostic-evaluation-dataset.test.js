'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');

const {
  canonicalJson,
  sha256Canonical,
  validateAnnotations,
  validateDataset,
  validateRunManifest,
  validateSystemOutput,
} = require('../evaluation/diagnostic-accuracy/validate');
const { importDataset } = require('../evaluation/diagnostic-accuracy/importer');

const fixtureRoot = path.join(__dirname, '..', 'evaluation', 'diagnostic-accuracy', 'fixtures');
const readFixture = (name) => JSON.parse(fs.readFileSync(path.join(fixtureRoot, name), 'utf8'));
const clone = (value) => structuredClone(value);

function validRun(dataset, overrides = {}) {
  return {
    schemaVersion: '1.0.0',
    runId: 'run.fixture.baseline',
    gitCommit: '106a95b',
    versions: {
      dataset: dataset.datasetId,
      scorer: '1.0.0',
      model: 'fixture-model-v1',
      prompt: 'fixture-prompt-v1',
      adapter: 'fixture-adapter-v1',
    },
    configuration: { temperature: 0 },
    timestamps: {
      createdAt: '2026-01-01T00:00:00.000Z',
      startedAt: '2026-01-01T00:00:01.000Z',
      completedAt: '2026-01-01T00:00:02.000Z',
    },
    counts: { success: 6, failure: 1, unresolved: 0, retry: 0 },
    status: 'completed-with-errors',
    outputReferences: ['system-output-baseline.json'],
    usage: { inputTokens: 10, outputTokens: 10, requests: 7, currency: 'USD', estimatedCost: 0 },
    ...overrides,
  };
}

test('canonical JSON sorts object keys recursively while preserving array order', () => {
  const first = { z: [{ b: 2, a: 1 }, 3], a: true };
  const second = { a: true, z: [{ a: 1, b: 2 }, 3] };
  assert.equal(canonicalJson(first), '{"a":true,"z":[{"a":1,"b":2},3]}');
  assert.equal(sha256Canonical(first), sha256Canonical(second));
  assert.match(sha256Canonical(first), /^[a-f0-9]{64}$/u);
});

test('fictional fixture dataset and its real canonical hashes validate', () => {
  const dataset = readFixture('dataset.json');
  const result = validateDataset(dataset, { profile: 'fixture' });
  assert.deepEqual(result.errors, []);
  assert.equal(result.valid, true);
  assert.equal(result.summary.itemsBySubject.math >= 2, true);
  assert.equal(result.summary.itemsBySubject.chinese >= 2, true);
  assert.equal(result.summary.itemsBySubject.english >= 2, true);
  assert.equal(result.summary.inventoryEligible, dataset.pageInventoryLock.pageIds.length);
});

test('dataset validation accumulates IDs, inventory, redaction, composite, and hash errors', () => {
  const dataset = readFixture('dataset.json');
  const bad = clone(dataset);
  bad.profile = 'formal';
  bad.redactionVerification.status = 'pending';
  bad.documents[1].documentId = bad.documents[0].documentId;
  bad.documents[1].pages[0].pageId = bad.documents[0].pages[0].pageId;
  bad.documents[1].pages[0].items[0].sampleId = bad.documents[0].pages[0].items[0].sampleId;
  bad.pageInventoryLock.pageIds.pop();
  bad.documents[0].hashes[0].value = '0'.repeat(64);
  bad.documents[2].pages[0].items[2].composite = {
    role: 'child', parentSampleId: 'missing-parent',
  };
  const result = validateDataset(bad, { profile: 'formal' });
  assert.equal(result.valid, false);
  for (const pattern of [/redaction/iu, /duplicate documentId/iu, /duplicate pageId/iu,
    /duplicate sampleId/iu, /inventory/iu, /hash/iu, /parentSampleId/iu, /minimum/iu]) {
    assert.match(result.errors.join('\n'), pattern);
  }
});

test('dataset rejects whitespace IDs, composite cycles, and scorable parents', () => {
  const bad = clone(readFixture('dataset.json'));
  const page = bad.documents[0].pages[0];
  page.items[0].sampleId = '   ';
  page.items[1].composite = { role: 'parent', childSampleIds: [page.items[2].sampleId] };
  page.items[2].composite = { role: 'parent', childSampleIds: [page.items[1].sampleId] };
  const result = validateDataset(bad, { profile: 'fixture' });
  assert.equal(result.valid, false);
  assert.match(result.errors.join('\n'), /sampleId|stable ID/iu);
  assert.match(result.errors.join('\n'), /cycle/iu);
  assert.match(result.errors.join('\n'), /parent.*scorable|double-count/iu);
});

test('formal inventory rejects crop-only pages while exploratory materials remain outside counts', () => {
  const bad = clone(readFixture('dataset.json'));
  bad.profile = 'formal';
  bad.documents[0].pages[0].inventoryStatus = 'crop-only';
  const result = validateDataset(bad, { profile: 'formal' });
  assert.equal(result.valid, false);
  assert.match(result.errors.join('\n'), /crop-only|inventory/iu);

  const exploratory = clone(readFixture('dataset.json'));
  exploratory.profile = 'exploratory';
  assert.equal(validateDataset(exploratory, { profile: 'exploratory' }).errors.some((e) => /minimum/iu.test(e)), false);
});

test('fixture annotations validate and summarize lock and review states', () => {
  const dataset = readFixture('dataset.json');
  const annotations = readFixture('annotations.json');
  const result = validateAnnotations(annotations, { dataset });
  assert.equal(result.valid, true, result.errors.join('\n'));
  assert.equal(result.summary.locked, annotations.annotations.length);
  assert.equal(result.summary.pending, 0);
  assert.equal(result.summary.qc, annotations.annotations.length);
});

test('annotation validation accumulates duplicates, unknown links, subject, and incomplete audit errors', () => {
  const dataset = readFixture('dataset.json');
  const bad = clone(readFixture('annotations.json'));
  bad.annotations[1].sampleId = bad.annotations[0].sampleId;
  bad.annotations[1].humanLabel.attribution.subject = 'english';
  bad.annotations[1].lockState = { status: 'locked' };
  bad.annotations[1].review.qcStatus = 'passed';
  delete bad.annotations[1].review.qcReviewerId;
  bad.annotations.push({ ...clone(bad.annotations[0]), annotationId: 'annotation.unknown', sampleId: 'missing.sample' });
  const result = validateAnnotations(bad, { dataset });
  assert.equal(result.valid, false);
  for (const pattern of [/duplicate/iu, /missing.sample|dataset/iu, /subject/iu, /lockedAt|lockedBy/iu, /qcReviewerId/iu]) {
    assert.match(result.errors.join('\n'), pattern);
  }
});

test('annotation audit actors must agree with lock and review actors', () => {
  const dataset = readFixture('dataset.json');
  const bad = clone(readFixture('annotations.json'));
  const lockedEvent = bad.annotations[0].auditEvents.find((event) => event.eventType === 'locked');
  lockedEvent.actorId = 'fixture.unrelated-actor';
  const result = validateAnnotations(bad, { dataset });
  assert.equal(result.valid, false);
  assert.match(result.errors.join('\n'), /locked.*actor|actor.*lockedBy/iu);
});

test('annotation pending states cannot retain completed lock or QC metadata', () => {
  const dataset = readFixture('dataset.json');
  const bad = clone(readFixture('annotations.json'));
  bad.annotations[0].lockState.status = 'unlocked';
  bad.annotations[0].review.qcStatus = 'pending';
  const result = validateAnnotations(bad, { dataset });
  assert.equal(result.valid, false);
  assert.match(result.errors.join('\n'), /unlocked.*lockedAt|lockedAt.*unlocked/iu);
  assert.match(result.errors.join('\n'), /pending.*qcReviewerId|qcReviewerId.*pending/iu);
});

test('valid run manifest and baseline/candidate outputs validate including terminal failures', () => {
  const dataset = readFixture('dataset.json');
  const manifest = validRun(dataset);
  assert.equal(validateRunManifest(manifest).valid, true);
  for (const name of ['system-output-baseline.json', 'system-output-candidate.json']) {
    const output = readFixture(name);
    const result = validateSystemOutput(output, { dataset, runManifest: manifest });
    assert.equal(result.valid, true, `${name}: ${result.errors.join('\n')}`);
    assert.equal(result.summary.success + result.summary.failure, output.records.length);
    assert.equal(result.summary.failure >= 1, true);
  }
});

test('system output rejects dishonest branches, duplicates, mismatched subjects, and cross-document links', () => {
  const dataset = readFixture('dataset.json');
  const manifest = validRun(dataset);
  const bad = clone(readFixture('system-output-baseline.json'));
  bad.records[0].prediction.attribution.subject = 'chinese';
  bad.records[2].documentId = bad.records[0].documentId;
  bad.records.push(clone(bad.records[0]));
  const whitespaceRecord = clone(bad.records[0]);
  whitespaceRecord.sampleId = '   ';
  bad.records.push(whitespaceRecord);
  const failed = bad.records.find((record) => record.status === 'failed');
  failed.prediction = clone(bad.records[0].prediction);
  failed.failures = [];
  const result = validateSystemOutput(bad, { dataset, runManifest: manifest });
  assert.equal(result.valid, false);
  for (const pattern of [/subject/iu, /documentId|cross-document/iu, /duplicate/iu, /sampleId|stable ID/iu, /failed|failure/iu]) {
    assert.match(result.errors.join('\n'), pattern);
  }
});

test('run manifest rejects whitespace IDs, missing versions, unknown counts, and contradictory totals', () => {
  const dataset = readFixture('dataset.json');
  const bad = validRun(dataset);
  bad.runId = '   ';
  delete bad.versions.prompt;
  bad.counts.extra = 1;
  bad.counts.success = -1;
  bad.status = 'completed';
  bad.counts.failure = 1;
  const result = validateRunManifest(bad);
  assert.equal(result.valid, false);
  for (const pattern of [/runId|stable ID/iu, /prompt/iu, /unknown.*count|count.*extra/iu, /nonnegative/iu, /completed/iu]) {
    assert.match(result.errors.join('\n'), pattern);
  }
});

test('run manifest requires RFC 3339 date-time timestamps', () => {
  const dataset = readFixture('dataset.json');
  const bad = validRun(dataset);
  bad.timestamps.startedAt = '2026-01-01';
  const result = validateRunManifest(bad);
  assert.equal(result.valid, false);
  assert.match(result.errors.join('\n'), /startedAt.*date-time/iu);
});

test('import writes canonical JSON exclusively and refuses to overwrite', () => {
  const temporaryRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'ldx-eval-import-'));
  const sourceFile = path.join(fixtureRoot, 'dataset.json');
  try {
    const imported = importDataset({ sourceFile, dataRoot: temporaryRoot, profile: 'fixture' });
    const expected = path.join(temporaryRoot, 'datasets', 'fixture-v1', 'dataset.json');
    assert.equal(imported.destination, expected);
    assert.equal(
      fs.readFileSync(expected, 'utf8'),
      `${JSON.stringify(JSON.parse(canonicalJson(readFixture('dataset.json'))), null, 2)}\n`,
    );
    assert.throws(
      () => importDataset({ sourceFile, dataRoot: temporaryRoot, profile: 'fixture' }),
      /already exists|refus/iu,
    );
    assert.equal(fs.existsSync(expected), true);
  } finally {
    fs.rmSync(temporaryRoot, { recursive: true, force: true });
  }
});

test('import rejects aggregate validation errors without mutating the data root', () => {
  const temporaryRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'ldx-eval-invalid-'));
  const sourceFile = path.join(temporaryRoot, 'invalid.json');
  fs.writeFileSync(sourceFile, JSON.stringify({ profile: 'fixture', documents: [] }));
  try {
    assert.throws(
      () => importDataset({ sourceFile, dataRoot: temporaryRoot, profile: 'fixture' }),
      /invalid dataset[\s\S]*schemaVersion[\s\S]*datasetId/iu,
    );
    assert.equal(fs.existsSync(path.join(temporaryRoot, 'datasets')), false);
  } finally {
    fs.rmSync(temporaryRoot, { recursive: true, force: true });
  }
});

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
const allItems = (dataset) => dataset.documents.flatMap((document) => document.pages.flatMap((page) => page.items));

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
    counts: { total: 7, success: 6, failure: 1, unresolved: 0, retry: 0 },
    status: 'completed-with-errors',
    outputReferences: ['system-output-baseline.json'],
    usage: { inputTokens: 10, outputTokens: 10, requests: 7, currency: 'USD', estimatedCost: 0 },
    ...overrides,
  };
}

function rehashDataset(dataset) {
  for (const document of dataset.documents) {
    for (const page of document.pages) {
      for (const item of page.items) {
        const itemContent = { ...item };
        delete itemContent.hashes;
        item.hashes = [{ algorithm: 'sha256', value: sha256Canonical(itemContent) }];
      }
      const pageContent = { ...page };
      delete pageContent.hashes;
      page.hashes = [{ algorithm: 'sha256', value: sha256Canonical(pageContent) }];
    }
    const documentContent = { ...document };
    delete documentContent.hashes;
    document.hashes = [{ algorithm: 'sha256', value: sha256Canonical(documentContent) }];
  }
  dataset.pageInventoryLock.inventoryHash = {
    algorithm: 'sha256',
    value: sha256Canonical(dataset.pageInventoryLock.pageIds),
  };
  return dataset;
}

function formalDataset() {
  const documents = [];
  for (const subject of ['math', 'chinese', 'english']) {
    for (let documentIndex = 0; documentIndex < 20; documentIndex += 1) {
      const sourceType = documentIndex < 10 ? 'historical' : 'challenge';
      const itemCount = sourceType === 'historical' ? 10 : 5;
      const documentId = `formal.${subject}.document.${documentIndex}`;
      const pageId = `formal.${subject}.page.${documentIndex}`;
      const items = Array.from({ length: itemCount }, (_, itemIndex) => ({
        sampleId: `formal.${subject}.sample.${documentIndex}.${itemIndex}`,
        crop: { x: itemIndex, y: 0, width: 1, height: 1, unit: 'pixel' },
        composite: { role: 'standalone' },
        hashes: [],
        annotationRefs: [],
      }));
      documents.push({
        documentId,
        subject,
        grade: 4,
        sourceType,
        captureType: 'synthetic',
        hashes: [],
        pages: [{
          pageId,
          pageNumber: 1,
          imageReference: `fixture://formal/${subject}/${documentIndex}`,
          inventoryStatus: 'complete',
          hashes: [],
          items,
        }],
      });
    }
  }
  const pageIds = documents.flatMap((document) => document.pages.map((page) => page.pageId));
  return rehashDataset({
    schemaVersion: '1.0.0',
    datasetId: 'formal.generated.v1',
    profile: 'formal',
    documents,
    pageInventoryLock: {
      locked: true,
      pageIds,
      inventoryHash: { algorithm: 'sha256', value: '' },
      lockedAt: '2026-01-01T01:00:00.000Z',
    },
    redactionVerification: {
      status: 'verified', verifiedAt: '2026-01-01T01:30:00.000Z', verifierId: 'fixture.verifier',
    },
  });
}

test('canonical JSON sorts object keys recursively while preserving array order', () => {
  const first = { z: [{ b: 2, a: 1 }, 3], a: true };
  const second = { a: true, z: [{ a: 1, b: 2 }, 3] };
  assert.equal(canonicalJson(first), '{"a":true,"z":[{"a":1,"b":2},3]}');
  assert.equal(sha256Canonical(first), sha256Canonical(second));
  assert.match(sha256Canonical(first), /^[a-f0-9]{64}$/u);
});

test('canonical JSON rejects non-JSON values, cycles, sparse arrays, and exotic objects', () => {
  const cycle = {};
  cycle.self = cycle;
  const sparse = [];
  sparse[1] = 'value';
  const exotic = Object.create(null);
  exotic.value = 1;
  const hidden = {};
  Object.defineProperty(hidden, 'value', { value: 1, enumerable: false });
  const accessor = {};
  Object.defineProperty(accessor, 'value', { get: () => 1, enumerable: true });
  const decoratedArray = [1];
  decoratedArray.extra = true;
  const cases = [
    undefined,
    () => true,
    Symbol('value'),
    1n,
    Number.NaN,
    Number.POSITIVE_INFINITY,
    { missing: undefined },
    cycle,
    sparse,
    new Date('2026-01-01T00:00:00.000Z'),
    exotic,
    hidden,
    accessor,
    decoratedArray,
  ];
  for (const value of cases) assert.throws(() => canonicalJson(value), /canonical|JSON|unsupported|finite|cycle|sparse|prototype/iu);
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
  assert.equal(dataset.documents.every((document) => ['historical', 'challenge'].includes(document.sourceType)), true);
  assert.equal(dataset.documents.every((document) => document.captureType === 'synthetic'), true);
  assert.equal(dataset.documents.flatMap((document) => document.pages).every((page) => page.imageReference.startsWith('fixture://')), true);
  assert.equal(dataset.documents.flatMap((document) => document.pages).every((page) => ['clear', 'degraded', 'unreadable'].includes(page.imageQuality)), true);
  const unreadableId = readFixture('annotations.json').annotations.find((annotation) => annotation.humanLabel.conclusion === 'unreadable').sampleId;
  const unreadableDocument = dataset.documents.find((document) => document.pages.some((page) => page.items.some((item) => item.sampleId === unreadableId)));
  assert.equal(unreadableDocument.sourceType, 'challenge');
});

test('schema-backed optional scoring fields validate end to end', () => {
  const dataset = readFixture('dataset.json');
  const annotations = readFixture('annotations.json');
  const output = readFixture('system-output-candidate.json');
  const manifest = validRun(dataset);

  assert.equal(validateDataset(dataset, { profile: 'fixture' }).valid, true);
  assert.equal(validateAnnotations(annotations, { dataset }).valid, true);
  assert.equal(validateSystemOutput(output, { dataset, runManifest: manifest }).valid, true);
  const mathGold = annotations.annotations.find(({ sampleId }) => sampleId === 'fixture.math.fraction').humanLabel;
  assert.ok(mathGold.acceptedAnswers.length > 0);
  assert.ok(mathGold.attribution.math.ancestorNodeIds.length > 0);
  assert.ok(mathGold.attribution.math.nodeIds.length > 0);
  assert.ok(mathGold.attribution.math.bottleneckIds.length > 0);
  assert.equal(typeof mathGold.attribution.math.errorReason, 'string');
  const chineseGold = annotations.annotations.find(({ sampleId }) => sampleId === 'fixture.chinese.character').humanLabel.attribution.chinese;
  assert.ok(chineseGold.allowedMigrationTypes.includes(chineseGold.migrationType));
});

test('optional scoring contract rejects invalid enums, empty strings, and empty arrays', () => {
  const baseDataset = readFixture('dataset.json');
  const badPageQuality = clone(baseDataset);
  badPageQuality.documents[0].pages[0].imageQuality = 'perfect';
  rehashDataset(badPageQuality);
  assert.ok(validateDataset(badPageQuality, { profile: 'fixture' }).errors.some((error) => /imageQuality/u.test(error)));

  const badItemQuality = clone(baseDataset);
  badItemQuality.documents[0].pages[0].items[1].imageQuality = '';
  rehashDataset(badItemQuality);
  assert.ok(validateDataset(badItemQuality, { profile: 'fixture' }).errors.some((error) => /imageQuality/u.test(error)));

  const annotationCases = [
    (label) => { label.text = ''; },
    (label) => { label.acceptedAnswers = []; },
    (label) => { label.acceptedAnswers = ['']; },
    (label) => { label.attribution.math.ancestorNodeIds = []; },
    (label) => { label.attribution.math.nodeIds = ['']; },
    (label) => { label.attribution.math.errorReason = ''; },
  ];
  for (const mutate of annotationCases) {
    const annotations = readFixture('annotations.json');
    mutate(annotations.annotations[1].humanLabel);
    assert.equal(validateAnnotations(annotations, { dataset: baseDataset }).valid, false);
  }
  const chineseAnnotations = readFixture('annotations.json');
  chineseAnnotations.annotations[2].humanLabel.attribution.chinese.allowedMigrationTypes = [];
  assert.equal(validateAnnotations(chineseAnnotations, { dataset: baseDataset }).valid, false);
  const illegalGoldMigration = readFixture('annotations.json');
  illegalGoldMigration.annotations[2].humanLabel.attribution.chinese.migrationType = 'migration-not-allowed';
  assert.equal(validateAnnotations(illegalGoldMigration, { dataset: baseDataset }).valid, false);

  const output = readFixture('system-output-candidate.json');
  output.records[1].prediction.attribution.math.nodeIds = [];
  assert.equal(validateSystemOutput(output, { dataset: baseDataset, runManifest: validRun(baseDataset) }).valid, false);
  const badMigrationOutput = readFixture('system-output-candidate.json');
  badMigrationOutput.records[2].prediction.attribution.chinese.migrationType = 7;
  assert.equal(validateSystemOutput(badMigrationOutput, { dataset: baseDataset, runManifest: validRun(baseDataset) }).valid, false);
});

test('generated formal dataset satisfies document, item, historical, and challenge minima', () => {
  const result = validateDataset(formalDataset(), { profile: 'formal' });
  assert.equal(result.valid, true, result.errors.join('\n'));
  for (const subject of ['math', 'chinese', 'english']) {
    assert.equal(result.summary.documentsBySubject[subject], 20);
    assert.equal(result.summary.itemsBySubject[subject], 150);
    assert.deepEqual(result.summary.documentsBySourceBySubject[subject], { historical: 10, challenge: 10 });
    assert.equal(result.summary.itemsBySourceBySubject[subject].historical, 100);
    assert.equal(result.summary.itemsBySourceBySubject[subject].challenge, 50);
  }
});

test('formal dataset reports each independent minimum below threshold', () => {
  const documentShort = formalDataset();
  const removed = documentShort.documents.splice(19, 1)[0];
  documentShort.documents[18].pages.push(...removed.pages);
  rehashDataset(documentShort);
  assert.match(validateDataset(documentShort, { profile: 'formal' }).errors.join('\n'), /documents.*math|math.*documents/iu);

  const itemShort = formalDataset();
  itemShort.documents[10].pages[0].items.pop();
  rehashDataset(itemShort);
  assert.match(validateDataset(itemShort, { profile: 'formal' }).errors.join('\n'), /items.*math|math.*items/iu);

  const historicalShort = formalDataset();
  historicalShort.documents[0].sourceType = 'challenge';
  rehashDataset(historicalShort);
  assert.match(validateDataset(historicalShort, { profile: 'formal' }).errors.join('\n'), /historical.*math|math.*historical/iu);

  const challengeShort = formalDataset();
  challengeShort.documents[10].sourceType = 'historical';
  challengeShort.documents[11].sourceType = 'historical';
  challengeShort.documents[12].sourceType = 'historical';
  rehashDataset(challengeShort);
  assert.match(validateDataset(challengeShort, { profile: 'formal' }).errors.join('\n'), /challenge.*math|math.*challenge/iu);
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

test('dataset validates grade, capture, image-reference, and redaction primitive types', () => {
  const bad = clone(readFixture('dataset.json'));
  bad.documents[0].grade = 4.5;
  bad.documents[0].captureType = 'screenshot';
  bad.documents[0].pages[0].imageReference = 42;
  bad.redactionVerification.notes = 42;
  const result = validateDataset(bad, { profile: 'fixture' });
  assert.equal(result.valid, false);
  for (const pattern of [/grade.*integer/iu, /captureType/iu, /imageReference.*string/iu, /notes.*string/iu]) assert.match(result.errors.join('\n'), pattern);
});

test('formal inventory rejects crop_only pages', () => {
  const bad = clone(readFixture('dataset.json'));
  bad.profile = 'formal';
  bad.documents[0].pages[0].inventoryStatus = 'crop_only';
  rehashDataset(bad);
  const result = validateDataset(bad, { profile: 'formal' });
  assert.equal(result.valid, false);
  assert.match(result.errors.join('\n'), /crop_only|inventory/iu);
});

test('exploratory crop_only pages may be unlocked and are outside formal counts', () => {
  const exploratory = clone(readFixture('dataset.json'));
  exploratory.profile = 'exploratory';
  exploratory.documents[0].pages[0].inventoryStatus = 'crop_only';
  exploratory.pageInventoryLock.locked = false;
  delete exploratory.pageInventoryLock.lockedAt;
  rehashDataset(exploratory);
  const result = validateDataset(exploratory, { profile: 'exploratory' });
  assert.equal(result.valid, true, result.errors.join('\n'));
  assert.equal(result.summary.formalEligibleItems, 0);
  assert.equal(result.summary.inventoryEligible, 0);
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

test('annotation references reconcile bidirectionally by annotationId and sampleId', () => {
  const dataset = readFixture('dataset.json');
  const annotations = readFixture('annotations.json');
  assert.equal(validateAnnotations(annotations, { dataset }).valid, true);

  const undeclaredDataset = clone(dataset);
  allItems(undeclaredDataset).find((item) => item.sampleId === 'fixture.math.correct').annotationRefs = [];
  assert.match(validateAnnotations(annotations, { dataset: undeclaredDataset }).errors.join('\n'), /annotation\.math\.correct.*annotationRefs|annotationRefs.*annotation\.math\.correct/iu);

  const danglingDataset = clone(dataset);
  allItems(danglingDataset).find((item) => item.sampleId === 'fixture.math.correct').annotationRefs.push('annotation.dangling');
  assert.match(validateAnnotations(annotations, { dataset: danglingDataset }).errors.join('\n'), /dangling/iu);

  const crossSampleDataset = clone(dataset);
  allItems(crossSampleDataset).find((item) => item.sampleId === 'fixture.math.fraction').annotationRefs.push('annotation.math.correct');
  assert.match(validateAnnotations(annotations, { dataset: crossSampleDataset }).errors.join('\n'), /cross-sample|same sample/iu);

  const duplicateDataset = clone(dataset);
  allItems(duplicateDataset).find((item) => item.sampleId === 'fixture.math.correct').annotationRefs.push('annotation.math.correct');
  assert.match(validateAnnotations(annotations, { dataset: duplicateDataset }).errors.join('\n'), /duplicate.*annotationRef|annotationRef.*duplicate/iu);
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

test('annotation validation rejects malformed subject fields and label text types', () => {
  const dataset = readFixture('dataset.json');
  const bad = clone(readFixture('annotations.json'));
  bad.annotations[0].humanLabel.text = 42;
  bad.annotations[2].humanLabel.attribution.chinese.errorType = false;
  bad.annotations[4].humanLabel.attribution.english.recognitionSpelling = 'invented-state';
  bad.annotations[0].auditEvents[0].details = 'not-an-object';
  const result = validateAnnotations(bad, { dataset });
  assert.equal(result.valid, false);
  for (const pattern of [/text.*string/iu, /errorType.*string/iu, /recognitionSpelling/iu, /details.*object/iu]) assert.match(result.errors.join('\n'), pattern);
});

test('annotation pending review states reject stale adjudication and dispute metadata', () => {
  const dataset = readFixture('dataset.json');
  const bad = clone(readFixture('annotations.json'));
  const annotation = bad.annotations[0];
  annotation.review.adjudicationStatus = 'pending';
  annotation.review.adjudicatorId = 'fixture.adjudicator';
  annotation.review.adjudicationLabel = clone(annotation.humanLabel);
  annotation.review.adjudicatedAt = '2026-01-01T02:25:00.000Z';
  annotation.review.disputeStatus = 'none';
  annotation.review.disputeResolution = 'stale-resolution';
  annotation.review.disputeResolvedBy = 'fixture.adjudicator';
  annotation.review.disputeResolvedAt = '2026-01-01T02:25:00.000Z';
  annotation.auditEvents.push(
    { eventId: 'audit.stale.adjudicated', eventType: 'adjudicated', actorId: 'fixture.adjudicator', timestamp: '2026-01-01T02:25:00.000Z' },
    { eventId: 'audit.stale.disputed', eventType: 'disputed', actorId: 'fixture.adjudicator', timestamp: '2026-01-01T02:25:00.000Z' },
  );
  const result = validateAnnotations(bad, { dataset });
  assert.equal(result.valid, false);
  assert.match(result.errors.join('\n'), /pending.*adjudic|adjudic.*pending/iu);
  assert.match(result.errors.join('\n'), /dispute.*none|none.*dispute/iu);
  assert.match(result.errors.join('\n'), /pending.*adjudicated audit|adjudicated audit.*pending/iu);
  assert.match(result.errors.join('\n'), /none.*disputed audit|disputed audit.*none/iu);
});

test('annotation audit reconciliation uses latest chronological lifecycle events', () => {
  const dataset = readFixture('dataset.json');
  const source = readFixture('annotations.json');

  const staleLock = clone(source);
  staleLock.annotations[0].auditEvents.push({
    eventId: 'audit.lock.later', eventType: 'locked', actorId: 'fixture.other', timestamp: '2026-01-01T02:40:00.000Z',
  });
  assert.match(validateAnnotations(staleLock, { dataset }).errors.join('\n'), /latest.*lock|lock.*latest/iu);

  const reversedUnlock = clone(source);
  reversedUnlock.annotations[0].lockState = { status: 'unlocked' };
  reversedUnlock.annotations[0].auditEvents.push({
    eventId: 'audit.unlock.early', eventType: 'unlocked', actorId: 'fixture.annotator', timestamp: '2026-01-01T02:25:00.000Z',
  });
  assert.match(validateAnnotations(reversedUnlock, { dataset }).errors.join('\n'), /latest.*unlocked|unlock.*after|chronolog/iu);

  const staleQc = clone(source);
  staleQc.annotations[0].auditEvents.push({
    eventId: 'audit.qc.later', eventType: 'qc-checked', actorId: 'fixture.other', timestamp: '2026-01-01T02:40:00.000Z',
  });
  assert.match(validateAnnotations(staleQc, { dataset }).errors.join('\n'), /latest.*QC|QC.*latest/iu);

  const staleAdjudication = clone(source);
  const adjudication = staleAdjudication.annotations[0];
  adjudication.review.adjudicationStatus = 'resolved';
  adjudication.review.adjudicatorId = 'fixture.adjudicator';
  adjudication.review.adjudicationLabel = clone(adjudication.humanLabel);
  adjudication.review.adjudicatedAt = '2026-01-01T02:40:00.000Z';
  adjudication.auditEvents.push(
    { eventId: 'audit.adjudication.match', eventType: 'adjudicated', actorId: 'fixture.adjudicator', timestamp: '2026-01-01T02:40:00.000Z' },
    { eventId: 'audit.adjudication.later', eventType: 'adjudicated', actorId: 'fixture.other', timestamp: '2026-01-01T02:50:00.000Z' },
  );
  assert.match(validateAnnotations(staleAdjudication, { dataset }).errors.join('\n'), /latest.*adjudication|adjudication.*latest/iu);

  const staleDispute = clone(source);
  const dispute = staleDispute.annotations[0];
  dispute.review.disputeStatus = 'resolved';
  dispute.review.disputeResolution = 'fictional-resolution';
  dispute.review.disputeResolvedBy = 'fixture.adjudicator';
  dispute.review.disputeResolvedAt = '2026-01-01T02:40:00.000Z';
  dispute.auditEvents.push(
    { eventId: 'audit.dispute.match', eventType: 'disputed', actorId: 'fixture.adjudicator', timestamp: '2026-01-01T02:40:00.000Z' },
    { eventId: 'audit.dispute.later', eventType: 'disputed', actorId: 'fixture.other', timestamp: '2026-01-01T02:50:00.000Z' },
  );
  assert.match(validateAnnotations(staleDispute, { dataset }).errors.join('\n'), /latest.*dispute|dispute.*latest/iu);

  const latestWins = clone(source);
  latestWins.annotations[0].auditEvents.unshift(
    { eventId: 'audit.lock.older', eventType: 'locked', actorId: 'fixture.other', timestamp: '2026-01-01T02:05:00.000Z' },
    { eventId: 'audit.qc.older', eventType: 'qc-checked', actorId: 'fixture.other', timestamp: '2026-01-01T02:06:00.000Z' },
  );
  const latestWinsResult = validateAnnotations(latestWins, { dataset });
  assert.equal(latestWinsResult.valid, true, latestWinsResult.errors.join('\n'));
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

test('system output validates prediction primitive and subject-specific field types', () => {
  const dataset = readFixture('dataset.json');
  const manifest = validRun(dataset);
  const bad = clone(readFixture('system-output-baseline.json'));
  bad.records[0].prediction.text = 42;
  bad.records[0].prediction.confidence = 'high';
  bad.records[2].prediction.attribution.chinese.originalItemLocation = 1;
  bad.records[4].prediction.attribution.english.stateUpdate = false;
  bad.records.find((record) => record.status === 'failed').failures[0].details = 'not-an-object';
  const result = validateSystemOutput(bad, { dataset, runManifest: manifest });
  assert.equal(result.valid, false);
  for (const pattern of [/text.*string/iu, /confidence/iu, /originalItemLocation.*string/iu, /stateUpdate/iu, /details.*object/iu]) assert.match(result.errors.join('\n'), pattern);
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

test('run manifest enforces total relationship, retry bound, and object metadata', () => {
  const dataset = readFixture('dataset.json');
  const bad = validRun(dataset);
  bad.counts.total = 8;
  bad.counts.retry = 9;
  bad.configuration = 'not-an-object';
  bad.usage.providerMetadata = 'not-an-object';
  const result = validateRunManifest(bad);
  assert.equal(result.valid, false);
  for (const pattern of [/total/iu, /retry/iu, /configuration.*object/iu, /providerMetadata.*object/iu]) assert.match(result.errors.join('\n'), pattern);
});

test('system output allows manifest unresolved and retry while records reconcile to success plus failure', () => {
  const dataset = readFixture('dataset.json');
  const manifest = validRun(dataset);
  manifest.counts = { total: 9, success: 6, failure: 1, unresolved: 2, retry: 3 };
  const result = validateSystemOutput(readFixture('system-output-baseline.json'), { dataset, runManifest: manifest });
  assert.equal(result.valid, true, result.errors.join('\n'));
});

test('system output rejects success/failure and observed-record reconciliation mismatches', () => {
  const dataset = readFixture('dataset.json');
  const manifest = validRun(dataset);
  manifest.counts = { total: 7, success: 5, failure: 1, unresolved: 1, retry: 2 };
  const result = validateSystemOutput(readFixture('system-output-baseline.json'), { dataset, runManifest: manifest });
  assert.equal(result.valid, false);
  assert.match(result.errors.join('\n'), /success count/iu);
  assert.match(result.errors.join('\n'), /record.*success.*failure|success.*failure.*record/iu);
});

test('system output run manifest dataset version must match supplied dataset', () => {
  const dataset = readFixture('dataset.json');
  const manifest = validRun(dataset);
  manifest.versions.dataset = 'fixture-other-version';
  const result = validateSystemOutput(readFixture('system-output-baseline.json'), { dataset, runManifest: manifest });
  assert.equal(result.valid, false);
  assert.match(result.errors.join('\n'), /dataset.*version|versions\.dataset/iu);
});

test('run manifest requires RFC 3339 date-time timestamps', () => {
  const dataset = readFixture('dataset.json');
  const bad = validRun(dataset);
  bad.timestamps.startedAt = '2026-01-01';
  const result = validateRunManifest(bad);
  assert.equal(result.valid, false);
  assert.match(result.errors.join('\n'), /startedAt.*date-time/iu);

  for (const timestamp of ['2026-02-31T00:00:00Z', '2026-01-01T24:00:00Z', '2026-01-01T00:00:00+24:00']) {
    const impossible = validRun(dataset);
    impossible.timestamps.startedAt = timestamp;
    const impossibleResult = validateRunManifest(impossible);
    assert.equal(impossibleResult.valid, false, timestamp);
    assert.match(impossibleResult.errors.join('\n'), /startedAt.*date-time/iu);
  }
});

test('validators return aggregate results instead of throwing on malformed shapes', () => {
  const malformedDataset = clone(readFixture('dataset.json'));
  malformedDataset.profile = 'formal';
  malformedDataset.pageInventoryLock.pageIds = {};
  let datasetResult;
  assert.doesNotThrow(() => { datasetResult = validateDataset(malformedDataset, { profile: 'formal' }); });
  assert.equal(datasetResult.valid, false);

  const malformedIndexDataset = { datasetId: 'malformed', documents: {} };
  let annotationResult;
  assert.doesNotThrow(() => { annotationResult = validateAnnotations({ schemaVersion: '1.0.0', datasetId: 'malformed', annotations: [] }, { dataset: malformedIndexDataset }); });
  assert.equal(annotationResult.valid, false);

  let outputResult;
  assert.doesNotThrow(() => { outputResult = validateSystemOutput({ schemaVersion: '1.0.0', runId: 'run.test', records: [] }, { dataset: malformedIndexDataset }); });
  assert.equal(outputResult.valid, false);

  const malformedSubjectDataset = clone(readFixture('dataset.json'));
  malformedSubjectDataset.documents[0].subject = 'not-a-subject';
  assert.doesNotThrow(() => { outputResult = validateSystemOutput(readFixture('system-output-baseline.json'), { dataset: malformedSubjectDataset }); });
  assert.equal(outputResult.valid, false);

  for (const validate of [validateDataset, validateAnnotations, validateRunManifest, validateSystemOutput]) {
    assert.doesNotThrow(() => validate(null));
    assert.equal(validate(null).valid, false);
  }
});

test('nonterminal run states reject contradictory completed metadata and counts', () => {
  const dataset = readFixture('dataset.json');
  const created = validRun(dataset, { status: 'created' });
  const createdResult = validateRunManifest(created);
  assert.equal(createdResult.valid, false);
  assert.match(createdResult.errors.join('\n'), /created.*count|count.*created/iu);

  const running = validRun(dataset, { status: 'running', counts: { total: 7, success: 6, failure: 0, unresolved: 1, retry: 0 } });
  const runningResult = validateRunManifest(running);
  assert.equal(runningResult.valid, false);
  assert.match(runningResult.errors.join('\n'), /running.*completedAt|completedAt.*running/iu);
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

function makeImportRoots(prefix) {
  return {
    dataRoot: fs.mkdtempSync(path.join(os.tmpdir(), `${prefix}-root-`)),
    externalRoot: fs.mkdtempSync(path.join(os.tmpdir(), `${prefix}-external-`)),
  };
}

function cleanImportRoots(roots) {
  fs.rmSync(roots.dataRoot, { recursive: true, force: true });
  fs.rmSync(roots.externalRoot, { recursive: true, force: true });
}

test('import rejects a datasets symlink without writing outside the data root', () => {
  const roots = makeImportRoots('ldx-datasets-link');
  try {
    fs.symlinkSync(roots.externalRoot, path.join(roots.dataRoot, 'datasets'), 'dir');
    assert.throws(
      () => importDataset({ sourceFile: path.join(fixtureRoot, 'dataset.json'), dataRoot: roots.dataRoot, profile: 'fixture' }),
      /symlink|unsafe|outside/iu,
    );
    assert.deepEqual(fs.readdirSync(roots.externalRoot), []);
  } finally {
    cleanImportRoots(roots);
  }
});

test('import rejects a version-directory symlink without writing outside the data root', () => {
  const roots = makeImportRoots('ldx-version-link');
  try {
    fs.mkdirSync(path.join(roots.dataRoot, 'datasets'));
    fs.symlinkSync(roots.externalRoot, path.join(roots.dataRoot, 'datasets', 'fixture-v1'), 'dir');
    assert.throws(
      () => importDataset({ sourceFile: path.join(fixtureRoot, 'dataset.json'), dataRoot: roots.dataRoot, profile: 'fixture' }),
      /symlink|unsafe|outside/iu,
    );
    assert.deepEqual(fs.readdirSync(roots.externalRoot), []);
  } finally {
    cleanImportRoots(roots);
  }
});

test('import rejects a final-file symlink injected before exclusive creation', () => {
  const roots = makeImportRoots('ldx-file-link');
  const externalFile = path.join(roots.externalRoot, 'redirected.json');
  const originalMkdirSync = fs.mkdirSync;
  try {
    fs.mkdirSync = (target, options) => {
      const result = originalMkdirSync(target, options);
      if (path.basename(target) === 'fixture-v1') fs.symlinkSync(externalFile, path.join(target, 'dataset.json'));
      return result;
    };
    assert.throws(
      () => importDataset({ sourceFile: path.join(fixtureRoot, 'dataset.json'), dataRoot: roots.dataRoot, profile: 'fixture' }),
      /symlink|unsafe|outside/iu,
    );
    assert.equal(fs.existsSync(externalFile), false);
  } finally {
    fs.mkdirSync = originalMkdirSync;
    cleanImportRoots(roots);
  }
});

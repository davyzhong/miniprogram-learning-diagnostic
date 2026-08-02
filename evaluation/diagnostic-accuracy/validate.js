'use strict';

const crypto = require('node:crypto');
const { DATASET_SCHEMA_VERSION, FORMAL_MINIMUMS } = require('./constants');

const SUBJECTS = ['math', 'chinese', 'english'];
const PROFILES = ['formal', 'exploratory', 'fixture'];
const SOURCES = ['historical', 'challenge'];
const CAPTURE_TYPES = ['camera', 'scan', 'synthetic'];
const CONCLUSIONS = ['correct', 'incorrect', 'unreadable', 'not-an-item'];
const STABLE_ID = /^[A-Za-z0-9][A-Za-z0-9._:-]*$/u;
const HASH = /^[a-f0-9]{64}$/u;

function canonicalJson(value) {
  if (value === null || typeof value !== 'object') return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(',')}]`;
  return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${canonicalJson(value[key])}`).join(',')}}`;
}

function sha256Canonical(value) {
  return crypto.createHash('sha256').update(canonicalJson(value)).digest('hex');
}

function isObject(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function validDate(value) {
  return typeof value === 'string'
    && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})$/u.test(value)
    && !Number.isNaN(Date.parse(value));
}

function requireObject(value, location, errors) {
  if (!isObject(value)) {
    errors.push(`${location} must be an object.`);
    return false;
  }
  return true;
}

function requireKeys(value, keys, location, errors) {
  if (!isObject(value)) return;
  for (const key of keys) if (!Object.hasOwn(value, key)) errors.push(`${location}.${key} is required.`);
}

function allowOnly(value, keys, location, errors) {
  if (!isObject(value)) return;
  for (const key of Object.keys(value)) if (!keys.includes(key)) errors.push(`${location} has unknown field ${key}.`);
}

function stableId(value, location, errors) {
  if (typeof value !== 'string' || !STABLE_ID.test(value)) errors.push(`${location} must be a stable ID without whitespace.`);
}

function enumValue(value, allowed, location, errors) {
  if (!allowed.includes(value)) errors.push(`${location} must be one of: ${allowed.join(', ')}.`);
}

function stringValue(value, location, errors) {
  if (typeof value !== 'string') errors.push(`${location} must be a string.`);
}

function arrayValue(value, location, errors) {
  if (!Array.isArray(value)) {
    errors.push(`${location} must be an array.`);
    return [];
  }
  return value;
}

function latestAuditEvent(events, eventTypes) {
  return events
    .filter((event) => isObject(event) && eventTypes.includes(event.eventType) && validDate(event.timestamp))
    .reduce((latest, event) => (!latest || Date.parse(event.timestamp) >= Date.parse(latest.timestamp) ? event : latest), null);
}

function withoutKey(value, key) {
  const copy = { ...value };
  delete copy[key];
  return copy;
}

function validateHashes(owner, location, errors) {
  const hashes = arrayValue(owner && owner.hashes, `${location}.hashes`, errors);
  if (hashes.length === 0) errors.push(`${location}.hashes must contain at least one content hash.`);
  const expected = sha256Canonical(withoutKey(owner, 'hashes'));
  hashes.forEach((hash, index) => {
    const at = `${location}.hashes[${index}]`;
    if (!requireObject(hash, at, errors)) return;
    allowOnly(hash, ['algorithm', 'value'], at, errors);
    requireKeys(hash, ['algorithm', 'value'], at, errors);
    if (hash.algorithm !== 'sha256') errors.push(`${at}.algorithm must be sha256.`);
    if (typeof hash.value !== 'string' || !HASH.test(hash.value)) errors.push(`${at}.value must be a lowercase SHA-256 hash.`);
    else if (hash.value !== expected) errors.push(`${at}.value hash mismatch; expected ${expected}.`);
  });
}

function validateCrop(crop, location, errors) {
  if (!requireObject(crop, location, errors)) return;
  allowOnly(crop, ['x', 'y', 'width', 'height', 'unit'], location, errors);
  requireKeys(crop, ['x', 'y', 'width', 'height', 'unit'], location, errors);
  for (const key of ['x', 'y', 'width', 'height']) {
    if (typeof crop[key] !== 'number' || !Number.isFinite(crop[key]) || crop[key] < 0 || (['width', 'height'].includes(key) && crop[key] <= 0)) {
      errors.push(`${location}.${key} must be a ${['width', 'height'].includes(key) ? 'positive' : 'nonnegative'} number.`);
    }
  }
  enumValue(crop.unit, ['pixel', 'normalized'], `${location}.unit`, errors);
}

function validateDataset(bundle, { profile } = {}) {
  const errors = [];
  const summary = {
    documents: 0, pages: 0, items: 0, scorableItems: 0, inventoryEligible: 0, formalEligibleItems: 0,
    documentsBySubject: Object.fromEntries(SUBJECTS.map((subject) => [subject, 0])),
    documentsBySourceBySubject: Object.fromEntries(SUBJECTS.map((subject) => [subject, { historical: 0, challenge: 0 }])),
    itemsBySubject: Object.fromEntries(SUBJECTS.map((subject) => [subject, 0])),
    formalDocumentsBySubject: Object.fromEntries(SUBJECTS.map((subject) => [subject, 0])),
    formalItemsBySubject: Object.fromEntries(SUBJECTS.map((subject) => [subject, 0])),
    itemsBySourceBySubject: Object.fromEntries(SUBJECTS.map((subject) => [subject, { historical: 0, challenge: 0 }])),
    formalItemsBySourceBySubject: Object.fromEntries(SUBJECTS.map((subject) => [subject, { historical: 0, challenge: 0 }])),
    bySource: Object.fromEntries(SOURCES.map((source) => [source, 0])),
    byProfile: {},
  };
  if (!requireObject(bundle, 'dataset', errors)) return { valid: false, errors, summary };
  allowOnly(bundle, ['schemaVersion', 'datasetId', 'profile', 'createdAt', 'documents', 'pageInventoryLock', 'redactionVerification'], 'dataset', errors);
  requireKeys(bundle, ['schemaVersion', 'datasetId', 'profile', 'documents', 'pageInventoryLock', 'redactionVerification'], 'dataset', errors);
  if (bundle.schemaVersion !== DATASET_SCHEMA_VERSION) errors.push(`dataset.schemaVersion must be ${DATASET_SCHEMA_VERSION}.`);
  stableId(bundle.datasetId, 'dataset.datasetId', errors);
  enumValue(bundle.profile, PROFILES, 'dataset.profile', errors);
  if (profile !== undefined && bundle.profile !== profile) errors.push(`dataset.profile ${bundle.profile} does not match requested profile ${profile}.`);
  summary.byProfile[bundle.profile || 'unknown'] = 1;
  if (bundle.createdAt !== undefined && !validDate(bundle.createdAt)) errors.push('dataset.createdAt must be a date-time.');

  const documentIds = new Set();
  const pageIds = new Set();
  const completePageIds = new Set();
  const sampleIds = new Set();
  const records = new Map();
  const documents = arrayValue(bundle.documents, 'dataset.documents', errors);
  summary.documents = documents.length;
  documents.forEach((document, documentIndex) => {
    const dAt = `dataset.documents[${documentIndex}]`;
    if (!requireObject(document, dAt, errors)) return;
    allowOnly(document, ['documentId', 'subject', 'grade', 'sourceType', 'captureType', 'hashes', 'pages'], dAt, errors);
    requireKeys(document, ['documentId', 'subject', 'grade', 'sourceType', 'hashes', 'pages'], dAt, errors);
    stableId(document.documentId, `${dAt}.documentId`, errors);
    if (documentIds.has(document.documentId)) errors.push(`duplicate documentId: ${document.documentId}.`);
    documentIds.add(document.documentId);
    enumValue(document.subject, SUBJECTS, `${dAt}.subject`, errors);
    enumValue(document.sourceType, SOURCES, `${dAt}.sourceType`, errors);
    if (document.captureType !== undefined) enumValue(document.captureType, CAPTURE_TYPES, `${dAt}.captureType`, errors);
    if (typeof document.grade !== 'string' && !Number.isInteger(document.grade)) errors.push(`${dAt}.grade must be a string or integer.`);
    if (SUBJECTS.includes(document.subject)) summary.documentsBySubject[document.subject] += 1;
    // sourceType is inherited by every page/item in a document, so document and item cohort counts are deterministic.
    if (SUBJECTS.includes(document.subject) && SOURCES.includes(document.sourceType)) summary.documentsBySourceBySubject[document.subject][document.sourceType] += 1;
    if (SOURCES.includes(document.sourceType)) summary.bySource[document.sourceType] += 1;
    validateHashes(document, dAt, errors);
    const pages = arrayValue(document.pages, `${dAt}.pages`, errors);
    if (pages.length === 0) errors.push(`${dAt}.pages must contain at least one full page.`);
    const documentFormalEligible = bundle.profile === 'formal'
      && bundle.pageInventoryLock?.locked === true
      && pages.length > 0
      && pages.every((page) => page?.inventoryStatus === 'complete' && bundle.pageInventoryLock?.pageIds?.includes(page.pageId));
    if (documentFormalEligible && SUBJECTS.includes(document.subject)) summary.formalDocumentsBySubject[document.subject] += 1;
    pages.forEach((page, pageIndex) => {
      summary.pages += 1;
      const pAt = `${dAt}.pages[${pageIndex}]`;
      if (!requireObject(page, pAt, errors)) return;
      allowOnly(page, ['pageId', 'pageNumber', 'imageReference', 'inventoryStatus', 'hashes', 'items'], pAt, errors);
      requireKeys(page, ['pageId', 'pageNumber', 'imageReference', 'inventoryStatus', 'hashes', 'items'], pAt, errors);
      stableId(page.pageId, `${pAt}.pageId`, errors);
      if (pageIds.has(page.pageId)) errors.push(`duplicate pageId: ${page.pageId}.`);
      pageIds.add(page.pageId);
      if (!Number.isInteger(page.pageNumber) || page.pageNumber < 1) errors.push(`${pAt}.pageNumber must be a positive integer.`);
      if (typeof page.imageReference !== 'string' || page.imageReference.trim() === '') errors.push(`${pAt}.imageReference must be a non-empty string.`);
      if (bundle.profile === 'fixture' && typeof page.imageReference === 'string' && !page.imageReference.startsWith('fixture://')) errors.push(`${pAt}.imageReference must use fixture:// for fixture data.`);
      enumValue(page.inventoryStatus, ['complete', 'crop_only'], `${pAt}.inventoryStatus`, errors);
      if (page.inventoryStatus === 'complete') completePageIds.add(page.pageId);
      if (bundle.profile === 'formal' && page.inventoryStatus !== 'complete') errors.push(`${pAt} has ${page.inventoryStatus} inventory; formal pages require complete inventory.`);
      const pageFormalEligible = bundle.profile === 'formal'
        && bundle.pageInventoryLock?.locked === true
        && page.inventoryStatus === 'complete'
        && bundle.pageInventoryLock?.pageIds?.includes(page.pageId);
      validateHashes(page, pAt, errors);
      arrayValue(page.items, `${pAt}.items`, errors).forEach((item, itemIndex) => {
        summary.items += 1;
        const iAt = `${pAt}.items[${itemIndex}]`;
        if (!requireObject(item, iAt, errors)) return;
        allowOnly(item, ['sampleId', 'crop', 'composite', 'hashes', 'annotationRefs'], iAt, errors);
        requireKeys(item, ['sampleId', 'crop', 'composite', 'hashes', 'annotationRefs'], iAt, errors);
        stableId(item.sampleId, `${iAt}.sampleId`, errors);
        if (sampleIds.has(item.sampleId)) errors.push(`duplicate sampleId: ${item.sampleId}.`);
        sampleIds.add(item.sampleId);
        validateCrop(item.crop, `${iAt}.crop`, errors);
        const refs = arrayValue(item.annotationRefs, `${iAt}.annotationRefs`, errors);
        refs.forEach((ref, refIndex) => stableId(ref, `${iAt}.annotationRefs[${refIndex}]`, errors));
        if (new Set(refs).size !== refs.length) errors.push(`${iAt}.annotationRefs must be unique.`);
        validateHashes(item, iAt, errors);
        const composite = item.composite;
        if (requireObject(composite, `${iAt}.composite`, errors)) {
          allowOnly(composite, ['role', 'parentSampleId', 'childSampleIds'], `${iAt}.composite`, errors);
          requireKeys(composite, ['role'], `${iAt}.composite`, errors);
          enumValue(composite.role, ['standalone', 'parent', 'child'], `${iAt}.composite.role`, errors);
          if (composite.role === 'child' && !Object.hasOwn(composite, 'parentSampleId')) errors.push(`${iAt}.composite.parentSampleId is required for a child.`);
          if (composite.role === 'parent' && (!Array.isArray(composite.childSampleIds) || composite.childSampleIds.length === 0)) errors.push(`${iAt}.composite.childSampleIds is required for a parent.`);
          if (composite.parentSampleId !== undefined) stableId(composite.parentSampleId, `${iAt}.composite.parentSampleId`, errors);
          const children = composite.childSampleIds === undefined ? [] : arrayValue(composite.childSampleIds, `${iAt}.composite.childSampleIds`, errors);
          children.forEach((child, childIndex) => stableId(child, `${iAt}.composite.childSampleIds[${childIndex}]`, errors));
          if (new Set(children).size !== children.length) errors.push(`${iAt}.composite.childSampleIds must be unique.`);
          if (composite.role === 'parent' && refs.length > 0) errors.push(`${iAt} is a composite parent with annotationRefs and would double-count a parent as scorable.`);
          if (composite.role !== 'parent') {
            summary.scorableItems += 1;
            if (SUBJECTS.includes(document.subject)) {
              summary.itemsBySubject[document.subject] += 1;
              if (SOURCES.includes(document.sourceType)) summary.itemsBySourceBySubject[document.subject][document.sourceType] += 1;
              if (pageFormalEligible) {
                summary.formalEligibleItems += 1;
                summary.formalItemsBySubject[document.subject] += 1;
                if (SOURCES.includes(document.sourceType)) summary.formalItemsBySourceBySubject[document.subject][document.sourceType] += 1;
              }
            }
          }
        }
        records.set(item.sampleId, { item, documentId: document.documentId, pageId: page.pageId, location: iAt });
      });
    });
  });

  const graph = new Map();
  for (const [sampleId, record] of records) {
    const composite = record.item.composite || {};
    const children = Array.isArray(composite.childSampleIds) ? composite.childSampleIds : [];
    graph.set(sampleId, children);
    if (composite.parentSampleId !== undefined) {
      const parent = records.get(composite.parentSampleId);
      if (!parent) errors.push(`${record.location}.composite.parentSampleId ${composite.parentSampleId} does not exist.`);
      else {
        if (parent.documentId !== record.documentId || parent.pageId !== record.pageId) errors.push(`${record.location} composite parent must be in the same document/page.`);
        if (parent.item.composite?.role !== 'parent' || !parent.item.composite.childSampleIds?.includes(sampleId)) errors.push(`${record.location} parent/child composite references are not reciprocal.`);
      }
    }
    for (const childId of children) {
      const child = records.get(childId);
      if (!child) errors.push(`${record.location}.composite.childSampleIds references missing sample ${childId}.`);
      else {
        if (child.documentId !== record.documentId || child.pageId !== record.pageId) errors.push(`${record.location} composite child must be in the same document/page.`);
        if (child.item.composite?.role !== 'child' || child.item.composite.parentSampleId !== sampleId) errors.push(`${record.location} parent/child composite references are not reciprocal.`);
      }
    }
  }
  const visiting = new Set();
  const visited = new Set();
  function visit(id) {
    if (visiting.has(id)) { errors.push(`composite relationship cycle detected at ${id}.`); return; }
    if (visited.has(id)) return;
    visiting.add(id);
    for (const child of graph.get(id) || []) visit(child);
    visiting.delete(id);
    visited.add(id);
  }
  for (const id of graph.keys()) visit(id);

  const lock = bundle.pageInventoryLock;
  if (requireObject(lock, 'dataset.pageInventoryLock', errors)) {
    allowOnly(lock, ['locked', 'pageIds', 'inventoryHash', 'lockedAt'], 'dataset.pageInventoryLock', errors);
    requireKeys(lock, ['locked', 'pageIds', 'inventoryHash'], 'dataset.pageInventoryLock', errors);
    if (typeof lock.locked !== 'boolean') errors.push('dataset.pageInventoryLock.locked must be boolean.');
    if (lock.locked === true && !validDate(lock.lockedAt)) errors.push('dataset.pageInventoryLock.lockedAt is required as a date-time when locked.');
    if (lock.locked === false && lock.lockedAt !== undefined) errors.push('dataset.pageInventoryLock.lockedAt must be absent when unlocked.');
    if (bundle.profile === 'formal' && lock.locked !== true) errors.push('formal datasets require a locked page inventory.');
    if (bundle.profile === 'fixture' && lock.locked !== true) errors.push('fixture datasets require a locked page inventory.');
    const lockedPageIds = arrayValue(lock.pageIds, 'dataset.pageInventoryLock.pageIds', errors);
    lockedPageIds.forEach((id, index) => stableId(id, `dataset.pageInventoryLock.pageIds[${index}]`, errors));
    if (new Set(lockedPageIds).size !== lockedPageIds.length) errors.push('dataset.pageInventoryLock.pageIds must be unique.');
    summary.inventoryEligible = lock.locked === true ? lockedPageIds.filter((id) => completePageIds.has(id)).length : 0;
    for (const id of pageIds) if (!lockedPageIds.includes(id)) errors.push(`page ${id} is outside the locked full page inventory.`);
    for (const id of lockedPageIds) if (!pageIds.has(id)) errors.push(`locked inventory page ${id} does not exist in documents.`);
    const inventoryHash = lock.inventoryHash;
    if (!requireObject(inventoryHash, 'dataset.pageInventoryLock.inventoryHash', errors)) { /* reported */ }
    else {
      allowOnly(inventoryHash, ['algorithm', 'value'], 'dataset.pageInventoryLock.inventoryHash', errors);
      requireKeys(inventoryHash, ['algorithm', 'value'], 'dataset.pageInventoryLock.inventoryHash', errors);
      if (inventoryHash.algorithm !== 'sha256') errors.push('dataset.pageInventoryLock.inventoryHash.algorithm must be sha256.');
      const expected = sha256Canonical(lockedPageIds);
      if (typeof inventoryHash.value !== 'string' || !HASH.test(inventoryHash.value)) errors.push('dataset.pageInventoryLock.inventoryHash.value must be a lowercase SHA-256 hash.');
      else if (inventoryHash.value !== expected) errors.push(`dataset.pageInventoryLock.inventoryHash hash mismatch; expected ${expected}.`);
    }
  }
  const redaction = bundle.redactionVerification;
  if (requireObject(redaction, 'dataset.redactionVerification', errors)) {
    allowOnly(redaction, ['status', 'verifiedAt', 'verifierId', 'notes'], 'dataset.redactionVerification', errors);
    requireKeys(redaction, ['status', 'verifiedAt', 'verifierId'], 'dataset.redactionVerification', errors);
    if (redaction.status !== 'verified') errors.push('dataset redaction status must be verified before import.');
    if (!validDate(redaction.verifiedAt)) errors.push('dataset.redactionVerification.verifiedAt must be a date-time.');
    stableId(redaction.verifierId, 'dataset.redactionVerification.verifierId', errors);
    if (redaction.notes !== undefined) stringValue(redaction.notes, 'dataset.redactionVerification.notes', errors);
  }
  if (bundle.profile === 'formal') {
    for (const subject of SUBJECTS) {
      if (summary.formalDocumentsBySubject[subject] < FORMAL_MINIMUMS.documentsPerSubject) errors.push(`formal documents minimum not met for ${subject}.`);
      if (summary.formalItemsBySubject[subject] < FORMAL_MINIMUMS.itemsPerSubject) errors.push(`formal items minimum not met for ${subject}.`);
      if (summary.formalItemsBySourceBySubject[subject].historical < FORMAL_MINIMUMS.historical) errors.push(`formal historical items minimum not met for ${subject}.`);
      if (summary.formalItemsBySourceBySubject[subject].challenge < FORMAL_MINIMUMS.challenge) errors.push(`formal challenge items minimum not met for ${subject}.`);
    }
  }
  return { valid: errors.length === 0, errors, summary };
}

function validateAttribution(attribution, subject, location, errors) {
  if (!requireObject(attribution, location, errors)) return;
  allowOnly(attribution, ['subject', 'math', 'chinese', 'english'], location, errors);
  requireKeys(attribution, ['subject'], location, errors);
  enumValue(attribution.subject, SUBJECTS, `${location}.subject`, errors);
  if (subject && attribution.subject !== subject) errors.push(`${location}.subject ${attribution.subject} does not match dataset subject ${subject}.`);
  const own = attribution.subject;
  for (const candidate of SUBJECTS) if (candidate !== own && attribution[candidate] !== undefined) errors.push(`${location}.${candidate} is not allowed for subject ${own}.`);
  const payload = attribution[own];
  if (!requireObject(payload, `${location}.${own}`, errors)) return;
  if (own === 'math') {
    allowOnly(payload, ['primaryNodeId', 'primaryNodeLabel', 'bottleneckId', 'bottleneckLabel'], `${location}.math`, errors);
    requireKeys(payload, ['primaryNodeId', 'bottleneckId'], `${location}.math`, errors);
    stableId(payload.primaryNodeId, `${location}.math.primaryNodeId`, errors);
    stableId(payload.bottleneckId, `${location}.math.bottleneckId`, errors);
    if (payload.primaryNodeLabel !== undefined) stringValue(payload.primaryNodeLabel, `${location}.math.primaryNodeLabel`, errors);
    if (payload.bottleneckLabel !== undefined) stringValue(payload.bottleneckLabel, `${location}.math.bottleneckLabel`, errors);
  } else if (own === 'chinese') {
    allowOnly(payload, ['originalItemLocation', 'errorType', 'review', 'migration'], `${location}.chinese`, errors);
    requireKeys(payload, ['originalItemLocation', 'errorType'], `${location}.chinese`, errors);
    for (const key of ['originalItemLocation', 'errorType', 'review', 'migration']) if (payload[key] !== undefined) stringValue(payload[key], `${location}.chinese.${key}`, errors);
  } else if (own === 'english') {
    allowOnly(payload, ['wordIdentity', 'recognitionSpelling', 'stateUpdate'], `${location}.english`, errors);
    requireKeys(payload, ['wordIdentity'], `${location}.english`, errors);
    stringValue(payload.wordIdentity, `${location}.english.wordIdentity`, errors);
    if (payload.recognitionSpelling !== undefined) enumValue(payload.recognitionSpelling, ['recognized-correctly', 'recognized-but-misspelled', 'unreadable'], `${location}.english.recognitionSpelling`, errors);
    if (payload.stateUpdate !== undefined) enumValue(payload.stateUpdate, ['recognition-mastered-spelling-mastered', 'recognition-mastered-spelling-needs-practice', 'no-state-update'], `${location}.english.stateUpdate`, errors);
  }
}

function datasetIndex(dataset) {
  const index = new Map();
  for (const document of dataset?.documents || []) for (const page of document.pages || []) for (const item of page.items || []) {
    index.set(item.sampleId, { documentId: document.documentId, pageId: page.pageId, subject: document.subject, item });
  }
  return index;
}

function validateLabel(label, subject, location, errors) {
  if (!requireObject(label, location, errors)) return;
  allowOnly(label, ['conclusion', 'text', 'attribution', 'labeledBy', 'labeledAt'], location, errors);
  requireKeys(label, ['conclusion', 'attribution', 'labeledBy', 'labeledAt'], location, errors);
  enumValue(label.conclusion, CONCLUSIONS, `${location}.conclusion`, errors);
  if (label.text !== undefined) stringValue(label.text, `${location}.text`, errors);
  stableId(label.labeledBy, `${location}.labeledBy`, errors);
  if (!validDate(label.labeledAt)) errors.push(`${location}.labeledAt must be a date-time.`);
  validateAttribution(label.attribution, subject, `${location}.attribution`, errors);
}

function validateAnnotations(bundle, { dataset } = {}) {
  const errors = [];
  const summary = { total: 0, locked: 0, pending: 0, disputed: 0, qc: 0, adjudication: 0 };
  const index = datasetIndex(dataset);
  if (!requireObject(bundle, 'annotation bundle', errors)) return { valid: false, errors, summary };
  allowOnly(bundle, ['schemaVersion', 'datasetId', 'annotations'], 'annotation bundle', errors);
  requireKeys(bundle, ['schemaVersion', 'datasetId', 'annotations'], 'annotation bundle', errors);
  if (bundle.schemaVersion !== DATASET_SCHEMA_VERSION) errors.push(`annotation bundle.schemaVersion must be ${DATASET_SCHEMA_VERSION}.`);
  if (dataset && bundle.datasetId !== dataset.datasetId) errors.push('annotation bundle.datasetId does not match dataset.');
  const seen = new Set();
  const annotationIds = new Set();
  const annotations = arrayValue(bundle.annotations, 'annotation bundle.annotations', errors);
  summary.total = annotations.length;
  annotations.forEach((annotation, annotationIndex) => {
    const at = `annotations[${annotationIndex}]`;
    let isPending = false;
    if (!requireObject(annotation, at, errors)) return;
    allowOnly(annotation, ['schemaVersion', 'annotationId', 'sampleId', 'preLabel', 'humanLabel', 'lockState', 'review', 'auditEvents'], at, errors);
    requireKeys(annotation, ['schemaVersion', 'annotationId', 'sampleId', 'preLabel', 'humanLabel', 'lockState', 'review', 'auditEvents'], at, errors);
    if (annotation.schemaVersion !== DATASET_SCHEMA_VERSION) errors.push(`${at}.schemaVersion must be ${DATASET_SCHEMA_VERSION}.`);
    stableId(annotation.annotationId, `${at}.annotationId`, errors);
    stableId(annotation.sampleId, `${at}.sampleId`, errors);
    if (annotationIds.has(annotation.annotationId)) errors.push(`duplicate annotationId: ${annotation.annotationId}.`);
    annotationIds.add(annotation.annotationId);
    if (seen.has(annotation.sampleId)) errors.push(`duplicate annotation sampleId: ${annotation.sampleId}.`);
    seen.add(annotation.sampleId);
    const linked = index.get(annotation.sampleId);
    if (!linked) errors.push(`${at}.sampleId ${annotation.sampleId} does not exist in dataset.`);
    validateLabel(annotation.preLabel, linked?.subject, `${at}.preLabel`, errors);
    validateLabel(annotation.humanLabel, linked?.subject, `${at}.humanLabel`, errors);
    const lock = annotation.lockState;
    if (requireObject(lock, `${at}.lockState`, errors)) {
      allowOnly(lock, ['status', 'lockedAt', 'lockedBy'], `${at}.lockState`, errors);
      enumValue(lock.status, ['unlocked', 'locked'], `${at}.lockState.status`, errors);
      if (lock.status === 'locked') {
        summary.locked += 1;
        if (!validDate(lock.lockedAt)) errors.push(`${at}.lockState.lockedAt is required for locked annotations.`);
        stableId(lock.lockedBy, `${at}.lockState.lockedBy`, errors);
      } else {
        isPending = true;
        if (lock.lockedAt !== undefined || lock.lockedBy !== undefined) errors.push(`${at}.lockState is unlocked and cannot retain lockedAt or lockedBy metadata.`);
      }
    }
    const review = annotation.review;
    if (requireObject(review, `${at}.review`, errors)) {
      allowOnly(review, ['reviewerIds', 'qcStatus', 'qcReviewerId', 'qcReviewedAt', 'adjudicationStatus', 'adjudicatorId', 'adjudicationLabel', 'adjudicatedAt', 'disputeStatus', 'disputeReason', 'disputeResolution', 'disputeResolvedBy', 'disputeResolvedAt'], `${at}.review`, errors);
      requireKeys(review, ['reviewerIds', 'qcStatus', 'adjudicationStatus', 'disputeStatus'], `${at}.review`, errors);
      const reviewers = arrayValue(review.reviewerIds, `${at}.review.reviewerIds`, errors);
      reviewers.forEach((id, i) => stableId(id, `${at}.review.reviewerIds[${i}]`, errors));
      if (new Set(reviewers).size !== reviewers.length) errors.push(`${at}.review.reviewerIds must be unique.`);
      enumValue(review.qcStatus, ['pending', 'passed', 'failed'], `${at}.review.qcStatus`, errors);
      enumValue(review.adjudicationStatus, ['not-needed', 'pending', 'resolved'], `${at}.review.adjudicationStatus`, errors);
      enumValue(review.disputeStatus, ['none', 'open', 'resolved'], `${at}.review.disputeStatus`, errors);
      if (review.qcStatus === 'pending') {
        isPending = true;
        if (review.qcReviewerId !== undefined || review.qcReviewedAt !== undefined) errors.push(`${at}.review has pending QC and cannot retain qcReviewerId or qcReviewedAt metadata.`);
      }
      else {
        summary.qc += 1;
        stableId(review.qcReviewerId, `${at}.review.qcReviewerId`, errors);
        if (!validDate(review.qcReviewedAt)) errors.push(`${at}.review.qcReviewedAt is required after QC.`);
      }
      if (review.adjudicationStatus === 'resolved') {
        summary.adjudication += 1;
        stableId(review.adjudicatorId, `${at}.review.adjudicatorId`, errors);
        if (!validDate(review.adjudicatedAt)) errors.push(`${at}.review.adjudicatedAt is required after adjudication.`);
        validateLabel(review.adjudicationLabel, linked?.subject, `${at}.review.adjudicationLabel`, errors);
      }
      if (review.adjudicationStatus === 'pending') isPending = true;
      if (review.adjudicationStatus !== 'resolved' && ['adjudicatorId', 'adjudicationLabel', 'adjudicatedAt'].some((key) => review[key] !== undefined)) errors.push(`${at}.review has ${review.adjudicationStatus} adjudication and cannot retain resolved adjudication metadata.`);
      if (review.disputeStatus !== 'none') summary.disputed += 1;
      if (review.disputeStatus === 'open' && !(typeof review.disputeReason === 'string' && review.disputeReason.trim())) errors.push(`${at}.review.disputeReason is required for an open dispute.`);
      if (review.disputeStatus === 'open' && ['disputeResolution', 'disputeResolvedBy', 'disputeResolvedAt'].some((key) => review[key] !== undefined)) errors.push(`${at}.review has an open dispute and cannot retain resolution metadata.`);
      if (review.disputeStatus === 'none' && ['disputeReason', 'disputeResolution', 'disputeResolvedBy', 'disputeResolvedAt'].some((key) => review[key] !== undefined)) errors.push(`${at}.review disputeStatus none cannot retain dispute metadata.`);
      if (review.disputeStatus === 'resolved') {
        if (!(typeof review.disputeResolution === 'string' && review.disputeResolution.trim())) errors.push(`${at}.review.disputeResolution is required.`);
        stableId(review.disputeResolvedBy, `${at}.review.disputeResolvedBy`, errors);
        if (!validDate(review.disputeResolvedAt)) errors.push(`${at}.review.disputeResolvedAt is required.`);
      }
    }
    const events = arrayValue(annotation.auditEvents, `${at}.auditEvents`, errors);
    const eventTypes = new Set();
    const eventIds = new Set();
    events.forEach((event, eventIndex) => {
      const eAt = `${at}.auditEvents[${eventIndex}]`;
      if (!requireObject(event, eAt, errors)) return;
      allowOnly(event, ['eventId', 'eventType', 'actorId', 'timestamp', 'details'], eAt, errors);
      requireKeys(event, ['eventId', 'eventType', 'actorId', 'timestamp'], eAt, errors);
      stableId(event.eventId, `${eAt}.eventId`, errors);
      stableId(event.actorId, `${eAt}.actorId`, errors);
      enumValue(event.eventType, ['created', 'pre-labeled', 'human-labeled', 'reviewed', 'qc-checked', 'disputed', 'adjudicated', 'locked', 'unlocked'], `${eAt}.eventType`, errors);
      if (!validDate(event.timestamp)) errors.push(`${eAt}.timestamp must be a date-time.`);
      if (event.details !== undefined && !isObject(event.details)) errors.push(`${eAt}.details must be an object.`);
      if (eventIds.has(event.eventId)) errors.push(`${at} has duplicate audit eventId ${event.eventId}.`);
      eventIds.add(event.eventId); eventTypes.add(event.eventType);
    });
    const latestLockEvent = latestAuditEvent(events, ['locked', 'unlocked']);
    if (lock?.status === 'locked') {
      if (!latestLockEvent || latestLockEvent.eventType !== 'locked') errors.push(`${at} current locked state requires the latest lock lifecycle event to be locked.`);
      else {
        if (latestLockEvent.actorId !== lock.lockedBy) errors.push(`${at} latest locked audit actor must match lockState.lockedBy.`);
        if (latestLockEvent.timestamp !== lock.lockedAt) errors.push(`${at} latest locked audit timestamp must match lockState.lockedAt.`);
      }
    }
    if (lock?.status === 'unlocked' && eventTypes.has('locked') && (!latestLockEvent || latestLockEvent.eventType !== 'unlocked')) errors.push(`${at} latest lock lifecycle event must be unlocked after a prior lock.`);

    const latestQcEvent = latestAuditEvent(events, ['qc-checked']);
    if (review?.qcStatus && review.qcStatus !== 'pending') {
      if (!latestQcEvent) errors.push(`${at} has completed QC but no qc-checked audit event.`);
      else {
        if (latestQcEvent.actorId !== review.qcReviewerId) errors.push(`${at} latest QC audit actor must match review.qcReviewerId.`);
        if (latestQcEvent.timestamp !== review.qcReviewedAt) errors.push(`${at} latest QC audit timestamp must match review.qcReviewedAt.`);
      }
    }
    if (review?.qcStatus === 'pending' && latestQcEvent) errors.push(`${at} has pending QC but includes a completed qc-checked audit event.`);

    const latestAdjudicationEvent = latestAuditEvent(events, ['adjudicated']);
    if (review?.adjudicationStatus === 'resolved') {
      if (!latestAdjudicationEvent) errors.push(`${at} is adjudicated but has no adjudicated audit event.`);
      else {
        if (latestAdjudicationEvent.actorId !== review.adjudicatorId) errors.push(`${at} latest adjudication audit actor must match review.adjudicatorId.`);
        if (latestAdjudicationEvent.timestamp !== review.adjudicatedAt) errors.push(`${at} latest adjudication audit timestamp must match review.adjudicatedAt.`);
      }
    }
    if (review?.adjudicationStatus && review.adjudicationStatus !== 'resolved' && latestAdjudicationEvent) errors.push(`${at} has ${review.adjudicationStatus} adjudication but includes an adjudicated audit event.`);

    const latestDisputeEvent = latestAuditEvent(events, ['disputed']);
    if (review?.disputeStatus !== 'none' && !latestDisputeEvent) errors.push(`${at} has dispute state but no disputed audit event.`);
    if (review?.disputeStatus === 'none' && latestDisputeEvent) errors.push(`${at} has disputeStatus none but includes a disputed audit event.`);
    if (review?.disputeStatus === 'resolved' && latestDisputeEvent) {
      if (latestDisputeEvent.actorId !== review.disputeResolvedBy) errors.push(`${at} latest dispute audit actor must match review.disputeResolvedBy.`);
      if (latestDisputeEvent.timestamp !== review.disputeResolvedAt) errors.push(`${at} latest dispute audit timestamp must match review.disputeResolvedAt.`);
    }
    if (isPending) summary.pending += 1;
  });
  return { valid: errors.length === 0, errors, summary };
}

function validateRunManifest(manifest) {
  const errors = [];
  const summary = { total: 0, success: 0, failure: 0, unresolved: 0, retry: 0 };
  if (!requireObject(manifest, 'run manifest', errors)) return { valid: false, errors, summary };
  allowOnly(manifest, ['schemaVersion', 'runId', 'gitCommit', 'versions', 'configuration', 'timestamps', 'counts', 'status', 'outputReferences', 'usage'], 'run manifest', errors);
  requireKeys(manifest, ['schemaVersion', 'runId', 'gitCommit', 'versions', 'configuration', 'timestamps', 'counts', 'status', 'outputReferences', 'usage'], 'run manifest', errors);
  if (manifest.schemaVersion !== DATASET_SCHEMA_VERSION) errors.push(`run manifest.schemaVersion must be ${DATASET_SCHEMA_VERSION}.`);
  stableId(manifest.runId, 'run manifest.runId', errors);
  if (typeof manifest.gitCommit !== 'string' || !/^[a-f0-9]{7,64}$/iu.test(manifest.gitCommit)) errors.push('run manifest.gitCommit must be a 7-64 character hexadecimal code version.');
  const versions = manifest.versions;
  if (requireObject(versions, 'run manifest.versions', errors)) {
    const versionKeys = ['dataset', 'scorer', 'model', 'prompt', 'adapter'];
    requireKeys(versions, versionKeys, 'run manifest.versions', errors);
    for (const key of versionKeys) if (typeof versions[key] !== 'string' || versions[key].trim() === '') errors.push(`run manifest.versions.${key} must be non-empty version metadata.`);
    for (const key of Object.keys(versions)) if (!versionKeys.includes(key)) errors.push(`run manifest.versions has unknown key ${key}.`);
  }
  if (!isObject(manifest.configuration)) errors.push('run manifest.configuration must be an object.');
  const timestamps = manifest.timestamps;
  if (requireObject(timestamps, 'run manifest.timestamps', errors)) {
    allowOnly(timestamps, ['createdAt', 'startedAt', 'completedAt'], 'run manifest.timestamps', errors);
    requireKeys(timestamps, ['createdAt', 'startedAt'], 'run manifest.timestamps', errors);
    for (const key of ['createdAt', 'startedAt']) if (!validDate(timestamps[key])) errors.push(`run manifest.timestamps.${key} must be a date-time.`);
    if (timestamps.completedAt !== undefined && !validDate(timestamps.completedAt)) errors.push('run manifest.timestamps.completedAt must be a date-time.');
    if (validDate(timestamps.createdAt) && validDate(timestamps.startedAt) && Date.parse(timestamps.startedAt) < Date.parse(timestamps.createdAt)) errors.push('run manifest startedAt cannot precede createdAt.');
    if (validDate(timestamps.startedAt) && validDate(timestamps.completedAt) && Date.parse(timestamps.completedAt) < Date.parse(timestamps.startedAt)) errors.push('run manifest completedAt cannot precede startedAt.');
  }
  const countKeys = ['total', 'success', 'failure', 'unresolved', 'retry'];
  const counts = manifest.counts;
  if (requireObject(counts, 'run manifest.counts', errors)) {
    requireKeys(counts, countKeys, 'run manifest.counts', errors);
    for (const key of Object.keys(counts)) if (!countKeys.includes(key)) errors.push(`run manifest has unknown count key ${key}.`);
    for (const key of countKeys) {
      if (!Number.isInteger(counts[key]) || counts[key] < 0) errors.push(`run manifest.counts.${key} must be a nonnegative integer.`);
      else summary[key] = counts[key];
    }
    if (Number.isInteger(counts.total) && Number.isInteger(counts.success) && Number.isInteger(counts.failure) && Number.isInteger(counts.unresolved)
      && counts.total !== counts.success + counts.failure + counts.unresolved) errors.push('run manifest.counts.total must equal success + failure + unresolved.');
    if (Number.isInteger(counts.retry) && Number.isInteger(counts.total) && counts.retry > counts.total) errors.push('run manifest.counts.retry cannot exceed total because phase one permits at most one retry per record.');
  }
  enumValue(manifest.status, ['created', 'running', 'completed', 'completed-with-errors', 'failed', 'cancelled'], 'run manifest.status', errors);
  if (manifest.status === 'completed' && (summary.failure > 0 || summary.unresolved > 0)) errors.push('completed run cannot have failure or unresolved counts.');
  if (manifest.status === 'completed-with-errors' && summary.failure + summary.unresolved === 0) errors.push('completed-with-errors run must report failures or unresolved records.');
  if (manifest.status === 'failed' && summary.failure === 0) errors.push('failed run must report a failure count.');
  if (manifest.status === 'created' && [summary.total, summary.success, summary.failure, summary.unresolved, summary.retry].some((count) => count !== 0)) errors.push('created run status requires all counts to be zero.');
  if (['created', 'running'].includes(manifest.status) && timestamps?.completedAt !== undefined) errors.push(`${manifest.status} run status cannot include completedAt.`);
  if (['completed', 'completed-with-errors', 'failed', 'cancelled'].includes(manifest.status) && !validDate(timestamps?.completedAt)) errors.push(`terminal status ${manifest.status} requires completedAt.`);
  const refs = arrayValue(manifest.outputReferences, 'run manifest.outputReferences', errors);
  if (new Set(refs).size !== refs.length || refs.some((ref) => typeof ref !== 'string' || ref.trim() === '')) errors.push('run manifest.outputReferences must contain unique non-empty strings.');
  const usage = manifest.usage;
  if (requireObject(usage, 'run manifest.usage', errors)) {
    allowOnly(usage, ['inputTokens', 'outputTokens', 'requests', 'currency', 'estimatedCost', 'providerMetadata'], 'run manifest.usage', errors);
    requireKeys(usage, ['currency', 'estimatedCost'], 'run manifest.usage', errors);
    if (typeof usage.currency !== 'string' || !/^[A-Z]{3}$/u.test(usage.currency)) errors.push('run manifest.usage.currency must be a three-letter uppercase code.');
    if (typeof usage.estimatedCost !== 'number' || !Number.isFinite(usage.estimatedCost) || usage.estimatedCost < 0) errors.push('run manifest.usage.estimatedCost must be nonnegative.');
    for (const key of ['inputTokens', 'outputTokens', 'requests']) if (usage[key] !== undefined && (!Number.isInteger(usage[key]) || usage[key] < 0)) errors.push(`run manifest.usage.${key} must be a nonnegative integer.`);
    if (usage.providerMetadata !== undefined && !isObject(usage.providerMetadata)) errors.push('run manifest.usage.providerMetadata must be an object.');
  }
  return { valid: errors.length === 0, errors, summary };
}

function validateSystemOutput(bundle, { dataset, runManifest } = {}) {
  const errors = [];
  const summary = { total: 0, success: 0, failure: 0, bySubject: Object.fromEntries(SUBJECTS.map((s) => [s, { success: 0, failure: 0 }])) };
  const index = datasetIndex(dataset);
  if (!requireObject(bundle, 'system output bundle', errors)) return { valid: false, errors, summary };
  allowOnly(bundle, ['schemaVersion', 'runId', 'records'], 'system output bundle', errors);
  requireKeys(bundle, ['schemaVersion', 'runId', 'records'], 'system output bundle', errors);
  if (bundle.schemaVersion !== DATASET_SCHEMA_VERSION) errors.push(`system output bundle.schemaVersion must be ${DATASET_SCHEMA_VERSION}.`);
  stableId(bundle.runId, 'system output bundle.runId', errors);
  if (runManifest && bundle.runId !== runManifest.runId) errors.push('system output runId does not match run manifest.');
  const manifestValidation = runManifest ? validateRunManifest(runManifest) : null;
  if (manifestValidation && !manifestValidation.valid) errors.push(...manifestValidation.errors.map((error) => `run manifest: ${error}`));
  const seen = new Set();
  const records = arrayValue(bundle.records, 'system output bundle.records', errors);
  summary.total = records.length;
  records.forEach((record, recordIndex) => {
    const at = `records[${recordIndex}]`;
    if (!requireObject(record, at, errors)) return;
    allowOnly(record, ['schemaVersion', 'runId', 'documentId', 'pageId', 'sampleId', 'status', 'prediction', 'failures'], at, errors);
    requireKeys(record, ['schemaVersion', 'runId', 'documentId', 'pageId', 'sampleId', 'status', 'failures'], at, errors);
    if (record.schemaVersion !== DATASET_SCHEMA_VERSION) errors.push(`${at}.schemaVersion must be ${DATASET_SCHEMA_VERSION}.`);
    for (const key of ['runId', 'documentId', 'pageId', 'sampleId']) stableId(record[key], `${at}.${key}`, errors);
    if (record.runId !== bundle.runId) errors.push(`${at}.runId does not match output bundle.`);
    if (seen.has(record.sampleId)) errors.push(`duplicate prediction/sample record for ${record.sampleId}.`);
    seen.add(record.sampleId);
    const linked = index.get(record.sampleId);
    if (!linked) errors.push(`${at}.sampleId ${record.sampleId} does not exist in dataset.`);
    else {
      if (record.documentId !== linked.documentId) errors.push(`${at}.documentId creates an impossible cross-document link for ${record.sampleId}.`);
      if (record.pageId !== linked.pageId) errors.push(`${at}.pageId does not match dataset page for ${record.sampleId}.`);
    }
    enumValue(record.status, ['success', 'failed'], `${at}.status`, errors);
    const failures = arrayValue(record.failures, `${at}.failures`, errors);
    if (record.status === 'success') {
      summary.success += 1;
      if (!isObject(record.prediction)) errors.push(`${at} succeeded but has no prediction.`);
      if (failures.length !== 0) errors.push(`${at} succeeded but reports failures.`);
    } else if (record.status === 'failed') {
      summary.failure += 1;
      if (Object.hasOwn(record, 'prediction')) errors.push(`${at} failed but includes a fabricated prediction.`);
      if (failures.length === 0) errors.push(`${at} failed but has no failure details.`);
    }
    if (linked && (record.status === 'success' || record.status === 'failed')) summary.bySubject[linked.subject][record.status === 'success' ? 'success' : 'failure'] += 1;
    failures.forEach((failure, failureIndex) => {
      const fAt = `${at}.failures[${failureIndex}]`;
      if (!requireObject(failure, fAt, errors)) return;
      allowOnly(failure, ['code', 'stage', 'message', 'retryable', 'details'], fAt, errors);
      requireKeys(failure, ['code', 'stage', 'message', 'retryable'], fAt, errors);
      if (typeof failure.code !== 'string' || failure.code.trim() === '') errors.push(`${fAt}.code must be non-empty.`);
      enumValue(failure.stage, ['load', 'model', 'parse', 'localize', 'classify', 'attribute', 'persist'], `${fAt}.stage`, errors);
      if (typeof failure.message !== 'string') errors.push(`${fAt}.message must be a string.`);
      if (typeof failure.retryable !== 'boolean') errors.push(`${fAt}.retryable must be boolean.`);
      if (failure.details !== undefined && !isObject(failure.details)) errors.push(`${fAt}.details must be an object.`);
    });
    if (isObject(record.prediction)) {
      const prediction = record.prediction;
      allowOnly(prediction, ['localization', 'text', 'conclusion', 'attribution', 'confidence'], `${at}.prediction`, errors);
      requireKeys(prediction, ['localization', 'text', 'conclusion', 'attribution'], `${at}.prediction`, errors);
      validateCrop(prediction.localization, `${at}.prediction.localization`, errors);
      if (typeof prediction.text !== 'string') errors.push(`${at}.prediction.text must be a string.`);
      enumValue(prediction.conclusion, CONCLUSIONS, `${at}.prediction.conclusion`, errors);
      validateAttribution(prediction.attribution, linked?.subject, `${at}.prediction.attribution`, errors);
      if (prediction.confidence !== undefined && (typeof prediction.confidence !== 'number' || !Number.isFinite(prediction.confidence) || prediction.confidence < 0 || prediction.confidence > 1)) errors.push(`${at}.prediction.confidence must be between 0 and 1.`);
    }
  });
  if (runManifest && Number.isInteger(runManifest.counts?.success) && runManifest.counts.success !== summary.success) errors.push(`system output success count ${summary.success} does not match run manifest ${runManifest.counts.success}.`);
  if (runManifest && Number.isInteger(runManifest.counts?.failure) && runManifest.counts.failure !== summary.failure) errors.push(`system output failure count ${summary.failure} does not match run manifest ${runManifest.counts.failure}.`);
  if (runManifest && Number.isInteger(runManifest.counts?.success) && Number.isInteger(runManifest.counts?.failure)) {
    const expectedRawRecords = runManifest.counts.success + runManifest.counts.failure;
    if (records.length !== expectedRawRecords) errors.push(`system output record count ${records.length} must equal run manifest success + failure (${expectedRawRecords}).`);
  }
  return { valid: errors.length === 0, errors, summary };
}

module.exports = {
  canonicalJson,
  sha256Canonical,
  validateAnnotations,
  validateDataset,
  validateRunManifest,
  validateSystemOutput,
};

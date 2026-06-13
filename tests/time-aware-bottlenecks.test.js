const test = require('node:test')
const assert = require('node:assert/strict')

const { buildProfileSummary } = require('../cloudfunctions/analyzePhotos/profile-summary')

const T1 = new Date('2026-06-01T00:00:00.000Z')
const T2 = new Date('2026-06-08T00:00:00.000Z')
const T3 = new Date('2026-06-15T00:00:00.000Z')

test('new diagnosis creates a new trend with first and last seen time', () => {
  const result = buildProfileSummary({}, {
    _id: 'report-1',
    type: 'diagnosis',
    bottlenecks: [{ lpCode: 'LP-001', lpName: '计算基础', errorCount: 2 }]
  }, T1)
  const item = result.currentBottlenecks[0]

  assert.equal(item.trend, 'new')
  assert.equal(item.evidenceCount, 1)
  assert.equal(item.recentErrorCount, 2)
  assert.equal(new Date(item.firstSeenAt).getTime(), T1.getTime())
  assert.equal(new Date(item.lastSeenAt).getTime(), T1.getTime())
  assert.ok(item.weight >= 0 && item.weight <= 100)
})

test('repeated diagnosis creates a persisting trend and raises weight', () => {
  const result = buildProfileSummary({
    currentBottlenecks: [{
      lpCode: 'LP-001',
      lpName: '计算基础',
      status: 'needs_verification',
      trend: 'new',
      evidenceCount: 1,
      recentErrorCount: 2,
      weight: 60,
      firstSeenAt: T1,
      lastSeenAt: T1
    }]
  }, {
    _id: 'report-2',
    type: 'diagnosis',
    bottlenecks: [{ lpCode: 'LP-001', lpName: '计算基础', errorCount: 3 }]
  }, T2)
  const item = result.currentBottlenecks[0]

  assert.equal(item.trend, 'persisting')
  assert.equal(item.status, 'persisting')
  assert.equal(item.evidenceCount, 2)
  assert.equal(item.recentErrorCount, 3)
  assert.equal(item.weight, 80)
  assert.equal(new Date(item.firstSeenAt).getTime(), T1.getTime())
  assert.equal(new Date(item.lastSeenAt).getTime(), T2.getTime())
})

test('one passed verification creates a declining trend', () => {
  const result = buildProfileSummary({
    currentBottlenecks: [{
      lpCode: 'LP-001',
      lpName: '计算基础',
      status: 'persisting',
      trend: 'persisting',
      verificationPassCount: 0,
      weight: 80
    }]
  }, {
    _id: 'report-3',
    type: 'verification',
    verificationTargets: ['LP-001'],
    verificationEvidence: [{ lpCode: 'LP-001', complete: true, allCorrect: true }]
  }, T2)
  const item = result.currentBottlenecks[0]

  assert.equal(item.status, 'improved')
  assert.equal(item.trend, 'declining')
  assert.equal(item.verificationPassCount, 1)
  assert.equal(new Date(item.lastVerifiedAt).getTime(), T2.getTime())
  assert.equal(new Date(item.lastPassedAt).getTime(), T2.getTime())
})

test('two passed verifications create an improved trend', () => {
  const result = buildProfileSummary({
    currentBottlenecks: [{
      lpCode: 'LP-001',
      lpName: '计算基础',
      status: 'improved',
      trend: 'declining',
      verificationPassCount: 1,
      weight: 50,
      lastPassedAt: T2
    }]
  }, {
    _id: 'report-4',
    type: 'verification',
    verificationTargets: ['LP-001'],
    verificationEvidence: [{ lpCode: 'LP-001', complete: true, allCorrect: true }]
  }, T3)
  const item = result.currentBottlenecks[0]

  assert.equal(item.status, 'improved')
  assert.equal(item.trend, 'improved')
  assert.equal(item.verificationPassCount, 2)
  assert.ok(item.weight < 50)
})

test('improved bottleneck seen again creates a recurring trend and weights clamp', () => {
  const result = buildProfileSummary({
    currentBottlenecks: [{
      lpCode: 'LP-001',
      lpName: '计算基础',
      status: 'improved',
      trend: 'improved',
      weight: 95,
      verificationPassCount: 2
    }]
  }, {
    _id: 'report-5',
    type: 'diagnosis',
    bottlenecks: [{ lpCode: 'LP-001', lpName: '计算基础', errorCount: 6 }]
  }, T3)
  const item = result.currentBottlenecks[0]

  assert.equal(item.status, 'persisting')
  assert.equal(item.trend, 'recurring')
  assert.equal(item.weight, 100)
})

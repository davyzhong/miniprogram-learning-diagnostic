const test = require('node:test')
const assert = require('node:assert/strict')

const {
  buildProfileSummary,
  isEffectiveReport
} = require('../cloudfunctions/analyzePhotos/profile-summary')

const NOW = new Date('2026-06-12T00:00:00.000Z')

test('first effective discovery becomes needs verification', () => {
  const result = buildProfileSummary({}, {
    _id: 'report-1',
    type: 'diagnosis',
    bottlenecks: [{ lpCode: 'LP-001', lpName: '分数运算', severity: 'high', errorCount: 2 }]
  }, NOW)

  assert.equal(result.isEffective, true)
  assert.equal(result.currentBottlenecks[0].status, 'needs_verification')
  assert.equal(result.changeSummary, '发现分数运算卡点')
  assert.match(result.currentSummary, /分数运算/)
})

test('a bottleneck found in another effective report becomes persisting', () => {
  const result = buildProfileSummary({
    currentBottlenecks: [{
      lpCode: 'LP-001',
      lpName: '分数运算',
      status: 'needs_verification',
      firstSeenAt: new Date('2026-06-01T00:00:00.000Z'),
      lastSeenAt: new Date('2026-06-01T00:00:00.000Z'),
      sourceReportId: 'report-old'
    }]
  }, {
    _id: 'report-2',
    type: 'diagnosis',
    bottlenecks: [{ lpCode: 'LP-001', lpName: '分数运算', severity: 'high', errorCount: 1 }]
  }, NOW)

  assert.equal(result.currentBottlenecks[0].status, 'persisting')
  assert.equal(result.currentBottlenecks[0].sourceReportId, 'report-2')
  assert.equal(result.changeSummary, '分数运算再次出现')
})

test('only explicit complete verification evidence marks a target improved', () => {
  const previous = {
    currentBottlenecks: [{
      lpCode: 'LP-001',
      lpName: '分数运算',
      status: 'persisting',
      sourceReportId: 'report-old'
    }]
  }
  const withoutEvidence = buildProfileSummary(previous, {
    _id: 'report-2',
    type: 'verification',
    bottlenecks: [],
    verificationTargets: ['LP-001']
  }, NOW)
  const withEvidence = buildProfileSummary(previous, {
    _id: 'report-3',
    type: 'verification',
    bottlenecks: [],
    verificationTargets: ['LP-001'],
    verificationEvidence: [{
      lpCode: 'LP-001',
      complete: true,
      allCorrect: true
    }]
  }, NOW)

  assert.equal(withoutEvidence.currentBottlenecks[0].status, 'persisting')
  assert.equal(withEvidence.currentBottlenecks[0].status, 'improved')
  assert.equal(withEvidence.changeSummary, '分数运算已有改善')
})

test('an improved bottleneck that appears again becomes persisting', () => {
  const result = buildProfileSummary({
    currentBottlenecks: [{
      lpCode: 'LP-001',
      lpName: '分数运算',
      status: 'improved',
      sourceReportId: 'report-old'
    }]
  }, {
    _id: 'report-2',
    type: 'diagnosis',
    bottlenecks: [{ lpCode: 'LP-001', lpName: '分数运算', errorCount: 1 }]
  }, NOW)

  assert.equal(result.currentBottlenecks[0].status, 'persisting')
  assert.equal(result.changeSummary, '分数运算再次出现')
})

test('ineffective reports preserve the current diagnosis', () => {
  const profile = {
    currentSummary: '已有结论',
    currentBottlenecks: [{ lpCode: 'LP-001', lpName: '分数运算', status: 'persisting' }]
  }
  const result = buildProfileSummary(profile, {
    _id: 'report-2',
    type: 'diagnosis',
    bottlenecks: [],
    totalErrors: 0,
    allPhotosDuplicate: true
  }, NOW)

  assert.equal(result.isEffective, false)
  assert.equal(result.currentSummary, '已有结论')
  assert.equal(result.currentBottlenecks[0].lpCode, 'LP-001')
  assert.equal(result.currentBottlenecks[0].status, 'persisting')
  assert.equal(result.currentBottlenecks[0].trend, 'persisting')
  assert.equal(result.changeSummary, '本次未产生新的诊断结论')
})

test('effective report requires a usable discovery or explicit verification evidence', () => {
  assert.equal(isEffectiveReport({ bottlenecks: [], totalErrors: 0 }), false)
  assert.equal(isEffectiveReport({ bottlenecks: [{ lpCode: 'LP-001' }], totalErrors: 1 }), true)
  assert.equal(isEffectiveReport({
    bottlenecks: [],
    totalErrors: 0,
    verificationEvidence: [{ lpCode: 'LP-001', complete: true, allCorrect: true }]
  }), true)
})

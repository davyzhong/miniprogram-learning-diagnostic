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

test('diagnosis merges accumulate real related errors without counting verification reports', () => {
  const first = buildProfileSummary({}, {
    _id: 'diagnosis-1',
    type: 'diagnosis',
    bottlenecks: [{ lpCode: 'LP-001', lpName: '分数运算', errorCount: 2 }]
  }, new Date('2026-06-01T00:00:00.000Z'))
  const recurrence = buildProfileSummary(first, {
    _id: 'diagnosis-2',
    type: 'diagnosis',
    bottlenecks: [{ lpCode: 'LP-001', lpName: '分数运算', errorCount: 3 }]
  }, new Date('2026-06-05T00:00:00.000Z'))
  const verificationOnly = buildProfileSummary(recurrence, {
    _id: 'verification-1',
    type: 'verification',
    bottlenecks: [{ lpCode: 'LP-001', lpName: '分数运算', errorCount: 1 }],
    verificationTargets: ['LP-001'],
    verificationEvidence: [{ lpCode: 'LP-001', evidenceStatus: 'failed' }]
  }, NOW)
  const normalizedLegacy = buildProfileSummary({
    currentBottlenecks: [{ lpCode: 'LP-002', lpName: '旧卡点', status: 'persisting' }]
  }, {
    _id: 'duplicate',
    type: 'diagnosis',
    allPhotosDuplicate: true,
    bottlenecks: []
  }, NOW)

  assert.equal(first.currentBottlenecks[0].cumulativeErrorCount, 2)
  assert.equal(recurrence.currentBottlenecks[0].cumulativeErrorCount, 5)
  assert.equal(verificationOnly.currentBottlenecks[0].cumulativeErrorCount, 5)
  assert.equal(normalizedLegacy.currentBottlenecks[0].cumulativeErrorCount, 0)
})

test('analyze and reanalysis profile mergers keep cumulative error behavior aligned', () => {
  const reanalysis = require('../cloudfunctions/reanalyzeMathHistory/profile-summary')
  const report = {
    _id: 'diagnosis-shared',
    type: 'diagnosis',
    bottlenecks: [{ lpCode: 'LP-001', lpName: '分数运算', relatedErrorCount: 4 }]
  }

  assert.deepEqual(
    reanalysis.buildProfileSummary({}, report, NOW).currentBottlenecks,
    buildProfileSummary({}, report, NOW).currentBottlenecks
  )
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

test('chinese diagnosis tracks concrete review items separately from coarse bottlenecks', () => {
  const result = buildProfileSummary({
    subject: 'chinese',
    currentBottlenecks: [],
    chineseReviewItems: []
  }, {
    _id: 'report-chinese-1',
    subject: 'chinese',
    type: 'diagnosis',
    bottlenecks: [{ lpCode: 'LP-101', lpName: '识字词语', severity: 'high', errorCount: 1 }],
    chineseErrorItems: [{
      itemId: 'CHI-WORD-BIANLUN',
      itemType: 'word',
      targetText: '辩论',
      expectedAnswer: '辩论',
      studentAnswer: '辨论',
      sourceContext: '看拼音写词语：biàn lùn',
      mistakeType: '形近字混淆',
      verificationMethods: ['pinyin_to_word', 'dictation'],
      relatedLpCode: 'LP-101'
    }]
  }, NOW)

  assert.equal(result.currentBottlenecks[0].lpCode, 'LP-101')
  assert.deepEqual(result.chineseReviewItems.map(item => ({
    itemId: item.itemId,
    itemType: item.itemType,
    targetText: item.targetText,
    expectedAnswer: item.expectedAnswer,
    lastWrongAnswer: item.lastWrongAnswer,
    status: item.status,
    evidenceCount: item.evidenceCount,
    reviewPassCount: item.reviewPassCount,
    reviewFailCount: item.reviewFailCount,
    intervalLevel: item.intervalLevel,
    relatedLpCode: item.relatedLpCode,
    sourceReportId: item.sourceReportId
  })), [{
    itemId: 'CHI-WORD-BIANLUN',
    itemType: 'word',
    targetText: '辩论',
    expectedAnswer: '辩论',
    lastWrongAnswer: '辨论',
    status: 'needs_review',
    evidenceCount: 1,
    reviewPassCount: 0,
    reviewFailCount: 0,
    intervalLevel: 0,
    relatedLpCode: 'LP-101',
    sourceReportId: 'report-chinese-1'
  }])
})

test('chinese verification evidence updates the concrete review item status', () => {
  const result = buildProfileSummary({
    subject: 'chinese',
    currentBottlenecks: [{
      lpCode: 'LP-101',
      lpName: '识字词语',
      status: 'needs_verification'
    }],
    chineseReviewItems: [{
      itemId: 'CHI-WORD-BIANLUN',
      itemType: 'word',
      targetText: '辩论',
      expectedAnswer: '辩论',
      lastWrongAnswer: '辨论',
      status: 'needs_review',
      evidenceCount: 1,
      reviewPassCount: 0,
      reviewFailCount: 0,
      intervalLevel: 0,
      relatedLpCode: 'LP-101'
    }]
  }, {
    _id: 'report-chinese-verification',
    subject: 'chinese',
    type: 'verification',
    bottlenecks: [],
    verificationTargets: ['LP-101'],
    verificationEvidence: [{
      lpCode: 'LP-101',
      complete: true,
      allCorrect: true
    }],
    chineseReviewEvidence: [{
      itemId: 'CHI-WORD-BIANLUN',
      targetText: '辩论',
      evidenceStatus: 'passed',
      complete: true,
      allCorrect: true
    }]
  }, NOW)

  assert.equal(result.chineseReviewItems[0].status, 'reviewing')
  assert.equal(result.chineseReviewItems[0].reviewPassCount, 1)
  assert.equal(result.chineseReviewItems[0].reviewFailCount, 0)
  assert.equal(result.chineseReviewItems[0].intervalLevel, 1)
  assert.equal(result.chineseReviewItems[0].sourceReportId, 'report-chinese-verification')
})

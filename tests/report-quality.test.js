const test = require('node:test')
const assert = require('node:assert/strict')

const { buildReportQuality } = require('../cloudfunctions/analyzePhotos/report-quality')

test('marks normal evidence-rich diagnosis reports as usable high quality', () => {
  const quality = buildReportQuality({
    uniquePages: [{ ocrSummary: '第1页有清晰题目和批改' }, { ocrSummary: '第2页有错题' }],
    merged: {
      totalErrors: 4,
      bottlenecks: [{ lpCode: 'LP-001', errorCount: 4 }]
    },
    failedBatches: []
  })

  assert.equal(quality.level, 'high')
  assert.equal(quality.status, 'usable')
  assert.equal(quality.score, 90)
  assert.match(quality.sampleSummary, /2 张有效照片/)
})

test('marks partial batch failures and weak evidence as needs review', () => {
  const quality = buildReportQuality({
    uniquePages: [{ ocrSummary: '仅一页清晰' }],
    merged: {
      totalErrors: 1,
      bottlenecks: [{ lpCode: 'LP-001', errorCount: 1 }]
    },
    failedBatches: [{ batchIndex: 1 }]
  })

  assert.equal(quality.level, 'medium')
  assert.equal(quality.status, 'needs_review')
  assert.ok(quality.reasons.some(reason => /部分照片/.test(reason)))
})

test('marks duplicate-only and no-evidence reports as insufficient', () => {
  assert.equal(buildReportQuality({
    allPhotosDuplicate: true,
    uniquePages: [],
    merged: { totalErrors: 0, bottlenecks: [] },
    failedBatches: []
  }).status, 'insufficient')

  const noEvidence = buildReportQuality({
    uniquePages: [{ ocrSummary: '' }],
    merged: { totalErrors: 0, bottlenecks: [] },
    failedBatches: []
  })

  assert.equal(noEvidence.level, 'low')
  assert.equal(noEvidence.status, 'insufficient')
})

test('marks unclear verification evidence as insufficient', () => {
  const quality = buildReportQuality({
    uniquePages: [{ ocrSummary: '验证卷作答照片' }],
    merged: {
      totalErrors: 0,
      bottlenecks: [],
      verificationEvidence: [{
        lpCode: 'LP-001',
        evidenceStatus: 'unclear'
      }]
    },
    failedBatches: []
  })

  assert.equal(quality.status, 'insufficient')
  assert.ok(quality.reasons.some(reason => /验证证据不清晰/.test(reason)))
})

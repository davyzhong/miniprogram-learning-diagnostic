const test = require('node:test')
const assert = require('node:assert/strict')

const {
  splitFileBatches,
  assertUsableBatchResults,
  batchFailureSummary,
  collectPageResults,
  buildImageFiles,
  mergeBatchResults
} = require('../cloudfunctions/analyzePhotos/pipeline')

test('photo analysis pipeline splits files into single-image batches by default', () => {
  assert.deepEqual(splitFileBatches(['a', 'b', 'c', 'd', 'e', 'f']), [
    ['a'],
    ['b'],
    ['c'],
    ['d'],
    ['e'],
    ['f']
  ])
  assert.deepEqual(splitFileBatches([], 5), [])
})

test('photo analysis pipeline accepts partial batch results but rejects all-failed output', () => {
  assert.doesNotThrow(() => assertUsableBatchResults([
    { success: true, data: { pageResults: [] } },
    { success: false, error: 'timeout' }
  ]))
  assert.throws(
    () => assertUsableBatchResults([{ success: false, error: 'timeout' }]),
    /存在未完成的图片分析批次/
  )
})

test('photo analysis pipeline collects page results and rejects empty AI output', () => {
  assert.deepEqual(collectPageResults([
    { success: true, data: { pageResults: [{ fileID: 'a' }] } },
    { success: false, error: 'timeout' },
    { success: true, data: { pageResults: [{ fileID: 'b' }] } }
  ]), [{ fileID: 'a' }, { fileID: 'b' }])

  assert.throws(
    () => collectPageResults([{ success: true, data: { pageResults: [] } }]),
    /AI 未返回逐页分析结果/
  )
})

test('photo analysis pipeline rebuilds image files while preserving upload metadata', () => {
  const imageFiles = buildImageFiles({
    fileIDs: ['cloud://a', 'cloud://b'],
    initialImageFiles: [{ fileID: 'cloud://a', fileName: '原始A', fileSize: 123, uploadedAt: '2026-06-12T09:00:00+08:00' }],
    markedPages: [
      { fileID: 'cloud://a', ocrSummary: '第一页', contentFingerprint: 'fp-a' },
      { fileID: 'cloud://b', ocrSummary: '第二页', isDuplicate: true, duplicateOf: 'cloud://a' }
    ],
    report: { evidenceTime: '2026-06-12T10:00:00+08:00' }
  })

  assert.deepEqual(imageFiles, [
    {
      fileID: 'cloud://a',
      fileName: '原始A',
      fileSize: 123,
      uploadedAt: '2026-06-12T09:00:00+08:00',
      ocrSummary: '第一页',
      contentFingerprint: 'fp-a',
      isDuplicate: false,
      duplicateOf: '',
      analysisStatus: 'completed',
      analysisError: ''
    },
    {
      fileID: 'cloud://b',
      fileName: '照片2',
      fileSize: 0,
      uploadedAt: '2026-06-12T10:00:00+08:00',
      ocrSummary: '第二页',
      contentFingerprint: '',
      isDuplicate: true,
      duplicateOf: 'cloud://a',
      analysisStatus: 'completed',
      analysisError: ''
    }
  ])
})

test('photo analysis pipeline marks failed images in rebuilt image files', () => {
  const imageFiles = buildImageFiles({
    fileIDs: ['cloud://a', 'cloud://b'],
    markedPages: [{ fileID: 'cloud://a', ocrSummary: '第一页' }],
    report: {
      evidenceTime: '2026-06-12T10:00:00+08:00',
      failedImageFiles: [{ fileID: 'cloud://b', error: 'timeout' }]
    }
  })

  assert.equal(imageFiles[0].analysisStatus, 'completed')
  assert.equal(imageFiles[1].analysisStatus, 'failed')
  assert.equal(imageFiles[1].analysisError, 'timeout')
})

test('photo analysis pipeline summarizes failed batches with file ids', () => {
  assert.deepEqual(batchFailureSummary([
    { success: true, data: {} },
    { success: false, error: 'timeout' },
    null
  ], [
    ['cloud://a'],
    ['cloud://b'],
    ['cloud://c']
  ]), [
    { batchIndex: 1, fileIDs: ['cloud://b'], error: 'timeout' },
    { batchIndex: 2, fileIDs: ['cloud://c'], error: '图片分析失败，请稍后重试' }
  ])
})

test('photo analysis pipeline merges page-level bottlenecks by code and severity', () => {
  const merged = mergeBatchResults([
    { success: true, data: { totalErrors: 1, bottlenecks: [{ lpCode: 'LP-001', lpName: '计算', severity: 'low', errorCount: 1 }], errorDetails: ['a'] } },
    { success: true, data: { totalErrors: 2, bottlenecks: [{ lpCode: 'LP-001', lpName: '计算', severity: 'high', errorCount: 2 }], errorDetails: ['b'] } }
  ])

  assert.equal(merged.totalErrors, 3)
  assert.equal(merged.bottlenecks[0].errorCount, 3)
  assert.equal(merged.bottlenecks[0].severity, 'high')
  assert.deepEqual(merged.errorDetails, ['a', 'b'])
})

test('photo analysis pipeline preserves source photo metadata on each error detail', () => {
  const merged = mergeBatchResults([
    {
      success: true,
      data: {
        imageIndex: 1,
        fileID: 'cloud://photo-1',
        ocrSummary: '第一页口算和竖式计算',
        totalErrors: 1,
        bottlenecks: [{ lpCode: 'LP-001', lpName: '计算', severity: 'medium', errorCount: 1 }],
        errorDetails: [{ questionContent: '38 × 24', lpCode: 'LP-001' }]
      }
    },
    {
      success: true,
      data: {
        imageIndex: 2,
        fileID: 'cloud://photo-2',
        ocrSummary: '第二页应用题',
        totalErrors: 1,
        bottlenecks: [{ lpCode: 'LP-008', lpName: '审题', severity: 'medium', errorCount: 1 }],
        errorDetails: [{ questionContent: '应用题漏条件', lpCode: 'LP-008' }]
      }
    }
  ])

  assert.deepEqual(merged.errorDetails.map(item => ({
    questionContent: item.questionContent,
    sourceImageIndex: item.sourceImageIndex,
    sourceFileID: item.sourceFileID,
    sourceOcrSummary: item.sourceOcrSummary
  })), [
    {
      questionContent: '38 × 24',
      sourceImageIndex: 1,
      sourceFileID: 'cloud://photo-1',
      sourceOcrSummary: '第一页口算和竖式计算'
    },
    {
      questionContent: '应用题漏条件',
      sourceImageIndex: 2,
      sourceFileID: 'cloud://photo-2',
      sourceOcrSummary: '第二页应用题'
    }
  ])
})

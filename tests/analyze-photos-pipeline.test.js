const test = require('node:test')
const assert = require('node:assert/strict')

const {
  splitFileBatches,
  assertCompleteBatchResults,
  collectPageResults,
  buildImageFiles,
  mergeBatchResults
} = require('../cloudfunctions/analyzePhotos/pipeline')

test('photo analysis pipeline splits files into platform-sized batches', () => {
  assert.deepEqual(splitFileBatches(['a', 'b', 'c', 'd', 'e', 'f']), [
    ['a', 'b', 'c', 'd', 'e'],
    ['f']
  ])
  assert.deepEqual(splitFileBatches([], 5), [])
})

test('photo analysis pipeline rejects incomplete batch results before merging', () => {
  assert.doesNotThrow(() => assertCompleteBatchResults([{ success: true, data: { pageResults: [] } }]))
  assert.throws(
    () => assertCompleteBatchResults([{ success: true, data: {} }, { success: false, error: 'timeout' }]),
    /存在未完成的图片分析批次/
  )
})

test('photo analysis pipeline collects page results and rejects empty AI output', () => {
  assert.deepEqual(collectPageResults([
    { success: true, data: { pageResults: [{ fileID: 'a' }] } },
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
      duplicateOf: ''
    },
    {
      fileID: 'cloud://b',
      fileName: '照片2',
      fileSize: 0,
      uploadedAt: '2026-06-12T10:00:00+08:00',
      ocrSummary: '第二页',
      contentFingerprint: '',
      isDuplicate: true,
      duplicateOf: 'cloud://a'
    }
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

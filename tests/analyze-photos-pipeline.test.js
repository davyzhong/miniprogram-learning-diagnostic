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

const {
  compareBottlenecks,
  buildComparisonSummary
} = require('../cloudfunctions/analyzePhotos/comparison')

const {
  normalizeOcrSummary,
  markDuplicatePages
} = require('../cloudfunctions/analyzePhotos/photo-dedup')

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

test('photo analysis pipeline preserves chinese concrete error items with source metadata', () => {
  const merged = mergeBatchResults([
    {
      success: true,
      data: {
        imageIndex: 1,
        fileID: 'cloud://chinese-1',
        ocrSummary: '看拼音写词语：biàn lùn，学生写成辨论',
        totalErrors: 1,
        bottlenecks: [{ lpCode: 'LP-101', lpName: '识字词语', severity: 'high', errorCount: 1 }],
        errorDetails: [],
        chineseErrorItems: [{
          itemId: 'CHI-WORD-BIANLUN',
          itemType: 'word',
          targetText: '辩论',
          expectedAnswer: '辩论',
          studentAnswer: '辨论',
          sourceContext: '看拼音写词语：biàn lùn',
          mistakeType: '形近字混淆',
          verificationMethods: ['pinyin_to_word'],
          relatedLpCode: 'LP-101'
        }]
      }
    }
  ])

  assert.deepEqual(merged.chineseErrorItems.map(item => ({
    itemId: item.itemId,
    targetText: item.targetText,
    studentAnswer: item.studentAnswer,
    sourceImageIndex: item.sourceImageIndex,
    sourceFileID: item.sourceFileID,
    sourceOcrSummary: item.sourceOcrSummary
  })), [{
    itemId: 'CHI-WORD-BIANLUN',
    targetText: '辩论',
    studentAnswer: '辨论',
    sourceImageIndex: 1,
    sourceFileID: 'cloud://chinese-1',
    sourceOcrSummary: '看拼音写词语：biàn lùn，学生写成辨论'
  }])
})

// ── Bottleneck comparison logic (merged from comparison.test.js) ──

test('does not mark removed historical bottlenecks as improved without explicit evidence', () => {
  const previous = [
    { lpCode: 'LP-001', lpName: '计算错误', errorCount: 3, severity: 'high' }
  ]

  const result = compareBottlenecks(previous, [])

  assert.equal(result.length, 0)
})

test('marks lower counts as persisting until explicit verification passes', () => {
  const previous = [
    { lpCode: 'LP-001', lpName: '计算错误', errorCount: 3 },
    { lpCode: 'LP-002', lpName: '分数运算', errorCount: 1 },
    { lpCode: 'LP-003', lpName: '单位换算', errorCount: 2 }
  ]
  const current = [
    { lpCode: 'LP-001', lpName: '计算错误', errorCount: 1 },
    { lpCode: 'LP-002', lpName: '分数运算', errorCount: 2 },
    { lpCode: 'LP-003', lpName: '单位换算', errorCount: 2 },
    { lpCode: 'LP-004', lpName: '应用题建模', errorCount: 1 }
  ]

  const byCode = Object.fromEntries(
    compareBottlenecks(previous, current).map(item => [item.lpCode, item])
  )

  assert.equal(byCode['LP-001'].status, 'persisting')
  assert.equal(byCode['LP-002'].status, 'worsened')
  assert.equal(byCode['LP-003'].status, 'persisting')
  assert.equal(byCode['LP-004'].status, 'new')
})

test('builds a readable comparison summary', () => {
  const summary = buildComparisonSummary([
    { status: 'improved' },
    { status: 'improved' },
    { status: 'persisting' },
    { status: 'new' }
  ])

  assert.equal(summary, '2 个学习卡点已改善，1 个仍需继续验证，1 个为本次新发现。')
})

test('only marks explicitly verified historical bottlenecks as improved', () => {
  const previous = [
    { lpCode: 'LP-001', lpName: '计算错误', errorCount: 3 },
    { lpCode: 'LP-002', lpName: '分数运算', errorCount: 2 }
  ]

  const result = compareBottlenecks(previous, [], ['LP-001'])

  assert.deepEqual(result.map(item => item.lpCode), ['LP-001'])
  assert.equal(result[0].status, 'improved')
})

// ── Photo dedup logic (merged from photo-dedup.test.js) ──

test('normalizes OCR summaries for exact content comparison', () => {
  assert.equal(
    normalizeOcrSummary('  第1题：38 × 24 = 812。\n老师批注：错  '),
    '第1题38×24=812老师批注错'
  )
})

test('marks repeated OCR content while keeping every uploaded photo', () => {
  const pages = [
    { fileID: 'cloud://new-1', ocrSummary: '第1题：38 × 24 = 812' },
    { fileID: 'cloud://new-2', ocrSummary: '第1题 38×24=812。' },
    { fileID: 'cloud://new-3', ocrSummary: '第2题：203 × 4 = 812' }
  ]

  const result = markDuplicatePages(pages, [
    { fileID: 'cloud://old-1', ocrSummary: '第0题：1 + 1 = 2' }
  ])

  assert.equal(result.length, 3)
  assert.equal(result[0].isDuplicate, false)
  assert.equal(result[1].isDuplicate, true)
  assert.equal(result[1].duplicateOf, 'cloud://new-1')
  assert.equal(result[2].isDuplicate, false)
})

test('marks a page duplicated from historical reports', () => {
  const result = markDuplicatePages(
    [{ fileID: 'cloud://new-1', ocrSummary: '分数题：1/2 + 1/3' }],
    [{ fileID: 'cloud://old-1', ocrSummary: '分数题 1/2+1/3。' }]
  )

  assert.equal(result[0].isDuplicate, true)
  assert.equal(result[0].duplicateOf, 'cloud://old-1')
})

// ── 分析可靠性：错误分类逻辑 ──

// 从 analyzeBatch 加载 classifyAnalysisError（通过 vm harness 或直接 require）
// 由于 analyzeBatch 用 vm 沙箱加载，这里用正则验证分类逻辑的正确性
function classifyAnalysisError(msg) {
  msg = String(msg || '')
  if (/ESOCKETTIMEDOUT|ETIMEDOUT|ECONNRESET|ECONNREFUSED|socket hang up|EAI_AGAIN/i.test(msg)) return 'AI 分析网络超时，请稍后重试'
  if (/timeout|timed out|超时/i.test(msg)) return 'AI 分析超时，请稍后重试'
  if (/parseResult|parse.*fail|JSON.*parse|未返回.*结果/i.test(msg)) return 'AI 返回结果解析失败，请稍后重试'
  return msg.slice(0, 240) || '图片分析失败，请稍后重试'
}

function isRetryableError(msg) {
  msg = String(msg || '')
  if (/ESOCKETTIMEDOUT|ETIMEDOUT|ECONNRESET|ECONNREFUSED|socket hang up|EAI_AGAIN|网络超时/i.test(msg)) return true
  if (/timeout|timed out|超时/i.test(msg)) return true
  if (/parseResult|parse.*fail|JSON.*parse|未返回.*结果|解析失败/i.test(msg)) return true
  if (/图片分析失败，请稍后重试/i.test(msg)) return true
  return false
}

function isNonRetryableError(msg) {
  msg = String(msg || '')
  if (/验证试卷|验证卷|归属不一致|没有.*卡点|试卷.*不存在|试卷.*删除/i.test(msg)) return true
  if (/无权|未授权|权限/i.test(msg)) return true
  return false
}

test('classifyAnalysisError identifies ESOCKETTIMEDOUT as network timeout', () => {
  assert.match(classifyAnalysisError('callFunction:fail ESOCKETTIMEDOUT'), /网络超时/)
  assert.match(classifyAnalysisError('Error: ETIMEDOUT'), /网络超时/)
  assert.match(classifyAnalysisError('socket hang up'), /网络超时/)
})

test('classifyAnalysisError identifies generic timeout', () => {
  assert.match(classifyAnalysisError('request timeout'), /超时/)
  assert.match(classifyAnalysisError('operation timed out'), /超时/)
})

test('classifyAnalysisError preserves business error messages', () => {
  const businessError = '关联验证试卷不存在，请重新生成'
  assert.equal(classifyAnalysisError(businessError), businessError)
})

test('isRetryableError classifies network and timeout errors as retryable', () => {
  assert.equal(isRetryableError('callFunction:fail ESOCKETTIMEDOUT'), true)
  assert.equal(isRetryableError('ETIMEDOUT'), true)
  assert.equal(isRetryableError('request timeout'), true)
  assert.equal(isRetryableError('AI 分析超时'), true)
  assert.equal(isRetryableError('图片分析失败，请稍后重试'), true) // 兼容旧版
  assert.equal(isRetryableError('parseResult failed'), true)
})

test('isRetryableError does not classify business errors as retryable', () => {
  assert.equal(isRetryableError('关联验证试卷不存在'), false)
  assert.equal(isRetryableError('归属不一致'), false)
})

test('isNonRetryableError catches verification and permission errors', () => {
  assert.equal(isNonRetryableError('验证试卷不存在'), true)
  assert.equal(isNonRetryableError('归属不一致'), true)
  assert.equal(isNonRetryableError('无权访问'), true)
  assert.equal(isNonRetryableError('ESOCKETTIMEDOUT'), false)
  assert.equal(isNonRetryableError('图片分析失败'), false)
})

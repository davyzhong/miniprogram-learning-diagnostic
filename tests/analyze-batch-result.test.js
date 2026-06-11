const test = require('node:test')
const assert = require('node:assert/strict')

const { normalizePageResults } = require('../cloudfunctions/analyzeBatch/result-normalizer')

test('accepts exactly one AI page result for each uploaded image', () => {
  const result = normalizePageResults({
    pageResults: [
      { imageIndex: 1, ocrSummary: '第一页', bottlenecks: [], errorDetails: [] },
      { imageIndex: 2, ocrSummary: '第二页', bottlenecks: [], errorDetails: [] }
    ]
  }, 2)

  assert.deepEqual(result.pageResults.map(page => page.imageIndex), [1, 2])
})

test('rejects missing, duplicate or out-of-range image indexes', () => {
  assert.throws(
    () => normalizePageResults({ pageResults: [{ imageIndex: 1, bottlenecks: [], errorDetails: [] }] }, 2),
    /逐页分析结果数量不正确/
  )
  assert.throws(
    () => normalizePageResults({
      pageResults: [
        { imageIndex: 1, bottlenecks: [], errorDetails: [] },
        { imageIndex: 1, bottlenecks: [], errorDetails: [] }
      ]
    }, 2),
    /图片序号无效/
  )
})

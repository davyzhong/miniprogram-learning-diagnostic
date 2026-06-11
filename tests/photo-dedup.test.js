const test = require('node:test')
const assert = require('node:assert/strict')

const {
  normalizeOcrSummary,
  markDuplicatePages
} = require('../cloudfunctions/analyzePhotos/photo-dedup')

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

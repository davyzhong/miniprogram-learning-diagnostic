const test = require('node:test')
const assert = require('node:assert/strict')

const {
  compareBottlenecks,
  buildComparisonSummary
} = require('../cloudfunctions/analyzePhotos/comparison')

test('marks removed historical bottlenecks as improved', () => {
  const previous = [
    { lpCode: 'LP-001', lpName: '计算错误', errorCount: 3, severity: 'high' }
  ]

  const result = compareBottlenecks(previous, [])

  assert.equal(result.length, 1)
  assert.equal(result[0].status, 'improved')
  assert.equal(result[0].errorCount, 0)
})

test('marks lower, higher, equal and new error counts correctly', () => {
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

  assert.equal(byCode['LP-001'].status, 'improved')
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

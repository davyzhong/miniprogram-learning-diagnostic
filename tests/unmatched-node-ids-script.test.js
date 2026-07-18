// tests/unmatched-node-ids-script.test.js
// scripts/analyze-unmatched-node-ids.js 的聚合与输出。
const test = require('node:test')
const assert = require('node:assert/strict')

const { collectUnmatched, formatReport } = require('../scripts/analyze-unmatched-node-ids')

const REPORTS = [
  {
    _id: 'r1', subject: 'math',
    bottlenecks: [
      { nodeIds: ['MATH-NUM-DEC-MUL-POINT'], unmatchedNodeIds: ['MATH-NUM-DEC-MUL-POI', 'MATH-NUM-FAKE'] },
      { nodeIds: [], unmatchedNodeIds: ['MATH-NUM-FAKE'] },
    ],
  },
  {
    _id: 'r2', subject: 'math',
    bottlenecks: [{ nodeIds: ['MATH-GEO-CIRCLE-AREA'] }],
  },
  {
    _id: 'r3', subject: 'chinese',
    bottlenecks: [{ unmatchedNodeIds: ['SHOULD-NOT-COUNT'] }],
  },
]

test('聚合：按频次排序、按报告去重、只统计数学', () => {
  const stats = collectUnmatched(REPORTS)
  assert.equal(stats.mathReports, 2)
  assert.equal(stats.reportsWithUnmatched, 1)
  assert.deepEqual(stats.items, [
    { rawId: 'MATH-NUM-FAKE', count: 2, reportCount: 1 },
    { rawId: 'MATH-NUM-DEC-MUL-POI', count: 1, reportCount: 1 },
  ])
})

test('输出：无未归并时给出覆盖良好结论', () => {
  assert.match(formatReport(collectUnmatched([{ _id: 'r9', subject: 'math', bottlenecks: [] }])), /覆盖良好/)
  const text = formatReport(collectUnmatched(REPORTS))
  assert.match(text, /MATH-NUM-FAKE/)
  assert.match(text, /2 份含未归并|1 份含未归并/)
})

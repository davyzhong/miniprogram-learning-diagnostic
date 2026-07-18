// tests/knowledge-map-node-map.test.js
// 知识地图页 150 节点 × 六态视图模型（buildNodeMapView + 页面集成）。
const test = require('node:test')
const assert = require('node:assert/strict')

const {
  buildKnowledgeMapPageView,
  buildNodeMapView,
} = require('../miniprogram/pages/knowledge-map/knowledge-map-presenter')
const { NODE_STATUS_META, NODE_STATUS_ORDER } = require('../miniprogram/utils/bottleneck-view')
const knowledgeSeed = require('../miniprogram/data/math/knowledge-nodes.seed.js')

const DAY_MS = 24 * 60 * 60 * 1000

test('非数学学科返回 null', () => {
  assert.equal(buildNodeMapView([], 'chinese'), null)
})

test('空记录：全部节点计入未观察，observed 为空但骨架完整', () => {
  const view = buildNodeMapView([], 'math')
  assert.equal(view.hasObserved, false)
  assert.equal(view.observedTotal, 0)
  assert.equal(view.totalCount, knowledgeSeed.nodes.length)
  assert.equal(view.domains.length, 4)
  const sum = view.domains.reduce((s, d) => s + d.unobservedCount, 0)
  assert.equal(sum, knowledgeSeed.nodes.length)
})

test('记录合并：有记录的节点进入 observed，状态文案来自 NODE_STATUS_META', () => {
  const view = buildNodeMapView([
    { nodeId: 'MATH-NUM-DEC-MUL-POINT', status: 'relearning', confidence: 0.6, activeBottleneckIds: ['BN-DEC-MUL-POINT-COUNT'] },
    { nodeId: 'MATH-GEO-CIRCLE-AREA', status: 'mastered', confidence: 0.9 },
    { nodeId: 'MATH-NOT-EXIST', status: 'mastered' },
  ], 'math')
  assert.equal(view.observedTotal, 2, '未知 nodeId 不计入')
  const numDomain = view.domains.find(d => d.key === '数与代数')
  const node = numDomain.observed.find(n => n.nodeId === 'MATH-NUM-DEC-MUL-POINT')
  assert.equal(node.statusText, '正在重学')
  assert.equal(node.tone, 'risk')
  assert.equal(node.metaText, '关联 1 个卡点')
})

test('状态排序：风险态在前（recurring > suspected_gap > relearning > partial > mastered）', () => {
  const records = [
    { nodeId: 'MATH-NUM-DEC-MUL-POINT', status: 'mastered' },
    { nodeId: 'MATH-NUM-FRACTION-MEANING', status: 'suspected_gap' },
    { nodeId: 'MATH-NUM-INT-MUL-PARTIAL', status: 'recurring' },
    { nodeId: 'MATH-NUM-FRACTION-ADD-COMMON-DENOM', status: 'partial_mastery' },
  ]
  const view = buildNodeMapView(records, 'math')
  const numDomain = view.domains.find(d => d.key === '数与代数')
  const statuses = numDomain.observed.map(n => n.status)
  assert.deepEqual(statuses, ['recurring', 'suspected_gap', 'partial_mastery', 'mastered'])
})

test('nextReviewAt：未来显示日期，过去显示已到期', () => {
  const future = new Date(Date.now() + DAY_MS)
  const past = new Date(Date.now() - DAY_MS)
  const view = buildNodeMapView([
    { nodeId: 'MATH-NUM-DEC-MUL-POINT', status: 'partial_mastery', nextReviewAt: future.toISOString() },
    { nodeId: 'MATH-NUM-FRACTION-MEANING', status: 'partial_mastery', nextReviewAt: past.toISOString() },
  ], 'math')
  const numDomain = view.domains.find(d => d.key === '数与代数')
  const futureNode = numDomain.observed.find(n => n.nodeId === 'MATH-NUM-DEC-MUL-POINT')
  const pastNode = numDomain.observed.find(n => n.nodeId === 'MATH-NUM-FRACTION-MEANING')
  assert.match(futureNode.metaText, /月.+日复测/)
  assert.equal(pastNode.metaText, '复测已到期')
})

test('页面视图集成：nodeMap 挂到 buildKnowledgeMapPageView，无卡点也有骨架', () => {
  const view = buildKnowledgeMapPageView({}, 'math', [
    { nodeId: 'MATH-NUM-DEC-MUL-POINT', status: 'suspected_gap', confidence: 0.5 },
  ])
  assert.ok(view.nodeMap)
  assert.equal(view.nodeMap.observedTotal, 1)
  assert.equal(view.nodeMap.gapTotal, 1)
})

test('NODE_STATUS_META 覆盖六态且与 NODE_STATUS_ORDER 一致', () => {
  assert.deepEqual(Object.keys(NODE_STATUS_META).sort(), [...NODE_STATUS_ORDER].sort())
  for (const status of NODE_STATUS_ORDER) {
    assert.ok(NODE_STATUS_META[status].text, `${status} 应有文案`)
  }
})

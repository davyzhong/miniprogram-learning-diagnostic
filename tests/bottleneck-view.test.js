const test = require('node:test')
const assert = require('node:assert/strict')

const {
  buildBottleneckViews,
  buildBottleneckStats,
  findBottleneckView
} = require('../miniprogram/utils/bottleneck-view')

test('bottleneck view hides LP codes and formats readable state', () => {
  const views = buildBottleneckViews([{
    lpCode: 'LP-001',
    lpName: '计算错误（加减乘除）',
    subject: 'math',
    status: 'persisting',
    trend: 'persisting',
    weight: 80,
    evidenceCount: 3,
    recentErrorCount: 5,
    firstSeenAt: '2026-06-08T09:00:00+08:00',
    lastSeenAt: '2026-06-12T09:00:00+08:00',
    verificationFailCount: 1
  }])

  assert.equal(views[0].displayName, '计算基础')
  assert.equal(views[0].statusText, '持续出现')
  assert.equal(views[0].priorityText, '高优先级')
  assert.equal(views[0].evidenceText, '3 次证据 · 最近 5 道相关错题')
  assert.equal(views[0].actionText, '生成验证卷')
  assert.doesNotMatch(views[0].displayName, /LP-\d+/)
})

test('bottleneck view sorts active and high weight items before improved ones', () => {
  const views = buildBottleneckViews([
    { lpCode: 'LP-004', status: 'improved', trend: 'improved', weight: 20 },
    { lpCode: 'LP-008', status: 'needs_verification', trend: 'new', weight: 50 },
    { lpCode: 'LP-001', status: 'persisting', trend: 'persisting', weight: 80 },
    { lpCode: 'LP-002', status: 'persisting', trend: 'recurring', weight: 60 }
  ])

  assert.deepEqual(views.map(item => item.displayName), ['分数运算', '计算基础', '审题理解', '单位换算'])
  assert.equal(views[0].trendText, '再次出现')
})

test('bottleneck stats and lookup use normalized views', () => {
  const views = buildBottleneckViews([
    { lpCode: 'LP-001', status: 'persisting', trend: 'persisting', weight: 80 },
    { lpCode: 'LP-008', status: 'needs_verification', trend: 'new', weight: 50 },
    { lpCode: 'LP-004', status: 'improved', trend: 'declining', weight: 30 },
    { lpCode: 'LP-002', status: 'persisting', trend: 'recurring', weight: 90 }
  ])
  const stats = buildBottleneckStats(views)

  assert.equal(stats.totalCount, 4)
  assert.equal(stats.activeCount, 3)
  assert.equal(stats.pendingCount, 1)
  assert.equal(stats.persistingCount, 2)
  assert.equal(stats.improvedCount, 1)
  assert.equal(stats.recurringCount, 1)
  assert.equal(findBottleneckView(views, 'LP-008').displayName, '审题理解')
  assert.equal(findBottleneckView(views, 'LP-999'), null)
})

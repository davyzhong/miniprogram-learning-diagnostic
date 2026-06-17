const test = require('node:test')
const assert = require('node:assert/strict')

const {
  buildBottleneckViews,
  buildBottleneckStats,
  findBottleneckView,
  buildGroupedBottleneckViews
} = require('../miniprogram/utils/bottleneck-view')

const { formatBottleneckDisplayName } = require('../miniprogram/utils/util')

const {
  BOTTLENECK_TAXONOMY,
  MATH_BOTTLENECK_CODES,
  getBottleneckMeta,
  canonicalBottleneckName,
  bottleneckAliasMap
} = require('../miniprogram/utils/bottleneck-taxonomy')

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
  assert.equal(views[0].statusBadgeText, '持续观察')
  assert.equal(views[0].priorityText, '高优先级')
  assert.equal(views[0].evidenceText, '3 次证据 · 最近 5 道相关错题')
  assert.equal(views[0].actionText, '生成纸面验证卷')
  assert.doesNotMatch(views[0].displayName, /LP-\d+/)
})

test('bottleneck view exposes readable status badges instead of symbolic icons', () => {
  const views = buildBottleneckViews([
    { lpCode: 'LP-001', status: 'persisting', trend: 'persisting' },
    { lpCode: 'LP-008', status: 'needs_verification', trend: 'new' },
    { lpCode: 'LP-002', status: 'persisting', trend: 'recurring' },
    { lpCode: 'LP-004', status: 'improved', trend: 'declining' }
  ])

  assert.deepEqual(
    views.map(item => item.statusBadgeText),
    ['再次出现', '持续观察', '待验证', '改善中']
  )
  assert.ok(views.every(item => !['!', '?', '✓'].includes(item.statusBadgeText)))
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

// ── Taxonomy data integrity (merged from bottleneck-taxonomy.test.js) ──

test('math bottleneck taxonomy exposes governed metadata for every MVP code', () => {
  assert.deepEqual(MATH_BOTTLENECK_CODES, [
    'LP-001',
    'LP-002',
    'LP-003',
    'LP-004',
    'LP-005',
    'LP-006',
    'LP-007',
    'LP-008',
    'LP-009',
    'LP-010'
  ])

  for (const code of MATH_BOTTLENECK_CODES) {
    const meta = BOTTLENECK_TAXONOMY[code]
    assert.equal(meta.code, code)
    assert.equal(meta.subject, 'math')
    assert.ok(meta.name)
    assert.ok(meta.shortName)
    assert.ok(meta.parentDescription)
    assert.ok(meta.category)
    assert.ok(meta.validationStyle)
    assert.ok(Array.isArray(meta.aliases))
  }
})

test('taxonomy resolves aliases and unknown bottlenecks without exposing LP codes', () => {
  assert.equal(getBottleneckMeta('LP-001').shortName, '计算基础')
  assert.equal(getBottleneckMeta({ lpCode: 'LP-008' }).parentDescription, '读题、找条件和判断问题目标时容易漏信息。')
  assert.equal(bottleneckAliasMap()['计算错误（加减乘除）'], '计算基础')
  assert.equal(canonicalBottleneckName({ lpCode: 'LP-003', lpName: '百分数/小数转换错误' }), '小数百分数')
  assert.equal(canonicalBottleneckName({ lpCode: 'LP-999' }), '待确认卡点')
  assert.doesNotMatch(formatBottleneckDisplayName({ lpCode: 'LP-999' }), /LP-\d+/)
})

test('bottleneck views carry parent-facing taxonomy metadata', () => {
  const views = buildBottleneckViews([
    { lpCode: 'LP-004', status: 'needs_verification', weight: 60 }
  ])

  assert.equal(views[0].displayName, '单位换算')
  assert.equal(views[0].shortName, '单位换算')
  assert.equal(views[0].category, '单位量纲')
  assert.match(views[0].parentDescription, /单位/)
  assert.equal(views[0].validationStyle, '单位换算验证题')
})

test('math bottleneck views group by category and family without losing fine items', () => {
  const groups = buildGroupedBottleneckViews([
    {
      fineBottleneck: true,
      bottleneckId: 'BN-DEC-MUL-POINT-COUNT',
      lpName: '小数乘法中积的小数位数判断错误',
      status: 'persisting',
      subject: 'math'
    },
    {
      fineBottleneck: true,
      bottleneckId: 'BN-DEC-MUL-POINT-ESTIMATE',
      lpName: '小数乘法后缺少数量级估算检查',
      status: 'needs_verification',
      subject: 'math'
    }
  ], { subject: 'math' })

  assert.equal(groups[0].categoryTitle, '计算规则')
  assert.equal(groups[0].title, '计算规则')
  assert.equal(groups[0].summaryText, '2 个细分卡点')
  assert.equal(groups[0].families[0].familyTitle, '小数点定位与移动')
  assert.equal(groups[0].families[0].summaryText, '2 个卡点')
  assert.equal(groups[0].families[0].items[0].displayName, '小数乘法中积的小数位数判断错误')
})

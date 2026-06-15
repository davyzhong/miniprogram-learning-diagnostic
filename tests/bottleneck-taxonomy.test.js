const test = require('node:test')
const assert = require('node:assert/strict')

const {
  BOTTLENECK_TAXONOMY,
  MATH_BOTTLENECK_CODES,
  getBottleneckMeta,
  canonicalBottleneckName,
  bottleneckAliasMap
} = require('../miniprogram/utils/bottleneck-taxonomy')

const { formatBottleneckDisplayName } = require('../miniprogram/utils/util')
const { buildBottleneckViews } = require('../miniprogram/utils/bottleneck-view')

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

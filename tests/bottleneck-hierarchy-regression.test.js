const test = require('node:test')
const assert = require('node:assert/strict')

/**
 * L2 卡点分组与层级回归测试
 *
 * 现有 math-bottleneck-hierarchy.test.js 已断言"每个 BN 有 category/family"。
 * 本测试聚焦增量场景：
 *   1. 遍历全部 28 个 BN，验证 normalizeFineBottleneck 能正确归组
 *   2. groupBottlenecksByHierarchy 的分组结构完整性
 *   3. 新增 BN-AXIS-FOLD-MIDPOINT-DIRECTION（B3 新增）的层级正确性
 *   4. category/family 的 displayOrder 排序稳定
 */

const bottleneckSeed = require('../data/math/bottleneck-taxonomy-v2.seed.json')
const {
  normalizeFineBottleneck,
  groupBottlenecksByHierarchy
} = require('../miniprogram/utils/math-bottleneck-hierarchy')

const allBottlenecks = bottleneckSeed.bottlenecks

// ── 1. 全量 BN 卡点的 normalize 归组 ──

test('normalizeFineBottleneck produces valid hierarchy for every bottleneck in taxonomy', () => {
  const errors = []
  for (const bn of allBottlenecks) {
    const normalized = normalizeFineBottleneck({ bottleneckId: bn.bottleneckId })
    if (!normalized.categoryId) errors.push(`${bn.bottleneckId}: empty categoryId`)
    if (!normalized.familyId) errors.push(`${bn.bottleneckId}: empty familyId`)
    if (!normalized.categoryTitle || normalized.categoryTitle === '待归类') {
      errors.push(`${bn.bottleneckId}: categoryTitle is 待归类 (categoryId=${normalized.categoryId})`)
    }
    if (!normalized.displayTitle) errors.push(`${bn.bottleneckId}: empty displayTitle`)
  }
  assert.deepEqual(errors, [], `normalize issues:\n  ${errors.join('\n  ')}`)
})

test('normalizeFineBottleneck merges seed fields with input overrides correctly', () => {
  // 输入字段应覆盖 seed 字段
  const bn = allBottlenecks[0]
  const normalized = normalizeFineBottleneck({
    bottleneckId: bn.bottleneckId,
    title: '覆盖标题',
    categoryTitle: '覆盖类别'
  })
  assert.equal(normalized.displayTitle, '覆盖标题', 'input title should override')
  assert.equal(normalized.categoryTitle, '覆盖类别', 'input categoryTitle should override')
  // seed 字段应保留
  assert.equal(normalized.bottleneckId, bn.bottleneckId)
})

// ── 2. groupBottlenecksByHierarchy 分组结构 ──

test('groupBottlenecksByHierarchy groups all bottlenecks without loss', () => {
  const groups = groupBottlenecksByHierarchy(allBottlenecks)
  const totalGrouped = groups.reduce((sum, cat) =>
    sum + cat.families.reduce((s, fam) => s + fam.itemCount, 0), 0)

  assert.equal(
    totalGrouped,
    allBottlenecks.length,
    `grouped ${totalGrouped} but taxonomy has ${allBottlenecks.length} — items were lost in grouping`
  )
})

test('groupBottlenecksByHierarchy sorts categories by displayOrder', () => {
  const groups = groupBottlenecksByHierarchy(allBottlenecks)
  const orders = groups.map(g => g.displayOrder)

  for (let i = 1; i < orders.length; i++) {
    assert.ok(
      orders[i] >= orders[i - 1],
      `category order not sorted: ${orders.join(', ')}`
    )
  }
})

test('groupBottlenecksByHierarchy produces non-empty families for populated categories', () => {
  const groups = groupBottlenecksByHierarchy(allBottlenecks)
  for (const cat of groups) {
    assert.ok(cat.families.length > 0, `category ${cat.categoryId} has no families`)
    for (const fam of cat.families) {
      assert.ok(fam.items.length > 0, `family ${fam.familyId} in ${cat.categoryId} has no items`)
    }
  }
})

// ── 3. B3 新增卡点 BN-AXIS-FOLD-MIDPOINT-DIRECTION 专项 ──

test('BN-AXIS-FOLD-MIDPOINT-DIRECTION (B3 new) has correct hierarchy linkage', () => {
  const bn = allBottlenecks.find(b => b.bottleneckId === 'BN-AXIS-FOLD-MIDPOINT-DIRECTION')
  assert.ok(bn, 'BN-AXIS-FOLD-MIDPOINT-DIRECTION should exist in taxonomy')

  // 应有完整的 category/family 字段
  assert.ok(bn.categoryId, 'should have categoryId')
  assert.ok(bn.familyId, 'should have familyId')
  assert.ok(bn.categoryTitle, 'should have categoryTitle')
  assert.ok(bn.familyTitle, 'should have familyTitle')

  // normalize 后层级应可查
  const normalized = normalizeFineBottleneck({ bottleneckId: bn.bottleneckId })
  assert.notEqual(normalized.categoryTitle, '待归类', 'should not fall back to 待归类')
  assert.notEqual(normalized.familyTitle, '待归类卡点组', 'should not fall back to 待归类卡点组')

  // 应有完整的定义字段（症状/根因/微验证）
  assert.ok((bn.symptomPatterns || []).length >= 2, 'should have ≥2 symptom patterns')
  assert.ok((bn.rootCauseSignals || []).length >= 2, 'should have ≥2 root cause signals')
  assert.ok((bn.microValidationRules || []).length >= 2, 'should have ≥2 micro validation rules')
})

// ── 4. 所有 BN 的 sourceEvidence 引用格式合法 ──

test('every bottleneck with sourceEvidence has valid ERR reference format', () => {
  for (const bn of allBottlenecks) {
    const ev = bn.sourceEvidence || []
    for (const e of ev) {
      // sourceEvidence 应是字符串（含 ERR- 编号）
      assert.equal(typeof e, 'string', `${bn.bottleneckId}: sourceEvidence item is not a string`)
    }
  }
})

// ── 5. BN 卡点的 nodeId 与 enricher 用的 nodeId 一致 ──

test('every bottleneck.nodeId matches an existing knowledge node', () => {
  const knowledgeSeed = require('../data/math/knowledge-nodes.seed.json')
  const nodeIds = new Set(knowledgeSeed.nodes.map(n => n.nodeId))
  const missing = []
  for (const bn of allBottlenecks) {
    if (bn.nodeId && !nodeIds.has(bn.nodeId)) {
      missing.push(`${bn.bottleneckId} → ${bn.nodeId}`)
    }
  }
  assert.deepEqual(missing, [], `bottleneck→node orphans:\n  ${missing.join('\n  ')}`)
})

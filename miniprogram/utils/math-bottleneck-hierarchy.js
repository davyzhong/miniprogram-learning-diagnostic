const categorySeed = require('../data/math/bottleneck-categories.seed')
const bottleneckSeed = require('../data/math/bottleneck-taxonomy-v2.seed')

const categoriesById = new Map((categorySeed.categories || []).map(item => [item.categoryId, item]))
const familiesById = new Map((categorySeed.families || []).map(item => [item.familyId, item]))
const bottlenecksById = new Map((bottleneckSeed.bottlenecks || []).map(item => [item.bottleneckId, item]))

const LEGACY_FINE_BOTTLENECKS = {
  // 长方形/面积公式类历史 AI 变体
  'BN-APP-RECT-AREA': {
    title: '长方形周长和面积公式混淆',
    categoryId: 'MATH-CAT-GEOMETRY',
    familyId: 'MATH-FAM-CIRCLE-FORMULA'
  },
  'BN-APP-RECT-PERIMETER-AREA': {
    title: '长方形周长和面积公式混淆',
    categoryId: 'MATH-CAT-GEOMETRY',
    familyId: 'MATH-FAM-CIRCLE-FORMULA'
  },
  'BN-GEO-RECT-AREA-CONFUSE': {
    title: '长方形周长和面积公式混淆',
    categoryId: 'MATH-CAT-GEOMETRY',
    familyId: 'MATH-FAM-CIRCLE-FORMULA'
  },
  'BN-RECT-PERIM-AREA-CONFUSE': {
    title: '长方形周长和面积公式混淆',
    categoryId: 'MATH-CAT-GEOMETRY',
    familyId: 'MATH-FAM-CIRCLE-FORMULA'
  },
  'BN-RECT-AREA-PERIM-CONFUSE': {
    title: '长方形周长和面积公式混淆',
    categoryId: 'MATH-CAT-GEOMETRY',
    familyId: 'MATH-FAM-CIRCLE-FORMULA'
  },

  // 面积单位换算类历史 AI 变体
  'BN-AREA-CONVERSION-RATE': {
    title: '面积单位换算进率记忆不稳',
    categoryId: 'MATH-CAT-MEASURE',
    familyId: 'MATH-FAM-UNIT-CONVERT'
  },
  'BN-AREA-CONVERT-RATE': {
    title: '面积单位换算进率记忆不稳',
    categoryId: 'MATH-CAT-MEASURE',
    familyId: 'MATH-FAM-UNIT-CONVERT'
  },
  'BN-AREA-UNIT-CONVERT': {
    title: '面积单位换算进率记忆不稳',
    categoryId: 'MATH-CAT-MEASURE',
    familyId: 'MATH-FAM-UNIT-CONVERT'
  },
  'BN-AREA-UNIT-CONVERT-ERROR': {
    title: '面积单位换算进率记忆不稳',
    categoryId: 'MATH-CAT-MEASURE',
    familyId: 'MATH-FAM-UNIT-CONVERT'
  },
  'BN-AREA-UNIT-KM2-HA': {
    title: '平方千米与公顷换算不稳',
    categoryId: 'MATH-CAT-MEASURE',
    familyId: 'MATH-FAM-UNIT-CONVERT'
  },
  'BN-AREA-UNIT-RATE': {
    title: '面积单位换算进率记忆不稳',
    categoryId: 'MATH-CAT-MEASURE',
    familyId: 'MATH-FAM-UNIT-CONVERT'
  },
  'BN-UNIT-AREA-CONVERT': {
    title: '面积单位换算进率记忆不稳',
    categoryId: 'MATH-CAT-MEASURE',
    familyId: 'MATH-FAM-UNIT-CONVERT'
  },

  // 小数除法/乘法计算规则历史 AI 变体
  'BN-DEC-DIV-POINT-MOVE': {
    title: '除数是小数时小数点移动规则不熟练',
    categoryId: 'MATH-CAT-CALC-RULE',
    familyId: 'MATH-FAM-DECIMAL-POINT'
  },
  'BN-DEC-DIV-TRIAL': {
    title: '小数除法试商与补零规则不熟练',
    categoryId: 'MATH-CAT-CALC-RULE',
    familyId: 'MATH-FAM-LONG-DIVISION'
  },
  'BN-DEC-MUL-CARRY': {
    title: '小数乘法连续进位计算不稳',
    categoryId: 'MATH-CAT-CALC-RULE',
    familyId: 'MATH-FAM-DECIMAL-POINT'
  },
  'BN-DEC-MUL-CARRY-ADD': {
    title: '小数乘法进位后加法求和错误',
    categoryId: 'MATH-CAT-CALC-RULE',
    familyId: 'MATH-FAM-DECIMAL-POINT'
  },
  'BN-DEC-MUL-CARRY-ERROR': {
    title: '小数乘法连续进位计算不稳',
    categoryId: 'MATH-CAT-CALC-RULE',
    familyId: 'MATH-FAM-DECIMAL-POINT'
  },
  'BN-DEC-MUL-SPLIT-ADD': {
    title: '小数乘法拆分后加法求和错误',
    categoryId: 'MATH-CAT-CALC-RULE',
    familyId: 'MATH-FAM-DECIMAL-POINT'
  },

  // 异分母通分类历史 AI 变体
  'BN-FRACTION-ADD-COMMON': { canonicalId: 'BN-FRACTION-ADD-DENOM-MISMATCH' },
  'BN-FRACTION-ADD-LCM': { canonicalId: 'BN-FRACTION-ADD-DENOM-MISMATCH' },
  'BN-FRACTION-ADD-NO-COMMON-DENOMINATOR': { canonicalId: 'BN-FRACTION-ADD-DENOM-MISMATCH' },
  'BN-FRACTION-ADD-SUB-COMMON': { canonicalId: 'BN-FRACTION-ADD-DENOM-MISMATCH' },
  'BN-FRACTION-ADD-UNLIKE': { canonicalId: 'BN-FRACTION-ADD-DENOM-MISMATCH' },
  'BN-FRACTION-ADD-UNLIKE-LCM': { canonicalId: 'BN-FRACTION-ADD-DENOM-MISMATCH' },
  'BN-FRACTION-COMMON-DENOMINATOR': { canonicalId: 'BN-FRACTION-ADD-DENOM-MISMATCH' },

  // 小数乘法标准 BN 的历史写法
  'BN-DEC-MUL-POINT': { canonicalId: 'BN-DEC-MUL-POINT-COUNT' },
  'BN-DEC-MUL-POINT-ERROR': { canonicalId: 'BN-DEC-MUL-POINT-COUNT' },
  'BN-DEC-MUL-DECIMAL-COUNT': { canonicalId: 'BN-DEC-MUL-POINT-COUNT' }
}

function categoryOf(categoryId) {
  return categoriesById.get(categoryId) || null
}

function familyOf(familyId) {
  return familiesById.get(familyId) || null
}

function bottleneckOf(bottleneckId) {
  return bottlenecksById.get(bottleneckId) || null
}

function legacyBottleneckOf(bottleneckId) {
  const legacy = LEGACY_FINE_BOTTLENECKS[bottleneckId]
  if (!legacy) return null
  const canonical = legacy.canonicalId ? bottleneckOf(legacy.canonicalId) : null
  return {
    ...legacy,
    ...(canonical || {}),
    bottleneckId: legacy.canonicalId || bottleneckId,
    rawBottleneckId: bottleneckId
  }
}

function categoryTitleOf(categoryId) {
  return (categoryOf(categoryId) || {}).title || '待归类'
}

function familyTitleOf(familyId) {
  return (familyOf(familyId) || {}).title || '待归类卡点组'
}

function normalizeFineBottleneck(input = {}) {
  const bottleneckId = input.bottleneckId || input.id || ''
  const seed = bottleneckOf(bottleneckId) || legacyBottleneckOf(bottleneckId) || {}
  const categoryId = input.categoryId || seed.categoryId || ''
  const familyId = input.familyId || seed.familyId || ''
  const category = categoryOf(categoryId) || {}
  const family = familyOf(familyId) || {}
  const rawTitle = input.title || input.lpName || input.displayName || input.name || seed.title || ''
  const title = /^BN-[A-Z0-9-]+$/.test(rawTitle)
    ? (seed.title || '待确认细卡点')
    : (rawTitle || '待确认细卡点')

  return {
    ...seed,
    ...input,
    bottleneckId: seed.bottleneckId || bottleneckId || '',
    rawBottleneckId: seed.rawBottleneckId || input.rawBottleneckId || '',
    categoryId,
    familyId,
    categoryTitle: input.categoryTitle || seed.categoryTitle || category.title || '待归类',
    familyTitle: input.familyTitle || seed.familyTitle || family.title || '待归类卡点组',
    categoryDisplayOrder: Number(category.displayOrder) || 999,
    familyNodeIds: Array.isArray(family.nodeIds) ? family.nodeIds : [],
    verificationTemplate: input.verificationTemplate || seed.verificationTemplate || family.verificationTemplate || '',
    resourceStyleHints: input.resourceStyleHints || seed.resourceStyleHints || family.resourceStyleHints || [],
    displayTitle: title
  }
}

function groupBottlenecksByHierarchy(items = []) {
  const categoryMap = new Map()
  const seenItemKeys = new Set()

  for (const raw of items || []) {
    const item = normalizeFineBottleneck(raw)
    const itemKey = [
      item.categoryId || 'UNKNOWN',
      item.familyId || 'UNKNOWN',
      item.displayTitle || item.title || item.bottleneckId || ''
    ].join('|')
    if (seenItemKeys.has(itemKey)) continue
    seenItemKeys.add(itemKey)

    const categoryKey = item.categoryId || 'UNKNOWN'
    const familyKey = item.familyId || 'UNKNOWN'

    if (!categoryMap.has(categoryKey)) {
      categoryMap.set(categoryKey, {
        categoryId: item.categoryId,
        categoryTitle: item.categoryTitle,
        displayOrder: item.categoryDisplayOrder,
        itemCount: 0,
        families: []
      })
    }

    const category = categoryMap.get(categoryKey)
    // find 比较时用 familyKey（空 familyId 统一为 'UNKNOWN'），
    // 避免多个空 familyId 的 item 各自创建独立 family 导致 wx:key 不唯一
    let family = category.families.find(value => (value.familyId || 'UNKNOWN') === familyKey)
    if (!family) {
      family = {
        // 存入时也用 familyKey 作为 fallback，保证 find 能匹配到
        familyId: item.familyId || familyKey,
        familyTitle: item.familyTitle,
        itemCount: 0,
        items: []
      }
      category.families.push(family)
    }

    family.items.push(item)
    family.itemCount += 1
    category.itemCount += 1
  }

  return Array.from(categoryMap.values())
    .sort((a, b) => a.displayOrder - b.displayOrder || String(a.categoryTitle).localeCompare(String(b.categoryTitle), 'zh-Hans-CN'))
    .map(category => ({
      ...category,
      families: category.families
        .sort((a, b) => String(a.familyTitle).localeCompare(String(b.familyTitle), 'zh-Hans-CN'))
    }))
}

module.exports = {
  categoryOf,
  familyOf,
  bottleneckOf,
  categoryTitleOf,
  familyTitleOf,
  normalizeFineBottleneck,
  groupBottlenecksByHierarchy
}

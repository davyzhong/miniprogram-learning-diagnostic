// 种子数据来自打包内 JS 镜像（scripts/build-math-seed-mirrors.js 生成）：
// 云函数独立上传时 data/ 目录不会随包，原来的 fs/path 探测会在云端静默缺失。
var categorySeed = require('./math-seeds/bottleneck-categories.seed.js')
var bottleneckSeed = require('./math-seeds/bottleneck-taxonomy-v2.seed.js')

const categoriesById = new Map((categorySeed.categories || []).map(item => [item.categoryId, item]))
const familiesById = new Map((categorySeed.families || []).map(item => [item.familyId, item]))
const bottlenecksById = new Map((bottleneckSeed.bottlenecks || []).map(item => [item.bottleneckId, item]))

function categoryOf(categoryId) {
  return categoriesById.get(categoryId) || null
}

function familyOf(familyId) {
  return familiesById.get(familyId) || null
}

function bottleneckOf(bottleneckId) {
  return bottlenecksById.get(bottleneckId) || null
}

function categoryTitleOf(categoryId) {
  return (categoryOf(categoryId) || {}).title || '待归类'
}

function familyTitleOf(familyId) {
  return (familyOf(familyId) || {}).title || '待归类卡点组'
}

function normalizeFineBottleneck(input = {}) {
  const bottleneckId = input.bottleneckId || input.id || ''
  const seed = bottleneckOf(bottleneckId) || {}
  const categoryId = input.categoryId || seed.categoryId || ''
  const familyId = input.familyId || seed.familyId || ''
  const category = categoryOf(categoryId) || {}
  const family = familyOf(familyId) || {}
  const title = input.title || input.lpName || input.displayName || input.name || seed.title || bottleneckId || '待确认细卡点'

  return {
    ...seed,
    ...input,
    bottleneckId: bottleneckId || seed.bottleneckId || '',
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

  for (const raw of items || []) {
    const item = normalizeFineBottleneck(raw)
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
    // 避免多个空 familyId 的 item 各自创建独立 family
    let family = category.families.find(value => (value.familyId || 'UNKNOWN') === familyKey)
    if (!family) {
      family = {
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

const test = require('node:test')
const assert = require('node:assert/strict')

const categoriesSeed = require('../data/math/bottleneck-categories.seed.json')
const bottleneckSeed = require('../data/math/bottleneck-taxonomy-v2.seed.json')
const {
  normalizeFineBottleneck,
  groupBottlenecksByHierarchy,
  categoryTitleOf,
  familyTitleOf
} = require('../miniprogram/utils/math-bottleneck-hierarchy')

test('math bottleneck categories define category and family hierarchy', () => {
  assert.ok(categoriesSeed.version)
  assert.equal(categoriesSeed.subject, 'math')
  assert.ok(Array.isArray(categoriesSeed.categories))
  assert.ok(Array.isArray(categoriesSeed.families))
  assert.ok(categoriesSeed.categories.length >= 7)
  assert.ok(categoriesSeed.families.length >= 10)

  const categoryIds = new Set(categoriesSeed.categories.map(item => item.categoryId))
  for (const category of categoriesSeed.categories) {
    assert.ok(category.categoryId)
    assert.ok(category.title)
    assert.ok(category.resourceRole)
    assert.ok(category.verificationRole)
    assert.ok(category.defaultPageType)
  }
  for (const family of categoriesSeed.families) {
    assert.ok(family.familyId)
    assert.ok(categoryIds.has(family.categoryId), `${family.familyId} has unknown category`)
    assert.ok(family.title)
    assert.ok(Array.isArray(family.nodeIds))
    assert.ok(Array.isArray(family.resourceStyleHints))
  }
})

test('every fine math bottleneck is linked to category and family', () => {
  const categoryIds = new Set(categoriesSeed.categories.map(item => item.categoryId))
  const familyIds = new Set(categoriesSeed.families.map(item => item.familyId))

  for (const bottleneck of bottleneckSeed.bottlenecks) {
    assert.ok(categoryIds.has(bottleneck.categoryId), `${bottleneck.bottleneckId} missing categoryId`)
    assert.ok(familyIds.has(bottleneck.familyId), `${bottleneck.bottleneckId} missing familyId`)
    assert.ok(bottleneck.categoryTitle)
    assert.ok(bottleneck.familyTitle)
    assert.equal(bottleneck.verificationGrain, 'fine_bottleneck')
    assert.ok(Array.isArray(bottleneck.recommendedPageTypes))
    assert.ok(bottleneck.recommendedPageTypes.length > 0)
  }
})

test('normalizes fine bottleneck hierarchy metadata', () => {
  const normalized = normalizeFineBottleneck({
    bottleneckId: 'BN-DEC-MUL-POINT-COUNT',
    title: '小数乘法中积的小数位数判断错误'
  })

  assert.equal(categoryTitleOf(normalized.categoryId), '计算规则')
  assert.equal(familyTitleOf(normalized.familyId), '小数点定位与移动')
  assert.equal(normalized.categoryTitle, '计算规则')
  assert.equal(normalized.familyTitle, '小数点定位与移动')
  assert.equal(normalized.displayTitle, '小数乘法中积的小数位数判断错误')
})

test('groups bottlenecks by category then family', () => {
  const groups = groupBottlenecksByHierarchy([
    { bottleneckId: 'BN-DEC-MUL-POINT-COUNT' },
    { bottleneckId: 'BN-DEC-MUL-POINT-ESTIMATE' }
  ])

  assert.equal(groups.length, 1)
  assert.equal(groups[0].categoryTitle, '计算规则')
  assert.equal(groups[0].itemCount, 2)
  assert.equal(groups[0].families.length, 1)
  assert.equal(groups[0].families[0].familyTitle, '小数点定位与移动')
  assert.equal(groups[0].families[0].items.length, 2)
})

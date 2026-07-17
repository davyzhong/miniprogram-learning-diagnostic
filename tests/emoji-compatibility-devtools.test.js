const test = require('node:test')
const assert = require('node:assert/strict')

const { parseCompiledPackageMetrics } = require('../scripts/devtools-emoji-package-metrics')
const {
  validateRenderedCardIds,
  validateRestoredCategory
} = require('../scripts/devtools-emoji-compatibility-e2e')

test('compiled package parser extracts total, main, and icon subpackage bytes', () => {
  const metrics = parseCompiledPackageMetrics({
    size: {
      total: 901234,
      packages: [
        { name: 'TOTAL', size: 901234 },
        { name: 'main', size: 583100 },
        { name: '/pages/icon-compatibility/', size: 81120 }
      ]
    }
  })

  assert.deepEqual(metrics, {
    totalBytes: 901234,
    mainBytes: 583100,
    iconSubpackageBytes: 81120
  })
})

test('compiled package parser rejects incomplete DevTools package output', () => {
  assert.throws(
    () => parseCompiledPackageMetrics({ size: { total: 1, packages: [{ name: 'main', size: 1 }] } }),
    /compiled package metrics unavailable/
  )
  assert.throws(() => parseCompiledPackageMetrics({}), /compiled package metrics unavailable/)
})

test('rendered-card validator accepts only the current category and exact count', () => {
  assert.doesNotThrow(() => validateRenderedCardIds({
    activeCategoryId: 'B02-C03',
    expectedCount: 3,
    cardIds: ['B02-C03-001', 'B02-C03-002', 'B02-C03-003']
  }))
  assert.throws(() => validateRenderedCardIds({
    activeCategoryId: 'B02-C03',
    expectedCount: 2,
    cardIds: ['B02-C03-001', 'B02-C02-035']
  }), /stale or foreign card ID/)
  assert.throws(() => validateRenderedCardIds({
    activeCategoryId: 'B02-C03',
    expectedCount: 3,
    cardIds: ['B02-C03-001', 'B02-C03-002']
  }), /rendered card count mismatch/)
})

test('state restoration validator reports the expected batch/category pair', () => {
  assert.doesNotThrow(() => validateRestoredCategory(
    { activeBatch: { id: 'B01' }, activeCategory: { id: 'C03' } },
    'B01',
    'C03'
  ))
  assert.throws(() => validateRestoredCategory(
    { activeBatch: { id: 'B02' }, activeCategory: { id: 'B02-C01' } },
    'B02',
    'B02-C12'
  ), /category restoration mismatch/)
})

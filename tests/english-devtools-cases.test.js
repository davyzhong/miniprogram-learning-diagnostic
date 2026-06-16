const test = require('node:test')
const assert = require('node:assert/strict')

const {
  ENGLISH_FEATURE_KEYS,
  loadEnglishDevtoolsTestCases,
  validateEnglishDevtoolsTestCases
} = require('../scripts/english-devtools-test-cases')

test('English DevTools test case library covers every MVP English feature', () => {
  const library = loadEnglishDevtoolsTestCases()
  const summary = validateEnglishDevtoolsTestCases(library)

  assert.equal(summary.caseCount, 6)
  assert.deepEqual(summary.features.sort(), [...ENGLISH_FEATURE_KEYS].sort())
})

test('English DevTools test cases define executable routes and assertions', () => {
  const library = loadEnglishDevtoolsTestCases()

  for (const item of library.cases) {
    assert.match(item.id, /^ENG-[A-Z]+-\d{3}$/)
    assert.ok(ENGLISH_FEATURE_KEYS.includes(item.feature), `${item.id} has an unknown feature`)
    assert.match(item.route, /^\/pages\//, `${item.id} route should be a miniprogram page`)
    assert.ok(Array.isArray(item.expectedTexts) && item.expectedTexts.length >= 2, `${item.id} needs visible text assertions`)
    assert.ok(Array.isArray(item.forbiddenTexts), `${item.id} should declare forbidden text expectations`)
  }
})

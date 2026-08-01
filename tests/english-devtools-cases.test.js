const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')

const {
  ENGLISH_FEATURE_KEYS,
  loadEnglishDevtoolsTestCases,
  validateEnglishDevtoolsTestCases
} = require('../scripts/english-devtools-test-cases')

test('English DevTools test case library covers every MVP English feature', () => {
  const library = loadEnglishDevtoolsTestCases()
  const summary = validateEnglishDevtoolsTestCases(library)

  assert.equal(summary.caseCount, ENGLISH_FEATURE_KEYS.length)
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

test('English DevTools test cases persist end-to-end interaction and data assertions', () => {
  const library = loadEnglishDevtoolsTestCases()

  for (const item of library.cases) {
    assert.ok(Array.isArray(item.steps) && item.steps.length >= 1, `${item.id} should document executable E2E steps`)
    assert.ok(Array.isArray(item.dataAssertions) && item.dataAssertions.length >= 1, `${item.id} should document data assertions`)
    assert.ok(Array.isArray(item.artifacts) && item.artifacts.includes('screenshot'), `${item.id} should save a screenshot artifact`)
  }

  const allSteps = library.cases.flatMap(item => item.steps)
  assert.ok(allSteps.some(step => step.action === 'tapText'), 'English E2E should include simulator tap interactions')
  assert.ok(allSteps.some(step => step.action === 'callMethod'), 'English E2E should include page method interactions for voice/OCR flows')
})

test('English DevTools fixtures follow the compact vocabulary segments and current learning-view APIs', () => {
  const library = loadEnglishDevtoolsTestCases()
  const workbench = library.cases.find(item => item.id === 'ENG-WB-001')
  const autoImport = library.cases.find(item => item.id === 'ENG-IMPORT-001')
  const runner = fs.readFileSync(path.join(__dirname, '..', 'scripts/devtools-english-e2e.js'), 'utf8')

  assert.deepEqual(
    ['掌握 140', '待练 18', '待复习 16', '未测 120'].filter(text => !workbench.expectedTexts.includes(text)),
    [],
    '工作台应断言当前词库构成色带文案'
  )
  assert.ok(!workbench.expectedTexts.includes('今日待练'))
  assert.ok(autoImport.expectedTexts.includes('505 个词已进入个人词库'))
  assert.match(runner, /data\.action === 'getTodayPlan'/)
  assert.match(runner, /data\.action === 'getConfusionPractice'/)
  assert.doesNotMatch(runner, /data\.summaryCards/, '错词本已移除旧版裸数字卡')
  assert.match(runner, /data\.compositionSegments/, '错词本 E2E 应校验当前掌握构成色带')
})

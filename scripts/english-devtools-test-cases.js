const fs = require('node:fs')
const path = require('node:path')

const DEFAULT_CASE_LIBRARY = path.join(__dirname, '..', 'tests', 'fixtures', 'english-devtools-test-cases.json')

const ENGLISH_FEATURE_KEYS = [
  'workbench',
  'auto-import',
  'familiarity',
  'paper-dictation',
  'learning-records',
  'empty-state'
]

function loadEnglishDevtoolsTestCases(filePath = DEFAULT_CASE_LIBRARY) {
  const content = fs.readFileSync(filePath, 'utf8')
  return JSON.parse(content)
}

function validateEnglishDevtoolsTestCases(library = {}) {
  if (!Array.isArray(library.cases)) {
    throw new Error('英语 DevTools 测试用例库缺少 cases 数组')
  }

  const features = new Set()
  const ids = new Set()
  for (const item of library.cases) {
    if (!item || typeof item !== 'object') throw new Error('英语 DevTools 测试用例格式错误')
    if (!/^ENG-[A-Z]+-\d{3}$/.test(item.id || '')) throw new Error(`英语测试用例 ID 不合法：${item.id || ''}`)
    if (ids.has(item.id)) throw new Error(`英语测试用例 ID 重复：${item.id}`)
    ids.add(item.id)
    if (!ENGLISH_FEATURE_KEYS.includes(item.feature)) throw new Error(`英语测试用例功能未知：${item.feature || ''}`)
    if (!String(item.route || '').startsWith('/pages/')) throw new Error(`英语测试用例路由不合法：${item.id}`)
    if (!Array.isArray(item.expectedTexts) || item.expectedTexts.length < 2) throw new Error(`英语测试用例缺少预期文案：${item.id}`)
    if (!Array.isArray(item.forbiddenTexts)) throw new Error(`英语测试用例缺少禁止文案：${item.id}`)
    features.add(item.feature)
  }

  for (const feature of ENGLISH_FEATURE_KEYS) {
    if (!features.has(feature)) throw new Error(`英语 DevTools 测试用例缺少功能覆盖：${feature}`)
  }

  return {
    caseCount: library.cases.length,
    features: [...features]
  }
}

module.exports = {
  DEFAULT_CASE_LIBRARY,
  ENGLISH_FEATURE_KEYS,
  loadEnglishDevtoolsTestCases,
  validateEnglishDevtoolsTestCases
}

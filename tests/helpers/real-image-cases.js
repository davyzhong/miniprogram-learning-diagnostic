const fs = require('node:fs')
const path = require('node:path')

const DEFAULT_ENV_ID = 'cloud1-d6gneg68m5a7a3876'

function normalizeCase(input = {}, index = 0) {
  const filePaths = Array.isArray(input.filePaths)
    ? input.filePaths
    : (input.filePath ? [input.filePath] : [])
  return {
    caseId: input.caseId || `real-image-case-${index + 1}`,
    subject: input.subject || 'math',
    mode: input.mode || 'diagnosis',
    filePaths,
    expectedMinPages: Math.max(1, Number(input.expectedMinPages) || filePaths.length || 1),
    expectedKeywords: Array.isArray(input.expectedKeywords) ? input.expectedKeywords : [],
    ...(input.mock ? { mock: true } : {})
  }
}

function mockCase() {
  return {
    caseId: 'mock-math-diagnosis',
    subject: 'math',
    mode: 'diagnosis',
    filePaths: [],
    expectedMinPages: 1,
    expectedKeywords: ['计算', '分数'],
    mock: true
  }
}

function loadRealImageCases({ env = process.env, argv = process.argv.slice(2) } = {}) {
  if (argv.includes('--mock')) return [mockCase()]

  if (env.REAL_IMAGE_MANIFEST) {
    const manifestPath = path.resolve(env.REAL_IMAGE_MANIFEST)
    const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'))
    const rawCases = Array.isArray(manifest) ? manifest : manifest.cases
    if (!Array.isArray(rawCases) || rawCases.length === 0) {
      throw new Error('REAL_IMAGE_MANIFEST 中至少需要 1 个 case')
    }
    return rawCases.map(normalizeCase)
  }

  if (env.REAL_IMAGE_PATH) {
    return [normalizeCase({
      caseId: env.REAL_IMAGE_CASE_ID || 'single-real-image',
      subject: env.REAL_IMAGE_SUBJECT || 'math',
      mode: env.REAL_IMAGE_MODE || 'diagnosis',
      filePath: env.REAL_IMAGE_PATH,
      expectedMinPages: Number(env.REAL_IMAGE_EXPECTED_MIN_PAGES) || 1,
      expectedKeywords: env.REAL_IMAGE_EXPECTED_KEYWORDS
        ? env.REAL_IMAGE_EXPECTED_KEYWORDS.split(',').map(item => item.trim()).filter(Boolean)
        : []
    })]
  }

  return [mockCase()]
}

function validateRealImageCase(testCase) {
  const current = normalizeCase(testCase)
  if (current.mock) return current
  if (current.filePaths.length < 1) {
    throw new Error(`${current.caseId} 至少需要 1 张图片`)
  }
  for (const filePath of current.filePaths) {
    if (!path.isAbsolute(filePath)) {
      throw new Error(`${current.caseId} 的图片路径必须使用绝对路径：${filePath}`)
    }
  }
  return current
}

function ensureReportDir(outputPath) {
  fs.mkdirSync(path.dirname(outputPath), { recursive: true })
}

function writeRealImageReport(results, outputPath = path.join(__dirname, '../../tmp/e2e-real-image-report.json')) {
  const report = {
    generatedAt: new Date().toISOString(),
    envId: process.env.TCB_ENV || DEFAULT_ENV_ID,
    totalCases: results.length,
    passedCases: results.filter(item => item.status === 'passed').length,
    failedCases: results.filter(item => item.status === 'failed').length,
    skippedCases: results.filter(item => item.status === 'skipped').length,
    cases: results,
    outputPath
  }
  ensureReportDir(outputPath)
  fs.writeFileSync(outputPath, JSON.stringify(report, null, 2))
  return report
}

module.exports = {
  loadRealImageCases,
  validateRealImageCase,
  writeRealImageReport
}

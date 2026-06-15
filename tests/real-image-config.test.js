const test = require('node:test')
const assert = require('node:assert/strict')
const path = require('node:path')

const {
  loadRealImageCases,
  validateRealImageCase,
  writeRealImageReport
} = require('./helpers/real-image-cases')

test('loads a single real image case from REAL_IMAGE_PATH style config', () => {
  const cases = loadRealImageCases({
    env: { REAL_IMAGE_PATH: '/tmp/math-paper.jpg' },
    argv: []
  })

  assert.deepEqual(cases, [{
    caseId: 'single-real-image',
    subject: 'math',
    mode: 'diagnosis',
    filePaths: ['/tmp/math-paper.jpg'],
    expectedMinPages: 1,
    expectedKeywords: []
  }])
})

test('loads multiple real image cases from a manifest file', () => {
  const manifestPath = path.join(__dirname, 'fixtures/real-image-manifest.example.json')
  const cases = loadRealImageCases({
    env: { REAL_IMAGE_MANIFEST: manifestPath },
    argv: []
  })

  assert.equal(cases.length, 3)
  assert.equal(cases[0].caseId, 'math-single-clear-page')
  assert.equal(cases[1].filePaths.length, 2)
  assert.equal(cases[2].mode, 'verification')
})

test('mock mode provides a deterministic virtual case without requiring private images', () => {
  const cases = loadRealImageCases({ env: {}, argv: ['--mock'] })

  assert.equal(cases.length, 1)
  assert.equal(cases[0].caseId, 'mock-math-diagnosis')
  assert.equal(cases[0].mock, true)
})

test('validates image case shape and reports path problems clearly', () => {
  assert.throws(
    () => validateRealImageCase({ caseId: 'bad', filePaths: [] }),
    /至少需要 1 张图片/
  )
  assert.throws(
    () => validateRealImageCase({ caseId: 'bad', filePaths: ['relative.jpg'] }),
    /必须使用绝对路径/
  )
})

test('writes a structured temporary real-image report', () => {
  const outputPath = path.join(__dirname, '../tmp/e2e-real-image-report-test.json')
  const report = writeRealImageReport([{
    caseId: 'case-1',
    status: 'passed',
    stages: { upload: 'passed', ai: 'passed', report: 'passed' }
  }], outputPath)

  assert.equal(report.totalCases, 1)
  assert.equal(report.passedCases, 1)
  assert.match(report.outputPath, /e2e-real-image-report-test\.json/)
})

const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')

const root = path.resolve(__dirname, '..')

function read(relativePath) {
  return fs.readFileSync(path.join(root, relativePath), 'utf8')
}

test('paper generation uses targets and pdfFileId consistently', () => {
  const verification = read('miniprogram/pages/generate-verification/generate-verification.js')
  const defaultPaper = read('miniprogram/pages/default-paper/default-paper.js')
  const backend = read('cloudfunctions/generatePaper/index.js')

  assert.doesNotMatch(verification, /bottleneckCodes/)
  assert.match(verification, /targets:/)
  assert.doesNotMatch(verification, /result\.fileID/)
  assert.match(verification, /result\.pdfFileId/)
  assert.doesNotMatch(defaultPaper, /result\.fileID/)
  assert.match(defaultPaper, /result\.pdfFileId/)
  assert.match(backend, /preview/)
  assert.match(backend, /paperKey/)
})

test('report PDF download uses pdfFileId consistently', () => {
  const report = read('miniprogram/pages/report/report.js')
  assert.doesNotMatch(report, /result\.fileID/)
  assert.match(report, /result\.pdfFileId/)
})

test('cloud SDK is initialized before database access', () => {
  for (const relativePath of [
    'cloudfunctions/generatePaper/index.js',
    'cloudfunctions/generateReportPDF/index.js'
  ]) {
    const source = read(relativePath)
    assert.ok(
      source.indexOf('cloud.init(') < source.indexOf('cloud.database()'),
      `${relativePath} must initialize cloud before database access`
    )
  }
})

test('cloud functions do not return stack traces to clients', () => {
  for (const relativePath of [
    'cloudfunctions/analyzeBatch/index.js',
    'cloudfunctions/generatePaper/index.js',
    'cloudfunctions/generateReportPDF/index.js'
  ]) {
    assert.doesNotMatch(read(relativePath), /return\s*\{[^}]*stack\s*:/s)
  }
})

test('report analyzing CSS class names are spelled correctly', () => {
  assert.doesNotMatch(read('miniprogram/pages/report/report.wxss'), /ananlyzing/)
})

test('pages use the shared cloud data access layer', () => {
  const pagesRoot = path.join(root, 'miniprogram/pages')
  const pageFiles = []

  function collect(dir) {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const fullPath = path.join(dir, entry.name)
      if (entry.isDirectory()) collect(fullPath)
      else if (entry.name.endsWith('.js')) pageFiles.push(fullPath)
    }
  }

  collect(pagesRoot)
  for (const file of pageFiles) {
    const source = fs.readFileSync(file, 'utf8')
    assert.doesNotMatch(source, /\bapp\.db\b/, `${file} should not access app.db directly`)
    assert.doesNotMatch(source, /wx\.cloud\.callFunction/, `${file} should use utils/cloud.js`)
  }
})

test('subject profile reads avoid a compound student and subject index', () => {
  for (const relativePath of [
    'miniprogram/utils/cloud.js',
    'cloudfunctions/uploadAndAnalyze/index.js',
    'cloudfunctions/analyzePhotos/index.js',
    'cloudfunctions/generatePaper/index.js'
  ]) {
    assert.doesNotMatch(
      read(relativePath),
      /\.where\(\{\s*studentId(?:\s*:\s*[^,}]+)?,\s*subject\s*\}\)/s,
      `${relativePath} should filter one student's three profiles in memory`
    )
  }
})

test('analysis progress endpoint checks report ownership', () => {
  const source = read('cloudfunctions/getAnalysisProgress/index.js')
  assert.match(source, /cloud\.getWXContext\(\)\.OPENID/)
  assert.match(source, /report\._openid/)
})

test('analysis is started reliably by the server entrypoint', () => {
  const uploadPage = read('miniprogram/pages/upload/upload.js')
  const entrypoint = read('cloudfunctions/uploadAndAnalyze/index.js')

  assert.doesNotMatch(uploadPage, /callAnalyzePhotos/)
  assert.match(entrypoint, /cloud\.callFunction\(\{\s*name:\s*'analyzePhotos'/s)
})

test('analyzing UI only renders a progress bar for real task progress', () => {
  const subjectHome = read('miniprogram/pages/subject-home/subject-home.wxml')
  const report = read('miniprogram/pages/report/report.wxml')

  assert.doesNotMatch(subjectHome, /class="progress-bar"/)
  assert.match(report, /wx:if="\{\{hasAnalysisProgress\}\}"/)
  assert.match(report, /bindtap="onRetryAnalysis"/)
})

test('removed pages and style overrides stay removed', () => {
  assert.equal(fs.existsSync(path.join(root, 'miniprogram/pages/capture/capture.js')), false)
  assert.equal(fs.existsSync(path.join(root, 'miniprogram/pages/student/student.js')), false)

  const wxssFiles = []
  function collectWxss(dir) {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const fullPath = path.join(dir, entry.name)
      if (entry.isDirectory()) collectWxss(fullPath)
      else if (entry.name.endsWith('.wxss')) wxssFiles.push(fullPath)
    }
  }
  collectWxss(path.join(root, 'miniprogram'))
  for (const file of wxssFiles) {
    assert.doesNotMatch(fs.readFileSync(file, 'utf8'), /!important/, `${file} should not use !important`)
  }
})

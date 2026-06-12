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

test('multi-page report PDF buffers pages before adding page numbers', () => {
  const backend = read('cloudfunctions/generateReportPDF/index.js')
  assert.match(backend, /bufferPages:\s*true/)
  assert.match(backend, /bufferedPageRange\(\)/)
  assert.match(backend, /switchToPage\(/)
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

test('cloud functions use deployment configuration instead of a hard-coded environment or font', () => {
  for (const relativePath of [
    'cloudfunctions/analyzeBatch/index.js',
    'cloudfunctions/generatePaper/index.js'
  ]) {
    const source = read(relativePath)
    assert.match(source, /tcb\.SYMBOL_CURRENT_ENV/)
    assert.doesNotMatch(source, /cloud1-d6gneg68m5a7a3876/)
  }

  const reportPdfSource = read('cloudfunctions/generateReportPDF/index.js')
  assert.match(reportPdfSource, /process\.env\.FONT_FILE_ID/)
  assert.doesNotMatch(reportPdfSource, /cloud:\/\/cloud1-d6gneg68m5a7a3876/)
})

test('generatePaper cloud function allows enough time for AI and PDF generation', () => {
  const config = JSON.parse(read('cloudfunctions/generatePaper/config.json'))
  assert.equal(config.timeout, 60)
})

test('generatePaper does not silently fall back to a font without Chinese glyphs', () => {
  const source = read('cloudfunctions/generatePaper/index.js')
  assert.doesNotMatch(source, /FONT_FILE_ID/)
  assert.doesNotMatch(source, /Helvetica/)
  assert.match(source, /pdf-renderer/)
})

test('user-facing bottleneck labels do not render LP codes as primary text', () => {
  const subjectHomePage = read('miniprogram/pages/subject-home/subject-home.wxml')
  const subjectHomeJs = read('miniprogram/pages/subject-home/subject-home.js')
  const verificationPage = read('miniprogram/pages/generate-verification/generate-verification.wxml')
  const paperPreview = read('miniprogram/pages/paper-preview/paper-preview.wxml')
  const reportPage = read('miniprogram/pages/report/report.wxml')
  const pdfRenderer = read('cloudfunctions/generatePaper/pdf-renderer.js')

  assert.match(subjectHomeJs, /require\('\.\/subject-home-presenter'\)/)
  assert.match(subjectHomePage, /\{\{item\.displayName\}\}/)
  assert.match(subjectHomePage, /\{\{item\.detailText\}\}/)
  assert.doesNotMatch(subjectHomePage, /需要进一步验证确认/)
  assert.doesNotMatch(verificationPage, /\{\{item\.lpCode\}\}/)
  assert.match(verificationPage, /\{\{item\.displayName\}\}/)
  assert.match(paperPreview, /\{\{bottleneckText\}\}/)
  assert.doesNotMatch(reportPage, /· \{\{item\.lpCode\}\}/)
  assert.match(reportPage, /\{\{item\.metaText\}\}/)
  assert.doesNotMatch(pdfRenderer, /text\(question\.lpCode/)
})

test('index page is framed as a learning profile home', () => {
  const indexPage = read('miniprogram/pages/index/index.wxml')
  assert.doesNotMatch(indexPage, /选择学生开始诊断/)
  for (const text of ['学习档案', '当前综合摘要', '样本覆盖', '学习观察', '学习记录', '下一步建议']) {
    assert.match(indexPage, new RegExp(text))
  }
})

test('subject select is framed as a secondary subject entry', () => {
  const subjectSelect = read('miniprogram/pages/subject-select/subject-select.wxml')
  assert.doesNotMatch(subjectSelect, /选择诊断学科/)
  assert.match(subjectSelect, /学科入口/)
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

test('uploadAndAnalyze fires analyzePhotos without awaiting', () => {
  const entrypoint = read('cloudfunctions/uploadAndAnalyze/index.js')
  // 不 await，使用 .catch 而非 await + 结果校验
  assert.match(entrypoint, /cloud\.callFunction\(\{\s*name:\s*'analyzePhotos'/s)
  assert.doesNotMatch(entrypoint, /const analyzeRes = await cloud\.callFunction/)
  assert.match(entrypoint, /\.catch\(err\s*=>/)
})

test('upload page does not set a callFunction timeout for analysis', () => {
  const uploadPage = read('miniprogram/pages/upload/upload.js')
  assert.doesNotMatch(uploadPage, /timeout:\s*20000/)
  assert.doesNotMatch(uploadPage, /isTimeoutError/)
  assert.doesNotMatch(uploadPage, /AI将在后台分析/)
})

test('expected retry analysis timeout is treated as background processing', () => {
  const reportPage = read('miniprogram/pages/report/report.js')
  assert.match(reportPage, /callAnalyzePhotos\(\{ reportId: this\.data\.reportId \}, \{ timeout: 20000 \}\)/)
  assert.match(reportPage, /cloud\.isTimeoutError\(err\)/)
  assert.match(reportPage, /分析已重新启动，正在后台处理/)
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

test('photo analysis stores per-image OCR summaries and duplicate state', () => {
  const batch = read('cloudfunctions/analyzeBatch/index.js')
  const analyzer = read('cloudfunctions/analyzePhotos/index.js')
  const upload = read('cloudfunctions/uploadAndAnalyze/index.js')

  assert.match(batch, /pageResults/)
  assert.match(batch, /ocrSummary/)
  assert.match(analyzer, /markDuplicatePages/)
  assert.match(analyzer, /imageFiles/)
  assert.match(upload, /imageFiles/)
  assert.match(upload, /imageMetas/)
})

test('duplicate photos are retained but excluded from diagnostic aggregation', () => {
  const analyzer = read('cloudfunctions/analyzePhotos/index.js')
  assert.match(analyzer, /filter\(page => !page\.isDuplicate\)/)
  assert.match(analyzer, /if \(profileSummary\.isEffective\)/)
  assert.match(analyzer, /本次照片均疑似重复，未更新学习卡点/)
})

test('upload history page is registered and linked from subject home', () => {
  const appConfig = JSON.parse(read('miniprogram/app.json'))
  const subjectHome = read('miniprogram/pages/subject-home/subject-home.js')

  assert.ok(appConfig.pages.includes('pages/upload-history/upload-history'))
  assert.match(subjectHome, /onUploadHistoryTap/)
  assert.equal(fs.existsSync(path.join(root, 'miniprogram/pages/upload-history/upload-history.js')), true)
})

test('upload filename duplicates only produce a soft warning', () => {
  const upload = read('miniprogram/pages/upload/upload.js')
  assert.match(upload, /nameDuplicate/)
  assert.match(upload, /发现同名照片，仍可继续上传/)
  assert.doesNotMatch(upload, /if\s*\([^)]*nameDuplicate[^)]*\)\s*return/)
})

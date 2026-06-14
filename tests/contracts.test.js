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

test('report PDF missing-document check does not treat doc data as an array', () => {
  const backend = read('cloudfunctions/generateReportPDF/index.js')
  assert.doesNotMatch(backend, /reportRes\.data\.length/)
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
  assert.doesNotMatch(reportPdfSource, /process\.env\.FONT_FILE_ID/)
  assert.match(reportPdfSource, /NotoSansCJKsc-Regular\.otf/)
  assert.equal(fs.existsSync(path.join(root, 'cloudfunctions/generateReportPDF/NotoSansCJKsc-Regular.otf')), true)
  assert.doesNotMatch(reportPdfSource, /cloud:\/\/cloud1-d6gneg68m5a7a3876/)
})

test('cloud function timeout configs and active docs use the current 60 second limit', () => {
  const functionsRoot = path.join(root, 'cloudfunctions')
  for (const entry of fs.readdirSync(functionsRoot, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue
    const configPath = path.join(functionsRoot, entry.name, 'config.json')
    if (!fs.existsSync(configPath)) continue

    const config = JSON.parse(fs.readFileSync(configPath, 'utf8'))
    assert.ok(config.timeout <= 60, `${entry.name} timeout should not exceed 60 seconds`)
  }

  for (const relativePath of [
    'README.md',
    'SETUP.md',
    'PROJECT_PLAN.md',
    'PRD.md',
    'docs/CLOUD_FUNCTIONS.md',
    'docs/DATA_DICTIONARY.md',
    'docs/TEST_MATRIX.md',
    'docs/TESTING.md',
    'docs/TROUBLESHOOTING.md'
  ]) {
    assert.doesNotMatch(read(relativePath), /900 秒|900s|共同家长只读|viewer 可读不可写|只允许共享读取/)
  }

  const parentManagementView = read('miniprogram/pages/parent-management/parent-management.wxml')
  const indexPresenter = read('miniprogram/pages/index/index-presenter.js')
  assert.doesNotMatch(parentManagementView, /共同查看|只读/)
  assert.match(parentManagementView, /可以参与孩子的学习诊断/)
  assert.match(indexPresenter, /共同家长，可以参与学习诊断/)
})

test('generatePaper does not silently fall back to a font without Chinese glyphs', () => {
  const source = read('cloudfunctions/generatePaper/index.js')
  assert.doesNotMatch(source, /FONT_FILE_ID/)
  assert.doesNotMatch(source, /Helvetica/)
  assert.match(source, /pdf-renderer/)
})

test('default test script includes printable PDF regression tests', () => {
  const pkg = JSON.parse(read('package.json'))
  assert.match(pkg.scripts.test, /generate-paper-pdf\.test\.js/)
})

test('user-facing bottleneck labels do not render LP codes as primary text', () => {
  const subjectHomePage = read('miniprogram/pages/subject-home/subject-home.wxml')
  const subjectHomeJs = read('miniprogram/pages/subject-home/subject-home.js')
  const verificationPage = read('miniprogram/pages/generate-verification/generate-verification.wxml')
  const centerPage = read('miniprogram/pages/bottleneck-center/bottleneck-center.wxml')
  const detailPage = read('miniprogram/pages/bottleneck-detail/bottleneck-detail.wxml')
  const paperPreview = read('miniprogram/pages/paper-preview/paper-preview.wxml')
  const reportPage = read('miniprogram/pages/report/report.wxml')
  const pdfRenderer = read('cloudfunctions/generatePaper/pdf-renderer.js')

  assert.match(subjectHomeJs, /require\('\.\/subject-home-presenter'\)/)
  assert.match(subjectHomePage, /\{\{item\.displayName\}\}/)
  assert.match(subjectHomePage, /\{\{item\.evidenceText\}\}/)
  assert.doesNotMatch(subjectHomePage, /需要进一步验证确认/)
  assert.doesNotMatch(verificationPage, /\{\{item\.lpCode\}\}/)
  assert.match(verificationPage, /\{\{item\.displayName\}\}/)
  assert.doesNotMatch(centerPage, /<text[^>]*>\s*\{\{item\.lpCode\}\}/)
  assert.match(centerPage, /\{\{item\.displayName\}\}/)
  assert.doesNotMatch(detailPage, /<text[^>]*>\s*\{\{bottleneck\.lpCode\}\}/)
  assert.match(detailPage, /\{\{bottleneck\.displayName\}\}/)
  assert.match(paperPreview, /\{\{bottleneckText\}\}/)
  assert.doesNotMatch(reportPage, /· \{\{item\.lpCode\}\}/)
  assert.match(reportPage, /\{\{item\.metaText\}\}/)
  assert.doesNotMatch(pdfRenderer, /text\(question\.lpCode/)
})

test('bottleneck center and detail pages are registered and share the bottleneck presenter', () => {
  const app = JSON.parse(read('miniprogram/app.json'))
  assert.ok(app.pages.includes('pages/bottleneck-center/bottleneck-center'))
  assert.ok(app.pages.includes('pages/bottleneck-detail/bottleneck-detail'))

  for (const relativePath of [
    'miniprogram/pages/index/index-presenter.js',
    'miniprogram/pages/subject-home/subject-home-presenter.js',
    'miniprogram/pages/bottleneck-center/bottleneck-center.js',
    'miniprogram/pages/bottleneck-detail/bottleneck-detail.js',
    'miniprogram/pages/generate-verification/generate-verification.js'
  ]) {
    assert.match(read(relativePath), /bottleneck-view/, `${relativePath} should use shared bottleneck presenter`)
  }
})

test('single bottleneck actions carry target codes into verification paper generation', () => {
  const indexPage = read('miniprogram/pages/index/index.js')
  const centerPage = read('miniprogram/pages/bottleneck-center/bottleneck-center.js')
  const detailPage = read('miniprogram/pages/bottleneck-detail/bottleneck-detail.js')
  const subjectHomePage = read('miniprogram/pages/subject-home/subject-home.js')

  assert.match(indexPage, /targetCode=\$\{encodeURIComponent\(lpCode\)\}/)
  assert.match(centerPage, /targetCode=\$\{encodeURIComponent\(lpCode\)\}/)
  assert.match(detailPage, /targetCode=\$\{encodeURIComponent\(this\.data\.lpCode\)\}/)
  assert.match(subjectHomePage, /bottleneck-detail\/bottleneck-detail/)
})

test('bottleneck summary helpers use shared display-name modules', () => {
  const frontend = read('miniprogram/utils/bottlenecks.js')
  const pdf = read('cloudfunctions/generatePaper/bottleneck-display.js')

  assert.match(frontend, /require\('\.\/bottleneck-name'\)/)
  assert.match(pdf, /require\('\.\.\/_shared\/bottleneck-name'\)/)
})

test('paper display surfaces use the shared paper display helper', () => {
  for (const relativePath of [
    'miniprogram/pages/paper-preview/paper-preview-presenter.js',
    'miniprogram/pages/upload/upload.js',
    'miniprogram/pages/upload-history/upload-history-presenter.js',
    'miniprogram/pages/index/index-presenter.js'
  ]) {
    assert.match(read(relativePath), /paper-display/)
  }
})

test('analysis status pages use the shared analysis poller wrapper', () => {
  for (const relativePath of [
    'miniprogram/pages/subject-home/subject-home.js',
    'miniprogram/pages/report/report.js'
  ]) {
    const source = read(relativePath)
    assert.match(source, /analysis-poller/)
    assert.doesNotMatch(source, /utils\/poller/)
  }
})

test('heavy pages keep presentation logic in presenter modules', () => {
  const uploadHistory = read('miniprogram/pages/upload-history/upload-history.js')
  const paperPreview = read('miniprogram/pages/paper-preview/paper-preview.js')

  assert.match(uploadHistory, /require\('\.\/upload-history-presenter'\)/)
  assert.match(paperPreview, /require\('\.\/paper-preview-presenter'\)/)
  assert.doesNotMatch(uploadHistory, /function buildTimelineEvents/)
  assert.doesNotMatch(paperPreview, /function buildPaperPreviewState/)
})

test('verification paper workbench exposes paper code, content preview and feedback entry', () => {
  const paperPreviewView = read('miniprogram/pages/paper-preview/paper-preview.wxml')
  const paperPreviewPage = read('miniprogram/pages/paper-preview/paper-preview.js')
  const paperPreviewPresenter = read('miniprogram/pages/paper-preview/paper-preview-presenter.js')
  const uploadView = read('miniprogram/pages/upload/upload.wxml')
  const uploadPage = read('miniprogram/pages/upload/upload.js')
  const dataFunction = read('cloudfunctions/studentData/index.js')

  assert.match(paperPreviewView, /验证试卷编号/)
  assert.match(paperPreviewView, /\{\{paperCodeText/)
  assert.match(paperPreviewView, /试卷内容预览/)
  assert.match(paperPreviewView, /验证反馈/)
  assert.match(paperPreviewPresenter, /latestVerificationReport/)
  assert.match(paperPreviewPage, /onViewFeedbackReport/)
  assert.match(uploadView, /正在上传到/)
  assert.match(uploadPage, /loadPaperContext/)
  assert.match(dataFunction, /latestVerificationReport/)
  assert.match(dataFunction, /paperDisplayCode/)
})

test('bottleneck detail uses one differentiated evidence chain instead of duplicate lists', () => {
  const view = read('miniprogram/pages/bottleneck-detail/bottleneck-detail.wxml')
  const page = read('miniprogram/pages/bottleneck-detail/bottleneck-detail.js')

  assert.match(view, /卡点证据链/)
  assert.match(view, /visibleEvidenceChain/)
  assert.match(view, /metaChips/)
  assert.match(page, /hiddenEvidenceCount/)
  assert.doesNotMatch(view, /相关报告/)
  assert.doesNotMatch(view, /相关验证卷/)
})

test('subject home is an action workbench instead of another diagnosis summary', () => {
  const subjectHomePage = read('miniprogram/pages/subject-home/subject-home.wxml')

  assert.match(subjectHomePage, /待处理队列/)
  assert.match(subjectHomePage, /工具/)
  assert.doesNotMatch(subjectHomePage, /当前综合诊断/)
  assert.doesNotMatch(subjectHomePage, /最近变化/)
  assert.doesNotMatch(subjectHomePage, /diagnosis-hero/)
  assert.doesNotMatch(subjectHomePage, /math-diagnostic-guide\.jpg/)
})

test('verification page is framed as a paper configurator', () => {
  const verificationPage = read('miniprogram/pages/generate-verification/generate-verification.wxml')

  assert.match(verificationPage, /出卷配置/)
  assert.match(verificationPage, /出题范围/)
  assert.match(verificationPage, /试卷配置/)
  assert.doesNotMatch(verificationPage, /系统针对每个卡点生成 3 道验证题/)
})

test('index page is an adaptive entry and child cards route through student profile tap', () => {
  const indexPage = read('miniprogram/pages/index/index.wxml')
  const studentProfilePage = read('miniprogram/pages/student-profile/student-profile.wxml')
  assert.doesNotMatch(indexPage, /选择学生开始诊断/)
  assert.doesNotMatch(indexPage, /home\.observations/)
  assert.doesNotMatch(indexPage, /孩子学习工作台/)
  assert.equal((indexPage.match(/添加孩子/g) || []).length, 1)
  for (const text of ['家庭学习工作台', '学习档案', '当前综合摘要', '样本覆盖', '重点提示', '学习记录', '下一步建议']) {
    assert.match(indexPage, new RegExp(text))
  }
  for (const page of [indexPage, studentProfilePage]) {
    assert.match(page, /home\.primaryReport\.generatedAtText/)
    assert.match(page, /home\.primaryReport\.evidenceTimeText/)
    assert.match(page, /home\.primaryReport\.findingText/)
  }
  assert.match(indexPage, /class="child-card[\s\S]*bindtap="onStudentTap"/)
  assert.match(indexPage, /data-id="\{\{child\.id\}\}"/)
  assert.match(indexPage, /wx:if="\{\{homeMode === 'family-workbench' && childCards\.length > 0\}\}"/)
  assert.match(indexPage, /wx:if="\{\{homeMode === 'single-profile'\}\}"/)
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

test('analysis progress endpoint uses shared resource access checks', () => {
  const source = read('cloudfunctions/getAnalysisProgress/index.js')
  const accessSource = read('cloudfunctions/_shared/access.js')
  assert.match(source, /cloud\.getWXContext\(\)\.OPENID/)
  assert.match(source, /getLearningResourceAccess/)
  assert.match(source, /canReadLearning/)
  assert.match(accessSource, /resource\._openid/)
  assert.match(accessSource, /getActiveMember/)
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
  assert.match(batch, /不要推断年级/)
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

test('upload history uses a unified learning timeline with subject filters', () => {
  const page = read('miniprogram/pages/upload-history/upload-history.js')
  const view = read('miniprogram/pages/upload-history/upload-history.wxml')

  assert.match(page, /activeSubject/)
  assert.match(page, /allDays/)
  assert.match(page, /onFilterTap/)
  assert.match(view, /filter-bar/)
  assert.match(view, /wx:for="\{\{filters\}\}"/)
  assert.doesNotMatch(page, /subjectName\}学习记录/)
  assert.doesNotMatch(page, /数学学习记录/)
})

test('learning record surfaces use the four-level display taxonomy', () => {
  const page = read('miniprogram/pages/upload-history/upload-history.js')
  const presenter = read('miniprogram/pages/upload-history/upload-history-presenter.js')
  const view = read('miniprogram/pages/upload-history/upload-history.wxml')
  const style = read('miniprogram/pages/upload-history/upload-history.wxss')
  const indexPresenter = read('miniprogram/pages/index/index-presenter.js')

  assert.match(page, /buildTimelineEvents/)
  assert.match(page, /statusItems/)
  assert.match(presenter, /foldedEvidence/)
  assert.match(presenter, /isMainTimelinePaper/)
  assert.match(presenter, /buildPaperCodeById/)
  assert.match(presenter, /showPaperCode/)
  assert.match(view, /status-strip/)
  assert.match(view, /paper-code-row/)
  assert.match(view, /验证卷编号/)
  assert.match(view, /onPreviewFoldedEvidence/)
  assert.match(style, /fold-row/)
  assert.match(style, /paper-code-value/)
  assert.match(style, /status-strip/)
  assert.match(indexPresenter, /isMainTimelinePaper/)
  assert.doesNotMatch(indexPresenter, /buildUploadRecord/)
})

test('upload filename duplicates only produce a soft warning', () => {
  const upload = read('miniprogram/pages/upload/upload.js')
  assert.match(upload, /nameDuplicate/)
  assert.match(upload, /发现同名照片，仍可继续上传/)
  assert.doesNotMatch(upload, /if\s*\([^)]*nameDuplicate[^)]*\)\s*return/)
})

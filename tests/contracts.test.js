const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')

const root = path.resolve(__dirname, '..')

function read(relativePath) {
  return fs.readFileSync(path.join(root, relativePath), 'utf8')
}

function packageScripts() {
  return JSON.parse(read('package.json')).scripts
}

// ── Cloud SDK & environment ──

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

// ── PDF & fonts ──

test('generatePaper does not silently fall back to a font without Chinese glyphs', () => {
  const source = read('cloudfunctions/generatePaper/index.js')
  assert.doesNotMatch(source, /FONT_FILE_ID/)
  assert.doesNotMatch(source, /Helvetica/)
  assert.match(source, /pdf-renderer/)
})

// ── Security ──

test('cloud functions do not return stack traces to clients', () => {
  for (const relativePath of [
    'cloudfunctions/analyzeBatch/index.js',
    'cloudfunctions/generatePaper/index.js',
    'cloudfunctions/generateReportPDF/index.js'
  ]) {
    assert.doesNotMatch(read(relativePath), /return\s*\{[^}]*stack\s*:/s)
  }
})

// ── Data access architecture ──

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
  const accessSource = read('cloudfunctions/getAnalysisProgress/access.js')
  assert.match(source, /cloud\.getWXContext\(\)\.OPENID/)
  assert.match(source, /getLearningResourceAccess/)
  assert.match(source, /canReadLearning/)
  assert.match(accessSource, /resource\._openid/)
  assert.match(accessSource, /getActiveMember/)
})

test('studentData cloud function reuses shared access helpers', () => {
  const source = read('cloudfunctions/studentData/index.js')
  // access.js 现在是云函数根级文件（不再用 _shared 子目录）
  assert.match(source, /require\(['"]\.\/access['"]\)/)
  assert.doesNotMatch(source, /function permissionsForRole/)
  assert.doesNotMatch(source, /function canManageFamily/)
  assert.match(source, /getStudentAccess\(db, studentId, openId\)/)
})

test('reportFeedback cloud function reuses shared access helpers', () => {
  const source = read('cloudfunctions/reportFeedback/index.js')
  assert.match(source, /require\(['"]\.\/access['"]\)/)
  assert.doesNotMatch(source, /function getLearningResourceAccess/)
  assert.doesNotMatch(source, /function canOperateLearning/)
  assert.doesNotMatch(source, /function canReadLearning/)
  assert.match(source, /getLearningResourceAccess\(db, report, openId\)/)
})

test('cloud client exposes learning resource methods', () => {
  const source = read('miniprogram/utils/cloud.js')
  for (const wrapper of [
    'generateLearningResourcePack',
    'getLearningResourcePack',
    'completeLearningResourcePack',
    'scheduleResourcePackVerification'
  ]) {
    assert.match(source, new RegExp(`async function ${wrapper}\\b`), `${wrapper} should be implemented`)
    assert.match(source, new RegExp(`${wrapper},`), `${wrapper} should be exported`)
  }
})

// ── Shared modules & display helpers ──

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

test('bottleneck summary helpers use shared display-name modules', () => {
  const frontend = read('miniprogram/utils/bottlenecks.js')
  const pdf = read('cloudfunctions/generatePaper/bottleneck-display.js')

  assert.match(frontend, /require\('\.\/bottleneck-name'\)/)
  assert.match(pdf, /require\('\.\/bottleneck-name'\)/)
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

// ── Test framework contracts ──

test('E2E test framework V2 package scripts expose unit and subject CLI suites', () => {
  const scripts = packageScripts()

  assert.equal(scripts.test, 'npm run test:unit')
  assert.match(scripts['test:unit'], /^node --test --test-concurrency=1 /)
  assert.match(scripts['test:coverage'], /--experimental-test-coverage/)

  assert.equal(scripts['test:e2e:doctor'], 'node scripts/devtools-cli-doctor.js')
  assert.equal(scripts['test:e2e:core'], 'node scripts/devtools-e2e-fullpage.js')
  assert.match(scripts['test:e2e:math'], /test:e2e:data-driven/)
  assert.match(scripts['test:e2e:math'], /test:e2e:knowledge-map/)
  assert.equal(scripts['test:e2e:chinese'], 'node scripts/devtools-e2e-chinese.js')
  assert.equal(scripts['test:e2e:english'], 'node scripts/devtools-english-e2e.js')
  assert.match(scripts['test:e2e:all'], /test:e2e:core/)
  assert.match(scripts['test:e2e:all'], /test:e2e:math/)
  assert.match(scripts['test:e2e:all'], /test:e2e:english/)
  assert.match(scripts['test:e2e:all'], /e2e-report-aggregator/)

  assert.equal(scripts['test:e2e:real-data'], 'node scripts/devtools-real-data-smoke.js')
  assert.equal(scripts['test:e2e:real-image'], 'node tests/e2e-real-image.test.js')
  assert.equal(scripts['test:e2e:real-cloud'], 'RUN_REAL_CLOUD=1 node --test tests/e2e-real-cloud.test.js')

  assert.equal(scripts['test:devtools-english'], 'npm run test:e2e:english')
  assert.equal(scripts['test:devtools-parent-timeline'], 'node scripts/devtools-parent-timeline-e2e.js')
  assert.equal(scripts['test:real-data-smoke'], 'npm run test:e2e:real-data')
  assert.equal(scripts['test:e2e-real-image'], 'npm run test:e2e:real-image')
  assert.equal(scripts['test:real-cloud'], 'npm run test:e2e:real-cloud')
})

test('E2E test framework V2 aggregator reads standardized tmp/e2e suite reports', () => {
  const source = read('scripts/e2e-report-aggregator.js')

  for (const expected of [
    'tmp/e2e/core',
    'tmp/e2e/math-data',
    'tmp/e2e/math-knowledge-map',
    'tmp/e2e/english',
    'tmp/e2e/real-data'
  ]) {
    assert.match(source, new RegExp(expected.replace(/\//g, '\\/')), `aggregator should read ${expected}`)
  }

  for (const historical of [
    'tmp/e2e-english',
    'tmp/e2e-parent-timeline',
    'tmp/e2e-real-data-smoke'
  ]) {
    assert.doesNotMatch(source, new RegExp(historical.replace(/\//g, '\\/')), `aggregator should not depend on historical path ${historical}`)
  }

  assert.match(source, /report\.json/)
  assert.match(source, /results\.json/)
  assert.match(source, /data-driven-report\.json/)
})

// ── Analysis pipeline reliability ──

test('analysis is started reliably by the server entrypoint', () => {
  const uploadPage = read('miniprogram/pages/upload/upload.js')
  const entrypoint = read('cloudfunctions/uploadAndAnalyze/index.js')

  assert.doesNotMatch(uploadPage, /callAnalyzePhotos/)
  assert.match(entrypoint, /cloud\.callFunction\(\{\s*name:\s*'analyzePhotos'/s)
})

test('uploadAndAnalyze fires analyzePhotos without awaiting', () => {
  const entrypoint = read('cloudfunctions/uploadAndAnalyze/index.js')
  assert.match(entrypoint, /cloud\.callFunction\(\{\s*name:\s*'analyzePhotos'/s)
  assert.doesNotMatch(entrypoint, /const analyzeRes = await cloud\.callFunction/)
  // 契约意图：必须有 catch 错误处理（兼容 async/非 async 两种签名）
  assert.match(entrypoint, /\.catch\((?:async\s+)?\(?\s*err\s*\)?\s*=>/)
})

test('analyzeBatch prompt uses shared bottleneck names instead of drifted inline labels', () => {
  const batch = read('cloudfunctions/analyzeBatch/index.js')

  assert.match(batch, /BOTTLENECK_CODE_NAMES/)
  assert.doesNotMatch(batch, /识字量不足/)
  assert.doesNotMatch(batch, /作文结构混乱/)
  assert.doesNotMatch(batch, /拼音\/笔顺错误/)
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

// ── Dead code prevention ──

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

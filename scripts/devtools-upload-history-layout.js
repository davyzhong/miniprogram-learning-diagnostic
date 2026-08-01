const path = require('node:path')
const fs = require('node:fs')
const { findRenderedInternalCodes } = require('./devtools-family-density-e2e')

const PROJECT_PATH = path.resolve(__dirname, '..')
const CLI_PATH = process.env.WECHAT_DEVTOOLS_CLI || '/Applications/wechatwebdevtools.app/Contents/MacOS/cli'
const OUTPUT_DIR = path.join(PROJECT_PATH, 'tmp', 'e2e', 'upload-history-layout')
const SCREENSHOT_PATH = path.join(OUTPUT_DIR, 'learning-record-timeline-narrow.png')
const MAX_NARROW_WIDTH = 430
const REQUIRED_VIEWPORT_WIDTH = 375
const REQUIRED_VIEWPORT_HEIGHT = 812
const MIN_FILTER_CONTROLS = 4
const MIN_RECORD_CARDS = 2
const MAX_CARD_HEIGHT = 420
const MAX_EVIDENCE_HEIGHT = 80
const MAX_CODE_HEIGHT = 32

function numberOf(value) {
  const number = Number.parseFloat(value)
  return Number.isFinite(number) ? number : 0
}

function normalizedRect(rect = {}) {
  return {
    left: numberOf(rect.left),
    top: numberOf(rect.top),
    width: numberOf(rect.width),
    height: numberOf(rect.height)
  }
}

function rectsOverlap(a, b) {
  const first = normalizedRect(a)
  const second = normalizedRect(b)
  return first.left < second.left + second.width
    && first.left + first.width > second.left
    && first.top < second.top + second.height
    && first.top + first.height > second.top
}

function validateLayoutMetrics(metrics = {}) {
  const windowWidth = numberOf(metrics.windowWidth)
  const windowHeight = numberOf(metrics.windowHeight)
  const pageWidth = numberOf(metrics.pageWidth)
  if (!windowWidth || windowWidth > MAX_NARROW_WIDTH) {
    throw new Error(`narrow viewport required, got ${windowWidth}px`)
  }
  if (windowWidth !== REQUIRED_VIEWPORT_WIDTH || windowHeight < REQUIRED_VIEWPORT_HEIGHT) {
    throw new Error(`375 × 812 viewport required, got ${windowWidth} × ${windowHeight}px`)
  }
  if (Number(metrics.filterCount) < MIN_FILTER_CONTROLS) {
    throw new Error(`expected at least ${MIN_FILTER_CONTROLS} filter controls, got ${metrics.filterCount || 0}`)
  }
  if (Number(metrics.recordCount) < MIN_RECORD_CARDS) {
    throw new Error(`expected at least ${MIN_RECORD_CARDS} record cards, got ${metrics.recordCount || 0}`)
  }
  if (pageWidth > windowWidth + 1) {
    throw new Error(`horizontal overflow: page ${pageWidth}px exceeds viewport ${windowWidth}px`)
  }
  if (numberOf(metrics.codeHeight) > MAX_CODE_HEIGHT) {
    throw new Error(`paper code line is not compact: ${metrics.codeHeight}px`)
  }

  for (const rawRect of metrics.cardRects || []) {
    const rect = normalizedRect(rawRect)
    if (rect.left < 0 || rect.left + rect.width > windowWidth + 1) {
      throw new Error(`horizontal overflow in record card: ${JSON.stringify(rect)}`)
    }
    if (rect.height > MAX_CARD_HEIGHT) {
      throw new Error(`card height exceeds ${MAX_CARD_HEIGHT}px: ${rect.height}px`)
    }
  }
  for (const rawRect of metrics.evidenceRects || []) {
    const rect = normalizedRect(rawRect)
    if (rect.left < 0 || rect.left + rect.width > windowWidth + 1) {
      throw new Error(`horizontal overflow in evidence row: ${JSON.stringify(rect)}`)
    }
    if (rect.height > MAX_EVIDENCE_HEIGHT) {
      throw new Error(`evidence height exceeds ${MAX_EVIDENCE_HEIGHT}px: ${rect.height}px`)
    }
  }
  if (rectsOverlap(metrics.titleRect, metrics.metaRect)) {
    throw new Error('title and metadata overlap')
  }
  return true
}

function loadAutomator() {
  try {
    return require('miniprogram-automator')
  } catch (error) {
    return require('/tmp/learning-diagnostic-automator/node_modules/miniprogram-automator')
  }
}

async function installTimelineMocks(miniProgram) {
  await miniProgram.evaluate(() => {
    const paperCode = '超长学科学习验证试卷号-20260712-999'
    const imageFiles = Array.from({ length: 5 }, (_, index) => ({
      fileID: `cloud://layout/evidence-${index + 1}.jpg`,
      fileName: `第${index + 1}页数学验证作答.jpg`,
      ocrSummary: `第${index + 1}页包含完整计算过程`,
      isDuplicate: false
    }))
    const reports = [{
      _id: 'report-layout',
      studentId: 'student-layout',
      subject: 'math',
      type: 'verification',
      status: 'completed',
      paperId: 'paper-layout',
      createdAt: '2026-07-12T10:30:00+08:00',
      evidenceTime: '2026-07-12T10:30:00+08:00',
      comparisonSummary: '小数乘法计算已改善，应用题审题仍需巩固。',
      imageFiles
    }, {
      _id: 'report-layout-diagnosis',
      studentId: 'student-layout',
      subject: 'math',
      type: 'diagnosis',
      status: 'completed',
      createdAt: '2026-07-12T09:20:00+08:00',
      summary: '分数计算诊断已完成，可查看本次结果。',
      imageFiles: imageFiles.slice(0, 1)
    }]
    const papers = [{
      _id: 'paper-layout',
      studentId: 'student-layout',
      subject: 'math',
      type: 'verification',
      paperDisplayCode: paperCode,
      generatedAt: '2026-07-12T10:00:00+08:00',
      paperDate: '2026-07-12',
      questionCount: 36,
      studentPages: 12,
      answerPages: 4,
      bottleneckTargets: Array.from({ length: 36 }, (_, index) => `BN-LAYOUT-${index + 1}`)
    }]

    wx.cloud.callFunction = async ({ name, data }) => {
      if (name === 'studentData' && data && data.action === 'getLearningTimeline') {
        return { result: { success: true, reports, papers, permissions: {}, hasMore: false } }
      }
      if (name === 'studentData' && data && data.action === 'cleanupStaleLearningRecords') {
        return { result: { success: true, cleanedCount: 0, cleanedReportIds: [], permissions: {} } }
      }
      return { result: { success: false, error: `unhandled layout mock ${name}:${data && data.action}` } }
    }
    wx.cloud.getTempFileURL = async ({ fileList }) => ({
      fileList: (fileList || []).map(fileID => ({ fileID, tempFileURL: '/assets/images/app-logo-share.jpg' }))
    })
  })
}

async function elementRect(element) {
  const [size, offset] = await Promise.all([element.size(), element.offset()])
  return normalizedRect({ ...offset, ...size })
}

async function collectLayoutMetrics(miniProgram, page) {
  const systemInfo = await miniProgram.systemInfo()
  const pageSize = await page.size()
  const cards = await page.$$('.record-card')
  const filters = await page.$$('.filter-pill')
  const paperCard = await page.$('.record-verification-paper')
  const verificationReportCard = await page.$('.record-verification-report')
  const code = paperCard && await paperCard.$('.paper-code')
  const title = paperCard && await paperCard.$('.event-title')
  const meta = paperCard && await paperCard.$('.event-meta')
  if (!paperCard || !verificationReportCard || !code || !title || !meta) {
    throw new Error('paper/report card layout elements not found')
  }
  const evidenceRows = await verificationReportCard.$$('.fold-row')
  if (evidenceRows.length !== 3) throw new Error(`expected 3 inline evidence rows, got ${evidenceRows.length}`)
  if (filters.length < MIN_FILTER_CONTROLS) throw new Error(`expected at least ${MIN_FILTER_CONTROLS} filter controls, got ${filters.length}`)
  if (cards.length < MIN_RECORD_CARDS) throw new Error(`expected at least ${MIN_RECORD_CARDS} record cards, got ${cards.length}`)

  return {
    windowWidth: systemInfo.windowWidth,
    windowHeight: systemInfo.windowHeight,
    pageWidth: pageSize.width,
    filterCount: filters.length,
    recordCount: cards.length,
    codeHeight: (await code.size()).height,
    cardRects: await Promise.all(cards.map(elementRect)),
    evidenceRects: await Promise.all(evidenceRows.map(elementRect)),
    titleRect: await elementRect(title),
    metaRect: await elementRect(meta)
  }
}

async function main() {
  const automator = loadAutomator()
  let miniProgram
  try {
    fs.mkdirSync(OUTPUT_DIR, { recursive: true })
    miniProgram = await automator.launch({
      cliPath: CLI_PATH,
      projectPath: PROJECT_PATH,
      trustProject: true,
      timeout: 60000
    })
    await installTimelineMocks(miniProgram)
    const page = await miniProgram.reLaunch(
      '/pages/upload-history/upload-history?studentId=student-layout&studentName=布局验证&subject=math&subjectName=数学'
    )
    await page.waitFor('.record-verification-paper')
    await page.waitFor(800)
    const text = await (await page.$('.page')).text()
    if (!text.includes('超长学科学习验证试卷号-20260712-999')) {
      throw new Error('long readable paper code did not render')
    }
    if (!text.includes('还有 2 张证据')) throw new Error('remaining evidence count did not render')
    const leaks = findRenderedInternalCodes(text)
    if (leaks.length) throw new Error(`learning history rendered internal codes: ${leaks.join(', ')}`)

    const metrics = await collectLayoutMetrics(miniProgram, page)
    validateLayoutMetrics(metrics)
    await miniProgram.screenshot({ path: SCREENSHOT_PATH })
    const report = {
      status: 'PASS',
      summary: { total: 1, passed: 1, failed: 0 },
      screenshot: SCREENSHOT_PATH,
      metrics
    }
    fs.writeFileSync(path.join(OUTPUT_DIR, 'report.json'), JSON.stringify(report, null, 2))
    console.log(JSON.stringify(report, null, 2))
  } finally {
    if (miniProgram) await miniProgram.close()
  }
}

module.exports = {
  collectLayoutMetrics,
  validateLayoutMetrics
}

if (require.main === module) {
  main().catch(error => {
    console.error(error && (error.stack || error.message || String(error)))
    process.exitCode = 1
  })
}

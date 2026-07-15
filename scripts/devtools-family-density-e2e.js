#!/usr/bin/env node

const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')

const PROJECT_PATH = path.resolve(__dirname, '..')
const CLI_PATH = process.env.WECHAT_DEVTOOLS_CLI
  || (process.platform === 'darwin' ? '/Applications/wechatwebdevtools.app/Contents/MacOS/cli' : 'cli')
const OUTPUT_DIR = path.join(PROJECT_PATH, 'tmp', 'e2e', 'family-density')
const TARGET_VIEWPORTS = new Map([
  ['390x844', { width: 390, height: 844 }],
  ['430x932', { width: 430, height: 932 }]
])
const MAX_VIEWPORT_WIDTH = 430
const MIN_INTERACTIVE_HEIGHT = 43
const EDGE_TOLERANCE = 1

const INTERNAL_CODE_PATTERN = /(?:\b(?:(?:BN|LP|ERR|NODE|RES)-[A-Z0-9_-]+|CHI-(?!\d{8}-\d+\b)[A-Z0-9_-]+|MATH-(?!(?:\d{8}-\d+|\d{2,3})\b)[A-Z0-9_-]+|(?:TASK|PAGE|VER)-[A-Z0-9_-]+)\b|(?:cloud|wxfile|file|db):\/\/[^\s，。；！？、]+|\b[a-f0-9]{24}\b|\b[a-f0-9]{8}-[a-f0-9]{4}-[1-5][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}\b|\b(?=[A-Z0-9_-]{20,}\b)(?=[A-Z0-9_-]*[A-Z])(?=[A-Z0-9_-]*\d)[A-Z0-9_-]+\b)/gi

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

function bottomOf(rect) {
  const value = normalizedRect(rect)
  return value.top + value.height
}

function rightOf(rect) {
  const value = normalizedRect(rect)
  return value.left + value.width
}

function rectsOverlap(firstRect, secondRect) {
  const first = normalizedRect(firstRect)
  const second = normalizedRect(secondRect)
  return first.left < rightOf(second)
    && rightOf(first) > second.left
    && first.top < bottomOf(second)
    && bottomOf(first) > second.top
}

function findRenderedInternalCodes(text = '') {
  return [...new Set(String(text).match(INTERNAL_CODE_PATTERN) || [])]
}

function assertHorizontallyContained(rect, viewportWidth, label, failureText = 'exceeds viewport') {
  const value = normalizedRect(rect)
  if (value.width <= 0 || value.left < -EDGE_TOLERANCE || rightOf(value) > viewportWidth + EDGE_TOLERANCE) {
    throw new Error(`${label} ${failureText}: ${JSON.stringify(value)} within ${viewportWidth}px`)
  }
}

function assertContainedBy(rect, containerRect, label) {
  const value = normalizedRect(rect)
  const container = normalizedRect(containerRect)
  const clipped = value.width <= 0
    || value.height <= 0
    || value.left < container.left - EDGE_TOLERANCE
    || value.top < container.top - EDGE_TOLERANCE
    || rightOf(value) > rightOf(container) + EDGE_TOLERANCE
    || bottomOf(value) > bottomOf(container) + EDGE_TOLERANCE
  if (clipped) {
    throw new Error(`${label} is clipped by its container: ${JSON.stringify(value)} within ${JSON.stringify(container)}`)
  }
}

function validateFamilyDensityMetrics(metrics = {}) {
  const viewport = {
    width: numberOf(metrics.viewport && metrics.viewport.width),
    height: numberOf(metrics.viewport && metrics.viewport.height)
  }
  const targetKey = `${viewport.width}x${viewport.height}`
  if (!TARGET_VIEWPORTS.has(targetKey)) {
    throw new Error(
      `incompatible simulator viewport ${targetKey}; select a simulator whose wx window is exactly `
      + '390x844 or 430x932, then rerun npm run test:e2e:family-density'
    )
  }
  if (viewport.width > MAX_VIEWPORT_WIDTH) {
    throw new Error(`viewport must be no wider than ${MAX_VIEWPORT_WIDTH}px, got ${viewport.width}px`)
  }
  if (numberOf(metrics.pageWidth) > viewport.width + EDGE_TOLERANCE) {
    throw new Error(`horizontal overflow: page ${metrics.pageWidth}px exceeds viewport ${viewport.width}px`)
  }

  assertHorizontallyContained(metrics.householdSummaryRect, viewport.width, 'household summary')
  const cards = Array.isArray(metrics.cards) ? metrics.cards : []
  if (cards.length !== 2) throw new Error(`expected exactly 2 child cards, got ${cards.length}`)

  cards.forEach((card, cardIndex) => {
    assertHorizontallyContained(card.cardRect, viewport.width, `child ${cardIndex + 1} card`, 'exceeds viewport')
    for (const [blockName, rect] of [
      ['identity', card.identityRect],
      ['metric strip', card.metricRect],
      ['priority block', card.priorityRect]
    ]) {
      assertHorizontallyContained(rect, viewport.width, `child ${cardIndex + 1} ${blockName}`)
    }
    for (const actionRect of card.actionRects || []) {
      assertHorizontallyContained(actionRect, viewport.width, `child ${cardIndex + 1} action`, 'is clipped')
    }
    for (const bounded of card.boundedRects || []) {
      assertContainedBy(
        bounded.rect,
        bounded.containerRect,
        `child ${cardIndex + 1} ${bounded.label || 'label/action'}`
      )
    }
    for (const interactiveRect of card.interactiveRects || []) {
      const rect = normalizedRect(interactiveRect)
      assertHorizontallyContained(rect, viewport.width, `child ${cardIndex + 1} interactive row`)
      if (rect.height + EDGE_TOLERANCE < MIN_INTERACTIVE_HEIGHT) {
        throw new Error(
          `child ${cardIndex + 1} interactive row is below practical height: `
          + `${rect.height}px < ${MIN_INTERACTIVE_HEIGHT}px`
        )
      }
    }
    const adjacentRects = card.adjacentRects || []
    for (let index = 1; index < adjacentRects.length; index += 1) {
      if (rectsOverlap(adjacentRects[index - 1], adjacentRects[index])) {
        throw new Error(`child ${cardIndex + 1} adjacent blocks overlap at index ${index - 1}/${index}`)
      }
    }
  })

  const firstViewportRects = [
    ['household summary', metrics.householdSummaryRect],
    ['first child identity', cards[0].identityRect],
    ['first child metric strip', cards[0].metricRect],
    ['first child priority block', cards[0].priorityRect]
  ]
  for (const [label, rect] of firstViewportRects) {
    if (bottomOf(rect) > viewport.height + EDGE_TOLERANCE) {
      throw new Error(`${label} bottom ${bottomOf(rect)}px exceeds first viewport ${viewport.height}px`)
    }
  }

  if (viewport.width === 390 && bottomOf(cards[1].identityRect) > 844 + EDGE_TOLERANCE) {
    throw new Error(`second child identity bottom ${bottomOf(cards[1].identityRect)}px exceeds 844px`)
  }
  if (viewport.width === 430 && bottomOf(cards[1].metricRect) > 932 + EDGE_TOLERANCE) {
    throw new Error(`second child metric strip bottom ${bottomOf(cards[1].metricRect)}px exceeds 932px`)
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

async function installFamilyDensityMocks(miniProgram) {
  await miniProgram.evaluate(() => {
    const now = '2026-07-12T10:30:00+08:00'
    const permissions = {
      canView: true,
      canManageParents: true,
      canUpload: true,
      canGeneratePaper: true,
      canRetryAnalysis: true
    }
    const students = [
      { _id: 'student-density-one', name: '学生A的超长学习档案示例', grade: 6, createdAt: now, role: 'owner', memberCount: 3, permissions },
      { _id: 'student-density-two', name: '学生B的第二个学习档案示例', grade: 4, createdAt: '2026-07-11T10:30:00+08:00', role: 'owner', memberCount: 2, permissions }
    ]
    const profileFor = (studentId, suffix) => [{
      _id: `profile-${suffix}-math`,
      studentId,
      subject: 'math',
      subjectName: '数学',
      totalReports: 4,
      updatedAt: now,
      currentBottlenecks: [
        { lpCode: 'LP-001', status: 'needs_verification', severity: 'medium' },
        { bottleneckId: 'BN-DEC-DIV-POINT-MOVE', displayName: '除数是小数时小数点移动规则与商的小数点定位综合理解', status: 'persisting', severity: 'high' },
        { nodeId: 'MATH-NUM-DEC-MUL-POINT', title: '小数乘法中积的小数位数累计与末尾零处理', status: 'improved', severity: 'medium' }
      ]
    }, {
      _id: `profile-${suffix}-chinese`,
      studentId,
      subject: 'chinese',
      subjectName: '语文',
      totalReports: 2,
      updatedAt: now,
      currentBottlenecks: [{ lpCode: 'CHI-READ-01', lpName: '长篇阅读中跨段落信息整合与中心意思概括', status: 'needs_verification' }]
    }, {
      _id: `profile-${suffix}-english`,
      studentId,
      subject: 'english',
      subjectName: '英语',
      totalReports: 1,
      updatedAt: now,
      currentBottlenecks: [{ lpCode: 'LP-008', lpName: '较长英语句子中的时态线索识别与听写复核', status: 'improved' }]
    }]
    const reportFor = (studentId, suffix, subject = 'math') => ({
      _id: `report-${suffix}`,
      studentId,
      subject,
      subjectName: subject === 'math' ? '数学' : '语文',
      type: 'diagnosis',
      status: 'completed',
      isEffective: true,
      createdAt: now,
      evidenceTime: now,
      summary: '正式诊断显示：多步骤小数运算、跨条件审题和完整验算表达仍需连续巩固。',
      totalErrors: 5,
      bottlenecks: [
        { lpCode: 'LP-001' },
        { nodeId: 'MATH-NUM-DEC-MUL-POINT', displayName: '小数乘法中积的小数位数累计与末尾零处理' }
      ],
      imageFiles: [{ fileID: `cloud://density/${suffix}.jpg`, fileName: '完整数学诊断作答证据.jpg', ocrSummary: '完整计算过程' }]
    })
    const reports = [
      reportFor(students[0]._id, 'one-math'),
      { ...reportFor(students[0]._id, 'one-chinese', 'chinese'), createdAt: '2026-07-11T09:00:00+08:00' },
      reportFor(students[1]._id, 'two-math')
    ]
    const papers = students.map((student, index) => ({
      _id: `paper-density-${index + 1}`,
      studentId: student._id,
      subject: 'math',
      subjectName: '数学',
      type: 'verification',
      status: 'completed',
      generatedAt: '2026-07-12T10:45:00+08:00',
      createdAt: now,
      paperDate: '2026-07-12',
      paperCode: index === 0 ? 'MATH-20260712-06' : 'MATH-001',
      paperDisplayCode: index === 0 ? '数学-20260712-06' : 'MATH-001',
      questionCount: 36,
      studentPages: 8,
      answerPages: 3,
      totalPages: 11,
      bottleneckTargets: ['LP-001', 'MATH-NUM-DEC-MUL-POINT'],
      bottleneckSummaries: ['小数除法中商的小数点定位与余数意义理解', '多步骤应用题条件筛选和完整验算表达']
    }))
    const perStudent = Object.fromEntries(students.map((student, index) => {
      const studentReports = reports.filter(report => report.studentId === student._id)
      return [student._id, {
        subjectProfiles: profileFor(student._id, index === 0 ? 'one' : 'two'),
        latestReportSummary: studentReports[0],
        latestDiagnosisReports: studentReports,
        latestPaperSummary: papers[index]
      }]
    }))

    wx.cloud.callFunction = async ({ name, data = {} }) => {
      if (name === 'studentData' && data.action === 'getHomeDashboard') {
        return { result: { success: true, students, perStudent } }
      }
      if (name === 'studentData' && data.action === 'getLearningTimeline') {
        const selectedReports = reports.filter(report => report.studentId === data.studentId)
        const selectedPapers = papers.filter(paper => paper.studentId === data.studentId)
        return { result: { success: true, student: students.find(item => item._id === data.studentId), permissions, reports: selectedReports, papers: selectedPapers, hasMore: false } }
      }
      if (name === 'studentData' && data.action === 'cleanupStaleLearningRecords') {
        return { result: { success: true, permissions, cleanedCount: 0, cleanedReportIds: [], dryRun: true } }
      }
      if (name === 'studentAccess' && data.action === 'getAccessibleStudents') {
        return { result: { success: true, students } }
      }
      return { result: { success: false, error: `unhandled density mock ${name}:${data.action}` } }
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

async function rectsFor(elements) {
  return Promise.all(elements.map(elementRect))
}

async function collectBoundedChildren(parents, selector, label) {
  const entries = []
  for (const parent of parents) {
    const child = await parent.$(selector)
    if (!child) continue
    entries.push({
      label,
      rect: await elementRect(child),
      containerRect: await elementRect(parent)
    })
  }
  return entries
}

async function collectFamilyDensityMetrics(miniProgram, page) {
  const [systemInfo, pageSize, household, cards] = await Promise.all([
    miniProgram.systemInfo(),
    page.size(),
    page.$('.family-workbench-hero'),
    page.$$('.child-card')
  ])
  if (!household) throw new Error('household summary was not rendered')
  if (cards.length !== 2) throw new Error(`expected 2 child cards, got ${cards.length}`)

  const cardMetrics = []
  for (const card of cards) {
    const identity = await card.$('.child-identity-row')
    const metric = await card.$('.child-metric-strip')
    const priority = await card.$('.child-priority-row')
    if (!identity || !metric || !priority) throw new Error('required child density blocks were not rendered')
    const actions = [
      ...(await card.$$('.child-profile-link')),
      ...(await card.$$('.priority-action-text')),
      ...(await card.$$('.subject-row-action')),
      ...(await card.$$('.child-diagnosis-coverage'))
    ]
    const interactive = [
      identity,
      ...(await card.$$('.child-metric-cell')),
      priority,
      ...(await card.$$('.child-secondary-action')),
      ...(await card.$$('.child-subject-row')),
      ...(await card.$$('.child-diagnosis-row')),
      ...(await card.$$('.child-quick-link'))
    ]
    const adjacent = [
      identity,
      metric,
      priority,
      ...(await card.$$('.child-secondary-actions')),
      ...(await card.$$('.child-subject-status')),
      ...(await card.$$('.child-diagnosis-row')),
      ...(await card.$$('.child-quick-actions'))
    ]
    const secondaryRows = await card.$$('.child-secondary-action')
    const subjectRows = await card.$$('.child-subject-row')
    const diagnosisRows = await card.$$('.child-diagnosis-row')
    const quickLinks = await card.$$('.child-quick-link')
    const boundedRects = [
      ...(await collectBoundedChildren([identity], '.child-name', 'long child name')),
      ...(await collectBoundedChildren([priority], '.priority-action-text', 'priority action')),
      ...(await collectBoundedChildren(secondaryRows, '.secondary-action-title', 'secondary action label')),
      ...(await collectBoundedChildren(subjectRows, '.subject-row-action', 'subject action label')),
      ...(await collectBoundedChildren(diagnosisRows, '.child-diagnosis-coverage', 'diagnosis action label')),
      ...(await collectBoundedChildren(quickLinks, '.quick-link-title', 'quick action label'))
    ]
    cardMetrics.push({
      cardRect: await elementRect(card),
      identityRect: await elementRect(identity),
      metricRect: await elementRect(metric),
      priorityRect: await elementRect(priority),
      actionRects: await rectsFor(actions),
      boundedRects,
      interactiveRects: await rectsFor(interactive),
      adjacentRects: await rectsFor(adjacent)
    })
  }

  return {
    viewport: { width: systemInfo.windowWidth, height: systemInfo.windowHeight },
    simulator: { model: systemInfo.model, platform: systemInfo.platform, SDKVersion: systemInfo.SDKVersion },
    pageWidth: numberOf(pageSize.width),
    householdSummaryRect: await elementRect(household),
    cards: cardMetrics
  }
}

async function renderedPageText(page) {
  const root = await page.$('.page')
  if (!root) throw new Error(`page root not found for ${page.path}`)
  return (await root.text()).replace(/\s+/g, ' ')
}

function assertCodeHygiene(text, pageName) {
  const leaks = findRenderedInternalCodes(text)
  assert.deepEqual(leaks, [], `${pageName} rendered internal codes: ${leaks.join(', ')}`)
}

async function main() {
  fs.mkdirSync(OUTPUT_DIR, { recursive: true })
  const automator = loadAutomator()
  let miniProgram
  try {
    miniProgram = await automator.launch({
      cliPath: CLI_PATH,
      projectPath: PROJECT_PATH,
      trustProject: true,
      timeout: 60000
    })
    await installFamilyDensityMocks(miniProgram)

    const familyPage = await miniProgram.reLaunch('/pages/index/index')
    await familyPage.waitFor('.child-card')
    await familyPage.waitFor(1000)
    const familyText = await renderedPageText(familyPage)
    for (const expected of [
      '家庭学习工作台',
      '学生A的超长学习档案示例',
      '学生B的第二个学习档案示例',
      '数学',
      '最新正式诊断',
      '三科学习状态',
      '快捷入口',
      '数学-20260712-06'
    ]) assert(familyText.includes(expected), `family page missing readable text: ${expected}`)
    assertCodeHygiene(familyText, 'family page')
    const metrics = await collectFamilyDensityMetrics(miniProgram, familyPage)
    const familyScreenshot = path.join(OUTPUT_DIR, 'family.png')
    await miniProgram.screenshot({ path: familyScreenshot })
    validateFamilyDensityMetrics(metrics)

    const historyPage = await miniProgram.reLaunch(
      '/pages/upload-history/upload-history?studentId=student-density-one&studentName=%E5%AD%A6%E7%94%9FA%E7%9A%84%E8%B6%85%E9%95%BF%E5%AD%A6%E4%B9%A0%E6%A1%A3%E6%A1%88%E7%A4%BA%E4%BE%8B'
    )
    await historyPage.waitFor('.record-card')
    await historyPage.waitFor(800)
    const historyText = await renderedPageText(historyPage)
    assert(historyText.includes('学习记录'), 'learning-history title did not render')
    assert(historyText.includes('数学-20260712-06'), 'readable paper code did not remain visible in learning history')
    assertCodeHygiene(historyText, 'learning-history page')
    const historyScreenshot = path.join(OUTPUT_DIR, 'learning-records.png')
    await miniProgram.screenshot({ path: historyScreenshot })

    console.log(JSON.stringify({
      status: 'PASS',
      viewport: metrics.viewport,
      simulator: metrics.simulator,
      screenshots: { family: familyScreenshot, learningRecords: historyScreenshot },
      metrics
    }, null, 2))
  } finally {
    if (miniProgram) await miniProgram.close()
  }
}

module.exports = {
  collectFamilyDensityMetrics,
  findRenderedInternalCodes,
  validateFamilyDensityMetrics
}

if (require.main === module) {
  main().catch(error => {
    console.error(error && (error.stack || error.message || String(error)))
    process.exitCode = 1
  })
}

const assert = require('node:assert/strict')
const path = require('node:path')

function loadAutomator() {
  try {
    return require('miniprogram-automator')
  } catch (error) {
    return require('/tmp/learning-diagnostic-automator/node_modules/miniprogram-automator')
  }
}

const automator = loadAutomator()

const projectPath = path.resolve(__dirname, '..')
const cliPath = '/Applications/wechatwebdevtools.app/Contents/MacOS/cli'
const screenshots = {
  index: '/tmp/learning-diagnostic-parent-timeline-index.png',
  parent: '/tmp/learning-diagnostic-parent-management.png',
  subject: '/tmp/learning-diagnostic-subject-home.png',
  timeline: '/tmp/learning-diagnostic-learning-timeline.png',
}

const results = []
const logs = []
const exceptions = []

async function pageText(page) {
  const root = await page.$('.page')
  assert(root, `page root not found: ${page.path}`)
  return root.text()
}

function requireText(text, needles) {
  for (const needle of needles) {
    assert(
      text.includes(needle),
      `expected text to include "${needle}", actual text: ${text.slice(0, 800)}`
    )
  }
}

async function runCase(name, fn) {
  const started = Date.now()
  try {
    await fn()
    results.push({ name, status: 'PASS', durationMs: Date.now() - started })
  } catch (error) {
    results.push({
      name,
      status: 'FAIL',
      durationMs: Date.now() - started,
      error: error && (error.stack || error.message || String(error)),
    })
  }
}

async function relaunch(miniProgram, route, waitMs = 800) {
  const page = await miniProgram.reLaunch(route)
  await page.waitFor(waitMs)
  return page
}

async function tapByText(page, selector, text) {
  const elements = await page.$$(selector)
  for (const element of elements) {
    const elementText = await element.text()
    if (elementText.includes(text)) {
      await element.tap()
      await page.waitFor(500)
      return element
    }
  }
  throw new Error(`cannot find ${selector} containing text "${text}"`)
}

async function tapLastByText(page, selector, text) {
  const elements = await page.$$(selector)
  for (let i = elements.length - 1; i >= 0; i--) {
    const elementText = await elements[i].text()
    if (elementText.includes(text)) {
      await elements[i].tap()
      await page.waitFor(500)
      return elements[i]
    }
  }
  throw new Error(`cannot find ${selector} containing text "${text}"`)
}

async function installCloudMocks(miniProgram) {
  await miniProgram.evaluate(() => {
    const now = '2026-06-13T09:30:00+08:00'
    const student = { _id: 'student-e2e', name: '钟青羽', grade: 6 }
    const secondStudent = { _id: 'student-e2e-2', name: '钟小羽', grade: 3 }
    const ownerPermissions = {
      canView: true,
      canManageParents: true,
      canUpload: true,
      canGeneratePaper: true,
      canRetryAnalysis: true,
    }
    const viewerPermissions = {
      canView: true,
      canManageParents: false,
      canUpload: false,
      canGeneratePaper: false,
      canRetryAnalysis: false,
    }
    const subjectProfiles = [{
      _id: 'profile-math',
      studentId: 'student-e2e',
      subject: 'math',
      subjectName: '数学',
      totalReports: 2,
      updatedAt: now,
      currentBottlenecks: [
        { lpCode: 'LP-001', lpName: '计算基础', status: 'needs_verification', severity: 'medium' },
        { lpCode: 'LP-008', lpName: '审题理解', status: 'persisting', severity: 'high' },
      ],
      pendingBottlenecks: [
        { lpCode: 'LP-001', lpName: '计算基础', status: 'needs_verification', severity: 'medium' },
        { lpCode: 'LP-008', lpName: '审题理解', status: 'persisting', severity: 'high' },
      ],
    }]
    const secondSubjectProfiles = [{
      _id: 'profile-second-math',
      studentId: 'student-e2e-2',
      subject: 'math',
      subjectName: '数学',
      totalReports: 0,
      updatedAt: now,
      currentBottlenecks: [],
    }]
    const reports = [{
      _id: 'report-e2e',
      studentId: 'student-e2e',
      subject: 'math',
      type: 'diagnosis',
      status: 'completed',
      createdAt: now,
      evidenceTime: now,
      summary: '发现计算基础、审题理解两个学习卡点。',
      totalErrors: 2,
      bottlenecks: [
        { lpCode: 'LP-001', lpName: '计算基础', errorCount: 1 },
        { lpCode: 'LP-008', lpName: '审题理解', errorCount: 1 },
      ],
      imageFiles: [{
        fileID: 'cloud://mock/photo-1.jpg',
        fileName: 'math-paper-01.jpg',
        ocrSummary: '包含分数计算和应用题审题。',
        isDuplicate: false,
        uploadedAt: now,
      }],
    }, {
      _id: 'verification-report-e2e',
      studentId: 'student-e2e',
      subject: 'math',
      type: 'verification',
      status: 'completed',
      paperId: 'paper-e2e',
      createdAt: '2026-06-13T10:10:00+08:00',
      evidenceTime: '2026-06-13T10:10:00+08:00',
      comparisonSummary: '计算基础已改善，审题理解仍需观察。',
      verificationEvidence: [
        { lpCode: 'LP-001', complete: true, allCorrect: true },
        { lpCode: 'LP-008', complete: true, allCorrect: false },
      ],
      imageFiles: [{
        fileID: 'cloud://mock/verification-photo.jpg',
        fileName: 'verification-answer.jpg',
        ocrSummary: '验证卷作答照片，含完整演算。',
        isDuplicate: true,
        uploadedAt: '2026-06-13T10:10:00+08:00',
      }],
    }, {
      _id: 'analyzing-report-e2e',
      studentId: 'student-e2e',
      subject: 'math',
      type: 'diagnosis',
      status: 'analyzing',
      createdAt: '2026-06-13T10:30:00+08:00',
    }, {
      _id: 'failed-report-e2e',
      studentId: 'student-e2e',
      subject: 'math',
      type: 'diagnosis',
      status: 'failed',
      createdAt: '2026-06-13T10:40:00+08:00',
    }]
    const papers = [{
      _id: 'paper-e2e',
      studentId: 'student-e2e',
      subject: 'math',
      type: 'verification',
      createdAt: '2026-06-13T09:50:00+08:00',
      generatedAt: '2026-06-13T09:50:00+08:00',
      paperDate: '2026-06-13',
      paperCode: 'MATH-20260613-01',
      paperDisplayCode: '数学-20260613-01',
      questions: [{}, {}, {}, {}, {}, {}],
      questionCount: 6,
      bottleneckTargets: ['LP-001', 'LP-008'],
      bottleneckSummaries: ['计算基础', '审题理解'],
      studentPages: 1,
      answerPages: 1,
      totalPages: 2,
      pdfFileId: 'cloud://mock/paper.pdf',
    }, {
      _id: 'default-paper-e2e',
      studentId: 'student-e2e',
      subject: 'math',
      type: 'default-diagnosis',
      createdAt: '2026-06-13T08:20:00+08:00',
    }]
    const members = [{
      studentId: 'student-e2e',
      ownerOpenId: 'owner-openid',
      memberOpenId: 'owner-openid',
      role: 'owner',
      status: 'active',
      displayName: '档案创建者',
      createdAt: now,
    }, {
      studentId: 'student-e2e',
      ownerOpenId: 'owner-openid',
      memberOpenId: 'viewer-openid',
      role: 'viewer',
      status: 'active',
      displayName: '共同查看家长',
      createdAt: now,
    }]

    wx.cloud.callFunction = async ({ name, data }) => {
      if (name === 'studentAccess') {
        if (data.action === 'getAccessibleStudents') {
          return {
            result: {
              success: true,
              students: [
                { ...student, role: 'owner', permissions: ownerPermissions },
                { ...secondStudent, role: 'owner', permissions: ownerPermissions },
              ],
            },
          }
        }
        if (data.action === 'listMembers') {
          return { result: { success: true, student, role: 'owner', permissions: ownerPermissions, members } }
        }
        if (data.action === 'createInvite') {
          return {
            result: {
              success: true,
              inviteId: 'invite-e2e',
              token: 'token-e2e',
              inviteCode: 'E2E123',
              path: '/pages/join-student/join-student?inviteId=invite-e2e&token=token-e2e',
              role: 'viewer',
              expiresAt: '2026-06-20T09:30:00+08:00',
            },
          }
        }
        if (data.action === 'getInvite') {
          return { result: { success: true, student, role: 'viewer', alreadyJoined: false } }
        }
        if (data.action === 'acceptInvite') {
          return { result: { success: true, student, role: 'viewer' } }
        }
      }
      if (name === 'studentData') {
        if (data.action === 'getStudentDashboard') {
          if (data.studentId === secondStudent._id) {
            return { result: { success: true, student: secondStudent, permissions: ownerPermissions, subjectProfiles: secondSubjectProfiles, recentReports: [], recentPapers: [] } }
          }
          return { result: { success: true, student, permissions: ownerPermissions, subjectProfiles, recentReports: reports, recentPapers: papers } }
        }
        if (data.action === 'getSubjectDashboard') {
          return { result: { success: true, student, permissions: ownerPermissions, profile: subjectProfiles[0], reports, papers } }
        }
        if (data.action === 'getLearningTimeline') {
          return { result: { success: true, student, permissions: viewerPermissions, reports, papers } }
        }
        if (data.action === 'getReportDetail') {
          const report = reports.find(item => item._id === data.reportId) || reports[0]
          const linkedPaper = report && report.paperId
            ? papers.find(item => item._id === report.paperId) || null
            : null
          return { result: { success: true, permissions: viewerPermissions, report, linkedPaper } }
        }
        if (data.action === 'getPaperDetail') {
          return { result: { success: true, permissions: viewerPermissions, paper: papers[0], latestVerificationReport: reports[1] } }
        }
      }
      return { result: { success: false, error: `unhandled mock call ${name}:${data && data.action}` } }
    }

    const matchesFilter = (item, filter = {}) => {
      if (!filter || Object.keys(filter).length === 0) return true
      return Object.keys(filter).every(key => item[key] === filter[key])
    }

    wx.cloud.database = () => ({
      collection(name) {
        return {
          where(filter) {
            return {
              orderBy() { return this },
              limit() { return this },
              async get() {
                if (name === 'students') return { data: [student, secondStudent].filter(item => matchesFilter(item, filter)) }
                if (name === 'subjectProfiles') return { data: [...subjectProfiles, ...secondSubjectProfiles].filter(item => matchesFilter(item, filter)) }
                if (name === 'reports') return { data: reports.filter(item => matchesFilter(item, filter)) }
                if (name === 'papers') return { data: papers.filter(item => matchesFilter(item, filter)) }
                return { data: [] }
              },
            }
          },
          async add({ data }) {
            return { _id: `${name}-mock-${Date.now()}`, data }
          },
          doc(id) {
            return {
              async get() {
                if (name === 'students') return { data: [student, secondStudent].find(item => item._id === id) || student }
                if (name === 'reports') return { data: reports.find(item => item._id === id) }
                if (name === 'papers') return { data: papers.find(item => item._id === id) }
                return { data: null }
              },
            }
          },
          orderBy() { return this },
          limit() { return this },
          async get() {
            if (name === 'students') return { data: [student, secondStudent] }
            if (name === 'subjectProfiles') return { data: [...subjectProfiles, ...secondSubjectProfiles] }
            if (name === 'reports') return { data: reports }
            if (name === 'papers') return { data: papers }
            return { data: [] }
          },
        }
      },
      serverDate() { return new Date() },
    })

    wx.cloud.getTempFileURL = async ({ fileList }) => ({
      fileList: (fileList || []).map(fileID => ({
        fileID,
        tempFileURL: '/assets/images/app-logo-share.jpg',
      })),
    })
    wx.cloud.downloadFile = async () => ({ tempFilePath: '/tmp/mock.pdf' })
  })
}

async function currentPath(miniProgram) {
  const page = await miniProgram.currentPage()
  return page.path
}

async function main() {
  const miniProgram = await automator.launch({
    cliPath,
    projectPath,
    trustProject: true,
    timeout: 60000,
  })

  miniProgram.on('console', entry => logs.push(entry))
  miniProgram.on('exception', entry => exceptions.push(entry))

  const systemInfo = await miniProgram.systemInfo()
  await installCloudMocks(miniProgram)

  await runCase('DevTools automation launch', async () => {
    assert.equal(systemInfo.platform, 'devtools')
    const stack = await miniProgram.pageStack()
    assert(stack.length > 0)
  })

  await runCase('家庭工作台真实加载：多个孩子只显示工作台', async () => {
    const page = await relaunch(miniProgram, '/pages/index/index', 2200)
    const text = await pageText(page)
    requireText(text, ['家庭学习工作台', '点击数字、状态、学科和编号可直接追溯', '钟青羽', '钟小羽', '待验证', '待上传'])
    assert(!text.includes('还没有学习档案'), 'home should not show empty profile state')
    assert(!text.includes('当前综合摘要'), 'multi-child home should not mix in one child profile details')
    assert(!text.includes('孩子学习工作台'), 'family home should not render a duplicated child workbench heading')
    assert.equal((text.match(/添加孩子/g) || []).length, 1, 'family home should render one add-child entry')
    await miniProgram.screenshot({ path: screenshots.index })
  })

  await runCase('点击孩子卡片主体：进入该孩子学习档案', async () => {
    let page = await miniProgram.currentPage()
    await tapByText(page, '.child-card-top', '钟青羽')
    await page.waitFor(1600)
    page = await miniProgram.currentPage()
    assert.equal(page.path, 'pages/student-profile/student-profile')
    const text = await pageText(page)
    requireText(text, [
      '钟青羽 · 学习档案',
      '当前综合摘要',
      '最新数学诊断报告',
      '报告生成',
      '证据时间',
      '共发现 2 道相关错题',
      '家长管理',
      '学习记录',
      '当前学习卡点'
    ])
  })

  await runCase('点击家长管理：进入家庭成员页面', async () => {
    let page = await miniProgram.currentPage()
    await tapByText(page, '.manage-link', '家长管理')
    await page.waitFor(1200)
    page = await miniProgram.currentPage()
    assert.equal(page.path, 'pages/parent-management/parent-management')
    const text = await pageText(page)
    requireText(text, ['家庭成员', '钟青羽', '已加入家长', '档案创建者', '共同查看家长', '邀请家长', '生成邀请'])
    await miniProgram.screenshot({ path: screenshots.parent })
  })

  await runCase('点击生成邀请：生成邀请路径和邀请码', async () => {
    const page = await miniProgram.currentPage()
    await tapByText(page, 'button', '生成邀请')
    await page.waitFor(1200)
    const text = await pageText(page)
    requireText(text, ['邀请已生成', '邀请码', 'E2E123', '/pages/join-student/join-student?inviteId=invite-e2e&token=token-e2e'])
  })

  await runCase('扫码加入页：可查看邀请并点击加入', async () => {
    let page = await relaunch(miniProgram, '/pages/join-student/join-student?inviteId=invite-e2e&token=token-e2e', 1200)
    let text = await pageText(page)
    requireText(text, ['钟青羽', '加入'])
    await tapByText(page, 'button', '加入')
    await page.waitFor(1200)
    page = await miniProgram.currentPage()
    assert.equal(page.path, 'pages/index/index')
    text = await pageText(page)
    requireText(text, ['家庭学习工作台', '钟青羽'])
  })

  await runCase('添加孩子页：表单元素可见', async () => {
    const page = await relaunch(miniProgram, '/pages/add-student/add-student', 1200)
    const text = await pageText(page)
    requireText(text, ['学生姓名', '年级', '头像颜色', '保存'])
    await tapByText(page, '.grade-btn', '3年级')
    const updatedText = await pageText(page)
    requireText(updatedText, ['3年级'])
  })

  await runCase('学科选择页：三科入口可见并可进入数学工作台', async () => {
    let page = await relaunch(miniProgram, '/pages/subject-select/subject-select?studentId=student-e2e&name=%E9%92%9F%E9%9D%92%E7%BE%BD&grade=6', 1600)
    let text = await pageText(page)
    requireText(text, ['钟青羽 的学科入口', '数学', '语文', '英语'])
    await tapByText(page, '.subject-card', '数学')
    await page.waitFor(1600)
    page = await miniProgram.currentPage()
    assert.equal(page.path, 'pages/subject-home/subject-home')
    text = await pageText(page)
    requireText(text, ['数学工作台', '生成验证试卷', '待处理队列', '工具', '拍照诊断', '默认试卷', '学习记录', '完整报告'])
    await miniProgram.screenshot({ path: screenshots.subject })
  })

  await runCase('学科主页工具：拍照上传、默认试卷、学习记录入口可用', async () => {
    let page = await relaunch(miniProgram, '/pages/subject-home/subject-home?studentId=student-e2e&subject=math&subjectName=%E6%95%B0%E5%AD%A6&studentName=%E9%92%9F%E9%9D%92%E7%BE%BD&grade=6', 1600)
    await tapByText(page, '.tool-item', '拍照诊断')
    await page.waitFor(1200)
    page = await miniProgram.currentPage()
    assert.equal(page.path, 'pages/upload/upload')
    let text = await pageText(page)
    requireText(text, ['拍照上传试卷', '光线充足', '试卷铺平', '已选 0/20', '上传并开始分析'])

    page = await relaunch(miniProgram, '/pages/subject-home/subject-home?studentId=student-e2e&subject=math&subjectName=%E6%95%B0%E5%AD%A6&studentName=%E9%92%9F%E9%9D%92%E7%BE%BD&grade=6', 1600)
    await tapByText(page, '.tool-item', '默认试卷')
    await page.waitFor(1600)
    page = await miniProgram.currentPage()
    assert.equal(page.path, 'pages/default-paper/default-paper')
    text = await pageText(page)
    requireText(text, ['默认诊断试卷', '选择年级', '六年级 A 卷', '预览 PDF', '使用这套试卷'])

    page = await relaunch(miniProgram, '/pages/subject-home/subject-home?studentId=student-e2e&subject=math&subjectName=%E6%95%B0%E5%AD%A6&studentName=%E9%92%9F%E9%9D%92%E7%BE%BD&grade=6', 1600)
    await tapByText(page, '.tool-item', '学习记录')
    await page.waitFor(1200)
    page = await miniProgram.currentPage()
    assert.equal(page.path, 'pages/upload-history/upload-history')
  })

  await runCase('生成验证试卷页：卡点文字、配置和按钮可见', async () => {
    const page = await relaunch(miniProgram, '/pages/generate-verification/generate-verification?studentId=student-e2e&subject=math&subjectName=%E6%95%B0%E5%AD%A6&studentName=%E9%92%9F%E9%9D%92%E7%BE%BD', 1800)
    const text = await pageText(page)
    requireText(text, ['出卷配置', '数学纸质验证卷', '试卷配置', '计算基础', '审题理解', '预览 PDF', '生成 A4 试卷'])
    assert(!text.includes('LP-001'), 'verification config should prefer readable bottleneck summaries')
  })

  await runCase('点击学习卡点查看全部：进入卡点中心', async () => {
    let page = await relaunch(miniProgram, '/pages/student-profile/student-profile?studentId=student-e2e', 2200)
    await tapByText(page, '.link-text', '查看全部')
    await page.waitFor(1200)
    page = await miniProgram.currentPage()
    assert.equal(page.path, 'pages/bottleneck-center/bottleneck-center')
    const text = await pageText(page)
    requireText(text, ['学习卡点中心', '全部卡点', '待跟进', '持续出现', '计算基础', '审题理解'])
  })

  await runCase('卡点中心筛选与卡点详情：文字摘要、证据链和验证入口可见', async () => {
    let page = await relaunch(miniProgram, '/pages/bottleneck-center/bottleneck-center?studentId=student-e2e&studentName=%E9%92%9F%E9%9D%92%E7%BE%BD', 1600)
    await tapByText(page, '.filter-chip', '数学')
    await page.waitFor(500)
    let text = await pageText(page)
    requireText(text, ['计算基础', '审题理解'])
    assert(!text.includes('LP-001'), 'bottleneck center should prefer text summaries over LP codes')

    await tapByText(page, '.bottleneck-card', '审题理解')
    await page.waitFor(1200)
    page = await miniProgram.currentPage()
    assert.equal(page.path, 'pages/bottleneck-detail/bottleneck-detail')
    text = await pageText(page)
    requireText(text, ['数学学习卡点', '审题理解', '卡点证据链', '验证反馈', '验证试卷', '诊断报告', '数学-20260613-01', '已反馈', '生成验证卷'])
    assert(!text.includes('相关报告'), 'bottleneck detail should not render a duplicate related report list')
    assert(!text.includes('相关验证卷'), 'bottleneck detail should not render a duplicate related paper list')
    assert(!text.includes('LP-008'), 'bottleneck detail should prefer text summaries over LP codes')

    await tapByText(page, '.primary-action', '生成验证卷')
    await page.waitFor(1200)
    page = await miniProgram.currentPage()
    assert.equal(page.path, 'pages/generate-verification/generate-verification')
  })

  await runCase('点击学习记录查看全部：进入时间线页面', async () => {
    let page = await relaunch(miniProgram, '/pages/student-profile/student-profile?studentId=student-e2e', 2200)
    await tapLastByText(page, '.link-text', '查看全部')
    await page.waitFor(1200)
    page = await miniProgram.currentPage()
    assert.equal(page.path, 'pages/upload-history/upload-history')
    const text = await pageText(page)
    requireText(text, [
      '学习记录',
      '3 条主记录',
      '数学诊断报告',
      '生成数学验证试卷',
      '数学-20260613-01',
      '数学验证反馈',
      '验证卷编号',
      '已生成验证反馈',
      '疑似重复'
    ])
    assert(!text.includes('默认诊断试卷'), 'default diagnostic papers should not be standalone timeline records')
    assert(!text.includes('LP-008、LP-001'), 'timeline should not expose LP codes as primary labels')
    assert(!text.includes('数学诊断处理中'), 'stale in-progress reports should not pollute main timeline')
    assert(!text.includes('数学诊断失败'), 'stale failed reports should not pollute main timeline')
    await miniProgram.screenshot({ path: screenshots.timeline })
  })

  await runCase('时间线筛选：数学筛选后仍显示数学记录', async () => {
    const page = await miniProgram.currentPage()
    await tapByText(page, '.filter-pill', '数学')
    await page.waitFor(700)
    const text = await pageText(page)
    requireText(text, ['数学诊断报告', '生成数学验证试卷'])
  })

  await runCase('时间线点击报告：进入报告详情', async () => {
    let page = await miniProgram.currentPage()
    await tapByText(page, '.record-card', '数学诊断报告')
    await page.waitFor(1200)
    page = await miniProgram.currentPage()
    assert.equal(page.path, 'pages/report/report')
    const text = await pageText(page)
    requireText(text, ['诊断报告', '计算基础', '审题理解'])
  })

  await runCase('时间线点击验证反馈：报告详情显示关联试卷编号', async () => {
    let page = await relaunch(miniProgram, '/pages/upload-history/upload-history?studentId=student-e2e&studentName=%E9%92%9F%E9%9D%92%E7%BE%BD', 1600)
    await tapByText(page, '.record-card', '数学验证反馈')
    await page.waitFor(1200)
    page = await miniProgram.currentPage()
    assert.equal(page.path, 'pages/report/report')
    const text = await pageText(page)
    requireText(text, ['验证报告', '验证卷 数学-20260613-01'])
  })

  await runCase('时间线点击试卷：进入试卷预览', async () => {
    let page = await relaunch(miniProgram, '/pages/upload-history/upload-history?studentId=student-e2e&studentName=%E9%92%9F%E9%9D%92%E7%BE%BD', 1600)
    await tapByText(page, '.record-card', '生成数学验证试卷')
    await page.waitFor(1200)
    page = await miniProgram.currentPage()
    assert.equal(page.path, 'pages/paper-preview/paper-preview')
    const text = await pageText(page)
    requireText(text, ['验证试卷编号', '数学-20260613-01', '试卷内容预览', '验证反馈', '计算基础已改善'])
  })

  await runCase('时间线点击照片：触发照片预览入口不报错', async () => {
    const calls = []
    await miniProgram.mockWxMethod('previewImage', function (payload) {
      globalThis.__previewImagePayload = payload
      return { ok: true }
    })
    const page = await relaunch(miniProgram, '/pages/upload-history/upload-history?studentId=student-e2e&studentName=%E9%92%9F%E9%9D%92%E7%BE%BD', 1600)
    const photo = await page.$('.fold-row')
    assert(photo, 'folded evidence row should exist')
    await photo.tap()
    await page.waitFor(700)
    const payload = await miniProgram.evaluate(() => globalThis.__previewImagePayload || null)
    assert(payload && payload.current, 'previewImage should receive current URL')
    calls.push(payload)
    await miniProgram.restoreWxMethod('previewImage')
  })

  await miniProgram.close()

  const failed = results.filter(item => item.status === 'FAIL')
  const summary = {
    systemInfo: {
      platform: systemInfo.platform,
      model: systemInfo.model,
      SDKVersion: systemInfo.SDKVersion,
    },
    results,
    failures: failed.length,
    consoleCount: logs.length,
    exceptionCount: exceptions.length,
    exceptions,
    screenshots,
  }

  console.log(JSON.stringify(summary, null, 2))
  if (failed.length > 0 || exceptions.length > 0) process.exit(1)
}

main().catch(error => {
  console.error(error && (error.stack || error.message || String(error)))
  process.exit(1)
})

#!/usr/bin/env node
/**
 * 全量 17 页面回归测试（带断言）
 *
 * 区别于 devtools-fullpage-smoke.js：
 *   - 每个页面都断言"渲染关键文本/元素"，不只判断"没 console.error"
 *   - 6 个跨页交互场景（学科选择 → 学科主页 → 拍照 → 报告 → 验证卷 → 时间线）
 *   - 输出结构化 JSON 报告 + 失败页面截图
 *
 * 前置：先跑 npm run test:e2e:doctor 确认 DevTools 可达
 *
 * 用法：
 *   WECHAT_DEVTOOLS_CLI=/path/to/cli node scripts/devtools-e2e-fullpage.js
 *   npm run test:e2e:fullpage
 *
 * 退出码：0 全过；1 有失败；2 启动失败
 */

const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')

function loadAutomator() {
  try { return require('miniprogram-automator') }
  catch { return require('/tmp/learning-diagnostic-automator/node_modules/miniprogram-automator') }
}
const automator = loadAutomator()

const projectPath = path.resolve(__dirname, '..')
const cliPath = process.env.WECHAT_DEVTOOLS_CLI
  || (process.platform === 'darwin' ? '/Applications/wechatwebdevtools.app/Contents/MacOS/cli' : 'cli')
const outputDir = path.join(projectPath, 'tmp', 'e2e-fullpage')

const NOW = '2026-06-17T09:30:00+08:00'
const student = { _id: 'student-e2e', name: '钟青羽', grade: 6, createdAt: NOW, avatarColor: 'blue' }
const student2 = { _id: 'student-e2e-2', name: '钟小羽', grade: 4, createdAt: NOW, avatarColor: 'pink' }
const ownerPermissions = { canView: true, canManageParents: true, canUpload: true, canGeneratePaper: true, canRetryAnalysis: true }

const subjectProfiles = [{
  _id: 'profile-math', studentId: student._id, subject: 'math', subjectName: '数学',
  totalReports: 2, updatedAt: NOW,
  currentBottlenecks: [
    { lpCode: 'LP-001', lpName: '计算基础', status: 'needs_verification', severity: 'medium' },
    { lpCode: 'LP-008', lpName: '审题理解', status: 'persisting', severity: 'high' },
  ],
  pendingBottlenecks: [{ lpCode: 'LP-001', lpName: '计算基础', status: 'needs_verification', severity: 'medium' }],
  improvedBottlenecks: [],
}]
const reports = [{
  _id: 'report-e2e', studentId: student._id, subject: 'math', type: 'diagnosis', status: 'completed',
  createdAt: NOW, evidenceTime: NOW,
  summary: '发现计算基础、审题理解两个学习卡点。', totalErrors: 2,
  bottlenecks: [
    { lpCode: 'LP-001', lpName: '计算基础', errorCount: 1 },
    { lpCode: 'LP-008', lpName: '审题理解', errorCount: 1 },
  ],
  imageFiles: [{ fileID: 'cloud://mock/photo-1.jpg', fileName: 'paper.jpg', ocrSummary: '分数计算与应用题', isDuplicate: false, uploadedAt: NOW }],
}, {
  _id: 'verification-report-e2e', studentId: student._id, subject: 'math', type: 'verification', status: 'completed',
  paperId: 'paper-e2e', createdAt: NOW, evidenceTime: NOW,
  comparisonSummary: '计算基础已改善，审题理解仍需观察。',
  verificationEvidence: [
    { lpCode: 'LP-001', complete: true, allCorrect: true },
    { lpCode: 'LP-008', complete: true, allCorrect: false },
  ],
  imageFiles: [],
}]
const papers = [{
  _id: 'paper-e2e', studentId: student._id, subject: 'math', type: 'verification',
  createdAt: NOW, generatedAt: NOW, paperDate: '2026-06-17',
  paperCode: 'MATH-20260617-01', paperDisplayCode: '数学-20260617-01',
  questions: [{}, {}, {}], questionCount: 3, bottleneckTargets: ['LP-001', 'LP-008'],
  bottleneckSummaries: ['计算基础', '审题理解'],
  studentPages: 1, answerPages: 1, totalPages: 2, pdfFileId: 'cloud://mock/paper.pdf',
}]
const members = [
  { _id: 'm1', studentId: student._id, ownerOpenId: 'o1', memberOpenId: 'o1', role: 'owner', status: 'active', displayName: '钟青羽家长', createdAt: NOW },
  { _id: 'm2', studentId: student._id, ownerOpenId: 'o1', memberOpenId: 'o2', role: 'viewer', status: 'active', displayName: '共同查看家长', createdAt: NOW },
]

// === 17 个页面 + 期望的渲染断言 ===
const studentQ = 'studentId=student-e2e&studentName=%E9%92%9F%E9%9D%92%E7%BE%BD'
const pages = [
  {
    name: 'index 首页/家庭工作台',
    route: '/pages/index/index',
    expect: {
      text: ['家庭学习工作台', '钟青羽', '添加孩子'],
      notText: ['加载中', '页面不存在'],
      minChildren: 1,
    },
  },
  {
    name: 'student-profile 学生档案',
    route: `/pages/student-profile/student-profile?${studentQ}`,
    expect: {
      text: ['钟青羽', '当前综合摘要', '家长管理', '学习记录'],
    },
  },
  {
    name: 'add-student 添加学生',
    route: '/pages/add-student/add-student',
    expect: {
      text: ['学生姓名', '年级', '保存'],
    },
  },
  {
    name: 'subject-home 数学学科工作台',
    route: `/pages/subject-home/subject-home?${studentQ}&subject=math&subjectName=%E6%95%B0%E5%AD%A6&grade=6`,
    expect: {
      text: ['下一步建议', '拍照诊断', '默认试卷', '学习记录'],
    },
  },
  {
    name: 'upload 拍照上传',
    route: `/pages/upload/upload?${studentQ}&subject=math&subjectName=%E6%95%B0%E5%AD%A6&grade=6`,
    expect: {
      text: ['拍照上传试卷', '上传并开始分析'],
    },
  },
  {
    name: 'upload-history 学习记录',
    route: `/pages/upload-history/upload-history?${studentQ}`,
    expect: {
      text: ['学习记录'],
    },
  },
  {
    name: 'parent-management 家长管理',
    route: `/pages/parent-management/parent-management?${studentQ}`,
    expect: {
      text: ['家庭成员', '钟青羽', '已加入家长', '邀请家长'],
    },
  },
  {
    name: 'join-student 加入学生',
    route: '/pages/join-student/join-student',
    expect: {
      text: [], // 此页是空状态或码查询态
    },
  },
  {
    name: 'report 诊断报告',
    route: `/pages/report/report?id=report-e2e&${studentQ}`,
    expect: {
      text: ['诊断报告', '计算基础', '审题理解'],
    },
  },
  {
    name: 'bottleneck-center 卡点中心',
    route: `/pages/bottleneck-center/bottleneck-center?${studentQ}`,
    expect: {
      text: ['学习卡点中心', '计算基础', '审题理解'],
      notText: ['LP-001'], // 优先展示文字摘要
    },
  },
  {
    name: 'bottleneck-detail 卡点详情',
    route: `/pages/bottleneck-detail/bottleneck-detail?${studentQ}&subject=math&lpCode=LP-001`,
    expect: {
      text: ['计算基础', '卡点证据链'],
    },
  },
  {
    name: 'learning-resource 学习资源',
    route: '/pages/learning-resource/learning-resource?packId=pack-e2e',
    expect: {
      text: [], // mock 包可能不命中
    },
  },
  {
    name: 'english-practice 英语练习',
    route: `/pages/english-practice/english-practice?${studentQ}&grade=6`,
    expect: {
      text: ['英语', '练习', '可练习单词'],
    },
  },
  {
    name: 'english-dictation 英语听写',
    route: `/pages/english-dictation/english-dictation?${studentQ}&grade=6`,
    expect: {
      text: ['英语', '听写'],
    },
  },
  {
    name: 'generate-verification 生成验证卷',
    route: `/pages/generate-verification/generate-verification?${studentQ}&subject=math&subjectName=%E6%95%B0%E5%AD%A6`,
    expect: {
      text: ['出卷配置', '生成 A4 试卷'],
      notText: ['LP-001'], // 卡点应以文字摘要展示
    },
  },
  {
    name: 'default-paper 默认试卷',
    route: `/pages/default-paper/default-paper?${studentQ}&subject=math&subjectName=%E6%95%B0%E5%AD%A6&grade=6`,
    expect: {
      text: ['默认诊断试卷', '六年级 A 卷', '预览 PDF'],
    },
  },
  {
    name: 'paper-preview 试卷预览',
    route: '/pages/paper-preview/paper-preview?paperId=paper-e2e',
    expect: {
      text: ['试卷内容预览', '数学-20260617-01'],
    },
  },
]

// === 跨页交互场景 ===
const scenarios = [
  {
    name: 'scenario: 家庭工作台 → 学生档案 → 家长管理 → 生成邀请',
    steps: [
      { route: '/pages/index/index', wait: 4000, expect: { text: ['家庭学习工作台', '钟青羽'] } },
      { action: 'tapByText', selector: '.child-card', text: '钟青羽', wait: 1500, expect: { path: 'pages/student-profile/student-profile' } },
      { action: 'tapByText', selector: '.manage-link', text: '家长管理', wait: 1500, expect: { path: 'pages/parent-management/parent-management' } },
      { action: 'tapByText', selector: 'button', text: '生成邀请', wait: 1500, expect: { text: ['邀请已生成', 'E2E123'] } },
    ],
  },
  {
    name: 'scenario: 学科工作台 → 拍照 → 学习记录 → 默认试卷',
    steps: [
      { route: `/pages/subject-home/subject-home?${studentQ}&subject=math&subjectName=%E6%95%B0%E5%AD%A6&studentName=%E9%92%9F%E9%9D%92%E7%BE%BD&grade=6`, wait: 1800, expect: { text: ['拍照诊断', '默认试卷', '学习记录'] } },
      { action: 'tapByText', selector: '.tool-item', text: '拍照诊断', wait: 1200, expect: { path: 'pages/upload/upload' } },
      { action: 'relaunch', route: `/pages/subject-home/subject-home?${studentQ}&subject=math&subjectName=%E6%95%B0%E5%AD%A6&studentName=%E9%92%9F%E9%9D%92%E7%BE%BD&grade=6`, wait: 1500 },
      { action: 'tapByText', selector: '.tool-item', text: '学习记录', wait: 1200, expect: { path: 'pages/upload-history/upload-history' } },
    ],
  },
  {
    name: 'scenario: 卡点中心 → 筛选数学 → 卡点详情',
    steps: [
      { route: `/pages/bottleneck-center/bottleneck-center?${studentQ}`, wait: 1500, expect: { text: ['学习卡点中心', '计算基础', '审题理解'] } },
      { action: 'tapByText', selector: '.filter-chip', text: '数学', wait: 500, expect: { text: ['计算基础', '审题理解'] } },
      { action: 'tapByText', selector: '.bottleneck-card', text: '审题理解', wait: 1200, expect: { path: 'pages/bottleneck-detail/bottleneck-detail' } },
    ],
  },
  {
    name: 'scenario: 学生档案 → 查看全部(卡点) → 卡点中心',
    steps: [
      { route: `/pages/student-profile/student-profile?${studentQ}`, wait: 1800, expect: { text: ['钟青羽', '当前综合摘要'] } },
      { action: 'tapByText', selector: '.link-text', text: '查看全部', wait: 1200, expect: { path: 'pages/bottleneck-center/bottleneck-center' } },
    ],
  },
  {
    name: 'scenario: 时间线 → 报告卡 → 报告详情',
    steps: [
      { route: `/pages/upload-history/upload-history?${studentQ}`, wait: 1800, expect: { text: ['学习记录'] } },
      { action: 'tapByText', selector: '.record-card', text: '数学诊断报告', wait: 1200, expect: { path: 'pages/report/report' } },
    ],
  },
  {
    name: 'scenario: 家长管理 → 生成邀请 → 验证邀请码显示',
    steps: [
      { route: `/pages/parent-management/parent-management?${studentQ}`, wait: 1500, expect: { text: ['家庭成员'] } },
      { action: 'tapByText', selector: 'button', text: '生成邀请', wait: 1500, expect: { text: ['邀请已生成', 'E2E123', '/pages/join-student/join-student'] } },
    ],
  },
]

// === 工具 ===
const results = []
const errors = []
const warnings = []
let screenshotsTaken = 0

async function safe(fn, label) {
  try { return await fn() } catch (e) { return `${label}: ${e && (e.message || String(e))}` }
}

async function pageText(page) {
  const root = await page.$('.page')
  if (!root) return ''
  return (await root.text()).replace(/\s+/g, ' ')
}

async function tapByText(page, selector, text) {
  const els = await page.$$(selector)
  for (const el of els) {
    const t = await el.text()
    if (t && t.includes(text)) {
      await el.tap()
      return el
    }
  }
  throw new Error(`未找到 ${selector} 含文本 "${text}" (候选 ${els.length} 个)`)
}

async function tapByTextOrNull(page, selector, text) {
  const els = await page.$$(selector)
  for (const el of els) {
    const t = await el.text()
    if (t && t.includes(text)) {
      await el.tap()
      return el
    }
  }
  return null
}

async function installCloudMocks(miniProgram) {
  await miniProgram.evaluate((cfg) => {
    const { student, student2, permissions, subjectProfiles, reports, papers, members } = cfg
    globalThis.__pageErrors = []
    globalThis.__consoleErrors = []
    const origErr = console.error
    console.error = function (...args) {
      try {
        globalThis.__consoleErrors.push(args.map(a => (a && a.message) ? a.message : String(a)).join(' '))
      } catch {}
      return origErr.apply(this, args)
    }
    try { wx.onError && wx.onError(e => globalThis.__pageErrors.push(String(e))) } catch {}

    wx.cloud.callFunction = async ({ name, data }) => {
      try {
        if (name === 'studentAccess') {
          if (data.action === 'getAccessibleStudents') return { result: { success: true, students: [{ ...student, role: 'owner', permissions }, { ...student2, role: 'owner', permissions }] } }
          if (data.action === 'listMembers') return { result: { success: true, student, role: 'owner', permissions, members } }
          if (data.action === 'createInvite') return { result: { success: true, inviteId: 'i', token: 't', inviteCode: 'E2E123', path: '/pages/join-student/join-student', role: 'viewer', expiresAt: '2026-06-20T09:30:00+08:00' } }
          if (data.action === 'getInvite') return { result: { success: true, student, role: 'viewer', alreadyJoined: false } }
          if (data.action === 'acceptInvite') return { result: { success: true, student, role: 'viewer' } }
        }
        if (name === 'studentData') {
          const a = data && data.action
          if (a === 'getStudentDashboard') return { result: { success: true, student, permissions, subjectProfiles, recentReports: reports, recentPapers: papers } }
          if (a === 'getSubjectDashboard') return { result: { success: true, student, permissions, profile: subjectProfiles[0], reports, papers } }
          if (a === 'getLearningTimeline') return { result: { success: true, student, permissions, reports, papers } }
          if (a === 'cleanupStaleLearningRecords') return { result: { success: true, permissions, cleanedCount: 0, cleanedReportIds: [], dryRun: true } }
          if (a === 'getReportDetail') return { result: { success: true, permissions, report: reports.find(r => r._id === (data && data.reportId)) || reports[0], linkedPaper: papers[0] } }
          if (a === 'getPaperDetail') return { result: { success: true, permissions, paper: papers.find(p => p._id === (data && data.paperId)) || papers[0], latestVerificationReport: reports[1] } }
          if (a === 'getBottleneckDetail') return { result: { success: true, permissions, student, profile: subjectProfiles[0], report: reports[0], lpCode: (data && data.lpCode) || 'LP-001' } }
          if (a === 'getLearningResource') return { result: { success: true, permissions, pack: { _id: 'pack-e2e', title: '计算基础练习包', lpCode: 'LP-001' } } }
        }
        if (name === 'englishVocabulary') return { result: { success: true, student, permissions, words: [{ word: 'apple', masteryStatus: 'untested' }] } }
        return { result: { success: false, error: `unhandled mock ${name}:${data && data.action}` } }
      } catch (e) {
        globalThis.__pageErrors.push(String(e && e.message || e))
        return { result: { success: false, error: 'mock throw' } }
      }
    }

    const base = { students: [student], subjectProfiles, reports, papers, studentMembers: members }
    const matchesFilter = (item, filter = {}) => !filter || Object.keys(filter).length === 0 || Object.keys(filter).every(k => item[k] === filter[k])
    wx.cloud.database = () => ({
      collection(name) {
        return {
          where(filter) {
            return { orderBy() { return this }, limit() { return this }, async get() { return { data: (base[name] || []).filter(i => matchesFilter(i, filter)) } } }
          },
          orderBy() { return this }, limit() { return this },
          async get() { return { data: base[name] || [] } },
          doc(id) { return { async get() { return { data: (base[name] || []).find(i => i._id === id) || null } } } },
          async add() { return { _id: 'mock' } },
        }
      },
      serverDate() { return new Date() },
    })
    wx.cloud.getTempFileURL = async ({ fileList }) => ({ fileList: (fileList || []).map(f => ({ fileID: f, tempFileURL: '/assets/images/app-logo-share.jpg' })) })
    wx.cloud.downloadFile = async () => ({ tempFilePath: '/tmp/mock.pdf' })
    wx.cloud.uploadFile = async () => ({ fileID: 'cloud://mock/uploaded.jpg' })
  }, { student, student2, permissions: ownerPermissions, subjectProfiles, reports, papers, members })
}

async function runPageAssertion(spec, miniProgram) {
  const entry = { name: spec.name, route: spec.route, status: 'PASS', assertions: [] }
  const t0 = Date.now()
  try {
    const page = await miniProgram.reLaunch(spec.route)
    await page.waitFor(1500)

    // 1. 根节点存在
    const rootCheck = await safe(async () => {
      const root = await page.$('.page')
      if (!root) throw new Error('未找到 .page 根节点')
    }, 'rootCheck')
    if (rootCheck) entry.assertions.push({ name: 'rootCheck', fail: rootCheck })
    else entry.assertions.push({ name: 'rootCheck', ok: true })

    // 2. 期望文本
    if (spec.expect.text && spec.expect.text.length) {
      const text = await pageText(page)
      const missing = spec.expect.text.filter(t => !text.includes(t))
      if (missing.length) {
        entry.assertions.push({ name: 'expectText', fail: `缺少: ${missing.join(', ')}`, actualText: text.slice(0, 200) })
      } else {
        entry.assertions.push({ name: 'expectText', ok: `${spec.expect.text.length} 项全部命中` })
      }
    }

    // 3. 反向断言 (不应出现的文本)
    if (spec.expect.notText && spec.expect.notText.length) {
      const text = await pageText(page)
      const found = spec.expect.notText.filter(t => text.includes(t))
      if (found.length) {
        entry.assertions.push({ name: 'notText', fail: `不应出现: ${found.join(', ')}` })
      } else {
        entry.assertions.push({ name: 'notText', ok: `${spec.expect.notText.length} 项全部未出现` })
      }
    }

    // 4. 错误采集
    const collected = await miniProgram.evaluate(() => ({
      errors: (globalThis.__pageErrors || []).slice(),
      consoleErrors: (globalThis.__consoleErrors || []).slice(),
    }))
    entry.pageErrors = collected.errors
    entry.consoleErrors = collected.consoleErrors

    // 任何断言失败 → 失败
    const failed = entry.assertions.filter(a => a.fail)
    if (failed.length || collected.errors.length) entry.status = 'FAIL'
    if (collected.consoleErrors.length) {
      // console.error 单独看
      const noise = /unhandled mock|cloud.*init|订阅消息|subscribe-message/i
      const real = collected.consoleErrors.filter(m => !noise.test(m))
      if (real.length) entry.status = 'FAIL'
      entry.realConsoleErrors = real
    }

    if (entry.status !== 'PASS') {
      try {
        const shotPath = path.join(outputDir, `screenshots`, `${spec.name.replace(/[^\w]/g, '_')}.png`)
        fs.mkdirSync(path.dirname(shotPath), { recursive: true })
        await miniProgram.screenshot({ path: shotPath })
        entry.screenshot = shotPath
        screenshotsTaken += 1
      } catch {}
    }
  } catch (e) {
    entry.status = 'ERROR'
    entry.assertions.push({ name: 'load', fail: e && (e.message || String(e)) })
  }
  entry.durationMs = Date.now() - t0
  return entry
}

async function runScenario(scenario, miniProgram) {
  const entry = { name: scenario.name, status: 'PASS', steps: [] }
  const t0 = Date.now()
  for (const step of scenario.steps) {
    const stepEntry = { type: step.action || (step.route ? 'relaunch' : 'unknown') }
    try {
      let page
      if (step.route) {
        page = await miniProgram.reLaunch(step.route)
        await page.waitFor(step.wait || 1500)
        stepEntry.route = step.route
      } else if (step.action === 'relaunch') {
        page = await miniProgram.reLaunch(step.route || step.route)
        await page.waitFor(step.wait || 1500)
      } else if (step.action === 'tapByText') {
        page = await miniProgram.currentPage()
        // 等候选元素出现（防 reLaunch 刚完成时 DOM 未稳定）
        const deadline = Date.now() + 8000
        let found = null
        while (Date.now() < deadline) {
          found = await tapByTextOrNull(page, step.selector, step.text)
          if (found) break
          await page.waitFor(300)
        }
        if (!found) throw new Error(`tapByText 超时 — 未找到 ${step.selector} 含文本 "${step.text}"`)
        await page.waitFor(step.wait || 800)
      } else if (step.action === 'tap') {
        page = await miniProgram.currentPage()
        const el = await page.$(step.selector)
        if (!el) throw new Error(`selector ${step.selector} 不存在`)
        await el.tap()
        await page.waitFor(step.wait || 800)
      }

      if (step.expect) {
        if (step.expect.path) {
          const current = await miniProgram.currentPage()
          if (current.path !== step.expect.path) {
            throw new Error(`预期路径 ${step.expect.path}, 实际 ${current.path}`)
          }
        }
        if (step.expect.text) {
          page = await miniProgram.currentPage()
          const text = await pageText(page)
          const missing = step.expect.text.filter(t => !text.includes(t))
          if (missing.length) throw new Error(`缺少文本: ${missing.join(', ')}`)
        }
      }
      stepEntry.status = 'PASS'
    } catch (e) {
      stepEntry.status = 'FAIL'
      stepEntry.error = e && (e.message || String(e))
      entry.status = 'FAIL'
      entry.steps.push(stepEntry)
      try {
        const shotPath = path.join(outputDir, 'screenshots', `scenario-${scenario.name.replace(/[^\w]/g, '_')}.png`)
        fs.mkdirSync(path.dirname(shotPath), { recursive: true })
        await miniProgram.screenshot({ path: shotPath })
        entry.screenshot = shotPath
      } catch {}
      break
    }
    entry.steps.push(stepEntry)
  }
  entry.durationMs = Date.now() - t0
  return entry
}

async function main() {
  fs.mkdirSync(outputDir, { recursive: true })
  console.log('========== 全量 17 页面回归测试（带断言）==========')
  console.log(`项目: ${projectPath}`)
  console.log(`CLI: ${cliPath}`)
  console.log('')

  if (!fs.existsSync(cliPath)) {
    console.error(`[31m✗ DevTools CLI 不存在: ${cliPath}[0m`)
    console.error('请先跑 npm run test:e2e:doctor 确认环境，或设置 WECHAT_DEVTOOLS_CLI。')
    process.exit(2)
  }

  let miniProgram
  try {
    miniProgram = await automator.launch({ cliPath, projectPath, trustProject: true, timeout: 60000 })
  } catch (err) {
    console.error('[31m✗ automator.launch 失败:[0m', (err && (err.message || String(err)) || '').slice(0, 300))
    process.exit(2)
  }

  try {
    const systemInfo = await miniProgram.systemInfo()
    console.log(`系统: platform=${systemInfo.platform} SDK=${systemInfo.SDKVersion} model=${systemInfo.model}\n`)

    await installCloudMocks(miniProgram)

    // === Phase 1: 单页加载 + 渲染断言 ===
    console.log('--- Phase 1: 单页加载 (17 页) ---')
    for (const spec of pages) {
      const entry = await runPageAssertion(spec, miniProgram)
      results.push(entry)
      const tag = entry.status === 'PASS' ? '✓' : entry.status === 'FAIL' ? '✗' : '!'
      console.log(`${tag} [${entry.durationMs}ms] ${entry.name}`)
      if (entry.status !== 'PASS') {
        for (const a of entry.assertions.filter(x => x.fail)) console.log(`     ASSERT FAIL: ${a.fail}`)
        for (const e of (entry.pageErrors || []).slice(0, 3)) console.log(`     PAGE ERR: ${(e.msg || e).slice(0, 200)}`)
        for (const e of (entry.realConsoleErrors || entry.consoleErrors || []).slice(0, 3)) console.log(`     CONSOLE ERR: ${e.slice(0, 200)}`)
      }
    }

    // === Phase 2: 跨页场景 ===
    console.log('\n--- Phase 2: 跨页交互场景 ---')
    for (const scenario of scenarios) {
      const entry = await runScenario(scenario, miniProgram)
      results.push(entry)
      const tag = entry.status === 'PASS' ? '✓' : '✗'
      console.log(`${tag} [${entry.durationMs}ms] ${entry.name}`)
      if (entry.status !== 'PASS') {
        for (const s of entry.steps.filter(x => x.status === 'FAIL')) {
          console.log(`     STEP FAIL: ${s.type} — ${s.error}`)
        }
      }
    }
  } finally {
    try { await miniProgram.close() } catch {}
  }

  // === 汇总 ===
  const passed = results.filter(r => r.status === 'PASS').length
  const failed = results.filter(r => r.status !== 'PASS')
  const summary = {
    timestamp: new Date().toISOString(),
    summary: {
      total: results.length,
      passed,
      failed: failed.length,
      pages: pages.length,
      scenarios: scenarios.length,
      screenshotsTaken,
    },
    results,
  }
  const reportPath = path.join(outputDir, 'report.json')
  fs.writeFileSync(reportPath, JSON.stringify(summary, null, 2))

  console.log('\n========== 汇总 ==========')
  console.log(`总计: ${results.length} (${pages.length} 页面 + ${scenarios.length} 场景)`)
  console.log(`通过: ${passed}`)
  console.log(`失败: ${failed.length}`)
  console.log(`截图: ${screenshotsTaken}`)
  console.log(`报告: ${reportPath}`)
  process.exit(failed.length ? 1 : 0)
}

main().catch(err => {
  console.error('执行异常:', err && (err.stack || err.message || String(err)))
  process.exit(1)
})

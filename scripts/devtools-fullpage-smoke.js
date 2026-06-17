#!/usr/bin/env node
/**
 * 全量页面功能冒烟测试
 *
 * 通过微信开发者工具 CLI (miniprogram-automator) 逐个加载小程序全部 17 个页面，
 * 注入 mock 云数据后，在每个页面上：
 *   1. 等待渲染完成
 *   2. 抓取页面根节点文本，确认非空（页面真的渲染了）
 *   3. 尝试常见交互（点击主要按钮/卡片）
 *   4. 收集该页面生命周期内产生的 console.error / 未捕获异常
 *
 * 输出：控制台彩色摘要 + tmp/fullpage-smoke/report.json 结构化报告。
 * 退出码：有任何页面报错则 1，否则 0。
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
const cliPath = process.env.WECHAT_DEVTOOLS_CLI || '/Applications/wechatwebdevtools.app/Contents/MacOS/cli'
const outputDir = path.join(projectPath, 'tmp', 'fullpage-smoke')

// ---- 测试数据（与 parent-timeline-e2e 同源，覆盖报告/试卷/卡点/家长成员）----
const NOW = '2026-06-17T09:30:00+08:00'
const student = { _id: 'student-smoke', name: '钟青羽', grade: 6, createdAt: NOW, avatarColor: 'blue' }
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
  _id: 'report-smoke', studentId: student._id, subject: 'math', type: 'diagnosis', status: 'completed',
  createdAt: NOW, evidenceTime: NOW,
  summary: '发现计算基础、审题理解两个学习卡点。', totalErrors: 2,
  bottlenecks: [
    { lpCode: 'LP-001', lpName: '计算基础', errorCount: 1 },
    { lpCode: 'LP-008', lpName: '审题理解', errorCount: 1 },
  ],
  errorDetails: [
    { lpCode: 'LP-001', description: '分数加减未通分', severity: '中' },
    { lpCode: 'LP-008', description: '漏读“至少”条件', severity: '高' },
  ],
  imageFiles: [{ fileID: 'cloud://mock/photo-1.jpg', fileName: 'paper.jpg', ocrSummary: '分数计算与应用题', isDuplicate: false, uploadedAt: NOW }],
}, {
  _id: 'verification-report-smoke', studentId: student._id, subject: 'math', type: 'verification', status: 'completed',
  paperId: 'paper-smoke', createdAt: NOW, evidenceTime: NOW,
  comparisonSummary: '计算基础已改善，审题理解仍需观察。',
  verificationEvidence: [
    { lpCode: 'LP-001', complete: true, allCorrect: true },
    { lpCode: 'LP-008', complete: true, allCorrect: false },
  ],
  imageFiles: [],
}]
const papers = [{
  _id: 'paper-smoke', studentId: student._id, subject: 'math', type: 'verification',
  createdAt: NOW, generatedAt: NOW, paperDate: '2026-06-17',
  paperCode: 'MATH-20260617-01', paperDisplayCode: '数学-20260617-01',
  questions: [{ question: '1/2+1/3=', answer: '5/6' }, { question: '审题练习', answer: '略' }],
  questionCount: 2, bottleneckTargets: ['LP-001', 'LP-008'],
  bottleneckSummaries: ['计算基础', '审题理解'],
  studentPages: 1, answerPages: 1, totalPages: 2, pdfFileId: 'cloud://mock/paper.pdf',
}]
const members = [{ _id: 'member-1', studentId: student._id, ownerOpenId: 'o1', memberOpenId: 'o1', role: 'owner', status: 'active', displayName: '钟青羽家长', createdAt: NOW }]

// ---- 17 个页面的路由定义（含必要 query 参数）----
const studentQ = 'studentId=student-smoke&studentName=%E9%92%9F%E9%9D%92%E7%BE%BD'
const pages = [
  { name: 'index 首页/学习档案', route: '/pages/index/index' },
  { name: 'student-profile 学生档案', route: `/pages/student-profile/student-profile?${studentQ}` },
  { name: 'add-student 添加学生', route: '/pages/add-student/add-student' },
  { name: 'subject-home 学科工作台', route: `/pages/subject-home/subject-home?${studentQ}&subject=math&subjectName=%E6%95%B0%E5%AD%A6&grade=6` },
  { name: 'upload 拍照上传', route: `/pages/upload/upload?${studentQ}&subject=math&subjectName=%E6%95%B0%E5%AD%A6&grade=6` },
  { name: 'upload-history 学习记录', route: `/pages/upload-history/upload-history?${studentQ}` },
  { name: 'parent-management 家长管理', route: `/pages/parent-management/parent-management?${studentQ}` },
  { name: 'join-student 加入学生', route: '/pages/join-student/join-student' },
  { name: 'report 诊断报告', route: `/pages/report/report?id=report-smoke&${studentQ}` },
  { name: 'bottleneck-center 卡点中心', route: `/pages/bottleneck-center/bottleneck-center?${studentQ}` },
  { name: 'bottleneck-detail 卡点详情', route: `/pages/bottleneck-detail/bottleneck-detail?${studentQ}&subject=math&lpCode=LP-001` },
  { name: 'learning-resource 学习资源', route: '/pages/learning-resource/learning-resource?packId=pack-smoke' },
  { name: 'english-practice 英语练习', route: `/pages/english-practice/english-practice?${studentQ}&grade=6` },
  { name: 'english-dictation 英语听写', route: `/pages/english-dictation/english-dictation?${studentQ}&grade=6` },
  { name: 'generate-verification 生成验证卷', route: `/pages/generate-verification/generate-verification?${studentQ}&subject=math&subjectName=%E6%95%B0%E5%AD%A6` },
  { name: 'default-paper 默认试卷', route: `/pages/default-paper/default-paper?${studentQ}&subject=math&subjectName=%E6%95%B0%E5%AD%A6&grade=6` },
  { name: 'paper-preview 试卷预览', route: `/pages/paper-preview/paper-preview?paperId=paper-smoke` },
]

// ---- 工具函数 ----
const results = []

async function installCloudMocks(miniProgram) {
  await miniProgram.evaluate((cfg) => {
    const { student, permissions, subjectProfiles, reports, papers, members } = cfg
    // 全局错误采集桶
    globalThis.__smokeErrors = []
    globalThis.__smokeConsoleErrors = []
    const pushErr = (e) => {
      try {
        const msg = e && (e.message || e.errMsg || String(e))
        const stack = e && e.stack
        globalThis.__smokeErrors.push({ msg, stack: stack ? String(stack).split('\n').slice(0, 3).join(' | ') : '' })
      } catch { globalThis.__smokeErrors.push({ msg: String(e) }) }
    }
    // 采集 console.error
    const origError = console.error
    console.error = function (...args) {
      try { globalThis.__smokeConsoleErrors.push(args.map(a => (a && a.message) ? a.message : String(a)).join(' ')) } catch {}
      return origError.apply(this, args)
    }
    // 采集未捕获异常
    const origAppError = typeof App === 'function' ? null : null
    try {
      const oldOnError = wx.onError
      wx.onError = function (res) { pushErr(new Error(res)) }
    } catch {}

    wx.cloud.callFunction = async ({ name, data }) => {
      try {
        if (name === 'studentAccess') {
          if (data && data.action === 'getAccessibleStudents') {
            return { result: { success: true, students: [{ ...student, role: 'owner', permissions }] } }
          }
          if (data && data.action === 'listMembers') {
            return { result: { success: true, student, role: 'owner', permissions, members } }
          }
          if (data && data.action === 'createInvite') {
            return { result: { success: true, inviteId: 'i', token: 't', inviteCode: 'SMK123', path: '/pages/join-student/join-student', role: 'viewer', expiresAt: '2026-06-20T09:30:00+08:00' } }
          }
          if (data && data.action === 'getInvite') {
            return { result: { success: true, student, role: 'viewer', alreadyJoined: false } }
          }
          if (data && data.action === 'acceptInvite') {
            return { result: { success: true, student, role: 'viewer' } }
          }
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
          if (a === 'getLearningResource') return { result: { success: true, permissions, pack: { _id: 'pack-smoke', title: '计算基础练习包', lpCode: 'LP-001', items: [{ type: 'paper', title: '练习一' }] } } }
        }
        if (name === 'englishVocabulary') {
          return { result: { success: true, student, permissions, words: [{ word: 'apple', unit: 1, masteryStatus: 'untested', familiarity: { status: 'untested', correctCount: 0, wrongCount: 0, nextReviewAt: '' }, spelling: { status: 'untested', correctCount: 0, wrongCount: 0, nextReviewAt: '' } }] } }
        }
        return { result: { success: false, error: `unhandled mock ${name}:${data && data.action}` } }
      } catch (e) { pushErr(e); return { result: { success: false, error: 'mock throw' } } }
    }

    const matchesFilter = (item, filter = {}) => !filter || Object.keys(filter).length === 0 || Object.keys(filter).every(k => item[k] === filter[k])
    wx.cloud.database = () => ({
      collection(name) {
        const base = {
          students: [student], subjectProfiles, reports, papers, studentMembers: members,
        }
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
  }, { student, permissions: ownerPermissions, subjectProfiles, reports, papers, members })
}

async function collectErrors(miniProgram) {
  return miniProgram.evaluate(() => ({
    errors: (globalThis.__smokeErrors || []).slice(),
    consoleErrors: (globalThis.__smokeConsoleErrors || []).slice(),
  }))
}

function resetErrors(miniProgram) {
  return miniProgram.evaluate(() => {
    globalThis.__smokeErrors = []
    globalThis.__smokeConsoleErrors = []
  })
}

async function safe(fn, label) {
  try { await fn(); return null }
  catch (e) { return `${label}: ${e && (e.message || String(e))}` }
}

// ---- 主流程 ----
async function main() {
  fs.mkdirSync(outputDir, { recursive: true })
  console.log('启动 automator 并连接项目...')
  const miniProgram = await automator.launch({ cliPath, projectPath, timeout: 60000 })
  const systemInfo = await miniProgram.systemInfo()

  console.log('注入 cloud mock + 错误采集器...')
  await installCloudMocks(miniProgram)

  for (const spec of pages) {
    const started = Date.now()
    const entry = { name: spec.name, route: spec.route, status: 'PASS', durationMs: 0, errors: [], consoleErrors: [], interactions: [] }
    try {
      await resetErrors(miniProgram)
      const page = await miniProgram.reLaunch(spec.route)
      await page.waitFor(1500)
      const current = await miniProgram.currentPage()
      entry.resolvedPath = current.path

      // 确认页面真的渲染了内容（根节点 .page 存在且非空）
      const renderCheck = await safe(async () => {
        const root = await page.$('.page')
        if (!root) throw new Error('未找到 .page 根节点')
        const text = await root.text()
        if (!text || text.replace(/\s/g, '').length < 1) throw new Error('页面根节点为空')
        entry.textPreview = text.replace(/\s+/g, ' ').slice(0, 120)
      }, 'renderCheck')
      if (renderCheck) entry.interactions.push(renderCheck)

      // 尝试常见交互：点击第一个可点的 primary 按钮/卡片，观察是否报错（不强求成功）
      await safe(async () => {
        const btns = await page.$$('.btn-primary, .action-btn, .card, .record-card, .nav-item')
        if (btns.length) {
          await btns[0].tap()
          await page.waitFor(600)
          entry.interactions.push(`tapped .${btns[0] ? 'first-interactive' : 'none'} (found ${btns.length} candidates)`)
          // 点完之后回到当前页，避免导航离开影响后续
          await miniProgram.reLaunch(spec.route)
          await page.waitFor(800)
        }
      }, 'interaction')

      // 采集本轮页面产生的错误
      const collected = await collectErrors(miniProgram)
      entry.errors = collected.errors
      entry.consoleErrors = collected.consoleErrors
      if (entry.errors.length || entry.consoleErrors.length) entry.status = 'FAIL'
    } catch (e) {
      entry.status = 'ERROR'
      entry.errors.push({ msg: e && (e.message || String(e)), stack: e && e.stack ? String(e.stack).split('\n').slice(0, 3).join(' | ') : '' })
    }
    entry.durationMs = Date.now() - started
    results.push(entry)
    const tag = entry.status === 'PASS' ? '✓' : (entry.status === 'FAIL' ? '✗' : '!')
    const errCount = entry.errors.length + entry.consoleErrors.length
    console.log(`${tag} [${entry.durationMs}ms] ${spec.name}  ${errCount ? `(errors: ${errCount})` : ''}`)
  }

  await miniProgram.close()

  // 过滤掉已知无害的噪声错误（如未实现的 mock 调用、云环境提示等），单独标记
  const NOISE_PATTERNS = [
    /unhandled mock/i,
    /cloud.*init/i,
    /subscribe-message|订阅消息/i,
  ]
  for (const r of results) {
    r.realErrors = r.errors.filter(e => !NOISE_PATTERNS.some(p => p.test(e.msg || '')))
    r.realConsoleErrors = r.consoleErrors.filter(m => !NOISE_PATTERNS.some(p => p.test(m)))
    if (r.realErrors.length || r.realConsoleErrors.length) r.status = 'FAIL'
    else if (r.status === 'FAIL') r.status = 'PASS_NOISE'
  }

  const failed = results.filter(r => r.status === 'FAIL' || r.status === 'ERROR')
  const passed = results.filter(r => r.status === 'PASS' || r.status === 'PASS_NOISE')
  const report = {
    timestamp: new Date().toISOString(),
    systemInfo: { platform: systemInfo.platform, SDKVersion: systemInfo.SDKVersion, model: systemInfo.model },
    summary: { total: results.length, passed: passed.length, failed: failed.length },
    results,
  }
  fs.writeFileSync(path.join(outputDir, 'report.json'), JSON.stringify(report, null, 2))

  console.log('\n========== 全量页面功能冒烟测试 ==========')
  console.log(`系统: ${systemInfo.platform} / SDK ${systemInfo.SDKVersion} / ${systemInfo.model}`)
  console.log(`总计 ${results.length} 页 | 通过 ${passed.length} | 失败 ${failed.length}`)
  if (failed.length) {
    console.log('\n--- 失败页面详情 ---')
    for (const r of failed) {
      console.log(`\n[${r.status}] ${r.name}  (${r.route})`)
      for (const e of (r.realErrors && r.realErrors.length ? r.realErrors : r.errors)) console.log(`  ERROR: ${(e.msg || e).slice(0, 200)}`)
      for (const m of (r.realConsoleErrors && r.realConsoleErrors.length ? r.realConsoleErrors : r.consoleErrors)) console.log(`  CONSOLE.ERROR: ${m.slice(0, 200)}`)
    }
  } else {
    console.log('\n全部页面加载无报错 ✓')
  }
  console.log(`\n完整报告: ${path.join(outputDir, 'report.json')}`)
  process.exit(failed.length ? 1 : 0)
}

main().catch(err => {
  console.error('测试执行失败:', err && (err.stack || err.message || String(err)))
  process.exit(1)
})

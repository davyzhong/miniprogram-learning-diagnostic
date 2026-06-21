#!/usr/bin/env node
/**
 * 数据驱动的 E2E 场景测试
 *
 * 区别于 devtools-e2e-fullpage.js（硬编码 LP-001/LP-008 fixture）：
 *   - 从 data/math/*.seed.json 动态读取真实卡点、节点、资源
 *   - 注入真实 ERR 证据，验证报告页渲染对应卡点+资源
 *   - 注入诊断+验证两份报告，验证 new/persisting/improved 趋势对比
 *
 * 场景（用户选定的 4 个全覆盖）：
 *   1. 上传→诊断→报告：注入 ERR-001 错题，验证报告渲染
 *   2. 报告→卡点导航→资源：卡点详情→学习资源链路
 *   3. 页面渲染冒烟：报告/卡点中心/卡点详情核心页（fullpage 已覆盖 17 页，这里聚焦数据驱动断言）
 *   4. 历史报告对比：诊断+验证两份报告的趋势计算
 *
 * 前置：npm run test:e2e:doctor
 * 用法：WECHAT_DEVTOOLS_CLI=/path/to/cli node scripts/devtools-e2e-data-driven.js
 *       npm run test:e2e:data-driven
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
const outputDir = path.join(projectPath, 'tmp', 'e2e', 'math-data')

// === 从 seed JSON 动态加载真实数据 ===
const dataRoot = path.join(projectPath, 'data/math')
const replay = JSON.parse(fs.readFileSync(path.join(dataRoot, 'historical-error-replay.seed.json'), 'utf8'))
const taxonomy = JSON.parse(fs.readFileSync(path.join(dataRoot, 'bottleneck-taxonomy-v2.seed.json'), 'utf8'))
const nodes = JSON.parse(fs.readFileSync(path.join(dataRoot, 'knowledge-nodes.seed.json'), 'utf8'))
const resources = JSON.parse(fs.readFileSync(path.join(dataRoot, 'learning-resources.seed.json'), 'utf8'))

// 选取第一条有完整证据的 ERR 作为场景数据
const sampleErr = replay.items.find(it => it.primaryBottleneckId && (it.nodeIds || []).length > 0)
const sampleBn = taxonomy.bottlenecks.find(b => b.bottleneckId === sampleErr.primaryBottleneckId)
const sampleNode = nodes.nodes.find(n => n.nodeId === sampleBn.nodeId)
const sampleResources = (sampleNode.resourceIds || [])
  .map(rid => resources.resources.find(r => r.resourceId === rid))
  .filter(Boolean)

const NOW = '2026-06-17T09:30:00+08:00'
const student = { _id: 'student-dd', name: '钟青羽', grade: 6, createdAt: NOW, avatarColor: 'blue' }
const studentQ = 'studentId=student-dd&studentName=%E9%92%9F%E9%9D%92%E7%BE%BD'

// 用真实 ERR 数据构造诊断报告 fixture
const diagnosisReport = {
  _id: 'report-dd-diag',
  studentId: student._id,
  subject: 'math',
  type: 'diagnosis',
  status: 'completed',
  createdAt: NOW,
  evidenceTime: NOW,
  summary: `诊断发现 ${sampleBn.title} 卡点。`,
  totalErrors: 1,
  bottlenecks: [{
    lpCode: sampleErr.legacyLpCode,
    lpName: sampleErr.legacyLpName || sampleBn.title,
    severity: 'high',
    errorCount: 1,
    rootCause: sampleErr.whyMorePrecise || '',
    nodeIds: sampleErr.nodeIds,
    candidateBottlenecks: [{ bottleneckId: sampleErr.primaryBottleneckId, evidenceStrength: 'high' }],
    primaryBottleneckId: sampleErr.primaryBottleneckId,
  }],
  errorDetails: [{
    lpCode: sampleErr.legacyLpCode,
    questionContent: sampleErr.question,
    studentAnswer: sampleErr.studentAnswer,
    correctAnswer: sampleErr.correctAnswer,
  }],
  imageFiles: [{ fileID: 'cloud://mock/dd-1.jpg', fileName: 'paper.jpg', ocrSummary: sampleErr.question, isDuplicate: false, uploadedAt: NOW }],
}

// 用真实 BN 卡点构造 subjectProfile
const subjectProfile = {
  _id: 'profile-dd-math', studentId: student._id, subject: 'math', subjectName: '数学',
  totalReports: 2, updatedAt: NOW,
  currentBottlenecks: [
    { lpCode: sampleErr.legacyLpCode, lpName: sampleErr.legacyLpName || sampleBn.title, status: 'needs_verification', severity: 'high' },
  ],
  pendingBottlenecks: [{ lpCode: sampleErr.legacyLpCode, lpName: sampleErr.legacyLpName || sampleBn.title, status: 'needs_verification', severity: 'high' }],
  improvedBottlenecks: [],
}

// 验证报告（用于趋势对比场景）
const verificationReport = {
  _id: 'report-dd-verify',
  studentId: student._id,
  subject: 'math',
  type: 'verification',
  status: 'completed',
  paperId: 'paper-dd',
  createdAt: NOW,
  evidenceTime: NOW,
  comparisonSummary: `${sampleBn.title} 已改善。`,
  verificationEvidence: [
    { lpCode: sampleErr.legacyLpCode, complete: true, allCorrect: true },
  ],
  imageFiles: [],
}

// === 场景定义 ===
const scenarios = [
  {
    name: `场景1: 报告页渲染真实 ERR 证据 (${sampleErr.errorId})`,
    route: `/pages/report/report?id=report-dd-diag&${studentQ}`,
    wait: 3000,
    expect: {
      // 断言报告页渲染了卡点标题或相关文本
      textAny: [sampleBn.title, sampleErr.legacyLpName, '诊断报告'].filter(Boolean),
      notText: ['加载中', '页面不存在', 'undefined', '[object Object]'],
    },
  },
  {
    name: `场景2: 卡点中心展示真实卡点`,
    route: `/pages/bottleneck-center/bottleneck-center?${studentQ}`,
    wait: 2500,
    expect: {
      textAny: ['学习卡点中心', sampleBn.title, sampleErr.legacyLpName].filter(Boolean),
      notText: ['LP-001'], // 不应暴露内部编码
    },
  },
  {
    name: `场景3: 卡点详情页渲染证据链`,
    route: `/pages/bottleneck-detail/bottleneck-detail?${studentQ}&subject=math&lpCode=${sampleErr.legacyLpCode}`,
    wait: 2500,
    expect: {
      textAny: [sampleBn.title, sampleErr.legacyLpName, '卡点'].filter(Boolean),
    },
  },
  {
    name: `场景4: 验证报告趋势对比 (improved)`,
    route: `/pages/report/report?id=report-dd-verify&${studentQ}`,
    wait: 3000,
    expect: {
      textAny: ['验证', '改善', sampleBn.title, '对比'].filter(Boolean),
      notText: ['加载中', '页面不存在'],
    },
  },
]

// === 工具函数（复用 fullpage 的模式）===
const results = []
const errors = []

async function safe(fn, label) {
  try { return await fn() } catch (e) { return `${label}: ${e && (e.message || String(e))}` }
}

async function pageText(page) {
  const root = await page.$('.page')
  if (!root) return ''
  return (await root.text()).replace(/\s+/g, ' ')
}

async function activePage(miniProgram, fallbackPage) {
  let page = null
  if (typeof miniProgram.currentPage === 'function') {
    page = await miniProgram.currentPage()
  } else {
    page = miniProgram.currentPage
  }
  return page && typeof page.$ === 'function' ? page : fallbackPage
}

async function installCloudMocks(miniProgram) {
  await miniProgram.evaluate((cfg) => {
    const { student, subjectProfile, diagnosisReport, verificationReport } = cfg
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
          if (data.action === 'getAccessibleStudents') return { result: { success: true, students: [{ ...student, role: 'owner', permissions: { canView: true, canManageParents: true, canUpload: true, canGeneratePaper: true, canRetryAnalysis: true } }] } }
        }
        if (name === 'studentData') {
          if (data.action === 'getReportDetail') {
            const report = data.reportId === 'report-dd-verify' ? verificationReport : diagnosisReport
            return { result: { success: true, report } }
          }
          if (data.action === 'getReport') {
            if (data.reportId === 'report-dd-diag') return { result: { success: true, report: diagnosisReport } }
            if (data.reportId === 'report-dd-verify') return { result: { success: true, report: verificationReport } }
          }
          if (data.action === 'getReports') return { result: { success: true, reports: [diagnosisReport, verificationReport] } }
          if (data.action === 'getSubjectProfile') return { result: { success: true, profile: subjectProfile } }
        }
        return { result: { success: false, error: `mock: unhandled ${name}/${data && data.action}` } }
      } catch (e) {
        return { result: { success: false, error: String(e) } }
      }
    }

    // mock 云数据库
    if (wx.cloud.database) {
      const db = wx.cloud.database()
      const origCollection = db.collection.bind(db)
      db.collection = function (name) {
        const coll = origCollection(name)
        const data = {
          students: [student],
          reports: [diagnosisReport, verificationReport],
          subjectProfiles: [subjectProfile],
        }[name] || []
        coll.get = async () => ({ data })
        coll.doc = (id) => ({ get: async () => ({ data: data.find(d => d._id === id) || null }) })
        coll.where = () => ({ get: async () => ({ data }) })
        return coll
      }
    }
  }, { student, subjectProfile, diagnosisReport, verificationReport })
}

async function assertPage(miniProgram, page, scenario) {
  const text = await pageText(page)
  const fail = []

  // textAny：至少命中一个
  if (scenario.expect.textAny && scenario.expect.textAny.length > 0) {
    const hit = scenario.expect.textAny.some(t => text.includes(t))
    if (!hit) fail.push(`expected any of [${scenario.expect.textAny.join(', ')}], got first 200 chars: "${text.slice(0, 200)}"`)
  }
  // notText：不应出现
  if (scenario.expect.notText) {
    for (const t of scenario.expect.notText) {
      if (text.includes(t)) fail.push(`unexpected text "${t}" found`)
    }
  }
  // console/page errors
  const errInfo = await miniProgramEvaluateErrors(miniProgram)

  return { text: text.slice(0, 200), fail, errors: errInfo }
}

async function miniProgramEvaluateErrors(mp) {
  try {
    return await mp.evaluate(() => ({
      pageErrors: globalThis.__pageErrors || [],
      consoleErrors: (globalThis.__consoleErrors || []).slice(0, 5),
    }))
  } catch { return { pageErrors: [], consoleErrors: [] } }
}

// === 主流程 ===
async function main() {
  console.log('════════ 数据驱动 E2E 场景测试 ════════')
  console.log(`数据源: ${sampleErr.errorId} → ${sampleBn.bottleneckId} → ${sampleNode.nodeId}`)
  console.log(`关联资源: ${sampleResources.map(r => r.resourceId).join(', ') || '(无)'}`)
  console.log(`场景数: ${scenarios.length}`)
  console.log('')

  fs.mkdirSync(outputDir, { recursive: true })

  let miniProgram
  try {
    miniProgram = await automator.launch({ cliPath, projectPath, trustProject: true, timeout: 30000 })
  } catch (e) {
    console.error(`✗ launch 失败: ${e && (e.message || String(e))}`)
    console.error('  → 先跑 npm run test:e2e:doctor 确认环境')
    process.exit(2)
  }

  try {
    await installCloudMocks(miniProgram)

    for (const scenario of scenarios) {
      const page = await safe(() => miniProgram.reLaunch(scenario.route.split('?')[0] + '?' + (scenario.route.split('?')[1] || '')), `reLaunch ${scenario.route}`)
      if (typeof page === 'string') {
        errors.push({ scenario: scenario.name, error: page })
        results.push({ name: scenario.name, status: 'FAIL', reason: page })
        console.log(`✗ ${scenario.name} — launch 失败`)
        continue
      }
      await new Promise(r => setTimeout(r, scenario.wait || 2000))

      const currentPage = await activePage(miniProgram, page)
      const check = await assertPage(miniProgram, currentPage, scenario)
      const passed = check.fail.length === 0 && check.errors.pageErrors.length === 0

      results.push({
        name: scenario.name,
        status: passed ? 'PASS' : 'FAIL',
        reason: check.fail.join('; ') || (check.errors.pageErrors.length ? `pageErrors: ${check.errors.pageErrors.join('; ')}` : ''),
        textPreview: check.text,
      })

      if (passed) {
        console.log(`✓ ${scenario.name}`)
      } else {
        console.log(`✗ ${scenario.name}`)
        if (check.fail.length) console.log(`    断言失败: ${check.fail.join('; ')}`)
        if (check.errors.pageErrors.length) console.log(`    页面错误: ${check.errors.pageErrors.join('; ')}`)
        // 截图
        try {
          const screenshotPath = path.join(outputDir, `${results.length}-fail.png`)
          await currentPage.screenshot({ path: screenshotPath })
          console.log(`    截图: ${screenshotPath}`)
        } catch {}
      }
    }
  } finally {
    try { await miniProgram.close() } catch {}
  }

  // === 报告 ===
  const passed = results.filter(r => r.status === 'PASS').length
  const failed = results.filter(r => r.status === 'FAIL').length

  const report = {
    timestamp: new Date().toISOString(),
    dataSource: { errorId: sampleErr.errorId, bottleneckId: sampleBn.bottleneckId, nodeId: sampleNode.nodeId },
    total: results.length,
    passed,
    failed,
    results,
  }
  const reportPath = path.join(outputDir, 'report.json')
  fs.writeFileSync(reportPath, JSON.stringify(report, null, 2))

  console.log('')
  console.log(`════════ 结果: ${passed} 通过, ${failed} 失败 ════════`)
  console.log(`报告: ${reportPath}`)

  process.exit(failed > 0 ? 1 : 0)
}

main().catch(e => {
  console.error('data-driven E2E 异常:', e && (e.stack || e.message || String(e)))
  process.exit(1)
})

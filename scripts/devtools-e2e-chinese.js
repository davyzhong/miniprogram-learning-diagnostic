#!/usr/bin/env node
/**
 * 语文学科 CLI E2E
 *
 * 通过微信开发者工具 CLI + miniprogram-automator 打开语文核心页面。
 * 当前覆盖轻量主链路：语文工作台、语文诊断报告、语文错项复测出卷页。
 *
 * 前置：npm run test:e2e:doctor
 */

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
const outputDir = path.join(projectPath, 'tmp', 'e2e', 'chinese')

const NOW = '2026-06-20T09:00:00+08:00'
const student = { _id: 'student-chinese-e2e', name: '钟青羽', grade: 6, createdAt: NOW, avatarColor: 'purple' }
const permissions = { canView: true, canManageParents: true, canUpload: true, canGeneratePaper: true, canRetryAnalysis: true }
const profile = {
  _id: 'profile-chinese-e2e',
  studentId: student._id,
  subject: 'chinese',
  subjectName: '语文',
  totalReports: 1,
  updatedAt: NOW,
  currentBottlenecks: [{
    lpCode: 'CHI-CHAR-001',
    lpName: '错字复习',
    displayName: '错字复习',
    status: 'needs_verification',
    severity: 'high',
    chineseReviewItems: [
      { itemId: 'CHI-CHAR-001-01', targetText: '辩论', errorType: 'wrong_character', status: 'needs_review' },
      { itemId: 'CHI-CHAR-001-02', targetText: '徘徊', errorType: 'wrong_character', status: 'needs_review' },
    ],
  }],
  pendingBottlenecks: [{
    lpCode: 'CHI-CHAR-001',
    lpName: '错字复习',
    displayName: '错字复习',
    status: 'needs_verification',
    severity: 'high',
  }],
  improvedBottlenecks: [],
}
const report = {
  _id: 'report-chinese-e2e',
  studentId: student._id,
  subject: 'chinese',
  subjectName: '语文',
  type: 'diagnosis',
  status: 'completed',
  createdAt: NOW,
  evidenceTime: NOW,
  summary: '发现两个需要复习的具体错字。',
  totalErrors: 2,
  bottlenecks: profile.currentBottlenecks,
  chineseReviewItems: profile.currentBottlenecks[0].chineseReviewItems,
  imageFiles: [{ fileID: 'cloud://mock/chinese-1.jpg', fileName: '语文默写.jpg', ocrSummary: '错字：辩论、徘徊', uploadedAt: NOW }],
}

const studentQ = `studentId=${student._id}&studentName=${encodeURIComponent(student.name)}`
const pages = [
  {
    name: '语文工作台',
    route: `/pages/subject-home/subject-home?${studentQ}&subject=chinese&subjectName=${encodeURIComponent('语文')}&grade=6`,
    text: ['下一步建议', '拍照诊断', '下载验证卷', '知识地图'],
  },
  {
    name: '语文诊断报告',
    route: `/pages/report/report?id=${report._id}&${studentQ}&subject=chinese`,
    text: ['诊断报告', '错字复习'],
  },
  {
    name: '语文错项复测出卷页',
    route: `/pages/generate-verification/generate-verification?${studentQ}&subject=chinese&subjectName=${encodeURIComponent('语文')}`,
    text: ['验证卷状态', '纸面验证卷', '查看/下载验证卷'],
  },
]

async function pageText(page) {
  const root = await page.$('.page')
  if (!root) return ''
  return (await root.text()).replace(/\s+/g, ' ')
}

async function installMocks(miniProgram) {
  await miniProgram.evaluate((cfg) => {
    const { student, permissions, profile, report } = cfg
    wx.cloud.callFunction = async (payload) => {
      const name = payload && payload.name
      const data = (payload && payload.data) || {}
      if (name === 'studentData') {
        if (data.action === 'getSubjectDashboard') {
          return { result: { success: true, student, permissions, profile, reports: [report], papers: [] } }
        }
        if (data.action === 'getReportDetail') {
          return { result: { success: true, student, permissions, report } }
        }
        if (data.action === 'getStudentDashboard') {
          return { result: { success: true, student, permissions, subjectProfiles: [profile], recentReports: [report], recentPapers: [] } }
        }
      }
      if (name === 'studentAccess') {
        return { result: { success: true, students: [{ ...student, role: 'owner', permissions }] } }
      }
      return { result: { success: true } }
    }
    wx.cloud.getTempFileURL = async ({ fileList = [] }) => ({
      fileList: fileList.map(fileID => ({ fileID, tempFileURL: '/assets/images/app-logo-share.jpg' }))
    })
    wx.cloud.database = () => ({
      collection(name) {
        const data = { students: [student], subjectProfiles: [profile], reports: [report], papers: [] }[name] || []
        return {
          where(filter = {}) {
            const rows = data.filter(item => Object.keys(filter).every(key => item[key] === filter[key]))
            return { orderBy() { return this }, limit() { return this }, async get() { return { data: rows } } }
          },
          doc(id) { return { async get() { return { data: data.find(item => item._id === id) || null } } } },
          orderBy() { return this },
          limit() { return this },
          async get() { return { data } },
        }
      },
      serverDate() { return new Date() },
    })
  }, { student, permissions, profile, report })
}

async function runPage(miniProgram, spec) {
  const started = Date.now()
  const entry = { name: spec.name, route: spec.route, status: 'PASS', durationMs: 0, assertions: [] }
  try {
    const page = await miniProgram.reLaunch(spec.route)
    await page.waitFor(1800)
    const text = await pageText(page)
    for (const expected of spec.text) {
      if (!text.includes(expected)) {
        entry.assertions.push({ name: 'expectText', fail: `缺少文本：${expected}`, actualText: text.slice(0, 800) })
      }
    }
    if (entry.assertions.some(item => item.fail)) entry.status = 'FAIL'
  } catch (error) {
    entry.status = 'FAIL'
    entry.error = error && (error.stack || error.message || String(error))
  } finally {
    entry.durationMs = Date.now() - started
  }
  return entry
}

async function main() {
  fs.mkdirSync(outputDir, { recursive: true })
  let miniProgram
  try {
    miniProgram = await automator.launch({ cliPath, projectPath, trustProject: true, timeout: 60000 })
  } catch (error) {
    console.error('启动 DevTools 失败，请先跑 npm run test:e2e:doctor')
    console.error(error && (error.stack || error.message || String(error)))
    process.exit(2)
  }

  const results = []
  try {
    await installMocks(miniProgram)
    for (const spec of pages) {
      const result = await runPage(miniProgram, spec)
      results.push(result)
      console.log(`${result.status === 'PASS' ? 'PASS' : 'FAIL'} ${spec.name}`)
    }
  } finally {
    await miniProgram.close()
  }

  const passed = results.filter(item => item.status === 'PASS').length
  const failed = results.length - passed
  const reportPath = path.join(outputDir, 'report.json')
  fs.writeFileSync(reportPath, `${JSON.stringify({
    suite: 'chinese',
    timestamp: new Date().toISOString(),
    summary: { total: results.length, passed, failed },
    results,
  }, null, 2)}\n`)
  console.log(`语文 E2E：${passed}/${results.length} 通过`)
  console.log(`报告：${reportPath}`)
  process.exit(failed > 0 ? 1 : 0)
}

main().catch(error => {
  console.error(error && (error.stack || error.message || String(error)))
  process.exit(1)
})

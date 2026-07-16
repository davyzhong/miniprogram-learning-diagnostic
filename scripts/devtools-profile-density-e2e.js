#!/usr/bin/env node

const assert = require('node:assert/strict')
const path = require('node:path')

const PROJECT_PATH = path.resolve(__dirname, '..')
const CLI_PATH = process.env.WECHAT_DEVTOOLS_CLI
  || (process.platform === 'darwin' ? '/Applications/wechatwebdevtools.app/Contents/MacOS/cli' : 'cli')
const VIEWPORT = { width: 375, height: 812 }

function numberOf(value) {
  const number = Number.parseFloat(value)
  return Number.isFinite(number) ? number : 0
}

async function rectFor(element) {
  const [size, offset] = await Promise.all([element.size(), element.offset()])
  return { left: numberOf(offset.left), top: numberOf(offset.top), width: numberOf(size.width), height: numberOf(size.height) }
}

function assertVisibleInFirstViewport(name, rect) {
  assert(rect.width > 0 && rect.height > 0, `${name} did not render`)
  assert(rect.left >= 0 && rect.left + rect.width <= VIEWPORT.width + 1, `${name} overflows the viewport`)
  assert(rect.top < VIEWPORT.height, `${name} does not begin in the first viewport`)
}

function loadAutomator() {
  try {
    return require('miniprogram-automator')
  } catch (error) {
    return require('/tmp/learning-diagnostic-automator/node_modules/miniprogram-automator')
  }
}

async function installProfileMock(miniProgram) {
  await miniProgram.evaluate(() => {
    const student = { _id: 'profile-density', name: '学习档案密度示例', grade: 6 }
    const report = (id, subject, createdAt, summary) => ({
      _id: id,
      subject,
      type: 'diagnosis',
      status: 'completed',
      isEffective: true,
      createdAt,
      summary,
      totalErrors: 3,
      bottlenecks: [{ lpName: '多步骤条件筛选与验算表达' }],
      imageFiles: [{ fileID: 'cloud://profile-density/evidence.jpg' }]
    })
    const reports = [
      report('profile-density-math', 'math', '2026-07-16T10:00:00+08:00', '数学判断：先稳定多步骤条件筛选，再完成一次验证。'),
      report('profile-density-chinese', 'chinese', '2026-07-15T10:00:00+08:00', '语文判断：继续核对跨段信息，完成短篇复盘。')
    ]
    wx.cloud.callFunction = async ({ name, data = {} }) => {
      if (name === 'studentData' && data.action === 'getStudentDashboard') {
        return {
          result: {
            success: true,
            student,
            permissions: { canView: true, canManageParents: true, canUpload: true, canGeneratePaper: true },
            subjectProfiles: [
              { subject: 'math', totalReports: 2, currentBottlenecks: [{ status: 'needs_verification', lpName: '多步骤条件筛选与验算表达' }] },
              { subject: 'chinese', totalReports: 1, currentBottlenecks: [{ status: 'needs_verification', lpName: '跨段信息整合' }] }
            ],
            recentReports: reports,
            latestDiagnosisReports: reports,
            recentPapers: []
          }
        }
      }
      return { result: { success: false, error: `unhandled profile density mock ${name}:${data.action}` } }
    }
  })
}

async function main() {
  const automator = loadAutomator()
  let miniProgram
  try {
    miniProgram = await automator.launch({ cliPath: CLI_PATH, projectPath: PROJECT_PATH, trustProject: true, timeout: 60000 })
    const systemInfo = await miniProgram.systemInfo()
    assert.equal(systemInfo.windowWidth, VIEWPORT.width, 'select a 375px-wide simulator before running this audit')
    assert.equal(systemInfo.windowHeight, VIEWPORT.height, 'select an 812px-high simulator before running this audit')
    await installProfileMock(miniProgram)
    const page = await miniProgram.reLaunch('/pages/student-profile/student-profile?studentId=profile-density')
    await page.waitFor('.b1-profile-report')
    await page.waitFor(800)

    const [header, firstJudgment, firstSignal, firstNext, reports] = await Promise.all([
      page.$('.top-row'),
      page.$('.b1-profile-report .diagnosis-judgment'),
      page.$('.b1-profile-report .diagnosis-signal-line'),
      page.$('.b1-profile-report .diagnosis-next'),
      page.$$('.b1-profile-report')
    ])
    assert(header && firstJudgment && firstSignal && firstNext, 'profile density blocks did not render')
    assert(reports.length >= 2, 'profile density mock must render two reports')
    const metrics = {
      header: await rectFor(header),
      firstJudgment: await rectFor(firstJudgment),
      firstSignal: await rectFor(firstSignal),
      firstNext: await rectFor(firstNext),
      secondReport: await rectFor(reports[1])
    }
    for (const [name, rect] of Object.entries(metrics)) assertVisibleInFirstViewport(name, rect)
    console.log(JSON.stringify({ status: 'PASS', viewport: VIEWPORT, metrics }, null, 2))
  } finally {
    if (miniProgram) await miniProgram.close()
  }
}

if (require.main === module) {
  main().catch(error => {
    console.error(error && (error.stack || error.message || String(error)))
    process.exitCode = 1
  })
}

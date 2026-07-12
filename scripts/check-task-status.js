// scripts/check-task-status.js
// 查看 analysisTask 的详细状态，包括批次错误信息
const automator = require('miniprogram-automator')
const path = require('path')
const projectPath = path.resolve(__dirname, '..')

const REPORT_ID = '786aa83e6a51c77100b805dc3103c97b'

async function main() {
  const mp = await automator.launch({
    cliPath: '/Applications/wechatwebdevtools.app/Contents/MacOS/cli',
    projectPath, trustProject: true, timeout: 60000
  })

  try {
    const detail = await mp.evaluate(async (reportId) => {
      const db = wx.cloud.database()
      const tasksRes = await db.collection('analysisTasks')
        .where({ reportId }).orderBy('createdAt', 'desc').limit(1).get()
      const t = (tasksRes.data || [])[0] || {}

      // 也查报告当前状态
      const reportRes = await db.collection('reports').doc(reportId).get()
      const r = reportRes.data

      return JSON.parse(JSON.stringify({
        reportStatus: r.status,
        reportError: (r.error || '').slice(0, 300),
        taskStatus: t.status,
        taskError: (t.error || '').slice(0, 300),
        completedBatches: t.completedBatches,
        totalBatches: t.totalBatches,
        taskUpdatedAt: t.updatedAt,
        taskCreatedAt: t.createdAt,
        retryCount: t.retryCount,
        batchResults: (t.batchResults || []).map((br, i) => ({
          index: i,
          success: br.success,
          retryAttempt: br.retryAttempt,
          error: (br.error || '').slice(0, 250),
          fileIDs: (br.fileIDs || br.analyzedFileIDs || []).map(f => f.slice(-30))
        })),
        attempts: (t.attempts || []).map(a => ({
          startedAt: a.startedAt,
          completedAt: a.completedAt,
          error: (a.error || '').slice(0, 200)
        }))
      }))
    }, REPORT_ID)
    console.log(JSON.stringify(detail, null, 2))
  } finally {
    await mp.close()
  }
}

main().catch(e => { console.error(e.stack || e.message); process.exit(1) })

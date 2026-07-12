// scripts/check-aggregate-report.js
const automator = require('miniprogram-automator')
const path = require('path')
const projectPath = path.resolve(__dirname, '..')

const REPORT_ID = '76ec3f156a523e4a0006774e7e009e7f'

async function main() {
  const mp = await automator.launch({
    cliPath: '/Applications/wechatwebdevtools.app/Contents/MacOS/cli',
    projectPath, trustProject: true, timeout: 60000
  })
  try {
    const data = await mp.evaluate(async (reportId) => {
      const db = wx.cloud.database()
      const r = (await db.collection('reports').doc(reportId).get()).data
      const tasksRes = await db.collection('analysisTasks')
        .where({ reportId }).orderBy('createdAt', 'desc').limit(1).get()
      const t = (tasksRes.data || [])[0] || {}
      return JSON.parse(JSON.stringify({
        reportStatus: r.status,
        error: (r.error || '').slice(0, 200),
        totalErrors: r.totalErrors,
        summary: (r.summary || '').slice(0, 100),
        partialSuccess: r.partialSuccess,
        failedBatchCount: r.failedBatchCount,
        analysisWarning: (r.analysisWarning || '').slice(0, 200),
        taskStatus: t.status,
        taskError: (t.error || '').slice(0, 200),
        completedBatches: t.completedBatches,
        totalBatches: t.totalBatches,
        batchResults: (t.batchResults || []).filter(br => !br.success).map(br => ({
          success: br.success,
          error: (br.error || '').slice(0, 100),
        })),
        bottlenecks: (r.bottlenecks || []).slice(0, 10).map(b => ({
          lpCode: b.lpCode, lpName: b.lpName, errorCount: b.errorCount
        })),
        errorDetailCount: (r.errorDetails || []).length,
      }))
    }, REPORT_ID)
    console.log(JSON.stringify(data, null, 2))
  } finally {
    await mp.close()
  }
}
main().catch(e => { console.error(e); process.exit(1) })

// scripts/collect-project-stats.js
// 收集项目真实运行数据，用于 README 文档
const automator = require('miniprogram-automator')
const path = require('path')
const projectPath = path.resolve(__dirname, '..')

async function main() {
  const mp = await automator.launch({
    cliPath: '/Applications/wechatwebdevtools.app/Contents/MacOS/cli',
    projectPath, trustProject: true, timeout: 60000
  })

  try {
    const data = await mp.evaluate(async () => {
      const db = wx.cloud.database()
      const _ = db.command

      const studentsRes = await db.collection('students').count()
      const reportsRes = await db.collection('reports').where({ isArchived: _.neq(true) }).limit(100).get()
      const reports = reportsRes.data
      const mathDiagnosis = reports.filter(r => r.subject === 'math' && r.type === 'diagnosis' && r.status === 'completed')
      const mathVerification = reports.filter(r => r.subject === 'math' && r.type === 'verification' && r.status === 'completed')
      const papersRes = await db.collection('papers').where({ type: 'verification' }).limit(50).get()
      const readyPapers = papersRes.data.filter(p => p.generationStatus === 'ready')
      const wordsRes = await db.collection('studentEnglishWords').count()
      const aiUsageRes = await db.collection('aiUsageEvents').where({ status: 'succeeded' }).limit(500).get()
      const aiEvents = aiUsageRes.data
      const totalTokens = aiEvents.reduce((s, e) => s + (e.totalTokens || 0), 0)
      const totalCost = aiEvents.reduce((s, e) => s + (e.estimatedCostCny || 0), 0)

      const mainReport = mathDiagnosis[0] || {}
      const reportBottlenecks = (mainReport.bottlenecks || []).map(b => ({
        lpName: b.lpName || b.lpCode,
        errorCount: b.errorCount || 0,
        severity: b.severity || '',
      }))

      return JSON.parse(JSON.stringify({
        students: studentsRes.total,
        activeReports: reports.length,
        mathDiagnosisCount: mathDiagnosis.length,
        mathVerificationCount: mathVerification.length,
        readyPapers: readyPapers.length,
        englishWords: wordsRes.total,
        aiEvents: aiEvents.length,
        totalTokens,
        totalCost: Math.round(totalCost * 100) / 100,
        mainReport: {
          totalErrors: mainReport.totalErrors,
          imageCount: (mainReport.imageFileIds || []).length,
          bottlenecks: reportBottlenecks,
          createdAt: mainReport.createdAt,
        },
      }))
    })
    console.log(JSON.stringify(data, null, 2))
  } finally {
    await mp.close()
  }
}

main().catch(e => { console.error(e); process.exit(1) })

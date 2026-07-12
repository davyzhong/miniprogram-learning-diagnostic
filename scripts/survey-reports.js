// scripts/survey-reports.js
// 统计数据库中的诊断报告数量和受影响范围
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

      // 总报告数
      const totalRes = await db.collection('reports').count()

      // 按类型统计
      const diagnosisRes = await db.collection('reports').where({ type: 'diagnosis', status: 'completed' }).count()
      const verificationRes = await db.collection('reports').where({ type: 'verification', status: 'completed' }).count()
      const mathDiagnosisRes = await db.collection('reports').where({ subject: 'math', type: 'diagnosis', status: 'completed' }).count()

      // 按学生统计
      const studentsRes = await db.collection('reports').where({ type: 'diagnosis' }).limit(100).get()
      const studentIds = new Set()
      const reportList = []
      for (const r of studentsRes.data) {
        studentIds.add(r.studentId)
        if (r.status === 'completed' && !r.isArchived) {
          reportList.push({
            id: r._id,
            studentId: r.studentId,
            subject: r.subject,
            type: r.type,
            status: r.status,
            createdAt: r.createdAt,
            totalErrors: r.totalErrors || 0,
            imageCount: (r.imageFileIds || []).length,
            isArchived: r.isArchived || false,
          })
        }
      }

      // 查 math 诊断报告的详细情况
      const mathRes = await db.collection('reports').where({
        subject: 'math', type: 'diagnosis', status: 'completed', isArchived: _.neq(true)
      }).orderBy('createdAt', 'desc').limit(50).get()

      return JSON.parse(JSON.stringify({
        total: totalRes.total,
        diagnosisCompleted: diagnosisRes.total,
        verificationCompleted: verificationRes.total,
        mathDiagnosisCompleted: mathDiagnosisRes.total,
        uniqueStudents: studentIds.size,
        activeMathReports: mathRes.data.map(r => ({
          id: r._id,
          studentId: r.studentId,
          createdAt: r.createdAt,
          totalErrors: r.totalErrors || 0,
          bottlenecks: (r.bottlenecks || []).map(b => b.lpCode),
          imageCount: (r.imageFileIds || []).length,
          hasErrorDetails: (r.errorDetails || []).length,
          hasReanalysis: Boolean(r.mathReanalysis || r.replacedByReportId),
        })),
      }))
    })

    console.log('=== 报告统计 ===')
    console.log(JSON.stringify({
      total: data.total,
      diagnosisCompleted: data.diagnosisCompleted,
      verificationCompleted: data.verificationCompleted,
      mathDiagnosisCompleted: data.mathDiagnosisCompleted,
      uniqueStudents: data.uniqueStudents,
    }, null, 2))

    console.log('\n=== 活跃数学诊断报告 ===')
    for (const r of data.activeMathReports) {
      console.log(`  ${r.id} | 学生=${r.studentId.slice(-8)} | ${r.createdAt} | 错题=${r.totalErrors} | 卡点=[${r.bottlenecks.join(',')}] | 图片=${r.imageCount} | 已重分析=${r.hasReanalysis}`)
    }
    console.log(`\n共 ${data.activeMathReports.length} 份活跃数学诊断报告`)

  } finally {
    await mp.close()
  }
}

main().catch(e => { console.error(e); process.exit(1) })

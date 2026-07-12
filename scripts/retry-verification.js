const automator = require('miniprogram-automator')
const path = require('path')
const projectPath = path.resolve(__dirname, '..')

async function main() {
  const mp = await automator.launch({
    cliPath: '/Applications/wechatwebdevtools.app/Contents/MacOS/cli',
    projectPath, trustProject: true, timeout: 60000
  })

  try {
    const reportId = '786aa83e6a51c77100b805dc3103c97b'
    const sq = 'studentId=966151a66a29599400006aca3e38ffaf&studentName=' + encodeURIComponent('钟青羽')

    // 直接调 analyzePhotos 触发分析（它会创建新 task 或续跑旧 task）
    console.log('=== 调用 analyzePhotos ===')
    const triggerResult = await mp.evaluate(async (reportId) => {
      try {
        const res = await wx.cloud.callFunction({
          name: 'analyzePhotos',
          data: { reportId },
          timeout: 25000
        })
        return JSON.parse(JSON.stringify({ ok: true, result: res.result }))
      } catch (err) {
        return { ok: false, error: (err.message || '').slice(0, 300) }
      }
    }, reportId)
    console.log('触发结果:', JSON.stringify(triggerResult, null, 2))

    // 轮询 task 状态（每 15 秒查一次，最多 5 分钟）
    console.log('\n=== 轮询分析状态 ===')
    for (let i = 0; i < 20; i++) {
      await new Promise(r => setTimeout(r, 15000))
      const status = await mp.evaluate(async (reportId) => {
        const db = wx.cloud.database()
        const reportRes = await db.collection('reports').doc(reportId).get()
        const r = reportRes.data
        const tasksRes = await db.collection('analysisTasks')
          .where({ reportId }).orderBy('createdAt', 'desc').limit(1).get()
        const t = (tasksRes.data || [])[0] || {}
        return JSON.parse(JSON.stringify({
          reportStatus: r.status,
          totalErrors: r.totalErrors || 0,
          error: (r.error || '').slice(0, 150),
          summary: (r.summary || '').slice(0, 100),
          taskStatus: t.status,
          completedBatches: t.completedBatches,
          totalBatches: t.totalBatches,
          batchResults: (t.batchResults || []).map(br => ({
            success: br.success,
            retry: br.retryAttempt,
            error: (br.error || '').slice(0, 100)
          })),
          taskUpdatedAt: t.updatedAt
        }))
      }, reportId)
      console.log(`[${(i+1)*15}s] report=${status.reportStatus} task=${status.taskStatus} 批次=${status.completedBatches}/${status.totalBatches}`)

      if (status.batchResults.length > 0) {
        for (const br of status.batchResults) {
          console.log(`  批次: success=${br.success} retry=${br.retry} ${br.error}`)
        }
      }
      if (status.reportStatus === 'completed') {
        console.log(`\n✓✓✓ 分析完成！`)
        console.log(`错题数: ${status.totalErrors}`)
        console.log(`摘要: ${status.summary}`)
        break
      }
      if (status.reportStatus === 'failed') {
        console.log(`\n✗ 分析失败: ${status.error}`)
        break
      }
    }

  } finally {
    await mp.close()
  }
}
main().catch(e => { console.error(e.stack || e.message); process.exit(1) })

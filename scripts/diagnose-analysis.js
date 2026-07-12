const automator = require('miniprogram-automator')
const path = require('path')
const projectPath = path.resolve(__dirname, '..')

async function main() {
  const mp = await automator.launch({
    cliPath: '/Applications/wechatwebdevtools.app/Contents/MacOS/cli',
    projectPath, trustProject: true, timeout: 60000
  })

  try {
    // 直接调 analyzePhotos 并拦截完整返回
    const result = await mp.evaluate(async () => {
      try {
        const res = await wx.cloud.callFunction({
          name: 'analyzePhotos',
          data: { reportId: '786aa83e6a51c77100b805dc3103c97b' },
          timeout: 30000
        })
        return JSON.parse(JSON.stringify({ ok: true, result: res.result }))
      } catch (err) {
        return { ok: false, error: err.message || String(err), errCode: err.errCode }
      }
    })

    console.log('=== analyzePhotos 调用结果 ===')
    console.log(JSON.stringify(result, null, 2))

    // 等 10 秒后再查一次 task 状态
    await new Promise(r => setTimeout(r, 10000))

    const taskData = await mp.evaluate(async () => {
      const db = wx.cloud.database()
      const tasksRes = await db.collection('analysisTasks')
        .where({ reportId: '786aa83e6a51c77100b805dc3103c97b' })
        .orderBy('createdAt', 'desc')
        .limit(2)
        .get()

      const reportRes = await db.collection('reports').doc('786aa83e6a51c77100b805dc3103c97b').get()

      return JSON.parse(JSON.stringify({
        reportStatus: reportRes.data.status,
        reportError: (reportRes.data.error || '').slice(0, 200),
        reportDebugError: (reportRes.data.debugError || '').slice(0, 300),
        reportUpdatedAt: reportRes.data.updatedAt,
        tasks: tasksRes.data.map(t => ({
          status: t.status,
          completedBatches: t.completedBatches,
          totalBatches: t.totalBatches,
          batchResults: (t.batchResults || []).map(br => ({
            success: br.success,
            error: (br.error || '').slice(0, 200),
            retryAttempt: br.retryAttempt
          })),
          error: (t.error || '').slice(0, 300),
          updatedAt: t.updatedAt
        }))
      }))
    })

    console.log('\n=== 10 秒后状态 ===')
    console.log(JSON.stringify(taskData, null, 2))

  } finally {
    await mp.close()
  }
}
main().catch(e => { console.error(e.stack || e.message); process.exit(1) })

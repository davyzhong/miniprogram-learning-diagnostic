const automator = require('miniprogram-automator')
const path = require('path')
const projectPath = path.resolve(__dirname, '..')

async function main() {
  const mp = await automator.launch({
    cliPath: '/Applications/wechatwebdevtools.app/Contents/MacOS/cli',
    projectPath, trustProject: true, timeout: 60000
  })

  try {
    // 把卡住的 task 和 report 都重置
    const result = await mp.evaluate(async () => {
      const db = wx.cloud.database()
      const reportId = '786aa83e6a51c77100b805dc3103c97b'

      // 查所有这个 report 的 task
      const tasksRes = await db.collection('analysisTasks')
        .where({ reportId }).get()

      // 全部标记 failed
      for (const t of tasksRes.data) {
        if (t.status === 'processing') {
          await db.collection('analysisTasks').doc(t._id).update({
            data: { status: 'failed', error: '手动重置：卡在 processing', completedAt: new Date() }
          })
          console.log('reset task', t._id)
        }
      }

      // 重置 report 状态为 failed（让前端可以重新触发）
      await db.collection('reports').doc(reportId).update({
        data: { status: 'failed', error: '分析超时，请重试', debugError: '手动重置卡住的 processing task', updatedAt: new Date() }
      })

      return {
        resetTasks: tasksRes.data.length,
        reportReset: true
      }
    })
    console.log('重置结果:', JSON.stringify(result, null, 2))

  } finally {
    await mp.close()
  }
}
main().catch(e => { console.error(e.stack || e.message); process.exit(1) })

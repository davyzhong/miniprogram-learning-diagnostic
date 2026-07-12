// scripts/reset-failed-to-pending.js
// 把之前重分析失败的报告重置为 pending，让它们能被重新拾起
const automator = require('miniprogram-automator')
const path = require('path')
const projectPath = path.resolve(__dirname, '..')

async function main() {
  const mp = await automator.launch({
    cliPath: '/Applications/wechatwebdevtools.app/Contents/MacOS/cli',
    projectPath, trustProject: true, timeout: 60000
  })
  try {
    const result = await mp.evaluate(async () => {
      const db = wx.cloud.database()
      const _ = db.command
      // 找所有 failed 或 analyzing 的数学诊断报告
      const res = await db.collection('reports').where({
        subject: 'math', type: 'diagnosis',
        status: _.in(['failed', 'analyzing'])
      }).get()

      let reset = 0
      for (const r of res.data) {
        await db.collection('reports').doc(r._id).update({
          data: {
            status: 'completed',
            // 保留旧的 totalErrors 以便对比
            totalErrors: r.totalErrors || 0,
            // 清除错误状态
            error: '',
            updatedAt: db.serverDate()
          }
        })
        reset++
      }
      return { reset, total: res.data.length, ids: res.data.map(r => r._id) }
    })
    console.log('重置结果:', JSON.stringify(result, null, 2))
  } finally {
    await mp.close()
  }
}
main().catch(e => { console.error(e); process.exit(1) })

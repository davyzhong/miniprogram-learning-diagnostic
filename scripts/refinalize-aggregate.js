// scripts/refinalize-aggregate.js
// 汇总报告 120 批次已完成但最终写入失败，重新触发最终聚合
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
    // 重置报告状态为 pending（不删 task 的 batchResults，保留 120 批结果）
    console.log('=== 重置报告状态 ===')
    const reset = await mp.evaluate(async (reportId) => {
      const db = wx.cloud.database()
      const _ = db.command

      // 重置报告
      await db.collection('reports').doc(reportId).update({
        data: {
          status: 'pending',
          error: '',
          quality: _.set({}),  // 用 set 覆盖 null
          updatedAt: db.serverDate()
        }
      })

      // 重置 task 但保留 completedBatches=120 和 batchResults
      const tasksRes = await db.collection('analysisTasks')
        .where({ reportId }).orderBy('createdAt', 'desc').limit(1).get()
      const t = (tasksRes.data || [])[0]
      if (t) {
        await db.collection('analysisTasks').doc(t._id).update({
          data: {
            status: 'processing',
            nextBatchIndex: 0,  // 让 analyzePhotos 重新从头检查
            updatedAt: db.serverDate()
          }
        })
        return { reset: true, taskId: t._id, completedBatches: t.completedBatches, totalBatches: t.totalBatches }
      }
      return { reset: true, taskId: null }
    }, REPORT_ID)
    console.log('重置:', JSON.stringify(reset))

    // 触发 analyzePhotos（它会看到 nextBatchIndex=0 但 batchResults 都在，跳过已完成的，直接聚合）
    console.log('\n=== 触发 analyzePhotos ===')
    const trigger = await mp.evaluate(async (reportId) => {
      try {
        const res = await wx.cloud.callFunction({ name: 'analyzePhotos', data: { reportId } })
        return JSON.parse(JSON.stringify({ ok: true, result: res.result }))
      } catch (err) {
        return { ok: false, error: (err.message || '').slice(0, 200) }
      }
    }, REPORT_ID)
    console.log('触发:', JSON.stringify(trigger).slice(0, 300))

    // 轮询
    for (let i = 0; i < 20; i++) {
      await new Promise(r => setTimeout(r, 10000))
      const status = await mp.evaluate(async (reportId) => {
        const db = wx.cloud.database()
        const r = (await db.collection('reports').doc(reportId).get()).data
        return JSON.parse(JSON.stringify({
          reportStatus: r.status,
          totalErrors: r.totalErrors || 0,
          error: (r.error || '').slice(0, 200),
          summary: (r.summary || '').slice(0, 80),
        }))
      }, REPORT_ID)
      console.log(`[${(i+1)*10}s] ${status.reportStatus} 错题=${status.totalErrors}`)

      if (status.reportStatus === 'completed') {
        console.log(`\n✓✓✓ 完成！错题=${status.totalErrors}`)
        console.log(`摘要: ${status.summary}`)

        // 显示详情
        const detail = await mp.evaluate(async (reportId) => {
          const db = wx.cloud.database()
          const r = (await db.collection('reports').doc(reportId).get()).data
          return JSON.parse(JSON.stringify({
            totalErrors: r.totalErrors,
            bottlenecks: (r.bottlenecks || []).map(b => ({
              lpCode: b.lpCode, lpName: b.lpName, errorCount: b.errorCount, severity: b.severity
            })),
            errorDetailCount: (r.errorDetails || []).length,
            quality: r.quality,
          }))
        }, REPORT_ID)
        console.log('\n=== 诊断详情 ===')
        console.log(JSON.stringify(detail, null, 2))
        break
      }
      if (status.reportStatus === 'failed') {
        console.log(`\n✗ 失败: ${status.error}`)
        break
      }
    }
  } finally {
    await mp.close()
  }
}
main().catch(e => { console.error(e); process.exit(1) })

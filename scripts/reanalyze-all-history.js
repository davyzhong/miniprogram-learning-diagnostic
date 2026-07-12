// scripts/reanalyze-all-history.js
// 重新分析所有历史数学诊断报告（用新的 qwen3.5-plus 视觉模型）
// 策略：触发→轮询→如果卡住就重置 stale→再触发，直到完成
const automator = require('miniprogram-automator')
const path = require('path')
const projectPath = path.resolve(__dirname, '..')

const POLL_INTERVAL_MS = 15000
const MAX_POLL_PER_REPORT = 60 // 15 分钟
const STALE_WAIT_MS = 12 * 60 * 1000 // 等 stale 窗口（10 分钟 + 2 分钟缓冲）

async function main() {
  const mp = await automator.launch({
    cliPath: '/Applications/wechatwebdevtools.app/Contents/MacOS/cli',
    projectPath, trustProject: true, timeout: 60000
  })

  try {
    // 1. 查所有需要重分析的数学诊断报告
    console.log('=== 查询历史数学诊断报告 ===')
    const survey = await mp.evaluate(async () => {
      const db = wx.cloud.database()
      const _ = db.command
      const res = await db.collection('reports').where({
        subject: 'math', type: 'diagnosis', status: 'completed', isArchived: _.neq(true)
      }).orderBy('createdAt', 'asc').limit(50).get()
      return JSON.parse(JSON.stringify(res.data.map(r => ({
        id: r._id,
        createdAt: r.createdAt,
        imageCount: (r.imageFileIds || []).length,
        oldErrors: r.totalErrors || 0,
      }))))
    })
    console.log(`找到 ${survey.length} 份报告需要重分析`)

    // 2. 逐份重分析
    const results = []
    for (let i = 0; i < survey.length; i++) {
      const report = survey[i]
      console.log(`\n=== [${i+1}/${survey.length}] ${report.id}（${report.imageCount} 张图，旧错题=${report.oldErrors}）===`)

      // 重置报告状态
      await mp.evaluate(async (reportId) => {
        const db = wx.cloud.database()
        await db.collection('reports').doc(reportId).update({
          data: {
            status: 'pending', totalErrors: null, summary: '',
            bottlenecks: [], errorDetails: [], pageResults: [],
            updatedAt: db.serverDate()
          }
        })
        const tasksRes = await db.collection('analysisTasks')
          .where({ reportId }).orderBy('createdAt', 'desc').limit(1).get()
        const t = (tasksRes.data || [])[0]
        if (t) {
          await db.collection('analysisTasks').doc(t._id).update({
            data: { status: 'pending', completedBatches: 0, batchResults: [], updatedAt: db.serverDate() }
          })
        }
      }, report.id)

      // 触发 + 轮询 + stale 恢复循环（最多 5 轮）
      let reportDone = false
      for (let round = 0; round < 8; round++) {
        if (round > 0) {
          console.log(`  [恢复轮 ${round}] 等待 stale 窗口...`)
          await new Promise(r => setTimeout(r, STALE_WAIT_MS))
          // 把 task updatedAt 设到 15 分钟前让 recoverStaleAnalysisTask 拾起
          await mp.evaluate(async (reportId) => {
            const db = wx.cloud.database()
            const tasksRes = await db.collection('analysisTasks')
              .where({ reportId }).orderBy('createdAt', 'desc').limit(1).get()
            const t = (tasksRes.data || [])[0]
            if (t && t.status === 'processing') {
              await db.collection('analysisTasks').doc(t._id).update({
                data: { updatedAt: new Date(Date.now() - 15 * 60 * 1000) }
              })
            }
          }, report.id)
        }

        // 触发 analyzePhotos
        const trigger = await mp.evaluate(async (reportId) => {
          try {
            const res = await wx.cloud.callFunction({ name: 'analyzePhotos', data: { reportId } })
            return JSON.parse(JSON.stringify({ ok: true, result: res.result }))
          } catch (err) {
            return { ok: false, error: (err.message || '').slice(0, 200) }
          }
        }, report.id)
        console.log(`  触发: ${trigger.ok ? '成功' : '失败'} ${trigger.ok ? (trigger.result && trigger.result.message || '') : (trigger.error || '').slice(0, 80)}`)

        // 轮询
        for (let poll = 0; poll < MAX_POLL_PER_REPORT; poll++) {
          await new Promise(r => setTimeout(r, POLL_INTERVAL_MS))
          const status = await mp.evaluate(async (reportId) => {
            const db = wx.cloud.database()
            const r = (await db.collection('reports').doc(reportId).get()).data
            const tasksRes = await db.collection('analysisTasks')
              .where({ reportId }).orderBy('createdAt', 'desc').limit(1).get()
            const t = (tasksRes.data || [])[0] || {}
            return JSON.parse(JSON.stringify({
              reportStatus: r.status,
              completedBatches: t.completedBatches || 0,
              totalBatches: t.totalBatches || 0,
              totalErrors: r.totalErrors || 0,
              error: (r.error || '').slice(0, 100),
            }))
          }, report.id)
          console.log(`    [${(poll+1)*15}s] ${status.reportStatus} 批次=${status.completedBatches}/${status.totalBatches}`)

          if (status.reportStatus === 'completed') {
            reportDone = true
            results.push({ id: report.id, status: 'completed', newErrors: status.totalErrors, oldErrors: report.oldErrors })
            console.log(`  ✓ 完成！新错题=${status.totalErrors}（旧=${report.oldErrors}）`)
            break
          }
          if (status.reportStatus === 'failed') {
            reportDone = true
            results.push({ id: report.id, status: 'failed', error: status.error })
            console.log(`  ✗ 失败: ${status.error}`)
            break
          }
        }
        if (reportDone) break
        console.log(`  轮询超时，将尝试 stale 恢复...`)
      }

      if (!reportDone) {
        results.push({ id: report.id, status: 'timeout', oldErrors: report.oldErrors })
        console.log(`  ⚠ 报告 ${report.id} 超时未完成`)
      }
    }

    // 3. 汇总
    console.log('\n\n========== 重分析汇总 ==========')
    let completed = 0
    for (const r of results) {
      if (r.status === 'completed') {
        completed++
        console.log(`✓ ${r.id}: 旧=${r.oldErrors} → 新=${r.newErrors}`)
      } else {
        console.log(`✗ ${r.id}: ${r.status} ${r.error || ''}`)
      }
    }
    console.log(`\n完成 ${completed}/${results.length}`)

  } finally {
    await mp.close()
  }
}

main().catch(e => { console.error(e); process.exit(1) })

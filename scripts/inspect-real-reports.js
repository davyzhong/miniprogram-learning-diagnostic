const automator = require('miniprogram-automator')
const path = require('path')
const projectPath = path.resolve(__dirname, '..')

async function main() {
  const mp = await automator.launch({
    cliPath: '/Applications/wechatwebdevtools.app/Contents/MacOS/cli',
    projectPath, trustProject: true, timeout: 60000
  })

  try {
    // 直接用前端 wx.cloud.database 读数据库，看最新的 reports 和 analysisTasks
    const dbData = await mp.evaluate(async () => {
      const db = wx.cloud.database()
      const _ = db.command

      // 最近的 20 条 reports（全类型，含 failed/analyzing）
      const reportsRes = await db.collection('reports')
        .where({ studentId: '966151a66a29599400006aca3e38ffaf' })
        .orderBy('createdAt', 'desc')
        .limit(20)
        .get()

      // 最近的 analysisTasks
      let tasksRes = { data: [] }
      try {
        tasksRes = await db.collection('analysisTasks')
          .orderBy('createdAt', 'desc')
          .limit(10)
          .get()
      } catch(e) {}

      return JSON.parse(JSON.stringify({
        reports: reportsRes.data.map(r => ({
          _id: r._id,
          type: r.type,
          status: r.status,
          mode: r.mode || '',
          totalErrors: r.totalErrors || 0,
          error: (r.error || '').slice(0, 200),
          debugError: (r.debugError || '').slice(0, 200),
          summary: (r.summary || '').slice(0, 100),
          paperId: r.paperId || '',
          imageCount: (r.imageFiles || r.imageFileIds || []).length,
          createdAt: r.createdAt,
          updatedAt: r.updatedAt,
          isArchived: r.isArchived || false
        })),
        tasks: tasksRes.data.map(t => ({
          _id: t._id,
          reportId: t.reportId,
          status: t.status,
          error: (t.error || '').slice(0, 200),
          completedBatches: t.completedBatches,
          totalBatches: t.totalBatches,
          createdAt: t.createdAt
        }))
      }))
    })

    console.log(`=== 最近 reports (${dbData.reports.length} 条) ===`)
    for (const r of dbData.reports) {
      const age = r.createdAt ? String(r.createdAt).slice(0, 16).replace('T', ' ') : '?'
      console.log(`${r.status} | ${r.type}/${r.mode} | ${age} | ${r._id}`)
      if (r.totalErrors) console.log(`  错题: ${r.totalErrors}`)
      if (r.error) console.log(`  error: ${r.error}`)
      if (r.debugError) console.log(`  debugError: ${r.debugError}`)
      if (r.paperId) console.log(`  paperId: ${r.paperId}`)
      if (r.isArchived) console.log(`  ⚠ 已归档`)
      if (r.imageCount) console.log(`  图片: ${r.imageCount} 张`)
    }

    console.log(`\n=== 最近 analysisTasks (${dbData.tasks.length} 条) ===`)
    for (const t of dbData.tasks) {
      const age = t.createdAt ? String(t.createdAt).slice(0, 16).replace('T', ' ') : '?'
      console.log(`${t.status} | ${age} | report:${t.reportId} | 批次:${t.completedBatches}/${t.totalBatches}`)
      if (t.error) console.log(`  error: ${t.error}`)
    }

    // 特别关注最新的 report（不管类型）
    const latest = dbData.reports[0]
    if (latest) {
      console.log(`\n=== 最新报告详情 ===`)
      console.log(`ID: ${latest._id}`)
      console.log(`类型: ${latest.type}, 模式: ${latest.mode}`)
      console.log(`状态: ${latest.status}`)
      console.log(`时间: ${latest.createdAt}`)
      if (latest.error) console.log(`错误: ${latest.error}`)
      if (latest.debugError) console.log(`调试错误: ${latest.debugError}`)
    }

  } finally {
    await mp.close()
  }
}
main().catch(e => { console.error(e.stack || e.message); process.exit(1) })

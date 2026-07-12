const automator = require('miniprogram-automator')
const path = require('path')
const mp = automator.launch({
  cliPath: '/Applications/wechatwebdevtools.app/Contents/MacOS/cli',
  projectPath: path.resolve(__dirname, '..'), trustProject: true, timeout: 60000
}).then(async (mp) => {
  try {
    const rid = '76ec3f156a523e4a0006774e7e009e7f'
    let lastBatch = -1
    for (let i = 0; i < 600; i++) {
      await new Promise(r => setTimeout(r, 15000))
      const s = await mp.evaluate(async (rid) => {
        const db = wx.cloud.database()
        const r = (await db.collection('reports').doc(rid).get()).data
        const tasksRes = await db.collection('analysisTasks').where({ reportId: rid }).orderBy('createdAt', 'desc').limit(1).get()
        const t = (tasksRes.data || [])[0] || {}
        return JSON.parse(JSON.stringify({
          rs: r.status, cb: t.completedBatches || 0, tb: t.totalBatches || 0,
          te: r.totalErrors || 0, err: (r.error||'').slice(0,100),
          summary: (r.summary||'').slice(0,80)
        }))
      }, rid)
      if (s.cb !== lastBatch) {
        console.log(`[${(i+1)*15}s] ${s.rs} 批=${s.cb}/${s.tb} 错题=${s.te}`)
        lastBatch = s.cb
      }
      if (s.rs === 'completed') {
        console.log(`\n✓✓✓ 完成！错题=${s.te}`)
        console.log(`摘要: ${s.summary}`)
        const detail = await mp.evaluate(async (rid) => {
          const db = wx.cloud.database()
          const r = (await db.collection('reports').doc(rid).get()).data
          return JSON.parse(JSON.stringify({
            totalErrors: r.totalErrors,
            bottlenecks: (r.bottlenecks||[]).map(b => ({lp:b.lpCode,nm:b.lpName,ec:b.errorCount,sv:b.severity})),
            errorDetailCount: (r.errorDetails||[]).length,
          }))
        }, rid)
        console.log(JSON.stringify(detail, null, 2))
        break
      }
      if (s.rs === 'failed') { console.log(`✗ 失败: ${s.err}`); break }
    }
  } finally { await mp.close() }
})

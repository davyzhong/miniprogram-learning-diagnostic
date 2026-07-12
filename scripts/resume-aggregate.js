const automator = require('miniprogram-automator')
const path = require('path')
const projectPath = path.resolve(__dirname, '..')
const RID = '76ec3f156a523e4a0006774e7e009e7f'

async function main() {
  const mp = await automator.launch({
    cliPath: '/Applications/wechatwebdevtools.app/Contents/MacOS/cli',
    projectPath, trustProject: true, timeout: 60000
  })
  try {
    // 把 task updatedAt 设到 15 分钟前
    await mp.evaluate(async (rid) => {
      const db = wx.cloud.database()
      const tasksRes = await db.collection('analysisTasks').where({ reportId: rid }).orderBy('createdAt','desc').limit(1).get()
      const t = (tasksRes.data||[])[0]
      if (t) await db.collection('analysisTasks').doc(t._id).update({ data: { updatedAt: new Date(Date.now()-15*60*1000) } })
    }, RID)

    // 触发续跑
    const r = await mp.evaluate(async (rid) => {
      const res = await wx.cloud.callFunction({ name: 'analyzePhotos', data: { reportId: rid } })
      return JSON.parse(JSON.stringify(res.result))
    }, RID)
    console.log('触发:', JSON.stringify(r).slice(0,200))

    // 轮询
    let last = -1
    for (let i = 0; i < 600; i++) {
      await new Promise(r => setTimeout(r, 15000))
      const s = await mp.evaluate(async (rid) => {
        const db = wx.cloud.database()
        const r = (await db.collection('reports').doc(rid).get()).data
        const tasksRes = await db.collection('analysisTasks').where({ reportId: rid }).orderBy('createdAt','desc').limit(1).get()
        const t = (tasksRes.data||[])[0] || {}
        return JSON.parse(JSON.stringify({ rs: r.status, cb: t.completedBatches||0, tb: t.totalBatches||0, te: r.totalErrors||0, err:(r.error||'').slice(0,100), summary:(r.summary||'').slice(0,80) }))
      }, RID)
      if (s.cb !== last) { console.log(`[${(i+1)*15}s] ${s.rs} 批=${s.cb}/${s.tb} 错题=${s.te}`); last = s.cb }
      if (s.rs === 'completed') {
        console.log(`\n✓✓✓ 完成！错题=${s.te}\n摘要: ${s.summary}`)
        const d = await mp.evaluate(async (rid) => {
          const db = wx.cloud.database()
          const r = (await db.collection('reports').doc(rid).get()).data
          return JSON.parse(JSON.stringify({ totalErrors: r.totalErrors, bottlenecks:(r.bottlenecks||[]).map(b=>({lp:b.lpCode,nm:b.lpName,ec:b.errorCount})), edc:(r.errorDetails||[]).length }))
        }, RID)
        console.log(JSON.stringify(d, null, 2))
        break
      }
      if (s.rs === 'failed') { console.log(`✗ 失败: ${s.err}`); break }
      // 如果卡住超过 3 分钟无进展，重新触发续跑
      if (i > 0 && i % 12 === 0 && s.cb === last && s.rs !== 'completed') {
        console.log(`  卡在 ${s.cb}/${s.tb}，重新触发续跑...`)
        await mp.evaluate(async (rid) => {
          const db = wx.cloud.database()
          const tasksRes = await db.collection('analysisTasks').where({ reportId: rid }).orderBy('createdAt','desc').limit(1).get()
          const t = (tasksRes.data||[])[0]
          if (t) await db.collection('analysisTasks').doc(t._id).update({ data: { updatedAt: new Date(Date.now()-15*60*1000) } })
          await wx.cloud.callFunction({ name: 'analyzePhotos', data: { reportId: rid } }).catch(()=>{})
        }, RID)
      }
    }
  } finally { await mp.close() }
}
main().catch(e => { console.error(e); process.exit(1) })

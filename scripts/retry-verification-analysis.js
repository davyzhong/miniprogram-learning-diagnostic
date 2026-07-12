const automator = require('miniprogram-automator')
const path = require('path')
const projectPath = path.resolve(__dirname, '..')

async function main() {
  const mp = await automator.launch({
    cliPath: '/Applications/wechatwebdevtools.app/Contents/MacOS/cli',
    projectPath, trustProject: true, timeout: 60000
  })
  const consoleMsgs = []
  mp.on('console', entry => consoleMsgs.push(entry))

  try {
    const reportId = '786aa83e6a51c77100b805dc3103c97b'
    const sq = 'studentId=966151a66a29599400006aca3e38ffaf&studentName=' + encodeURIComponent('钟青羽')

    console.log('=== 打开失败的验证报告 ===')
    const rptPage = await mp.reLaunch(`/pages/report/report?id=${reportId}&${sq}`)
    await rptPage.waitFor(5000)

    const before = await mp.evaluate(() => {
      const r = getCurrentPages().slice(-1)[0].data.report || {}
      return { status: r.status, error: r.error, debugError: r.debugError, canRetry: getCurrentPages().slice(-1)[0].data.canRetryAnalysis }
    })
    console.log('重试前:', JSON.stringify(before))

    // 直接调 onRetryAnalysis
    console.log('\n调用 onRetryAnalysis...')
    await mp.evaluate(() => {
      const p = getCurrentPages().slice(-1)[0]
      if (typeof p.onRetryAnalysis === 'function') p.onRetryAnalysis()
    })

    // 等 15 秒看状态是否从 failed 变化
    console.log('等待状态变化...')
    let started = false
    for (let i = 0; i < 8; i++) {
      await rptPage.waitFor(2000)
      const s = await mp.evaluate(() => {
        const p = getCurrentPages().slice(-1)[0]
        return {
          status: (p.data.report || {}).status,
          retrying: p.data.retryingAnalysis,
          statusText: p.data.analysisStatusText
        }
      })
      console.log(`  [${(i+1)*2}s] ${JSON.stringify(s)}`)
      if (s.status !== 'failed' || s.retrying) { started = true; break }
    }

    if (!started) {
      console.log('状态没有变化，可能 callAnalyzePhotos 本身失败了')
      // 直接用 wx.cloud.callFunction 调 analyzePhotos
      console.log('直接调用 analyzePhotos 云函数...')
      const direct = await mp.evaluate(async (reportId) => {
        try {
          const res = await wx.cloud.callFunction({
            name: 'analyzePhotos',
            data: { reportId },
            timeout: 20000
          })
          return { success: true, result: res.result }
        } catch (err) {
          return { success: false, error: err.message || String(err) }
        }
      }, reportId)
      console.log('直接调用结果:', JSON.stringify(direct, null, 2))
      await rptPage.waitFor(3000)
    }

    // 重新加载报告看最新状态
    console.log('\n重新加载报告...')
    await mp.evaluate(() => {
      const p = getCurrentPages().slice(-1)[0]
      if (typeof p.loadReport === 'function') p.loadReport()
    })

    // 轮询最终状态
    console.log('\n=== 轮询最终状态（最多 4 分钟）===')
    for (let i = 0; i < 120; i++) {
      await rptPage.waitFor(2000)
      const s = await mp.evaluate(() => {
        const p = getCurrentPages().slice(-1)[0]
        const r = p.data.report || {}
        return {
          status: r.status,
          totalErrors: r.totalErrors || 0,
          summary: (r.summary || '').slice(0, 100),
          error: (r.error || '').slice(0, 150),
          debugError: (r.debugError || '').slice(0, 200),
          analysisStatusText: p.data.analysisStatusText,
          hasVerificationEvidence: p.data.hasVerificationEvidence,
          bottleneckCount: p.data.bottleneckCount
        }
      })
      if (i % 10 === 9) console.log(`  [${(i+1)*2}s] ${JSON.stringify(s)}`)
      if (s.status === 'completed') {
        console.log(`\n✓ 分析完成！`)
        console.log(JSON.stringify(s, null, 2))
        break
      }
      if (s.status === 'failed' && i > 30) {
        console.log(`\n✗ 分析再次失败（等待 ${i*2}s 后）`)
        console.log(JSON.stringify(s, null, 2))
        break
      }
    }

    const errs = consoleMsgs.filter(m => m.type === 'error' || m.type === 'warn')
    if (errs.length > 0) {
      console.log('\n=== Console 错误/警告 ===')
      for (const e of errs.slice(-10)) console.log(`  [${e.type}] ${e.args ? e.args.join(' ') : e.message}`)
    }

  } finally {
    await mp.close()
  }
}
main().catch(e => { console.error(e.stack || e.message); process.exit(1) })

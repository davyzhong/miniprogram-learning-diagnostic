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

    const rptPage = await mp.reLaunch(`/pages/report/report?id=${reportId}&${sq}`)
    for (let i = 0; i < 10; i++) {
      await rptPage.waitFor(2000)
      const loading = await mp.evaluate(() => getCurrentPages().slice(-1)[0].data.loading)
      if (!loading) break
    }

    const data = await mp.evaluate(() => {
      const p = getCurrentPages().slice(-1)[0]
      const r = p.data.report || {}
      const groups = p.data.bottleneckGroups || []
      const errors = p.data.errorDetailList || []
      const verification = p.data.verificationEvidenceItems || []
      return JSON.parse(JSON.stringify({
        status: r.status,
        type: r.type,
        totalErrors: r.totalErrors,
        summary: (r.summary || '').slice(0, 500),
        comparisonSummary: (r.comparisonSummary || '').slice(0, 300),
        isVerification: p.data.isVerification,
        groups: groups.map(g => ({
          category: g.categoryTitle || '',
          itemCount: g.itemCount,
          families: (g.families || []).map(f => ({
            family: f.familyTitle || '',
            items: (f.items || []).slice(0, 3).map(i => i.title || '')
          }))
        })),
        errorCount: errors.length,
        errors: errors.slice(0, 11).map(e => ({
          question: (e.question || e.questionContent || '').slice(0, 100),
          studentAnswer: e.studentAnswer || '',
          correctAnswer: e.correctAnswer || '',
          rootCause: (e.rootCause || '').slice(0, 150)
        })),
        verificationEvidence: verification.map(v => ({
          label: v.label || v.text || '',
          status: v.status || v.statusText || ''
        }))
      }))
    })

    console.log('=== 验证卷分析报告 ===')
    console.log(`状态: ${data.status} | 类型: ${data.type}`)
    console.log(`错题数: ${data.totalErrors}`)
    console.log(`摘要: ${data.summary}`)
    if (data.comparisonSummary) console.log(`对比: ${data.comparisonSummary}`)

    if (data.verificationEvidence.length > 0) {
      console.log('\n验证证据（每个卡点的答题判定）:')
      for (const v of data.verificationEvidence) console.log(`  ${v.label}: ${v.status}`)
    }

    console.log(`\n错题明细 (${data.errorCount} 条):`)
    for (const e of data.errors) {
      console.log(`  ${e.question}`)
      console.log(`    答:${e.studentAnswer} 正确:${e.correctAnswer}`)
      if (e.rootCause) console.log(`    根因: ${e.rootCause}`)
    }

    const fs = require('fs')
    const outputDir = path.join(projectPath, 'tmp', 'real-reports')
    fs.mkdirSync(outputDir, { recursive: true })
    await mp.screenshot({ path: path.join(outputDir, 'verification-completed.png') })
    console.log(`\n截图: ${outputDir}/verification-completed.png`)
  } finally {
    await mp.close()
  }
}
main().catch(e => { console.error(e.stack || e.message); process.exit(1) })

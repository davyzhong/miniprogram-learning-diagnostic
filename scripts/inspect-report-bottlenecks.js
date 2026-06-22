#!/usr/bin/env node
/**
 * 深入查诊断报告里的卡点全貌，对比 report.bottlenecks / profile / 验证卷 三者。
 * 定位"诊断报告卡点不全"的真正断裂点。
 *
 * 用法：node scripts/inspect-report-bottlenecks.js --report-id <REPORT_ID> --student-id <STUDENT_ID>
 */

function loadAutomator() {
  try { return require('miniprogram-automator') }
  catch { return require('/tmp/learning-diagnostic-automator/node_modules/miniprogram-automator') }
}
const automator = loadAutomator()
const path = require('node:path')

const projectPath = path.resolve(__dirname, '..')
const cliPath = process.env.WECHAT_DEVTOOLS_CLI
  || (process.platform === 'darwin' ? '/Applications/wechatwebdevtools.app/Contents/MacOS/cli' : 'cli')

function parseArgs(argv) {
  const args = { reportId: '', studentId: '' }
  for (let i = 2; i < argv.length; i += 1) {
    if (argv[i] === '--report-id') args.reportId = argv[++i] || ''
    else if (argv[i] === '--student-id') args.studentId = argv[++i] || ''
    else if (argv[i] === '--help' || argv[i] === '-h') args.help = true
  }
  return args
}

async function main() {
  const args = parseArgs(process.argv)
  if (args.help || !args.reportId || !args.studentId) {
    console.log(`用法: node scripts/inspect-report-bottlenecks.js --report-id <ID> --student-id <ID>`)
    process.exit(args.help ? 0 : 1)
  }

  console.log('启动 DevTools automator...')
  const miniProgram = await automator.launch({ cliPath, projectPath, trustProject: true, timeout: 60000 })

  try {
    const result = await miniProgram.evaluate(async (cfg) => {
      const { reportId, studentId } = cfg
      const log = []

      // 1. getReportDetail 拿诊断报告全量
      const reportRes = await wx.cloud.callFunction({
        name: 'studentData',
        data: { action: 'getReportDetail', reportId },
      })
      const reportDetail = (reportRes && reportRes.result) || {}
      const report = reportDetail.report || reportDetail
      if (!report) {
        return { log: ['报告不存在: ' + (reportDetail.error || '')], error: 'report not found' }
      }

      log.push(`=== 诊断报告 ${reportId} ===`)
      log.push(`type: ${report.type}, status: ${report.status}, subject: ${report.subject}`)
      const rb = report.bottlenecks || []
      log.push(`report.bottlenecks: ${rb.length} 个`)

      // 看每个 bottleneck 的结构
      let totalCandidates = 0
      const coarseCodes = []
      rb.forEach((b, i) => {
        const cands = b.candidateBottlenecks || []
        totalCandidates += cands.length
        coarseCodes.push(b.lpCode || b.bottleneckId || b.id || `(#${i})`)
        if (i < 3 || cands.length > 0) {
          log.push(`  [${i}] lpCode=${b.lpCode||''} title=${(b.lpName||b.title||'').slice(0,20)} severity=${b.severity||''} weight=${b.weight||''} candidates=${cands.length}`)
        }
      })
      log.push(`粗卡点 codes: ${coarseCodes.join(', ')}`)
      log.push(`candidateBottlenecks 总数: ${totalCandidates}`)

      // artifacts 里也可能存 profile 快照
      const artifacts = report.artifacts || {}
      const artProfile = artifacts.profile || null
      if (artProfile) {
        log.push(`\nartifacts.profile:`)
        log.push(`  pendingBottlenecks: ${(artProfile.pendingBottlenecks||[]).length}`)
        log.push(`  currentBottlenecks: ${(artProfile.currentBottlenecks||[]).length}`)
        const allArt = [...(artProfile.pendingBottlenecks||[]), ...(artProfile.currentBottlenecks||[])]
        let artCandidates = 0
        allArt.forEach(item => { artCandidates += (item.candidateBottlenecks||[]).length })
        log.push(`  candidateBottlenecks 总数: ${artCandidates}`)
      } else {
        log.push(`\nartifacts.profile: (无)`)
      }

      // 2. 对比 subjectProfile（当前持久化的）
      const dashRes = await wx.cloud.callFunction({
        name: 'studentData',
        data: { action: 'getSubjectDashboard', studentId, subject: report.subject || 'math', reportLimit: 5, paperLimit: 5 },
      })
      const dash = (dashRes && dashRes.result) || {}
      const profile = dash.profile || {}
      log.push(`\n=== 持久化 subjectProfile ===`)
      log.push(`pendingBottlenecks: ${(profile.pendingBottlenecks||[]).length}`)
      log.push(`currentBottlenecks: ${(profile.currentBottlenecks||[]).length}`)
      const allP = [...(profile.pendingBottlenecks||[]), ...(profile.currentBottlenecks||[])]
      let pCandidates = 0
      allP.forEach(item => { pCandidates += (item.candidateBottlenecks||[]).length })
      log.push(`candidateBottlenecks 总数: ${pCandidates}`)

      // 3. 该报告关联的验证卷
      const verifPaperId = report.verificationPaperId || ''
      log.push(`\n报告.verificationPaperId: ${verifPaperId || '(无)'}`)
      log.push(`报告.verificationPaperStatus: ${report.verificationPaperStatus || '(无)'}`)

      return { log, reportBottleneckCount: rb.length, totalCandidates, artProfileCandidates: artProfile ? 0 : -1 }
    }, { reportId: args.reportId, studentId: args.studentId })

    console.log('\n=== 检查结果 ===')
    ;(result.log || []).forEach(l => console.log('  ' + l))
    if (result.error) process.exit(1)
  } catch (e) {
    console.error('执行失败:', e.message || e)
    process.exit(1)
  } finally {
    await miniProgram.close()
  }
}

main().catch(e => { console.error(e); process.exit(1) })

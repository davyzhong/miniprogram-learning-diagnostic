#!/usr/bin/env node
/**
 * 分析一份诊断报告的卡点识别完整度：
 * - AI 识别了多少粗卡点 / 多少细 BN
 * - 对比 taxonomy 全量，哪些知识节点/卡点完全没被覆盖
 * - 看错题分布 vs 卡点分布
 *
 * 用法：node scripts/diagnose-bottleneck-coverage.js --report-id <ID> --student-id <ID>
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
    console.log(`用法: node scripts/diagnose-bottleneck-coverage.js --report-id <ID> --student-id <ID>`)
    process.exit(args.help ? 0 : 1)
  }

  // 加载 taxonomy 做对比基线
  let taxonomySeed = null
  try {
    taxonomySeed = require(path.join(projectPath, 'data/math/bottleneck-taxonomy-v2.seed.json'))
  } catch (e) {
    console.log('（无法加载 taxonomy seed，跳过对比）')
  }

  console.log('启动 DevTools automator...')
  const miniProgram = await automator.launch({ cliPath, projectPath, trustProject: true, timeout: 60000 })

  try {
    const result = await miniProgram.evaluate(async (cfg) => {
      const { reportId, studentId } = cfg
      const log = []

      const reportRes = await wx.cloud.callFunction({
        name: 'studentData', data: { action: 'getReportDetail', reportId },
      })
      const reportDetail = (reportRes && reportRes.result) || {}
      const report = reportDetail.report || reportDetail
      if (!report) return { log: ['报告不存在'], error: true }

      log.push(`=== 诊断报告 ${reportId} ===`)
      log.push(`上传图片: ${(report.imageFiles||[]).length} 张`)
      log.push(`totalErrors: ${report.totalErrors || 0}`)
      const rb = report.bottlenecks || []
      log.push(`粗卡点: ${rb.length} 个`)

      // 每个粗卡点下的细 BN 明细
      const allFineBn = []
      rb.forEach((b, i) => {
        const cands = b.candidateBottlenecks || []
        log.push(`\n  [粗${i+1}] ${b.lpCode} ${(b.lpName||'').slice(0,25)} | err=${b.errorCount||0} sev=${b.severity||''} | 细BN=${cands.length}个`)
        cands.forEach(c => {
          allFineBn.push({ id: c.bottleneckId||c.id, title: (c.title||c.lpName||'').slice(0,30), strength: c.evidenceStrength||'', parent: b.lpCode })
          log.push(`    - ${c.bottleneckId||c.id} | ${(c.title||c.lpName||'').slice(0,30)} | ${c.evidenceStrength||''}`)
        })
      })
      log.push(`\n细 BN 总计: ${allFineBn.length} 个`)

      // 错题分布
      const ed = report.errorDetails || []
      if (ed.length > 0) {
        const byLp = {}
        ed.forEach(e => { const k = e.lpCode||'(无)'; byLp[k] = (byLp[k]||0)+1 })
        log.push(`\n错题按卡点分布 (${ed.length} 道):`)
        Object.entries(byLp).sort((a,b)=>b[1]-a[1]).forEach(([k,v]) => log.push(`  ${k}: ${v} 道`))
      }

      // currentBottlenecks（合并后的全量）
      const dashRes = await wx.cloud.callFunction({
        name: 'studentData', data: { action: 'getSubjectDashboard', studentId, subject: report.subject||'math', reportLimit:5, paperLimit:5 },
      })
      const profile = ((dashRes&&dashRes.result)||{}).profile || {}
      const cb = profile.currentBottlenecks || []
      let curFineBn = 0
      cb.forEach(b => { curFineBn += (b.candidateBottlenecks||[]).length })
      log.push(`\n=== 合并后 currentBottlenecks ===`)
      log.push(`粗卡点: ${cb.length} 个, 细BN: ${curFineBn} 个`)
      const improved = cb.filter(b => b.status === 'improved')
      log.push(`其中 improved: ${improved.length} 个`)

      return { log, reportFineBn: allFineBn.length, profileFineBn: curFineBn }
    }, { reportId: args.reportId, studentId: args.studentId })

    console.log('\n=== 分析结果 ===')
    ;(result.log || []).forEach(l => console.log('  ' + l))

    // taxonomy 对比
    if (taxonomySeed) {
      const taxBn = (taxonomySeed.bottlenecks || [])
      console.log(`\n=== Taxonomy 对比 ===`)
      console.log(`  taxonomy 全量细 BN: ${taxBn.length} 个`)
      console.log(`  本次诊断识别: ${result.reportFineBn} 个`)
      console.log(`  覆盖率: ${(result.reportFineBn / taxBn.length * 100).toFixed(0)}%`)
      console.log(`  （taxonomy 是全量知识库；诊断只会识别有错题证据的子集，不必 100% 覆盖）`)
    }
    if (result.error) process.exit(1)
  } catch (e) {
    console.error('执行失败:', e.message || e)
    process.exit(1)
  } finally {
    await miniProgram.close()
  }
}

main().catch(e => { console.error(e); process.exit(1) })

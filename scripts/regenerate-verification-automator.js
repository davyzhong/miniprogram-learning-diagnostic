#!/usr/bin/env node
/**
 * 通过 DevTools automator 在真实小程序环境里检查/触发验证卷生成
 *
 * 不需要 secretId/key，利用小程序登录态调真实云函数。
 *
 * 用法：
 *   node scripts/regenerate-verification-automator.js --student-id <ID> [选项]
 *
 * 选项：
 *   --student-id <ID>   必填
 *   --subject <学科>    math（默认）
 *   --report-id <ID>    可选，指定诊断报告（默认自动查最新）
 *   --force             即使 ready 也重新生成
 *   --apply             实际触发重新生成（默认只检查）
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
  const args = { apply: false, force: false, studentId: '', subject: 'math', reportId: '' }
  for (let i = 2; i < argv.length; i += 1) {
    const a = argv[i]
    if (a === '--apply') args.apply = true
    else if (a === '--force') args.force = true
    else if (a === '--student-id') args.studentId = argv[++i] || ''
    else if (a === '--subject') args.subject = argv[++i] || 'math'
    else if (a === '--report-id') args.reportId = argv[++i] || ''
    else if (a === '--help' || a === '-h') args.help = true
  }
  return args
}

async function main() {
  const args = parseArgs(process.argv)
  if (args.help || !args.studentId) {
    console.log(`
通过 automator 检查/触发验证卷生成（真实云数据）

用法：
  node scripts/regenerate-verification-automator.js --student-id <ID> [选项]

选项：
  --student-id <ID>   必填
  --subject <学科>    math（默认）
  --report-id <ID>    可选，指定诊断报告（默认取最新）
  --force             即使 ready 也重新生成
  --apply             实际触发（默认只检查）
`)
    process.exit(args.help ? 0 : 1)
  }

  console.log('启动 DevTools automator...')
  const miniProgram = await automator.launch({
    cliPath,
    projectPath,
    trustProject: true,
    timeout: 60000,
  })

  try {
    // 在真实小程序环境里执行（不 mock，调真实云函数）
    const result = await miniProgram.evaluate(async (cfg) => {
      const { studentId, subject, reportId, force, apply } = cfg
      const log = []

      // 1. 查最新诊断报告（若没指定 reportId）
      let diagReport = null
      try {
        const dashRes = await wx.cloud.callFunction({
          name: 'studentData',
          data: { action: 'getSubjectDashboard', studentId, subject, reportLimit: 20, paperLimit: 20 },
        })
        const dash = (dashRes && dashRes.result) || {}
        const reports = dash.reports || []
        log.push(`getSubjectDashboard: ${reports.length} 份报告`)
        diagReport = reportId
          ? reports.find(r => r._id === reportId)
          : reports.find(r => r.type === 'diagnosis' && r.status === 'completed')
        if (diagReport) {
          log.push(`诊断报告: ${diagReport._id}, 卡点=${(diagReport.bottlenecks||[]).length}`)
        }
        // profile
        const profile = dash.profile || {}
        const all = [...(profile.pendingBottlenecks||[]), ...(profile.currentBottlenecks||[])]
        const seen = new Set()
        let hi = 0, md = 0, lo = 0
        for (const item of all) {
          for (const cand of (item.candidateBottlenecks||[])) {
            const id = cand.bottleneckId || cand.id
            if (!id || seen.has(id)) continue
            seen.add(id)
            const s = cand.evidenceStrength
            if (s === 'high') hi++; else if (s === 'medium') md++; else lo++
          }
        }
        for (const item of all) {
          if (!item.candidateBottlenecks || item.candidateBottlenecks.length === 0) {
            const code = item.lpCode
            if (code && !seen.has(code)) { seen.add(code); lo++ }
          }
        }
        const expectedQ = hi*3 + md*2 + lo*1
        log.push(`Profile 细BN: ${seen.size} 个 (高${hi}/中${md}/低${lo})，期望题量=${expectedQ}`)

        // papers
        const papers = dash.papers || []
        const verifPapers = papers.filter(p => p.type === 'verification')
        log.push(`验证卷: ${verifPapers.length} 份`)
        if (verifPapers.length > 0) {
          const latest = verifPapers[0]
          log.push(`最新卷: ${latest._id}, status=${latest.generationStatus||'?'}, 卡点=${(latest.bottleneckTargets||[]).length}, 题=${(latest.questions||[]).length}`)
          return {
            log,
            diagReportId: diagReport ? diagReport._id : null,
            latestPaperId: latest._id,
            latestStatus: latest.generationStatus || '',
            latestTargetCount: (latest.bottleneckTargets || []).length,
            latestQuestionCount: (latest.questions || []).length,
            expectedBnCount: seen.size,
            expectedQuestionCount: expectedQ,
            triggeredByReport: latest.triggeredByReport || '',
          }
        }
        return {
          log,
          diagReportId: diagReport ? diagReport._id : null,
          latestPaperId: null,
          latestStatus: 'none',
          expectedBnCount: seen.size,
          expectedQuestionCount: expectedQ,
        }
      } catch (e) {
        log.push('查询失败: ' + (e.message || e))
        return { log, error: e.message || String(e) }
      }
    }, { studentId: args.studentId, subject: args.subject, reportId: args.reportId, force: args.force, apply: args.apply })

    console.log('\n=== 检查结果 ===')
    ;(result.log || []).forEach(l => console.log('  ' + l))

    if (result.error) {
      console.error('查询出错，终止')
      process.exit(1)
    }

    // 判断是否需要重新生成
    let needRegen = false
    let reason = ''
    if (!result.latestPaperId) {
      needRegen = true; reason = '无验证卷'
    } else if (result.latestStatus === 'generating' || result.latestStatus === 'appending') {
      console.log(`\n→ 正在生成中（${result.latestStatus}），跳过触发，等待完成`)
    } else if (result.latestStatus === 'failed') {
      needRegen = true; reason = '上次生成失败'
    } else if (result.latestStatus === 'ready' || !result.latestStatus) {
      if (args.force) {
        needRegen = true; reason = '强制重新生成'
      } else if (result.expectedBnCount > 0 && result.latestTargetCount < result.expectedBnCount) {
        needRegen = true; reason = `卡点不足（${result.latestTargetCount} < ${result.expectedBnCount}）`
      } else if (result.expectedQuestionCount > 0 && result.latestQuestionCount < result.expectedQuestionCount * 0.7) {
        needRegen = true; reason = `题量不足（${result.latestQuestionCount} < 期望${result.expectedQuestionCount}的70%）`
      } else {
        console.log(`\n→ 验证卷符合要求，无需重新生成`)
      }
    }

    if (!needRegen) {
      console.log('\n完成。')
      return
    }

    console.log(`\n→ 需要重新生成：${reason}`)
    if (!args.apply) {
      console.log('  [dry-run] 加 --apply 实际触发')
      return
    }

    // 触发 regenerateVerificationPaper
    console.log('  [apply] 调用 regenerateVerificationPaper...')
    const triggerResult = await miniProgram.evaluate(async (cfg) => {
      try {
        const res = await wx.cloud.callFunction({
          name: 'regenerateVerificationPaper',
          data: { studentId: cfg.studentId, subject: cfg.subject, reportId: cfg.reportId },
        })
        return res.result || {}
      } catch (e) {
        return { success: false, error: e.message || String(e) }
      }
    }, { studentId: args.studentId, subject: args.subject, reportId: result.diagReportId })

    if (triggerResult.success) {
      console.log(`  ✓ 已触发：paperId=${triggerResult.paperId}, 目标卡点=${triggerResult.targetCount}`)
      console.log(`  → 分批生成中（fire-and-forget），约 ${Math.ceil((triggerResult.targetCount||0)/8)} 批`)
      console.log(`  → 前端轮询 getActiveVerificationPaper 查进度，ready 后自动跳预览`)
    } else {
      console.error(`  ✗ 触发失败：${triggerResult.error}`)
      process.exit(1)
    }
  } finally {
    await miniProgram.close()
  }
}

main().catch(err => {
  console.error('执行失败：', err.message || err)
  process.exit(1)
})

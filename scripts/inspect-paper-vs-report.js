#!/usr/bin/env node
/**
 * 对比诊断报告的卡点 vs 验证卷实际覆盖的卡点，定位"验证卷卡点不全"的根因。
 *
 * 不需要 studentId —— 先用云函数从 paper 反查，再拿对应 profile 做全量对比。
 *
 * 用法：
 *   node scripts/inspect-paper-vs-report.js --paper-id <PAPER_ID>
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
  const args = { paperId: '' }
  for (let i = 2; i < argv.length; i += 1) {
    const a = argv[i]
    if (a === '--paper-id') args.paperId = argv[++i] || ''
    else if (a === '--help' || a === '-h') args.help = true
  }
  return args
}

async function main() {
  const args = parseArgs(process.argv)
  if (args.help || !args.paperId) {
    console.log(`
对比诊断报告卡点 vs 验证卷卡点（自动反查 studentId）

用法：
  node scripts/inspect-paper-vs-report.js --paper-id <PAPER_ID>
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
    const result = await miniProgram.evaluate(async (paperId) => {
      const log = []

      // 1. 用 getPaperDetail 直接按 paperId 拿 paper（不需要 studentId）
      const paperDetailRes = await wx.cloud.callFunction({
        name: 'studentData',
        data: { action: 'getPaperDetail', paperId },
      })
      const paperDetail = (paperDetailRes && paperDetailRes.result) || {}
      if (!paperDetail.success && paperDetail.success !== undefined) {
        return { log: ['getPaperDetail 失败: ' + (paperDetail.error || '')], error: paperDetail.error }
      }
      const targetPaper = paperDetail.paper || paperDetail
      if (!targetPaper || !targetPaper.studentId) {
        return { log: ['paper 不存在或无 studentId'], error: 'paper not found' }
      }

      const targetStudentId = targetPaper.studentId
      const targetSubject = targetPaper.subject || 'math'
      log.push(`paper ${paperId}: student=${targetStudentId}, subject=${targetSubject}`)

      // 2. 拿对应学科 dashboard（含 profile + reports）
      const dashRes = await wx.cloud.callFunction({
        name: 'studentData',
        data: { action: 'getSubjectDashboard', studentId: targetStudentId, subject: targetSubject, reportLimit: 30, paperLimit: 50 },
      })
      const dash = (dashRes && dashRes.result) || {}
      const targetProfile = dash.profile || null

      // 3. paper 的 targets
      const targets = targetPaper.bottleneckTargets || []
      const questions = targetPaper.questions || []
      const qBnIds = new Set(questions.map(q => q.lpCode || q.targetId).filter(Boolean))
      log.push(`\n=== 验证卷 ${paperId} ===`)
      log.push(`bottleneckTargets: ${targets.length} 个`)
      log.push(`questions: ${questions.length} 题，覆盖 ${qBnIds.size} 个不同 lpCode`)
      log.push(`triggeredByReport: ${targetPaper.triggeredByReport || '(无)'}`)
      log.push(`generationStatus: ${targetPaper.generationStatus}`)
      log.push(`generationProgress: ${JSON.stringify(targetPaper.generationProgress || {})}`)

      // 4. profile 全量细 BN（复刻 extractFineBottlenecks）
      const profile = targetProfile || {}
      const pending = profile.pendingBottlenecks || []
      const current = profile.currentBottlenecks || []
      log.push(`\n=== Profile ===`)
      log.push(`pendingBottlenecks: ${pending.length} 个`)
      log.push(`currentBottlenecks: ${current.length} 个`)

      const coarseMap = new Map()
      for (const item of [...pending, ...current]) {
        const key = item.lpCode || item.bottleneckId || item.id
        if (!key) continue
        if (!coarseMap.has(key)) {
          coarseMap.set(key, { ...item, candidateBottlenecks: [...(item.candidateBottlenecks || [])] })
        } else {
          const existing = coarseMap.get(key)
          const seen = new Set((existing.candidateBottlenecks || []).map(c => c.bottleneckId || c.id))
          for (const cand of (item.candidateBottlenecks || [])) {
            const cid = cand.bottleneckId || cand.id
            if (cid && !seen.has(cid)) { existing.candidateBottlenecks.push(cand); seen.add(cid) }
          }
        }
      }
      log.push(`粗卡点(pending+current 去重): ${coarseMap.size} 个`)

      const profileFineBn = []
      const profileFineSeen = new Set()
      let coarseOnlyCount = 0
      let totalCandidates = 0
      for (const item of coarseMap.values()) {
        const candidates = item.candidateBottlenecks || []
        totalCandidates += candidates.length
        if (candidates.length > 0) {
          for (const cand of candidates) {
            const bnId = cand.bottleneckId || cand.id
            if (!bnId || profileFineSeen.has(bnId)) continue
            profileFineSeen.add(bnId)
            profileFineBn.push({ id: bnId, title: cand.title || cand.lpName || '', parent: item.lpCode, strength: cand.evidenceStrength || '', weight: cand.weight || '' })
          }
        } else {
          const code = item.lpCode || item.bottleneckId || item.id
          if (code && !profileFineSeen.has(code)) {
            profileFineSeen.add(code)
            profileFineBn.push({ id: code, title: item.lpName || '', parent: code, strength: '', weight: item.weight || 50, coarse: true })
            coarseOnlyCount++
          }
        }
      }
      log.push(`candidateBottlenecks 总数(未去重): ${totalCandidates}`)
      log.push(`展开后细 BN(去重): ${profileFineBn.length} 个（其中粗卡点兜底 ${coarseOnlyCount} 个）`)

      // 5. 对比
      const paperTargets = new Set(targets)
      const paperQBn = new Set([...qBnIds, ...targets])
      const missingFromTargets = profileFineBn.filter(bn => !paperTargets.has(bn.id))
      log.push(`\n=== 对比结果 ===`)
      log.push(`Profile 细 BN 总数: ${profileFineBn.length}`)
      log.push(`验证卷 bottleneckTargets: ${paperTargets.size}`)
      log.push(`验证卷 questions 覆盖卡点: ${qBnIds.size}`)
      log.push(`缺失（profile 有、验证卷 targets 没有）: ${missingFromTargets.length} 个`)
      if (missingFromTargets.length > 0) {
        log.push(`缺失清单（id | title | parent | strength | weight）:`)
        missingFromTargets.forEach(m => log.push(`  ${m.id} | ${m.title} | ${m.parent} | ${m.strength} | ${m.weight}${m.coarse ? ' | [粗卡点兜底]' : ''}`))
      }

      // 6. 反向：验证卷有、profile 没有的（异常情况）
      const extraInPaper = [...paperTargets].filter(t => !profileFineSeen.has(t))
      if (extraInPaper.length > 0) {
        log.push(`\n反向异常（验证卷有、profile 没有）: ${extraInPaper.length} 个`)
        extraInPaper.forEach(t => log.push(`  ${t}`))
      }

      return {
        log,
        studentId: targetStudentId,
        subject: targetSubject,
        reportId: targetPaper.triggeredByReport || '',
        profileFineCount: profileFineBn.length,
        paperTargetCount: paperTargets.size,
        paperQBnCount: qBnIds.size,
        missingCount: missingFromTargets.length,
      }
    }, args.paperId)

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

#!/usr/bin/env node
/**
 * 根据已有的全量诊断报告，触发异步自动生成验证卷
 *
 * 逻辑：
 *   1. 查指定学生/学科的最新诊断报告（type=diagnosis, status=completed）
 *   2. 查该报告关联的验证卷（paper.triggeredByReport = reportId）
 *   3. 检查验证卷状态：
 *      - ready 但题量/卡点数不符合全量细BN+置信度分层 → 标记需重新生成
 *      - generating → 提示正在生成
 *      - failed/none/不符合 → 调 regenerateVerificationPaper 云函数触发重新生成
 *   4. 若无关联验证卷，直接调 regenerateVerificationPaper
 *
 * 用法：
 *   node scripts/regenerate-verification-from-reports.js --student-id <ID> [选项]
 *
 * 选项：
 *   --student-id <ID>   必填
 *   --subject <学科>    math（默认）/ chinese / english
 *   --report-id <ID>    可选，指定诊断报告（默认取最新）
 *   --force             即使 ready 也重新生成（用于检查/修正题量）
 *   --dry-run           只检查不触发（默认）
 *   --apply             实际触发重新生成
 *   --env-id <环境ID>   云开发环境 ID（或 TCB_ENV 环境变量）
 */

const path = require('node:path')

function parseArgs(argv) {
  const args = {
    apply: false,
    force: false,
    studentId: '',
    subject: 'math',
    reportId: '',
    envId: process.env.TCB_ENV || '',
  }
  for (let i = 2; i < argv.length; i += 1) {
    const arg = argv[i]
    if (arg === '--apply') args.apply = true
    else if (arg === '--dry-run') args.apply = false
    else if (arg === '--force') args.force = true
    else if (arg === '--student-id') args.studentId = argv[++i] || ''
    else if (arg === '--subject') args.subject = argv[++i] || 'math'
    else if (arg === '--report-id') args.reportId = argv[++i] || ''
    else if (arg === '--env-id') args.envId = argv[++i] || ''
    else if (arg === '--help' || arg === '-h') args.help = true
    else throw new Error(`未知参数：${arg}`)
  }
  return args
}

async function initCloud(envId) {
  let tcb
  try { tcb = require('@cloudbase/node-sdk') }
  catch { tcb = require('tcb-admin-node') }

  const app = tcb.init({ env: envId || undefined })
  const db = app.database()
  return { app, db }
}

// 查最新诊断报告
async function findLatestDiagnosisReport(db, studentId, subject, reportId) {
  const where = reportId
    ? { _id: reportId, studentId, subject }
    : { studentId, subject, type: 'diagnosis', status: 'completed' }
  const res = await db.collection('reports')
    .where(where)
    .orderBy('createdAt', 'desc')
    .limit(1)
    .get()
  return (res.data && res.data[0]) || null
}

// 查该报告关联的验证卷
async function findPaperByReport(db, reportId) {
  const res = await db.collection('papers')
    .where({ triggeredByReport: reportId, type: 'verification' })
    .orderBy('createdAt', 'desc')
    .limit(5)
    .get()
  return res.data || []
}

// 查 profile 统计全量细 BN 数量
async function fetchProfile(db, studentId, subject) {
  const res = await db.collection('subjectProfiles')
    .where({ studentId, subject })
    .limit(1)
    .get()
  return (res.data && res.data[0]) || null
}

// 统计 profile 里的细 BN 数（展开 candidateBottlenecks）
function countFineBottlenecks(profile) {
  if (!profile) return { total: 0, byStrength: { high: 0, medium: 0, low: 0 } }
  const all = [
    ...(profile.pendingBottlenecks || []),
    ...(profile.currentBottlenecks || []),
  ]
  const seen = new Set()
  let high = 0, medium = 0, low = 0
  for (const item of all) {
    for (const cand of (item.candidateBottlenecks || [])) {
      const id = cand.bottleneckId || cand.id
      if (!id || seen.has(id)) continue
      seen.add(id)
      const s = cand.evidenceStrength
      if (s === 'high') high += 1
      else if (s === 'medium') medium += 1
      else low += 1
    }
  }
  // 无 candidate 的粗卡点也算
  for (const item of all) {
    if (!item.candidateBottlenecks || item.candidateBottlenecks.length === 0) {
      const code = item.lpCode
      if (code && !seen.has(code)) {
        seen.add(code)
        low += 1
      }
    }
  }
  return { total: seen.size, byStrength: { high, medium, low } }
}

// 期望题量：high×3 + medium×2 + low×1
function expectedQuestionCount(byStrength) {
  return byStrength.high * 3 + byStrength.medium * 2 + byStrength.low * 1
}

// 调 regenerateVerificationPaper 云函数
async function triggerRegenerate(app, { studentId, subject, reportId }) {
  const result = await app.callFunction({
    name: 'regenerateVerificationPaper',
    data: { studentId, subject, reportId },
  })
  return result.result || {}
}

async function main() {
  const args = parseArgs(process.argv)
  if (args.help || !args.studentId) {
    console.log(`
根据诊断报告触发异步生成验证卷

用法：
  node scripts/regenerate-verification-from-reports.js --student-id <ID> [选项]

选项：
  --student-id <ID>   必填
  --subject <学科>    math（默认）/ chinese / english
  --report-id <ID>    可选，指定诊断报告（默认取最新）
  --force             即使 ready 也重新生成（修正题量）
  --dry-run           只检查不触发（默认）
  --apply             实际触发重新生成
  --env-id <环境ID>   云开发环境 ID（或 TCB_ENV）
`)
    process.exit(args.help ? 0 : 1)
  }

  const { app, db } = await initCloud(args.envId)

  // 1. 查诊断报告
  const report = await findLatestDiagnosisReport(db, args.studentId, args.subject, args.reportId)
  if (!report) {
    console.error(`✗ 未找到诊断报告：student=${args.studentId}, subject=${args.subject}, reportId=${args.reportId || '(最新)'}`)
    process.exit(1)
  }
  console.log(`✓ 诊断报告：${report._id}`)
  console.log(`  类型=${report.type}, 状态=${report.status}, 创建=${report.createdAt || '?'}`)
  console.log(`  卡点数=${(report.bottlenecks || []).length}`)

  // 2. 查 profile 全量细 BN
  const profile = await fetchProfile(db, args.studentId, args.subject)
  const bnStats = countFineBottlenecks(profile)
  const expectedQuestions = expectedQuestionCount(bnStats.byStrength)
  console.log(`\n✓ Profile 细卡点统计：`)
  console.log(`  全量细 BN：${bnStats.total} 个`)
  console.log(`  按置信度：高(${bnStats.byStrength.high})×3 + 中(${bnStats.byStrength.medium})×2 + 低(${bnStats.byStrength.low})×1`)
  console.log(`  期望题量：${expectedQuestions} 题`)

  // 3. 查关联验证卷
  const papers = await findPaperByReport(db, report._id)
  console.log(`\n✓ 关联验证卷：${papers.length} 份`)

  let needRegenerate = false
  let reason = ''

  if (papers.length === 0) {
    console.log(`  ⚠ 无关联验证卷`)
    needRegenerate = true
    reason = '无验证卷'
  } else {
    const paper = papers[0]
    const qCount = (paper.questions || []).length
    const tCount = (paper.bottleneckTargets || []).length
    console.log(`  最新卷：${paper._id}`)
    console.log(`    generationStatus=${paper.generationStatus || '(无)'}`)
    console.log(`    verificationStatus=${paper.verificationStatus || '(无)'}`)
    console.log(`    卡点数=${tCount}, 题量=${qCount}`)

    if (paper.generationStatus === 'generating' || paper.generationStatus === 'appending') {
      console.log(`  ⚠ 正在生成中（${paper.generationStatus}）`)
      if (paper.generationProgress) {
        console.log(`    进度：${paper.generationProgress.completedBatches}/${paper.generationProgress.totalBatches} 批`)
      }
      console.log(`  → 跳过触发，等待现有生成完成`)
      needRegenerate = false
    } else if (paper.generationStatus === 'failed') {
      console.log(`  ⚠ 生成失败：${paper.generationError || '(无错误信息)'}`)
      needRegenerate = true
      reason = '上次生成失败'
    } else if (paper.generationStatus === 'ready' || (!paper.generationStatus && paper.pdfFileId)) {
      // ready，检查题量是否符合
      if (args.force) {
        console.log(`  → --force 强制重新生成`)
        needRegenerate = true
        reason = '强制重新生成'
      } else if (tCount < bnStats.total) {
        console.log(`  ⚠ 卡点数不符：卷里 ${tCount} 个，应为 ${bnStats.total} 个`)
        needRegenerate = true
        reason = '卡点数不足（旧逻辑生成）'
      } else if (expectedQuestions > 0 && qCount < expectedQuestions * 0.7) {
        console.log(`  ⚠ 题量严重不足：卷里 ${qCount} 题，期望约 ${expectedQuestions} 题`)
        needRegenerate = true
        reason = '题量不足（未按置信度分层）'
      } else {
        console.log(`  ✓ 验证卷符合全量+置信度要求`)
      }
    } else {
      console.log(`  ⚠ 未知状态，需重新生成`)
      needRegenerate = true
      reason = '状态异常'
    }
  }

  // 4. 触发重新生成
  if (!needRegenerate) {
    console.log(`\n→ 无需重新生成（${reason || '已符合要求'}）`)
    return
  }

  console.log(`\n→ 需要重新生成：${reason}`)

  if (!args.apply) {
    console.log(`  [dry-run] 加 --apply 实际触发 regenerateVerificationPaper 云函数`)
    return
  }

  console.log(`  [apply] 调用 regenerateVerificationPaper...`)
  const result = await triggerRegenerate(app, {
    studentId: args.studentId,
    subject: args.subject,
    reportId: report._id,
  })

  if (result.success) {
    console.log(`  ✓ 已触发：paperId=${result.paperId}, 目标卡点数=${result.targetCount}`)
    console.log(`  → 分批生成中（fire-and-forget），前端轮询 getActiveVerificationPaper 查进度`)
    console.log(`  → 预计 ${Math.ceil(result.targetCount / 8)} 批，每批约 30-50 秒`)
  } else {
    console.error(`  ✗ 触发失败：${result.error}`)
    process.exit(1)
  }
}

main().catch(err => {
  console.error('执行失败：', err.message || err)
  process.exit(1)
})

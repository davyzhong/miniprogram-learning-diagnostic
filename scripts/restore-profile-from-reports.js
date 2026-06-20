#!/usr/bin/env node
/**
 * 恢复脚本：从 reports 集合重建 subjectProfile.currentBottlenecks
 *
 * 背景：reanalyzeMathHistory 的 rebuildSubjectProfile 是覆盖式写入，
 * 只取最新一份报告的卡点，导致历史卡点丢失（如 33 个 → 2 个）。
 *
 * 本脚本从空 profile 开始，按时间顺序回放所有有效报告，
 * 用 buildProfileSummary 的 merge 逻辑逐步累加，最终得到全量 profile。
 *
 * 用法：
 *   node scripts/restore-profile-from-reports.js --student-id <ID> --subject math --dry-run
 *   node scripts/restore-profile-from-reports.js --student-id <ID> --subject math --apply
 *
 * 前置：需要 tcb-admin-node 或 @cloudbase/node-sdk 连接云数据库
 */

const path = require('node:path')
const fs = require('node:fs')

// 加载 buildProfileSummary（云函数里的 merge 逻辑）
const profileSummary = require('../cloudfunctions/analyzePhotos/profile-summary.js')
const { buildProfileSummary } = profileSummary
function parseArgs(argv) {
  const args = {
    apply: false,
    studentId: '',
    subject: 'math',
    envId: process.env.TCB_ENV || '',
    help: false,
  }
  for (let i = 2; i < argv.length; i += 1) {
    const arg = argv[i]
    if (arg === '--apply') args.apply = true
    else if (arg === '--dry-run') args.apply = false
    else if (arg === '--student-id') args.studentId = argv[++i] || ''
    else if (arg === '--subject') args.subject = argv[++i] || 'math'
    else if (arg === '--env-id') args.envId = argv[++i] || ''
    else if (arg === '--help' || arg === '-h') args.help = true
    else throw new Error(`未知参数：${arg}`)
  }
  return args
}

function printHelp() {
  console.log(`
恢复 subjectProfile.currentBottlenecks（从 reports 聚合重建）

用法：
  node scripts/restore-profile-from-reports.js --student-id <ID> [选项]

选项：
  --student-id <ID>   必填，要恢复的学生 ID
  --subject <学科>    数学 math（默认）/ 语文 chinese
  --dry-run           只预览不写入（默认）
  --apply             实际写入云数据库
  --env-id <环境ID>   云开发环境 ID（或用 TCB_ENV 环境变量）
  --help              显示帮助

示例：
  # 先预览看会恢复多少个卡点
  node scripts/restore-profile-from-reports.js --student-id student-xxx --dry-run

  # 确认无误后实际写入
  node scripts/restore-profile-from-reports.js --student-id student-xxx --apply
`)
}

async function initCloud(envId) {
  let tcb
  try { tcb = require('@cloudbase/node-sdk') }
  catch { tcb = require('tcb-admin-node') }

  const app = tcb.init({ env: envId || undefined })
  const db = app.database()
  return { app, db }
}

async function fetchReports(db, studentId, subject) {
  console.log(`查询 ${studentId} 的 ${subject} 报告...`)
  const _ = db.command
  const res = await db.collection('reports')
    .where({
      studentId,
      subject,
      status: 'completed',
      isArchived: _.neq(true),
    })
    .orderBy('createdAt', 'asc')
    .limit(200)
    .get()

  const reports = res.data || []
  console.log(`  找到 ${reports.length} 份有效报告（按时间正序）`)

  // 标记哪些是"有效报告"（有 bottlenecks 或 verificationTargets）
  const effective = reports.filter(r =>
    (r.bottlenecks && r.bottlenecks.length > 0) ||
    (r.verificationTargets && r.verificationTargets.length > 0)
  )
  console.log(`  其中 ${effective.length} 份有诊断内容（含卡点或验证目标）`)

  return reports
}

async function fetchProfile(db, studentId, subject) {
  const res = await db.collection('subjectProfiles')
    .where({ studentId, subject })
    .limit(1)
    .get()
  return (res.data && res.data[0]) || null
}

// 核心：从空 profile 开始，按时间回放所有报告，用 merge 逻辑累加
function rebuildByReplay(reports) {
  let profile = {
    currentBottlenecks: [],
    pendingBottlenecks: [],
    improvedBottlenecks: [],
    chineseReviewItems: [],
  }

  let lastEffectiveSummary = null

  for (const report of reports) {
    const reportTime = report.createdAt ? new Date(report.createdAt) : new Date()
    const summary = buildProfileSummary(profile, report, reportTime)
    if (summary.isEffective) {
      profile = {
        ...profile,
        currentBottlenecks: summary.currentBottlenecks,
        chineseReviewItems: summary.chineseReviewItems || profile.chineseReviewItems,
        currentSummary: summary.currentSummary,
        nextAction: summary.nextAction,
      }
      lastEffectiveSummary = summary
    }
  }

  return { profile, lastEffectiveSummary }
}

async function main() {
  const args = parseArgs(process.argv)
  if (args.help || !args.studentId) {
    printHelp()
    process.exit(args.help ? 0 : 1)
  }

  console.log('=== 恢复 subjectProfile（从 reports 聚合重建）===\n')
  console.log(`学生: ${args.studentId}`)
  console.log(`学科: ${args.subject}`)
  console.log(`模式: ${args.apply ? '✏️ APPLY（写入）' : '👁 DRY-RUN（预览）'}\n`)

  const { db } = await initCloud(args.envId)

  // 1. 查现有 profile（看当前状态）
  const existingProfile = await fetchProfile(db, args.studentId, args.subject)
  if (existingProfile) {
    const currentCount = (existingProfile.currentBottlenecks || []).length
    const pendingCount = (existingProfile.pendingBottlenecks || []).length
    const improvedCount = (existingProfile.improvedBottlenecks || []).length
    console.log(`当前 profile 状态:`)
    console.log(`  currentBottlenecks: ${currentCount} 个`)
    console.log(`  pendingBottlenecks: ${pendingCount} 个`)
    console.log(`  improvedBottlenecks: ${improvedCount} 个`)
    console.log(`  profile._id: ${existingProfile._id}\n`)
  } else {
    console.log('⚠ 未找到现有 profile，将创建新的\n')
  }

  // 2. 查所有有效报告
  const reports = await fetchReports(db, args.studentId, args.subject)
  if (reports.length === 0) {
    console.log('\n没有有效报告，无法恢复。请先上传试卷生成诊断报告。')
    process.exit(0)
  }

  // 3. 从空 profile 回放所有报告，用 merge 逻辑重建
  console.log('\n回放所有报告，用 merge 逻辑重建卡点...')
  const { profile: rebuilt, lastEffectiveSummary } = rebuildByReplay(reports)

  const rebuiltCurrent = rebuilt.currentBottlenecks || []
  const rebuiltPending = rebuiltCurrent.filter(b => b.status !== 'improved')
  const rebuiltImproved = rebuiltCurrent.filter(b => b.status === 'improved')

  console.log(`\n重建结果:`)
  console.log(`  currentBottlenecks: ${rebuiltCurrent.length} 个`)
  console.log(`  pendingBottlenecks: ${rebuiltPending.length} 个`)
  console.log(`  improvedBottlenecks: ${rebuiltImproved.length} 个`)

  // 展示前 10 个卡点供确认
  console.log(`\n前 10 个卡点:`)
  rebuiltCurrent.slice(0, 10).forEach((b, i) => {
    console.log(`  ${i + 1}. ${b.lpCode} | ${b.lpName} | ${b.status} | ${b.trend} | evidence=${b.evidenceCount}`)
  })
  if (rebuiltCurrent.length > 10) {
    console.log(`  ... 还有 ${rebuiltCurrent.length - 10} 个`)
  }

  // 4. 写入或预览
  if (!args.apply) {
    console.log('\n👁 DRY-RUN 模式，未写入。加 --apply 实际写入。')
    // 保存预览到文件
    const previewPath = path.join(__dirname, '..', 'tmp', `profile-restore-preview-${args.studentId}-${args.subject}.json`)
    fs.mkdirSync(path.dirname(previewPath), { recursive: true })
    fs.writeFileSync(previewPath, JSON.stringify({
      studentId: args.studentId,
      subject: args.subject,
      rebuilt,
      reportCount: reports.length,
    }, null, 2))
    console.log(`预览已保存: ${previewPath}`)
    process.exit(0)
  }

  // 实际写入
  console.log('\n✏️ 写入云数据库...')
  const now = new Date()
  const patch = {
    currentBottlenecks: rebuiltCurrent,
    pendingBottlenecks: rebuiltPending.map(b => ({
      lpCode: b.lpCode,
      lpName: b.lpName,
      severity: b.severity,
      sinceDate: b.firstSeenAt,
    })),
    improvedBottlenecks: rebuiltImproved.map(b => ({
      lpCode: b.lpCode,
      lpName: b.lpName,
      sinceDate: b.firstSeenAt,
      improvedDate: b.lastPassedAt || b.lastSeenAt,
    })),
    // 归档保护：把旧 currentBottlenecks 存到 archivedBottlenecks
    archivedBottlenecks: existingProfile ? (existingProfile.currentBottlenecks || []) : [],
    archivedAt: now,
    currentSummary: rebuilt.currentSummary || '',
    nextAction: rebuilt.nextAction || '',
    updatedAt: now,
    restoredAt: now,
    restoreReason: 'rebuilt-from-reports-merge',
  }

  if (existingProfile) {
    await db.collection('subjectProfiles').doc(existingProfile._id).update({ data: patch })
    console.log(`✅ 已更新 profile ${existingProfile._id}`)
  } else {
    patch.studentId = args.studentId
    patch.subject = args.subject
    patch.createdAt = now
    const res = await db.collection('subjectProfiles').add({ data: patch })
    console.log(`✅ 已创建 profile ${res._id}`)
  }

  console.log(`\n恢复完成：${rebuiltCurrent.length} 个卡点（含 ${rebuiltPending.length} 待修 + ${rebuiltImproved.length} 已改善）`)
}

main().catch(err => {
  console.error('恢复失败:', err.message || err)
  process.exit(1)
})

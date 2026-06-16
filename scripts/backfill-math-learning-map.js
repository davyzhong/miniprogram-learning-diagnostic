#!/usr/bin/env node
const fs = require('node:fs')
const path = require('node:path')

const { enrichMathReport, BACKFILL_VERSION } = require('../cloudfunctions/analyzePhotos/math-learning-map-enricher')
const { buildProfileSummary } = require('../cloudfunctions/analyzePhotos/profile-summary')

function parseArgs(argv) {
  const args = {
    apply: false,
    input: '',
    output: '',
    studentId: '',
    reportId: '',
    limit: 100,
    batchSize: 100,
    rebuildProfiles: true
  }
  for (let i = 2; i < argv.length; i += 1) {
    const arg = argv[i]
    if (arg === '--apply') args.apply = true
    else if (arg === '--dry-run') args.apply = false
    else if (arg === '--no-rebuild-profiles') args.rebuildProfiles = false
    else if (arg === '--input') args.input = argv[++i] || ''
    else if (arg === '--output') args.output = argv[++i] || ''
    else if (arg === '--student-id') args.studentId = argv[++i] || ''
    else if (arg === '--report-id') args.reportId = argv[++i] || ''
    else if (arg === '--limit') args.limit = Number(argv[++i]) || args.limit
    else if (arg === '--batch-size') args.batchSize = Number(argv[++i]) || args.batchSize
    else if (arg === '--help' || arg === '-h') args.help = true
    else throw new Error(`未知参数：${arg}`)
  }
  return args
}

function printHelp() {
  console.log(`
Backfill math learning-map fields for historical reports.

Usage:
  node scripts/backfill-math-learning-map.js --input reports.json --output enriched.json
  node scripts/backfill-math-learning-map.js --student-id <id> --dry-run
  node scripts/backfill-math-learning-map.js --student-id <id> --apply

Options:
  --apply                 Write updates. Default is dry-run.
  --dry-run               Preview only.
  --input <file>          Local JSON array or { "reports": [...] } for preview.
  --output <file>         Write enriched local JSON output.
  --student-id <id>       Limit cloud backfill to one student.
  --report-id <id>        Limit cloud backfill to one report.
  --limit <n>             Max reports to scan in cloud mode. Default: 100.
  --batch-size <n>        Cloud query page size. Default: 100.
  --no-rebuild-profiles   Only update reports, skip subjectProfiles rebuild.
`)
}

function reportTime(report = {}) {
  return new Date(report.evidenceTime || report.createdAt || report.updatedAt || 0).getTime() || 0
}

function summaryFor(enriched) {
  return (enriched.bottlenecks || []).map(item => ({
    lpCode: item.lpCode,
    lpName: item.lpName,
    nodeIds: item.nodeIds || [],
    candidateBottleneckIds: (item.candidateBottlenecks || []).map(candidate => candidate.bottleneckId),
    recommendedResourceIds: item.recommendedResourceIds || [],
    evidenceStrength: item.evidenceStrength || ''
  }))
}

function enrichReports(reports = [], options = {}) {
  const now = options.now || new Date()
  const enrichedReports = []
  const previews = []
  let changedCount = 0
  let enrichedBottleneckCount = 0

  for (const report of reports) {
    if (report.subject && report.subject !== 'math') {
      enrichedReports.push(report)
      continue
    }
    const result = enrichMathReport(report, { now })
    enrichedReports.push(result.report)
    if (result.changed) changedCount += 1
    enrichedBottleneckCount += result.enrichedCount
    if (previews.length < 5 && result.enrichedCount > 0) {
      previews.push({
        reportId: report._id || report.id || '',
        summary: summaryFor(result.report)
      })
    }
  }

  return {
    reports: enrichedReports,
    stats: {
      scannedReports: reports.length,
      changedReports: changedCount,
      enrichedBottlenecks: enrichedBottleneckCount,
      version: BACKFILL_VERSION
    },
    previews
  }
}

function loadLocalReports(inputPath) {
  const absolute = path.resolve(process.cwd(), inputPath)
  const raw = JSON.parse(fs.readFileSync(absolute, 'utf8'))
  if (Array.isArray(raw)) return raw
  if (Array.isArray(raw.reports)) return raw.reports
  throw new Error('本地输入必须是报告数组，或包含 reports 数组的对象')
}

function writeLocalOutput(outputPath, payload) {
  const absolute = path.resolve(process.cwd(), outputPath)
  fs.writeFileSync(absolute, `${JSON.stringify(payload, null, 2)}\n`)
}

function pendingAndImprovedFrom(currentBottlenecks = []) {
  return {
    pendingBottlenecks: currentBottlenecks
      .filter(item => item.status !== 'improved')
      .map(item => ({
        lpCode: item.lpCode,
        lpName: item.lpName,
        severity: item.severity || 'medium',
        sinceDate: item.firstSeenAt || new Date(),
        nodeIds: item.nodeIds || [],
        candidateBottlenecks: item.candidateBottlenecks || [],
        recommendedResourceIds: item.recommendedResourceIds || [],
        evidenceStrength: item.evidenceStrength || '',
        nextActionType: item.nextActionType || '',
        nextActionText: item.nextActionText || ''
      })),
    improvedBottlenecks: currentBottlenecks
      .filter(item => item.status === 'improved')
      .map(item => ({
        lpCode: item.lpCode,
        lpName: item.lpName,
        improvedDate: item.lastSeenAt || new Date(),
        nodeIds: item.nodeIds || [],
        candidateBottlenecks: item.candidateBottlenecks || [],
        recommendedResourceIds: item.recommendedResourceIds || []
      }))
  }
}

function rebuildProfileFromReports(profile = {}, reports = [], now = new Date()) {
  let state = {
    ...profile,
    currentBottlenecks: [],
    pendingBottlenecks: [],
    improvedBottlenecks: []
  }
  let latestEffectiveReportId = ''
  for (const report of reports.slice().sort((a, b) => reportTime(a) - reportTime(b))) {
    const summary = buildProfileSummary(state, report, report.evidenceTime || report.completedAt || report.createdAt || now)
    state = {
      ...state,
      currentBottlenecks: summary.currentBottlenecks,
      currentSummary: summary.currentSummary,
      nextAction: summary.nextAction
    }
    if (summary.isEffective) latestEffectiveReportId = report._id || latestEffectiveReportId
  }
  const split = pendingAndImprovedFrom(state.currentBottlenecks)
  return {
    currentSummary: state.currentSummary || '暂未形成明确学习卡点，建议继续上传试卷观察。',
    currentBottlenecks: state.currentBottlenecks || [],
    nextAction: state.nextAction || '继续上传试卷',
    latestEffectiveReportId,
    ...split
  }
}

async function loadCloudSdk() {
  let cloud
  try {
    cloud = require('wx-server-sdk')
  } catch (error) {
    throw new Error('当前本地未安装 wx-server-sdk，无法直接连接微信云数据库。请在云函数环境运行，或先使用 --input 做本地预演。')
  }
  cloud.init({ env: process.env.WX_CLOUD_ENV || cloud.SYMBOL_CURRENT_ENV })
  return cloud
}

async function fetchReports(db, args) {
  if (args.reportId) {
    const res = await db.collection('reports').doc(args.reportId).get()
    return res.data ? [res.data] : []
  }

  const filter = { subject: 'math', status: 'completed' }
  if (args.studentId) filter.studentId = args.studentId

  const reports = []
  let offset = 0
  while (reports.length < args.limit) {
    const res = await db.collection('reports')
      .where(filter)
      .orderBy('createdAt', 'asc')
      .skip(offset)
      .limit(Math.min(args.batchSize, args.limit - reports.length))
      .get()
    const page = res.data || []
    reports.push(...page)
    if (page.length < args.batchSize) break
    offset += page.length
  }
  return reports
}

async function updateCloudReports(db, originalReports, enrichedReports) {
  let updated = 0
  for (let index = 0; index < originalReports.length; index += 1) {
    const before = originalReports[index]
    const after = enrichedReports[index]
    if (!before || !after || !after._id) continue
    if (JSON.stringify(before.bottlenecks || []) === JSON.stringify(after.bottlenecks || [])) continue
    await db.collection('reports').doc(after._id).update({
      data: {
        bottlenecks: after.bottlenecks,
        learningMapBackfill: after.learningMapBackfill,
        updatedAt: new Date()
      }
    })
    updated += 1
  }
  return updated
}

async function rebuildCloudProfiles(db, reports, apply) {
  const byStudent = new Map()
  for (const report of reports) {
    if (!report.studentId) continue
    if (!byStudent.has(report.studentId)) byStudent.set(report.studentId, [])
    byStudent.get(report.studentId).push(report)
  }

  const previews = []
  let updated = 0
  for (const [studentId, studentReports] of byStudent.entries()) {
    const profileRes = await db.collection('subjectProfiles').where({ studentId, subject: 'math' }).limit(1).get()
    const profile = (profileRes.data || [])[0]
    if (!profile) continue
    const rebuilt = rebuildProfileFromReports(profile, studentReports)
    previews.push({
      studentId,
      profileId: profile._id,
      currentSummary: rebuilt.currentSummary,
      currentBottleneckCount: rebuilt.currentBottlenecks.length,
      latestEffectiveReportId: rebuilt.latestEffectiveReportId
    })
    if (apply) {
      await db.collection('subjectProfiles').doc(profile._id).update({
        data: {
          ...rebuilt,
          diagnosisUpdatedAt: new Date(),
          updatedAt: new Date()
        }
      })
      updated += 1
    }
  }
  return { updated, previews }
}

async function runCloudMode(args) {
  const cloud = await loadCloudSdk()
  const db = cloud.database()
  const originalReports = await fetchReports(db, args)
  const enriched = enrichReports(originalReports)
  let updatedReports = 0
  if (args.apply) {
    updatedReports = await updateCloudReports(db, originalReports, enriched.reports)
  }

  const profileResult = args.rebuildProfiles
    ? await rebuildCloudProfiles(db, enriched.reports, args.apply)
    : { updated: 0, previews: [] }

  return {
    mode: args.apply ? 'apply' : 'dry-run',
    ...enriched.stats,
    updatedReports,
    updatedProfiles: profileResult.updated,
    reportPreviews: enriched.previews,
    profilePreviews: profileResult.previews
  }
}

async function main() {
  const args = parseArgs(process.argv)
  if (args.help) {
    printHelp()
    return
  }

  if (args.input) {
    const reports = loadLocalReports(args.input)
    const enriched = enrichReports(reports)
    const payload = {
      mode: 'local',
      ...enriched.stats,
      previews: enriched.previews,
      reports: enriched.reports
    }
    if (args.output) writeLocalOutput(args.output, payload)
    console.log(JSON.stringify({ ...payload, reports: undefined }, null, 2))
    return
  }

  const result = await runCloudMode(args)
  console.log(JSON.stringify(result, null, 2))
}

if (require.main === module) {
  main().catch(error => {
    console.error(error.message || error)
    process.exit(1)
  })
}

module.exports = {
  enrichReports,
  rebuildProfileFromReports,
  pendingAndImprovedFrom
}

#!/usr/bin/env node
const crypto = require('node:crypto')

const { rebuildProfileFromReports } = require('./backfill-math-learning-map')

const REANALYSIS_VERSION = 'math-full-reanalysis-v2.1'

function parseArgs(argv) {
  const args = {
    apply: false,
    phase: 'start',
    studentId: '',
    reportId: '',
    limit: 100,
    batchSize: 100,
    token: process.env.MATH_REANALYSIS_TOKEN || ''
  }
  for (let i = 2; i < argv.length; i += 1) {
    const arg = argv[i]
    if (arg === '--apply') args.apply = true
    else if (arg === '--dry-run') args.apply = false
    else if (arg === '--phase') args.phase = argv[++i] || args.phase
    else if (arg === '--student-id') args.studentId = argv[++i] || ''
    else if (arg === '--report-id') args.reportId = argv[++i] || ''
    else if (arg === '--limit') args.limit = Number(argv[++i]) || args.limit
    else if (arg === '--batch-size') args.batchSize = Number(argv[++i]) || args.batchSize
    else if (arg === '--token') args.token = argv[++i] || ''
    else if (arg === '--help' || arg === '-h') args.help = true
    else throw new Error(`未知参数：${arg}`)
  }
  return args
}

function printHelp() {
  console.log(`
Reanalyze all historical math report images with the current AI pipeline.

This is a two-phase migration:
  start     Create replacement reports and trigger analyzePhotos.
  finalize  Archive replaced legacy reports and rebuild math subjectProfiles.
  all       Run start then finalize; useful only when analysis completes synchronously in tests.

Usage:
  node scripts/reanalyze-math-history.js --phase start --student-id <id> --dry-run
  MATH_REANALYSIS_TOKEN=... node scripts/reanalyze-math-history.js --phase start --student-id <id> --apply
  node scripts/reanalyze-math-history.js --phase finalize --student-id <id> --apply

Options:
  --apply           Write changes. Default is dry-run.
  --dry-run         Preview only.
  --phase <name>    start | finalize | all. Default: start.
  --student-id <id> Limit to one student.
  --report-id <id>  Limit to one source report.
  --limit <n>       Max reports to scan. Default: 100.
  --batch-size <n>  Cloud query page size. Default: 100.
  --token <token>   Admin token passed to analyzePhotos; defaults to MATH_REANALYSIS_TOKEN.
`)
}

function reportTime(report = {}) {
  return new Date(report.evidenceTime || report.createdAt || report.updatedAt || 0).getTime() || 0
}

function imageFileIdsOf(report = {}) {
  return Array.from(new Set([
    ...(report.imageFileIds || []),
    ...((report.imageFiles || []).map(file => file && file.fileID))
  ].filter(Boolean)))
}

function isReplacementReport(report = {}) {
  return Boolean(report.reanalysis && report.reanalysis.sourceReportId)
}

function hasPendingReplacement(report = {}) {
  return Boolean(
    report.replacedByReportId
    || (report.mathReanalysis && report.mathReanalysis.replacementReportId)
  )
}

function isReanalysisCandidate(report = {}) {
  if (!report || !report._id) return false
  if (report.subject !== 'math') return false
  if (report.status !== 'completed') return false
  if (report.isArchived || report.archivedAt) return false
  if (isReplacementReport(report)) return false
  if (hasPendingReplacement(report)) return false
  return imageFileIdsOf(report).length > 0
}

function selectReanalysisCandidates(reports = []) {
  return reports
    .filter(isReanalysisCandidate)
    .sort((a, b) => reportTime(a) - reportTime(b))
}

function safeImageFiles(report = {}) {
  return (report.imageFiles || []).map(file => ({
    fileID: file.fileID || '',
    fileName: file.fileName || '',
    fileSize: Number(file.fileSize) || 0,
    uploadedAt: file.uploadedAt || report.evidenceTime || report.createdAt || new Date(),
    ocrSummary: '',
    contentFingerprint: '',
    isDuplicate: false,
    duplicateOf: '',
    analysisStatus: '',
    analysisError: ''
  })).filter(file => file.fileID)
}

function buildReplacementReport(source = {}, options = {}) {
  const now = options.now || new Date()
  const batchId = options.batchId || `math-reanalysis-${now.toISOString().slice(0, 10)}`
  const imageFileIds = imageFileIdsOf(source)
  const replacement = {
    _openid: source._openid,
    studentId: source.studentId,
    subject: 'math',
    subjectName: source.subjectName || '数学',
    type: source.type === 'verification' ? 'verification' : 'diagnosis',
    mode: source.mode || source.type || 'diagnosis',
    sourceType: source.sourceType || '',
    paperId: source.paperId || '',
    imageFileIds,
    imageFiles: safeImageFiles(source),
    status: 'analyzing',
    error: '',
    summary: '',
    totalErrors: 0,
    bottlenecks: [],
    errorDetails: [],
    comparisonSummary: '',
    verificationTargets: [],
    verificationEvidence: [],
    quality: null,
    isEffective: false,
    partialSuccess: false,
    failedBatchCount: 0,
    failedImageFiles: [],
    evidenceTime: source.evidenceTime || source.createdAt || now,
    createdAt: source.createdAt || source.evidenceTime || now,
    updatedAt: now,
    reanalysis: {
      version: REANALYSIS_VERSION,
      batchId,
      sourceReportId: source._id,
      sourceReportCreatedAt: source.createdAt || '',
      startedAt: now,
      status: 'started',
      replacementForLegacyReport: true
    },
    originalReportId: source._id
  }

  Object.keys(replacement).forEach(key => {
    if (replacement[key] === undefined) delete replacement[key]
  })
  return replacement
}

function legacyPendingPatch(replacementReportId, options = {}) {
  const now = options.now || new Date()
  return {
    replacedByReportId: replacementReportId,
    mathReanalysis: {
      version: REANALYSIS_VERSION,
      batchId: options.batchId || '',
      replacementReportId,
      status: 'replacement_created',
      startedAt: now
    },
    updatedAt: now
  }
}

function legacyArchivePatch(replacementReportId, options = {}) {
  const now = options.now || new Date()
  return {
    isArchived: true,
    archivedAt: now,
    archiveReason: 'replaced-by-math-learning-map-full-reanalysis',
    replacedByReportId: replacementReportId,
    mathReanalysis: {
      version: REANALYSIS_VERSION,
      batchId: options.batchId || '',
      replacementReportId,
      status: 'archived_after_reanalysis',
      startedAt: options.startedAt || now,
      finalizedAt: now
    },
    updatedAt: now
  }
}

async function loadCloudSdk() {
  let cloud
  try {
    cloud = require('wx-server-sdk')
  } catch (error) {
    throw new Error('当前本地未安装 wx-server-sdk，无法直接连接微信云数据库。请在微信云函数环境或装好 SDK 的维护环境运行。')
  }
  cloud.init({ env: process.env.WX_CLOUD_ENV || cloud.SYMBOL_CURRENT_ENV })
  return cloud
}

async function fetchReports(db, args) {
  if (args.reportId) {
    const res = await db.collection('reports').doc(args.reportId).get()
    return res.data ? [res.data] : []
  }

  const filter = { subject: 'math' }
  if (args.studentId) filter.studentId = args.studentId

  const reports = []
  let offset = 0
  while (reports.length < args.limit) {
    let query = db.collection('reports')
      .where(filter)
      .orderBy('createdAt', 'asc')
    if (typeof query.skip === 'function') query = query.skip(offset)
    const res = await query
      .limit(Math.min(args.batchSize, args.limit - reports.length))
      .get()
    const page = res.data || []
    reports.push(...page)
    if (page.length < args.batchSize || typeof query.skip !== 'function') break
    offset += page.length
  }
  return reports
}

function buildStartPreview(candidates = []) {
  return candidates.map(report => ({
    sourceReportId: report._id,
    studentId: report.studentId,
    type: report.type || 'diagnosis',
    imageCount: imageFileIdsOf(report).length,
    createdAt: report.createdAt || report.evidenceTime || ''
  }))
}

async function startReanalysis(db, cloud, reports, args) {
  const candidates = selectReanalysisCandidates(reports)
  const batchId = `math-reanalysis-${new Date().toISOString().replace(/[-:.TZ]/g, '').slice(0, 14)}-${crypto.randomBytes(3).toString('hex')}`
  const preview = buildStartPreview(candidates)
  if (!args.apply) {
    return { phase: 'start', mode: 'dry-run', batchId, candidateCount: candidates.length, preview }
  }
  if (!args.token) {
    throw new Error('执行全量重分析必须提供 MATH_REANALYSIS_TOKEN 或 --token，用于受控触发 analyzePhotos。')
  }

  const started = []
  for (const source of candidates) {
    const replacement = buildReplacementReport(source, { batchId })
    const addRes = await db.collection('reports').add({ data: replacement })
    const replacementReportId = addRes._id
    await db.collection('reports').doc(source._id).update({
      data: legacyPendingPatch(replacementReportId, { batchId, startedAt: replacement.reanalysis.startedAt })
    })
    await cloud.callFunction({
      name: 'analyzePhotos',
      data: {
        reportId: replacementReportId,
        reanalysisToken: args.token
      }
    })
    started.push({ sourceReportId: source._id, replacementReportId })
  }
  return { phase: 'start', mode: 'apply', batchId, candidateCount: candidates.length, started }
}

function replacementBySource(reports = []) {
  const pairs = new Map()
  for (const report of reports) {
    const sourceId = report.reanalysis && report.reanalysis.sourceReportId
    if (!sourceId) continue
    const current = pairs.get(sourceId)
    if (!current || reportTime(report) >= reportTime(current)) pairs.set(sourceId, report)
  }
  return pairs
}

function finalizablePairs(reports = []) {
  const replacements = replacementBySource(reports)
  return reports
    .filter(report => report.subject === 'math')
    .filter(report => !isReplacementReport(report))
    .filter(report => !report.isArchived && !report.archivedAt)
    .map(source => ({ source, replacement: replacements.get(source._id) }))
    .filter(pair => pair.replacement && pair.replacement.status === 'completed')
}

function activeMathReportsForProfile(reports = [], archivedSourceIds = new Set()) {
  return reports
    .filter(report => report.subject === 'math')
    .filter(report => report.status === 'completed')
    .filter(report => !report.isArchived && !report.archivedAt)
    .filter(report => !archivedSourceIds.has(report._id))
}

async function rebuildProfiles(db, reports, apply) {
  const byStudent = new Map()
  for (const report of reports) {
    if (!report.studentId) continue
    if (!byStudent.has(report.studentId)) byStudent.set(report.studentId, [])
    byStudent.get(report.studentId).push(report)
  }

  const profiles = []
  for (const [studentId, studentReports] of byStudent.entries()) {
    const profileRes = await db.collection('subjectProfiles').where({ studentId, subject: 'math' }).limit(1).get()
    const profile = (profileRes.data || [])[0]
    if (!profile) continue
    const rebuilt = rebuildProfileFromReports(profile, studentReports)
    profiles.push({
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
          totalReports: studentReports.length,
          analysisStatus: null,
          currentAnalysisId: '',
          diagnosisUpdatedAt: new Date(),
          updatedAt: new Date()
        }
      })
    }
  }
  return profiles
}

async function finalizeReanalysis(db, reports, args) {
  const pairs = finalizablePairs(reports)
  const archivedSourceIds = new Set(pairs.map(pair => pair.source._id))
  const activeReports = activeMathReportsForProfile(reports, archivedSourceIds)
  const profilePreview = await rebuildProfiles(db, activeReports, args.apply)

  if (args.apply) {
    for (const pair of pairs) {
      await db.collection('reports').doc(pair.source._id).update({
        data: legacyArchivePatch(pair.replacement._id, {
          batchId: pair.replacement.reanalysis && pair.replacement.reanalysis.batchId,
          startedAt: pair.replacement.reanalysis && pair.replacement.reanalysis.startedAt
        })
      })
      await db.collection('reports').doc(pair.replacement._id).update({
        data: {
          reanalysis: {
            ...pair.replacement.reanalysis,
            status: 'finalized',
            finalizedAt: new Date()
          },
          updatedAt: new Date()
        }
      })
    }
  }

  return {
    phase: 'finalize',
    mode: args.apply ? 'apply' : 'dry-run',
    finalizableCount: pairs.length,
    archivedSourceIds: Array.from(archivedSourceIds),
    profilePreview
  }
}

async function runCloudMode(args) {
  const cloud = await loadCloudSdk()
  const db = cloud.database()
  const reports = await fetchReports(db, args)

  if (args.phase === 'start') return startReanalysis(db, cloud, reports, args)
  if (args.phase === 'finalize') return finalizeReanalysis(db, reports, args)
  if (args.phase === 'all') {
    const start = await startReanalysis(db, cloud, reports, args)
    const refreshed = await fetchReports(db, args)
    const finalize = await finalizeReanalysis(db, refreshed, args)
    return { phase: 'all', start, finalize }
  }
  throw new Error(`未知 phase：${args.phase}`)
}

async function main() {
  const args = parseArgs(process.argv)
  if (args.help) {
    printHelp()
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
  REANALYSIS_VERSION,
  imageFileIdsOf,
  isReanalysisCandidate,
  selectReanalysisCandidates,
  buildReplacementReport,
  legacyPendingPatch,
  legacyArchivePatch,
  finalizablePairs,
  activeMathReportsForProfile
}

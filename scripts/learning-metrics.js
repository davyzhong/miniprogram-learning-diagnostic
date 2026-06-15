#!/usr/bin/env node

const fs = require('node:fs')
const path = require('node:path')

const COMPLETED_STATUSES = new Set(['completed'])
const FAILED_STATUSES = new Set(['failed', 'timeout'])
const ACTIVE_STATUSES = new Set(['analyzing', 'pending', 'queued', 'processing'])
const QUALITY_LEVELS = ['high', 'medium', 'low']
const QUALITY_STATUSES = ['usable', 'needs_review', 'insufficient']
const EVIDENCE_STATUSES = ['passed', 'failed', 'incomplete', 'unclear', 'missing']

function safeArray(value) {
  return Array.isArray(value) ? value : []
}

function normalizeInput(input = {}) {
  const data = input.data && typeof input.data === 'object' ? input.data : input
  return {
    studentId: data.studentId || (data.student && data.student._id) || '',
    reports: safeArray(data.reports),
    papers: safeArray(data.papers),
    feedback: safeArray(data.feedback || data.reportFeedback)
  }
}

function matchesStudent(item, studentId) {
  if (!studentId) return true
  if (!item || !item.studentId) return true
  return item.studentId === studentId
}

function normalizeStatus(value) {
  return String(value || '').trim().toLowerCase()
}

function reportTypeOf(report = {}) {
  return report.type === 'verification' ? 'verification' : 'diagnosis'
}

function reportPhotos(report = {}) {
  if (Array.isArray(report.imageFiles)) return report.imageFiles
  if (Array.isArray(report.imageFileIds)) return report.imageFileIds.map(fileID => ({ fileID }))
  return []
}

function rate(numerator, denominator) {
  if (!denominator) return 0
  return Number((numerator / denominator).toFixed(4))
}

function percentText(value) {
  return `${Math.round(Number(value || 0) * 100)}%`
}

function toDate(value) {
  const date = value ? new Date(value) : null
  if (!date || Number.isNaN(date.getTime())) return null
  return date
}

function pad2(value) {
  return String(value).padStart(2, '0')
}

function dateKeyUTC(date) {
  return `${date.getUTCFullYear()}-${pad2(date.getUTCMonth() + 1)}-${pad2(date.getUTCDate())}`
}

function weekStartKey(value) {
  const date = toDate(value)
  if (!date) return ''
  const start = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()))
  const offset = (start.getUTCDay() + 6) % 7
  start.setUTCDate(start.getUTCDate() - offset)
  return dateKeyUTC(start)
}

function recordTime(item = {}) {
  return item.evidenceTime || item.generatedAt || item.createdAt || item.updatedAt || ''
}

function normalizeQualityLevel(report = {}) {
  const level = normalizeStatus(report.quality && report.quality.level)
  return QUALITY_LEVELS.includes(level) ? level : 'unknown'
}

function normalizeQualityStatus(report = {}) {
  const status = normalizeStatus(report.quality && report.quality.status)
  return QUALITY_STATUSES.includes(status) ? status : 'unknown'
}

function normalizeEvidenceStatus(evidence = {}) {
  const explicit = normalizeStatus(evidence.evidenceStatus)
  if (EVIDENCE_STATUSES.includes(explicit)) return explicit
  if (evidence.complete === true && evidence.allCorrect === true) return 'passed'
  if (Number(evidence.incorrectQuestionCount || 0) > 0 || evidence.allCorrect === false) return 'failed'
  if (Number(evidence.unclearQuestionCount || 0) > 0) return 'unclear'
  if (Number(evidence.blankQuestionCount || 0) > 0 || evidence.complete === false) return 'incomplete'
  return 'missing'
}

function createCountMap(keys) {
  return keys.reduce((acc, key) => {
    acc[key] = 0
    return acc
  }, {})
}

function countStatusReports(reports) {
  return reports.reduce((acc, report) => {
    const status = normalizeStatus(report.status)
    if (COMPLETED_STATUSES.has(status)) acc.completedReports += 1
    else if (FAILED_STATUSES.has(status)) acc.failedReports += 1
    else if (ACTIVE_STATUSES.has(status)) acc.activeReports += 1
    else acc.unknownReports += 1
    return acc
  }, {
    completedReports: 0,
    failedReports: 0,
    activeReports: 0,
    unknownReports: 0
  })
}

function buildWeeklyMetrics(reports, papers, feedback) {
  const byWeek = new Map()
  const ensure = key => {
    if (!key) return null
    if (!byWeek.has(key)) {
      byWeek.set(key, {
        weekStart: key,
        reports: 0,
        completedReports: 0,
        failedReports: 0,
        papers: 0,
        feedback: 0,
        verificationTargets: 0,
        passedTargets: 0
      })
    }
    return byWeek.get(key)
  }

  reports.forEach(report => {
    const week = ensure(weekStartKey(recordTime(report)))
    if (!week) return
    week.reports += 1
    const status = normalizeStatus(report.status)
    if (COMPLETED_STATUSES.has(status)) week.completedReports += 1
    if (FAILED_STATUSES.has(status)) week.failedReports += 1
    safeArray(report.verificationEvidence).forEach(evidence => {
      week.verificationTargets += 1
      if (normalizeEvidenceStatus(evidence) === 'passed') week.passedTargets += 1
    })
  })

  papers.forEach(paper => {
    const week = ensure(weekStartKey(recordTime(paper)))
    if (week) week.papers += 1
  })

  feedback.forEach(item => {
    const week = ensure(weekStartKey(recordTime(item)))
    if (week) week.feedback += 1
  })

  return Array.from(byWeek.values())
    .sort((a, b) => a.weekStart.localeCompare(b.weekStart))
    .map(week => ({
      ...week,
      completionRate: rate(week.completedReports, week.reports),
      verificationPassRate: rate(week.passedTargets, week.verificationTargets)
    }))
}

function deriveLearningMetrics(input = {}, options = {}) {
  const normalized = normalizeInput(input)
  const studentId = options.studentId || normalized.studentId || ''
  const reports = normalized.reports.filter(report => matchesStudent(report, studentId))
  const papers = normalized.papers.filter(paper => matchesStudent(paper, studentId))
  const feedback = normalized.feedback.filter(item => matchesStudent(item, studentId))
  const diagnosisReports = reports.filter(report => reportTypeOf(report) === 'diagnosis')
  const verificationReports = reports.filter(report => reportTypeOf(report) === 'verification')
  const photos = reports.flatMap(reportPhotos)
  const analysisCounts = countStatusReports(reports)
  const qualityByLevel = createCountMap([...QUALITY_LEVELS, 'unknown'])
  const qualityByStatus = createCountMap([...QUALITY_STATUSES, 'unknown'])
  const evidenceByStatus = createCountMap(EVIDENCE_STATUSES)

  reports.forEach(report => {
    qualityByLevel[normalizeQualityLevel(report)] += 1
    qualityByStatus[normalizeQualityStatus(report)] += 1
  })

  verificationReports.flatMap(report => safeArray(report.verificationEvidence)).forEach(evidence => {
    evidenceByStatus[normalizeEvidenceStatus(evidence)] += 1
  })

  const targetCount = Object.values(evidenceByStatus).reduce((sum, count) => sum + count, 0)

  return {
    generatedAt: new Date().toISOString(),
    studentId,
    totals: {
      reports: reports.length,
      diagnosisReports: diagnosisReports.length,
      verificationReports: verificationReports.length,
      papers: papers.length,
      feedback: feedback.length
    },
    uploads: {
      photoCount: photos.length,
      duplicatePhotoCount: photos.filter(photo => photo && photo.isDuplicate).length
    },
    analysis: {
      ...analysisCounts,
      completionRate: rate(analysisCounts.completedReports, reports.length),
      failureRate: rate(analysisCounts.failedReports, reports.length),
      activeRate: rate(analysisCounts.activeReports, reports.length)
    },
    quality: {
      byLevel: qualityByLevel,
      byStatus: qualityByStatus,
      insufficientRate: rate(qualityByStatus.insufficient, reports.length)
    },
    verification: {
      targetCount,
      passedTargets: evidenceByStatus.passed,
      failedTargets: evidenceByStatus.failed,
      incompleteTargets: evidenceByStatus.incomplete,
      unclearTargets: evidenceByStatus.unclear,
      missingTargets: evidenceByStatus.missing,
      passRate: rate(evidenceByStatus.passed, targetCount)
    },
    feedback: {
      feedbackCount: feedback.length,
      feedbackRate: rate(feedback.length, reports.length)
    },
    weekly: buildWeeklyMetrics(reports, papers, feedback)
  }
}

function formatMetricsSummary(metrics) {
  const uncertainTargets = metrics.verification.incompleteTargets
    + metrics.verification.unclearTargets
    + metrics.verification.missingTargets
  const weeklyText = metrics.weekly.length
    ? metrics.weekly.map(week => `${week.weekStart}: 报告 ${week.reports}, 完成率 ${percentText(week.completionRate)}, 验证通过率 ${percentText(week.verificationPassRate)}`).join('；')
    : '暂无周趋势'

  return [
    `学习指标摘要${metrics.studentId ? ` (${metrics.studentId})` : ''}`,
    `- 样本：报告 ${metrics.totals.reports} 份，验证试卷 ${metrics.totals.papers} 份，家长反馈 ${metrics.totals.feedback} 条`,
    `- 上传：照片 ${metrics.uploads.photoCount} 张，重复 ${metrics.uploads.duplicatePhotoCount} 张`,
    `- 分析完成率 ${percentText(metrics.analysis.completionRate)}：完成 ${metrics.analysis.completedReports}，失败 ${metrics.analysis.failedReports}，进行中 ${metrics.analysis.activeReports}`,
    `- 报告质量：证据较充分 ${metrics.quality.byLevel.high}，建议复核 ${metrics.quality.byLevel.medium}，样本不足 ${metrics.quality.byLevel.low}，未标记 ${metrics.quality.byLevel.unknown}`,
    `- 验证通过率 ${percentText(metrics.verification.passRate)}：通过 ${metrics.verification.passedTargets}/${metrics.verification.targetCount}，未通过 ${metrics.verification.failedTargets}，证据不足 ${uncertainTargets}`,
    `- 家长反馈率 ${percentText(metrics.feedback.feedbackRate)}：${metrics.feedback.feedbackCount}/${metrics.totals.reports}`,
    `- 周趋势：${weeklyText}`
  ].join('\n')
}

function parseArgs(argv = []) {
  const args = new Map()
  for (const arg of argv) {
    if (!arg.startsWith('--')) continue
    const [key, ...rest] = arg.slice(2).split('=')
    args.set(key, rest.length ? rest.join('=') : '1')
  }
  return args
}

function parseMetricsConfig({ env = process.env, argv = process.argv.slice(2) } = {}) {
  const args = parseArgs(argv)
  return {
    inputPath: args.get('input') || env.METRICS_INPUT || '',
    studentId: args.get('student-id') || env.METRICS_STUDENT_ID || '',
    json: args.has('json') || env.METRICS_JSON === '1'
  }
}

function loadMetricsInput(inputPath) {
  if (!inputPath) throw new Error('缺少 METRICS_INPUT，请指定包含 reports / papers / feedback 的 JSON 文件')
  const resolved = path.resolve(inputPath)
  return JSON.parse(fs.readFileSync(resolved, 'utf8'))
}

function runCli({ env = process.env, argv = process.argv.slice(2), stdout = process.stdout, stderr = process.stderr } = {}) {
  try {
    const config = parseMetricsConfig({ env, argv })
    const input = loadMetricsInput(config.inputPath)
    const metrics = deriveLearningMetrics(input, { studentId: config.studentId })
    stdout.write(config.json ? `${JSON.stringify(metrics, null, 2)}\n` : `${formatMetricsSummary(metrics)}\n`)
    return 0
  } catch (error) {
    stderr.write(`${error.message || error}\n`)
    return 1
  }
}

if (require.main === module) {
  process.exitCode = runCli()
}

module.exports = {
  deriveLearningMetrics,
  formatMetricsSummary,
  parseMetricsConfig,
  loadMetricsInput,
  runCli
}

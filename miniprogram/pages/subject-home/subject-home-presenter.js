const { formatBottleneckDisplayName } = require('../../utils/util')

const STATUS_META = {
  persisting: { text: '持续出现', className: 'persisting', icon: '!' },
  needs_verification: { text: '需要验证', className: 'pending', icon: '?' },
  improved: { text: '已有改善', className: 'improved', icon: '✓' }
}

const SEVERITY_TEXT = {
  high: '高优先级',
  medium: '中等优先级',
  low: '低优先级'
}

const STATUS_PRIORITY = { persisting: 0, needs_verification: 1, improved: 2 }
const SEVERITY_PRIORITY = { high: 0, medium: 1, low: 2 }

function normalizeBottlenecks(profile = {}) {
  if (Array.isArray(profile.currentBottlenecks)) return profile.currentBottlenecks
  return [
    ...(profile.pendingBottlenecks || []).map(item => ({ ...item, status: 'needs_verification' })),
    ...(profile.improvedBottlenecks || []).map(item => ({ ...item, status: 'improved' }))
  ]
}

function buildEvidenceText(item) {
  const evidence = Number(item.errorCount || item.relatedErrorCount || item.evidenceCount || 0)
  return evidence > 0 ? `相关错题 ${evidence}` : '等待验证'
}

function buildBottleneckDetail(item, displayName) {
  const evidenceText = buildEvidenceText(item)
  const severityText = SEVERITY_TEXT[item.severity] || ''

  if (item.status === 'persisting') {
    return [`${displayName}在不同记录中再次出现`, evidenceText, severityText].filter(Boolean).join(' · ')
  }
  if (item.status === 'improved') {
    return [`${displayName}已通过验证`, '继续观察巩固'].filter(Boolean).join(' · ')
  }
  return [`建议用验证题确认${displayName}`, evidenceText, severityText].filter(Boolean).join(' · ')
}

function enrichBottleneck(item) {
  const meta = STATUS_META[item.status] || STATUS_META.needs_verification
  const displayName = formatBottleneckDisplayName(item)
  return {
    ...item,
    displayName,
    detailText: buildBottleneckDetail(item, displayName),
    evidenceText: buildEvidenceText(item),
    severityText: SEVERITY_TEXT[item.severity] || '',
    statusText: meta.text,
    statusClass: meta.className,
    statusIcon: meta.icon
  }
}

function compareBottlenecks(a, b) {
  const statusDiff = (STATUS_PRIORITY[a.status] ?? 3) - (STATUS_PRIORITY[b.status] ?? 3)
  if (statusDiff !== 0) return statusDiff
  return (SEVERITY_PRIORITY[a.severity] ?? 3) - (SEVERITY_PRIORITY[b.severity] ?? 3)
}

function getEffectiveReports(reports = []) {
  return reports
    .filter(report => report.status === 'completed' && (
      report.isEffective === undefined || report.isEffective === true
    ))
    .slice()
    .sort((a, b) => new Date(b.createdAt || 0) - new Date(a.createdAt || 0))
}

function buildRecentChanges(reports, formatRelativeTime) {
  return getEffectiveReports(reports)
    .slice(0, 3)
    .map(report => ({
      _id: report._id,
      title: report.changeSummary || report.comparisonSummary || report.summary || '查看本次诊断报告',
      dateText: formatRelativeTime(report.createdAt),
      type: report.type || 'diagnosis'
    }))
}

function buildPrimaryTask(subjectName, taskQueue, hasDiagnosis) {
  if (taskQueue.length > 0) {
    return {
      title: '下一步建议',
      summary: `${taskQueue.length} 个学习卡点等待验证，建议先做一张纸质验证卷。`,
      actionText: '生成验证试卷',
      actionType: 'verification'
    }
  }

  if (hasDiagnosis) {
    return {
      title: '下一步建议',
      summary: `${subjectName}暂时没有待验证卡点，可以上传新试卷继续观察。`,
      actionText: '拍照诊断',
      actionType: 'diagnosis'
    }
  }

  return {
    title: '先建立学科记录',
    summary: `上传第一份${subjectName}试卷，整理可以追踪的学习卡点。`,
    actionText: '拍照诊断',
    actionType: 'diagnosis'
  }
}

function buildTools(latestReport) {
  return [
    {
      key: 'diagnosis',
      title: '拍照诊断',
      desc: '上传新的试卷或练习',
      icon: '⌾',
      actionType: 'diagnosis'
    },
    {
      key: 'defaultPaper',
      title: '默认试卷',
      desc: '没有新试卷时使用',
      icon: '□',
      actionType: 'defaultPaper'
    },
    {
      key: 'history',
      title: '学习记录',
      desc: '照片、报告和试卷',
      icon: '▧',
      actionType: 'history'
    },
    latestReport ? {
      key: 'latestReport',
      title: '完整报告',
      desc: '查看最近诊断详情',
      icon: '≡',
      actionType: 'latestReport',
      reportId: latestReport._id
    } : null
  ].filter(Boolean)
}

function buildSubjectHomeView(profile = {}, reports = [], formatRelativeTime = () => '', options = {}) {
  const subjectName = options.subjectName || profile.subjectName || '数学'
  const currentBottlenecks = normalizeBottlenecks(profile).map(enrichBottleneck)
  const taskQueue = currentBottlenecks
    .filter(item => item.status !== 'improved')
    .slice()
    .sort(compareBottlenecks)
  const recentChanges = buildRecentChanges(reports, formatRelativeTime)
  const latestReport = getEffectiveReports(reports)[0] || null
  const hasDiagnosis = currentBottlenecks.length > 0 || recentChanges.length > 0
  const primaryTask = buildPrimaryTask(subjectName, taskQueue, hasDiagnosis)

  return {
    subjectTitle: `${subjectName}工作台`,
    totalReports: profile.totalReports || reports.filter(item => item.status === 'completed').length,
    currentSummary: primaryTask.summary,
    nextAction: primaryTask.actionText,
    primaryTask,
    taskQueue,
    tools: buildTools(latestReport),
    latestReportId: latestReport ? latestReport._id : '',
    currentBottlenecks,
    recentChanges,
    persistingCount: currentBottlenecks.filter(item => item.status === 'persisting').length,
    pendingCount: currentBottlenecks.filter(item => item.status === 'needs_verification').length,
    improvedCount: currentBottlenecks.filter(item => item.status === 'improved').length,
    hasDiagnosis,
    isFirstUse: !hasDiagnosis
  }
}

module.exports = { buildSubjectHomeView, normalizeBottlenecks, buildBottleneckDetail }

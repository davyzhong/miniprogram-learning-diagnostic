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

function normalizeBottlenecks(profile = {}) {
  if (Array.isArray(profile.currentBottlenecks)) return profile.currentBottlenecks
  return [
    ...(profile.pendingBottlenecks || []).map(item => ({ ...item, status: 'needs_verification' })),
    ...(profile.improvedBottlenecks || []).map(item => ({ ...item, status: 'improved' }))
  ]
}

function buildBottleneckDetail(item, displayName) {
  const evidence = Number(item.errorCount || item.relatedErrorCount || 0)
  const evidenceText = evidence > 0 ? `${evidence} 道相关错题` : ''
  const severityText = SEVERITY_TEXT[item.severity] || ''

  if (item.status === 'persisting') {
    return [`${displayName}在不同记录中再次出现`, evidenceText, severityText].filter(Boolean).join(' · ')
  }
  if (item.status === 'improved') {
    return [`${displayName}已通过验证`, '继续观察巩固'].filter(Boolean).join(' · ')
  }
  return [`建议用验证题确认${displayName}是否稳定出现`, evidenceText, severityText].filter(Boolean).join(' · ')
}

function buildSubjectHomeView(profile = {}, reports = [], formatRelativeTime = () => '') {
  const currentBottlenecks = normalizeBottlenecks(profile).map(item => {
    const meta = STATUS_META[item.status] || STATUS_META.needs_verification
    const displayName = formatBottleneckDisplayName(item)
    return {
      ...item,
      displayName,
      detailText: buildBottleneckDetail(item, displayName),
      statusText: meta.text,
      statusClass: meta.className,
      statusIcon: meta.icon
    }
  })
  const recentChanges = reports
    .filter(report => report.status === 'completed' && (
      report.isEffective === undefined || report.isEffective === true
    ))
    .slice(0, 3)
    .map(report => ({
      _id: report._id,
      title: report.changeSummary || report.comparisonSummary || report.summary || '查看本次诊断报告',
      dateText: formatRelativeTime(report.createdAt),
      type: report.type || 'diagnosis'
    }))
  const hasDiagnosis = currentBottlenecks.length > 0 || recentChanges.length > 0

  return {
    totalReports: profile.totalReports || reports.filter(item => item.status === 'completed').length,
    currentSummary: profile.currentSummary || (
      hasDiagnosis ? '已整理当前学习卡点，建议按优先顺序继续验证。' : '上传第一份数学试卷，开始整理学习卡点。'
    ),
    nextAction: profile.nextAction || (hasDiagnosis ? '生成验证试卷' : '拍照诊断'),
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

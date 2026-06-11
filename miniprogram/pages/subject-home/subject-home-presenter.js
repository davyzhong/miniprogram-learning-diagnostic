const STATUS_META = {
  persisting: { text: '持续出现', className: 'persisting', icon: '!' },
  needs_verification: { text: '需要验证', className: 'pending', icon: '?' },
  improved: { text: '已有改善', className: 'improved', icon: '✓' }
}

function normalizeBottlenecks(profile = {}) {
  if (Array.isArray(profile.currentBottlenecks)) return profile.currentBottlenecks
  return [
    ...(profile.pendingBottlenecks || []).map(item => ({ ...item, status: 'needs_verification' })),
    ...(profile.improvedBottlenecks || []).map(item => ({ ...item, status: 'improved' }))
  ]
}

function buildSubjectHomeView(profile = {}, reports = [], formatRelativeTime = () => '') {
  const currentBottlenecks = normalizeBottlenecks(profile).map(item => ({
    ...item,
    statusText: (STATUS_META[item.status] || STATUS_META.needs_verification).text,
    statusClass: (STATUS_META[item.status] || STATUS_META.needs_verification).className,
    statusIcon: (STATUS_META[item.status] || STATUS_META.needs_verification).icon
  }))
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

module.exports = { buildSubjectHomeView, normalizeBottlenecks }

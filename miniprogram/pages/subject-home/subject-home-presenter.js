const {
  buildBottleneckViews,
  buildBottleneckStats,
  profileBottlenecks
} = require('../../utils/bottleneck-view')

const SEVERITY_WEIGHT = { high: 80, medium: 55, low: 25 }

function normalizeWeight(item = {}) {
  if (item.weight !== undefined && item.weight !== null) return item.weight
  return SEVERITY_WEIGHT[item.severity] || 0
}

function buildBottleneckDetail(item) {
  const displayName = item.displayName || ''
  const evidenceText = item.evidenceText || '等待补充证据'
  const priorityText = item.priorityText || ''

  if (item.status === 'persisting') {
    return [`${displayName}在不同记录中再次出现`, evidenceText, priorityText].filter(Boolean).join(' · ')
  }
  if (item.status === 'improved') {
    return [`${displayName}已通过验证`, '继续观察巩固'].filter(Boolean).join(' · ')
  }
  return [`建议用验证题确认${displayName}`, evidenceText, priorityText].filter(Boolean).join(' · ')
}

function buildSubjectBottleneckViews(profile = {}, options = {}) {
  return buildBottleneckViews(profileBottlenecks(profile).map(item => ({
    ...item,
    weight: normalizeWeight(item),
    subject: options.subject || profile.subject || item.subject || '',
    subjectName: options.subjectName || profile.subjectName || item.subjectName || ''
  }))).map(item => ({
    ...item,
    detailText: buildBottleneckDetail(item)
  }))
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

function buildPrimaryTask(subjectName, taskQueue, hasDiagnosis, permissions = {}) {
  const canWrite = permissions.canUpload !== false || permissions.canGeneratePaper !== false
  if (!canWrite) {
    return {
      title: '当前可查看',
      summary: `${subjectName}学习资料已开放给你查看，上传和生成试卷由档案创建者操作。`,
      actionText: '查看学习记录',
      actionType: 'history'
    }
  }

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

function buildTools(latestReport, permissions = {}) {
  const canWrite = permissions.canUpload !== false || permissions.canGeneratePaper !== false
  return [
    canWrite ? {
      key: 'diagnosis',
      title: '拍照诊断',
      desc: '上传新的试卷或练习',
      icon: '⌾',
      actionType: 'diagnosis'
    } : null,
    canWrite ? {
      key: 'defaultPaper',
      title: '默认试卷',
      desc: '没有新试卷时使用',
      icon: '□',
      actionType: 'defaultPaper'
    } : null,
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
  const permissions = options.permissions || {}
  const currentBottlenecks = buildSubjectBottleneckViews(profile, {
    subject: options.subject,
    subjectName
  })
  const taskQueue = currentBottlenecks.filter(item => item.status !== 'improved')
  const bottleneckStats = buildBottleneckStats(currentBottlenecks)
  const recentChanges = buildRecentChanges(reports, formatRelativeTime)
  const latestReport = getEffectiveReports(reports)[0] || null
  const hasDiagnosis = currentBottlenecks.length > 0 || recentChanges.length > 0
  const primaryTask = buildPrimaryTask(subjectName, taskQueue, hasDiagnosis, permissions)

  return {
    subjectTitle: `${subjectName}工作台`,
    totalReports: profile.totalReports || reports.filter(item => item.status === 'completed').length,
    currentSummary: primaryTask.summary,
    nextAction: primaryTask.actionText,
    primaryTask,
    taskQueue,
    tools: buildTools(latestReport, permissions),
    permissions,
    canWriteActions: permissions.canUpload !== false || permissions.canGeneratePaper !== false,
    latestReportId: latestReport ? latestReport._id : '',
    currentBottlenecks,
    bottleneckStats,
    recentChanges,
    persistingCount: bottleneckStats.persistingCount,
    pendingCount: bottleneckStats.pendingCount,
    improvedCount: bottleneckStats.improvedCount,
    hasDiagnosis,
    isFirstUse: !hasDiagnosis
  }
}

module.exports = {
  buildSubjectHomeView,
  normalizeBottlenecks: profileBottlenecks,
  buildBottleneckDetail,
  buildSubjectBottleneckViews
}

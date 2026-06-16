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

function hasEnglishVocabulary(options = {}) {
  const summary = options.englishVocabulary && options.englishVocabulary.summary
  return options.subject === 'english' && summary && Number(summary.totalWords) > 0
}

function toSafeCount(value) {
  const count = Number(value)
  return Number.isFinite(count) ? count : 0
}

function buildEnglishPrimaryTask(options = {}, permissions = {}) {
  const canWrite = permissions.canUpload !== false || permissions.canGeneratePaper !== false
  const summary = options.englishVocabulary && options.englishVocabulary.summary || {}
  const familiarity = summary.familiarity || {}
  const spelling = summary.spelling || {}
  const totalWords = toSafeCount(summary.totalWords)
  const scheduledCount = (
    toSafeCount(familiarity.dueReviewCount) +
    toSafeCount(familiarity.needsPracticeCount) +
    toSafeCount(spelling.dueReviewCount) +
    toSafeCount(spelling.needsPracticeCount)
  )
  const newWordCount = Math.max(
    toSafeCount(summary.untestedCount),
    toSafeCount(familiarity.untestedCount),
    toSafeCount(spelling.untestedCount)
  )
  const todayCount = Math.min(20, scheduledCount + newWordCount || totalWords || 0)
  if (!canWrite) {
    return {
      title: '当前可查看',
      summary: `已整理 ${totalWords} 个英语单词，可查看听写记录和掌握情况。`,
      actionText: '查看学习记录',
      actionType: 'history'
    }
  }
  if (totalWords === 0) {
    return {
      title: '个人词库准备中',
      summary: '系统会自动导入钟青羽的 PEP 三年级到六年级个人单词表。完成后，这里会直接进入单词熟悉度和纸面听写。',
      actionText: '查看学习记录',
      actionType: 'history'
    }
  }
  return {
    title: '今日单词熟悉度',
    summary: `从 ${totalWords} 个个人词库单词中安排 ${todayCount || 20} 个，先练“听到中文说英文、听到英文说中文”的熟悉度。`,
    actionText: '开始单词熟悉度',
    actionType: 'englishPractice'
  }
}

function buildEnglishEmptyTask(permissions = {}) {
  const canWrite = permissions.canUpload !== false || permissions.canGeneratePaper !== false
  return {
    title: '先准备个人词库',
    summary: '导入 PEP 单词表后，这里会按掌握度安排每日听写。',
    actionText: canWrite ? '开始 20 词听写' : '查看学习记录',
    actionType: canWrite ? 'englishPractice' : 'history'
  }
}

function buildEnglishVocabularyStats(vocabulary = {}) {
  const safeVocabulary = vocabulary || {}
  const summary = safeVocabulary.summary || {}
  const familiarity = summary.familiarity || {}
  const spelling = summary.spelling || {}
  const overall = summary.overall || {}
  return {
    totalWords: toSafeCount(summary.totalWords),
    needsPracticeCount: toSafeCount(summary.needsPracticeCount),
    reviewingCount: toSafeCount(summary.reviewingCount),
    masteredCount: toSafeCount(summary.masteredCount),
    untestedCount: toSafeCount(summary.untestedCount),
    dueReviewCount: toSafeCount(summary.dueReviewCount),
    familiarityMasteredCount: toSafeCount(familiarity.masteredCount) || toSafeCount(summary.masteredCount),
    familiarityNeedsPracticeCount: toSafeCount(familiarity.needsPracticeCount) || toSafeCount(summary.needsPracticeCount),
    familiarityDueReviewCount: toSafeCount(familiarity.dueReviewCount) || toSafeCount(summary.dueReviewCount),
    familiarityUntestedCount: toSafeCount(familiarity.untestedCount),
    familiarityReviewingCount: toSafeCount(familiarity.reviewingCount),
    spellingNeedsPracticeCount: toSafeCount(spelling.needsPracticeCount),
    spellingDueReviewCount: toSafeCount(spelling.dueReviewCount),
    spellingUntestedCount: toSafeCount(spelling.untestedCount),
    spellingReviewingCount: toSafeCount(spelling.reviewingCount),
    overallMasteredCount: toSafeCount(overall.masteredCount) || toSafeCount(summary.masteredCount),
    overallPartialCount: toSafeCount(overall.partialCount),
    patternCount: toSafeCount(safeVocabulary.patternCount),
    weakWords: safeVocabulary.weakWords || []
  }
}

function buildEnglishQuickStats(stats) {
  const scheduledCount = (
    stats.familiarityDueReviewCount +
    stats.spellingDueReviewCount +
    stats.familiarityNeedsPracticeCount +
    stats.spellingNeedsPracticeCount
  )
  const newWordCount = Math.max(
    stats.untestedCount,
    stats.familiarityUntestedCount,
    stats.spellingUntestedCount
  )
  const todayCount = Math.min(20, scheduledCount + newWordCount)
  return [
    { key: 'today', label: '今日待练', value: todayCount || 0 },
    { key: 'familiarity', label: '已熟悉', value: stats.familiarityMasteredCount },
    { key: 'spellingWeak', label: '拼写薄弱', value: stats.spellingNeedsPracticeCount },
    { key: 'mastered', label: '真正掌握', value: stats.overallMasteredCount }
  ]
}

function buildTools(latestReport, permissions = {}, options = {}) {
  const canWrite = permissions.canUpload !== false || permissions.canGeneratePaper !== false
  if (options.subject === 'english') {
    return [
      canWrite ? {
        key: 'englishPractice',
        title: '单词熟悉度',
        desc: hasEnglishVocabulary(options) ? '听中文说英文，听英文说中文' : '词库导入后即可开始',
        icon: 'Aa',
        actionType: 'englishPractice'
      } : null,
      canWrite ? {
        key: 'englishDictation',
        title: '纸面听写',
        desc: hasEnglishVocabulary(options) ? 'AI 读词，孩子写在纸上' : '词库导入后即可开始',
        icon: '✎',
        actionType: 'englishDictation'
      } : null,
      {
        key: 'history',
        title: '学习记录',
        desc: '听写、词库和掌握变化',
        icon: '▧',
        actionType: 'history'
      },
      canWrite && !hasEnglishVocabulary(options) ? {
        key: 'importVocabulary',
        title: '词库维护',
        desc: '自动导入异常时使用',
        icon: '↓',
        actionType: 'importVocabulary'
      } : null
    ].filter(Boolean)
  }
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
  const englishVocabularyStats = buildEnglishVocabularyStats(options.englishVocabulary)
  const englishQuickStats = buildEnglishQuickStats(englishVocabularyStats)
  const primaryTask = options.subject === 'english'
    ? buildEnglishPrimaryTask(options, permissions)
    : buildPrimaryTask(subjectName, taskQueue, hasDiagnosis, permissions)

  return {
    subjectTitle: `${subjectName}工作台`,
    totalReports: profile.totalReports || reports.filter(item => item.status === 'completed').length,
    currentSummary: primaryTask.summary,
    nextAction: primaryTask.actionText,
    primaryTask,
    taskQueue: options.subject === 'english' ? [] : taskQueue,
    tools: buildTools(latestReport, permissions, options),
    permissions,
    canWriteActions: permissions.canUpload !== false || permissions.canGeneratePaper !== false,
    latestReportId: latestReport ? latestReport._id : '',
    currentBottlenecks: options.subject === 'english' ? [] : currentBottlenecks,
    bottleneckStats,
    recentChanges,
    persistingCount: bottleneckStats.persistingCount,
    pendingCount: bottleneckStats.pendingCount,
    improvedCount: bottleneckStats.improvedCount,
    hasDiagnosis: options.subject === 'english' ? hasEnglishVocabulary(options) : hasDiagnosis,
    isFirstUse: options.subject === 'english' ? !hasEnglishVocabulary(options) : (!hasDiagnosis && !hasEnglishVocabulary(options)),
    englishVocabularyStats,
    englishQuickStats,
    hasEnglishVocabulary: hasEnglishVocabulary(options)
  }
}

module.exports = {
  buildSubjectHomeView,
  normalizeBottlenecks: profileBottlenecks,
  buildBottleneckDetail,
  buildSubjectBottleneckViews,
  buildEnglishVocabularyStats
}

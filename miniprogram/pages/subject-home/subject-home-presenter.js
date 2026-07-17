const {
  buildBottleneckViews,
  buildBottleneckStats,
  profileBottlenecks
} = require('../../utils/bottleneck-view')
const { subjectIllustrationOf } = require('../../utils/page-illustrations')
const { sanitizeUserText } = require('../../utils/user-facing-text')
const { symbolOf, subjectSymbolOf } = require('../../utils/ui-symbols')
const { buildStatusSegments } = require('../../utils/status-segments')

const SEVERITY_WEIGHT = { high: 80, medium: 55, low: 25 }
const CHINESE_REVIEW_TYPE_LABELS = {
  character: '汉字',
  word: '词语',
  pinyin: '拼音',
  poem: '古诗文',
  idiom: '成语',
  daily_accumulation: '日积月累',
  reading_skill: '阅读能力',
  writing_skill: '表达能力'
}
const CHINESE_REVIEW_STATUS_WEIGHT = {
  recurring: 100,
  needs_review: 80,
  reviewing: 60,
  pending: 50
}
const CHINESE_REVIEW_STAGE_TEXT = {
  initial: '原项复测',
  reinforce: '巩固复测',
  consolidate: '迁移观察'
}
const CHINESE_DIRECT_METHOD_TEXT = {
  dictation: '听写',
  pinyin_to_word: '看拼音写词语',
  context_fill: '语境填空',
  character_to_pinyin: '给汉字注音',
  pronunciation_choice: '读音辨析',
  poem_fill: '补写原句',
  idiom_fill: '补全成语'
}

function normalizeWeight(item = {}) {
  if (item.weight !== undefined && item.weight !== null) return item.weight
  return SEVERITY_WEIGHT[item.severity] || 0
}

function cleanText(value) {
  return String(value || '').trim()
}

function isActiveChineseReviewItem(item = {}) {
  return !['mastered', 'archived', 'ignored'].includes(item.status)
}

function chineseReviewTitleOf(item = {}) {
  return cleanText(item.targetText)
    || cleanText(item.expectedAnswer)
    || cleanText(item.sourceContext)
    || '待复测错项'
}

function buildChineseReviewDetail(item = {}) {
  const passed = Math.max(0, Number(item.reviewPassCount) || 0)
  const stage = item.status === 'recurring' || Number(item.reviewFailCount) > 0
    ? 'initial'
    : (passed >= 2 ? 'consolidate' : (passed >= 1 ? 'reinforce' : 'initial'))
  const directMethod = CHINESE_DIRECT_METHOD_TEXT[item.directMethod]
    || (stage === 'initial' ? '原项听写' : '原项复测')
  const parts = [
    `${CHINESE_REVIEW_STAGE_TEXT[stage]} · ${directMethod}`,
    item.lastWrongAnswer || item.studentAnswer ? `上次写成：${item.lastWrongAnswer || item.studentAnswer}` : '',
    item.sourceContext ? `语境：${item.sourceContext}` : '',
    item.evidenceCount ? `${item.evidenceCount} 次证据` : ''
  ].filter(Boolean)
  return parts.length > 0 ? parts.join(' · ') : '建议在验证卷中直接复测这个错项'
}

function buildChineseReviewQueue(profile = {}) {
  return (profile.chineseReviewItems || [])
    .filter(isActiveChineseReviewItem)
    .map((item, index) => {
      const displayName = chineseReviewTitleOf(item)
      const status = item.status || 'needs_review'
      return {
        ...item,
        viewId: item.itemId || `chinese-review-${index + 1}`,
        reviewItemId: item.itemId || item.id || '',
        displayName,
        typeText: CHINESE_REVIEW_TYPE_LABELS[item.itemType] || cleanText(item.itemType) || '语文错项',
        detailText: buildChineseReviewDetail(item),
        reviewStageText: CHINESE_REVIEW_STAGE_TEXT[
          item.status === 'recurring' || Number(item.reviewFailCount) > 0
            ? 'initial'
            : (Number(item.reviewPassCount) >= 2 ? 'consolidate' : (Number(item.reviewPassCount) >= 1 ? 'reinforce' : 'initial'))
        ],
        statusText: status === 'recurring' ? '反复出现' : (status === 'reviewing' ? '复测中' : '待复测'),
        statusClass: status === 'recurring' ? 'persisting' : 'pending',
        statusIcon: status === 'recurring' ? '持续' : '待验证',
        weight: CHINESE_REVIEW_STATUS_WEIGHT[status] || 40
      }
    })
    .filter(item => item.displayName)
    .sort((a, b) => (b.weight || 0) - (a.weight || 0) || (b.evidenceCount || 0) - (a.evidenceCount || 0))
}

function buildBottleneckDetail(item) {
  const displayName = item.displayName || ''
  const evidenceText = item.evidenceText || '等待补充证据'
  // 置信度标签统一来自 buildConfidence（buildBottleneckView 已挂载到 item 上）
  const confidenceText = item.confidenceLabel || ''

  if (item.status === 'persisting') {
    return [`${displayName}在不同记录中再次出现`, evidenceText, confidenceText].filter(Boolean).join(' · ')
  }
  if (item.status === 'improved') {
    return [`${displayName}已通过验证`, '继续观察巩固'].filter(Boolean).join(' · ')
  }
  return [`建议用验证题确认${displayName}`, evidenceText, confidenceText].filter(Boolean).join(' · ')
}

function buildSubjectBottleneckViews(profile = {}, options = {}) {
  const subject = options.subject || profile.subject || ''
  return buildBottleneckViews(profileBottlenecks(profile).map(item => ({
    ...item,
    weight: normalizeWeight(item),
    subject: subject || item.subject || '',
    subjectName: options.subjectName || profile.subjectName || item.subjectName || ''
  })), {
    subject,
    subjectName: options.subjectName || profile.subjectName || '',
    expandCandidates: subject === 'math'
  }).map(item => ({
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

function getFormalDiagnosisReports(reports = []) {
  return getEffectiveReports(reports).filter(report => (
    (report.type || 'diagnosis') === 'diagnosis'
    && report.archived !== true
  ))
}

function buildLatestDiagnosis(report, subject, subjectName, formatRelativeTime) {
  if (!report) return null
  const bottlenecks = Array.isArray(report.bottlenecks) ? report.bottlenecks : []
  const subjectMarker = { math: '数学', chinese: '语文', english: '英语' }
  return {
    reportId: report._id,
    marker: subjectMarker[subject] || '诊断',
    title: `最新${subjectName}诊断`,
    dateText: formatRelativeTime(report.createdAt),
    summary: sanitizeUserText(
      report.changeSummary || report.comparisonSummary || report.summary || '查看本次正式诊断结论',
      { treatAsId: true, count: bottlenecks.length, noun: '学习卡点' }
    ),
    evidenceCount: Number(report.totalErrors) || 0,
    persistingCount: bottlenecks.filter(item => ['persisting', 'worsened'].includes(item.status)).length,
    improvedCount: bottlenecks.filter(item => item.status === 'improved').length
  }
}

function buildRecentChanges(reports, formatRelativeTime) {
  return getEffectiveReports(reports)
    .slice(0, 3)
    .map(report => ({
      _id: report._id,
      title: sanitizeUserText(
        report.changeSummary || report.comparisonSummary || report.summary || '查看本次诊断报告',
        { treatAsId: true, count: (report.bottlenecks || []).length, noun: '学习卡点' }
      ),
      dateText: formatRelativeTime(report.createdAt),
      type: report.type || 'diagnosis'
    }))
}

function buildPrimaryTask(subjectName, taskQueue, hasDiagnosis, permissions = {}, options = {}) {
  const canWrite = permissions.canUpload !== false || permissions.canGeneratePaper !== false
  const chineseReviewQueue = options.chineseReviewQueue || []
  if (!canWrite) {
    return {
      title: '当前可查看',
      summary: `${subjectName}学习资料已开放给你查看，上传和下载验证卷由档案创建者操作。`,
      actionText: '查看学习记录',
      actionType: 'history'
    }
  }

  if (options.subject === 'chinese' && chineseReviewQueue.length > 0) {
    return {
      title: '下一步建议',
      summary: `${chineseReviewQueue.length} 个具体错项等待复测，系统会根据诊断报告自动准备语文错项复测卷。`,
      actionText: '查看/下载验证卷',
      actionType: 'verification'
    }
  }

  if (taskQueue.length > 0) {
    return {
      title: '下一步建议',
      summary: `${taskQueue.length} 个学习卡点等待验证，验证卷准备好后可下载打印。`,
      actionText: '查看/下载验证卷',
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
  const todayPlan = options.englishTodayPlan || {}
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
  const todayCount = Math.min(20, (scheduledCount + newWordCount) || totalWords || 0)
  if (!canWrite) {
    return {
      title: '当前可查看',
      summary: `已整理 ${totalWords} 个英语单词，可查看听写记录和掌握情况。`,
      actionText: '查看学习记录',
      actionType: 'history',
      recommendedMode: 'history'
    }
  }
  if (totalWords === 0) {
    return {
      title: '正在准备词库',
      summary: '系统会自动导入孩子的个人单词表。完成后，首页会直接显示认词练习和纸面听写入口。',
      actionText: '查看学习记录',
      actionType: 'history',
      recommendedMode: 'preparing'
    }
  }
  const familiarityLoad = toSafeCount(familiarity.needsPracticeCount) + toSafeCount(familiarity.dueReviewCount)
  const spellingLoad = toSafeCount(spelling.needsPracticeCount) + toSafeCount(spelling.dueReviewCount)
  const recommendSpelling = spellingLoad > familiarityLoad && spellingLoad > 0
  const recommendedMode = recommendSpelling ? 'spelling' : 'familiarity'
  const actionType = recommendSpelling ? 'englishDictation' : 'englishPractice'
  const modeText = recommendSpelling ? '纸面听写' : '认词练习'
  return {
    title: '今日英语',
    summary: todayPlan.primaryAction && todayPlan.primaryAction.title
      ? `${todayPlan.primaryAction.title} · 约 ${todayPlan.primaryAction.estimatedMinutes || 5} 分钟`
      : `从 ${totalWords} 个个人词库单词中安排 ${todayCount || 20} 个，今天建议先做${modeText}。`,
    actionText: recommendSpelling ? '开始纸面听写' : '开始认词练习',
    actionType,
    recommendedMode,
    taskSize: todayPlan.primaryAction && todayPlan.primaryAction.taskSize || Math.min(10, todayCount || 5)
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

function buildEnglishActionCards(stats, primaryTask = {}, options = {}, permissions = {}) {
  const canWrite = permissions.canUpload !== false || permissions.canGeneratePaper !== false
  const hasVocabularyReady = hasEnglishVocabulary(options)
  const preparing = !hasVocabularyReady && primaryTask.recommendedMode === 'preparing'
  const baseCards = [
    {
      key: 'englishPractice',
      actionType: 'englishPractice',
      title: '认词练习',
      subtitle: '看中文或英文，说出对应内容',
      meta: stats.familiarityNeedsPracticeCount > 0
        ? `${stats.familiarityNeedsPracticeCount} 个不熟词优先出现`
        : '默认 20 词，适合每天快速过一遍',
      icon: symbolOf('ear'),
      actionText: '开始认词',
      recommended: primaryTask.actionType === 'englishPractice',
      disabled: !canWrite || !hasVocabularyReady,
      disabledText: preparing ? '词库准备中' : '暂无词库'
    },
    {
      key: 'englishDictation',
      actionType: 'englishDictation',
      title: '纸面听写',
      subtitle: '纸上写英文，完成后拍照识别',
      meta: stats.spellingNeedsPracticeCount > 0
        ? `${stats.spellingNeedsPracticeCount} 个拼写薄弱词优先出现`
        : '默认 20 词，验证是否真正写得出',
      icon: symbolOf('writing'),
      actionText: '开始听写',
      recommended: primaryTask.actionType === 'englishDictation',
      disabled: !canWrite || !hasVocabularyReady,
      disabledText: preparing ? '词库准备中' : '暂无词库'
    }
  ]

  return baseCards.map(card => ({
    ...card,
    badgeText: card.recommended ? '今日建议' : ''
  }))
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

// 词库构成堆叠条：绿=真正掌握 / 红=待练习 / 金=待复习 / 灰=未测（数据来自 buildEnglishVocabularyStats）
function buildEnglishVocabSegments(stats) {
  return buildStatusSegments([
    { key: 'mastered', label: `掌握 ${stats.overallMasteredCount}`, count: stats.overallMasteredCount, tone: 'improved' },
    { key: 'needsPractice', label: `待练 ${stats.needsPracticeCount}`, count: stats.needsPracticeCount, tone: 'destructive' },
    { key: 'dueReview', label: `待复习 ${stats.dueReviewCount}`, count: stats.dueReviewCount, tone: 'waiting' },
    { key: 'untested', label: `未测 ${stats.untestedCount}`, count: stats.untestedCount, tone: 'neutral' }
  ])
}

function buildTools(permissions = {}, options = {}, stats = {}) {
  const canWrite = permissions.canUpload !== false || permissions.canGeneratePaper !== false
  if (options.subject === 'english') {
    const hasVocabularyReady = hasEnglishVocabulary(options)
    return [
      {
        key: 'englishWrongWords',
        title: '错词本',
        desc: hasVocabularyReady ? '薄弱词、待复测和会认不会写' : '词库准备后自动生成',
        icon: symbolOf('bookRed'),
        actionType: 'englishWrongWords'
      },
      stats.patternCount > 0 ? {
        key: 'englishConfusion', title: '易混词巩固', desc: '用短题区分容易混淆的单词', icon: symbolOf('puzzle'), actionType: 'englishConfusion'
      } : null,
      {
        key: 'history',
        title: '学习记录',
        desc: '认词、听写和照片证据',
        icon: symbolOf('learningRecords'),
        actionType: 'history'
      },
      canWrite && !hasVocabularyReady ? {
        key: 'importVocabulary',
        title: '重试导入词库',
        desc: '自动导入失败时使用',
        icon: symbolOf('save'),
        actionType: 'importVocabulary'
      } : null
    ].filter(Boolean)
  }
  return [
    canWrite ? {
      key: 'diagnosis',
      title: '拍照诊断',
      desc: '上传新的试卷或练习',
      icon: symbolOf('camera'),
      actionType: 'diagnosis'
    } : null,
    canWrite ? {
      key: 'defaultPaper',
      title: '默认试卷',
      desc: '没有新试卷时使用',
      icon: symbolOf('paper'),
      actionType: 'defaultPaper'
    } : null,
    {
      key: 'history',
      title: '学习记录',
      desc: '照片、报告和试卷',
      icon: symbolOf('learningRecords'),
      actionType: 'history'
    }
  ].filter(Boolean)
}

function buildSubjectHomeView(profile = {}, reports = [], formatRelativeTime = () => '', options = {}) {
  const subjectName = options.subjectName || profile.subjectName || '数学'
  const subject = options.subject || profile.subject || ''
  const permissions = options.permissions || {}
  const currentBottlenecks = buildSubjectBottleneckViews(profile, {
    subject,
    subjectName
  })
  const taskQueue = currentBottlenecks.filter(item => item.status !== 'improved')
  const chineseReviewQueue = options.subject === 'chinese' ? buildChineseReviewQueue(profile) : []
  const bottleneckStats = buildBottleneckStats(currentBottlenecks)
  const recentChanges = buildRecentChanges(reports, formatRelativeTime)
  const latestReport = getFormalDiagnosisReports(reports)[0] || null
  const latestDiagnosis = buildLatestDiagnosis(latestReport, subject, subjectName, formatRelativeTime)
  const hasDiagnosis = currentBottlenecks.length > 0 || chineseReviewQueue.length > 0 || recentChanges.length > 0
  const englishVocabularyStats = buildEnglishVocabularyStats(options.englishVocabulary)
  const englishQuickStats = buildEnglishQuickStats(englishVocabularyStats)
  const primaryTask = options.subject === 'english'
    ? buildEnglishPrimaryTask(options, permissions)
    : buildPrimaryTask(subjectName, taskQueue, hasDiagnosis, permissions, {
      subject: options.subject,
      chineseReviewQueue
    })
  if (options.subject === 'chinese' && chineseReviewQueue.length === 0 && taskQueue.length > 0) {
    primaryTask.title = '今日语文'
    primaryTask.summary = '完成一个阅读表达小任务，把方法练得更稳。'
    primaryTask.actionText = '开始语文小任务'
    primaryTask.actionType = 'chineseSkillTask'
  }
  const englishActionCards = options.subject === 'english'
    ? buildEnglishActionCards(englishVocabularyStats, primaryTask, options, permissions)
    : []

  return {
    subjectTitle: options.subject === 'english' ? '英语词汇掌握' : `${subjectName}工作台`,
    subjectIllustration: subjectIllustrationOf(subject, subjectName),
    subjectSymbol: subjectSymbolOf(options.subject || profile.subject || ''),
    quickSymbols: {
      pending: symbolOf('target'),
      records: symbolOf('paper'),
      improved: symbolOf('trendUp')
    },
    totalReports: profile.totalReports || reports.filter(item => item.status === 'completed').length,
    currentSummary: primaryTask.summary,
    nextAction: primaryTask.actionText,
    primaryTask,
    knowledgeMapSymbol: symbolOf('knowledgeMap'),
    progressSymbol: symbolOf('trendUp') || symbolOf('report'),
    emptyQueueSymbol: symbolOf('complete'),
    taskQueue: options.subject === 'english' ? [] : taskQueue,
    pendingTaskCount: options.subject === 'chinese' && chineseReviewQueue.length > 0
      ? chineseReviewQueue.length
      : (options.subject === 'english' ? 0 : taskQueue.length),
    chineseReviewQueue,
    hasChineseReviewQueue: chineseReviewQueue.length > 0,
    tools: buildTools(permissions, options, englishVocabularyStats),
    permissions,
    canWriteActions: permissions.canUpload !== false || permissions.canGeneratePaper !== false,
    latestReportId: latestReport ? latestReport._id : '',
    latestDiagnosis,
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
    englishVocabSegments: buildEnglishVocabSegments(englishVocabularyStats),
    englishActionCards,
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

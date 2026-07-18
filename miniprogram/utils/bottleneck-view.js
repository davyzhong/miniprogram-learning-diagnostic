const { bottleneckLabelOf } = require('./learning-records')
const { SUBJECT_NAMES } = require('./constants')
const { getBottleneckMeta } = require('./bottleneck-taxonomy')
const { groupBottlenecksByHierarchy } = require('./math-bottleneck-hierarchy')
const { formatMonthDay } = require('./util')
const { readableNameOf } = require('./user-facing-text')
const { symbolOf } = require('./ui-symbols')

const STATUS_META = {
  needs_verification: { text: '待验证', className: 'pending', icon: '待验证', badgeText: '待验证', actionText: '查看/下载验证卷', symbolKey: 'pending' },
  persisting: { text: '持续出现', className: 'persisting', icon: '持续', badgeText: '持续观察', actionText: '查看/下载验证卷', symbolKey: 'statusRed' },
  improved: { text: '已改善', className: 'improved', icon: '改善', badgeText: '已改善', actionText: '查看证据', symbolKey: 'statusGreen' }
}

// 节点掌握状态（studentNodeMastery 六态，nodeId 粒度）的文案与样式单一来源。
// 与瓶颈层 STATUS_META（BN/LP 粒度）并存，语义见
// docs/superpowers/specs/2026-07-17-math-node-mastery-loop-design.md
const NODE_STATUS_META = {
  unobserved: { text: '未观察', className: 'pending', icon: '未观察', badgeText: '未观察', symbolKey: 'pending' },
  suspected_gap: { text: '疑似漏洞', className: 'persisting', icon: '疑似', badgeText: '疑似漏洞', symbolKey: 'statusRed' },
  relearning: { text: '正在重学', className: 'persisting', icon: '重学', badgeText: '正在重学', symbolKey: 'statusRed' },
  partial_mastery: { text: '部分掌握', className: 'pending', icon: '部分', badgeText: '部分掌握', symbolKey: 'pending' },
  mastered: { text: '已掌握', className: 'improved', icon: '掌握', badgeText: '已掌握', symbolKey: 'statusGreen' },
  recurring: { text: '复发', className: 'persisting', icon: '复发', badgeText: '复发', symbolKey: 'statusRed' }
}

// 节点状态展示优先级（越小越靠前）：风险态在前，已掌握/未观察在后
const NODE_STATUS_ORDER = ['recurring', 'suspected_gap', 'relearning', 'partial_mastery', 'mastered', 'unobserved']

// === 置信度统一口径（唯一来源，与云函数 generatePaper 的分层逻辑保持一致）===
// 阈值：weight≥75 = 高，45-74 = 中，<45 = 低；颜色：红/黄/灰三色体系
const CONFIDENCE_HIGH = 75
const CONFIDENCE_MEDIUM = 45
const CONFIDENCE_LABELS = { high: '高置信', medium: '中置信', low: '低置信' }

const TREND_META = {
  new: '新发现',
  persisting: '持续出现',
  declining: '下降中',
  improved: '已改善',
  recurring: '再次出现'
}

function toDate(value) {
  if (!value) return null
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? null : date
}

function profileBottlenecks(profile = {}) {
  if (Array.isArray(profile.currentBottlenecks)) return profile.currentBottlenecks
  return [
    ...(profile.pendingBottlenecks || []).map(item => ({ ...item, status: 'needs_verification' })),
    ...(profile.improvedBottlenecks || []).map(item => ({ ...item, status: 'improved' }))
  ]
}

function toTime(value) {
  const date = toDate(value)
  return date ? date.getTime() : 0
}

function formatDate(value) {
  const date = toDate(value)
  if (!date) return ''
  // M月D日，复用 util 的北京时区实现
  return formatMonthDay(date)
}

function normalizeStatus(item = {}) {
  if (item.status === 'improved') return 'improved'
  if (item.status === 'persisting' || item.status === 'worsened') return 'persisting'
  if (item.trend === 'recurring' || item.trend === 'persisting') return 'persisting'
  return 'needs_verification'
}

function numberOf(value) {
  return Math.max(0, Number(value) || 0)
}

// 置信度文案与 buildConfidence 共用同一套标签（高/中/低置信）
function evidenceStrengthText(value = '') {
  return CONFIDENCE_LABELS[value] || ''
}

function buildFineEvidenceText(item = {}) {
  const resourceCount = item.fineResourceCount !== undefined
    ? numberOf(item.fineResourceCount)
    : (item.recommendedResourceIds || []).length
  const parentName = item.parentDisplayName || bottleneckLabelOf({
    lpCode: item.parentLpCode || item.lpCode,
    lpName: item.parentLpName || item.lpName
  })
  return [
    evidenceStrengthText(item.evidenceStrength),
    parentName ? `归属${parentName}` : '',
    resourceCount > 0 ? `推荐资源 ${resourceCount} 个` : '',
    item.microValidationRequired ? '需微验证' : ''
  ].filter(Boolean).join(' · ') || '细分学习卡点'
}

function buildEvidenceText(item = {}) {
  if (item.fineBottleneck) return buildFineEvidenceText(item)

  const evidenceCount = numberOf(item.evidenceCount)
  const recentErrorCount = numberOf(item.recentErrorCount || item.errorCount || item.relatedErrorCount)
  const parts = [
    evidenceCount > 0 ? `${evidenceCount} 次证据` : '',
    recentErrorCount > 0 ? `最近 ${recentErrorCount} 道相关错题` : ''
  ].filter(Boolean)

  if (parts.length > 0) return parts.join(' · ')

  const passCount = numberOf(item.verificationPassCount)
  const failCount = numberOf(item.verificationFailCount)
  if (passCount || failCount) {
    return [
      passCount ? `${passCount} 次验证通过` : '',
      failCount ? `${failCount} 次验证未通过` : ''
    ].filter(Boolean).join(' · ')
  }

  return '等待补充证据'
}

function candidateKey(parent = {}, candidate = {}, index = 0) {
  return candidate.bottleneckId
    || candidate.title
    || `${parent.lpCode || 'LP'}-${index}`
}

function shouldExpandFineBottlenecks(item = {}, options = {}) {
  const subject = item.subject || options.subject || ''
  return options.expandCandidates === true
    && subject === 'math'
    && Array.isArray(item.candidateBottlenecks)
    && item.candidateBottlenecks.length > 0
}

function expandFineBottleneckItems(rawItems = [], options = {}) {
  const result = []
  const seen = new Set()

  ;(Array.isArray(rawItems) ? rawItems : []).forEach(item => {
    if (!shouldExpandFineBottlenecks(item, options)) {
      result.push(item)
      return
    }

    const parentDisplayName = bottleneckLabelOf(item)
    item.candidateBottlenecks.forEach((candidate = {}, index) => {
      const title = readableNameOf(candidate) || readableNameOf(item) || '待确认细卡点'
      const key = candidateKey(item, candidate, index)
      const dedupeKey = `${item.lpCode || ''}:${title || key}`
      if (seen.has(dedupeKey)) return
      seen.add(dedupeKey)

      const viewId = `${item.lpCode || 'LP'}:${key}`
      const hasIndependentMetrics = [
        'weight',
        'evidenceCount',
        'cumulativeErrorCount',
        'recentErrorCount',
        'verificationPassCount',
        'verificationFailCount',
        'firstSeenAt',
        'lastSeenAt'
      ].some(field => candidate[field] !== undefined && candidate[field] !== null)
      result.push({
        ...item,
        id: viewId,
        viewId,
        fineBottleneck: true,
        parentLpCode: item.lpCode || '',
        parentLpName: item.lpName || '',
        parentDisplayName,
        bottleneckId: candidate.bottleneckId || '',
        nodeId: candidate.nodeId || '',
        lpName: title,
        title,
        name: title,
        label: title,
        displayName: title,
        candidateBottlenecks: [candidate],
        weight: candidate.weight !== undefined ? candidate.weight : item.weight,
        evidenceCount: candidate.evidenceCount !== undefined ? candidate.evidenceCount : item.evidenceCount,
        cumulativeErrorCount: candidate.cumulativeErrorCount !== undefined
          ? candidate.cumulativeErrorCount
          : item.cumulativeErrorCount,
        recentErrorCount: candidate.recentErrorCount !== undefined ? candidate.recentErrorCount : item.recentErrorCount,
        verificationPassCount: candidate.verificationPassCount !== undefined
          ? candidate.verificationPassCount
          : item.verificationPassCount,
        verificationFailCount: candidate.verificationFailCount !== undefined
          ? candidate.verificationFailCount
          : item.verificationFailCount,
        firstSeenAt: candidate.firstSeenAt || item.firstSeenAt,
        lastSeenAt: candidate.lastSeenAt || item.lastSeenAt,
        metricScope: hasIndependentMetrics ? 'fine' : 'parent',
        metricScopeText: hasIndependentMetrics ? '' : '沿用所属能力卡点统计',
        evidenceStrength: candidate.evidenceStrength || item.evidenceStrength || '',
        microValidationRequired: Boolean(candidate.microValidationRequired),
        suggestedMicroValidation: candidate.suggestedMicroValidation || [],
        fineResourceCount: (candidate.recommendedResourceIds || []).length,
        recommendedResourceIds: [
          ...new Set([
            ...(candidate.recommendedResourceIds || []),
            ...(item.recommendedResourceIds || [])
          ].filter(Boolean))
        ]
      })
    })
  })

  return result
}

function buildTimeText(item = {}) {
  const firstSeen = formatDate(item.firstSeenAt || item.sinceDate)
  const lastSeen = formatDate(item.lastSeenAt || item.lastVerifiedAt || item.improvedDate)
  if (firstSeen && lastSeen && firstSeen !== lastSeen) return `首次 ${firstSeen} · 最近 ${lastSeen}`
  if (lastSeen) return `最近 ${lastSeen}`
  if (firstSeen) return `首次 ${firstSeen}`
  return ''
}

function statusMetaFor(item = {}) {
  const status = normalizeStatus(item)
  if (item.trend === 'recurring') {
    return { ...STATUS_META.persisting, text: '再次出现', className: 'recurring', badgeText: '再次出现', symbolKey: 'repeat' }
  }
  if (item.trend === 'declining') {
    return { ...STATUS_META.improved, text: '下降中', className: 'declining', badgeText: '改善中', symbolKey: 'trendDown' }
  }
  return STATUS_META[status] || STATUS_META.needs_verification
}

// 状态语义图标（白名单 emoji）：与状态色叠加，不替代文字
function statusSymbolFor(meta = {}) {
  return symbolOf(meta.symbolKey || STATUS_META.needs_verification.symbolKey)
}

function buildBottleneckView(item = {}, options = {}) {
  const status = normalizeStatus(item)
  const meta = statusMetaFor(item)
  const weight = numberOf(item.weight)
  const subject = item.subject || options.subject || ''
  const taxonomy = getBottleneckMeta(item) || {}
  const displayName = item.fineBottleneck
    ? (readableNameOf(item) || '待确认细卡点')
    : (taxonomy.shortName || bottleneckLabelOf(item))
  const confidence = buildConfidence(item)
  const firstSeenText = formatDate(item.firstSeenAt || item.sinceDate)
  const lastSeenText = formatDate(item.lastSeenAt || item.lastVerifiedAt || item.improvedDate)
  const firstSeenDate = toDate(item.firstSeenAt || item.sinceDate)
  const lastSeenDate = toDate(item.lastSeenAt || item.lastVerifiedAt || item.improvedDate)
  const durationDays = firstSeenDate && lastSeenDate
    ? Math.max(0, Math.floor((lastSeenDate.getTime() - firstSeenDate.getTime()) / 86400000))
    : 0

  return {
    ...item,
    lpCode: item.lpCode || item.id || '',
    viewId: item.viewId || item.id || item.lpCode || '',
    subject,
    subjectName: item.subjectName || SUBJECT_NAMES[subject] || options.subjectName || '',
    displayName,
    shortName: taxonomy.shortName || displayName,
    category: taxonomy.category || '',
    parentDescription: taxonomy.parentDescription || '',
    validationStyle: taxonomy.validationStyle || '',
    status,
    statusText: meta.text,
    statusClass: meta.className,
    statusIcon: meta.icon,
    statusSymbol: statusSymbolFor(meta),
    statusBadgeText: meta.badgeText || meta.text,
    trend: item.trend || (status === 'improved' ? 'improved' : status === 'persisting' ? 'persisting' : 'new'),
    trendText: TREND_META[item.trend] || TREND_META[status] || '',
    weight,
    // 置信度标签（统一 buildConfidence 一套：label + level + dots，红黄灰三色）
    confidenceLabel: confidence.label,
    confidenceLevel: confidence.level,
    confidenceDots: confidence.dots,
    confidenceText: `${confidence.dots} ${confidence.label}`,
    evidenceText: buildEvidenceText(item),
    timeText: buildTimeText(item),
    firstSeenText,
    lastSeenText,
    active: status !== 'improved',
    actionText: meta.actionText,
    detailPath: '',
    verificationPassCount: numberOf(item.verificationPassCount),
    verificationFailCount: numberOf(item.verificationFailCount),
    recentErrorCount: numberOf(item.recentErrorCount || item.errorCount || item.relatedErrorCount),
    cumulativeErrorCount: numberOf(item.cumulativeErrorCount),
    evidenceCount: numberOf(item.evidenceCount),
    durationDays,
    durationText: durationDays > 0 ? `持续 ${durationDays} 天` : ''
  }
}

function sortRank(item = {}) {
  if (item.trend === 'recurring') return 0
  if (item.status === 'persisting') return 1
  if (item.status === 'needs_verification') return 2
  if (item.trend === 'declining') return 3
  if (item.status === 'improved') return 4
  return 5
}

function sortBottleneckViews(views = []) {
  return views.slice().sort((a, b) => {
    const rankDiff = sortRank(a) - sortRank(b)
    if (rankDiff !== 0) return rankDiff
    const weightDiff = (Number(b.weight) || 0) - (Number(a.weight) || 0)
    if (weightDiff !== 0) return weightDiff
    const errorDiff = (Number(b.recentErrorCount) || 0) - (Number(a.recentErrorCount) || 0)
    if (errorDiff !== 0) return errorDiff
    return toTime(b.lastSeenAt || b.lastVerifiedAt || b.improvedDate) - toTime(a.lastSeenAt || a.lastVerifiedAt || a.improvedDate)
  })
}

function buildBottleneckViews(rawItems = [], options = {}) {
  const source = expandFineBottleneckItems(rawItems, options)
  return sortBottleneckViews(source.map(item => buildBottleneckView(item, options)))
}

function buildGroupedBottleneckViews(rawItems = [], options = {}) {
  const subject = options.subject || ''
  if (subject !== 'math') return []

  const source = (rawItems || []).some(item => item && item.displayName && item.statusText)
    ? rawItems
    : buildBottleneckViews(rawItems, options)

  return groupBottlenecksByHierarchy(source).map(group => ({
    ...group,
    title: group.categoryTitle,
    summaryText: `${group.itemCount} 个细分卡点`,
    families: group.families.map(family => ({
      ...family,
      title: family.familyTitle,
      summaryText: `${family.itemCount} 个卡点`
    }))
  }))
}

function buildBottleneckStats(views = []) {
  const source = Array.isArray(views) ? views : []
  return {
    totalCount: source.length,
    // 统一口径："待修复" = status !== 'improved'（含 needs_verification + persisting + recurring）
    pendingCount: source.filter(item => item.status !== 'improved').length,
    activeCount: source.filter(item => item.status !== 'improved').length,
    persistingCount: source.filter(item => item.status === 'persisting').length,
    improvedCount: source.filter(item => item.status === 'improved').length,
    recurringCount: source.filter(item => item.trend === 'recurring').length
  }
}

function findBottleneckView(views = [], identifier = '') {
  const target = String(identifier || '')
  if (!target) return null
  return (views || []).find(item => (
    item.lpCode === target
    || item.viewId === target
    || item.id === target
    || item.bottleneckId === target
  )) || null
}

// === 置信度计算（阈值/标签常量见文件顶部统一口径区）===
function buildConfidence(bottleneck = {}) {
  const weight = Math.max(0, Math.min(100, Number(bottleneck.weight) || 0))
  const evidenceCount = Number(bottleneck.evidenceCount) || 0
  const cumulativeErrorCount = Math.max(0, Number(bottleneck.cumulativeErrorCount) || 0)
  const recentErrorCount = Math.max(0, Number(bottleneck.recentErrorCount || bottleneck.errorCount || bottleneck.relatedErrorCount) || 0)
  const passCount = Number(bottleneck.verificationPassCount) || 0
  const failCount = Number(bottleneck.verificationFailCount) || 0
  const evidenceStrength = bottleneck.evidenceStrength || ''

  // 如果没有 weight，用 evidenceStrength 映射
  const effectiveWeight = weight || (evidenceStrength === 'high' ? 85 : evidenceStrength === 'medium' ? 60 : 35)

  let level, label, dots
  if (effectiveWeight >= CONFIDENCE_HIGH) {
    level = 'high'; label = CONFIDENCE_LABELS.high; dots = '●●●'
  } else if (effectiveWeight >= CONFIDENCE_MEDIUM) {
    level = 'medium'; label = CONFIDENCE_LABELS.medium; dots = '●●○'
  } else {
    level = 'low'; label = CONFIDENCE_LABELS.low; dots = '●○○'
  }

  // 构建详情文案
  const parts = []
  if (evidenceCount > 0) parts.push(`${evidenceCount}次证据`)
  if (passCount > 0) parts.push(`通过${passCount}次`)
  if (failCount > 0) parts.push(`未通过${failCount}次`)
  const detail = parts.length > 0 ? parts.join(' · ') : '初步观察'

  return {
    level,
    label,
    dots,
    score: effectiveWeight,
    scoreLabel: '综合置信分',
    detail,
    evidenceCount,
    occurrenceCount: evidenceCount,
    cumulativeErrorCount,
    recentErrorCount,
    passCount,
    failCount
  }
}

module.exports = {
  STATUS_META,
  NODE_STATUS_META,
  NODE_STATUS_ORDER,
  TREND_META,
  CONFIDENCE_LABELS,
  normalizeStatus,
  profileBottlenecks,
  expandFineBottleneckItems,
  buildBottleneckView,
  buildBottleneckViews,
  buildGroupedBottleneckViews,
  sortBottleneckViews,
  buildBottleneckStats,
  findBottleneckView,
  buildConfidence
}

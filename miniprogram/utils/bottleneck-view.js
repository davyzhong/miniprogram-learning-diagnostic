const { bottleneckLabelOf } = require('./learning-records')

const STATUS_META = {
  needs_verification: { text: '待验证', className: 'pending', icon: '?', actionText: '生成验证卷' },
  persisting: { text: '持续出现', className: 'persisting', icon: '!', actionText: '生成验证卷' },
  improved: { text: '已改善', className: 'improved', icon: '✓', actionText: '查看证据' }
}

const TREND_META = {
  new: '新发现',
  persisting: '持续出现',
  declining: '下降中',
  improved: '已改善',
  recurring: '再次出现'
}

const SUBJECT_NAMES = {
  math: '数学',
  chinese: '语文',
  english: '英语'
}

function toDate(value) {
  if (!value) return null
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? null : date
}

function toTime(value) {
  const date = toDate(value)
  return date ? date.getTime() : 0
}

function formatDate(value) {
  const date = toDate(value)
  if (!date) return ''
  return `${date.getMonth() + 1}月${date.getDate()}日`
}

function normalizeStatus(item = {}) {
  if (item.status === 'improved') return 'improved'
  if (item.status === 'persisting' || item.status === 'worsened') return 'persisting'
  if (item.trend === 'recurring' || item.trend === 'persisting') return 'persisting'
  return 'needs_verification'
}

function priorityText(weight) {
  const value = Number(weight) || 0
  if (value >= 75) return '高优先级'
  if (value >= 45) return '中优先级'
  return '低优先级'
}

function priorityClass(weight) {
  const value = Number(weight) || 0
  if (value >= 75) return 'high'
  if (value >= 45) return 'medium'
  return 'low'
}

function numberOf(value) {
  return Math.max(0, Number(value) || 0)
}

function buildEvidenceText(item = {}) {
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
    return { ...STATUS_META.persisting, text: '再次出现', className: 'recurring' }
  }
  if (item.trend === 'declining') {
    return { ...STATUS_META.improved, text: '下降中', className: 'declining' }
  }
  return STATUS_META[status] || STATUS_META.needs_verification
}

function buildBottleneckView(item = {}, options = {}) {
  const status = normalizeStatus(item)
  const meta = statusMetaFor(item)
  const weight = numberOf(item.weight)
  const subject = item.subject || options.subject || ''
  const displayName = bottleneckLabelOf(item)
  const firstSeenText = formatDate(item.firstSeenAt || item.sinceDate)
  const lastSeenText = formatDate(item.lastSeenAt || item.lastVerifiedAt || item.improvedDate)

  return {
    ...item,
    lpCode: item.lpCode || item.id || '',
    subject,
    subjectName: item.subjectName || SUBJECT_NAMES[subject] || options.subjectName || '',
    displayName,
    status,
    statusText: meta.text,
    statusClass: meta.className,
    statusIcon: meta.icon,
    trend: item.trend || (status === 'improved' ? 'improved' : status === 'persisting' ? 'persisting' : 'new'),
    trendText: TREND_META[item.trend] || TREND_META[status] || '',
    weight,
    weightText: weight ? `权重 ${weight}` : '',
    priorityText: priorityText(weight),
    priorityClass: priorityClass(weight),
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
    evidenceCount: numberOf(item.evidenceCount)
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
  const source = Array.isArray(rawItems) ? rawItems : []
  return sortBottleneckViews(source.map(item => buildBottleneckView(item, options)))
}

function buildBottleneckStats(views = []) {
  const source = Array.isArray(views) ? views : []
  return {
    totalCount: source.length,
    activeCount: source.filter(item => item.status !== 'improved').length,
    pendingCount: source.filter(item => item.status === 'needs_verification').length,
    persistingCount: source.filter(item => item.status === 'persisting').length,
    improvedCount: source.filter(item => item.status === 'improved').length,
    recurringCount: source.filter(item => item.trend === 'recurring').length
  }
}

function findBottleneckView(views = [], lpCode = '') {
  return (views || []).find(item => item.lpCode === lpCode) || null
}

module.exports = {
  STATUS_META,
  TREND_META,
  buildBottleneckView,
  buildBottleneckViews,
  sortBottleneckViews,
  buildBottleneckStats,
  findBottleneckView
}

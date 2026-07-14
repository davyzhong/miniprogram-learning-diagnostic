// AI 用量账单页 presenter —— 纯逻辑，不依赖 wx/cloud，可直接单测。
const { beijingParts } = require('../../utils/util')
const { sanitizeUserText } = require('../../utils/user-facing-text')

const GLOBAL_EMPTY_STATE = {
  emptyTitle: '本月暂无 AI 用量',
  emptyDesc: '完成拍照诊断、试卷生成或学习任务包后，用量会记录在这里。'
}

// 事件类型 → 中文功能名（设计文档 §5.2）
const EVENT_TYPE_NAMES = {
  photo_analysis: '拍照诊断',
  paper_generation: '试卷生成',
  learning_resource_pack: '学习任务包',
  dictation_grading: '英语听写批改',
  report_pdf: '报告 PDF'
}

const EVENT_TYPE_ORDER = ['photo_analysis', 'paper_generation', 'learning_resource_pack', 'dictation_grading', 'report_pdf']

const FILTERS = [
  { key: '', name: '全部' },
  { key: 'photo_analysis', name: '拍照诊断' },
  { key: 'paper_generation', name: '试卷生成' },
  { key: 'learning_resource_pack', name: '学习任务包' },
  { key: 'dictation_grading', name: '英语听写' }
]

function buildMonthLabel(value) {
  // value: 'YYYY-MM' 字符串
  if (!value) return ''
  const matched = String(value).match(/^(\d{4})-(\d{2})$/)
  if (!matched) return String(value)
  return `${matched[1]}年${Number(matched[2])}月`
}

function currentMonth() {
  const p = beijingParts(new Date())
  if (!p) return ''
  return `${p.year}-${String(p.month).padStart(2, '0')}`
}

// 月份加减：month 'YYYY-MM'，delta -1 或 +1
function shiftMonth(month, delta) {
  const matched = String(month || '').match(/^(\d{4})-(\d{2})$/)
  if (!matched) return currentMonth()
  let year = Number(matched[1])
  let m = Number(matched[2]) + delta
  while (m < 1) { m += 12; year -= 1 }
  while (m > 12) { m -= 12; year += 1 }
  return `${year}-${String(m).padStart(2, '0')}`
}

function formatCost(yuan) {
  const n = Number(yuan) || 0
  if (n === 0) return '0'
  if (n < 0.01) return '<0.01'
  return n.toFixed(2)
}

function eventTypeName(eventType) {
  return EVENT_TYPE_NAMES[eventType] || eventType || '其它'
}

// 汇总卡片：本月总 token、估算成本、调用次数、涉及孩子
function buildSummaryCards(summary) {
  if (!summary) return []
  return [
    { label: '本月 token', value: String(summary.totalTokens || 0) },
    { label: '平台估算成本', value: `¥${formatCost(summary.totalCostCny)}`, hint: '内测估算' },
    { label: 'AI 调用次数', value: String(summary.callCount || 0) },
    { label: '涉及孩子', value: String(summary.studentCount || 0) }
  ]
}

// 功能拆分：按事件类型聚合（来自 summary.byEventType）
function buildBreakdown(summary) {
  const list = (summary && Array.isArray(summary.byEventType)) ? summary.byEventType : []
  return list.map(item => ({
    key: item.eventType,
    name: eventTypeName(item.eventType),
    callCount: item.callCount || 0,
    totalTokens: item.totalTokens || 0,
    costText: `¥${formatCost(item.totalCostCny)}`
  }))
}

// 明细按天分组：events → [{ dayLabel, items: [{time, name, model, tokens, costText, statusText}] }]
function buildDays(events) {
  const list = Array.isArray(events) ? events : []
  const byDay = new Map()
  for (const item of list) {
    const p = beijingParts(item.createdAt)
    if (!p) continue
    const dayKey = `${p.year}-${String(p.month).padStart(2, '0')}-${String(p.day).padStart(2, '0')}`
    if (!byDay.has(dayKey)) byDay.set(dayKey, [])
    byDay.get(dayKey).push(item)
  }
  const days = []
  for (const [dayKey, dayItems] of byDay) {
    const p = beijingParts(dayKey)
    days.push({
      dayKey,
      dayLabel: p ? `${p.month}月${p.day}日` : dayKey,
      items: dayItems.map(item => buildEventItem(item)).sort((a, b) => (b.timeKey || '').localeCompare(a.timeKey || ''))
    })
  }
  return days.sort((a, b) => (b.dayKey || '').localeCompare(a.dayKey || ''))
}

function buildEventItem(item) {
  const p = beijingParts(item.createdAt)
  const time = p ? `${String(p.hour).padStart(2, '0')}:${String(p.minute).padStart(2, '0')}` : ''
  const timeKey = p ? `${p.year}${String(p.month).padStart(2, '0')}${String(p.day).padStart(2, '0')}${String(p.hour).padStart(2, '0')}${String(p.minute).padStart(2, '0')}` : ''
  const statusText = item.status === 'failed' ? '失败' : (item.status === 'pending' ? '处理中' : '成功')
  return {
    _id: item._id,
    time,
    timeKey,
    name: eventTypeName(item.eventType),
    model: item.model || '',
    tokens: Number(item.totalTokens) || 0,
    imageCount: Number(item.imageCount) || 0,
    costText: `¥${formatCost(item.estimatedCostCny)}`,
    isEstimate: Boolean(item.isEstimate),
    status: item.status || '',
    statusText,
    errorMessage: sanitizeUserText(item.errorMessage || '', { treatAsId: true })
  }
}

// 主入口：events（明细）+ summary（聚合）+ activeMonth + activeFilter → 完整视图
function buildUsageState(events, summary, activeMonth, activeFilter = '') {
  const monthLabel = buildMonthLabel(activeMonth)
  const summaryCards = buildSummaryCards(summary)
  const breakdown = buildBreakdown(summary)
  const filteredEvents = activeFilter
    ? (Array.isArray(events) ? events.filter(item => item.eventType === activeFilter) : [])
    : (events || [])
  const days = buildDays(filteredEvents)
  const hasEvents = days.length > 0

  return {
    activeMonth: activeMonth || currentMonth(),
    monthLabel,
    summaryCards,
    breakdown,
    breakdownVisible: breakdown.length > 0,
    days,
    hasEvents,
    filters: FILTERS,
    activeFilter,
    emptyTitle: GLOBAL_EMPTY_STATE.emptyTitle,
    emptyDesc: GLOBAL_EMPTY_STATE.emptyDesc,
    // 醒目提示：内测估算不代表应付款项（设计文档 §6.1 强制）
    estimateNotice: '当前为内测成本估算，不代表应付款项。'
  }
}

module.exports = {
  GLOBAL_EMPTY_STATE,
  EVENT_TYPE_NAMES,
  EVENT_TYPE_ORDER,
  FILTERS,
  buildMonthLabel,
  currentMonth,
  shiftMonth,
  formatCost,
  eventTypeName,
  buildSummaryCards,
  buildBreakdown,
  buildDays,
  buildEventItem,
  buildUsageState
}

const { formatBottleneckDisplayName, formatBottleneckDisplayList } = require('./util')

const STATUS_REPORT_STATES = new Set(['pending', 'uploading', 'analyzing', 'failed', 'timeout'])
const STALE_STATUS_MS = 30 * 60 * 1000

function paperCodeOf(paper) {
  return paper && (paper.paperDisplayCode || paper.paperCode || paper.displayCode || '')
}

function reportTimeOf(report = {}) {
  return report.updatedAt || report.evidenceTime || report.createdAt || report.created_at || ''
}

function isArchivedReport(report = {}) {
  return Boolean(report.isArchived || report.archivedAt)
}

function isStaleStatusReport(report = {}, now = Date.now()) {
  if (!STATUS_REPORT_STATES.has(report.status)) return false
  const time = new Date(reportTimeOf(report)).getTime()
  if (!time || Number.isNaN(time)) return false
  return now - time > STALE_STATUS_MS
}

function isVisibleTimelineReport(report = {}, now = Date.now()) {
  return !isArchivedReport(report) && !isStaleStatusReport(report, now)
}

function isMainTimelinePaper(paper) {
  return Boolean(paper && paper.type === 'verification')
}

function classifyReportDisplay(report = {}) {
  if (STATUS_REPORT_STATES.has(report.status)) {
    return { displayLevel: 'status', kind: 'status' }
  }
  if (report.type === 'verification') {
    return { displayLevel: 'main', kind: 'verification-report' }
  }
  return { displayLevel: 'main', kind: 'diagnosis-report' }
}

function classifyPaperDisplay(paper = {}) {
  if (!isMainTimelinePaper(paper)) {
    return { displayLevel: 'hidden', kind: 'tool-history' }
  }
  return { displayLevel: 'main', kind: 'verification-paper' }
}

function bottleneckLabelOf(input) {
  if (!input) return ''
  if (typeof input === 'string') {
    return formatBottleneckDisplayName({ lpName: input, name: input })
  }
  return input.summary
    || input.name
    || input.title
    || input.label
    || input.displayName
    || formatBottleneckDisplayName(input)
}

function bottleneckListText(items = []) {
  const source = Array.isArray(items) ? items : []
  const readable = source
    .map(bottleneckLabelOf)
    .filter(Boolean)
  return readable.length > 0 ? readable.join('、') : formatBottleneckDisplayList(source)
}

function buildStatusText(report = {}) {
  if (report.status === 'failed') return '分析失败，可进入报告页重试'
  if (report.status === 'timeout') return '分析可能超时，可刷新或重试'
  if (report.status === 'uploading') return '照片正在上传，完成后会开始分析'
  if (report.status === 'pending') return '已提交，等待 AI 开始分析'
  return 'AI 正在分析，完成后会生成诊断报告'
}

function buildStatusTitle(report = {}, subjectName = '') {
  const prefix = subjectName || report.subjectName || ''
  const typeText = report.type === 'verification' ? '验证反馈' : '诊断'
  if (report.status === 'failed') return `${prefix}${typeText}失败`
  if (report.status === 'timeout') return `${prefix}${typeText}可能超时`
  return `${prefix}${typeText}处理中`
}

module.exports = {
  STATUS_REPORT_STATES,
  STALE_STATUS_MS,
  paperCodeOf,
  reportTimeOf,
  isArchivedReport,
  isStaleStatusReport,
  isVisibleTimelineReport,
  isMainTimelinePaper,
  classifyReportDisplay,
  classifyPaperDisplay,
  bottleneckLabelOf,
  bottleneckListText,
  buildStatusText,
  buildStatusTitle
}

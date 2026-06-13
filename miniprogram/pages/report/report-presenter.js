const {
  bottleneckLabelOf,
  paperCodeOf
} = require('../../utils/learning-records')

function pad2(value) {
  return String(value).padStart(2, '0')
}

function formatDateTime(value) {
  if (!value) return ''
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return ''
  return `${date.getFullYear()}年${date.getMonth() + 1}月${date.getDate()}日 ${pad2(date.getHours())}:${pad2(date.getMinutes())}`
}

function buildTrendSummary(bottlenecks = []) {
  const counts = bottlenecks.reduce((acc, item) => {
    const trend = item.trend || ''
    if (trend) acc[trend] = (acc[trend] || 0) + 1
    return acc
  }, {})
  const parts = [
    counts.recurring ? `${counts.recurring} 个再次出现` : '',
    counts.persisting ? `${counts.persisting} 个持续出现` : '',
    counts.declining ? `${counts.declining} 个下降中` : '',
    counts.improved ? `${counts.improved} 个已改善` : '',
    counts.new ? `${counts.new} 个新发现` : ''
  ].filter(Boolean)
  return parts.length > 0 ? parts.join('，') : ''
}

function buildReportView(report) {
  const isVerification = report.type === 'verification'
  const paperCodeText = paperCodeOf(report.linkedPaper || report.paper)
  const bottlenecks = report.bottlenecks || []
  const errorDetails = report.errorDetails || []
  const maxErrorCount = bottlenecks.length > 0
    ? Math.max(...bottlenecks.map(item => item.errorCount || 0), 1)
    : 1

  const bottleneckList = bottlenecks.map(item => {
    const status = item.status === 'improved'
      ? { statusText: '已有改善', statusClass: 'improved', statusIcon: '✓' }
      : (item.status === 'persisting' || item.status === 'worsened')
        ? { statusText: '持续出现', statusClass: 'persisting', statusIcon: '!' }
        : { statusText: '需要验证', statusClass: 'pending', statusIcon: '?' }
    const displayName = bottleneckLabelOf(item)
    return {
      ...item,
      ...status,
      displayName,
      metaText: `${item.errorCount || 0} 道相关错题 · ${displayName}`,
      barWidth: Math.round(((item.errorCount || 0) / maxErrorCount) * 100)
    }
  })
  const errorDetailList = errorDetails.map((item, index) => ({
    ...item,
    expanded: false,
    displayIndex: `${index + 1}.`
  }))

  return {
    headline: report.changeSummary || report.comparisonSummary || report.summary || '查看本次诊断结果',
    paperCodeText,
    evidenceTimeText: formatDateTime(report.evidenceTime || report.createdAt),
    trendSummaryText: buildTrendSummary(bottlenecks),
    sourceImageCount: (report.imageFiles || report.imageFileIds || []).length,
    isVerification,
    bottleneckCount: bottlenecks.length,
    hasBottlenecks: bottlenecks.length > 0,
    bottleneckList,
    hasErrorDetails: errorDetails.length > 0,
    errorDetailList,
    improvedCount: isVerification
      ? bottlenecks.filter(item => item.status === 'improved').length
      : 0,
    worsenedCount: isVerification
      ? bottlenecks.filter(item => item.status === 'worsened').length
      : 0,
    showNextStep: !isVerification && bottlenecks.length > 0
  }
}

module.exports = { buildReportView }

const { bottleneckLabelOf } = require('../../utils/learning-records')
const { paperCodeOf } = require('../../utils/paper-display')
const { buildTraceableUrl } = require('../../utils/traceable-actions')

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

function qualityViewOf(quality = {}) {
  if (!quality || !quality.status) {
    return {
      hasQuality: false,
      qualityLabel: '',
      qualityClass: '',
      qualityReasons: [],
      qualitySampleSummary: ''
    }
  }

  const map = {
    usable: { label: '证据较充分', className: 'usable' },
    needs_review: { label: '建议复核', className: 'needs-review' },
    insufficient: { label: '样本不足', className: 'insufficient' }
  }
  const meta = map[quality.status] || map.needs_review
  return {
    hasQuality: true,
    qualityLabel: meta.label,
    qualityClass: meta.className,
    qualityReasons: Array.isArray(quality.reasons) ? quality.reasons.slice(0, 2) : [],
    qualitySampleSummary: quality.sampleSummary || ''
  }
}

function evidenceStatusViewOf(status) {
  const map = {
    passed: { statusText: '已通过', statusClass: 'passed' },
    failed: { statusText: '未通过', statusClass: 'failed' },
    incomplete: { statusText: '证据不足', statusClass: 'incomplete' },
    unclear: { statusText: '图像不清', statusClass: 'unclear' },
    missing: { statusText: '证据缺失', statusClass: 'missing' }
  }
  return map[status] || map.missing
}

function buildReportView(report) {
  const isVerification = report.type === 'verification'
  const paperCodeText = paperCodeOf(report.linkedPaper || report.paper)
  const linkedPaper = report.linkedPaper || report.paper || {}
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
      barWidth: Math.round(((item.errorCount || 0) / maxErrorCount) * 100),
      detailUrl: buildTraceableUrl({
        type: 'bottleneck-detail',
        studentId: report.studentId,
        studentName: report.studentName,
        subject: report.subject,
        id: item.lpCode
      })
    }
  })
  const errorDetailList = errorDetails.map((item, index) => ({
    ...item,
    expanded: false,
    displayIndex: `${index + 1}.`,
    feedbackTargetId: item.id || item._id || `${index + 1}`
  }))
  const verificationEvidenceItems = (report.verificationEvidence || []).map(item => ({
    ...item,
    ...evidenceStatusViewOf(item.evidenceStatus || (item.complete && item.allCorrect ? 'passed' : 'missing'))
  }))
  const qualityView = qualityViewOf(report.quality)

  return {
    headline: report.changeSummary || report.comparisonSummary || report.summary || '查看本次诊断结果',
    paperCodeText,
    paperCodeUrl: paperCodeText ? buildTraceableUrl({
      type: 'paper-workbench',
      id: linkedPaper._id || report.paperId
    }) : '',
    evidenceTimeText: formatDateTime(report.evidenceTime || report.createdAt),
    evidenceTimeUrl: buildTraceableUrl({
      type: 'learning-records',
      studentId: report.studentId,
      studentName: report.studentName,
      subject: report.subject,
      filter: 'evidence-time'
    }),
    trendSummaryText: buildTrendSummary(bottlenecks),
    sourceImageCount: (report.imageFiles || report.imageFileIds || []).length,
    ...qualityView,
    metricActions: {
      errorsUrl: buildTraceableUrl({ type: 'report-detail', id: report._id }),
      bottlenecksUrl: buildTraceableUrl({
        type: 'bottleneck-center',
        studentId: report.studentId,
        studentName: report.studentName,
        subject: report.subject,
        filter: isVerification ? 'all' : 'active'
      }),
      sourcesUrl: buildTraceableUrl({
        type: 'learning-records',
        studentId: report.studentId,
        studentName: report.studentName,
        subject: report.subject,
        filter: 'sources'
      })
    },
    isVerification,
    bottleneckCount: bottlenecks.length,
    hasBottlenecks: bottlenecks.length > 0,
    bottleneckList,
    hasErrorDetails: errorDetails.length > 0,
    errorDetailList,
    hasVerificationEvidence: verificationEvidenceItems.length > 0,
    verificationEvidenceItems,
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

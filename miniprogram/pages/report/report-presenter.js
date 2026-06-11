function buildReportView(report) {
  const isVerification = report.type === 'verification'
  const bottlenecks = report.bottlenecks || []
  const errorDetails = report.errorDetails || []
  const maxErrorCount = bottlenecks.length > 0
    ? Math.max(...bottlenecks.map(item => item.errorCount || 0), 1)
    : 1

  const bottleneckList = bottlenecks.map(item => ({
    ...item,
    barWidth: Math.round(((item.errorCount || 0) / maxErrorCount) * 100)
  }))
  const errorDetailList = errorDetails.map((item, index) => ({
    ...item,
    expanded: false,
    displayIndex: `${index + 1}.`
  }))

  return {
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

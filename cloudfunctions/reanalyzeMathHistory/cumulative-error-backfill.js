const BACKFILL_VERSION = 'math-cumulative-errors-v1'

function timeOf(report = {}) {
  return new Date(report.completedAt || report.updatedAt || report.createdAt || report.evidenceTime || 0).getTime() || 0
}

function errorCountOf(item = {}) {
  return Math.max(0, Number(item.errorCount || item.relatedErrorCount) || 0)
}

function isEffectiveDiagnosis(report = {}) {
  return report.subject === 'math'
    && report.type === 'diagnosis'
    && report.status === 'completed'
    && report.isEffective !== false
    && report.allPhotosDuplicate !== true
    && (!report.quality || report.quality.status !== 'insufficient')
    && !report.isArchived
    && !report.archivedAt
    && !report.replacedByReportId
}

function lineageKeyOf(report = {}) {
  return (report.reanalysis && report.reanalysis.sourceReportId)
    || report.originalReportId
    || report._id
    || ''
}

function selectEffectiveDiagnosisReports(reports = []) {
  const byLineage = new Map()
  for (const report of reports.filter(isEffectiveDiagnosis)) {
    const lineageKey = lineageKeyOf(report)
    if (!lineageKey) continue
    const current = byLineage.get(lineageKey)
    if (!current || timeOf(report) >= timeOf(current)) byLineage.set(lineageKey, report)
  }
  return Array.from(byLineage.values()).sort((a, b) => timeOf(a) - timeOf(b))
}

function addMetric(metrics, key, lpCode, errorCount) {
  if (!key || errorCount <= 0) return
  const previous = metrics[key] || {
    lpCode: lpCode || '',
    cumulativeErrorCount: 0,
    occurrenceCount: 0
  }
  metrics[key] = {
    lpCode: lpCode || previous.lpCode || '',
    cumulativeErrorCount: previous.cumulativeErrorCount + errorCount,
    occurrenceCount: previous.occurrenceCount + 1
  }
}

function aggregateCumulativeErrors(reports = []) {
  const metrics = {}
  for (const report of selectEffectiveDiagnosisReports(reports)) {
    for (const bottleneck of report.bottlenecks || []) {
      if (!bottleneck || !bottleneck.lpCode) continue
      const candidates = (bottleneck.candidateBottlenecks || [])
        .filter(item => item && item.bottleneckId && errorCountOf(item) > 0)
      if (candidates.length > 0) {
        candidates.forEach(item => addMetric(metrics, item.bottleneckId, bottleneck.lpCode, errorCountOf(item)))
        continue
      }
      addMetric(metrics, bottleneck.bottleneckId || bottleneck.lpCode, bottleneck.lpCode, errorCountOf(bottleneck))
    }
  }
  return metrics
}

function metricFor(metrics = {}, item = {}) {
  return metrics[item.bottleneckId || ''] || metrics[item.lpCode || ''] || null
}

function applyMetricsToProfile(profile = {}, metrics = {}, completedAt = new Date()) {
  let changed = !profile.metricBackfill || profile.metricBackfill.version !== BACKFILL_VERSION
  const currentBottlenecks = (profile.currentBottlenecks || []).map(item => {
    const metric = metricFor(metrics, item)
    const candidateBottlenecks = (item.candidateBottlenecks || []).map(candidate => {
      const candidateMetric = metricFor(metrics, candidate)
      if (!candidateMetric) return candidate
      if (
        Number(candidate.cumulativeErrorCount) === candidateMetric.cumulativeErrorCount
        && Number(candidate.evidenceCount) === candidateMetric.occurrenceCount
      ) return candidate
      changed = true
      return {
        ...candidate,
        cumulativeErrorCount: candidateMetric.cumulativeErrorCount,
        evidenceCount: candidateMetric.occurrenceCount
      }
    })
    let next = { ...item, candidateBottlenecks }
    if (!metric) return next
    if (
      Number(item.cumulativeErrorCount) === metric.cumulativeErrorCount
      && Number(item.evidenceCount) === metric.occurrenceCount
    ) return next
    changed = true
    next = {
      ...next,
      cumulativeErrorCount: metric.cumulativeErrorCount,
      evidenceCount: metric.occurrenceCount
    }
    return next
  })

  return {
    changed,
    currentBottlenecks,
    metricBackfill: {
      version: BACKFILL_VERSION,
      completedAt
    }
  }
}

module.exports = {
  BACKFILL_VERSION,
  selectEffectiveDiagnosisReports,
  aggregateCumulativeErrors,
  applyMetricsToProfile
}

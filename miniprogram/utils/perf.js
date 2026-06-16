const MAX_METRICS = 120
const metrics = []

function now() {
  return Date.now()
}

function estimateBytes(value) {
  try {
    return JSON.stringify(value || {}).length
  } catch (error) {
    return 0
  }
}

function recordMetric(name, value, dimensions = {}) {
  const metric = {
    name,
    value: Number(value) || 0,
    dimensions: { ...dimensions },
    createdAt: now()
  }
  metrics.push(metric)
  if (metrics.length > MAX_METRICS) metrics.shift()

  if (typeof wx !== 'undefined' && typeof wx.reportPerformance === 'function') {
    try {
      wx.reportPerformance(name, metric.value, metric.dimensions)
    } catch (error) {
      // Performance reporting is best-effort and must never block a page.
    }
  }
  return metric
}

function getMetrics() {
  return metrics.slice()
}

function clearMetrics() {
  metrics.length = 0
}

module.exports = {
  now,
  estimateBytes,
  recordMetric,
  getMetrics,
  clearMetrics
}

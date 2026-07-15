#!/usr/bin/env node
const fs = require('node:fs')
const path = require('node:path')

const PERF_SAMPLE_COUNT = Math.max(5, Number(process.env.PERF_SAMPLE_COUNT) || 5)

function percentile(sortedValues, ratio) {
  if (!sortedValues.length) return 0
  const index = Math.min(sortedValues.length - 1, Math.ceil(ratio * sortedValues.length) - 1)
  return sortedValues[Math.max(0, index)]
}

function summarize(values = []) {
  const sorted = values.filter(Number.isFinite).slice().sort((a, b) => a - b)
  if (!sorted.length) return { count: 0, min: 0, avg: 0, p50: 0, p90: 0, p95: 0, max: 0 }
  return {
    count: sorted.length,
    min: sorted[0],
    avg: Math.round(sorted.reduce((sum, value) => sum + value, 0) / sorted.length),
    p50: percentile(sorted, 0.5),
    p90: percentile(sorted, 0.9),
    p95: percentile(sorted, 0.95),
    max: sorted[sorted.length - 1]
  }
}

function buildPerformanceSummary(report = {}) {
  const results = Array.isArray(report.results) ? report.results : []
  const pages = results.filter(item => !String(item.name || '').startsWith('scenario:'))
  const scenarios = results.filter(item => String(item.name || '').startsWith('scenario:'))
  const errorCount = results.reduce((count, item) => (
    count + (item.pageErrors || []).length + (item.realConsoleErrors || []).length
  ), 0)
  const pageReady = summarize(pages.map(item => Number(item.readyMs || item.durationMs)))
  const scenarioDuration = summarize(scenarios.map(item => Number(item.durationMs)))

  return {
    timestamp: report.timestamp || new Date().toISOString(),
    measurement: 'event-driven page ready',
    passRate: results.length ? results.filter(item => item.status === 'PASS').length / results.length : 0,
    errorCount,
    pageReady,
    scenarioDuration,
    thresholds: {
      pageP95Ms: 6000,
      scenarioP95Ms: 14500,
      passed: pageReady.p95 <= 6000 && scenarioDuration.p95 <= 14500 && errorCount === 0
    }
  }
}

function summarizeCoreReport(reportPath) {
  if (!fs.existsSync(reportPath)) {
    console.error(`性能原始报告不存在: ${reportPath}`)
    return 2
  }
  const report = JSON.parse(fs.readFileSync(reportPath, 'utf8'))
  const summary = buildPerformanceSummary(report)
  const outputPath = path.join(path.dirname(reportPath), 'performance-summary.json')
  fs.writeFileSync(outputPath, JSON.stringify(summary, null, 2))
  console.log(JSON.stringify(summary, null, 2))
  console.log(`性能汇总: ${outputPath}`)
  return summary.thresholds.passed ? 0 : 1
}

async function collectBaselineSamples() {
  const {
    cliPath,
    projectPath,
    pages,
    loadAutomator,
    installCloudMocks,
    runPageAssertion,
    settleBeforeHomeMeasurement,
  } = require('./devtools-e2e-fullpage')
  const automator = loadAutomator()
  const indexSpec = pages.find(item => item.route === '/pages/index/index') || pages[0]
  const coldSamples = []
  const warmSamples = []

  const miniProgram = await automator.launch({ cliPath, projectPath, trustProject: true, timeout: 60000 })
  try {
    for (let index = 0; index < PERF_SAMPLE_COUNT; index += 1) {
      await miniProgram.callWxMethod('clearStorageSync')
      await installCloudMocks(miniProgram)
      await settleBeforeHomeMeasurement(miniProgram)
      coldSamples.push(await runPageAssertion(indexSpec, miniProgram))
    }
    for (let index = 0; index < PERF_SAMPLE_COUNT; index += 1) {
      await settleBeforeHomeMeasurement(miniProgram)
      warmSamples.push(await runPageAssertion(indexSpec, miniProgram))
    }
  } finally {
    try { await miniProgram.close() } catch {}
  }

  const errorCount = [...coldSamples, ...warmSamples].filter(item => item.status !== 'PASS').length
  const report = {
    timestamp: new Date().toISOString(),
    measurement: 'event-driven home ready',
    coldDefinition: 'storage-cleared, neutral-route-isolated relaunch in one DevTools process',
    warmDefinition: 'neutral-route-isolated relaunch with retained storage and DevTools process',
    sampleCount: PERF_SAMPLE_COUNT,
    coldSamples,
    warmSamples,
    coldReady: summarize(coldSamples.map(item => Number(item.readyMs || item.durationMs))),
    warmReady: summarize(warmSamples.map(item => Number(item.readyMs || item.durationMs))),
    errorCount,
  }
  report.thresholds = {
    readyP95Ms: 6000,
    passed: report.coldReady.p95 <= 6000 && report.warmReady.p95 <= 6000 && errorCount === 0,
  }

  const outputPath = path.resolve('tmp/e2e/performance-baseline/report.json')
  fs.mkdirSync(path.dirname(outputPath), { recursive: true })
  fs.writeFileSync(outputPath, JSON.stringify(report, null, 2))
  console.log(JSON.stringify({
    timestamp: report.timestamp,
    sampleCount: report.sampleCount,
    coldReady: report.coldReady,
    warmReady: report.warmReady,
    errorCount,
    thresholds: report.thresholds,
  }, null, 2))
  console.log(`性能采样报告: ${outputPath}`)
  return report.thresholds.passed ? 0 : 1
}

async function main() {
  if (process.argv[2]) return summarizeCoreReport(path.resolve(process.argv[2]))
  return collectBaselineSamples()
}

if (require.main === module) {
  main()
    .then(code => { process.exitCode = code })
    .catch(error => {
      console.error('性能基线采样失败:', error && (error.stack || error.message || String(error)))
      process.exitCode = 2
    })
}

module.exports = {
  PERF_SAMPLE_COUNT,
  percentile,
  summarize,
  buildPerformanceSummary,
  summarizeCoreReport,
  collectBaselineSamples,
}

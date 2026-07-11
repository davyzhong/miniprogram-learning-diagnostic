#!/usr/bin/env node
/**
 * 事件驱动性能基线报告生成器
 *
 * 读取 tmp/e2e/core/report.json，提取事件驱动指标（navigationMs, readyMs, durationMs），
 * 计算冷热启动的 P50/P90/P95，输出结构化基线报告。
 *
 * 用法：
 *   npm run perf:baseline
 *
 * 退出码：0 成功；1 报告不存在或数据不足
 */

const fs = require('node:fs')
const path = require('node:path')

const projectRoot = path.resolve(__dirname, '..')
const reportPath = path.join(projectRoot, 'tmp', 'e2e', 'core', 'report.json')
const outputDir = path.join(projectRoot, 'tmp', 'perf')
const outputPath = path.join(outputDir, 'baseline-report.json')

function percentile(sortedValues, p) {
  if (sortedValues.length === 0) return 0
  const index = Math.ceil(sortedValues.length * p) - 1
  return sortedValues[Math.max(0, Math.min(index, sortedValues.length - 1))]
}

function stats(values) {
  if (values.length === 0) return { count: 0, min: 0, p50: 0, p90: 0, p95: 0, max: 0 }
  const sorted = [...values].sort((a, b) => a - b)
  return {
    count: sorted.length,
    min: sorted[0],
    p50: percentile(sorted, 0.50),
    p90: percentile(sorted, 0.90),
    p95: percentile(sorted, 0.95),
    max: sorted[sorted.length - 1]
  }
}

function main() {
  if (!fs.existsSync(reportPath)) {
    console.error(`✗ 报告不存在: ${reportPath}`)
    console.error('  请先运行 npm run test:e2e:core 生成 E2E 报告')
    process.exit(1)
  }

  const report = JSON.parse(fs.readFileSync(reportPath, 'utf8'))
  const results = report.results || []

  // 区分页面结果和场景结果
  const allPageResults = results.filter(r => r.route)
  const pageResults = allPageResults.filter(r => typeof r.navigationMs === 'number')
  const scenarioResults = results.filter(r => r.steps && !r.route)

  const navigationMsValues = pageResults.map(r => r.navigationMs).filter(v => typeof v === 'number')
  const readyMsValues = pageResults.map(r => r.readyMs).filter(v => typeof v === 'number')
  const durationMsValues = pageResults.map(r => r.durationMs).filter(v => typeof v === 'number')

  const baseline = {
    generatedAt: new Date().toISOString(),
    source: 'tmp/e2e/core/report.json',
    summary: {
      totalPages: pageResults.length,
      totalScenarios: scenarioResults.length,
      allPassed: report.summary && report.summary.failed === 0
    },
    metrics: {
      navigationMs: stats(navigationMsValues),
      readyMs: stats(readyMsValues),
      durationMs: stats(durationMsValues)
    },
    perPage: pageResults.map(r => ({
      name: r.name,
      route: r.route,
      status: r.status,
      navigationMs: r.navigationMs,
      readyMs: r.readyMs,
      durationMs: r.durationMs
    }))
  }

  fs.mkdirSync(outputDir, { recursive: true })
  fs.writeFileSync(outputPath, JSON.stringify(baseline, null, 2))

  // 控制台摘要
  console.log('========== 事件驱动性能基线 ==========')
  console.log(`页面数: ${baseline.summary.totalPages} | 场景数: ${baseline.summary.totalScenarios} | 全部通过: ${baseline.summary.allPassed}`)
  console.log('')
  console.log('指标          |   P50   |   P90   |   P95   |   Max')
  console.log('--------------|---------|---------|---------|---------')
  for (const [metric, s] of Object.entries(baseline.metrics)) {
    console.log(`${metric.padEnd(13)} | ${String(s.p50).padStart(5)}ms | ${String(s.p90).padStart(5)}ms | ${String(s.p95).padStart(5)}ms | ${String(s.max).padStart(5)}ms`)
  }
  console.log('')
  console.log(`报告: ${outputPath}`)

  // 如果 readyMs 全部缺失（旧格式报告），警告
  if (readyMsValues.length === 0 && allPageResults.length > 0) {
    console.warn('')
    console.warn('⚠ 报告中没有 readyMs/navigationMs 数据（旧格式报告）。')
    console.warn('  请重新运行 npm run test:e2e:core 以获取事件驱动指标。')
  }

  process.exit(0)
}

main()

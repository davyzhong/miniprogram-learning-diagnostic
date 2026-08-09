// 学习修复指标页控制器级验收测试（不依赖 DevTools）。
// 用 page-harness 加载 repair-metrics.js，注入 mock cloud API，验证：
//   1. onLoad 带 studentId 后 loadData 调 cloud.getRepairMetrics 并渲染视图
//   2. 缺 studentId 时进入错误态且不请求后端
//   3. 后端抛错时展示错误文案且 onRetryTap 会重试
//   4. wxml 契约：status-view 组件、重试绑定与关键区块存在
//   5. 空 lpCode 卡点的 rowKey 兜底唯一
const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const { loadPage } = require('./helpers/page-harness')
const ROOT = path.resolve(__dirname, '..')

const METRICS = {
  metrics: {
    empty: false,
    totals: { bottlenecks: 1, verified: 1, repaired: 1, repairing: 0, verifiedNotPassed: 0, unverified: 0 },
    coverageRate: { numerator: 1, denominator: 1, percent: 100, smallSample: true },
    repairRate: { numerator: 0, denominator: 0, percent: 0, smallSample: true },
    buckets: { repaired: [{ lpCode: 'LP-001', name: '计算基础' }], repairing: [], verifiedNotPassed: [], unverified: [] },
    timeline: []
  }
}

function loadRepairMetricsPage(cloudMock) {
  const { page } = loadPage('miniprogram/pages/repair-metrics/repair-metrics.js', {
    modules: { '../../utils/cloud': cloudMock }
  })
  return page
}

test('repair-metrics 加载成功渲染双指标视图', async () => {
  const calls = []
  const page = loadRepairMetricsPage({
    getRepairMetrics: async studentId => { calls.push(studentId); return METRICS }
  })
  page.onLoad({ studentId: 'student-1', studentName: encodeURIComponent('小明') })
  await page._loadPromise
  assert.deepEqual(calls, ['student-1'])
  assert.equal(page.data.loading, false)
  assert.equal(page.data.view.empty, false)
  assert.equal(page.data.view.coverageCard.text, '100%（1/1）')
})

test('repair-metrics 缺 studentId 进入错误态且不请求后端', async () => {
  let called = false
  const page = loadRepairMetricsPage({
    getRepairMetrics: async () => { called = true; return METRICS }
  })
  page.onLoad({})
  await page._loadPromise
  assert.equal(called, false)
  assert.equal(page.data.loading, false)
  assert.equal(page.data.errorText, '缺少孩子档案信息')
})

test('repair-metrics 后端失败可重试', async () => {
  let attempt = 0
  const page = loadRepairMetricsPage({
    getRepairMetrics: async () => {
      attempt += 1
      if (attempt === 1) throw new Error('boom')
      return METRICS
    }
  })
  page.onLoad({ studentId: 'student-1' })
  await page._loadPromise
  assert.equal(page.data.errorText, '指标加载失败，请稍后重试')
  page.onRetryTap()
  await page._loadPromise
  assert.equal(page.data.errorText, '')
  assert.equal(page.data.view.empty, false)
})

test('repair-metrics wxml 契约：status-view 组件与指标区块', () => {
  const wxml = fs.readFileSync(path.join(ROOT, 'miniprogram/pages/repair-metrics/repair-metrics.wxml'), 'utf8')
  assert.match(wxml, /<status-view/)
  assert.match(wxml, /bind:retry="onRetryTap"/)
  assert.match(wxml, /验证覆盖率/)
  assert.match(wxml, /严格修复率/)
  assert.match(wxml, /卡点去向/)
  assert.match(wxml, /wx:key="rowKey"/)
})

test('repair-metrics 空 lpCode 卡点的 rowKey 兜底唯一', () => {
  const { buildRepairMetricsPageView } = require('../miniprogram/pages/repair-metrics/repair-metrics-presenter')
  const view = buildRepairMetricsPageView({
    metrics: {
      empty: false,
      totals: { bottlenecks: 2, verified: 0, repaired: 0, repairing: 0, verifiedNotPassed: 0, unverified: 2 },
      coverageRate: { numerator: 0, denominator: 2, percent: 0, smallSample: true },
      repairRate: { numerator: 0, denominator: 0, percent: 0, smallSample: true },
      buckets: { repaired: [], repairing: [], verifiedNotPassed: [], unverified: [{ lpCode: '', name: '' }, { lpCode: '', name: '' }] },
      timeline: []
    }
  })
  const keys = view.bucketGroups.flatMap(group => group.rows.map(row => row.rowKey))
  assert.equal(keys.length, 2)
  assert.equal(new Set(keys).size, 2)
})

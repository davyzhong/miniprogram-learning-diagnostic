const test = require('node:test')
const assert = require('node:assert/strict')

const {
  buildMonthLabel,
  currentMonth,
  shiftMonth,
  formatCost,
  eventTypeName,
  buildSummaryCards,
  buildBreakdown,
  buildDays,
  buildUsageState
} = require('../miniprogram/pages/ai-usage/ai-usage-presenter')

test('buildMonthLabel formats YYYY-MM into Chinese', () => {
  assert.equal(buildMonthLabel('2026-06'), '2026年6月')
  assert.equal(buildMonthLabel('2026-12'), '2026年12月')
  assert.equal(buildMonthLabel(''), '')
  assert.equal(buildMonthLabel('garbage'), 'garbage')
})

test('shiftMonth wraps year boundaries', () => {
  assert.equal(shiftMonth('2026-01', -1), '2025-12')
  assert.equal(shiftMonth('2025-12', 1), '2026-01')
  assert.equal(shiftMonth('2026-06', 1), '2026-07')
})

test('formatCost handles zero, small, and normal values', () => {
  assert.equal(formatCost(0), '0')
  assert.equal(formatCost(0.005), '<0.01')
  assert.equal(formatCost(0.03), '0.03')
  assert.equal(formatCost(1.234), '1.23')
})

test('eventTypeName maps known types and falls back', () => {
  assert.equal(eventTypeName('photo_analysis'), '拍照诊断')
  assert.equal(eventTypeName('paper_generation'), '试卷生成')
  assert.equal(eventTypeName('unknown'), 'unknown')
})

test('buildSummaryCards builds 4 cards from a summary', () => {
  const cards = buildSummaryCards({ totalTokens: 1500, totalCostCny: 0.08, callCount: 3, studentCount: 2 })
  assert.equal(cards.length, 4)
  assert.equal(cards[0].value, '1500')
  assert.equal(cards[1].value, '¥0.08')
  assert.equal(cards[2].value, '3')
  assert.equal(cards[3].value, '2')
})

test('buildSummaryCards returns empty array for null summary', () => {
  assert.deepEqual(buildSummaryCards(null).length, 0)
})

test('buildBreakdown maps byEventType into readable rows', () => {
  const rows = buildBreakdown({
    byEventType: [
      { eventType: 'photo_analysis', callCount: 2, totalTokens: 800, totalCostCny: 0.05 },
      { eventType: 'paper_generation', callCount: 1, totalTokens: 500, totalCostCny: 0.01 }
    ]
  })
  assert.equal(rows.length, 2)
  assert.equal(rows[0].name, '拍照诊断')
  assert.equal(rows[0].costText, '¥0.05')
})

test('buildDays groups events by Beijing day and sorts desc', () => {
  // 2026-06-15 18:00 北京（10:00 UTC 同日），2026-06-16 01:30 北京（17:30 UTC 次日）
  const events = [
    { _id: 'e1', eventType: 'photo_analysis', model: 'hy3-preview', totalTokens: 800, estimatedCostCny: 0.05, status: 'succeeded', createdAt: '2026-06-15T10:00:00Z' },
    { _id: 'e2', eventType: 'paper_generation', model: 'deepseek-v4-flash', totalTokens: 500, estimatedCostCny: 0.01, status: 'failed', errorMessage: 'timeout', createdAt: '2026-06-15T17:30:00Z' }
  ]
  const days = buildDays(events)
  // 跨天：e1 是 6/15，e2 是 6/16 → 两组
  assert.equal(days.length, 2)
  assert.equal(days[0].dayLabel, '6月16日') // desc 排序，6/16 在前
  assert.equal(days[0].items[0].statusText, '失败')
  assert.ok(days[0].items[0].errorMessage)
})

test('buildUsageState produces full view model with estimate notice', () => {
  const events = [
    { _id: 'e1', eventType: 'photo_analysis', model: 'hy3-preview', totalTokens: 800, estimatedCostCny: 0.05, status: 'succeeded', isEstimate: true, createdAt: '2026-06-15T10:00:00Z' }
  ]
  const summary = { totalTokens: 800, totalCostCny: 0.05, callCount: 1, studentCount: 1, byEventType: [{ eventType: 'photo_analysis', callCount: 1, totalTokens: 800, totalCostCny: 0.05 }] }
  const state = buildUsageState(events, summary, '2026-06', '')
  assert.equal(state.monthLabel, '2026年6月')
  assert.equal(state.hasEvents, true)
  assert.match(state.estimateNotice, /不代表应付款项/)
  assert.equal(state.summaryCards.length, 4)
  assert.equal(state.breakdown.length, 1)
})

test('buildUsageState applies activeFilter to events', () => {
  const events = [
    { _id: 'e1', eventType: 'photo_analysis', model: 'hy3-preview', totalTokens: 800, estimatedCostCny: 0.05, status: 'succeeded', createdAt: '2026-06-15T10:00:00Z' },
    { _id: 'e2', eventType: 'paper_generation', model: 'deepseek-v4-flash', totalTokens: 500, estimatedCostCny: 0.01, status: 'succeeded', createdAt: '2026-06-15T11:00:00Z' }
  ]
  const state = buildUsageState(events, null, '2026-06', 'paper_generation')
  // 过滤后只剩 paper_generation
  assert.equal(state.days.length, 1)
  assert.equal(state.days[0].items.length, 1)
  assert.equal(state.days[0].items[0].name, '试卷生成')
})

test('buildUsageState shows empty state when no events', () => {
  const state = buildUsageState([], null, '2026-06', '')
  assert.equal(state.hasEvents, false)
  assert.ok(state.emptyTitle)
})

const test = require('node:test')
const assert = require('node:assert/strict')

const {
  formatRelativeTime,
  formatChineseDateTime,
  formatDate,
  formatDateTime,
  formatClock,
  formatMonthDay,
  beijingParts,
  severityBadgeClass,
  formatBottleneckDisplayName,
  formatBottleneckDisplayList,
  getCategoryName,
  trendIcon,
  CATEGORY_NAMES
} = require('../miniprogram/utils/util')

test('formats relative time using a supplied reference time', () => {
  const now = new Date('2026-06-11T12:00:00+08:00')
  assert.equal(formatRelativeTime(new Date('2026-06-11T11:55:00+08:00'), now), '5分钟前')
  assert.equal(formatRelativeTime(new Date('2026-06-10T12:00:00+08:00'), now), '昨天')
})

test('formats Chinese date time', () => {
  const date = new Date('2026-06-11T09:05:00+08:00')
  assert.equal(formatChineseDateTime(date), '2026年6月11日 9:05')
})

test('formatDate pads month and day for both Date objects and ISO strings', () => {
  assert.equal(formatDate(new Date('2026-01-05T00:00:00+08:00')), '2026-01-05')
  assert.equal(formatDate('2026-12-31T23:59:59+08:00'), '2026-12-31')
})

test('formatDateTime appends zero-padded hours and minutes', () => {
  assert.equal(formatDateTime(new Date('2026-06-11T09:05:00+08:00')), '2026-06-11 09:05')
  assert.equal(formatDateTime('2026-06-11T18:30:00+08:00'), '2026-06-11 18:30')
})

test('formatClock and formatMonthDay are Beijing-timezone and handle edges', () => {
  // 2026-01-07 00:30 UTC = 08:30 北京时间
  assert.equal(formatClock('2026-01-07T00:30:00Z'), '08:30')
  // 午夜边界：2026-03-05 16:00 UTC = 00:00 次日北京时间
  assert.equal(formatClock('2026-03-05T16:00:00Z'), '00:00')
  assert.equal(formatMonthDay('2026-03-05T16:00:00Z'), '3月6日')
  // 无效/空输入返回空串
  assert.equal(formatClock(''), '')
  assert.equal(formatClock('not-a-date'), '')
  assert.equal(formatMonthDay(null), '')
})

test('beijingParts extracts UTC+8 components for a UTC timestamp', () => {
  // 2026-06-15 10:00 UTC = 18:00 北京时间，同一天
  const p = beijingParts('2026-06-15T10:00:00Z')
  assert.deepEqual(p, { year: 2026, month: 6, day: 15, hour: 18, minute: 0 })
  // 跨天：2026-06-15 17:30 UTC = 01:30 次日（6/16）北京时间
  const next = beijingParts('2026-06-15T17:30:00Z')
  assert.equal(next.day, 16)
  assert.equal(next.hour, 1)
  assert.equal(beijingParts('bad'), null)
})

test('severityBadgeClass maps known severities and falls back to badge-mid', () => {
  assert.equal(severityBadgeClass('高'), 'badge-high')
  assert.equal(severityBadgeClass('中高'), 'badge-high')
  assert.equal(severityBadgeClass('中'), 'badge-mid')
  assert.equal(severityBadgeClass('低'), 'badge-low')
  assert.equal(severityBadgeClass('未知'), 'badge-mid')
  assert.equal(severityBadgeClass(undefined), 'badge-mid')
})

test('getCategoryName resolves registered prefixes and returns code or 未知 otherwise', () => {
  assert.equal(getCategoryName('LP-OP-001'), CATEGORY_NAMES['LP-OP'])
  assert.equal(getCategoryName('LP-FD-99'), CATEGORY_NAMES['LP-FD'])
  // unknown prefix returns the original code so UI can still render something meaningful
  assert.equal(getCategoryName('LP-XX-1'), 'LP-XX-1')
  assert.equal(getCategoryName(''), '未知')
  assert.equal(getCategoryName(null), '未知')
  assert.equal(getCategoryName(undefined), '未知')
})

test('formatBottleneckDisplayName hides internal LP codes behind readable names', () => {
  assert.equal(formatBottleneckDisplayName({ lpCode: 'LP-001' }), '计算基础')
  assert.equal(formatBottleneckDisplayName({ lpCode: 'LP-008' }), '审题理解')
  assert.equal(formatBottleneckDisplayName({ lpCode: 'LP-002', lpName: '分数运算错误' }), '分数运算')
  assert.equal(formatBottleneckDisplayName({ lpCode: 'LP-001', summary: '竖式计算' }), '竖式计算')
  assert.equal(formatBottleneckDisplayName({ lpCode: 'LP-XXX' }), '待确认卡点')
})

test('formatBottleneckDisplayList joins readable names without exposing LP codes', () => {
  const text = formatBottleneckDisplayList([
    { lpCode: 'LP-001' },
    { lpCode: 'LP-008' }
  ])
  assert.equal(text, '计算基础、审题理解')
  assert.doesNotMatch(text, /LP-\d+/)
})

test('trendIcon picks the matching arrow and defaults to stable', () => {
  assert.equal(trendIcon('up'), '↑')
  assert.equal(trendIcon('stable'), '→')
  assert.equal(trendIcon('down'), '↓')
  assert.equal(trendIcon('new'), '新')
  assert.equal(trendIcon('unknown'), '→')
  assert.equal(trendIcon(undefined), '→')
})

test('formatRelativeTime returns empty string for falsy input and formats older dates as month-day', () => {
  assert.equal(formatRelativeTime(null), '')
  assert.equal(formatRelativeTime(undefined), '')
  const now = new Date('2026-06-11T12:00:00+08:00')
  assert.equal(formatRelativeTime(new Date('2026-06-01T12:00:00+08:00'), now), '6月1日')
  assert.equal(formatRelativeTime(new Date('2026-06-11T11:59:30+08:00'), now), '刚刚')
})

test('formatChineseDateTime returns empty string when given no date', () => {
  assert.equal(formatChineseDateTime(null), '')
  assert.equal(formatChineseDateTime(undefined), '')
})

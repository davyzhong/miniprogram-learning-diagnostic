const test = require('node:test')
const assert = require('node:assert/strict')

const { formatRelativeTime, formatChineseDateTime } = require('../miniprogram/utils/util')

test('formats relative time using a supplied reference time', () => {
  const now = new Date('2026-06-11T12:00:00+08:00')
  assert.equal(formatRelativeTime(new Date('2026-06-11T11:55:00+08:00'), now), '5分钟前')
  assert.equal(formatRelativeTime(new Date('2026-06-10T12:00:00+08:00'), now), '昨天')
})

test('formats Chinese date time', () => {
  const date = new Date('2026-06-11T09:05:00+08:00')
  assert.equal(formatChineseDateTime(date), '2026年6月11日 9:05')
})

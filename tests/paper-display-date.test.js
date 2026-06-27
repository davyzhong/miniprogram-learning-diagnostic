const test = require('node:test')
const assert = require('node:assert/strict')

// 时区回归守护：paper-display 的日期派生必须基于北京时间（UTC+8），
// 不能用 local getMonth/getDate（否则非北京时区设备日期/试卷编号错乱）。
const {
  paperDateCode,
  paperCodeOf,
  paperPageInfo,
  buildPaperDisplay
} = require('../miniprogram/utils/paper-display')

test('paperDateCode trusts an explicit ISO date prefix when present', () => {
  // 带 YYYY-MM-DD 前缀的 ISO 串直接取前缀日期（设计如此：显式日期优先）
  assert.equal(paperDateCode('2026-06-15T10:00:00Z'), '20260615')
  assert.equal(paperDateCode('2026-03-09T08:00:00+08:00'), '20260309')
})

test('paperDateCode falls back to Beijing-time YYYYMMDD for non-prefixed inputs', () => {
  // Date 对象（无 ISO 前缀可匹配）走 beijingParts：2026-06-15 17:30 UTC = 次日 6/16 北京
  const d = new Date('2026-06-15T17:30:00Z')
  assert.equal(paperDateCode(d), '20260616')
  // 同日：2026-06-15 10:00 UTC = 当日 18:00 北京
  assert.equal(paperDateCode(new Date('2026-06-15T10:00:00Z')), '20260615')
})

test('paperCodeOf falls back to a Beijing-time date code for Date inputs', () => {
  // 无 savedCode，Date 对象派生；2026-07-01 10:00 UTC = 当日 18:00 北京
  const code = paperCodeOf({ subject: 'math', generatedAt: new Date('2026-07-01T10:00:00Z') })
  assert.equal(code, '数学-20260701')
})

test('buildPaperDisplay date chip shows the calendar date for ISO paperDate', () => {
  // dateChip 把 paperDate 当作纯日期（截取 YYYY-MM-DD 再固定午夜），
  // 展示该日期的月日。实际 DB 存的是 ISO 字符串。
  const display = buildPaperDisplay({
    type: 'verification',
    subject: 'math',
    paperDate: '2026-06-15T17:30:00+08:00'
  }, '数学')
  const dateChip = display.chips.find(c => c.startsWith('试卷日期'))
  assert.equal(dateChip, '试卷日期 6月15日')
  // 缺 paperDate 时不生成日期 chip
  const noDate = buildPaperDisplay({ type: 'verification', subject: 'math' }, '数学')
  assert.equal(noDate.chips.find(c => c.startsWith('试卷日期')), undefined)
})

test('paperPageInfo computes student and answer page split', () => {
  const info = paperPageInfo({ type: 'verification', totalPages: 3, answerPages: 1 })
  assert.equal(info.studentPages, 2)
  assert.equal(info.answerPages, 1)
  assert.equal(info.totalPages, 3)
})

const test = require('node:test')
const assert = require('node:assert/strict')

// 时区回归守护：paper-display 的日期派生必须基于北京时间（UTC+8），
// 不能用 local getMonth/getDate（否则非北京时区设备日期/试卷编号错乱）。
const {
  paperDateCode,
  paperCodeOf,
  paperPageInfo,
  paperCoverageText,
  buildPaperDisplay
} = require('../miniprogram/utils/paper-display')

function visiblePaperFields(display) {
  return {
    bottleneckText: display.bottleneckText,
    coverageText: display.coverageText,
    hierarchy: display.bottleneckHierarchy.groups.map(group => ({
      title: group.title,
      summaryText: group.summaryText,
      families: (group.families || []).map(family => ({
        title: family.title,
        summaryText: family.summaryText,
        items: (family.items || []).map(item => ({
          displayName: item.displayName,
          detailText: item.detailText
        }))
      }))
    }))
  }
}

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

test('legacy papers summarize unknown fine-target IDs by reliable count without exposing them', () => {
  const bottleneckTargets = Array.from(
    { length: 30 },
    (_, index) => `BN-LEGACY-UNMAPPED-${String(index + 1).padStart(2, '0')}`
  )
  const paper = {
    _id: 'legacy-paper-30-targets',
    type: 'verification',
    subject: 'math',
    paperDisplayCode: '数学-20260714-01',
    bottleneckTargets,
    questions: bottleneckTargets.map((bottleneckId, index) => ({
      index: index + 1,
      content: `${index + 1} + 1 =`,
      bottleneckId
    }))
  }

  const display = buildPaperDisplay(paper, '数学')

  assert.equal(display.paperCode, '数学-20260714-01')
  assert.equal(display.bottleneckText, '覆盖 30 个数学学习卡点')
  assert.equal(display.coverageText, '覆盖 30 个数学学习卡点')
  assert.equal(display.bottleneckHierarchy.totalCount, 30)
  assert.doesNotMatch(JSON.stringify(visiblePaperFields(display)), /BN-|LP-|ERR-/)
})

test('paper coverage resolves known taxonomy IDs and compacts readable names', () => {
  const paper = {
    subject: 'math',
    bottleneckTargets: [
      'BN-INT-MUL-PARTIAL-OMIT',
      'BN-INT-DIV-DIVISOR-SIMPLIFY',
      'BN-DEC-PLACE-VALUE-WEAK',
      'BN-DEC-MUL-POINT-COUNT'
    ]
  }

  const display = buildPaperDisplay(paper, '数学')

  assert.equal(
    display.coverageText,
    '重点复测：多位数乘法拆分时遗漏部分积、长除法中把两位除数误简化为一位数、小数位值和数量级意识不稳等 4 个学习卡点'
  )
  assert.doesNotMatch(JSON.stringify(visiblePaperFields(display)), /BN-|LP-|ERR-/)
  assert.deepEqual(
    display.bottleneckHierarchy.groups.flatMap(group => group.families)
      .flatMap(family => family.items).map(item => item.bottleneckId).sort(),
    [...paper.bottleneckTargets].sort()
  )
})

test('paper coverage uses a neutral fallback without reliable names or counts', () => {
  assert.equal(paperCoverageText({ subject: 'math' }, '数学'), '覆盖本轮重点学习内容')
  assert.equal(buildPaperDisplay({ subject: 'math' }, '数学').coverageText, '覆盖本轮重点学习内容')
})

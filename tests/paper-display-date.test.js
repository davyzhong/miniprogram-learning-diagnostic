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
    bottleneckSummaries: display.bottleneckSummaries,
    bottleneckText: display.bottleneckText,
    coverageText: display.coverageText,
    hierarchy: display.bottleneckHierarchy.groups.map(group => ({
      categoryTitle: group.categoryTitle,
      title: group.title,
      summaryText: group.summaryText,
      families: (group.families || []).map(family => ({
        familyTitle: family.familyTitle,
        title: family.title,
        summaryText: family.summaryText,
        items: (family.items || []).map(item => ({
          displayName: item.displayName,
          displayTitle: item.displayTitle,
          title: item.title,
          lpName: item.lpName,
          bottleneckText: item.bottleneckText,
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
  assert.equal(display.bottleneckText, '')
  assert.equal(display.coverageText, '覆盖 30 个数学学习卡点')
  assert.equal(display.bottleneckHierarchy.totalCount, 30)
  assert.equal(
    display.bottleneckHierarchy.groups.flatMap(group => group.families)
      .flatMap(family => family.items).length,
    0
  )
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

test('paper display sanitizes embedded and opaque identifiers at every visible boundary', () => {
  const opaqueId = 'PRIVATESTUDENTTOKEN123456789'
  const display = buildPaperDisplay({
    subject: 'math',
    bottleneckSummaries: [
      '重点 BN-UNKNOWN-1',
      `提醒 ${opaqueId}`
    ],
    bottleneckTargets: [{
      bottleneckId: 'BN-UNKNOWN-TARGET',
      displayName: '分数复习 BN-UNKNOWN-3',
      categoryId: 'MATH-CAT-UNKNOWN',
      categoryTitle: '重点 BN-UNKNOWN-4',
      familyId: 'MATH-FAM-UNKNOWN',
      familyTitle: `组别 ${opaqueId}`,
      detailText: '详情 ERR-UNKNOWN-1'
    }]
  }, '数学')
  const visible = visiblePaperFields(display)
  const visibleText = JSON.stringify(visible)

  assert.match(display.bottleneckText, /重点/)
  assert.match(display.bottleneckText, /提醒/)
  assert.match(visible.hierarchy[0].title, /重点/)
  assert.match(visible.hierarchy[0].families[0].title, /组别/)
  assert.match(visible.hierarchy[0].families[0].items[0].displayName, /分数复习/)
  assert.doesNotMatch(visibleText, /BN-|LP-|ERR-|PRIVATESTUDENTTOKEN/)
  const countFallback = paperCoverageText(
    { subject: 'math', bottleneckTargets: ['BN-UNKNOWN-SUBJECT'] },
    '数学 BN-UNKNOWN-5'
  )
  assert.match(countFallback, /^覆盖 1 个数学/)
  assert.doesNotMatch(countFallback, /BN-/)
})

test('paper display uses concrete target count consistently when pack metadata disagrees', () => {
  const display = buildPaperDisplay({
    subject: 'math',
    verificationPack: { totalTargets: 5 },
    bottleneckTargets: [
      'BN-INT-MUL-PARTIAL-OMIT',
      'BN-DEC-PLACE-VALUE-WEAK',
      'BN-FRACTION-ADD-DENOM-MISMATCH',
      'BN-RATIO-MEANING-ORDER'
    ]
  }, '数学')

  assert.match(display.coverageText, /4 个学习卡点$/)
  assert.equal(display.bottleneckHierarchy.totalCount, 4)
  assert.match(display.bottleneckHierarchy.summaryText, /4 个细分卡点$/)
})

test('paper display uses metadata count consistently when no concrete targets exist', () => {
  const display = buildPaperDisplay({
    subject: 'math',
    verificationPack: { totalTargets: 5 }
  }, '数学')

  assert.equal(display.bottleneckText, '')
  assert.equal(display.coverageText, '覆盖 5 个数学学习卡点')
  assert.equal(display.bottleneckHierarchy.totalCount, 5)
})

test('paper display counts canonical math targets after alias normalization', () => {
  const display = buildPaperDisplay({
    subject: 'math',
    bottleneckSummaries: ['旧摘要一', '旧摘要二'],
    bottleneckTargets: [
      'BN-FRACTION-ADD-COMMON',
      'BN-FRACTION-ADD-UNLIKE'
    ]
  }, '数学')
  const items = display.bottleneckHierarchy.groups.flatMap(group => group.families)
    .flatMap(family => family.items)

  assert.equal(items.length, 1)
  assert.equal(display.bottleneckHierarchy.totalCount, 1)
  assert.equal(display.bottleneckHierarchy.summaryText, '1 类 · 1 个细分卡点')
  assert.equal(display.coverageText, `重点复测：${items[0].displayName}`)
})

test('paper display retains unique opaque summary count without exposing summary IDs', () => {
  const opaqueA = 'PRIVATEPAPERSUMMARY123456789A'
  const opaqueB = 'PRIVATEPAPERSUMMARY123456789B'
  const display = buildPaperDisplay({
    subject: 'math',
    bottleneckSummaries: [opaqueA, opaqueB, opaqueA]
  }, '数学')

  assert.deepEqual(display.bottleneckSummaries, [])
  assert.equal(display.bottleneckText, '')
  assert.equal(display.coverageText, '覆盖 2 个数学学习卡点')
  assert.equal(display.bottleneckHierarchy.totalCount, 2)
  assert.equal(display.bottleneckHierarchy.summaryText, '2 个细分卡点')
  assert.doesNotMatch(JSON.stringify(visiblePaperFields(display)), /PRIVATEPAPERSUMMARY/)
})

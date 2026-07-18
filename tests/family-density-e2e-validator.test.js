const test = require('node:test')
const assert = require('node:assert/strict')

const {
  findRenderedInternalCodes,
  validateFamilyDensityMetrics
} = require('../scripts/devtools-family-density-e2e')

function rect(left, top, width, height) {
  return { left, top, width, height }
}

function validMetrics(width, height) {
  const isCompact = width <= 390
  const firstTop = 178
  const secondTop = isCompact ? 650 : 660
  return {
    viewport: { width, height },
    pageWidth: width,
    householdSummaryRect: rect(14, 72, width - 28, 92),
    cards: [
      {
        cardRect: rect(14, firstTop, width - 28, 458),
        identityRect: rect(24, firstTop + 10, width - 48, 58),
        metricRect: rect(24, firstTop + 78, width - 48, 52),
        priorityRect: rect(24, firstTop + 140, width - 48, 60),
        actionRects: [rect(width - 102, firstTop + 148, 68, 44)],
        interactiveRects: [
          rect(24, firstTop + 10, width - 48, 58),
          rect(24, firstTop + 78, width - 48, 52),
          rect(24, firstTop + 140, width - 48, 60)
        ],
        adjacentRects: [
          rect(24, firstTop + 10, width - 48, 58),
          rect(24, firstTop + 78, width - 48, 52),
          rect(24, firstTop + 140, width - 48, 60)
        ]
      },
      {
        cardRect: rect(14, secondTop, width - 28, 458),
        identityRect: rect(24, secondTop + 10, width - 48, 58),
        metricRect: rect(24, secondTop + 78, width - 48, 52),
        priorityRect: rect(24, secondTop + 140, width - 48, 60),
        actionRects: [rect(width - 102, secondTop + 148, 68, 44)],
        interactiveRects: [
          rect(24, secondTop + 10, width - 48, 58),
          rect(24, secondTop + 78, width - 48, 52),
          rect(24, secondTop + 140, width - 48, 60)
        ],
        adjacentRects: [
          rect(24, secondTop + 10, width - 48, 58),
          rect(24, secondTop + 78, width - 48, 52),
          rect(24, secondTop + 140, width - 48, 60)
        ]
      }
    ]
  }
}

test('accepts the 390x844 family-density target fixture', () => {
  assert.equal(validateFamilyDensityMetrics(validMetrics(390, 844)), true)
})

test('accepts the 360x800 narrow family-density target fixture', () => {
  assert.equal(validateFamilyDensityMetrics(validMetrics(360, 800)), true)
})

test('accepts the 430x932 family-density target fixture', () => {
  assert.equal(validateFamilyDensityMetrics(validMetrics(430, 932)), true)
})

test('rejects a partly clipped second child identity at 390x844', () => {
  const metrics = validMetrics(390, 844)
  metrics.cards[1].identityRect.top = 800
  assert.throws(() => validateFamilyDensityMetrics(metrics), /second child identity.*844px/i)
})

test('rejects clipped second child metrics at 430x932', () => {
  const metrics = validMetrics(430, 932)
  metrics.cards[1].metricRect.top = 900
  assert.throws(() => validateFamilyDensityMetrics(metrics), /second child metric.*932px/i)
})

test('rejects adjacent block overlap', () => {
  const metrics = validMetrics(390, 844)
  metrics.cards[0].adjacentRects[1].top = 220
  assert.throws(() => validateFamilyDensityMetrics(metrics), /overlap/i)
})

test('rejects horizontal page and card overflow', () => {
  const pageMetrics = validMetrics(390, 844)
  pageMetrics.pageWidth = 400
  assert.throws(() => validateFamilyDensityMetrics(pageMetrics), /horizontal overflow/i)

  const cardMetrics = validMetrics(390, 844)
  cardMetrics.cards[0].cardRect.width = 390
  assert.throws(() => validateFamilyDensityMetrics(cardMetrics), /card.*viewport/i)
})

test('rejects a clipped priority action', () => {
  const metrics = validMetrics(390, 844)
  metrics.cards[0].boundedRects = [{
    label: 'priority action',
    rect: rect(300, 326, 60, 44),
    containerRect: rect(24, 318, 320, 60)
  }]
  assert.throws(() => validateFamilyDensityMetrics(metrics), /action.*clipped/i)
})

test('rejects interactive rows below practical height', () => {
  const metrics = validMetrics(390, 844)
  metrics.cards[0].interactiveRects[0].height = 40
  assert.throws(() => validateFamilyDensityMetrics(metrics), /practical height/i)
})

test('rendered internal-code detector allows readable paper codes', () => {
  const text = '试卷 数学-20260712-06、MATH-001、MATH-20260613-01 可以阅读。'
  assert.deepEqual(findRenderedInternalCodes(text), [])
})

test('rendered internal-code detector rejects backend and opaque identifiers', () => {
  const text = [
    'BN-DECIMAL-01 LP-001 ERR-LOAD-01 NODE-A RES-MATH-01 CHI-READ-01',
    'MATH-NUM-DEC-MUL-POINT TASK-MATH-01 PAGE-HOME cloud://prod/file',
    '665f8c1a2b3c4d5e6f708192'
  ].join(' ')
  assert.deepEqual(findRenderedInternalCodes(text), [
    'BN-DECIMAL-01',
    'LP-001',
    'ERR-LOAD-01',
    'NODE-A',
    'RES-MATH-01',
    'CHI-READ-01',
    'MATH-NUM-DEC-MUL-POINT',
    'TASK-MATH-01',
    'PAGE-HOME',
    'cloud://prod/file',
    '665f8c1a2b3c4d5e6f708192'
  ])
})

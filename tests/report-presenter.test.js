const test = require('node:test')
const assert = require('node:assert/strict')

const { buildReportView } = require('../miniprogram/pages/report/report-presenter')

test('builds verification report counters and chart widths', () => {
  const view = buildReportView({
    type: 'verification',
    bottlenecks: [
      { lpCode: 'LP-001', errorCount: 4, status: 'worsened' },
      { lpCode: 'LP-002', errorCount: 2, status: 'improved' }
    ],
    errorDetails: [{ questionContent: '1 + 1' }]
  })

  assert.equal(view.isVerification, true)
  assert.equal(view.improvedCount, 1)
  assert.equal(view.worsenedCount, 1)
  assert.deepEqual(view.bottleneckList.map(item => item.barWidth), [100, 50])
  assert.equal(view.errorDetailList[0].displayIndex, '1.')
})

test('diagnosis report zeroes improvement counters and shows next step when bottlenecks exist', () => {
  const view = buildReportView({
    type: 'diagnosis',
    bottlenecks: [
      { lpCode: 'LP-001', errorCount: 3, status: 'found' }
    ],
    errorDetails: []
  })

  assert.equal(view.isVerification, false)
  assert.equal(view.improvedCount, 0)
  assert.equal(view.worsenedCount, 0)
  assert.equal(view.showNextStep, true)
  assert.equal(view.hasBottlenecks, true)
  assert.equal(view.hasErrorDetails, false)
})

test('empty bottleneck and detail lists render without NaN widths', () => {
  const view = buildReportView({ type: 'diagnosis' })

  assert.equal(view.hasBottlenecks, false)
  assert.deepEqual(view.bottleneckList, [])
  assert.equal(view.hasErrorDetails, false)
  assert.deepEqual(view.errorDetailList, [])
  assert.equal(view.showNextStep, false)
  assert.equal(view.bottleneckList.some(item => Number.isNaN(item.barWidth)), false)
})

test('bar width falls back to a non-NaN value when errorCount is missing', () => {
  const view = buildReportView({
    type: 'verification',
    bottlenecks: [
      { lpCode: 'LP-001' },
      { lpCode: 'LP-002', errorCount: 0 }
    ]
  })

  assert.ok(view.bottleneckList.every(item => Number.isFinite(item.barWidth)))
  assert.deepEqual(view.bottleneckList.map(item => item.barWidth), [0, 0])
})

test('builds a directly readable report headline and source summary', () => {
  const view = buildReportView({
    type: 'diagnosis',
    changeSummary: '发现分数运算卡点',
    summary: '旧摘要',
    imageFiles: [{ fileID: 'one' }, { fileID: 'two' }],
    bottlenecks: [{ lpCode: 'LP-001', lpName: '分数运算', status: 'found', errorCount: 2 }]
  })

  assert.equal(view.headline, '发现分数运算卡点')
  assert.equal(view.sourceImageCount, 2)
  assert.equal(view.bottleneckList[0].statusText, '需要验证')
  assert.equal(view.bottleneckList[0].statusClass, 'pending')
})

test('report headline falls back to comparison summary then summary', () => {
  assert.equal(buildReportView({ comparisonSummary: '单位换算已有改善' }).headline, '单位换算已有改善')
  assert.equal(buildReportView({ summary: '本次诊断摘要' }).headline, '本次诊断摘要')
})

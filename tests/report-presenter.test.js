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

const test = require('node:test')
const assert = require('node:assert/strict')

const {
  classifyReportDisplay,
  classifyPaperDisplay,
  paperCodeOf,
  bottleneckLabelOf,
  bottleneckListText,
  buildStatusText,
  isStaleStatusReport,
  isVisibleTimelineReport,
  isMainTimelinePaper
} = require('../miniprogram/utils/learning-records')

test('learning record helpers classify main reports and compact status states', () => {
  assert.deepEqual(classifyReportDisplay({ status: 'completed', type: 'diagnosis' }), {
    displayLevel: 'main',
    kind: 'diagnosis-report'
  })
  assert.deepEqual(classifyReportDisplay({ status: 'completed', type: 'verification' }), {
    displayLevel: 'main',
    kind: 'verification-report'
  })
  assert.deepEqual(classifyReportDisplay({ status: 'analyzing' }), {
    displayLevel: 'status',
    kind: 'status'
  })
  assert.equal(buildStatusText({ status: 'timeout' }), '分析可能超时，可刷新或重试')
})

test('learning record helpers classify verification papers and hide tool papers', () => {
  assert.deepEqual(classifyPaperDisplay({ type: 'verification' }), {
    displayLevel: 'main',
    kind: 'verification-paper'
  })
  assert.deepEqual(classifyPaperDisplay({ type: 'default-diagnosis' }), {
    displayLevel: 'hidden',
    kind: 'tool-history'
  })
  assert.equal(isMainTimelinePaper({ type: 'verification' }), true)
  assert.equal(isMainTimelinePaper({ type: 'default-diagnosis' }), false)
})

test('learning record helpers prefer paper display code and readable bottleneck labels', () => {
  assert.equal(paperCodeOf({ paperDisplayCode: '数学-20260613-01' }), '数学-20260613-01')
  assert.equal(paperCodeOf({ paperCode: 'MATH-001' }), 'MATH-001')
  assert.equal(bottleneckLabelOf({ id: 'LP-008', summary: '审题理解' }), '审题理解')
  assert.equal(bottleneckLabelOf({ lpCode: 'LP-001' }), '计算基础')
  assert.equal(bottleneckListText([{ lpCode: 'LP-008' }, { lpCode: 'LP-001' }]), '审题理解、计算基础')
})

test('learning record helpers hide archived and stale transient reports', () => {
  const now = new Date('2026-06-13T10:00:00+08:00').getTime()
  assert.equal(isStaleStatusReport({
    status: 'analyzing',
    updatedAt: '2026-06-13T09:10:00+08:00'
  }, now), true)
  assert.equal(isStaleStatusReport({
    status: 'analyzing',
    updatedAt: '2026-06-13T09:45:00+08:00'
  }, now), false)
  assert.equal(isVisibleTimelineReport({
    status: 'failed',
    isArchived: true,
    updatedAt: '2026-06-13T09:59:00+08:00'
  }, now), false)
  assert.equal(isVisibleTimelineReport({
    status: 'completed',
    createdAt: '2026-06-10T09:00:00+08:00'
  }, now), true)
})

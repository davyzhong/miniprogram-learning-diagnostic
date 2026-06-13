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
const {
  buildPaperCodeMap,
  buildPaperDisplay,
  paperPageInfo
} = require('../miniprogram/utils/paper-display')

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

test('paper display helper builds stable codes, page text and bottleneck summaries', () => {
  const display = buildPaperDisplay({
    _id: 'paper-1',
    subject: 'math',
    type: 'verification',
    paperDisplayCode: '数学-20260613-01',
    paperDate: '2026-06-13',
    questions: Array.from({ length: 6 }, (_, index) => ({ index: index + 1, lpCode: 'LP-001', lpName: '计算错误' })),
    bottleneckSummaries: ['计算错误'],
    studentPages: 1,
    answerPages: 1,
    totalPages: 2
  }, '数学')

  assert.equal(display.paperTitle, '验证试卷')
  assert.equal(display.paperCode, '数学-20260613-01')
  assert.equal(display.questionCount, 6)
  assert.equal(display.bottleneckText, '计算错误')
  assert.equal(display.pageSummary, '学生卷 1 页 · 答案 1 页 · 共 2 页')
  assert.deepEqual(display.chips, ['试卷日期 6月13日', '6题', '学生卷1页', '答案1页'])

  assert.deepEqual(paperPageInfo({ totalPages: 1 }), {
    totalPages: 1,
    studentPages: 1,
    answerPages: 0,
    pageSummary: '共 1 页 · A4 纸张',
    studentPagesText: '学生卷1页',
    answerPagesText: '',
    totalPagesText: '共1页'
  })
})

test('paper display helper assigns readable legacy codes by subject and paper date', () => {
  const codeMap = buildPaperCodeMap([
    {
      _id: 'paper-late',
      subject: 'math',
      type: 'verification',
      generatedAt: '2026-06-12T10:34:00+08:00',
      paperDate: '2026-06-12'
    },
    {
      _id: 'paper-early',
      subject: 'math',
      type: 'verification',
      generatedAt: '2026-06-12T09:47:00+08:00',
      paperDate: '2026-06-12'
    }
  ], '数学')

  assert.equal(codeMap.get('paper-early'), '数学-20260612-01')
  assert.equal(codeMap.get('paper-late'), '数学-20260612-02')
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

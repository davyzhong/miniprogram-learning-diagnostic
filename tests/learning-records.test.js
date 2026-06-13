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

const {
  buildHistoryState,
  buildTimelineEvents
} = require('../miniprogram/pages/upload-history/upload-history-presenter')

const {
  buildPaperPreviewState,
  buildQuestionPreview,
  buildWorkbenchStatus
} = require('../miniprogram/pages/paper-preview/paper-preview-presenter')

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

test('upload history presenter builds timeline state and paper events without page instance data', () => {
  const reports = [{
    _id: 'report-1',
    type: 'diagnosis',
    status: 'completed',
    subject: 'math',
    createdAt: '2026-06-12T09:31:00+08:00',
    imageFiles: [{ fileID: 'cloud://photo-1', fileName: '数学照片1', ocrSummary: '计算题错题' }],
    bottlenecks: [{ lpCode: 'LP-001' }]
  }]
  const papers = [{
    _id: 'paper-1',
    type: 'verification',
    subject: 'math',
    generatedAt: '2026-06-12T10:34:00+08:00',
    paperDate: '2026-06-12',
    questions: [{ lpCode: 'LP-001' }],
    bottleneckSummaries: ['计算基础']
  }]

  const { events, statusItems } = buildTimelineEvents(reports, papers, new Map([['cloud://photo-1', 'https://temp/photo-1']]), 'math', '数学')
  const state = buildHistoryState(events, 'math', statusItems)

  assert.equal(state.days.length, 1)
  assert.equal(state.days[0].events.length, 2)
  assert.equal(state.days[0].events[0].kind, 'verification-paper')
  assert.equal(state.days[0].events[0].paperCode, '数学-20260612-01')
  assert.match(state.days[0].events[0].url, /paper-preview/)
  assert.match(state.days[0].events[0].paperCodeUrl, /paper-preview/)
  assert.match(state.days[0].events[0].statusUrl, /upload/)
  assert.ok(state.days[0].events[0].chipItems.every(item => item.text && item.url))
  assert.match(state.days[0].events[1].url, /report/)
  assert.ok(state.days[0].events[1].chipItems.every(item => item.text && item.url))
  assert.equal(state.filters.find(item => item.key === 'math').count, 2)
})

test('paper preview presenter builds workbench state, question preview and feedback copy', () => {
  const paper = {
    _id: 'paper-1',
    studentId: 'student-1',
    subject: 'math',
    type: 'verification',
    paperDisplayCode: '数学-20260612-04',
    paperDate: '2026-06-12',
    pdfFileId: 'cloud://paper.pdf',
    questions: Array.from({ length: 5 }, (_, index) => ({
      index: index + 1,
      content: `题目${index + 1}`,
      lpCode: 'LP-008'
    })),
    bottleneckSummaries: ['审题理解'],
    studentPages: 1,
    answerPages: 1,
    totalPages: 2
  }
  const report = {
    _id: 'report-1',
    status: 'completed',
    summary: '审题理解已有改善',
    verificationEvidence: [{ complete: true, allCorrect: true }],
    bottlenecks: [{ lpCode: 'LP-008' }]
  }

  const state = buildPaperPreviewState({ paper, detail: { student: { name: '钟青羽' }, latestVerificationReport: report }, subjectName: '数学', pdfDownloaded: true })

  assert.equal(state.paperCodeText, '数学-20260612-04')
  assert.equal(state.pageSummary, '学生卷 1 页 · 答案 1 页 · 共 2 页')
  assert.equal(state.questionPreview.length, 4)
  assert.equal(state.hasMoreQuestions, true)
  assert.equal(state.feedback.hasFeedback, true)
  assert.match(state.paperCodeUrl, /paper-preview/)
  assert.match(state.statusUrl, /report-1/)
  assert.match(state.uploadUrl, /upload/)
  assert.match(state.bottleneckCenterUrl, /bottleneck-center/)
  assert.match(state.questionPreview[0].bottleneckUrl, /bottleneck-detail/)
  assert.match(state.feedback.reportUrl, /report-1/)
  assert.equal(buildQuestionPreview(paper.questions, true).length, 5)
  assert.equal(buildWorkbenchStatus({ status: 'analyzing' }).status, 'analyzing')
})

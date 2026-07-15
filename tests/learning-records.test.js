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

const {
  deriveLearningMetrics,
  formatMetricsSummary,
  parseMetricsConfig
} = require('../scripts/learning-metrics')

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

test('learning history state tolerates unavailable stale cleanup preview', () => {
  const state = buildHistoryState([{
    id: 'english-session-1',
    subject: 'english',
    kind: 'english-familiarity-session',
    displayLevel: 'main',
    title: '英语单词熟悉度',
    createdAt: '2026-06-16T09:00:00+08:00',
    chipItems: [],
    foldedEvidence: []
  }], 'english', [], {
    cleanupPreview: null,
    permissions: { canManageParents: true }
  })

  assert.equal(state.cleanup.hasCandidates, false)
  assert.equal(state.days.length, 1)
  assert.equal(state.days[0].events[0].title, '英语单词熟悉度')
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
  assert.equal(display.bottleneckHierarchy.hasHierarchy, true)
  assert.equal(display.bottleneckHierarchy.summaryText, '1 类 · 1 个细分卡点')
  assert.equal(display.bottleneckHierarchy.groups[0].title, '粗颗粒卡点')

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

test('paper display helper groups math fine bottlenecks by category and family', () => {
  const display = buildPaperDisplay({
    _id: 'paper-fine',
    subject: 'math',
    type: 'verification',
    verificationPack: {
      targets: [
        { targetId: 'BN-DEC-MUL-POINT-COUNT', displayName: '小数乘法中积的小数位数判断错误' },
        { targetId: 'BN-DEC-MUL-POINT-ESTIMATE', displayName: '小数乘法中未用估算校验小数点' }
      ]
    },
    bottleneckSummaries: ['小数乘法中积的小数位数判断错误', '小数乘法中未用估算校验小数点']
  }, '数学')

  assert.equal(display.bottleneckHierarchy.hasHierarchy, true)
  assert.equal(display.bottleneckHierarchy.summaryText, '1 类 · 2 个细分卡点')
  assert.equal(display.bottleneckHierarchy.groups[0].title, '计算规则')
  assert.equal(display.bottleneckHierarchy.groups[0].families[0].title, '小数点定位与移动')
  assert.deepEqual(
    display.bottleneckHierarchy.groups[0].families[0].items.map(item => item.displayName),
    ['小数乘法中积的小数位数判断错误', '小数乘法中未用估算校验小数点']
  )
})

test('paper display helper resolves raw fine target ids to taxonomy titles', () => {
  const display = buildPaperDisplay({
    _id: 'paper-raw-targets',
    subject: 'math',
    type: 'verification',
    verificationPack: {
      pages: [{
        targetIds: ['BN-DEC-MUL-POINT-COUNT']
      }]
    }
  }, '数学')

  const item = display.bottleneckHierarchy.groups[0].families[0].items[0]
  assert.equal(item.displayName, '小数乘法中积的小数位数判断错误')
  assert.doesNotMatch(item.displayName, /^BN-/)
})

test('paper display helper resolves legacy AI variant target ids to readable titles', () => {
  const display = buildPaperDisplay({
    _id: 'paper-variant-targets',
    subject: 'math',
    type: 'verification',
    verificationPack: {
      pages: [{
        targetIds: [
          'BN-APP-RECT-AREA',
          'BN-AREA-CONVERSION-RATE',
          'BN-AREA-CONVERT-RATE',
          'BN-FRACTION-ADD-COMMON',
          'BN-FRACTION-ADD-UNLIKE',
          'BN-DEC-DIV-TRIAL'
        ]
      }]
    }
  }, '数学')

  const names = display.bottleneckHierarchy.groups
    .flatMap(group => group.families)
    .flatMap(family => family.items)
    .map(item => item.displayName)

  assert.ok(names.includes('长方形周长和面积公式混淆'))
  assert.ok(names.includes('面积单位换算进率记忆不稳'))
  assert.ok(names.includes('异分母分数加减通分不稳定'))
  assert.ok(names.includes('小数除法试商与补零规则不熟练'))
  assert.equal(names.some(name => /^BN-/.test(name)), false)
  assert.equal(names.length, new Set(names).size)
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

test('upload history presenter builds analytics summary and cleanup prompt state', () => {
  const reports = [
    {
      _id: 'report-1',
      type: 'diagnosis',
      status: 'completed',
      subject: 'math',
      createdAt: '2026-06-12T09:00:00+08:00',
      imageFiles: [],
      bottlenecks: [{ lpCode: 'LP-001' }]
    },
    {
      _id: 'report-2',
      type: 'verification',
      status: 'completed',
      subject: 'math',
      paperId: 'paper-1',
      createdAt: '2026-06-13T09:00:00+08:00',
      imageFiles: []
    }
  ]
  const papers = [{
    _id: 'paper-1',
    type: 'verification',
    subject: 'math',
    generatedAt: '2026-06-13T08:00:00+08:00',
    bottleneckSummaries: ['计算基础']
  }]

  const { events, statusItems } = buildTimelineEvents(reports, papers, new Map(), 'math', '数学')
  const state = buildHistoryState(events, 'math', statusItems, {
    cleanupPreview: { cleanedCount: 2, cleanedReportIds: ['stale-1', 'stale-2'] },
    permissions: { canManageParents: true }
  })

  assert.deepEqual(state.summaryCards.map(item => item.value), [2, 3, 1, 1])
  assert.equal(state.summaryText, '共 2 天 · 3 条主记录 · 1 份验证反馈')
  assert.equal(state.cleanup.hasCandidates, true)
  assert.equal(state.cleanup.title, '发现 2 条可清理的中断记录')
  assert.equal(state.cleanup.canCleanup, true)
})

test('verification paper event follows the latest linked feedback report lifecycle', () => {
  const now = Date.now()
  const oldCompletedAt = new Date(now - 5 * 60 * 1000).toISOString()
  const latestFailedAt = new Date(now - 60 * 1000).toISOString()
  const reports = [
    {
      _id: 'report-old-completed',
      type: 'verification',
      status: 'completed',
      subject: 'math',
      paperId: 'paper-1',
      createdAt: oldCompletedAt,
      imageFiles: [{ fileID: 'cloud://answer-old', fileName: '旧作答.jpg', ocrSummary: '旧反馈已完成' }]
    },
    {
      _id: 'report-latest-failed',
      type: 'verification',
      status: 'failed',
      subject: 'math',
      paperId: 'paper-1',
      createdAt: latestFailedAt,
      imageFiles: [{ fileID: 'cloud://answer-new', fileName: '新作答.jpg', ocrSummary: '图片模糊' }]
    }
  ]
  const papers = [{
    _id: 'paper-1',
    type: 'verification',
    subject: 'math',
    generatedAt: '2026-06-12T09:00:00+08:00',
    paperDate: '2026-06-12',
    questions: [{ lpCode: 'LP-001' }],
    bottleneckSummaries: ['计算基础']
  }]

  const { events } = buildTimelineEvents(reports, papers, new Map(), 'math', '数学')
  const paperEvent = events.find(event => event.kind === 'verification-paper')

  assert.equal(paperEvent.statusText, '反馈失败，可重新上传')
  assert.match(paperEvent.statusUrl, /report-latest-failed/)
  assert.match(paperEvent.feedbackUrl, /report-latest-failed/)
  assert.equal(paperEvent.foldedEvidence.length, 0)
  assert.equal(paperEvent.evidenceCount, 2)
})

test('verification paper timeline event shows task-pack page progress chips', () => {
  const reports = [{
    _id: 'report-pack',
    type: 'verification',
    status: 'completed',
    subject: 'math',
    paperId: 'paper-pack',
    createdAt: '2026-06-12T10:00:00+08:00',
    verificationPageCodes: ['MATH-V-20260616-01-P02'],
    imageFiles: []
  }]
  const papers = [{
    _id: 'paper-pack',
    type: 'verification',
    subject: 'math',
    generatedAt: '2026-06-12T09:00:00+08:00',
    verificationPack: {
      pages: [
        { pageCode: 'MATH-V-20260616-01-P01' },
        { pageCode: 'MATH-V-20260616-01-P02' },
        { pageCode: 'MATH-V-20260616-01-P03' }
      ]
    }
  }]

  const { events } = buildTimelineEvents(reports, papers, new Map(), 'math', '数学')
  const paperEvent = events.find(event => event.kind === 'verification-paper')

  assert.ok(paperEvent.chips.includes('学生卷1页 · 答案1页'))
  assert.ok(paperEvent.chips.includes('已回传1/3页'))
  assert.ok(paperEvent.chips.length <= 3)
})

test('photo evidence summaries hide unreliable AI-inferred grade labels', () => {
  const reports = [{
    _id: 'report-grade',
    type: 'diagnosis',
    status: 'completed',
    subject: 'math',
    createdAt: '2026-06-14T20:03:00+08:00',
    imageFiles: [{
      fileID: 'cloud://photo-grade',
      fileName: '数学照片.jpg',
      ocrSummary: '本页为小学三年级数学作业，包含10道两位数加减法计算题，红笔批改显示有2处错误。'
    }],
    bottlenecks: [{ lpCode: 'LP-001' }]
  }]

  const { events } = buildTimelineEvents(reports, [], new Map(), 'math', '数学')
  const summary = events[0].photos[0].summaryText || events[0].photos[0].summary

  assert.doesNotMatch(summary, /三年级/)
  assert.doesNotMatch(summary, /本页为小学/)
  assert.match(summary, /包含10道两位数加减法计算题/)
})

test('photo evidence titles hide machine-generated hash file names', () => {
  const reports = [{
    _id: 'report-hash',
    type: 'diagnosis',
    status: 'completed',
    subject: 'math',
    createdAt: '2026-06-14T20:03:00+08:00',
    imageFiles: [{
      fileID: 'cloud://photo-hash',
      fileName: '7sM83Cph7HBna4b3c540c3cad8e2359aa805f930.jpg',
      ocrSummary: '包含10道两位数加减法计算题，红笔批改显示有2处错误。'
    }],
    bottlenecks: [{ lpCode: 'LP-001' }]
  }]

  const { events } = buildTimelineEvents(reports, [], new Map(), 'math', '数学')
  const photo = events[0].photos[0]
  const evidence = events[0].foldedEvidence[0]

  assert.equal(photo.fileName, '试卷照片1')
  assert.equal(evidence.title, '试卷照片1')
  assert.match(photo.summaryText, /包含10道两位数加减法计算题/)
  assert.doesNotMatch(photo.fileName, /7sM83Cph/)
})

test('learning records render English familiarity and paper dictation sessions', () => {
  const englishSessions = [
    {
      _id: 'familiarity-1',
      subject: 'english',
      functionType: 'familiarity',
      type: 'word-familiarity',
      status: 'completed',
      wordItems: Array.from({ length: 20 }, (_, index) => ({ wordId: `word-${index}`, word: `word${index}` })),
      attemptCount: 3,
      correctAttemptCount: 1,
      incorrectAttemptCount: 1,
      unclearAttemptCount: 1,
      createdAt: '2026-06-16T09:00:00+08:00'
    },
    {
      _id: 'dictation-1',
      subject: 'english',
      functionType: 'spelling',
      type: 'word-dictation-paper',
      status: 'completed',
      analysisStatus: 'completed',
      photoFileIds: ['cloud://dictation-1.jpg'],
      wordItems: [{ wordId: 'word-1', word: 'science' }, { wordId: 'word-2', word: 'museum' }],
      dictationResults: [
        { wordId: 'word-1', targetWord: 'science', verdict: 'correct' },
        { wordId: 'word-2', targetWord: 'museum', verdict: 'incorrect' }
      ],
      createdAt: '2026-06-16T10:00:00+08:00'
    }
  ]

  const { events } = buildTimelineEvents([], [], new Map([['cloud://dictation-1.jpg', 'https://temp/dictation-1']]), 'english', '英语', englishSessions)

  assert.deepEqual(JSON.parse(JSON.stringify(events.map(event => event.kind))), [
    'english-dictation-session',
    'english-familiarity-session'
  ])
  assert.equal(events[0].title, '英语纸面听写')
  assert.match(events[0].summary, /正确 1 个/)
  assert.equal(events[0].foldedEvidence.length, 1)
  assert.equal(events[0].foldedEvidence[0].tempFileURL, 'https://temp/dictation-1')
  assert.equal(events[1].title, '英语单词熟悉度')
  assert.match(events[1].summary, /正确 1 个/)
  assert.ok(events[1].chips.includes('20 词'))
})

test('learning records render learning resource packs as timeline events', () => {
  const packs = [
    {
      _id: 'pack-1',
      studentId: 'student-1',
      subject: 'math',
      title: '小数乘法中积的小数位数判断错误',
      status: 'completed',
      estimatedMinutes: 8,
      createdAt: '2026-06-17T08:00:00+08:00',
      updatedAt: '2026-06-17T08:10:00+08:00'
    }
  ]

  const { events } = buildTimelineEvents([], [], new Map(), 'math', '数学', [], packs)

  assert.equal(events.length, 1)
  assert.equal(events[0].kind, 'learning-resource')
  assert.equal(events[0].title, '学习任务包：小数乘法中积的小数位数判断错误')
  assert.equal(events[0].summary, '已完成学习')
  assert.equal(events[0].actionText, '查看任务包')
  assert.match(events[0].url, /pages\/learning-resource\/learning-resource\?packId=pack-1/)
  assert.ok(events[0].chips.includes('约 8 分钟'))
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

// ── Learning metrics (merged from learning-metrics.test.js) ──

const metricsSampleData = {
  reports: [
    {
      _id: 'report-diagnosis-ok',
      studentId: 'student-1',
      subject: 'math',
      type: 'diagnosis',
      status: 'completed',
      totalErrors: 5,
      bottlenecks: [{ lpCode: 'LP-001' }, { lpCode: 'LP-008' }],
      imageFiles: [
        { fileName: 'IMG_0001.jpg', ocrSummary: '敏感OCR内容：第1页', isDuplicate: false },
        { fileName: 'IMG_0002.jpg', ocrSummary: '敏感OCR内容：第2页', isDuplicate: true }
      ],
      quality: { level: 'high', status: 'usable' },
      createdAt: '2026-06-01T10:00:00Z'
    },
    {
      _id: 'report-diagnosis-failed',
      studentId: 'student-1',
      subject: 'math',
      type: 'diagnosis',
      status: 'failed',
      imageFiles: [],
      quality: { level: 'low', status: 'insufficient' },
      createdAt: '2026-06-04T10:00:00Z'
    },
    {
      _id: 'report-verification-mixed',
      studentId: 'student-1',
      subject: 'math',
      type: 'verification',
      status: 'completed',
      paperId: 'paper-1',
      imageFiles: [
        { fileName: 'answer.jpg', ocrSummary: '验证卷作答过程', isDuplicate: false }
      ],
      verificationEvidence: [
        { lpCode: 'LP-001', evidenceStatus: 'passed' },
        { lpCode: 'LP-008', evidenceStatus: 'failed' },
        { lpCode: 'LP-013', evidenceStatus: 'unclear' }
      ],
      createdAt: '2026-06-05T10:00:00Z'
    },
    {
      _id: 'report-other-student',
      studentId: 'student-2',
      subject: 'math',
      type: 'diagnosis',
      status: 'completed',
      imageFiles: [{ fileName: 'other.jpg', ocrSummary: '其他学生内容' }],
      createdAt: '2026-06-05T10:00:00Z'
    },
    {
      _id: 'report-verification-passed',
      studentId: 'student-1',
      subject: 'math',
      type: 'verification',
      status: 'completed',
      paperId: 'paper-2',
      verificationEvidence: [
        { lpCode: 'LP-001', complete: true, allCorrect: true }
      ],
      createdAt: '2026-06-09T10:00:00Z'
    }
  ],
  papers: [
    { _id: 'paper-1', studentId: 'student-1', subject: 'math', type: 'verification', createdAt: '2026-06-05T09:00:00Z' },
    { _id: 'paper-2', studentId: 'student-1', subject: 'math', type: 'verification', createdAt: '2026-06-09T09:00:00Z' },
    { _id: 'paper-other', studentId: 'student-2', subject: 'math', type: 'verification', createdAt: '2026-06-05T09:00:00Z' }
  ],
  feedback: [
    { _id: 'feedback-1', studentId: 'student-1', reportId: 'report-verification-mixed', type: 'wrong_question', createdAt: '2026-06-05T11:00:00Z' },
    { _id: 'feedback-other', studentId: 'student-2', reportId: 'report-other-student', type: 'other', createdAt: '2026-06-05T11:00:00Z' }
  ]
}

test('learning metrics derive operational summary from existing records', () => {
  const metrics = deriveLearningMetrics(metricsSampleData, { studentId: 'student-1' })

  assert.equal(metrics.studentId, 'student-1')
  assert.equal(metrics.totals.reports, 4)
  assert.equal(metrics.totals.diagnosisReports, 2)
  assert.equal(metrics.totals.verificationReports, 2)
  assert.equal(metrics.totals.papers, 2)
  assert.equal(metrics.totals.feedback, 1)
  assert.equal(metrics.uploads.photoCount, 3)
  assert.equal(metrics.uploads.duplicatePhotoCount, 1)
  assert.equal(metrics.analysis.completedReports, 3)
  assert.equal(metrics.analysis.failedReports, 1)
  assert.equal(metrics.analysis.completionRate, 0.75)
  assert.deepEqual(metrics.quality.byLevel, { high: 1, medium: 0, low: 1, unknown: 2 })
  assert.deepEqual(metrics.quality.byStatus, { usable: 1, needs_review: 0, insufficient: 1, unknown: 2 })
  assert.equal(metrics.verification.targetCount, 4)
  assert.equal(metrics.verification.passedTargets, 2)
  assert.equal(metrics.verification.failedTargets, 1)
  assert.equal(metrics.verification.unclearTargets, 1)
  assert.equal(metrics.verification.passRate, 0.5)
  assert.equal(metrics.feedback.feedbackRate, 0.25)
  assert.deepEqual(metrics.weekly.map(week => week.weekStart), ['2026-06-01', '2026-06-08'])
})

test('learning metrics formatted output is compact and excludes image content', () => {
  const metrics = deriveLearningMetrics(metricsSampleData, { studentId: 'student-1' })
  const text = formatMetricsSummary(metrics)

  assert.match(text, /学习指标摘要/)
  assert.match(text, /分析完成率 75%/)
  assert.match(text, /验证通过率 50%/)
  assert.doesNotMatch(text, /敏感OCR内容/)
  assert.doesNotMatch(text, /IMG_0001/)
  assert.doesNotMatch(text, /answer\.jpg/)
})

test('learning metrics config accepts env and cli arguments', () => {
  const config = parseMetricsConfig({
    env: {
      METRICS_INPUT: '/tmp/metrics.json',
      METRICS_STUDENT_ID: 'student-env'
    },
    argv: ['--student-id=student-cli', '--json']
  })

  assert.equal(config.inputPath, '/tmp/metrics.json')
  assert.equal(config.studentId, 'student-cli')
  assert.equal(config.json, true)
})

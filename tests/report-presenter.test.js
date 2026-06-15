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
    evidenceTime: '2026-06-13T12:30:00Z',
    imageFiles: [{ fileID: 'one' }, { fileID: 'two' }],
    bottlenecks: [
      { lpCode: 'LP-001', lpName: '分数运算', status: 'found', trend: 'new', errorCount: 2 },
      { lpCode: 'LP-008', lpName: '审题错误', status: 'persisting', trend: 'persisting', errorCount: 1 }
    ]
  })

  assert.equal(view.headline, '发现分数运算卡点')
  assert.equal(view.sourceImageCount, 2)
  assert.match(view.evidenceTimeText, /2026年6月13日/)
  assert.equal(view.trendSummaryText, '1 个持续出现，1 个新发现')
  assert.equal(view.bottleneckList[0].statusText, '需要验证')
  assert.equal(view.bottleneckList[0].statusClass, 'pending')
})

test('bottleneck metadata uses readable names instead of LP codes', () => {
  const view = buildReportView({
    bottlenecks: [
      { lpCode: 'LP-001', lpName: '计算错误（加减乘除）', errorCount: 2, status: 'found' },
      { lpCode: 'LP-008', errorCount: 1, status: 'found' },
      { lpCode: 'LP-999', errorCount: 1, status: 'found' }
    ]
  })

  assert.equal(view.bottleneckList[0].displayName, '计算基础')
  assert.equal(view.bottleneckList[0].metaText, '2 道相关错题 · 计算基础')
  assert.ok(view.bottleneckList.every(item => !/LP-\d+/.test(item.displayName)))
  assert.equal(view.bottleneckList[1].displayName, '审题理解')
  assert.equal(view.bottleneckList[2].metaText, '1 道相关错题 · 待确认卡点')
})

test('verification report exposes linked paper display code', () => {
  const view = buildReportView({
    studentId: 'student-1',
    subject: 'math',
    type: 'verification',
    linkedPaper: {
      _id: 'paper-1',
      paperDisplayCode: '数学-20260613-01'
    },
    bottlenecks: [{ lpCode: 'LP-008', status: 'improved' }]
  })

  assert.equal(view.paperCodeText, '数学-20260613-01')
  assert.match(view.paperCodeUrl, /paper-preview\/paper-preview/)
  assert.match(view.paperCodeUrl, /paperId=paper-1/)
  assert.equal(view.bottleneckList[0].displayName, '审题理解')
  assert.match(view.bottleneckList[0].detailUrl, /bottleneck-detail\/bottleneck-detail/)
  assert.match(view.bottleneckList[0].detailUrl, /lpCode=LP-008/)
})

test('report headline falls back to comparison summary then summary', () => {
  assert.equal(buildReportView({ comparisonSummary: '单位换算已有改善' }).headline, '单位换算已有改善')
  assert.equal(buildReportView({ summary: '本次诊断摘要' }).headline, '本次诊断摘要')
})

test('report view exposes traceable metric and evidence urls', () => {
  const view = buildReportView({
    _id: 'report-1',
    studentId: 'student-1',
    studentName: '钟青羽',
    subject: 'math',
    type: 'diagnosis',
    createdAt: '2026-06-13T12:30:00Z',
    imageFiles: [{ fileID: 'one' }],
    totalErrors: 4,
    bottlenecks: [{ lpCode: 'LP-001', status: 'found', errorCount: 4 }]
  })

  assert.match(view.metricActions.errorsUrl, /report\/report/)
  assert.match(view.metricActions.bottlenecksUrl, /bottleneck-center\/bottleneck-center/)
  assert.match(view.metricActions.sourcesUrl, /upload-history\/upload-history/)
  assert.match(view.evidenceTimeUrl, /upload-history\/upload-history/)
})

test('report view groups source photos with OCR summaries, duplicate state and related errors', () => {
  const view = buildReportView({
    _id: 'report-1',
    studentId: 'student-1',
    studentName: '钟青羽',
    subject: 'math',
    type: 'diagnosis',
    imageFiles: [
      {
        fileID: 'cloud://photo-1',
        fileName: '计算页.jpg',
        ocrSummary: '第一页主要是小数乘除计算，红笔标出两处错误。'
      },
      {
        fileID: 'cloud://photo-2',
        fileName: '应用题页.jpg',
        ocrSummary: '第二页是应用题。',
        isDuplicate: true
      }
    ],
    errorDetails: [
      { questionContent: '5.87 ÷ 1.9', lpCode: 'LP-001', sourceImageIndex: 1, sourceFileID: 'cloud://photo-1' },
      { questionContent: '单位换算应用题', lpCode: 'LP-008', sourceImageIndex: 2, sourceFileID: 'cloud://photo-2' }
    ]
  })

  assert.equal(view.hasSourceEvidence, true)
  assert.deepEqual(view.errorDetailList.map(item => item.sourceText), ['第1张试卷', '第2张试卷'])
  assert.deepEqual(view.sourceEvidenceItems.map(item => ({
    title: item.title,
    sourceText: item.sourceText,
    duplicateText: item.duplicateText,
    relatedErrorCount: item.relatedErrorCount,
    firstError: item.relatedErrors[0]
  })), [
    {
      title: '计算页.jpg',
      sourceText: '第1张试卷',
      duplicateText: '',
      relatedErrorCount: 1,
      firstError: '5.87 ÷ 1.9'
    },
    {
      title: '应用题页.jpg',
      sourceText: '第2张试卷',
      duplicateText: '疑似重复照片',
      relatedErrorCount: 1,
      firstError: '单位换算应用题'
    }
  ])
  assert.match(view.sourceEvidenceItems[0].summary, /小数乘除计算/)
})

test('report view exposes quality labels and reasons', () => {
  const view = buildReportView({
    type: 'diagnosis',
    quality: {
      level: 'medium',
      status: 'needs_review',
      reasons: ['部分照片分析失败', '样本较少']
    }
  })

  assert.equal(view.qualityLabel, '建议复核')
  assert.equal(view.qualityClass, 'needs-review')
  assert.deepEqual(view.qualityReasons, ['部分照片分析失败', '样本较少'])
})

test('verification report exposes readable evidence status summaries', () => {
  const view = buildReportView({
    type: 'verification',
    verificationEvidence: [
      { lpCode: 'LP-001', evidenceStatus: 'passed', evidenceReason: '5 道验证题均清晰作答且全部正确' },
      { lpCode: 'LP-002', evidenceStatus: 'unclear', evidenceReason: '有 1 道题图像不清晰' },
      { lpCode: 'LP-003', evidenceStatus: 'failed', evidenceReason: '有 2 道题仍然出错' }
    ]
  })

  assert.deepEqual(view.verificationEvidenceItems.map(item => item.statusText), [
    '已通过',
    '图像不清',
    '未通过'
  ])
  assert.equal(view.hasVerificationEvidence, true)
})

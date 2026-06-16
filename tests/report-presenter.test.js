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

test('diagnosis report builds parent-facing explanation with evidence uncertainty and next action', () => {
  const view = buildReportView({
    _id: 'report-1',
    studentId: 'student-1',
    studentName: '钟青羽',
    subject: 'math',
    type: 'diagnosis',
    summary: '计算基础和审题理解需要继续验证',
    totalErrors: 6,
    imageFiles: [{ fileID: 'photo-1' }, { fileID: 'photo-2' }],
    bottlenecks: [
      { lpCode: 'LP-001', status: 'found', errorCount: 4 },
      { lpCode: 'LP-008', status: 'found', errorCount: 2 }
    ],
    quality: {
      status: 'insufficient',
      reasons: ['部分照片较模糊']
    }
  })

  assert.equal(view.explanationTitle, '给家长的结论')
  assert.equal(view.explanationConclusion, '计算基础和审题理解需要继续验证')
  assert.match(view.explanationEvidence, /2 张试卷图片/)
  assert.match(view.explanationEvidence, /6 道相关错题/)
  assert.match(view.explanationEvidence, /2 个学习卡点/)
  assert.match(view.explanationUncertainty, /样本不足/)
  assert.match(view.explanationUncertainty, /部分照片较模糊/)
  assert.equal(view.explanationActionText, '生成验证试卷')
  assert.equal(view.explanationActionType, 'generate-verification')
})

test('verification report exposes readable evidence status summaries', () => {
  const view = buildReportView({
    _id: 'report-verification',
    studentId: 'student-1',
    studentName: '钟青羽',
    subject: 'math',
    type: 'verification',
    paperId: 'paper-1',
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
  assert.deepEqual(view.verificationEvidenceItems.map(item => item.displayName), [
    '计算基础',
    '分数运算',
    '小数百分数'
  ])
  assert.equal(view.explanationConclusion, '本次验证仍有 1 个学习卡点未通过。')
  assert.match(view.explanationEvidence, /已通过 1 个/)
  assert.match(view.explanationEvidence, /未通过 1 个/)
  assert.match(view.explanationEvidence, /证据不足 1 个/)
  assert.match(view.explanationUncertainty, /不会计入已改善/)
  assert.equal(view.explanationActionText, '继续练习或重新上传验证')
  assert.equal(view.explanationActionType, 'upload-verification')
})

test('diagnosis report exposes math learning map nodes, fine bottlenecks and resource plan', () => {
  const view = buildReportView({
    _id: 'report-math-v2',
    studentId: 'student-1',
    studentName: '钟青羽',
    subject: 'math',
    type: 'diagnosis',
    bottlenecks: [
      {
        lpCode: 'LP-FD',
        lpName: '分数除法',
        errorCount: 2,
        status: 'found',
        nodeIds: ['MATH-NUM-FRACTION-DIV-RECIPROCAL'],
        candidateBottlenecks: [
          {
            bottleneckId: 'BN-FRACTION-DIV-RECIPROCAL-MISSING',
            title: '分数除法没有稳定转化为乘倒数'
          }
        ],
        recommendedResourceIds: [
          'RES-YT-FRACTION-DIV-001',
          'RES-BILI-FRACTION-DIV-001'
        ],
        nextActionText: '先看高质量锚点校准概念，再用国内资源复述。'
      }
    ]
  })

  assert.equal(view.hasLearningMap, true)
  assert.equal(view.learningMapItems.length, 1)
  assert.equal(view.learningMapItems[0].nodeText, '分数除法与倒数')
  assert.match(view.learningMapItems[0].bottleneckText, /除以分数未稳定转换为乘倒数/)
  assert.equal(view.learningMapItems[0].nextActionText, '先看高质量锚点校准概念，再用国内资源复述。')
  assert.ok(view.learningMapItems[0].resources.some(item => item.role === '高质量锚点'))
  assert.ok(view.learningMapItems[0].resources.some(item => item.role === '国内补充'))
  assert.match(view.learningMapItems[0].resourceSummary, /高质量锚点：YouTube/)
  assert.match(view.learningMapItems[0].resourceSummary, /国内补充：B站/)
})

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
  assert.equal(view.heroIllustration.imageSrc, undefined)
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
  assert.equal(view.heroIllustration.imageSrc, undefined)
  assert.equal(view.improvedCount, 0)
  assert.equal(view.worsenedCount, 0)
  assert.equal(view.showNextStep, true)
  assert.equal(view.hasBottlenecks, true)
  assert.equal(view.hasErrorDetails, false)
  assert.deepEqual(view.reportLayers.map(item => item.key), ['summary', 'evidence', 'change', 'action'])
  assert.equal(view.reportLayers[0].icon, '🩺')
  assert.equal(view.reportLayers[1].count, 0)
  assert.equal(view.reportLayers[2].count, 1)
  assert.equal(view.reportLayers[3].available, true)
})

test('chinese diagnosis report exposes concrete error items as review targets', () => {
  const view = buildReportView({
    subject: 'chinese',
    type: 'diagnosis',
    chineseErrorItems: [
      {
        itemId: 'CHI-001',
        itemType: 'character',
        targetText: '莺',
        expectedAnswer: '莺',
        studentAnswer: '鹰',
        sourceContext: '草长莺飞二月天',
        mistakeType: '形近字混淆',
        verificationMethods: ['dictation', 'context_fill'],
        relatedLpCode: 'LP-101'
      }
    ],
    bottlenecks: []
  })

  assert.equal(view.hasChineseErrorItems, true)
  assert.equal(view.chineseErrorItemCount, 1)
  assert.equal(view.chineseErrorItems[0].displayName, '莺')
  assert.match(view.chineseErrorItems[0].answerText, /正确：莺/)
  assert.match(view.chineseErrorItems[0].studentText, /上次写成：鹰/)
  assert.match(view.chineseErrorItems[0].methodText, /听写/)
  assert.equal(view.showNextStep, true)
  assert.match(view.explanationEvidence, /1 个具体错项/)
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

test('report view limits source evidence on first paint and exposes hidden count', () => {
  const view = buildReportView({
    _id: 'report-large',
    studentId: 'student-1',
    subject: 'math',
    type: 'diagnosis',
    imageFiles: Array.from({ length: 12 }, (_, index) => ({
      fileID: `cloud://photo-${index + 1}`,
      fileName: `第${index + 1}页.jpg`,
      ocrSummary: `第 ${index + 1} 页 OCR 摘要`
    }))
  })

  assert.equal(view.sourceImageCount, 12)
  assert.equal(view.sourceEvidenceItems.length, 3)
  assert.equal(view.hasMoreSourceEvidence, true)
  assert.equal(view.hiddenSourceEvidenceCount, 9)

  const expanded = buildReportView({
    _id: 'report-large',
    studentId: 'student-1',
    subject: 'math',
    type: 'diagnosis',
    imageFiles: Array.from({ length: 12 }, (_, index) => ({
      fileID: `cloud://photo-${index + 1}`,
      fileName: `第${index + 1}页.jpg`
    }))
  }, { sourceEvidenceLimit: Infinity })

  assert.equal(expanded.sourceEvidenceItems.length, 12)
  assert.equal(expanded.hasMoreSourceEvidence, false)
  assert.equal(expanded.hiddenSourceEvidenceCount, 0)
})

test('report view limits error details on first paint and exposes hidden count', () => {
  const report = {
    _id: 'report-errors',
    subject: 'math',
    type: 'diagnosis',
    errorDetails: Array.from({ length: 45 }, (_, index) => ({
      questionContent: `错题 ${index + 1}`,
      sourceImageIndex: 1
    }))
  }
  const view = buildReportView(report)

  assert.equal(view.hasErrorDetails, true)
  assert.equal(view.errorDetailList.length, 20)
  assert.equal(view.hasMoreErrorDetails, true)
  assert.equal(view.hiddenErrorDetailCount, 25)

  const expanded = buildReportView(report, { errorDetailLimit: Infinity })
  assert.equal(expanded.errorDetailList.length, 45)
  assert.equal(expanded.hasMoreErrorDetails, false)
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
  assert.equal(view.explanationActionText, '查看验证卷')
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

test('math learning map hides raw node ids and exposes actionable resource links', () => {
  const view = buildReportView({
    _id: 'report-math-readable-map',
    studentId: 'student-1',
    studentName: '钟青羽',
    subject: 'math',
    type: 'diagnosis',
    bottlenecks: [
      {
        lpCode: 'LP-001',
        lpName: '计算基础',
        errorCount: 5,
        status: 'found',
        nodeIds: [
          'MATH-NUM-DEC-DIV-POINT',
          'MATH-NUM-FRACTION-ADD-SUB',
          'MATH-NUM-DEC-DIV-QUOTIENT',
          'MATH-NUM-FRACTION-ADD-UNLIKE'
        ],
        candidateBottlenecks: [
          {
            bottleneckId: 'BN-DEC-MUL-POINT-COUNT',
            title: '小数乘法中小数位数累计规则不稳'
          }
        ],
        recommendedResourceIds: [
          'RES-KHAN-DEC-MUL-001',
          'RES-BILI-DEC-MUL-001',
          'RES-BILI-UNIT-CONVERT-001'
        ]
      }
    ]
  })

  const item = view.learningMapItems[0]
  assert.doesNotMatch(item.nodeText, /MATH-/)
  assert.doesNotMatch(item.nodeDetailText, /MATH-/)
  assert.match(item.nodeText, /小数除法中的小数点移动/)
  assert.match(item.nodeDetailText, /异分母分数加减法/)

  const khan = item.resources.find(resource => resource.resourceId === 'RES-KHAN-DEC-MUL-001')
  assert.ok(khan)
  assert.equal(khan.displayTitle, '小数乘法示例：怎样确定积的小数点')
  assert.equal(khan.typeLabel, '视频')
  assert.equal(khan.actionText, '复制视频链接')
  assert.match(khan.url, /^https?:\/\//)

  const unitSearch = item.resources.find(resource => resource.resourceId === 'RES-BILI-UNIT-CONVERT-001')
  assert.ok(unitSearch)
  assert.equal(unitSearch.displayTitle, '小学单位换算：厘米、分米、米资源搜索')
  assert.equal(unitSearch.typeLabel, '搜索入口')
  assert.doesNotMatch(unitSearch.displayTitle, /候选|cm dm m/i)
})

test('math diagnosis report expands visible bottleneck list to fine-grained candidates', () => {
  const view = buildReportView({
    _id: 'report-math-full',
    studentId: 'student-1',
    studentName: '钟青羽',
    subject: 'math',
    type: 'diagnosis',
    summary: '共发现 12 道错题，主要卡点：计算基础',
    totalErrors: 12,
    bottlenecks: [
      {
        lpCode: 'LP-001',
        lpName: '计算错误（加减乘除）',
        errorCount: 8,
        status: 'found',
        candidateBottlenecks: [
          {
            bottleneckId: 'BN-DEC-MUL-POINT-COUNT',
            title: '小数乘法中小数位数累计规则不稳',
            evidenceStrength: 'high',
            microValidationRequired: true,
            recommendedResourceIds: ['RES-BILI-DEC-MUL-001']
          },
          {
            bottleneckId: 'BN-FRACTION-DIV-RECIPROCAL',
            title: '分数除法未正确转化为乘倒数',
            evidenceStrength: 'medium',
            recommendedResourceIds: ['RES-YT-FRACTION-DIV-001', 'RES-BILI-FRACTION-DIV-001']
          }
        ]
      }
    ]
  })

  assert.equal(view.bottleneckCount, 2)
  assert.match(view.headline, /发现 2 个细分学习卡点/)
  assert.match(view.reportSummaryText, /细颗粒度卡点展开/)
  assert.deepEqual(view.bottleneckList.map(item => item.displayName), [
    '小数乘法中小数位数累计规则不稳',
    '分数除法未正确转化为乘倒数'
  ])
  assert.equal(view.bottleneckList[0].fineBottleneck, true)
  assert.match(view.bottleneckList[0].metaText, /归属计算基础/)
  assert.match(view.bottleneckList[0].metaText, /推荐资源 1 个/)
  assert.match(view.bottleneckList[0].detailUrl, /bottleneckId=BN-DEC-MUL-POINT-COUNT/)
  assert.doesNotMatch(view.bottleneckList[0].displayName, /^计算基础$/)
  assert.match(view.explanationEvidence, /2 个学习卡点/)
})

test('math diagnosis report exposes grouped bottleneck sections for parent-facing review', () => {
  const view = buildReportView({
    _id: 'report-math-groups',
    studentId: 'student-1',
    subject: 'math',
    type: 'diagnosis',
    bottlenecks: [
      {
        lpCode: 'LP-001',
        lpName: '计算基础',
        status: 'found',
        candidateBottlenecks: [
          {
            bottleneckId: 'BN-DEC-MUL-POINT-COUNT',
            title: '小数乘法中积的小数位数判断错误'
          },
          {
            bottleneckId: 'BN-DEC-MUL-POINT-ESTIMATE',
            title: '小数乘法后缺少数量级估算检查'
          }
        ]
      }
    ]
  })

  assert.equal(view.hasBottleneckGroups, true)
  assert.equal(view.bottleneckGroups[0].categoryTitle, '计算规则')
  assert.equal(view.bottleneckGroups[0].summaryText, '2 个细分卡点')
  assert.equal(view.bottleneckGroups[0].families[0].familyTitle, '小数点定位与移动')
  assert.deepEqual(view.bottleneckGroups[0].families[0].items.map(item => item.displayName), [
    '小数乘法中积的小数位数判断错误',
    '小数乘法后缺少数量级估算检查'
  ])
})

// === 诊断报告展示全量卡点（profile 级别，而非单次 report 级别）===

test('诊断报告优先展示 profile.currentBottlenecks（全量合并卡点），而非 report.bottlenecks（单次）', () => {
  // 模拟：单次报告只有 2 个卡点，但 profile 合并了 5 个
  const report = {
    type: 'diagnosis',
    subject: 'math',
    bottlenecks: [
      { lpCode: 'LP-001', lpName: '卡点A', errorCount: 1 },
      { lpCode: 'LP-002', lpName: '卡点B', errorCount: 1 },
    ]
  }
  const profile = {
    currentBottlenecks: [
      { lpCode: 'LP-001', lpName: '卡点A', status: 'persisting', errorCount: 1 },
      { lpCode: 'LP-002', lpName: '卡点B', status: 'needs_verification', errorCount: 1 },
      { lpCode: 'LP-003', lpName: '卡点C', status: 'needs_verification', errorCount: 0 },
      { lpCode: 'LP-004', lpName: '卡点D', status: 'needs_verification', errorCount: 0 },
      { lpCode: 'LP-005', lpName: '卡点E', status: 'improved', errorCount: 0 },
    ]
  }
  const view = buildReportView(report, { profile })
  assert.equal(view.bottleneckCount, 5, '应展示全量 5 个卡点，而非单次报告的 2 个')
  assert.equal(view.hasBottlenecks, true)
})

test('诊断报告无 profile 时 fallback 到 report.bottlenecks（不崩溃）', () => {
  const report = {
    type: 'diagnosis',
    subject: 'math',
    bottlenecks: [
      { lpCode: 'LP-001', lpName: '卡点A', errorCount: 2 },
    ]
  }
  const view = buildReportView(report) // 不传 profile
  assert.equal(view.bottleneckCount, 1, '无 profile 时应用 report.bottlenecks')
})

test('诊断报告 profile.currentBottlenecks 为空时 fallback 到 report.bottlenecks', () => {
  const report = {
    type: 'diagnosis',
    subject: 'math',
    bottlenecks: [{ lpCode: 'LP-001', lpName: '卡点A', errorCount: 1 }]
  }
  const profile = { currentBottlenecks: [] } // 空数组
  const view = buildReportView(report, { profile })
  assert.equal(view.bottleneckCount, 1, 'profile 卡点为空时应用 report.bottlenecks')
})

test('验证报告（verification）不用 profile 卡点，只用单次报告卡点', () => {
  const report = {
    type: 'verification',
    subject: 'math',
    bottlenecks: [{ lpCode: 'LP-001', lpName: '卡点A', errorCount: 1 }]
  }
  const profile = {
    currentBottlenecks: [
      { lpCode: 'LP-001', lpName: '卡点A', status: 'persisting' },
      { lpCode: 'LP-002', lpName: '卡点B', status: 'needs_verification' },
      { lpCode: 'LP-003', lpName: '卡点C', status: 'needs_verification' },
    ]
  }
  const view = buildReportView(report, { profile })
  assert.equal(view.bottleneckCount, 1, '验证报告只用单次报告的 1 个卡点，不用 profile 全量')
})

test('诊断报告有验证反馈时展示改善摘要和下一步建议', () => {
  const report = {
    type: 'diagnosis',
    bottlenecks: [
      { lpCode: 'LP-001', lpName: '计算基础', errorCount: 5 },
      { lpCode: 'LP-002', lpName: '分数运算', errorCount: 3 },
    ],
    linkedVerificationReport: {
      reportId: 'ver-1',
      createdAt: '2026-07-12T01:00:00Z',
      comparisonSummary: '1 个已改善，1 个仍需验证',
      verificationEvidence: [
        { lpCode: 'LP-001', lpName: '计算基础', evidenceStatus: 'passed' },
        { lpCode: 'LP-002', lpName: '分数运算', evidenceStatus: 'failed' },
      ],
      bottlenecks: [
        { lpCode: 'LP-001', lpName: '计算基础', status: 'improved', errorCount: 0 },
        { lpCode: 'LP-002', lpName: '分数运算', status: 'persisting', errorCount: 2 },
      ],
    },
  }
  const view = buildReportView(report, { profile: null })
  assert.equal(view.hasVerificationFeedback, true)
  assert.equal(view.verificationFeedbackPassed, 1)
  assert.equal(view.verificationFeedbackFailed, 1)
  assert.equal(view.verificationFeedbackTotal, 2)
  assert.equal(view.verificationStatusChanges.length, 2)
  assert.equal(view.verificationStatusChanges[0].afterClass, 'improved')
  assert.equal(view.verificationStatusChanges[1].afterClass, 'persisting')
  assert.ok(view.verificationNextActionText.includes('仍需练习'), '有失败时应建议重学')
  assert.equal(view.verificationReportId, 'ver-1')
})

test('诊断报告无验证反馈时不展示', () => {
  const report = {
    type: 'diagnosis',
    bottlenecks: [{ lpCode: 'LP-001', lpName: '计算基础', errorCount: 5 }],
  }
  const view = buildReportView(report, { profile: null })
  assert.equal(view.hasVerificationFeedback, false)
})

test('验证报告不展示验证反馈区块', () => {
  const report = {
    type: 'verification',
    bottlenecks: [],
    linkedVerificationReport: { reportId: 'ver-1' },
  }
  const view = buildReportView(report, { profile: null })
  assert.equal(view.hasVerificationFeedback, false)
})

test('全部验证通过时建议继续诊断', () => {
  const report = {
    type: 'diagnosis',
    bottlenecks: [{ lpCode: 'LP-001', lpName: '计算基础', errorCount: 5 }],
    linkedVerificationReport: {
      reportId: 'ver-1',
      verificationEvidence: [
        { lpCode: 'LP-001', lpName: '计算基础', evidenceStatus: 'passed' },
      ],
      bottlenecks: [
        { lpCode: 'LP-001', lpName: '计算基础', status: 'improved', errorCount: 0 },
      ],
    },
  }
  const view = buildReportView(report, { profile: null })
  assert.ok(view.verificationNextActionText.includes('全部改善'), '全通过应建议继续诊断')
  assert.equal(view.verificationFeedbackFailed, 0)
  assert.equal(view.verificationFeedbackUncertain, 0)
})

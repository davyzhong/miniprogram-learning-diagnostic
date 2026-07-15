const test = require('node:test')
const assert = require('node:assert/strict')

const { buildSubjectHomeView } = require('../miniprogram/pages/subject-home/subject-home-presenter')

const relative = () => '今天'

test('subject home sanitizes ID-only report summaries and bottleneck labels', () => {
  const view = buildSubjectHomeView({
    subject: 'math',
    currentBottlenecks: [{ lpCode: 'LP-UNKNOWN-01', status: 'needs_verification' }]
  }, [{
    _id: 'report-route-id',
    subject: 'math',
    status: 'completed',
    summary: '复测 BN-LEGACY-UNKNOWN-01'
  }], relative, { subject: 'math', subjectName: '数学' })

  assert.doesNotMatch(view.currentBottlenecks[0].displayName, /LP-/)
  assert.doesNotMatch(view.latestDiagnosis.summary, /BN-/)
  assert.equal(view.latestReportId, 'report-route-id')
})

test('builds a subject workbench from current bottlenecks and latest reports', () => {
  const view = buildSubjectHomeView({
    totalReports: 4,
    currentBottlenecks: [
      { lpCode: 'LP-001', lpName: '计算错误（加减乘除）', status: 'needs_verification', errorCount: 4, severity: 'medium' },
      { lpCode: 'LP-008', lpName: '审题错误', status: 'persisting', relatedErrorCount: 2, severity: 'high' },
      { lpCode: 'LP-004', lpName: '单位换算错误', status: 'improved' }
    ]
  }, [{
    _id: 'report-1',
    status: 'completed',
    isEffective: true,
    changeSummary: '发现计算基础卡点',
    createdAt: '2026-06-12'
  }], relative, { subjectName: '数学' })

  assert.equal(view.subjectTitle, '数学工作台')
  assert.equal(view.primaryTask.actionType, 'verification')
  assert.equal(view.primaryTask.actionText, '查看/下载验证卷')
  assert.equal(view.primaryTask.summary, '2 个学习卡点等待验证，验证卷准备好后可下载打印。')
  assert.deepEqual(view.taskQueue.map(item => item.displayName), ['审题理解', '计算基础'])
  assert.deepEqual(view.taskQueue.map(item => item.evidenceText), ['最近 2 道相关错题', '最近 4 道相关错题'])
  assert.deepEqual(view.taskQueue.map(item => item.actionText), ['查看/下载验证卷', '查看/下载验证卷'])
  assert.equal(view.taskQueue[0].priorityText, '高优先级')
  assert.ok(view.taskQueue.every(item => item.status !== 'improved'))
  assert.deepEqual(view.tools.map(item => item.key), ['diagnosis', 'defaultPaper', 'history', 'latestReport'])
  assert.equal(view.latestReportId, 'report-1')
})

test('builds a compatible workbench from legacy profile fields', () => {
  const view = buildSubjectHomeView({
    pendingBottlenecks: [{ lpCode: 'LP-002', lpName: '分数运算错误', relatedErrorCount: 1 }],
    improvedBottlenecks: [{ lpCode: 'LP-004', lpName: '单位换算错误' }]
  }, [], relative, { subjectName: '数学' })

  assert.equal(view.hasDiagnosis, true)
  assert.equal(view.pendingCount, 1)
  assert.equal(view.improvedCount, 1)
  assert.deepEqual(view.taskQueue.map(item => item.displayName), ['分数运算'])
  assert.equal(view.taskQueue[0].evidenceText, '最近 1 道相关错题')
})

test('subject workbench keeps the latest formal diagnosis ahead of newer verification feedback', () => {
  const view = buildSubjectHomeView({}, [
    {
      _id: 'verification-newer',
      type: 'verification',
      status: 'completed',
      createdAt: '2026-07-13T10:00:00Z',
      summary: '验证反馈'
    },
    {
      _id: 'diagnosis-latest',
      type: 'diagnosis',
      status: 'completed',
      isEffective: true,
      createdAt: '2026-07-12T10:00:00Z',
      summary: '分数运算是当前优先卡点',
      totalErrors: 6,
      bottlenecks: [{ status: 'persisting' }, { status: 'improved' }]
    }
  ], relative, { subject: 'math', subjectName: '数学' })

  assert.equal(view.latestReportId, 'diagnosis-latest')
  assert.equal(view.latestDiagnosis.reportId, 'diagnosis-latest')
  assert.equal(view.latestDiagnosis.title, '最新数学诊断')
  assert.equal(view.latestDiagnosis.evidenceCount, 6)
  assert.equal(view.latestDiagnosis.persistingCount, 1)
  assert.equal(view.latestDiagnosis.improvedCount, 1)
  assert.match(view.latestDiagnosis.summary, /分数运算/)
  assert.equal(view.latestDiagnosis.icon, '数')
})

test('math workbench expands coarse bottlenecks into fine-grained candidate bottlenecks', () => {
  const view = buildSubjectHomeView({
    subject: 'math',
    subjectName: '数学',
    currentBottlenecks: [{
      lpCode: 'LP-001',
      lpName: '计算基础',
      status: 'persisting',
      errorCount: 178,
      severity: 'high',
      evidenceStrength: 'high',
      nodeIds: ['MATH-NUM-DEC-MUL-POINT'],
      recommendedResourceIds: ['RES-BILI-DEC-MUL-001'],
      candidateBottlenecks: [
        {
          bottleneckId: 'BN-DEC-MUL-POINT-COUNT',
          title: '小数乘法中小数位数累计规则不稳',
          evidenceStrength: 'high',
          microValidationRequired: true,
          recommendedResourceIds: ['RES-KHAN-DEC-MUL-001']
        },
        {
          bottleneckId: 'BN-DEC-DIV-POINT-MOVE',
          title: '除数是小数的除法中，被除数小数点移动规则不熟练',
          evidenceStrength: 'medium',
          recommendedResourceIds: ['RES-BILI-DEC-DIV-001']
        }
      ]
    }]
  }, [], relative, { subject: 'math', subjectName: '数学' })

  assert.deepEqual(view.taskQueue.map(item => item.displayName), [
    '小数乘法中小数位数累计规则不稳',
    '除数是小数的除法中，被除数小数点移动规则不熟练'
  ])
  assert.equal(view.taskQueue[0].fineBottleneck, true)
  assert.equal(view.taskQueue[0].lpCode, 'LP-001')
  assert.equal(view.taskQueue[0].bottleneckId, 'BN-DEC-MUL-POINT-COUNT')
  assert.match(view.taskQueue[0].evidenceText, /高置信证据/)
  assert.match(view.taskQueue[0].evidenceText, /归属计算基础/)
  assert.match(view.taskQueue[0].evidenceText, /推荐资源 1 个/)
  assert.equal(view.taskQueue[0].viewId, 'LP-001:BN-DEC-MUL-POINT-COUNT')
  // 统一口径：pendingCount = status !== 'improved'（persisting 也算待修复）
  assert.equal(view.pendingCount, 2)
  assert.equal(view.persistingCount, 2)
})

test('math workbench exposes flat task queue with bottleneck items', () => {
  const view = buildSubjectHomeView({
    subject: 'math',
    subjectName: '数学',
    currentBottlenecks: [{
      lpCode: 'LP-001',
      lpName: '计算基础',
      status: 'persisting',
      severity: 'high',
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
    }]
  }, [], relative, { subject: 'math', subjectName: '数学' })

  // taskQueueGroups 已移除（WXML 未消费，属死代码）；验证扁平 taskQueue 仍正常工作
  assert.ok(Array.isArray(view.taskQueue))
  assert.ok(view.taskQueue.length >= 1)
  assert.ok(view.pendingTaskCount >= 1)
})

test('Chinese workbench prioritizes concrete review items over coarse bottlenecks', () => {
  const view = buildSubjectHomeView({
    subject: 'chinese',
    subjectName: '语文',
    chineseReviewItems: [
      {
        itemId: 'CHI-001',
        itemType: 'character',
        targetText: '莺',
        expectedAnswer: '莺',
        lastWrongAnswer: '鹰',
        sourceContext: '草长莺飞二月天',
        status: 'recurring',
        evidenceCount: 2,
        relatedLpCode: 'LP-101'
      },
      {
        itemId: 'CHI-002',
        itemType: 'poem',
        targetText: '春风拂槛露华浓',
        expectedAnswer: '春风拂槛露华浓',
        status: 'mastered',
        evidenceCount: 1
      }
    ],
    currentBottlenecks: [
      { lpCode: 'LP-101', lpName: '字词积累', status: 'needs_verification', errorCount: 1 }
    ]
  }, [], relative, { subject: 'chinese', subjectName: '语文' })

  assert.equal(view.primaryTask.actionType, 'verification')
  assert.equal(view.primaryTask.summary, '1 个具体错项等待复测，系统会根据诊断报告自动准备语文错项复测卷。')
  assert.equal(view.pendingTaskCount, 1)
  assert.equal(view.hasChineseReviewQueue, true)
  assert.equal(view.chineseReviewQueue[0].displayName, '莺')
  assert.match(view.chineseReviewQueue[0].detailText, /上次写成：鹰/)
  assert.match(view.chineseReviewQueue[0].detailText, /草长莺飞二月天/)
})

test('empty profile exposes a first-use workbench action', () => {
  const view = buildSubjectHomeView({}, [], relative, { subjectName: '数学' })

  assert.equal(view.hasDiagnosis, false)
  assert.equal(view.isFirstUse, true)
  assert.equal(view.primaryTask.actionType, 'diagnosis')
  assert.equal(view.primaryTask.actionText, '拍照诊断')
  assert.equal(view.taskQueue.length, 0)
  assert.deepEqual(view.tools.map(item => item.key), ['diagnosis', 'defaultPaper', 'history'])
  assert.equal(view.subjectIllustration.imageSrc, undefined)
  assert.match(view.subjectIllustration.alt, /数学/)
})

test('subject workbench keeps subject labels without static hero images', () => {
  const math = buildSubjectHomeView({}, [], relative, { subject: 'math', subjectName: '数学' })
  const chinese = buildSubjectHomeView({}, [], relative, { subject: 'chinese', subjectName: '语文' })
  const english = buildSubjectHomeView({}, [], relative, {
    subject: 'english',
    subjectName: '英语',
    englishVocabulary: { summary: { totalWords: 20 } }
  })

  assert.equal(math.subjectIllustration.imageSrc, undefined)
  assert.equal(chinese.subjectIllustration.imageSrc, undefined)
  assert.equal(english.subjectIllustration.imageSrc, undefined)
  assert.match(math.subjectIllustration.alt, /数学/)
  assert.match(chinese.subjectIllustration.alt, /语文/)
  assert.match(english.subjectIllustration.alt, /英语/)
})

test('English workbench uses vocabulary summary as the primary learning asset', () => {
  const view = buildSubjectHomeView({}, [], relative, {
    subject: 'english',
    subjectName: '英语',
    englishVocabulary: {
      summary: {
        totalWords: 320,
        familiarity: {
          masteredCount: 120,
          needsPracticeCount: 18,
          reviewingCount: 12,
          untestedCount: 170,
          dueReviewCount: 8
        },
        spelling: {
          masteredCount: 80,
          needsPracticeCount: 22,
          reviewingCount: 10,
          untestedCount: 208,
          dueReviewCount: 4
        },
        overall: {
          masteredCount: 70,
          partialCount: 180,
          untestedCount: 70
        }
      },
      patternCount: 42
    }
  })

  assert.equal(view.subjectTitle, '英语词汇掌握')
  assert.equal(view.primaryTask.actionType, 'englishPractice')
  assert.equal(view.primaryTask.actionText, '开始认词练习')
  assert.equal(view.primaryTask.recommendedMode, 'familiarity')
  assert.match(view.primaryTask.summary, /320 个个人词库单词/)
  assert.match(view.primaryTask.summary, /安排 20 个/)
  assert.equal(view.englishVocabularyStats.totalWords, 320)
  assert.equal(view.englishVocabularyStats.familiarityMasteredCount, 120)
  assert.equal(view.englishVocabularyStats.spellingNeedsPracticeCount, 22)
  assert.equal(view.englishVocabularyStats.overallMasteredCount, 70)
  assert.deepEqual(view.englishQuickStats.map(item => item.label), ['今日待练', '已熟悉', '拼写薄弱', '真正掌握'])
  assert.deepEqual(view.englishActionCards.map(item => item.key), ['englishPractice', 'englishDictation'])
  assert.equal(view.englishActionCards.find(item => item.key === 'englishPractice').recommended, true)
  assert.equal(view.englishActionCards.find(item => item.key === 'englishDictation').disabled, false)
  assert.ok(view.tools.some(item => item.key === 'history'))
  assert.ok(view.tools.some(item => item.key === 'englishWrongWords'))
  assert.ok(view.tools.every(item => item.key !== 'englishPractice'))
  assert.ok(view.tools.every(item => item.key !== 'englishDictation'))
  assert.ok(view.tools.every(item => item.key !== 'diagnosis' && item.key !== 'defaultPaper'))
})

test('English workbench keeps learning actions primary while empty vocabulary is prepared automatically', () => {
  const view = buildSubjectHomeView({}, [], relative, {
    subject: 'english',
    subjectName: '英语',
    englishVocabulary: {
      summary: {
        totalWords: 0,
        needsPracticeCount: 0,
        reviewingCount: 0,
        masteredCount: 0,
        dueReviewCount: 0
      }
    }
  })

  assert.equal(view.subjectTitle, '英语词汇掌握')
  assert.notEqual(view.primaryTask.actionType, 'importVocabulary')
  assert.equal(view.primaryTask.actionText, '查看学习记录')
  assert.match(view.primaryTask.summary, /系统会自动导入/)
  assert.deepEqual(view.englishActionCards.map(item => item.key), ['englishPractice', 'englishDictation'])
  assert.ok(view.englishActionCards.every(item => item.disabled === true))
  assert.ok(view.tools.every(item => item.key !== 'diagnosis' && item.key !== 'defaultPaper'))
  assert.ok(view.tools.some(item => item.key === 'importVocabulary'))
})

test('English workbench recommends paper dictation when spelling has more weak words', () => {
  const view = buildSubjectHomeView({}, [], relative, {
    subject: 'english',
    subjectName: '英语',
    englishVocabulary: {
      summary: {
        totalWords: 505,
        familiarity: {
          masteredCount: 220,
          needsPracticeCount: 2,
          reviewingCount: 8,
          untestedCount: 80,
          dueReviewCount: 1
        },
        spelling: {
          masteredCount: 120,
          needsPracticeCount: 35,
          reviewingCount: 15,
          untestedCount: 260,
          dueReviewCount: 12
        },
        overall: {
          masteredCount: 110,
          partialCount: 260,
          untestedCount: 135
        }
      }
    }
  })

  assert.equal(view.primaryTask.actionType, 'englishDictation')
  assert.equal(view.primaryTask.actionText, '开始纸面听写')
  assert.equal(view.primaryTask.recommendedMode, 'spelling')
  assert.match(view.primaryTask.summary, /纸面听写/)
  assert.equal(view.englishActionCards.find(item => item.key === 'englishDictation').recommended, true)
  assert.equal(view.englishActionCards.find(item => item.key === 'englishPractice').recommended, false)
  assert.ok(view.tools.every(item => item.key !== 'englishPractice'))
  assert.ok(view.tools.every(item => item.key !== 'englishDictation'))
})

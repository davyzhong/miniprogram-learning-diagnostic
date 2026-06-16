const test = require('node:test')
const assert = require('node:assert/strict')

const { normalizePageResults } = require('../cloudfunctions/analyzeBatch/result-normalizer')

test('accepts exactly one AI page result for each uploaded image', () => {
  const result = normalizePageResults({
    pageResults: [
      { imageIndex: 1, ocrSummary: '第一页', bottlenecks: [], errorDetails: [] },
      { imageIndex: 2, ocrSummary: '第二页', bottlenecks: [], errorDetails: [] }
    ]
  }, 2)

  assert.deepEqual(result.pageResults.map(page => page.imageIndex), [1, 2])
})

test('rejects missing, duplicate or out-of-range image indexes', () => {
  assert.throws(
    () => normalizePageResults({ pageResults: [{ imageIndex: 1, bottlenecks: [], errorDetails: [] }] }, 2),
    /逐页分析结果数量不正确/
  )
  assert.throws(
    () => normalizePageResults({
      pageResults: [
        { imageIndex: 1, bottlenecks: [], errorDetails: [] },
        { imageIndex: 1, bottlenecks: [], errorDetails: [] }
      ]
    }, 2),
    /图片序号无效/
  )
})

test('normalizes verification evidence counts without trusting completion flags', () => {
  const result = normalizePageResults({
    pageResults: [{
      imageIndex: 1,
      bottlenecks: [],
      errorDetails: [],
      verificationEvidence: [{
        lpCode: 'LP-001',
        attemptedQuestionCount: '3',
        incorrectQuestionCount: -1,
        blankQuestionCount: '1',
        unclearQuestionCount: 2,
        missingQuestionCount: -5,
        complete: true,
        allCorrect: true
      }]
    }]
  }, 1)

  assert.deepEqual(result.pageResults[0].verificationEvidence, [{
    lpCode: 'LP-001',
    attemptedQuestionCount: 3,
    incorrectQuestionCount: 0,
    blankQuestionCount: 1,
    unclearQuestionCount: 2,
    missingQuestionCount: 0
  }])
})

test('preserves math learning map v2 fields from AI bottleneck output', () => {
  const result = normalizePageResults({
    pageResults: [{
      imageIndex: 1,
      bottlenecks: [{
        lpCode: 'LP-FD',
        lpName: '分数除法',
        errorCount: 2,
        severity: 'high',
        rootCause: '倒数规则不稳',
        suggestion: '先重学再微验证',
        nodeIds: ['MATH-NUM-FRACTION-DIV-RECIPROCAL'],
        candidateBottlenecks: [{
          bottleneckId: 'BN-FRACTION-DIV-RECIPROCAL-MISSING',
          title: '除以分数未稳定转换为乘倒数',
          evidenceStrength: 'high',
          microValidationRequired: true,
          suggestedMicroValidation: ['6÷7/8', '3÷2/5'],
          recommendedResourceIds: ['RES-YT-FRACTION-DIV-001', 'RES-BILI-FRACTION-DIV-001']
        }],
        evidenceStrength: 'high',
        nextActionType: 'resourceReview',
        nextActionText: '先看高质量锚点，再配合国内资源复述。',
        recommendedResourceIds: ['RES-YT-FRACTION-DIV-001', 'RES-BILI-FRACTION-DIV-001']
      }],
      errorDetails: []
    }]
  }, 1)

  assert.deepEqual(result.pageResults[0].bottlenecks[0].nodeIds, ['MATH-NUM-FRACTION-DIV-RECIPROCAL'])
  assert.deepEqual(result.pageResults[0].bottlenecks[0].recommendedResourceIds, [
    'RES-YT-FRACTION-DIV-001',
    'RES-BILI-FRACTION-DIV-001'
  ])
  assert.deepEqual(result.pageResults[0].bottlenecks[0].candidateBottlenecks[0], {
    bottleneckId: 'BN-FRACTION-DIV-RECIPROCAL-MISSING',
    title: '除以分数未稳定转换为乘倒数',
    evidenceStrength: 'high',
    microValidationRequired: true,
    suggestedMicroValidation: ['6÷7/8', '3÷2/5'],
    recommendedResourceIds: ['RES-YT-FRACTION-DIV-001', 'RES-BILI-FRACTION-DIV-001']
  })
  assert.equal(result.pageResults[0].bottlenecks[0].nextActionType, 'resourceReview')
})

test('preserves chinese concrete error items from AI output', () => {
  const result = normalizePageResults({
    pageResults: [{
      imageIndex: 1,
      ocrSummary: '看拼音写词语和古诗默写',
      bottlenecks: [{
        lpCode: 'LP-101',
        lpName: '识字词语',
        errorCount: 1,
        severity: 'high'
      }],
      errorDetails: [{
        questionContent: '看拼音写词语：biàn lùn',
        studentAnswer: '辨论',
        correctAnswer: '辩论',
        lpCode: 'LP-101'
      }],
      chineseErrorItems: [{
        itemId: 'CHI-WORD-BIANLUN',
        itemType: 'word',
        targetText: '辩论',
        expectedAnswer: '辩论',
        studentAnswer: '辨论',
        sourceContext: '看拼音写词语：biàn lùn',
        mistakeType: '形近字混淆',
        verificationMethods: ['dictation', 'pinyin_to_word', 'context_fill'],
        relatedLpCode: 'LP-101',
        suggestion: '区分辩、辨、辫、瓣。'
      }]
    }]
  }, 1)

  assert.deepEqual(result.pageResults[0].chineseErrorItems, [{
    itemId: 'CHI-WORD-BIANLUN',
    itemType: 'word',
    targetText: '辩论',
    expectedAnswer: '辩论',
    studentAnswer: '辨论',
    sourceContext: '看拼音写词语：biàn lùn',
    mistakeType: '形近字混淆',
    sourceQuestion: '',
    evidenceStrength: '',
    verificationMethods: ['dictation', 'pinyin_to_word', 'context_fill'],
    relatedLpCode: 'LP-101',
    suggestion: '区分辩、辨、辫、瓣。'
  }])
})

test('normalizes chinese review evidence counts by concrete item id', () => {
  const result = normalizePageResults({
    pageResults: [{
      imageIndex: 1,
      bottlenecks: [],
      errorDetails: [],
      chineseReviewEvidence: [{
        itemId: 'CHI-WORD-BIANLUN',
        targetText: '辩论',
        attemptedQuestionCount: '1',
        incorrectQuestionCount: 0,
        blankQuestionCount: 0,
        unclearQuestionCount: 0,
        missingQuestionCount: -1
      }]
    }]
  }, 1)

  assert.deepEqual(result.pageResults[0].chineseReviewEvidence, [{
    itemId: 'CHI-WORD-BIANLUN',
    targetText: '辩论',
    attemptedQuestionCount: 1,
    incorrectQuestionCount: 0,
    blankQuestionCount: 0,
    unclearQuestionCount: 0,
    missingQuestionCount: 0
  }])
})

const test = require('node:test')
const assert = require('node:assert/strict')

const {
  aggregateVerificationEvidence,
  aggregateChineseReviewEvidence,
  buildVerificationPlan
} = require('../cloudfunctions/analyzePhotos/verification-evidence')

test('builds expected verification counts from the generated paper', () => {
  const plan = buildVerificationPlan({
    bottleneckTargets: ['LP-001', 'LP-002'],
    questions: [
      { lpCode: 'LP-001' },
      { lpCode: 'LP-001' },
      { lpCode: 'LP-002' }
    ]
  })

  assert.deepEqual(plan, [
    { lpCode: 'LP-001', expectedQuestionCount: 2 },
    { lpCode: 'LP-002', expectedQuestionCount: 1 }
  ])
})

test('builds page-aware verification plan from verificationPack pages', () => {
  const plan = buildVerificationPlan({
    verificationPack: {
      pages: [{
        pageCode: 'MATH-V-20260616-01-P01',
        targets: [{
          targetId: 'BN-FINE-1',
          targetType: 'fine_bottleneck',
          displayName: '小数点定位不稳',
          legacyLpCode: 'LP-001'
        }, {
          targetId: 'BN-FINE-2',
          targetType: 'fine_bottleneck',
          displayName: '分数通分不稳',
          legacyLpCode: 'LP-002'
        }]
      }]
    },
    questions: [
      { questionId: 'Q1', pageCode: 'MATH-V-20260616-01-P01', targetId: 'BN-FINE-1', lpCode: 'BN-FINE-1' },
      { questionId: 'Q2', pageCode: 'MATH-V-20260616-01-P01', targetId: 'BN-FINE-1', lpCode: 'BN-FINE-1' },
      { questionId: 'Q3', pageCode: 'MATH-V-20260616-01-P01', targetId: 'BN-FINE-2', lpCode: 'BN-FINE-2' }
    ]
  })

  assert.deepEqual(plan, [{
    lpCode: 'BN-FINE-1',
    targetId: 'BN-FINE-1',
    targetType: 'fine_bottleneck',
    displayName: '小数点定位不稳',
    legacyLpCode: 'LP-001',
    pageCode: 'MATH-V-20260616-01-P01',
    expectedQuestionCount: 2,
    questionIds: ['Q1', 'Q2']
  }, {
    lpCode: 'BN-FINE-2',
    targetId: 'BN-FINE-2',
    targetType: 'fine_bottleneck',
    displayName: '分数通分不稳',
    legacyLpCode: 'LP-002',
    pageCode: 'MATH-V-20260616-01-P01',
    expectedQuestionCount: 1,
    questionIds: ['Q3']
  }])
})

test('only passes a verification target when every expected answer is visible and correct', () => {
  const plan = [{ lpCode: 'LP-001', expectedQuestionCount: 3 }]

  assert.deepEqual(aggregateVerificationEvidence(plan, [{
    verificationEvidence: [{ lpCode: 'LP-001', attemptedQuestionCount: 2, incorrectQuestionCount: 0 }]
  }])[0], {
    lpCode: 'LP-001',
    expectedQuestionCount: 3,
    attemptedQuestionCount: 2,
    incorrectQuestionCount: 0,
    blankQuestionCount: 0,
    unclearQuestionCount: 0,
    missingQuestionCount: 1,
    complete: false,
    allCorrect: false,
    evidenceStatus: 'incomplete',
    evidenceReason: '仍有 1 道题未形成清晰作答证据'
  })

  const passed = aggregateVerificationEvidence(plan, [{
    verificationEvidence: [{ lpCode: 'LP-001', attemptedQuestionCount: 3, incorrectQuestionCount: 0 }]
  }])[0]
  assert.equal(passed.allCorrect, true)
  assert.equal(passed.evidenceStatus, 'passed')
  assert.equal(passed.evidenceReason, '3 道验证题均清晰作答且全部正确')
})

test('verification evidence distinguishes failed blank unclear and missing states', () => {
  const plan = [{ lpCode: 'LP-001', expectedQuestionCount: 5 }]

  assert.deepEqual(aggregateVerificationEvidence(plan, [{
    verificationEvidence: [{
      lpCode: 'LP-001',
      attemptedQuestionCount: 5,
      incorrectQuestionCount: 1
    }]
  }])[0].evidenceStatus, 'failed')

  assert.deepEqual(aggregateVerificationEvidence(plan, [{
    verificationEvidence: [{
      lpCode: 'LP-001',
      attemptedQuestionCount: 3,
      incorrectQuestionCount: 0,
      blankQuestionCount: 2
    }]
  }])[0], {
    lpCode: 'LP-001',
    expectedQuestionCount: 5,
    attemptedQuestionCount: 3,
    incorrectQuestionCount: 0,
    blankQuestionCount: 2,
    unclearQuestionCount: 0,
    missingQuestionCount: 0,
    complete: false,
    allCorrect: false,
    evidenceStatus: 'incomplete',
    evidenceReason: '有 2 道题为空白，需补充完整作答'
  })

  assert.deepEqual(aggregateVerificationEvidence(plan, [{
    verificationEvidence: [{
      lpCode: 'LP-001',
      attemptedQuestionCount: 4,
      incorrectQuestionCount: 0,
      unclearQuestionCount: 1
    }]
  }])[0].evidenceStatus, 'unclear')

  assert.deepEqual(aggregateVerificationEvidence(plan, [])[0].evidenceStatus, 'missing')
})

test('builds and aggregates chinese review item evidence separately from coarse lp codes', () => {
  const plan = buildVerificationPlan({
    bottleneckTargets: ['LP-101'],
    chineseReviewTargets: [{
      itemId: 'CHI-WORD-BIANLUN',
      itemType: 'word',
      targetText: '辩论',
      expectedAnswer: '辩论',
      relatedLpCode: 'LP-101'
    }],
    questions: [
      { lpCode: 'LP-101', reviewItemId: 'CHI-WORD-BIANLUN' },
      { lpCode: 'LP-101' }
    ]
  })

  assert.deepEqual(plan, [{
    lpCode: 'LP-101',
    expectedQuestionCount: 2,
    chineseReviewTargets: [{
      itemId: 'CHI-WORD-BIANLUN',
      itemType: 'word',
      targetText: '辩论',
      expectedAnswer: '辩论',
      relatedLpCode: 'LP-101',
      expectedQuestionCount: 1
    }]
  }])

  const evidence = aggregateChineseReviewEvidence(plan, [{
    chineseReviewEvidence: [{
      itemId: 'CHI-WORD-BIANLUN',
      targetText: '辩论',
      attemptedQuestionCount: 1,
      incorrectQuestionCount: 0
    }]
  }])

  assert.deepEqual(evidence[0], {
    itemId: 'CHI-WORD-BIANLUN',
    itemType: 'word',
    targetText: '辩论',
    expectedAnswer: '辩论',
    relatedLpCode: 'LP-101',
    expectedQuestionCount: 1,
    attemptedQuestionCount: 1,
    incorrectQuestionCount: 0,
    blankQuestionCount: 0,
    unclearQuestionCount: 0,
    missingQuestionCount: 0,
    complete: true,
    allCorrect: true,
    evidenceStatus: 'passed',
    evidenceReason: '1 道验证题均清晰作答且全部正确'
  })
})

const test = require('node:test')
const assert = require('node:assert/strict')

const {
  aggregateVerificationEvidence,
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

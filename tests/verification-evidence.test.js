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
    complete: false,
    allCorrect: false
  })

  assert.equal(aggregateVerificationEvidence(plan, [{
    verificationEvidence: [{ lpCode: 'LP-001', attemptedQuestionCount: 3, incorrectQuestionCount: 0 }]
  }])[0].allCorrect, true)
})

function buildVerificationPlan(paper = {}) {
  const counts = new Map()
  for (const question of paper.questions || []) {
    if (!question || !question.lpCode) continue
    counts.set(question.lpCode, (counts.get(question.lpCode) || 0) + 1)
  }

  return (paper.bottleneckTargets || []).map(lpCode => ({
    lpCode,
    expectedQuestionCount: counts.get(lpCode) || 0
  }))
}

function aggregateVerificationEvidence(plan = [], pages = []) {
  const totals = new Map(plan.map(item => [item.lpCode, {
    lpCode: item.lpCode,
    expectedQuestionCount: Number(item.expectedQuestionCount) || 0,
    attemptedQuestionCount: 0,
    incorrectQuestionCount: 0
  }]))

  for (const page of pages) {
    for (const evidence of page.verificationEvidence || []) {
      const total = totals.get(evidence.lpCode)
      if (!total) continue
      total.attemptedQuestionCount += Math.max(0, Number(evidence.attemptedQuestionCount) || 0)
      total.incorrectQuestionCount += Math.max(0, Number(evidence.incorrectQuestionCount) || 0)
    }
  }

  return Array.from(totals.values()).map(item => ({
    ...item,
    complete: item.expectedQuestionCount > 0 && item.attemptedQuestionCount >= item.expectedQuestionCount,
    allCorrect: item.expectedQuestionCount > 0
      && item.attemptedQuestionCount >= item.expectedQuestionCount
      && item.incorrectQuestionCount === 0
  }))
}

module.exports = {
  aggregateVerificationEvidence,
  buildVerificationPlan
}

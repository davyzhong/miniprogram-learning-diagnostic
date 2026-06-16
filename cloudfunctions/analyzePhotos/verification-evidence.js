function buildVerificationPlan(paper = {}) {
  if (paper.verificationPack && Array.isArray(paper.verificationPack.pages)) {
    return buildPageAwareVerificationPlan(paper)
  }

  const counts = new Map()
  const chineseReviewCounts = new Map()
  for (const question of paper.questions || []) {
    if (!question || !question.lpCode) continue
    counts.set(question.lpCode, (counts.get(question.lpCode) || 0) + 1)
    if (question.reviewItemId) {
      chineseReviewCounts.set(question.reviewItemId, (chineseReviewCounts.get(question.reviewItemId) || 0) + 1)
    }
  }

  return (paper.bottleneckTargets || []).map(lpCode => {
    const item = {
      lpCode,
      expectedQuestionCount: counts.get(lpCode) || 0
    }
    const chineseReviewTargets = (paper.chineseReviewTargets || [])
      .filter(target => target && (target.relatedLpCode || target.lpCode) === lpCode)
      .map(target => ({
        itemId: target.itemId || '',
        itemType: target.itemType || '',
        targetText: target.targetText || '',
        expectedAnswer: target.expectedAnswer || target.targetText || '',
        relatedLpCode: target.relatedLpCode || target.lpCode || lpCode,
        expectedQuestionCount: chineseReviewCounts.get(target.itemId) || 1
      }))
      .filter(target => target.itemId)
    if (chineseReviewTargets.length > 0) {
      item.chineseReviewTargets = chineseReviewTargets
    }
    return item
  })
}

function questionTargetId(question = {}) {
  return question.targetId || question.lpCode || question.reviewItemId || ''
}

function buildQuestionIndex(questions = []) {
  const byTarget = new Map()
  for (const question of questions || []) {
    const targetId = questionTargetId(question)
    if (!targetId) continue
    if (!byTarget.has(targetId)) byTarget.set(targetId, [])
    byTarget.get(targetId).push(question)
  }
  return byTarget
}

function buildPageAwareVerificationPlan(paper = {}) {
  const byTarget = buildQuestionIndex(paper.questions || [])
  const result = []
  for (const page of paper.verificationPack.pages || []) {
    for (const target of page.targets || []) {
      const targetId = target.targetId || target.lpCode || ''
      if (!targetId) continue
      const questions = byTarget.get(targetId) || []
      result.push({
        lpCode: targetId,
        targetId,
        targetType: target.targetType || '',
        displayName: target.displayName || target.title || targetId,
        legacyLpCode: target.legacyLpCode || target.lpCode || '',
        pageCode: page.pageCode || '',
        expectedQuestionCount: questions.length,
        questionIds: questions.map(question => question.questionId).filter(Boolean)
      })
    }
  }
  return result
}

function aggregateVerificationEvidence(plan = [], pages = []) {
  const totals = new Map(plan.map(item => {
    const total = {
      lpCode: item.lpCode,
      expectedQuestionCount: Number(item.expectedQuestionCount) || 0,
      attemptedQuestionCount: 0,
      incorrectQuestionCount: 0,
      blankQuestionCount: 0,
      unclearQuestionCount: 0,
      missingQuestionCount: 0
    }
    if (item.targetId) total.targetId = item.targetId
    if (item.targetType) total.targetType = item.targetType
    if (item.displayName) total.displayName = item.displayName
    if (item.legacyLpCode) total.legacyLpCode = item.legacyLpCode
    if (item.pageCode) total.pageCode = item.pageCode
    if (Array.isArray(item.questionIds)) total.questionIds = item.questionIds
    return [item.lpCode, total]
  }))

  for (const page of pages) {
    for (const evidence of page.verificationEvidence || []) {
      const total = totals.get(evidence.targetId || evidence.lpCode)
      if (!total) continue
      total.attemptedQuestionCount += Math.max(0, Number(evidence.attemptedQuestionCount) || 0)
      total.incorrectQuestionCount += Math.max(0, Number(evidence.incorrectQuestionCount) || 0)
      total.blankQuestionCount += Math.max(0, Number(evidence.blankQuestionCount) || 0)
      total.unclearQuestionCount += Math.max(0, Number(evidence.unclearQuestionCount) || 0)
      total.missingQuestionCount += Math.max(0, Number(evidence.missingQuestionCount) || 0)
    }
  }

  return Array.from(totals.values()).map(item => {
    const observedQuestionCount = item.attemptedQuestionCount
      + item.blankQuestionCount
      + item.unclearQuestionCount
      + item.missingQuestionCount
    const calculatedMissing = Math.max(0, item.expectedQuestionCount - observedQuestionCount)
    const normalized = {
      ...item,
      missingQuestionCount: item.missingQuestionCount + calculatedMissing
    }
    const status = evidenceStatusOf(normalized)
    return {
      ...normalized,
      complete: status === 'passed' || status === 'failed',
      allCorrect: status === 'passed',
      evidenceStatus: status,
      evidenceReason: evidenceReasonOf(normalized, status)
    }
  })
}

function aggregateChineseReviewEvidence(plan = [], pages = []) {
  const targets = plan.flatMap(item => item.chineseReviewTargets || [])
  const totals = new Map(targets.map(target => [target.itemId, {
    itemId: target.itemId,
    itemType: target.itemType || '',
    targetText: target.targetText || '',
    expectedAnswer: target.expectedAnswer || target.targetText || '',
    relatedLpCode: target.relatedLpCode || '',
    expectedQuestionCount: Number(target.expectedQuestionCount) || 1,
    attemptedQuestionCount: 0,
    incorrectQuestionCount: 0,
    blankQuestionCount: 0,
    unclearQuestionCount: 0,
    missingQuestionCount: 0
  }]))

  for (const page of pages) {
    for (const evidence of page.chineseReviewEvidence || []) {
      const total = totals.get(evidence.itemId)
      if (!total) continue
      total.attemptedQuestionCount += Math.max(0, Number(evidence.attemptedQuestionCount) || 0)
      total.incorrectQuestionCount += Math.max(0, Number(evidence.incorrectQuestionCount) || 0)
      total.blankQuestionCount += Math.max(0, Number(evidence.blankQuestionCount) || 0)
      total.unclearQuestionCount += Math.max(0, Number(evidence.unclearQuestionCount) || 0)
      total.missingQuestionCount += Math.max(0, Number(evidence.missingQuestionCount) || 0)
    }
  }

  return Array.from(totals.values()).map(item => {
    const observedQuestionCount = item.attemptedQuestionCount
      + item.blankQuestionCount
      + item.unclearQuestionCount
      + item.missingQuestionCount
    const calculatedMissing = Math.max(0, item.expectedQuestionCount - observedQuestionCount)
    const normalized = {
      ...item,
      missingQuestionCount: item.missingQuestionCount + calculatedMissing
    }
    const status = evidenceStatusOf(normalized)
    return {
      ...normalized,
      complete: status === 'passed' || status === 'failed',
      allCorrect: status === 'passed',
      evidenceStatus: status,
      evidenceReason: evidenceReasonOf(normalized, status)
    }
  })
}

function evidenceStatusOf(item) {
  if (item.expectedQuestionCount <= 0) return 'missing'
  if (item.attemptedQuestionCount === 0
    && item.blankQuestionCount === 0
    && item.unclearQuestionCount === 0
    && item.missingQuestionCount > 0) {
    return 'missing'
  }
  if (item.incorrectQuestionCount > 0) return 'failed'
  if (item.unclearQuestionCount > 0) return 'unclear'
  if (item.blankQuestionCount > 0) return 'incomplete'
  if (item.attemptedQuestionCount < item.expectedQuestionCount || item.missingQuestionCount > 0) return 'incomplete'
  return 'passed'
}

function evidenceReasonOf(item, status) {
  const count = item.expectedQuestionCount
  if (status === 'passed') return `${count} 道验证题均清晰作答且全部正确`
  if (status === 'failed') return `有 ${item.incorrectQuestionCount} 道题仍然出错`
  if (status === 'unclear') return `有 ${item.unclearQuestionCount} 道题图像不清晰，暂不能判断是否改善`
  if (status === 'incomplete') {
    if (item.blankQuestionCount > 0) return `有 ${item.blankQuestionCount} 道题为空白，需补充完整作答`
    return `仍有 ${Math.max(item.missingQuestionCount, count - item.attemptedQuestionCount)} 道题未形成清晰作答证据`
  }
  return 'AI 未返回该卡点的有效验证证据'
}

module.exports = {
  aggregateVerificationEvidence,
  aggregateChineseReviewEvidence,
  buildVerificationPlan,
  evidenceStatusOf
}

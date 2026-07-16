const STATUS = {
  NEEDS_VERIFICATION: 'needs_verification',
  PERSISTING: 'persisting',
  IMPROVED: 'improved'
}

function getVerificationEvidence(report, lpCode) {
  return (report.verificationEvidence || []).find(item => item.lpCode === lpCode)
}

function isPassedEvidence(evidence) {
  if (!evidence) return false
  if (evidence.evidenceStatus) return evidence.evidenceStatus === 'passed'
  return Boolean(evidence.complete === true && evidence.allCorrect === true)
}

function isEffectiveReport(report = {}) {
  if (report.allPhotosDuplicate) return false
  if ((report.bottlenecks || []).some(item => item && item.lpCode)) return true
  if ((report.chineseErrorItems || []).some(item => item && (item.targetText || item.expectedAnswer))) return true
  return (report.verificationEvidence || []).some(isPassedEvidence)
}

function clampWeight(value) {
  return Math.max(0, Math.min(100, Number(value) || 0))
}

function getCurrentWeight(item, fallback = 60) {
  return Number.isFinite(Number(item && item.weight)) ? Number(item.weight) : fallback
}

function errorCountOf(bottleneck) {
  return Math.max(0, Number(bottleneck && (bottleneck.errorCount || bottleneck.relatedErrorCount || bottleneck.evidenceCount)) || 0)
}

function diagnosisErrorCountOf(bottleneck) {
  return Math.max(0, Number(bottleneck && (bottleneck.errorCount || bottleneck.relatedErrorCount)) || 0)
}

function uniqueStrings(values = []) {
  return Array.from(new Set((values || []).filter(Boolean)))
}

function nextChineseReviewAt(now, reviewPassCount) {
  const days = reviewPassCount >= 2 ? 7 : (reviewPassCount >= 1 ? 3 : 1)
  const next = new Date(now)
  next.setDate(next.getDate() + days)
  return next
}

function reviewItemKey(item = {}) {
  return item.itemId
    || [
      item.itemType || 'item',
      item.targetText || item.expectedAnswer || '',
      item.sourceContext || ''
    ].join(':')
}

function normalizeChineseReviewItems(items = []) {
  return (Array.isArray(items) ? items : [])
    .filter(item => item && (item.targetText || item.expectedAnswer || item.itemId))
    .map(item => ({
      itemId: item.itemId || reviewItemKey(item),
      itemType: item.itemType || 'word',
      targetText: item.targetText || item.expectedAnswer || '',
      expectedAnswer: item.expectedAnswer || item.targetText || '',
      lastWrongAnswer: item.lastWrongAnswer || item.studentAnswer || '',
      sourceContext: item.sourceContext || '',
      mistakeType: item.mistakeType || '',
      status: item.status || 'needs_review',
      firstSeenAt: item.firstSeenAt,
      lastSeenAt: item.lastSeenAt,
      evidenceCount: Number(item.evidenceCount) || 0,
      reviewPassCount: Number(item.reviewPassCount) || 0,
      reviewFailCount: Number(item.reviewFailCount) || 0,
      nextReviewAt: item.nextReviewAt || '',
      intervalLevel: Number(item.intervalLevel) || 0,
      relatedLpCode: item.relatedLpCode || item.lpCode || 'LP-101',
      verificationMethods: uniqueStrings(item.verificationMethods || []),
      sourceReportId: item.sourceReportId || '',
      suggestion: item.suggestion || ''
    }))
}

function mergeChineseReviewItems(previousItems = [], errorItems = [], now = new Date(), report = {}) {
  const byKey = new Map(normalizeChineseReviewItems(previousItems).map(item => [reviewItemKey(item), item]))
  for (const errorItem of Array.isArray(errorItems) ? errorItems : []) {
    if (!errorItem || (!errorItem.targetText && !errorItem.expectedAnswer)) continue
    const itemId = errorItem.itemId || reviewItemKey(errorItem)
    const key = reviewItemKey({ ...errorItem, itemId })
    const previous = byKey.get(key)
    byKey.set(key, {
      ...previous,
      itemId,
      itemType: errorItem.itemType || (previous && previous.itemType) || 'word',
      targetText: errorItem.targetText || errorItem.expectedAnswer || (previous && previous.targetText) || '',
      expectedAnswer: errorItem.expectedAnswer || errorItem.targetText || (previous && previous.expectedAnswer) || '',
      lastWrongAnswer: errorItem.studentAnswer || errorItem.lastWrongAnswer || (previous && previous.lastWrongAnswer) || '',
      sourceContext: errorItem.sourceContext || (previous && previous.sourceContext) || '',
      mistakeType: errorItem.mistakeType || (previous && previous.mistakeType) || '',
      status: previous ? 'recurring' : 'needs_review',
      firstSeenAt: (previous && previous.firstSeenAt) || now,
      lastSeenAt: now,
      evidenceCount: (Number(previous && previous.evidenceCount) || 0) + 1,
      reviewPassCount: Number(previous && previous.reviewPassCount) || 0,
      reviewFailCount: Number(previous && previous.reviewFailCount) || 0,
      nextReviewAt: errorItem.nextReviewAt || (previous && previous.nextReviewAt) || '',
      intervalLevel: previous ? Math.min(Number(previous.intervalLevel) || 0, 1) : 0,
      relatedLpCode: errorItem.relatedLpCode || errorItem.lpCode || (previous && previous.relatedLpCode) || 'LP-101',
      verificationMethods: uniqueStrings([
        ...((previous && previous.verificationMethods) || []),
        ...(errorItem.verificationMethods || [])
      ]),
      sourceReportId: report._id || (previous && previous.sourceReportId) || '',
      suggestion: errorItem.suggestion || (previous && previous.suggestion) || ''
    })
  }
  return Array.from(byKey.values()).sort((a, b) => {
    const statusRank = { recurring: 0, needs_review: 1, reviewing: 2, mastered: 3 }
    const rankDiff = (statusRank[a.status] ?? 9) - (statusRank[b.status] ?? 9)
    if (rankDiff !== 0) return rankDiff
    return (Number(b.evidenceCount) || 0) - (Number(a.evidenceCount) || 0)
  })
}

function applyChineseReviewEvidence(reviewItems = [], evidenceItems = [], now = new Date(), report = {}) {
  if (!Array.isArray(evidenceItems) || evidenceItems.length === 0) return reviewItems
  const byId = new Map(reviewItems.map(item => [item.itemId, { ...item }]))
  for (const evidence of evidenceItems) {
    if (!evidence || !evidence.itemId || !byId.has(evidence.itemId)) continue
    const previous = byId.get(evidence.itemId)
    const passed = evidence.evidenceStatus
      ? evidence.evidenceStatus === 'passed'
      : Boolean(evidence.complete === true && evidence.allCorrect === true)
    const failed = evidence.evidenceStatus === 'failed'
      || (evidence.incorrectQuestionCount && Number(evidence.incorrectQuestionCount) > 0)
    if (passed) {
      const reviewPassCount = (Number(previous.reviewPassCount) || 0) + 1
      byId.set(evidence.itemId, {
        ...previous,
        status: reviewPassCount >= 3 ? 'mastered' : 'reviewing',
        reviewPassCount,
        intervalLevel: Math.min(3, (Number(previous.intervalLevel) || 0) + 1),
        nextReviewAt: reviewPassCount >= 3 ? '' : nextChineseReviewAt(now, reviewPassCount),
        lastVerifiedAt: now,
        lastPassedAt: now,
        sourceReportId: report._id || previous.sourceReportId || ''
      })
      continue
    }
    if (failed) {
      byId.set(evidence.itemId, {
        ...previous,
        status: 'recurring',
        reviewFailCount: (Number(previous.reviewFailCount) || 0) + 1,
        intervalLevel: 0,
        nextReviewAt: nextChineseReviewAt(now, 0),
        lastVerifiedAt: now,
        lastFailedAt: now,
        sourceReportId: report._id || previous.sourceReportId || ''
      })
    }
  }
  return Array.from(byId.values())
}

function mergeCandidateBottlenecks(left = [], right = []) {
  const byId = new Map()
  for (const item of [...(left || []), ...(right || [])]) {
    if (!item || !item.bottleneckId) continue
    const previous = byId.get(item.bottleneckId) || {}
    byId.set(item.bottleneckId, {
      ...previous,
      ...item,
      suggestedMicroValidation: uniqueStrings([
        ...(previous.suggestedMicroValidation || []),
        ...(item.suggestedMicroValidation || [])
      ]),
      recommendedResourceIds: uniqueStrings([
        ...(previous.recommendedResourceIds || []),
        ...(item.recommendedResourceIds || [])
      ])
    })
  }
  return Array.from(byId.values())
}

function learningMapFields(previous = {}, bottleneck = {}) {
  return {
    nodeIds: uniqueStrings([...(previous.nodeIds || []), ...(bottleneck.nodeIds || [])]),
    candidateBottlenecks: mergeCandidateBottlenecks(previous.candidateBottlenecks, bottleneck.candidateBottlenecks),
    recommendedResourceIds: uniqueStrings([
      ...(previous.recommendedResourceIds || []),
      ...(bottleneck.recommendedResourceIds || [])
    ]),
    resourcePlan: Array.isArray(bottleneck.resourcePlan) && bottleneck.resourcePlan.length > 0
      ? bottleneck.resourcePlan
      : (previous.resourcePlan || []),
    evidenceStrength: bottleneck.evidenceStrength || previous.evidenceStrength || '',
    nextActionType: bottleneck.nextActionType || previous.nextActionType || '',
    nextActionText: bottleneck.nextActionText || previous.nextActionText || ''
  }
}

function initialWeight(bottleneck) {
  return clampWeight(50 + Math.min(30, errorCountOf(bottleneck) * 5))
}

function normalizeCurrentBottlenecks(profile = {}) {
  if (Array.isArray(profile.currentBottlenecks)) {
    return profile.currentBottlenecks.map(item => ({
      ...item,
      evidenceCount: Number(item.evidenceCount) || 0,
      cumulativeErrorCount: Math.max(0, Number(item.cumulativeErrorCount) || 0),
      recentErrorCount: Number(item.recentErrorCount) || 0,
      verificationPassCount: Number(item.verificationPassCount) || 0,
      verificationFailCount: Number(item.verificationFailCount) || 0,
      weight: clampWeight(item.weight === undefined ? 60 : item.weight),
      trend: item.trend || (item.status === STATUS.IMPROVED ? 'improved' : item.status === STATUS.PERSISTING ? 'persisting' : 'new')
    }))
  }

  const pending = (profile.pendingBottlenecks || []).map(item => ({
    ...item,
    status: STATUS.NEEDS_VERIFICATION,
    firstSeenAt: item.sinceDate,
    lastSeenAt: item.sinceDate,
    evidenceCount: Number(item.evidenceCount) || 1,
    cumulativeErrorCount: Math.max(0, Number(item.cumulativeErrorCount) || 0),
    recentErrorCount: Number(item.relatedErrorCount || item.errorCount) || 0,
    verificationPassCount: 0,
    verificationFailCount: 0,
    weight: clampWeight(item.weight === undefined ? 60 : item.weight),
    trend: item.trend || 'new'
  }))
  const improved = (profile.improvedBottlenecks || []).map(item => ({
    ...item,
    status: STATUS.IMPROVED,
    firstSeenAt: item.sinceDate,
    lastSeenAt: item.improvedDate,
    lastVerifiedAt: item.improvedDate,
    lastPassedAt: item.improvedDate,
    evidenceCount: Number(item.evidenceCount) || 1,
    cumulativeErrorCount: Math.max(0, Number(item.cumulativeErrorCount) || 0),
    recentErrorCount: 0,
    verificationPassCount: Number(item.verificationPassCount) || 1,
    verificationFailCount: Number(item.verificationFailCount) || 0,
    weight: clampWeight(item.weight === undefined ? 30 : item.weight),
    trend: item.trend || 'improved'
  }))
  return [...pending, ...improved]
}

function sortCurrentBottlenecks(items) {
  const rank = {
    [STATUS.PERSISTING]: 3,
    [STATUS.NEEDS_VERIFICATION]: 2,
    [STATUS.IMPROVED]: 1
  }
  return items.sort((a, b) => (rank[b.status] || 0) - (rank[a.status] || 0))
}

function buildChangeSummary(changes) {
  const priority = ['improved', 'persisting', 'new']
  const first = priority.flatMap(type => changes.filter(item => item.type === type))[0]
  if (!first) return '本次未产生新的诊断结论'
  if (first.type === 'improved') return `${first.lpName}已有改善`
  if (first.type === 'persisting') return `${first.lpName}再次出现`
  return `发现${first.lpName}卡点`
}

function buildCurrentSummary(items) {
  const persisting = items.find(item => item.status === STATUS.PERSISTING)
  const pending = items.find(item => item.status === STATUS.NEEDS_VERIFICATION)
  if (persisting && pending) {
    return `${persisting.lpName}持续出现，建议优先训练；${pending.lpName}需要进一步验证。`
  }
  if (persisting) return `${persisting.lpName}持续出现，建议优先训练。`
  if (pending) return `已发现${pending.lpName}等需要验证的学习卡点。`
  if (items.some(item => item.status === STATUS.IMPROVED)) return '近期验证显示已有改善，可以继续观察。'
  return '暂未形成明确学习卡点，建议继续上传试卷观察。'
}

function buildNextAction(items) {
  if (items.some(item => item.status === STATUS.NEEDS_VERIFICATION)) return '生成验证试卷'
  if (items.some(item => item.status === STATUS.PERSISTING)) return '针对持续卡点生成验证试卷'
  return '继续上传试卷'
}

function buildProfileSummary(profile = {}, report = {}, now = new Date()) {
  const current = normalizeCurrentBottlenecks(profile)
  const chineseReviewItems = applyChineseReviewEvidence(
    mergeChineseReviewItems(
      profile.chineseReviewItems || [],
      report.chineseErrorItems || [],
      now,
      report
    ),
    report.chineseReviewEvidence || [],
    now,
    report
  )
  const effective = isEffectiveReport(report)
  if (!effective) {
    return {
      isEffective: false,
      currentBottlenecks: current,
      chineseReviewItems,
      currentSummary: profile.currentSummary || buildCurrentSummary(current),
      nextAction: profile.nextAction || buildNextAction(current),
      changeSummary: '本次未产生新的诊断结论'
    }
  }

  const byCode = new Map(current.map(item => [item.lpCode, { ...item }]))
  const changes = []

  for (const bottleneck of report.bottlenecks || []) {
    if (!bottleneck || !bottleneck.lpCode) continue
    const previous = byCode.get(bottleneck.lpCode)
    const status = previous ? STATUS.PERSISTING : STATUS.NEEDS_VERIFICATION
    const wasImproved = previous && previous.status === STATUS.IMPROVED
    const evidenceCount = (Number(previous && previous.evidenceCount) || 0) + 1
    const recentErrorCount = errorCountOf(bottleneck)
    const cumulativeErrorCount = (Number(previous && previous.cumulativeErrorCount) || 0)
      + (report.type === 'verification' ? 0 : diagnosisErrorCountOf(bottleneck))
    byCode.set(bottleneck.lpCode, {
      ...previous,
      lpCode: bottleneck.lpCode,
      lpName: bottleneck.lpName || (previous && previous.lpName) || bottleneck.lpCode,
      severity: bottleneck.severity || (previous && previous.severity) || 'medium',
      ...learningMapFields(previous, bottleneck),
      status,
      trend: wasImproved ? 'recurring' : (previous ? 'persisting' : 'new'),
      firstSeenAt: (previous && previous.firstSeenAt) || now,
      lastSeenAt: now,
      evidenceCount,
      cumulativeErrorCount,
      recentErrorCount,
      verificationPassCount: Number(previous && previous.verificationPassCount) || 0,
      verificationFailCount: Number(previous && previous.verificationFailCount) || 0,
      weight: previous
        ? clampWeight(getCurrentWeight(previous) + (wasImproved ? 30 : 20))
        : initialWeight(bottleneck),
      sourceReportId: report._id || ''
    })
    changes.push({
      type: previous ? 'persisting' : 'new',
      lpCode: bottleneck.lpCode,
      lpName: bottleneck.lpName || (previous && previous.lpName) || bottleneck.lpCode
    })
  }

  for (const lpCode of report.verificationTargets || []) {
    const previous = byCode.get(lpCode)
    const evidence = getVerificationEvidence(report, lpCode)
    if (!previous || !evidence) continue
    const lastVerifiedAt = now
    if (!isPassedEvidence(evidence)) {
      byCode.set(lpCode, {
        ...previous,
        status: previous.status || STATUS.NEEDS_VERIFICATION,
        trend: previous.trend || 'persisting',
        lastVerifiedAt,
        lastFailedVerificationAt: now,
        verificationFailCount: (Number(previous.verificationFailCount) || 0) + 1,
        weight: clampWeight(getCurrentWeight(previous) + 15),
        sourceReportId: report._id || ''
      })
      continue
    }
    const verificationPassCount = (Number(previous.verificationPassCount) || 0) + 1
    byCode.set(lpCode, {
      ...previous,
      status: STATUS.IMPROVED,
      trend: verificationPassCount >= 2 ? 'improved' : 'declining',
      lastSeenAt: now,
      lastVerifiedAt,
      lastPassedAt: now,
      verificationPassCount,
      weight: clampWeight(getCurrentWeight(previous) - (verificationPassCount >= 2 ? 40 : 30)),
      sourceReportId: report._id || ''
    })
    changes.push({ type: 'improved', lpCode, lpName: previous.lpName })
  }

  const currentBottlenecks = sortCurrentBottlenecks(Array.from(byCode.values()))
  return {
    isEffective: true,
    currentBottlenecks,
    chineseReviewItems,
    currentSummary: buildCurrentSummary(currentBottlenecks),
    nextAction: buildNextAction(currentBottlenecks),
    changeSummary: buildChangeSummary(changes)
  }
}

module.exports = {
  STATUS,
  buildProfileSummary,
  isEffectiveReport,
  normalizeCurrentBottlenecks
}

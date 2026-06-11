const STATUS = {
  NEEDS_VERIFICATION: 'needs_verification',
  PERSISTING: 'persisting',
  IMPROVED: 'improved'
}

function getVerificationEvidence(report, lpCode) {
  return (report.verificationEvidence || []).find(item => item.lpCode === lpCode)
}

function isPassedEvidence(evidence) {
  return Boolean(evidence && evidence.complete === true && evidence.allCorrect === true)
}

function isEffectiveReport(report = {}) {
  if (report.allPhotosDuplicate) return false
  if ((report.bottlenecks || []).some(item => item && item.lpCode)) return true
  return (report.verificationEvidence || []).some(isPassedEvidence)
}

function normalizeCurrentBottlenecks(profile = {}) {
  if (Array.isArray(profile.currentBottlenecks)) {
    return profile.currentBottlenecks.map(item => ({ ...item }))
  }

  const pending = (profile.pendingBottlenecks || []).map(item => ({
    ...item,
    status: STATUS.NEEDS_VERIFICATION,
    firstSeenAt: item.sinceDate,
    lastSeenAt: item.sinceDate
  }))
  const improved = (profile.improvedBottlenecks || []).map(item => ({
    ...item,
    status: STATUS.IMPROVED,
    firstSeenAt: item.sinceDate,
    lastSeenAt: item.improvedDate
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
  const effective = isEffectiveReport(report)
  if (!effective) {
    return {
      isEffective: false,
      currentBottlenecks: current,
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
    byCode.set(bottleneck.lpCode, {
      ...previous,
      lpCode: bottleneck.lpCode,
      lpName: bottleneck.lpName || (previous && previous.lpName) || bottleneck.lpCode,
      severity: bottleneck.severity || (previous && previous.severity) || 'medium',
      status,
      firstSeenAt: (previous && previous.firstSeenAt) || now,
      lastSeenAt: now,
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
    if (!previous || !isPassedEvidence(evidence)) continue
    byCode.set(lpCode, {
      ...previous,
      status: STATUS.IMPROVED,
      lastSeenAt: now,
      sourceReportId: report._id || ''
    })
    changes.push({ type: 'improved', lpCode, lpName: previous.lpName })
  }

  const currentBottlenecks = sortCurrentBottlenecks(Array.from(byCode.values()))
  return {
    isEffective: true,
    currentBottlenecks,
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

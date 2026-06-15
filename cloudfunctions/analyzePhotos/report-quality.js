function clampScore(score) {
  return Math.max(0, Math.min(100, Math.round(score)))
}

function hasText(value) {
  return String(value || '').trim().length > 0
}

function buildReportQuality({
  uniquePages = [],
  merged = {},
  failedBatches = [],
  allPhotosDuplicate = false
} = {}) {
  const reasons = []
  const pageCount = Array.isArray(uniquePages) ? uniquePages.length : 0
  const clearSummaryCount = (uniquePages || []).filter(page => hasText(page.ocrSummary)).length
  const evidence = Array.isArray(merged.verificationEvidence) ? merged.verificationEvidence : []
  let score = 100

  if (allPhotosDuplicate) {
    return {
      level: 'low',
      status: 'insufficient',
      score: 10,
      reasons: ['本次照片均疑似重复，未形成新的诊断证据'],
      sampleSummary: '0 张有效照片'
    }
  }

  if (pageCount === 0) {
    reasons.push('没有可用照片')
    score -= 70
  }

  if (pageCount > 0 && clearSummaryCount === 0) {
    reasons.push('OCR 摘要为空')
    score -= 45
  }

  if ((failedBatches || []).length > 0) {
    reasons.push(`部分照片分析失败（${failedBatches.length} 批）`)
    score -= 25
  }

  if (pageCount <= 1) {
    reasons.push('样本较少')
    score -= 15
  }

  const totalErrors = Math.max(0, Number(merged.totalErrors) || 0)
  const bottleneckCount = Array.isArray(merged.bottlenecks) ? merged.bottlenecks.length : 0
  const hasPassedEvidence = evidence.some(item => item.evidenceStatus === 'passed')
  const unclearEvidence = evidence.filter(item => item.evidenceStatus === 'unclear' || item.evidenceStatus === 'missing')
  const incompleteEvidence = evidence.filter(item => item.evidenceStatus === 'incomplete')

  if (unclearEvidence.length > 0) {
    reasons.push('验证证据不清晰或缺失')
    score -= 45
  } else if (incompleteEvidence.length > 0) {
    reasons.push('验证作答证据不完整')
    score -= 30
  }

  if (totalErrors === 0 && bottleneckCount === 0 && !hasPassedEvidence) {
    reasons.push('未形成可用错题或验证证据')
    score -= 40
  }

  if (bottleneckCount <= 1 && totalErrors <= 1 && !hasPassedEvidence) {
    reasons.push('卡点证据较弱')
    score -= 10
  }

  const normalizedScore = clampScore(score)
  const hardInsufficient = pageCount === 0
    || clearSummaryCount === 0
    || unclearEvidence.length > 0
    || (totalErrors === 0 && bottleneckCount === 0 && !hasPassedEvidence)

  if (hardInsufficient || normalizedScore < 50) {
    return {
      level: 'low',
      status: 'insufficient',
      score: normalizedScore,
      reasons: Array.from(new Set(reasons)),
      sampleSummary: `${pageCount} 张有效照片，${totalErrors} 道相关错题`
    }
  }

  if (reasons.length > 0 || normalizedScore < 85) {
    return {
      level: 'medium',
      status: 'needs_review',
      score: normalizedScore,
      reasons: Array.from(new Set(reasons)),
      sampleSummary: `${pageCount} 张有效照片，${totalErrors} 道相关错题`
    }
  }

  return {
    level: 'high',
    status: 'usable',
    score: 90,
    reasons: [],
    sampleSummary: `${pageCount} 张有效照片，${totalErrors} 道相关错题`
  }
}

module.exports = { buildReportQuality }

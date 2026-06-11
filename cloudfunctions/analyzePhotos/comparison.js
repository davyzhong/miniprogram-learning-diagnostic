function compareBottlenecks(previousBottlenecks = [], currentBottlenecks = [], verifiedCodes = []) {
  const previousByCode = new Map(previousBottlenecks.map(item => [item.lpCode, item]))
  const currentByCode = new Map(currentBottlenecks.map(item => [item.lpCode, item]))
  const verifiedSet = new Set(verifiedCodes)
  const compared = []

  for (const current of currentBottlenecks) {
    const previous = previousByCode.get(current.lpCode)
    let status = 'new'

    if (previous) {
      const previousCount = Number(previous.errorCount) || 0
      const currentCount = Number(current.errorCount) || 0
      if (currentCount < previousCount) status = 'improved'
      else if (currentCount > previousCount) status = 'worsened'
      else status = 'persisting'
    }

    compared.push({ ...current, status })
  }

  for (const previous of previousBottlenecks) {
    const isInVerificationScope = verifiedSet.size === 0 || verifiedSet.has(previous.lpCode)
    if (isInVerificationScope && !currentByCode.has(previous.lpCode)) {
      compared.push({
        ...previous,
        errorCount: 0,
        status: 'improved'
      })
    }
  }

  return compared.sort((a, b) => (b.errorCount || 0) - (a.errorCount || 0))
}

function buildComparisonSummary(bottlenecks = []) {
  const improved = bottlenecks.filter(item => item.status === 'improved').length
  const pending = bottlenecks.filter(item =>
    item.status === 'persisting' || item.status === 'worsened'
  ).length
  const discovered = bottlenecks.filter(item => item.status === 'new').length

  return `${improved} 个学习卡点已改善，${pending} 个仍需继续验证，${discovered} 个为本次新发现。`
}

module.exports = {
  compareBottlenecks,
  buildComparisonSummary
}

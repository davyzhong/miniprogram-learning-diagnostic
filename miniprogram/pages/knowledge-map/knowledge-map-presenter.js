const { profileBottlenecks, expandFineBottleneckItems } = require('../../utils/bottleneck-view')

const DOMAIN_META = [
  { key: '数与代数', icon: '🔢', short: '数与代数' },
  { key: '图形与几何', icon: '📐', short: '图形几何' },
  { key: '统计与概率', icon: '📊', short: '统计概率' },
  { key: '综合与实践', icon: '🔧', short: '综合实践' },
]

function statusMeta(status) {
  if (status === 'improved') return { icon: '✅', text: '已改善', cls: 'mastered' }
  if (status === 'persisting' || status === 'worsened') return { icon: '🔴', text: '持续出现', cls: 'active' }
  return { icon: '🟡', text: '待验证', cls: 'pending' }
}

function buildKnowledgeMapPageView(profile = {}, subject = 'math') {
  const rawBottlenecks = profileBottlenecks(profile)
  const expanded = subject === 'math'
    ? expandFineBottleneckItems(rawBottlenecks, { expandCandidates: true })
    : rawBottlenecks

  // 按领域分组（用 categoryPath 或 fallback 到全部）
  const domainMap = {}
  for (const meta of DOMAIN_META) {
    domainMap[meta.key] = {
      key: meta.key,
      icon: meta.icon,
      name: meta.short,
      bottlenecks: [],
      expanded: false,
    }
  }

  for (const bn of expanded) {
    // 从 categoryPath 或 domain 字段提取领域
    const domain = bn.domain || (bn.categoryPath && bn.categoryPath[0]) || '数与代数'
    const target = domainMap[domain] || domainMap['数与代数']
    const meta = statusMeta(bn.status)
    target.bottlenecks.push({
      lpCode: bn.lpCode || bn.bottleneckId || '',
      displayName: bn.displayName || bn.title || bn.lpName || '',
      statusIcon: meta.icon,
      statusText: meta.text,
      statusClass: meta.cls,
      metaText: bn.evidenceText || `${bn.errorCount || 0} 道相关错题`,
    })
  }

  const domains = Object.values(domainMap).map(d => ({
    ...d,
    count: d.bottlenecks.length,
    activeCount: d.bottlenecks.filter(b => b.statusClass === 'active').length,
    masteredCount: d.bottlenecks.filter(b => b.statusClass === 'mastered').length,
  }))

  const totalActive = domains.reduce((s, d) => s + d.activeCount, 0)
  const totalMastered = domains.reduce((s, d) => s + d.masteredCount, 0)

  return {
    subject,
    title: '学习地图',
    summary: totalActive > 0
      ? `${totalActive} 个待修复 · ${totalMastered} 个已改善`
      : totalMastered > 0
        ? `${totalMastered} 个已改善`
        : '暂无诊断数据',
    domains,
    hasData: domains.some(d => d.count > 0),
  }
}

module.exports = { buildKnowledgeMapPageView }

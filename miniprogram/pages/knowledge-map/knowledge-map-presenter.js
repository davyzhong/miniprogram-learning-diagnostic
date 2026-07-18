const { profileBottlenecks, expandFineBottleneckItems, buildConfidence, normalizeStatus, STATUS_META, NODE_STATUS_META, NODE_STATUS_ORDER } = require('../../utils/bottleneck-view')
const { readableNameOf, sanitizeUserText } = require('../../utils/user-facing-text')
const { buildStatusSegments } = require('../../utils/status-segments')
const { symbolOf } = require('../../utils/ui-symbols')
const knowledgeSeed = require('../../data/math/knowledge-nodes.seed.js')

const DOMAIN_META = [
  { key: '数与代数', marker: '01', short: '数与代数' },
  { key: '图形与几何', marker: '02', short: '图形几何' },
  { key: '统计与概率', marker: '03', short: '统计概率' },
  { key: '综合与实践', marker: '04', short: '综合实践' },
]

// 状态文案统一引用 STATUS_META（bottleneck-view 单一来源）；
// cls 是知识地图自有样式类名（mastered/active/pending），只在此处做映射
function statusMeta(status) {
  const normalized = normalizeStatus({ status })
  const meta = STATUS_META[normalized] || STATUS_META.needs_verification
  const cls = normalized === 'improved' ? 'mastered' : (normalized === 'persisting' ? 'active' : 'pending')
  return { marker: meta.icon, text: meta.text, cls }
}

function buildSymptomText(bn = {}) {
  // 优先用 evidenceText（带具体错题数和场景），回退到 parentDescription / lpName
  if (bn.evidenceText) return sanitizeUserText(bn.evidenceText, { treatAsId: true })
  if (bn.parentDescription) return sanitizeUserText(bn.parentDescription, { treatAsId: true })
  if (bn.errorCount && bn.errorCount > 0) return `${bn.errorCount} 道相关错题`
  return '点击查看讲解并练 3 道'
}

// ── 节点掌握地图（150 知识节点 × 六态）──

const NODE_TONE_BY_STATUS = {
  recurring: 'risk',
  suspected_gap: 'risk',
  relearning: 'risk',
  partial_mastery: 'partial',
  mastered: 'ok',
  unobserved: 'none',
}

function nodeMetaText(record = {}) {
  if (record.nextReviewAt) {
    const reviewDate = new Date(record.nextReviewAt)
    if (!Number.isNaN(reviewDate.getTime())) {
      return reviewDate.getTime() <= Date.now()
        ? '复测已到期'
        : `${reviewDate.getMonth() + 1}月${reviewDate.getDate()}日复测`
    }
  }
  const bnCount = (record.activeBottleneckIds || []).length
  return bnCount > 0 ? `关联 ${bnCount} 个卡点` : ''
}

/**
 * 把 studentNodeMastery 记录与 150 节点镜像合并成领域分组的六态地图。
 * 未观察节点不逐个展示（避免 150 个灰块噪音），按领域汇总计数。
 */
function buildNodeMapView(records = [], subject = 'math') {
  if (subject !== 'math') return null
  const byNode = new Map((records || []).map(item => [item.nodeId, item]))

  let observedTotal = 0
  let gapTotal = 0
  let masteredTotal = 0
  let totalCount = 0

  const domains = DOMAIN_META.map(meta => {
    const domainNodes = (knowledgeSeed.nodes || []).filter(node => node.domain === meta.key)
    const observed = []
    for (const node of domainNodes) {
      const record = byNode.get(node.nodeId)
      const status = record && NODE_STATUS_META[record.status] ? record.status : 'unobserved'
      if (status === 'unobserved') continue
      const statusMeta = NODE_STATUS_META[status]
      observed.push({
        nodeId: node.nodeId,
        title: node.title,
        status,
        statusText: statusMeta.text,
        statusIcon: statusMeta.icon,
        tone: NODE_TONE_BY_STATUS[status],
        metaText: record ? nodeMetaText(record) : '',
        confidence: record && typeof record.confidence === 'number' ? record.confidence : 0,
      })
    }
    observed.sort((a, b) => {
      const orderDiff = NODE_STATUS_ORDER.indexOf(a.status) - NODE_STATUS_ORDER.indexOf(b.status)
      return orderDiff !== 0 ? orderDiff : b.confidence - a.confidence
    })
    const gapCount = observed.filter(node => node.tone === 'risk').length
    const masteredCount = observed.filter(node => node.status === 'mastered').length
    observedTotal += observed.length
    gapTotal += gapCount
    masteredTotal += masteredCount
    totalCount += domainNodes.length
    return {
      key: meta.key,
      marker: meta.marker,
      name: meta.short,
      observed,
      gapCount,
      masteredCount,
      unobservedCount: domainNodes.length - observed.length,
      totalCount: domainNodes.length,
    }
  })

  return {
    domains,
    observedTotal,
    gapTotal,
    masteredTotal,
    totalCount,
    hasObserved: observedTotal > 0,
  }
}

function buildKnowledgeMapPageView(profile = {}, subject = 'math', masteryRecords = []) {
  const rawBottlenecks = profileBottlenecks(profile)
  const expanded = subject === 'math'
    ? expandFineBottleneckItems(rawBottlenecks, { expandCandidates: true })
    : rawBottlenecks

  // 按领域分组（用 categoryPath 或 fallback 到全部）
  const domainMap = {}
  for (const meta of DOMAIN_META) {
    domainMap[meta.key] = {
      key: meta.key,
      marker: meta.marker,
      name: meta.short,
      bottlenecks: [],
      // 改造后默认全部展开：用户进入页面即可看到卡点列表，无需再点一次
      expanded: true,
    }
  }

  for (const bn of expanded) {
    // 从 categoryPath 或 domain 字段提取领域
    const domain = bn.domain || (bn.categoryPath && bn.categoryPath[0]) || '数与代数'
    const target = domainMap[domain] || domainMap['数与代数']
    const meta = statusMeta(bn.status)
    const confidence = buildConfidence(bn)
    target.bottlenecks.push({
      lpCode: bn.lpCode || bn.bottleneckId || '',
      bottleneckId: bn.bottleneckId || bn.lpCode || '',
      nodeId: bn.nodeId || '',
      displayName: readableNameOf(bn) || '待确认学习卡点',
      statusMarker: meta.marker,
      statusText: meta.text,
      statusClass: meta.cls,
      metaText: bn.evidenceText || `${bn.errorCount || 0} 道相关错题`,
      symptomText: buildSymptomText(bn),
      confidenceDots: confidence.dots,
      confidenceLabel: confidence.label,
      confidenceLevel: confidence.level,
      confidenceDetail: confidence.detail,
      subject,
    })
  }

  const domains = Object.values(domainMap)
    .map(d => {
      const count = d.bottlenecks.length
      // 统一口径："待修复" = status !== 'improved'（含 needs_verification + persisting）
      const pendingCount = d.bottlenecks.filter(b => b.statusClass !== 'mastered').length
      const masteredCount = d.bottlenecks.filter(b => b.statusClass === 'mastered').length
      return {
        ...d,
        count,
        pendingCount,
        masteredCount,
        // 掌握度构成条（绿=已改善 / 金=待修复），count 直接驱动分段宽度
        masterySegments: buildStatusSegments([
          { key: 'mastered', label: `已改善 ${masteredCount}`, count: masteredCount, tone: 'improved' },
          { key: 'pending', label: `待修复 ${pendingCount}`, count: pendingCount, tone: 'waiting' }
        ])
      }
    })
    // 只返回有卡点的领域，避免空 domain 占位干扰
    .filter(d => d.count > 0)

  const allBottlenecks = domains.flatMap(d => d.bottlenecks)
  const totalPending = domains.reduce((s, d) => s + d.pendingCount, 0)
  const totalMastered = domains.reduce((s, d) => s + d.masteredCount, 0)

  return {
    subject,
    title: '学习地图',
    knowledgeMapSymbol: symbolOf('knowledgeMap'),
    prioritySymbol: symbolOf('star'),
    emptySymbol: symbolOf('sprout'),
    summary: totalPending > 0
      ? `${totalPending} 个待修复 · ${totalMastered} 个已改善`
      : totalMastered > 0
        ? `${totalMastered} 个已改善`
        : '暂无诊断数据',
    domains,
    // 卡点总数和待修数，给前端做"暂无数据"判断
    bottleneckCount: allBottlenecks.length,
    pendingCount: totalPending,
    hasData: allBottlenecks.length > 0,
    // 节点掌握地图（150 节点 × 六态，仅数学）
    nodeMap: buildNodeMapView(masteryRecords, subject),
    // 顶部 CTA：把最该优先处理的卡点（active 状态）拉到顶部第一个，引导用户直接学
    priorityBottleneck: allBottlenecks.find(b => b.statusClass === 'active') || allBottlenecks[0] || null,
  }
}

module.exports = { buildKnowledgeMapPageView, buildNodeMapView }

const knowledgeSeed = require('../../data/math/knowledge-nodes.seed.json')
const bottleneckSeed = require('../../data/math/bottleneck-taxonomy-v2.seed.json')
const resourceSeed = require('../../data/math/learning-resources.seed.json')
const { normalizeFineBottleneck } = require('./math-bottleneck-hierarchy')

const MAX_CANDIDATE_BOTTLENECKS = 3
const MAX_RECOMMENDED_RESOURCES = 4
const LEVEL_RANK = { A: 0, B: 1, C: 2, D: 3 }
const BACKFILL_VERSION = 'math-learning-map-v2.2-hierarchy'

const nodesById = new Map((knowledgeSeed.nodes || []).map(node => [node.nodeId, node]))
const bottlenecksById = new Map((bottleneckSeed.bottlenecks || []).map(item => [item.bottleneckId, item]))
const resourcesById = new Map((resourceSeed.resources || []).map(item => [item.resourceId, item]))
const qualityAnchorPlatforms = new Set(resourceSeed.selectionPolicy?.qualityAnchorPlatforms || [])
const domesticSupplementPlatforms = new Set(resourceSeed.selectionPolicy?.domesticSupplementPlatforms || [])

const LEGACY_CODE_ALIASES = {
  'LP-001': ['LP-OP', 'LP-FD', 'LP-PRE'],
  'LP-002': ['LP-FD'],
  'LP-003': ['LP-FD', 'LP-PT'],
  'LP-004': ['LP-UN'],
  'LP-005': ['LP-MOD', 'LP-RP', 'LP-PT'],
  'LP-006': ['LP-GEO'],
  'LP-007': ['LP-PRE'],
  'LP-008': ['LP-PRE', 'LP-MOD'],
  'LP-009': ['LP-PRE'],
  'LP-010': ['LP-PRE']
}

const FALLBACK_CANDIDATES = {
  'LP-001': ['BN-META-INVERSE-CHECK-MISSING', 'BN-META-ESTIMATION-MISSING'],
  'LP-002': ['BN-FRACTION-DECIMAL-MIXED-LOAD', 'BN-FRACTION-ADD-DENOM-MISMATCH'],
  'LP-003': ['BN-DEC-PLACE-VALUE-WEAK', 'BN-PERCENT-BASE-WHOLE-MISSING'],
  'LP-004': ['BN-UNIT-LENGTH-CM-DM-M', 'BN-UNIT-AREA-VOLUME-DIMENSION'],
  'LP-005': ['BN-RATIO-PART-WHOLE-REFERENCE', 'BN-SCALE-DOUBLE-CONVERSION'],
  'LP-006': ['BN-CIRCLE-CIRCUMFERENCE-AREA-MIX', 'BN-CYLINDER-VOLUME-FORMULA-MIX'],
  'LP-007': ['BN-META-INVERSE-CHECK-MISSING'],
  'LP-008': ['BN-META-ESTIMATION-MISSING'],
  'LP-009': ['BN-META-INVERSE-CHECK-MISSING'],
  'LP-010': ['BN-META-INVERSE-CHECK-MISSING']
}

const MATCH_RULES = [
  { id: 'BN-INT-MUL-PARTIAL-OMIT', weight: 14, patterns: [/部分积|多位数乘法|漏加|204|306|408|乘法拆分/] },
  { id: 'BN-INT-DIV-DIVISOR-SIMPLIFY', weight: 14, patterns: [/长除法|试商|8008|两位除数|除数\s*26|÷\s*26/] },
  { id: 'BN-DEC-PLACE-VALUE-WEAK', weight: 12, patterns: [/小数位值|数量级|2\.186|26\.86|十分位|百分位|千分位/] },
  { id: 'BN-DEC-MUL-POINT-COUNT', weight: 15, patterns: [/小数乘法|小数点|8\.5\s*[×x*]\s*3\.16|积的小数位|小数位数/] },
  { id: 'BN-DEC-MUL-POINT-ESTIMATE', weight: 10, patterns: [/估算|大概范围|答案合理|数量级检查|明显不合理/] },
  { id: 'BN-FRACTION-ADD-DENOM-MISMATCH', weight: 14, patterns: [/异分母|通分|公分母|分数加减|1\/4\s*\+\s*1\/8|分母直接相加/] },
  { id: 'BN-FRACTION-MUL-SIMPLIFY-DIRECTION', weight: 13, patterns: [/分数乘法|约分|交叉约分|4\/9|1\/15|结果约大/] },
  { id: 'BN-FRACTION-DIV-RECIPROCAL-MISSING', weight: 16, patterns: [/除以分数|乘倒数|倒数|6\s*÷\s*7\/8|÷\s*\d+\/\d+|乘\s*\d+\/\d+\s*回验/] },
  { id: 'BN-FRACTION-DIV-CONCEPT-JUMPS', weight: 10, patterns: [/包含几个|数轴|除以小于\s*1|结果会变大|只会套公式/] },
  { id: 'BN-FRACTION-DECIMAL-MIXED-LOAD', weight: 12, patterns: [/分数小数混合|互化|1\/3|0\.2|0\.15|无限小数|统一形式/] },
  { id: 'BN-PERCENT-BASE-WHOLE-MISSING', weight: 14, patterns: [/单位\s*1|百分数|百分比|谁是\s*100%|基准量|原价/] },
  { id: 'BN-PERCENT-DISCOUNT-DIRECTION', weight: 13, patterns: [/折扣|优惠|现价|原价|增长|减少|涨价|降价|0\.95|1\.05/] },
  { id: 'BN-PIECEWISE-TAX-BRACKET', weight: 14, patterns: [/税率|分段|纳税|各档|超出部分/] },
  { id: 'BN-RATIO-MEANING-ORDER', weight: 12, patterns: [/前项|后项|比的顺序|对象顺序/] },
  { id: 'BN-RATIO-PART-WHOLE-REFERENCE', weight: 12, patterns: [/部分[:：]部分|部分[:：]整体|整体参照|按比例分配/] },
  { id: 'BN-RATIO-CROSS-MULTIPLY-DIRECTION', weight: 13, patterns: [/交叉相乘|比例方程|内项|外项/] },
  { id: 'BN-RATIO-PROPORTION-EXHAUSTIVE', weight: 12, patterns: [/组成比例|能否成比例|穷尽|排列/] },
  { id: 'BN-SCALE-DOUBLE-CONVERSION', weight: 14, patterns: [/比例尺|图上距离|实际距离|距离中转/] },
  { id: 'BN-UNIT-LENGTH-CM-DM-M', weight: 13, patterns: [/厘米|分米|米|cm|dm|m|长度单位|单位不一致/] },
  { id: 'BN-UNIT-AREA-VOLUME-DIMENSION', weight: 13, patterns: [/面积单位|体积单位|平方|立方|量纲/] },
  { id: 'BN-CIRCLE-AREA-EXTRA-R', weight: 14, patterns: [/圆面积|πr|半径.*半径|多乘.*半径/] },
  { id: 'BN-CIRCLE-CIRCUMFERENCE-AREA-MIX', weight: 13, patterns: [/圆周长|周长.*面积|面积.*周长|2πr|πr²/] },
  { id: 'BN-CYLINDER-VOLUME-FORMULA-MIX', weight: 14, patterns: [/圆柱|体积|底面积.*高|圆面积公式边界/] },
  { id: 'BN-SOLID-SURFACE-EXPOSED-FACES-OMIT', weight: 13, patterns: [/表面积|暴露面|立体|正方体|长方体|枚举面/] },
  { id: 'BN-UNIFORM-CHANGE-INTERVAL-DIFF', weight: 13, patterns: [/匀速|相邻时刻|水位|每分钟|间隔差值/] },
  { id: 'BN-META-ESTIMATION-MISSING', weight: 9, patterns: [/估算|数量级|合理性|先估|检查答案/] },
  { id: 'BN-META-INVERSE-CHECK-MISSING', weight: 9, patterns: [/验算|回代|逆运算|乘回去|除回去|检查错误/] }
]

function unique(values = []) {
  const seen = new Set()
  const result = []
  for (const value of values) {
    if (!value || seen.has(value)) continue
    seen.add(value)
    result.push(value)
  }
  return result
}

function textOf(value) {
  if (!value) return ''
  if (typeof value === 'string') return value
  if (Array.isArray(value)) return value.map(textOf).join(' ')
  if (typeof value === 'object') return Object.values(value).map(textOf).join(' ')
  return String(value)
}

function legacyCodesFor(code = '') {
  if (!code) return []
  // 支持多码格式（如 "LP-AXIS / LP-LANG"），split 后逐个处理
  const codes = String(code).split('/').map(item => item.trim()).filter(Boolean)
  const result = []
  for (const single of codes) {
    if (LEGACY_CODE_ALIASES[single]) {
      result.push(...LEGACY_CODE_ALIASES[single])
    } else if (/^LP-[A-Z]+$/.test(single)) {
      result.push(single)
    }
  }
  return unique(result)
}

function existingCandidateIds(bottleneck = {}) {
  return unique((bottleneck.candidateBottlenecks || []).map(item => (
    typeof item === 'string' ? item : item && (item.bottleneckId || item.id)
  )))
}

function buildEvidenceText(report = {}, bottleneck = {}) {
  const lpCode = bottleneck.lpCode || ''
  const relatedErrors = (report.errorDetails || []).filter(item => !lpCode || item.lpCode === lpCode)
  const source = [
    bottleneck.lpCode,
    bottleneck.lpName,
    bottleneck.summary,
    bottleneck.rootCause,
    bottleneck.suggestion,
    bottleneck.nextActionText,
    bottleneck.nodeIds,
    bottleneck.candidateBottlenecks,
    relatedErrors.length > 0 ? relatedErrors : report.errorDetails,
    report.summary,
    report.comparisonSummary,
    (report.imageFiles || []).map(file => file.ocrSummary)
  ]
  return textOf(source).replace(/\s+/g, ' ')
}

function scoreByRules(candidateId, evidenceText) {
  return MATCH_RULES
    .filter(rule => rule.id === candidateId)
    .reduce((score, rule) => {
      const matched = rule.patterns.some(pattern => pattern.test(evidenceText))
      return matched ? score + rule.weight : score
    }, 0)
}

function scoreCandidate(candidate, bottleneck, evidenceText) {
  let score = 0
  const existingIds = existingCandidateIds(bottleneck)
  if (existingIds.includes(candidate.bottleneckId)) score += 100

  const legacyCodes = legacyCodesFor(bottleneck.lpCode)
  if (legacyCodes.includes(candidate.legacyLpCode)) score += 4
  if ((bottleneck.nodeIds || []).includes(candidate.nodeId)) score += 10

  score += scoreByRules(candidate.bottleneckId, evidenceText)

  for (const pattern of candidate.symptomPatterns || []) {
    if (pattern && evidenceText.includes(pattern)) score += 5
  }
  for (const evidence of candidate.sourceEvidence || []) {
    if (evidence && evidenceText.includes(evidence)) score += 6
  }

  return score
}

function fallbackCandidateIdsFor(bottleneck = {}) {
  return FALLBACK_CANDIDATES[bottleneck.lpCode] || []
}

function evidenceStrengthFor(score, fallback = false) {
  if (score >= 16) return 'high'
  if (score >= 9) return 'medium'
  return fallback ? 'low' : 'medium'
}

function resourceRoleOf(resource = {}) {
  if (qualityAnchorPlatforms.has(resource.platform)) return '高质量锚点'
  if (domesticSupplementPlatforms.has(resource.platform)) return '国内补充'
  return '参考资源'
}

function sortResources(a, b) {
  const levelDiff = (LEVEL_RANK[a.recommendationLevel] ?? 9) - (LEVEL_RANK[b.recommendationLevel] ?? 9)
  if (levelDiff !== 0) return levelDiff

  const anchorDiff = Number(qualityAnchorPlatforms.has(b.platform)) - Number(qualityAnchorPlatforms.has(a.platform))
  if (anchorDiff !== 0) return anchorDiff

  const domesticDiff = Number(domesticSupplementPlatforms.has(b.platform)) - Number(domesticSupplementPlatforms.has(a.platform))
  if (domesticDiff !== 0) return domesticDiff

  return String(a.resourceId || '').localeCompare(String(b.resourceId || ''))
}

function resourcesFor({ nodeIds = [], bottleneckIds = [], explicitResourceIds = [] } = {}) {
  const explicit = unique(explicitResourceIds)
    .map(id => resourcesById.get(id))
    .filter(Boolean)
  const explicitIds = new Set(explicit.map(item => item.resourceId))
  const nodeIdSet = new Set(nodeIds)
  const bottleneckIdSet = new Set(bottleneckIds)
  const inferred = (resourceSeed.resources || []).filter(resource => {
    if (explicitIds.has(resource.resourceId)) return false
    if (nodeIdSet.size > 0 && !nodeIdSet.has(resource.nodeId)) return false
    if (bottleneckIdSet.size === 0) return true
    return (resource.bottleneckIds || []).some(id => bottleneckIdSet.has(id))
  })

  return unique([...explicit, ...inferred].map(resource => resource.resourceId))
    .map(id => resourcesById.get(id))
    .filter(Boolean)
    .sort(sortResources)
    .slice(0, MAX_RECOMMENDED_RESOURCES)
}

function candidatePayload(candidate, evidenceStrength, resourceIds) {
  const normalized = normalizeFineBottleneck(candidate)
  // categoryPath 不再透传 seed 里的旧值（旧值与新 categoryTitle/familyTitle 系统性冲突）。
  // 改为用新层级字段动态拼装，保证分组渲染时标签一致。
  const dynamicPath = [
    normalized.categoryTitle,
    normalized.familyTitle,
    normalized.title
  ].filter(Boolean)
  return {
    bottleneckId: normalized.bottleneckId,
    title: normalized.title,
    nodeId: normalized.nodeId,
    categoryId: normalized.categoryId,
    categoryTitle: normalized.categoryTitle,
    familyId: normalized.familyId,
    familyTitle: normalized.familyTitle,
    categoryPath: dynamicPath,
    evidenceStrength,
    microValidationRequired: true,
    suggestedMicroValidation: (normalized.microValidationRules || []).slice(0, 3),
    recommendedResourceIds: resourceIds
  }
}

function nextActionTextFor({ nodeIds, evidenceStrength, resources }) {
  const firstNode = nodesById.get(nodeIds[0])
  const title = firstNode ? firstNode.title : '对应知识点'
  const hasAnchor = resources.some(resource => qualityAnchorPlatforms.has(resource.platform))
  const hasDomestic = resources.some(resource => domesticSupplementPlatforms.has(resource.platform))
  if (evidenceStrength === 'low') {
    return `先用微验证确认「${title}」的具体卡点；若命中，再用推荐资源重学。`
  }
  if (hasAnchor && hasDomestic) {
    return `先看高质量锚点校准「${title}」，再用国内资源复述并做变式练习。`
  }
  if (resources.length > 0) {
    return `先用推荐资源重学「${title}」，再做微验证和变式练习。`
  }
  return `先做微验证确认「${title}」，再补充资源。`
}

function enrichBottleneck(report, bottleneck) {
  if (!bottleneck || typeof bottleneck !== 'object') return bottleneck

  const evidenceText = buildEvidenceText(report, bottleneck)
  const scored = (bottleneckSeed.bottlenecks || [])
    .map(candidate => ({
      candidate,
      score: scoreCandidate(candidate, bottleneck, evidenceText),
      fallback: false
    }))
    .filter(item => item.score >= 8)

  if (scored.length === 0) {
    for (const id of fallbackCandidateIdsFor(bottleneck)) {
      const candidate = bottlenecksById.get(id)
      if (candidate) scored.push({ candidate, score: 4, fallback: true })
    }
  }

  const selected = scored
    .sort((a, b) => b.score - a.score || String(a.candidate.bottleneckId).localeCompare(String(b.candidate.bottleneckId)))
    .slice(0, MAX_CANDIDATE_BOTTLENECKS)

  if (selected.length === 0) return { ...bottleneck }

  const candidateIds = selected.map(item => item.candidate.bottleneckId)
  const nodeIds = unique([
    ...(bottleneck.nodeIds || []),
    ...selected.map(item => item.candidate.nodeId)
  ])
  const explicitResourceIds = unique([
    ...(bottleneck.recommendedResourceIds || []),
    ...((bottleneck.resourcePlan || []).map(item => item && (item.resourceId || item.id)))
  ])
  const resources = resourcesFor({ nodeIds, bottleneckIds: candidateIds, explicitResourceIds })
  const resourceIds = resources.map(resource => resource.resourceId)
  const evidenceStrength = selected.some(item => evidenceStrengthFor(item.score, item.fallback) === 'high')
    ? 'high'
    : selected.some(item => evidenceStrengthFor(item.score, item.fallback) === 'medium')
      ? 'medium'
      : 'low'

  return {
    ...bottleneck,
    nodeIds,
    candidateBottlenecks: selected.map(item => candidatePayload(
      item.candidate,
      evidenceStrengthFor(item.score, item.fallback),
      resourcesFor({
        nodeIds: [item.candidate.nodeId],
        bottleneckIds: [item.candidate.bottleneckId],
        explicitResourceIds
      }).map(resource => resource.resourceId)
    )),
    evidenceStrength: bottleneck.evidenceStrength || evidenceStrength,
    nextActionType: bottleneck.nextActionType || (resources.length > 0 ? 'resourceReview' : 'microValidation'),
    nextActionText: bottleneck.nextActionText || nextActionTextFor({ nodeIds, evidenceStrength, resources }),
    recommendedResourceIds: resourceIds,
    resourcePlan: resources.map(resource => ({
      resourceId: resource.resourceId,
      platform: resource.platform,
      title: resource.title,
      url: resource.url,
      recommendationLevel: resource.recommendationLevel,
      role: resourceRoleOf(resource),
      summary: resource.summary || ''
    }))
  }
}

function hasLearningMapFields(bottleneck = {}) {
  return Boolean(
    (bottleneck.nodeIds || []).length
    || (bottleneck.candidateBottlenecks || []).length
    || (bottleneck.recommendedResourceIds || []).length
  )
}

function enrichMathReport(report = {}, options = {}) {
  if (report.subject && report.subject !== 'math') {
    return { report: { ...report }, changed: false, enrichedCount: 0 }
  }

  // 幂等短路：如果报告已经用当前 BACKFILL_VERSION enrich 过，直接返回不重算。
  // 防止 backfill 脚本重跑时 recommendedResourceIds 越滚越多（见 enrichBottleneck L270/L297）。
  // 如需强制重新 enrich，传入 options.force = true。
  if (!options.force && report.learningMapBackfill && report.learningMapBackfill.version === BACKFILL_VERSION) {
    const enrichedCount = (report.bottlenecks || []).filter(hasLearningMapFields).length
    return { report: { ...report }, changed: false, enrichedCount }
  }

  const before = JSON.stringify(report.bottlenecks || [])
  const bottlenecks = (report.bottlenecks || []).map(item => enrichBottleneck(report, item))
  const enrichedCount = bottlenecks.filter(hasLearningMapFields).length
  const changed = before !== JSON.stringify(bottlenecks)
  const now = options.now || new Date()

  return {
    report: {
      ...report,
      bottlenecks,
      learningMapBackfill: {
        version: BACKFILL_VERSION,
        strategy: 'heuristic-from-existing-report-evidence',
        enrichedCount,
        updatedAt: now
      }
    },
    changed,
    enrichedCount
  }
}

module.exports = {
  BACKFILL_VERSION,
  enrichBottleneck,
  enrichMathReport,
  resourcesFor,
  resourceRoleOf
}

const knowledgeSeed = require('../data/math/knowledge-nodes.seed')
const bottleneckSeed = require('../data/math/bottleneck-taxonomy-v2.seed')
const resourceSeed = require('../data/math/learning-resources.seed')

const LEVEL_RANK = { A: 0, B: 1, C: 2, D: 3 }
const MAX_RESOURCES_PER_ITEM = 4

const nodesById = new Map((knowledgeSeed.nodes || []).map(node => [node.nodeId, node]))
const bottlenecksById = new Map((bottleneckSeed.bottlenecks || []).map(item => [item.bottleneckId, item]))
const resourcesById = new Map((resourceSeed.resources || []).map(resource => [resource.resourceId, resource]))
const qualityAnchorPlatforms = new Set(resourceSeed.selectionPolicy?.conceptAnchorPlatforms || resourceSeed.selectionPolicy?.qualityAnchorPlatforms || [])
const domesticSupplementPlatforms = new Set(resourceSeed.selectionPolicy?.jumpablePlatforms || resourceSeed.selectionPolicy?.domesticSupplementPlatforms || [])

const NODE_TITLE_OVERRIDES = {
  'MATH-NUM-DEC-DIV-POINT': '小数除法中的小数点移动',
  'MATH-NUM-DEC-DIV-QUOTIENT': '小数除法试商与补零',
  'MATH-NUM-FRACTION-ADD-SUB': '分数加减法',
  'MATH-NUM-FRACTION-ADD-UNLIKE': '异分母分数加减法',
  'MATH-NUM-FRACTION-ADD-SUB-COMMON': '异分母分数加减通分',
  'MATH-NUM-FRACTION-ADD-COMMON': '异分母分数加法通分',
  'MATH-NUM-FRACTION-SUB-COMMON': '异分母分数减法通分',
  'MATH-NUM-FRACTION-ADD-COMMON-DENOMINATOR': '异分母分数通分',
  'MATH-MEAS-LENGTH-CONVERT': '长度单位换算',
  'MATH-MEAS-AREA-UNIT-CONVERT': '面积单位换算',
  'MATH-MEAS-AREA-CONVERT': '面积单位换算',
  'MATH-MEAS-AREA-CONVERSION': '面积单位换算',
  'MATH-MEAS-UNIT-CONVERT': '单位换算',
  'MATH-UNIT-AREA-HA-M2': '公顷与平方米换算',
  'MATH-UNIT-AREA-CONVERT': '面积单位换算'
}

const NODE_TOKEN_TEXT = {
  INT: '整数',
  DEC: '小数',
  FRACTION: '分数',
  PERCENT: '百分数',
  RATIO: '比',
  MUL: '乘法',
  DIV: '除法',
  ADD: '加法',
  SUB: '减法',
  MIXED: '混合运算',
  PLACE: '数位',
  VALUE: '位值',
  POINT: '小数点',
  QUOTIENT: '商',
  RECIPROCAL: '倒数',
  UNLIKE: '异分母',
  COMMON: '通分',
  DENOM: '分母',
  DENOMINATOR: '分母',
  SIMPLIFY: '约分',
  CONVERT: '换算',
  CONVERSION: '换算',
  UNIT: '单位',
  LENGTH: '长度',
  AREA: '面积',
  VOLUME: '体积',
  HA: '公顷',
  M2: '平方米',
  CIRCLE: '圆',
  CYLINDER: '圆柱',
  SURFACE: '表面积',
  RECT: '长方形',
  RECTANGLE: '长方形',
  FORMULA: '公式',
  MODEL: '建模',
  ESTIMATION: '估算',
  CHECK: '检查',
  WORD: '应用题',
  PROBLEM: '问题'
}

const RESOURCE_TITLE_OVERRIDES = {
  'RES-KHAN-DEC-MUL-001': '小数乘法示例：怎样确定积的小数点',
  'RES-BILI-FRACTION-COMMON-001': '异分母分数加减通分讲法搜索',
  'RES-KHAN-FRACTION-ADD-001': '分数加减法：通分与练习路径',
  'RES-KHAN-FRACTION-DIV-001': '分数除法概念：为什么要乘倒数',
  'RES-KHAN-PERCENT-001': '百分数基础单元',
  'RES-KHAN-PERCENT-DISCOUNT-001': '百分数应用题：税费与折扣',
  'RES-XHS-PERCENT-DISCOUNT-001': '百分数折扣与单位 1 图文搜索',
  'RES-BILI-RATIO-PARTWHOLE-001': '比和比例中“部分与整体”讲法搜索',
  'RES-XHS-RATIO-PARTWHOLE-001': '比和比例线段图笔记搜索',
  'RES-BILI-UNIT-CONVERT-001': '小学单位换算：厘米、分米、米资源搜索',
  'RES-XHS-UNIT-CONVERT-001': '小学单位换算图文笔记搜索',
  'RES-BILI-CIRCLE-AREA-001': '圆面积与圆周长区分讲法搜索',
  'RES-XHS-CIRCLE-AREA-001': '圆面积公式图文讲法搜索',
  'RES-KHAN-CYLINDER-001': '圆柱体积与表面积',
  'RES-BILI-SOLID-SURFACE-001': '立体图形挖空后的表面积讲法搜索',
  'RES-XHS-SOLID-SURFACE-001': '立体表面积增减面图文搜索',
  'RES-BILI-UNIFORM-CHANGE-001': '匀速变化应用题讲法搜索',
  'RES-XHS-UNIFORM-CHANGE-001': '匀速变化应用题图文搜索',
  'RES-BILI-ESTIMATION-001': '小学数学估算与验算讲法搜索',
  'RES-XHS-ESTIMATION-001': '小学数学验算习惯图文搜索'
}

const RESOURCE_TYPE_META = {
  video: { label: '视频', actionText: '复制视频链接' },
  animation: { label: '动图/动画', actionText: '复制资源链接' },
  article: { label: '图文', actionText: '复制图文链接' },
  course_unit: { label: '课程单元', actionText: '复制课程链接' },
  searchEntry: { label: '搜索入口', actionText: '复制搜索链接' },
  search_query: { label: '搜索入口', actionText: '复制搜索链接' }
}

function unique(values = []) {
  const result = []
  const seen = new Set()
  for (const value of values) {
    if (!value || seen.has(value)) continue
    seen.add(value)
    result.push(value)
  }
  return result
}

function normalizeBottleneckId(value) {
  if (!value) return ''
  if (typeof value === 'string') return value
  return value.bottleneckId || value.id || ''
}

function normalizeResourceId(value) {
  if (!value) return ''
  if (typeof value === 'string') return value
  return value.resourceId || value.id || ''
}

function nodeTitleOf(nodeId) {
  const node = nodesById.get(nodeId)
  if (node) return node.title
  if (NODE_TITLE_OVERRIDES[nodeId]) return NODE_TITLE_OVERRIDES[nodeId]
  return readableNodeIdOf(nodeId)
}

function readableNodeIdOf(nodeId = '') {
  const tokens = String(nodeId || '')
    .split('-')
    .filter(token => token && !['MATH', 'NUM', 'MOD', 'MEAS', 'MEASURE', 'GEO', 'STAT', 'META'].includes(token))
  const parts = unique(tokens.map(token => NODE_TOKEN_TEXT[token]).filter(Boolean))
  if (parts.length === 0) return '待归档知识点'
  return parts.join('')
}

function bottleneckTitleOf(bottleneckId, fallback = '') {
  const bottleneck = bottlenecksById.get(bottleneckId)
  return bottleneck ? bottleneck.title : (fallback || '待确认细卡点')
}

function resourceRoleOf(resource = {}) {
  if (qualityAnchorPlatforms.has(resource.platform)) return '高质量锚点'
  if (domesticSupplementPlatforms.has(resource.platform)) return '国内补充'
  return '参考资源'
}

function resourceTitleOf(resource = {}) {
  return resource.titleZh
    || resource.chineseTitle
    || RESOURCE_TITLE_OVERRIDES[resource.resourceId]
    || resource.title
    || '未命名资源'
}

function resourceTypeMetaOf(type = '') {
  return RESOURCE_TYPE_META[type] || { label: '资源', actionText: '复制链接' }
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

  const explicitIds = new Set(explicit.map(resource => resource.resourceId))
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
    .slice(0, MAX_RESOURCES_PER_ITEM)
    .map(resource => {
      const typeMeta = resourceTypeMetaOf(resource.type)
      return {
        resourceId: resource.resourceId,
        title: resource.title,
        displayTitle: resourceTitleOf(resource),
        platform: resource.platform,
        type: resource.type || '',
        typeLabel: typeMeta.label,
        actionText: typeMeta.actionText,
        recommendationLevel: resource.recommendationLevel,
        role: resourceRoleOf(resource),
        url: resource.url,
        hasUrl: Boolean(resource.url),
        summary: resource.summary || '',
        usageText: resource.type === 'search_query' || resource.type === 'searchEntry'
          ? '这是家长筛选入口，不建议直接给孩子刷结果。'
          : '点击复制链接，由家长打开指定内容给孩子看。',
        isQualityAnchor: qualityAnchorPlatforms.has(resource.platform),
        isDomesticSupplement: domesticSupplementPlatforms.has(resource.platform)
      }
    })
}

function resourceSummaryOf(resources = []) {
  const anchor = resources.find(resource => resource.isQualityAnchor)
  const domestic = resources.find(resource => resource.isDomesticSupplement)
  const parts = [
    anchor ? `高质量锚点：${anchor.platform}` : '',
    domestic ? `国内补充：${domestic.platform}` : ''
  ].filter(Boolean)
  return parts.length > 0 ? parts.join('；') : ''
}

function buildLearningMapItem(item = {}) {
  const nodeIds = unique(item.nodeIds || [])
  const candidateBottleneckIds = unique((item.candidateBottlenecks || []).map(normalizeBottleneckId))
  const explicitResourceIds = unique([
    ...(item.recommendedResourceIds || []),
    ...((item.resourcePlan || []).map(normalizeResourceId))
  ])

  if (nodeIds.length === 0 && candidateBottleneckIds.length === 0 && explicitResourceIds.length === 0) {
    return null
  }

  const bottleneckTitles = candidateBottleneckIds.map(id => {
    const candidate = (item.candidateBottlenecks || []).find(value => normalizeBottleneckId(value) === id)
    return bottleneckTitleOf(id, candidate && candidate.title)
  })
  const nodeTitles = unique(nodeIds.map(nodeTitleOf).filter(Boolean))
  const primaryNodeText = nodeTitles.length > 3
    ? `${nodeTitles.slice(0, 3).join('、')}等 ${nodeTitles.length} 个相关知识点`
    : nodeTitles.join('、')
  const resources = resourcesFor({ nodeIds, bottleneckIds: candidateBottleneckIds, explicitResourceIds })
  const nextActionText = item.nextActionText
    || item.nextAction
    || (resources.length > 0 ? '先用资源重学，再做微验证。' : '先做微验证确认卡点。')

  return {
    lpCode: item.lpCode || '',
    nodeIds,
    nodeTitles,
    nodeText: primaryNodeText || '相关数学知识点',
    nodeDetailText: nodeTitles.length > 1 ? `相关知识点：${nodeTitles.join('、')}` : '',
    bottleneckIds: candidateBottleneckIds,
    bottleneckTitles,
    bottleneckText: bottleneckTitles.join('、'),
    evidenceStrength: item.evidenceStrength || '',
    nextActionType: item.nextActionType || (resources.length > 0 ? 'resourceReview' : 'microValidation'),
    nextActionText,
    resources,
    hasResources: resources.length > 0,
    resourceSummary: resourceSummaryOf(resources)
  }
}

function buildLearningMapReportItems(bottlenecks = []) {
  return (bottlenecks || [])
    .map(buildLearningMapItem)
    .filter(Boolean)
}

module.exports = {
  buildLearningMapItem,
  buildLearningMapReportItems,
  nodeTitleOf,
  bottleneckTitleOf,
  resourcesFor,
  resourceRoleOf
}

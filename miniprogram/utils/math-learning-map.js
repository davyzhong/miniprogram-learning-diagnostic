const knowledgeSeed = require('../../data/math/knowledge-nodes.seed.json')
const bottleneckSeed = require('../../data/math/bottleneck-taxonomy-v2.seed.json')
const resourceSeed = require('../../data/math/learning-resources.seed.json')

const LEVEL_RANK = { A: 0, B: 1, C: 2, D: 3 }
const MAX_RESOURCES_PER_ITEM = 4

const nodesById = new Map((knowledgeSeed.nodes || []).map(node => [node.nodeId, node]))
const bottlenecksById = new Map((bottleneckSeed.bottlenecks || []).map(item => [item.bottleneckId, item]))
const resourcesById = new Map((resourceSeed.resources || []).map(resource => [resource.resourceId, resource]))
const qualityAnchorPlatforms = new Set(resourceSeed.selectionPolicy?.qualityAnchorPlatforms || [])
const domesticSupplementPlatforms = new Set(resourceSeed.selectionPolicy?.domesticSupplementPlatforms || [])

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
  return node ? node.title : nodeId
}

function bottleneckTitleOf(bottleneckId, fallback = '') {
  const bottleneck = bottlenecksById.get(bottleneckId)
  return bottleneck ? bottleneck.title : (fallback || bottleneckId)
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
    .map(resource => ({
      resourceId: resource.resourceId,
      title: resource.title,
      platform: resource.platform,
      recommendationLevel: resource.recommendationLevel,
      role: resourceRoleOf(resource),
      url: resource.url,
      summary: resource.summary || '',
      isQualityAnchor: qualityAnchorPlatforms.has(resource.platform),
      isDomesticSupplement: domesticSupplementPlatforms.has(resource.platform)
    }))
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
  const resources = resourcesFor({ nodeIds, bottleneckIds: candidateBottleneckIds, explicitResourceIds })
  const nextActionText = item.nextActionText
    || item.nextAction
    || (resources.length > 0 ? '先用资源重学，再做微验证。' : '先做微验证确认卡点。')

  return {
    lpCode: item.lpCode || '',
    nodeIds,
    nodeTitles: nodeIds.map(nodeTitleOf),
    nodeText: nodeIds.map(nodeTitleOf).join('、'),
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

const { getBottleneckMeta } = require('./bottleneck-taxonomy')
const { formatBottleneckDisplayName } = require('./bottleneck-name')
const { nodeTitleOf, bottleneckTitleOf } = require('./math-learning-map')
const { normalizeFineBottleneck } = require('./math-bottleneck-hierarchy')
const resourceSeed = require('../data/math/learning-resources.seed')

const INTERNAL_ID_PATTERNS = [
  /^(?:BN|LP|ERR|NODE|RES|CHI)-[A-Z0-9_-]+$/i,
  /^MATH-[A-Z0-9_-]+$/i,
  /^(?:PAGE|TASK-PAGE|VER-PAGE)-[A-Z0-9_-]+$/i,
  /^cloud:\/\//i
]
const HUMAN_PAPER_CODE_PATTERN = /^(?:MATH|CHI)-\d{8}-\d+$/i

const OPAQUE_ID_PATTERNS = [
  /^[a-f0-9]{24}$/i,
  /^[a-f0-9]{8}-[a-f0-9]{4}-[1-5][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/i,
  /^(?=[A-Za-z0-9_-]{20,}$)(?=.*[A-Za-z])(?=.*\d)[A-Za-z0-9_-]+$/
]

const INTERNAL_TOKEN_SOURCE = '(?:(?:TASK-PAGE|VER-PAGE|PAGE|BN|LP|ERR|NODE|RES)-[A-Z0-9_-]+|(?:MATH|CHI)-(?!\\d{8}-\\d+(?![A-Z0-9_-]))[A-Z0-9_-]+|cloud:\\/\\/[^\\s，。；！？、]+)'
const INTERNAL_RUN_PATTERN = new RegExp(`${INTERNAL_TOKEN_SOURCE}(?:[\\s、,，]+${INTERNAL_TOKEN_SOURCE})*`, 'gi')
const resourcesById = new Map((resourceSeed.resources || []).map(resource => [resource.resourceId, resource]))

function isInternalIdentifier(value = '', options = {}) {
  const text = String(value || '').trim()
  if (!text) return false
  if (HUMAN_PAPER_CODE_PATTERN.test(text)) return false
  if (INTERNAL_ID_PATTERNS.some(pattern => pattern.test(text))) return true

  const explicitId = options.treatAsId === true || options.explicitId === true || options.idContext === true
  return explicitId && OPAQUE_ID_PATTERNS.some(pattern => pattern.test(text))
}

function resourceNameOf(resourceId) {
  const resource = resourcesById.get(resourceId)
  if (!resource) return ''
  return resource.titleZh || resource.chineseTitle || resource.title || ''
}

function resolveKnownIdentifier(identifier, options = {}) {
  const text = String(identifier || '').trim()
  if (!text) return ''

  if (typeof options.resolveIdentifier === 'function') {
    const resolved = String(options.resolveIdentifier(text) || '').trim()
    if (resolved && !isInternalIdentifier(resolved, { treatAsId: true })) return resolved
  }

  if (/^LP-/i.test(text)) {
    const meta = getBottleneckMeta(text)
    return meta ? formatBottleneckDisplayName(meta) : ''
  }

  if (/^BN-/i.test(text)) {
    const title = bottleneckTitleOf(text)
    if (title && title !== text) return title
    const normalized = normalizeFineBottleneck({ bottleneckId: text })
    return normalized.displayTitle !== '待确认细卡点' ? normalized.displayTitle : ''
  }

  if (/^MATH-/i.test(text)) {
    const title = nodeTitleOf(text)
    return title && title !== text && title !== '待归档知识点' ? title : ''
  }

  if (/^RES-/i.test(text)) return resourceNameOf(text)
  return ''
}

function readableNameOf(value, options = {}) {
  if (!value) return ''

  if (typeof value === 'string' || typeof value === 'number') {
    const text = String(value).trim()
    if (!text) return ''
    if (!isInternalIdentifier(text, options)) return text
    return resolveKnownIdentifier(text, options)
  }

  const readableCandidates = [
    value.displayName,
    value.displayTitle,
    value.title,
    value.targetText,
    value.lpName,
    value.name,
    value.label
  ]
  for (const candidate of readableCandidates) {
    const text = String(candidate || '').trim()
    if (text && !isInternalIdentifier(text, { treatAsId: true })) return text
  }

  const identifierCandidates = [
    value.lpCode,
    value.bottleneckId,
    value.nodeId,
    value.resourceId,
    value.targetId,
    value.code,
    value.id,
    value._id,
    value.fileID
  ]
  for (const identifier of identifierCandidates) {
    const resolved = resolveKnownIdentifier(identifier, options)
    if (resolved) return resolved
  }
  return ''
}

function positiveCount(value) {
  const count = Number(value)
  return Number.isFinite(count) && count > 0 ? Math.floor(count) : 0
}

function unique(values = []) {
  return [...new Set(values.filter(Boolean))]
}

function semanticCountText(count, noun) {
  return count > 0 ? `${count} 个${noun}` : `相关${noun}`
}

function sanitizeUserText(value, options = {}) {
  const text = String(value || '')
  if (!text) return ''
  const noun = String(options.noun || '学习卡点').trim() || '学习卡点'

  return text
    .replace(INTERNAL_RUN_PATTERN, run => {
      const identifiers = run.match(new RegExp(INTERNAL_TOKEN_SOURCE, 'gi')) || []
      const resolvedNames = identifiers.map(identifier => resolveKnownIdentifier(identifier, options))
      const names = unique(resolvedNames)
      if (resolvedNames.every(Boolean)) return names.join('、')

      const count = positiveCount(options.count) || unique(identifiers).length
      if (names.length > 0) return `${names.slice(0, 3).join('、')}等 ${count} 个${noun}`
      return semanticCountText(count, noun)
    })
    .replace(/\s+([，。；！？、])/g, '$1')
    .replace(/[、，,]+\s*(?=[。；！？])/g, '')
}

function targetKey(target) {
  if (target === null || target === undefined) return ''
  if (typeof target !== 'object') return String(target).trim()
  return String(
    target.lpCode || target.bottleneckId || target.nodeId || target.resourceId || target.targetId
    || target.id || target._id || readableNameOf(target) || ''
  ).trim()
}

function compactReadableTargets(targets = [], options = {}) {
  const values = Array.isArray(targets) ? targets : [targets]
  const names = unique(values.map(target => readableNameOf(target, options)))
  const inferredCount = unique(values.map(targetKey)).length
  const totalCount = Math.max(positiveCount(options.totalCount), inferredCount, names.length)
  const noun = String(options.noun || '学习卡点').trim() || '学习卡点'
  const visibleNames = names.slice(0, 3)

  if (visibleNames.length === 0) {
    return totalCount > 0
      ? semanticCountText(totalCount, noun)
      : (options.fallback || `相关${noun}`)
  }

  if (totalCount > visibleNames.length || names.length > visibleNames.length) {
    return `${visibleNames.join('、')}等 ${totalCount} 个${noun}`
  }
  return visibleNames.join('、')
}

module.exports = {
  isInternalIdentifier,
  readableNameOf,
  sanitizeUserText,
  compactReadableTargets,
  resolveKnownIdentifier
}

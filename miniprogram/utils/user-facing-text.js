const { getBottleneckMeta } = require('./bottleneck-taxonomy')
const { formatBottleneckDisplayName } = require('./bottleneck-name')
const { nodeTitleOf, bottleneckTitleOf } = require('./math-learning-map')
const { normalizeFineBottleneck } = require('./math-bottleneck-hierarchy')
const resourceSeed = require('../data/math/learning-resources.seed')

const INTERNAL_ID_PATTERNS = [
  /^(?:BN|LP|ERR|NODE|RES|CHI)-[A-Z0-9_-]+$/i,
  /^MATH-[A-Z0-9_-]+$/i,
  /^(?:PAGE|TASK|VER)-[A-Z0-9_-]+$/i,
  /^(?:cloud|wxfile|file):\/\//i
]
const HUMAN_PAPER_CODE_SOURCE = '(?:(?:MATH|CHI)-\\d{8}-\\d+|MATH-\\d{2,3})'
const HUMAN_PAPER_CODE_PATTERN = new RegExp(`^${HUMAN_PAPER_CODE_SOURCE}$`, 'i')

const OPAQUE_ID_PATTERNS = [
  /^[a-f0-9]{24}$/i,
  /^[a-f0-9]{8}-[a-f0-9]{4}-[1-5][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/i,
  /^(?:file|resource)[_-][A-Za-z0-9_-]+$/i,
  /^(?=[A-Za-z0-9_-]{20,}$)(?=.*[A-Za-z])(?=.*\d)[A-Za-z0-9_-]+$/
]

const INTERNAL_TOKEN_SOURCE = '(?:(?:TASK|VER|PAGE|BN|LP|ERR|NODE|RES)-[A-Z0-9_-]+|MATH-(?!(?:\\d{8}-\\d+|\\d{2,3})(?![A-Z0-9_-]))[A-Z0-9_-]+|CHI-(?!\\d{8}-\\d+(?![A-Z0-9_-]))[A-Z0-9_-]+|(?:cloud|wxfile|file):\\/\\/[A-Z0-9._~:/?#@&+=%-]+)'
const OPAQUE_TOKEN_BODY = '(?:[A-F0-9]{24}|[A-F0-9]{8}-[A-F0-9]{4}-[1-5][A-F0-9]{3}-[89AB][A-F0-9]{3}-[A-F0-9]{12}|(?:FILE|RESOURCE)[_-][A-Z0-9_-]+|(?=[A-Z0-9_-]{20,}(?![A-Z0-9_-]))(?=[A-Z0-9_-]*[A-Z])(?=[A-Z0-9_-]*\\d)[A-Z0-9_-]+)'
const OPAQUE_TOKEN_SOURCE = `(?!${HUMAN_PAPER_CODE_SOURCE}(?![A-Z0-9_-]))${OPAQUE_TOKEN_BODY}(?![A-Z0-9_-])`
const resourcesById = new Map((resourceSeed.resources || []).map(resource => [resource.resourceId, resource]))

function isExplicitIdContext(options = {}) {
  return options.treatAsId === true || options.explicitId === true || options.idContext === true
}

function tokenSourceFor(options = {}) {
  return isExplicitIdContext(options)
    ? `(?:${INTERNAL_TOKEN_SOURCE}|${OPAQUE_TOKEN_SOURCE})`
    : INTERNAL_TOKEN_SOURCE
}

function internalRunPatternFor(tokenSource) {
  const runSource = `${tokenSource}(?:[\\s、,，]+${tokenSource})*`
  return new RegExp(`(^|[^A-Z0-9_])(${runSource})`, 'gi')
}

function isInternalIdentifier(value = '', options = {}) {
  const text = String(value || '').trim()
  if (!text) return false
  if (HUMAN_PAPER_CODE_PATTERN.test(text)) return false
  if (INTERNAL_ID_PATTERNS.some(pattern => pattern.test(text))) return true

  return isExplicitIdContext(options) && OPAQUE_ID_PATTERNS.some(pattern => pattern.test(text))
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
    if (title && title !== text && title !== '待确认细卡点') return title
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
  const noun = String(options.noun || '').trim()
  const explicitCount = positiveCount(options.count)
  const hasSemanticReplacement = Boolean(noun && explicitCount)
  const tokenSource = tokenSourceFor(options)

  return text
    .replace(internalRunPatternFor(tokenSource), (match, prefix, run) => {
      const identifiers = run.match(new RegExp(tokenSource, 'gi')) || []
      const resolvedNames = identifiers.map(identifier => resolveKnownIdentifier(identifier, options))
      const names = unique(resolvedNames)
      if (resolvedNames.every(Boolean)) return prefix + names.join('、')

      if (names.length > 0 && hasSemanticReplacement) {
        return `${prefix}${names.slice(0, 3).join('、')}等 ${explicitCount} 个${noun}`
      }
      if (names.length > 0) return prefix + names.join('、')
      return hasSemanticReplacement ? prefix + semanticCountText(explicitCount, noun) : prefix
    })
    .replace(/\s+([，。；！？、])/g, '$1')
    .replace(/[、，,]+\s*(?=[。；！？])/g, '')
    .replace(/（\s*）/g, '')
    .replace(/[：:]\s*(?=[。；！？]|$)/g, '')
    .replace(/\s+(?:与|和)\s*(?=[。；！？]|$)/g, '')
    .replace(/[ \t]{2,}/g, ' ')
    .replace(/^\s*(?:与|和)\s*/g, '')
    .replace(/请查看\s*后重试/g, '请稍后重试')
    .replace(/[，,]?\s*请查看(?=[。；！？]|$)/g, '')
    .trim()
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

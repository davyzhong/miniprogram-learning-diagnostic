const {
  FALLBACK_NAME,
  CATEGORY_NAMES,
  bottleneckCodeNameMap,
  bottleneckAliasMap
} = require('./bottleneck-taxonomy')

const BOTTLENECK_CODE_NAMES = bottleneckCodeNameMap()
const BOTTLENECK_NAME_ALIASES = bottleneckAliasMap()

function getCategoryName(code) {
  if (!code) return '未知'
  const prefix = code.split('-').slice(0, 2).join('-')
  return CATEGORY_NAMES[prefix] || code
}

function cleanBottleneckName(name) {
  const text = String(name || '').trim()
  if (!text || /^LP-[A-Z0-9-]+$/.test(text)) return ''
  if (BOTTLENECK_NAME_ALIASES[text]) return BOTTLENECK_NAME_ALIASES[text]

  const withoutBracket = text.replace(/[（(].*?[）)]/g, '')
  if (BOTTLENECK_NAME_ALIASES[withoutBracket]) return BOTTLENECK_NAME_ALIASES[withoutBracket]

  return withoutBracket
    .replace(/错误$/g, '')
    .replace(/失败$/g, '')
    .replace(/混淆$/g, '')
    .replace(/不足$/g, '')
    .replace(/偏差$/g, '')
    .trim() || ''
}

function formatBottleneckDisplayName(itemOrCode, name) {
  const item = typeof itemOrCode === 'object' && itemOrCode !== null
    ? itemOrCode
    : { lpCode: itemOrCode, lpName: name }
  const categoryName = getCategoryName(item.lpCode)

  return cleanBottleneckName(item.summary)
    || cleanBottleneckName(item.name)
    || cleanBottleneckName(item.title)
    || cleanBottleneckName(item.displayName)
    || cleanBottleneckName(item.label)
    || BOTTLENECK_CODE_NAMES[item.lpCode]
    || cleanBottleneckName(item.lpName)
    || (/^LP-[A-Z0-9-]+$/.test(categoryName) ? '' : categoryName)
    || FALLBACK_NAME
}

function formatBottleneckDisplayList(items = []) {
  return items
    .map(item => formatBottleneckDisplayName(item))
    .filter(Boolean)
    .join('、')
}

function summarizeBottleneckName(value) {
  let text = String(value || '')
    .replace(/LP-[A-Z0-9-]+/g, '')
    .replace(/[（(][^（）()]*[）)]/g, '')
    .replace(/\s+/g, '')
    .replace(/[，,。；;：:、]+$/g, '')
    .trim()

  if (!text) return FALLBACK_NAME

  for (const suffix of ['错误', '失败', '混淆', '不足']) {
    if (text.endsWith(suffix) && text.length > 4) {
      const base = text.slice(0, -suffix.length)
      if (base.length >= 4) text = base
      break
    }
  }

  return text.length > 10 ? `${text.slice(0, 10)}…` : text
}

function uniqueBottleneckSummaries(items = []) {
  const names = []
  const seen = new Set()
  for (const item of items) {
    const name = summarizeBottleneckName(
      typeof item === 'string'
        ? item
        : item && (item.summary || item.name || item.title || item.displayName || item.label || item.lpName)
    )
    if (seen.has(name)) continue
    seen.add(name)
    names.push(name)
  }
  return names
}

module.exports = {
  FALLBACK_NAME,
  CATEGORY_NAMES,
  BOTTLENECK_CODE_NAMES,
  BOTTLENECK_NAME_ALIASES,
  getCategoryName,
  cleanBottleneckName,
  formatBottleneckDisplayName,
  formatBottleneckDisplayList,
  summarizeBottleneckName,
  uniqueBottleneckSummaries
}

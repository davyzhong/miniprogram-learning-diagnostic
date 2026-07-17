'use strict'

const crypto = require('node:crypto')
const fs = require('node:fs')
const path = require('node:path')
const AdmZip = require('adm-zip')
const { XMLParser } = require('fast-xml-parser')

const PINNED_SOURCES = Object.freeze({
  emojiTest: Object.freeze({
    url: 'https://www.unicode.org/Public/17.0.0/emoji/emoji-test.txt',
    sha256: '1d8a944f88d7952f7ef7c5167fef3c67995bcae24543949710231b03a201acda',
    fileName: 'emoji-test.txt'
  }),
  variationSequences: Object.freeze({
    url: 'https://www.unicode.org/Public/17.0.0/ucd/emoji/emoji-variation-sequences.txt',
    sha256: 'bb3d09ef03f206012c7532dd52dc0a21c9efddba0135ea4cf0d9201b8b9bba7e',
    fileName: 'emoji-variation-sequences.txt'
  }),
  cldr: Object.freeze({
    url: 'https://unicode.org/Public/cldr/48.2/cldr-common-48.2.zip',
    sha256: 'd2844f9dbf6124d11a7b047f5381a467902d82a673be3d658f4c0791ffa0b83b',
    fileName: 'cldr-common-48.2.zip',
    entries: Object.freeze({
      primary: 'common/annotations/zh.xml',
      derived: 'common/annotationsDerived/zh.xml'
    })
  })
})

const DEFAULT_CATEGORY_COUNTS = [
  ...Array(20).fill(35),
  ...Array(6).fill(50)
]
const VALID_LABEL_SOURCES = new Set(['cldr-primary', 'cldr-derived', 'fallback'])

function assertPinnedHash(bytes, source) {
  const actual = crypto.createHash('sha256').update(bytes).digest('hex')
  if (actual !== String(source.sha256).toLowerCase()) {
    throw new Error(`${source.fileName} checksum mismatch: expected ${source.sha256}, got ${actual}`)
  }
  return actual
}

function normalizeSequence(value) {
  if (typeof value !== 'string' || value.trim() === '') {
    throw new Error('Unicode sequence must be a non-empty string')
  }
  const tokens = value.trim().split(/\s+/).map(token => {
    const withoutPrefix = token.replace(/^U\+/i, '')
    if (!/^[0-9a-f]{1,6}$/i.test(withoutPrefix)) {
      throw new Error(`invalid Unicode scalar: ${token}`)
    }
    const codePoint = Number.parseInt(withoutPrefix, 16)
    if (codePoint > 0x10ffff || (codePoint >= 0xd800 && codePoint <= 0xdfff)) {
      throw new Error(`invalid Unicode scalar: ${token}`)
    }
    return withoutPrefix.toUpperCase().padStart(4, '0')
  })
  return tokens.join(' ')
}

function sequenceToGlyph(sequence) {
  return normalizeSequence(sequence)
    .split(' ')
    .map(token => String.fromCodePoint(Number.parseInt(token, 16)))
    .join('')
}

function glyphToSequence(glyph) {
  if (typeof glyph !== 'string' || glyph.length === 0) {
    throw new Error('glyph must be a non-empty string')
  }
  return [...glyph]
    .map(character => character.codePointAt(0).toString(16).toUpperCase().padStart(4, '0'))
    .join(' ')
}

function cldrCodePointSequence(value) {
  if (/^(?:U\+)?[0-9A-Fa-f]{1,6}(?:\s+(?:U\+)?[0-9A-Fa-f]{1,6})*$/.test(value.trim())) {
    return normalizeSequence(value)
  }
  return glyphToSequence(value)
}

function parseEmojiTest(text) {
  if (typeof text !== 'string') throw new TypeError('emoji-test source must be text')
  let group = ''
  let subgroup = ''
  const records = []

  for (const line of text.split(/\r?\n/)) {
    const trimmed = line.trim()
    if (!trimmed) continue
    const groupMatch = trimmed.match(/^#\s*group:\s*(.+)$/i)
    if (groupMatch) {
      group = groupMatch[1].trim()
      continue
    }
    const subgroupMatch = trimmed.match(/^#\s*subgroup:\s*(.+)$/i)
    if (subgroupMatch) {
      subgroup = subgroupMatch[1].trim()
      continue
    }
    if (trimmed.startsWith('#')) continue

    const match = trimmed.match(/^([0-9A-Fa-f ]+)\s*;\s*([a-z-]+)\s+#\s+\S+\s+E(\d+(?:\.\d+)?)\s+(.+?)\s*$/)
    if (!match) throw new Error(`invalid emoji-test row: ${trimmed}`)
    const sequence = normalizeSequence(match[1])
    records.push({
      sequence,
      glyph: sequenceToGlyph(sequence),
      qualification: match[2],
      emojiVersion: match[3],
      name: match[4],
      group,
      subgroup,
      sourceOrder: records.length
    })
  }
  return records
}

function parseVariationSequences(text) {
  if (typeof text !== 'string') throw new TypeError('variation source must be text')
  const records = []

  for (const line of text.split(/\r?\n/)) {
    const trimmed = line.trim()
    if (!trimmed || trimmed.startsWith('#')) continue
    const match = trimmed.match(/^([0-9A-Fa-f ]+)\s*;\s*(text style|emoji style)\s*;\s*#\s*\((\d+(?:\.\d+)?)\)\s+(.+?)\s*$/i)
    if (!match) throw new Error(`invalid variation-sequence row: ${trimmed}`)
    const sequence = normalizeSequence(match[1])
    const tokens = sequence.split(' ')
    const presentation = match[2].toLowerCase().startsWith('text') ? 'text' : 'emoji'
    records.push({
      sequence,
      baseSequence: tokens.slice(0, -1).join(' '),
      glyph: sequenceToGlyph(sequence),
      presentation,
      unicodeVersion: match[3],
      name: match[4],
      sourceOrder: records.length
    })
  }
  return records
}

function annotationNodes(parsed) {
  const annotations = parsed && parsed.ldml && parsed.ldml.annotations
  if (!annotations || !annotations.annotation) return []
  return Array.isArray(annotations.annotation) ? annotations.annotation : [annotations.annotation]
}

function parseCldrAnnotations(bytes, entryName) {
  const zip = new AdmZip(bytes)
  const entry = zip.getEntry(entryName)
  if (!entry) throw new Error(`CLDR ZIP entry missing: ${entryName}`)
  const parser = new XMLParser({
    ignoreAttributes: false,
    attributeNamePrefix: '',
    processEntities: true,
    trimValues: true
  })
  const parsed = parser.parse(entry.getData().toString('utf8'))
  const labels = new Map()
  for (const annotation of annotationNodes(parsed)) {
    if (annotation.type !== 'tts' || typeof annotation.cp !== 'string') continue
    const value = typeof annotation['#text'] === 'string'
      ? annotation['#text'].trim()
      : typeof annotation === 'string' ? annotation.trim() : ''
    if (!value) continue
    labels.set(cldrCodePointSequence(annotation.cp), value)
  }
  return labels
}

function parseCldrZip(bytes) {
  const primary = parseCldrAnnotations(bytes, PINNED_SOURCES.cldr.entries.primary)
  const derived = parseCldrAnnotations(bytes, PINNED_SOURCES.cldr.entries.derived)

  function findLabel(sequence) {
    const candidates = [sequence]
    const tokens = sequence.split(' ')
    if (tokens.at(-1) === 'FE0E' || tokens.at(-1) === 'FE0F') {
      candidates.push(tokens.slice(0, -1).join(' '))
    }
    for (const candidate of candidates) {
      if (primary.has(candidate)) return { label: primary.get(candidate), labelSource: 'cldr-primary' }
      if (derived.has(candidate)) return { label: derived.get(candidate), labelSource: 'cldr-derived' }
    }
    return null
  }

  function resolveLabel(sequence, fallbackLabel, options = {}) {
    const normalized = normalizeSequence(sequence)
    const includePresentationSuffix = options.includePresentationSuffix === true
    const suffix = includePresentationSuffix && normalized.endsWith(' FE0E')
      ? ' 文本呈现'
      : includePresentationSuffix && normalized.endsWith(' FE0F') ? ' Emoji 呈现' : ''
    const resolved = findLabel(normalized)
    if (!resolved && (typeof fallbackLabel !== 'string' || fallbackLabel.trim() === '')) {
      throw new Error(`resolveLabel requires an explicit fallback label for ${normalized}`)
    }
    return {
      label: `${resolved ? resolved.label : fallbackLabel.trim()}${suffix}`,
      labelSource: resolved ? resolved.labelSource : 'fallback'
    }
  }

  return {
    primary,
    derived,
    resolveLabel
  }
}

function option(options, names, fallback) {
  for (const name of names) {
    if (Object.prototype.hasOwnProperty.call(options, name)) return options[name]
  }
  return fallback
}

function expectedCategoryId(index) {
  return `B02-C${String(index + 1).padStart(2, '0')}`
}

function validateManifest(manifest, options = {}) {
  if (!manifest || typeof manifest !== 'object') throw new Error('manifest must be an object')
  if (manifest.id !== 'B02') throw new Error('manifest id must be B02')
  const emojiVersion = option(options, ['unicodeEmojiVersion'], '17.0')
  const cldrVersion = option(options, ['cldrVersion'], '48.2')
  if (manifest.unicodeEmojiVersion !== emojiVersion) throw new Error('manifest Unicode Emoji version mismatch')
  if (manifest.cldrVersion !== cldrVersion) throw new Error('manifest CLDR version mismatch')
  if (!Array.isArray(manifest.categories) || !Array.isArray(manifest.items)) {
    throw new Error('manifest categories and items must be arrays')
  }

  const categoryCounts = option(options, ['categoryCounts', 'expectedCategoryCounts'], DEFAULT_CATEGORY_COUNTS)
  const expectedTotal = option(options, ['expectedTotal', 'total'], categoryCounts.reduce((sum, count) => sum + count, 0))
  const practicalCategoryCount = option(options, ['practicalCategoryCount'], Math.min(20, categoryCounts.length))
  const expectedPracticalCount = option(options, ['practicalCount', 'expectedPracticalCount'], 700)
  if (manifest.categories.length !== categoryCounts.length) {
    throw new Error(`manifest category count mismatch: expected ${categoryCounts.length}`)
  }
  if (manifest.items.length !== expectedTotal) {
    throw new Error(`manifest item count mismatch: expected ${expectedTotal}`)
  }
  if (manifest.count !== undefined && manifest.count !== expectedTotal) {
    throw new Error(`manifest count mismatch: expected ${expectedTotal}`)
  }

  const categoryById = new Map()
  manifest.categories.forEach((category, index) => {
    const expectedId = option(options, ['categoryIds'], null)?.[index] || expectedCategoryId(index)
    if (!category || category.id !== expectedId) throw new Error(`invalid category ID at index ${index}`)
    if (!Number.isInteger(category.count) || category.count !== categoryCounts[index]) {
      throw new Error(`${category.id} quota mismatch: expected ${categoryCounts[index]}`)
    }
    if (typeof category.name !== 'string' || category.name.trim() === '') throw new Error(`${category.id} name is empty`)
    if (typeof category.riskNote !== 'string' || category.riskNote.trim() === '') throw new Error(`${category.id} riskNote is empty`)
    if (categoryById.has(category.id)) throw new Error(`duplicate category ID: ${category.id}`)
    categoryById.set(category.id, { category, index })
  })

  const ids = new Set()
  const sequences = new Set()
  const actualCounts = new Map()
  const c21Items = []
  let previousCategoryIndex = -1
  let practicalCount = 0
  manifest.items.forEach((item, itemIndex) => {
    if (!item || typeof item !== 'object') throw new Error(`invalid manifest item at index ${itemIndex}`)
    const categoryInfo = categoryById.get(item.categoryId)
    if (!categoryInfo) throw new Error(`item references unknown category: ${item.categoryId}`)
    const categoryNumber = item.categoryId.match(/^B02-C(\d{2})$/)
    const itemId = typeof item.id === 'string' && item.id.match(/^B02-C\d{2}-(\d{3})$/)
    if (!categoryNumber || !itemId || !item.id.startsWith(`${item.categoryId}-`)) {
      throw new Error(`invalid item ID: ${item.id}`)
    }
    const order = Number(itemId[1])
    if (item.order !== order) throw new Error(`ID/order mismatch for ${item.id}`)
    if (order < 1 || order > categoryInfo.category.count) throw new Error(`order out of range for ${item.id}`)
    if (ids.has(item.id)) throw new Error(`duplicate item ID: ${item.id}`)
    ids.add(item.id)

    const categoryIndex = categoryInfo.index
    if (categoryIndex < previousCategoryIndex) throw new Error('manifest items are not in category order')
    previousCategoryIndex = categoryIndex
    const count = (actualCounts.get(item.categoryId) || 0) + 1
    actualCounts.set(item.categoryId, count)
    if (count !== order) throw new Error(`item order is not contiguous for ${item.categoryId}`)

    const sequence = normalizeSequence(item.sequence)
    if (sequences.has(sequence)) throw new Error(`duplicate Unicode sequence: ${item.sequence}`)
    sequences.add(sequence)
    if (glyphToSequence(item.glyph) !== sequence) throw new Error(`glyph does not match sequence for ${item.id}`)
    if (typeof item.label !== 'string' || item.label.trim() === '') throw new Error(`empty label for ${item.id}`)
    if (!VALID_LABEL_SOURCES.has(item.labelSource)) throw new Error(`invalid labelSource for ${item.id}`)
    if (typeof item.emojiVersion !== 'string' || item.emojiVersion.trim() === '') throw new Error(`empty emojiVersion for ${item.id}`)

    if (categoryInfo.index < practicalCategoryCount) practicalCount += 1
    if (item.categoryId === 'B02-C21') {
      const presentation = sequence.split(' ').at(-1)
      const suffix = presentation === 'FE0E' ? ' 文本呈现' : presentation === 'FE0F' ? ' Emoji 呈现' : null
      if (!suffix || !item.label.endsWith(suffix)) throw new Error(`C21 presentation label mismatch for ${item.id}`)
      c21Items.push({ sequence, item })
    }
  })

  for (const [categoryId, info] of categoryById) {
    if ((actualCounts.get(categoryId) || 0) !== info.category.count) {
      throw new Error(`${categoryId} item quota mismatch`)
    }
  }
  if (practicalCount !== expectedPracticalCount) {
    throw new Error(`practical quota mismatch: expected ${expectedPracticalCount}`)
  }
  if (c21Items.length > 0) {
    if (c21Items.length % 2 !== 0) throw new Error('C21 items must contain complete presentation pairs')
    for (let index = 0; index < c21Items.length; index += 2) {
      const first = c21Items[index]
      const second = c21Items[index + 1]
      if (!first.sequence.endsWith(' FE0E') || !second.sequence.endsWith(' FE0F')) {
        throw new Error('C21 items must order text presentation before Emoji presentation')
      }
      const firstBase = first.sequence.split(' ').slice(0, -1).join(' ')
      const secondBase = second.sequence.split(' ').slice(0, -1).join(' ')
      if (firstBase !== secondBase) throw new Error(`C21 presentation pair mismatch for ${first.item.id}`)
    }
  }
  const requireCoverage = option(options, ['requireCoverage'], expectedTotal === 1000)
  if (requireCoverage) {
    const hasToken = token => [...sequences].some(sequence => sequence.split(' ').includes(token))
    const hasAnyToken = predicate => [...sequences].some(sequence => sequence.split(' ').some(predicate))
    const missing = []
    if (!hasToken('FE0E')) missing.push('FE0E')
    if (!hasToken('FE0F')) missing.push('FE0F')
    if (!hasAnyToken(token => /^1F3FB$|^1F3FC$|^1F3FD$|^1F3FE$|^1F3FF$/.test(token))) missing.push('skin-tone modifier')
    if (!hasToken('200D')) missing.push('ZWJ')
    if (!hasAnyToken(token => /^1F1E[6-9A-F]$|^1F1[Ff][0-9A-F]$/.test(token))) missing.push('regional indicator')
    if (!hasAnyToken(token => /^E00[2-7][0-9A-F]$/.test(token))) missing.push('tag character')
    if (!hasToken('20E3')) missing.push('keycap combining mark')
    if (missing.length > 0) throw new Error(`required sequence coverage missing: ${missing.join(', ')}`)
  }
  return { total: manifest.items.length, practicalCount, highRiskCount: manifest.items.length - practicalCount }
}

function sourceRecords(sources, names) {
  for (const name of names) {
    if (Array.isArray(sources[name])) return sources[name]
  }
  return []
}

function validateManifestAgainstSources(manifest, sources = {}, options = {}) {
  const result = validateManifest(manifest, options)
  const emojiRecords = sourceRecords(sources, ['emojiTest', 'emojiRecords', 'emojiTestRecords'])
  const variationRecords = sourceRecords(sources, ['variationSequences', 'variationRecords', 'variationSequenceRecords'])
  const firstBatchSequences = sourceRecords(sources, ['firstBatchSequences', 'excludedSequences'])
  const emojiBySequence = new Map(emojiRecords.map(record => [normalizeSequence(record.sequence), record]))
  const variationBySequence = new Map(variationRecords.map(record => [normalizeSequence(record.sequence), record]))
  const excluded = new Set(firstBatchSequences.map(sequence => normalizeSequence(sequence)))

  for (const item of manifest.items) {
    const sequence = normalizeSequence(item.sequence)
    if (excluded.has(sequence)) throw new Error(`manifest overlaps first batch: ${item.id}`)
    const isC21 = item.categoryId === 'B02-C21'
    const record = (isC21 ? variationBySequence : emojiBySequence).get(sequence)
    if (!record) throw new Error(`${item.id} is absent from pinned ${isC21 ? 'variation' : 'emoji'} source`)
    if (!isC21 && record.qualification !== 'fully-qualified') {
      throw new Error(`${item.id} is not fully-qualified in emoji-test source`)
    }
    if (record.glyph !== item.glyph) throw new Error(`source glyph mismatch for ${item.id}`)
    if (record.emojiVersion && item.emojiVersion !== record.emojiVersion) {
      throw new Error(`source version mismatch for ${item.id}`)
    }
    if (item.sourceOrder !== undefined && item.sourceOrder !== record.sourceOrder) {
      throw new Error(`source order mismatch for ${item.id}`)
    }
    if (isC21) {
      const expectedPresentation = sequence.endsWith(' FE0E') ? 'text' : sequence.endsWith(' FE0F') ? 'emoji' : ''
      if (record.presentation !== expectedPresentation) throw new Error(`presentation mismatch for ${item.id}`)
    }
  }

  if (sources.cldr && typeof sources.cldr.resolveLabel === 'function') {
    for (const item of manifest.items) {
      const normalizedItemSequence = normalizeSequence(item.sequence)
      const suffix = item.categoryId === 'B02-C21' && normalizedItemSequence.endsWith(' FE0E')
        ? ' 文本呈现'
        : item.categoryId === 'B02-C21' && normalizedItemSequence.endsWith(' FE0F') ? ' Emoji 呈现' : ''
      const fallback = suffix && item.label.endsWith(suffix)
        ? item.label.slice(0, -suffix.length)
        : item.label
      const resolved = sources.cldr.resolveLabel(item.sequence, fallback, {
        includePresentationSuffix: item.categoryId === 'B02-C21'
      })
      if (resolved.label !== item.label || resolved.labelSource !== item.labelSource) {
        throw new Error(`CLDR label mismatch for ${item.id}`)
      }
    }
  }
  return result
}

const SOURCE_ENTRIES = [
  ['emojiTest', PINNED_SOURCES.emojiTest],
  ['variationSequences', PINNED_SOURCES.variationSequences],
  ['cldr', PINNED_SOURCES.cldr]
]

function sourceCachePath() {
  return process.env.EMOJI_SOURCE_CACHE_DIR || path.resolve(process.cwd(), 'tmp/emoji-compatibility-sources')
}

function manifestPath() {
  return process.env.EMOJI_MANIFEST_PATH || path.join(__dirname, 'batch-02-manifest.json')
}

async function downloadPinnedSource(source) {
  if (typeof fetch !== 'function') throw new Error(`cannot download ${source.fileName}: fetch is unavailable`)
  const response = await fetch(source.url)
  if (!response.ok) throw new Error(`failed to download ${source.fileName}: HTTP ${response.status}`)
  const bytes = Buffer.from(await response.arrayBuffer())
  assertPinnedHash(bytes, source)
  return bytes
}

function ensureRegularCacheDirectory(cacheDir) {
  try {
    const stats = fs.lstatSync(cacheDir)
    if (stats.isSymbolicLink() || !stats.isDirectory()) {
      throw new Error(`source cache directory must be a real directory: ${cacheDir}`)
    }
  } catch (error) {
    if (error.code !== 'ENOENT') throw error
    fs.mkdirSync(cacheDir, { recursive: true })
  }
}

function cacheEntryIsRegularFile(filePath, fileName) {
  try {
    const stats = fs.lstatSync(filePath)
    if (stats.isSymbolicLink() || !stats.isFile()) {
      throw new Error(`${fileName} cache entry must be a regular file: ${filePath}`)
    }
    return true
  } catch (error) {
    if (error.code === 'ENOENT') return false
    throw error
  }
}

function atomicallyCacheSource(cacheDir, source, bytes) {
  const destination = path.join(cacheDir, source.fileName)
  const temporary = path.join(cacheDir, `.${source.fileName}.${crypto.randomUUID()}.tmp`)
  let descriptor = null
  try {
    descriptor = fs.openSync(temporary, 'wx', 0o600)
    if (!fs.fstatSync(descriptor).isFile()) throw new Error(`temporary source file is not regular: ${temporary}`)
    fs.writeFileSync(descriptor, bytes)
    fs.fsyncSync(descriptor)
    fs.closeSync(descriptor)
    descriptor = null
    if (cacheEntryIsRegularFile(destination, source.fileName)) {
      throw new Error(`source cache entry appeared during download: ${destination}`)
    }
    fs.renameSync(temporary, destination)
  } finally {
    if (descriptor !== null) fs.closeSync(descriptor)
    if (fs.existsSync(temporary)) fs.unlinkSync(temporary)
  }
}

async function loadPinnedSources(cacheDir) {
  const artifacts = {}
  const missing = []
  ensureRegularCacheDirectory(cacheDir)
  for (const [key, source] of SOURCE_ENTRIES) {
    const filePath = path.join(cacheDir, source.fileName)
    if (!cacheEntryIsRegularFile(filePath, source.fileName)) {
      missing.push([key, source])
      continue
    }
    const bytes = fs.readFileSync(filePath)
    assertPinnedHash(bytes, source)
    artifacts[key] = bytes
  }

  if (missing.length === 0) return artifacts
  if (process.env.EMOJI_NO_NETWORK === '1') {
    throw new Error(`source artifact missing and network disabled: ${missing.map(([, source]) => source.fileName).join(', ')}`)
  }

  for (const [key, source] of missing) {
    const bytes = await downloadPinnedSource(source)
    atomicallyCacheSource(cacheDir, source, bytes)
    artifacts[key] = bytes
  }
  return artifacts
}

function firstBatchSequences() {
  const firstBatchPath = path.resolve(__dirname, '../../miniprogram/pages/icon-compatibility/emoji-candidates.js')
  const { EMOJI_CATEGORIES } = require(firstBatchPath)
  return EMOJI_CATEGORIES.flatMap(category => category.items.map(item => item.sequence))
}

async function verifyManifestFromCli() {
  const currentManifestPath = manifestPath()
  if (!fs.existsSync(currentManifestPath)) {
    console.error(`Task 2 manifest is missing: ${currentManifestPath}`)
    return 1
  }
  try {
    const sourceBytes = await loadPinnedSources(sourceCachePath())
    const manifest = JSON.parse(fs.readFileSync(currentManifestPath, 'utf8'))
    const sourceRecords = {
      emojiTest: parseEmojiTest(sourceBytes.emojiTest.toString('utf8')),
      variationSequences: parseVariationSequences(sourceBytes.variationSequences.toString('utf8')),
      cldr: parseCldrZip(sourceBytes.cldr),
      firstBatchSequences: firstBatchSequences()
    }
    validateManifestAgainstSources(manifest, sourceRecords)
    console.log(`Task 2 manifest is valid: ${currentManifestPath}`)
    return 0
  } catch (error) {
    console.error(`Task 2 manifest validation failed: ${error.message}`)
    return 1
  }
}

module.exports = {
  PINNED_SOURCES,
  assertPinnedHash,
  parseEmojiTest,
  parseVariationSequences,
  parseCldrZip,
  validateManifest,
  validateManifestAgainstSources
}

if (require.main === module && process.argv.includes('--verify')) {
  verifyManifestFromCli().then(status => {
    process.exitCode = status
  }).catch(error => {
    console.error(`Task 2 manifest validation failed: ${error.message}`)
    process.exitCode = 1
  })
}

const test = require('node:test')
const assert = require('node:assert/strict')

const manifest = require('../scripts/emoji-compatibility/batch-02-manifest.json')
const deviceResults = require('../scripts/emoji-compatibility/device-results-2026-07-18.json')
const {
  EMOJI_BATCH_02,
  EMOJI_BATCH_02_COUNT,
  findBatch02Category,
  unicodeSequence
} = require('../miniprogram/pages/icon-compatibility/emoji-candidates-batch-02')
const {
  VERIFIED_BATCH_02_SYMBOLS,
  REJECTED_BATCH_02_IDS
} = require('../miniprogram/utils/ui-symbols-batch-02')

function flattenRuntime(batch) {
  return batch.categories.flatMap(category => category.items.map(item => ({
    id: item.id,
    categoryId: category.id,
    order: item.order,
    glyph: item.glyph,
    sequence: item.sequence,
    label: item.label,
    emojiVersion: item.emojiVersion
  })))
}

function normalizeManifest(source) {
  return source.items.map(item => ({
    id: item.id,
    categoryId: item.categoryId,
    order: item.order,
    glyph: item.glyph,
    sequence: item.sequence,
    label: item.label,
    emojiVersion: item.emojiVersion
  }))
}

function assertDeepFrozen(value) {
  assert.equal(Object.isFrozen(value), true)
  if (!value || typeof value !== 'object') return
  Object.values(value).forEach(child => {
    if (child && typeof child === 'object') assertDeepFrozen(child)
  })
}

test('runtime batch exactly matches the normative manifest', () => {
  assert.equal(EMOJI_BATCH_02.id, 'B02')
  assert.equal(EMOJI_BATCH_02.count, 1000)
  assert.equal(EMOJI_BATCH_02_COUNT, 1000)
  assert.equal(EMOJI_BATCH_02.categories.length, 26)
  assert.deepEqual(flattenRuntime(EMOJI_BATCH_02), normalizeManifest(manifest))
  assert.deepEqual(
    EMOJI_BATCH_02.categories.map(({ id, name, count, riskNote }) => ({ id, name, count, riskNote })),
    manifest.categories
  )
  assertDeepFrozen(EMOJI_BATCH_02)
})

test('runtime helpers preserve exact public IDs and Unicode sequences', () => {
  assert.equal(findBatch02Category('B02-C01').items[0].id, 'B02-C01-001')
  assert.equal(findBatch02Category('B02-C26').items.at(-1).id, 'B02-C26-050')
  assert.equal(findBatch02Category('B02-C99'), null)

  flattenRuntime(EMOJI_BATCH_02).forEach(item => {
    assert.equal(unicodeSequence(item.glyph), item.sequence, item.id)
  })
})

test('production whitelist exactly reflects the Android and iOS device result snapshot', () => {
  const manifestById = new Map(manifest.items.map(item => [item.id, item]))
  assert.equal(deviceResults.resultPolicy, 'all-except-failed')
  assert.equal(deviceResults.approvedCount, 996)
  assert.deepEqual(REJECTED_BATCH_02_IDS, deviceResults.failedIds)
  assert.equal(Object.keys(VERIFIED_BATCH_02_SYMBOLS).length, 996)

  manifest.items.forEach(item => {
    if (deviceResults.failedIds.includes(item.id)) {
      assert.equal(VERIFIED_BATCH_02_SYMBOLS[item.id], undefined)
    } else {
      assert.equal(VERIFIED_BATCH_02_SYMBOLS[item.id], item.glyph)
    }
  })
  REJECTED_BATCH_02_IDS.forEach(id => assert.ok(manifestById.has(id)))
})

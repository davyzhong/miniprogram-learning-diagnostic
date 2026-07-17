const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')

const ROOT = path.resolve(__dirname, '..')
const SPEC_PATH = path.join(ROOT, 'docs/superpowers/specs/2026-07-17-practical-emoji-compatibility-lab-design.md')
const {
  EMOJI_CATEGORIES,
  EMOJI_CANDIDATE_COUNT,
  findCategory,
  unicodeSequence
} = require('../miniprogram/pages/icon-compatibility/emoji-candidates')
const { UI_SYMBOLS, isApprovedUiSymbol } = require('../miniprogram/utils/ui-symbols')

function normativeItems() {
  const spec = fs.readFileSync(SPEC_PATH, 'utf8')
  const block = spec.match(/```text\n([\s\S]*?)\n```/)
  assert.ok(block, 'approved spec should contain the frozen candidate manifest')
  return block[1].split(/;\s*|\n/).filter(Boolean).map(entry => {
    const match = entry.match(/^(C\d{2}-\d+)=([^/]+)\/([^/]+)\/(.+)$/)
    assert.ok(match, `invalid normative manifest entry: ${entry}`)
    return { id: match[1], glyph: match[2], label: match[3], sequence: match[4] }
  })
}

function normativeCategories() {
  const spec = fs.readFileSync(SPEC_PATH, 'utf8')
  return spec.split(/\r?\n/).filter(line => /^\| C\d{2} \|/.test(line)).map(line => {
    const cells = line.split('|').map(cell => cell.trim()).filter(Boolean)
    return { id: cells[0], name: cells[1], riskNote: cells[3].replace(/`/g, '') }
  })
}

function assertDeepFrozen(value) {
  assert.equal(Object.isFrozen(value), true)
  if (!value || typeof value !== 'object') return
  Object.values(value).forEach(child => {
    if (child && typeof child === 'object') assertDeepFrozen(child)
  })
}

test('candidate manifest exactly matches the approved 202-item specification', () => {
  const expectedItems = normativeItems()
  const actualItems = EMOJI_CATEGORIES.flatMap(category => category.items)

  assert.equal(EMOJI_CATEGORIES.length, 14)
  assert.equal(EMOJI_CANDIDATE_COUNT, 202)
  assert.equal(actualItems.length, 202)
  assert.deepEqual(
    actualItems.map(({ id, glyph, label, sequence }) => ({ id, glyph, label, sequence })),
    expectedItems
  )
  assert.deepEqual(
    EMOJI_CATEGORIES.map(({ id, name, riskNote }) => ({ id, name, riskNote })),
    normativeCategories()
  )
})

test('candidate IDs and Unicode scalar sequences are unique and immutable', () => {
  const items = EMOJI_CATEGORIES.flatMap(category => category.items)
  assert.equal(new Set(EMOJI_CATEGORIES.map(category => category.id)).size, 14)
  assert.equal(new Set(items.map(item => item.id)).size, 202)
  assert.equal(new Set(items.map(item => item.sequence)).size, 202)
  items.forEach(item => assert.equal(unicodeSequence(item.glyph), item.sequence))
  assertDeepFrozen(EMOJI_CATEGORIES)
})

test('UI whitelist keeps the C01 core, admits only C02–C06 verified candidates, and rejects all others', () => {
  const c01 = findCategory('C01')
  assert.ok(c01)
  assert.equal(c01.statusText, '首批已验证')
  assert.deepEqual(c01.items.map(item => item.glyph), ['🗺️', '📚', '📄', '📸', '📊', '🎯', '✅'])
  c01.items.forEach(item => assert.equal(isApprovedUiSymbol(item.glyph), true))

  // 第二批策展：UI_SYMBOLS 扩充为 C01-C06 子集（不含 ZWJ/VS16 高风险字形），
  // C01 七枚必须全部保留，其余白名单成员一律来自 C02-C06。
  const c01Glyphs = new Set(c01.items.map(item => item.glyph))
  const whitelistGlyphs = Object.values(UI_SYMBOLS)
  c01Glyphs.forEach(glyph => assert.ok(whitelistGlyphs.includes(glyph), `C01 ${glyph} 必须保留在白名单`))
  assert.ok(whitelistGlyphs.length > c01Glyphs.size, '白名单应在 C01 基础上扩充')

  const approvedBeyondC01 = new Set(whitelistGlyphs.filter(glyph => !c01Glyphs.has(glyph)))
  EMOJI_CATEGORIES.slice(1).forEach(category => {
    category.items.forEach(item => {
      if (approvedBeyondC01.has(item.glyph)) {
        assert.ok(['C02', 'C03', 'C04', 'C05', 'C06'].includes(category.id), `${item.id} 只可从 C02-C06 策展`)
        return
      }
      assert.equal(isApprovedUiSymbol(item.glyph), false, `${item.id} must remain a candidate`)
    })
  })
  assert.equal(findCategory('C99'), null)
})

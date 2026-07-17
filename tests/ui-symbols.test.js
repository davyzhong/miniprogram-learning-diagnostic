const test = require('node:test')
const assert = require('node:assert/strict')

const {
  UI_SYMBOLS,
  symbolOf,
  subjectSymbolOf,
  isApprovedUiSymbol
} = require('../miniprogram/utils/ui-symbols')

const EXPECTED_SYMBOLS = [
  '🗺️', '📚', '📄', '📸', '📊', '🎯', '✅',
  '📐', '📖', '📘', '📓', '📝',
  '📈', '📉', '📋', '📁', '🔍', '💾',
  '🔄', '📌',
  '⚠️', '❗', '🔔', '⏳', '💡',
  '⏰', '📅'
]

test('UI symbols expose only the approved cross-platform whitelist', () => {
  assert.deepEqual(Object.values(UI_SYMBOLS), EXPECTED_SYMBOLS)
  assert.equal(new Set(Object.values(UI_SYMBOLS)).size, EXPECTED_SYMBOLS.length)
  assert.equal(symbolOf('knowledgeMap'), '🗺️')
  assert.equal(symbolOf('unknown'), '')
  assert.equal(isApprovedUiSymbol('🗺️'), true)
  assert.equal(isApprovedUiSymbol('⚠️'), true)
  assert.equal(isApprovedUiSymbol('👨‍👩‍👧'), false)
})

test('every whitelist entry is bound to a semantic key from the curated C01-C06 range', () => {
  const { EMOJI_CATEGORIES } = require('../miniprogram/pages/icon-compatibility/emoji-candidates')
  const curatedGlyphs = new Set(
    EMOJI_CATEGORIES
      .filter(category => ['C01', 'C02', 'C03', 'C04', 'C05', 'C06'].includes(category.id))
      .flatMap(category => category.items.map(item => item.glyph))
  )
  for (const [key, glyph] of Object.entries(UI_SYMBOLS)) {
    assert.equal(typeof key, 'string')
    assert.ok(key.length > 0)
    assert.ok(curatedGlyphs.has(glyph), `${key}=${glyph} 必须来自 C01-C06 已验证候选`)
    // 白名单继续排除 ZWJ 组合与键帽/修饰符序列
    assert.ok(![...glyph].some(char => char === '\u200D'), `${key} 不允许 ZWJ 组合`)
  }
})

test('subject symbols map the three subjects to curated glyphs', () => {
  assert.equal(subjectSymbolOf('math'), '📐')
  assert.equal(subjectSymbolOf('chinese'), '📖')
  assert.equal(subjectSymbolOf('english'), '📘')
  assert.equal(subjectSymbolOf('science'), '')
})

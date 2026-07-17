const test = require('node:test')
const assert = require('node:assert/strict')

const {
  UI_SYMBOLS,
  UI_SYMBOL_CATEGORIES,
  symbolOf,
  subjectSymbolOf,
  isApprovedUiSymbol
} = require('../miniprogram/utils/ui-symbols')

// 2026-07-18 之前的 27 个常用键（向后兼容契约：全部仍可解析）
const LEGACY_KEYS = [
  'knowledgeMap', 'learningRecords', 'paper', 'camera', 'report', 'target', 'complete',
  'subjectMath', 'subjectChinese', 'subjectEnglish', 'notebook', 'dictation',
  'trendUp', 'trendDown', 'practice', 'folder', 'evidence', 'save',
  'refresh', 'pin',
  'warning', 'important', 'bell', 'pending', 'tip',
  'time', 'calendar'
]

test('UI symbols expose the full 202-item verified library plus backward-compatible aliases', () => {
  const keys = Object.keys(UI_SYMBOLS)
  assert.equal(keys.length, 205)
  assert.equal(new Set(keys).size, 205)
  LEGACY_KEYS.forEach(key => {
    assert.ok(symbolOf(key).length > 0, `旧键 ${key} 必须继续可解析`)
  })
  assert.equal(symbolOf('unknown'), '')
})

test('category structure mirrors the 14 verified candidate groups (C01: 7, C02-C14: 15)', () => {
  const ids = Object.keys(UI_SYMBOL_CATEGORIES)
  assert.deepEqual(ids, ['C01', 'C02', 'C03', 'C04', 'C05', 'C06', 'C07', 'C08', 'C09', 'C10', 'C11', 'C12', 'C13', 'C14'])
  assert.equal(UI_SYMBOL_CATEGORIES.C01.length, 7)
  ids.slice(1).forEach(id => {
    assert.equal(UI_SYMBOL_CATEGORIES[id].length, 15, `${id} 应有 15 个语义键`)
  })
  const canonicalCount = ids.reduce((sum, id) => sum + UI_SYMBOL_CATEGORIES[id].length, 0)
  assert.equal(canonicalCount, 202)
  ids.forEach(id => {
    assert.ok(Object.isFrozen(UI_SYMBOL_CATEGORIES[id]))
    UI_SYMBOL_CATEGORIES[id].forEach(key => assert.ok(symbolOf(key).length > 0))
  })
})

test('every whitelist glyph is one of the 202 device-verified candidates (C01-C14 all allowed)', () => {
  const { EMOJI_CATEGORIES } = require('../miniprogram/pages/icon-compatibility/emoji-candidates')
  const verifiedGlyphs = new Set(EMOJI_CATEGORIES.flatMap(category => category.items.map(item => item.glyph)))
  assert.equal(verifiedGlyphs.size, 202)
  for (const glyph of Object.values(UI_SYMBOLS)) {
    assert.ok(verifiedGlyphs.has(glyph), `${glyph} 必须来自 202 项真机验证清单`)
    assert.equal(isApprovedUiSymbol(glyph), true)
  }
  // ZWJ 家庭组合、键帽、旗帜、肤色修饰符均已真机验证，不再排除
  assert.equal(isApprovedUiSymbol('👨‍👩‍👧‍👦'), true)
  assert.equal(isApprovedUiSymbol('1️⃣'), true)
  assert.equal(isApprovedUiSymbol('👍🏽'), true)
  assert.equal(isApprovedUiSymbol('🦄'), false)
})

test('subject symbols follow the updated design direction (abacus / open book / letters)', () => {
  assert.equal(subjectSymbolOf('math'), '🧮')
  assert.equal(subjectSymbolOf('chinese'), '📖')
  assert.equal(subjectSymbolOf('english'), '🔤')
  assert.equal(subjectSymbolOf('science'), '')
  assert.equal(symbolOf('family'), '👨‍👩‍👧')
  assert.equal(symbolOf('familyFull'), '👨‍👩‍👧‍👦')
  assert.equal(symbolOf('statusGreen'), '🟢')
  assert.equal(symbolOf('print'), '🖨️')
})

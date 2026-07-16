const test = require('node:test')
const assert = require('node:assert/strict')

const {
  UI_SYMBOLS,
  symbolOf,
  isApprovedUiSymbol
} = require('../miniprogram/utils/ui-symbols')

test('UI symbols expose only the approved cross-platform whitelist', () => {
  assert.deepEqual(Object.values(UI_SYMBOLS), ['🗺️', '📚', '📄', '📸', '📊', '🎯', '✅'])
  assert.equal(symbolOf('knowledgeMap'), '🗺️')
  assert.equal(symbolOf('unknown'), '')
  assert.equal(isApprovedUiSymbol('🗺️'), true)
  assert.equal(isApprovedUiSymbol('👨‍👩‍👧'), false)
})

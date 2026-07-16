const UI_SYMBOLS = Object.freeze({
  knowledgeMap: '🗺️',
  learningRecords: '📚',
  paper: '📄',
  camera: '📸',
  report: '📊',
  target: '🎯',
  complete: '✅'
})

const APPROVED_SYMBOLS = new Set(Object.values(UI_SYMBOLS))

function symbolOf(key) {
  return UI_SYMBOLS[key] || ''
}

function isApprovedUiSymbol(value) {
  return APPROVED_SYMBOLS.has(value)
}

module.exports = {
  UI_SYMBOLS,
  symbolOf,
  isApprovedUiSymbol
}

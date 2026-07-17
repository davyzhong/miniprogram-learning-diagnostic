// 全局 UI emoji 白名单（唯一来源）。
// 策展范围：icon-compatibility 候选清单 C01-C06（已验证基础/学习文具/报告数据/操作导航/状态提醒/时间计划），
// 全部经过 Android 真机验证可显示；继续禁止 C09/C14 的 ZWJ 组合与 VS16 高风险字形。
// 规则：emoji 只辅助识别，所有入口必须同时保留文字；页面通过 symbolOf() 注入、经 {{}} 渲染，
// 不在 WXML 里写 emoji 字面量（扫描测试按本白名单放行）。
const UI_SYMBOLS = Object.freeze({
  // C01 已验证基础
  knowledgeMap: '🗺️',
  learningRecords: '📚',
  paper: '📄',
  camera: '📸',
  report: '📊',
  target: '🎯',
  complete: '✅',
  // C02 学习文具（学科与书写任务）
  subjectMath: '📐',
  subjectChinese: '📖',
  subjectEnglish: '📘',
  notebook: '📓',
  dictation: '📝',
  // C03 报告数据
  trendUp: '📈',
  trendDown: '📉',
  practice: '📋',
  folder: '📁',
  evidence: '🔍',
  save: '💾',
  // C04 操作导航
  refresh: '🔄',
  pin: '📌',
  // C05 状态提醒
  warning: '⚠️',
  important: '❗',
  bell: '🔔',
  pending: '⏳',
  tip: '💡',
  // C06 时间计划
  time: '⏰',
  calendar: '📅'
})

const APPROVED_SYMBOLS = new Set(Object.values(UI_SYMBOLS))

// 学科键 → 白名单键，供页面按当前学科取图标
const SUBJECT_SYMBOL_KEYS = Object.freeze({
  math: 'subjectMath',
  chinese: 'subjectChinese',
  english: 'subjectEnglish'
})

function symbolOf(key) {
  return UI_SYMBOLS[key] || ''
}

function subjectSymbolOf(subject) {
  return symbolOf(SUBJECT_SYMBOL_KEYS[subject] || '')
}

function isApprovedUiSymbol(value) {
  return APPROVED_SYMBOLS.has(value)
}

module.exports = {
  UI_SYMBOLS,
  symbolOf,
  subjectSymbolOf,
  isApprovedUiSymbol
}

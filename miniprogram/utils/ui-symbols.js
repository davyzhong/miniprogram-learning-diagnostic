// 全局 UI emoji 白名单（唯一入口：首批 202 项 + 第二批双端通过 996 项）。
// 2026-07-18 更新：icon-compatibility 202 项候选（C01-C14 全 14 类）已在 Android 真机
// 全部验证可显示，ZWJ/VS16/键帽/旗帜不再排除，全量解禁。
// 2026-07-18 更新：第二批 1000 项完成 Android/iOS 真机测试，996 项双端通过。
// 通过项按稳定测试 ID 调用；4 个 Android 方格项由生成数据明确排除。
// 规则：emoji 只辅助识别，所有入口必须同时保留文字；页面通过 symbolOf() 注入、
// 经 {{}} 渲染，不在 WXML 写 emoji 字面量（扫描测试按本白名单放行）。
const CATEGORY_TABLES = {
  C01: [['knowledgeMap','🗺️'],['learningRecords','📚'],['paper','📄'],['camera','📸'],['report','📊'],['target','🎯'],['complete','✅']],
  C02: [['bookOpen','📖'],['bookRed','📕'],['bookGreen','📗'],['bookBlue','📘'],['bookOrange','📙'],['notebook','📓'],['notebookFancy','📔'],['ledger','📒'],['bookmarkTabs','📑'],['bookmark','🔖'],['pencil','✏️'],['pen','🖊️'],['fountainPen','🖋️'],['dictation','📝'],['rulerTriangular','📐']],
  C03: [['trendUp','📈'],['trendDown','📉'],['practice','📋'],['folder','📁'],['folderOpen','📂'],['cardIndex','🗂️'],['cardBox','🗃️'],['fileCabinet','🗄️'],['evidence','🔍'],['searchRight','🔎'],['save','💾'],['receipt','🧾'],['abacus','🧮'],['label','🏷️'],['notepadSpiral','🗒️']],
  C04: [['arrowLeft','⬅️'],['arrowRight','➡️'],['arrowUp','⬆️'],['arrowDown','⬇️'],['backArrow','↩️'],['forwardArrow','↪️'],['refresh','🔄'],['repeat','🔁'],['rewind','⏪'],['fastForward','⏩'],['fastUp','⏫'],['fastDown','⏬'],['link','🔗'],['pin','📌'],['location','📍']],
  C05: [['ballotCheck','☑️'],['crossMark','❌'],['warning','⚠️'],['important','❗'],['question','❓'],['info','ℹ️'],['bell','🔔'],['bellSlash','🔕'],['pending','⏳'],['hourglassDone','⌛'],['forbidden','🚫'],['statusGreen','🟢'],['statusYellow','🟡'],['statusRed','🔴'],['tip','💡']],
  C06: [['clock1','🕐'],['clock3','🕒'],['clock6','🕕'],['clock9','🕘'],['clock12','🕛'],['time','⏰'],['stopwatch','⏱️'],['timer','⏲️'],['calendar','📅'],['calendarTear','📆'],['calendarSpiral','🗓️'],['watch','⌚'],['sunrise','🌅'],['sunset','🌇'],['moon','🌙']],
  C07: [['faceHappy','😀'],['faceGlad','😃'],['faceLaugh','😄'],['faceJoy','😁'],['faceSmile','😊'],['faceCalm','🙂'],['faceThink','🤔'],['faceObserve','🧐'],['faceRelieved','😌'],['faceNeutral','😐'],['faceConfused','😕'],['faceWorried','😟'],['faceSad','😢'],['faceCry','😭'],['facePersist','😤']],
  C08: [['thumbUp','👍'],['thumbDown','👎'],['clap','👏'],['celebrate','🙌'],['okHand','👌'],['victory','✌️'],['handshake','🤝'],['pray','🙏'],['muscle','💪'],['eyes','👀'],['ear','👂'],['writing','✍️'],['pointUp','👆'],['pointDown','👇'],['pointRight','👉']],
  C09: [['boy','👦'],['girl','👧'],['child','🧒'],['dad','👨'],['mom','👩'],['parent','🧑'],['baby','👶'],['student','🧑‍🎓'],['family','👨‍👩‍👧'],['familySon','👨‍👩‍👦'],['familyMomGirl','👩‍👧'],['familyDadBoy','👨‍👦'],['sprout','🌱'],['herb','🌿'],['tree','🌳']],
  C10: [['sun','☀️'],['sunCloud','🌤️'],['cloud','⛅'],['rain','🌧️'],['thunder','⛈️'],['rainbow','🌈'],['star','⭐'],['starGlow','🌟'],['sparkles','✨'],['fire','🔥'],['droplet','💧'],['snow','❄️'],['blossom','🌸'],['clover','🍀'],['globe','🌍']],
  C11: [['laptop','💻'],['keyboard','⌨️'],['desktop','🖥️'],['print','🖨️'],['phone','📱'],['telephone','☎️'],['photoCamera','📷'],['movieCamera','🎥'],['flashlight','🔦'],['key','🔑'],['lock','🔒'],['unlock','🔓'],['toolbox','🧰'],['puzzle','🧩'],['backpack','🎒']],
  C12: [['home','🏠'],['school','🏫'],['office','🏢'],['hospital','🏥'],['building','🏛️'],['car','🚗'],['bus','🚌'],['bike','🚲'],['walk','🚶'],['station','🚉'],['airplane','✈️'],['rocket','🚀'],['compass','🧭'],['road','🛣️'],['finish','🏁']],
  C13: [['plus','➕'],['minus','➖'],['multiply','✖️'],['divide','➗'],['equals','🟰'],['infinity','♾️'],['numbers','🔢'],['letters','🔤'],['lettersLower','🔡'],['lettersUpper','🔠'],['circle','⭕'],['triangleUp','🔺'],['triangleDown','🔻'],['diamondBlue','🔷'],['diamondOrange','🔶']],
  C14: [['heart','❤️'],['heartText','❤'],['faceSmileColor','☺️'],['faceSmileText','☺'],['womanTone','👩🏽'],['thumbUpTone','👍🏽'],['teacherWoman','👩‍🏫'],['teacherMan','👨‍🏫'],['techWoman','👩‍💻'],['techMan','👨‍💻'],['familyFull','👨‍👩‍👧‍👦'],['flagRainbow','🏳️‍🌈'],['flagChina','🇨🇳'],['keycap1','1️⃣'],['keycapHash','#️⃣']],
}

const {
  VERIFIED_BATCH_02_SYMBOLS,
  REJECTED_BATCH_02_IDS
} = require('./ui-symbols-batch-02')

Object.values(CATEGORY_TABLES).forEach(Object.freeze)
Object.freeze(CATEGORY_TABLES)

// 常用别名（向后兼容旧键；学科图标按 2026-07-18 设计方向更新为算盘/打开的书/字母）
const SYMBOL_ALIASES = Object.freeze({
  subjectMath: '🧮',
  subjectChinese: '📖',
  subjectEnglish: '🔤'
})

// 学科键 → 白名单键，供页面按当前学科取图标
const SUBJECT_SYMBOL_KEYS = Object.freeze({
  math: 'subjectMath',
  chinese: 'subjectChinese',
  english: 'subjectEnglish'
})

const UI_SYMBOLS = Object.freeze(Object.assign(
  {},
  ...Object.values(CATEGORY_TABLES).map(Object.fromEntries),
  SYMBOL_ALIASES,
  VERIFIED_BATCH_02_SYMBOLS
))

// 类目结构视图：{ C01: [keys...], ..., C14: [keys...] }，供测试与调试断言
const UI_SYMBOL_CATEGORIES = Object.freeze(Object.fromEntries(
  Object.entries(CATEGORY_TABLES).map(([id, entries]) => [
    id,
    Object.freeze(entries.map(([key]) => key))
  ])
))

const APPROVED_SYMBOLS = new Set(Object.values(UI_SYMBOLS))

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
  UI_SYMBOL_CATEGORIES,
  VERIFIED_BATCH_02_SYMBOLS,
  REJECTED_BATCH_02_IDS,
  symbolOf,
  subjectSymbolOf,
  isApprovedUiSymbol
}

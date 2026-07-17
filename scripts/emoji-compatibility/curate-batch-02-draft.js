'use strict'

// Non-normative authoring aid. Its output is a review draft, never a build input.
const fs = require('node:fs')
const path = require('node:path')
const {
  PINNED_SOURCES,
  assertPinnedHash,
  parseEmojiTest,
  parseVariationSequences,
  parseCldrZip
} = require('./validate-batch-02-manifest')

const ROOT = path.resolve(__dirname, '../..')
const SOURCE_DIR = path.join(ROOT, 'tmp', 'emoji-compatibility-sources')
const OUTPUT_PATH = path.join(ROOT, 'tmp', 'batch-02-draft.json')
const FIRST_BATCH_PATH = path.join(ROOT, 'miniprogram/pages/icon-compatibility/emoji-candidates.js')

const CATEGORIES = [
  ['学习与办公', 35, '书本、文具、文件、图表、记录'],
  ['操作与导航', 35, '方向、播放、切换、搜索、链接'],
  ['状态与时间', 35, '提醒、进度、日历、时钟、结果'],
  ['面部与情绪', 35, '常见反馈、思考、困惑、鼓励'],
  ['基础手势', 35, '指向、赞同、协作、书写、观察'],
  ['人物与职业', 35, '学生、教师、家长、职业角色'],
  ['陆地动物', 35, '宠物、野生动物、生肖相关'],
  ['飞禽水生昆虫', 35, '鸟类、水生动物、昆虫'],
  ['植物天气自然', 35, '植物、天气、地貌、天体'],
  ['主食水果蔬菜', 35, '食材、餐食、水果、蔬菜'],
  ['饮品甜点餐具', 35, '饮品、甜点、餐具、庆祝食物'],
  ['体育与活动', 35, '球类、运动、奖项、户外活动'],
  ['艺术音乐游戏', 35, '乐器、表演、美术、玩具、游戏'],
  ['交通工具', 35, '陆海空交通、站点、出行'],
  ['建筑与地点', 35, '家庭、学校、公共场所、地标'],
  ['家居与日用品', 35, '家具、清洁、照明、生活用品'],
  ['科技与媒体', 35, '手机、电脑、影音、通信设备'],
  ['工具科学医疗', 35, '工具、实验、医疗、测量设备'],
  ['服饰与个人物品', 35, '衣物、配饰、箱包、个人用品'],
  ['数学图形与符号', 35, '数字、字母、数学、形状、标记'],
  ['文本与 Emoji 呈现', 50, 'VS15/VS16、默认文本和默认彩色差异'],
  ['肤色修饰组合', 50, '五档肤色、手势和人物修饰'],
  ['性别职业 ZWJ', 50, '性别、职业、活动等连接序列'],
  ['家庭关系 ZWJ', 50, '家庭、伴侣、亲子和多人组合'],
  ['旗帜与标签序列', 50, '区域旗帜、特殊旗帜和 tag 序列'],
  ['键帽与复杂新版', 50, '键帽、长序列、近期新增和易拆分组合']
].map(([name, count, riskNote], index) => ({
  id: `B02-C${String(index + 1).padStart(2, '0')}`,
  name,
  count,
  riskNote
}))

const PRACTICAL_SUBGROUPS = [
  ['book-paper', 'writing', 'office', 'mail', 'lock', 'money'],
  ['arrow', 'av-symbol', 'transport-sign'],
  ['time', 'event', 'warning', 'award-medal'],
  [
    'face-smiling', 'face-affection', 'face-tongue', 'face-hand', 'face-neutral-skeptical',
    'face-sleepy', 'face-unwell', 'face-hat', 'face-glasses', 'face-concerned', 'face-negative',
    'face-costume', 'emotion'
  ],
  ['hand-fingers-open', 'hand-fingers-partial', 'hand-single-finger', 'hand-fingers-closed', 'hands', 'hand-prop', 'body-parts'],
  ['person', 'person-gesture', 'person-role', 'person-fantasy', 'person-activity', 'person-resting'],
  ['animal-mammal', 'animal-amphibian', 'animal-reptile'],
  ['animal-bird', 'animal-marine', 'animal-bug'],
  ['plant-flower', 'plant-other', 'sky & weather', 'place-geographic', 'place-map'],
  ['food-fruit', 'food-vegetable', 'food-prepared', 'food-asian'],
  ['drink', 'food-sweet', 'dishware'],
  ['sport', 'award-medal', 'person-sport'],
  ['game', 'arts & crafts', 'music', 'musical-instrument', 'sound'],
  ['transport-ground', 'transport-water', 'transport-air'],
  ['place-building', 'place-religious', 'place-other', 'hotel'],
  ['household', 'other-object', 'hotel'],
  ['phone', 'computer', 'light & video', 'sound', 'music', 'musical-instrument', 'office', 'mail'],
  ['tool', 'science', 'medical'],
  ['clothing', 'money'],
  ['math', 'alphanum', 'geometric', 'punctuation', 'currency', 'other-symbol', 'zodiac', 'religion']
]

function normalized(sequence) {
  return sequence.trim().split(/\s+/).map(token => token.replace(/^U\+/i, '').toUpperCase().padStart(4, '0')).join(' ')
}

function publicSequence(sequence) {
  return normalized(sequence).split(' ').map(token => `U+${token}`).join(' ')
}

function loadSource(key) {
  const source = PINNED_SOURCES[key]
  const bytes = fs.readFileSync(path.join(SOURCE_DIR, source.fileName))
  assertPinnedHash(bytes, source)
  return bytes
}

function isModifierToken(token) {
  return /^1F3F[B-F]$/.test(token)
}

function tokens(record) {
  return normalized(record.sequence).split(' ')
}

function isRiskSequence(record) {
  const values = tokens(record)
  return values.includes('200D') || values.includes('20E3') || values.some(isModifierToken) ||
    values.some(token => /^1F1(?:E[6-9A-F]|F[0-9A-F])$/.test(token)) ||
    values.some(token => /^E00[2-7][0-9A-F]$/.test(token))
}

const emojiBytes = loadSource('emojiTest')
const variationBytes = loadSource('variationSequences')
const cldrBytes = loadSource('cldr')
const emojiRecords = parseEmojiTest(emojiBytes.toString('utf8')).filter(record => record.qualification === 'fully-qualified')
const variationRecords = parseVariationSequences(variationBytes.toString('utf8'))
const cldr = parseCldrZip(cldrBytes)
const { EMOJI_CATEGORIES } = require(FIRST_BATCH_PATH)
const used = new Set(EMOJI_CATEGORIES.flatMap(category => category.items.map(item => normalized(item.sequence))))
const selected = new Map()

function reserve(categoryId, records) {
  const expected = CATEGORIES.find(category => category.id === categoryId).count
  if (records.length !== expected) throw new Error(`${categoryId} draft quota mismatch: expected ${expected}, got ${records.length}`)
  for (const record of records) {
    const sequence = normalized(record.sequence)
    if (used.has(sequence)) throw new Error(`${categoryId} duplicate or first-batch overlap: ${sequence}`)
    used.add(sequence)
  }
  selected.set(categoryId, records)
}

function takeEmoji(count, predicate, poolName = 'candidate') {
  const rows = []
  for (const record of emojiRecords) {
    if (rows.length === count) break
    if (used.has(normalized(record.sequence)) || !predicate(record)) continue
    rows.push(record)
  }
  if (rows.length !== count) throw new Error(`${poolName} pool exhausted: expected ${count}, got ${rows.length}`)
  return rows
}

const variationByBase = new Map()
for (const record of variationRecords) {
  if (!variationByBase.has(record.baseSequence)) variationByBase.set(record.baseSequence, {})
  variationByBase.get(record.baseSequence)[record.presentation] = record
}
const c21 = []
for (const pair of variationByBase.values()) {
  if (c21.length === 50) break
  if (!pair.text || !pair.emoji) continue
  if (used.has(normalized(pair.text.sequence)) || used.has(normalized(pair.emoji.sequence))) continue
  c21.push(pair.text, pair.emoji)
}
reserve('B02-C21', c21)

reserve('B02-C25', [
  ...takeEmoji(48, record => {
    const values = tokens(record)
    return record.subgroup === 'country-flag' && values.length === 2 && values.every(token => /^1F1(?:E[6-9A-F]|F[0-9A-F])$/.test(token))
  }),
  ...takeEmoji(2, record => record.subgroup === 'subdivision-flag' && tokens(record).some(token => /^E00[2-7][0-9A-F]$/.test(token)))
])
reserve('B02-C22', takeEmoji(50, record => {
  const values = tokens(record)
  return !values.includes('200D') && values.filter(isModifierToken).length === 1
}))
reserve('B02-C23', takeEmoji(50, record => {
  const values = tokens(record)
  return values.includes('200D') && !values.some(isModifierToken) &&
    ['person-role', 'person-activity', 'person-sport', 'person-resting', 'gender'].includes(record.subgroup)
}))
reserve('B02-C24', takeEmoji(50, record => {
  const values = tokens(record)
  return values.includes('200D') && ['family', 'person-symbol'].includes(record.subgroup)
}))

const c26Keycaps = takeEmoji(10, record => tokens(record).includes('20E3'))
const c26Recent = takeEmoji(50 - c26Keycaps.length, record => {
  const values = tokens(record)
  return Number(record.emojiVersion) >= 15 && (values.length >= 2 || values.includes('200D'))
})
reserve('B02-C26', [...c26Keycaps, ...c26Recent])

PRACTICAL_SUBGROUPS.forEach((subgroups, index) => {
  const category = CATEGORIES[index]
  reserve(category.id, takeEmoji(
    category.count,
    record => subgroups.includes(record.subgroup) && !isRiskSequence(record),
    category.id
  ))
})

function fallbackLabel(record) {
  const values = tokens(record)
  const digitNames = new Map([
    ['0030', '数字 0'], ['0031', '数字 1'], ['0032', '数字 2'], ['0033', '数字 3'], ['0034', '数字 4'],
    ['0035', '数字 5'], ['0036', '数字 6'], ['0037', '数字 7'], ['0038', '数字 8'], ['0039', '数字 9']
  ])
  const skinToneNames = new Map([
    ['1F3FB', '较浅肤色'],
    ['1F3FC', '中等-浅肤色'],
    ['1F3FD', '中等肤色'],
    ['1F3FE', '中等-深肤色'],
    ['1F3FF', '较深肤色']
  ])

  if (values.length === 2 && (values[1] === 'FE0E' || values[1] === 'FE0F') && digitNames.has(values[0])) {
    return digitNames.get(values[0])
  }
  if (record.name === 'man detective') return '男侦探'
  if (record.name === 'woman detective') return '女侦探'
  if (values.includes('20E3')) {
    if (values[0] === '002A') return '星号键帽'
    if (digitNames.has(values[0])) return `${digitNames.get(values[0])} 键帽`
  }

  const directionalMatch = record.name.match(/^(woman|man) (walking|kneeling) facing right/)
  if (directionalMatch) {
    const gender = directionalMatch[1] === 'woman' ? '女性' : '男性'
    const action = directionalMatch[2] === 'walking' ? '向右行走' : '向右跪坐'
    const modifier = values.find(isModifierToken)
    return `${action}的${gender}${modifier ? `：${skinToneNames.get(modifier)}` : ''}`
  }

  throw new Error(`missing reviewed Simplified Chinese fallback for ${record.sequence} (${record.name})`)
}

function hasCldrLabel(sequence) {
  const normalizedSequence = normalized(sequence)
  const candidates = [normalizedSequence]
  const values = normalizedSequence.split(' ')
  if (values.at(-1) === 'FE0E' || values.at(-1) === 'FE0F') candidates.push(values.slice(0, -1).join(' '))
  return candidates.some(candidate => cldr.primary.has(candidate) || cldr.derived.has(candidate))
}

const items = CATEGORIES.flatMap(category => selected.get(category.id).map((record, index) => {
  const reviewedFallback = hasCldrLabel(record.sequence) ? '已有 CLDR 中文名' : fallbackLabel(record)
  const resolved = cldr.resolveLabel(record.sequence, reviewedFallback, {
    includePresentationSuffix: category.id === 'B02-C21'
  })
  return {
    id: `${category.id}-${String(index + 1).padStart(3, '0')}`,
    categoryId: category.id,
    order: index + 1,
    glyph: record.glyph,
    sequence: publicSequence(record.sequence),
    label: resolved.label,
    labelSource: resolved.labelSource,
    emojiVersion: record.emojiVersion || record.unicodeVersion
  }
}))

const draft = {
  id: 'B02',
  unicodeEmojiVersion: '17.0',
  cldrVersion: '48.2',
  count: items.length,
  categories: CATEGORIES,
  items
}

fs.writeFileSync(OUTPUT_PATH, `${JSON.stringify(draft, null, 2)}\n`, { flag: 'w' })
console.log(`Non-normative draft written: ${OUTPUT_PATH}`)
console.log(`Categories: ${draft.categories.length}; items: ${draft.items.length}`)

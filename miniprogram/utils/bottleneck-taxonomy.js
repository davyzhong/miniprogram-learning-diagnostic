const FALLBACK_NAME = '待确认卡点'

const CATEGORY_NAMES = {
  'LP-OP': '运算顺序',
  'LP-FD': '分数小数',
  'LP-RP': '比例比值',
  'LP-PT': '百分比',
  'LP-UN': '单位量纲',
  'LP-GEO': '空间几何',
  'LP-MOD': '应用建模',
  'LP-PRE': '验算习惯',
  'LP-LANG': '数学语言',
  'LP-AXIS': '数轴代数'
}

const MATH_BOTTLENECKS = [
  {
    code: 'LP-001',
    subject: 'math',
    name: '计算错误（加减乘除）',
    shortName: '计算基础',
    category: '计算与运算',
    parentDescription: '加减乘除、竖式、进位退位或口算过程里容易出现不稳定错误。',
    validationStyle: '计算过程验证题',
    aliases: ['计算错误', '计算错误（加减乘除）', '草稿纸计算错误']
  },
  {
    code: 'LP-002',
    subject: 'math',
    name: '分数运算错误',
    shortName: '分数运算',
    category: '分数小数',
    parentDescription: '分数意义、通分、约分或分数四则运算还需要进一步确认。',
    validationStyle: '分数运算验证题',
    aliases: ['分数运算错误', '分数理解', '分数计算']
  },
  {
    code: 'LP-003',
    subject: 'math',
    name: '百分数/小数转换错误',
    shortName: '小数百分数',
    category: '分数小数',
    parentDescription: '小数、分数和百分数之间的转换关系还不够稳定。',
    validationStyle: '小数百分数互化题',
    aliases: ['百分数/小数转换错误', '小数百分数', '百分数', '小数分数']
  },
  {
    code: 'LP-004',
    subject: 'math',
    name: '单位换算错误',
    shortName: '单位换算',
    category: '单位量纲',
    parentDescription: '单位进率、数量单位和题目语境之间的对应关系需要复核。',
    validationStyle: '单位换算验证题',
    aliases: ['单位换算错误', '单位转换', '单位量纲']
  },
  {
    code: 'LP-005',
    subject: 'math',
    name: '应用题建模失败',
    shortName: '应用建模',
    category: '应用建模',
    parentDescription: '从文字题里抽取数量关系、列式或建立模型时容易卡住。',
    validationStyle: '应用题建模验证题',
    aliases: ['应用题建模失败', '应用题建模', '应用建模', '数量关系']
  },
  {
    code: 'LP-006',
    subject: 'math',
    name: '几何概念混淆',
    shortName: '几何概念',
    category: '空间几何',
    parentDescription: '图形性质、面积体积或空间关系的概念可能还不够清楚。',
    validationStyle: '图形概念验证题',
    aliases: ['几何概念混淆', '几何概念', '空间几何']
  },
  {
    code: 'LP-007',
    subject: 'math',
    name: '符号错误',
    shortName: '符号理解',
    category: '数学语言',
    parentDescription: '数学符号、括号、等号或表达式含义理解需要继续观察。',
    validationStyle: '数学符号理解题',
    aliases: ['符号错误', '符号理解', '数学符号']
  },
  {
    code: 'LP-008',
    subject: 'math',
    name: '审题错误',
    shortName: '审题理解',
    category: '数学语言',
    parentDescription: '读题、找条件和判断问题目标时容易漏信息。',
    validationStyle: '审题理解验证题',
    aliases: ['审题错误', '审题理解', '阅读漏条件']
  },
  {
    code: 'LP-009',
    subject: 'math',
    name: '书写不规范',
    shortName: '书写规范',
    category: '验算习惯',
    parentDescription: '书写、排版或步骤表达影响了计算和检查的稳定性。',
    validationStyle: '规范书写观察题',
    aliases: ['书写不规范', '书写规范', '步骤书写']
  },
  {
    code: 'LP-010',
    subject: 'math',
    name: '抄写检查错误',
    shortName: '抄写检查',
    category: '验算习惯',
    parentDescription: '抄数字、抄符号或最后检查环节还不够稳定。',
    validationStyle: '抄写检查验证题',
    aliases: ['抄写错误', '抄写检查', '草稿纸计算错误']
  }
]

const OTHER_BOTTLENECKS = [
  { code: 'LP-101', subject: 'chinese', name: '识字词语', shortName: '识字词语', category: '语文基础', parentDescription: '字词积累和基础运用需要观察。', validationStyle: '字词基础题', aliases: ['识字词语'] },
  { code: 'LP-102', subject: 'chinese', name: '阅读理解', shortName: '阅读理解', category: '语文阅读', parentDescription: '阅读信息提取和理解表达需要观察。', validationStyle: '阅读理解题', aliases: ['阅读理解偏差', '阅读理解'] },
  { code: 'LP-103', subject: 'chinese', name: '作文结构', shortName: '作文结构', category: '语文表达', parentDescription: '作文结构和表达组织需要观察。', validationStyle: '写作结构题', aliases: ['作文结构'] },
  { code: 'LP-104', subject: 'chinese', name: '拼音笔顺', shortName: '拼音笔顺', category: '语文基础', parentDescription: '拼音、笔顺和基础书写需要观察。', validationStyle: '拼音笔顺题', aliases: ['拼音笔顺'] },
  { code: 'LP-201', subject: 'english', name: '英语词汇', shortName: '英语词汇', category: '英语基础', parentDescription: '单词识记和词义使用需要观察。', validationStyle: '词汇识别题', aliases: ['英语词汇'] },
  { code: 'LP-202', subject: 'english', name: '英语语法', shortName: '英语语法', category: '英语语法', parentDescription: '句法结构和语法规则需要观察。', validationStyle: '语法选择题', aliases: ['英语语法'] },
  { code: 'LP-203', subject: 'english', name: '英文阅读', shortName: '英文阅读', category: '英语阅读', parentDescription: '英文阅读理解和信息提取需要观察。', validationStyle: '英文阅读题', aliases: ['英文阅读'] },
  { code: 'LP-204', subject: 'english', name: '英文表达', shortName: '英文表达', category: '英语表达', parentDescription: '英文句子表达和组织需要观察。', validationStyle: '英文表达题', aliases: ['英文表达', '写作表达不流畅'] }
]

const ALL_BOTTLENECKS = [...MATH_BOTTLENECKS, ...OTHER_BOTTLENECKS]
const BOTTLENECK_TAXONOMY = ALL_BOTTLENECKS.reduce((acc, item) => {
  acc[item.code] = Object.freeze({ ...item, aliases: [...item.aliases] })
  return acc
}, {})
const MATH_BOTTLENECK_CODES = MATH_BOTTLENECKS.map(item => item.code)

function bottleneckCodeNameMap() {
  return ALL_BOTTLENECKS.reduce((acc, item) => {
    acc[item.code] = item.shortName
    return acc
  }, {})
}

function bottleneckAliasMap() {
  return ALL_BOTTLENECKS.reduce((acc, item) => {
    ;(item.aliases || []).forEach(alias => {
      acc[alias] = item.shortName
    })
    acc[item.name] = item.shortName
    acc[item.shortName] = item.shortName
    return acc
  }, {})
}

function getBottleneckMeta(itemOrCode) {
  const code = typeof itemOrCode === 'object' && itemOrCode !== null
    ? (itemOrCode.lpCode || itemOrCode.code || itemOrCode.id || '')
    : String(itemOrCode || '')
  return BOTTLENECK_TAXONOMY[code] || null
}

function canonicalBottleneckName(itemOrCode, name) {
  const item = typeof itemOrCode === 'object' && itemOrCode !== null
    ? itemOrCode
    : { lpCode: itemOrCode, lpName: name }
  const alias = bottleneckAliasMap()
  const explicit = item.summary || item.name || item.title || item.displayName || item.label || item.lpName || ''
  if (alias[explicit]) return alias[explicit]
  const meta = getBottleneckMeta(item)
  return meta ? meta.shortName : FALLBACK_NAME
}

module.exports = {
  FALLBACK_NAME,
  CATEGORY_NAMES,
  MATH_BOTTLENECKS,
  MATH_BOTTLENECK_CODES,
  BOTTLENECK_TAXONOMY,
  bottleneckCodeNameMap,
  bottleneckAliasMap,
  getBottleneckMeta,
  canonicalBottleneckName
}

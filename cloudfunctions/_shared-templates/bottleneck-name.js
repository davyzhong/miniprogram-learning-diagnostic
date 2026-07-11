const FALLBACK_NAME = '待确认卡点';

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
  'LP-AXIS': '数轴代数',
};

const BOTTLENECK_CODE_NAMES = {
  'LP-001': '计算基础',
  'LP-002': '分数运算',
  'LP-003': '小数百分数',
  'LP-004': '单位换算',
  'LP-005': '应用建模',
  'LP-006': '几何概念',
  'LP-007': '符号理解',
  'LP-008': '审题理解',
  'LP-009': '书写规范',
  'LP-010': '抄写检查',
  'LP-101': '识字词语',
  'LP-102': '阅读理解',
  'LP-103': '作文结构',
  'LP-104': '拼音笔顺',
  'LP-201': '英语词汇',
  'LP-202': '英语语法',
  'LP-203': '英文阅读',
  'LP-204': '英文表达',
};

const BOTTLENECK_NAME_ALIASES = {
  '计算错误': '计算基础',
  '计算错误（加减乘除）': '计算基础',
  '分数运算错误': '分数运算',
  '百分数/小数转换错误': '小数百分数',
  '单位换算错误': '单位换算',
  '应用题建模失败': '应用建模',
  '几何概念混淆': '几何概念',
  '符号错误': '符号理解',
  '审题错误': '审题理解',
  '书写不规范': '书写规范',
  '草稿纸计算错误': '抄写检查',
  '阅读理解偏差': '阅读理解',
  '写作表达不流畅': '英文表达',
};

function getCategoryName(code) {
  if (!code) return '未知';
  const prefix = code.split('-').slice(0, 2).join('-');
  return CATEGORY_NAMES[prefix] || code;
}

function cleanBottleneckName(name) {
  const text = String(name || '').trim();
  if (!text || /^LP-[A-Z0-9-]+$/.test(text)) return '';
  if (BOTTLENECK_NAME_ALIASES[text]) return BOTTLENECK_NAME_ALIASES[text];

  const withoutBracket = text.replace(/[（(].*?[）)]/g, '');
  if (BOTTLENECK_NAME_ALIASES[withoutBracket]) return BOTTLENECK_NAME_ALIASES[withoutBracket];

  return withoutBracket
    .replace(/错误$/g, '')
    .replace(/失败$/g, '')
    .replace(/混淆$/g, '')
    .replace(/不足$/g, '')
    .replace(/偏差$/g, '')
    .trim() || '';
}

function formatBottleneckDisplayName(itemOrCode, name) {
  const item = typeof itemOrCode === 'object' && itemOrCode !== null
    ? itemOrCode
    : { lpCode: itemOrCode, lpName: name };
  const categoryName = getCategoryName(item.lpCode);

  return cleanBottleneckName(item.summary)
    || cleanBottleneckName(item.name)
    || cleanBottleneckName(item.title)
    || cleanBottleneckName(item.displayName)
    || cleanBottleneckName(item.label)
    || BOTTLENECK_CODE_NAMES[item.lpCode]
    || cleanBottleneckName(item.lpName)
    || (/^LP-[A-Z0-9-]+$/.test(categoryName) ? '' : categoryName)
    || FALLBACK_NAME;
}

function formatBottleneckDisplayList(items = []) {
  return items
    .map(item => formatBottleneckDisplayName(item))
    .filter(Boolean)
    .join('、');
}

function summarizeBottleneckName(value) {
  let text = String(value || '')
    .replace(/LP-[A-Z0-9-]+/g, '')
    .replace(/[（(][^（）()]*[）)]/g, '')
    .replace(/\s+/g, '')
    .replace(/[，,。；;：:、]+$/g, '')
    .trim();

  if (!text) return FALLBACK_NAME;

  for (const suffix of ['错误', '失败', '混淆', '不足']) {
    if (text.endsWith(suffix) && text.length > 4) {
      const base = text.slice(0, -suffix.length);
      if (base.length >= 4) text = base;
      break;
    }
  }

  // 双栏宽度约 253pt，20 个中文字符约 240pt，完整展示不截断
  return text.length > 20 ? `${text.slice(0, 20)}…` : text;
}

function uniqueBottleneckSummaries(items = []) {
  const names = [];
  const seen = new Set();
  for (const item of items) {
    const name = summarizeBottleneckName(
      typeof item === 'string'
        ? item
        : item && (item.summary || item.name || item.title || item.displayName || item.label || item.lpName)
    );
    if (seen.has(name)) continue;
    seen.add(name);
    names.push(name);
  }
  return names;
}

module.exports = {
  FALLBACK_NAME,
  CATEGORY_NAMES,
  BOTTLENECK_CODE_NAMES,
  BOTTLENECK_NAME_ALIASES,
  getCategoryName,
  cleanBottleneckName,
  formatBottleneckDisplayName,
  formatBottleneckDisplayList,
  summarizeBottleneckName,
  uniqueBottleneckSummaries,
};

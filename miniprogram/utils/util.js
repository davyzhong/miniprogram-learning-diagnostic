// utils/util.js - 工具函数

/**
 * 格式化日期
 */
function formatDate(date) {
  if (typeof date === 'string') date = new Date(date)
  const y = date.getFullYear()
  const m = String(date.getMonth() + 1).padStart(2, '0')
  const d = String(date.getDate()).padStart(2, '0')
  return `${y}-${m}-${d}`
}

/**
 * 格式化日期时间
 */
function formatDateTime(date) {
  if (typeof date === 'string') date = new Date(date)
  const d = formatDate(date)
  const h = String(date.getHours()).padStart(2, '0')
  const min = String(date.getMinutes()).padStart(2, '0')
  return `${d} ${h}:${min}`
}

function formatRelativeTime(date, now = new Date()) {
  if (!date) return ''
  const value = new Date(date)
  const diff = (new Date(now) - value) / 1000

  if (diff < 60) return '刚刚'
  if (diff < 3600) return `${Math.floor(diff / 60)}分钟前`
  if (diff < 86400) return `${Math.floor(diff / 3600)}小时前`
  if (diff < 172800) return '昨天'
  return `${value.getMonth() + 1}月${value.getDate()}日`
}

function formatChineseDateTime(date) {
  if (!date) return ''
  const value = new Date(date)
  const minutes = String(value.getMinutes()).padStart(2, '0')
  return `${value.getFullYear()}年${value.getMonth() + 1}月${value.getDate()}日 ${value.getHours()}:${minutes}`
}

/**
 * 严重程度对应的样式类
 */
function severityBadgeClass(severity) {
  const map = { '高': 'badge-high', '中高': 'badge-high', '中': 'badge-mid', '低': 'badge-low' }
  return map[severity] || 'badge-mid'
}

/**
 * 卡点类别中文名称映射
 */
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
  'LP-204': '英文表达'
}

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
  '写作表达不流畅': '英文表达'
}

/**
 * 获取类别中文名
 */
function getCategoryName(code) {
  if (!code) return '未知'
  // 取前缀 LP-XXX
  const prefix = code.split('-').slice(0, 2).join('-')
  return CATEGORY_NAMES[prefix] || code
}

function cleanBottleneckName(name) {
  const text = String(name || '').trim()
  if (!text || /^LP-[A-Z0-9-]+$/.test(text)) return ''
  if (BOTTLENECK_NAME_ALIASES[text]) return BOTTLENECK_NAME_ALIASES[text]

  const withoutBracket = text.replace(/[（(].*?[）)]/g, '')
  if (BOTTLENECK_NAME_ALIASES[withoutBracket]) return BOTTLENECK_NAME_ALIASES[withoutBracket]

  return withoutBracket
    .replace(/错误$/g, '')
    .replace(/失败$/g, '')
    .replace(/混淆$/g, '')
    .replace(/不足$/g, '')
    .replace(/偏差$/g, '')
    .trim() || ''
}

function formatBottleneckDisplayName(itemOrCode, name) {
  const item = typeof itemOrCode === 'object' && itemOrCode !== null
    ? itemOrCode
    : { lpCode: itemOrCode, lpName: name }
  const categoryName = getCategoryName(item.lpCode)

  return cleanBottleneckName(item.displayName)
    || cleanBottleneckName(item.lpName)
    || BOTTLENECK_CODE_NAMES[item.lpCode]
    || (/^LP-[A-Z0-9-]+$/.test(categoryName) ? '' : categoryName)
    || '待确认卡点'
}

function formatBottleneckDisplayList(items = []) {
  return items
    .map(item => formatBottleneckDisplayName(item))
    .filter(Boolean)
    .join('、')
}

/**
 * 趋势图标
 */
function trendIcon(trend) {
  const map = { 'up': '↑', 'stable': '→', 'down': '↓', 'new': '★' }
  return map[trend] || '→'
}

/**
 * 显示加载提示
 */
function showLoading(title = '加载中...') {
  wx.showLoading({ title, mask: true })
}

/**
 * 隐藏加载提示
 */
function hideLoading() {
  wx.hideLoading()
}

/**
 * 显示成功提示
 */
function showSuccess(title = '操作成功') {
  wx.showToast({ title, icon: 'success', duration: 1500 })
}

/**
 * 显示错误提示
 */
function showError(title = '操作失败') {
  wx.showToast({ title, icon: 'error', duration: 2000 })
}

module.exports = {
  formatDate,
  formatDateTime,
  formatRelativeTime,
  formatChineseDateTime,
  severityBadgeClass,
  formatBottleneckDisplayName,
  formatBottleneckDisplayList,
  getCategoryName,
  trendIcon,
  showLoading,
  hideLoading,
  showSuccess,
  showError,
  CATEGORY_NAMES,
  BOTTLENECK_CODE_NAMES
}

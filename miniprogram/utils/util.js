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

/**
 * 获取类别中文名
 */
function getCategoryName(code) {
  if (!code) return '未知'
  // 取前缀 LP-XXX
  const prefix = code.split('-').slice(0, 2).join('-')
  return CATEGORY_NAMES[prefix] || code
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
  severityBadgeClass,
  getCategoryName,
  trendIcon,
  showLoading,
  hideLoading,
  showSuccess,
  showError,
  CATEGORY_NAMES
}

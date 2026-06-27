// utils/util.js - 工具函数
const {
  CATEGORY_NAMES,
  BOTTLENECK_CODE_NAMES,
  formatBottleneckDisplayName,
  formatBottleneckDisplayList,
  getCategoryName
} = require('./bottleneck-name')

// 北京时间（UTC+8）日期组件提取。
// 纯数学计算 UTC+8 偏移，不依赖 Intl API（微信 iOS/Mac 运行时不支持 Intl）。
const BEIJING_OFFSET_MS = 8 * 60 * 60 * 1000
const beijingParts = (date) => {
  const value = typeof date === 'string' ? new Date(date) : date
  if (!value || Number.isNaN(value.getTime())) return null
  // 加 8 小时偏移后用 getUTC* 取分量，等价于北京时区的本地时间
  const shifted = new Date(value.getTime() + BEIJING_OFFSET_MS)
  return {
    year: shifted.getUTCFullYear(),
    month: shifted.getUTCMonth() + 1,
    day: shifted.getUTCDate(),
    hour: shifted.getUTCHours(),
    minute: shifted.getUTCMinutes()
  }
}

/**
 * 格式化日期
 */
function formatDate(date) {
  const p = beijingParts(date)
  if (!p) return ''
  const m = String(p.month).padStart(2, '0')
  const d = String(p.day).padStart(2, '0')
  return `${p.year}-${m}-${d}`
}

/**
 * 格式化日期时间
 */
function formatDateTime(date) {
  const p = beijingParts(date)
  if (!p) return ''
  const d = `${p.year}-${String(p.month).padStart(2, '0')}-${String(p.day).padStart(2, '0')}`
  const h = String(p.hour).padStart(2, '0')
  const min = String(p.minute).padStart(2, '0')
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
  const p = beijingParts(value) || {}
  return `${p.month || ''}月${p.day || ''}日`
}

function formatChineseDateTime(date) {
  if (!date) return ''
  const p = beijingParts(date)
  if (!p) return ''
  const minutes = String(p.minute).padStart(2, '0')
  return `${p.year}年${p.month}月${p.day}日 ${p.hour}:${minutes}`
}

// 时分（HH:MM，时补零），用于时间行。统一基于 beijingParts，避免 local 时区。
function formatClock(date) {
  const p = beijingParts(date)
  if (!p) return ''
  const h = String(p.hour).padStart(2, '0')
  const min = String(p.minute).padStart(2, '0')
  return `${h}:${min}`
}

// 月日（M月D日，不补零），用于天分组标签、日期 chip。
function formatMonthDay(date) {
  const p = beijingParts(date)
  if (!p) return ''
  return `${p.month}月${p.day}日`
}

/**
 * 严重程度对应的样式类
 */
function severityBadgeClass(severity) {
  const map = { '高': 'badge-high', '中高': 'badge-high', '中': 'badge-mid', '低': 'badge-low' }
  return map[severity] || 'badge-mid'
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
  beijingParts,
  formatDate,
  formatDateTime,
  formatClock,
  formatMonthDay,
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

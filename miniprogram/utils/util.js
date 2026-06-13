// utils/util.js - 工具函数
const {
  CATEGORY_NAMES,
  BOTTLENECK_CODE_NAMES,
  formatBottleneckDisplayName,
  formatBottleneckDisplayList,
  getCategoryName
} = require('./bottleneck-name')

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

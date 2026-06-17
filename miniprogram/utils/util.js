// utils/util.js - 工具函数
const {
  CATEGORY_NAMES,
  BOTTLENECK_CODE_NAMES,
  formatBottleneckDisplayName,
  formatBottleneckDisplayList,
  getCategoryName
} = require('./bottleneck-name')

// 北京时间（UTC+8）日期组件提取。
// 使用 Intl API 按固定时区解析，避免依赖运行环境的系统时区（小程序、CI、本地均可获得一致结果）。
const BEIJING_TZ = 'Asia/Shanghai'
const beijingParts = (date) => {
  const value = typeof date === 'string' ? new Date(date) : date
  if (!value || Number.isNaN(value.getTime())) return null
  const formatted = new Intl.DateTimeFormat('en-US', {
    timeZone: BEIJING_TZ,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false
  }).formatToParts(value)
  const map = {}
  for (const part of formatted) {
    if (part.type !== 'literal') map[part.type] = part.value
  }
  // hour12: false 下 "24" 会被部分运行时返回，归一为 "00"
  if (map.hour === '24') map.hour = '00'
  return {
    year: Number(map.year),
    month: Number(map.month),
    day: Number(map.day),
    hour: Number(map.hour),
    minute: Number(map.minute)
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

const cloud = require('../../utils/cloud')
const { beijingParts } = require('../../utils/util')
const { compactReadableTargets, readableNameOf, sanitizeUserText } = require('../../utils/user-facing-text')
const { normalizeStatus, STATUS_META } = require('../../utils/bottleneck-view')
const { symbolOf } = require('../../utils/ui-symbols')

function formatDate(iso) {
  const p = beijingParts(iso)
  if (!p) return ''
  return `${p.month}月${p.day}日`
}

// 状态文案/样式统一引用 STATUS_META（bottleneck-view 单一来源）
function buildStatusIcon(status) {
  const meta = STATUS_META[normalizeStatus({ status })] || STATUS_META.needs_verification
  return meta.icon
}

function buildStatusClass(status) {
  const meta = STATUS_META[normalizeStatus({ status })] || STATUS_META.needs_verification
  return meta.className
}

// 热力格短标记：颜色块内保留可读的单字文字标记（无障碍/缺色兜底）
const STATUS_MARKERS = { pending: '待', persisting: '持', improved: '改', none: '·' }

function buildStatusMarker(statusClass) {
  return STATUS_MARKERS[statusClass] || STATUS_MARKERS.none
}

// 页头改善率：已改善 / (已改善 + 待验证 + 仍需练习)，无卡点时为空串
function buildImprovementRate(summary = {}) {
  const improved = Math.max(0, Number(summary.improvedCount) || 0)
  const pending = Math.max(0, Number(summary.pendingCount) || 0)
  const persisting = Math.max(0, Number(summary.persistingCount) || 0)
  const total = improved + pending + persisting
  if (total <= 0) return ''
  return `${Math.round((improved / total) * 100)}%`
}

Page({
  data: {
    timeline: [],
    bottleneckMatrix: [],
    summary: { totalRounds: 0, diagnosisCount: 0, verificationCount: 0, improvedCount: 0, persistingCount: 0, pendingCount: 0 },
    improvementRateText: '',
    overallAdvice: '',
    loading: true,
    errorText: '',
    headerSymbol: symbolOf('trendUp'),
    adviceSymbol: symbolOf('tip'),
    timelineSymbol: symbolOf('calendar'),
    matrixSymbol: symbolOf('report'),
  },

  onLoad(options) {
    const { studentId, subject } = options
    if (!studentId || !subject) {
      wx.showToast({ title: '参数缺失', icon: 'none' })
      return
    }
    this.studentId = studentId
    this.subject = subject
    this.loadData()
  },

  async loadData() {
    wx.showLoading({ title: '加载中…' })
    this.setData({ loading: true, errorText: '' })
    try {
      const res = await cloud.getLearningProgress(this.studentId, this.subject)
      // cloud 封装在 success === false 时已 throw，这里直接取数据
      const data = res.data || res
      const timeline = (data.timeline || []).map(t => ({
        ...t,
        dateText: formatDate(t.createdAt),
        summary: sanitizeUserText(t.summary || '', { treatAsId: true }),
        improvedBottlenecksText: compactReadableTargets(t.improvedBottlenecks || []),
        shortLabel: t.isVerification ? '验证' : '诊断',
        typeSymbol: symbolOf(t.isVerification ? 'complete' : 'report'),
      }))

      // 构建卡点矩阵：每个卡点在每个轮次的状态
      const reportIds = timeline.map(t => t.reportId)
      const matrix = (data.bottleneckMatrix || []).map(bn => {
        const statusByRound = []
        const statusIcons = []
        const statusMarkers = []
        for (const rid of reportIds) {
          const entry = bn.statuses.find(s => s.reportId === rid)
          if (entry) {
            const statusClass = buildStatusClass(entry.status)
            statusByRound.push(statusClass)
            statusIcons.push(buildStatusIcon(entry.status))
            statusMarkers.push(buildStatusMarker(statusClass))
          } else {
            statusByRound.push('none')
            statusIcons.push('')
            statusMarkers.push(buildStatusMarker('none'))
          }
        }
        return {
          ...bn,
          lpName: readableNameOf(bn) || '待确认学习卡点',
          statusByRound,
          statusIcons,
          statusMarkers
        }
      })

      this.setData({
        timeline,
        bottleneckMatrix: matrix,
        summary: data.summary || {},
        improvementRateText: buildImprovementRate(data.summary || {}),
        overallAdvice: sanitizeUserText(data.overallAdvice || '', { treatAsId: true }),
        loading: false,
      })
    } catch (e) {
      this.setData({ loading: false, errorText: '加载失败，请稍后重试' })
      wx.showToast({ title: '加载失败，请稍后重试', icon: 'none' })
    } finally {
      wx.hideLoading()
    }
  },

  onViewReport(e) {
    const reportId = e.currentTarget.dataset.reportId
    if (!reportId) return
    wx.navigateTo({ url: `/pages/report/report?id=${reportId}` })
  },
})

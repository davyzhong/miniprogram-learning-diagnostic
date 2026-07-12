const cloud = require('../../utils/cloud')
const { beijingParts } = require('../../utils/util')

function formatDate(iso) {
  const p = beijingParts(iso)
  if (!p) return ''
  return `${p.month}月${p.day}日`
}

function buildStatusIcon(status) {
  if (status === 'improved') return '✓'
  if (status === 'persisting' || status === 'worsened') return '!'
  if (status === 'needs_verification' || status === 'found') return '?'
  return '·'
}

function buildStatusClass(status) {
  if (status === 'improved') return 'improved'
  if (status === 'persisting' || status === 'worsened') return 'persisting'
  if (status === 'needs_verification' || status === 'found') return 'pending'
  return 'none'
}

Page({
  data: {
    timeline: [],
    bottleneckMatrix: [],
    summary: { totalRounds: 0, diagnosisCount: 0, verificationCount: 0, improvedCount: 0, persistingCount: 0, pendingCount: 0 },
    overallAdvice: '',
    loading: true,
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
    try {
      const res = await cloud.getLearningProgress(this.studentId, this.subject)
      if (!res.success) {
        wx.showToast({ title: res.error || '加载失败', icon: 'none' })
        return
      }
      const data = res.data || res
      const timeline = (data.timeline || []).map(t => ({
        ...t,
        dateText: formatDate(t.createdAt),
        improvedBottlenecksText: (t.improvedBottlenecks || []).join('、'),
        shortLabel: t.isVerification ? '验证' : '诊断',
      }))

      // 构建卡点矩阵：每个卡点在每个轮次的状态
      const reportIds = timeline.map(t => t.reportId)
      const matrix = (data.bottleneckMatrix || []).map(bn => {
        const statusByRound = []
        const statusIcons = []
        for (const rid of reportIds) {
          const entry = bn.statuses.find(s => s.reportId === rid)
          if (entry) {
            statusByRound.push(buildStatusClass(entry.status))
            statusIcons.push(buildStatusIcon(entry.status))
          } else {
            statusByRound.push('none')
            statusIcons.push('')
          }
        }
        return { ...bn, statusByRound, statusIcons }
      })

      this.setData({
        timeline,
        bottleneckMatrix: matrix,
        summary: data.summary || {},
        overallAdvice: data.overallAdvice || '',
        loading: false,
      })
    } catch (e) {
      wx.showToast({ title: '加载失败', icon: 'none' })
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

const cloud = require('../../utils/cloud')
const { symbolOf } = require('../../utils/ui-symbols')

Page({
  data: {
    reviewSymbol: symbolOf('writing'), studentId: '', studentName: '', item: null, loading: true },
  onLoad(options = {}) {
    this.loadDetail(options).catch(() => this.setData({ loading: false }))
  },
  async loadDetail(options = {}) {
    const studentId = options.studentId || ''
    const reviewItemId = options.reviewItemId || ''
    this.setData({ studentId, studentName: decodeURIComponent(options.studentName || '') })
    try {
      const profile = await cloud.getSubjectProfile(studentId, 'chinese') || {}
      const raw = (profile.chineseReviewItems || []).find(item => (item.itemId || item.id) === reviewItemId)
      if (raw) {
        const pass = Number(raw.reviewPassCount) || 0
        const stage = raw.status === 'recurring' || Number(raw.reviewFailCount) > 0 ? '原项复测' : (pass >= 2 ? '迁移观察' : (pass >= 1 ? '巩固复测' : '原项复测'))
        this.setData({ item: {
          title: raw.targetText || raw.expectedAnswer || '待复测错项',
          wrong: raw.lastWrongAnswer || raw.studentAnswer || '未记录',
          mistake: raw.mistakeType || '需要再确认',
          context: raw.sourceContext || '本次没有保留原题语境',
          suggestion: raw.suggestion || '先按提示区分，再完成原项复测。',
          stage,
          reviewItemId
        } })
      }
    } finally { this.setData({ loading: false }) }
  },
  onStartTap() {
    const item = this.data.item || {}
    wx.navigateTo({ url: `/pages/generate-verification/generate-verification?studentId=${this.data.studentId}&subject=chinese&subjectName=${encodeURIComponent('语文')}&targetCode=${encodeURIComponent(item.reviewItemId || '')}` })
  }
})

const cloud = require('../../utils/cloud')
const { buildKnowledgeMapPageView } = require('./knowledge-map-presenter')

Page({
  data: {
    loading: true,
    studentId: '',
    studentName: '',
    subject: 'math',
    view: null,
    errorText: '',
  },

  async onLoad(options = {}) {
    const studentId = options.studentId || ''
    const studentName = decodeURIComponent(options.studentName || '')
    const subject = options.subject || 'math'
    this.setData({ studentId, studentName, subject })
    await this.loadData()
  },

  async loadData() {
    if (!this.data.studentId) {
      this.setData({ loading: false, errorText: '缺少孩子档案信息' })
      return
    }
    this.setData({ loading: true })
    try {
      const profile = await cloud.getSubjectProfile(this.data.studentId, this.data.subject)
      const view = buildKnowledgeMapPageView(profile || {}, this.data.subject)
      this.setData({ loading: false, view })
    } catch (err) {
      this.setData({ loading: false, errorText: err.message || '加载失败' })
    }
  },

  onDomainTap(e) {
    const { domain } = e.currentTarget.dataset
    // 展开/收起领域内的卡点列表
    const view = this.data.view
    if (!view) return
    const domains = view.domains.map(d => ({
      ...d,
      expanded: d.key === domain ? !d.expanded : false,
    }))
    this.setData({ 'view.domains': domains })
  },

  onBottleneckTap(e) {
    const { lpCode, lpName } = e.currentTarget.dataset
    if (!lpCode) return
    // 直跳 learning-resource
    wx.navigateTo({
      url: `/pages/bottleneck-detail/bottleneck-detail?studentId=${this.data.studentId}&studentName=${encodeURIComponent(this.data.studentName)}&subject=${this.data.subject}&subjectName=${encodeURIComponent(this.data.subjectName || '数学')}&lpCode=${lpCode}`,
    })
  },
})

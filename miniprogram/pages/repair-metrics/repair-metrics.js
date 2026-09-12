const cloud = require('../../utils/cloud')
const { buildRepairMetricsPageView } = require('./repair-metrics-presenter')

Page({
  data: {
    loading: true,
    studentId: '',
    studentName: '',
    view: null,
    errorText: ''
  },

  onLoad(options = {}) {
    const studentId = options.studentId || ''
    const studentName = decodeURIComponent(options.studentName || '')
    this.setData({ studentId, studentName })
    this._loadPromise = this.loadData().catch(error => {
      console.error('加载修复指标失败', error)
    })
  },

  async loadData() {
    if (!this.data.studentId) {
      this.setData({ loading: false, errorText: '缺少孩子档案信息' })
      return
    }
    this.setData({ loading: true })
    try {
      const result = await cloud.getRepairMetrics(this.data.studentId)
      const view = buildRepairMetricsPageView(result)
      this.setData({ loading: false, view, errorText: '' })
    } catch (err) {
      console.error('修复指标加载失败', err)
      this.setData({ loading: false, view: null, errorText: '指标加载失败，请稍后重试' })
    }
  },

  onRetryTap() {
    this._loadPromise = this.loadData().catch(error => {
      console.error('加载修复指标失败', error)
    })
  }
})

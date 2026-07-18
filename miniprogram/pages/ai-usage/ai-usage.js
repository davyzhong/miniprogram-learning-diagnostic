// AI 用量与成本估算账单页
const cloud = require('../../utils/cloud')
const {
  buildUsageState,
  currentMonth,
  shiftMonth,
  GLOBAL_EMPTY_STATE
} = require('./ai-usage-presenter')

Page({
  data: {
    loading: true,
    activeMonth: '',
    activeFilter: '',
    monthLabel: '',
    summaryText: '',
    breakdown: [],
    breakdownVisible: false,
    days: [],
    hasEvents: false,
    filters: [],
    emptyTitle: GLOBAL_EMPTY_STATE.emptyTitle,
    emptyDesc: GLOBAL_EMPTY_STATE.emptyDesc,
    estimateNotice: '当前为内测成本估算，不代表应付款项。',
    deletionSubmitting: false,
    deletionSubmitted: false
  },

  onLoad(options = {}) {
    const activeMonth = options.month || currentMonth()
    this.setData({ activeMonth })
    wx.setNavigationBarTitle({ title: 'AI 用量与成本估算' })
    this.loadUsage()
  },

  async loadUsage() {
    this.setData({ loading: true })
    try {
      const [summaryRes, eventsRes] = await Promise.all([
        cloud.getAiUsageSummary({ month: this.data.activeMonth }).catch(() => null),
        cloud.getAiUsageEvents({ month: this.data.activeMonth }).catch(() => ({ items: [] }))
      ])
      const summary = summaryRes && summaryRes.success ? summaryRes : null
      const events = (eventsRes && eventsRes.items) || []
      this._lastEvents = events
      this._lastSummary = summary
      this.setData({
        ...buildUsageState(events, summary, this.data.activeMonth, this.data.activeFilter),
        loading: false
      })
    } catch (err) {
      console.error('加载 AI 用量失败', err)
      this.setData({
        ...buildUsageState([], null, this.data.activeMonth, this.data.activeFilter),
        loading: false
      })
      wx.showToast({ title: '用量加载失败', icon: 'none' })
    }
  },

  onPrevMonth() {
    this.setData({ activeMonth: shiftMonth(this.data.activeMonth, -1) })
    this.loadUsage()
  },

  onNextMonth() {
    this.setData({ activeMonth: shiftMonth(this.data.activeMonth, 1) })
    this.loadUsage()
  },

  onFilterTap(e) {
    const activeFilter = (e.currentTarget && e.currentTarget.dataset && e.currentTarget.dataset.key) || ''
    this.setData({
      activeFilter,
      ...buildUsageState(this._lastEvents || [], this._lastSummary || null, this.data.activeMonth, activeFilter)
    })
  },

  async onDeletionRequest() {
    if (this.data.deletionSubmitting || this.data.deletionSubmitted) return
    const confirmed = await new Promise(resolve => {
      wx.showModal({
        title: '申请删除数据',
        content: '将向维护者发起数据删除请求。内测期间由维护者确认后处理，处理完成前数据仍保留。',
        confirmText: '提交申请',
        cancelText: '取消',
        success: res => resolve(res.confirm)
      })
    })
    if (!confirmed) return
    this.setData({ deletionSubmitting: true })
    try {
      const res = await cloud.createDeletionRequest({ scope: 'usage_only', reason: '用户主动申请' })
      if (res && res.success) {
        this.setData({ deletionSubmitting: false, deletionSubmitted: true })
        wx.showToast({ title: '已提交删除申请', icon: 'success' })
      } else {
        throw new Error((res && res.error) || '提交失败')
      }
    } catch (err) {
      console.error('提交删除申请失败', err)
      this.setData({ deletionSubmitting: false })
      wx.showToast({ title: '提交失败，请稍后再试', icon: 'none' })
    }
  }
})

const cloud = require('../../utils/cloud')
const { buildLearningResourceView } = require('./learning-resource-presenter')

Page({
  data: {
    loading: true,
    packId: '',
    view: null,
    errorText: ''
  },

  onLoad(options = {}) {
    this.setData({ packId: options.packId || '' })
    this.loadPack()
  },

  async loadPack() {
    if (!this.data.packId) {
      this.setData({ loading: false, errorText: '没有找到学习任务包' })
      return
    }

    this.setData({ loading: true, errorText: '' })
    try {
      const result = await cloud.getLearningResourcePack(this.data.packId)
      if (!result.success || !result.pack) {
        this.setData({
          loading: false,
          errorText: result.error || '学习任务包加载失败'
        })
        return
      }
      this.setData({
        loading: false,
        view: buildLearningResourceView(result.pack)
      })
    } catch (error) {
      this.setData({
        loading: false,
        errorText: error.message || '学习任务包加载失败'
      })
    }
  },

  async onCompleteTap() {
    if (!this.data.packId || (this.data.view && this.data.view.completed)) return

    wx.showLoading({ title: '正在保存' })
    try {
      const result = await cloud.completeLearningResourcePack({
        packId: this.data.packId,
        practiceResult: { source: 'manual_complete' }
      })
      wx.hideLoading()
      if (!result.success) {
        wx.showToast({ title: result.error || '保存失败', icon: 'none' })
        return
      }
      wx.showToast({ title: '已完成', icon: 'success' })
      this.loadPack()
    } catch (error) {
      wx.hideLoading()
      wx.showToast({ title: error.message || '保存失败', icon: 'none' })
    }
  },

  async onScheduleTap() {
    if (!this.data.packId) return

    wx.showLoading({ title: '正在加入' })
    try {
      const result = await cloud.scheduleResourcePackVerification(this.data.packId)
      wx.hideLoading()
      wx.showToast({
        title: result.success ? '已加入验证' : (result.error || '操作失败'),
        icon: result.success ? 'success' : 'none'
      })
    } catch (error) {
      wx.hideLoading()
      wx.showToast({ title: error.message || '操作失败', icon: 'none' })
    }
  }
})

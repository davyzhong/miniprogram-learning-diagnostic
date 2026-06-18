const cloud = require('../../utils/cloud')
const { buildLearningResourceView } = require('./learning-resource-presenter')

function copyLinkWithToast(url, platform) {
  wx.setClipboardData({
    data: url,
    success: () => wx.showToast({ title: `链接已复制，请到${platform}打开`, icon: 'none', duration: 2500 })
  })
}

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
  },

  onExternalResourceTap(e) {
    const { url, platform, canJump } = e.currentTarget.dataset
    if (!url) {
      wx.showToast({ title: '暂无链接', icon: 'none' })
      return
    }

    if (canJump && platform === 'B站' || platform === '哔哩哔哩') {
      // 尝试跳转 B站小程序，降级为复制链接
      wx.openEmbeddedMiniProgram && wx.openEmbeddedMiniProgram({
        appId: 'wx7e979c1c1c1c1c1c', // 占位，需替换为 B站小程序实际 appId
        fail: () => copyLinkWithToast(url, platform)
      }) || copyLinkWithToast(url, platform)
    } else if (canJump && platform === '小红书') {
      wx.openEmbeddedMiniProgram && wx.openEmbeddedMiniProgram({
        appId: 'wx6a1f1f1f1f1f1f1f', // 占位，需替换为小红书小程序实际 appId
        fail: () => copyLinkWithToast(url, platform)
      }) || copyLinkWithToast(url, platform)
    } else {
      copyLinkWithToast(url, platform)
    }
  }
})

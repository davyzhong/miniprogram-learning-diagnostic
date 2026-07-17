const cloud = require('../../utils/cloud')
const { buildLearningResourceView } = require('./learning-resource-presenter')

// 外部平台小程序 appId：配置真实 appId 后才会尝试跳转，否则统一复制链接
const PLATFORM_MINIPROGRAM_APP_IDS = {
  // 'B站': 'wx...', '哔哩哔哩': 'wx...', '小红书': 'wx...'
}

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
          errorText: '学习任务包加载失败，请稍后重试'
        })
        return
      }
      this.setData({
        loading: false,
        view: buildLearningResourceView(result.pack)
      })
    } catch (error) {
      console.error('学习任务包加载失败', error)
      this.setData({
        loading: false,
        errorText: '学习任务包加载失败，请稍后重试'
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
        wx.showToast({ title: '保存失败，请稍后重试', icon: 'none' })
        return
      }
      wx.showToast({ title: '已完成', icon: 'success' })
      this.loadPack()
    } catch (error) {
      wx.hideLoading()
      console.error('学习任务完成状态保存失败', error)
      wx.showToast({ title: '保存失败，请稍后重试', icon: 'none' })
    }
  },

  async onScheduleTap() {
    if (!this.data.packId) return

    wx.showLoading({ title: '正在加入' })
    try {
      const result = await cloud.scheduleResourcePackVerification(this.data.packId)
      wx.hideLoading()
      wx.showToast({
        title: result.success ? '已加入验证' : '操作失败，请稍后重试',
        icon: result.success ? 'success' : 'none'
      })
    } catch (error) {
      wx.hideLoading()
      console.error('学习任务加入验证失败', error)
      wx.showToast({ title: '操作失败，请稍后重试', icon: 'none' })
    }
  },

  // 练习题答案展开/收起：让学习者先想一想再点开
  onPracticeToggle(e) {
    const questionId = e.currentTarget.dataset.questionId
    if (!questionId) return
    const view = this.data.view
    if (!view || !view.practiceBlock || !view.practiceBlock.questions) return
    const questions = view.practiceBlock.questions.map(q =>
      q.questionId === questionId ? { ...q, revealed: !q.revealed } : q
    )
    this.setData({ 'view.practiceBlock.questions': questions })
  },

  onExternalResourceTap(e) {
    const { url, platform, canJump } = e.currentTarget.dataset
    if (!url) {
      wx.showToast({ title: '暂无链接', icon: 'none' })
      return
    }

    // 小程序跳转需要目标平台的真实 appId；未配置时统一复制链接，避免假 appId 跳转必败
    const appId = canJump ? PLATFORM_MINIPROGRAM_APP_IDS[platform] : ''
    if (appId && wx.openEmbeddedMiniProgram) {
      wx.openEmbeddedMiniProgram({
        appId,
        fail: () => copyLinkWithToast(url, platform)
      })
      return
    }
    copyLinkWithToast(url, platform)
  }
})

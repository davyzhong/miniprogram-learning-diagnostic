// pages/add-student/add-student.js
const cloud = require('../../utils/cloud')
const { sanitizeUserText } = require('../../utils/user-facing-text')

Page({
  data: {
    name: '',
    grade: null,
    avatarColor: '#4299e1',
    grades: [1, 2, 3, 4, 5, 6],
    colorOptions: [
      '#4299e1', // 蓝
      '#48bb78', // 绿
      '#ed8936', // 橙
      '#9f7aea', // 紫
      '#ed64a6', // 粉
      '#38b2ac', // 青
    ],
    canSave: false,
    saving: false
  },

  onNameInput(e) {
    this.setData({
      name: e.detail.value
    })
    this.checkCanSave()
  },

  onGradeTap(e) {
    this.setData({
      grade: e.currentTarget.dataset.grade
    })
    this.checkCanSave()
  },

  onColorTap(e) {
    this.setData({
      avatarColor: e.currentTarget.dataset.color
    })
  },

  checkCanSave() {
    const { name, grade } = this.data
    this.setData({
      canSave: name.trim().length > 0 && grade !== null
    })
  },

  async onSave() {
    const { name, grade, avatarColor } = this.data
    if (!name.trim() || grade === null || this.data.saving) return

    this.setData({ saving: true })
    wx.showLoading({ title: '保存中...' })

    try {
      await cloud.createStudentWithProfiles({
        name: name.trim(),
        grade,
        avatarColor,
        totalReports: 0
      })

      wx.hideLoading()
      wx.showToast({ title: '添加成功', icon: 'success' })
      setTimeout(() => {
        wx.navigateBack()
      }, 1000)
    } catch (err) {
      console.error('保存学生失败', err)
      wx.hideLoading()
      wx.showToast({
        title: sanitizeUserText('保存失败：' + (err.message || '未知错误'), { treatAsId: true }),
        icon: 'none'
      })
    } finally {
      this.setData({ saving: false })
    }
  }
})

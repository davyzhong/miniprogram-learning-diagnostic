// pages/add-student/add-student.js
const app = getApp()

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
    canSave: false
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
    if (!name.trim() || grade === null) return

    wx.showLoading({ title: '保存中...' })

    try {
      // 1. 创建学生记录
      const studentRes = await app.db.collection('students').add({
        data: {
          name: name.trim(),
          grade: grade,
          avatarColor: avatarColor,
          totalReports: 0,
          createdAt: app.db.serverDate(),
          updatedAt: app.db.serverDate()
        }
      })

      const studentId = studentRes._id

      // 2. 为该学生创建三个学科的 subjectProfiles 记录
      const subjects = ['math', 'chinese', 'english']
      const subjectNames = { math: '数学', chinese: '语文', english: '英语' }
      for (const sub of subjects) {
        await app.db.collection('subjectProfiles').add({
          data: {
            studentId: studentId,
            subject: sub,
            subjectName: subjectNames[sub],
            totalReports: 0,
            pendingBottlenecks: [],
            improvedBottlenecks: [],
            analysisStatus: '',
            createdAt: app.db.serverDate(),
            updatedAt: app.db.serverDate()
          }
        })
      }

      wx.hideLoading()
      wx.showToast({ title: '添加成功', icon: 'success' })
      setTimeout(() => {
        wx.navigateBack()
      }, 1000)
    } catch (err) {
      console.error('保存学生失败', err)
      wx.hideLoading()
      wx.showToast({ title: '保存失败：' + (err.message || '未知错误'), icon: 'none' })
    }
  }
})

// pages/subject-select/subject-select.js
const cloud = require('../../utils/cloud')

Page({
  data: {
    studentId: '',
    studentName: '',
    grade: '',
    subjects: [
      { key: 'math',    name: '数学', icon: '📐', totalReports: 0, pendingCount: 0 },
      { key: 'chinese', name: '语文', icon: '📖', totalReports: 0, pendingCount: 0 },
      { key: 'english', name: '英语', icon: '🔤', totalReports: 0, pendingCount: 0 },
    ],
    enteringSubject: ''
  },

  onLoad(options) {
    const { studentId, name, grade } = options
    this.setData({
      studentId: studentId || '',
      studentName: decodeURIComponent(name || ''),
      grade: grade || ''
    })
    wx.setNavigationBarTitle({ title: decodeURIComponent(name || '学科入口') })
  },

  onShow() {
    if (this.data.studentId) {
      this.loadSubjectProfiles()
    }
  },

  async loadSubjectProfiles() {
    const { studentId, subjects } = this.data
    try {
      const profiles = await cloud.getSubjectProfiles(studentId)

      const map = {}
      profiles.forEach(p => {
        map[p.subject] = p
      })

      const updated = subjects.map(s => {
        const prof = map[s.key]
        if (prof) {
          // 已有档案
          return {
            ...s,
            totalReports: prof.totalReports || 0,
            pendingCount: (prof.pendingBottlenecks || []).length
          }
        } else {
          // 尚未创建档案
          return { ...s, totalReports: 0, pendingCount: 0 }
        }
      })

      this.setData({ subjects: updated })
    } catch (err) {
      console.error('加载学科档案失败', err)
    }
  },

  async onSubjectTap(e) {
    const { key, name } = e.currentTarget.dataset
    const { studentId, studentName, grade } = this.data
    if (this.data.enteringSubject) return

    this.setData({ enteringSubject: key })
    wx.showLoading({ title: '加载中...' })

    try {
      // 确保 subjectProfile 存在
      await cloud.ensureSubjectProfile(studentId, key, name)

      wx.hideLoading()

      // 跳转到学科主页
      wx.navigateTo({
        url: `/pages/subject-home/subject-home?studentId=${studentId}&subject=${key}&subjectName=${encodeURIComponent(name)}&studentName=${encodeURIComponent(studentName)}&grade=${grade}`
      })
    } catch (err) {
      console.error('进入学科失败', err)
      wx.hideLoading()
      wx.showToast({ title: '进入失败', icon: 'none' })
    } finally {
      this.setData({ enteringSubject: '' })
    }
  }
})

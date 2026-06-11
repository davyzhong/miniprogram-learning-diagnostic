// pages/index/index.js
const app = getApp()

Page({
  data: {
    students: []
  },

  onShow() {
    this.loadStudents()
  },

  async loadStudents() {
    wx.showLoading({ title: '加载中...' })

    try {
      const db = app.db
      // 1. 加载所有学生
      const res = await db.collection('students')
        .orderBy('createdAt', 'desc')
        .get()

      const students = res.data

      // 2. 为每个学生加载学科档案统计
      for (let i = 0; i < students.length; i++) {
        const s = students[i]
        // 年级文字
        s.gradeText = s.grade ? `${s.grade}年级` : ''

        // 查询该学生的所有学科档案
        try {
          const profRes = await db.collection('subjectProfiles')
            .where({ studentId: s._id })
            .get()

          let totalReports = 0
          let lastReportAt = null

          profRes.data.forEach(p => {
            totalReports += (p.totalReports || 0)
            if (p.updatedAt) {
              const t = new Date(p.updatedAt)
              if (!lastReportAt || t > lastReportAt) {
                lastReportAt = t
              }
            }
          })

          s.totalReports = totalReports
          s.lastReportAt = lastReportAt
            ? this.formatTime(lastReportAt)
            : ''
        } catch (e) {
          s.totalReports = 0
          s.lastReportAt = ''
        }

        // 默认头像颜色和首字
        if (!s.avatarColor) {
          const colors = ['#4299e1', '#48bb78', '#ed8936', '#9f7aea', '#ed64a6', '#38b2ac']
          s.avatarColor = colors[Math.abs(this.hashCode(s.name)) % colors.length]
        }
        s.avatarText = s.name ? s.name.charAt(0) : ''
      }

      this.setData({ students })
    } catch (err) {
      console.error('加载学生列表失败', err)
      wx.showToast({ title: '加载失败', icon: 'none' })
    } finally {
      wx.hideLoading()
    }
  },

  // 点击学生卡片 → 进入学科选择页
  onStudentTap(e) {
    const { id, name, grade } = e.currentTarget.dataset
    wx.navigateTo({
      url: `/pages/subject-select/subject-select?studentId=${id}&name=${encodeURIComponent(name)}&grade=${grade || ''}`
    })
  },

  // 添加学生
  onAddStudent() {
    wx.navigateTo({
      url: '/pages/add-student/add-student'
    })
  },

  // 工具函数：格式化时间
  formatTime(date) {
    const now = new Date()
    const d = new Date(date)
    const diff = (now - d) / 1000

    if (diff < 60) return '刚刚'
    if (diff < 3600) return `${Math.floor(diff / 60)}分钟前`
    if (diff < 86400) return `${Math.floor(diff / 3600)}小时前`
    if (diff < 172800) return '昨天'

    const month = d.getMonth() + 1
    const day = d.getDate()
    return `${month}月${day}日`
  },

  // 工具函数：简单 hash
  hashCode(str) {
    let hash = 0
    for (let i = 0; i < str.length; i++) {
      const char = str.charCodeAt(i)
      hash = ((hash << 5) - hash) + char
      hash = hash & hash
    }
    return Math.abs(hash)
  }
})

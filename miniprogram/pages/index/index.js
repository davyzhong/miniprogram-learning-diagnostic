// pages/index/index.js
const cloud = require('../../utils/cloud')
const { formatRelativeTime } = require('../../utils/util')

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
      // 1. 加载所有学生
      const students = await cloud.getStudents()

      // 2. 为每个学生加载学科档案统计
      const viewModels = await Promise.all(students.map(async s => {
        // 年级文字
        const viewModel = {
          ...s,
          gradeText: s.grade ? `${s.grade}年级` : ''
        }

        // 查询该学生的所有学科档案
        try {
          const profiles = await cloud.getSubjectProfiles(s._id)

          let totalReports = 0
          let lastReportAt = null

          profiles.forEach(p => {
            totalReports += (p.totalReports || 0)
            if (p.updatedAt) {
              const t = new Date(p.updatedAt)
              if (!lastReportAt || t > lastReportAt) {
                lastReportAt = t
              }
            }
          })

          viewModel.totalReports = totalReports
          viewModel.lastReportAt = lastReportAt
            ? formatRelativeTime(lastReportAt)
            : ''
        } catch (e) {
          viewModel.totalReports = 0
          viewModel.lastReportAt = ''
        }

        // 默认头像颜色和首字
        if (!viewModel.avatarColor) {
          const colors = ['#4299e1', '#48bb78', '#ed8936', '#9f7aea', '#ed64a6', '#38b2ac']
          viewModel.avatarColor = colors[Math.abs(this.hashCode(s.name)) % colors.length]
        }
        viewModel.avatarText = s.name ? s.name.charAt(0) : ''
        return viewModel
      }))

      this.setData({ students: viewModels })
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

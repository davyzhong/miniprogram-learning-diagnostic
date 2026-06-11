const cloud = require('../../utils/cloud')
const util = require('../../utils/util')

Page({
  data: {
    studentId: '',
    student: null,
    reports: [],
    latestReport: null,
    loading: true
  },

  onLoad(options) {
    this.setData({ studentId: options.id })
    this.loadData()
  },

  async loadData() {
    this.setData({ loading: true })
    try {
      const [student, reports] = await Promise.all([
        cloud.getStudent(this.data.studentId),
        cloud.getReports(this.data.studentId)
      ])

      // 格式化学生建档日期
      student.createdAtStr = util.formatDate(student.createdAt)
      student.avatarText = student.name ? student.name.charAt(0) : ''

      // 格式化报告
      const formattedReports = reports.map(r => ({
        ...r,
        dateStr: util.formatDate(r.createdAt),
        bugCount: r.summary ? r.summary.totalBugs : 0,
        photoCount: r.photoCount || 0
      }))

      this.setData({
        student,
        reports: formattedReports,
        latestReport: formattedReports.length > 0 ? formattedReports[0] : null,
        loading: false
      })
    } catch (err) {
      console.error('加载学生数据失败:', err)
      wx.showToast({ title: '加载失败', icon: 'none' })
      this.setData({ loading: false })
    }
  },

  onCapture() {
    const { studentId, student } = this.data
    wx.navigateTo({
      url: `/pages/capture/capture?studentId=${studentId}&studentName=${encodeURIComponent(student.name)}`
    })
  },

  onViewReport(e) {
    const id = e.currentTarget.dataset.id
    wx.navigateTo({ url: `/pages/report/report?id=${id}` })
  },

  onViewLatestReport() {
    if (this.data.latestReport) {
      wx.navigateTo({ url: `/pages/report/report?id=${this.data.latestReport._id}` })
    }
  }
})

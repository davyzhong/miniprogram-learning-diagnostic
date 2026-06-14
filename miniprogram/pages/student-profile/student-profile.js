const cloud = require('../../utils/cloud')
const { formatRelativeTime } = require('../../utils/util')
const { buildLearningProfileHomeView } = require('../index/index-presenter')
const { getSubjectName } = require('../../utils/constants')

const OWNER_PERMISSIONS = {
  canView: true,
  canManageParents: true,
  canUpload: true,
  canGeneratePaper: true,
  canRetryAnalysis: true
}

Page({
  data: {
    loading: true,
    studentId: '',
    activeStudent: null,
    permissions: {},
    home: null
  },

  async onLoad(options = {}) {
    const studentId = options.studentId || ''
    this.setData({ studentId })
    await this.loadProfile()
  },

  async loadProfile() {
    const studentId = this.data.studentId
    if (!studentId) {
      this.setData({ loading: false })
      wx.showToast({ title: '缺少孩子档案信息', icon: 'none' })
      return
    }

    this.setData({ loading: true })
    wx.showLoading({ title: '加载中...' })

    try {
      let student = { _id: studentId }
      let profiles = []
      let reports = []
      let papers = []
      let permissions = OWNER_PERMISSIONS

      if (typeof cloud.getStudentDashboard === 'function') {
        try {
          const dashboard = await cloud.getStudentDashboard(studentId)
          student = dashboard.student || student
          profiles = dashboard.subjectProfiles || []
          reports = dashboard.recentReports || []
          papers = dashboard.recentPapers || []
          permissions = dashboard.permissions || student.permissions || OWNER_PERMISSIONS
        } catch (error) {
          console.warn('共享档案详情不可用，回退到旧学习记录读取', error && error.message ? error.message : error)
        }
      }

      if (!student.name && typeof cloud.getStudents === 'function') {
        const students = await cloud.getStudents()
        student = students.find(item => item._id === studentId) || student
      }
      if (!profiles.length && typeof cloud.getSubjectProfiles === 'function') {
        profiles = await cloud.getSubjectProfiles(studentId)
      }
      if (!reports.length && typeof cloud.getReports === 'function') {
        reports = await cloud.getReports(studentId)
      }
      if (!papers.length && typeof cloud.getPapers === 'function') {
        papers = await cloud.getPapers({ studentId })
      }

      permissions = permissions || student.permissions || OWNER_PERMISSIONS
      const home = buildLearningProfileHomeView({
        student,
        profiles,
        reports,
        papers,
        permissions
      }, formatRelativeTime)

      this.setData({
        activeStudent: { ...student, permissions },
        permissions,
        home,
        loading: false
      })
    } catch (error) {
      console.error('加载孩子档案失败', error)
      wx.showToast({ title: '加载失败', icon: 'none' })
      this.setData({ loading: false })
    } finally {
      wx.hideLoading()
    }
  },

  onBackHome() {
    wx.navigateBack({
      delta: 1,
      fail: () => wx.reLaunch({ url: '/pages/index/index' })
    })
  },

  onManageStudents() {
    wx.navigateTo({ url: '/pages/add-student/add-student' })
  },

  onParentManagement() {
    const student = this.data.activeStudent || {}
    const studentId = student._id || this.data.studentId
    if (!studentId) {
      wx.showToast({ title: '缺少孩子档案信息', icon: 'none' })
      return
    }
    const url = `/pages/parent-management/parent-management?studentId=${studentId}`
    wx.navigateTo({
      url,
      fail: error => {
        console.error('打开家长管理失败', error)
        wx.redirectTo({
          url,
          fail: redirectError => {
            console.error('重定向家长管理失败', redirectError)
            const message = redirectError && redirectError.errMsg
              ? redirectError.errMsg.replace(/^redirectTo:fail\s*/i, '').slice(0, 18)
              : '请重新编译后再试'
            wx.showToast({ title: message || '家长管理暂时打不开', icon: 'none' })
          }
        })
      }
    })
  },

  navigateToSubject(subject) {
    const student = this.data.activeStudent || {}
    const subjectName = getSubjectName(subject, '数学')
    wx.navigateTo({
      url: `/pages/subject-home/subject-home?studentId=${student._id || this.data.studentId}&subject=${subject}&subjectName=${encodeURIComponent(subjectName)}&studentName=${encodeURIComponent(student.name || '')}&grade=${student.grade || ''}`
    })
  },

  onHighlightTap(e) {
    this.navigateToSubject(e.currentTarget.dataset.subject || 'math')
  },

  onSubjectTap(e) {
    this.navigateToSubject(e.currentTarget.dataset.subject || e.currentTarget.dataset.key || 'math')
  },

  onViewAllRecords() {
    const student = this.data.activeStudent || {}
    wx.navigateTo({
      url: `/pages/upload-history/upload-history?studentId=${student._id || this.data.studentId}&studentName=${encodeURIComponent(student.name || '')}`
    })
  },

  findHomeBottleneck(subject, lpCode) {
    const home = this.data.home || {}
    return (home.priorityBottlenecks || []).find(item =>
      item.subject === subject && item.lpCode === lpCode
    ) || null
  },

  onViewAllBottlenecks() {
    const student = this.data.activeStudent || {}
    wx.navigateTo({
      url: `/pages/bottleneck-center/bottleneck-center?studentId=${student._id || this.data.studentId}&studentName=${encodeURIComponent(student.name || '')}`
    })
  },

  onBottleneckTap(e) {
    const { subject = 'math', lpCode = '' } = e.currentTarget.dataset
    const student = this.data.activeStudent || {}
    if (!lpCode) return
    wx.navigateTo({
      url: `/pages/bottleneck-detail/bottleneck-detail?studentId=${student._id || this.data.studentId}&subject=${subject}&lpCode=${encodeURIComponent(lpCode)}&studentName=${encodeURIComponent(student.name || '')}`
    })
  },

  onBottleneckAction(e) {
    const { subject = 'math', lpCode = '' } = e.currentTarget.dataset
    if (!lpCode) return
    const bottleneck = this.findHomeBottleneck(subject, lpCode)
    if (bottleneck && bottleneck.active === false) {
      this.onBottleneckTap(e)
      return
    }
    const student = this.data.activeStudent || {}
    const subjectName = getSubjectName(subject, '数学')
    wx.navigateTo({
      url: `/pages/generate-verification/generate-verification?studentId=${student._id || this.data.studentId}&subject=${subject}&subjectName=${encodeURIComponent(subjectName)}&studentName=${encodeURIComponent(student.name || '')}&targetCode=${encodeURIComponent(lpCode)}`
    })
  },

  onRecordTap(e) {
    const index = e.currentTarget.dataset.index
    const record = this.data.home && this.data.home.recentRecords[index]
    if (!record) return
    if (record.paperId) {
      wx.navigateTo({ url: `/pages/paper-preview/paper-preview?paperId=${record.paperId}` })
      return
    }
    if (record.reportId) {
      wx.navigateTo({ url: `/pages/report/report?id=${record.reportId}` })
    }
  },

  onPrimaryReportTap() {
    const report = this.data.home && this.data.home.primaryReport
    if (report && report.reportId) {
      wx.navigateTo({ url: `/pages/report/report?id=${report.reportId}` })
    }
  },

  onPrimaryAction() {
    const home = this.data.home || {}
    const student = this.data.activeStudent || {}
    const subject = home.nextAction && home.nextAction.subject ? home.nextAction.subject : 'math'
    const subjectName = getSubjectName(subject, '数学')
    if (home.nextAction && home.nextAction.primaryText === '查看学习记录') {
      this.onViewAllRecords()
      return
    }
    if (home.nextAction && home.nextAction.primaryText === '生成验证试卷') {
      wx.navigateTo({
        url: `/pages/generate-verification/generate-verification?studentId=${student._id || this.data.studentId}&subject=${subject}&subjectName=${encodeURIComponent(subjectName)}&studentName=${encodeURIComponent(student.name || '')}`
      })
      return
    }
    wx.navigateTo({
      url: `/pages/upload/upload?mode=diagnosis&studentId=${student._id || this.data.studentId}&subject=${subject}&subjectName=${encodeURIComponent(subjectName)}&studentName=${encodeURIComponent(student.name || '')}&grade=${student.grade || ''}`
    })
  },

  onSecondaryAction() {
    const home = this.data.home || {}
    const student = this.data.activeStudent || {}
    const subject = home.nextAction && home.nextAction.subject ? home.nextAction.subject : 'math'
    const subjectName = getSubjectName(subject, '数学')
    if (!home.nextAction || !home.nextAction.secondaryText) return
    if (home.nextAction && home.nextAction.secondaryText === '查看学习记录') {
      this.onViewAllRecords()
      return
    }
    wx.navigateTo({
      url: `/pages/upload/upload?mode=diagnosis&studentId=${student._id || this.data.studentId}&subject=${subject}&subjectName=${encodeURIComponent(subjectName)}&studentName=${encodeURIComponent(student.name || '')}&grade=${student.grade || ''}`
    })
  }
})

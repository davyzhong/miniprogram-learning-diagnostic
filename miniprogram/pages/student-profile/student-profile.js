// pages/student-profile/student-profile.js
const cloud = require('../../utils/cloud')
const { formatRelativeTime } = require('../../utils/util')
const { buildLearningProfileHomeView } = require('../index/index-presenter')
const { sharedNavigation, OWNER_PERMISSIONS } = require('../../utils/shared-navigation')

const PROFILE_CACHE_TTL_MS = 30 * 1000

Page({
  data: {
    loading: true,
    studentId: '',
    activeStudent: null,
    permissions: {},
    home: null
  },

  ...sharedNavigation,

  onKnowledgeMapTap() {
    const student = this.data.home && this.data.home.studentId
    const name = this.data.home && this.data.home.studentName
    if (!student) {
      wx.showToast({ title: '请先选择孩子', icon: 'none' })
      return
    }
    wx.navigateTo({
      url: `/pages/knowledge-map/knowledge-map?studentId=${student}&studentName=${encodeURIComponent(name || '')}&subject=math`,
    })
  },

  onLoad(options = {}) {
    const studentId = options.studentId || ''
    this.setData({ studentId })
    this._cloud = cloud
    this.loadProfile().catch(error => {
      console.error('加载孩子档案失败', error)
    })
  },

  hasFreshProfileSnapshot() {
    const loadedAt = this._lastProfileLoadedAt || 0
    if (!loadedAt || Date.now() - loadedAt > PROFILE_CACHE_TTL_MS) return false
    return this.data.loading === false && Boolean(this.data.home)
  },

  async loadProfile(options = {}) {
    if (!options.force && this.hasFreshProfileSnapshot()) {
      return
    }

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
      this._lastProfileLoadedAt = Date.now()
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
  }
})

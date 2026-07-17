// pages/student-profile/student-profile.js
const cloud = require('../../utils/cloud')
const { formatRelativeTime } = require('../../utils/util')
const { buildLearningProfileHomeView } = require('../index/index-presenter')
const { sharedNavigation, OWNER_PERMISSIONS } = require('../../utils/shared-navigation')
const { symbolOf } = require('../../utils/ui-symbols')

const PROFILE_CACHE_TTL_MS = 30 * 1000
const DIAGNOSIS_SUBJECTS = ['math', 'chinese', 'english']

function isFormalDiagnosis(report = {}) {
  return report.status === 'completed'
    && report.type !== 'verification'
    && report.isEffective !== false
    && !report.isArchived
    && !report.archivedAt
}

async function loadSubjectScopedDiagnoses(cloudModule, studentId) {
  if (typeof cloudModule.getReports !== 'function') return null
  const results = await Promise.all(DIAGNOSIS_SUBJECTS.map(async subject => {
    const reports = await cloudModule.getReports(studentId, subject, 100).catch(() => [])
    return (reports || []).find(isFormalDiagnosis) || null
  }))
  return results.filter(Boolean)
}

Page({
  data: {
    loading: true,
    studentId: '',
    activeStudent: null,
    permissions: {},
    home: null,
    switchSymbol: symbolOf('refresh'),
    parentManageSymbol: symbolOf('parent')
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
      let latestDiagnosisReports = null
      let papers = []
      let permissions = OWNER_PERMISSIONS

      if (typeof cloud.getStudentDashboard === 'function') {
        try {
          const dashboard = await cloud.getStudentDashboard(studentId)
          student = dashboard.student || student
          profiles = dashboard.subjectProfiles || []
          reports = dashboard.recentReports || []
          latestDiagnosisReports = Array.isArray(dashboard.latestDiagnosisReports)
            ? dashboard.latestDiagnosisReports
            : null
          papers = dashboard.recentPapers || []
          permissions = dashboard.permissions || student.permissions || OWNER_PERMISSIONS
        } catch (error) {
          console.warn('共享档案详情不可用，回退到旧学习记录读取', error && error.message ? error.message : error)
        }
      }

      const [
        fallbackStudents,
        fallbackProfiles,
        fallbackReports,
        fallbackPapers
      ] = await Promise.all([
        !student.name && typeof cloud.getStudents === 'function'
          ? cloud.getStudents().catch(() => [])
          : Promise.resolve(null),
        !profiles.length && typeof cloud.getSubjectProfiles === 'function'
          ? cloud.getSubjectProfiles(studentId).catch(() => [])
          : Promise.resolve(null),
        !reports.length && typeof cloud.getReports === 'function'
          ? cloud.getReports(studentId).catch(() => [])
          : Promise.resolve(null),
        !papers.length && typeof cloud.getPapers === 'function'
          ? cloud.getPapers({ studentId }).catch(() => [])
          : Promise.resolve(null)
      ])

      if (fallbackStudents) {
        student = fallbackStudents.find(item => item._id === studentId) || student
      }
      if (fallbackProfiles) profiles = fallbackProfiles
      if (fallbackReports) reports = fallbackReports
      if (fallbackPapers) papers = fallbackPapers

      let diagnosisDataUnavailable = false
      if (latestDiagnosisReports === null) {
        latestDiagnosisReports = await loadSubjectScopedDiagnoses(cloud, studentId)
        if (latestDiagnosisReports === null) {
          latestDiagnosisReports = []
          diagnosisDataUnavailable = true
        }
      }

      permissions = permissions || student.permissions || OWNER_PERMISSIONS
      const home = buildLearningProfileHomeView({
        student,
        profiles,
        reports,
        latestDiagnosisReports,
        papers,
        permissions,
        diagnosisDataUnavailable
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

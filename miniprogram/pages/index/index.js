// pages/index/index.js
const cloud = require('../../utils/cloud')
const { formatRelativeTime } = require('../../utils/util')
const { buildLearningProfileHomeView } = require('./index-presenter')
const { buildChildWorkbenchCards } = require('../../utils/child-workbench')
const { getSubjectName } = require('../../utils/constants')
const { sharedNavigation, OWNER_PERMISSIONS } = require('../../utils/shared-navigation')

const HOME_CACHE_TTL_MS = 30 * 1000

function applyProfileStats(viewModel, profiles) {
  let totalReports = 0
  let lastReportAt = null

  ;(profiles || []).forEach(p => {
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
}

Page({
  data: {
    loading: true,
    students: [],
    activeStudentId: '',
    activeStudent: null,
    permissions: {},
    hasStudents: false,
    homeMode: 'empty',
    home: null,
    childCards: []
  },

  ...sharedNavigation,

  onShow() {
    return this.loadStudents()
  },

  hasFreshHomeSnapshot() {
    const loadedAt = this._lastHomeLoadedAt || 0
    if (!loadedAt || Date.now() - loadedAt > HOME_CACHE_TTL_MS) {
      return false
    }
    return this.data.loading === false && (this.data.hasStudents || this.data.homeMode === 'empty')
  },

  async loadStudents(options = {}) {
    if (!options.force && this.hasFreshHomeSnapshot()) {
      return
    }

    this.setData({ loading: true })
    wx.showLoading({ title: '加载中...' })

    try {
      let students = []
      let usedSharedAccess = false
      try {
        if (typeof cloud.getAccessibleStudents === 'function') {
          usedSharedAccess = true
          students = await cloud.getAccessibleStudents()
        } else {
          students = await cloud.getStudents()
        }
      } catch (error) {
        console.warn('共享档案入口不可用，回退到旧档案读取', error && error.message ? error.message : error)
        students = typeof cloud.getStudents === 'function' ? await cloud.getStudents() : []
      }
      if (usedSharedAccess && !students.length && typeof cloud.getStudents === 'function') {
        students = await cloud.getStudents()
      }
      if (!students.length) {
        this.setData({
          students: [],
          activeStudentId: '',
          activeStudent: null,
          permissions: {},
          hasStudents: false,
          homeMode: 'empty',
          home: null,
          childCards: [],
          loading: false
        })
        this._lastHomeLoadedAt = Date.now()
        return
      }

      const profileLists = {}
      const viewModels = students.map(s => {
        const viewModel = {
          ...s,
          gradeText: s.grade ? `${s.grade}年级` : ''
        }
        if (!viewModel.avatarColor) {
          const colors = ['#4299e1', '#48bb78', '#ed8936', '#9f7aea', '#ed64a6', '#38b2ac']
          viewModel.avatarColor = colors[Math.abs(this.hashCode(s.name)) % colors.length]
        }
        viewModel.avatarText = s.name ? s.name.charAt(0) : ''
        return viewModel
      })

      const reportsByStudentId = {}
      const papersByStudentId = {}
      const permissionsByStudentId = {}

      if (typeof cloud.getStudentDashboard === 'function') {
        await Promise.all(viewModels.map(async student => {
          try {
            const dashboard = await cloud.getStudentDashboard(student._id)
            profileLists[student._id] = dashboard.subjectProfiles || profileLists[student._id] || []
            applyProfileStats(student, profileLists[student._id])
            reportsByStudentId[student._id] = dashboard.recentReports || []
            papersByStudentId[student._id] = dashboard.recentPapers || []
            permissionsByStudentId[student._id] = dashboard.permissions || student.permissions || OWNER_PERMISSIONS
          } catch (error) {
            console.warn('共享档案详情不可用，回退到旧学习记录读取', error && error.message ? error.message : error)
          }
        }))
      }

      await Promise.all(viewModels.map(async student => {
        if (!profileLists[student._id] && typeof cloud.getSubjectProfiles === 'function') {
          try {
            profileLists[student._id] = await cloud.getSubjectProfiles(student._id)
            applyProfileStats(student, profileLists[student._id])
          } catch (e) {
            profileLists[student._id] = []
            applyProfileStats(student, [])
          }
        } else if (!profileLists[student._id]) {
          profileLists[student._id] = []
          applyProfileStats(student, [])
        }

        if (!reportsByStudentId[student._id] && typeof cloud.getReports === 'function') {
          reportsByStudentId[student._id] = await cloud.getReports(student._id)
        }
        if (!papersByStudentId[student._id] && typeof cloud.getPapers === 'function') {
          papersByStudentId[student._id] = await cloud.getPapers({ studentId: student._id })
        }
        if (!permissionsByStudentId[student._id]) {
          permissionsByStudentId[student._id] = student.permissions || OWNER_PERMISSIONS
        }
      }))

      const hasMultipleChildren = viewModels.length > 1
      const childCards = hasMultipleChildren
        ? buildChildWorkbenchCards({
            students: viewModels,
            profilesByStudentId: profileLists,
            reportsByStudentId,
            papersByStudentId
          }, formatRelativeTime)
        : []

      const activeStudent = hasMultipleChildren ? null : viewModels[0]
      const activeProfiles = activeStudent ? (profileLists[activeStudent._id] || []) : []
      const reports = activeStudent ? (reportsByStudentId[activeStudent._id] || []) : []
      const papers = activeStudent ? (papersByStudentId[activeStudent._id] || []) : []
      const permissions = activeStudent
        ? (permissionsByStudentId[activeStudent._id] || activeStudent.permissions || OWNER_PERMISSIONS)
        : {}
      const home = activeStudent
        ? buildLearningProfileHomeView({
            student: activeStudent,
            profiles: activeProfiles,
            reports,
            papers,
            permissions
          }, formatRelativeTime)
        : null

      this.setData({
        students: viewModels,
        activeStudentId: activeStudent ? activeStudent._id : '',
        activeStudent: activeStudent ? { ...activeStudent, permissions } : null,
        permissions,
        hasStudents: true,
        homeMode: hasMultipleChildren ? 'family-workbench' : 'single-profile',
          home,
          childCards,
          loading: false
      })
      this._lastHomeLoadedAt = Date.now()
    } catch (err) {
      console.error('加载学生列表失败', err)
      wx.showToast({ title: '加载失败', icon: 'none' })
      this.setData({ loading: false })
    } finally {
      wx.hideLoading()
    }
  },

  onStudentTap(e) {
    const { id, name, grade } = e.currentTarget.dataset
    wx.navigateTo({
      url: `/pages/student-profile/student-profile?studentId=${id}&name=${encodeURIComponent(name || '')}&grade=${grade || ''}`
    })
  },

  onTraceableUrlTap(e) {
    const url = e.currentTarget.dataset.url || ''
    if (!url) {
      wx.showToast({ title: '暂时没有可查看内容', icon: 'none' })
      return
    }
    wx.navigateTo({ url })
  },

  onAddStudent() {
    wx.navigateTo({
      url: '/pages/add-student/add-student'
    })
  },

  hashCode(str) {
    if (!str) return 0
    let hash = 0
    for (let i = 0; i < str.length; i++) {
      const char = str.charCodeAt(i)
      hash = ((hash << 5) - hash) + char
      hash = hash & hash
    }
    return Math.abs(hash)
  }
})

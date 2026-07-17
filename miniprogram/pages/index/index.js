// pages/index/index.js
const cloud = require('../../utils/cloud')
const { formatRelativeTime } = require('../../utils/util')
const { buildLearningProfileHomeView } = require('./index-presenter')
const { buildChildWorkbenchCards, buildFamilyWorkbenchHero } = require('../../utils/child-workbench')
const { getSubjectName } = require('../../utils/constants')
const { sharedNavigation, OWNER_PERMISSIONS } = require('../../utils/shared-navigation')
const { bindPageStatus } = require('../../utils/app-status')

const HOME_CACHE_TTL_MS = 30 * 1000
const HOME_LOADING_TIMEOUT_MS = 12 * 1000

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

function mergeReports(...lists) {
  const byId = new Map()
  lists.flat().forEach(report => {
    if (!report || !report._id || byId.has(report._id)) return
    byId.set(report._id, report)
  })
  return Array.from(byId.values())
}

Page({
  data: {
    loading: true,
    students: [],
    activeStudentId: '',
    activeStudent: null,
    permissions: {},
    hasStudents: false,
    errorText: '',
    homeMode: 'empty',
    home: null,
    childCards: [],
    familyHero: null,
    // 图标兼容性测试入口是工程验收工具，默认不在生产首屏展示；
    // 真机测试时在控制台执行 wx.setStorageSync('iconCompatibilityEntryEnabled', '1') 后重新进入首页即可显示
    showIconCompatibilityEntry: false
  },

  ...sharedNavigation,

  onShow() {
    this._cloud = cloud
    if (this.data.showIconCompatibilityEntry !== true) {
      try {
        if (wx.getStorageSync('iconCompatibilityEntryEnabled') === '1') {
          this.setData({ showIconCompatibilityEntry: true })
        }
      } catch (err) {}
    }
    // 首次 onShow 时绑定统一状态感知（操作完成时强制刷新首页）
    if (!this._statusBound) {
      this._statusBound = true
      bindPageStatus(this, {
        studentIdGetter: () => this.data.activeStudentId,
        subjectGetter: () => '',
        handlers: {
          onOperationCompleted: () => {
            this._lastHomeLoadedAt = 0 // 失效缓存
            this.loadStudents({ force: true }).catch(() => {})
          },
          onCacheInvalidated: () => {
            this._lastHomeLoadedAt = 0
          }
        }
      })
    }
    this.loadStudents().catch(error => {
      console.error('首页加载失败', error)
    })
  },

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

  hasFreshHomeSnapshot() {
    const loadedAt = this._lastHomeLoadedAt || 0
    if (!loadedAt || Date.now() - loadedAt > HOME_CACHE_TTL_MS) {
      return false
    }
    return this.data.loading === false && (this.data.hasStudents || this.data.homeMode === 'empty')
  },

  startHomeLoadingWatchdog(loadToken) {
    if (this._homeLoadingTimer) {
      clearTimeout(this._homeLoadingTimer)
    }
    this._homeLoadingTimer = setTimeout(() => {
      if (this._activeHomeLoadToken !== loadToken || !this.data.loading) return
      this.setData({
        loading: false,
        errorText: '首页加载时间过长，请重试，或先添加孩子档案。'
      })
      wx.hideLoading()
    }, HOME_LOADING_TIMEOUT_MS)
  },

  async loadStudents(options = {}) {
    if (!options.force && this.hasFreshHomeSnapshot()) {
      return
    }

    const loadToken = (this._activeHomeLoadToken || 0) + 1
    this._activeHomeLoadToken = loadToken
    this.setData({ loading: true, errorText: '' })
    this.startHomeLoadingWatchdog(loadToken)
    wx.showLoading({ title: '加载中...' })

    try {
      // 优先使用聚合首页端点（单一云调用，无 1+N）
      if (typeof cloud.getHomeDashboard === 'function') {
        try {
          const homeDashboard = await cloud.getHomeDashboard()
          const legacyChildren = Array.isArray(homeDashboard.children) ? homeDashboard.children : []
          const students = homeDashboard.students || legacyChildren.map(child => ({
            ...(child.student || {}),
            role: child.role,
            permissions: child.permissions || (child.student && child.student.permissions)
          }))
          const perStudent = homeDashboard.perStudent || legacyChildren.reduce((result, child) => {
            const studentId = child.student && child.student._id
            if (!studentId) return result
            result[studentId] = {
              subjectProfiles: child.subjectProfiles || [],
              latestReportSummary: (child.recentReports || [])[0] || null,
              latestDiagnosisReports: child.latestDiagnosisReports || [],
              latestPaperSummary: (child.recentPapers || [])[0] || null
            }
            return result
          }, {})
          if (students.length === 0) {
            this.setData({
              students: [],
              activeStudentId: '',
              activeStudent: null,
              permissions: {},
              hasStudents: false,
              homeMode: 'empty',
              home: null,
              childCards: [],
              familyHero: null,
              errorText: '',
              loading: false
            })
            this._lastHomeLoadedAt = Date.now()
            return
          }
          this._buildHomeFromDashboard(students, perStudent)
          return
        } catch (error) {
          console.warn('聚合首页端点不可用，回退到 1+N 路径', error && error.message ? error.message : error)
        }
      }

      let students = []
      try {
        students = await cloud.getAccessibleStudents()
      } catch (error) {
        console.warn('共享档案入口不可用', error && error.message ? error.message : error)
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
          familyHero: null,
          errorText: '',
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
      const diagnosesByStudentId = {}
      const papersByStudentId = {}
      const permissionsByStudentId = {}

      if (typeof cloud.getStudentDashboard === 'function') {
        await Promise.all(viewModels.map(async student => {
          try {
            const dashboard = await cloud.getStudentDashboard(student._id)
            profileLists[student._id] = dashboard.subjectProfiles || profileLists[student._id] || []
            applyProfileStats(student, profileLists[student._id])
            diagnosesByStudentId[student._id] = Array.isArray(dashboard.latestDiagnosisReports)
              ? dashboard.latestDiagnosisReports
              : []
            reportsByStudentId[student._id] = mergeReports(
              dashboard.recentReports || [],
              diagnosesByStudentId[student._id]
            )
            papersByStudentId[student._id] = dashboard.recentPapers || []
            permissionsByStudentId[student._id] = dashboard.permissions || student.permissions || OWNER_PERMISSIONS
          } catch (error) {
            console.warn('共享档案详情不可用，回退到旧学习记录读取', error && error.message ? error.message : error)
          }
        }))
      }

      // 直接 DB fallback 已移除：如果 getStudentDashboard 失败，profile/reports/papers 为空，
      // 页面展示降级视图（无学科摘要、无最近报告），不再绕过权限校验直接读 collection。
      viewModels.forEach(student => {
        if (!profileLists[student._id]) {
          profileLists[student._id] = []
          applyProfileStats(student, [])
        }
        if (!reportsByStudentId[student._id]) {
          reportsByStudentId[student._id] = []
        }
        if (!diagnosesByStudentId[student._id]) {
          diagnosesByStudentId[student._id] = []
        }
        if (!papersByStudentId[student._id]) {
          papersByStudentId[student._id] = []
        }
        if (!permissionsByStudentId[student._id]) {
          permissionsByStudentId[student._id] = student.permissions || OWNER_PERMISSIONS
        }
      })

      const hasMultipleChildren = viewModels.length > 1
      const childCards = hasMultipleChildren
        ? buildChildWorkbenchCards({
            students: viewModels,
            profilesByStudentId: profileLists,
            reportsByStudentId,
            diagnosesByStudentId,
            papersByStudentId
          }, formatRelativeTime)
        : []
      const familyHero = hasMultipleChildren ? buildFamilyWorkbenchHero(childCards) : null

      const activeStudent = hasMultipleChildren ? null : viewModels[0]
      const activeProfiles = activeStudent ? (profileLists[activeStudent._id] || []) : []
      const reports = activeStudent ? (reportsByStudentId[activeStudent._id] || []) : []
      const latestDiagnosisReports = activeStudent ? (diagnosesByStudentId[activeStudent._id] || []) : []
      const papers = activeStudent ? (papersByStudentId[activeStudent._id] || []) : []
      const permissions = activeStudent
        ? (permissionsByStudentId[activeStudent._id] || activeStudent.permissions || OWNER_PERMISSIONS)
        : {}
      const home = activeStudent
        ? buildLearningProfileHomeView({
            student: activeStudent,
            profiles: activeProfiles,
            reports,
            latestDiagnosisReports,
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
        familyHero,
        errorText: '',
        loading: false
      })
      this._lastHomeLoadedAt = Date.now()
    } catch (err) {
      console.error('加载学生列表失败', err)
      wx.showToast({ title: '加载失败', icon: 'none' })
      this.setData({
        loading: false,
        hasStudents: false,
        homeMode: 'empty',
        errorText: '学习档案加载失败，请重试，或先添加孩子档案。'
      })
    } finally {
      if (this._activeHomeLoadToken === loadToken && this._homeLoadingTimer) {
        clearTimeout(this._homeLoadingTimer)
        this._homeLoadingTimer = null
      }
      wx.hideLoading()
    }
  },

  // 从 getHomeDashboard 聚合结果构建首页视图（单一云调用路径）
  _buildHomeFromDashboard(students, perStudent) {
    const profileLists = {}
    const reportsByStudentId = {}
    const diagnosesByStudentId = {}
    const papersByStudentId = {}
    const permissionsByStudentId = {}

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

      const detail = perStudent[s._id] || {}
      profileLists[s._id] = detail.subjectProfiles || []
      applyProfileStats(viewModel, profileLists[s._id])
      diagnosesByStudentId[s._id] = Array.isArray(detail.latestDiagnosisReports)
        ? detail.latestDiagnosisReports
        : []
      // 首页只需要最近状态与各科正式诊断摘要。
      reportsByStudentId[s._id] = mergeReports(
        detail.latestReportSummary ? [detail.latestReportSummary] : [],
        diagnosesByStudentId[s._id]
      )
      papersByStudentId[s._id] = detail.latestPaperSummary ? [detail.latestPaperSummary] : []
      permissionsByStudentId[s._id] = s.permissions || OWNER_PERMISSIONS

      return viewModel
    })

    const hasMultipleChildren = viewModels.length > 1
    const childCards = hasMultipleChildren
      ? buildChildWorkbenchCards({
          students: viewModels,
          profilesByStudentId: profileLists,
          reportsByStudentId,
          diagnosesByStudentId,
          papersByStudentId
        }, formatRelativeTime)
      : []
    const familyHero = hasMultipleChildren ? buildFamilyWorkbenchHero(childCards) : null

    const activeStudent = hasMultipleChildren ? null : viewModels[0]
    const activeProfiles = activeStudent ? (profileLists[activeStudent._id] || []) : []
    const reports = activeStudent ? (reportsByStudentId[activeStudent._id] || []) : []
    const latestDiagnosisReports = activeStudent ? (diagnosesByStudentId[activeStudent._id] || []) : []
    const papers = activeStudent ? (papersByStudentId[activeStudent._id] || []) : []
    const permissions = activeStudent
      ? (permissionsByStudentId[activeStudent._id] || activeStudent.permissions || OWNER_PERMISSIONS)
      : {}
    const home = activeStudent
      ? buildLearningProfileHomeView({
          student: activeStudent,
          profiles: activeProfiles,
          reports,
          latestDiagnosisReports,
          papers,
          permissions,
          diagnosisDataUnavailable: !Array.isArray((perStudent[activeStudent._id] || {}).latestDiagnosisReports)
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
      familyHero,
      errorText: '',
      loading: false
    })
    this._lastHomeLoadedAt = Date.now()
  },

  onRetryLoadStudents() {
    return this.loadStudents({ force: true })
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

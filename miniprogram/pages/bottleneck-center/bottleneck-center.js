const cloud = require('../../utils/cloud')
const {
  buildBottleneckViews,
  buildBottleneckStats,
  profileBottlenecks
} = require('../../utils/bottleneck-view')
const {
  SUBJECTS,
  SUBJECT_NAMES
} = require('../../utils/constants')

const SUBJECT_FILTERS = [
  { key: 'all', name: '全部' },
  ...SUBJECTS.map(key => ({ key, name: SUBJECT_NAMES[key] || key }))
]

const STATUS_FILTERS = [
  { key: 'all', name: '全部' },
  { key: 'active', name: '待跟进' },
  { key: 'persisting', name: '持续' },
  { key: 'recurring', name: '复发' },
  { key: 'improved', name: '已改善' }
]

function buildViewsFromProfiles(profiles = []) {
  const raw = profiles.flatMap(profile => {
    const subject = profile.subject || 'math'
    return profileBottlenecks(profile).map(item => ({
      ...item,
      subject,
      subjectName: profile.subjectName || SUBJECT_NAMES[subject] || ''
    }))
  })
  return buildBottleneckViews(raw, { expandCandidates: true })
}

function matchesStatus(item, status) {
  if (status === 'all') return true
  if (status === 'active') return item.status !== 'improved'
  if (status === 'persisting') return item.status === 'persisting'
  if (status === 'improved') return item.status === 'improved' || item.trend === 'declining'
  if (status === 'recurring') return item.trend === 'recurring'
  return true
}

Page({
  data: {
    loading: true,
    studentId: '',
    studentName: '',
    activeSubject: 'all',
    activeStatus: 'all',
    subjectFilters: SUBJECT_FILTERS,
    statusFilters: STATUS_FILTERS,
    allBottlenecks: [],
    filteredBottlenecks: [],
    stats: {
      totalCount: 0,
      activeCount: 0,
      pendingCount: 0,
      persistingCount: 0,
      improvedCount: 0,
      recurringCount: 0
    },
    emptyText: '暂无学习卡点'
  },

  onLoad(options = {}) {
    const studentId = options.studentId || ''
    const studentName = options.studentName ? decodeURIComponent(options.studentName) : ''
    const activeSubject = SUBJECT_FILTERS.some(item => item.key === options.subject)
      ? options.subject
      : 'all'
    const activeStatus = STATUS_FILTERS.some(item => item.key === options.status)
      ? options.status
      : 'all'
    this.setData({ studentId, studentName, activeSubject, activeStatus })
    if (studentId) {
      return this.loadBottlenecks()
    }
    this.setData({ loading: false, emptyText: '缺少孩子档案信息' })
    return Promise.resolve()
  },

  async loadBottlenecks() {
    this.setData({ loading: true })
    try {
      let dashboard = null
      let dashboardError = null
      let profiles = []
      let studentName = this.data.studentName

      if (typeof cloud.getStudentDashboard === 'function') {
        try {
          dashboard = await cloud.getStudentDashboard(this.data.studentId, { includeRecent: false })
          profiles = dashboard.subjectProfiles || dashboard.profiles || []
          studentName = studentName || (dashboard.student && dashboard.student.name) || ''
        } catch (error) {
          dashboardError = error
          console.warn('学习卡点聚合数据读取失败，尝试读取学科档案', error && error.message ? error.message : error)
        }
      }

      if (!profiles.length && typeof cloud.getSubjectProfiles === 'function') {
        profiles = await cloud.getSubjectProfiles(this.data.studentId)
      }

      if (!profiles.length && dashboardError) {
        throw dashboardError
      }

      const allBottlenecks = buildViewsFromProfiles(profiles)
      this.setData({
        studentName,
        allBottlenecks,
        stats: buildBottleneckStats(allBottlenecks),
        loading: false
      })
      this.applyFilters()
    } catch (error) {
      console.error('加载学习卡点失败', error && error.message ? error.message : error)
      wx.showToast({ title: '学习卡点加载失败', icon: 'none' })
      this.setData({ loading: false, emptyText: '学习卡点加载失败，请稍后重试' })
    }
  },

  applyFilters() {
    const { allBottlenecks, activeSubject, activeStatus } = this.data
    const filteredBottlenecks = allBottlenecks.filter(item => {
      const subjectMatched = activeSubject === 'all' || item.subject === activeSubject
      return subjectMatched && matchesStatus(item, activeStatus)
    })
    const subjectName = SUBJECT_FILTERS.find(item => item.key === activeSubject)
    const statusName = STATUS_FILTERS.find(item => item.key === activeStatus)
    this.setData({
      filteredBottlenecks,
      emptyText: `${subjectName ? subjectName.name : '当前'}${statusName && statusName.key !== 'all' ? statusName.name : ''}暂无学习卡点`
    })
  },

  onSubjectFilterTap(e) {
    this.setData({ activeSubject: e.currentTarget.dataset.subject || 'all' })
    this.applyFilters()
  },

  onStatusFilterTap(e) {
    this.setData({ activeStatus: e.currentTarget.dataset.status || 'all' })
    this.applyFilters()
  },

  onStatTap(e) {
    const status = e.currentTarget.dataset.status || 'all'
    this.setData({ activeStatus: status })
    this.applyFilters()
  },

  onBottleneckTap(e) {
    const { subject = 'math', lpCode = '', bottleneckId = '', viewId = '' } = e.currentTarget.dataset
    if (!lpCode && !bottleneckId && !viewId) return
    wx.navigateTo({
      url: `/pages/bottleneck-detail/bottleneck-detail?studentId=${this.data.studentId}&subject=${subject}&lpCode=${encodeURIComponent(lpCode)}&bottleneckId=${encodeURIComponent(bottleneckId)}&viewId=${encodeURIComponent(viewId)}&studentName=${encodeURIComponent(this.data.studentName || '')}`
    })
  },

  onGenerateForBottleneck(e) {
    const { subject = 'math', lpCode = '' } = e.currentTarget.dataset
    if (!lpCode) return
    const subjectName = SUBJECT_NAMES[subject] || '数学'
    wx.navigateTo({
      url: `/pages/generate-verification/generate-verification?studentId=${this.data.studentId}&subject=${subject}&subjectName=${encodeURIComponent(subjectName)}&studentName=${encodeURIComponent(this.data.studentName || '')}&targetCode=${encodeURIComponent(lpCode)}`
    })
  },

  onRefresh() {
    return this.loadBottlenecks()
  }
})

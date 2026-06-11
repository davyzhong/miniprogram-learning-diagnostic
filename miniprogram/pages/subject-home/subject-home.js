// pages/subject-home/subject-home.js
const cloud = require('../../utils/cloud')
const { formatRelativeTime } = require('../../utils/util')
const { createPoller } = require('../../utils/poller')

Page({
  data: {
    studentId: '',
    subject: 'math',
    subjectName: '数学',
    studentName: '',
    grade: '',

    totalReports: 0,
    pendingCount: 0,
    improvedCount: 0,

    analysisStatus: '',   // '' | 'analyzing'
    analysisStatusText: '',
    analysisProgress: 0,

    records: []
  },

  onLoad(options) {
    const { studentId, subject, subjectName, studentName, grade } = options
    this.setData({
      studentId: studentId || '',
      subject: subject || 'math',
      subjectName: decodeURIComponent(subjectName || '数学'),
      studentName: decodeURIComponent(studentName || ''),
      grade: grade || ''
    })

    this.setNavColor()
  },

  onShow() {
    if (this.data.studentId) {
      // loadProfile 完成后再检查是否需要启动轮询
      this.loadProfile().then(() => {
        this.checkAnalysisStatus()
      })
      this.loadRecords()
    }
  },

  setNavColor() {
    const { subject } = this.data
    const colors = {
      math:    { bg: '#1a365d', fg: '#ffffff' },
      chinese: { bg: '#1c4532', fg: '#ffffff' },
      english: { bg: '#7b341e', fg: '#ffffff' },
    }
    const c = colors[subject] || colors.math
    wx.setNavigationBarColor({
      frontColor: c.fg,
      backgroundColor: c.bg,
      animation: { duration: 200, timingFunc: 'easeIn' }
    })
  },

  // ========== 加载学科档案 ==========
  async loadProfile() {
    const { studentId, subject } = this.data
    try {
      const p = await cloud.getSubjectProfile(studentId, subject)
      if (p) {
        const pendingCount = (p.pendingBottlenecks || []).length
        const improvedCount = (p.improvedBottlenecks || []).length

        this.setData({
          totalReports: p.totalReports || 0,
          pendingCount,
          improvedCount,
          analysisStatus: p.analysisStatus || '',
        })
      }
    } catch (err) {
      console.error('加载学科档案失败', err)
    }
  },

  // ========== 加载历史记录 ==========
  async loadRecords() {
    const { studentId, subject } = this.data
    try {
      const reports = await cloud.getReports(studentId, subject, 20)
      const records = reports.map(r => ({
        _id: r._id,
        type: r.type || 'diagnosis',
        bottleneckCount: (r.bottlenecks || []).length,
        status: r.status || 'completed',
        dateText: formatRelativeTime(r.createdAt)
      }))

      this.setData({ records })
    } catch (err) {
      console.error('加载记录失败', err)
    }
  },

  // ========== 检查分析状态（启动轮询） ==========
  checkAnalysisStatus() {
    // 如果已经在轮询中，不要重复启动
    if (this._poller && this._poller.isRunning()) return

    const { analysisStatus } = this.data
    if (analysisStatus === 'analyzing') {
      this.startReportPolling()
    }
  },

  // ========== 轮询报告状态 ==========
  startReportPolling() {
    const { studentId, subject } = this.data
    this._poller = createPoller({
      request: () => cloud.getLatestReport(studentId, subject),
      onValue: (report, attempt) => {
        if (!report) return true
        if (report.status === 'completed') {
          wx.showToast({ title: '诊断完成', icon: 'success' })
          this.loadProfile()
          this.loadRecords()
          this.setData({
            analysisStatus: '',
            analysisProgress: 100,
            analysisStatusText: '分析完成'
          })
          return false
        }
        if (report.status === 'failed') {
          wx.showToast({ title: '分析失败，请重试', icon: 'none' })
          this.setData({ analysisStatus: '', analysisProgress: 0, analysisStatusText: '' })
          return false
        }
        this.setData({
          analysisProgress: Math.min(attempt * 10, 90),
          analysisStatusText: 'AI 分析中...'
        })
        return true
      },
      onError: err => console.error('轮询报告状态失败', err),
      onTimeout: () => {
        wx.showToast({ title: '分析时间较长，请稍后查看', icon: 'none' })
        this.setData({ analysisStatus: '', analysisProgress: 0, analysisStatusText: '' })
      }
    })
    this._poller.start()
  },

  // ========== 入口点击 ==========

  onDiagnosisTap() {
    const { studentId, subject, subjectName, studentName, grade } = this.data
    wx.navigateTo({
      url: `/pages/upload/upload?mode=diagnosis&studentId=${studentId}&subject=${subject}&subjectName=${encodeURIComponent(subjectName)}&studentName=${encodeURIComponent(studentName)}&grade=${grade}`
    })
  },

  onVerificationTap() {
    const { studentId, subject, subjectName, studentName } = this.data
    wx.navigateTo({
      url: `/pages/generate-verification/generate-verification?studentId=${studentId}&subject=${subject}&subjectName=${encodeURIComponent(subjectName)}&studentName=${encodeURIComponent(studentName)}`
    })
  },

  onDefaultPaperTap() {
    const { studentId, subject, subjectName, studentName, grade } = this.data
    wx.navigateTo({
      url: `/pages/default-paper/default-paper?studentId=${studentId}&subject=${subject}&subjectName=${encodeURIComponent(subjectName)}&studentName=${encodeURIComponent(studentName)}&grade=${grade}`
    })
  },

  // ========== 记录点击 ==========

  onRecordTap(e) {
    const { id } = e.currentTarget.dataset
    wx.navigateTo({
      url: `/pages/report/report?id=${id}`
    })
  },

  // ========== 返回 ==========

  onBack() {
    wx.navigateBack({ delta: 1 })
  },

  onHide() {
    if (this._poller) this._poller.stop()
  },

  onUnload() {
    if (this._poller) this._poller.stop()
  }
})

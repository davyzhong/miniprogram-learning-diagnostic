// pages/subject-home/subject-home.js
const cloud = require('../../utils/cloud')
const { formatRelativeTime } = require('../../utils/util')
const { createPoller } = require('../../utils/poller')
const STALE_ANALYSIS_MS = 10 * 60 * 1000

const STATUS_META = {
  persisting: { text: '持续出现', className: 'persisting', icon: '!' },
  needs_verification: { text: '需要验证', className: 'pending', icon: '?' },
  improved: { text: '已有改善', className: 'improved', icon: '✓' }
}

function buildSubjectHomeView(profile = {}, reports = []) {
  const rawBottlenecks = Array.isArray(profile.currentBottlenecks)
    ? profile.currentBottlenecks
    : [
        ...(profile.pendingBottlenecks || []).map(item => ({ ...item, status: 'needs_verification' })),
        ...(profile.improvedBottlenecks || []).map(item => ({ ...item, status: 'improved' }))
      ]
  const currentBottlenecks = rawBottlenecks.map(item => {
    const meta = STATUS_META[item.status] || STATUS_META.needs_verification
    return {
      ...item,
      statusText: meta.text,
      statusClass: meta.className,
      statusIcon: meta.icon
    }
  })
  const recentChanges = reports
    .filter(report => report.status === 'completed' && (
      report.isEffective === undefined || report.isEffective === true
    ))
    .slice(0, 3)
    .map(report => ({
      _id: report._id,
      title: report.changeSummary || report.comparisonSummary || report.summary || '查看本次诊断报告',
      dateText: formatRelativeTime(report.createdAt),
      type: report.type || 'diagnosis'
    }))
  const hasDiagnosis = currentBottlenecks.length > 0 || recentChanges.length > 0

  return {
    totalReports: profile.totalReports || reports.filter(item => item.status === 'completed').length,
    currentSummary: profile.currentSummary || (
      hasDiagnosis ? '已整理当前学习卡点，建议按优先顺序继续验证。' : '上传第一份数学试卷，开始整理学习卡点。'
    ),
    nextAction: profile.nextAction || (hasDiagnosis ? '生成验证试卷' : '拍照诊断'),
    currentBottlenecks,
    recentChanges,
    persistingCount: currentBottlenecks.filter(item => item.status === 'persisting').length,
    pendingCount: currentBottlenecks.filter(item => item.status === 'needs_verification').length,
    improvedCount: currentBottlenecks.filter(item => item.status === 'improved').length,
    hasDiagnosis,
    isFirstUse: !hasDiagnosis
  }
}

Page({
  data: {
    studentId: '',
    subject: 'math',
    subjectName: '数学',
    studentName: '',
    grade: '',

    totalReports: 0,
    persistingCount: 0,
    pendingCount: 0,
    improvedCount: 0,
    currentSummary: '',
    nextAction: '',
    currentBottlenecks: [],
    recentChanges: [],
    hasDiagnosis: false,
    isFirstUse: true,

    analysisStatus: '',   // '' | 'analyzing'
    analysisStatusText: '',
    currentAnalysisId: '',

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
        this._profile = p
        this.setData({
          analysisStatus: p.analysisStatus || '',
          currentAnalysisId: p.currentAnalysisId || '',
        })
        this.applyDashboardView()
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
      this._reports = reports
      this.applyDashboardView()
    } catch (err) {
      console.error('加载记录失败', err)
    }
  },

  applyDashboardView() {
    const view = buildSubjectHomeView(this._profile || {}, this._reports || [])
    this.setData({ ...view, records: view.recentChanges })
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
    const { studentId, subject, currentAnalysisId } = this.data
    this._poller = createPoller({
      request: async () => {
        const report = currentAnalysisId
          ? await cloud.getReport(currentAnalysisId)
          : await cloud.getLatestReport(studentId, subject)
        let progress = null
        if (report && report.status === 'analyzing') {
          try {
            progress = await cloud.getAnalysisProgress(report._id)
          } catch (e) { /* task may not exist yet */ }
        }
        return { report, progress }
      },
      onValue: ({ report, progress }, attempt) => {
        if (!report) return true
        if (report.status === 'completed') {
          wx.showToast({ title: '诊断完成', icon: 'success' })
          this.loadProfile()
          this.loadRecords()
          this.setData({
            analysisStatus: '',
            currentAnalysisId: '',
            analysisStatusText: '分析完成'
          })
          return false
        }
        if (report.status === 'failed') {
          wx.showToast({ title: '分析失败，请重试', icon: 'none' })
          this.setData({ analysisStatus: '', currentAnalysisId: '', analysisStatusText: '' })
          return false
        }
        const taskAge = progress && progress.createdAt
          ? Date.now() - new Date(progress.createdAt).getTime()
          : 0
        if (progress && (progress.status === 'failed' || taskAge > STALE_ANALYSIS_MS)) {
          this.setData({ analysisStatusText: '分析超时，点击查看并重新分析' })
          return false
        }
        this.setData({
          analysisStatusText: progress && progress.totalBatches > 0
            ? `AI 正在分析第 ${Math.min(progress.completedBatches + 1, progress.totalBatches)}/${progress.totalBatches} 批`
            : 'AI 后台分析中，点击查看详情'
        })
        return true
      },
      onError: err => console.error('轮询报告状态失败', err),
      onTimeout: () => {
        wx.showToast({ title: '分析时间较长，请稍后查看', icon: 'none' })
        this.setData({ analysisStatus: '', currentAnalysisId: '', analysisStatusText: '' })
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

  onUploadHistoryTap() {
    const { studentId, subject, subjectName, studentName } = this.data
    wx.navigateTo({
      url: `/pages/upload-history/upload-history?studentId=${studentId}&subject=${subject}&subjectName=${encodeURIComponent(subjectName)}&studentName=${encodeURIComponent(studentName)}`
    })
  },

  // ========== 记录点击 ==========

  onRecordTap(e) {
    const { id } = e.currentTarget.dataset
    wx.navigateTo({
      url: `/pages/report/report?id=${id}`
    })
  },

  onPrimaryAction() {
    if (this.data.isFirstUse) this.onDiagnosisTap()
    else this.onVerificationTap()
  },

  onAnalysisCardTap() {
    if (!this.data.currentAnalysisId) return
    wx.navigateTo({
      url: `/pages/report/report?id=${this.data.currentAnalysisId}`
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

// pages/subject-home/subject-home.js
const cloud = require('../../utils/cloud')
const { formatRelativeTime } = require('../../utils/util')
const { buildStatusText } = require('../../utils/learning-records')
const { createAnalysisPoller } = require('../../utils/analysis-poller')
const { buildSubjectHomeView } = require('./subject-home-presenter')
const { getSubjectColor } = require('../../utils/constants')

Page({
  data: {
    studentId: '',
    subject: 'math',
    subjectName: '数学',
    subjectInitial: '数',
    studentName: '',
    grade: '',

    subjectTitle: '数学工作台',
    primaryTask: null,
    taskQueue: [],
    tools: [],
    latestReportId: '',
    totalReports: 0,
    persistingCount: 0,
    pendingCount: 0,
    improvedCount: 0,
    currentSummary: '',
    nextAction: '',
    currentBottlenecks: [],
    recentChanges: [],
    englishVocabularyStats: null,
    englishQuickStats: [],
    hasEnglishVocabulary: false,
    hasDiagnosis: false,
    isFirstUse: true,
    permissions: {},
    canWriteActions: true,

    analysisStatus: '',   // '' | 'analyzing'
    analysisStatusText: '',
    currentAnalysisId: '',

    records: []
  },

  onLoad(options) {
    const { studentId, subject, subjectName, studentName, grade } = options
    const decodedSubjectName = decodeURIComponent(subjectName || '数学')
    this.setData({
      studentId: studentId || '',
      subject: subject || 'math',
      subjectName: decodedSubjectName,
      subjectInitial: decodedSubjectName.slice(0, 1),
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
    }
  },

  setNavColor() {
    const { subject } = this.data
    const c = getSubjectColor(subject)
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
      if (typeof cloud.getSubjectDashboard === 'function') {
        try {
          const dashboard = await cloud.getSubjectDashboard(studentId, subject)
          const p = dashboard.profile
          this._profile = p || {}
          this._reports = dashboard.reports || []
          await this.loadEnglishVocabulary()
          const permissions = dashboard.permissions || {}
          this.setData({
            permissions,
            canWriteActions: permissions.canUpload !== false || permissions.canGeneratePaper !== false,
            analysisStatus: p && p.analysisStatus || '',
            currentAnalysisId: p && p.currentAnalysisId || '',
          })
          this.applyDashboardView()
          return
        } catch (error) {
          console.warn('共享学科工作台不可用，回退到旧学科档案读取', error && error.message ? error.message : error)
        }
      }

      await this.loadLegacyProfile()
    } catch (err) {
      console.error('加载学科档案失败', err)
    }
  },

  async loadLegacyProfile() {
    const { studentId, subject } = this.data
    const p = typeof cloud.getSubjectProfile === 'function'
      ? await cloud.getSubjectProfile(studentId, subject)
      : null
    const reports = typeof cloud.getReports === 'function'
      ? await cloud.getReports(studentId, subject, 20)
      : []
    this._profile = p || {}
    this._reports = reports || []
    await this.loadEnglishVocabulary()
    this.setData({
      analysisStatus: p && p.analysisStatus || '',
      currentAnalysisId: p && p.currentAnalysisId || '',
    })
    this.applyDashboardView()
  },

  async loadEnglishVocabulary() {
    this._englishVocabulary = null
    const { studentId, subject } = this.data
    if (subject !== 'english' || typeof cloud.getEnglishVocabularySummary !== 'function') return
    try {
      this._englishVocabulary = await cloud.getEnglishVocabularySummary(studentId)
    } catch (error) {
      console.warn('英语词库摘要读取失败，继续展示学科工作台', error && error.message ? error.message : error)
    }
  },

  // ========== 加载历史记录 ==========
  async loadRecords() {
    const { studentId, subject } = this.data
    if (typeof cloud.getSubjectDashboard === 'function') return
    try {
      const reports = await cloud.getReports(studentId, subject, 20)
      this._reports = reports
      this.applyDashboardView()
    } catch (err) {
      console.error('加载记录失败', err)
    }
  },

  applyDashboardView() {
    const view = buildSubjectHomeView(this._profile || {}, this._reports || [], formatRelativeTime, {
      subjectName: this.data.subjectName,
      subject: this.data.subject,
      englishVocabulary: this._englishVocabulary,
      permissions: this.data.permissions || {}
    })
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
    this._poller = createAnalysisPoller({
      loadReport: async () => (
        currentAnalysisId
          ? await cloud.getReport(currentAnalysisId)
          : await cloud.getLatestReport(studentId, subject)
      ),
      loadProgress: report => cloud.getAnalysisProgress(report._id),
      onCompleted: () => {
        wx.showToast({ title: '诊断完成', icon: 'success' })
        this.loadProfile()
        this.loadRecords()
        this.setData({
          analysisStatus: '',
          currentAnalysisId: '',
          analysisStatusText: '分析完成'
        })
      },
      onFailed: () => {
        wx.showToast({ title: '分析失败，请重试', icon: 'none' })
        this.setData({ analysisStatus: '', currentAnalysisId: '', analysisStatusText: '' })
      },
      onTimeoutStatus: () => {
        this.setData({ analysisStatusText: buildStatusText({ status: 'timeout' }) })
      },
      onAnalyzing: state => {
        this.setData({
          analysisStatusText: state.hasProgress
            ? `AI 正在分析第 ${state.currentBatch}/${state.totalBatches} 批`
            : buildStatusText({ status: 'analyzing' })
        })
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
    if (!this.data.canWriteActions) return
    const { studentId, subject, subjectName, studentName, grade } = this.data
    wx.navigateTo({
      url: `/pages/upload/upload?mode=diagnosis&studentId=${studentId}&subject=${subject}&subjectName=${encodeURIComponent(subjectName)}&studentName=${encodeURIComponent(studentName)}&grade=${grade}`
    })
  },

  onVerificationTap() {
    this.navigateToVerification()
  },

  navigateToVerification(targetCode = '') {
    if (!this.data.canWriteActions) return
    const { studentId, subject, subjectName, studentName } = this.data
    const targetParam = targetCode ? `&targetCode=${encodeURIComponent(targetCode)}` : ''
    wx.navigateTo({
      url: `/pages/generate-verification/generate-verification?studentId=${studentId}&subject=${subject}&subjectName=${encodeURIComponent(subjectName)}&studentName=${encodeURIComponent(studentName)}${targetParam}`
    })
  },

  navigateToBottleneckDetail(lpCode = '') {
    if (!lpCode) return
    const { studentId, subject, subjectName, studentName } = this.data
    wx.navigateTo({
      url: `/pages/bottleneck-detail/bottleneck-detail?studentId=${studentId}&subject=${subject}&subjectName=${encodeURIComponent(subjectName)}&studentName=${encodeURIComponent(studentName)}&lpCode=${encodeURIComponent(lpCode)}`
    })
  },

  onDefaultPaperTap() {
    if (!this.data.canWriteActions) return
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
    const actionType = this.data.primaryTask && this.data.primaryTask.actionType
    this.navigateByAction(actionType || (this.data.isFirstUse ? 'diagnosis' : 'verification'))
  },

  onTaskTap(e) {
    const { code } = e.currentTarget.dataset
    this.navigateToBottleneckDetail(code || '')
  },

  onToolTap(e) {
    const { key } = e.currentTarget.dataset
    const tool = (this.data.tools || []).find(item => item.key === key)
    if (!tool) return
    this.navigateByAction(tool.actionType, tool)
  },

  onQuickStatTap(e) {
    const target = e.currentTarget.dataset.target || ''
    if (target === 'records') {
      this.onUploadHistoryTap()
      return
    }
    if (target === 'pending' || target === 'improved') {
      const status = target === 'improved' ? 'improved' : 'active'
      const { studentId, subject, studentName } = this.data
      wx.navigateTo({
        url: `/pages/bottleneck-center/bottleneck-center?studentId=${studentId}&studentName=${encodeURIComponent(studentName || '')}&subject=${subject}&status=${status}`
      })
    }
  },

  navigateByAction(actionType, payload = {}) {
    if (actionType === 'diagnosis') {
      this.onDiagnosisTap()
      return
    }
    if (actionType === 'verification') {
      this.navigateToVerification(payload.targetCode || '')
      return
    }
    if (actionType === 'defaultPaper') {
      this.onDefaultPaperTap()
      return
    }
    if (actionType === 'history') {
      this.onUploadHistoryTap()
      return
    }
    if (actionType === 'englishPractice') {
      this.navigateToEnglishPractice()
      return
    }
    if (actionType === 'englishDictation') {
      this.navigateToEnglishDictation()
      return
    }
    if (actionType === 'importVocabulary') {
      this.importEnglishVocabulary()
      return
    }
    if (actionType === 'latestReport' && payload.reportId) {
      wx.navigateTo({ url: `/pages/report/report?id=${payload.reportId}` })
    }
  },

  async importEnglishVocabulary() {
    if (!this.data.canWriteActions || this._importingEnglishVocabulary) return
    if (typeof cloud.seedEnglishPersonalVocabulary !== 'function') {
      wx.showToast({ title: '词库导入暂不可用', icon: 'none' })
      return
    }
    this._importingEnglishVocabulary = true
    wx.showLoading({ title: '正在导入词库' })
    try {
      const result = await cloud.seedEnglishPersonalVocabulary(this.data.studentId)
      await this.loadProfile()
      const imported = Number(result.importedWordCount) || 0
      wx.hideLoading()
      wx.showToast({
        title: imported > 0 ? `已导入${imported}词` : '词库已是最新',
        icon: 'success'
      })
    } catch (error) {
      console.error('导入英语个人词库失败', error)
      wx.hideLoading()
      wx.showToast({ title: '导入失败，请重试', icon: 'none' })
    } finally {
      this._importingEnglishVocabulary = false
    }
  },

  navigateToEnglishPractice() {
    if (!this.data.canWriteActions) return
    const { studentId, studentName, grade } = this.data
    wx.navigateTo({
      url: `/pages/english-practice/english-practice?studentId=${studentId}&studentName=${encodeURIComponent(studentName || '')}&grade=${grade || ''}`
    })
  },

  navigateToEnglishDictation() {
    if (!this.data.canWriteActions) return
    const { studentId, studentName, grade } = this.data
    wx.navigateTo({
      url: `/pages/english-dictation/english-dictation?studentId=${studentId}&studentName=${encodeURIComponent(studentName || '')}&grade=${grade || ''}`
    })
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

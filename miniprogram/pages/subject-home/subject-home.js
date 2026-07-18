// pages/subject-home/subject-home.js
const cloud = require('../../utils/cloud')
const { formatRelativeTime } = require('../../utils/util')
const { buildStatusText } = require('../../utils/learning-records')
const { createAnalysisPoller } = require('../../utils/analysis-poller')
const { buildSubjectHomeView } = require('./subject-home-presenter')
const { buildTraceableUrl } = require('../../utils/traceable-actions')
const { navigateToVerificationPaper, stopVerificationPoller } = require('../../utils/shared-navigation')
const { getSubjectColor } = require('../../utils/constants')
const { bindPageStatus } = require('../../utils/app-status')

const SUBJECT_HOME_CACHE_TTL_MS = 60 * 1000

Page({
  data: {
    studentId: '',
    subject: 'math',
    subjectName: '数学',
    subjectInitial: '数',
    studentName: '',
    grade: '',

    subjectTitle: '数学工作台',
    subjectIllustration: { alt: '数学学科' },
    primaryTask: null,
    taskQueue: [],
    pendingTaskCount: 0,
    chineseReviewQueue: [],
    hasChineseReviewQueue: false,
    tools: [],
    latestReportId: '',
    latestDiagnosis: null,
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
    englishActionCards: [],
    englishTodayPlan: null,
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

    wx.setNavigationBarTitle({
      title: subject === 'english' ? '英语词汇掌握' : `${decodedSubjectName}工作台`
    })
    this.setNavColor()

    // 统一状态感知：收到操作完成/缓存失效事件时强制刷新学科档案
    bindPageStatus(this, {
      studentIdGetter: () => this.data.studentId,
      subjectGetter: () => this.data.subject,
      handlers: {
        onOperationCompleted: () => {
          this._profileCacheInvalidated = true
          this.loadProfile({ force: true }).then(() => this.checkAnalysisStatus())
        },
        onCacheInvalidated: () => {
          this._profileCacheInvalidated = true
        }
      }
    })
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
  hasFreshProfileSnapshot() {
    const loadedAt = this._lastProfileLoadedAt || 0
    if (this._profileCacheInvalidated) return false
    if (!loadedAt || Date.now() - loadedAt > SUBJECT_HOME_CACHE_TTL_MS) return false
    // data 中没有 loading 字段，原 this.data.loading !== true 永远为 true，属无效判断，已移除
    return Boolean(this.data.primaryTask)
  },

  invalidateProfileCache() {
    this._profileCacheInvalidated = true
  },

  async loadProfile(options = {}) {
    if (!options.force && this.hasFreshProfileSnapshot()) {
      return
    }

    const { studentId, subject } = this.data
    try {
      if (typeof cloud.getSubjectDashboard === 'function') {
        try {
          const dashboard = await cloud.getSubjectDashboard(studentId, subject, { includePapers: false })
          const p = dashboard.profile
          const permissions = dashboard.permissions || {}
          this._profile = p || {}
          this._reports = dashboard.reports || []
          this.setData({
            permissions,
            canWriteActions: permissions.canUpload !== false || permissions.canGeneratePaper !== false,
            analysisStatus: p && p.analysisStatus || '',
            currentAnalysisId: p && p.currentAnalysisId || '',
          })
          await this.loadEnglishVocabulary(permissions)
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
    this.setData({
      analysisStatus: p && p.analysisStatus || '',
      currentAnalysisId: p && p.currentAnalysisId || '',
    })
    await this.loadEnglishVocabulary(this.data.permissions || {})
    this.applyDashboardView()
  },

  async loadEnglishVocabulary(permissions = {}) {
    this._englishVocabulary = null
    this._englishTodayPlan = null
    const { studentId, subject } = this.data
    if (subject !== 'english' || typeof cloud.getEnglishVocabularySummary !== 'function') return
    try {
      this._englishVocabulary = await cloud.getEnglishVocabularySummary(studentId)
      if (typeof cloud.getEnglishTodayPlan === 'function') {
        this._englishTodayPlan = await cloud.getEnglishTodayPlan(studentId)
      }
      this.autoSeedEnglishVocabularyIfNeeded(permissions)
    } catch (error) {
      console.warn('英语词库摘要读取失败，继续展示学科工作台', error && error.message ? error.message : error)
    }
  },

  async autoSeedEnglishVocabularyIfNeeded(permissions = {}) {
    const summary = this._englishVocabulary && this._englishVocabulary.summary || {}
    const canWrite = permissions.canUpload !== false || permissions.canGeneratePaper !== false
    if (!canWrite || Number(summary.totalWords) > 0) return
    if (this._englishAutoSeedAttempted || this._importingEnglishVocabulary) return
    if (typeof cloud.seedEnglishPersonalVocabulary !== 'function') return

    this._englishAutoSeedAttempted = true
    this._importingEnglishVocabulary = true
    this._englishAutoSeedPromise = (async () => {
      await cloud.seedEnglishPersonalVocabulary(this.data.studentId)
      this._englishVocabulary = await cloud.getEnglishVocabularySummary(this.data.studentId)
      this.applyDashboardView()
    })()
      .catch(error => {
        console.warn('英语个人词库自动导入失败', error && error.message ? error.message : error)
      })
      .finally(() => {
        this._importingEnglishVocabulary = false
      })
    return this._englishAutoSeedPromise
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
      englishTodayPlan: this._englishTodayPlan,
      permissions: this.data.permissions || {}
    })
    this.setData({ ...view, records: view.recentChanges })
    this._lastProfileLoadedAt = Date.now()
    this._profileCacheInvalidated = false
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
        this.loadProfile({ force: true })
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

  onKnowledgeMapTap() {
    const { studentId, studentName, subject } = this.data
    if (!studentId) {
      wx.showToast({ title: '缺少孩子信息', icon: 'none' })
      return
    }
    wx.navigateTo({
      url: `/pages/knowledge-map/knowledge-map?studentId=${studentId}&studentName=${encodeURIComponent(studentName || '')}&subject=${subject}`,
      fail: (err) => {
        console.error('跳转知识地图失败:', err)
        wx.showToast({ title: '跳转失败', icon: 'none' })
      },
    })
  },

  navigateToVerification(targetCode = '') {
    if (!this.data.canWriteActions) return
    const { studentId, subject } = this.data
    // 统一入口：状态分流 + 自动轮询。不要把 Promise 返回给小程序事件系统。
    navigateToVerificationPaper(cloud, { studentId, subject, reportId: '' })
      .catch(error => {
        console.error('打开验证卷失败', error)
      })
  },

  navigateToBottleneckDetail(lpCode = '', bottleneckId = '', viewId = '') {
    if (!lpCode && !bottleneckId && !viewId) return
    const { studentId, subject, subjectName, studentName } = this.data
    wx.navigateTo({
      url: `/pages/bottleneck-detail/bottleneck-detail?studentId=${studentId}&subject=${subject}&subjectName=${encodeURIComponent(subjectName)}&studentName=${encodeURIComponent(studentName)}&lpCode=${encodeURIComponent(lpCode)}&bottleneckId=${encodeURIComponent(bottleneckId)}&viewId=${encodeURIComponent(viewId)}`
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

  onLearningProgressTap() {
    const { studentId, subject, studentName } = this.data
    wx.navigateTo({
      url: buildTraceableUrl({ type: 'learning-progress', studentId, subject, studentName })
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
    const task = this.data.primaryTask || {}
    this.navigateByAction(task.actionType || (this.data.isFirstUse ? 'diagnosis' : 'verification'), task)
  },

  onTaskTap(e) {
    const { code, bottleneckId = '', viewId = '' } = e.currentTarget.dataset
    this.navigateToBottleneckDetail(code || '', bottleneckId, viewId)
  },

  onChineseReviewTap(e) {
    const reviewItemId = e.currentTarget.dataset.reviewItemId || ''
    if (!reviewItemId) return
    wx.navigateTo({ url: `/pages/chinese-review-detail/chinese-review-detail?studentId=${this.data.studentId}&studentName=${encodeURIComponent(this.data.studentName || '')}&reviewItemId=${encodeURIComponent(reviewItemId)}` })
  },

  onToolTap(e) {
    const { key } = e.currentTarget.dataset
    const tool = (this.data.tools || []).find(item => item.key === key)
    if (!tool) return
    this.navigateByAction(tool.actionType, tool)
  },

  onEnglishActionTap(e) {
    const { actionType, disabled } = e.currentTarget.dataset
    if (disabled) {
      wx.showToast({ title: '词库准备中，请稍后', icon: 'none' })
      return
    }
    this.navigateByAction(actionType)
  },

  onQuickStatTap(e) {
    const target = e.currentTarget.dataset.target || ''
    if (target === 'records') {
      this.onUploadHistoryTap()
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
      this.navigateToEnglishPractice(payload.taskSize)
      return
    }
    if (actionType === 'englishDictation') {
      this.navigateToEnglishDictation(payload.taskSize)
      return
    }
    if (actionType === 'englishWrongWords') {
      this.navigateToEnglishWrongWords()
      return
    }
    if (actionType === 'englishConfusion') {
      wx.navigateTo({ url: `/pages/english-confusion/english-confusion?studentId=${this.data.studentId}` })
      return
    }
    if (actionType === 'chineseSkillTask') {
      wx.navigateTo({ url: `/pages/chinese-skill-task/chinese-skill-task?studentId=${this.data.studentId}` })
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
      this._englishAutoSeedAttempted = true
      await this.loadProfile({ force: true })
      const imported = Number(result.importedWordCount) || 0
      wx.hideLoading()
      wx.showToast({
        title: imported > 0 ? `已导入${imported}词` : '词库已是最新',
        icon: 'success'
      })
    } catch (error) {
      console.error('导入英语个人词库失败', error)
      wx.hideLoading()
      wx.showToast({ title: '导入失败，请稍后重试', icon: 'none' })
    } finally {
      this._importingEnglishVocabulary = false
    }
  },

  navigateToEnglishPractice(taskSize = 0) {
    if (!this.data.canWriteActions) return
    const { studentId, studentName, grade } = this.data
    wx.navigateTo({
      url: `/pages/english-practice/english-practice?studentId=${studentId}&studentName=${encodeURIComponent(studentName || '')}&grade=${grade || ''}&wordLimit=${taskSize || ''}`
    })
  },

  navigateToEnglishDictation(taskSize = 0) {
    if (!this.data.canWriteActions) return
    const { studentId, studentName, grade } = this.data
    wx.navigateTo({
      url: `/pages/english-dictation/english-dictation?studentId=${studentId}&studentName=${encodeURIComponent(studentName || '')}&grade=${grade || ''}&wordLimit=${taskSize || ''}`
    })
  },

  navigateToEnglishWrongWords() {
    const { studentId, studentName, grade } = this.data
    wx.navigateTo({
      url: `/pages/english-wrong-words/english-wrong-words?studentId=${studentId}&studentName=${encodeURIComponent(studentName || '')}&grade=${grade || ''}`
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
    stopVerificationPoller()
  },

  onUnload() {
    if (this._poller) this._poller.stop()
    stopVerificationPoller()
  }
})

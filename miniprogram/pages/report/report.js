// pages/report/report.js
const cloud = require('../../utils/cloud')
const { formatChineseDateTime } = require('../../utils/util')
const { createAnalysisPoller } = require('../../utils/analysis-poller')
const { buildReportView } = require('./report-presenter')
const { getSubjectName } = require('../../utils/constants')
const { navigateToVerificationPaper, startVerificationPoller, stopVerificationPoller } = require('../../utils/shared-navigation')

function downloadCloudFile(fileID) {
  return new Promise((resolve, reject) => {
    const request = wx.cloud.downloadFile({
      fileID,
      success: resolve,
      fail: reject
    })
    if (request && typeof request.then === 'function') {
      request.then(resolve).catch(reject)
    }
  })
}

function openPdfDocument(filePath) {
  return new Promise((resolve, reject) => {
    const request = wx.openDocument({
      filePath,
      showMenu: true,
      success: resolve,
      fail: reject
    })
    if (request && typeof request.then === 'function') {
      request.then(resolve).catch(reject)
    }
  })
}

function pendingCountFromProfile(profile) {
  if (!profile) return 0
  if (Array.isArray(profile.currentBottlenecks)) {
    return profile.currentBottlenecks.filter(item => item.status !== 'improved').length
  }
  return (profile.pendingBottlenecks || []).length
}

function compactReportForData(report = {}) {
  const {
    imageFiles,
    imageFileIds,
    errorDetails,
    pageResults,
    rawPages,
    aiRaw,
    ...rest
  } = report || {}
  const imageFileCount = Array.isArray(imageFiles)
    ? imageFiles.length
    : (Array.isArray(imageFileIds) ? imageFileIds.length : Number(report.imageFileCount) || 0)
  const errorDetailCount = Array.isArray(errorDetails) ? errorDetails.length : Number(report.errorDetailCount) || 0
  return {
    ...rest,
    imageFileCount,
    errorDetailCount
  }
}

Page({
  data: {
    reportId: '',
    report: {},
    isVerification: false,
    dateText: '',
    // 预计算字段（WXML 不支持复杂表达式）
    bottleneckCount: 0,
    hasBottlenecks: false,
    hasBottleneckGroups: false,
    bottleneckGroups: [],
    showFlatBottleneckList: false,
    bottleneckList: [],       // 带 barWidth、severityText 的列表
    hasErrorDetails: false,
    errorDetailList: [],      // 带 expanded、displayIndex 的列表
    improvedCount: 0,
    worsenedCount: 0,
    pendingCount: 0,
    showNextStep: false,
    analysisStatusText: '',
    analysisProgress: 0,
    hasAnalysisProgress: false,
    analysisTaskMissing: false,
    retryingAnalysis: false,
    generatingPdf: false,
    permissions: {},
    canGeneratePaper: true,
    canRetryAnalysis: true,
    feedbackItems: [],
    feedbackByTarget: {},
    feedbackDialog: {
      visible: false,
      targetType: 'report',
      targetId: '',
      type: 'unclear_result',
      reason: '',
      note: ''
    },
    feedbackTypes: [
      { type: 'wrong_bottleneck', label: '卡点不准确' },
      { type: 'wrong_question', label: '错题识别错了' },
      { type: 'duplicate_photo', label: '照片重复/不清楚' },
      { type: 'unclear_result', label: '结果需要复核' },
      { type: 'other', label: '其他问题' }
    ],
    submittingFeedback: false
  },

  onLoad(options) {
    const id = options.id || options.reportId
    if (id) {
      this.setData({ reportId: id })
      this.loadReport(id)
    } else {
      wx.showToast({ title: '缺少报告信息', icon: 'none' })
    }
  },

  async fetchReportDetail(id) {
    if (typeof cloud.getReportDetail === 'function') {
      try {
        return await cloud.getReportDetail(id)
      } catch (error) {
        console.warn('报告详情接口不可用，回退到直接读取报告', error && error.message ? error.message : error)
      }
    }
    return {
      report: await cloud.getReport(id),
      // 回退路径无法确定权限，保守关闭所有写操作按钮，避免未授权用户看到可操作 UI。
      // 后端云函数仍会做二次权限校验（防御深度），这里只是 UI 层的安全默认值。
      permissions: {
        canUpload: false,
        canGeneratePaper: false,
        canRetryAnalysis: false,
        canManageParents: false
      }
    }
  },

  async loadFeedbackItems(id, detail = {}) {
    if (Array.isArray(detail.feedback)) return detail.feedback
    if (typeof cloud.getReportFeedback !== 'function') return []
    try {
      return await cloud.getReportFeedback(id)
    } catch (error) {
      console.warn('报告反馈读取失败，继续展示报告正文', error && error.message ? error.message : error)
      return []
    }
  },

  async loadReport(id) {
    if (id && this.data.reportId !== id) {
      this.setData({ reportId: id })
    }
    wx.showLoading({ title: '加载中...' })

    try {
      const detail = await this.fetchReportDetail(id)
      const report = detail.report
      const permissions = detail.permissions || {}

      if (!report) {
        wx.hideLoading()
        wx.showToast({ title: '报告不存在', icon: 'none' })
        return
      }

      const reportWithContext = {
        ...report,
        linkedPaper: detail.linkedPaper || detail.paper || report.linkedPaper
      }
      this._fullReport = reportWithContext
      const feedbackItems = await this.loadFeedbackItems(id, detail)
      const feedbackByTarget = this.buildFeedbackMap(feedbackItems)
      const dateText = formatChineseDateTime(report.createdAt)
      // 传 profile 给 presenter，让诊断报告展示全量合并卡点（而非单次报告的卡点）
      const view = buildReportView(reportWithContext, { profile: detail.profile || detail.subjectProfile || null })

      // 待验证卡点数优先来自报告详情，避免报告页再拉整套学科 Dashboard。
      var pendingCount = typeof detail.pendingCount === 'number'
        ? detail.pendingCount
        : pendingCountFromProfile(detail.profile || detail.subjectProfile)
      if (typeof detail.pendingCount !== 'number' && !detail.profile && !detail.subjectProfile) {
        try {
          var profile = null
          if (typeof cloud.getSubjectProfile === 'function') {
            profile = await cloud.getSubjectProfile(report.studentId, report.subject)
          } else if (typeof cloud.getSubjectDashboard === 'function') {
            var dashboard = await cloud.getSubjectDashboard(report.studentId, report.subject)
            profile = dashboard.profile
          }
          pendingCount = pendingCountFromProfile(profile)
        } catch (e) { console.error('获取学科档案失败:', e) }
      }

      this.setData({
        report: compactReportForData(reportWithContext),
        dateText: dateText,
        pendingCount: pendingCount,
        permissions,
        canGeneratePaper: permissions.canGeneratePaper !== false,
        canRetryAnalysis: permissions.canRetryAnalysis !== false,
        feedbackItems,
        feedbackByTarget,
        ...view
      })

      wx.setNavigationBarTitle({
        title: view.isVerification ? '验证报告' : '诊断报告'
      })

      // 如果正在分析中，启动轮询
      if (report.status === 'analyzing') {
        this.startPolling(id)
      }

      // 诊断报告（非验证报告）且有卡点时：静默检查验证卷是否在生成中，
      // 若是则启动轮询，生成完成后自动跳转预览（符合"异步自动生成、无需点击"）
      this.maybeStartVerificationPolling(report, view)

    } catch (err) {
      console.error('加载报告失败', err)
      wx.showToast({ title: '加载失败', icon: 'none' })
    } finally {
      wx.hideLoading()
    }
  },

  onExpandSourceEvidence() {
    if (!this._fullReport) return
    const expandedView = buildReportView(this._fullReport, { sourceEvidenceLimit: Infinity })
    this.setData({
      sourceEvidenceItems: expandedView.sourceEvidenceItems,
      hiddenSourceEvidenceCount: 0,
      hasMoreSourceEvidence: false
    })
  },

  onExpandErrorDetails() {
    if (!this._fullReport) return
    const expandedView = buildReportView(this._fullReport, { errorDetailLimit: Infinity })
    this.setData({
      errorDetailList: expandedView.errorDetailList,
      hiddenErrorDetailCount: 0,
      hasMoreErrorDetails: false
    })
  },

  // ========== 展开/收起错题详情 ==========
  onToggleError(e) {
    var idx = e.currentTarget.dataset.index
    var key = 'errorDetailList[' + idx + '].expanded'
    var current = this.data.errorDetailList[idx]
    this.setData({
      [key]: !current.expanded
    })
  },

  // ========== 查看验证卷（统一入口：状态分流 + 自动轮询 + 兜底重新生成） ==========
  async onGenerateVerification() {
    if (!this.data.canGeneratePaper) return
    var report = this._fullReport || this.data.report
    var reportId = this.data.reportId
    // 停止 onLoad 启动的轮询（用户主动点击时，由 navigateToVerificationPaper 管理）
    stopVerificationPoller()
    await navigateToVerificationPaper(cloud, {
      studentId: report.studentId,
      subject: report.subject,
      reportId
    })
  },

  // ========== 分享报告 ==========
  onShare() {
    wx.showToast({ title: '请点击右上角分享', icon: 'none' })
  },

  onShareAppMessage() {
    var report = this.data.report
    return {
      title: (report.studentName || '孩子') + '的学习诊断报告',
      path: '/pages/report/report?id=' + this.data.reportId,
      imageUrl: '/assets/images/app-logo-share.jpg'
    }
  },

  onViewSources() {
    const report = this.data.report
    const subjectName = getSubjectName(report.subject)
    wx.navigateTo({
      url: `/pages/upload-history/upload-history?studentId=${report.studentId}&subject=${report.subject}&subjectName=${encodeURIComponent(subjectName)}&studentName=${encodeURIComponent(report.studentName || '')}`
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

  onLearningResourceTap(e) {
    const dataset = e.currentTarget.dataset || {}
    const url = dataset.url || ''
    const platform = dataset.platform || '对应平台'
    if (!url) {
      wx.showToast({ title: '这个资源还没有链接', icon: 'none' })
      return
    }
    if (typeof wx.setClipboardData === 'function') {
      wx.setClipboardData({
        data: url,
        success: () => {
          wx.showToast({ title: `链接已复制，请到${platform}打开`, icon: 'none' })
        },
        fail: () => {
          wx.showToast({ title: '复制失败，请稍后重试', icon: 'none' })
        }
      })
      return
    }
    wx.showToast({ title: '当前环境不支持复制链接', icon: 'none' })
  },

  onCopyResourceUrl(e) {
    this.onLearningResourceTap(e)
  },

  onReportExplanationAction() {
    if (this.data.explanationActionType === 'generate-verification') {
      this.onGenerateVerification()
      return
    }
    const url = this.data.explanationActionUrl || ''
    if (!url) {
      wx.showToast({ title: '暂无下一步操作', icon: 'none' })
      return
    }
    wx.navigateTo({ url })
  },

  // 知识地图卡点入口：直跳 learning-resource（跳过 bottleneck-detail）
  async onBottleneckSnapshotTap(e) {
    const { lpCode, lpName } = e.currentTarget.dataset
    const report = this._fullReport || this.data
    if (!report.studentId || !lpCode) return

    wx.showLoading({ title: '加载讲解…' })
    try {
      // 生成学习任务包，直接跳到资源页
      const result = await cloud.generateLearningResourcePack({
        studentId: report.studentId,
        subject: report.subject,
        sourceReportId: report._id,
        target: { lpCode, lpName, bottleneckId: lpCode },
        resources: [],
      })
      wx.hideLoading()
      if (result.success && result.packId) {
        wx.navigateTo({ url: '/pages/learning-resource/learning-resource?packId=' + result.packId })
      } else {
        wx.showToast({ title: result.error || '加载失败', icon: 'none' })
      }
    } catch (err) {
      wx.hideLoading()
      wx.showToast({ title: err.message || '加载失败', icon: 'none' })
    }
  },

  noop() {},

  buildFeedbackMap(items) {
    return (items || []).reduce((acc, item) => {
      const key = this.feedbackKey(item.targetType || 'report', item.targetId || '')
      acc[key] = {
        submitted: true,
        type: item.type,
        feedbackId: item._id || item.feedbackId || ''
      }
      return acc
    }, {})
  },

  feedbackKey(targetType, targetId) {
    return `${targetType || 'report'}:${targetId || ''}`
  },

  onOpenFeedback(e) {
    const dataset = e.currentTarget.dataset || {}
    this.setData({
      feedbackDialog: {
        visible: true,
        targetType: dataset.targetType || 'report',
        targetId: dataset.targetId || '',
        type: dataset.type || 'unclear_result',
        reason: '',
        note: ''
      }
    })
  },

  onCloseFeedback() {
    this.setData({ 'feedbackDialog.visible': false })
  },

  onFeedbackTypeTap(e) {
    this.setData({ 'feedbackDialog.type': e.currentTarget.dataset.type || 'other' })
  },

  onFeedbackReasonInput(e) {
    this.setData({ 'feedbackDialog.reason': e.detail.value || '' })
  },

  onFeedbackNoteInput(e) {
    this.setData({ 'feedbackDialog.note': e.detail.value || '' })
  },

  async onSubmitFeedback() {
    if (this.data.submittingFeedback) return
    const dialog = this.data.feedbackDialog
    const reason = (dialog.reason || '').trim()
    if (!reason) {
      wx.showToast({ title: '请填写反馈原因', icon: 'none' })
      return
    }

    const payload = JSON.parse(JSON.stringify({
      reportId: this.data.reportId,
      type: dialog.type,
      targetType: dialog.targetType,
      targetId: dialog.targetId,
      reason,
      note: (dialog.note || '').trim()
    }))
    this.setData({ submittingFeedback: true })
    try {
      const result = await cloud.createReportFeedback(payload)
      const key = this.feedbackKey(payload.targetType, payload.targetId)
      const feedbackByTarget = {
        ...this.data.feedbackByTarget,
        [key]: {
          submitted: true,
          type: payload.type,
          feedbackId: result.feedbackId || (result.feedback && result.feedback._id) || ''
        }
      }
      this.setData({
        feedbackByTarget,
        feedbackDialog: {
          ...dialog,
          visible: false
        }
      })
      wx.showToast({ title: '已记录反馈', icon: 'success' })
    } catch (err) {
      console.error('提交反馈失败', err)
      wx.showToast({ title: '反馈提交失败', icon: 'none' })
    } finally {
      this.setData({ submittingFeedback: false })
    }
  },

  // ========== 轮询逻辑 ==========

  startPolling(reportId) {
    if (this._poller) this._poller.stop()
    this._poller = createAnalysisPoller({
      loadReport: async () => {
        const detail = typeof cloud.getReportDetail === 'function'
          ? await cloud.getReportDetail(reportId)
          : { report: await cloud.getReport(reportId) }
        return detail.report
      },
      loadProgress: () => cloud.getAnalysisProgress(reportId),
      onCompleted: () => {
        wx.showToast({ title: '诊断完成', icon: 'success' })
        this.loadReport(reportId)
      },
      onFailed: () => {
        wx.showToast({ title: '分析失败', icon: 'none' })
        this.setData({ analysisStatusText: '分析失败' })
      },
      onTimeoutStatus: () => {
        this.setData({
          analysisStatusText: '分析超时，请重新分析',
          analysisProgress: 0,
          hasAnalysisProgress: false,
          analysisTaskMissing: true
        })
      },
      onAnalyzing: state => {
        this.setData({
          analysisStatusText: state.taskMissing ? '分析任务未启动' : 'AI 分析中...',
          analysisProgress: Math.min(state.progressPercent, 90),
          hasAnalysisProgress: state.hasProgress,
          analysisTaskMissing: state.taskMissing
        })
      },
      onError: err => console.error('轮询报告状态失败', err),
      onTimeout: () => {
        wx.showToast({ title: '分析时间较长，请稍后查看', icon: 'none' })
        this.setData({ analysisStatusText: '分析超时，请稍后查看' })
      }
    })
    this._poller.start()
  },

  onRetryAnalysis() {
    if (!this.data.canRetryAnalysis) return
    if (this.data.retryingAnalysis) return
    this.setData({
      retryingAnalysis: true,
      analysisTaskMissing: false,
      analysisStatusText: '正在重新启动分析...'
    })

    cloud.callAnalyzePhotos({ reportId: this.data.reportId }, { timeout: 20000 })
      .then(() => this.loadReport(this.data.reportId))
      .catch(err => {
        if (cloud.isTimeoutError(err)) {
          this.setData({
            analysisTaskMissing: false,
            analysisStatusText: '分析已重新启动，正在后台处理'
          })
          this.startPolling(this.data.reportId)
        } else {
          console.error('重新分析失败', err)
          this.setData({
            analysisTaskMissing: true,
            analysisStatusText: '重新启动失败，请再次尝试'
          })
        }
      })
      .finally(() => this.setData({ retryingAnalysis: false }))
  },

  // ========== 下载 PDF ==========
  async onDownloadPDF() {
    if (this.data.generatingPdf) return
    this.setData({ generatingPdf: true })
    wx.showLoading({ title: '生成 PDF...' })

    try {
      const result = await cloud.callGenerateReportPDF({ reportId: this.data.reportId })

      wx.hideLoading()

      if (result.pdfFileId) {
        const dlRes = await downloadCloudFile(result.pdfFileId)
        await openPdfDocument(dlRes.tempFilePath)
      }
    } catch (err) {
      console.error('生成 PDF 失败', err)
      wx.hideLoading()
      wx.showToast({ title: '生成失败', icon: 'none' })
    } finally {
      this.setData({ generatingPdf: false })
    }
  },

  onHide() {
    if (this._poller) this._poller.stop()
    stopVerificationPoller()
  },

  onUnload() {
    if (this._poller) this._poller.stop()
    stopVerificationPoller()
  },

  // 静默检查验证卷状态：诊断报告且有卡点时，若验证卷正在生成则启动轮询
  async maybeStartVerificationPolling(report, view) {
    if (!report || !report.studentId) return
    // 只对诊断报告（非验证报告）生效
    if (view && view.isVerification) return
    // 没有待验证卡点则不触发
    var hasBottleneck = view && view.bottleneckCount > 0
    if (!hasBottleneck && !(this.data.pendingCount > 0)) return
    try {
      var result = await cloud.getActiveVerificationPaper(report.studentId, report.subject, this.data.reportId)
      var status = result.status || 'none'
      var paper = result.paper || null
      var progress = paper && paper.generationProgress ? paper.generationProgress : null
      var completedBatches = progress ? (progress.completedBatches || 0) : 0
      if (status === 'generating') {
        if (completedBatches > 0) {
          // 已有批次完成（别的入口在驱动），只轮询
          startVerificationPoller(cloud, report.studentId, report.subject, this.data.reportId)
        } else {
          // 0 批完成（analyzePhotos 只创建了记录），静默驱动生成
          // 不显示 loading（用户可能在看报告），生成完成后自动跳转
          this._silentDriveGeneration = true
          navigateToVerificationPaper(cloud, {
            studentId: report.studentId,
            subject: report.subject,
            reportId: this.data.reportId
          }).then(r => { this._silentDriveGeneration = false })
            .catch(() => { this._silentDriveGeneration = false })
        }
      }
    } catch (e) { /* 静默失败，不影响报告浏览 */ }
  }
})

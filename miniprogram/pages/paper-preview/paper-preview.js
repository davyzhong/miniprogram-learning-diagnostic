// pages/paper-preview/paper-preview.js
const cloud = require('../../utils/cloud')
const {
  subjectNameOf,
  getPaperName,
  getPaperCodeText,
  buildBottleneckSummaries,
  buildPageSummary,
  buildQuestionPreview,
  buildWorkbenchStatus,
  buildLifecycleSteps,
  buildPrimaryAction,
  buildFeedback,
  buildPaperPreviewState
} = require('./paper-preview-presenter')

Page({
  data: {
    mode: '',           // '' | 'preview' (from temp fileId)
    paperId: '',
    studentId: '',
    subject: 'math',
    grade: '',
    fileId: '',        // cloud file ID (for preview mode)
    pdfFileId: '',     // paper's pdfFileId (for paperId mode)

    typeText: '',
    paperType: 'verification',
    subjectName: '',
    studentName: '',
    paperName: '',
    paperCodeText: '',
    paperDate: '',
    paperCodeUrl: '',
    statusUrl: '',
    uploadUrl: '',
    bottleneckCenterUrl: '',
    questionCount: 0,
    estimatedMinutes: 0,
    pages: 1,
    studentPages: 1,
    answerPages: 1,
    pageSummary: '共 1 页 · A4 纸张',
    bottleneckTargets: [],
    bottleneckText: '',  // 预拼接的卡点文本
    bottleneckHierarchy: {
      hasHierarchy: false,
      totalCount: 0,
      groupCount: 0,
      summaryText: '',
      groups: []
    },
    questionPreview: [],
    hasMoreQuestions: false,
    allQuestionsExpanded: false,
    workbenchStatus: 'waiting',
    workbenchStatusText: '等待打印作答',
    workbenchStatusDesc: '下载 PDF 打印后让孩子纸面作答，完成后回到这里拍照上传验证。',
    lifecycleSteps: [],
    primaryActionType: 'download',
    primaryActionText: '下载验证卷',
    primaryActionUrl: '',
    secondaryActionType: 'upload',
    secondaryActionText: '上传作答照片',
    secondaryActionUrl: '',
    feedback: {
      hasFeedback: false,
      reportId: '',
      reportUrl: '',
      title: '暂无验证反馈',
      summary: '上传作答照片后，这里会显示批改结果和学习卡点变化。',
      chips: [],
      chipItems: []
    },
    taskPack: {
      hasTaskPack: false,
      totalPages: 0,
      completedPages: 0,
      pendingPages: 0,
      progressText: ''
    },
    taskPackPages: [],

    pdfReady: false,
    pdfDownloaded: false,
    downloading: false,
    uploadBtnText: '作答完成，拍照上传',
    paperLoadError: ''  // 试卷加载失败时的错误信息（非空时禁用上传）
  },

  onLoad(options) {
    const { paperId, fileId, type } = options

    if (paperId) {
      this.setData({ paperId, mode: 'paper' })
      this.loadPaper(paperId)
    } else if (fileId) {
      const decodedFileId = decodeURIComponent(fileId)

      this.setData({
        mode: 'preview',
        fileId: decodedFileId,
        typeText: type === 'verification' ? '验证试卷' : '诊断试卷',
        paperType: type === 'verification' ? 'verification' : 'diagnosis',
        pdfReady: true,
        pdfDownloaded: this.isPdfDownloaded(decodedFileId)
      })
    }
  },

  async loadPaper(paperId) {
    wx.showLoading({ title: '加载中...' })

    try {
      const detail = typeof cloud.getPaperDetail === 'function'
        ? await cloud.getPaperDetail(paperId)
        : { paper: await cloud.getPaper(paperId) }
      const p = detail.paper

      if (!p) {
        wx.hideLoading()
        const msg = '试卷不存在，可能已被更新替换'
        this.setData({ paperLoadError: msg })
        wx.showModal({
          title: '试卷不可用',
          content: '这份验证卷可能已被新的验证卷替换，请从学科工作台或报告页进入最新的验证卷。',
          showCancel: false,
          confirmText: '我知道了'
        })
        return
      }

      const questions = Array.isArray(p.questions) ? p.questions : []
      this._paperQuestions = questions
      const subjectName = this.getSubjectName(p.subject)
      const studentName = detail.student && detail.student.name
        ? detail.student.name
        : await this.getStudentName(p.studentId)

      this.setData(buildPaperPreviewState({
        paper: p,
        detail,
        subjectName,
        studentName,
        pdfDownloaded: this.isPdfDownloaded(p.pdfFileId || p._id)
      }))

      wx.setNavigationBarTitle({ title: this.data.paperName })

    } catch (err) {
      console.error('加载试卷失败', err)
      const msg = (err && err.message) || '加载试卷失败'
      this.setData({ paperLoadError: msg })
      wx.showToast({ title: '试卷加载失败，暂时无法上传答题', icon: 'none' })
    } finally {
      wx.hideLoading()
    }
  },

  // 下载 PDF
  async onDownload() {
    const { mode, pdfFileId, fileId, paperId } = this.data
    let cloudFileId = mode === 'paper' ? pdfFileId : fileId

    if (this.data.downloading) return

    if (!cloudFileId && mode === 'paper' && paperId && typeof cloud.callGeneratePaper === 'function') {
      this.setData({ downloading: true })
      wx.showLoading({ title: '生成 PDF...' })
      try {
        const result = await cloud.callGeneratePaper({ _regeneratePdf: true, paperId })
        if (!result || !result.pdfFileId) {
          throw new Error((result && result.error) || 'PDF 未生成')
        }
        cloudFileId = result.pdfFileId
        this.setData({
          pdfFileId: cloudFileId,
          pdfReady: true
        })
      } catch (err) {
        console.error('重新生成 PDF 失败', err)
        wx.hideLoading()
        wx.showToast({ title: 'PDF 生成失败', icon: 'none' })
        this.setData({ downloading: false })
        return
      }
    }

    if (!cloudFileId) {
      wx.showToast({ title: 'PDF 未生成', icon: 'none' })
      return
    }

    // 不再阻止重复下载：用户可能找不到文件需要重新下载

    this.setData({ downloading: true })
    wx.showLoading({ title: '下载中...' })

    try {
      const res = await wx.cloud.downloadFile({
        fileID: cloudFileId
      })
      wx.hideLoading()
      // 打开 PDF
      wx.openDocument({
        filePath: res.tempFilePath,
        showMenu: true,
        success: () => {},
        fail: (err) => {
          console.error('打开 PDF 失败', err)
          wx.showToast({ title: '打开失败', icon: 'none' })
        }
      })
      this.markPdfDownloaded(cloudFileId)
    } catch (err) {
      console.error('下载失败', err)
      wx.hideLoading()
      wx.showToast({ title: '下载失败', icon: 'none' })
    } finally {
      this.setData({ downloading: false })
    }
  },

  onShareAppMessage() {
    const { paperId, fileId, mode, typeText, paperCodeText } = this.data
    const shareTitle = [typeText, paperCodeText || this.data.paperName].filter(Boolean).join(' · ')
    if (mode === 'preview' && fileId) {
      // preview 模式下 fileId 是临时文件，分享后无法访问；禁用分享并提示
      wx.showToast({ title: '临时预览不可分享，请先保存试卷', icon: 'none' })
      return {
        title: shareTitle,
        path: '/pages/index/index',
      }
    }
    return {
      title: shareTitle,
      path: `/pages/paper-preview/paper-preview?paperId=${paperId}`,
    }
  },

  // 拍照上传
  onUpload() {
    // 试卷加载失败时阻止上传（防止用过期 paperId 分析失败）
    if (this.data.paperLoadError) {
      wx.showToast({ title: '试卷不可用，无法上传', icon: 'none' })
      return
    }
    const { paperId, studentId, subject, studentName, subjectName, grade, paperCodeText } = this.data
    const isVerification = this.data.typeText === '验证试卷'
    const uploadMode = isVerification ? 'verification' : 'paper'

    let url = `/pages/upload/upload?mode=${uploadMode}&studentId=${studentId}&subject=${subject}&studentName=${encodeURIComponent(studentName || '')}&subjectName=${encodeURIComponent(subjectName || '')}&grade=${grade || ''}`
    if (paperId) url += `&paperId=${paperId}`
    if (paperCodeText) url += `&paperCode=${encodeURIComponent(paperCodeText)}`

    wx.navigateTo({ url })
  },

  onPrimaryAction() {
    const { primaryActionType, primaryActionUrl } = this.data
    if (primaryActionType === 'download') {
      this.onDownload()
      return
    }
    if (primaryActionType === 'upload') {
      this.onUpload()
      return
    }
    if (primaryActionType === 'report' && primaryActionUrl) {
      wx.navigateTo({ url: primaryActionUrl })
      return
    }
    wx.showToast({ title: '暂无下一步操作', icon: 'none' })
  },

  onSecondaryAction() {
    const { secondaryActionType, secondaryActionUrl } = this.data
    if (secondaryActionType === 'upload') {
      this.onUpload()
      return
    }
    if (secondaryActionType === 'report' && secondaryActionUrl) {
      wx.navigateTo({ url: secondaryActionUrl })
      return
    }
    wx.showToast({ title: '暂无下一步操作', icon: 'none' })
  },

  onToggleQuestions() {
    if (!this.data.paperId) return
    const expand = !this.data.allQuestionsExpanded
    const questions = (this._paperQuestions || [])
    const context = {
      studentId: this.data.studentId,
      studentName: this.data.studentName,
      subject: this.data.subject,
      subjectName: this.data.subjectName,
      grade: this.data.grade,
      paperId: this.data.paperId
    }
    this.setData({
      questionPreview: buildQuestionPreview(questions, expand, context),
      allQuestionsExpanded: expand
    })
  },

  onViewFeedbackReport() {
    const reportId = this.data.feedback && this.data.feedback.reportId
    if (!reportId) {
      wx.showToast({ title: '暂无反馈报告', icon: 'none' })
      return
    }
    wx.navigateTo({ url: `/pages/report/report?id=${reportId}` })
  },

  onTraceableUrlTap(e) {
    const url = e && e.currentTarget && e.currentTarget.dataset
      ? e.currentTarget.dataset.url
      : ''
    if (!url) {
      wx.showToast({ title: '暂无可查看内容', icon: 'none' })
      return
    }
    wx.navigateTo({ url })
  },

  // 工具函数
  getSubjectName(subject) {
    return subjectNameOf(subject)
  },

  async getStudentName(studentId) {
    if (!studentId) return ''
    try {
      const student = await cloud.getStudent(studentId)
      return student ? student.name : ''
    } catch (e) { return '' }
  },

  getPaperName(paper) {
    return getPaperName(paper)
  },

  getPaperCodeText(paper) {
    return getPaperCodeText(paper)
  },

  buildBottleneckSummaries(paper) {
    return buildBottleneckSummaries(paper)
  },

  buildPageSummary(paper) {
    return buildPageSummary(paper)
  },

  buildQuestionPreview(questions = [], expanded = false) {
    return buildQuestionPreview(questions, expanded)
  },

  buildWorkbenchStatus(report) {
    return buildWorkbenchStatus(report)
  },

  buildFeedback(report) {
    return buildFeedback(report)
  },

  getDownloadedStorageKey(cloudFileId) {
    return `downloaded_pdf_${cloudFileId || ''}`
  },

  isPdfDownloaded(cloudFileId) {
    if (!cloudFileId || typeof wx.getStorageSync !== 'function') return false
    try {
      return !!wx.getStorageSync(this.getDownloadedStorageKey(cloudFileId))
    } catch (e) {
      return false
    }
  },

  markPdfDownloaded(cloudFileId) {
    if (!cloudFileId) return
    if (typeof wx.setStorageSync === 'function') {
      try {
        wx.setStorageSync(this.getDownloadedStorageKey(cloudFileId), true)
      } catch (e) {}
    }
    const nextData = { pdfDownloaded: true }
    const feedback = this.data.feedback || {}
    if (!feedback.reportId && this.data.workbenchStatus === 'generated') {
      const workbenchStatus = buildWorkbenchStatus(null, { pdfDownloaded: true })
      const primaryAction = buildPrimaryAction(workbenchStatus.status, { uploadUrl: this.data.uploadUrl })
      Object.assign(nextData, {
        workbenchStatus: workbenchStatus.status,
        workbenchStatusText: workbenchStatus.text,
        workbenchStatusDesc: workbenchStatus.desc,
        lifecycleSteps: buildLifecycleSteps(workbenchStatus.status),
        ...primaryAction,
        uploadBtnText: primaryAction.primaryActionText
      })
    }
    this.setData(nextData)
  }
})

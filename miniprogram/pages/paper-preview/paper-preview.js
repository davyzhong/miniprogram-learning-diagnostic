// pages/paper-preview/paper-preview.js
const cloud = require('../../utils/cloud')
const {
  buildPaperDisplay,
  paperBottleneckSummaries,
  paperCodeOf,
  paperPageInfo,
  paperTitleOf
} = require('../../utils/paper-display')
const {
  bottleneckLabelOf,
  bottleneckListText
} = require('../../utils/learning-records')
const { getSubjectName } = require('../../utils/constants')

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
    questionCount: 0,
    estimatedMinutes: 0,
    pages: 1,
    studentPages: 1,
    answerPages: 1,
    pageSummary: '共 1 页 · A4 纸张',
    bottleneckTargets: [],
    bottleneckText: '',  // 预拼接的卡点文本
    questionPreview: [],
    hasMoreQuestions: false,
    allQuestionsExpanded: false,
    workbenchStatus: 'waiting',
    workbenchStatusText: '等待打印作答',
    workbenchStatusDesc: '下载或分享打印后，让孩子在纸面完成作答，再回到这里上传验证。',
    feedback: {
      hasFeedback: false,
      reportId: '',
      title: '暂无验证反馈',
      summary: '上传作答照片后，这里会显示批改结果和学习卡点变化。',
      chips: []
    },

    pdfReady: false,
    pdfDownloaded: false,
    downloading: false,
    uploadBtnText: '作答完成，拍照上传'
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
        wx.showToast({ title: '试卷不存在', icon: 'none' })
        return
      }

      const isVerification = p.type === 'verification'
      const questions = Array.isArray(p.questions) ? p.questions : []
      this._paperQuestions = questions
      const latestReport = detail.latestVerificationReport || detail.latestReport || null
      const subjectName = this.getSubjectName(p.subject)
      const paperDisplay = buildPaperDisplay(p, subjectName)
      const paperCodeText = paperDisplay.paperCode
      const studentName = detail.student && detail.student.name
        ? detail.student.name
        : await this.getStudentName(p.studentId)
      const workbenchStatus = this.buildWorkbenchStatus(latestReport)
      const feedback = this.buildFeedback(latestReport)

      this.setData({
        paperId: p._id,
        studentId: p.studentId || '',
        subject: p.subject || 'math',
        grade: p.grade || '',
        pdfFileId: p.pdfFileId || '',
        typeText: isVerification ? '验证试卷' : '诊断试卷',
        paperType: isVerification ? 'verification' : 'diagnosis',
        subjectName,
        studentName,
        paperName: paperDisplay.paperTitle,
        paperCodeText,
        paperDate: p.paperDate || '',
        questionCount: paperDisplay.questionCount,
        estimatedMinutes: p.estimatedMinutes || (paperDisplay.questionCount * 2),
        pages: paperDisplay.totalPages,
        studentPages: paperDisplay.studentPages,
        answerPages: paperDisplay.answerPages,
        pageSummary: paperDisplay.pageSummary,
        bottleneckTargets: p.bottleneckTargets || [],
        bottleneckText: paperDisplay.bottleneckText,
        questionPreview: this.buildQuestionPreview(questions, false),
        hasMoreQuestions: questions.length > 4,
        allQuestionsExpanded: false,
        workbenchStatus: workbenchStatus.status,
        workbenchStatusText: workbenchStatus.text,
        workbenchStatusDesc: workbenchStatus.desc,
        feedback,
        pdfReady: !!p.pdfFileId,
        pdfDownloaded: this.isPdfDownloaded(p.pdfFileId || p._id),
        uploadBtnText: `作答完成，${isVerification ? '上传验证' : '上传答题'}`
      })

      wx.setNavigationBarTitle({ title: this.data.paperName })

    } catch (err) {
      console.error('加载试卷失败', err)
      wx.showToast({ title: '加载失败', icon: 'none' })
    } finally {
      wx.hideLoading()
    }
  },

  // 下载 PDF
  async onDownload() {
    const { mode, pdfFileId, fileId } = this.data
    const cloudFileId = mode === 'paper' ? pdfFileId : fileId

    if (!cloudFileId) {
      wx.showToast({ title: 'PDF 未生成', icon: 'none' })
      return
    }
    if (this.data.pdfDownloaded) {
      wx.showToast({ title: 'PDF 已下载', icon: 'none' })
      return
    }
    if (this.data.downloading) return

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

  // 分享打印
  onSharePrint() {
    wx.showToast({ title: '请点击右上角分享', icon: 'none' })
  },

  onShareAppMessage() {
    const { paperId, fileId, mode, typeText, paperCodeText } = this.data
    const shareTitle = [typeText, paperCodeText || this.data.paperName].filter(Boolean).join(' · ')
    if (mode === 'preview' && fileId) {
      // preview 模式下 fileId 是临时文件，分享后无法访问；禁用分享并提示
      return {
        title: shareTitle,
        path: `/pages/paper-preview/paper-preview?fileId=${encodeURIComponent(fileId)}`,
      }
    }
    return {
      title: shareTitle,
      path: `/pages/paper-preview/paper-preview?paperId=${paperId}`,
    }
  },

  // 拍照上传
  onUpload() {
    const { paperId, studentId, subject, studentName, subjectName, grade, paperCodeText } = this.data
    const isVerification = this.data.typeText === '验证试卷'
    const uploadMode = isVerification ? 'verification' : 'paper'

    let url = `/pages/upload/upload?mode=${uploadMode}&studentId=${studentId}&subject=${subject}&studentName=${encodeURIComponent(studentName || '')}&subjectName=${encodeURIComponent(subjectName || '')}&grade=${grade || ''}`
    if (paperId) url += `&paperId=${paperId}`
    if (paperCodeText) url += `&paperCode=${encodeURIComponent(paperCodeText)}`

    wx.navigateTo({ url })
  },

  onToggleQuestions() {
    if (!this.data.paperId) return
    const expand = !this.data.allQuestionsExpanded
    const questions = (this._paperQuestions || [])
    this.setData({
      questionPreview: this.buildQuestionPreview(questions, expand),
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

  // 工具函数
  getSubjectName(subject) {
    return getSubjectName(subject, subject || '')
  },

  async getStudentName(studentId) {
    if (!studentId) return ''
    try {
      const student = await cloud.getStudent(studentId)
      return student ? student.name : ''
    } catch (e) { return '' }
  },

  getPaperName(paper) {
    if (!paper) return ''
    return paperTitleOf(paper)
  },

  getPaperCodeText(paper) {
    return paperCodeOf(paper, paper ? this.getSubjectName(paper.subject) : '')
  },

  buildBottleneckSummaries(paper) {
    return paperBottleneckSummaries(paper)
  },

  buildPageSummary(paper) {
    return paperPageInfo(paper).pageSummary
  },

  buildQuestionPreview(questions = [], expanded = false) {
    const source = Array.isArray(questions) ? questions : []
    const visible = expanded ? source : source.slice(0, 4)
    return visible.map((question, index) => ({
      number: question.index || index + 1,
      content: question.content || '题目内容待加载',
      bottleneckName: bottleneckLabelOf(question)
    }))
  },

  buildWorkbenchStatus(report) {
    if (!report) {
      return {
        status: 'waiting',
        text: '等待打印作答',
        desc: '下载或分享打印后，让孩子在纸面完成作答，再回到这里上传验证。'
      }
    }
    if (report.status === 'analyzing') {
      return {
        status: 'analyzing',
        text: '反馈分析中',
        desc: '作答照片已经上传，AI 正在整理批改结果和学习卡点变化。'
      }
    }
    if (report.status === 'failed') {
      return {
        status: 'failed',
        text: '反馈分析失败',
        desc: '这次验证反馈没有完成，可以重新上传作答照片。'
      }
    }
    return {
      status: 'completed',
      text: '已生成验证反馈',
      desc: '可以查看批改结果、评语和学习卡点改善情况。'
    }
  },

  buildFeedback(report) {
    if (!report) {
      return {
        hasFeedback: false,
        reportId: '',
        title: '暂无验证反馈',
        summary: '上传作答照片后，这里会显示批改结果和学习卡点变化。',
        chips: []
      }
    }

    const evidence = Array.isArray(report.verificationEvidence) ? report.verificationEvidence : []
    const improvedCount = evidence.filter(item => item.complete && item.allCorrect).length
    const bottleneckText = bottleneckListText(report.bottlenecks || [])
    return {
      hasFeedback: report.status === 'completed',
      reportId: report._id || '',
      title: report.status === 'completed' ? '验证反馈已完成' : (report.status === 'failed' ? '验证反馈失败' : '正在分析反馈'),
      summary: report.comparisonSummary || report.changeSummary || report.summary || '反馈报告生成后会在这里展示。',
      chips: [
        improvedCount > 0 ? `${improvedCount} 个卡点有改善` : '',
        bottleneckText ? `仍需关注：${bottleneckText}` : '',
        report.status === 'failed' ? '可重新上传' : ''
      ].filter(Boolean)
    }
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
    this.setData({ pdfDownloaded: true })
  }
})

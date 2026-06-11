// pages/paper-preview/paper-preview.js
const cloud = require('../../utils/cloud')

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
    subjectName: '',
    studentName: '',
    paperName: '',
    questionCount: 0,
    estimatedMinutes: 0,
    pages: 1,
    bottleneckTargets: [],
    bottleneckText: '',  // 预拼接的卡点文本

    pdfReady: false,
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
        pdfReady: true
      })
    }
  },

  async loadPaper(paperId) {
    wx.showLoading({ title: '加载中...' })

    try {
      const p = await cloud.getPaper(paperId)

      if (!p) {
        wx.hideLoading()
        wx.showToast({ title: '试卷不存在', icon: 'none' })
        return
      }

      const isVerification = p.type === 'verification'
      const uploadMode = isVerification ? 'verification' : 'paper'

      this.setData({
        paperId: p._id,
        studentId: p.studentId || '',
        subject: p.subject || 'math',
        grade: p.grade || '',
        pdfFileId: p.pdfFileId || '',
        typeText: isVerification ? '验证试卷' : '诊断试卷',
        subjectName: this.getSubjectName(p.subject),
        studentName: await this.getStudentName(p.studentId),
        paperName: this.getPaperName(p),
        questionCount: (p.questions || []).length,
        estimatedMinutes: p.estimatedMinutes || ((p.questions || []).length * 2),
        pages: p.totalPages || 1,
        bottleneckTargets: p.bottleneckTargets || [],
        bottleneckText: (p.bottleneckTargets || []).join('、'),
        pdfReady: !!p.pdfFileId,
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
    const { paperId, typeText } = this.data
    return {
      title: `${typeText} - ${this.data.paperName}`,
      path: `/pages/paper-preview/paper-preview?paperId=${paperId}`,
    }
  },

  // 拍照上传
  onUpload() {
    const { paperId, studentId, subject, studentName, subjectName, grade } = this.data
    const isVerification = this.data.typeText === '验证试卷'
    const uploadMode = isVerification ? 'verification' : 'paper'

    let url = `/pages/upload/upload?mode=${uploadMode}&studentId=${studentId}&subject=${subject}&studentName=${encodeURIComponent(studentName || '')}&subjectName=${encodeURIComponent(subjectName || '')}&grade=${grade || ''}`
    if (paperId) url += `&paperId=${paperId}`

    wx.navigateTo({ url })
  },

  // 工具函数
  getSubjectName(subject) {
    const map = { math: '数学', chinese: '语文', english: '英语' }
    return map[subject] || subject || ''
  },

  async getStudentName(studentId) {
    if (!studentId) return ''
    try {
      const student = await cloud.getStudent(studentId)
      return student ? student.name : ''
    } catch (e) { return '' }
  },

  getPaperName(paper) {
    if (paper.type === 'verification') return '验证试卷'
    if (paper.type === 'default-diagnosis') {
      const grade = paper.grade || ''
      const key = paper.paperKey || ''
      return `${grade}年级 ${key.toUpperCase()} 卷`
    }
    return '诊断试卷'
  }
})

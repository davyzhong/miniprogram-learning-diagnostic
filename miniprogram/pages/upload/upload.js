// pages/upload/upload.js
const cloud = require('../../utils/cloud')
const { paperCodeOf } = require('../../utils/learning-records')

function getFileName(filePath, index) {
  const cleanPath = String(filePath || '').split('?')[0]
  return cleanPath.split('/').pop() || `照片${index + 1}.jpg`
}

// 场景配置
const MODE_CONFIG = {
  diagnosis: {
    title: '拍照上传试卷',
    desc: '请拍摄或选择孩子的试卷/作业照片，AI 将分析错题并定位卡点'
  },
  verification: {
    title: '上传验证试卷答题',
    desc: '请拍摄或选择验证试卷的答题照片，AI 将分析卡点改善情况'
  },
  paper: {
    title: '上传诊断试卷答题',
    desc: '请拍摄或选择诊断试卷的答题照片，AI 将分析错题并定位卡点'
  }
}

Page({
  data: {
    mode: 'diagnosis',
    studentId: '',
    subject: 'math',
    subjectName: '',
    studentName: '',
    grade: '',
    paperId: '',       // 验证/默认试卷上传时有值
    paperCodeText: '',
    paperName: '',
    paperQuestionCount: 0,

    pageTitle: '',
    pageDesc: '',

    images: [],          // { tempPath, fileId, uploaded }
    canSubmit: false,
    uploading: false,
    uploadedCount: 0,
    uploadProgress: 0,
    submitBtnText: '上传并开始分析',
    existingFileNames: [],
  },

  onLoad(options) {
    const { mode, studentId, subject, subjectName, studentName, grade, paperId, paperCode } = options
    const m = mode || 'diagnosis'
    const cfg = MODE_CONFIG[m] || MODE_CONFIG.diagnosis

    this.setData({
      mode: m,
      studentId: studentId || '',
      subject: subject || 'math',
      subjectName: decodeURIComponent(subjectName || ''),
      studentName: decodeURIComponent(studentName || ''),
      grade: grade || '',
      paperId: paperId || '',
      paperCodeText: decodeURIComponent(paperCode || ''),
      pageTitle: cfg.title,
      pageDesc: cfg.desc,
    })

    wx.setNavigationBarTitle({ title: cfg.title })
    this.loadExistingFileNames()
    if (paperId) this.loadPaperContext(paperId)
  },

  async loadPaperContext(paperId) {
    try {
      const detail = typeof cloud.getPaperDetail === 'function'
        ? await cloud.getPaperDetail(paperId)
        : { paper: await cloud.getPaper(paperId) }
      const paper = detail.paper
      if (!paper) return
      this.setData({
        paperCodeText: this.data.paperCodeText || this.getPaperCodeText(paper),
        paperName: this.getPaperName(paper),
        paperQuestionCount: (paper.questions || []).length || paper.questionCount || 0
      })
    } catch (err) {
      console.warn('读取试卷上传上下文失败', err)
    }
  },

  async loadExistingFileNames() {
    try {
      const reports = await cloud.getReports(this.data.studentId, this.data.subject, 20)
      const existingFileNames = reports.flatMap(report => (
        Array.isArray(report.imageFiles) ? report.imageFiles.map(photo => photo.fileName).filter(Boolean) : []
      ))
      this.setData({ existingFileNames })
    } catch (err) {
      console.warn('读取历史照片文件名失败', err)
    }
  },

  // ========== 选择图片 ==========
  onChooseImage() {
    const { images } = this.data
    const remain = 20 - images.length
    if (remain <= 0) {
      wx.showToast({ title: '最多选择 20 张', icon: 'none' })
      return
    }

    wx.chooseMedia({
      count: remain,
      mediaType: ['image'],
      sourceType: ['album', 'camera'],
      sizeType: ['compressed'],
      success: (res) => {
        const knownNames = new Set([
          ...this.data.existingFileNames,
          ...images.map(image => image.fileName)
        ])
        const newImages = res.tempFiles.map((f, index) => {
          const fileName = getFileName(f.tempFilePath, images.length + index)
          const nameDuplicate = knownNames.has(fileName)
          knownNames.add(fileName)
          return {
            tempPath: f.tempFilePath,
            fileName,
            fileSize: Number(f.size) || 0,
            nameDuplicate,
            fileId: '',
            uploaded: false
          }
        })
        const updated = images.concat(newImages)
        this.setData({
          images: updated,
          canSubmit: updated.length > 0,
          submitBtnText: '上传并开始分析 (' + updated.length + '张)'
        })
        if (newImages.some(image => image.nameDuplicate)) {
          wx.showToast({ title: '发现同名照片，仍可继续上传', icon: 'none' })
        }
      }
    })
  },

  // ========== 删除图片 ==========
  onDeleteImage(e) {
    const idx = e.currentTarget.dataset.index
    const { images } = this.data
    const updated = images.filter((_, index) => index !== idx)
    this.setData({
      images: updated,
      canSubmit: updated.length > 0,
      submitBtnText: '上传并开始分析 (' + updated.length + '张)'
    })
  },

  // ========== 图片加载失败 ==========
  onImageLoadError(e) {
    const idx = e.currentTarget.dataset.index
    wx.showToast({ title: '第' + (idx + 1) + '张图片加载失败', icon: 'none' })
  },

  // ========== 提交上传 ==========
  async onSubmit() {
    if (this.data.uploading) return
    const { images, mode, studentId, subject, paperId } = this.data
    if (images.length === 0) return

    this.setData({ uploading: true, uploadedCount: 0, uploadProgress: 0, submitBtnText: '上传中...' })

    try {
      wx.showLoading({ title: '上传中...' })

      // 1. 逐张上传到云存储，重试时复用已经上传成功的图片
      const fileIds = []
      for (let i = 0; i < images.length; i++) {
        const image = this.data.images[i]
        const fileId = image.uploaded && image.fileId
          ? image.fileId
          : await this.uploadOne(image, i)
        fileIds.push(fileId)

        const updatedImages = this.data.images.map((item, index) => index === i
          ? {
              ...item,
              fileId,
              uploaded: true,
              uploadError: ''
            }
          : item)
        const progress = Math.round(((i + 1) / images.length) * 100)
        this.setData({
          images: updatedImages,
          uploadedCount: i + 1,
          uploadProgress: progress
        })
      }

      wx.hideLoading()

      // 2. 云函数创建报告并 fire-and-forget 启动分析（秒回）
      await cloud.callUploadAndAnalyze({
        fileIDs: fileIds,
        imageMetas: this.data.images.map(image => ({
          fileName: image.fileName,
          fileSize: image.fileSize
        })),
        studentId,
        subject,
        mode,
        paperId: paperId || ''
      })

      wx.showToast({ title: '已提交，AI 正在分析', icon: 'success', duration: 2000 })
      setTimeout(() => wx.navigateBack(), 1200)
    } catch (err) {
      wx.hideLoading()
      const failedIndex = this.data.images.findIndex(image => !image.uploaded)
      const errorImages = failedIndex >= 0
        ? this.data.images.map((image, index) => index === failedIndex
          ? { ...image, uploadError: err.message || '上传失败' }
          : image)
        : this.data.images
      this.setData({ uploading: false, images: errorImages, submitBtnText: '重试上传并分析' })
      console.error('上传或提交分析失败', err)
      wx.showToast({ title: err.message || '上传失败，请重试', icon: 'none' })
    }
  },

  // ========== 上传单张图片 ==========
  uploadOne(image, index) {
    return new Promise((resolve, reject) => {
      const { studentId, subject } = this.data
      const tempPath = typeof image === 'string' ? image : image.tempPath
      const cloudPath = `uploads/${studentId}/${subject}/${Date.now()}_${index}.jpg`

      wx.cloud.uploadFile({
        cloudPath,
        filePath: tempPath,
        success: (res) => resolve(res.fileID),
        fail: (err) => reject(err)
      })
    })
  },

  getSubjectName(subject) {
    const map = { math: '数学', chinese: '语文', english: '英语' }
    return map[subject] || subject || '试卷'
  },

  getPaperName(paper) {
    if (!paper) return ''
    if (paper.type === 'verification') return '验证试卷'
    if (paper.type === 'default-diagnosis') return '诊断试卷'
    return '试卷'
  },

  getPaperCodeText(paper) {
    if (!paper) return ''
    const savedCode = paperCodeOf(paper)
    if (savedCode) return savedCode
    const dateText = String(paper.paperDate || '').replace(/-/g, '')
    if (dateText) return `${this.getSubjectName(paper.subject)}-${dateText}`
    if (paper._id) return `试卷-${String(paper._id).slice(-6)}`
    return ''
  },

  onUnload() {
    this.setData({ uploading: false })
  }
})

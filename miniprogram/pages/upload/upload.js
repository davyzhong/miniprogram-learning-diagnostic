// pages/upload/upload.js
const cloud = require('../../utils/cloud')

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
    const { mode, studentId, subject, subjectName, studentName, grade, paperId } = options
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
      pageTitle: cfg.title,
      pageDesc: cfg.desc,
    })

    wx.setNavigationBarTitle({ title: cfg.title })
    this.loadExistingFileNames()
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

    let analysisSubmitted = false
    try {
      wx.showLoading({ title: '上传中...' })

      // 1. 逐张上传到云存储
      const fileIds = []
      for (let i = 0; i < images.length; i++) {
        const fileId = await this.uploadOne(images[i].tempPath, i)
        fileIds.push(fileId)

        const progress = Math.round(((i + 1) / images.length) * 100)
        this.setData({
          uploadedCount: i + 1,
          uploadProgress: progress
        })
      }

      wx.hideLoading()

      // 2. 云函数在服务端创建报告并可靠启动分析。
      analysisSubmitted = true
      await cloud.callUploadAndAnalyze({
        fileIDs: fileIds,
        imageMetas: images.map(image => ({
          fileName: image.fileName,
          fileSize: image.fileSize
        })),
        studentId,
        subject,
        mode,
        paperId: paperId || ''
      }, { timeout: 20000 })

      wx.showToast({ title: '已提交，AI 正在分析', icon: 'success', duration: 2000 })
      setTimeout(() => wx.navigateBack(), 1200)
    } catch (err) {
      wx.hideLoading()
      this.setData({ uploading: false })
      if (analysisSubmitted && cloud.isTimeoutError(err)) {
        wx.showToast({ title: '已提交，AI将在后台分析', icon: 'none', duration: 2500 })
        setTimeout(() => wx.navigateBack(), 1200)
      } else {
        console.error('上传或提交分析失败', err)
        wx.showToast({ title: err.message || '上传失败，请重试', icon: 'none' })
      }
    }
  },

  // ========== 上传单张图片 ==========
  uploadOne(tempPath, index) {
    return new Promise((resolve, reject) => {
      const { studentId, subject } = this.data
      const cloudPath = `uploads/${studentId}/${subject}/${Date.now()}_${index}.jpg`

      wx.cloud.uploadFile({
        cloudPath,
        filePath: tempPath,
        success: (res) => resolve(res.fileID),
        fail: (err) => reject(err)
      })
    })
  },

  onUnload() {
    this.setData({ uploading: false })
  }
})

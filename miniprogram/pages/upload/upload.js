// pages/upload/upload.js
const cloud = require('../../utils/cloud')

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
        const newImages = res.tempFiles.map(f => ({
          tempPath: f.tempFilePath,
          fileId: '',
          uploaded: false
        }))
        const updated = images.concat(newImages)
        this.setData({
          images: updated,
          canSubmit: updated.length > 0,
          submitBtnText: '上传并开始分析 (' + updated.length + '张)'
        })
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

  // ========== 提交上传 ==========
  async onSubmit() {
    if (this.data.uploading) return
    const { images, mode, studentId, subject, paperId } = this.data
    if (images.length === 0) return

    this.setData({ uploading: true, uploadedCount: 0, uploadProgress: 0, submitBtnText: '上传中...' })

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

      // 2. 创建报告后立即返回，再启动独立分析任务。
      const createResult = await cloud.callUploadAndAnalyze({
        fileIDs: fileIds,
        studentId,
        subject,
        mode,
        paperId: paperId || ''
      })

      cloud.callAnalyzePhotos({ reportId: createResult.reportId }).catch(err => {
        console.error('[upload] 后台分析启动失败：', err)
      })

      wx.showToast({ title: '已提交，AI分析中', icon: 'success', duration: 2000 })
      setTimeout(() => wx.navigateBack(), 1200)
    } catch (err) {
      console.error('上传失败', err)
      wx.hideLoading()
      this.setData({ uploading: false })
      wx.showToast({ title: err.message || '上传失败，请重试', icon: 'none' })
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

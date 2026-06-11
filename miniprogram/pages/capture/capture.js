const cloud = require('../../utils/cloud')
const util = require('../../utils/util')

Page({
  data: {
    studentId: '',
    studentName: '',
    photos: [],       // [{tempFilePath, cloudFileId}]
    uploading: false,
    analyzing: false,
    progressText: ''
  },

  onLoad(options) {
    this.setData({
      studentId: options.studentId || '',
      studentName: decodeURIComponent(options.studentName || '')
    })
  },

  // 拍照
  onTakePhoto() {
    wx.chooseMedia({
      count: 1,
      mediaType: ['image'],
      sourceType: ['camera'],
      sizeType: ['compressed'],
      success: (res) => {
        const photo = { tempFilePath: res.tempFiles[0].tempFilePath, cloudFileId: '' }
        this.setData({ photos: [...this.data.photos, photo] })
      }
    })
  },

  // 从相册选择（可多选）
  onChooseFromAlbum() {
    const remaining = 20 - this.data.photos.length
    if (remaining <= 0) {
      wx.showToast({ title: '最多选 20 张', icon: 'none' })
      return
    }
    wx.chooseMedia({
      count: remaining,
      mediaType: ['image'],
      sourceType: ['album'],
      sizeType: ['compressed'],
      success: (res) => {
        const newPhotos = res.tempFiles.map(f => ({
          tempFilePath: f.tempFilePath,
          cloudFileId: ''
        }))
        this.setData({ photos: [...this.data.photos, ...newPhotos] })
      }
    })
  },

  // 删除单张照片
  onRemovePhoto(e) {
    const idx = e.currentTarget.dataset.index
    const photos = this.data.photos.filter((_, i) => i !== idx)
    this.setData({ photos })
  },

  // 预览大图
  onPreviewPhoto(e) {
    const idx = e.currentTarget.dataset.index
    wx.previewImage({
      urls: this.data.photos.map(p => p.tempFilePath),
      current: this.data.photos[idx].tempFilePath
    })
  },

  // 开始分析：上传照片 → 调用 AI
  async onStartAnalysis() {
    if (this.data.photos.length === 0) {
      wx.showToast({ title: '请先拍照', icon: 'none' })
      return
    }

    const batchId = `batch_${Date.now()}`

    // Step 1: 上传所有照片到云存储
    this.setData({ uploading: true, progressText: '正在上传照片...' })
    try {
      for (let i = 0; i < this.data.photos.length; i++) {
        this.setData({ progressText: `上传中 (${i + 1}/${this.data.photos.length})...` })
        const photo = this.data.photos[i]
        const cloudFileId = await cloud.uploadPhoto(
          photo.tempFilePath,
          this.data.studentId,
          batchId
        )
        photo.cloudFileId = cloudFileId
      }
      this.setData({ uploading: false })

      // Step 2: 调用 AI 分析云函数
      this.setData({ analyzing: true, progressText: 'AI 正在分析试卷...' })
      const result = await cloud.callAnalyzePhotos({
        studentId: this.data.studentId,
        batchId,
        photoFileIds: this.data.photos.map(p => p.cloudFileId)
      })

      if (result.success) {
        this.setData({ analyzing: false })
        wx.showToast({ title: '分析完成', icon: 'success' })
        // 跳转到报告页
        setTimeout(() => {
          wx.redirectTo({
            url: `/pages/report/report?id=${result.reportId}`
          })
        }, 1000)
      } else {
        throw new Error(result.message || '分析失败')
      }
    } catch (err) {
      console.error('分析失败:', err)
      this.setData({ uploading: false, analyzing: false })
      wx.showToast({ title: err.message || '操作失败', icon: 'error', duration: 2500 })
    }
  }
})

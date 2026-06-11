// pages/upload/upload.js
const app = getApp()

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
    images.splice(idx, 1)
    this.setData({
      images,
      canSubmit: images.length > 0,
      submitBtnText: '上传并开始分析 (' + images.length + '张)'
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

      // 2. 调用云函数（前端设置 15s 超时，但云函数会在服务端继续运行直到分析完成）
      console.log('[upload] 提交云函数，studentId：', studentId, '，fileIDs：', fileIds)
      wx.cloud.callFunction({
        name: 'uploadAndAnalyze',
        data: {
          fileIDs: fileIds,
          studentId,
          subject,
          mode,
          paperId: paperId || '',
        },
        timeout: 15000,  // 前端 15 秒超时，超时后云函数仍在服务端继续运行
        success: (res) => {
          console.log('[upload] 云函数返回：', JSON.stringify(res.result))
          if (res.result && res.result.success) {
            wx.showToast({ title: '诊断完成', icon: 'success', duration: 2000 })
          } else {
            let errMsg = '未知错误'
            if (res.result) {
              if (res.result.error) errMsg = res.result.error
              else if (res.result.errMsg) errMsg = res.result.errMsg
              else if (res.result.message) errMsg = res.result.message
              else errMsg = JSON.stringify(res.result).substring(0, 80)
            }
            wx.showToast({ title: '提交失败：' + errMsg, icon: 'none', duration: 4000 })
          }
        },
        fail: (err) => {
          console.error('[upload] 云函数调用失败：', err)
          // 超时是正常的——云函数在服务端继续运行，返回学科主页后可查看进度
          wx.showToast({ title: '已提交，AI分析中，请返回查看', icon: 'none', duration: 3000 })
        },
        complete: () => {
          // 返回学科主页（轮询会自动检查状态）
          setTimeout(() => {
            wx.navigateBack()
          }, 2000)
        }
      })

    } catch (err) {
      console.error('上传失败', err)
      wx.hideLoading()
      this.setData({ uploading: false })
      wx.showToast({ title: '上传失败，请重试', icon: 'none' })
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

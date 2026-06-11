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

      // 2. 调用云函数（设置 15 秒超时，不等待分析结果）
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
        timeout: 15000,  // 15 秒超时
        success: (res) => {
          console.log('[upload] 云函数返回：', JSON.stringify(res.result))
          if (res.result && res.result.success) {
            wx.showToast({ title: '已提交分析，请返回查看进度', icon: 'none', duration: 2500 })
          } else {
            // 平台级错误可能用 errMsg/errCode，我们自己的错误用 error
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
          // 超时或失败都提示用户去学科主页查看进度
          wx.showToast({ title: '网络超时，请返回查看', icon: 'none', duration: 2500 })
        },
        complete: () => {
          // 3. 返回学科主页
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

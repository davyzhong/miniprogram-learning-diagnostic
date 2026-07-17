// pages/upload/upload.js
const cloud = require('../../utils/cloud')
const {
  paperCodeOf,
  paperQuestionCount,
  paperTitleOf
} = require('../../utils/paper-display')
const { getSubjectName } = require('../../utils/constants')
const { appStatus, OP_TYPES, OP_STATUS, EVENTS } = require('../../utils/app-status')

function getFileName(filePath, index) {
  const cleanPath = String(filePath || '').split('?')[0]
  return cleanPath.split('/').pop() || `照片${index + 1}.jpg`
}

function cleanPathOf(filePath) {
  return String(filePath || '').split('?')[0]
}

function isHeifImage(filePath) {
  return /\.(heic|heif)$/i.test(cleanPathOf(filePath))
}

function replaceFileExtension(fileName, extension) {
  const ext = String(extension || 'jpg').replace(/^\./, '')
  const name = String(fileName || '').trim()
  if (!name) return `照片.${ext}`
  return name.replace(/\.[^/.]+$/, '') + `.${ext}`
}

function getImageExtension(fileName, fallback = 'jpg') {
  const match = cleanPathOf(fileName).match(/\.([a-z0-9]+)$/i)
  const ext = match ? match[1].toLowerCase() : fallback
  if (ext === 'jpeg') return 'jpg'
  if (['jpg', 'png', 'webp'].includes(ext)) return ext
  return fallback
}

function formatChosenImagesCount(count) {
  return '上传并开始分析 (' + count + '张)'
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
    // 内测授权：首次上传前必须同意内测说明（设计文档 §4.1）
    betaConsented: false,
    betaChecking: true,
    showConsentOverlay: false  // 页内授权遮罩（modal 不可靠时的 fallback）
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
    this.checkBetaAuth()
  },

  // 内测授权：首次上传前展示内测说明，用户必须同意才能继续（设计文档 §4.1）
  async checkBetaAuth() {
    try {
      const res = await cloud.getBetaAuth()
      if (res && res.success && res.consented) {
        this.setData({ betaConsented: true, betaChecking: false })
        return
      }
    } catch (err) {
      console.warn('读取内测授权状态失败', err)
    }
    this.setData({ betaChecking: false })
    this.showBetaConsent()
  },

  showBetaConsent() {
    // 先尝试系统 modal；如果 modal 调用失败（页面未激活/被遮挡），降级为页内遮罩
    wx.showModal({
      title: '内测说明与授权',
      content: '本小程序为内测版本，会收集孩子姓名、年级、试卷照片和 AI 识别结果，用于生成学习诊断、验证卷和卡点追踪。AI 诊断可能出错，仅供家庭学习参考，不替代老师或专业评估。内测期间数据保留用于连续学习记录和问题排查。家长可在「AI 用量」页申请删除。请尽量只上传试卷内容，避免含身份证号、住址等敏感信息。',
      confirmText: '同意并继续',
      cancelText: '暂不同意',
      success: res => {
        if (res.confirm) {
          cloud.setBetaAuth(true).catch(err => console.warn('记录授权失败', err))
          this.setData({ betaConsented: true, showConsentOverlay: false })
        } else {
          this.setData({ betaConsented: false, showConsentOverlay: false })
        }
      },
      fail: () => {
        // showModal 失败（页面未激活等）→ 降级为页内遮罩，确保用户一定能看到
        this.setData({ showConsentOverlay: true })
      }
    })
  },

  // 页内遮罩的"同意"按钮
  onConsentAgree() {
    cloud.setBetaAuth(true).catch(err => console.warn('记录授权失败', err))
    this.setData({ betaConsented: true, showConsentOverlay: false })
  },

  // 页内遮罩的"不同意"按钮
  onConsentDecline() {
    this.setData({ betaConsented: false, showConsentOverlay: false })
    wx.showToast({ title: '未同意内测说明，暂无法上传', icon: 'none' })
  },

  async loadPaperContext(paperId) {
    try {
      const detail = typeof cloud.getPaperDetail === 'function'
        ? await cloud.getPaperDetail(paperId)
        : { paper: await cloud.getPaper(paperId) }
      const paper = detail.paper
      if (!paper) return
      const subjectName = this.getSubjectName(paper.subject)
      this.setData({
        paperCodeText: this.data.paperCodeText || paperCodeOf(paper, subjectName),
        paperName: paperTitleOf(paper),
        paperQuestionCount: paperQuestionCount(paper)
      })
    } catch (err) {
      console.warn('读取试卷上传上下文失败', err)
    }
  },

  async loadExistingFileNames() {
    try {
      // 轻量去重读取：服务端投影只返回文件名，不再拉 20 份全量报告
      const existingFileNames = await cloud.listRecentImageFileNames(
        this.data.studentId, this.data.subject, 20
      )
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

    return wx.chooseMedia({
      count: remain,
      mediaType: ['image'],
      sourceType: ['album', 'camera'],
      sizeType: ['compressed'],
      success: async (res) => {
        const tempFiles = Array.isArray(res.tempFiles) ? res.tempFiles : []
        const hasHeif = tempFiles.some(file => isHeifImage(file.tempFilePath))
        if (hasHeif) wx.showLoading({ title: '转换照片中...' })

        const knownNames = new Set([
          ...this.data.existingFileNames,
          ...images.map(image => image.fileName)
        ])

        let skippedHeifCount = 0
        const newImages = []
        for (let index = 0; index < tempFiles.length; index++) {
          try {
            const normalized = this.normalizeChosenImage(tempFiles[index], images.length + index)
            const image = normalized && typeof normalized.then === 'function'
              ? await normalized
              : normalized
            const nameDuplicate = knownNames.has(image.fileName)
            knownNames.add(image.fileName)
            newImages.push({ ...image, nameDuplicate })
          } catch (err) {
            console.warn('HEIF 图片转换失败', err)
            skippedHeifCount += 1
          }
        }

        if (hasHeif) wx.hideLoading()
        if (skippedHeifCount > 0) {
          wx.showToast({
            title: 'HEIF无法转换，请截图上传',
            icon: 'none'
          })
        }

        if (newImages.length === 0) return

        const updated = images.concat(newImages)
        this.setData({
          images: updated,
          canSubmit: updated.length > 0,
          submitBtnText: formatChosenImagesCount(updated.length)
        })
        if (newImages.some(image => image.nameDuplicate)) {
          wx.showToast({ title: '发现同名照片，仍可继续上传', icon: 'none' })
        }
      }
    })
  },

  normalizeChosenImage(file, index) {
    const originalTempPath = file.tempFilePath
    const originalFileName = getFileName(originalTempPath, index)
    const baseImage = {
      tempPath: originalTempPath,
      fileName: originalFileName,
      fileSize: Number(file.size) || 0,
      originalTempPath: '',
      originalFileName: '',
      convertedFromHeif: false,
      fileId: '',
      uploaded: false
    }

    if (!isHeifImage(originalTempPath)) return baseImage

    return this.convertHeifToJpeg(originalTempPath).then(convertedPath => ({
      ...baseImage,
      tempPath: convertedPath,
      fileName: replaceFileExtension(originalFileName, 'jpg'),
      originalTempPath,
      originalFileName,
      convertedFromHeif: true
    }))
  },

  convertHeifToJpeg(tempPath) {
    return new Promise((resolve, reject) => {
      if (typeof wx.compressImage !== 'function') {
        reject(new Error('当前微信版本暂不支持 HEIF 转换'))
        return
      }

      // OCR 场景 quality 80 + 限宽 1600px 足够，转换产物比 quality 92 原尺寸小很多
      const compress = compressedWidth => {
        const options = {
          src: tempPath,
          quality: 80,
          success: res => {
            if (res && res.tempFilePath) {
              resolve(res.tempFilePath)
              return
            }
            reject(new Error('HEIF 转换未返回可上传文件'))
          },
          fail: reject
        }
        // 只传 compressedWidth 时高度按比例缩放；不超过 1600px 则保持原尺寸
        if (compressedWidth) options.compressedWidth = compressedWidth
        wx.compressImage(options)
      }

      if (typeof wx.getImageInfo === 'function') {
        wx.getImageInfo({
          src: tempPath,
          success: info => compress(info && info.width > 1600 ? 1600 : 0),
          fail: () => compress(0)
        })
        return
      }
      compress(0)
    })
  },

  // ========== 删除图片 ==========
  onDeleteImage(e) {
    const idx = e.currentTarget.dataset.index
    const { images } = this.data
    wx.showModal({
      title: '移除照片',
      content: '确定移除这张照片吗？',
      confirmText: '移除',
      success: res => {
        if (!res.confirm) return
        const updated = images.filter((_, index) => index !== idx)
        this.setData({
          images: updated,
          canSubmit: updated.length > 0,
          submitBtnText: formatChosenImagesCount(updated.length)
        })
      }
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
    // 内测授权守卫：未同意时直接弹页内遮罩（不依赖系统 modal 的时序可靠性）
    if (!this.data.betaConsented) {
      this.setData({ showConsentOverlay: true })
      return
    }
    const { images, mode, studentId, subject, paperId } = this.data
    if (images.length === 0) return

    this.setData({ uploading: true, uploadedCount: 0, uploadProgress: 0, submitBtnText: '上传中...' })

    try {
      wx.showLoading({ title: '上传中...' })

      // 1. 3 路并发上传到云存储（保持结果顺序，单张失败不阻塞其他图片），
      //    重试时复用已经上传成功的图片
      const fileIds = new Array(images.length)
      let nextIndex = 0
      let completedCount = 0
      let firstError = null
      const worker = async () => {
        while (nextIndex < images.length) {
          const i = nextIndex
          nextIndex += 1
          const image = this.data.images[i]
          try {
            const fileId = image.uploaded && image.fileId
              ? image.fileId
              : await this.uploadOne(image, i)
            fileIds[i] = fileId
            completedCount += 1
            this.setData({
              [`images[${i}].fileId`]: fileId,
              [`images[${i}].uploaded`]: true,
              [`images[${i}].uploadError`]: '',
              uploadedCount: completedCount,
              uploadProgress: Math.round((completedCount / images.length) * 100)
            })
          } catch (err) {
            if (!firstError) firstError = err
          }
        }
      }
      const workerCount = Math.min(3, images.length)
      await Promise.all(Array.from({ length: workerCount }, () => worker()))
      // 全部图片都已尝试：有失败则走统一错误汇总（标记第一张未上传成功的图片）
      if (firstError) throw firstError

      wx.hideLoading()

      // 2. 云函数创建报告并 fire-and-forget 启动分析（秒回）
      const uploadResult = await cloud.callUploadAndAnalyze({
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

      const reportId = uploadResult && uploadResult.reportId ? uploadResult.reportId : ''

      // 注册到统一状态感知体系 —— 首页/学科页/学习记录页会收到通知
      const opType = mode === 'verification' ? OP_TYPES.VERIFICATION_ANALYSIS : OP_TYPES.ANALYSIS
      const label = mode === 'verification' ? '验证卷分析' : '试卷诊断分析'
      appStatus.registerOperation({
        studentId, subject, opType,
        status: OP_STATUS.ANALYZING,
        progress: 0,
        label,
        reportId
      })
      appStatus.emit(EVENTS.CACHE_INVALIDATED, { studentId, subject })

      this.invalidatePreviousSubjectHome()
      wx.showToast({ title: '已提交，AI 正在分析', icon: 'success', duration: 2000 })
      // 跳转到报告页轮询分析结果（而非 navigateBack 回不确定的页面）
      setTimeout(() => {
        if (reportId) {
          wx.navigateTo({ url: `/pages/report/report?id=${reportId}` })
        } else {
          wx.navigateBack()
        }
      }, 1200)
    } catch (err) {
      wx.hideLoading()
      const failedIndex = this.data.images.findIndex(image => !image.uploaded)
      const errorImages = failedIndex >= 0
        ? this.data.images.map((image, index) => index === failedIndex
          ? { ...image, uploadError: '上传失败，请稍后重试' }
          : image)
        : this.data.images
      this.setData({ uploading: false, images: errorImages, submitBtnText: '重试上传并分析' })
      console.error('上传或提交分析失败', err)
      wx.showToast({ title: '上传失败，请稍后重试', icon: 'none' })
    }
  },

  invalidatePreviousSubjectHome() {
    if (typeof getCurrentPages !== 'function') return
    const pages = getCurrentPages()
    const previousPage = pages && pages[pages.length - 2]
    if (previousPage && previousPage.route === 'pages/subject-home/subject-home') {
      if (typeof previousPage.invalidateProfileCache === 'function') {
        previousPage.invalidateProfileCache()
      } else {
        previousPage._profileCacheInvalidated = true
      }
    }
  },

  // ========== 上传单张图片 ==========
  uploadOne(image, index) {
    return new Promise((resolve, reject) => {
      const { studentId, subject } = this.data
      const tempPath = typeof image === 'string' ? image : image.tempPath
      const extension = getImageExtension(typeof image === 'string' ? image : image.fileName)
      const cloudPath = `uploads/${studentId}/${subject}/${Date.now()}_${index}.${extension}`

      wx.cloud.uploadFile({
        cloudPath,
        filePath: tempPath,
        success: (res) => resolve(res.fileID),
        fail: (err) => reject(err)
      })
    })
  },

  getSubjectName(subject) {
    return getSubjectName(subject, subject || '试卷')
  },

  getPaperName(paper) {
    return paper ? paperTitleOf(paper) : ''
  },

  getPaperCodeText(paper) {
    return paperCodeOf(paper, paper ? this.getSubjectName(paper.subject) : '')
  },

  onUnload() {
    this.setData({ uploading: false })
  }
})

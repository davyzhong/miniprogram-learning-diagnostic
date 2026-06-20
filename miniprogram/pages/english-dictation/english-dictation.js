const cloud = require('../../utils/cloud')
const { buildMeaningText, withDisplayFields: _withDisplayFields, stopPromptAudio, onPlayPromptTap: _onPlayPromptTap } = require('../../utils/english-voice')

function withDisplayFields(item) {
  return _withDisplayFields(item, {
    englishLabel: '英文提示',
    chineseLabel: '中文释义',
    englishPrompt: '看英文单词，在纸上抄写并确认拼写',
    chinesePrefix: '看中文意思，在纸上写出英文单词：'
  })
}

function summarizeDictationResults(results = []) {
  const summary = { correct: 0, incorrect: 0, unclear: 0, total: results.length }
  for (const item of results || []) {
    if (item.verdict === 'correct') summary.correct += 1
    else if (item.verdict === 'incorrect') summary.incorrect += 1
    else summary.unclear += 1
  }
  return summary
}

Page({
  data: {
    studentId: '',
    studentName: '',
    grade: '',
    loading: false,
    uploading: false,
    error: '',
    sessionId: '',
    functionType: 'spelling',
    queue: [],
    currentIndex: 0,
    currentItem: null,
    paperInstruction: '请按题号一行一个词写英文，保留修改痕迹。',
    uploadedPhotoCount: 0,
    analysisStatus: '',
    dictationResults: [],
    resultSummary: null,
    voiceReady: false,
    recordingCommand: false,
    voiceUnavailableText: ''
  },

  async onLoad(options = {}) {
    this.setData({
      studentId: options.studentId || '',
      studentName: decodeURIComponent(options.studentName || ''),
      grade: options.grade || ''
    })
    this.initVoice()
    await this.generateSession()
  },

  initVoice() {
    if (typeof requirePlugin !== 'function') {
      this.setData({ voiceReady: false, voiceUnavailableText: '当前环境暂不支持语音播放，可直接看提示词。' })
      return
    }
    try {
      const plugin = requirePlugin('WechatSI')
      const manager = plugin && plugin.getRecordRecognitionManager ? plugin.getRecordRecognitionManager() : null
      if (manager) {
        manager.onStop(res => {
          this.setData({ recordingCommand: false })
          this.handleVoiceNextCommand(res && (res.result || res.text || ''))
        })
        manager.onError(() => {
          this.setData({ recordingCommand: false })
          wx.showToast({ title: '没有听清，可以直接点下一个', icon: 'none' })
        })
        this._voiceManager = manager
      }
      this._voicePlugin = plugin
      this.setData({
        voiceReady: Boolean(manager),
        voiceUnavailableText: manager ? '' : '语音“下一个”暂不可用，可以直接点击下一个。'
      })
    } catch (error) {
      this.setData({ voiceReady: false, voiceUnavailableText: '语音插件暂不可用，请确认小程序后台已添加同声传译插件。' })
    }
  },

  async generateSession() {
    if (!this.data.studentId) return
    this.setData({ loading: true, error: '', analysisStatus: '', uploadedPhotoCount: 0, resultSummary: null })
    wx.showLoading({ title: '加载中...' })
    try {
      const result = await cloud.generateEnglishPaperDictationSession({
        studentId: this.data.studentId,
        wordLimit: 20
      })
      const queue = (result.wordItems || []).map(withDisplayFields)
      this.setData({
        loading: false,
        sessionId: result.sessionId || '',
        functionType: result.functionType || 'spelling',
        queue,
        currentIndex: 0,
        currentItem: queue[0] || null,
        error: queue.length > 0 ? '' : '还没有可听写单词，请先导入钟青羽的个人英语词库。'
      })
      this._sessionStartedAt = Date.now()
    } catch (error) {
      this.setData({
        loading: false,
        error: error && error.message ? error.message : '纸面听写生成失败'
      })
    } finally {
      wx.hideLoading()
    }
  },

  onBack() {
    wx.navigateBack({ delta: 1 })
  },

  onPreviousTap() {
    const nextIndex = Math.max(0, this.data.currentIndex - 1)
    this.setData({
      currentIndex: nextIndex,
      currentItem: this.data.queue[nextIndex] || null
    })
  },

  onNextTap() {
    const nextIndex = Math.min(this.data.queue.length - 1, this.data.currentIndex + 1)
    this.setData({
      currentIndex: nextIndex,
      currentItem: this.data.queue[nextIndex] || null
    })
  },

  onPlayPromptTap() {
    _onPlayPromptTap.call(this, '请按提示完成听写')
  },

  onVoiceNextTap() {
    if (!this._voiceManager) {
      wx.showToast({ title: '可以直接点击下一个', icon: 'none' })
      return
    }
    if (this.data.recordingCommand) {
      this.stopVoiceCommand()
    } else {
      this.startVoiceCommand()
    }
  },

  startVoiceCommand() {
    if (!this._voiceManager) return
    this._voiceCommandStarted = true
    this.setData({ recordingCommand: true })
    this._voiceManager.start({ lang: 'zh_CN' })
  },

  stopVoiceCommand() {
    if (!this._voiceManager) return
    this._voiceManager.stop()
    this._voiceCommandStarted = false
  },

  handleVoiceNextCommand(text = '') {
    const command = String(text || '').trim()
    if (/下一个|下一题|好了|好啦|完成|next/i.test(command)) {
      this.onNextTap()
    } else if (command) {
      wx.showToast({ title: '没有听到“下一个”', icon: 'none' })
    }
  },

  async onChoosePhotoTap() {
    if (!this.data.sessionId || this.data.uploading) return
    return new Promise(resolve => {
      wx.chooseMedia({
        count: 6,
        mediaType: ['image'],
        sourceType: ['album', 'camera'],
        success: async res => {
          const tempFiles = res.tempFiles || []
          if (tempFiles.length > 0) await this.uploadDictationPhotos(tempFiles)
          resolve()
        },
        fail: () => resolve()
      })
    })
  },

  async uploadDictationPhotos(tempFiles = []) {
    this.setData({ uploading: true, error: '', uploadProgress: '' })
    try {
      const batchId = `english-dictation-${this.data.sessionId}`
      const photoFileIds = []
      const total = tempFiles.length
      for (let i = 0; i < tempFiles.length; i++) {
        const file = tempFiles[i]
        const filePath = file.tempFilePath || file.path || ''
        if (!filePath) continue
        // 进度文案：让用户知道上传在进行，避免长时间无反馈
        this.setData({ uploadProgress: `正在上传 ${i + 1}/${total}` })
        const fileId = await cloud.uploadPhoto(filePath, this.data.studentId, batchId)
        if (fileId) photoFileIds.push(fileId)
      }
      const result = await cloud.submitEnglishDictationPhoto({
        studentId: this.data.studentId,
        sessionId: this.data.sessionId,
        photoFileIds,
        durationMs: Math.max(1, Date.now() - (this._sessionStartedAt || Date.now()))
      })
      this.setData({
        analysisStatus: result.analysisStatus || 'pending_analysis',
        uploadedPhotoCount: (result.photoFileIds || photoFileIds).length
      })
      if (typeof cloud.analyzeEnglishDictationPhoto === 'function') {
        const analysis = await cloud.analyzeEnglishDictationPhoto({
          studentId: this.data.studentId,
          sessionId: this.data.sessionId
        })
        this.setData({
          analysisStatus: analysis.analysisStatus || 'completed',
          dictationResults: analysis.results || [],
          resultSummary: summarizeDictationResults(analysis.results || [])
        })
      }
      this.setData({ uploading: false, uploadProgress: '' })
      wx.showToast({ title: '已上传听写纸', icon: 'success' })
    } catch (error) {
      this.setData({
        uploading: false,
        uploadProgress: '',
        error: error && error.message ? error.message : '上传失败，请重试'
      })
    }
  },

  stopPromptAudio,

  cleanupVoice() {
    if (this._voiceCommandStarted && this._voiceManager && typeof this._voiceManager.stop === 'function') {
      this._voiceManager.stop()
      this._voiceCommandStarted = false
    }
    this.stopPromptAudio()
    if (this.data.recordingCommand) this.setData({ recordingCommand: false })
  },

  onHide() {
    this.cleanupVoice()
  },

  onUnload() {
    this.cleanupVoice()
  }
})

const cloud = require('../../utils/cloud')

function buildMeaningText(item = {}) {
  return Array.isArray(item.meanings) ? item.meanings.join(' / ') : (item.meanings || '')
}

function withDisplayFields(item = {}) {
  const meaningText = buildMeaningText(item)
  return {
    ...item,
    meaningText,
    promptTypeText: item.promptType === 'english' ? '英文发音' : '中文释义',
    promptText: item.promptType === 'english'
      ? '听英文发音，在纸上写出这个英文单词'
      : `听中文意思，在纸上写出英文单词：${meaningText || '这个单词'}`
  }
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
    uploadedPhotoCount: 0,
    analysisStatus: '',
    dictationResults: [],
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
    this.setData({ loading: true, error: '', analysisStatus: '', uploadedPhotoCount: 0 })
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
    const current = this.data.currentItem
    if (!current || !this._voicePlugin || !this._voicePlugin.textToSpeech) {
      wx.showToast({ title: '请按提示完成听写', icon: 'none' })
      return
    }
    this.stopPromptAudio()
    const content = current.promptType === 'english' ? current.word : current.meaningText
    this._voicePlugin.textToSpeech({
      lang: current.promptType === 'english' ? 'en_US' : 'zh_CN',
      tts: true,
      content,
      success: res => {
        if (!res || !res.filename) return
        const audio = wx.createInnerAudioContext()
        audio.src = res.filename
        this._promptAudio = audio
        audio.play()
      },
      fail: () => wx.showToast({ title: '播放失败，请直接看提示', icon: 'none' })
    })
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
    this.setData({ uploading: true, error: '' })
    try {
      const batchId = `english-dictation-${this.data.sessionId}`
      const photoFileIds = []
      for (const file of tempFiles) {
        const filePath = file.tempFilePath || file.path || ''
        if (!filePath) continue
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
          dictationResults: analysis.results || []
        })
      }
      this.setData({ uploading: false })
      wx.showToast({ title: '已上传听写纸', icon: 'success' })
    } catch (error) {
      this.setData({
        uploading: false,
        error: error && error.message ? error.message : '上传失败，请重试'
      })
    }
  },

  stopPromptAudio() {
    const audio = this._promptAudio
    if (!audio) return
    if (typeof audio.stop === 'function') audio.stop()
    if (typeof audio.destroy === 'function') audio.destroy()
    this._promptAudio = null
  },

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

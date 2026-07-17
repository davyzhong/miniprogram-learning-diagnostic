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
    wordLimit: 20,
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
    voiceUnavailableText: '',
    dictationPhase: 'ready',
    playbackState: 'idle',
    playbackStateText: '待开始',
    writingWaitSeconds: 7,
    writingCountdown: 0,
    commandHint: '点击开始听写，或说“开始”。',
    wordListExpanded: true,
    uploadProgress: ''
  },

  onLoad(options = {}) {
    this.setData({
      studentId: options.studentId || '',
      studentName: decodeURIComponent(options.studentName || ''),
      grade: options.grade || '',
      wordLimit: Math.min(20, Math.max(5, Number(options.wordLimit) || 20))
    })
    this.initVoice()
    this._loadPromise = this.generateSession().catch(error => {
      console.error('加载英语听写失败', error)
    })
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
    this.clearWritingTimer()
    this.setData({
      loading: true,
      error: '',
      analysisStatus: '',
      uploadedPhotoCount: 0,
      resultSummary: null,
      dictationPhase: 'ready',
      playbackState: 'idle',
      playbackStateText: '待开始',
      writingCountdown: 0,
      commandHint: '点击开始听写，或说“开始”。',
      wordListExpanded: true
    })
    wx.showLoading({ title: '加载中...' })
    try {
      const result = await cloud.generateEnglishPaperDictationSession({
        studentId: this.data.studentId,
        wordLimit: this.data.wordLimit
      })
      const queue = (result.wordItems || []).map(withDisplayFields)
      this.setData({
        loading: false,
        sessionId: result.sessionId || '',
        functionType: result.functionType || 'spelling',
        queue,
        currentIndex: 0,
        currentItem: queue[0] || null,
        dictationPhase: 'ready',
        playbackState: 'idle',
        playbackStateText: '待开始',
        writingCountdown: 0,
        commandHint: queue.length > 0 ? '点击开始听写，或说“开始”。' : '',
        wordListExpanded: true,
        error: queue.length > 0 ? '' : '还没有可听写单词，请先导入孩子的个人英语词库。'
      })
      this._sessionStartedAt = Date.now()
    } catch (error) {
      console.error('纸面听写生成失败', error)
      this.setData({
        loading: false,
        error: '纸面听写生成失败，请稍后重试'
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
    if (this.data.dictationPhase === 'running') {
      this.advanceToNextWord()
      return
    }
    const nextIndex = Math.min(this.data.queue.length - 1, this.data.currentIndex + 1)
    this.setData({
      currentIndex: nextIndex,
      currentItem: this.data.queue[nextIndex] || null
    })
  },

  onToggleWordList() {
    this.setData({ wordListExpanded: !this.data.wordListExpanded })
  },

  onStartTap() {
    this.startDictation()
  },

  startDictation() {
    if (!this.data.queue.length || this.data.dictationPhase === 'running') return
    const currentIndex = this.data.currentIndex || 0
    this.setData({
      dictationPhase: 'running',
      playbackState: 'speaking',
      playbackStateText: '正在播放',
      currentIndex,
      currentItem: this.data.queue[currentIndex] || null,
      wordListExpanded: false,
      commandHint: '正在播放提示。'
    })
    this.playCurrentPrompt()
  },

  playCurrentPrompt() {
    const current = this.data.currentItem
    if (!current) return
    this.clearWritingTimer()
    this.stopPromptAudio()
    this.setData({
      playbackState: 'speaking',
      playbackStateText: '正在播放',
      commandHint: '正在播放提示。'
    })
    const content = current.promptType === 'english' ? current.word : current.meaningText
    const lang = current.promptType === 'english' ? 'en_US' : 'zh_CN'
    if (!this._voicePlugin || !this._voicePlugin.textToSpeech || !content) {
      this.enterWritingWait()
      return
    }
    this._voicePlugin.textToSpeech({
      lang,
      tts: true,
      content,
      success: res => {
        if (res && res.filename) {
          const audio = wx.createInnerAudioContext()
          audio.src = res.filename
          this._promptAudio = audio
          audio.play()
        }
        this.enterWritingWait()
      },
      fail: () => {
        wx.showToast({ title: '播放失败，请直接看提示', icon: 'none' })
        this.enterWritingWait()
      }
    })
  },

  enterWritingWait() {
    this.clearWritingTimer()
    this.setData({
      playbackState: 'writing',
      playbackStateText: '请书写',
      writingCountdown: this.data.writingWaitSeconds,
      commandHint: `请书写，约 ${this.data.writingWaitSeconds} 秒后说“好了”。`
    })
    this._writingTimer = setTimeout(() => {
      this.enterWaitingCommand()
    }, this.data.writingWaitSeconds * 1000)
  },

  enterWaitingCommand() {
    this.clearWritingTimer()
    this.setData({
      playbackState: 'waitingCommand',
      playbackStateText: '等待口令',
      writingCountdown: 0,
      commandHint: '写好了就说“好了”“OK”或“下一个”。'
    })
  },

  clearWritingTimer() {
    if (!this._writingTimer) return
    clearTimeout(this._writingTimer)
    this._writingTimer = null
  },

  advanceToNextWord() {
    if (!this.data.queue.length) return
    const isLast = this.data.currentIndex + 1 >= this.data.queue.length
    if (isLast) {
      this.clearWritingTimer()
      this.setData({
        dictationPhase: 'finished',
        playbackState: 'idle',
        playbackStateText: '已完成',
        commandHint: '本轮听写已完成，请拍照上传听写纸。',
        wordListExpanded: false
      })
      return
    }
    const nextIndex = this.data.currentIndex + 1
    this.setData({
      currentIndex: nextIndex,
      currentItem: this.data.queue[nextIndex] || null,
      dictationPhase: 'running',
      playbackState: 'speaking',
      playbackStateText: '正在播放',
      commandHint: '正在播放下一题。'
    })
    this.playCurrentPrompt()
  },

  onPlayPromptTap() {
    if (this.data.dictationPhase === 'running' || this.data.dictationPhase === 'paused') {
      this.playCurrentPrompt()
      return
    }
    _onPlayPromptTap.call(this, '请按提示完成听写')
  },

  onVoiceNextTap() {
    if (!this._voiceManager) {
      wx.showToast({ title: this.data.dictationPhase === 'ready' ? '可以直接点击开始听写' : '可以直接点击下一个', icon: 'none' })
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
    if (!command) return
    if (/开始|start/i.test(command) && this.data.dictationPhase === 'ready') {
      this.startDictation()
      return
    }
    if (/重读|再读|repeat/i.test(command) && this.data.dictationPhase === 'running') {
      this.playCurrentPrompt()
      return
    }
    if (/暂停|停一下|pause/i.test(command) && this.data.dictationPhase === 'running') {
      this.clearWritingTimer()
      this.setData({
        dictationPhase: 'paused',
        playbackState: 'idle',
        playbackStateText: '已暂停',
        commandHint: '已暂停，点击继续或说“继续”。'
      })
      return
    }
    if (/继续|resume/i.test(command) && this.data.dictationPhase === 'paused') {
      this.setData({ dictationPhase: 'running' })
      this.playCurrentPrompt()
      return
    }
    if (/ok|okay|下一个|下一题|好了|好啦|完成|next/i.test(command)) {
      if (this.data.dictationPhase === 'ready') this.startDictation()
      else if (this.data.dictationPhase === 'running') this.advanceToNextWord()
      return
    }
    wx.showToast({ title: '没有听到有效口令', icon: 'none' })
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
          resultSummary: summarizeDictationResults(analysis.results || []),
          dictationPhase: 'reviewed'
        })
      } else {
        this.setData({ dictationPhase: 'finished' })
      }
      this.setData({ uploading: false, uploadProgress: '' })
      wx.showToast({ title: '已上传听写纸', icon: 'success' })
    } catch (error) {
      console.error('听写照片上传失败', error)
      this.setData({
        uploading: false,
        uploadProgress: '',
        error: '上传失败，请稍后重试'
      })
    }
  },

  stopPromptAudio,

  cleanupVoice() {
    this.clearWritingTimer()
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

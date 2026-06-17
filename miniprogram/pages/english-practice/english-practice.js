const cloud = require('../../utils/cloud')
const { buildMeaningText, withDisplayFields: _withDisplayFields, stopPromptAudio, onPlayPromptTap: _onPlayPromptTap } = require('../../utils/english-voice')

function withDisplayFields(item) {
  return _withDisplayFields(item, {
    englishLabel: '英文提示',
    chineseLabel: '中文提示',
    englishPrompt: '听英文发音，然后说出中文意思',
    chinesePrefix: '听中文意思，然后说出英文单词：'
  })
}

Page({
  data: {
    studentId: '',
    studentName: '',
    grade: '',
    loading: false,
    submitting: false,
    error: '',
    errorTitle: '',
    sessionId: '',
    functionType: 'familiarity',
    queue: [],
    currentIndex: 0,
    currentItem: null,
    lastAnsweredItem: null,
    lastResult: null,
    finished: false,
    recording: false,
    voiceReady: false,
    voiceUnavailableText: '',
    patternItems: []
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
      this.setData({ voiceReady: false, voiceUnavailableText: '当前环境暂不支持语音识别，可在真机中使用。' })
      return
    }
    try {
      const plugin = requirePlugin('WechatSI')
      const manager = plugin && plugin.getRecordRecognitionManager ? plugin.getRecordRecognitionManager() : null
      if (!manager) throw new Error('WechatSI unavailable')
      manager.onStop(res => {
        this.setData({ recording: false })
        this.onRecognitionResult({
          recognizedText: res && (res.result || res.text || ''),
          audioFileID: res && (res.tempFilePath || res.fileID || '')
        })
      })
      manager.onError(() => {
        this.setData({
          recording: false,
          lastResult: { status: 'unclear', reason: '语音识别失败，请再读一次。' }
        })
      })
      this._voiceManager = manager
      this._voicePlugin = plugin
      this.setData({ voiceReady: true, voiceUnavailableText: '' })
    } catch (error) {
      this.setData({ voiceReady: false, voiceUnavailableText: '语音插件暂不可用，请确认小程序后台已添加同声传译插件。' })
    }
  },

  async generateSession() {
    if (!this.data.studentId) return
    this.setData({ loading: true, error: '', errorTitle: '', finished: false, lastResult: null })
    wx.showLoading({ title: '加载中...' })
    try {
      const result = await cloud.generateEnglishRecognitionSession({
        studentId: this.data.studentId,
        wordLimit: 20,
        dimension: 'familiarity'
      })
      const queue = (result.wordItems || []).map(withDisplayFields)
      if (queue.length === 0) {
        this.setData({
          loading: false,
          sessionId: result.sessionId || '',
          functionType: result.functionType || 'familiarity',
          queue: [],
          currentIndex: 0,
          currentItem: null,
          lastAnsweredItem: null,
          patternItems: [],
          finished: false,
          errorTitle: '暂无可练习单词',
          error: '还没有可练习单词，请先导入钟青羽的个人英语词库。'
        })
        return
      }
      this.setData({
        loading: false,
        sessionId: result.sessionId || '',
        functionType: result.functionType || 'familiarity',
        queue,
        currentIndex: 0,
        currentItem: queue[0] || null,
        lastAnsweredItem: null,
        patternItems: [],
        finished: queue.length === 0
      })
      this._sessionStartedAt = Date.now()
      this._answerStartedAt = Date.now()
    } catch (error) {
      this.setData({
        loading: false,
        errorTitle: '生成失败',
        error: error && error.message ? error.message : '单词熟悉度生成失败'
      })
    } finally {
      wx.hideLoading()
    }
  },

  onRegenerateTap() {
    this.generateSession()
  },

  onBack() {
    wx.navigateBack({ delta: 1 })
  },

  onRecordTap() {
    // 提交判定期间禁止录音，避免并发导致 _answerStartedAt 被覆盖、currentItem 错位
    if (this.data.submitting) return
    if (this.data.recording) {
      this.stopRecord()
    } else {
      this.startRecord()
    }
  },

  startRecord() {
    if (!this._voiceManager) {
      this.setData({ lastResult: { status: 'unclear', reason: '语音识别暂不可用，请在真机中重试。' } })
      return
    }
    this._answerStartedAt = Date.now()
    this.setData({ recording: true, lastResult: null })
    this._voiceManager.start({ lang: this.getRecognitionLang(this.data.currentItem) })
  },

  getRecognitionLang(item = {}) {
    // 防御：promptType 正常由后端下发。缺失时根据 direction 推导，避免误选 ASR 语言。
    // cn2en（听中文说英文）→ 孩子说英文 → en_US；en2cn → 孩子说中文 → zh_CN
    if (item.promptType === 'english') return 'zh_CN'
    if (item.promptType === 'chinese') return 'en_US'
    // promptType 缺失：用 direction 兜底
    if (item.direction === 'cn2en') return 'en_US'
    if (item.direction === 'en2cn') return 'zh_CN'
    console.warn('[english-practice] promptType 和 direction 均缺失，默认 en_US', item)
    return 'en_US'
  },

  stopRecord() {
    if (!this._voiceManager) return
    this._voiceManager.stop()
  },

  async onRecognitionResult(result = {}) {
    const current = this.data.currentItem
    if (!current || this.data.submitting) return
    const durationMs = Math.max(1, Date.now() - (this._answerStartedAt || this._sessionStartedAt || Date.now()))
    this.setData({ submitting: true })
    try {
      const response = await cloud.submitEnglishRecognitionAttempt({
        studentId: this.data.studentId,
        sessionId: this.data.sessionId,
        queueKey: current.queueKey,
        wordId: current.wordId,
        targetWord: current.word,
        dimension: 'familiarity',
        promptType: current.promptType,
        direction: current.direction || (current.promptType === 'english' ? 'en2cn' : 'cn2en'),
        retryCount: current.retryCount || 0,
        recognizedText: result.recognizedText || '',
        audioFileID: result.audioFileID || '',
        durationMs
      })
      let queue = this.data.queue
      if (response.shouldRepeat) {
        const retryCount = (current.retryCount || 0) + 1
        queue = queue.concat(withDisplayFields({
          ...current,
          retryCount,
          queueKey: `${current.wordId}:${this.data.currentIndex}:${retryCount}`
        }))
      }
      const nextIndex = this.data.currentIndex + 1
      this.setData({
        submitting: false,
        queue,
        lastResult: response.judgment || null,
        lastAnsweredItem: current,
        currentIndex: nextIndex,
        currentItem: queue[nextIndex] || null,
        finished: nextIndex >= queue.length
      })
      this._answerStartedAt = Date.now()
    } catch (error) {
      this.setData({
        submitting: false,
        lastResult: {
          status: 'unclear',
          reason: error && error.message ? error.message : 'AI 判定失败，请稍后重试。'
        }
      })
    }
  },

  async onFinishTap() {
    if (!this.data.sessionId) return
    try {
      await cloud.submitEnglishPracticeResult({
        studentId: this.data.studentId,
        sessionId: this.data.sessionId,
        wordResults: []
      })
    } catch (error) {
      // 提交失败时提示用户，避免静默丢失本次会话结算
      wx.showToast({ title: '提交失败，请稍后重试', icon: 'none' })
      return
    }
    wx.navigateBack({ delta: 1 })
  },

  onPlayPromptTap() {
    _onPlayPromptTap.call(this, '请按提示读出答案')
  },

  stopPromptAudio,

  cleanupVoice() {
    if (this.data.recording && this._voiceManager && typeof this._voiceManager.stop === 'function') {
      this._voiceManager.stop()
    }
    this.stopPromptAudio()
    if (this.data.recording) this.setData({ recording: false })
  },

  onHide() {
    this.cleanupVoice()
  },

  onUnload() {
    this.cleanupVoice()
  }
})

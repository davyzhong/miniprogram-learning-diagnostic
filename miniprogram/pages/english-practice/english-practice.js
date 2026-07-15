const cloud = require('../../utils/cloud')
const { buildMeaningText, withDisplayFields: _withDisplayFields, stopPromptAudio, onPlayPromptTap: _onPlayPromptTap } = require('../../utils/english-voice')
const { sanitizeUserText } = require('../../utils/user-facing-text')

const RECOGNITION_WAIT_TIMEOUT_MS = 12000
const RECORD_BUTTON_READY = '开始回答'
const RECORD_BUTTON_LISTENING = '正在听你说...'
const RECORD_BUTTON_RECOGNIZING = '正在识别...'
const RECORD_BUTTON_JUDGING = '正在判断...'

function extractSpeechText(res = {}) {
  return (res.result || res.text || res.content || '').trim()
}

function extractAudioFile(res = {}) {
  return res.tempFilePath || res.fileID || res.fileId || ''
}

function bindVoiceEvent(manager, eventName, handler) {
  if (!manager) return
  if (typeof manager[eventName] === 'function') {
    manager[eventName](handler)
    return
  }
  manager[eventName] = handler
}

function calculateProgressPercent(currentIndex, queueLength) {
  if (!queueLength) return 0
  return Math.min(100, Math.round(((currentIndex + 1) / queueLength) * 100))
}

function judgmentReason(judgment = {}) {
  const reason = String(judgment.reason || '').trim()
  const sanitized = sanitizeUserText(reason, { treatAsId: true })
  if (reason && sanitized === reason) return reason
  if (judgment.status === 'correct') return '回答正确。'
  if (judgment.status === 'incorrect') return '回答还不准确，稍后再试一次。'
  return '暂时无法确认，请再试一次。'
}

function visibleJudgment(judgment, shouldRepeat) {
  if (!judgment) return null
  return {
    ...judgment,
    reason: judgmentReason(judgment),
    shouldRepeat: Boolean(shouldRepeat)
  }
}

function withDisplayFields(item) {
  const view = _withDisplayFields(item, {
    englishLabel: '英文提示',
    chineseLabel: '中文提示',
    englishPrompt: '看英文单词，然后说出中文意思',
    chinesePrefix: '看中文意思，然后说出英文单词：'
  })
  const meaningText = buildMeaningText(view)
  const isEnglishPrompt = view.promptType === 'english'
  return {
    ...view,
    meaningText,
    promptModeText: isEnglishPrompt ? '看英文' : '看中文',
    promptMainText: isEnglishPrompt ? view.word : (meaningText || '这个单词'),
    answerInstruction: isEnglishPrompt ? '请说出中文意思' : '请说出英文',
    answerHintText: isEnglishPrompt ? '看到单词后，直接说出它的中文意思。' : '看到中文意思后，直接说出对应的英文单词。',
    canPlayPrompt: isEnglishPrompt
  }
}

Page({
  data: {
    studentId: '',
    studentName: '',
    grade: '',
    wordLimit: 20,
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
    recognizing: false,
    recordButtonText: RECORD_BUTTON_READY,
    voiceReady: false,
    voiceUnavailableText: '',
    patternItems: [],
    progressPercent: 0
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
      console.error('加载英语练习失败', error)
    })
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
      bindVoiceEvent(manager, 'onRecognize', res => {
        const recognizedText = extractSpeechText(res)
        if (!recognizedText) return
        this._pendingRecognitionText = recognizedText
        this._pendingAudioFileID = extractAudioFile(res) || this._pendingAudioFileID || ''
      })
      bindVoiceEvent(manager, 'onStop', async res => {
        const recognizedText = extractSpeechText(res) || this._pendingRecognitionText || ''
        const audioFileID = extractAudioFile(res) || this._pendingAudioFileID || ''
        await this.finishRecognition({ recognizedText, audioFileID })
      })
      bindVoiceEvent(manager, 'onError', () => {
        this.clearRecognitionTimeout()
        this._pendingRecognitionText = ''
        this._pendingAudioFileID = ''
        this.setData({
          recording: false,
          recognizing: false,
          recordButtonText: RECORD_BUTTON_READY,
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
        wordLimit: this.data.wordLimit,
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
          progressPercent: 0,
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
        progressPercent: calculateProgressPercent(0, queue.length),
        lastAnsweredItem: null,
        patternItems: [],
        finished: queue.length === 0
      })
      this._sessionStartedAt = Date.now()
      this._answerStartedAt = Date.now()
    } catch (error) {
      console.error('单词练习生成失败', error)
      this.setData({
        loading: false,
        errorTitle: '生成失败',
        error: '单词练习生成失败，请稍后重试'
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
    if (this.data.submitting || this.data.recognizing) return
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
    this._pendingRecognitionText = ''
    this._pendingAudioFileID = ''
    this._recognitionSettled = false
    this.setData({ recording: true, recognizing: false, recordButtonText: RECORD_BUTTON_LISTENING, lastResult: null })
    try {
      const startResult = this._voiceManager.start({
        lang: this.getRecognitionLang(this.data.currentItem),
        duration: 30000,
        detectInterrupt: true
      })
      if (startResult && typeof startResult.catch === 'function') {
        startResult.catch(error => {
          console.error('启动语音识别失败', error)
          this.clearRecognitionTimeout()
          this.setData({
            recording: false,
            recognizing: false,
            recordButtonText: RECORD_BUTTON_READY,
            lastResult: { status: 'unclear', reason: '录音启动失败，请检查麦克风权限后重试。' }
          })
        })
      }
    } catch (error) {
      this.clearRecognitionTimeout()
      this.setData({
        recording: false,
        recognizing: false,
        recordButtonText: RECORD_BUTTON_READY,
        lastResult: { status: 'unclear', reason: '录音启动失败，请检查麦克风权限后重试。' }
      })
    }
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
    try {
      this._voiceManager.stop()
      this.setData({
        recording: false,
        recognizing: true,
        recordButtonText: RECORD_BUTTON_RECOGNIZING
      })
      this.startRecognitionTimeout()
    } catch (error) {
      this.clearRecognitionTimeout()
      this.setData({
        recording: false,
        recognizing: false,
        recordButtonText: RECORD_BUTTON_READY,
        lastResult: { status: 'unclear', reason: '停止录音失败，请再试一次。' }
      })
    }
  },

  async finishRecognition(result = {}) {
    if (this._recognitionSettled) return
    this._recognitionSettled = true
    this.clearRecognitionTimeout()
    this.setData({ recording: false })
    if (!result.recognizedText) {
      this._pendingRecognitionText = ''
      this._pendingAudioFileID = ''
      this.setData({
        recognizing: false,
        recordButtonText: RECORD_BUTTON_READY,
        lastResult: {
          status: 'unclear',
          reason: '没有收到语音识别结果，请重新录一次。'
        }
      })
      return
    }
    await this.onRecognitionResult(result)
  },

  async onRecognitionResult(result = {}) {
    this.clearRecognitionTimeout()
    this._pendingRecognitionText = ''
    this._pendingAudioFileID = ''
    const current = this.data.currentItem
    if (!current || this.data.submitting) {
      this.setData({ recognizing: false, recordButtonText: RECORD_BUTTON_READY })
      return
    }
    const durationMs = Math.max(1, Date.now() - (this._answerStartedAt || this._sessionStartedAt || Date.now()))
    this.setData({ submitting: true, recognizing: false, recordButtonText: RECORD_BUTTON_JUDGING })
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
        // 把 shouldRepeat 带入 lastResult，让 UI 能显示"本题稍后再测"即时反馈
        lastResult: visibleJudgment(response.judgment, response.shouldRepeat),
        lastAnsweredItem: current,
        currentIndex: nextIndex,
        currentItem: queue[nextIndex] || null,
        progressPercent: calculateProgressPercent(nextIndex, queue.length),
        finished: nextIndex >= queue.length,
        recognizing: false,
        recordButtonText: RECORD_BUTTON_READY
      })
      this._answerStartedAt = Date.now()
    } catch (error) {
      console.error('英语回答判定失败', error)
      this.setData({
        submitting: false,
        recognizing: false,
        recordButtonText: RECORD_BUTTON_READY,
        lastResult: {
          status: 'unclear',
          reason: 'AI 判定失败，请稍后重试。'
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

  startRecognitionTimeout() {
    this.clearRecognitionTimeout()
    const token = `${Date.now()}-${Math.random()}`
    this._recognitionTimeoutToken = token
    this._recognitionTimer = setTimeout(() => {
      if (this._recognitionTimeoutToken !== token) return
      this._recognitionTimeoutToken = ''
      this._recognitionTimer = null
      if (!this.data.recognizing) return
      const recognizedText = this._pendingRecognitionText || ''
      if (recognizedText) {
        this.finishRecognition({
          recognizedText,
          audioFileID: this._pendingAudioFileID || ''
        })
        return
      }
      this._recognitionSettled = true
      this.setData({
        recording: false,
        recognizing: false,
        recordButtonText: RECORD_BUTTON_READY,
        lastResult: {
          status: 'unclear',
          reason: '没有收到语音识别结果，请重新录一次。'
        }
      })
    }, RECOGNITION_WAIT_TIMEOUT_MS)
  },

  clearRecognitionTimeout() {
    this._recognitionTimeoutToken = ''
    if (this._recognitionTimer) {
      clearTimeout(this._recognitionTimer)
      this._recognitionTimer = null
    }
  },

  cleanupVoice() {
    this.clearRecognitionTimeout()
    if (this.data.recording && this._voiceManager && typeof this._voiceManager.stop === 'function') {
      this._voiceManager.stop()
    }
    this.stopPromptAudio()
    if (this.data.recording || this.data.recognizing) {
      this.setData({ recording: false, recognizing: false, recordButtonText: RECORD_BUTTON_READY })
    }
  },

  onHide() {
    this.cleanupVoice()
  },

  onUnload() {
    this.cleanupVoice()
  }
})

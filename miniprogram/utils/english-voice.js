// miniprogram/utils/english-voice.js
// Shared helpers for english-practice and english-dictation pages.

function buildMeaningText(item = {}) {
  return Array.isArray(item.meanings) ? item.meanings.join(' / ') : (item.meanings || '')
}

function withDisplayFields(item = {}, prompts = {}) {
  const meaningText = buildMeaningText(item)
  return {
    ...item,
    meaningText,
    promptTypeText: item.promptType === 'english' ? prompts.englishLabel : prompts.chineseLabel,
    promptText: item.promptType === 'english'
      ? prompts.englishPrompt
      : `${prompts.chinesePrefix}${meaningText || '这个单词'}`
  }
}

function stopPromptAudio() {
  const audio = this._promptAudio
  if (!audio) return
  if (typeof audio.stop === 'function') audio.stop()
  if (typeof audio.destroy === 'function') audio.destroy()
  this._promptAudio = null
}

function onPlayPromptTap(fallbackText) {
  const current = this.data.currentItem
  if (!current || !this._voicePlugin || !this._voicePlugin.textToSpeech) {
    wx.showToast({ title: fallbackText, icon: 'none' })
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
}

module.exports = {
  buildMeaningText,
  withDisplayFields,
  stopPromptAudio,
  onPlayPromptTap,
}

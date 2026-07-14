const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const ROOT = path.resolve(__dirname, '..')
const { loadPageAndWait, flushAsync, waitForPageLoad, isThenable } = require('./helpers/page-flow-utils')
const { createWxMock, loadPage } = require('./helpers/page-harness')
const util = require('../miniprogram/utils/util')

test('English dictation page creates a paper session and uploads answer photos', async () => {
  const uploaded = []
  const submitted = []
  const analyzed = []
  const cloud = {
    generateEnglishPaperDictationSession: async payload => ({
      sessionId: 'paper-session-1',
      functionType: 'spelling',
      wordItems: Array.from({ length: 20 }, (_, index) => ({
        queueKey: `word-${index + 1}:0`,
        wordId: `word-${index + 1}`,
        word: `word${index + 1}`,
        meanings: [`词义${index + 1}`],
        promptType: index % 2 === 0 ? 'chinese' : 'english'
      })),
      request: payload
    }),
    uploadPhoto: async (filePath, studentId, batchId) => {
      uploaded.push({ filePath, studentId, batchId })
      return `cloud://${filePath.split('/').pop()}`
    },
    submitEnglishDictationPhoto: async payload => {
      submitted.push(payload)
      return { success: true, analysisStatus: 'pending_analysis', photoFileIds: payload.photoFileIds }
    },
    analyzeEnglishDictationPhoto: async payload => {
      analyzed.push(payload)
      return {
        success: true,
        analysisStatus: 'completed',
        results: [
          { wordId: 'word-1', targetWord: 'word1', verdict: 'correct' },
          { wordId: 'word-2', targetWord: 'word2', verdict: 'incorrect' }
        ]
      }
    }
  }
  const wx = createWxMock({
    chooseMedia: options => options.success({
      tempFiles: [
        { tempFilePath: '/tmp/dictation-1.jpg', size: 100 },
        { tempFilePath: '/tmp/dictation-2.jpg', size: 120 }
      ]
    })
  })
  const { page } = loadPage('miniprogram/pages/english-dictation/english-dictation.js', {
    wx,
    modules: { '../../utils/cloud': cloud }
  })

  page.onLoad({
    studentId: 'student-1',
    studentName: encodeURIComponent('钟青羽'),
    grade: '6'
  })
  await waitForPageLoad(page)
  page.onNextTap()
  await page.onChoosePhotoTap()

  assert.equal(page.data.sessionId, 'paper-session-1')
  assert.equal(page.data.queue.length, 20)
  assert.equal(page.data.paperInstruction, '请按题号一行一个词写英文，保留修改痕迹。')
  assert.match(page.data.queue[0].promptText, /看中文意思/)
  assert.match(page.data.queue[1].promptText, /看英文单词/)
  assert.doesNotMatch(page.data.queue[0].promptText, /AI 读词|听中文/)
  assert.equal(page.data.currentIndex, 1)
  assert.equal(page.data.currentItem.word, 'word2')
  assert.equal(uploaded.length, 2)
  assert.equal(uploaded[0].studentId, 'student-1')
  assert.equal(submitted[0].sessionId, 'paper-session-1')
  assert.ok(submitted[0].durationMs > 0)
  assert.deepEqual(JSON.parse(JSON.stringify(submitted[0].photoFileIds)), ['cloud://dictation-1.jpg', 'cloud://dictation-2.jpg'])
  assert.equal(analyzed[0].sessionId, 'paper-session-1')
  assert.equal(page.data.analysisStatus, 'completed')
  assert.equal(page.data.dictationResults.length, 2)
  assert.equal(page.data.uploadedPhotoCount, 2)
  assert.equal(page.data.dictationPhase, 'reviewed')
})

test('English dictation hides backend details when photo upload fails', async () => {
  const cloud = {
    uploadPhoto: async () => {
      throw new Error('失败 BN-ERROR-01 cloud://env/file')
    }
  }
  const wx = createWxMock({
    chooseMedia: options => options.success({
      tempFiles: [{ tempFilePath: '/tmp/dictation.jpg', size: 100 }]
    })
  })
  const { page } = loadPage('miniprogram/pages/english-dictation/english-dictation.js', {
    wx,
    modules: { '../../utils/cloud': cloud }
  })
  page.setData({ studentId: 'student-route-id', sessionId: 'session-route-id' })

  await page.onChoosePhotoTap()

  assert.equal(page.data.error, '上传失败，请稍后重试')
  assert.equal(page.data.studentId, 'student-route-id')
})

test('English dictation page starts in ready phase with a 20-word preview list', async () => {
  const cloud = {
    generateEnglishPaperDictationSession: async () => ({
      sessionId: 'paper-session-1',
      functionType: 'spelling',
      wordItems: Array.from({ length: 20 }, (_, index) => ({
        queueKey: `word-${index + 1}:0`,
        wordId: `word-${index + 1}`,
        word: `word${index + 1}`,
        meanings: [`词义${index + 1}`],
        unit: `Unit ${Math.floor(index / 5) + 1}`,
        promptType: index % 2 === 0 ? 'chinese' : 'english',
        spellingStatus: index % 3 === 0 ? 'needs_practice' : 'untested'
      }))
    })
  }
  const { page } = loadPage('miniprogram/pages/english-dictation/english-dictation.js', {
    wx: createWxMock(),
    modules: { '../../utils/cloud': cloud }
  })

  page.onLoad({ studentId: 'student-1', studentName: encodeURIComponent('钟青羽'), grade: '6' })
  await waitForPageLoad(page)

  assert.equal(page.data.dictationPhase, 'ready')
  assert.equal(page.data.playbackState, 'idle')
  assert.equal(page.data.queue.length, 20)
  assert.equal(page.data.wordListExpanded, true)
  assert.match(page.data.commandHint, /开始/)
  assert.equal(page.data.queue[0].word, 'word1')
  assert.equal(page.data.queue[0].meaningText, '词义1')
})

test('English dictation page auto-plays after start and advances on OK style commands', async () => {
  const spoken = []
  const timers = []
  const cloud = {
    generateEnglishPaperDictationSession: async () => ({
      sessionId: 'paper-session-1',
      functionType: 'spelling',
      wordItems: [
        { queueKey: 'word-1:0', wordId: 'word-1', word: 'science', meanings: ['科学'], promptType: 'chinese' },
        { queueKey: 'word-2:0', wordId: 'word-2', word: 'museum', meanings: ['博物馆'], promptType: 'english' }
      ]
    })
  }
  const { page } = loadPage('miniprogram/pages/english-dictation/english-dictation.js', {
    wx: createWxMock({
      createInnerAudioContext: () => ({
        src: '',
        play: () => {},
        stop: () => {},
        destroy: () => {}
      })
    }),
    setTimeout: (fn, ms) => {
      timers.push({ fn, ms })
      return timers.length
    },
    requirePlugin: () => ({
      getRecordRecognitionManager: () => ({ onStop: () => {}, onError: () => {}, start: () => {}, stop: () => {} }),
      textToSpeech: options => {
        spoken.push({ lang: options.lang, content: options.content })
        options.success({ filename: '/tmp/prompt.mp3' })
      }
    }),
    modules: { '../../utils/cloud': cloud }
  })

  page.onLoad({ studentId: 'student-1' })
  await waitForPageLoad(page)
  page.onStartTap()

  assert.equal(page.data.dictationPhase, 'running')
  assert.equal(page.data.playbackState, 'writing')
  assert.equal(page.data.wordListExpanded, false)
  assert.deepEqual(spoken[0], { lang: 'zh_CN', content: '科学' })
  assert.equal(timers[0].ms, 7000)

  timers[0].fn()
  assert.equal(page.data.playbackState, 'waitingCommand')
  assert.match(page.data.commandHint, /好了/)

  page.handleVoiceNextCommand('OK')
  assert.equal(page.data.currentIndex, 1)
  assert.equal(page.data.dictationPhase, 'running')
  assert.deepEqual(spoken[1], { lang: 'en_US', content: 'museum' })
})

test('English dictation page supports optional voice next command and cleans resources', async () => {
  let stopCount = 0
  let onStopHandler = null
  const manager = {
    onStop: handler => { onStopHandler = handler },
    onError: () => {},
    start: () => {},
    stop: () => { stopCount += 1 }
  }
  const audio = {
    src: '',
    play: () => {},
    stop: () => { audio.stopped = true },
    destroy: () => { audio.destroyed = true }
  }
  const wx = createWxMock({
    createInnerAudioContext: () => audio
  })
  const cloud = {
    generateEnglishPaperDictationSession: async () => ({
      sessionId: 'paper-session-1',
      functionType: 'spelling',
      wordItems: [
        { queueKey: 'word-1:0', wordId: 'word-1', word: 'science', meanings: ['科学'], promptType: 'chinese' },
        { queueKey: 'word-2:0', wordId: 'word-2', word: 'museum', meanings: ['博物馆'], promptType: 'english' }
      ]
    })
  }
  const { page } = loadPage('miniprogram/pages/english-dictation/english-dictation.js', {
    wx,
    requirePlugin: () => ({
      getRecordRecognitionManager: () => manager,
      textToSpeech: options => options.success({ filename: '/tmp/prompt.mp3' })
    }),
    modules: { '../../utils/cloud': cloud }
  })

  page.onLoad({ studentId: 'student-1' })
  await waitForPageLoad(page)
  page.onPlayPromptTap()
  page.onStartTap()
  page.onVoiceNextTap()
  onStopHandler({ result: '好了，下一个' })

  assert.equal(page.data.currentIndex, 1)
  assert.equal(page.data.recordingCommand, false)

  page.onUnload()
  assert.equal(stopCount, 1)
  assert.equal(audio.stopped, true)
  assert.equal(audio.destroyed, true)
})

test('English wrong words page summarizes weak vocabulary and opens practice flows', async () => {
  const wx = createWxMock()
  const cloud = {
    getEnglishVocabularySummary: async studentId => ({
      studentId,
      summary: {
        totalWords: 505,
        familiarity: { needsPracticeCount: 3, dueReviewCount: 2 },
        spelling: { needsPracticeCount: 5, dueReviewCount: 4 },
        overall: { masteredCount: 120 }
      },
      weakWords: [
        { wordId: 'word-1', word: 'Wednesday', wrongCount: 3, meanings: ['星期三'] },
        { wordId: 'word-2', word: 'science', wrongCount: 2, meanings: ['科学'] }
      ]
    })
  }
  const { page } = loadPage('miniprogram/pages/english-wrong-words/english-wrong-words.js', {
    wx,
    modules: { '../../utils/cloud': cloud }
  })

  page.onLoad({
    studentId: 'student-1',
    studentName: encodeURIComponent('钟青羽'),
    grade: '6'
  })
  await waitForPageLoad(page)

  assert.equal(page.data.studentName, '钟青羽')
  assert.equal(page.data.summaryCards.find(item => item.key === 'weak').value, 8)
  assert.equal(page.data.summaryCards.find(item => item.key === 'review').value, 6)
  assert.equal(page.data.weakWords.length, 2)
  assert.equal(page.data.weakWords[0].displayMeaning, '星期三')
  assert.ok(page.data.groups.some(item => item.key === 'spellingWeak' && item.count === 5))

  page.onPracticeTap()
  assert.match(wx.calls.filter(call => call.name === 'navigateTo').at(-1).payload.url, /pages\/english-practice\/english-practice/)
  page.onDictationTap()
  assert.match(wx.calls.filter(call => call.name === 'navigateTo').at(-1).payload.url, /pages\/english-dictation\/english-dictation/)
})

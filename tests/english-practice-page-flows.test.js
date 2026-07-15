const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const ROOT = path.resolve(__dirname, '..')
const { loadPageAndWait, flushAsync, waitForPageLoad, isThenable } = require('./helpers/page-flow-utils')
const { createWxMock, loadPage } = require('./helpers/page-harness')
const util = require('../miniprogram/utils/util')

test('English practice page generates a 20 word familiarity session without patterns', async () => {
  const generated = []
  const cloud = {
    generateEnglishRecognitionSession: async payload => {
      generated.push(payload)
      return {
        sessionId: 'session-1',
        functionType: 'familiarity',
        wordItems: Array.from({ length: 20 }, (_, index) => ({
          queueKey: `word-${index + 1}:0`,
          wordId: `word-${index + 1}`,
          word: `word${index + 1}`,
          meanings: [`词义${index + 1}`],
          promptType: index % 2 === 0 ? 'chinese' : 'english'
        })),
        patternItems: []
      }
    }
  }
  const { page } = loadPage('miniprogram/pages/english-practice/english-practice.js', {
    modules: { '../../utils/cloud': cloud }
  })

  page.onLoad({
    studentId: 'student-1',
    studentName: encodeURIComponent('钟青羽'),
    grade: '6'
  })
  await waitForPageLoad(page)

  assert.equal(generated[0].studentId, 'student-1')
  assert.equal(generated[0].wordLimit, 20)
  assert.equal(generated[0].dimension, 'familiarity')
  assert.equal(page.data.sessionId, 'session-1')
  assert.equal(page.data.functionType, 'familiarity')
  assert.equal(page.data.queue.length, 20)
  assert.equal(page.data.currentItem.word, 'word1')
  assert.equal(page.data.currentItem.promptMainText, '词义1')
  assert.equal(page.data.currentItem.answerInstruction, '请说出英文')
  assert.doesNotMatch(page.data.currentItem.promptText, /听中文/)
  assert.equal(page.data.recordButtonText, '开始回答')
  assert.equal(page.data.queue[1].promptTypeText, '英文提示')
  assert.equal(page.data.queue[1].promptMainText, 'word2')
  assert.equal(page.data.queue[1].answerInstruction, '请说出中文意思')
  assert.doesNotMatch(page.data.queue[1].promptText, /听英文/)
  assert.equal(page.data.progressPercent, 5)
  assert.equal(page.data.patternItems.length, 0)
})

test('English practice page honors the compact task size from the workbench', async () => {
  const generated = []
  const { page } = loadPage('miniprogram/pages/english-practice/english-practice.js', {
    modules: { '../../utils/cloud': { generateEnglishRecognitionSession: async payload => {
      generated.push(payload)
      return { sessionId: 'compact-1', wordItems: [{ wordId: 'word-1', word: 'there', meanings: ['那里'], promptType: 'chinese' }] }
    } } }
  })
  page.onLoad({ studentId: 'student-1', wordLimit: '5' })
  await waitForPageLoad(page)
  assert.equal(generated[0].wordLimit, 5)
})

test('English practice page uses a minimal word-card interaction instead of lecture copy', () => {
  const source = fs.readFileSync(path.join(ROOT, 'miniprogram/pages/english-practice/english-practice.wxml'), 'utf8')

  assert.match(source, /class="practice-shell"/)
  assert.match(source, /class="word-stage-card"/)
  assert.match(source, /class="primary-prompt"/)
  assert.match(source, /class="mic-orb/)
  assert.match(source, /\{\{currentItem\.answerInstruction\}\}/)
  assert.doesNotMatch(source, /class="hero"/)
  assert.doesNotMatch(source, /看清提示后，点击录音按钮说出对应的英文单词或中文意思/)
  assert.doesNotMatch(source, /辅助播放提示/)
})

test('English practice pages avoid duplicate custom back controls', () => {
  const sources = [
    'miniprogram/pages/english-practice/english-practice.wxml',
    'miniprogram/pages/english-dictation/english-dictation.wxml',
    'miniprogram/pages/english-wrong-words/english-wrong-words.wxml'
  ].map(file => fs.readFileSync(path.join(ROOT, file), 'utf8'))

  for (const source of sources) {
    assert.doesNotMatch(source, /class="back"/)
    assert.doesNotMatch(source, /bindtap="onBack"/)
  }
})


test('English practice page hides Chinese prompt playback', () => {
  const source = fs.readFileSync(path.join(ROOT, 'miniprogram/pages/english-practice/english-practice.wxml'), 'utf8')

  assert.match(source, /wx:if="\{\{currentItem\.canPlayPrompt\}\}"/)
})

test('English practice page explains when no vocabulary words are available', async () => {
  const cloud = {
    generateEnglishRecognitionSession: async () => ({
      sessionId: 'session-empty',
      functionType: 'familiarity',
      wordItems: [],
      patternItems: []
    })
  }
  const { page } = loadPage('miniprogram/pages/english-practice/english-practice.js', {
    modules: { '../../utils/cloud': cloud }
  })

  page.onLoad({
    studentId: 'student-1',
    studentName: encodeURIComponent('钟青羽'),
    grade: '6'
  })
  await waitForPageLoad(page)

  assert.equal(page.data.finished, false)
  assert.match(page.data.error, /还没有可练习单词/)
  assert.equal(page.data.queue.length, 0)
})

test('English practice page submits AI recognition attempts and requeues wrong words', async () => {
  const submitted = []
  const cloud = {
    generateEnglishRecognitionSession: async () => ({
      sessionId: 'session-1',
      functionType: 'familiarity',
      wordItems: [{
        queueKey: 'word-1:0',
        wordId: 'word-1',
        word: 'science',
        meanings: ['科学'],
        promptType: 'chinese'
      }],
      patternItems: []
    }),
    submitEnglishRecognitionAttempt: async payload => {
      submitted.push(payload)
      return {
        judgment: { status: 'incorrect', normalizedText: 'siense', confidence: 0.5, reason: '拼写不同' },
        shouldRepeat: true
      }
    }
  }
  const { page } = loadPage('miniprogram/pages/english-practice/english-practice.js', {
    modules: { '../../utils/cloud': cloud }
  })

  page.onLoad({
    studentId: 'student-1',
    studentName: encodeURIComponent('钟青羽'),
    grade: '6'
  })
  await waitForPageLoad(page)
  await page.onRecognitionResult({ recognizedText: 'siense', audioFileID: 'cloud://audio-1' })

  assert.equal(submitted[0].targetWord, 'science')
  assert.equal(submitted[0].recognizedText, 'siense')
  assert.equal(submitted[0].dimension, 'familiarity')
  assert.ok(submitted[0].durationMs > 0)
  assert.equal(page.data.lastResult.status, 'incorrect')
  assert.equal(page.data.lastAnsweredItem.word, 'science')
  assert.equal(page.data.queue.length, 2)
  assert.equal(page.data.currentIndex, 1)
  assert.equal(page.data.currentItem.retryCount, 1)
})

test('English practice sanitizes hostile judgment reasons while preserving judgment semantics', async () => {
  const cloud = {
    submitEnglishRecognitionAttempt: async () => ({
      judgment: {
        status: 'incorrect',
        reason: '失败 BN-ERROR-01 cloud://env/file',
        normalizedText: 'siense',
        judgmentId: '665f8c1a2b3c4d5e6f708192'
      },
      shouldRepeat: true
    })
  }
  const { page } = loadPage('miniprogram/pages/english-practice/english-practice.js', {
    modules: { '../../utils/cloud': cloud }
  })
  const item = { queueKey: 'word-1:0', wordId: 'word-route-id', word: 'science', promptType: 'chinese' }
  page.setData({
    studentId: 'student-route-id',
    sessionId: 'session-route-id',
    queue: [item],
    currentItem: item,
    currentIndex: 0
  })

  await page.onRecognitionResult({ recognizedText: 'siense', audioFileID: 'audio-route-id' })

  assert.equal(page.data.lastResult.status, 'incorrect')
  assert.equal(page.data.lastResult.reason, '回答还不准确，稍后再试一次。')
  assert.equal(page.data.lastResult.normalizedText, 'siense')
  assert.equal(page.data.lastResult.judgmentId, '665f8c1a2b3c4d5e6f708192')
  assert.equal(page.data.lastResult.shouldRepeat, true)
  assert.equal(page.data.sessionId, 'session-route-id')
})

test('English practice replaces hostile answer-submit errors with neutral feedback', async () => {
  const cloud = {
    submitEnglishRecognitionAttempt: async () => {
      throw new Error('失败 BN-ERROR-01 cloud://env/file')
    }
  }
  const { page } = loadPage('miniprogram/pages/english-practice/english-practice.js', {
    modules: { '../../utils/cloud': cloud }
  })
  const item = { queueKey: 'word-1:0', wordId: 'word-route-id', word: 'science', promptType: 'chinese' }
  page.setData({
    studentId: 'student-route-id',
    sessionId: 'session-route-id',
    queue: [item],
    currentItem: item,
    currentIndex: 0
  })

  await page.onRecognitionResult({ recognizedText: 'science', audioFileID: 'audio-route-id' })

  assert.equal(page.data.lastResult.status, 'unclear')
  assert.equal(page.data.lastResult.reason, 'AI 判定失败，请稍后重试。')
  assert.equal(page.data.sessionId, 'session-route-id')
})

test('English practice page cleans voice and prompt audio resources', async () => {
  let stopCount = 0
  const manager = {
    onStop: () => {},
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
    generateEnglishRecognitionSession: async () => ({
      sessionId: 'session-1',
      functionType: 'familiarity',
      wordItems: [{
        queueKey: 'word-1:0',
        wordId: 'word-1',
        word: 'science',
        meanings: ['科学'],
        promptType: 'chinese'
      }],
      patternItems: []
    })
  }
  const { page } = loadPage('miniprogram/pages/english-practice/english-practice.js', {
    wx,
    requirePlugin: () => ({
      getRecordRecognitionManager: () => manager,
      textToSpeech: options => options.success({ filename: '/tmp/prompt.mp3' })
    }),
    modules: { '../../utils/cloud': cloud }
  })

  page.onLoad({ studentId: 'student-1' })
  await waitForPageLoad(page)
  page.startRecord()
  page.onPlayPromptTap()
  page.onUnload()

  assert.equal(stopCount, 1)
  assert.equal(audio.stopped, true)
  assert.equal(audio.destroyed, true)
})

test('English practice page gives immediate feedback when stopping recording', async () => {
  let stopCount = 0
  const timers = []
  const manager = {
    onStop: handler => { manager.stopHandler = handler },
    onError: () => {},
    start: () => {},
    stop: () => { stopCount += 1 }
  }
  const cloud = {
    generateEnglishRecognitionSession: async () => ({
      sessionId: 'session-1',
      functionType: 'familiarity',
      wordItems: [{
        queueKey: 'word-1:0',
        wordId: 'word-1',
        word: 'science',
        meanings: ['科学'],
        promptType: 'chinese'
      }],
      patternItems: []
    }),
    submitEnglishRecognitionAttempt: async () => ({
      judgment: { status: 'correct', reason: '正确' },
      shouldRepeat: false
    })
  }
  const { page } = loadPage('miniprogram/pages/english-practice/english-practice.js', {
    requirePlugin: () => ({ getRecordRecognitionManager: () => manager }),
    modules: { '../../utils/cloud': cloud },
    setTimeout: (handler, delay) => {
      timers.push({ handler, delay })
      return { id: timers.length }
    }
  })

  page.onLoad({ studentId: 'student-1' })
  await waitForPageLoad(page)
  page.onRecordTap()
  assert.equal(page.data.recording, true)
  assert.equal(page.data.recordButtonText, '正在听你说...')

  page.onRecordTap()
  assert.equal(stopCount, 1)
  assert.equal(page.data.recording, false)
  assert.equal(page.data.recognizing, true)
  assert.equal(page.data.recordButtonText, '正在识别...')
  assert.equal(timers.length, 1)

  await manager.stopHandler({ result: 'science', tempFilePath: '/tmp/audio.mp3' })
  assert.equal(page.data.recognizing, false)
  assert.equal(page.data.recordButtonText, '开始回答')
})

test('English practice page recovers when voice recognition stop callback never returns', async () => {
  const timers = []
  const manager = {
    onStop: handler => { manager.stopHandler = handler },
    onRecognize: handler => { manager.recognizeHandler = handler },
    onError: () => {},
    start: () => {},
    stop: () => {}
  }
  const cloud = {
    generateEnglishRecognitionSession: async () => ({
      sessionId: 'session-1',
      functionType: 'familiarity',
      wordItems: [{
        queueKey: 'word-1:0',
        wordId: 'word-1',
        word: 'science',
        meanings: ['科学'],
        promptType: 'chinese'
      }],
      patternItems: []
    })
  }
  const { page } = loadPage('miniprogram/pages/english-practice/english-practice.js', {
    requirePlugin: () => ({ getRecordRecognitionManager: () => manager }),
    modules: { '../../utils/cloud': cloud },
    setTimeout: (handler, delay) => {
      timers.push({ handler, delay })
      return { id: timers.length }
    }
  })

  page.onLoad({ studentId: 'student-1' })
  await waitForPageLoad(page)
  page.onRecordTap()
  page.onRecordTap()

  assert.equal(page.data.recognizing, true)
  assert.equal(timers.length, 1)
  timers[0].handler()

  assert.equal(page.data.recognizing, false)
  assert.equal(page.data.recordButtonText, '开始回答')
  assert.equal(page.data.lastResult.status, 'unclear')
  assert.match(page.data.lastResult.reason, /没有收到语音识别结果/)
})

test('English practice page uses interim speech text when final stop callback is delayed', async () => {
  const timers = []
  const submitted = []
  const manager = {
    onStop: handler => { manager.stopHandler = handler },
    onRecognize: handler => { manager.recognizeHandler = handler },
    onError: () => {},
    start: () => {},
    stop: () => {}
  }
  const cloud = {
    generateEnglishRecognitionSession: async () => ({
      sessionId: 'session-1',
      functionType: 'familiarity',
      wordItems: [{
        queueKey: 'word-1:0',
        wordId: 'word-1',
        word: 'science',
        meanings: ['科学'],
        promptType: 'chinese'
      }],
      patternItems: []
    }),
    submitEnglishRecognitionAttempt: async payload => {
      submitted.push(payload)
      return {
        judgment: { status: 'correct', reason: '正确' },
        shouldRepeat: false
      }
    }
  }
  const { page } = loadPage('miniprogram/pages/english-practice/english-practice.js', {
    requirePlugin: () => ({ getRecordRecognitionManager: () => manager }),
    modules: { '../../utils/cloud': cloud },
    setTimeout: (handler, delay) => {
      timers.push({ handler, delay })
      return { id: timers.length }
    }
  })

  page.onLoad({ studentId: 'student-1' })
  await waitForPageLoad(page)
  page.onRecordTap()
  manager.recognizeHandler({ result: 'science' })
  page.onRecordTap()

  assert.equal(page.data.recognizing, true)
  timers[0].handler()
  await Promise.resolve()
  await Promise.resolve()
  await Promise.resolve()
  await Promise.resolve()

  assert.equal(submitted[0].recognizedText, 'science')
  assert.equal(page.data.lastResult.status, 'correct')
  assert.equal(page.data.recordButtonText, '开始回答')
})

test('English practice page switches to judgment state after speech text is returned', async () => {
  const timers = []
  const manager = {
    onStop: handler => { manager.stopHandler = handler },
    onError: () => {},
    start: () => {},
    stop: () => {}
  }
  const cloud = {
    generateEnglishRecognitionSession: async () => ({
      sessionId: 'session-1',
      functionType: 'familiarity',
      wordItems: [{
        queueKey: 'word-1:0',
        wordId: 'word-1',
        word: 'science',
        meanings: ['科学'],
        promptType: 'chinese'
      }],
      patternItems: []
    }),
    submitEnglishRecognitionAttempt: async () => new Promise(() => {})
  }
  const { page } = loadPage('miniprogram/pages/english-practice/english-practice.js', {
    requirePlugin: () => ({ getRecordRecognitionManager: () => manager }),
    modules: { '../../utils/cloud': cloud },
    setTimeout: (handler, delay) => {
      timers.push({ handler, delay })
      return { id: timers.length }
    }
  })

  page.onLoad({ studentId: 'student-1' })
  await waitForPageLoad(page)
  page.onRecordTap()
  page.onRecordTap()
  manager.stopHandler({ result: 'science', tempFilePath: '/tmp/audio.mp3' })
  await Promise.resolve()

  assert.equal(page.data.recognizing, false)
  assert.equal(page.data.submitting, true)
  assert.equal(page.data.recordButtonText, '正在判断...')
})

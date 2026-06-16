#!/usr/bin/env node

const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const {
  loadEnglishDevtoolsTestCases,
  validateEnglishDevtoolsTestCases
} = require('./english-devtools-test-cases')

function loadAutomator() {
  try {
    return require('miniprogram-automator')
  } catch (error) {
    return require('/tmp/learning-diagnostic-automator/node_modules/miniprogram-automator')
  }
}

const DEFAULT_PROJECT_PATH = path.resolve(__dirname, '..')
const DEFAULT_OUTPUT_DIR = path.join(DEFAULT_PROJECT_PATH, 'tmp', 'english-devtools-e2e')
const DEFAULT_CLI_PATH = '/Applications/wechatwebdevtools.app/Contents/MacOS/cli'

function parseArgs(argv = process.argv.slice(2), env = process.env) {
  const args = new Map()
  for (const arg of argv) {
    if (!arg.startsWith('--')) continue
    const [key, ...rest] = arg.slice(2).split('=')
    args.set(key, rest.join('=') || '1')
  }
  return {
    cliPath: args.get('cli-path') || env.WECHAT_DEVTOOLS_CLI || DEFAULT_CLI_PATH,
    projectPath: path.resolve(args.get('project') || env.ENGLISH_DEVTOOLS_PROJECT_PATH || DEFAULT_PROJECT_PATH),
    outputDir: path.resolve(args.get('output-dir') || env.ENGLISH_DEVTOOLS_OUTPUT_DIR || DEFAULT_OUTPUT_DIR)
  }
}

function safeFileName(value) {
  return String(value || 'english-case').replace(/[^a-zA-Z0-9_-]+/g, '-')
}

async function pageText(page) {
  const root = await page.$('.page')
  assert(root, `page root not found: ${page.path}`)
  return root.text()
}

function assertTexts(caseDef, text) {
  for (const expected of caseDef.expectedTexts || []) {
    assert(text.includes(expected), `${caseDef.id} expected visible text "${expected}", actual: ${text.slice(0, 1000)}`)
  }
  for (const forbidden of caseDef.forbiddenTexts || []) {
    assert(!text.includes(forbidden), `${caseDef.id} should not show "${forbidden}", actual: ${text.slice(0, 1000)}`)
  }
}

async function tapByText(page, selector, text) {
  const elements = await page.$$(selector)
  for (const element of elements) {
    const elementText = await element.text()
    if (elementText.includes(text)) {
      await element.tap()
      await page.waitFor(800)
      return element
    }
  }
  throw new Error(`cannot find ${selector} containing text "${text}"`)
}

async function installEnglishMocks(miniProgram) {
  await miniProgram.evaluate(() => {
    const now = '2026-06-16T09:00:00+08:00'
    const student = { _id: 'student-english-e2e', name: '钟青羽', grade: 6 }
    const permissions = {
      canView: true,
      canManageParents: true,
      canUpload: true,
      canGeneratePaper: true,
      canRetryAnalysis: true
    }
    const wordItems = Array.from({ length: 20 }, (_, index) => ({
      queueKey: `word-${index + 1}:0`,
      wordId: `word-${index + 1}`,
      word: ['science', 'museum', 'pilot', 'factory', 'cinema'][index % 5],
      meanings: [['科学'], ['博物馆'], ['飞行员'], ['工厂'], ['电影院']][index % 5],
      promptType: index % 2 === 0 ? 'chinese' : 'english',
      direction: index % 2 === 0 ? 'cn2en' : 'en2cn'
    }))
    const populatedSummary = {
      totalWords: 505,
      untestedCount: 120,
      needsPracticeCount: 18,
      reviewingCount: 42,
      masteredCount: 180,
      dueReviewCount: 16,
      familiarity: {
        masteredCount: 210,
        needsPracticeCount: 8,
        dueReviewCount: 10,
        untestedCount: 80,
        reviewingCount: 30
      },
      spelling: {
        masteredCount: 150,
        needsPracticeCount: 10,
        dueReviewCount: 6,
        untestedCount: 120,
        reviewingCount: 12
      },
      overall: {
        masteredCount: 140,
        partialCount: 230,
        untestedCount: 135
      }
    }
    const emptySummary = {
      totalWords: 0,
      untestedCount: 0,
      needsPracticeCount: 0,
      reviewingCount: 0,
      masteredCount: 0,
      dueReviewCount: 0,
      familiarity: {},
      spelling: {},
      overall: {}
    }
    const weakWords = [
      { wordId: 'word-1', word: 'science', wrongCount: 3 },
      { wordId: 'word-2', word: 'museum', wrongCount: 2 }
    ]
    const englishSessions = [{
      _id: 'english-familiarity-session-e2e',
      studentId: student._id,
      subject: 'english',
      functionType: 'familiarity',
      type: 'word-familiarity',
      status: 'completed',
      createdAt: now,
      updatedAt: now,
      wordItems: wordItems.slice(0, 20),
      attempts: [{
        wordId: 'word-1',
        targetWord: 'science',
        recognizedText: 'siense',
        durationMs: 3200,
        judgment: { status: 'incorrect', reason: '拼写不同' }
      }]
    }, {
      _id: 'english-spelling-session-e2e',
      studentId: student._id,
      subject: 'english',
      functionType: 'spelling',
      type: 'word-dictation-paper',
      status: 'completed',
      analysisStatus: 'completed',
      createdAt: '2026-06-16T09:20:00+08:00',
      updatedAt: '2026-06-16T09:25:00+08:00',
      wordItems: wordItems.slice(0, 20),
      photoFileIds: ['cloud://mock/english-dictation-paper.jpg'],
      dictationResults: [
        { wordId: 'word-1', targetWord: 'science', recognizedText: 'science', verdict: 'correct' },
        { wordId: 'word-2', targetWord: 'museum', recognizedText: 'musem', verdict: 'incorrect' }
      ],
      durationMs: 420000
    }]

    globalThis.__englishE2EState = {
      calls: [],
      errors: [],
      seedCount: 0,
      recognitionAttempts: [],
      dictationUploads: [],
      analyzedSessions: [],
      uploadCount: 0
    }
    const originalConsoleError = console.error
    console.error = function (...args) {
      globalThis.__englishE2EState.errors.push(args.map(item => (
        item && (item.stack || item.message) ? (item.stack || item.message) : String(item)
      )))
      originalConsoleError.apply(console, args)
    }

    function vocabularyFor(studentId) {
      if (studentId === 'student-english-e2e-no-words') {
        return { success: true, summary: emptySummary, weakWords: [], patternCount: 0 }
      }
      if (studentId === 'student-english-e2e-empty' && globalThis.__englishE2EState.seedCount === 0) {
        return { success: true, summary: emptySummary, weakWords: [], patternCount: 0 }
      }
      return { success: true, summary: populatedSummary, weakWords, patternCount: 0 }
    }

    wx.cloud.callFunction = async ({ name, data }) => {
      globalThis.__englishE2EState.calls.push({ name, action: data && data.action, studentId: data && data.studentId })
      if (name === 'studentData') {
        if (data.action === 'getSubjectDashboard') {
          return {
            result: {
              success: true,
              student,
              permissions,
              profile: {
                _id: 'profile-english',
                studentId: data.studentId,
                subject: 'english',
                subjectName: '英语',
                totalReports: 0,
                updatedAt: now
              },
              reports: [],
              papers: []
            }
          }
        }
        if (data.action === 'getLearningTimeline') {
          return {
            result: {
              success: true,
              student,
              permissions,
              reports: [],
              papers: [],
              englishSessions
            }
          }
        }
      }

      if (name === 'englishVocabulary') {
        if (data.action === 'getVocabularySummary') return { result: vocabularyFor(data.studentId) }
        if (data.action === 'seedPersonalVocabulary') {
          globalThis.__englishE2EState.seedCount += 1
          return { result: { success: true, importedWordCount: 505, importedPatternCount: 0 } }
        }
        if (data.action === 'generateRecognitionSession') {
          if (data.studentId === 'student-english-e2e-no-words') {
            return { result: { success: true, sessionId: 'recognition-empty-e2e', functionType: 'familiarity', wordItems: [], patternItems: [] } }
          }
          return { result: { success: true, sessionId: 'recognition-session-e2e', functionType: 'familiarity', wordItems, patternItems: [] } }
        }
        if (data.action === 'submitRecognitionAttempt') {
          globalThis.__englishE2EState.recognitionAttempts.push(data)
          return {
            result: {
              success: true,
              judgment: { status: 'incorrect', reason: '识别文本与目标单词拼写不同' },
              shouldRepeat: true
            }
          }
        }
        if (data.action === 'generatePaperDictationSession') {
          return { result: { success: true, sessionId: 'paper-dictation-session-e2e', functionType: 'spelling', wordItems, patternItems: [] } }
        }
        if (data.action === 'submitDictationPhoto') {
          globalThis.__englishE2EState.dictationUploads.push(data)
          return { result: { success: true, sessionId: data.sessionId, analysisStatus: 'pending_analysis', photoFileIds: data.photoFileIds } }
        }
        if (data.action === 'analyzeDictationPhoto') {
          globalThis.__englishE2EState.analyzedSessions.push(data.sessionId)
          return {
            result: {
              success: true,
              sessionId: data.sessionId,
              analysisStatus: 'completed',
              results: [
                { wordId: 'word-1', targetWord: 'science', recognizedText: 'science', verdict: 'correct' },
                { wordId: 'word-2', targetWord: 'museum', recognizedText: 'musem', verdict: 'incorrect' }
              ]
            }
          }
        }
      }

      return { result: { success: false, error: `unhandled mock call ${name}:${data && data.action}` } }
    }

    wx.cloud.uploadFile = async ({ cloudPath, filePath }) => {
      globalThis.__englishE2EState.uploadCount += 1
      return { fileID: `cloud://mock/${cloudPath || filePath || 'english-upload.jpg'}` }
    }
    wx.cloud.getTempFileURL = async ({ fileList }) => ({
      fileList: (fileList || []).map(fileID => ({
        fileID,
        tempFileURL: '/assets/images/app-logo-share.jpg'
      }))
    })
    wx.chooseMedia = options => {
      options.success({
        tempFiles: [{ tempFilePath: '/tmp/english-dictation-answer.jpg', size: 1024 }]
      })
    }
  })
}

async function runCase(miniProgram, caseDef, outputDir) {
  const started = Date.now()
  const page = await miniProgram.reLaunch(caseDef.route)
  await page.waitFor(1800)
  if (caseDef.feature === 'learning-records') {
    await page.waitFor(async () => {
      const data = await page.data()
      return data.loading === false
    })
  }
  let text = await pageText(page)
  assertTexts(caseDef, text)

  if (caseDef.feature === 'auto-import') {
    const state = await miniProgram.evaluate(() => globalThis.__englishE2EState)
    assert.equal(state.seedCount, 1, 'empty English workbench should seed the personal vocabulary once')
  }

  if (caseDef.feature === 'familiarity') {
    await page.callMethod('onRecognitionResult', { recognizedText: 'siense', audioFileID: 'cloud://audio-1' })
    await page.waitFor(800)
    text = await pageText(page)
    assert(text.includes('这个词还需要再见几次'), 'familiarity page should render the friendly judgment')
    assert(text.includes('目标单词：science'), 'familiarity page should show the target word after judgment')
    const data = await page.data()
    assert.equal(data.queue.length, 21, 'wrong familiarity answers should be requeued once')
    const state = await miniProgram.evaluate(() => globalThis.__englishE2EState)
    assert.equal(state.recognitionAttempts.length, 1)
    assert(state.recognitionAttempts[0].durationMs > 0)
  }

  if (caseDef.feature === 'paper-dictation') {
    await page.callMethod('handleVoiceNextCommand', '好了，下一个')
    await page.waitFor(500)
    let data = await page.data()
    assert.equal(data.currentIndex, 1, 'voice next command should advance to the next word')
    await tapByText(page, 'button', '拍照上传')
    await page.waitFor(1600)
    text = await pageText(page)
    assert(text.includes('AI 批改结果'), 'paper dictation should show OCR results after upload')
    assert(text.includes('已批改'), 'paper dictation should show a clear completed status')
    assert(text.includes('science'), 'paper dictation results should include target words')
    data = await page.data()
    assert.equal(data.analysisStatus, 'completed')
    assert.equal(data.dictationResults.length, 2)
    const state = await miniProgram.evaluate(() => globalThis.__englishE2EState)
    assert.equal(state.dictationUploads.length, 1)
    assert(state.dictationUploads[0].durationMs > 0)
    assert.equal(state.analyzedSessions[0], 'paper-dictation-session-e2e')
  }

  const screenshotPath = path.join(outputDir, `${safeFileName(caseDef.id)}.png`)
  await miniProgram.screenshot({ path: screenshotPath })
  return {
    id: caseDef.id,
    feature: caseDef.feature,
    name: caseDef.name,
    route: caseDef.route,
    status: 'PASS',
    durationMs: Date.now() - started,
    screenshotPath
  }
}

async function main() {
  const options = parseArgs()
  const library = loadEnglishDevtoolsTestCases()
  validateEnglishDevtoolsTestCases(library)
  fs.mkdirSync(options.outputDir, { recursive: true })

  const automator = loadAutomator()
  const miniProgram = await automator.launch({
    cliPath: options.cliPath,
    projectPath: options.projectPath,
    trustProject: true,
    timeout: 60000
  })

  const logs = []
  const exceptions = []
  miniProgram.on('console', entry => logs.push(entry))
  miniProgram.on('exception', entry => exceptions.push(entry))

  const results = []
  try {
    await installEnglishMocks(miniProgram)
    for (const caseDef of library.cases) {
      try {
        const result = await runCase(miniProgram, caseDef, options.outputDir)
        results.push(result)
        console.log(`PASS ${caseDef.id} ${caseDef.name}`)
      } catch (error) {
        let debugState = null
        try {
          debugState = await miniProgram.evaluate(() => globalThis.__englishE2EState || null)
        } catch (debugError) {
          debugState = { error: debugError && debugError.message ? debugError.message : String(debugError) }
        }
        results.push({
          id: caseDef.id,
          feature: caseDef.feature,
          name: caseDef.name,
          route: caseDef.route,
          status: 'FAIL',
          error: error && (error.stack || error.message || String(error)),
          debugState
        })
        console.error(`FAIL ${caseDef.id}: ${error && error.message ? error.message : error}`)
      }
    }
  } finally {
    await miniProgram.close()
  }

  const report = {
    generatedAt: new Date().toISOString(),
    projectPath: options.projectPath,
    outputDir: options.outputDir,
    caseLibraryVersion: library.version,
    student: library.student,
    results,
    consoleCount: logs.length,
    exceptionCount: exceptions.length
  }
  const reportPath = path.join(options.outputDir, 'results.json')
  fs.writeFileSync(reportPath, `${JSON.stringify(report, null, 2)}\n`)
  const failed = results.filter(item => item.status !== 'PASS')
  console.log(`\nEnglish DevTools E2E report: ${reportPath}`)
  console.log(`Passed ${results.length - failed.length}/${results.length}`)
  if (failed.length > 0) process.exitCode = 1
}

if (require.main === module) {
  main().catch(error => {
    console.error(error && (error.stack || error.message) ? (error.stack || error.message) : error)
    process.exitCode = 1
  })
}

module.exports = {
  parseArgs,
  installEnglishMocks,
  runCase
}

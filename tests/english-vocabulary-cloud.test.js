const test = require('node:test')
const assert = require('node:assert/strict')
const {
  createCloudMock,
  createDatabase,
  loadModule
} = require('./helpers/cloud-function-harness')

function createTcbMock(text) {
  return {
    SYMBOL_CURRENT_ENV: 'test',
    init: () => ({
      ai: () => ({
        createModel: () => ({
          generateText: async () => ({ text })
        })
      })
    })
  }
}

function loadEnglishVocabulary(db, openId = 'owner-1', extraMocks = {}) {
  return loadModule('cloudfunctions/englishVocabulary/index.js', {
    'wx-server-sdk': createCloudMock({ db, openId, ...extraMocks.cloudOptions }),
    '@cloudbase/node-sdk': extraMocks.tcb || createTcbMock(JSON.stringify({ words: [], patterns: [] }))
  })
}

const seed = require('../data/english/zhong-qingyu-pep-vocabulary.seed.json')
const cloudSeed = require('../cloudfunctions/englishVocabulary/zhong-qingyu-pep-vocabulary.json')

function keyOf(word) {
  return [word.word, word.grade, word.volume, word.unit].join('|')
}

test('English import batch stores candidates without writing the formal word library', async () => {
  const db = createDatabase({
    students: [{ _id: 'student-1', _openid: 'owner-1', name: '钟青羽', grade: 6 }],
    englishImportBatches: [],
    studentEnglishWords: [],
    studentEnglishPatterns: []
  })
  const handler = loadEnglishVocabulary(db)

  const result = await handler.main({
    action: 'createImportBatch',
    studentId: 'student-1',
    sourceFile: 'PEP六年级上册 英语单词句型表.pdf',
    defaultGrade: 6,
    defaultVolume: '上册',
    words: [
      { word: 'science', meaning: '科学', unit: 'Unit 1' },
      { word: 'Science', meaning: '科学课', unit: 'Unit 1' }
    ],
    patterns: [{ pattern: 'Where is the museum shop?', meaning: '博物馆商店在哪里？', unit: 'Unit 1' }]
  })

  assert.equal(result.success, true)
  assert.equal(result.wordCandidateCount, 1)
  assert.equal(result.patternCandidateCount, 1)
  assert.equal(db.dump('studentEnglishWords').length, 0)
  assert.equal(db.dump('studentEnglishPatterns').length, 0)
  assert.equal(db.dump('englishImportBatches')[0].status, 'pending_review')
})

test('English import batch can extract candidates from vocabulary page images', async () => {
  const db = createDatabase({
    students: [{ _id: 'student-1', _openid: 'owner-1', name: '钟青羽', grade: 6 }],
    englishImportBatches: [],
    studentEnglishWords: [],
    studentEnglishPatterns: []
  })
  const handler = loadEnglishVocabulary(db, 'owner-1', {
    cloudOptions: {
      getTempFileURL: async ({ fileList }) => ({
        fileList: fileList.map(fileID => ({ fileID, tempFileURL: `https://temp/${fileID}.png` }))
      })
    },
    tcb: createTcbMock(JSON.stringify({
      words: [{ word: 'museum', meaning: '博物馆', unit: 'Unit 1' }],
      patterns: [{ pattern: 'Where is the museum?', grammarPoint: 'where question', unit: 'Unit 1' }]
    }))
  })

  const result = await handler.main({
    action: 'createImportBatch',
    studentId: 'student-1',
    sourceFile: 'PEP六年级上册 英语单词句型表.pdf',
    defaultGrade: 6,
    defaultVolume: '上册',
    pageFileIDs: ['cloud://page-1']
  })

  assert.equal(result.success, true)
  assert.equal(result.wordCandidateCount, 1)
  assert.equal(result.patternCandidateCount, 0)
  assert.equal(db.dump('englishImportBatches')[0].candidateWords[0].word, 'museum')
})

test('confirming an English import batch writes words and patterns into the personal library', async () => {
  const db = createDatabase({
    students: [{ _id: 'student-1', _openid: 'owner-1', name: '钟青羽', grade: 6 }],
    englishImportBatches: [{
      _id: 'batch-1',
      _openid: 'owner-1',
      studentId: 'student-1',
      status: 'pending_review',
      candidateWords: [{
        studentId: 'student-1',
        batchId: 'batch-1',
        word: 'science',
        meanings: ['科学'],
        grade: 6,
        volume: '上册',
        unit: 'Unit 1',
        masteryStatus: 'untested',
        status: 'candidate',
        sources: [{ batchId: 'batch-1', sourceFile: 'source.pdf' }]
      }],
      candidatePatterns: [{
        studentId: 'student-1',
        batchId: 'batch-1',
        pattern: 'Where is the museum shop?',
        meaning: '博物馆商店在哪里？',
        grammarPoint: 'where question',
        grade: 6,
        volume: '上册',
        unit: 'Unit 1',
        status: 'candidate'
      }]
    }],
    studentEnglishWords: [],
    studentEnglishPatterns: []
  })
  const handler = loadEnglishVocabulary(db)

  const result = await handler.main({
    action: 'confirmImportBatch',
    studentId: 'student-1',
    batchId: 'batch-1'
  })

  assert.equal(result.success, true)
  assert.equal(result.importedWordCount, 1)
  assert.equal(result.importedPatternCount, 1)
  assert.equal(db.dump('studentEnglishWords')[0].status, 'active')
  assert.equal(db.dump('studentEnglishWords')[0].masteryStatus, 'untested')
  assert.equal(db.dump('studentEnglishPatterns')[0].status, 'active')
  assert.equal(db.dump('englishImportBatches')[0].status, 'confirmed')
})

test('seeding Zhong Qingyu PEP vocabulary writes the personal word library once', async () => {
  const db = createDatabase({
    students: [{ _id: 'student-1', _openid: 'owner-1', name: '钟青羽', grade: 6 }],
    englishImportBatches: [],
    studentEnglishWords: [],
    studentEnglishPatterns: []
  })
  const handler = loadEnglishVocabulary(db)

  const first = await handler.main({
    action: 'seedPersonalVocabulary',
    studentId: 'student-1'
  })
  const second = await handler.main({
    action: 'seedPersonalVocabulary',
    studentId: 'student-1'
  })

  assert.equal(first.success, true)
  assert.equal(first.totalSeedWords, 505)
  assert.equal(first.importedWordCount, 505)
  assert.equal(second.success, true)
  assert.equal(second.importedWordCount, 0)
  assert.equal(db.dump('studentEnglishWords').length, 505)
  const science = db.dump('studentEnglishWords').find(item => item.word === 'science')
  assert.equal(science.meanings[0], '科学')
  assert.deepEqual(science.familiarity, {
    status: 'untested',
    correctCount: 0,
    wrongCount: 0,
    lastTestedAt: '',
    nextReviewAt: '',
    lastDirection: ''
  })
  assert.deepEqual(science.spelling, {
    status: 'untested',
    correctCount: 0,
    wrongCount: 0,
    lastTestedAt: '',
    nextReviewAt: ''
  })
  assert.equal(science.overallMastery, 'untested')
  assert.equal(db.dump('englishImportBatches')[0].sourceType, 'pep-vocabulary-seed')
  assert.equal(db.dump('englishImportBatches')[0].candidateWords.length, 0)
})

test('English vocabulary summary and dictation session use confirmed personal word library', async () => {
  const db = createDatabase({
    students: [{ _id: 'student-1', _openid: 'owner-1', name: '钟青羽', grade: 6 }],
    studentEnglishWords: [
      { _id: 'word-1', studentId: 'student-1', word: 'due', meanings: ['到期'], masteryStatus: 'reviewing', nextReviewAt: '2026-06-11', wrongCount: 0 },
      { _id: 'word-2', studentId: 'student-1', word: 'weak', meanings: ['薄弱'], masteryStatus: 'needs_practice', wrongCount: 3 },
      { _id: 'word-3', studentId: 'student-1', word: 'new', meanings: ['新的'], masteryStatus: 'untested', wrongCount: 0 },
      { _id: 'word-4', studentId: 'student-1', word: 'done', meanings: ['完成'], masteryStatus: 'mastered', wrongCount: 0 },
      ...Array.from({ length: 24 }, (_, index) => ({
        _id: `word-extra-${index + 1}`,
        studentId: 'student-1',
        word: `extra${index + 1}`,
        meanings: [`额外${index + 1}`],
        masteryStatus: 'untested',
        wrongCount: 0
      }))
    ],
    studentEnglishPatterns: [
      { _id: 'pattern-1', studentId: 'student-1', pattern: 'He goes to school.', grammarPoint: '一般现在时', status: 'active' }
    ],
    englishPracticeSessions: []
  })
  const handler = loadEnglishVocabulary(db)

  const summary = await handler.main({ action: 'getVocabularySummary', studentId: 'student-1', today: '2026-06-11' })
  assert.equal(summary.success, true)
  assert.equal(summary.summary.totalWords, 28)
  assert.equal(summary.summary.dueReviewCount, 1)
  assert.equal(summary.summary.familiarity.totalWords, 28)
  assert.equal(summary.summary.familiarity.dueReviewCount, 1)
  assert.equal(summary.summary.spelling.totalWords, 28)
  assert.equal(summary.summary.spelling.untestedCount, 28)
  assert.equal(summary.summary.overall.partialCount, 3)
  assert.equal(summary.patternCount, 1)

  const session = await handler.main({
    action: 'generatePracticeSession',
    studentId: 'student-1',
    today: '2026-06-11'
  })

  assert.equal(session.success, true)
  assert.equal(session.wordItems.length, 20)
  assert.deepEqual(session.wordItems.slice(0, 2).map(item => item.word), ['due', 'weak'])
  assert.ok(session.wordItems.slice(2).some(item => item.masteryStatus === 'untested'))
  assert.equal(session.wordItems.filter(item => item.promptType === 'chinese').length, 10)
  assert.equal(session.wordItems.filter(item => item.promptType === 'english').length, 10)
  assert.equal(session.patternItems.length, 0)
  assert.equal(db.dump('englishPracticeSessions').length, 1)
  assert.equal(db.dump('englishPracticeSessions')[0].type, 'word-dictation')
})

test('English vocabulary summary reuses a clean same-day cache', async () => {
  const db = createDatabase({
    students: [{ _id: 'student-1', _openid: 'owner-1', name: '钟青羽', grade: 6 }],
    studentEnglishVocabularyStats: [{
      _id: 'stats-1',
      studentId: 'student-1',
      today: '2026-06-11',
      dirty: false,
      summary: {
        totalWords: 505,
        untestedCount: 500,
        needsPracticeCount: 5,
        reviewingCount: 0,
        masteredCount: 0,
        dueReviewCount: 3,
        familiarity: { totalWords: 505, untestedCount: 500, needsPracticeCount: 5, reviewingCount: 0, masteredCount: 0, dueReviewCount: 3 },
        spelling: { totalWords: 505, untestedCount: 505, needsPracticeCount: 0, reviewingCount: 0, masteredCount: 0, dueReviewCount: 0 },
        overall: { untestedCount: 500, partialCount: 5, masteredCount: 0 }
      },
      weakWords: [{ wordId: 'word-1', word: 'science', wrongCount: 3, meanings: ['科学'] }],
      patternCount: 0
    }],
    studentEnglishWords: [],
    studentEnglishPatterns: []
  })
  const handler = loadEnglishVocabulary(db)

  const summary = await handler.main({ action: 'getVocabularySummary', studentId: 'student-1', today: '2026-06-11' })

  assert.equal(summary.success, true)
  assert.equal(summary.cacheHit, true)
  assert.equal(summary.summary.totalWords, 505)
  assert.deepEqual(JSON.parse(JSON.stringify(summary.weakWords.map(item => item.word))), ['science'])
})

test('submitting English dictation attempts uses AI judgment and updates word states', async () => {
  const db = createDatabase({
    students: [{ _id: 'student-1', _openid: 'owner-1', name: '钟青羽', grade: 6 }],
    studentEnglishWords: [
      { _id: 'word-1', studentId: 'student-1', word: 'science', masteryStatus: 'needs_practice', correctCount: 0, wrongCount: 1 },
      { _id: 'word-2', studentId: 'student-1', word: 'museum', masteryStatus: 'reviewing', correctCount: 2, wrongCount: 0 },
      { _id: 'word-3', studentId: 'student-1', word: 'library', masteryStatus: 'untested', correctCount: 0, wrongCount: 0 }
    ],
    englishPracticeSessions: [{
      _id: 'session-1',
      studentId: 'student-1',
      status: 'in_progress',
      attempts: []
    }],
    englishPracticeAttempts: []
  })
  const handler = loadEnglishVocabulary(db)

  const correct = await handler.main({
    action: 'submitDictationAttempt',
    studentId: 'student-1',
    sessionId: 'session-1',
    wordId: 'word-1',
    targetWord: 'science',
    recognizedText: 'S C I E N C E',
    reviewedAt: '2026-06-15T08:00:00+08:00'
  })
  const wrong = await handler.main({
    action: 'submitDictationAttempt',
    studentId: 'student-1',
    sessionId: 'session-1',
    wordId: 'word-2',
    targetWord: 'museum',
    recognizedText: 'music',
    reviewedAt: '2026-06-15T08:01:00+08:00'
  })
  const unclear = await handler.main({
    action: 'submitDictationAttempt',
    studentId: 'student-1',
    sessionId: 'session-1',
    wordId: 'word-3',
    targetWord: 'library',
    recognizedText: '',
    reviewedAt: '2026-06-15T08:02:00+08:00'
  })

  assert.equal(correct.judgment.status, 'correct')
  assert.equal(correct.shouldRepeat, false)
  assert.equal(wrong.judgment.status, 'incorrect')
  assert.equal(wrong.shouldRepeat, true)
  assert.equal(unclear.judgment.status, 'unclear')
  assert.equal(unclear.shouldRepeat, true)
  const words = db.dump('studentEnglishWords')
  assert.equal(words.find(item => item._id === 'word-1').masteryStatus, 'reviewing')
  assert.equal(words.find(item => item._id === 'word-1').nextReviewAt, '2026-06-16')
  assert.equal(words.find(item => item._id === 'word-2').masteryStatus, 'needs_practice')
  assert.equal(words.find(item => item._id === 'word-2').wrongCount, 1)
  assert.equal(words.find(item => item._id === 'word-3').masteryStatus, 'untested')
  assert.equal(db.dump('englishPracticeAttempts').length, 3)
  assert.equal(db.dump('englishPracticeSessions')[0].attemptCount, 3)
})

test('English recognition sessions generate twenty familiarity words without updating progress', async () => {
  const db = createDatabase({
    students: [{ _id: 'student-1', _openid: 'owner-1', name: '钟青羽', grade: 6 }],
    studentEnglishWords: Array.from({ length: 24 }, (_, index) => ({
      _id: `word-${index + 1}`,
      studentId: 'student-1',
      word: `word${String(index + 1).padStart(2, '0')}`,
      meanings: [`词义${index + 1}`],
      familiarity: { status: 'untested', correctCount: 0, wrongCount: 0, lastTestedAt: '', nextReviewAt: '', lastDirection: '' },
      spelling: { status: index < 3 ? 'mastered' : 'untested', correctCount: 0, wrongCount: 0, lastTestedAt: '', nextReviewAt: '' },
      overallMastery: index < 3 ? 'partial' : 'untested'
    })),
    englishPracticeSessions: []
  })
  const handler = loadEnglishVocabulary(db)

  const result = await handler.main({
    action: 'generateRecognitionSession',
    studentId: 'student-1',
    today: '2026-06-16'
  })

  assert.equal(result.success, true)
  assert.equal(result.wordItems.length, 20)
  assert.equal(result.wordItems.filter(item => item.direction === 'cn2en').length, 10)
  assert.equal(result.wordItems.filter(item => item.direction === 'en2cn').length, 10)
  const session = db.dump('englishPracticeSessions')[0]
  assert.equal(session.functionType, 'familiarity')
  assert.equal(session.type, 'word-familiarity')
  assert.equal(db.dump('studentEnglishWords')[0].familiarity.status, 'untested')
})

test('submitting English recognition attempts updates only familiarity progress', async () => {
  const db = createDatabase({
    students: [{ _id: 'student-1', _openid: 'owner-1', name: '钟青羽', grade: 6 }],
    studentEnglishWords: [
      {
        _id: 'word-1',
        studentId: 'student-1',
        word: 'science',
        meanings: ['科学'],
        cnSynonyms: ['科学课'],
        familiarity: { status: 'needs_practice', correctCount: 0, wrongCount: 1, lastTestedAt: '2026-06-15', nextReviewAt: '2026-06-16', lastDirection: 'cn2en' },
        spelling: { status: 'needs_practice', correctCount: 0, wrongCount: 3, lastTestedAt: '2026-06-15', nextReviewAt: '2026-06-16' },
        overallMastery: 'partial'
      }
    ],
    englishPracticeSessions: [{
      _id: 'session-1',
      studentId: 'student-1',
      functionType: 'familiarity',
      type: 'word-familiarity',
      status: 'in_progress',
      attempts: [],
      wordItems: [{ queueKey: 'word-1:0:0', wordId: 'word-1', word: 'science', direction: 'en2cn' }]
    }],
    englishPracticeAttempts: [],
    studentEnglishVocabularyStats: [{
      _id: 'stats-1',
      studentId: 'student-1',
      today: '2026-06-16',
      dirty: false,
      summary: { totalWords: 1 },
      weakWords: [],
      patternCount: 0
    }]
  })
  const handler = loadEnglishVocabulary(db)

  const result = await handler.main({
    action: 'submitRecognitionAttempt',
    studentId: 'student-1',
    sessionId: 'session-1',
    queueKey: 'word-1:0:0',
    wordId: 'word-1',
    direction: 'en2cn',
    recognizedText: '科学课',
    reviewedAt: '2026-06-16T08:00:00+08:00'
  })

  assert.equal(result.success, true)
  assert.equal(result.judgment.status, 'correct')
  assert.equal(result.shouldRepeat, false)
  const word = db.dump('studentEnglishWords')[0]
  assert.equal(word.familiarity.status, 'reviewing')
  assert.equal(word.familiarity.correctCount, 1)
  assert.equal(word.familiarity.lastDirection, 'en2cn')
  assert.deepEqual(word.spelling, {
    status: 'needs_practice',
    correctCount: 0,
    wrongCount: 3,
    lastTestedAt: '2026-06-15',
    nextReviewAt: '2026-06-16'
  })
  assert.equal(db.dump('englishPracticeAttempts').length, 1)
  assert.equal(db.dump('englishPracticeSessions')[0].attemptCount, 1)
  assert.equal(db.dump('studentEnglishVocabularyStats')[0].dirty, true)
})

test('English attempts load the requested word document instead of scanning the vocabulary', async () => {
  const db = createDatabase({
    students: [{ _id: 'student-1', _openid: 'owner-1', name: '钟青羽', grade: 6 }],
    studentEnglishWords: [{
      _id: 'word-1',
      studentId: 'student-1',
      word: 'science',
      meanings: ['科学'],
      masteryStatus: 'untested',
      correctCount: 0,
      wrongCount: 0
    }],
    englishPracticeSessions: [{
      _id: 'session-1',
      studentId: 'student-1',
      functionType: 'familiarity',
      status: 'in_progress',
      wordItems: [{ queueKey: 'word-1:0:0', wordId: 'word-1', word: 'science', direction: 'cn2en' }]
    }],
    englishPracticeAttempts: [],
    studentEnglishVocabularyStats: []
  })
  const originalCollection = db.collection
  db.collection = name => {
    const collection = originalCollection(name)
    if (name === 'studentEnglishWords') {
      collection.where = () => {
        throw new Error('studentEnglishWords must be loaded by document id')
      }
    }
    return collection
  }
  const handler = loadEnglishVocabulary(db)

  const result = await handler.main({
    action: 'submitRecognitionAttempt',
    attemptId: 'attempt-direct-read',
    studentId: 'student-1',
    sessionId: 'session-1',
    queueKey: 'word-1:0:0',
    wordId: 'word-1',
    direction: 'cn2en',
    recognizedText: 'science'
  })

  assert.equal(result.success, true)
})

test('concurrent English attempts are stored separately without overwriting each other', async () => {
  const db = createDatabase({
    students: [{ _id: 'student-1', _openid: 'owner-1', name: '钟青羽', grade: 6 }],
    studentEnglishWords: [
      { _id: 'word-1', studentId: 'student-1', word: 'science', masteryStatus: 'untested', correctCount: 0, wrongCount: 0 },
      { _id: 'word-2', studentId: 'student-1', word: 'museum', masteryStatus: 'untested', correctCount: 0, wrongCount: 0 }
    ],
    englishPracticeSessions: [{
      _id: 'session-1',
      studentId: 'student-1',
      status: 'in_progress',
      attempts: []
    }],
    englishPracticeAttempts: [],
    studentEnglishVocabularyStats: []
  })
  const handler = loadEnglishVocabulary(db)

  const results = await Promise.all([
    handler.main({
      action: 'submitDictationAttempt',
      attemptId: 'attempt-1',
      studentId: 'student-1',
      sessionId: 'session-1',
      queueKey: 'word-1:0:0',
      wordId: 'word-1',
      recognizedText: 'science'
    }),
    handler.main({
      action: 'submitDictationAttempt',
      attemptId: 'attempt-2',
      studentId: 'student-1',
      sessionId: 'session-1',
      queueKey: 'word-2:1:0',
      wordId: 'word-2',
      recognizedText: 'museum'
    })
  ])

  assert.equal(results.every(result => result.success), true)
  assert.equal(db.dump('englishPracticeAttempts').length, 2)
  assert.equal(db.dump('englishPracticeSessions')[0].attemptCount, 2)
})

test('retrying the same English attempt is idempotent', async () => {
  const db = createDatabase({
    students: [{ _id: 'student-1', _openid: 'owner-1', name: '钟青羽', grade: 6 }],
    studentEnglishWords: [{
      _id: 'word-1',
      studentId: 'student-1',
      word: 'science',
      masteryStatus: 'untested',
      correctCount: 0,
      wrongCount: 0
    }],
    englishPracticeSessions: [{ _id: 'session-1', studentId: 'student-1', status: 'in_progress', attempts: [] }],
    englishPracticeAttempts: [],
    studentEnglishVocabularyStats: []
  })
  const handler = loadEnglishVocabulary(db)
  const event = {
    action: 'submitDictationAttempt',
    studentId: 'student-1',
    sessionId: 'session-1',
    queueKey: 'word-1:0:0',
    wordId: 'word-1',
    recognizedText: 'science',
    reviewedAt: '2026-06-11T23:59:00+08:00'
  }

  const first = await handler.main(event)
  const retry = await handler.main({ ...event, reviewedAt: '2026-06-12T00:01:00+08:00' })

  assert.equal(first.success, true)
  assert.equal(retry.success, true)
  assert.equal(retry.duplicate, true)
  assert.equal(db.dump('englishPracticeAttempts').length, 1)
  assert.equal(db.dump('englishPracticeSessions')[0].attemptCount, 1)
  assert.equal(db.dump('studentEnglishWords')[0].correctCount, 1)
})

test('English attempts reject a word owned by another student', async () => {
  const db = createDatabase({
    students: [{ _id: 'student-1', _openid: 'owner-1', name: '钟青羽', grade: 6 }],
    studentEnglishWords: [{ _id: 'word-other', studentId: 'student-2', word: 'science' }],
    englishPracticeSessions: [{ _id: 'session-1', studentId: 'student-1', status: 'in_progress', attempts: [] }],
    englishPracticeAttempts: []
  })
  const handler = loadEnglishVocabulary(db)

  const result = await handler.main({
    action: 'submitDictationAttempt',
    attemptId: 'attempt-wrong-owner',
    studentId: 'student-1',
    sessionId: 'session-1',
    queueKey: 'word-other:0:0',
    wordId: 'word-other',
    recognizedText: 'science'
  })

  assert.equal(result.success, false)
  assert.match(result.error, /归属/)
  assert.equal(db.dump('englishPracticeAttempts').length, 0)
})

test('English paper dictation sessions generate spelling words without updating progress', async () => {
  const db = createDatabase({
    students: [{ _id: 'student-1', _openid: 'owner-1', name: '钟青羽', grade: 6 }],
    studentEnglishWords: Array.from({ length: 24 }, (_, index) => ({
      _id: `word-${index + 1}`,
      studentId: 'student-1',
      word: `word${String(index + 1).padStart(2, '0')}`,
      meanings: [`词义${index + 1}`],
      familiarity: { status: index < 3 ? 'mastered' : 'untested', correctCount: 0, wrongCount: 0, lastTestedAt: '', nextReviewAt: '', lastDirection: '' },
      spelling: { status: 'untested', correctCount: 0, wrongCount: 0, lastTestedAt: '', nextReviewAt: '' },
      overallMastery: index < 3 ? 'partial' : 'untested'
    })),
    englishPracticeSessions: []
  })
  const handler = loadEnglishVocabulary(db)

  const result = await handler.main({
    action: 'generatePaperDictationSession',
    studentId: 'student-1',
    today: '2026-06-16'
  })

  assert.equal(result.success, true)
  assert.equal(result.wordItems.length, 20)
  assert.equal(result.wordItems.filter(item => item.promptType === 'chinese').length, 10)
  assert.equal(result.wordItems.filter(item => item.promptType === 'english').length, 10)
  const session = db.dump('englishPracticeSessions')[0]
  assert.equal(session.functionType, 'spelling')
  assert.equal(session.type, 'word-dictation-paper')
  assert.equal(session.analysisStatus, 'waiting_upload')
  assert.deepEqual(session.photoFileIds, [])
  assert.equal(db.dump('studentEnglishWords')[0].spelling.status, 'untested')
})

test('submitting English dictation photos stores evidence without judging spelling yet', async () => {
  const db = createDatabase({
    students: [{ _id: 'student-1', _openid: 'owner-1', name: '钟青羽', grade: 6 }],
    studentEnglishWords: [{
      _id: 'word-1',
      studentId: 'student-1',
      word: 'science',
      spelling: { status: 'untested', correctCount: 0, wrongCount: 0, lastTestedAt: '', nextReviewAt: '' }
    }],
    englishPracticeSessions: [{
      _id: 'session-1',
      studentId: 'student-1',
      functionType: 'spelling',
      type: 'word-dictation-paper',
      status: 'in_progress',
      analysisStatus: 'waiting_upload',
      photoFileIds: [],
      wordItems: [{ queueKey: 'word-1:0:0', wordId: 'word-1', word: 'science' }]
    }]
  })
  const handler = loadEnglishVocabulary(db)

  const result = await handler.main({
    action: 'submitDictationPhoto',
    studentId: 'student-1',
    sessionId: 'session-1',
    photoFileIds: ['cloud://photo-1', 'not-cloud', 'cloud://photo-2']
  })

  assert.equal(result.success, true)
  assert.equal(result.analysisStatus, 'pending_analysis')
  const session = db.dump('englishPracticeSessions')[0]
  assert.equal(session.status, 'submitted')
  assert.equal(session.analysisStatus, 'pending_analysis')
  assert.deepEqual(session.photoFileIds, ['cloud://photo-1', 'cloud://photo-2'])
  assert.equal(db.dump('studentEnglishWords')[0].spelling.status, 'untested')
})

test('analyzing English dictation photos updates only spelling progress from constrained OCR', async () => {
  const db = createDatabase({
    students: [{ _id: 'student-1', _openid: 'owner-1', name: '钟青羽', grade: 6 }],
    studentEnglishWords: [
      {
        _id: 'word-1',
        studentId: 'student-1',
        word: 'science',
        meanings: ['科学'],
        familiarity: { status: 'mastered', correctCount: 4, wrongCount: 0, lastTestedAt: '2026-06-15', nextReviewAt: '', lastDirection: 'cn2en' },
        spelling: { status: 'untested', correctCount: 0, wrongCount: 0, lastTestedAt: '', nextReviewAt: '' },
        overallMastery: 'partial'
      },
      {
        _id: 'word-2',
        studentId: 'student-1',
        word: 'museum',
        meanings: ['博物馆'],
        familiarity: { status: 'reviewing', correctCount: 2, wrongCount: 0, lastTestedAt: '2026-06-15', nextReviewAt: '2026-06-18', lastDirection: 'en2cn' },
        spelling: { status: 'reviewing', correctCount: 2, wrongCount: 0, lastTestedAt: '2026-06-15', nextReviewAt: '2026-06-18' },
        overallMastery: 'partial'
      },
      {
        _id: 'word-3',
        studentId: 'student-1',
        word: 'library',
        meanings: ['图书馆'],
        familiarity: { status: 'untested', correctCount: 0, wrongCount: 0, lastTestedAt: '', nextReviewAt: '', lastDirection: '' },
        spelling: { status: 'untested', correctCount: 0, wrongCount: 0, lastTestedAt: '', nextReviewAt: '' },
        overallMastery: 'untested'
      }
    ],
    englishPracticeSessions: [{
      _id: 'session-1',
      studentId: 'student-1',
      functionType: 'spelling',
      type: 'word-dictation-paper',
      status: 'submitted',
      analysisStatus: 'pending_analysis',
      photoFileIds: ['cloud://dictation-1'],
      wordItems: [
        { queueKey: 'word-1:0:0', wordId: 'word-1', word: 'science' },
        { queueKey: 'word-2:1:0', wordId: 'word-2', word: 'museum' },
        { queueKey: 'word-3:2:0', wordId: 'word-3', word: 'library' }
      ]
    }]
  })
  const handler = loadEnglishVocabulary(db, 'owner-1', {
    cloudOptions: {
      getTempFileURL: async ({ fileList }) => ({
        fileList: fileList.map(fileID => ({ fileID, tempFileURL: `https://temp/${fileID}.jpg` }))
      })
    },
    tcb: createTcbMock(JSON.stringify({
      results: [
        { wordId: 'word-1', targetWord: 'science', recognizedText: 'science', verdict: 'correct', confidence: 0.98, reason: '拼写正确' },
        { wordId: 'word-2', targetWord: 'museum', recognizedText: 'musem', verdict: 'incorrect', confidence: 0.9, reason: '少写一个 u' },
        { wordId: 'word-3', targetWord: 'library', recognizedText: '', verdict: 'unclear', confidence: 0.2, reason: '空白或看不清' }
      ]
    }))
  })

  const result = await handler.main({
    action: 'analyzeDictationPhoto',
    studentId: 'student-1',
    sessionId: 'session-1',
    reviewedAt: '2026-06-16T09:00:00+08:00'
  })

  assert.equal(result.success, true)
  assert.equal(result.analysisStatus, 'completed')
  assert.equal(result.results.length, 3)
  const words = db.dump('studentEnglishWords')
  const science = words.find(item => item._id === 'word-1')
  const museum = words.find(item => item._id === 'word-2')
  const library = words.find(item => item._id === 'word-3')
  assert.equal(science.spelling.status, 'reviewing')
  assert.equal(science.spelling.nextReviewAt, '2026-06-17')
  assert.equal(science.familiarity.status, 'mastered')
  assert.equal(museum.spelling.status, 'needs_practice')
  assert.equal(museum.spelling.wrongCount, 1)
  assert.equal(library.spelling.status, 'untested')
  const session = db.dump('englishPracticeSessions')[0]
  assert.equal(session.status, 'completed')
  assert.equal(session.analysisStatus, 'completed')
  assert.equal(session.dictationResults.length, 3)
})

test('English dictation photo analysis deterministically rechecks AI verdicts', async () => {
  const db = createDatabase({
    students: [{ _id: 'student-1', _openid: 'owner-1', name: '钟青羽', grade: 6 }],
    studentEnglishWords: [
      {
        _id: 'word-1',
        studentId: 'student-1',
        word: 'science',
        familiarity: { status: 'mastered', correctCount: 4, wrongCount: 0, lastTestedAt: '2026-06-15', nextReviewAt: '', lastDirection: 'cn2en' },
        spelling: { status: 'untested', correctCount: 0, wrongCount: 0, lastTestedAt: '', nextReviewAt: '' }
      },
      {
        _id: 'word-2',
        studentId: 'student-1',
        word: 'museum',
        familiarity: { status: 'mastered', correctCount: 4, wrongCount: 0, lastTestedAt: '2026-06-15', nextReviewAt: '', lastDirection: 'cn2en' },
        spelling: { status: 'untested', correctCount: 0, wrongCount: 0, lastTestedAt: '', nextReviewAt: '' }
      },
      {
        _id: 'word-3',
        studentId: 'student-1',
        word: 'library',
        familiarity: { status: 'mastered', correctCount: 4, wrongCount: 0, lastTestedAt: '2026-06-15', nextReviewAt: '', lastDirection: 'cn2en' },
        spelling: { status: 'untested', correctCount: 0, wrongCount: 0, lastTestedAt: '', nextReviewAt: '' }
      }
    ],
    englishPracticeSessions: [{
      _id: 'session-1',
      studentId: 'student-1',
      functionType: 'spelling',
      status: 'submitted',
      analysisStatus: 'pending_analysis',
      photoFileIds: ['cloud://dictation-1'],
      wordItems: [
        { queueKey: 'word-1:0:0', wordId: 'word-1', word: 'science' },
        { queueKey: 'word-2:1:0', wordId: 'word-2', word: 'museum' },
        { queueKey: 'word-3:2:0', wordId: 'word-3', word: 'library' }
      ]
    }]
  })
  const handler = loadEnglishVocabulary(db, 'owner-1', {
    cloudOptions: {
      getTempFileURL: async ({ fileList }) => ({
        fileList: fileList.map(fileID => ({ fileID, tempFileURL: `https://temp/${fileID}.jpg` }))
      })
    },
    tcb: createTcbMock(JSON.stringify({
      results: [
        { wordId: 'word-1', targetWord: 'science', recognizedText: 'science', verdict: 'incorrect', reason: 'AI 误判为错' },
        { wordId: 'word-2', targetWord: 'museum', recognizedText: 'musem', verdict: 'correct', reason: 'AI 误判为对' },
        { wordId: 'word-3', targetWord: 'library', recognizedText: '', verdict: 'correct', reason: '空白误判' }
      ]
    }))
  })

  const result = await handler.main({
    action: 'analyzeDictationPhoto',
    studentId: 'student-1',
    sessionId: 'session-1',
    reviewedAt: '2026-06-16T09:00:00+08:00'
  })

  assert.deepEqual(result.results.map(item => item.verdict), ['correct', 'incorrect', 'unclear'])
  const words = db.dump('studentEnglishWords')
  assert.equal(words.find(item => item._id === 'word-1').spelling.status, 'reviewing')
  assert.equal(words.find(item => item._id === 'word-2').spelling.status, 'needs_practice')
  assert.equal(words.find(item => item._id === 'word-3').spelling.status, 'untested')
})

test('submitting English dictation photos records elapsed duration', async () => {
  const db = createDatabase({
    students: [{ _id: 'student-1', _openid: 'owner-1', name: '钟青羽', grade: 6 }],
    englishPracticeSessions: [{
      _id: 'session-1',
      studentId: 'student-1',
      functionType: 'spelling',
      status: 'in_progress',
      analysisStatus: 'waiting_upload',
      photoFileIds: [],
      wordItems: []
    }]
  })
  const handler = loadEnglishVocabulary(db)

  const result = await handler.main({
    action: 'submitDictationPhoto',
    studentId: 'student-1',
    sessionId: 'session-1',
    photoFileIds: ['cloud://photo-1'],
    durationMs: 123456
  })

  assert.equal(result.success, true)
  assert.equal(db.dump('englishPracticeSessions')[0].durationMs, 123456)
})

// ── Seed data integrity (merged from english-vocabulary-seed.test.js) ──

test('Zhong Qingyu PEP English vocabulary seed is complete enough for dictation', () => {
  assert.equal(seed.studentName, '钟青羽')
  assert.equal(seed.subject, 'english')
  assert.equal(seed.wordCount, seed.words.length)
  assert.ok(seed.wordCount >= 500)
  assert.equal(seed.sources.length, 7)
  assert.deepEqual(seed.sources.map(item => `${item.grade}${item.volume}`), [
    '3上册',
    '3下册',
    '4上册',
    '4下册',
    '5上册',
    '5下册',
    '6上册'
  ])
})

test('Zhong Qingyu PEP English vocabulary seed has stable word identities and meanings', () => {
  const keys = seed.words.map(keyOf)
  assert.equal(new Set(keys).size, keys.length)
  assert.equal(seed.words.filter(word => !word.word || !word.unit || !word.meanings || !word.meanings[0]).length, 0)

  const byKey = new Map(seed.words.map(word => [keyOf(word), word]))
  assert.equal(byKey.get('science|6|上册|Unit 1').meanings[0], '科学')
  assert.equal(byKey.get('museum|6|上册|Unit 1').meanings[0], '博物馆')
  assert.equal(byKey.get('classroom|4|上册|Unit 1').meanings[0], '教室')
  assert.equal(byKey.get('january|5|下册|Unit 3').meanings[0], '一月')
  assert.equal(byKey.get('breakfast|4|下册|Unit 2').meanings[0], '早餐；早饭')
})

test('cloud function seed copy stays in sync with the project archive seed', () => {
  assert.equal(cloudSeed.wordCount, seed.wordCount)
  assert.deepEqual(cloudSeed.words.map(keyOf), seed.words.map(keyOf))
})

const test = require('node:test')
const assert = require('node:assert/strict')

const {
  normalizeImportCandidates,
  normalizeWordProgress,
  applyWordReviewResult,
  buildVocabularySummary,
  selectPracticeItems,
  judgeSpokenWord,
  buildDictationItems
} = require('../cloudfunctions/_shared/english-vocabulary')

test('normalizes English import candidates and deduplicates by word grade volume and unit', () => {
  const normalized = normalizeImportCandidates({
    studentId: 'student-1',
    batchId: 'batch-1',
    sourceFile: 'PEP六年级上册 英语单词句型表.pdf',
    defaultGrade: 6,
    defaultVolume: '上册',
    words: [
      { word: '  science ', meaning: '科学', unit: 'Unit 1', phonetic: '/saiəns/' },
      { word: 'Science', meaning: '科学课', unit: 'Unit 1', partOfSpeech: 'n.' },
      { word: 'museum', meaning: '博物馆', unit: 'Unit 1' }
    ],
    patterns: [
      { pattern: 'Where is the museum shop?', meaning: '博物馆商店在哪里？', unit: 'Unit 1', grammarPoint: 'where question' }
    ]
  })

  assert.equal(normalized.words.length, 2)
  assert.equal(normalized.words[0].word, 'science')
  assert.deepEqual(normalized.words[0].meanings, ['科学', '科学课'])
  assert.equal(normalized.words[0].status, 'candidate')
  assert.equal(normalized.words[0].masteryStatus, 'untested')
  assert.deepEqual(normalized.words[0].familiarity, {
    status: 'untested',
    correctCount: 0,
    wrongCount: 0,
    lastTestedAt: '',
    nextReviewAt: '',
    lastDirection: ''
  })
  assert.deepEqual(normalized.words[0].spelling, {
    status: 'untested',
    correctCount: 0,
    wrongCount: 0,
    lastTestedAt: '',
    nextReviewAt: ''
  })
  assert.equal(normalized.words[0].overallMastery, 'untested')
  assert.equal(normalized.words[0].sources.length, 2)
  assert.equal(normalized.words[1].word, 'museum')
  assert.equal(normalized.patterns.length, 1)
  assert.equal(normalized.patterns[0].pattern, 'Where is the museum shop?')
  assert.equal(normalized.patterns[0].status, 'candidate')
})

test('normalizes legacy English word progress into dual familiarity and spelling dimensions', () => {
  const normalized = normalizeWordProgress({
    _id: 'word-1',
    word: 'science',
    meanings: ['科学'],
    masteryStatus: 'reviewing',
    correctCount: 2,
    wrongCount: 1,
    lastReviewedAt: '2026-06-15',
    nextReviewAt: '2026-06-19'
  })

  assert.deepEqual(normalized.familiarity, {
    status: 'reviewing',
    correctCount: 2,
    wrongCount: 1,
    lastTestedAt: '2026-06-15',
    nextReviewAt: '2026-06-19',
    lastDirection: ''
  })
  assert.deepEqual(normalized.spelling, {
    status: 'untested',
    correctCount: 0,
    wrongCount: 0,
    lastTestedAt: '',
    nextReviewAt: ''
  })
  assert.equal(normalized.overallMastery, 'partial')
  assert.equal(normalized.masteryStatus, 'reviewing')
})

test('spaced mastery follows one day three day and seven day reviews before mastered', () => {
  const first = applyWordReviewResult({
    masteryStatus: 'needs_practice',
    correctCount: 0,
    wrongCount: 2
  }, {
    correct: true,
    reviewedAt: '2026-06-15T08:00:00+08:00'
  })

  assert.equal(first.masteryStatus, 'reviewing')
  assert.equal(first.correctCount, 1)
  assert.equal(first.nextReviewAt, '2026-06-16')

  const second = applyWordReviewResult(first, {
    correct: true,
    reviewedAt: '2026-06-16T08:00:00+08:00'
  })

  assert.equal(second.masteryStatus, 'reviewing')
  assert.equal(second.correctCount, 2)
  assert.equal(second.nextReviewAt, '2026-06-19')

  const third = applyWordReviewResult(second, {
    correct: true,
    reviewedAt: '2026-06-19T08:00:00+08:00'
  })

  assert.equal(third.masteryStatus, 'reviewing')
  assert.equal(third.correctCount, 3)
  assert.equal(third.nextReviewAt, '2026-06-26')

  const fourth = applyWordReviewResult(third, {
    correct: true,
    reviewedAt: '2026-06-26T08:00:00+08:00'
  })

  assert.equal(fourth.masteryStatus, 'mastered')
  assert.equal(fourth.correctCount, 4)
  assert.equal(fourth.nextReviewAt, '')
})

test('AI dictation judgment handles exact correct wrong and unclear recognition', () => {
  assert.deepEqual(judgeSpokenWord({ targetWord: 'science', recognizedText: 'S C I E N C E' }), {
    status: 'correct',
    normalizedTarget: 'science',
    normalizedText: 'science',
    confidence: 1,
    reason: '识别文本与目标单词一致'
  })

  assert.equal(judgeSpokenWord({ targetWord: 'museum', recognizedText: 'music' }).status, 'incorrect')
  assert.equal(judgeSpokenWord({ targetWord: 'museum', recognizedText: '' }).status, 'unclear')
})

test('dictation items default to twenty words and split Chinese and English prompts evenly', () => {
  const words = Array.from({ length: 24 }, (_, index) => ({
    _id: `word-${index + 1}`,
    word: `word${String(index + 1).padStart(2, '0')}`,
    meanings: [`词义${index + 1}`],
    masteryStatus: index < 3 ? 'needs_practice' : 'untested',
    wrongCount: index < 3 ? 3 - index : 0
  }))

  const items = buildDictationItems(words, { today: '2026-06-15' })

  assert.equal(items.length, 20)
  assert.equal(items.filter(item => item.promptType === 'chinese').length, 10)
  assert.equal(items.filter(item => item.promptType === 'english').length, 10)
  assert.ok(items.every(item => item.queueKey && item.wordId && item.word))
})

test('wrong answers reset word to practice and vocabulary summary counts due reviews', () => {
  const reviewed = applyWordReviewResult({
    masteryStatus: 'reviewing',
    correctCount: 2,
    wrongCount: 1,
    nextReviewAt: '2026-06-19'
  }, {
    correct: false,
    reviewedAt: '2026-06-19T08:00:00+08:00'
  })

  assert.equal(reviewed.masteryStatus, 'needs_practice')
  assert.equal(reviewed.correctCount, 0)
  assert.equal(reviewed.wrongCount, 2)
  assert.equal(reviewed.nextReviewAt, '2026-06-20')

  const summary = buildVocabularySummary([
    { masteryStatus: 'needs_practice', nextReviewAt: '2026-06-20' },
    { masteryStatus: 'reviewing', nextReviewAt: '2026-06-15' },
    { masteryStatus: 'mastered' },
    { masteryStatus: 'untested' }
  ], '2026-06-15')

  assert.deepEqual(summary, {
    totalWords: 4,
    untestedCount: 1,
    needsPracticeCount: 1,
    reviewingCount: 1,
    masteredCount: 1,
    dueReviewCount: 1
  })
})

test('practice selection prioritizes due reviews then weak words', () => {
  const selected = selectPracticeItems([
    { _id: 'mastered', word: 'mastered', masteryStatus: 'mastered' },
    { _id: 'future', word: 'future', masteryStatus: 'reviewing', nextReviewAt: '2026-06-20', wrongCount: 4 },
    { _id: 'due', word: 'due', masteryStatus: 'reviewing', nextReviewAt: '2026-06-15', wrongCount: 1 },
    { _id: 'weak', word: 'weak', masteryStatus: 'needs_practice', wrongCount: 3 },
    { _id: 'new', word: 'new', masteryStatus: 'untested', wrongCount: 0 }
  ], { today: '2026-06-15', limit: 3 })

  assert.deepEqual(selected.map(item => item.word), ['due', 'weak', 'new'])
})

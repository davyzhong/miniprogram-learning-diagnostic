const test = require('node:test')
const assert = require('node:assert/strict')

const {
  normalizeImportCandidates,
  normalizeWordProgress,
  applyDimensionAttempt,
  applyWordDimensionAttempt,
  selectWordsForDimension,
  buildDualVocabularySummary,
  applyWordReviewResult,
  buildVocabularySummary,
  selectPracticeItems,
  judgeSpokenWord,
  judgeWrittenWord,
  buildDictationItems
} = require('../cloudfunctions/englishVocabulary/english-vocabulary')

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

test('word dimension attempts update only the requested English progress dimension', () => {
  const word = normalizeWordProgress({
    _id: 'word-1',
    word: 'science',
    familiarity: {
      status: 'needs_practice',
      correctCount: 0,
      wrongCount: 2,
      lastTestedAt: '2026-06-14',
      nextReviewAt: '2026-06-15',
      lastDirection: 'cn2en'
    },
    spelling: {
      status: 'untested',
      correctCount: 0,
      wrongCount: 0,
      lastTestedAt: '',
      nextReviewAt: ''
    }
  })

  const updated = applyWordDimensionAttempt(word, 'familiarity', {
    judgment: { status: 'correct' },
    reviewedAt: '2026-06-16T08:00:00+08:00',
    direction: 'en2cn'
  })

  assert.equal(updated.familiarity.status, 'reviewing')
  assert.equal(updated.familiarity.correctCount, 1)
  assert.equal(updated.familiarity.wrongCount, 2)
  assert.equal(updated.familiarity.lastTestedAt, '2026-06-16')
  assert.equal(updated.familiarity.nextReviewAt, '2026-06-17')
  assert.equal(updated.familiarity.lastDirection, 'en2cn')
  assert.deepEqual(updated.spelling, word.spelling)
  assert.equal(updated.overallMastery, 'partial')
})

test('unclear English dimension attempts leave state unchanged', () => {
  const word = normalizeWordProgress({
    _id: 'word-1',
    word: 'museum',
    spelling: {
      status: 'reviewing',
      correctCount: 2,
      wrongCount: 1,
      lastTestedAt: '2026-06-15',
      nextReviewAt: '2026-06-19'
    }
  })

  const updated = applyWordDimensionAttempt(word, 'spelling', {
    judgment: { status: 'unclear' },
    reviewedAt: '2026-06-16T08:00:00+08:00'
  })

  assert.deepEqual(updated.spelling, word.spelling)
})

test('English dimension state machine handles all statuses and verdicts', () => {
  const cases = [
    ['untested', 'correct', 'reviewing', 1, 2, '2026-06-17'],
    ['untested', 'incorrect', 'needs_practice', 0, 3, '2026-06-17'],
    ['untested', 'unclear', 'untested', 0, 2, '2026-06-20'],
    ['needs_practice', 'correct', 'reviewing', 1, 2, '2026-06-17'],
    ['needs_practice', 'incorrect', 'needs_practice', 0, 3, '2026-06-17'],
    ['needs_practice', 'unclear', 'needs_practice', 0, 2, '2026-06-20'],
    ['reviewing', 'correct', 'mastered', 4, 2, ''],
    ['reviewing', 'incorrect', 'needs_practice', 0, 3, '2026-06-17'],
    ['reviewing', 'unclear', 'reviewing', 3, 2, '2026-06-20'],
    ['mastered', 'correct', 'mastered', 4, 2, ''],
    ['mastered', 'incorrect', 'needs_practice', 0, 3, '2026-06-17'],
    ['mastered', 'unclear', 'mastered', 4, 2, '']
  ]

  for (const [fromStatus, verdict, expectedStatus, expectedCorrect, expectedWrong, expectedNext] of cases) {
    const progress = {
      status: fromStatus,
      correctCount: fromStatus === 'reviewing' || fromStatus === 'mastered' ? 3 + Number(fromStatus === 'mastered') : 0,
      wrongCount: 2,
      lastTestedAt: '2026-06-15',
      nextReviewAt: fromStatus === 'mastered' ? '' : '2026-06-20'
    }
    const updated = applyDimensionAttempt(progress, {
      judgment: { status: verdict },
      reviewedAt: '2026-06-16T08:00:00+08:00'
    })
    assert.equal(updated.status, expectedStatus, `${fromStatus} + ${verdict}`)
    assert.equal(updated.correctCount, expectedCorrect, `${fromStatus} + ${verdict} correctCount`)
    assert.equal(updated.wrongCount, expectedWrong, `${fromStatus} + ${verdict} wrongCount`)
    assert.equal(updated.nextReviewAt, expectedNext, `${fromStatus} + ${verdict} nextReviewAt`)
  }
})

test('dimension word selection prioritizes weak words due reviews and cross-dimension blind spots', () => {
  const selected = selectWordsForDimension([
    {
      _id: 'mastered',
      word: 'mastered',
      familiarity: { status: 'mastered' },
      spelling: { status: 'mastered' }
    },
    {
      _id: 'future',
      word: 'future',
      familiarity: { status: 'untested' },
      spelling: { status: 'reviewing', wrongCount: 9, nextReviewAt: '2026-06-20' }
    },
    {
      _id: 'new',
      word: 'new',
      familiarity: { status: 'untested' },
      spelling: { status: 'untested' }
    },
    {
      _id: 'blind',
      word: 'blind',
      familiarity: { status: 'mastered' },
      spelling: { status: 'untested' }
    },
    {
      _id: 'due',
      word: 'due',
      familiarity: { status: 'untested' },
      spelling: { status: 'reviewing', nextReviewAt: '2026-06-16' }
    },
    {
      _id: 'weak-current',
      word: 'weak-current',
      familiarity: { status: 'mastered' },
      spelling: { status: 'needs_practice', wrongCount: 1 }
    },
    {
      _id: 'double-weak',
      word: 'double-weak',
      familiarity: { status: 'needs_practice', wrongCount: 2 },
      spelling: { status: 'needs_practice', wrongCount: 2 }
    }
  ], {
    dimension: 'spelling',
    today: '2026-06-16',
    limit: 10
  })

  assert.deepEqual(selected.map(item => item.word), [
    'double-weak',
    'weak-current',
    'due',
    'blind',
    'new',
    'future'
  ])
})

test('dimension word selection handles P2/P3 conflicts and reverse blind spots', () => {
  const selected = selectWordsForDimension([
    {
      _id: 'spelling-due',
      word: 'spelling-due',
      familiarity: { status: 'mastered' },
      spelling: { status: 'reviewing', nextReviewAt: '2026-06-16' }
    },
    {
      _id: 'spelling-blind-mastered',
      word: 'spelling-blind-mastered',
      familiarity: { status: 'mastered' },
      spelling: { status: 'untested' }
    },
    {
      _id: 'spelling-blind-reviewing',
      word: 'spelling-blind-reviewing',
      familiarity: { status: 'reviewing' },
      spelling: { status: 'untested' }
    },
    {
      _id: 'brand-new',
      word: 'brand-new',
      familiarity: { status: 'untested' },
      spelling: { status: 'untested' }
    }
  ], {
    dimension: 'spelling',
    today: '2026-06-16',
    limit: 10
  })

  assert.deepEqual(selected.map(item => item.word), [
    'spelling-due',
    'spelling-blind-mastered',
    'brand-new',
    'spelling-blind-reviewing'
  ])

  const reverse = selectWordsForDimension([
    {
      _id: 'familiarity-blind',
      word: 'familiarity-blind',
      familiarity: { status: 'untested' },
      spelling: { status: 'mastered' }
    },
    {
      _id: 'familiarity-new',
      word: 'familiarity-new',
      familiarity: { status: 'untested' },
      spelling: { status: 'untested' }
    }
  ], {
    dimension: 'familiarity',
    today: '2026-06-16',
    limit: 10
  })

  assert.deepEqual(reverse.map(item => item.word), ['familiarity-blind', 'familiarity-new'])
})

test('written word judgment uses deterministic spelling comparison and edit distance', () => {
  assert.deepEqual(judgeWrittenWord({
    targetWord: 'science',
    recognizedText: 'Science'
  }).status, 'correct')

  const incorrect = judgeWrittenWord({
    targetWord: 'museum',
    recognizedText: 'musem'
  })
  assert.equal(incorrect.status, 'incorrect')
  assert.equal(incorrect.editDistance, 1)
  assert.ok(incorrect.confidence > 0.7)

  const unclear = judgeWrittenWord({
    targetWord: 'library',
    recognizedText: ''
  })
  assert.equal(unclear.status, 'unclear')
})

test('dual vocabulary summary counts familiarity spelling and overall mastery separately', () => {
  const summary = buildDualVocabularySummary([
    {
      word: 'both-mastered',
      familiarity: { status: 'mastered' },
      spelling: { status: 'mastered' }
    },
    {
      word: 'familiar-only',
      familiarity: { status: 'mastered' },
      spelling: { status: 'untested' }
    },
    {
      word: 'spelling-weak',
      familiarity: { status: 'reviewing', nextReviewAt: '2026-06-18' },
      spelling: { status: 'needs_practice', wrongCount: 2, nextReviewAt: '2026-06-16' }
    },
    {
      word: 'due-familiarity',
      familiarity: { status: 'reviewing', nextReviewAt: '2026-06-16' },
      spelling: { status: 'reviewing', nextReviewAt: '2026-06-20' }
    }
  ], '2026-06-16')

  assert.equal(summary.totalWords, 4)
  assert.equal(summary.familiarity.masteredCount, 2)
  assert.equal(summary.familiarity.dueReviewCount, 1)
  assert.equal(summary.spelling.needsPracticeCount, 1)
  assert.equal(summary.spelling.dueReviewCount, 1)
  assert.deepEqual(summary.overall, {
    untestedCount: 0,
    partialCount: 3,
    masteredCount: 1
  })
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

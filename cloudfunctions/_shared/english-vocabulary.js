function cleanText(value, maxLength = 200) {
  return String(value || '')
    .replace(/[\r\n\t]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, maxLength)
}

function normalizeWord(value) {
  return cleanText(value, 80)
    .replace(/[“”"']/g, '')
    .trim()
    .toLowerCase()
}

function normalizeUnit(value) {
  const text = cleanText(value, 40)
  if (!text) return ''
  const match = text.match(/unit\s*([0-9]+)/i)
  return match ? `Unit ${match[1]}` : text
}

function dateOnly(value) {
  const date = value ? new Date(value) : new Date()
  if (Number.isNaN(date.getTime())) return ''
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

function addDays(dateText, days) {
  const base = dateText ? new Date(`${dateText}T00:00:00+08:00`) : new Date()
  base.setDate(base.getDate() + days)
  return dateOnly(base)
}

function optionalDateOnly(value) {
  if (!value) return ''
  return dateOnly(value)
}

const WORD_PROGRESS_STATUSES = new Set(['untested', 'needs_practice', 'reviewing', 'mastered'])

function normalizeProgressStatus(value) {
  const status = cleanText(value, 40)
  return WORD_PROGRESS_STATUSES.has(status) ? status : 'untested'
}

function createDefaultDimensionProgress(extra = {}) {
  return {
    status: normalizeProgressStatus(extra.status),
    correctCount: Math.max(0, Number(extra.correctCount) || 0),
    wrongCount: Math.max(0, Number(extra.wrongCount) || 0),
    lastTestedAt: optionalDateOnly(extra.lastTestedAt),
    nextReviewAt: optionalDateOnly(extra.nextReviewAt)
  }
}

function createDefaultFamiliarityProgress(extra = {}) {
  return {
    ...createDefaultDimensionProgress(extra),
    lastDirection: cleanText(extra.lastDirection, 20)
  }
}

function createDefaultSpellingProgress(extra = {}) {
  const progress = createDefaultDimensionProgress(extra)
  delete progress.lastDirection
  return progress
}

function deriveOverallMastery(word = {}) {
  const familiarityStatus = normalizeProgressStatus(word.familiarity && word.familiarity.status)
  const spellingStatus = normalizeProgressStatus(word.spelling && word.spelling.status)
  if (familiarityStatus === 'mastered' && spellingStatus === 'mastered') return 'mastered'
  if (familiarityStatus === 'untested' && spellingStatus === 'untested') return 'untested'
  return 'partial'
}

function normalizeWordProgress(word = {}) {
  const legacyReviewedAt = optionalDateOnly(word.lastReviewedAt)
  const legacyNextReviewAt = optionalDateOnly(word.nextReviewAt)
  const familiarity = word.familiarity
    ? createDefaultFamiliarityProgress(word.familiarity)
    : createDefaultFamiliarityProgress({
      status: word.masteryStatus,
      correctCount: word.correctCount,
      wrongCount: word.wrongCount,
      lastTestedAt: legacyReviewedAt,
      nextReviewAt: legacyNextReviewAt
    })
  const spelling = word.spelling
    ? createDefaultSpellingProgress(word.spelling)
    : createDefaultSpellingProgress()
  const normalized = {
    ...word,
    familiarity,
    spelling
  }
  return {
    ...normalized,
    overallMastery: deriveOverallMastery(normalized)
  }
}

function normalizeSpokenText(value) {
  return cleanText(value, 200)
    .toLowerCase()
    .replace(/[^a-z]+/g, '')
}

function levenshteinDistance(a = '', b = '') {
  const rows = a.length + 1
  const cols = b.length + 1
  const dp = Array.from({ length: rows }, () => Array(cols).fill(0))
  for (let i = 0; i < rows; i += 1) dp[i][0] = i
  for (let j = 0; j < cols; j += 1) dp[0][j] = j
  for (let i = 1; i < rows; i += 1) {
    for (let j = 1; j < cols; j += 1) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1
      dp[i][j] = Math.min(
        dp[i - 1][j] + 1,
        dp[i][j - 1] + 1,
        dp[i - 1][j - 1] + cost
      )
    }
  }
  return dp[a.length][b.length]
}

function judgeSpokenWord({ targetWord = '', recognizedText = '' } = {}) {
  const normalizedTarget = normalizeSpokenText(targetWord)
  const normalizedText = normalizeSpokenText(recognizedText)
  if (!normalizedTarget || !normalizedText) {
    return {
      status: 'unclear',
      normalizedTarget,
      normalizedText,
      confidence: 0,
      reason: '没有识别到可判断的字母'
    }
  }
  if (normalizedText === normalizedTarget || normalizedText.includes(normalizedTarget)) {
    return {
      status: 'correct',
      normalizedTarget,
      normalizedText,
      confidence: 1,
      reason: '识别文本与目标单词一致'
    }
  }

  const distance = levenshteinDistance(normalizedTarget, normalizedText)
  const maxLength = Math.max(normalizedTarget.length, normalizedText.length)
  const confidence = Math.max(0, Number((1 - distance / maxLength).toFixed(2)))
  if (normalizedTarget.length >= 6 && distance === 1 && normalizedTarget[0] === normalizedText[0]) {
    return {
      status: 'correct',
      normalizedTarget,
      normalizedText,
      confidence,
      reason: '识别文本与目标单词高度接近'
    }
  }
  return {
    status: 'incorrect',
    normalizedTarget,
    normalizedText,
    confidence,
    reason: '识别文本与目标单词拼写不同'
  }
}

function uniqueList(values) {
  return Array.from(new Set((values || []).map(item => cleanText(item, 120)).filter(Boolean)))
}

function candidateKey(item) {
  return [
    item.word,
    item.grade || '',
    item.volume || '',
    item.unit || ''
  ].join('|')
}

function normalizeImportCandidates(input = {}) {
  const defaultGrade = Number(input.defaultGrade) || 0
  const defaultVolume = cleanText(input.defaultVolume, 20)
  const batchId = cleanText(input.batchId, 80)
  const studentId = cleanText(input.studentId, 80)
  const sourceFile = cleanText(input.sourceFile, 200)
  const byKey = new Map()

  for (const raw of input.words || []) {
    const word = normalizeWord(raw.word || raw.english || raw.text)
    if (!word || !/[a-z]/.test(word)) continue
    const itemSourceFile = cleanText(raw.sourceFile, 200) || sourceFile
    const item = {
      studentId,
      batchId,
      word,
      meanings: uniqueList([raw.meaning, raw.chinese, raw.translation, ...(Array.isArray(raw.meanings) ? raw.meanings : [])]),
      partOfSpeech: cleanText(raw.partOfSpeech || raw.pos, 40),
      phonetic: cleanText(raw.phonetic, 80),
      grade: Number(raw.grade) || defaultGrade,
      volume: cleanText(raw.volume, 20) || defaultVolume,
      unit: normalizeUnit(raw.unit),
      status: 'candidate',
      masteryStatus: 'untested',
      correctCount: 0,
      wrongCount: 0,
      nextReviewAt: '',
      familiarity: createDefaultFamiliarityProgress(),
      spelling: createDefaultSpellingProgress(),
      overallMastery: 'untested',
      sources: [{
        batchId,
        sourceFile: itemSourceFile,
        sourceKey: cleanText(raw.sourceKey, 80),
        sourceUrl: cleanText(raw.sourceUrl, 240),
        pageIndex: Number(raw.pageIndex) || 0
      }]
    }
    const key = candidateKey(item)
    const existing = byKey.get(key)
    if (existing) {
      existing.meanings = uniqueList([...existing.meanings, ...item.meanings])
      existing.sources.push(...item.sources)
      if (!existing.partOfSpeech && item.partOfSpeech) existing.partOfSpeech = item.partOfSpeech
      if (!existing.phonetic && item.phonetic) existing.phonetic = item.phonetic
    } else {
      byKey.set(key, item)
    }
  }

  const patterns = (input.patterns || [])
    .map(raw => ({
      studentId,
      batchId,
      pattern: cleanText(raw.pattern || raw.sentence || raw.text, 240),
      meaning: cleanText(raw.meaning || raw.chinese || raw.translation, 240),
      grammarPoint: cleanText(raw.grammarPoint || raw.grammar || raw.tense, 80),
      grade: Number(raw.grade) || defaultGrade,
      volume: cleanText(raw.volume, 20) || defaultVolume,
      unit: normalizeUnit(raw.unit),
      status: 'candidate',
      sourceFile,
      pageIndex: Number(raw.pageIndex) || 0
    }))
    .filter(item => item.pattern)

  return {
    words: Array.from(byKey.values()),
    patterns
  }
}

function applyWordReviewResult(word = {}, result = {}) {
  const correct = result.correct === true
  const reviewedAt = dateOnly(result.reviewedAt)
  if (!correct) {
    return {
      ...word,
      masteryStatus: 'needs_practice',
      correctCount: 0,
      wrongCount: (Number(word.wrongCount) || 0) + 1,
      lastReviewedAt: reviewedAt,
      nextReviewAt: addDays(reviewedAt, 1)
    }
  }

  const correctCount = (Number(word.correctCount) || 0) + 1
  if (correctCount >= 4) {
    return {
      ...word,
      masteryStatus: 'mastered',
      correctCount,
      lastReviewedAt: reviewedAt,
      nextReviewAt: ''
    }
  }

  return {
    ...word,
    masteryStatus: 'reviewing',
    correctCount,
    lastReviewedAt: reviewedAt,
    nextReviewAt: addDays(reviewedAt, [1, 3, 7][correctCount - 1] || 7)
  }
}

function isDue(word, today) {
  return Boolean(word.nextReviewAt && word.nextReviewAt <= today && word.masteryStatus !== 'mastered')
}

function buildVocabularySummary(words = [], todayValue = dateOnly(new Date())) {
  const today = dateOnly(todayValue) || todayValue
  const summary = {
    totalWords: words.length,
    untestedCount: 0,
    needsPracticeCount: 0,
    reviewingCount: 0,
    masteredCount: 0,
    dueReviewCount: 0
  }
  for (const word of words) {
    const status = word.masteryStatus || 'untested'
    if (status === 'mastered') summary.masteredCount += 1
    else if (status === 'reviewing') summary.reviewingCount += 1
    else if (status === 'needs_practice') summary.needsPracticeCount += 1
    else summary.untestedCount += 1
    if (isDue(word, today)) summary.dueReviewCount += 1
  }
  return summary
}

function practicePriority(word, today) {
  if (isDue(word, today)) return 0
  if (word.masteryStatus === 'needs_practice') return 1
  if (word.masteryStatus === 'untested' || !word.masteryStatus) return 2
  if (word.masteryStatus === 'reviewing') return 3
  return 9
}

function selectPracticeItems(words = [], options = {}) {
  const today = dateOnly(options.today) || dateOnly(new Date())
  const limit = Math.max(1, Number(options.limit) || 10)
  return (words || [])
    .filter(word => (word.masteryStatus || 'untested') !== 'mastered')
    .slice()
    .sort((a, b) => {
      const priority = practicePriority(a, today) - practicePriority(b, today)
      if (priority) return priority
      const wrong = (Number(b.wrongCount) || 0) - (Number(a.wrongCount) || 0)
      if (wrong) return wrong
      return String(a.word || '').localeCompare(String(b.word || ''))
    })
    .slice(0, limit)
}

function buildDictationItems(words = [], options = {}) {
  const limit = Math.min(30, Math.max(1, Number(options.limit) || 20))
  return selectPracticeItems(words, { ...options, limit }).map((item, index) => ({
    queueKey: `${item._id || item.word}:${index}:0`,
    wordId: item._id || '',
    word: item.word || '',
    meanings: item.meanings || [],
    unit: item.unit || '',
    masteryStatus: item.masteryStatus || 'untested',
    wrongCount: Number(item.wrongCount) || 0,
    promptType: index % 2 === 0 ? 'chinese' : 'english',
    retryCount: 0
  }))
}

function applyWordDictationAttempt(word = {}, attempt = {}) {
  const status = attempt.status || (attempt.judgment && attempt.judgment.status)
  if (status === 'unclear') return { ...word }
  return applyWordReviewResult(word, {
    correct: status === 'correct',
    reviewedAt: attempt.reviewedAt
  })
}

module.exports = {
  cleanText,
  normalizeWord,
  normalizeUnit,
  normalizeImportCandidates,
  normalizeWordProgress,
  deriveOverallMastery,
  applyWordReviewResult,
  applyWordDictationAttempt,
  buildVocabularySummary,
  selectPracticeItems,
  buildDictationItems,
  judgeSpokenWord,
  dateOnly,
  addDays
}

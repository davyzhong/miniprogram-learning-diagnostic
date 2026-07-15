const {
  cleanText,
  normalizeWordProgress,
  buildDualVocabularySummary,
  buildRecognitionItems,
  buildPaperDictationItems,
  dateOnly
} = require('./english-vocabulary')
const { findRelations } = require('./english-word-relations')

function progressCount(summary = {}, dimension, field) {
  return Number(summary[dimension] && summary[dimension][field]) || 0
}

function buildTodayPlan(words = [], today) {
  const summary = buildDualVocabularySummary(words, today)
  const familiarityLoad = progressCount(summary, 'familiarity', 'needsPracticeCount') + progressCount(summary, 'familiarity', 'dueReviewCount')
  const spellingLoad = progressCount(summary, 'spelling', 'needsPracticeCount') + progressCount(summary, 'spelling', 'dueReviewCount')
  const spellingOnly = words.filter(word => {
    const normalized = normalizeWordProgress(word)
    return normalized.familiarity.status === 'mastered' && normalized.spelling.status !== 'mastered'
  })
  const kind = spellingOnly.length > 0 || spellingLoad > familiarityLoad ? 'dictation' : 'recognition'
  const available = kind === 'dictation' ? spellingLoad : familiarityLoad
  const taskSize = available > 10 ? 10 : (available > 0 ? Math.max(5, available) : 5)
  const items = kind === 'dictation'
    ? buildPaperDictationItems(words, { today, limit: taskSize })
    : buildRecognitionItems(words, { today, limit: taskSize })
  return {
    primaryAction: {
      kind,
      taskSize: items.length,
      wordIds: items.map(item => item.wordId).filter(Boolean),
      title: kind === 'dictation'
        ? `先听写 ${items.length} 个${spellingOnly.length ? '会认不会写的' : '待复测'}单词`
        : `先认词 ${items.length} 个待复测单词`,
      estimatedMinutes: kind === 'dictation' ? Math.max(5, items.length + 2) : Math.max(3, Math.ceil(items.length / 2))
    },
    stats: {
      recognitionDue: familiarityLoad,
      spellingDue: spellingLoad,
      recurringWeak: words.filter(word => (Number(word.familiarity && word.familiarity.wrongCount) || 0) + (Number(word.spelling && word.spelling.wrongCount) || 0) >= 2).length,
      fullyMastered: progressCount(summary, 'overall', 'masteredCount')
    },
    featuredWords: items.slice(0, 3).map(item => item.word).filter(Boolean)
  }
}

function createLearningViews({ getCollectionData, ok }) {
  async function getTodayPlan(event) {
    const today = dateOnly(event.today || new Date())
    const words = await getCollectionData('studentEnglishWords', { studentId: event.studentId })
    return ok(buildTodayPlan(words, today))
  }

  async function getConfusionPractice(event) {
    const words = await getCollectionData('studentEnglishWords', { studentId: event.studentId })
    const weak = words.filter(word => {
      const progress = normalizeWordProgress(word)
      return progress.familiarity.status !== 'mastered' || progress.spelling.status !== 'mastered'
    })
    const items = findRelations(weak).slice(0, 3).map(relation => ({
      relationId: relation.id,
      words: relation.words,
      explanation: relation.explanation,
      prompt: relation.prompt,
      answer: relation.answer
    }))
    return ok({ items })
  }

  async function listWords(event) {
    const words = await getCollectionData('studentEnglishWords', { studentId: event.studentId })
    const status = cleanText(event.masteryStatus, 40)
    const unit = cleanText(event.unit, 40)
    return ok({ words: words
      .filter(item => !status || (item.masteryStatus || 'untested') === status)
      .filter(item => !unit || item.unit === unit) })
  }

  return { getTodayPlan, getConfusionPractice, listWords }
}

module.exports = { createLearningViews }

const cloud = require('../../utils/cloud')
const { buildStatusSegments } = require('../../utils/status-segments')

function countOf(value) {
  const count = Number(value)
  return Number.isFinite(count) ? count : 0
}

// 词库掌握构成条（互斥两段：已稳定 vs 待巩固，合计=词库总量）。
// 仅用已计算的 overall.masteredCount 与 totalWords，不叠加会重复计数的维度桶。
function buildCompositionSegments(summary = {}) {
  const overall = summary.overall || {}
  const mastered = countOf(overall.masteredCount)
  const total = countOf(summary.totalWords)
  const inProgress = Math.max(0, total - mastered)
  return buildStatusSegments([
    { key: 'mastered', label: `已稳定 ${mastered}`, count: mastered, tone: 'improved' },
    { key: 'inProgress', label: `待巩固 ${inProgress}`, count: inProgress, tone: 'waiting' }
  ])
}

function meaningOf(word = {}) {
  const meanings = Array.isArray(word.meanings) ? word.meanings : []
  return meanings.filter(Boolean).join('、') || word.cnMeaning || '待补充释义'
}

function normalizeWeakWord(word = {}) {
  return {
    wordId: word.wordId || word._id || '',
    word: word.displayWord || word.word || '',
    displayMeaning: meaningOf(word),
    wrongCount: countOf(word.wrongCount),
    tagText: countOf(word.wrongCount) > 0 ? `${countOf(word.wrongCount)} 次错误` : '需要复测'
  }
}

function buildGroups(summary = {}) {
  const familiarity = summary.familiarity || {}
  const spelling = summary.spelling || {}
  const overall = summary.overall || {}
  return [
    {
      key: 'highFrequency',
      title: '高频错词',
      count: countOf(familiarity.needsPracticeCount) + countOf(spelling.needsPracticeCount),
      desc: '认词或听写中明确出错的词'
    },
    {
      key: 'spellingWeak',
      title: '会认不会写',
      count: countOf(spelling.needsPracticeCount),
      desc: '优先安排纸面听写'
    },
    {
      key: 'recognitionWeak',
      title: '不熟词',
      count: countOf(familiarity.needsPracticeCount),
      desc: '优先安排认词练习'
    },
    {
      key: 'reviewDue',
      title: '待复测',
      count: countOf(familiarity.dueReviewCount) + countOf(spelling.dueReviewCount),
      desc: '到达复测时间的词'
    },
    {
      key: 'stable',
      title: '已稳定',
      count: countOf(overall.masteredCount),
      desc: '认词和拼写都较稳定'
    }
  ]
}

function buildSummaryCards(summary = {}) {
  const familiarity = summary.familiarity || {}
  const spelling = summary.spelling || {}
  const overall = summary.overall || {}
  return [
    {
      key: 'weak',
      label: '薄弱词',
      value: countOf(familiarity.needsPracticeCount) + countOf(spelling.needsPracticeCount)
    },
    {
      key: 'review',
      label: '待复测',
      value: countOf(familiarity.dueReviewCount) + countOf(spelling.dueReviewCount)
    },
    {
      key: 'mastered',
      label: '已稳定',
      value: countOf(overall.masteredCount)
    }
  ]
}

Page({
  data: {
    studentId: '',
    studentName: '',
    grade: '',
    loading: false,
    error: '',
    totalWords: 0,
    summaryCards: [],
    compositionSegments: [],
    groups: [],
    weakWords: [],
    confusionCount: 0
  },

  onLoad(options = {}) {
    this.setData({
      studentId: options.studentId || '',
      studentName: decodeURIComponent(options.studentName || ''),
      grade: options.grade || ''
    })
    this._loadPromise = this.loadWrongWords().catch(error => {
      console.error('加载英语错词失败', error)
    })
  },

  async loadWrongWords() {
    if (!this.data.studentId) return
    this.setData({ loading: true, error: '' })
    wx.showLoading({ title: '加载中...' })
    try {
      const result = await cloud.getEnglishVocabularySummary(this.data.studentId)
      const summary = result.summary || {}
      const confusion = typeof cloud.getEnglishConfusionPractice === 'function'
        ? await cloud.getEnglishConfusionPractice(this.data.studentId)
        : { items: [] }
      this.setData({
        loading: false,
        totalWords: countOf(summary.totalWords),
        summaryCards: buildSummaryCards(summary),
        compositionSegments: buildCompositionSegments(summary),
        groups: buildGroups(summary),
        weakWords: (result.weakWords || []).map(normalizeWeakWord),
        confusionCount: (confusion.items || []).length
      })
    } catch (error) {
      console.error('错词本加载失败', error)
      this.setData({
        loading: false,
        error: '错词本加载失败，请稍后重试'
      })
    } finally {
      wx.hideLoading()
    }
  },

  onPracticeTap() {
    const { studentId, studentName, grade } = this.data
    wx.navigateTo({
      url: `/pages/english-practice/english-practice?studentId=${studentId}&studentName=${encodeURIComponent(studentName || '')}&grade=${grade || ''}`
    })
  },

  onDictationTap() {
    const { studentId, studentName, grade } = this.data
    wx.navigateTo({
      url: `/pages/english-dictation/english-dictation?studentId=${studentId}&studentName=${encodeURIComponent(studentName || '')}&grade=${grade || ''}`
    })
  },

  onConfusionTap() {
    if (!this.data.confusionCount) return
    wx.navigateTo({ url: `/pages/english-confusion/english-confusion?studentId=${this.data.studentId}` })
  },

  onBack() {
    wx.navigateBack({ delta: 1 })
  }
})

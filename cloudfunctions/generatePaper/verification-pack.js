const DEFAULT_MATH_TARGETS_PER_PAGE = 3
const DEFAULT_CHINESE_REVIEW_TARGETS_PER_PAGE = 8

const SUBJECT_CODES = {
  math: 'MATH',
  chinese: 'CHI',
  english: 'ENG'
}

function pad2(value) {
  return String(value).padStart(2, '0')
}

function subjectCodeOf(subject) {
  const normalized = String(subject || '').trim().toLowerCase()
  if (SUBJECT_CODES[normalized]) return SUBJECT_CODES[normalized]
  return normalized ? normalized.toUpperCase().replace(/[^A-Z0-9]/g, '') : 'GEN'
}

function dateCodeOf(paperDate) {
  const text = String(paperDate || '').trim()
  const matched = text.match(/^(\d{4})-(\d{2})-(\d{2})/)
  if (matched) return `${matched[1]}${matched[2]}${matched[3]}`

  const date = paperDate instanceof Date ? paperDate : new Date()
  const year = date.getFullYear()
  const month = pad2(date.getMonth() + 1)
  const day = pad2(date.getDate())
  return `${year}${month}${day}`
}

function sequenceFromPaperCode(paperCode) {
  const matched = String(paperCode || '').match(/-(\d{1,4})$/)
  if (!matched) return '01'
  return pad2(matched[1])
}

function pageCodeOf({ subject = 'math', paperDate, sequence = '01', pageIndex = 1 }) {
  return `${subjectCodeOf(subject)}-V-${dateCodeOf(paperDate)}-${pad2(sequence)}-P${pad2(pageIndex)}`
}

function inferTargetType(targetId) {
  const text = String(targetId || '').trim().toUpperCase()
  if (text.startsWith('BN-')) return 'fine_bottleneck'
  if (text.startsWith('MATH-')) return 'knowledge_node'
  if (text.startsWith('CHI-')) return 'chinese_error_item'
  if (text.startsWith('LP-')) return 'legacy_bottleneck'
  return 'legacy_bottleneck'
}

function normalizeWeight(value) {
  const number = Number(value)
  return Number.isFinite(number) ? number : 0
}

function firstNonEmpty(...values) {
  for (const value of values) {
    const text = String(value || '').trim()
    if (text) return text
  }
  return ''
}

function normalizeTarget(target, index) {
  if (typeof target === 'string') {
    const targetId = target.trim() || `TARGET-${index + 1}`
    return {
      targetId,
      targetType: inferTargetType(targetId),
      displayName: targetId,
      legacyLpCode: targetId.startsWith('LP-') ? targetId : '',
      weight: 0,
      source: target
    }
  }

  const source = target && typeof target === 'object' ? target : {}
  const targetId = firstNonEmpty(
    source.targetId,
    source.bottleneckId,
    source.nodeId,
    source.reviewItemId,
    source.itemId,
    source.lpCode,
    source.id,
    `TARGET-${index + 1}`
  )
  const legacyLpCode = firstNonEmpty(
    source.legacyLpCode,
    source.lpCode,
    source.relatedLpCode,
    targetId.startsWith('LP-') ? targetId : ''
  )

  return {
    targetId,
    targetType: firstNonEmpty(source.targetType, inferTargetType(targetId)),
    displayName: firstNonEmpty(
      source.displayName,
      source.title,
      source.targetText,
      source.lpName,
      source.name,
      targetId
    ),
    legacyLpCode,
    nodeId: firstNonEmpty(source.nodeId, source.knowledgeNodeId),
    categoryId: firstNonEmpty(source.categoryId),
    categoryTitle: firstNonEmpty(source.categoryTitle),
    familyId: firstNonEmpty(source.familyId),
    familyTitle: firstNonEmpty(source.familyTitle),
    weight: normalizeWeight(source.weight ?? source.priorityScore ?? source.evidenceStrength),
    source
  }
}

function targetsPerPageFor(subject, normalizedTargets, options = {}) {
  const configured = Number(options.targetsPerPage)
  if (Number.isFinite(configured) && configured > 0) return Math.max(1, Math.floor(configured))

  const normalizedSubject = String(subject || '').trim().toLowerCase()
  const allChineseReviewItems = normalizedTargets.length > 0
    && normalizedTargets.every(target => target.targetType === 'chinese_error_item')
  if (normalizedSubject === 'chinese' && allChineseReviewItems) {
    return DEFAULT_CHINESE_REVIEW_TARGETS_PER_PAGE
  }

  return DEFAULT_MATH_TARGETS_PER_PAGE
}

function buildVerificationPack({
  subject = 'math',
  paperCode = '',
  paperDate,
  targets = [],
  targetPlan = {},
  options = {}
} = {}) {
  const safeTargetPlan = targetPlan && typeof targetPlan === 'object' ? targetPlan : {}
  const normalizedTargets = targets
    .map((target, index) => ({
      ...normalizeTarget(target, index),
      originalIndex: index
    }))
    .sort((left, right) => {
      if (right.weight !== left.weight) return right.weight - left.weight
      return left.originalIndex - right.originalIndex
    })
    .map(({ originalIndex, ...target }) => target)

  const dateCode = dateCodeOf(paperDate)
  const sequence = sequenceFromPaperCode(paperCode)
  const subjectCode = subjectCodeOf(subject)
  const targetsPerPage = targetsPerPageFor(subject, normalizedTargets, options)
  const targetById = new Map(normalizedTargets.map(target => [target.targetId, target]))
  let pages = []

  if (Array.isArray(safeTargetPlan.pages) && safeTargetPlan.pages.length > 0) {
    pages = safeTargetPlan.pages
      .map((planPage = {}, index) => {
        const targetIds = (planPage.targetIds || [])
          .map(value => String(value || '').trim())
          .filter(Boolean)
        const pageTargets = targetIds.map(id => targetById.get(id)).filter(Boolean)
        const pageIndex = index + 1
        const pageCode = firstNonEmpty(
          planPage.pageCode,
          pageCodeOf({ subject, paperDate, sequence, pageIndex })
        )
        return {
          pageIndex,
          pageCode,
          status: 'pending',
          pageType: firstNonEmpty(planPage.pageType, pageTargets.length > 1 ? 'same_family' : 'micro_confirm'),
          categoryId: firstNonEmpty(planPage.categoryId),
          categoryTitle: firstNonEmpty(planPage.categoryTitle),
          familyIds: Array.isArray(planPage.familyIds) ? planPage.familyIds.filter(Boolean) : [],
          familyTitle: firstNonEmpty(planPage.familyTitle),
          nodeIds: Array.isArray(planPage.nodeIds) ? planPage.nodeIds.filter(Boolean) : [],
          targetSummary: firstNonEmpty(planPage.targetSummary, (planPage.targetNames || []).join('、')),
          targetNames: Array.isArray(planPage.targetNames) ? planPage.targetNames.filter(Boolean) : pageTargets.map(target => target.displayName),
          targetIds,
          targets: pageTargets,
          questionIds: []
        }
      })
      .filter(page => page.targetIds.length > 0)
  }

  if (pages.length === 0) {
    for (let start = 0; start < normalizedTargets.length; start += targetsPerPage) {
      const pageTargets = normalizedTargets.slice(start, start + targetsPerPage)
      const pageIndex = pages.length + 1
      const pageCode = pageCodeOf({ subject, paperDate, sequence, pageIndex })
      pages.push({
        pageIndex,
        pageCode,
        status: 'pending',
        pageType: pageTargets.length > 1 ? 'mixed_review' : 'micro_confirm',
        targetIds: pageTargets.map(target => target.targetId),
        targets: pageTargets,
        questionIds: []
      })
    }
  }

  return {
    packId: `VPK-${subjectCode}-${dateCode}-${sequence}`,
    subject,
    subjectCode,
    paperCode,
    paperDate,
    dateCode,
    sequence,
    totalTargets: normalizedTargets.length,
    targetsPerPage,
    totalStudentPages: pages.length,
    scheduleStrategy: firstNonEmpty(safeTargetPlan.strategy, options.scheduleStrategy, pages.length > 0 ? 'weight_desc_paginated' : ''),
    targets: normalizedTargets,
    pages
  }
}

function findPageForTarget(pack, targetId) {
  return (pack.pages || []).find(page => (page.targetIds || []).includes(targetId))
}

function fallbackPageForIndex(pack, index) {
  const pages = pack.pages || []
  if (!pages.length) return null
  return pages[index % pages.length]
}

function clonePackWithEmptyQuestionIds(pack) {
  return {
    ...pack,
    pages: (pack.pages || []).map(page => ({
      ...page,
      questionIds: []
    }))
  }
}

function decorateQuestionsWithPack(questions = [], pack = {}) {
  const decoratedPack = clonePackWithEmptyQuestionIds(pack)
  const pageQuestionCounts = new Map()
  const targetRoleCounts = new Map()

  const decoratedQuestions = questions.map((question, index) => {
    const targetId = firstNonEmpty(
      question.targetId,
      question.lpCode,
      question.reviewItemId,
      question.knowledgeNodeId,
      question.nodeId
    )
    const page = findPageForTarget(decoratedPack, targetId) || fallbackPageForIndex(decoratedPack, index)
    const pageCode = firstNonEmpty(question.pageCode, page && page.pageCode)
    const pageCount = (pageQuestionCounts.get(pageCode) || 0) + 1
    pageQuestionCounts.set(pageCode, pageCount)

    const roleCount = (targetRoleCounts.get(targetId) || 0) + 1
    targetRoleCounts.set(targetId, roleCount)

    const questionId = firstNonEmpty(question.questionId, `${pageCode}-Q${pad2(pageCount)}`)
    // 前 N 题是核心验证题（core），之后是迁移延展题（transfer）。
    // N 必须与 generatePaper/index.js 的 VERIFICATION_CORE_QUESTION_COUNT 保持一致。
    const questionRole = firstNonEmpty(question.questionRole, roleCount <= 2 ? 'core' : 'transfer')
    const decoratedQuestion = {
      ...question,
      questionId,
      pageCode,
      targetId,
      targetType: firstNonEmpty(question.targetType, inferTargetType(targetId)),
      questionRole
    }

    const packPage = decoratedPack.pages.find(item => item.pageCode === pageCode)
    if (packPage) packPage.questionIds.push(questionId)

    return decoratedQuestion
  })

  return {
    questions: decoratedQuestions,
    pack: decoratedPack
  }
}

module.exports = {
  buildVerificationPack,
  decorateQuestionsWithPack,
  inferTargetType,
  pageCodeOf,
  targetsPerPageFor
}

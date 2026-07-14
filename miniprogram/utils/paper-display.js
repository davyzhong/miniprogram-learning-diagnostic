const { uniqueBottleneckSummaries } = require('./bottlenecks')
const { getSubjectName } = require('./constants')
const { groupBottlenecksByHierarchy, normalizeFineBottleneck } = require('./math-bottleneck-hierarchy')
const { readableNameOf, sanitizeUserText, compactReadableTargets } = require('./user-facing-text')
const { beijingParts } = require('./util')

function pad2(value) {
  return String(value).padStart(2, '0')
}

function toDate(value) {
  return value ? new Date(value) : new Date(0)
}

function paperSavedCodeOf(paper) {
  return paper && (paper.paperDisplayCode || paper.paperCode || paper.displayCode || '')
}

function paperDateCode(value) {
  if (!value) return ''
  const text = String(value)
  const matched = text.match(/^(\d{4})-(\d{2})-(\d{2})/)
  if (matched) return `${matched[1]}${matched[2]}${matched[3]}`
  const p = beijingParts(value)
  if (!p) return ''
  return `${p.year}${pad2(p.month)}${pad2(p.day)}`
}

function dateChip(label, value) {
  if (!value) return ''
  const p = beijingParts(`${String(value).slice(0, 10)}T00:00:00`)
  if (!p) return ''
  return `${label} ${p.month}月${p.day}日`
}

function paperCodeOf(paper, fallbackSubjectName = '') {
  if (!paper) return ''
  const savedCode = paperSavedCodeOf(paper)
  if (savedCode) return savedCode
  const dateCode = paperDateCode(paper.paperDate || paper.generatedAt || paper.createdAt)
  const subjectName = fallbackSubjectName || getSubjectName(paper.subject, paper.subjectName || '')
  if (subjectName && dateCode) return `${subjectName}-${dateCode}`
  if (paper._id) return `试卷-${String(paper._id).slice(-6)}`
  return ''
}

function paperTitleOf(paper = {}) {
  if (paper.type === 'verification') return '验证试卷'
  if (paper.type === 'default-diagnosis') {
    const grade = paper.grade || ''
    const key = paper.paperKey || ''
    const variant = key.split('_').pop().toUpperCase()
    return grade && variant ? `${grade}年级 ${variant} 卷` : '诊断试卷'
  }
  return '诊断试卷'
}

function paperQuestionCount(paper = {}) {
  return (Array.isArray(paper.questions) ? paper.questions.length : 0) || Number(paper.questionCount) || 0
}

function paperPageInfo(paper = {}) {
  const hasTotalPages = paper.totalPages !== undefined && paper.totalPages !== null
  const totalPages = Number(paper.totalPages) || (paper.type === 'verification' && !hasTotalPages ? 2 : 1)
  const explicitAnswerPages = paper.answerPages !== undefined && paper.answerPages !== null
  const answerPages = explicitAnswerPages
    ? Number(paper.answerPages) || 0
    : (paper.type === 'verification' ? 1 : (totalPages > 1 ? 1 : 0))
  const studentPages = Number(paper.studentPages) || Math.max(1, totalPages - answerPages)
  const computedTotal = answerPages > 0 ? studentPages + answerPages : totalPages

  return {
    totalPages: computedTotal,
    studentPages,
    answerPages,
    pageSummary: answerPages > 0
      ? `学生卷 ${studentPages} 页 · 答案 ${answerPages} 页 · 共 ${computedTotal} 页`
      : `共 ${totalPages} 页 · A4 纸张`,
    studentPagesText: studentPages ? `学生卷${studentPages}页` : '',
    answerPagesText: answerPages ? `答案${answerPages}页` : '',
    totalPagesText: computedTotal ? `共${computedTotal}页` : ''
  }
}

function uniqueReadableNames(values = []) {
  return [...new Set(values.filter(Boolean))]
}

function visibleNameOf(value, options = {}) {
  const readableName = readableNameOf(value, { treatAsId: true })
  if (!readableName) return ''
  return sanitizeUserText(readableName, {
    treatAsId: true,
    count: options.count,
    noun: options.noun || '学习卡点'
  }).trim()
}

function paperReadableTargetNames(paper = {}) {
  if (Array.isArray(paper.bottleneckSummaries) && paper.bottleneckSummaries.length > 0) {
    return uniqueReadableNames(paper.bottleneckSummaries.map(summary => visibleNameOf(summary, { count: 1 })))
  }

  const questions = Array.isArray(paper.questions) ? paper.questions : []
  const targets = Array.isArray(paper.bottleneckTargets) ? paper.bottleneckTargets : []
  const questionNamesById = new Map()
  questions.forEach(question => {
    const targetId = targetIdOf(question)
    const readableName = visibleNameOf(question, { count: 1 })
    if (targetId && readableName && !questionNamesById.has(targetId)) {
      questionNamesById.set(targetId, readableName)
    }
  })
  const targetNames = uniqueReadableNames(targets.map(target => (
    questionNamesById.get(targetIdOf(target)) || visibleNameOf(target, { count: 1 })
  )))
  if (targetNames.length > 0) return targetNames

  return uniqueReadableNames(questions.map(question => visibleNameOf(question, { count: 1 })))
}

function paperBottleneckSummaries(paper = {}) {
  return uniqueBottleneckSummaries(paperReadableTargetNames(paper))
    .map(summary => visibleNameOf(summary))
    .filter(Boolean)
}

function paperBottleneckText(paper = {}) {
  return sanitizeUserText(paperBottleneckSummaries(paper).join('、'), { treatAsId: true }).trim()
}

function firstNonEmpty(...values) {
  for (const value of values) {
    const text = String(value || '').trim()
    if (text) return text
  }
  return ''
}

function targetIdOf(target = {}) {
  if (typeof target === 'string') return target
  return firstNonEmpty(
    target.targetId,
    target.bottleneckId,
    target.reviewItemId,
    target.itemId,
    target.lpCode,
    target.id
  )
}

function targetNameOf(target = {}) {
  return visibleNameOf(target, { count: 1 })
}

function collectPaperTargets(paper = {}) {
  const byId = new Map()

  function addTarget(raw = {}) {
    const targetId = targetIdOf(raw)
    const displayName = targetNameOf(raw)
    if (!targetId && !displayName) return
    const canonicalId = paper.subject === 'math' && /^BN-/i.test(targetId)
      ? normalizeFineBottleneck({ bottleneckId: targetId }).bottleneckId
      : targetId
    const key = canonicalId || displayName
    if (byId.has(key)) return
    const normalized = typeof raw === 'string'
      ? { targetId, displayName }
      : { ...raw, targetId, displayName }
    if (targetId && targetId.startsWith('BN-') && !normalized.bottleneckId) normalized.bottleneckId = targetId
    if (targetId && targetId.startsWith('LP-') && !normalized.lpCode) normalized.lpCode = targetId
    byId.set(key, normalized)
  }

  const pack = paper.verificationPack || {}
  ;(Array.isArray(pack.targets) ? pack.targets : []).forEach(addTarget)
  ;(Array.isArray(pack.pages) ? pack.pages : []).forEach(page => {
    ;(Array.isArray(page.targets) ? page.targets : []).forEach(addTarget)
    ;(Array.isArray(page.targetIds) ? page.targetIds : []).forEach(addTarget)
  })

  const questions = Array.isArray(paper.questions) ? paper.questions : []
  questions.forEach(question => addTarget(question))
  ;(Array.isArray(paper.bottleneckTargets) ? paper.bottleneckTargets : []).forEach(addTarget)

  if (byId.size === 0) {
    paperBottleneckSummaries(paper).forEach(summary => addTarget({ displayName: summary, title: summary }))
  }

  return Array.from(byId.values())
}

function compactGroupItems(items = []) {
  return items.map(item => {
    const resolvedName = targetNameOf(item)
    const displayName = /^待确认细卡点(?:\s+\d+)?$/.test(resolvedName) ? '' : resolvedName
    const categoryTitle = visibleNameOf(item.categoryTitle, { count: 1 })
    const familyTitle = visibleNameOf(item.familyTitle, { count: 1 })
    const detailText = uniqueReadableNames([item.detailText, familyTitle, categoryTitle]
      .map(value => visibleNameOf(value, { count: 1 })))
      .filter(value => value && value !== '待归类卡点组' && value !== '待归类')
      .join(' · ')
    return {
      ...item,
      viewId: item.viewId || item.targetId || item.bottleneckId || item.lpCode || displayName,
      displayName,
      displayTitle: displayName,
      title: displayName,
      targetText: visibleNameOf(item.targetText, { count: 1 }),
      lpName: visibleNameOf(item.lpName, { count: 1 }),
      name: visibleNameOf(item.name, { count: 1 }),
      label: visibleNameOf(item.label, { count: 1 }),
      summary: visibleNameOf(item.summary, { count: 1 }),
      bottleneckText: visibleNameOf(item.bottleneckText, { count: 1 }),
      categoryTitle,
      familyTitle,
      detailText: sanitizeUserText(detailText, { treatAsId: true }).trim()
    }
  }).filter(item => item.displayName)
}

function readableHierarchyTitle(value, fallback) {
  return visibleNameOf(value, { count: 1 }) || fallback
}

function positiveCount(value) {
  const count = Number(value)
  return Number.isFinite(count) && count > 0 ? Math.floor(count) : 0
}

function rawSummaryCount(paper = {}) {
  const summaries = Array.isArray(paper.bottleneckSummaries) ? paper.bottleneckSummaries : []
  return new Set(summaries.map(summary => {
    if (summary === null || summary === undefined) return ''
    if (typeof summary === 'string' || typeof summary === 'number') return String(summary).trim()
    return targetIdOf(summary) || firstNonEmpty(
      summary.displayName,
      summary.displayTitle,
      summary.title,
      summary.name,
      summary.label
    )
  }).filter(Boolean)).size
}

function authoritativePaperTargetCount(paper = {}, targets = [], readableNames = []) {
  if (targets.length > 0) return targets.length
  const summaryCount = rawSummaryCount(paper)
  if (summaryCount > 0) return summaryCount
  const packCount = positiveCount((paper.verificationPack || {}).totalTargets)
  return packCount || readableNames.length
}

function paperBottleneckHierarchy(paper = {}) {
  const targets = collectPaperTargets(paper)
  const summaries = paperBottleneckSummaries(paper)
  const totalCount = authoritativePaperTargetCount(paper, targets, summaries)
  if (targets.length === 0 && summaries.length === 0) {
    return {
      hasHierarchy: false,
      totalCount,
      groupCount: 0,
      summaryText: totalCount > 0 ? `${totalCount} 个细分卡点` : '',
      groups: []
    }
  }

  const subject = paper.subject || ''
  if (subject === 'math') {
    const hierarchyTargets = targets.map((target, index) => targetNameOf(target)
      ? target
      : { ...target, title: `待确认细卡点 ${index + 1}` })
    const groups = groupBottlenecksByHierarchy(hierarchyTargets).map(group => {
      const categoryTitle = group.categoryTitle === '待归类'
        ? '粗颗粒卡点'
        : readableHierarchyTitle(group.categoryTitle, '粗颗粒卡点')
      return {
        ...group,
        categoryTitle,
        title: categoryTitle,
        summaryText: `${group.itemCount} 个细分卡点`,
        families: (group.families || []).map(family => {
          const familyTitle = family.familyTitle === '待归类卡点组'
            ? '学习卡点'
            : readableHierarchyTitle(family.familyTitle, '学习卡点')
          return {
            ...family,
            familyTitle,
            title: familyTitle,
            summaryText: `${family.itemCount} 个卡点`,
            items: compactGroupItems(family.items)
          }
        })
      }
    })
    return {
      hasHierarchy: groups.length > 0,
      totalCount,
      groupCount: groups.length,
      summaryText: groups.length > 0 ? `${groups.length} 类 · ${totalCount} 个细分卡点` : '',
      groups
    }
  }

  const items = uniqueBottleneckSummaries(summaries.length > 0 ? summaries : targets.map(targetNameOf))
    .map(name => ({
      viewId: name,
      displayName: name,
      detailText: ''
    }))

  return {
    hasHierarchy: items.length > 0,
    totalCount,
    groupCount: items.length > 0 ? 1 : 0,
    summaryText: items.length > 0 ? `${totalCount} 个卡点` : '',
    groups: items.length > 0
      ? [{
        categoryId: 'GENERAL',
        categoryTitle: '覆盖卡点',
        title: '覆盖卡点',
        itemCount: totalCount,
        summaryText: `${totalCount} 个卡点`,
        families: [{
          familyId: 'GENERAL',
          familyTitle: '学习卡点',
          title: '学习卡点',
          itemCount: totalCount,
          summaryText: `${totalCount} 个卡点`,
          items
        }]
      }]
      : []
  }
}

function paperCoverageText(paper = {}, subjectName = '') {
  const readableNames = paperReadableTargetNames(paper)
  const targets = collectPaperTargets(paper)
  const totalCount = authoritativePaperTargetCount(paper, targets, readableNames)

  if (readableNames.length > 0) {
    return sanitizeUserText(
      `重点复测：${compactReadableTargets(readableNames, { totalCount })}`,
      { treatAsId: true, count: totalCount }
    ).trim()
  }
  if (totalCount > 0) {
    const resolvedSubjectName = getSubjectName(paper.subject, paper.subjectName || subjectName || '')
    return sanitizeUserText(
      `覆盖 ${totalCount} 个${resolvedSubjectName}学习卡点`,
      { treatAsId: true, count: totalCount }
    ).trim()
  }
  return '覆盖本轮重点学习内容'
}

function buildPaperCodeMap(papers = [], fallbackSubjectName = '') {
  const byId = new Map()
  const groups = new Map()

  ;(papers || [])
    .filter(paper => paper && paper.type === 'verification')
    .forEach(paper => {
      if (!paper._id) return
      const savedCode = paperSavedCodeOf(paper)
      if (savedCode) byId.set(paper._id, savedCode)

      const eventTime = paper.generatedAt || paper.createdAt || paper.paperDate
      const codeDate = paperDateCode(paper.paperDate || eventTime)
      if (!codeDate) return
      const subjectName = getSubjectName(paper.subject, paper.subjectName || fallbackSubjectName || '学习')
      const key = `${paper.subject || subjectName}-${codeDate}`
      const list = groups.get(key) || []
      list.push({ paper, eventTime, subjectName, codeDate })
      groups.set(key, list)
    })

  groups.forEach(list => {
    list
      .sort((a, b) => toDate(a.eventTime) - toDate(b.eventTime))
      .forEach((item, index) => {
        if (!item.paper._id || byId.has(item.paper._id)) return
        byId.set(item.paper._id, `${item.subjectName}-${item.codeDate}-${pad2(index + 1)}`)
      })
  })

  return byId
}

function buildPaperDisplay(paper = {}, subjectName = '', options = {}) {
  const pageInfo = paperPageInfo(paper)
  const questionCount = paperQuestionCount(paper)
  const paperCodeMap = options.paperCodeById
  const paperCode = (paperCodeMap && paper._id ? paperCodeMap.get(paper._id) : '')
    || paperCodeOf(paper, subjectName)
  const bottleneckSummaries = paperBottleneckSummaries(paper)
  const coverageText = paperCoverageText(paper, subjectName)
  const bottleneckText = paperBottleneckText(paper)
  const bottleneckHierarchy = paperBottleneckHierarchy(paper)

  return {
    paperTitle: paperTitleOf(paper),
    paperCode,
    questionCount,
    bottleneckSummaries,
    bottleneckText,
    coverageText,
    bottleneckHierarchy,
    studentPages: pageInfo.studentPages,
    answerPages: pageInfo.answerPages,
    totalPages: pageInfo.totalPages,
    pageSummary: pageInfo.pageSummary,
    studentPagesText: pageInfo.studentPagesText,
    answerPagesText: pageInfo.answerPagesText,
    totalPagesText: pageInfo.totalPagesText,
    chips: [
      dateChip('试卷日期', paper.paperDate),
      questionCount ? `${questionCount}题` : '',
      pageInfo.studentPagesText,
      pageInfo.answerPagesText
    ].filter(Boolean)
  }
}

module.exports = {
  buildPaperCodeMap,
  buildPaperDisplay,
  paperBottleneckSummaries,
  paperBottleneckHierarchy,
  paperBottleneckText,
  paperCoverageText,
  paperCodeOf,
  paperDateCode,
  paperPageInfo,
  paperQuestionCount,
  paperTitleOf
}

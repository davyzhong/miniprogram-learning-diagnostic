const { uniqueBottleneckSummaries } = require('./bottlenecks')
const { formatBottleneckDisplayName } = require('./bottleneck-name')
const { getSubjectName } = require('./constants')

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
  const date = toDate(value)
  if (Number.isNaN(date.getTime())) return ''
  return `${date.getFullYear()}${pad2(date.getMonth() + 1)}${pad2(date.getDate())}`
}

function dateChip(label, value) {
  if (!value) return ''
  const date = toDate(`${String(value).slice(0, 10)}T00:00:00`)
  if (Number.isNaN(date.getTime())) return ''
  return `${label} ${date.getMonth() + 1}月${date.getDate()}日`
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

function paperBottleneckSummaries(paper = {}) {
  if (Array.isArray(paper.bottleneckSummaries) && paper.bottleneckSummaries.length > 0) {
    return uniqueBottleneckSummaries(paper.bottleneckSummaries)
  }

  const questions = Array.isArray(paper.questions) ? paper.questions : []
  const byCode = {}
  questions.forEach(question => {
    if (question.lpCode && question.lpName && !byCode[question.lpCode]) {
      byCode[question.lpCode] = question.lpName
    }
  })

  const targets = Array.isArray(paper.bottleneckTargets) ? paper.bottleneckTargets : []
  const targetNames = targets.map(code => byCode[code]).filter(Boolean)
  if (targetNames.length > 0) return uniqueBottleneckSummaries(targetNames)

  const targetFallbacks = targets.map(code => formatBottleneckDisplayName({ lpCode: code }))
  if (targetFallbacks.length > 0) return uniqueBottleneckSummaries(targetFallbacks)

  return uniqueBottleneckSummaries(questions)
}

function paperBottleneckText(paper = {}) {
  return paperBottleneckSummaries(paper).join('、')
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
  const bottleneckText = bottleneckSummaries.join('、')

  return {
    paperTitle: paperTitleOf(paper),
    paperCode,
    questionCount,
    bottleneckSummaries,
    bottleneckText,
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
  paperBottleneckText,
  paperCodeOf,
  paperDateCode,
  paperPageInfo,
  paperQuestionCount,
  paperTitleOf
}

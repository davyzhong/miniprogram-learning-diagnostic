const {
  STATUS_REPORT_STATES,
  buildStatusText,
  buildStatusTitle,
  bottleneckListText,
  classifyReportDisplay,
  reportTimeOf,
  isVisibleTimelineReport,
  isMainTimelinePaper
} = require('../../utils/learning-records')
const {
  buildPaperCodeMap,
  buildPaperDisplay,
  paperCodeOf
} = require('../../utils/paper-display')
const {
  getSubjectName,
  normalizeSubject: normalizeKnownSubject
} = require('../../utils/constants')
const { buildTraceableUrl } = require('../../utils/traceable-actions')

const SUBJECT_FILTERS = [
  { key: '', name: '全部' },
  { key: 'math', name: '数学' },
  { key: 'chinese', name: '语文' },
  { key: 'english', name: '英语' }
]

const GLOBAL_EMPTY_STATE = {
  emptyTitle: '暂无学习记录',
  emptyDesc: '完成一次诊断、学习任务包或纸面验证卷后，记录会按天显示在这里。'
}

const FILTER_EMPTY_STATE = {
  emptyTitle: '当前学科暂无记录',
  emptyDesc: '可切换“全部”查看其他学习记录。'
}

function subjectNameOf(subject, fallback = '') {
  return getSubjectName(subject, fallback)
}

function normalizeSubject(subject) {
  return normalizeKnownSubject(subject, '')
}

function getReportPhotos(report) {
  if (Array.isArray(report.imageFiles) && report.imageFiles.length > 0) {
    return report.imageFiles
  }
  return (report.imageFileIds || []).map((fileID, index) => ({
    fileID,
    fileName: `历史照片${index + 1}`,
    fileSize: 0,
    ocrSummary: '',
    isDuplicate: false,
    duplicateOf: ''
  }))
}

function toDate(value) {
  return value ? new Date(value) : new Date(0)
}

function pad2(value) {
  return String(value).padStart(2, '0')
}

function dateKey(value) {
  const date = toDate(value)
  return `${date.getFullYear()}-${pad2(date.getMonth() + 1)}-${pad2(date.getDate())}`
}

function timeText(value) {
  const date = toDate(value)
  return `${pad2(date.getHours())}:${pad2(date.getMinutes())}`
}

function dateTimeChip(label, value) {
  if (!value) return ''
  const date = toDate(value)
  return `${label} ${date.getMonth() + 1}月${date.getDate()}日 ${timeText(value)}`
}

function dayLabel(value) {
  const date = toDate(value)
  return `${date.getMonth() + 1}月${date.getDate()}日`
}

function recordSubjectName(item = {}, fallback = '') {
  return subjectNameOf(item.subject, item.subjectName || fallback)
}

function reportTitle(report, subjectName = '') {
  if (report.type === 'verification') return `${subjectName}验证反馈`
  return `${subjectName}诊断报告`
}

function reportSummary(report) {
  if (report.comparisonSummary) return report.comparisonSummary
  if (report.changeSummary) return report.changeSummary
  if (report.summary) return report.summary
  if (Array.isArray(report.bottlenecks) && report.bottlenecks.length > 0) {
    return `发现 ${report.bottlenecks.length} 个学习卡点`
  }
  return '查看这次学习诊断的详细结果。'
}

function cleanPhotoSummary(summary = '') {
  const text = String(summary || '').trim()
  if (!text) return ''
  return text
    .replace(/^(本页|此页|该页)(为|是)(小学)?[一二三四五六七八九十\d]+年级[^，,。；;]*(，|,|。|；|;)\s*/, '')
    .trim()
}

function isMachineGeneratedFileName(fileName = '') {
  const name = String(fileName || '').trim()
  if (!name) return false
  const stem = name.replace(/\.[a-z0-9]{2,5}$/i, '')
  if (stem.length < 24) return false
  if (/^[a-f0-9]{24,}$/i.test(stem)) return true
  if (/^[A-Za-z0-9_-]{24,}$/.test(stem) && !/[\u4e00-\u9fa5\s]/.test(stem)) return true
  return false
}

function displayPhotoTitle(photo = {}, index = 0, kind = 'photo') {
  const fallback = kind === 'answer-upload' ? `验证卷作答${index + 1}` : `试卷照片${index + 1}`
  const fileName = String(photo.fileName || '').trim()
  if (!fileName || isMachineGeneratedFileName(fileName)) return fallback
  return fileName
}

function buildPhotoEvidenceRows(photos = [], kind = 'photo') {
  return photos.map((photo, index) => ({
    kind,
    icon: kind === 'answer-upload' ? '传' : '片',
    title: displayPhotoTitle(photo, index, kind),
    summary: cleanPhotoSummary(photo.summaryText || photo.ocrSummary) || '暂无 OCR 摘要',
    isDuplicate: Boolean(photo.isDuplicate),
    fileID: photo.fileID || '',
    tempFileURL: photo.tempFileURL || ''
  }))
}

function buildStatusItem(report, subjectName = '', fallbackSubject = '') {
  const eventTime = report.evidenceTime || report.createdAt
  const subject = report.subject || fallbackSubject
  return {
    id: `status-${report._id}`,
    type: 'status',
    subject,
    reportId: report._id,
    url: buildTraceableUrl({ type: 'report-detail', id: report._id }),
    title: buildStatusTitle(report, subjectName),
    status: report.status || 'analyzing',
    statusIcon: report.status === 'failed' || report.status === 'timeout' ? '!' : '…',
    statusText: buildStatusText(report),
    timeText: timeText(eventTime),
    createdAt: eventTime
  }
}

function buildReportEvent(report, photos, subjectName = '', fallbackSubject = '', options = {}) {
  const isVerification = report.type === 'verification'
  const eventTime = report.evidenceTime || report.createdAt
  const subject = report.subject || fallbackSubject
  const photoCount = photos.length || Number(report.imageFileCount) || 0
  const duplicateCount = photos.filter(photo => photo.isDuplicate).length
  const bottleneckText = report.bottleneckSummary
    || (Array.isArray(report.bottleneckSummaries) ? report.bottleneckSummaries.filter(Boolean).slice(0, 3).join('、') : '')
    || bottleneckListText(report.bottlenecks || [])
  const evidence = report.verificationEvidence || []
  const improvedCount = evidence.filter(item => item.complete && item.allCorrect).length
  const linkedPaper = report.paperId && options.paperById ? options.paperById.get(report.paperId) : null
  const paperCode = (report.paperId && options.paperCodeById ? options.paperCodeById.get(report.paperId) : '')
    || paperCodeOf(linkedPaper)
  const foldedEvidence = buildPhotoEvidenceRows(photos, isVerification ? 'answer-upload' : 'photo')
  const reportUrl = buildTraceableUrl({ type: 'report-detail', id: report._id })
  const paperUrl = report.paperId
    ? buildTraceableUrl({ type: 'paper-workbench', id: report.paperId })
    : ''
  const bottleneckUrl = buildTraceableUrl({
    type: 'bottleneck-center',
    studentId: report.studentId,
    subject,
    filter: isVerification ? 'all' : 'active'
  })
  const sourceUrl = buildTraceableUrl({
    type: 'learning-records',
    studentId: report.studentId,
    subject,
    filter: isVerification ? 'answer-uploads' : 'sources'
  })
  const chips = [
    isVerification && paperCode ? `关联 ${paperCode}` : '',
    dateTimeChip('证据时间', eventTime),
    photoCount > 0 ? `${photoCount}张照片` : '',
    isVerification && improvedCount > 0 ? `${improvedCount} 个已改善` : '',
    !isVerification && report.totalErrors ? `${report.totalErrors} 道相关错题` : '',
    bottleneckText
  ].filter(Boolean)

  return {
    id: report._id,
    subject,
    kind: isVerification ? 'verification-report' : 'diagnosis-report',
    displayLevel: 'main',
    icon: isVerification ? '✓' : '◎',
    url: reportUrl,
    title: reportTitle(report, subjectName),
    timeText: timeText(eventTime),
    createdAt: eventTime,
    summary: reportSummary(report),
    actionText: '查看报告',
    reportId: report._id,
    paperUrl,
    photos,
    foldedEvidence,
    photoCount,
    duplicateCount,
    paperCode,
    paperCodeUrl: paperUrl,
    chips,
    chipItems: chips.map(text => ({
      text,
      url: text.startsWith('关联 ') ? paperUrl
        : (text.includes('照片') ? sourceUrl
          : (text.includes('卡点') || text === bottleneckText ? bottleneckUrl : reportUrl))
    }))
  }
}

function latestReportOf(reports = []) {
  return (reports || [])
    .slice()
    .sort((a, b) => toDate(reportTimeOf(b)) - toDate(reportTimeOf(a)))[0] || null
}

function paperFeedbackStatus(report) {
  if (!report) return '等待打印作答并上传验证'
  if (report.status === 'completed') return '已生成验证反馈'
  if (report.status === 'failed' || report.status === 'timeout') return '反馈失败，可重新上传'
  return '反馈分析中'
}

function taskPackProgressChips(paper = {}, latestFeedback = null) {
  const pages = paper.verificationPack && Array.isArray(paper.verificationPack.pages)
    ? paper.verificationPack.pages
    : []
  if (pages.length === 0) return []
  const returnedCodes = new Set([
    ...(latestFeedback && Array.isArray(latestFeedback.verificationPageCodes) ? latestFeedback.verificationPageCodes : []),
    ...(latestFeedback && Array.isArray(latestFeedback.verificationPageEvidence)
      ? latestFeedback.verificationPageEvidence.map(item => item && item.pageCode).filter(Boolean)
      : [])
  ])
  return [
    `任务包${pages.length}页`,
    returnedCodes.size > 0 ? `已回传${returnedCodes.size}页` : ''
  ].filter(Boolean)
}

function buildPaperEvent(paper, subjectName = '', fallbackSubject = '', linkedReports = [], options = {}) {
  const eventTime = paper.generatedAt || paper.createdAt
  const display = buildPaperDisplay(paper, subjectName, options)
  const paperCode = display.paperCode
  const bottleneckText = display.bottleneckText
  const latestFeedback = latestReportOf(linkedReports)
  const subject = paper.subject || fallbackSubject
  const paperUrl = buildTraceableUrl({ type: 'paper-workbench', id: paper._id })
  const uploadUrl = buildTraceableUrl({
    type: 'upload',
    mode: 'verification',
    studentId: paper.studentId,
    subject,
    subjectName,
    grade: paper.grade,
    paperId: paper._id
  })
  const feedbackUrl = latestFeedback
    ? buildTraceableUrl({ type: 'report-detail', id: latestFeedback._id })
    : ''
  const bottleneckUrl = buildTraceableUrl({
    type: 'bottleneck-center',
    studentId: paper.studentId,
    subject,
    filter: 'active'
  })
  const chips = display.chips.concat(taskPackProgressChips(paper, latestFeedback))

  return {
    id: paper._id,
    subject,
    kind: 'verification-paper',
    displayLevel: 'main',
    icon: '卷',
    url: paperUrl,
    title: `生成${subjectName}纸面验证卷`,
    timeText: timeText(eventTime),
    createdAt: eventTime,
    summary: bottleneckText
      ? `复测 ${bottleneckText}。纸面作答后回到本工作台上传。`
      : '纸面作答后回到本工作台上传验证。',
    actionText: '查看试卷',
    paperId: paper._id,
    paperCode,
    paperCodeUrl: paperUrl,
    showPaperCode: Boolean(paperCode),
    photos: [],
    foldedEvidence: linkedReports.flatMap(report => buildPhotoEvidenceRows(getReportPhotos(report), 'answer-upload')),
    photoCount: 0,
    duplicateCount: 0,
    statusText: paperFeedbackStatus(latestFeedback),
    statusUrl: latestFeedback ? feedbackUrl : uploadUrl,
    uploadUrl,
    feedbackUrl,
    chips,
    chipItems: chips.map(text => ({
      text,
      url: text.includes('题') || text.includes('卷') || text.includes('答案') || text.includes('试卷日期') || text.includes('任务包') || text.includes('回传')
        ? paperUrl
        : bottleneckUrl
    }))
  }
}

function sessionTimeOf(session = {}) {
  return session.analyzedAt || session.completedAt || session.submittedAt || session.updatedAt || session.createdAt || ''
}

function countVerdicts(items = [], getter) {
  return (items || []).reduce((acc, item = {}) => {
    const status = getter(item) || 'unclear'
    if (status === 'correct') acc.correctCount += 1
    else if (status === 'incorrect') acc.incorrectCount += 1
    else acc.unclearCount += 1
    return acc
  }, { correctCount: 0, incorrectCount: 0, unclearCount: 0 })
}

function buildEnglishPhotoEvidenceRows(session = {}, urlByFileID = new Map()) {
  return (session.photoFileIds || []).map((fileID, index) => ({
    kind: 'english-dictation-photo',
    icon: '写',
    title: `听写纸照片${index + 1}`,
    summary: session.analysisStatus === 'completed' ? '听写纸已完成 AI 批改' : '听写纸已上传，等待 AI 批改',
    isDuplicate: false,
    fileID,
    tempFileURL: urlByFileID.get(fileID) || ''
  }))
}

function buildEnglishSessionEvent(session = {}, subjectName = '英语', urlByFileID = new Map()) {
  const isSpelling = session.functionType === 'spelling' || session.type === 'word-dictation-paper'
  const eventTime = sessionTimeOf(session)
  const wordCount = session.wordCount || (session.wordItems || []).length
  const counts = isSpelling
    ? countVerdicts(session.dictationResults || [], item => item.verdict)
    : countVerdicts(session.attempts || [], item => item.judgment && item.judgment.status)
  const hasResult = counts.correctCount + counts.incorrectCount + counts.unclearCount > 0
  const photoCount = (session.photoFileIds || []).length
  const title = isSpelling ? `${subjectName}纸面听写` : `${subjectName}单词熟悉度`
  const statusText = isSpelling && session.analysisStatus === 'pending_analysis'
    ? '听写纸批改中'
    : (session.status === 'completed' ? '已完成' : '进行中')
  const summary = hasResult
    ? `本轮 ${wordCount || 0} 词，正确 ${counts.correctCount} 个，需练习 ${counts.incorrectCount} 个，无法确认 ${counts.unclearCount} 个。`
    : (isSpelling ? '已生成纸面听写任务，完成后拍照上传批改。' : '已生成单词熟悉度练习。')
  const chips = [
    wordCount ? `${wordCount} 词` : '',
    counts.correctCount ? `正确 ${counts.correctCount}` : '',
    counts.incorrectCount ? `需练习 ${counts.incorrectCount}` : '',
    counts.unclearCount ? `待确认 ${counts.unclearCount}` : '',
    photoCount ? `${photoCount} 张听写纸` : ''
  ].filter(Boolean)

  return {
    id: session._id,
    subject: 'english',
    kind: isSpelling ? 'english-dictation-session' : 'english-familiarity-session',
    displayLevel: 'main',
    icon: isSpelling ? '写' : '词',
    url: '',
    title,
    timeText: timeText(eventTime),
    createdAt: eventTime,
    summary,
    actionText: '',
    sessionId: session._id,
    photos: [],
    foldedEvidence: isSpelling ? buildEnglishPhotoEvidenceRows(session, urlByFileID) : [],
    photoCount,
    duplicateCount: 0,
    statusText,
    statusUrl: '',
    chips,
    chipItems: chips.map(text => ({ text, url: '' }))
  }
}

function resourcePackTimeOf(pack = {}) {
  return pack.completedAt || pack.scheduledVerificationAt || pack.updatedAt || pack.createdAt || ''
}

function buildLearningResourceEvent(pack = {}, subjectName = '') {
  const eventTime = resourcePackTimeOf(pack)
  const title = pack.title || (pack.target && pack.target.title) || '未命名卡点'
  const completed = pack.status === 'completed'
  const scheduled = Boolean(pack.scheduledVerificationAt)
  const chips = [
    pack.estimatedMinutes ? `约 ${pack.estimatedMinutes} 分钟` : '',
    scheduled ? '已加入验证' : '',
    subjectName
  ].filter(Boolean)

  return {
    id: pack._id,
    subject: pack.subject || '',
    kind: 'learning-resource',
    displayLevel: 'main',
    icon: '学',
    url: `/pages/learning-resource/learning-resource?packId=${encodeURIComponent(pack._id || '')}`,
    title: `学习任务包：${title}`,
    timeText: timeText(eventTime),
    createdAt: eventTime,
    summary: completed ? '已完成学习' : '待完成学习',
    actionText: '查看任务包',
    packId: pack._id,
    photos: [],
    foldedEvidence: [],
    photoCount: 0,
    duplicateCount: 0,
    statusText: completed ? '已完成' : '待完成',
    statusUrl: '',
    chips,
    chipItems: chips.map(text => ({ text, url: '' }))
  }
}

function groupEventsByDay(events, statusItems = []) {
  const byDay = new Map()
  function ensureDay(value) {
    const key = dateKey(value)
    if (!byDay.has(key)) {
      byDay.set(key, {
        dateKey: key,
        dayLabel: dayLabel(value),
        events: [],
        statusItems: []
      })
    }
    return byDay.get(key)
  }

  Array.from(events)
    .sort((a, b) => toDate(b.createdAt) - toDate(a.createdAt))
    .forEach(event => ensureDay(event.createdAt).events.push(event))
  Array.from(statusItems)
    .sort((a, b) => toDate(b.createdAt) - toDate(a.createdAt))
    .forEach(item => ensureDay(item.createdAt).statusItems.push(item))

  return Array.from(byDay.values())
    .sort((a, b) => toDate(b.dateKey) - toDate(a.dateKey))
}

function buildTitleText(studentName) {
  if (studentName) return `${studentName} · 学习记录`
  return '学习记录'
}

function filterEventsBySubject(events, activeSubject) {
  if (!activeSubject) return events
  return events.filter(event => event.subject === activeSubject)
}

function filterStatusBySubject(statusItems, activeSubject) {
  if (!activeSubject) return statusItems
  return statusItems.filter(item => item.subject === activeSubject)
}

function buildFilters(activeSubject, events) {
  return SUBJECT_FILTERS.map(filter => ({
    ...filter,
    count: filter.key ? events.filter(event => event.subject === filter.key).length : events.length,
    active: filter.key === activeSubject
  }))
}

function buildEmptyState(allCount, filteredCount, activeSubject) {
  if (allCount === 0) return GLOBAL_EMPTY_STATE
  if (activeSubject && filteredCount === 0) return FILTER_EMPTY_STATE
  return GLOBAL_EMPTY_STATE
}

function buildRecordAnalytics(events = [], statusItems = []) {
  const dayCount = groupEventsByDay(events, statusItems).length
  const recordCount = events.length
  const paperCount = events.filter(event => event.kind === 'verification-paper').length
  const feedbackCount = events.filter(event => event.kind === 'verification-report').length
  return {
    summaryText: `共 ${dayCount} 天 · ${recordCount} 条主记录 · ${feedbackCount} 份验证反馈`,
    summaryCards: [
      { key: 'days', label: '学习天数', value: dayCount },
      { key: 'records', label: '主记录', value: recordCount },
      { key: 'papers', label: '验证试卷', value: paperCount },
      { key: 'feedback', label: '验证反馈', value: feedbackCount }
    ]
  }
}

function buildCleanupState(cleanupPreview = {}, permissions = {}) {
  const preview = cleanupPreview || {}
  const count = Number(preview.cleanedCount || preview.staleCount || preview.count || 0)
  const canCleanup = count > 0 && permissions.canManageParents === true
  return {
    hasCandidates: count > 0,
    canCleanup,
    count,
    reportIds: preview.cleanedReportIds || preview.staleReportIds || preview.reportIds || [],
    title: count > 0 ? `发现 ${count} 条可清理的中断记录` : '',
    desc: canCleanup
      ? '这些是长时间停留在分析中或失败的记录，清理后不会删除已完成报告、试卷和照片证据。'
      : '这些中断记录不会显示在主时间线，也不会影响已完成的学习证据。'
  }
}

function buildHistoryState(events, activeSubject, statusItems = [], options = {}) {
  const safeSubject = normalizeSubject(activeSubject)
  const filteredEvents = filterEventsBySubject(events, safeSubject)
  const filteredStatusItems = filterStatusBySubject(statusItems, safeSubject)
  const emptyState = buildEmptyState(events.length, filteredEvents.length, safeSubject)
  const days = groupEventsByDay(filteredEvents, filteredStatusItems)
  const analytics = buildRecordAnalytics(filteredEvents, filteredStatusItems)

  return {
    activeSubject: safeSubject,
    subject: safeSubject,
    allEvents: events,
    allStatusItems: statusItems,
    allDays: groupEventsByDay(events, statusItems),
    days,
    filters: buildFilters(safeSubject, events),
    ...analytics,
    cleanup: buildCleanupState(options.cleanupPreview, options.permissions),
    ...emptyState
  }
}

function collectFileIDs(reports, englishSessions = []) {
  return [
    ...reports.flatMap(report => getReportPhotos(report).map(photo => photo.fileID).filter(Boolean)),
    ...englishSessions.flatMap(session => session.photoFileIds || [])
  ]
}

function attachTempUrlsToReports(reports, urlByFileID) {
  return reports.map(report => {
    const reportPhotos = getReportPhotos(report)
    const kind = report.type === 'verification' ? 'answer-upload' : 'photo'
    return {
      report,
      photos: reportPhotos.map((photo, index) => ({
        ...photo,
        fileName: displayPhotoTitle(photo, index, kind),
        tempFileURL: urlByFileID.get(photo.fileID) || '',
        summaryText: cleanPhotoSummary(photo.ocrSummary) || '此照片来自旧报告，暂无 OCR 识别摘要'
      }))
    }
  })
}

function buildPaperLookup(papers = []) {
  return new Map((papers || []).map(paper => [paper._id, paper]))
}

function buildReportsByPaperId(reports = []) {
  const byPaperId = new Map()
  ;(reports || [])
    .filter(report => report.type === 'verification' && report.paperId)
    .forEach(report => {
      const list = byPaperId.get(report.paperId) || []
      list.push(report)
      byPaperId.set(report.paperId, list)
    })
  return byPaperId
}

function buildPaperCodeById(papers = [], fallbackSubjectName = '') {
  return buildPaperCodeMap(papers, fallbackSubjectName)
}

function buildPhotosByReportId(reportPhotos) {
  const photosByReportId = new Map()
  reportPhotos.forEach(({ report, photos }) => {
    photosByReportId.set(report._id, photos)
  })
  return photosByReportId
}

function withAttachedPhotos(report, photosByReportId) {
  return {
    ...report,
    imageFiles: photosByReportId.get(report._id) || getReportPhotos(report)
  }
}

function buildTimelineEvents(reports, papers, urlByFileID, activeSubject, fallbackSubjectName, englishSessions = [], learningResourcePacks = []) {
  const visibleReports = (reports || []).filter(report => isVisibleTimelineReport(report))
  const paperById = buildPaperLookup(papers)
  const paperCodeById = buildPaperCodeById(papers, fallbackSubjectName)
  const verificationReportsByPaperId = buildReportsByPaperId(visibleReports)
  const reportPhotos = attachTempUrlsToReports(visibleReports, urlByFileID)
  const photosByReportId = buildPhotosByReportId(reportPhotos)
  const events = []
  const statusItems = []

  reportPhotos.forEach(({ report, photos }) => {
    const subjectName = recordSubjectName(report, fallbackSubjectName)
    const display = classifyReportDisplay(report)
    if (display.displayLevel === 'status' || STATUS_REPORT_STATES.has(report.status)) {
      statusItems.push(buildStatusItem(report, subjectName, activeSubject))
      return
    }
    events.push(buildReportEvent(report, photos, subjectName, activeSubject, { paperById, paperCodeById }))
  })

  ;(papers || [])
    .filter(isMainTimelinePaper)
    .forEach(paper => {
      const linkedReports = (verificationReportsByPaperId.get(paper._id) || [])
        .map(report => withAttachedPhotos(report, photosByReportId))
      events.push(buildPaperEvent(
        paper,
        recordSubjectName(paper, fallbackSubjectName),
        activeSubject,
        linkedReports,
        { paperCodeById }
      ))
    })

  ;(englishSessions || [])
    .forEach(session => {
      events.push(buildEnglishSessionEvent(session, recordSubjectName({ subject: 'english' }, '英语'), urlByFileID))
    })

  ;(learningResourcePacks || [])
    .forEach(pack => {
      events.push(buildLearningResourceEvent(pack, recordSubjectName(pack, fallbackSubjectName)))
    })

  events.sort((a, b) => toDate(b.createdAt) - toDate(a.createdAt))
  return { events, statusItems }
}

function photoFromDataset(days, dataset) {
  const { dayIndex, eventIndex, photoIndex } = dataset
  const day = days[dayIndex]
  const event = day && day.events[eventIndex]
  const photo = event && event.photos && event.photos[photoIndex]
  return { event, photo }
}

function evidenceFromDataset(days, dataset) {
  const { dayIndex, eventIndex, evidenceIndex } = dataset
  const day = days[dayIndex]
  const event = day && day.events[eventIndex]
  const evidence = event && event.foldedEvidence && event.foldedEvidence[evidenceIndex]
  return { event, evidence }
}

module.exports = {
  SUBJECT_FILTERS,
  GLOBAL_EMPTY_STATE,
  FILTER_EMPTY_STATE,
  subjectNameOf,
  normalizeSubject,
  getReportPhotos,
  buildTitleText,
  buildFilters,
  buildHistoryState,
  buildRecordAnalytics,
  buildCleanupState,
  collectFileIDs,
  buildTimelineEvents,
  photoFromDataset,
  evidenceFromDataset
}

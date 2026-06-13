const cloud = require('../../utils/cloud')
const {
  STATUS_REPORT_STATES,
  buildStatusText,
  buildStatusTitle,
  bottleneckListText,
  classifyReportDisplay,
  isMainTimelinePaper,
  paperCodeOf
} = require('../../utils/learning-records')

const SUBJECT_NAMES = {
  math: '数学',
  chinese: '语文',
  english: '英语'
}

const SUBJECT_FILTERS = [
  { key: '', name: '全部' },
  { key: 'math', name: '数学' },
  { key: 'chinese', name: '语文' },
  { key: 'english', name: '英语' }
]

const GLOBAL_EMPTY_STATE = {
  emptyTitle: '暂无学习记录',
  emptyDesc: '完成一次诊断或生成验证试卷后，记录会按天显示在这里。'
}

const FILTER_EMPTY_STATE = {
  emptyTitle: '当前学科暂无记录',
  emptyDesc: '可切换“全部”查看其他学习记录。'
}

function subjectNameOf(subject, fallback = '') {
  return SUBJECT_NAMES[subject] || fallback || ''
}

function normalizeSubject(subject) {
  return SUBJECT_NAMES[subject] ? subject : ''
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

function dateChip(label, value) {
  if (!value) return ''
  const date = toDate(`${String(value).slice(0, 10)}T00:00:00`)
  if (Number.isNaN(date.getTime())) return ''
  return `${label} ${date.getMonth() + 1}月${date.getDate()}日`
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

function buildPhotoEvidenceRows(photos = [], kind = 'photo') {
  return photos.map((photo, index) => ({
    kind,
    icon: kind === 'answer-upload' ? '传' : '片',
    title: photo.fileName || (kind === 'answer-upload' ? `验证卷作答${index + 1}` : `试卷照片${index + 1}`),
    summary: photo.summaryText || photo.ocrSummary || '暂无 OCR 摘要',
    isDuplicate: Boolean(photo.isDuplicate),
    fileID: photo.fileID || '',
    tempFileURL: photo.tempFileURL || ''
  }))
}

function buildStatusItem(report, subjectName = '', fallbackSubject = '') {
  const eventTime = report.evidenceTime || report.createdAt
  return {
    id: `status-${report._id}`,
    type: 'status',
    subject: report.subject || fallbackSubject,
    reportId: report._id,
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
  const photoCount = photos.length
  const duplicateCount = photos.filter(photo => photo.isDuplicate).length
  const bottleneckText = bottleneckListText(report.bottlenecks || [])
  const evidence = report.verificationEvidence || []
  const improvedCount = evidence.filter(item => item.complete && item.allCorrect).length
  const linkedPaper = report.paperId && options.paperById ? options.paperById.get(report.paperId) : null
  const paperCode = paperCodeOf(linkedPaper)
  const foldedEvidence = buildPhotoEvidenceRows(photos, isVerification ? 'answer-upload' : 'photo')

  return {
    id: report._id,
    subject: report.subject || fallbackSubject,
    kind: isVerification ? 'verification-report' : 'diagnosis-report',
    displayLevel: 'main',
    icon: isVerification ? '✓' : '◎',
    title: reportTitle(report, subjectName),
    timeText: timeText(eventTime),
    createdAt: eventTime,
    summary: reportSummary(report),
    actionText: '查看报告',
    reportId: report._id,
    photos,
    foldedEvidence,
    photoCount,
    duplicateCount,
    paperCode,
    chips: [
      isVerification && paperCode ? `关联 ${paperCode}` : '',
      dateTimeChip('证据时间', eventTime),
      photoCount > 0 ? `${photoCount} 张照片` : '',
      isVerification && improvedCount > 0 ? `${improvedCount} 个已改善` : '',
      !isVerification && report.totalErrors ? `${report.totalErrors} 道相关错题` : '',
      bottleneckText
    ].filter(Boolean)
  }
}

function buildPaperEvent(paper, subjectName = '', fallbackSubject = '', linkedReports = []) {
  const eventTime = paper.generatedAt || paper.createdAt
  const questionCount = (paper.questions || []).length || paper.questionCount || 0
  const paperCode = paperCodeOf(paper)
  const bottleneckText = bottleneckListText(
    (Array.isArray(paper.bottleneckSummaries) && paper.bottleneckSummaries.length > 0)
      ? paper.bottleneckSummaries
      : (paper.bottleneckTargets || []).map(code => ({ lpCode: code }))
  )
  const pageText = paper.studentPages || paper.answerPages
    ? `学生卷 ${paper.studentPages || Math.max(1, (paper.totalPages || 1) - (paper.answerPages || 1))} 页`
    : (paper.totalPages ? `${paper.totalPages} 页` : 'A4 PDF')

  return {
    id: paper._id,
    subject: paper.subject || fallbackSubject,
    kind: 'verification-paper',
    displayLevel: 'main',
    icon: '□',
    title: `生成${subjectName}验证试卷`,
    timeText: timeText(eventTime),
    createdAt: eventTime,
    summary: bottleneckText ? `覆盖 ${bottleneckText}` : '已生成可打印的 A4 试卷。',
    actionText: '查看试卷',
    paperId: paper._id,
    paperCode,
    photos: [],
    foldedEvidence: linkedReports.flatMap(report => buildPhotoEvidenceRows(getReportPhotos(report), 'answer-upload')),
    photoCount: 0,
    duplicateCount: 0,
    statusText: linkedReports.some(report => report.status === 'completed')
      ? '已生成验证反馈'
      : (linkedReports.length > 0 ? '反馈分析中' : '等待打印作答并上传验证'),
    chips: [
      paperCode ? `编号 ${paperCode}` : '',
      dateChip('试卷日期', paper.paperDate),
      questionCount ? `${questionCount} 题` : '',
      pageText
    ].filter(Boolean)
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

function buildHistoryState(events, activeSubject, statusItems = []) {
  const safeSubject = normalizeSubject(activeSubject)
  const filteredEvents = filterEventsBySubject(events, safeSubject)
  const filteredStatusItems = filterStatusBySubject(statusItems, safeSubject)
  const emptyState = buildEmptyState(events.length, filteredEvents.length, safeSubject)

  return {
    activeSubject: safeSubject,
    subject: safeSubject,
    allEvents: events,
    allStatusItems: statusItems,
    allDays: groupEventsByDay(events, statusItems),
    days: groupEventsByDay(filteredEvents, filteredStatusItems),
    filters: buildFilters(safeSubject, events),
    ...emptyState
  }
}

function collectFileIDs(reports) {
  return reports.flatMap(report => getReportPhotos(report).map(photo => photo.fileID).filter(Boolean))
}

function attachTempUrlsToReports(reports, urlByFileID) {
  return reports.map(report => ({
    report,
    photos: getReportPhotos(report).map(photo => ({
      ...photo,
      tempFileURL: urlByFileID.get(photo.fileID) || '',
      summaryText: photo.ocrSummary || '此照片来自旧报告，暂无 OCR 识别摘要'
    }))
  }))
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

function buildTimelineEvents(reports, papers, urlByFileID, activeSubject, fallbackSubjectName) {
  const paperById = buildPaperLookup(papers)
  const verificationReportsByPaperId = buildReportsByPaperId(reports)
  const reportPhotos = attachTempUrlsToReports(reports, urlByFileID)
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
    events.push(buildReportEvent(report, photos, subjectName, activeSubject, { paperById }))
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
        linkedReports
      ))
    })

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

Page({
  data: {
    studentId: '',
    subject: '',
    subjectName: '',
    studentName: '',
    titleText: '学习记录',
    activeSubject: '',
    allEvents: [],
    allStatusItems: [],
    allDays: [],
    filters: buildFilters('', []),
    ...GLOBAL_EMPTY_STATE,
    loading: true,
    days: []
  },

  onLoad(options) {
    const subject = options.subject || ''
    const subjectName = decodeURIComponent(options.subjectName || '')
    const studentName = decodeURIComponent(options.studentName || '')
    this.setData({
      studentId: options.studentId || '',
      subject,
      activeSubject: normalizeSubject(subject),
      subjectName,
      studentName,
      titleText: buildTitleText(studentName)
    })
    wx.setNavigationBarTitle({ title: '学习记录' })
    this.loadHistory()
  },

  async loadHistory() {
    this.setData({ loading: true })
    try {
      const activeSubject = normalizeSubject(this.data.activeSubject || this.data.subject || '')
      const fallbackSubjectName = this.data.subjectName || subjectNameOf(activeSubject)
      const titleText = buildTitleText(this.data.studentName)
      let reports = []
      let papers = []

      try {
        if (typeof cloud.getLearningTimeline === 'function') {
          const timeline = await cloud.getLearningTimeline({ studentId: this.data.studentId })
          reports = timeline.reports || []
          papers = timeline.papers || []
        }
      } catch (error) {
        console.warn('共享学习记录不可用，回退到旧记录读取', error && error.message ? error.message : error)
      }

      if (!reports.length && !papers.length) {
        reports = await cloud.getReports(this.data.studentId, undefined, 50)
        papers = typeof cloud.getPapers === 'function'
          ? await cloud.getPapers({ studentId: this.data.studentId })
          : []
      }

      const fileIDs = collectFileIDs(reports)
      const tempFiles = await cloud.getTempFileURLs(fileIDs)
      const urlByFileID = new Map(tempFiles.map(item => [item.fileID, item.tempFileURL || '']))
      const { events, statusItems } = buildTimelineEvents(
        reports,
        papers,
        urlByFileID,
        activeSubject,
        fallbackSubjectName
      )

      this.setData({
        titleText,
        ...buildHistoryState(events, activeSubject, statusItems),
        loading: false
      })
    } catch (err) {
      console.error('加载学习记录失败', err)
      this.setData({
        ...buildHistoryState([], normalizeSubject(this.data.activeSubject || this.data.subject || ''), []),
        loading: false
      })
      wx.showToast({ title: '学习记录加载失败', icon: 'none' })
    }
  },

  onFilterTap(e) {
    const activeSubject = normalizeSubject(e.currentTarget.dataset.subject || '')
    this.setData(buildHistoryState(this.data.allEvents || [], activeSubject, this.data.allStatusItems || []))
  },

  onPreviewPhoto(e) {
    const { event, photo } = photoFromDataset(this.data.days, e.currentTarget.dataset)
    if (!photo || !photo.tempFileURL) {
      wx.showToast({ title: '原图暂时无法预览', icon: 'none' })
      return
    }
    wx.previewImage({
      current: photo.tempFileURL,
      urls: (event.photos || []).map(item => item.tempFileURL).filter(Boolean)
    })
  },

  onPreviewFoldedEvidence(e) {
    const { event, evidence } = evidenceFromDataset(this.data.days, e.currentTarget.dataset)
    if (!evidence || !evidence.tempFileURL) {
      wx.showToast({ title: '原图暂时无法预览', icon: 'none' })
      return
    }
    wx.previewImage({
      current: evidence.tempFileURL,
      urls: (event.foldedEvidence || []).map(item => item.tempFileURL).filter(Boolean)
    })
  },

  onStatusTap(e) {
    const { dayIndex, statusIndex } = e.currentTarget.dataset
    const day = this.data.days[dayIndex]
    const status = day && day.statusItems && day.statusItems[statusIndex]
    if (status && status.reportId) {
      wx.navigateTo({ url: `/pages/report/report?id=${status.reportId}` })
    }
  },

  onEventTap(e) {
    const { dayIndex, eventIndex } = e.currentTarget.dataset
    const day = this.data.days[dayIndex]
    const event = day && day.events[eventIndex]
    if (!event) return
    if (event.paperId) {
      wx.navigateTo({ url: `/pages/paper-preview/paper-preview?paperId=${event.paperId}` })
      return
    }
    if (event.reportId) {
      wx.navigateTo({ url: `/pages/report/report?id=${event.reportId}` })
    }
  },

  onReportTap(e) {
    wx.navigateTo({ url: `/pages/report/report?id=${e.currentTarget.dataset.id}` })
  }
})

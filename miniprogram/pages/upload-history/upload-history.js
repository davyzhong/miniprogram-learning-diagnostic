const cloud = require('../../utils/cloud')
const {
  GLOBAL_EMPTY_STATE,
  subjectNameOf,
  normalizeSubject,
  buildTitleText,
  buildFilters,
  buildHistoryState,
  collectFileIDs,
  buildTimelineEvents,
  photoFromDataset,
  evidenceFromDataset
} = require('./upload-history-presenter')

async function cleanupStaleRecordsIfPossible(studentId, subject) {
  if (!studentId || typeof cloud.cleanupStaleLearningRecords !== 'function') return
  try {
    await cloud.cleanupStaleLearningRecords({ studentId, subject })
  } catch (error) {
    console.warn('学习记录脏状态清理不可用，继续加载可见记录', error && error.message ? error.message : error)
  }
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

      await cleanupStaleRecordsIfPossible(this.data.studentId, activeSubject)

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
      let tempFiles = []
      if (fileIDs.length) {
        try {
          tempFiles = await cloud.getTempFileURLs(fileIDs)
        } catch (error) {
          console.warn('学习记录图片临时链接不可用，继续展示文字记录', error && error.message ? error.message : error)
        }
      }
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
    this.navigateToRecordUrl(status && (status.url || (status.reportId ? `/pages/report/report?id=${status.reportId}` : '')))
  },

  onEventTap(e) {
    const { dayIndex, eventIndex } = e.currentTarget.dataset
    const day = this.data.days[dayIndex]
    const event = day && day.events[eventIndex]
    if (!event) return
    this.navigateToRecordUrl(event.url || (event.paperId
      ? `/pages/paper-preview/paper-preview?paperId=${event.paperId}`
      : (event.reportId ? `/pages/report/report?id=${event.reportId}` : '')
    ))
  },

  onReportTap(e) {
    wx.navigateTo({ url: `/pages/report/report?id=${e.currentTarget.dataset.id}` })
  },

  onTraceableUrlTap(e) {
    const url = e && e.currentTarget && e.currentTarget.dataset
      ? e.currentTarget.dataset.url
      : ''
    this.navigateToRecordUrl(url)
  },

  navigateToRecordUrl(url) {
    if (!url) {
      wx.showToast({ title: '暂无可查看内容', icon: 'none' })
      return
    }
    wx.navigateTo({ url })
  }
})

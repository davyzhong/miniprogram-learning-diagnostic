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

const EMPTY_CLEANUP = {
  hasCandidates: false,
  canCleanup: false,
  count: 0,
  reportIds: [],
  title: '',
  desc: ''
}

const INITIAL_TEMP_URL_LIMIT = 12
const INITIAL_TIMELINE_LIMIT = 20
const TIMELINE_LIMIT_STEP = 20

async function previewStaleRecordsIfPossible(studentId, subject) {
  if (!studentId || typeof cloud.cleanupStaleLearningRecords !== 'function') return
  try {
    return await cloud.cleanupStaleLearningRecords({ studentId, subject, dryRun: true })
  } catch (error) {
    console.warn('学习记录脏状态预检不可用，继续加载可见记录', error && error.message ? error.message : error)
    return null
  }
}

function mergeEvents(existing = [], incoming = []) {
  const seen = new Set()
  return [...existing, ...incoming].filter(item => {
    const key = item && (item.id || item.reportId || item.paperId || item.sessionId)
    if (!key) return true
    if (seen.has(key)) return false
    seen.add(key)
    return true
  })
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
    summaryText: '共 0 天 · 0 条主记录 · 0 份验证反馈',
    summaryCards: [],
    cleanup: EMPTY_CLEANUP,
    cleaningStaleRecords: false,
    timelineLimit: INITIAL_TIMELINE_LIMIT,
    nextCursor: '',
    hasMoreRecords: false,
    loadingMoreRecords: false,
    permissions: {},
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
      timelineLimit: INITIAL_TIMELINE_LIMIT,
      nextCursor: '',
      subjectName,
      studentName,
      titleText: buildTitleText(studentName)
    })
    wx.setNavigationBarTitle({ title: '学习记录' })
    this.loadHistory()
  },

  updateCleanupPreview(cleanupPreview, permissions = {}) {
    if (!cleanupPreview) return
    const nextPermissions = cleanupPreview.permissions || permissions || this.data.permissions || {}
    this.setData({
      permissions: nextPermissions,
      ...buildHistoryState(this.data.allEvents || [], this.data.activeSubject, this.data.allStatusItems || [], {
        cleanupPreview,
        permissions: nextPermissions
      })
    })
  },

  previewCleanupAfterFirstPaint(activeSubject, permissions) {
    previewStaleRecordsIfPossible(this.data.studentId, activeSubject)
      .then(cleanupPreview => this.updateCleanupPreview(cleanupPreview, permissions))
      .catch(() => {})
  },

  async loadHistory(options = {}) {
    if (!options.keepVisible) {
      this.setData({ loading: true })
    }
    try {
      const activeSubject = normalizeSubject(this.data.activeSubject || this.data.subject || '')
      const fallbackSubjectName = this.data.subjectName || subjectNameOf(activeSubject)
      const titleText = buildTitleText(this.data.studentName)
      const timelineLimit = Math.max(INITIAL_TIMELINE_LIMIT, Number(this.data.timelineLimit) || INITIAL_TIMELINE_LIMIT)
      const cursor = options.cursor || ''
      let reports = []
      let papers = []
      let englishSessions = []
      let permissions = {}
      let hasMoreRecords = false
      let nextCursor = ''
      let usedSharedTimeline = false

      try {
        if (typeof cloud.getLearningTimeline === 'function') {
          const timelineParams = {
            studentId: this.data.studentId,
            limit: options.append ? INITIAL_TIMELINE_LIMIT : timelineLimit
          }
          if (cursor) timelineParams.cursor = cursor
          const timeline = await cloud.getLearningTimeline(timelineParams)
          reports = timeline.reports || []
          papers = timeline.papers || []
          englishSessions = timeline.englishSessions || []
          permissions = timeline.permissions || {}
          hasMoreRecords = Boolean(timeline.hasMore)
          nextCursor = timeline.nextCursor || ''
          usedSharedTimeline = true
        }
      } catch (error) {
        console.warn('共享学习记录不可用，回退到旧记录读取', error && error.message ? error.message : error)
      }

      if (!usedSharedTimeline && !reports.length && !papers.length && !englishSessions.length) {
        reports = await cloud.getReports(this.data.studentId, undefined, timelineLimit)
        papers = typeof cloud.getPapers === 'function'
          ? await cloud.getPapers({ studentId: this.data.studentId })
          : []
        hasMoreRecords = reports.length >= timelineLimit || papers.length >= timelineLimit || englishSessions.length >= timelineLimit
      }

      const fileIDs = collectFileIDs(reports, englishSessions)
      let tempFiles = []
      if (fileIDs.length) {
        try {
          tempFiles = await cloud.getTempFileURLs(fileIDs.slice(0, INITIAL_TEMP_URL_LIMIT))
        } catch (error) {
          console.warn('学习记录图片临时链接不可用，继续展示文字记录', error && error.message ? error.message : error)
        }
      }
      const urlByFileID = new Map(tempFiles.map(item => [item.fileID, item.tempFileURL || '']))
      this._tempUrlByFileID = urlByFileID
      const { events, statusItems } = buildTimelineEvents(
        reports,
        papers,
        urlByFileID,
        activeSubject,
        fallbackSubjectName,
        englishSessions
      )
      const allEvents = options.append
        ? mergeEvents(this.data.allEvents || [], events)
        : events
      const allStatusItems = options.append
        ? mergeEvents(this.data.allStatusItems || [], statusItems)
        : statusItems

      this.setData({
        titleText,
        permissions,
        timelineLimit,
        nextCursor,
        hasMoreRecords: usedSharedTimeline
          ? hasMoreRecords
          : (reports.length >= timelineLimit || papers.length >= timelineLimit || englishSessions.length >= timelineLimit),
        ...buildHistoryState(allEvents, activeSubject, allStatusItems, { cleanupPreview: null, permissions }),
        loading: false
      })
      if (!options.skipCleanupPreview) {
        this.previewCleanupAfterFirstPaint(activeSubject, permissions)
      }
    } catch (err) {
      console.error('加载学习记录失败', err)
      this.setData({
        ...buildHistoryState([], normalizeSubject(this.data.activeSubject || this.data.subject || ''), []),
        loading: false
      })
      wx.showToast({ title: '学习记录加载失败', icon: 'none' })
    }
  },

  async onLoadMoreRecords() {
    if (this.data.loading || this.data.loadingMoreRecords || !this.data.hasMoreRecords) return
    const hasCursor = Boolean(this.data.nextCursor)
    this.setData(hasCursor
      ? { loadingMoreRecords: true }
      : {
        loadingMoreRecords: true,
        timelineLimit: (Number(this.data.timelineLimit) || INITIAL_TIMELINE_LIMIT) + TIMELINE_LIMIT_STEP
      })
    try {
      await this.loadHistory({
        keepVisible: true,
        skipCleanupPreview: true,
        append: hasCursor,
        cursor: hasCursor ? this.data.nextCursor : ''
      })
    } finally {
      this.setData({ loadingMoreRecords: false })
    }
  },

  onFilterTap(e) {
    const activeSubject = normalizeSubject(e.currentTarget.dataset.subject || '')
    this.setData(buildHistoryState(this.data.allEvents || [], activeSubject, this.data.allStatusItems || [], {
      cleanupPreview: this.data.cleanup,
      permissions: this.data.permissions
    }))
  },

  async onCleanupStaleRecords() {
    const cleanup = this.data.cleanup || EMPTY_CLEANUP
    if (!cleanup.hasCandidates) return
    if (!cleanup.canCleanup) {
      wx.showToast({ title: '只有档案管理者可以清理', icon: 'none' })
      return
    }
    return new Promise(resolve => {
      wx.showModal({
        title: '清理中断记录',
        content: `将清理 ${cleanup.count} 条长时间停留在分析中的记录，不会删除已完成报告和试卷。`,
        confirmText: '确认清理',
        success: async res => {
          if (!res.confirm) {
            resolve(false)
            return
          }
          this.setData({ cleaningStaleRecords: true })
          try {
            await cloud.cleanupStaleLearningRecords({
              studentId: this.data.studentId,
              subject: normalizeSubject(this.data.activeSubject || this.data.subject || ''),
              dryRun: false
            })
            wx.showToast({ title: '已清理', icon: 'success' })
            await this.loadHistory()
            resolve(true)
          } catch (error) {
            console.error('清理学习记录失败', error)
            wx.showToast({ title: '清理失败', icon: 'none' })
            resolve(false)
          } finally {
            this.setData({ cleaningStaleRecords: false })
          }
        },
        fail: () => resolve(false)
      })
    })
  },

  async resolveTempFileURL(fileID) {
    if (!fileID) return ''
    this._tempUrlByFileID = this._tempUrlByFileID || new Map()
    if (this._tempUrlByFileID.has(fileID)) {
      return this._tempUrlByFileID.get(fileID) || ''
    }
    if (typeof cloud.getTempFileURLs !== 'function') return ''
    try {
      const files = await cloud.getTempFileURLs([fileID])
      const item = (files || []).find(file => file.fileID === fileID) || {}
      const tempFileURL = item.tempFileURL || ''
      this._tempUrlByFileID.set(fileID, tempFileURL)
      return tempFileURL
    } catch (error) {
      console.warn('学习记录图片临时链接懒加载失败', error && error.message ? error.message : error)
      return ''
    }
  },

  async previewTimelineImage(target, list = []) {
    const tempFileURL = target.tempFileURL || await this.resolveTempFileURL(target.fileID)
    if (!tempFileURL) {
      wx.showToast({ title: '原图暂时无法预览', icon: 'none' })
      return
    }
    const urls = []
    for (const item of list) {
      const url = item.tempFileURL || (item.fileID === target.fileID ? tempFileURL : '')
      if (url) urls.push(url)
    }
    wx.previewImage({
      current: tempFileURL,
      urls: urls.length ? urls : [tempFileURL]
    })
  },

  onPreviewPhoto(e) {
    const { event, photo } = photoFromDataset(this.data.days, e.currentTarget.dataset)
    if (!photo) {
      wx.showToast({ title: '原图暂时无法预览', icon: 'none' })
      return
    }
    return this.previewTimelineImage(photo, event.photos || [])
  },

  onPreviewFoldedEvidence(e) {
    const { event, evidence } = evidenceFromDataset(this.data.days, e.currentTarget.dataset)
    if (!evidence) {
      wx.showToast({ title: '原图暂时无法预览', icon: 'none' })
      return
    }
    return this.previewTimelineImage(evidence, event.foldedEvidence || [])
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

const cloud = require('../../utils/cloud')
const { formatBottleneckDisplayList } = require('../../utils/util')

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

function dayLabel(value) {
  const date = toDate(value)
  return `${date.getMonth() + 1}月${date.getDate()}日`
}

function reportTitle(report) {
  if (report.type === 'verification') return '验证报告'
  if (report.status === 'analyzing') return '诊断分析中'
  if (report.status === 'failed') return '诊断失败'
  return '诊断报告'
}

function reportSummary(report) {
  if (report.status === 'analyzing') return 'AI 正在整理这次试卷，完成后会更新学习记录。'
  if (report.status === 'failed') return '这次分析没有完成，可以进入报告页重新分析。'
  if (report.comparisonSummary) return report.comparisonSummary
  if (report.summary) return report.summary
  if (Array.isArray(report.bottlenecks) && report.bottlenecks.length > 0) {
    return `发现 ${report.bottlenecks.length} 个学习卡点`
  }
  return '查看这次学习诊断的详细结果。'
}

function buildReportEvent(report, photos) {
  const isVerification = report.type === 'verification'
  const photoCount = photos.length
  const duplicateCount = photos.filter(photo => photo.isDuplicate).length
  const bottleneckText = formatBottleneckDisplayList(report.bottlenecks || [])
  const evidence = report.verificationEvidence || []
  const improvedCount = evidence.filter(item => item.complete && item.allCorrect).length

  return {
    id: report._id,
    kind: isVerification ? 'verification-report' : 'diagnosis-report',
    icon: isVerification ? '✓' : '◎',
    title: reportTitle(report),
    timeText: timeText(report.createdAt),
    createdAt: report.createdAt,
    summary: reportSummary(report),
    actionText: '查看报告',
    reportId: report._id,
    photos,
    photoCount,
    duplicateCount,
    chips: [
      photoCount > 0 ? `${photoCount} 张照片` : '',
      isVerification && improvedCount > 0 ? `${improvedCount} 个已改善` : '',
      !isVerification && report.totalErrors ? `${report.totalErrors} 道相关错题` : '',
      bottleneckText
    ].filter(Boolean)
  }
}

function buildPaperEvent(paper) {
  const questionCount = (paper.questions || []).length || paper.questionCount || 0
  const bottleneckText = formatBottleneckDisplayList(
    (paper.bottleneckTargets || []).map(code => ({ lpCode: code }))
  )

  return {
    id: paper._id,
    kind: 'verification-paper',
    icon: '□',
    title: paper.type === 'verification' ? '生成验证试卷' : '生成诊断试卷',
    timeText: timeText(paper.createdAt),
    createdAt: paper.createdAt,
    summary: bottleneckText ? `覆盖 ${bottleneckText}` : '已生成可打印的 A4 试卷。',
    actionText: '查看试卷',
    paperId: paper._id,
    photos: [],
    photoCount: 0,
    duplicateCount: 0,
    chips: [
      questionCount ? `${questionCount} 题` : '',
      paper.totalPages ? `${paper.totalPages} 页` : 'A4 PDF'
    ].filter(Boolean)
  }
}

function groupEventsByDay(events) {
  const byDay = new Map()
  events
    .sort((a, b) => toDate(b.createdAt) - toDate(a.createdAt))
    .forEach(event => {
      const key = dateKey(event.createdAt)
      if (!byDay.has(key)) {
        byDay.set(key, {
          dateKey: key,
          dayLabel: dayLabel(event.createdAt),
          events: []
        })
      }
      byDay.get(key).events.push(event)
    })
  return Array.from(byDay.values())
}

Page({
  data: {
    studentId: '',
    subject: 'math',
    subjectName: '数学',
    studentName: '',
    loading: true,
    days: []
  },

  onLoad(options) {
    this.setData({
      studentId: options.studentId || '',
      subject: options.subject || 'math',
      subjectName: decodeURIComponent(options.subjectName || '数学'),
      studentName: decodeURIComponent(options.studentName || '')
    })
    wx.setNavigationBarTitle({ title: '学习记录' })
    this.loadHistory()
  },

  async loadHistory() {
    this.setData({ loading: true })
    try {
      const reports = await cloud.getReports(this.data.studentId, this.data.subject, 50)
      const papers = typeof cloud.getPapers === 'function'
        ? await cloud.getPapers({ studentId: this.data.studentId, subject: this.data.subject })
        : []

      const reportPhotos = reports.map(report => ({
        report,
        photos: getReportPhotos(report)
      }))
      const fileIDs = reportPhotos.flatMap(group => group.photos.map(photo => photo.fileID))
      const tempFiles = await cloud.getTempFileURLs(fileIDs)
      const urlByFileID = new Map(tempFiles.map(item => [item.fileID, item.tempFileURL || '']))

      const reportEvents = reportPhotos.map(({ report, photos }) => {
        const viewPhotos = photos.map(photo => ({
          ...photo,
          tempFileURL: urlByFileID.get(photo.fileID) || '',
          summaryText: photo.ocrSummary || '此照片来自旧报告，暂无 OCR 识别摘要'
        }))
        return buildReportEvent(report, viewPhotos)
      })
      const paperEvents = (papers || [])
        .filter(paper => paper.type === 'verification')
        .map(buildPaperEvent)
      const days = groupEventsByDay([...reportEvents, ...paperEvents])

      this.setData({ days, loading: false })
    } catch (err) {
      console.error('加载学习记录失败', err)
      this.setData({ days: [], loading: false })
      wx.showToast({ title: '学习记录加载失败', icon: 'none' })
    }
  },

  onPreviewPhoto(e) {
    const { dayIndex, eventIndex, photoIndex } = e.currentTarget.dataset
    const day = this.data.days[dayIndex]
    const event = day && day.events[eventIndex]
    const photo = event && event.photos[photoIndex]
    if (!photo || !photo.tempFileURL) {
      wx.showToast({ title: '原图暂时无法预览', icon: 'none' })
      return
    }
    wx.previewImage({
      current: photo.tempFileURL,
      urls: event.photos.map(item => item.tempFileURL).filter(Boolean)
    })
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

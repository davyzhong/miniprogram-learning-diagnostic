const cloud = require('../../utils/cloud')
const {
  buildBottleneckViews,
  findBottleneckView
} = require('../../utils/bottleneck-view')
const { bottleneckListText } = require('../../utils/learning-records')
const { buildPaperCodeMap, buildPaperDisplay } = require('../../utils/paper-display')
const { SUBJECT_NAMES } = require('../../utils/constants')

function profileBottlenecks(profile = {}) {
  if (Array.isArray(profile.currentBottlenecks)) return profile.currentBottlenecks
  return [
    ...(profile.pendingBottlenecks || []).map(item => ({ ...item, status: 'needs_verification' })),
    ...(profile.improvedBottlenecks || []).map(item => ({ ...item, status: 'improved' }))
  ]
}

function toDate(value) {
  if (!value) return null
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? null : date
}

function timeOf(value) {
  const date = toDate(value)
  return date ? date.getTime() : 0
}

function formatDateTime(value) {
  const date = toDate(value)
  if (!date) return ''
  const hour = String(date.getHours()).padStart(2, '0')
  const minute = String(date.getMinutes()).padStart(2, '0')
  return `${date.getMonth() + 1}月${date.getDate()}日 ${hour}:${minute}`
}

function reportCodes(report = {}) {
  const codes = []
  ;(report.bottlenecks || []).forEach(item => {
    if (item.lpCode) codes.push(item.lpCode)
  })
  ;(report.verificationTargets || []).forEach(code => {
    if (code) codes.push(code)
  })
  ;(report.verificationEvidence || []).forEach(item => {
    if (item.lpCode) codes.push(item.lpCode)
    if (item.targetCode) codes.push(item.targetCode)
    if (item.bottleneckCode) codes.push(item.bottleneckCode)
  })
  return [...new Set(codes)]
}

function paperCodes(paper = {}) {
  const codes = []
  ;(paper.bottleneckTargets || []).forEach(code => {
    if (code) codes.push(code)
  })
  ;(paper.questions || []).forEach(question => {
    if (question.lpCode) codes.push(question.lpCode)
  })
  return [...new Set(codes)]
}

function reportMatches(report, lpCode) {
  return reportCodes(report).includes(lpCode)
}

function paperMatches(paper, lpCode) {
  return paperCodes(paper).includes(lpCode)
}

function reportTypeName(report = {}) {
  if (report.type === 'verification') return '验证反馈'
  return '诊断报告'
}

function buildReportSummary(report = {}) {
  return report.comparisonSummary
    || report.changeSummary
    || report.summary
    || bottleneckListText(report.bottlenecks || [])
    || '点击查看完整报告'
}

function buildPaperSummary(display = {}) {
  return [
    display.questionCount ? `${display.questionCount} 题` : '',
    display.totalPages ? `共 ${display.totalPages} 页` : '',
    display.bottleneckText ? `覆盖 ${display.bottleneckText}` : ''
  ].filter(Boolean).join(' · ') || '点击查看验证试卷'
}

function buildEvidenceChain(reports, papers, subjectName) {
  const paperCodeById = buildPaperCodeMap(papers)
  const reportRows = reports.map(report => ({
    id: report._id,
    type: 'report',
    icon: report.type === 'verification' ? '验' : '报',
    title: reportTypeName(report),
    summary: buildReportSummary(report),
    timeText: formatDateTime(report.createdAt || report.updatedAt),
    createdAt: report.createdAt || report.updatedAt
  }))
  const paperRows = papers.map(paper => {
    const display = buildPaperDisplay(paper, subjectName, { paperCodeById })
    return {
      id: paper._id,
      type: 'paper',
      icon: '卷',
      title: display.paperCode ? `验证试卷 ${display.paperCode}` : '验证试卷',
      summary: buildPaperSummary(display),
      paperCode: display.paperCode,
      timeText: formatDateTime(paper.createdAt || paper.paperDate),
      createdAt: paper.createdAt || paper.paperDate
    }
  })
  return [...reportRows, ...paperRows].sort((a, b) => timeOf(b.createdAt) - timeOf(a.createdAt))
}

Page({
  data: {
    loading: true,
    studentId: '',
    studentName: '',
    subject: 'math',
    subjectName: '数学',
    lpCode: '',
    bottleneck: null,
    relatedReports: [],
    relatedPapers: [],
    evidenceChain: [],
    emptyText: ''
  },

  onLoad(options = {}) {
    const subject = options.subject || 'math'
    const studentId = options.studentId || ''
    const lpCode = options.lpCode ? decodeURIComponent(options.lpCode) : ''
    const studentName = options.studentName ? decodeURIComponent(options.studentName) : ''
    this.setData({
      studentId,
      studentName,
      subject,
      subjectName: options.subjectName ? decodeURIComponent(options.subjectName) : (SUBJECT_NAMES[subject] || '数学'),
      lpCode
    })
    if (studentId && lpCode) {
      return this.loadDetail()
    }
    this.setData({ loading: false, emptyText: '缺少学习卡点信息' })
    return Promise.resolve()
  },

  async loadDetail() {
    this.setData({ loading: true })
    try {
      const dashboard = await cloud.getSubjectDashboard(this.data.studentId, this.data.subject)
      const profile = dashboard.profile || {}
      const reports = dashboard.reports || []
      const papers = dashboard.papers || []
      const views = buildBottleneckViews(profileBottlenecks({
        ...profile,
        subject: this.data.subject
      }).map(item => ({
        ...item,
        subject: this.data.subject,
        subjectName: this.data.subjectName
      })))
      const bottleneck = findBottleneckView(views, this.data.lpCode) || buildBottleneckViews([{
        lpCode: this.data.lpCode,
        subject: this.data.subject,
        subjectName: this.data.subjectName,
        status: 'needs_verification'
      }])[0]
      const relatedReports = reports
        .filter(report => reportMatches(report, this.data.lpCode))
        .sort((a, b) => timeOf(b.createdAt) - timeOf(a.createdAt))
      const relatedPapers = papers
        .filter(paper => paperMatches(paper, this.data.lpCode))
        .sort((a, b) => timeOf(b.createdAt || b.paperDate) - timeOf(a.createdAt || a.paperDate))
      this.setData({
        bottleneck,
        relatedReports,
        relatedPapers,
        evidenceChain: buildEvidenceChain(relatedReports, relatedPapers, this.data.subjectName),
        loading: false,
        emptyText: ''
      })
    } catch (error) {
      console.error('加载学习卡点详情失败', error)
      wx.showToast({ title: '卡点详情加载失败', icon: 'none' })
      this.setData({ loading: false, emptyText: '卡点详情加载失败，请稍后重试' })
    }
  },

  onGenerateVerification() {
    wx.navigateTo({
      url: `/pages/generate-verification/generate-verification?studentId=${this.data.studentId}&subject=${this.data.subject}&subjectName=${encodeURIComponent(this.data.subjectName)}&studentName=${encodeURIComponent(this.data.studentName || '')}&targetCode=${encodeURIComponent(this.data.lpCode)}`
    })
  },

  onViewReport(e) {
    const id = e.currentTarget.dataset.id
    if (!id) return
    wx.navigateTo({ url: `/pages/report/report?id=${id}` })
  },

  onViewPaper(e) {
    const id = e.currentTarget.dataset.id
    if (!id) return
    wx.navigateTo({ url: `/pages/paper-preview/paper-preview?paperId=${id}` })
  },

  onEvidenceTap(e) {
    if (e.currentTarget.dataset.type === 'paper') {
      this.onViewPaper(e)
      return
    }
    this.onViewReport(e)
  },

  onBackToCenter() {
    wx.navigateTo({
      url: `/pages/bottleneck-center/bottleneck-center?studentId=${this.data.studentId}&studentName=${encodeURIComponent(this.data.studentName || '')}`
    })
  }
})

const cloud = require('../../utils/cloud')
const {
  buildBottleneckViews,
  findBottleneckView,
  profileBottlenecks,
  buildConfidence
} = require('../../utils/bottleneck-view')
const { bottleneckListText } = require('../../utils/learning-records')
const { buildPaperCodeMap, buildPaperDisplay } = require('../../utils/paper-display')
const { SUBJECT_NAMES } = require('../../utils/constants')
const { buildTraceableUrl } = require('../../utils/traceable-actions')
const { navigateToVerificationPaper, stopVerificationPoller } = require('../../utils/shared-navigation')
const { formatMonthDay, formatClock } = require('../../utils/util')
const { readableNameOf, sanitizeUserText } = require('../../utils/user-facing-text')

// 知识节点 seed（查前序依赖）
const knowledgeSeed = require('../../data/math/knowledge-nodes.seed')
const nodeMap = new Map((knowledgeSeed.nodes || []).map(n => [n.nodeId, n]))

const DOMAIN_ICONS = {
  '数与代数': '🔢', '图形与几何': '📐', '统计与概率': '📊', '综合与实践': '🔧',
}

function buildKnowledgePosition(bottleneck = {}) {
  const nodeId = bottleneck.nodeId || ''
  const node = nodeId ? nodeMap.get(nodeId) : null
  if (!node) return { visible: false }

  const domain = node.domain || '数与代数'
  const domainIcon = DOMAIN_ICONS[domain] || '📚'
  const prerequisites = (node.prerequisites || [])
    .map(pid => {
      const preNode = nodeMap.get(pid)
      return preNode ? { nodeId: pid, title: readableNameOf(preNode) || '待确认知识点' } : null
    })
    .filter(Boolean)

  // 找后续节点：哪些节点的 prerequisites 包含当前 nodeId
  const dependents = (knowledgeSeed.nodes || [])
    .filter(n => (n.prerequisites || []).includes(nodeId))
    .map(n => ({ nodeId: n.nodeId, title: readableNameOf(n) || '待确认知识点' }))

  return {
    visible: true,
    domain,
    domainIcon,
    nodeTitle: readableNameOf(node) || '待确认知识点',
    gradeRange: node.gradeRange || [],
    prerequisites: prerequisites.slice(0, 4),
    dependents: dependents.slice(0, 4),
    hasPrerequisites: prerequisites.length > 0,
    hasDependents: dependents.length > 0,
  }
}

const EVIDENCE_PREVIEW_LIMIT = 3

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
  // M月D日 HH:MM，基于北京时区
  return `${formatMonthDay(date)} ${formatClock(date)}`
}

function compactText(text = '', maxLength = 34) {
  const value = sanitizeUserText(text, { treatAsId: true }).replace(/\s+/g, ' ').trim()
  if (value.length <= maxLength) return value
  return `${value.slice(0, maxLength)}...`
}

function countRelatedErrors(report = {}, lpCode = '') {
  const matched = (report.bottlenecks || []).find(item => item.lpCode === lpCode)
  if (matched && matched.errorCount !== undefined) return Number(matched.errorCount) || 0
  const details = Array.isArray(report.errorDetails)
    ? report.errorDetails.filter(item => !lpCode || item.lpCode === lpCode)
    : []
  if (details.length > 0) return details.length
  return Number(report.totalErrors) || 0
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

function buildReportStatusText(report = {}, lpCode = '') {
  if (report.type === 'verification') {
    const evidence = (report.verificationEvidence || []).find(item => (
      item.lpCode === lpCode || item.targetCode === lpCode || item.bottleneckCode === lpCode
    ))
    if (evidence && evidence.complete && evidence.allCorrect) return '已改善'
    if (evidence && evidence.complete) return '仍需观察'
    return '已反馈'
  }
  const text = `${report.changeSummary || ''}${report.summary || ''}`
  if (/再次|持续|仍需|复现/.test(text)) return '再次出现'
  return '发现'
}

function buildVerificationMeta(report = {}, paperCode = '', lpCode = '') {
  const evidenceList = (report.verificationEvidence || []).filter(item => (
    item.lpCode === lpCode || item.targetCode === lpCode || item.bottleneckCode === lpCode
  ))
  const complete = evidenceList.filter(item => item.complete).length
  const passed = evidenceList.filter(item => item.complete && item.allCorrect).length
  return [
    paperCode ? `关联 ${paperCode}` : '',
    complete ? `${passed}/${complete}通过` : '',
  ].filter(Boolean)
}

function buildEvidenceChain(reports, papers, subjectName, lpCode = '') {
  const paperCodeById = buildPaperCodeMap(papers)
  const paperCodeOfId = id => paperCodeById.get(id) || ''
  const verificationByPaperId = new Map()
  reports
    .filter(report => report.type === 'verification' && report.paperId)
    .forEach(report => verificationByPaperId.set(report.paperId, report))
  const reportRows = reports.map(report => ({
    id: report._id,
    type: 'report',
    url: buildTraceableUrl({ type: 'report-detail', id: report._id }),
    kind: report.type === 'verification' ? 'verification-report' : 'diagnosis-report',
    icon: report.type === 'verification' ? '验' : '报',
    category: reportTypeName(report),
    title: reportTypeName(report),
    statusText: buildReportStatusText(report, lpCode),
    statusClass: report.type === 'verification' ? 'feedback' : 'diagnosis',
    summary: compactText(buildReportSummary(report), 42),
    metaChips: [
      formatDateTime(report.evidenceTime || report.createdAt || report.updatedAt),
      report.type === 'verification' ? '' : `${countRelatedErrors(report, lpCode)}道相关错题`,
      report.type === 'verification' ? '' : (Array.isArray(report.imageFiles) && report.imageFiles.length ? `${report.imageFiles.length}张照片` : ''),
      ...buildVerificationMeta(report, paperCodeOfId(report.paperId), lpCode)
    ].filter(Boolean),
    timeText: formatDateTime(report.createdAt || report.updatedAt),
    createdAt: report.createdAt || report.updatedAt
  }))
  const paperRows = papers.map(paper => {
    const display = buildPaperDisplay(paper, subjectName, { paperCodeById })
    const feedbackReport = verificationByPaperId.get(paper._id)
    return {
      id: paper._id,
      type: 'paper',
      url: buildTraceableUrl({ type: 'paper-workbench', id: paper._id }),
      kind: 'verification-paper',
      icon: '卷',
      category: '验证试卷',
      title: display.paperCode || '验证试卷',
      statusText: feedbackReport ? '已反馈' : '待上传',
      statusClass: feedbackReport ? 'done' : 'pending',
      summary: display.bottleneckText ? `覆盖 ${display.bottleneckText}` : buildPaperSummary(display),
      paperCode: display.paperCode,
      metaChips: [
        display.questionCount ? `${display.questionCount}题` : '',
        display.studentPagesText,
        display.answerPagesText,
        feedbackReport ? '已反馈' : '待上传'
      ].filter(Boolean),
      timeText: formatDateTime(paper.createdAt || paper.paperDate),
      createdAt: paper.createdAt || paper.paperDate
    }
  })
  return [...reportRows, ...paperRows].sort((a, b) => timeOf(b.createdAt) - timeOf(a.createdAt))
}

function evidenceVisibility(evidenceChain = [], showAll = false) {
  const visibleEvidenceChain = showAll
    ? evidenceChain
    : evidenceChain.slice(0, EVIDENCE_PREVIEW_LIMIT)
  return {
    visibleEvidenceChain,
    hiddenEvidenceCount: Math.max(0, evidenceChain.length - visibleEvidenceChain.length),
    showAllEvidence: showAll
  }
}

function compactList(values = []) {
  return values
    .filter(Boolean)
    .map(value => compactText(value, 48))
    .filter(Boolean)
}

Page({
  data: {
    loading: true,
    studentId: '',
    studentName: '',
    subject: 'math',
    subjectName: '数学',
    lpCode: '',
    bottleneckId: '',
    viewId: '',
    bottleneck: null,
    relatedReports: [],
    relatedPapers: [],
    evidenceChain: [],
    visibleEvidenceChain: [],
    hiddenEvidenceCount: 0,
    showAllEvidence: false,
    emptyText: ''
  },

  onLoad(options = {}) {
    const subject = options.subject || 'math'
    const studentId = options.studentId || ''
    const lpCode = options.lpCode ? decodeURIComponent(options.lpCode) : ''
    const bottleneckId = options.bottleneckId ? decodeURIComponent(options.bottleneckId) : ''
    const viewId = options.viewId ? decodeURIComponent(options.viewId) : ''
    const studentName = options.studentName ? decodeURIComponent(options.studentName) : ''
    this.setData({
      studentId,
      studentName,
      subject,
      subjectName: options.subjectName ? decodeURIComponent(options.subjectName) : (SUBJECT_NAMES[subject] || '数学'),
      lpCode,
      bottleneckId,
      viewId
    })
    if (studentId && (lpCode || bottleneckId || viewId)) {
      return this.loadDetail()
    }
    this.setData({ loading: false, emptyText: '缺少学习卡点信息' })
    return Promise.resolve()
  },

  async loadDetail() {
    this.setData({ loading: true })
    try {
      const dashboard = await cloud.getSubjectDashboard(this.data.studentId, this.data.subject, {
        reportLimit: 10,
        paperLimit: 10
      })
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
      })), {
        subject: this.data.subject,
        subjectName: this.data.subjectName,
        expandCandidates: this.data.subject === 'math'
      })
      const targetIdentifier = this.data.bottleneckId || this.data.viewId || this.data.lpCode
      const bottleneck = findBottleneckView(views, targetIdentifier) || buildBottleneckViews([{
        lpCode: this.data.lpCode,
        bottleneckId: this.data.bottleneckId,
        subject: this.data.subject,
        subjectName: this.data.subjectName,
        status: 'needs_verification'
      }])[0]
      const relatedLpCode = bottleneck && bottleneck.lpCode ? bottleneck.lpCode : this.data.lpCode
      const relatedReports = reports
        .filter(report => reportMatches(report, relatedLpCode))
        .sort((a, b) => timeOf(b.createdAt) - timeOf(a.createdAt))
      const relatedPapers = papers
        .filter(paper => paperMatches(paper, relatedLpCode))
        .sort((a, b) => timeOf(b.createdAt || b.paperDate) - timeOf(a.createdAt || a.paperDate))
      const evidenceChain = buildEvidenceChain(relatedReports, relatedPapers, this.data.subjectName, relatedLpCode)

      // 知识位置：从 knowledge-nodes seed 查前序和关联节点
      const knowledgePosition = buildKnowledgePosition(bottleneck)
      // 置信度仪表盘
      const confidence = buildConfidence(bottleneck)

      this.setData({
        bottleneck,
        confidence,
        relatedReports,
        relatedPapers,
        evidenceChain,
        knowledgePosition,
        ...evidenceVisibility(evidenceChain),
        loading: false,
        emptyText: ''
      })
    } catch (error) {
      console.error('加载学习卡点详情失败', error)
      wx.showToast({ title: '卡点详情加载失败', icon: 'none' })
      this.setData({ loading: false, emptyText: '卡点详情加载失败，请稍后重试' })
    }
  },

  async onGenerateVerification() {
    const { studentId, subject } = this.data
    // 统一入口：状态分流 + 自动轮询 + 兜底重新生成
    await navigateToVerificationPaper(cloud, { studentId, subject, reportId: '' })
  },

  async onOpenLearningResource() {
    const bottleneck = this.data.bottleneck
    if (!bottleneck) return

    const lpCode = bottleneck.lpCode || this.data.lpCode
    wx.showLoading({ title: '正在生成任务' })
    try {
      const result = await cloud.generateLearningResourcePack({
        studentId: this.data.studentId,
        subject: this.data.subject,
        sourceReportId: this.data.relatedReports[0] && this.data.relatedReports[0]._id,
        target: {
          targetId: this.data.bottleneckId || bottleneck.bottleneckId || this.data.viewId || bottleneck.viewId || lpCode,
          bottleneckId: this.data.bottleneckId || bottleneck.bottleneckId || '',
          lpCode,
          title: bottleneck.displayName || bottleneck.shortName || '学习卡点',
          nodeId: bottleneck.nodeId || '',
          categoryPath: compactList([bottleneck.category]),
          symptomPatterns: compactList([
            bottleneck.parentDescription,
            bottleneck.evidenceText
          ]),
          repairStrategy: compactList([
            bottleneck.actionText,
            bottleneck.validationStyle
          ])
        },
        resources: bottleneck.resources || []
      })
      wx.hideLoading()
      const packId = result.packId || (result.pack && (result.pack._id || result.pack.packId))
      if (!result.success || !packId) {
        wx.showToast({ title: '任务生成失败，请稍后重试', icon: 'none' })
        return
      }
      wx.navigateTo({
        url: `/pages/learning-resource/learning-resource?packId=${encodeURIComponent(packId)}`
      })
    } catch (error) {
      wx.hideLoading()
      console.error('学习任务生成失败', error)
      wx.showToast({ title: '任务生成失败，请稍后重试', icon: 'none' })
    }
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
    const url = e.currentTarget.dataset.url || ''
    if (url) {
      wx.navigateTo({ url })
      return
    }
    if (e.currentTarget.dataset.type === 'paper') {
      this.onViewPaper(e)
      return
    }
    this.onViewReport(e)
  },

  onToggleEvidence() {
    const showAll = !this.data.showAllEvidence
    this.setData(evidenceVisibility(this.data.evidenceChain, showAll))
  },

  onMetricTap(e) {
    const target = e.currentTarget.dataset.target || 'evidence'
    if (target === 'papers') {
      const firstPaper = this.data.relatedPapers && this.data.relatedPapers[0]
      if (firstPaper && firstPaper._id) {
        wx.navigateTo({ url: `/pages/paper-preview/paper-preview?paperId=${firstPaper._id}` })
        return
      }
    }
    if (target === 'reports') {
      const firstReport = this.data.relatedReports && this.data.relatedReports[0]
      if (firstReport && firstReport._id) {
        wx.navigateTo({ url: `/pages/report/report?id=${firstReport._id}` })
        return
      }
    }
    wx.showToast({ title: '暂无对应证据', icon: 'none' })
  },

  onBackToCenter() {
    wx.redirectTo({
      url: `/pages/bottleneck-center/bottleneck-center?studentId=${this.data.studentId}&studentName=${encodeURIComponent(this.data.studentName || '')}`
    })
  },

  onUnload() {
    stopVerificationPoller()
  }
})

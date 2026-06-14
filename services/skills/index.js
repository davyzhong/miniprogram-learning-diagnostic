const { buildReportView } = require('../../miniprogram/pages/report/report-presenter')
const {
  buildBottleneckViews,
  profileBottlenecks
} = require('../../miniprogram/utils/bottleneck-view')

const SUBJECTS = new Set(['math', 'chinese', 'english'])

function requireAdapter(adapter, method) {
  if (!adapter || typeof adapter[method] !== 'function') {
    throw new Error(`缺少 adapter.${method}`)
  }
  return adapter[method].bind(adapter)
}

function assertString(value, name) {
  if (!value || typeof value !== 'string') {
    throw new Error(`缺少 ${name}`)
  }
}

function assertSubject(subject) {
  if (!SUBJECTS.has(subject)) {
    throw new Error('学科参数无效')
  }
}

function normalizeFileIds(input, fieldName = 'fileIds') {
  const fileIds = input.fileIds || input.fileIDs || input.answerPhotoFileIds || []
  if (!Array.isArray(fileIds) || fileIds.length === 0) {
    throw new Error(fieldName === 'answerPhotoFileIds' ? '至少需要一张作答照片' : '至少需要一张照片')
  }
  return fileIds
}

function unwrapResult(result, fallbackMessage = '操作失败') {
  if (!result || result.success === false) {
    throw new Error((result && result.error) || fallbackMessage)
  }
  return result
}

function normalizeReport(report = {}) {
  const view = buildReportView(report)
  const bottleneckList = (report.bottlenecks || []).map((item, index) => ({
    ...item,
    displayName: view.bottleneckList[index] ? view.bottleneckList[index].displayName : (item.displayName || item.lpName || item.name || item.lpCode || '')
  }))

  return {
    reportId: report._id || report.reportId || '',
    type: report.type || 'diagnosis',
    subject: report.subject || '',
    summary: report.summary || report.changeSummary || report.comparisonSummary || view.headline || '',
    bottlenecks: bottleneckList,
    evidence: report.errorDetails || [],
    nextActions: view.showNextStep ? ['生成验证试卷'] : [],
    view
  }
}

function normalizeBottleneckState(profile = {}) {
  const views = buildBottleneckViews(profileBottlenecks(profile), { subject: profile.subject })
  const toItem = item => ({
    code: item.lpCode,
    name: item.displayName,
    status: item.status,
    weight: item.weight,
    evidenceCount: item.evidenceCount,
    recentErrorCount: item.recentErrorCount,
    priorityText: item.priorityText
  })

  return {
    studentId: profile.studentId || '',
    subject: profile.subject || '',
    active: views.filter(item => item.status !== 'improved').map(toItem),
    pending: views.filter(item => item.status === 'needs_verification').map(toItem),
    improved: views.filter(item => item.status === 'improved').map(toItem),
    all: views.map(toItem)
  }
}

async function diagnoseFromUpload(input = {}, adapter) {
  assertString(input.studentId, 'studentId')
  const subject = input.subject || 'math'
  assertSubject(subject)
  const fileIDs = normalizeFileIds(input)
  const uploadAndAnalyze = requireAdapter(adapter, 'uploadAndAnalyze')
  const result = unwrapResult(await uploadAndAnalyze({
    studentId: input.studentId,
    subject,
    mode: input.mode || 'diagnosis',
    fileIDs,
    imageMetas: input.imageMetas || []
  }), '诊断启动失败')

  return {
    ...result,
    reportId: result.reportId,
    status: result.status || 'analyzing'
  }
}

async function getAnalysisStatus(input = {}, adapter) {
  assertString(input.reportId, 'reportId')
  const getAnalysisProgress = requireAdapter(adapter, 'getAnalysisProgress')
  return unwrapResult(await getAnalysisProgress({ reportId: input.reportId }), '分析状态读取失败')
}

async function generateDiagnosticReport(input = {}, adapter) {
  assertString(input.reportId, 'reportId')
  const format = input.format || 'json'

  if (format === 'pdf') {
    const generateReportPDF = requireAdapter(adapter, 'generateReportPDF')
    return unwrapResult(await generateReportPDF({ reportId: input.reportId }), '报告 PDF 生成失败')
  }

  const getReportDetail = requireAdapter(adapter, 'getReportDetail')
  const detail = unwrapResult(await getReportDetail({ reportId: input.reportId }), '报告读取失败')
  return normalizeReport(detail.report || detail)
}

async function trackBottlenecks(input = {}, adapter) {
  assertString(input.studentId, 'studentId')
  const subject = input.subject || 'math'
  assertSubject(subject)
  const getSubjectDashboard = requireAdapter(adapter, 'getSubjectDashboard')
  const dashboard = unwrapResult(await getSubjectDashboard({ studentId: input.studentId, subject }), '学习卡点读取失败')
  const profile = dashboard.profile || {}
  return normalizeBottleneckState({
    ...profile,
    studentId: profile.studentId || input.studentId,
    subject: profile.subject || subject
  })
}

async function generateVerificationPaper(input = {}, adapter) {
  assertString(input.studentId, 'studentId')
  const subject = input.subject || 'math'
  assertSubject(subject)
  const targets = input.bottleneckTargets || input.targets || []
  if (!Array.isArray(targets) || targets.length === 0) {
    throw new Error('至少需要一个学习卡点')
  }
  const generatePaper = requireAdapter(adapter, 'generatePaper')
  return unwrapResult(await generatePaper({
    studentId: input.studentId,
    subject,
    type: 'verification',
    targets,
    paperDate: input.paperDate || '',
    questionCount: input.questionCount
  }), '验证试卷生成失败')
}

async function evaluateVerificationSubmission(input = {}, adapter) {
  assertString(input.studentId, 'studentId')
  assertString(input.paperId, 'paperId')
  const subject = input.subject || 'math'
  assertSubject(subject)
  const fileIDs = normalizeFileIds(input, 'answerPhotoFileIds')
  const uploadAndAnalyze = requireAdapter(adapter, 'uploadAndAnalyze')
  return unwrapResult(await uploadAndAnalyze({
    studentId: input.studentId,
    subject,
    mode: 'verification',
    paperId: input.paperId,
    fileIDs,
    imageMetas: input.imageMetas || []
  }), '验证反馈启动失败')
}

async function buildLearningTimeline(input = {}, adapter) {
  assertString(input.studentId, 'studentId')
  const subject = input.subject || undefined
  if (subject) assertSubject(subject)
  const getLearningTimeline = requireAdapter(adapter, 'getLearningTimeline')
  const result = unwrapResult(await getLearningTimeline({ studentId: input.studentId, subject }), '学习时间线读取失败')
  return {
    studentId: input.studentId,
    subject: subject || '',
    items: result.items || []
  }
}

module.exports = {
  diagnoseFromUpload,
  getAnalysisStatus,
  generateDiagnosticReport,
  trackBottlenecks,
  generateVerificationPaper,
  evaluateVerificationSubmission,
  buildLearningTimeline,
  normalizeReport,
  normalizeBottleneckState
}

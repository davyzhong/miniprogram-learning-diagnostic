// utils/cloud.js - 云函数调用封装
const { SUBJECT_NAMES } = require('./constants')
const perf = require('./perf')

let _db = null
const pendingSubjectProfileCreates = new Map()

function getDb() {
  if (!_db) _db = wx.cloud.database()
  return _db
}

function callContextLabel(context = {}) {
  if (!context.functionName) return ''
  return context.action ? `${context.functionName}:${context.action}` : context.functionName
}

function normalizeError(error, fallbackMessage, context = {}) {
  const message = error && (error.message || error.errMsg) ? (error.message || error.errMsg) : fallbackMessage
  const label = callContextLabel(context)
  const normalizedMessage = label && isTimeoutError(message)
    ? `${label} 请求超时，请稍后重试`
    : (message || '操作失败，请稍后重试')
  const normalized = new Error(normalizedMessage)
  normalized.code = error && (error.code || error.errCode)
  normalized.functionName = context.functionName || ''
  normalized.action = context.action || ''
  normalized.originalMessage = message || ''
  return normalized
}

async function callFunction(name, data, options = {}) {
  const startedAt = perf.now()
  const dimensions = {
    functionName: name,
    action: data && data.action ? data.action : '',
    success: false
  }
  perf.recordMetric('cloud.callFunction.payloadBytes', perf.estimateBytes(data), dimensions)
  try {
    const res = await wx.cloud.callFunction({ name, data, ...options })
    const result = res.result || {}
    if (result.success === false) {
      throw new Error(result.error || '云函数执行失败')
    }
    dimensions.success = true
    perf.recordMetric('cloud.callFunction.resultBytes', perf.estimateBytes(result), dimensions)
    perf.recordMetric('cloud.callFunction.duration', perf.now() - startedAt, dimensions)
    return result
  } catch (error) {
    perf.recordMetric('cloud.callFunction.duration', perf.now() - startedAt, dimensions)
    throw normalizeError(error, '云函数调用失败', {
      functionName: name,
      action: data && data.action
    })
  }
}

function isTimeoutError(error) {
  const msg = String(error && error.message ? error.message : error)
  // ESOCKETTIMEDOUT / ETIMEDOUT / ECONNRESET 等网络超时也需识别
  return /timeout|timed out|超时|ESOCKETTIMEDOUT|ETIMEDOUT|ECONNRESET|ECONNREFUSED|socket hang up|网络超时/i.test(msg)
}

/**
 * 获取所有学生列表
 */
async function getStudents() {
  const res = await getDb().collection('students')
    .orderBy('createdAt', 'desc')
    .get()
  return res.data
}

/**
 * 获取单个学生信息
 */
async function getStudent(studentId) {
  const res = await getDb().collection('students').doc(studentId).get()
  return res.data
}

/**
 * 添加学生
 */
async function addStudent(data) {
  const now = getDb().serverDate()
  const res = await getDb().collection('students').add({
    data: {
      ...data,
      createdAt: now,
      updatedAt: now,
      reportCount: 0
    }
  })
  return res._id
}

async function createStudentWithProfiles(data) {
  const studentId = await addStudent(data)
  const now = getDb().serverDate()

  for (const subject of Object.keys(SUBJECT_NAMES)) {
    await getDb().collection('subjectProfiles').add({
      data: {
        studentId,
        subject,
        subjectName: SUBJECT_NAMES[subject],
        totalReports: 0,
        currentSummary: '',
        currentBottlenecks: [],
        nextAction: '拍照诊断',
        latestEffectiveReportId: '',
        pendingBottlenecks: [],
        improvedBottlenecks: [],
        currentAnalysisId: '',
        analysisStatus: '',
        createdAt: now,
        updatedAt: now
      }
    })
  }

  return studentId
}

async function getSubjectProfiles(studentId) {
  const res = await getDb().collection('subjectProfiles').where({ studentId }).get()
  return res.data
}

async function getSubjectProfile(studentId, subject) {
  const profiles = await getSubjectProfiles(studentId)
  return profiles.find(profile => profile.subject === subject) || null
}

async function ensureSubjectProfile(studentId, subject, subjectName = '') {
  const key = `${studentId}:${subject}`
  if (pendingSubjectProfileCreates.has(key)) {
    return pendingSubjectProfileCreates.get(key)
  }

  const createProfile = (async () => {
    const existing = await getSubjectProfile(studentId, subject)
    if (existing) return existing

    const now = getDb().serverDate()
    const res = await getDb().collection('subjectProfiles').add({
      data: {
        studentId,
        subject,
        subjectName,
        totalReports: 0,
        currentSummary: '',
        currentBottlenecks: [],
        nextAction: '拍照诊断',
        latestEffectiveReportId: '',
        pendingBottlenecks: [],
        improvedBottlenecks: [],
        currentAnalysisId: '',
        analysisStatus: '',
        createdAt: now,
        updatedAt: now
      }
    })
    return { _id: res._id, studentId, subject, subjectName }
  })()

  pendingSubjectProfileCreates.set(key, createProfile)
  try {
    return await createProfile
  } finally {
    pendingSubjectProfileCreates.delete(key)
  }
}

/**
 * 上传照片到云存储
 * @param {string} filePath - 本地文件路径
 * @param {string} studentId - 学生ID
 * @param {string} batchId - 批次ID
 * @returns {string} cloudFileId - 云文件ID
 */
async function uploadPhoto(filePath, studentId, batchId) {
  const ext = filePath.split('.').pop()
  const cloudPath = `photos/${studentId}/${batchId}/${Date.now()}.${ext}`
  const res = await wx.cloud.uploadFile({
    cloudPath,
    filePath
  })
  return res.fileID
}

/**
 * 获取学生的所有报告
 */
async function getReports(studentId, subject, limit = 20) {
  const filter = subject ? { studentId, subject } : { studentId }
  const res = await getDb().collection('reports')
    .where(filter)
    .orderBy('createdAt', 'desc')
    .limit(limit)
    .get()
  return (res.data || []).filter(report => !report.isArchived && !report.archivedAt)
}

async function getLatestReport(studentId, subject) {
  const reports = await getReports(studentId, subject, 1)
  return reports[0] || null
}

/**
 * 获取单个报告详情
 */
async function getReport(reportId) {
  const res = await getDb().collection('reports').doc(reportId).get()
  return res.data
}

async function getTempFileURLs(fileIDs) {
  const uniqueFileIDs = Array.from(new Set((fileIDs || []).filter(Boolean)))
  const chunks = []
  for (let i = 0; i < uniqueFileIDs.length; i += 50) {
    chunks.push(uniqueFileIDs.slice(i, i + 50))
  }
  const responses = await Promise.all(chunks.map(fileList => wx.cloud.getTempFileURL({ fileList })))
  return responses.reduce((items, res) => items.concat(res.fileList || []), [])
}

async function getPapers(filter) {
  const res = await getDb().collection('papers').where(filter).get()
  return res.data
}

async function getPaper(paperId) {
  const res = await getDb().collection('papers').doc(paperId).get()
  return res.data
}

/**
 * 调用云函数：上传并触发分析（主入口）
 * @param {object} params - { fileIDs, studentId, subject, mode, paperId }
 */
async function callUploadAndAnalyze(params, options) {
  return callFunction('uploadAndAnalyze', params, options)
}

/**
 * 调用云函数：分析照片（由 uploadAndAnalyze 内部触发，一般不直接调用）
 */
async function callAnalyzePhotos(params, options) {
  return callFunction('analyzePhotos', params, options)
}

/**
 * 调用云函数：生成验证/诊断试卷 PDF
 * LLM 生成耗时较长，前端需要匹配云函数的超时（60 秒）。
 * 微信 wx.cloud.callFunction 默认超时 20 秒，必须显式传 timeout。
 * @param {object} params - { studentId, subject, type, targets }
 */
async function callGeneratePaper(params) {
  return callFunction('generatePaper', params, { timeout: 60000 })
}

/**
 * 调用云函数：验证卷维护接口。
 * 主流程由诊断完成后的后台自动生成负责；前端只查询状态和下载。
 * @param {object} params - { studentId, subject, reportId }
 */
async function regenerateVerificationPaper(params) {
  // resume action 会同步推进一个卡点（LLM 出题 + 可能的 PDF 重排），需要匹配云函数 60s 上限
  const isResume = params && params.action === 'resume'
  return callFunction('regenerateVerificationPaper', params, { timeout: isResume ? 60000 : 20000 })
}

/**
 * 调用云函数：生成报告 PDF
 * PDFKit 渲染耗时较长，前端匹配云函数超时（60 秒）。
 * @param {object} params - { reportId }
 */
async function callGenerateReportPDF(params) {
  return callFunction('generateReportPDF', params, { timeout: 60000 })
}

async function getAnalysisProgress(reportId) {
  return callFunction('getAnalysisProgress', { reportId })
}

async function getAccessibleStudents() {
  const result = await callFunction('studentAccess', { action: 'getAccessibleStudents' })
  return result.students || []
}

async function listStudentMembers(studentId) {
  return callFunction('studentAccess', { action: 'listMembers', studentId })
}

async function createStudentInvite(studentId, presetRelation = '') {
  return callFunction('studentAccess', { action: 'createInvite', studentId, presetRelation })
}

async function getStudentInvite(inviteId, token) {
  return callFunction('studentAccess', { action: 'getInvite', inviteId, token })
}

async function acceptStudentInvite(inviteId, token, profile = {}) {
  return callFunction('studentAccess', { action: 'acceptInvite', inviteId, token, ...profile })
}

async function getStudentInviteByCode(inviteCode) {
  return callFunction('studentAccess', { action: 'getInviteByCode', inviteCode })
}

async function acceptStudentInviteByCode(params) {
  return callFunction('studentAccess', { action: 'acceptInviteByCode', ...params })
}

async function updateStudentMemberProfile(params) {
  return callFunction('studentAccess', { action: 'updateMemberProfile', ...params })
}

async function revokeStudentMember(studentId, memberOpenId) {
  return callFunction('studentAccess', { action: 'revokeMember', studentId, memberOpenId })
}

async function getStudentDashboard(studentId, options = {}) {
  return callFunction('studentData', { action: 'getStudentDashboard', studentId, ...options })
}

async function getHomeDashboard() {
  return callFunction('studentData', { action: 'getHomeDashboard' })
}

async function getSubjectDashboard(studentId, subject, options = {}) {
  return callFunction('studentData', { action: 'getSubjectDashboard', studentId, subject, ...options })
}

async function getChineseSkillTask(studentId) { return callFunction('studentData', { action: 'getChineseSkillTask', studentId }) }
async function submitChineseSkillTask(payload = {}) { return callFunction('studentData', { action: 'submitChineseSkillTask', ...payload }) }
async function getNodeMasteryMap(studentId, subject = 'math') { return callFunction('studentData', { action: 'getNodeMasteryMap', studentId, subject }) }
async function getRepairMetrics(studentId) { return callFunction('studentData', { action: 'getRepairMetrics', studentId }) }
async function generateMicroValidation(payload = {}) { return callFunction('microValidation', { action: 'generateMicroValidation', ...payload }, { timeout: 60000 }) }
async function submitMicroValidation(payload = {}) { return callFunction('microValidation', { action: 'submitMicroValidation', ...payload }) }
async function getMicroValidation(sessionId) { return callFunction('microValidation', { action: 'getMicroValidation', sessionId }) }

async function getLearningTimeline({ studentId, subject, limit, cursor } = {}) {
  return callFunction('studentData', { action: 'getLearningTimeline', studentId, subject, limit, cursor })
}

/**
 * 最近上传照片的文件名列表（上传页去重提示用）。
 * 服务端 field 投影只取 imageFiles.fileName，避免客户端直读 20 份全量报告。
 */
async function listRecentImageFileNames(studentId, subject, limit = 20) {
  const result = await callFunction('studentData', { action: 'listRecentImageFileNames', studentId, subject, limit })
  return result.fileNames || []
}

async function cleanupStaleLearningRecords({ studentId, subject, dryRun = false } = {}) {
  return callFunction('studentData', { action: 'cleanupStaleLearningRecords', studentId, subject, dryRun })
}

async function getReportDetail(reportId) {
  return callFunction('studentData', { action: 'getReportDetail', reportId }, { timeout: 60000 })
}

async function getPaperDetail(paperId) {
  return callFunction('studentData', { action: 'getPaperDetail', paperId })
}

/**
 * 查询当前激活的验证卷状态（自动生成场景）
 * @returns { paper: object|null, status: 'ready'|'generating'|'failed'|'none' }
 */
async function getActiveVerificationPaper(studentId, subject, reportId) {
  return callFunction('studentData', { action: 'getActiveVerificationPaper', studentId, subject, reportId })
}

async function getLearningProgress(studentId, subject) {
  return callFunction('studentData', { action: 'getLearningProgress', studentId, subject })
}

async function createReportFeedback(payload) {
  return callFunction('reportFeedback', { action: 'createFeedback', ...payload })
}

async function getReportFeedback(reportId) {
  const result = await callFunction('reportFeedback', { action: 'listFeedbackByReport', reportId })
  return result.items || []
}

async function generateLearningResourcePack(payload = {}) {
  // generatePack 内部调用 LLM 增强讲解内容，可能需要 20-40 秒，
  // 必须显式突破 wx.cloud.callFunction 默认的 20 秒超时。
  return callFunction('learningResource', { action: 'generatePack', ...payload }, { timeout: 60000 })
}

async function getLearningResourcePack(packId) {
  return callFunction('learningResource', { action: 'getPack', packId })
}

async function completeLearningResourcePack(payload = {}) {
  return callFunction('learningResource', { action: 'completePack', ...payload })
}

async function scheduleResourcePackVerification(packId) {
  return callFunction('learningResource', { action: 'scheduleVerification', packId })
}

async function getAiUsageEvents(payload = {}) {
  return callFunction('aiUsage', { action: 'listEvents', ...payload })
}

async function getAiUsageSummary(payload = {}) {
  return callFunction('aiUsage', { action: 'getSummary', ...payload })
}

async function createDeletionRequest(payload = {}) {
  return callFunction('aiUsage', { action: 'createDeletionRequest', ...payload })
}

async function getDeletionRequests() {
  return callFunction('aiUsage', { action: 'getDeletionRequests' })
}

async function getBetaAuth() {
  return callFunction('aiUsage', { action: 'getBetaAuth' })
}

async function setBetaAuth(consented) {
  return callFunction('aiUsage', { action: 'setBetaAuth', consented })
}

async function getEnglishVocabularySummary(studentId, today = '') {
  return callFunction('englishVocabulary', { action: 'getVocabularySummary', studentId, today })
}

async function getEnglishTodayPlan(studentId, today = '') {
  return callFunction('englishVocabulary', { action: 'getTodayPlan', studentId, today })
}

async function getEnglishConfusionPractice(studentId) {
  return callFunction('englishVocabulary', { action: 'getConfusionPractice', studentId })
}

async function createEnglishImportBatch(payload = {}) {
  return callFunction('englishVocabulary', { action: 'createImportBatch', ...payload })
}

async function confirmEnglishImportBatch(studentId, batchId) {
  return callFunction('englishVocabulary', { action: 'confirmImportBatch', studentId, batchId }, { timeout: 60000 })
}

async function seedEnglishPersonalVocabulary(studentId) {
  return callFunction('englishVocabulary', { action: 'seedPersonalVocabulary', studentId })
}

async function generateEnglishRecognitionSession(payload = {}) {
  return callFunction('englishVocabulary', { action: 'generateRecognitionSession', ...payload })
}

async function submitEnglishRecognitionAttempt(payload = {}) {
  return callFunction('englishVocabulary', { action: 'submitRecognitionAttempt', ...payload })
}

async function generateEnglishPaperDictationSession(payload = {}) {
  return callFunction('englishVocabulary', { action: 'generatePaperDictationSession', ...payload })
}

async function submitEnglishDictationPhoto(payload = {}) {
  return callFunction('englishVocabulary', { action: 'submitDictationPhoto', ...payload })
}

async function analyzeEnglishDictationPhoto(payload = {}) {
  return callFunction('englishVocabulary', { action: 'analyzeDictationPhoto', ...payload }, { timeout: 60000 })
}

async function generateEnglishPracticeSession(payload = {}) {
  return callFunction('englishVocabulary', { action: 'generatePracticeSession', ...payload })
}

async function submitEnglishDictationAttempt(payload = {}) {
  return callFunction('englishVocabulary', { action: 'submitDictationAttempt', ...payload })
}

async function submitEnglishPracticeResult(payload = {}) {
  return callFunction('englishVocabulary', { action: 'submitPracticeResult', ...payload })
}

module.exports = {
  getPerformanceMetrics: perf.getMetrics,
  clearPerformanceMetrics: perf.clearMetrics,
  normalizeError,
  isTimeoutError,
  callFunction,
  getStudents,
  getStudent,
  addStudent,
  createStudentWithProfiles,
  getSubjectProfiles,
  getSubjectProfile,
  ensureSubjectProfile,
  uploadPhoto,
  getReports,
  getLatestReport,
  getReport,
  getTempFileURLs,
  getPapers,
  getPaper,
  callUploadAndAnalyze,
  callAnalyzePhotos,
  callGeneratePaper,
  regenerateVerificationPaper,
  callGenerateReportPDF,
  getAnalysisProgress,
  getAccessibleStudents,
  listStudentMembers,
  createStudentInvite,
  getStudentInvite,
  acceptStudentInvite,
  getStudentInviteByCode,
  acceptStudentInviteByCode,
  updateStudentMemberProfile,
  revokeStudentMember,
  getStudentDashboard,
  getHomeDashboard,
  getSubjectDashboard,
  getChineseSkillTask,
  submitChineseSkillTask,
  getRepairMetrics,
  getLearningTimeline,
  listRecentImageFileNames,
  cleanupStaleLearningRecords,
  getReportDetail,
  getPaperDetail,
  getActiveVerificationPaper,
  getLearningProgress,
  createReportFeedback,
  getReportFeedback,
  generateLearningResourcePack,
  getLearningResourcePack,
  completeLearningResourcePack,
  scheduleResourcePackVerification,
  getAiUsageEvents,
  getAiUsageSummary,
  createDeletionRequest,
  getDeletionRequests,
  getBetaAuth,
  setBetaAuth,
  getEnglishVocabularySummary,
  getEnglishTodayPlan,
  getEnglishConfusionPractice,
  createEnglishImportBatch,
  confirmEnglishImportBatch,
  seedEnglishPersonalVocabulary,
  generateEnglishRecognitionSession,
  submitEnglishRecognitionAttempt,
  generateEnglishPaperDictationSession,
  submitEnglishDictationPhoto,
  analyzeEnglishDictationPhoto,
  generateEnglishPracticeSession,
  submitEnglishDictationAttempt,
  submitEnglishPracticeResult,
}

// utils/cloud.js - 云函数调用封装
const { SUBJECT_NAMES } = require('./constants')

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
  try {
    const res = await wx.cloud.callFunction({ name, data, ...options })
    const result = res.result || {}
    if (result.success === false) {
      throw new Error(result.error || '云函数执行失败')
    }
    return result
  } catch (error) {
    throw normalizeError(error, '云函数调用失败', {
      functionName: name,
      action: data && data.action
    })
  }
}

function isTimeoutError(error) {
  return /timeout|timed out|超时/i.test(String(error && error.message ? error.message : error))
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
  const results = []
  for (let i = 0; i < uniqueFileIDs.length; i += 50) {
    const res = await wx.cloud.getTempFileURL({ fileList: uniqueFileIDs.slice(i, i + 50) })
    results.push(...(res.fileList || []))
  }
  return results
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
 * @param {object} params - { studentId, subject, type, targets }
 */
async function callGeneratePaper(params) {
  return callFunction('generatePaper', params)
}

/**
 * 调用云函数：生成报告 PDF
 * @param {object} params - { reportId }
 */
async function callGenerateReportPDF(params) {
  return callFunction('generateReportPDF', params)
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

async function getSubjectDashboard(studentId, subject, options = {}) {
  return callFunction('studentData', { action: 'getSubjectDashboard', studentId, subject, ...options })
}

async function getLearningTimeline({ studentId, subject, limit } = {}) {
  return callFunction('studentData', { action: 'getLearningTimeline', studentId, subject, limit })
}

async function cleanupStaleLearningRecords({ studentId, subject, dryRun = false } = {}) {
  return callFunction('studentData', { action: 'cleanupStaleLearningRecords', studentId, subject, dryRun })
}

async function getReportDetail(reportId) {
  return callFunction('studentData', { action: 'getReportDetail', reportId })
}

async function getPaperDetail(paperId) {
  return callFunction('studentData', { action: 'getPaperDetail', paperId })
}

async function createReportFeedback(payload) {
  return callFunction('reportFeedback', { action: 'createFeedback', ...payload })
}

async function getReportFeedback(reportId) {
  const result = await callFunction('reportFeedback', { action: 'listFeedbackByReport', reportId })
  return result.items || []
}

async function getEnglishVocabularySummary(studentId, today = '') {
  return callFunction('englishVocabulary', { action: 'getVocabularySummary', studentId, today })
}

async function createEnglishImportBatch(payload = {}) {
  return callFunction('englishVocabulary', { action: 'createImportBatch', ...payload })
}

async function confirmEnglishImportBatch(studentId, batchId) {
  return callFunction('englishVocabulary', { action: 'confirmImportBatch', studentId, batchId })
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
  return callFunction('englishVocabulary', { action: 'analyzeDictationPhoto', ...payload })
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
  getSubjectDashboard,
  getLearningTimeline,
  cleanupStaleLearningRecords,
  getReportDetail,
  getPaperDetail,
  createReportFeedback,
  getReportFeedback,
  getEnglishVocabularySummary,
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

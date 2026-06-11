// utils/cloud.js - 云函数调用封装

const db = wx.cloud.database()

/**
 * 获取所有学生列表
 */
async function getStudents() {
  const res = await db.collection('students')
    .orderBy('createdAt', 'desc')
    .get()
  return res.data
}

/**
 * 获取单个学生信息
 */
async function getStudent(studentId) {
  const res = await db.collection('students').doc(studentId).get()
  return res.data
}

/**
 * 添加学生
 */
async function addStudent(data) {
  const now = db.serverDate()
  const res = await db.collection('students').add({
    data: {
      ...data,
      createdAt: now,
      updatedAt: now,
      reportCount: 0
    }
  })
  return res._id
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
async function getReports(studentId) {
  const res = await db.collection('reports')
    .where({ studentId })
    .orderBy('createdAt', 'desc')
    .get()
  return res.data
}

/**
 * 获取单个报告详情
 */
async function getReport(reportId) {
  const res = await db.collection('reports').doc(reportId).get()
  return res.data
}

/**
 * 获取某批次的照片
 */
async function getPhotos(studentId, batchId) {
  const res = await db.collection('photos')
    .where({ studentId, batchId })
    .get()
  return res.data
}

/**
 * 调用云函数：上传并触发分析（主入口）
 * @param {object} params - { fileIDs, studentId, subject, mode, paperId }
 */
async function callUploadAndAnalyze(params) {
  const res = await wx.cloud.callFunction({
    name: 'uploadAndAnalyze',
    data: params
  })
  return res.result
}

/**
 * 调用云函数：分析照片（由 uploadAndAnalyze 内部触发，一般不直接调用）
 */
async function callAnalyzePhotos(params) {
  const res = await wx.cloud.callFunction({
    name: 'analyzePhotos',
    data: params
  })
  return res.result
}

/**
 * 调用云函数：生成验证/诊断试卷 PDF
 * @param {object} params - { studentId, subject, type, targets }
 */
async function callGeneratePaper(params) {
  const res = await wx.cloud.callFunction({
    name: 'generatePaper',
    data: params
  })
  return res.result
}

/**
 * 调用云函数：生成报告 PDF
 * @param {object} params - { reportId }
 */
async function callGenerateReportPDF(params) {
  const res = await wx.cloud.callFunction({
    name: 'generateReportPDF',
    data: params
  })
  return res.result
}

module.exports = {
  getStudents,
  getStudent,
  addStudent,
  uploadPhoto,
  getReports,
  getReport,
  getPhotos,
  callUploadAndAnalyze,
  callAnalyzePhotos,
  callGeneratePaper,
  callGenerateReportPDF,
}

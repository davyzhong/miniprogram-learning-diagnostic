const cloud = require('wx-server-sdk')

cloud.init({ env: cloud.SYMBOL_CURRENT_ENV })
const db = cloud.database()
const _ = db.command

// 安全：历史重分析是破坏性维护操作（归档报告、重写 subjectProfiles），
// 必须通过 MATH_REANALYSIS_TOKEN 校验，与 analyzePhotos 的 isTrustedReanalysisRequest 对齐。
// 任何外部 wx.cloud.callFunction 调用若不携带正确 token 一律拒绝。
const REANALYSIS_TOKEN = process.env.MATH_REANALYSIS_TOKEN || ''

function isTrustedReanalysisRequest(event = {}) {
  return Boolean(REANALYSIS_TOKEN && event.reanalysisToken === REANALYSIS_TOKEN)
}

const VERSION = 'math-full-reanalysis-v2.2-hierarchy'
const LEARNING_MAP_VERSION = 'math-learning-map-v2.2-hierarchy'
const SUBJECT = 'math'

function now() {
  return new Date()
}

function timeOf(report = {}) {
  return new Date(report.evidenceTime || report.createdAt || report.updatedAt || 0).getTime() || 0
}

function imageFileIdsOf(report = {}) {
  return Array.from(new Set([
    ...(report.imageFileIds || []),
    ...((report.imageFiles || []).map(file => file && file.fileID))
  ].filter(Boolean)))
}

function isReplacementReport(report = {}) {
  return Boolean(report.reanalysis && report.reanalysis.sourceReportId)
}

function hasReplacement(report = {}) {
  return Boolean(report.replacedByReportId || (report.mathReanalysis && report.mathReanalysis.replacementReportId))
}

function isCandidate(report = {}) {
  if (!report || !report._id) return false
  if (report.subject !== SUBJECT) return false
  if (report.status !== 'completed') return false
  if (report.isArchived || report.archivedAt) return false
  if (isReplacementReport(report)) return false
  if (hasReplacement(report)) return false
  return imageFileIdsOf(report).length > 0
}

function safeImageFiles(report = {}) {
  return (report.imageFiles || []).map(file => ({
    fileID: file.fileID || '',
    fileName: file.fileName || '',
    fileSize: Number(file.fileSize) || 0,
    uploadedAt: file.uploadedAt || report.evidenceTime || report.createdAt || now(),
    ocrSummary: '',
    contentFingerprint: '',
    isDuplicate: false,
    duplicateOf: '',
    analysisStatus: '',
    analysisError: ''
  })).filter(file => file.fileID)
}

function uniqueBy(values = [], keyFn) {
  const seen = new Set()
  const result = []
  for (const value of values) {
    const key = keyFn(value)
    if (!key || seen.has(key)) continue
    seen.add(key)
    result.push(value)
  }
  return result
}

function buildReplacementReport(source = {}, batchId) {
  const startedAt = now()
  const replacement = {
    _openid: source._openid,
    studentId: source.studentId,
    subject: SUBJECT,
    subjectName: source.subjectName || '数学',
    type: source.type === 'verification' ? 'verification' : 'diagnosis',
    mode: source.mode || source.type || 'diagnosis',
    sourceType: source.sourceType || '',
    paperId: source.paperId || '',
    imageFileIds: imageFileIdsOf(source),
    imageFiles: safeImageFiles(source),
    status: 'pending_reanalysis',
    error: '',
    summary: '',
    totalErrors: 0,
    bottlenecks: [],
    errorDetails: [],
    comparisonSummary: '',
    verificationTargets: [],
    verificationEvidence: [],
    quality: null,
    isEffective: false,
    partialSuccess: false,
    failedBatchCount: 0,
    failedImageFiles: [],
    evidenceTime: source.evidenceTime || source.createdAt || startedAt,
    createdAt: source.createdAt || source.evidenceTime || startedAt,
    updatedAt: startedAt,
    originalReportId: source._id,
    reanalysis: {
      version: VERSION,
      learningMapVersion: LEARNING_MAP_VERSION,
      batchId,
      sourceReportId: source._id,
      sourceReportCreatedAt: source.createdAt || '',
      startedAt,
      status: 'created',
      replacementForLegacyReport: true,
      bottleneckHierarchy: {
        enabled: true,
        levels: ['category', 'family', 'fineBottleneck']
      }
    }
  }
  Object.keys(replacement).forEach(key => {
    if (replacement[key] === undefined) delete replacement[key]
  })
  return replacement
}

function pendingPatch(replacementReportId, batchId) {
  const startedAt = now()
  return {
    replacedByReportId: replacementReportId,
    mathReanalysis: {
      version: VERSION,
      batchId,
      replacementReportId,
      status: 'replacement_created',
      startedAt
    },
    updatedAt: startedAt
  }
}

function archivePatch(replacementReport) {
  const finalizedAt = now()
  return {
    isArchived: true,
    archivedAt: finalizedAt,
    archiveReason: 'replaced-by-math-learning-map-full-reanalysis',
    replacedByReportId: replacementReport._id,
    mathReanalysis: {
      version: VERSION,
      batchId: replacementReport.reanalysis && replacementReport.reanalysis.batchId,
      replacementReportId: replacementReport._id,
      status: 'archived_after_reanalysis',
      finalizedAt
    },
    updatedAt: finalizedAt
  }
}

async function fetchReports({ studentId = '', reportId = '', limit = 100 } = {}) {
  if (reportId) {
    const res = await db.collection('reports').doc(reportId).get()
    return res.data ? [res.data] : []
  }

  const filter = { subject: SUBJECT }
  if (studentId) filter.studentId = studentId
  const res = await db.collection('reports')
    .where(filter)
    .orderBy('createdAt', 'asc')
    .limit(Math.min(Number(limit) || 100, 1000))
    .get()
  return res.data || []
}

function sourceReportsForAggregate(reports = []) {
  return reports
    .filter(report => report.subject === SUBJECT)
    .filter(report => report.status === 'completed')
    .filter(report => !isReplacementReport(report))
    .filter(report => !report.isArchived && !report.archivedAt)
    .filter(report => imageFileIdsOf(report).length > 0)
    .sort((a, b) => timeOf(a) - timeOf(b))
}

function aggregateImageFiles(reports = []) {
  return uniqueBy(
    reports.flatMap(report => {
      const byId = new Map((report.imageFiles || []).map(file => [file.fileID, file]))
      return imageFileIdsOf(report).map(fileID => {
        const file = byId.get(fileID) || {}
        return {
          fileID,
          fileName: file.fileName || '',
          fileSize: Number(file.fileSize) || 0,
          uploadedAt: file.uploadedAt || report.evidenceTime || report.createdAt || now(),
          ocrSummary: '',
          contentFingerprint: '',
          isDuplicate: false,
          duplicateOf: '',
          analysisStatus: '',
          analysisError: ''
        }
      })
    }),
    file => file.fileID
  )
}

function buildAggregateReport(studentId, reports = [], batchId) {
  const createdAt = now()
  const imageFiles = aggregateImageFiles(reports)
  const first = reports[0] || {}
  return {
    _openid: first._openid,
    studentId,
    subject: SUBJECT,
    subjectName: first.subjectName || '数学',
    type: 'diagnosis',
    mode: 'diagnosis',
    sourceType: 'history-aggregate',
    imageFileIds: imageFiles.map(file => file.fileID),
    imageFiles,
    status: 'pending_reanalysis',
    error: '',
    summary: '',
    totalErrors: 0,
    bottlenecks: [],
    errorDetails: [],
    comparisonSummary: '',
    verificationTargets: [],
    verificationEvidence: [],
    quality: null,
    isEffective: false,
    partialSuccess: false,
    failedBatchCount: 0,
    failedImageFiles: [],
    evidenceTime: createdAt,
    createdAt,
    updatedAt: createdAt,
    reanalysis: {
      version: VERSION,
      learningMapVersion: LEARNING_MAP_VERSION,
      batchId,
      sourceReportIds: reports.map(report => report._id),
      sourceReportCount: reports.length,
      imageCount: imageFiles.length,
      startedAt: createdAt,
      status: 'aggregate_created',
      aggregateCurrentSnapshot: true,
      bottleneckHierarchy: {
        enabled: true,
        levels: ['category', 'family', 'fineBottleneck']
      }
    }
  }
}

function previewCandidates(reports = []) {
  return reports.filter(isCandidate).sort((a, b) => timeOf(a) - timeOf(b)).map(report => ({
    sourceReportId: report._id,
    studentId: report.studentId,
    type: report.type || 'diagnosis',
    imageCount: imageFileIdsOf(report).length,
    createdAt: report.createdAt || report.evidenceTime || ''
  }))
}

async function start(event = {}) {
  const reports = await fetchReports(event)
  const candidates = reports.filter(isCandidate).sort((a, b) => timeOf(a) - timeOf(b))
  const batchId = `math-reanalysis-${Date.now()}`
  if (!event.apply) {
    return {
      success: true,
      phase: 'start',
      mode: 'dry-run',
      candidateCount: candidates.length,
      candidates: previewCandidates(reports)
    }
  }

  const created = []
  for (const source of candidates) {
    const replacement = buildReplacementReport(source, batchId)
    const addRes = await db.collection('reports').add({ data: replacement })
    await db.collection('reports').doc(source._id).update({
      data: pendingPatch(addRes._id, batchId)
    })
    created.push({
      sourceReportId: source._id,
      replacementReportId: addRes._id,
      imageCount: replacement.imageFileIds.length
    })
  }
  return {
    success: true,
    phase: 'start',
    mode: 'apply',
    batchId,
    candidateCount: candidates.length,
    created
  }
}

function aggregatePreview(reports = []) {
  const sourceReports = sourceReportsForAggregate(reports)
  const byStudent = new Map()
  for (const report of sourceReports) {
    if (!report.studentId) continue
    if (!byStudent.has(report.studentId)) byStudent.set(report.studentId, [])
    byStudent.get(report.studentId).push(report)
  }
  return Array.from(byStudent.entries()).map(([studentId, items]) => ({
    studentId,
    sourceReportCount: items.length,
    imageCount: aggregateImageFiles(items).length,
    sourceReportIds: items.map(item => item._id)
  }))
}

async function aggregate(event = {}) {
  const reports = await fetchReports(event)
  const preview = aggregatePreview(reports)
  if (!event.apply) {
    return {
      success: true,
      phase: 'aggregate',
      mode: 'dry-run',
      aggregateCount: preview.length,
      aggregates: preview
    }
  }

  const batchId = `math-aggregate-reanalysis-${Date.now()}`
  const created = []
  for (const item of preview) {
    const sourceReports = reports.filter(report => item.sourceReportIds.includes(report._id))
    const aggregateReport = buildAggregateReport(item.studentId, sourceReports, batchId)
    const addRes = await db.collection('reports').add({ data: aggregateReport })
    created.push({
      studentId: item.studentId,
      aggregateReportId: addRes._id,
      sourceReportCount: item.sourceReportCount,
      imageCount: item.imageCount
    })
  }

  return {
    success: true,
    phase: 'aggregate',
    mode: 'apply',
    batchId,
    created
  }
}

async function cleanupBatch(event = {}) {
  const batchId = event.batchId
  if (!batchId) return { success: false, error: '缺少 batchId' }
  const reports = await fetchReports({ studentId: event.studentId || '', limit: event.limit || 1000 })
  const replacements = reports.filter(report => report.reanalysis && report.reanalysis.batchId === batchId)
  const replacementIds = new Set(replacements.map(report => report._id))
  const sources = reports.filter(report => replacementIds.has(report.replacedByReportId))

  if (!event.apply) {
    return {
      success: true,
      phase: 'cleanupBatch',
      mode: 'dry-run',
      batchId,
      replacementCount: replacements.length,
      sourceCount: sources.length,
      replacementReportIds: Array.from(replacementIds),
      sourceReportIds: sources.map(report => report._id)
    }
  }

  for (const replacement of replacements) {
    await db.collection('reports').doc(replacement._id).update({
      data: {
        isArchived: true,
        archivedAt: now(),
        archiveReason: 'canceled-per-aggregate-reanalysis-plan',
        reanalysis: {
          ...replacement.reanalysis,
          status: 'canceled',
          canceledAt: now()
        },
        updatedAt: now()
      }
    })
  }

  for (const source of sources) {
    await db.collection('reports').doc(source._id).update({
      data: {
        replacedByReportId: _.remove(),
        mathReanalysis: _.remove(),
        updatedAt: now()
      }
    })
  }

  return {
    success: true,
    phase: 'cleanupBatch',
    mode: 'apply',
    batchId,
    archivedReplacementCount: replacements.length,
    restoredSourceCount: sources.length
  }
}

async function status(event = {}) {
  const reportId = event.reportId
  if (!reportId) return { success: false, error: '缺少 reportId' }
  const reportRes = await db.collection('reports').doc(reportId).get()
  const report = reportRes.data
  if (!report) return { success: false, error: '报告不存在' }

  const taskRes = await db.collection('analysisTasks').where({ reportId }).get()
  const tasks = (taskRes.data || []).sort((a, b) => timeOf(b) - timeOf(a))
  const task = tasks[0] || null
  return {
    success: true,
    reportId,
    status: report.status || '',
    totalErrors: report.totalErrors || 0,
    bottleneckCount: (report.bottlenecks || []).length,
    imageCount: imageFileIdsOf(report).length,
    analyzedImageCount: (report.imageFiles || []).filter(file => file.analysisStatus === 'completed').length,
    failedImageCount: (report.failedImageFiles || []).length,
    summary: report.summary || report.error || '',
    learningMapBackfill: report.learningMapBackfill || null,
    reanalysis: report.reanalysis || null,
    task: task ? {
      taskId: task._id,
      status: task.status || '',
      totalBatches: task.totalBatches || 0,
      completedBatches: task.completedBatches || 0,
      nextBatchIndex: task.nextBatchIndex || 0,
      failedBatchCount: task.failedBatchCount || 0,
      error: task.error || '',
      warning: task.warning || '',
      updatedAt: task.updatedAt || '',
      completedAt: task.completedAt || ''
    } : null
  }
}

async function resumeAggregateFinalization(event = {}) {
  const reportId = event.reportId
  if (!reportId) return { success: false, error: '缺少 reportId' }

  const reportRes = await db.collection('reports').doc(reportId).get()
  const report = reportRes.data
  if (!report) return { success: false, error: '报告不存在' }
  if (!(report.reanalysis && report.reanalysis.aggregateCurrentSnapshot)) {
    return { success: false, error: '只允许恢复历史汇总报告的最终合并' }
  }

  const taskRes = event.taskId
    ? await db.collection('analysisTasks').doc(event.taskId).get()
    : await db.collection('analysisTasks').where({ reportId }).get()
  const tasks = event.taskId
    ? (taskRes.data ? [taskRes.data] : [])
    : ((taskRes.data || []).sort((a, b) => timeOf(b) - timeOf(a)))
  const task = tasks.find(item => item.reportId === reportId && Number(item.totalBatches) > 0)
  if (!task) return { success: false, error: '未找到可恢复的分析任务' }

  const completedBatches = Number(task.completedBatches) || 0
  const totalBatches = Number(task.totalBatches) || 0
  const failedBatchCount = Number(task.failedBatchCount) || 0
  const batchResults = Array.isArray(task.batchResults) ? task.batchResults : []
  if (completedBatches < totalBatches || Number(task.nextBatchIndex) < totalBatches || failedBatchCount > 0) {
    return {
      success: false,
      error: '分析批次尚未全部成功，不能恢复最终合并',
      taskId: task._id,
      completedBatches,
      totalBatches,
      failedBatchCount,
      nextBatchIndex: task.nextBatchIndex || 0
    }
  }
  if (batchResults.length < totalBatches) {
    return {
      success: false,
      error: '分析任务缺少批次结果，不能恢复最终合并',
      taskId: task._id,
      batchResultCount: batchResults.length,
      totalBatches
    }
  }

  if (!event.apply) {
    return {
      success: true,
      phase: 'resumeAggregateFinalization',
      mode: 'dry-run',
      reportId,
      taskId: task._id,
      completedBatches,
      totalBatches,
      batchResultCount: batchResults.length
    }
  }

  await db.collection('reports').doc(reportId).update({
    data: {
      status: 'analyzing',
      error: '',
      debugError: '',
      quality: _.remove(),
      updatedAt: now()
    }
  })
  await db.collection('analysisTasks').doc(task._id).update({
    data: {
      status: 'processing',
      error: '',
      updatedAt: now(),
      completedAt: _.remove()
    }
  })

  return {
    success: true,
    phase: 'resumeAggregateFinalization',
    mode: 'apply',
    reportId,
    taskId: task._id,
    completedBatches,
    totalBatches,
    batchResultCount: batchResults.length
  }
}

function findRetryableTask(tasks = [], reportId) {
  return tasks
    .filter(task => task.reportId === reportId)
    .filter(task => Number(task.totalBatches) > 0)
    .sort((a, b) => timeOf(b) - timeOf(a))[0] || null
}

function failedBatchIndexes(batchResults = []) {
  const indexes = []
  batchResults.forEach((result, index) => {
    if (!result || result.success !== true) indexes.push(index)
  })
  return indexes
}

async function retryAggregateFailedBatch(event = {}) {
  const reportId = event.reportId
  if (!reportId) return { success: false, error: '缺少 reportId' }

  const reportRes = await db.collection('reports').doc(reportId).get()
  const report = reportRes.data
  if (!report) return { success: false, error: '报告不存在' }
  if (!(report.reanalysis && report.reanalysis.aggregateCurrentSnapshot)) {
    return { success: false, error: '只允许补跑历史汇总报告的失败批次' }
  }

  const taskRes = event.taskId
    ? await db.collection('analysisTasks').doc(event.taskId).get()
    : await db.collection('analysisTasks').where({ reportId }).get()
  const tasks = event.taskId
    ? (taskRes.data ? [taskRes.data] : [])
    : (taskRes.data || [])
  const task = findRetryableTask(tasks, reportId)
  if (!task) return { success: false, error: '未找到可补跑的分析任务' }

  const totalBatches = Number(task.totalBatches) || 0
  const batchResults = Array.isArray(task.batchResults) ? task.batchResults.slice() : []
  if (batchResults.length < totalBatches) {
    return {
      success: false,
      error: '批次结果尚未完整落库，不能补跑失败批次',
      taskId: task._id,
      batchResultCount: batchResults.length,
      totalBatches
    }
  }

  const failedIndexes = failedBatchIndexes(batchResults)
  if (failedIndexes.length === 0) {
    return {
      success: true,
      phase: 'retryAggregateFailedBatch',
      mode: event.apply ? 'apply' : 'dry-run',
      reportId,
      taskId: task._id,
      remainingFailedBatchCount: 0,
      message: '没有需要补跑的失败批次'
    }
  }

  const requestedIndex = Number.isInteger(event.batchIndex) ? event.batchIndex : Number(event.batchIndex)
  const batchIndex = failedIndexes.includes(requestedIndex) ? requestedIndex : failedIndexes[0]
  const fileID = (task.fileIDs || [])[batchIndex]
  if (!fileID) {
    return { success: false, error: '失败批次缺少 fileID', taskId: task._id, batchIndex }
  }

  if (!event.apply) {
    return {
      success: true,
      phase: 'retryAggregateFailedBatch',
      mode: 'dry-run',
      reportId,
      taskId: task._id,
      batchIndex,
      fileID,
      remainingFailedBatchCount: failedIndexes.length
    }
  }

  await db.collection('reports').doc(reportId).update({
    data: {
      status: 'analyzing',
      error: '',
      debugError: '',
      quality: _.remove(),
      updatedAt: now()
    }
  })
  await db.collection('analysisTasks').doc(task._id).update({
    data: {
      status: 'processing',
      error: '',
      completedAt: _.remove(),
      updatedAt: now()
    }
  })

  const retryRes = await cloud.callFunction({
    name: 'analyzeBatch',
    data: {
      fileIDs: [fileID],
      subject: SUBJECT,
      batchIndex,
      totalBatches,
      reportId,
      taskId: task._id,
      verificationPlan: []
    }
  })
  const retryResult = retryRes.result || {}
  if (!retryResult.success) {
    batchResults[batchIndex] = {
      success: false,
      error: retryResult.error || '补跑失败'
    }
  } else {
    batchResults[batchIndex] = retryResult
  }

  const remainingFailedIndexes = failedBatchIndexes(batchResults)
  await db.collection('analysisTasks').doc(task._id).update({
    data: {
      status: 'processing',
      batchResults,
      failedBatchCount: remainingFailedIndexes.length,
      completedBatches: totalBatches,
      nextBatchIndex: totalBatches,
      error: retryResult.success ? '' : (retryResult.error || '补跑失败'),
      updatedAt: now()
    }
  })

  return {
    success: Boolean(retryResult.success),
    phase: 'retryAggregateFailedBatch',
    mode: 'apply',
    reportId,
    taskId: task._id,
    batchIndex,
    retriedFileID: fileID,
    retryError: retryResult.success ? '' : (retryResult.error || '补跑失败'),
    remainingFailedBatchCount: remainingFailedIndexes.length
  }
}

async function prepareAggregateRetry(event = {}) {
  const reportId = event.reportId
  if (!reportId) return { success: false, error: '缺少 reportId' }

  const reportRes = await db.collection('reports').doc(reportId).get()
  const report = reportRes.data
  if (!report) return { success: false, error: '报告不存在' }
  if (!(report.reanalysis && report.reanalysis.aggregateCurrentSnapshot)) {
    return { success: false, error: '只允许准备历史汇总报告的失败补跑' }
  }

  const taskRes = event.taskId
    ? await db.collection('analysisTasks').doc(event.taskId).get()
    : await db.collection('analysisTasks').where({ reportId }).get()
  const tasks = event.taskId
    ? (taskRes.data ? [taskRes.data] : [])
    : (taskRes.data || [])
  const task = findRetryableTask(tasks, reportId)
  if (!task) return { success: false, error: '未找到可补跑的分析任务' }

  const batchResults = Array.isArray(task.batchResults) ? task.batchResults : []
  const failedIndexes = failedBatchIndexes(batchResults)
  if (failedIndexes.length === 0) {
    return {
      success: true,
      phase: 'prepareAggregateRetry',
      reportId,
      taskId: task._id,
      remainingFailedBatchCount: 0
    }
  }

  const requestedIndex = Number.isInteger(event.batchIndex) ? event.batchIndex : Number(event.batchIndex)
  const batchIndex = failedIndexes.includes(requestedIndex) ? requestedIndex : failedIndexes[0]
  const fileID = (task.fileIDs || [])[batchIndex]
  if (!fileID) return { success: false, error: '失败批次缺少 fileID', taskId: task._id, batchIndex }

  await db.collection('reports').doc(reportId).update({
    data: {
      status: 'analyzing',
      error: '',
      debugError: '',
      quality: _.remove(),
      updatedAt: now()
    }
  })
  await db.collection('analysisTasks').doc(task._id).update({
    data: {
      status: 'processing',
      error: '',
      completedAt: _.remove(),
      updatedAt: now()
    }
  })

  return {
    success: true,
    phase: 'prepareAggregateRetry',
    reportId,
    taskId: task._id,
    batchIndex,
    fileID,
    totalBatches: Number(task.totalBatches) || batchResults.length,
    remainingFailedBatchCount: failedIndexes.length
  }
}

async function applyAggregateRetryResult(event = {}) {
  const { reportId, taskId, batchIndex, retryResult } = event
  if (!reportId || !taskId) return { success: false, error: '缺少 reportId 或 taskId' }
  if (!Number.isInteger(batchIndex) && !Number.isInteger(Number(batchIndex))) {
    return { success: false, error: '缺少 batchIndex' }
  }
  const index = Number(batchIndex)
  const taskRes = await db.collection('analysisTasks').doc(taskId).get()
  const task = taskRes.data
  if (!task || task.reportId !== reportId) return { success: false, error: '分析任务不存在或不匹配' }

  const batchResults = Array.isArray(task.batchResults) ? task.batchResults.slice() : []
  if (index < 0 || index >= batchResults.length) {
    return { success: false, error: 'batchIndex 超出范围', batchResultCount: batchResults.length }
  }

  const normalizedResult = retryResult && retryResult.success
    ? retryResult
    : { success: false, error: (retryResult && retryResult.error) || '补跑失败' }
  batchResults[index] = normalizedResult
  const remainingFailedIndexes = failedBatchIndexes(batchResults)
  const totalBatches = Number(task.totalBatches) || batchResults.length

  await db.collection('analysisTasks').doc(taskId).update({
    data: {
      status: 'processing',
      batchResults,
      failedBatchCount: remainingFailedIndexes.length,
      completedBatches: totalBatches,
      nextBatchIndex: totalBatches,
      error: normalizedResult.success ? '' : normalizedResult.error,
      updatedAt: now()
    }
  })

  return {
    success: true,
    phase: 'applyAggregateRetryResult',
    reportId,
    taskId,
    batchIndex: index,
    retrySuccess: Boolean(normalizedResult.success),
    retryError: normalizedResult.success ? '' : normalizedResult.error,
    remainingFailedBatchCount: remainingFailedIndexes.length
  }
}

function replacementBySource(reports = []) {
  const pairs = new Map()
  for (const report of reports) {
    const sourceId = report.reanalysis && report.reanalysis.sourceReportId
    if (!sourceId) continue
    const current = pairs.get(sourceId)
    if (!current || timeOf(report) >= timeOf(current)) pairs.set(sourceId, report)
  }
  return pairs
}

function finalizablePairs(reports = []) {
  const replacements = replacementBySource(reports)
  return reports
    .filter(report => report.subject === SUBJECT)
    .filter(report => !isReplacementReport(report))
    .filter(report => !report.isArchived && !report.archivedAt)
    .map(source => ({ source, replacement: replacements.get(source._id) }))
    .filter(pair => pair.replacement && pair.replacement.status === 'completed')
}

async function rebuildSubjectProfile(studentId, activeReports = []) {
  const profileRes = await db.collection('subjectProfiles').where({ studentId, subject: SUBJECT }).limit(1).get()
  const profile = (profileRes.data || [])[0]
  if (!profile) return null

  // === merge 语义：聚合所有有效报告的卡点 ===
  // 不再只取最新一份报告覆盖，而是按时间正序回放所有有效报告，
  // 用 buildProfileSummary 的 merge 逻辑累加卡点，保证全量历史数据不丢失。
  const { buildProfileSummary } = require('./profile-summary')
  const studentReports = activeReports
    .filter(report => report.studentId === studentId)
    .filter(report => report.isEffective !== false)
    .filter(report => report.bottlenecks && report.bottlenecks.length > 0 || (report.verificationTargets && report.verificationTargets.length > 0))
    .sort((a, b) => timeOf(a) - timeOf(b))  // 正序：从最早到最新

  let mergedProfile = {
    currentBottlenecks: [],
    pendingBottlenecks: [],
    improvedBottlenecks: [],
    chineseReviewItems: [],
  }

  for (const report of studentReports) {
    const reportTime = report.createdAt ? new Date(report.createdAt) : now()
    const summary = buildProfileSummary(mergedProfile, report, reportTime)
    if (summary.isEffective) {
      mergedProfile = {
        ...mergedProfile,
        currentBottlenecks: summary.currentBottlenecks,
        chineseReviewItems: summary.chineseReviewItems || mergedProfile.chineseReviewItems,
        currentSummary: summary.currentSummary,
        nextAction: summary.nextAction,
      }
    }
  }

  const currentBottlenecks = mergedProfile.currentBottlenecks
  const pendingBottlenecks = currentBottlenecks
    .filter(item => item.status !== 'improved')
    .map(item => ({
      lpCode: item.lpCode,
      lpName: item.lpName,
      severity: item.severity || 'medium',
      sinceDate: item.firstSeenAt || now(),
      nodeIds: item.nodeIds || [],
      candidateBottlenecks: item.candidateBottlenecks || [],
      recommendedResourceIds: item.recommendedResourceIds || [],
      resourcePlan: item.resourcePlan || [],
      evidenceStrength: item.evidenceStrength || '',
      nextActionType: item.nextActionType || '',
      nextActionText: item.nextActionText || ''
    }))
  const improvedBottlenecks = currentBottlenecks
    .filter(item => item.status === 'improved')
    .map(item => ({
      lpCode: item.lpCode,
      lpName: item.lpName,
      sinceDate: item.firstSeenAt || now(),
      improvedDate: item.lastPassedAt || item.lastSeenAt || now(),
    }))

  // 归档保护：把旧 currentBottlenecks 存到 archivedBottlenecks，防止再次丢失
  const oldBottlenecks = (profile.currentBottlenecks || [])

  const latest = studentReports.length > 0 ? studentReports[studentReports.length - 1] : null
  const patch = {
    currentSummary: mergedProfile.currentSummary || (latest ? (latest.changeSummary || latest.summary || '已基于重分析报告更新学习卡点。') : '暂未形成明确学习卡点，建议继续上传试卷观察。'),
    currentBottlenecks,
    pendingBottlenecks,
    improvedBottlenecks,
    archivedBottlenecks: oldBottlenecks,
    archivedAt: now(),
    nextAction: currentBottlenecks.length > 0 ? '先重学，再微验证' : '继续上传试卷',
    latestEffectiveReportId: latest ? latest._id : '',
    totalReports: activeReports.filter(report => report.studentId === studentId).length,
    analysisStatus: null,
    currentAnalysisId: '',
    diagnosisUpdatedAt: now(),
    updatedAt: now()
  }
  await db.collection('subjectProfiles').doc(profile._id).update({ data: patch })
  return {
    studentId,
    profileId: profile._id,
    latestEffectiveReportId: patch.latestEffectiveReportId,
    currentBottleneckCount: currentBottlenecks.length,
    pendingCount: pendingBottlenecks.length,
    improvedCount: improvedBottlenecks.length,
    archivedCount: oldBottlenecks.length,
    replayedReportCount: studentReports.length,
  }
}

async function finalize(event = {}) {
  const reports = await fetchReports(event)
  const pairs = finalizablePairs(reports)
  const archivedSourceIds = new Set(pairs.map(pair => pair.source._id))
  const activeReports = reports
    .filter(report => report.subject === SUBJECT)
    .filter(report => report.status === 'completed')
    .filter(report => !report.isArchived && !report.archivedAt)
    .filter(report => !archivedSourceIds.has(report._id))

  if (!event.apply) {
    return {
      success: true,
      phase: 'finalize',
      mode: 'dry-run',
      finalizableCount: pairs.length,
      replacements: pairs.map(pair => ({
        sourceReportId: pair.source._id,
        replacementReportId: pair.replacement._id
      }))
    }
  }

  const profiles = []
  for (const pair of pairs) {
    await db.collection('reports').doc(pair.source._id).update({
      data: archivePatch(pair.replacement)
    })
    await db.collection('reports').doc(pair.replacement._id).update({
      data: {
        reanalysis: {
          ...pair.replacement.reanalysis,
          status: 'finalized',
          finalizedAt: now()
        },
        updatedAt: now()
      }
    })
  }

  const studentIds = Array.from(new Set(activeReports.map(report => report.studentId).filter(Boolean)))
  for (const studentId of studentIds) {
    const profile = await rebuildSubjectProfile(studentId, activeReports)
    if (profile) profiles.push(profile)
  }

  return {
    success: true,
    phase: 'finalize',
    mode: 'apply',
    archivedCount: pairs.length,
    profiles
  }
}

exports.main = async (event = {}) => {
  // 安全：所有 phase 都必须通过 token 校验，防止外部直接调用触发破坏性历史重分析
  if (!isTrustedReanalysisRequest(event)) {
    return { success: false, error: '未授权的历史重分析请求，缺少或 token 无效' }
  }
  const phase = event.phase || 'start'
  if (phase === 'start') return start(event)
  if (phase === 'aggregate') return aggregate(event)
  if (phase === 'cleanupBatch') return cleanupBatch(event)
  if (phase === 'status') return status(event)
  if (phase === 'resumeAggregateFinalization') return resumeAggregateFinalization(event)
  if (phase === 'retryAggregateFailedBatch') return retryAggregateFailedBatch(event)
  if (phase === 'prepareAggregateRetry') return prepareAggregateRetry(event)
  if (phase === 'applyAggregateRetryResult') return applyAggregateRetryResult(event)
  if (phase === 'finalize') return finalize(event)
  return { success: false, error: `未知 phase：${phase}` }
}

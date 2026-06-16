// analyzePhotos/index.js
// 主控函数：拆分单图批次、严格串行续跑 analyzeBatch、合并结果、更新数据库、推送通知
const cloud = require('wx-server-sdk');
const { compareBottlenecks, buildComparisonSummary } = require('./comparison');
const { markDuplicatePages } = require('./photo-dedup');
const { buildProfileSummary } = require('./profile-summary');
const { buildReportQuality } = require('./report-quality');
const { aggregateVerificationEvidence, aggregateChineseReviewEvidence, buildVerificationPlan } = require('./verification-evidence');
const {
  splitFileBatches,
  assertUsableBatchResults,
  batchFailureSummary,
  collectPageResults,
  mergeBatchResults,
  buildImageFiles,
} = require('./pipeline');

cloud.init({ env: cloud.SYMBOL_CURRENT_ENV });
const db = cloud.database();
const _ = db.command;
const SUBJECTS = new Set(['math', 'chinese', 'english']);
const STALE_TASK_MS = 10 * 60 * 1000;
const ANALYSIS_BATCH_SIZE = 1;
const MAX_CONCURRENT_BATCHES = 1;
const MAX_BATCHES_PER_INVOCATION = 1;
const MAX_BATCH_ATTEMPTS = 2;
const BATCH_RETRY_DELAY_MS = (process.env.BATCH_RETRY_DELAY_MS != null && process.env.BATCH_RETRY_DELAY_MS !== '')
  ? Number(process.env.BATCH_RETRY_DELAY_MS)
  : 600;
const REANALYSIS_TOKEN = process.env.MATH_REANALYSIS_TOKEN || '';

function analysisErrorMessage(err) {
  const message = err && err.message ? err.message : String(err || '');
  return (message || '图片分析失败，请稍后重试').slice(0, 240);
}

function wait(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function failedBatchDebugMessage(failedBatches = []) {
  const detail = failedBatches
    .slice(0, 3)
    .map(item => `第${item.batchIndex + 1}批${item.error ? `：${item.error}` : ''}`)
    .join('；');
  return detail ? `存在未完成的图片分析批次（${detail}）` : '';
}

function learningMapProfileFields(item = {}) {
  return {
    nodeIds: item.nodeIds || [],
    candidateBottlenecks: item.candidateBottlenecks || [],
    recommendedResourceIds: item.recommendedResourceIds || [],
    resourcePlan: item.resourcePlan || [],
    evidenceStrength: item.evidenceStrength || '',
    nextActionType: item.nextActionType || '',
    nextActionText: item.nextActionText || '',
  };
}

function isTrustedReanalysisRequest(event = {}) {
  return Boolean(REANALYSIS_TOKEN && event.reanalysisToken === REANALYSIS_TOKEN);
}

function reanalysisSourceReportId(report = {}) {
  return report.originalReportId
    || (report.reanalysis && report.reanalysis.sourceReportId)
    || (report.mathReanalysis && report.mathReanalysis.sourceReportId)
    || '';
}

function reanalysisSourceReportIds(report = {}) {
  return Array.from(new Set([
    reanalysisSourceReportId(report),
    ...((report.reanalysis && report.reanalysis.sourceReportIds) || []),
    ...((report.mathReanalysis && report.mathReanalysis.sourceReportIds) || []),
  ].filter(Boolean)));
}

// ========== 更新 subjectProfiles ==========
async function getSubjectProfile(studentId, subject) {
  const profileRes = await db.collection('subjectProfiles')
    .where({ studentId })
    .get();
  return profileRes.data.find(item => item.subject === subject) || null;
}

async function updateSubjectProfile(profile, profileSummary, reportId) {
  if (!profile) {
    console.warn('未找到 subjectProfile');
    return;
  }

  const pendingBottlenecks = profileSummary.currentBottlenecks
    .filter(item => item.status !== 'improved')
    .map(item => ({
      lpCode: item.lpCode,
      lpName: item.lpName,
      severity: item.severity || 'medium',
      sinceDate: item.firstSeenAt || new Date(),
      ...learningMapProfileFields(item),
    }));
  const improvedBottlenecks = profileSummary.currentBottlenecks
    .filter(item => item.status === 'improved')
    .map(item => ({
      lpCode: item.lpCode,
      lpName: item.lpName,
      improvedDate: item.lastSeenAt || new Date(),
      ...learningMapProfileFields(item),
    }));

  await db.collection('subjectProfiles').doc(profile._id).update({
    data: {
      currentSummary: profileSummary.currentSummary,
      currentBottlenecks: profileSummary.currentBottlenecks,
      chineseReviewItems: profileSummary.chineseReviewItems || profile.chineseReviewItems || [],
      nextAction: profileSummary.nextAction,
      latestEffectiveReportId: reportId,
      diagnosisUpdatedAt: new Date(),
      pendingBottlenecks,
      improvedBottlenecks,
      totalReports: _.inc(1),
      analysisStatus: null,
      currentAnalysisId: '',
      updatedAt: new Date(),
    },
  });
}

async function clearSubjectProfileAnalysis(studentId, subject) {
  if (!studentId || !subject) return;
  const profileRes = await db.collection('subjectProfiles')
    .where({ studentId })
    .get();
  const profile = profileRes.data.find(item => item.subject === subject);
  if (!profile) return;

  await db.collection('subjectProfiles').doc(profile._id).update({
    data: {
      analysisStatus: null,
      currentAnalysisId: '',
      updatedAt: new Date(),
    },
  });
}

async function getPreviousReport(studentId, subject, options = {}) {
  const excludeReportIds = new Set((options.excludeReportIds || []).filter(Boolean));
  const res = await db.collection('reports')
    .where({
      studentId,
      subject,
      status: 'completed',
    })
    .orderBy('createdAt', 'desc')
    .limit(20)
    .get();

  return res.data
    .filter(item => !excludeReportIds.has(item._id))
    .filter(item => !item.isArchived && !item.archivedAt)
    .find(item => Array.isArray(item.bottlenecks) && item.bottlenecks.length > 0) || null;
}

async function getHistoricalPhotos(studentId, subject, options = {}) {
  const excludeReportIds = new Set((options.excludeReportIds || []).filter(Boolean));
  const res = await db.collection('reports')
    .where({
      studentId,
      subject,
      status: 'completed',
    })
    .orderBy('createdAt', 'desc')
    .limit(20)
    .get();

  return res.data
    .filter(item => !excludeReportIds.has(item._id))
    .filter(item => !item.isArchived && !item.archivedAt)
    .flatMap(item => Array.isArray(item.imageFiles) ? item.imageFiles : []);
}

async function getVerificationPaper(report) {
  if (!report.paperId) {
    throw new Error('验证报告没有关联验证试卷');
  }
  const paperRes = await db.collection('papers').doc(report.paperId).get();
  const paper = paperRes.data;
  if (!paper || paper.studentId !== report.studentId || (paper._openid && report._openid && paper._openid !== report._openid)) {
    throw new Error('关联验证试卷归属不一致');
  }
  const targets = Array.isArray(paper.bottleneckTargets) ? paper.bottleneckTargets : [];
  if (paper.type !== 'verification' || targets.length === 0) {
    throw new Error('关联验证试卷没有有效学习卡点');
  }
  return { paper, targets, plan: buildVerificationPlan(paper) };
}

// ========== 推送订阅消息（预留，暂未实现 sendSubscribeMessage 云函数） ==========
async function sendNotification(studentId, reportId, subject) {
  // TODO: 订阅消息推送需要用户在小程序前端授权后才能发送。
  // 目前 sendSubscribeMessage 云函数尚未创建，此处仅记录日志，不发起调用。
  return { studentId, reportId, subject };
}

async function getAnalysisTask(taskId) {
  if (!taskId) return null;
  const taskRes = await db.collection('analysisTasks').doc(taskId).get();
  return taskRes.data || null;
}

function taskMatchesReportOwner(task, report, reportId) {
  return Boolean(task
    && report
    && task.reportId === reportId
    && task.status === 'processing'
    && (!report._openid || task._openid === report._openid));
}

async function loadReportContext(reportId, continuationTaskId = '', options = {}) {
  const reportRes = await db.collection('reports').doc(reportId).get();
  const report = reportRes.data;
  const currentOpenId = cloud.getWXContext().OPENID;
  const trustedReanalysis = Boolean(options.trustedReanalysis);

  if (!report) {
    return { earlyResult: { success: false, error: '报告不存在' } };
  }
  if (trustedReanalysis) {
    // Authorized maintenance reanalysis is triggered by an admin script with MATH_REANALYSIS_TOKEN.
  } else if (report._openid && currentOpenId) {
    if (report._openid !== currentOpenId) {
      return { earlyResult: { success: false, error: '无权访问该报告' } };
    }
  } else if (continuationTaskId) {
    const task = await getAnalysisTask(continuationTaskId);
    if (!taskMatchesReportOwner(task, report, reportId)) {
      return { earlyResult: { success: false, error: '无权访问该报告' } };
    }
  } else if (report._openid && !currentOpenId) {
    return { earlyResult: { success: false, error: '无权访问该报告' } };
  }

  const subject = SUBJECTS.has(report.subject) ? report.subject : 'math';
  const studentId = report.studentId;
  const mode = report.type === 'verification' ? 'verification' : 'diagnosis';
  const fileIDs = report.imageFileIds || [];

  return { report, currentOpenId, subject, studentId, mode, fileIDs };
}

async function finishAlreadyCompletedReport(reportId, report, subject) {
  if (report.status !== 'completed') return null;

  if (report.isEffective && !report.profileAppliedAt) {
    const profile = await getSubjectProfile(report.studentId, subject);
    if (profile && profile.latestEffectiveReportId !== reportId) {
      const profileSummary = buildProfileSummary(profile, report, report.completedAt || new Date());
      await updateSubjectProfile(profile, profileSummary, reportId);
    }
    await db.collection('reports').doc(reportId).update({
      data: { profileAppliedAt: new Date() },
    });
  }
  return { success: true, reportId, message: '报告已经分析完成' };
}

async function recoverStaleAnalysisTask(reportId) {
  const existingTasksRes = await db.collection('analysisTasks')
    .where({ reportId })
    .get();
  const existingTasks = existingTasksRes.data
    .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
  const processingTask = existingTasks.find(task => task.status === 'processing');

  if (!processingTask) return null;

  const age = Date.now() - new Date(processingTask.createdAt).getTime();
  if (age < STALE_TASK_MS) {
    return { success: true, reportId, message: '分析任务已经启动' };
  }

  await db.collection('analysisTasks').doc(processingTask._id).update({
    data: {
      status: 'failed',
      error: '分析任务超时，允许重新启动',
      completedAt: new Date(),
    },
  });
  return null;
}

async function createAnalysisTask({ reportId, totalBatches, fileIDs, mode, subject, studentId, openid }) {
  await db.collection('reports').doc(reportId).update({
    data: {
      status: 'analyzing',
      error: '',
      debugError: '',
      partialSuccess: false,
      analysisWarning: '',
      failedBatchCount: 0,
      failedImageFiles: [],
      updatedAt: new Date(),
    },
  });

  const taskRes = await db.collection('analysisTasks').add({
    data: {
      reportId,
      totalBatches,
      completedBatches: 0,
      status: 'processing',
      fileIDs,
      mode,
      subject,
      studentId,
      _openid: openid,
      nextBatchIndex: 0,
      batchResults: [],
      createdAt: new Date(),
      updatedAt: new Date(),
    },
  });
  return taskRes._id;
}

async function loadAnalysisTask(taskId, reportId) {
  if (!taskId) return null;
  const task = await getAnalysisTask(taskId);
  if (!task || task.reportId !== reportId || task.status !== 'processing') {
    throw new Error('分析任务不存在或已结束');
  }
  return task;
}

function mergeStoredBatchResults(storedResults = [], batchResults = [], offset = 0) {
  const merged = Array.isArray(storedResults) ? storedResults.slice() : [];
  batchResults.forEach((result, index) => {
    merged[offset + index] = result;
  });
  return merged;
}

async function persistBatchProgress({ taskId, batchResults, nextBatchIndex }) {
  await db.collection('analysisTasks').doc(taskId).update({
    data: {
      batchResults,
      nextBatchIndex,
      updatedAt: new Date(),
    },
  });
}

function scheduleAnalysisContinuation({ reportId, taskId }) {
  cloud.callFunction({
    name: 'analyzePhotos',
    data: {
      reportId,
      taskId,
      continuation: true,
    },
  }).catch(err => {
    console.error('续跑 analyzePhotos 失败：', err);
  });
}

async function runAnalyzeBatches({ batches, batchOffset = 0, totalBatches, subject, reportId, verificationPaper, taskId }) {
  const batchResults = new Array(batches.length);
  let nextIndex = 0;

  async function runOne(i) {
    const globalIndex = batchOffset + i;
    console.log(`处理第 ${globalIndex + 1}/${totalBatches} 批，共 ${batches[i].length} 张`);
    let lastError = '';
    for (let attempt = 1; attempt <= MAX_BATCH_ATTEMPTS; attempt += 1) {
      try {
        const res = await cloud.callFunction({
          name: 'analyzeBatch',
          data: {
            fileIDs: batches[i],
            subject,
            batchIndex: globalIndex,
            reportId,
            taskId,
            verificationPlan: verificationPaper ? verificationPaper.plan : [],
          },
        });
        const result = res.result || { success: false, error: '图片分析失败，请稍后重试' };
        if (result.success || attempt === MAX_BATCH_ATTEMPTS) {
          batchResults[i] = attempt > 1 && result.success
            ? { ...result, retryAttempt: attempt }
            : result;
          break;
        }
        lastError = analysisErrorMessage(result.error);
        console.warn(`第 ${globalIndex + 1} 批第 ${attempt} 次返回失败，准备重试：${lastError}`);
      } catch (err) {
        lastError = analysisErrorMessage(err);
        console.error(`第 ${globalIndex + 1} 批第 ${attempt} 次处理失败：`, err);
        if (attempt === MAX_BATCH_ATTEMPTS) {
          batchResults[i] = { success: false, error: lastError };
          break;
        }
      }
      await wait(BATCH_RETRY_DELAY_MS);
    }

    if (!batchResults[i]) {
      batchResults[i] = { success: false, error: lastError || '图片分析失败，请稍后重试' };
    }
    await db.collection('analysisTasks').doc(taskId).update({
      data: { completedBatches: _.inc(1) },
    }).catch(err => {
      console.error('更新分析进度失败：', err);
    });
  }

  async function worker() {
    while (nextIndex < batches.length) {
      const i = nextIndex;
      nextIndex += 1;
      await runOne(i);
    }
  }

  const workerCount = Math.min(MAX_CONCURRENT_BATCHES, batches.length);
  await Promise.all(Array.from({ length: workerCount }, () => worker()));
  return batchResults;
}

async function buildAnalysisArtifacts({ reportId, report, fileIDs, batches, subject, studentId, mode, verificationPaper, batchResults }) {
  assertUsableBatchResults(batchResults);

  const pageResults = collectPageResults(batchResults);
  const failedBatches = batchFailureSummary(batchResults, batches);
  const failedImageFiles = failedBatches.flatMap(item => item.fileIDs.map(fileID => ({
    fileID,
    batchIndex: item.batchIndex,
    error: item.error,
  })));
  const historicalPhotos = await getHistoricalPhotos(studentId, subject, {
    excludeReportIds: [reportId, ...reanalysisSourceReportIds(report)],
  });
  const markedPages = markDuplicatePages(pageResults, historicalPhotos);
  const uniquePages = markedPages.filter(page => !page.isDuplicate);
  const merged = mergeBatchResults(
    uniquePages.map(page => ({ success: true, data: page })),
    subject
  );
  const imageFiles = buildImageFiles({
    fileIDs,
    initialImageFiles: Array.isArray(report.imageFiles) ? report.imageFiles : [],
    markedPages,
    report: { ...report, failedImageFiles },
  });
  let previousReport = null;
  let verificationTargets = [];
  let comparisonSummary = '';
  const partialSuccess = failedBatches.length > 0;
  const analysisWarning = partialSuccess
    ? `${fileIDs.length - failedImageFiles.length}/${fileIDs.length} 张照片完成分析，${failedImageFiles.length} 张照片因超时或服务异常未纳入。`
    : '';

  if (uniquePages.length === 0) {
    merged.summary = '本次照片均疑似重复，未更新学习卡点';
    comparisonSummary = '本次照片均疑似重复，未更新学习卡点。';
  } else if (mode === 'verification') {
    previousReport = await getPreviousReport(studentId, subject, {
      excludeReportIds: [reportId, ...reanalysisSourceReportIds(report)],
    });
    verificationTargets = verificationPaper.targets;
    const verificationEvidence = aggregateVerificationEvidence(verificationPaper.plan, uniquePages);
    const passedCodes = verificationEvidence.filter(item => item.evidenceStatus === 'passed').map(item => item.lpCode);
    merged.bottlenecks = compareBottlenecks(
      previousReport ? previousReport.bottlenecks : [],
      merged.bottlenecks,
      passedCodes
    );
    comparisonSummary = buildComparisonSummary(merged.bottlenecks);
    merged.verificationEvidence = verificationEvidence;
    merged.chineseReviewEvidence = aggregateChineseReviewEvidence(verificationPaper.plan, uniquePages);
    merged.verificationPageEvidence = buildVerificationPageEvidence(uniquePages);
    merged.verificationPageCodes = merged.verificationPageEvidence.map(item => item.pageCode);
  } else {
    merged.bottlenecks = merged.bottlenecks.map(item => ({ ...item, status: 'found' }));
  }

  const quality = buildReportQuality({
    report,
    uniquePages,
    merged,
    failedBatches,
    verificationEvidence: merged.verificationEvidence || [],
    allPhotosDuplicate: uniquePages.length === 0,
  });

  const profile = await getSubjectProfile(studentId, subject);
  const profileSummary = buildProfileSummary(profile || {}, {
    _id: reportId,
    type: mode,
    totalErrors: merged.totalErrors,
    bottlenecks: merged.bottlenecks,
    chineseErrorItems: merged.chineseErrorItems || [],
    verificationTargets,
    verificationEvidence: merged.verificationEvidence || [],
    chineseReviewEvidence: merged.chineseReviewEvidence || [],
    allPhotosDuplicate: uniquePages.length === 0,
  }, report.evidenceTime || report.createdAt || new Date());
  if (quality.status === 'insufficient') {
    profileSummary.isEffective = false;
    profileSummary.changeSummary = quality.reasons[0] || '本次样本不足，未更新学习卡点';
  }

  return {
    merged,
    quality,
    imageFiles,
    previousReport,
    comparisonSummary,
    verificationTargets,
    profile,
    profileSummary,
    partialSuccess,
    analysisWarning,
    failedBatches,
    failedImageFiles,
  };
}

function buildVerificationPageEvidence(pages = []) {
  const byPageCode = new Map();
  for (const page of pages || []) {
    const evidenceItems = Array.isArray(page.verificationEvidence) ? page.verificationEvidence : [];
    const pageCodeFromPage = page.pageCode || '';
    if (pageCodeFromPage && !byPageCode.has(pageCodeFromPage)) {
      byPageCode.set(pageCodeFromPage, {
        pageCode: pageCodeFromPage,
        fileIDs: new Set(),
        targetIds: new Set(),
        attemptedQuestionCount: 0,
        incorrectQuestionCount: 0,
        blankQuestionCount: 0,
        unclearQuestionCount: 0,
        missingQuestionCount: 0,
      });
    }

    for (const evidence of evidenceItems) {
      const pageCode = evidence.pageCode || pageCodeFromPage;
      if (!pageCode) continue;
      if (!byPageCode.has(pageCode)) {
        byPageCode.set(pageCode, {
          pageCode,
          fileIDs: new Set(),
          targetIds: new Set(),
          attemptedQuestionCount: 0,
          incorrectQuestionCount: 0,
          blankQuestionCount: 0,
          unclearQuestionCount: 0,
          missingQuestionCount: 0,
        });
      }
      const total = byPageCode.get(pageCode);
      if (page.fileID) total.fileIDs.add(page.fileID);
      const targetId = evidence.targetId || evidence.lpCode || '';
      if (targetId) total.targetIds.add(targetId);
      total.attemptedQuestionCount += Math.max(0, Number(evidence.attemptedQuestionCount) || 0);
      total.incorrectQuestionCount += Math.max(0, Number(evidence.incorrectQuestionCount) || 0);
      total.blankQuestionCount += Math.max(0, Number(evidence.blankQuestionCount) || 0);
      total.unclearQuestionCount += Math.max(0, Number(evidence.unclearQuestionCount) || 0);
      total.missingQuestionCount += Math.max(0, Number(evidence.missingQuestionCount) || 0);
    }

    if (pageCodeFromPage && page.fileID) {
      byPageCode.get(pageCodeFromPage).fileIDs.add(page.fileID);
    }
  }

  return Array.from(byPageCode.values()).map(item => ({
    ...item,
    fileIDs: Array.from(item.fileIDs),
    targetIds: Array.from(item.targetIds),
  }));
}

async function writeCompletedAnalysis({ reportId, studentId, subject, merged, quality, imageFiles, previousReport, comparisonSummary, verificationTargets, profile, profileSummary, partialSuccess, analysisWarning, failedBatches, failedImageFiles }) {
  await db.collection('reports').doc(reportId).update({
    data: {
      status: 'completed',
      error: '',
      summary: merged.summary,
      totalErrors: merged.totalErrors,
      bottlenecks: merged.bottlenecks,
      errorDetails: merged.errorDetails,
      chineseErrorItems: merged.chineseErrorItems || [],
      imageFiles,
      previousReportId: previousReport ? previousReport._id : '',
      comparisonSummary,
      verificationTargets,
      verificationEvidence: merged.verificationEvidence || [],
      chineseReviewEvidence: merged.chineseReviewEvidence || [],
      verificationPageCodes: merged.verificationPageCodes || [],
      verificationPageEvidence: merged.verificationPageEvidence || [],
      quality,
      isEffective: profileSummary.isEffective,
      changeSummary: profileSummary.changeSummary,
      partialSuccess,
      analysisWarning,
      failedBatchCount: failedBatches.length,
      failedImageFiles,
      debugError: partialSuccess ? failedBatchDebugMessage(failedBatches) : '',
      completedAt: merged.completedAt,
    },
  });

  if (profileSummary.isEffective) {
    await updateSubjectProfile(profile, profileSummary, reportId);
    await db.collection('reports').doc(reportId).update({
      data: { profileAppliedAt: new Date() },
    });
  } else {
    await clearSubjectProfileAnalysis(studentId, subject);
  }
}

async function markAnalysisTaskCompleted(taskId, artifacts = {}) {
  await db.collection('analysisTasks').doc(taskId).update({
    data: {
      status: 'completed',
      partialSuccess: Boolean(artifacts.partialSuccess),
      warning: artifacts.analysisWarning || '',
      failedBatchCount: artifacts.failedBatches ? artifacts.failedBatches.length : 0,
      completedAt: new Date(),
    },
  });
}

// ========== 主函数 ==========
exports.main = async (event) => {
  const { reportId, taskId: continuationTaskId } = event;
  let taskId = '';
  let report = null;

  if (!reportId) {
    return { success: false, error: '缺少 reportId' };
  }

  try {
    const context = await loadReportContext(reportId, continuationTaskId, {
      trustedReanalysis: isTrustedReanalysisRequest(event),
    });
    if (context.earlyResult) return context.earlyResult;

    ({ report } = context);
    const { currentOpenId, fileIDs, subject, studentId, mode } = context;

    const completedResult = await finishAlreadyCompletedReport(reportId, report, subject);
    if (completedResult) return completedResult;

    const verificationPaper = mode === 'verification' ? await getVerificationPaper(report) : null;
    if (fileIDs.length === 0) {
      return { success: false, error: '报告中没有待分析图片' };
    }

    const batches = splitFileBatches(fileIDs, ANALYSIS_BATCH_SIZE);
    const totalBatches = batches.length;
    console.log(`共 ${fileIDs.length} 张图片，拆分为 ${totalBatches} 批`);

    let task = null;
    if (continuationTaskId) {
      task = await loadAnalysisTask(continuationTaskId, reportId);
      taskId = task._id;
    } else {
      const activeTaskResult = await recoverStaleAnalysisTask(reportId);
      if (activeTaskResult) return activeTaskResult;

      taskId = await createAnalysisTask({
        reportId,
        totalBatches,
        fileIDs,
        mode,
        subject,
        studentId,
        openid: report._openid || currentOpenId,
      });
      task = { _id: taskId, batchResults: [], nextBatchIndex: 0 };
    }

    const startBatchIndex = Math.max(0, Number(task.nextBatchIndex) || 0);
    const runBatches = batches.slice(startBatchIndex, startBatchIndex + MAX_BATCHES_PER_INVOCATION);
    if (runBatches.length === 0 && startBatchIndex < totalBatches) {
      throw new Error('分析任务批次进度异常');
    }

    const batchResults = await runAnalyzeBatches({
      batches: runBatches,
      batchOffset: startBatchIndex,
      totalBatches,
      subject,
      reportId,
      verificationPaper,
      taskId,
    });
    const allBatchResults = mergeStoredBatchResults(task.batchResults, batchResults, startBatchIndex);
    const nextBatchIndex = startBatchIndex + runBatches.length;

    await persistBatchProgress({
      taskId,
      batchResults: allBatchResults,
      nextBatchIndex,
    });

    if (nextBatchIndex < totalBatches) {
      scheduleAnalysisContinuation({ reportId, taskId });
      return {
        success: true,
        reportId,
        status: 'processing',
        message: `已完成 ${nextBatchIndex}/${totalBatches} 批，继续分析中`,
      };
    }

    const artifacts = await buildAnalysisArtifacts({
      reportId,
      report,
      fileIDs,
      batches,
      subject,
      studentId,
      mode,
      verificationPaper,
      batchResults: allBatchResults,
    });

    await writeCompletedAnalysis({
      reportId,
      studentId,
      subject,
      ...artifacts,
    });

    await markAnalysisTaskCompleted(taskId, artifacts);

    sendNotification(studentId, reportId, subject).catch(err => console.error('推送异常：', err));

    return {
      success: true,
      reportId,
      totalErrors: artifacts.merged.totalErrors,
      bottleneckCount: artifacts.merged.bottlenecks.length,
      summary: artifacts.merged.summary,
      partialSuccess: artifacts.partialSuccess,
      warning: artifacts.analysisWarning,
    };
  } catch (err) {
    console.error('analyzePhotos 失败：', err);
    const debugError = analysisErrorMessage(err);

    // 更新 reports 状态为 failed
    if (reportId) {
      await db.collection('reports').doc(reportId).update({
        data: { status: 'failed', error: '图片分析失败，请稍后重试', debugError, updatedAt: new Date() },
      }).catch(() => {});
    }
    if (taskId) {
      await db.collection('analysisTasks').doc(taskId).update({
        data: { status: 'failed', error: debugError, completedAt: new Date() },
      }).catch(() => {});
    }
    if (report) {
      await clearSubjectProfileAnalysis(report.studentId, report.subject).catch(() => {});
    }

    return { success: false, error: '图片分析失败，请稍后重试', reportId };
  }
};

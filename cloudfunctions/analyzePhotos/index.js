// analyzePhotos/index.js
// 主控函数：拆分单图批次、严格串行续跑 analyzeBatch、合并结果、更新数据库、推送通知
const cloud = require('wx-server-sdk');
const { compareBottlenecks, buildComparisonSummary } = require('./comparison');
const { markDuplicatePages } = require('./photo-dedup');
const { buildProfileSummary } = require('./profile-summary');
const { aggregateVerificationEvidence, buildVerificationPlan } = require('./verification-evidence');
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
const BATCH_RETRY_DELAY_MS = 600;

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
    }));
  const improvedBottlenecks = profileSummary.currentBottlenecks
    .filter(item => item.status === 'improved')
    .map(item => ({
      lpCode: item.lpCode,
      lpName: item.lpName,
      improvedDate: item.lastSeenAt || new Date(),
    }));

  await db.collection('subjectProfiles').doc(profile._id).update({
    data: {
      currentSummary: profileSummary.currentSummary,
      currentBottlenecks: profileSummary.currentBottlenecks,
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

async function getPreviousReport(studentId, subject) {
  const res = await db.collection('reports')
    .where({
      studentId,
      subject,
      status: 'completed',
    })
    .orderBy('createdAt', 'desc')
    .limit(20)
    .get();

  return res.data.find(item => Array.isArray(item.bottlenecks) && item.bottlenecks.length > 0) || null;
}

async function getHistoricalPhotos(studentId, subject) {
  const res = await db.collection('reports')
    .where({
      studentId,
      subject,
      status: 'completed',
    })
    .orderBy('createdAt', 'desc')
    .limit(20)
    .get();

  return res.data.flatMap(item => Array.isArray(item.imageFiles) ? item.imageFiles : []);
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

async function loadReportContext(reportId) {
  const reportRes = await db.collection('reports').doc(reportId).get();
  const report = reportRes.data;
  const currentOpenId = cloud.getWXContext().OPENID;

  if (!report) {
    return { earlyResult: { success: false, error: '报告不存在' } };
  }
  if (report._openid && currentOpenId && report._openid !== currentOpenId) {
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
  const taskRes = await db.collection('analysisTasks').doc(taskId).get();
  const task = taskRes.data;
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
    }).catch(() => {});
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
  const historicalPhotos = await getHistoricalPhotos(studentId, subject);
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
    previousReport = await getPreviousReport(studentId, subject);
    verificationTargets = verificationPaper.targets;
    const verificationEvidence = aggregateVerificationEvidence(verificationPaper.plan, uniquePages);
    const passedCodes = verificationEvidence.filter(item => item.complete && item.allCorrect).map(item => item.lpCode);
    merged.bottlenecks = compareBottlenecks(
      previousReport ? previousReport.bottlenecks : [],
      merged.bottlenecks,
      passedCodes
    );
    comparisonSummary = buildComparisonSummary(merged.bottlenecks);
    merged.verificationEvidence = verificationEvidence;
  } else {
    merged.bottlenecks = merged.bottlenecks.map(item => ({ ...item, status: 'found' }));
  }

  const profile = await getSubjectProfile(studentId, subject);
  const profileSummary = buildProfileSummary(profile || {}, {
    _id: reportId,
    type: mode,
    totalErrors: merged.totalErrors,
    bottlenecks: merged.bottlenecks,
    verificationTargets,
    verificationEvidence: merged.verificationEvidence || [],
    allPhotosDuplicate: uniquePages.length === 0,
  }, report.evidenceTime || report.createdAt || new Date());

  return {
    merged,
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

async function writeCompletedAnalysis({ reportId, studentId, subject, merged, imageFiles, previousReport, comparisonSummary, verificationTargets, profile, profileSummary, partialSuccess, analysisWarning, failedBatches, failedImageFiles }) {
  await db.collection('reports').doc(reportId).update({
    data: {
      status: 'completed',
      error: '',
      summary: merged.summary,
      totalErrors: merged.totalErrors,
      bottlenecks: merged.bottlenecks,
      errorDetails: merged.errorDetails,
      imageFiles,
      previousReportId: previousReport ? previousReport._id : '',
      comparisonSummary,
      verificationTargets,
      verificationEvidence: merged.verificationEvidence || [],
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
    const context = await loadReportContext(reportId);
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

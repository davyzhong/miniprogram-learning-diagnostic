// analyzePhotos/index.js
// 主控函数：拆分批次、串行调用 analyzeBatch、合并结果、更新数据库、推送通知
const cloud = require('wx-server-sdk');
const { compareBottlenecks, buildComparisonSummary } = require('./comparison');
const { markDuplicatePages } = require('./photo-dedup');
const { buildProfileSummary } = require('./profile-summary');
const { aggregateVerificationEvidence, buildVerificationPlan } = require('./verification-evidence');
const {
  splitFileBatches,
  assertCompleteBatchResults,
  collectPageResults,
  mergeBatchResults,
  buildImageFiles,
} = require('./pipeline');

cloud.init({ env: cloud.SYMBOL_CURRENT_ENV });
const db = cloud.database();
const _ = db.command;
const SUBJECTS = new Set(['math', 'chinese', 'english']);
const STALE_TASK_MS = 10 * 60 * 1000;

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
      createdAt: new Date(),
    },
  });
  return taskRes._id;
}

async function runAnalyzeBatches({ batches, totalBatches, subject, reportId, verificationPaper, taskId }) {
  const batchResults = [];
  for (let i = 0; i < batches.length; i++) {
    console.log(`处理第 ${i + 1}/${totalBatches} 批，共 ${batches[i].length} 张`);
    try {
      const res = await cloud.callFunction({
        name: 'analyzeBatch',
        data: {
          fileIDs: batches[i],
          subject,
          batchIndex: i,
          reportId,
          verificationPlan: verificationPaper ? verificationPaper.plan : [],
        },
      });
      batchResults.push(res.result);

      await db.collection('analysisTasks').doc(taskId).update({
        data: { completedBatches: i + 1 },
      });
    } catch (err) {
      console.error(`第 ${i + 1} 批处理失败：`, err);
      batchResults.push({ success: false, error: err.message });
    }
  }
  return batchResults;
}

async function buildAnalysisArtifacts({ reportId, report, fileIDs, subject, studentId, mode, verificationPaper, batchResults }) {
  assertCompleteBatchResults(batchResults);

  const pageResults = collectPageResults(batchResults);
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
    report,
  });
  let previousReport = null;
  let verificationTargets = [];
  let comparisonSummary = '';

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
  };
}

async function writeCompletedAnalysis({ reportId, studentId, subject, merged, imageFiles, previousReport, comparisonSummary, verificationTargets, profile, profileSummary }) {
  await db.collection('reports').doc(reportId).update({
    data: {
      status: 'completed',
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

async function markAnalysisTaskCompleted(taskId) {
  await db.collection('analysisTasks').doc(taskId).update({
    data: { status: 'completed', completedAt: new Date() },
  });
}

// ========== 主函数 ==========
exports.main = async (event) => {
  const { reportId } = event;
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

    const activeTaskResult = await recoverStaleAnalysisTask(reportId);
    if (activeTaskResult) return activeTaskResult;

    const batches = splitFileBatches(fileIDs);
    const totalBatches = batches.length;
    console.log(`共 ${fileIDs.length} 张图片，拆分为 ${totalBatches} 批`);

    taskId = await createAnalysisTask({
      reportId,
      totalBatches,
      fileIDs,
      mode,
      subject,
      studentId,
      openid: report._openid || currentOpenId,
    });

    const batchResults = await runAnalyzeBatches({
      batches,
      totalBatches,
      subject,
      reportId,
      verificationPaper,
      taskId,
    });
    const artifacts = await buildAnalysisArtifacts({
      reportId,
      report,
      fileIDs,
      subject,
      studentId,
      mode,
      verificationPaper,
      batchResults,
    });

    await writeCompletedAnalysis({
      reportId,
      studentId,
      subject,
      ...artifacts,
    });

    await markAnalysisTaskCompleted(taskId);

    sendNotification(studentId, reportId, subject).catch(err => console.error('推送异常：', err));

    return {
      success: true,
      reportId,
      totalErrors: artifacts.merged.totalErrors,
      bottleneckCount: artifacts.merged.bottlenecks.length,
      summary: artifacts.merged.summary,
    };
  } catch (err) {
    console.error('analyzePhotos 失败：', err);

    // 更新 reports 状态为 failed
    if (reportId) {
      await db.collection('reports').doc(reportId).update({
        data: { status: 'failed', error: '图片分析失败，请稍后重试', updatedAt: new Date() },
      }).catch(() => {});
    }
    if (taskId) {
      await db.collection('analysisTasks').doc(taskId).update({
        data: { status: 'failed', error: '图片分析失败，请稍后重试', completedAt: new Date() },
      }).catch(() => {});
    }
    if (report) {
      await clearSubjectProfileAnalysis(report.studentId, report.subject).catch(() => {});
    }

    return { success: false, error: '图片分析失败，请稍后重试', reportId };
  }
};

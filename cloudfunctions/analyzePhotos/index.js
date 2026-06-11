// analyzePhotos/index.js
// 主控函数：拆分批次、串行调用 analyzeBatch、合并结果、更新数据库、推送通知
const cloud = require('wx-server-sdk');
const { compareBottlenecks, buildComparisonSummary } = require('./comparison');

cloud.init({ env: cloud.SYMBOL_CURRENT_ENV });
const db = cloud.database();
const _ = db.command;
const SUBJECTS = new Set(['math', 'chinese', 'english']);
const STALE_TASK_MS = 10 * 60 * 1000;

// ========== 合并多批次结果 ==========
function mergeBatchResults(batchResults, subject) {
  const allBottlenecks = {};
  const allErrorDetails = [];
  let totalErrors = 0;

  for (const batch of batchResults) {
    if (!batch.success) {
      console.warn('批次失败：', batch.error);
      continue;
    }
    const data = batch.data;
    totalErrors += data.totalErrors || 0;

    // 合并 bottlenecks（按 lpCode 聚合）
    for (const bn of data.bottlenecks || []) {
      const key = bn.lpCode;
      if (allBottlenecks[key]) {
        allBottlenecks[key].errorCount += bn.errorCount;
        // severity 取最高的
        const severityRank = { high: 3, medium: 2, low: 1 };
        if (severityRank[bn.severity] > severityRank[allBottlenecks[key].severity]) {
          allBottlenecks[key].severity = bn.severity;
        }
      } else {
        allBottlenecks[key] = { ...bn };
      }
    }

    // 合并 errorDetails
    if (data.errorDetails) {
      allErrorDetails.push(...data.errorDetails);
    }
  }

  // 转成数组，按 errorCount 降序
  const bottlenecks = Object.values(allBottlenecks)
    .sort((a, b) => b.errorCount - a.errorCount);

  // 生成 summary
  const topBottlenecks = bottlenecks.slice(0, 3).map(b => b.lpName).join('、');
  const summary = `共发现 ${totalErrors} 道错题，主要卡点：${topBottlenecks || '待确认'}`;

  return {
    summary,
    totalErrors,
    bottlenecks,
    errorDetails: allErrorDetails,
    completedAt: new Date(),
  };
}

// ========== 更新 subjectProfiles ==========
async function updateSubjectProfile(studentId, subject, mergedResult, mode) {
  const profileRes = await db.collection('subjectProfiles')
    .where({ studentId })
    .get();
  const profile = profileRes.data.find(item => item.subject === subject);

  if (!profile) {
    console.warn('未找到 subjectProfile：', studentId, subject);
    return;
  }

  const pendingByCode = new Map(
    (profile.pendingBottlenecks || []).map(item => [item.lpCode, { ...item }])
  );
  const improvedByCode = new Map(
    (profile.improvedBottlenecks || []).map(item => [item.lpCode, { ...item }])
  );

  for (const bn of mergedResult.bottlenecks || []) {
    if (mode === 'verification' && bn.status === 'improved') {
      improvedByCode.set(bn.lpCode, {
        lpCode: bn.lpCode,
        lpName: bn.lpName,
        improvedDate: new Date(),
      });
      if ((Number(bn.errorCount) || 0) === 0) {
        pendingByCode.delete(bn.lpCode);
        continue;
      }
    }

    if (!pendingByCode.has(bn.lpCode)) {
      pendingByCode.set(bn.lpCode, {
        lpCode: bn.lpCode,
        lpName: bn.lpName,
        severity: bn.severity,
        sinceDate: new Date(),
      });
    }
  }

  await db.collection('subjectProfiles').doc(profile._id).update({
    data: {
      pendingBottlenecks: Array.from(pendingByCode.values()),
      improvedBottlenecks: Array.from(improvedByCode.values()),
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
    .limit(1)
    .get();

  return res.data[0] || null;
}

async function getVerificationTargets(report) {
  if (!report.paperId) return [];
  const paperRes = await db.collection('papers').doc(report.paperId).get();
  const paper = paperRes.data;
  if (!paper || paper.studentId !== report.studentId || (paper._openid && report._openid && paper._openid !== report._openid)) {
    throw new Error('关联验证试卷归属不一致');
  }
  return Array.isArray(paper.bottleneckTargets) ? paper.bottleneckTargets : [];
}

// ========== 推送订阅消息（预留，暂未实现 sendSubscribeMessage 云函数） ==========
async function sendNotification(studentId, reportId, subject) {
  // TODO: 订阅消息推送需要用户在小程序前端授权后才能发送。
  // 目前 sendSubscribeMessage 云函数尚未创建，此处仅记录日志，不发起调用。
  return { studentId, reportId, subject };
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
    const reportRes = await db.collection('reports').doc(reportId).get();
    report = reportRes.data;
    const currentOpenId = cloud.getWXContext().OPENID;

    if (!report) {
      return { success: false, error: '报告不存在' };
    }
    if (report._openid && currentOpenId && report._openid !== currentOpenId) {
      return { success: false, error: '无权访问该报告' };
    }

    const fileIDs = report.imageFileIds || [];
    const subject = SUBJECTS.has(report.subject) ? report.subject : 'math';
    const studentId = report.studentId;
    const mode = report.type === 'verification' ? 'verification' : 'diagnosis';

    if (fileIDs.length === 0) {
      return { success: false, error: '报告中没有待分析图片' };
    }
    if (report.status === 'completed') {
      return { success: true, reportId, message: '报告已经分析完成' };
    }

    const existingTasksRes = await db.collection('analysisTasks')
      .where({ reportId })
      .get();
    const existingTasks = existingTasksRes.data
      .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
    const processingTask = existingTasks.find(task => task.status === 'processing');
    if (processingTask) {
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
    }

    // 1. 拆分批次（每批最多 5 张）
    const batchSize = 5;
    const batches = [];
    for (let i = 0; i < fileIDs.length; i += batchSize) {
      batches.push(fileIDs.slice(i, i + batchSize));
    }

    const totalBatches = batches.length;
    console.log(`共 ${fileIDs.length} 张图片，拆分为 ${totalBatches} 批`);

    // 2. 创建 analysisTasks 记录
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
        _openid: report._openid || currentOpenId,
        createdAt: new Date(),
      },
    });
    taskId = taskRes._id;

    // 3. 串行处理每个批次
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
          },
        });
        batchResults.push(res.result);

        // 更新 completedBatches
        await db.collection('analysisTasks').doc(taskId).update({
          data: { completedBatches: i + 1 },
        });
      } catch (err) {
        console.error(`第 ${i + 1} 批处理失败：`, err);
        batchResults.push({ success: false, error: err.message });
      }
    }
    if (batchResults.some(result => !result || !result.success)) {
      throw new Error('存在未完成的图片分析批次');
    }

    // 4. 合并结果
    const merged = mergeBatchResults(batchResults, subject);
    let previousReport = null;
    let comparisonSummary = '';

    if (mode === 'verification') {
      previousReport = await getPreviousReport(studentId, subject);
      const verificationTargets = await getVerificationTargets(report);
      merged.bottlenecks = compareBottlenecks(
        previousReport ? previousReport.bottlenecks : [],
        merged.bottlenecks,
        verificationTargets
      );
      comparisonSummary = buildComparisonSummary(merged.bottlenecks);
    } else {
      merged.bottlenecks = merged.bottlenecks.map(item => ({ ...item, status: 'found' }));
    }

    // 5. 更新 reports 集合
    await db.collection('reports').doc(reportId).update({
      data: {
        status: 'completed',
        summary: merged.summary,
        totalErrors: merged.totalErrors,
        bottlenecks: merged.bottlenecks,
        errorDetails: merged.errorDetails,
        previousReportId: previousReport ? previousReport._id : '',
        comparisonSummary,
        completedAt: merged.completedAt,
      },
    });

    // 6. 更新 subjectProfiles
    await updateSubjectProfile(studentId, subject, merged, mode);

    // 7. 更新 analysisTasks 状态
    await db.collection('analysisTasks').doc(taskId).update({
      data: { status: 'completed', completedAt: new Date() },
    });

    // 8. 推送订阅消息（异步，不阻塞返回）
    sendNotification(studentId, reportId, subject).catch(err => console.error('推送异常：', err));

    return {
      success: true,
      reportId,
      totalErrors: merged.totalErrors,
      bottleneckCount: merged.bottlenecks.length,
      summary: merged.summary,
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

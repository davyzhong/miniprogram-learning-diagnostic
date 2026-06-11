// analyzePhotos/index.js
// 主控函数：拆分批次、串行调用 analyzeBatch、合并结果、更新数据库、推送通知
const cloud = require('wx-server-sdk');

cloud.init({ env: cloud.SYMBOL_CURRENT_ENV });
const db = cloud.database();
const _ = db.command;

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
async function updateSubjectProfile(studentId, subject, mergedResult) {
  const profileRes = await db.collection('subjectProfiles')
    .where({ studentId, subject })
    .get();

  if (profileRes.data.length === 0) {
    console.warn('未找到 subjectProfile：', studentId, subject);
    return;
  }

  const profile = profileRes.data[0];
  const pending = profile.pendingBottlenecks || [];
  const newBottlenecks = mergedResult.bottlenecks || [];

  // 合并 pendingBottlenecks（新发现的卡点加入 pending）
  for (const bn of newBottlenecks) {
    const exists = pending.find(p => p.lpCode === bn.lpCode);
    if (!exists) {
      pending.push({
        lpCode: bn.lpCode,
        lpName: bn.lpName,
        severity: bn.severity,
        sinceDate: new Date(),
      });
    }
  }

  await db.collection('subjectProfiles').doc(profile._id).update({
    data: {
      pendingBottlenecks: pending,
      analysisStatus: null,
      updatedAt: new Date(),
    },
  });
}

// ========== 推送订阅消息（预留，暂未实现 sendSubscribeMessage 云函数） ==========
async function sendNotification(studentId, reportId, subject) {
  // TODO: 订阅消息推送需要用户在小程序前端授权后才能发送。
  // 目前 sendSubscribeMessage 云函数尚未创建，此处仅记录日志，不发起调用。
  const subjectName = { math: '数学', chinese: '语文', english: '英语' }[subject] || '数学';
  console.log(`[sendNotification] 分析完成通知（待实现）：studentId=${studentId}, reportId=${reportId}, subject=${subjectName}`);
}

// ========== 主函数 ==========
exports.main = async (event) => {
  const { reportId, fileIDs, subject = 'math', studentId, mode = 'diagnosis' } = event;

  if (!reportId || !fileIDs || !Array.isArray(fileIDs)) {
    return { success: false, error: '参数错误：需要 reportId 和 fileIDs 数组' };
  }

  try {
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
        createdAt: new Date(),
      },
    });
    const taskId = taskRes._id;

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

    // 4. 合并结果
    const merged = mergeBatchResults(batchResults, subject);

    // 5. 更新 reports 集合
    await db.collection('reports').doc(reportId).update({
      data: {
        status: 'completed',
        summary: merged.summary,
        totalErrors: merged.totalErrors,
        bottlenecks: merged.bottlenecks,
        errorDetails: merged.errorDetails,
        completedAt: merged.completedAt,
      },
    });

    // 6. 更新 subjectProfiles
    await updateSubjectProfile(studentId, subject, merged);

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
        data: { status: 'failed', error: err.message, updatedAt: new Date() },
      }).catch(() => {});
    }

    return { success: false, error: err.message, reportId };
  }
};

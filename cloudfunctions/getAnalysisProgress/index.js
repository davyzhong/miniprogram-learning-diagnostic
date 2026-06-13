// getAnalysisProgress/index.js
// 轻量查询函数：返回 analysisTasks 中的进度信息
const cloud = require('wx-server-sdk');
const { getLearningResourceAccess, canReadLearning } = require('../_shared/access');

cloud.init({ env: cloud.SYMBOL_CURRENT_ENV });
const db = cloud.database();

exports.main = async (event) => {
  const { reportId } = event;

  if (!reportId) {
    return { success: false, error: '缺少 reportId' };
  }

  try {
    const currentOpenId = cloud.getWXContext().OPENID;
    const reportRes = await db.collection('reports').doc(reportId).get();
    const report = reportRes.data;
    if (!report) {
      return { success: false, error: '报告不存在' };
    }
    const access = await getLearningResourceAccess(db, report, currentOpenId);
    if (!canReadLearning(access)) {
      return { success: false, error: '无权访问该报告' };
    }

    const taskRes = await db.collection('analysisTasks')
      .where({ reportId })
      .get();

    if (taskRes.data.length === 0) {
      return { success: false, error: '未找到分析任务' };
    }

    const task = taskRes.data
      .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())[0];
    return {
      success: true,
      reportId,
      status: task.status,
      completedBatches: task.completedBatches || 0,
      totalBatches: task.totalBatches || 0,
      createdAt: task.createdAt,
    };
  } catch (err) {
    console.error('getAnalysisProgress 失败：', err);
    return { success: false, error: '获取分析进度失败，请稍后重试' };
  }
};

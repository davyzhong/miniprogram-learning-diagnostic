// getAnalysisProgress/index.js
// 轻量查询函数：返回 analysisTasks 中的进度信息
const cloud = require('wx-server-sdk');

cloud.init({ env: cloud.SYMBOL_CURRENT_ENV });
const db = cloud.database();

exports.main = async (event) => {
  const { reportId } = event;

  if (!reportId) {
    return { success: false, error: '缺少 reportId' };
  }

  try {
    const taskRes = await db.collection('analysisTasks')
      .where({ reportId })
      .limit(1)
      .get();

    if (taskRes.data.length === 0) {
      return { success: false, error: '未找到分析任务' };
    }

    const task = taskRes.data[0];
    return {
      success: true,
      reportId,
      status: task.status,
      completedBatches: task.completedBatches || 0,
      totalBatches: task.totalBatches || 0,
    };
  } catch (err) {
    return { success: false, error: err.message };
  }
};

// uploadAndAnalyze/index.js
// 入口函数：接收fileIDs，创建reports记录，触发后台分析
const cloud = require('wx-server-sdk');

cloud.init({ env: cloud.SYMBOL_CURRENT_ENV });
const db = cloud.database();

// ========== 主函数 ==========
exports.main = async (event, context) => {
  console.log('[uploadAndAnalyze] 收到事件：', JSON.stringify(event));

  const { fileIDs, studentId, subject = 'math', mode = 'diagnosis', paperId = '' } = event;

  if (!fileIDs || !Array.isArray(fileIDs) || fileIDs.length === 0) {
    console.error('[uploadAndAnalyze] fileIDs 无效：', fileIDs);
    return { success: false, error: 'fileIDs 不能为空' };
  }

  if (!studentId) {
    console.error('[uploadAndAnalyze] studentId 为空');
    return { success: false, error: '缺少 studentId' };
  }

  try {
    // 1. 获取学生信息（用于报告显示）
    console.log('[uploadAndAnalyze] 查询学生：', studentId);
    let studentName = '未知学生';
    try {
      const studentRes = await db.collection('students').doc(studentId).get();
      if (studentRes.data) {
        studentName = studentRes.data.name || '未知学生';
        console.log('[uploadAndAnalyze] 找到学生：', studentName);
      }
    } catch (e) {
      console.warn('[uploadAndAnalyze] 未找到学生记录，继续创建报告：', e.message);
      // 不中断流程，继续创建报告
    }

    // 2. 创建 reports 记录（status='analyzing'）
    console.log('[uploadAndAnalyze] 创建报告记录...');
    const reportData = {
      // _openid 由数据库自动注入，不需要手动设置
      studentId,
      studentName,
      subject,
      type: mode === 'verification' ? 'verification' : 'diagnosis',
      sourceType: mode === 'paper' ? 'paper' : (mode === 'default-paper' ? 'default-paper' : 'photo'),
      status: 'analyzing',
      imageFileIds: fileIDs,
      paperId: paperId || '',
      summary: '',
      totalErrors: 0,
      bottlenecks: [],
      errorDetails: [],
      comparisonSummary: '',
      createdAt: new Date(),
      updatedAt: new Date(),
    };
    console.log('[uploadAndAnalyze] 报告数据：', JSON.stringify(reportData));

    const reportRes = await db.collection('reports').add({ data: reportData });
    const reportId = reportRes._id;
    console.log('[uploadAndAnalyze] 报告已创建，ID：', reportId);

    // 3. 更新 subjectProfiles 的 analysisStatus
    try {
      const profileRes = await db.collection('subjectProfiles')
        .where({ studentId, subject })
        .get();

      if (profileRes.data.length > 0) {
        await db.collection('subjectProfiles').doc(profileRes.data[0]._id).update({
          data: { analysisStatus: 'analyzing', updatedAt: new Date() },
        });
        console.log('[uploadAndAnalyze] 已更新学科档案状态为 analyzing');
      } else {
        console.warn('[uploadAndAnalyze] 未找到学科档案，跳过状态更新');
      }
    } catch (e) {
      console.warn('[uploadAndAnalyze] 更新学科档案失败（非致命）：', e.message);
      // 不中断流程
    }

    // 4. 调用 analyzePhotos 并等待完成
    // ⚠️ 微信云函数中，主函数 return 后进程终止，fire-and-forget 调用不会执行！
    // 必须用 await 确保请求真正发出并完成
    // 前端 timeout 15s 会超时，但云函数在服务端会继续运行直到完成
    console.log('[uploadAndAnalyze] 开始调用 analyzePhotos...');
    try {
      const analyzeRes = await cloud.callFunction({
        name: 'analyzePhotos',
        data: { reportId, fileIDs, subject, studentId, mode },
      });
      console.log('[uploadAndAnalyze] analyzePhotos 完成：', JSON.stringify(analyzeRes.result));
    } catch (err) {
      console.error('[uploadAndAnalyze] analyzePhotos 调用失败：', err.message);
      // 分析失败不阻塞返回，reportId 仍返回给前端
    }

    // 5. 返回 reportId
    console.log('[uploadAndAnalyze] 返回成功，reportId：', reportId);
    return {
      success: true,
      reportId,
      message: '分析任务已创建，请在学科主页查看进度',
    };
  } catch (err) {
    console.error('[uploadAndAnalyze] 失败：', err.message, err.stack);
    return { success: false, error: err.message || '未知错误' };
  }
};

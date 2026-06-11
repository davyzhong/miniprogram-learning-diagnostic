// uploadAndAnalyze/index.js
// 入口函数：接收fileIDs，创建reports记录，触发后台分析
const cloud = require('wx-server-sdk');

cloud.init({ env: cloud.SYMBOL_CURRENT_ENV });
const db = cloud.database();
const SUBJECTS = new Set(['math', 'chinese', 'english']);
const MODES = new Set(['diagnosis', 'verification', 'paper', 'default-paper']);

// ========== 主函数 ==========
exports.main = async (event, context) => {
  const { fileIDs, studentId, subject = 'math', mode = 'diagnosis', paperId = '' } = event;

  if (!fileIDs || !Array.isArray(fileIDs) || fileIDs.length === 0) {
    console.error('[uploadAndAnalyze] fileIDs 无效：', fileIDs);
    return { success: false, error: 'fileIDs 不能为空' };
  }

  if (!studentId) {
    console.error('[uploadAndAnalyze] studentId 为空');
    return { success: false, error: '缺少 studentId' };
  }
  if (fileIDs.length > 20 || fileIDs.some(fileID => typeof fileID !== 'string' || !fileID.startsWith('cloud://'))) {
    return { success: false, error: '图片参数无效' };
  }
  if (!SUBJECTS.has(subject) || !MODES.has(mode)) {
    return { success: false, error: '学科或分析模式无效' };
  }

  try {
    // 1. 获取学生信息（用于报告显示）
    const currentOpenId = cloud.getWXContext().OPENID;
    const studentRes = await db.collection('students').doc(studentId).get();
    const student = studentRes.data;
    if (!student) {
      return { success: false, error: '学生不存在' };
    }
    if (student._openid && student._openid !== currentOpenId) {
      return { success: false, error: '无权访问该学生' };
    }
    if (paperId) {
      const paperRes = await db.collection('papers').doc(paperId).get();
      const paper = paperRes.data;
      if (!paper || paper.studentId !== studentId || (paper._openid && paper._openid !== currentOpenId)) {
        return { success: false, error: '关联试卷不存在或无权访问' };
      }
    }
    const studentName = String(student.name || '未知学生').slice(0, 30);

    // 2. 创建 reports 记录（status='analyzing'）
    console.log('[uploadAndAnalyze] 创建报告记录...');
    const reportData = {
      _openid: currentOpenId,
      studentId,
      studentName,
      subject,
      type: mode === 'verification' ? 'verification' : 'diagnosis',
      sourceType: paperId ? 'paper' : 'photo',
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
    const reportRes = await db.collection('reports').add({ data: reportData });
    const reportId = reportRes._id;
    console.log('[uploadAndAnalyze] 报告已创建，ID：', reportId);

    // 3. 更新 subjectProfiles 的 analysisStatus
    try {
      const profileRes = await db.collection('subjectProfiles')
        .where({ studentId })
        .get();
      const profile = profileRes.data.find(item => item.subject === subject);

      if (profile) {
        await db.collection('subjectProfiles').doc(profile._id).update({
          data: { analysisStatus: 'analyzing', currentAnalysisId: reportId, updatedAt: new Date() },
        });
        console.log('[uploadAndAnalyze] 已更新学科档案状态为 analyzing');
      } else {
        console.warn('[uploadAndAnalyze] 未找到学科档案，跳过状态更新');
      }
    } catch (e) {
      console.warn('[uploadAndAnalyze] 更新学科档案失败（非致命）：', e.message);
      // 不中断流程
    }

    // 4. 在服务端可靠启动分析。客户端超时或页面卸载不会中断服务端调用链。
    console.log('[uploadAndAnalyze] 服务端启动 analyzePhotos，reportId：', reportId);
    const analyzeRes = await cloud.callFunction({
      name: 'analyzePhotos',
      data: { reportId },
    });
    if (!analyzeRes.result || analyzeRes.result.success === false) {
      throw new Error(analyzeRes.result && analyzeRes.result.error
        ? analyzeRes.result.error
        : '图片分析启动失败');
    }

    return {
      success: true,
      reportId,
      message: '分析完成',
    };
  } catch (err) {
    console.error('[uploadAndAnalyze] 失败：', err.message, err.stack);
    return { success: false, error: '创建分析任务失败，请稍后重试' };
  }
};

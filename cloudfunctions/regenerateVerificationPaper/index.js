// regenerateVerificationPaper/index.js
// 手动重新生成验证卷（用于 none/failed 状态，或诊断报告异步生成未触发的兜底）
//
// 与 analyzePhotos/auto-verification.js 的 triggerAutoVerificationPaper 逻辑一致：
// 全量细 BN + 置信度排序 + 分批追加 + 最终 regeneratePdf。
// 因云函数独立打包无法跨函数 require，此处内联核心逻辑。
const cloud = require('wx-server-sdk');
const { getStudentAccess, canOperateLearning } = require('./access');

cloud.init({ env: cloud.SYMBOL_CURRENT_ENV });
const db = cloud.database();

const BATCH_SIZE = 8;

const SEVERITY_RANK = { high: 3, medium: 2, low: 1 };

/**
 * 从 profile 展开细卡点（BN-*），按 weight 降序。
 * 与 auto-verification.js 的 extractFineBottlenecks 保持一致。
 */
function extractFineBottlenecks(profile) {
  const pending = (profile && profile.pendingBottlenecks) || [];
  const current = (profile && profile.currentBottlenecks) || [];
  const coarseMap = new Map();
  for (const item of [...pending, ...current]) {
    const key = item.lpCode || item.bottleneckId || item.id;
    if (!key) continue;
    if (!coarseMap.has(key)) {
      coarseMap.set(key, { ...item, candidateBottlenecks: [...(item.candidateBottlenecks || [])] });
    } else {
      const existing = coarseMap.get(key);
      const seen = new Set((existing.candidateBottlenecks || []).map(c => c.bottleneckId || c.id));
      for (const cand of (item.candidateBottlenecks || [])) {
        const cid = cand.bottleneckId || cand.id;
        if (cid && !seen.has(cid)) {
          existing.candidateBottlenecks.push(cand);
          seen.add(cid);
        }
      }
    }
  }
  const coarseItems = Array.from(coarseMap.values());

  const fineSeen = new Set();
  const fineList = [];

  for (const item of coarseItems) {
    const parentLpCode = item.lpCode || '';
    const severity = item.severity || 'medium';
    const candidates = item.candidateBottlenecks || [];

    if (candidates.length > 0) {
      for (const cand of candidates) {
        const bnId = cand.bottleneckId || cand.id;
        if (!bnId || fineSeen.has(bnId)) continue;
        fineSeen.add(bnId);
        const strength = cand.evidenceStrength;
        const weight = cand.weight || item.weight
          || (strength === 'high' ? 85 : strength === 'medium' ? 60 : 30);
        fineList.push({
          bottleneckId: bnId,
          title: cand.title || cand.lpName || '未知卡点',
          severity,
          lpCode: parentLpCode,
          weight,
        });
      }
    } else {
      const code = parentLpCode || item.bottleneckId || item.id;
      if (code && !fineSeen.has(code)) {
        fineSeen.add(code);
        fineList.push({
          bottleneckId: code,
          title: item.lpName || '未知卡点',
          severity,
          lpCode: parentLpCode,
          weight: item.weight || 50,
          coarse: true,
        });
      }
    }
  }

  fineList.sort((a, b) => (Number(b.weight) || 0) - (Number(a.weight) || 0)
    || (SEVERITY_RANK[b.severity] || 2) - (SEVERITY_RANK[a.severity] || 2)
    || fineList.indexOf(a) - fineList.indexOf(b));
  return fineList;
}

function chunkTargets(targets, size = BATCH_SIZE) {
  const chunks = [];
  for (let i = 0; i < targets.length; i += size) {
    chunks.push(targets.slice(i, i + size));
  }
  return chunks;
}

async function requireStudentAccess(studentId, openId) {
  const access = await getStudentAccess(db, studentId, openId);
  if (!access.student) return { ok: false, error: '学生不存在' };
  if (!canOperateLearning(access)) return { ok: false, error: '无权执行该操作' };
  return { ok: true, access };
}

async function getValidatedPaper({ paperId, studentId, subject, openId }) {
  const existing = await db.collection('papers').doc(paperId).get();
  const paper = existing.data;
  if (!paper) return { ok: false, error: '验证卷不存在' };
  if (paper.studentId !== studentId || paper.subject !== subject || paper.type !== 'verification') {
    return { ok: false, error: '验证卷归属不匹配' };
  }
  const access = await requireStudentAccess(paper.studentId, openId);
  if (!access.ok) return access;
  return { ok: true, paper };
}

async function validateReportOwnership(reportId, studentId, subject) {
  if (!reportId) return { ok: true };
  const reportRes = await db.collection('reports').doc(reportId).get();
  const report = reportRes.data;
  if (!report) return { ok: false, error: '报告不存在' };
  if (report.studentId !== studentId || report.subject !== subject) {
    return { ok: false, error: '报告归属不匹配' };
  }
  return { ok: true, report };
}

exports.main = async (event = {}) => {
  const { studentId, subject = 'math', reportId = '', action = 'start' } = event;
  const openId = cloud.getWXContext().OPENID;

  if (!studentId) return { success: false, error: '缺少 studentId' };
  if (!['math', 'chinese', 'english'].includes(subject)) {
    return { success: false, error: '学科参数无效' };
  }

  // ===== start 模式：创建 generating 记录，返回 paperId + 分批信息 =====
  // 前端拿到后循环调 generatePaper(_appendToPaperId) 分批生成，最后调 _regeneratePdf
  if (action === 'start') {
    try {
      const access = await requireStudentAccess(studentId, openId);
      if (!access.ok) return { success: false, error: access.error };
      const reportCheck = await validateReportOwnership(reportId, studentId, subject);
      if (!reportCheck.ok) return { success: false, error: reportCheck.error };

      const profileRes = await db.collection('subjectProfiles')
        .where({ studentId })
        .get();
      const profile = (profileRes.data || []).find(item => item.subject === subject) || {};

      const fineBottlenecks = extractFineBottlenecks(profile);
      const targetIds = fineBottlenecks.map(item => item.bottleneckId);
      if (targetIds.length === 0) {
        return { success: false, error: '暂无待验证卡点' };
      }

      // 计算分批
      const batches = chunkTargets(targetIds);

      const now = new Date();
      const paperRes = await db.collection('papers').add({
        data: {
          _openid: openId,
          studentId, subject,
          type: 'verification',
          bottleneckTargets: targetIds,
          questions: [],
          generationStatus: 'generating',
          verificationStatus: 'pending',
          autoGenerated: false,
          generationAttempts: 0,
          generationError: '',
          triggeredByReport: reportId,
          createdAt: now,
          generatedAt: now,
          generationProgress: { completedBatches: 0, totalBatches: batches.length, succeededBatches: 0 },
        },
      });
      const paperId = paperRes._id;

      // 回写 report 关联
      if (reportId) {
        await db.collection('reports').doc(reportId).update({
          data: { verificationPaperId: paperId, verificationPaperStatus: 'generating' },
        }).catch(() => {});
      }

      return {
        success: true,
        paperId,
        targetCount: targetIds.length,
        totalBatches: batches.length,
        batches: batches.map(b => b),  // 返回每批的 targetIds 数组
        status: 'generating',
      };
    } catch (err) {
      console.error('[regenerateVerificationPaper] start 异常:', err.message);
      return { success: false, error: '创建验证卷记录失败：' + (err.message || err) };
    }
  }

  // ===== finalize 模式：标记生成完成（前端调完 _regeneratePdf 后调用） =====
  if (action === 'finalize') {
    const { paperId } = event;
    if (!paperId) return { success: false, error: '缺少 paperId' };
    try {
      const paperCheck = await getValidatedPaper({ paperId, studentId, subject, openId });
      if (!paperCheck.ok) return { success: false, error: paperCheck.error };
      const reportCheck = await validateReportOwnership(reportId, studentId, subject);
      if (!reportCheck.ok) return { success: false, error: reportCheck.error };
      const questions = Array.isArray(paperCheck.paper.questions) ? paperCheck.paper.questions : [];
      if (questions.length === 0 || !paperCheck.paper.pdfFileId) {
        return { success: false, error: '验证卷尚未生成完整题目或 PDF' };
      }
      await db.collection('papers').doc(paperId).update({
        data: { generationStatus: 'ready', generationError: '' },
      }).catch(() => {});
      if (reportId) {
        await db.collection('reports').doc(reportId).update({
          data: { verificationPaperStatus: 'ready' },
        }).catch(() => {});
      }
      return { success: true };
    } catch (err) {
      return { success: false, error: err.message || String(err) };
    }
  }

  // ===== fail 模式：标记失败 =====
  if (action === 'fail') {
    const { paperId, error = '生成失败' } = event;
    if (!paperId) return { success: false, error: '缺少 paperId' };
    try {
      const paperCheck = await getValidatedPaper({ paperId, studentId, subject, openId });
      if (!paperCheck.ok) return { success: false, error: paperCheck.error };
      const reportCheck = await validateReportOwnership(reportId, studentId, subject);
      if (!reportCheck.ok) return { success: false, error: reportCheck.error };
      await db.collection('papers').doc(paperId).update({
        data: { generationStatus: 'failed', generationError: error },
      }).catch(() => {});
      if (reportId) {
        await db.collection('reports').doc(reportId).update({
          data: { verificationPaperStatus: 'failed' },
        }).catch(() => {});
      }
      return { success: true };
    } catch (err) {
      return { success: false, error: err.message || String(err) };
    }
  }

  return { success: false, error: '未知 action: ' + action };
};

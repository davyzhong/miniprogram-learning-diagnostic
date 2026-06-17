// generatePaper/index.js
// 生成验证试卷/默认诊断试卷（A4 PDF），上传云存储
const cloud = require('wx-server-sdk');
const tcb = require('@cloudbase/node-sdk');
const { generatePDF } = require('./pdf-renderer');
const { summarizeBottleneckName, uniqueBottleneckSummaries } = require('./bottleneck-display');
const { selectChineseReviewTargets, buildChineseReviewPromptBlock } = require('./chinese-review-targets');
const {
  buildVerificationPack,
  decorateQuestionsWithPack,
  inferTargetType,
} = require('./verification-pack');
const { getStudentAccess, canOperateLearning } = require('./access');
const { getSubjectName, getSubjectCode } = require('./constants');

cloud.init({ env: cloud.SYMBOL_CURRENT_ENV });
const db = cloud.database();
const SUBJECTS = new Set(['math', 'chinese', 'english']);
const TYPES = new Set(['verification', 'default-diagnosis']);
const VERIFICATION_CORE_QUESTION_COUNT = 1;
const VERIFICATION_EXTENSION_QUESTION_COUNT = 1;
const VERIFICATION_QUESTIONS_PER_TARGET = VERIFICATION_CORE_QUESTION_COUNT + VERIFICATION_EXTENSION_QUESTION_COUNT;
const VERIFICATION_TASK_PACK_TARGET_LIMIT = 10;
const MAX_TOTAL_VERIFICATION_QUESTIONS = 20;

// 初始化 CloudBase AI SDK
const app = tcb.init({
  env: tcb.SYMBOL_CURRENT_ENV,
  timeout: 60000
});

// ========== 调用混元生成题目 ==========
function cleanPromptText(value, maxLength = 30) {
  return String(value || '')
    .replace(/[\r\n\t]/g, ' ')
    .replace(/[<>`]/g, '')
    .trim()
    .slice(0, maxLength);
}

function isValidTargetCode(value) {
  return /^(LP|BN|CHI)-[A-Za-z0-9_-]{1,80}$/.test(String(value || ''));
}

function normalizeTargetCodes(targets = []) {
  const result = [];
  const seen = new Set();
  for (const value of targets || []) {
    const code = cleanPromptText(value, 100);
    if (!code || seen.has(code)) continue;
    seen.add(code);
    result.push(code);
  }
  return result;
}

function formatLocalDate(date = new Date()) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function formatDateCode(paperDate) {
  const text = /^\d{4}-\d{2}-\d{2}$/.test(String(paperDate || ''))
    ? String(paperDate)
    : formatLocalDate(new Date());
  return text.replace(/-/g, '');
}

function normalizePaperDate(value) {
  const text = cleanPromptText(value, 20);
  if (/^\d{4}-\d{2}-\d{2}$/.test(text)) return text;
  return formatLocalDate(new Date());
}

async function createPaperCodes(studentId, subject, paperDate) {
  const dateCode = formatDateCode(paperDate);
  const normalizedSubject = getSubjectCode(subject, 'PAPER');
  const subjectName = getSubjectName(subject, subject || '试卷');
  const existing = await db.collection('papers')
    .where({ studentId, subject, paperDate })
    .get();
  const sequence = String((existing.data || []).length + 1).padStart(2, '0');
  return {
    paperCode: `${normalizedSubject}-${dateCode}-${sequence}`,
    paperDisplayCode: `${subjectName}-${dateCode}-${sequence}`,
  };
}

function normalizeQuestionsData(data, expectedCount) {
  if (!data || typeof data !== 'object' || !Array.isArray(data.questions)) {
    throw new Error('AI 返回的试卷结构无效');
  }

  const completeQuestions = data.questions
    .map(question => ({
      content: cleanPromptText(question?.content, 500),
      answer: cleanPromptText(question?.answer, 300),
      points: Number(question?.points) || 10,
      lpCode: cleanPromptText(question?.lpCode, 100),
      lpName: cleanPromptText(question?.lpName, 80),
      reviewItemId: cleanPromptText(question?.reviewItemId, 100),
      itemType: cleanPromptText(question?.itemType, 40),
      targetText: cleanPromptText(question?.targetText, 160),
      verificationMethod: cleanPromptText(question?.verificationMethod, 80),
    }))
    .filter(question => question.content && question.answer);

  if (completeQuestions.length < expectedCount) {
    throw new Error(`AI 返回题目数量不足：期望 ${expectedCount} 道，实际 ${completeQuestions.length} 道`);
  }

  const questions = completeQuestions
    .slice(0, expectedCount)
    .map((question, index) => ({ ...question, index: index + 1 }));

  return {
    title: cleanPromptText(data.title, 80) || '学习卡点验证试卷',
    questions,
  };
}

function buildBottleneckSummaries(questions, targets = []) {
  const byCode = {};
  for (const question of questions || []) {
    if (question.lpCode && question.lpName && !byCode[question.lpCode]) {
      byCode[question.lpCode] = question.lpName;
    }
  }

  const targetNames = (targets || []).map(code => byCode[code]).filter(Boolean);
  if (targetNames.length > 0) {
    return Array.from(new Set(targetNames.map(name => cleanPromptText(name, 100)).filter(Boolean)));
  }

  return uniqueBottleneckSummaries(questions || []).map(summarizeBottleneckName);
}

function addTargetName(targetMap, code, name) {
  const key = cleanPromptText(code, 100);
  const value = cleanPromptText(name, 100);
  if (!key || !value || targetMap[key]) return;
  targetMap[key] = value;
}

function buildTargetNameMap(profile = {}) {
  const targetMap = {};
  const bottlenecks = [
    ...(profile.pendingBottlenecks || []),
    ...(profile.currentBottlenecks || []),
  ];

  for (const item of bottlenecks) {
    addTargetName(targetMap, item.lpCode, item.lpName || item.title || item.name);
    for (const candidate of item.candidateBottlenecks || []) {
      addTargetName(
        targetMap,
        candidate.bottleneckId || candidate.id,
        candidate.title || candidate.name || candidate.lpName
      );
    }
  }

  for (const item of profile.chineseReviewItems || []) {
    addTargetName(
      targetMap,
      item.itemId || item.id,
      item.targetText || item.expectedAnswer || item.sourceContext
    );
    addTargetName(
      targetMap,
      item.relatedLpCode || item.lpCode,
      item.relatedLpName || item.lpName || '语文具体错项'
    );
  }

  return targetMap;
}

/**
 * 构建含 taxonomy 微验证规则的卡点描述，喂给 LLM。
 * 对每个 BN 细卡点，附加 symptomPatterns（第1条）和 microValidationRules（第1条）。
 * 如果 taxonomy 里找不到该 BN，降级为简单的 "code：名称"。
 */
function buildTargetDescWithRules(targets, targetMap, subject) {
  // 加载 taxonomy（数学学科才用）
  let taxonomyMap = null;
  if (subject === 'math') {
    try {
      const taxonomy = require('./math-bottleneck-hierarchy');
      // taxonomy 内部已加载 bottleneckSeed，用 bottleneckOf 查询
      const seed = require('../../data/math/bottleneck-taxonomy-v2.seed.json');
      taxonomyMap = {};
      for (const bn of (seed.bottlenecks || [])) {
        taxonomyMap[bn.bottleneckId] = bn;
      }
    } catch (e) {
      taxonomyMap = null;
    }
  }

  return targets.map((code, i) => {
    const name = targetMap[code] || '未知卡点';
    const bn = taxonomyMap && taxonomyMap[code];
    if (bn) {
      const symptom = (bn.symptomPatterns || [])[0] || '';
      const rule = (bn.microValidationRules || [])[0] || '';
      const severityTag = bn.priority === 'high' ? '[高]' : bn.priority === 'low' ? '[低]' : '[中]';
      return `${i + 1}. ${severityTag} ${code}（${name}）\n   症状：${symptom}\n   验证：${rule}`;
    }
    return `${i + 1}. ${code}（${name}）`;
  }).join('\n\n');
}

function findParentLpCode(profile = {}, targetId) {
  const bottlenecks = [
    ...(profile.pendingBottlenecks || []),
    ...(profile.currentBottlenecks || []),
  ];

  for (const item of bottlenecks) {
    const directCode = cleanPromptText(item.lpCode, 100);
    if (directCode === targetId) return directCode;
    for (const candidate of item.candidateBottlenecks || []) {
      const candidateId = cleanPromptText(candidate.bottleneckId || candidate.id, 100);
      if (candidateId === targetId) return directCode;
    }
  }

  return targetId.startsWith('LP-') ? targetId : '';
}

function findTargetWeight(profile = {}, targetId) {
  const bottlenecks = [
    ...(profile.pendingBottlenecks || []),
    ...(profile.currentBottlenecks || []),
  ];

  for (const item of bottlenecks) {
    if (cleanPromptText(item.lpCode, 100) === targetId) {
      return Number(item.weight || item.errorCount || 0) || 0;
    }
    for (const candidate of item.candidateBottlenecks || []) {
      const candidateId = cleanPromptText(candidate.bottleneckId || candidate.id, 100);
      if (candidateId === targetId) {
        return Number(candidate.weight || candidate.evidenceStrength || candidate.errorCount || item.weight || 0) || 0;
      }
    }
  }

  for (const item of profile.chineseReviewItems || []) {
    const itemId = cleanPromptText(item.itemId || item.id, 100);
    if (itemId === targetId) {
      return Number(item.weight || item.errorCount || 0) || 0;
    }
  }

  return 0;
}

function buildVerificationTargetsForPack(profile = {}, targetCodes = []) {
  const targetNameMap = buildTargetNameMap(profile);
  return targetCodes.map(code => ({
    targetId: code,
    targetType: inferTargetType(code),
    displayName: targetNameMap[code] || code,
    legacyLpCode: findParentLpCode(profile, code),
    lpCode: findParentLpCode(profile, code),
    weight: findTargetWeight(profile, code),
  }));
}

async function generateQuestionsWithAI(student, subject, type, targets, paperKey, questionCount, selectedGrade) {
  // 获取学生信息（用于个性化）
  const studentName = cleanPromptText(student.name, 30);
  const grade = Number(selectedGrade) || Number(student.grade) || 0;
  const rawExpected = targets.length * VERIFICATION_QUESTIONS_PER_TARGET;
  const expectedCount = type === 'verification'
    ? Math.min(rawExpected, MAX_TOTAL_VERIFICATION_QUESTIONS)
    : questionCount;

  const subjectName = getSubjectName(subject, '数学');
  const typeName = type === 'verification' ? '验证试卷（针对已知卡点）' : '默认诊断试卷（全面诊断）';

  // 构建 targets 描述
  let targetDesc = '';
  let chineseReviewTargets = [];
  if (type === 'verification' && targets && targets.length > 0) {
    // 从数据库查询卡点名称
    const profileRes = await db.collection('subjectProfiles')
      .where({ studentId: student._id })
      .get();
    const profile = profileRes.data.find(item => item.subject === subject);
    const targetMap = buildTargetNameMap(profile || {});
    // 构建含 taxonomy 微验证规则的卡点描述
    targetDesc = buildTargetDescWithRules(targets, targetMap, subject);
    if (subject === 'chinese') {
      chineseReviewTargets = selectChineseReviewTargets(profile || {}, targets, expectedCount);
    }
  }
  const chineseReviewPromptBlock = buildChineseReviewPromptBlock(chineseReviewTargets);

  const prompt = `你是${subjectName}老师，生成${typeName}。学生信息仅用于调整难度。

学生：${studentName || '同学'}，${grade || '未知'}年级
${targetDesc ? `本次验证覆盖以下学习卡点，共出 ${expectedCount} 题：\n${targetDesc}` : ''}
${chineseReviewPromptBlock}

要求：
1. 每个卡点出 ${VERIFICATION_QUESTIONS_PER_TARGET} 题：${VERIFICATION_CORE_QUESTION_COUNT}核心+${VERIFICATION_EXTENSION_QUESTION_COUNT}延展
2. 核心题直接复现该卡点的典型错误场景
3. 延展题变换情境（不同数字/不同表述），观察是否稳定
4. 难度匹配${grade || '该'}年级
5. lpCode填对应卡点代码，lpName写卡点名称；语文错项额外填reviewItemId/targetText/verificationMethod
6. 直接返回JSON，不要\`\`\`json包裹

输出：
{"title":"标题","questions":[{"index":1,"content":"题目","answer":"答案","points":5,"lpCode":"BN-...","lpName":"卡点名","reviewItemId":"","targetText":"","verificationMethod":""}]}

开始生成：`;

  // 调用 CloudBase AI 生成题目
  const ai = app.ai();
  const model = ai.createModel('cloudbase');

  const result = await model.generateText({
    model: 'deepseek-v4-flash',
    messages: [{ role: 'user', content: prompt }],
    temperature: 0.3,
  });

  const content = result.text || '';
  const cleaned = content.replace(/^```json\s*/i, '').replace(/\s*```$/, '').trim();
  return {
    ...normalizeQuestionsData(JSON.parse(cleaned), expectedCount),
    chineseReviewTargets,
  };
}

// ========== 主函数 ==========
exports.main = async (event) => {
  const {
    studentId,
    subject = 'math',
    type = 'verification',
    targets = [],
    preview = false,
    paperKey = '',
    questionCount = 12,
    grade = 0,
    paperDate = '',
    targetPlan = {},
    _autoPaperId = '',
  } = event;

  if (!studentId) {
    return { success: false, error: '缺少 studentId' };
  }
  if (!SUBJECTS.has(subject) || !TYPES.has(type)) {
    return { success: false, error: '学科或试卷类型无效' };
  }
  const targetCodes = Array.isArray(targets) ? normalizeTargetCodes(targets) : [];
  const verificationTargetLimit = type === 'verification' ? VERIFICATION_TASK_PACK_TARGET_LIMIT : 5;
  const hasInvalidTargets = !Array.isArray(targets)
    || targetCodes.length > verificationTargetLimit
    || targetCodes.some(code => !isValidTargetCode(code));
  if (hasInvalidTargets) {
    return { success: false, error: '学习卡点参数无效' };
  }
  if (type === 'verification' && targetCodes.length === 0) {
    return { success: false, error: '验证试卷至少需要一个学习卡点' };
  }
  if (type === 'default-diagnosis' && ![1, 2, 3, 4, 5, 6].includes(Number(grade) || 0)) {
    return { success: false, error: '默认诊断试卷需要选择有效年级' };
  }
  const normalizedQuestionCount = Math.min(20, Math.max(6, Number(questionCount) || 12));
  const normalizedPaperDate = normalizePaperDate(paperDate);

  try {
    const currentOpenId = cloud.getWXContext().OPENID;
    const access = await getStudentAccess(db, studentId, currentOpenId);
    const student = access.student;
    if (!student) {
      return { success: false, error: '学生不存在' };
    }
    if (!canOperateLearning(access)) {
      return { success: false, error: '无权执行该操作' };
    }

    const profileRes = await db.collection('subjectProfiles')
      .where({ studentId })
      .get();
    const subjectProfile = (profileRes.data || []).find(item => item.subject === subject) || {};
    const paperCodes = await createPaperCodes(studentId, subject, normalizedPaperDate);
    const verificationTargets = type === 'verification'
      ? buildVerificationTargetsForPack(subjectProfile, targetCodes)
      : [];
    const initialVerificationPack = type === 'verification'
      ? buildVerificationPack({
        subject,
        paperCode: paperCodes.paperCode,
        paperDate: normalizedPaperDate,
        targets: verificationTargets,
        targetPlan,
      })
      : null;

    // 1. 调用混元生成题目
    console.log('开始生成题目，type：', type);
    const questionsData = await generateQuestionsWithAI(
      student,
      subject,
      type,
      targetCodes,
      paperKey,
      normalizedQuestionCount,
      type === 'default-diagnosis' ? Number(grade) : Number(student.grade) || Number(grade) || 0
    );
    if (initialVerificationPack) {
      const decorated = decorateQuestionsWithPack(questionsData.questions || [], initialVerificationPack);
      questionsData.questions = decorated.questions;
      questionsData.verificationPack = {
        ...decorated.pack,
        mode: 'task_pack',
        scheduleStrategy: 'weight_desc_paginated',
        totalQuestions: decorated.questions.length,
        completedStudentPages: 0,
      };
    }
    const bottleneckSummaries = buildBottleneckSummaries(questionsData.questions, targetCodes);

    // 2. 生成 PDF
    console.log('开始生成 PDF');
    const pdfResult = await generatePDF(questionsData, subject, type, {
      paperDate: normalizedPaperDate,
      ...paperCodes,
      verificationPack: questionsData.verificationPack || null,
    });
    const pdfBuffer = Buffer.isBuffer(pdfResult) ? pdfResult : pdfResult.buffer;
    if (!Buffer.isBuffer(pdfBuffer)) {
      throw new Error('PDF 生成结果无效');
    }
    const pageInfo = {
      studentPages: Number(pdfResult.studentPages) || Math.max(1, Math.ceil(questionsData.questions.length / 6)),
      answerPages: Number(pdfResult.answerPages) || 1,
      totalPages: Number(pdfResult.totalPages) || 0,
      studentPageCodes: Array.isArray(pdfResult.studentPageCodes) ? pdfResult.studentPageCodes : [],
      studentPageMetadata: Array.isArray(pdfResult.studentPageMetadata) ? pdfResult.studentPageMetadata : [],
    };
    if (!pageInfo.totalPages) {
      pageInfo.totalPages = pageInfo.studentPages + pageInfo.answerPages;
    }

    // 3. 上传到云存储
    const timestamp = Date.now();
    const cloudPath = `papers/${studentId}_${subject}_${type}_${preview ? 'preview_' : ''}${timestamp}.pdf`;
    const upload = await cloud.uploadFile({
      cloudPath,
      fileContent: pdfBuffer,
    });
    const pdfFileId = upload.fileID;

    if (preview) {
      return {
        success: true,
        pdfFileId,
        title: questionsData.title,
        questionCount: questionsData.questions.length,
        chineseReviewTargets: questionsData.chineseReviewTargets || [],
        verificationPack: questionsData.verificationPack || null,
        paperDate: normalizedPaperDate,
        ...paperCodes,
        ...pageInfo,
      };
    }

    // 4. 创建或更新 papers 记录
    const paperData = {
      _openid: currentOpenId,
      studentId,
      subject,
      type,
      grade: type === 'default-diagnosis' ? Number(grade) : Number(student.grade) || Number(grade) || 0,
      paperKey: cleanPromptText(paperKey, 20),
      ...paperCodes,
      bottleneckTargets: targetCodes,
      bottleneckSummaries,
      chineseReviewTargets: questionsData.chineseReviewTargets || [],
      verificationPack: questionsData.verificationPack || null,
      questions: questionsData.questions || [],
      pdfFileId,
      paperDate: normalizedPaperDate,
      generatedAt: new Date(),
      ...pageInfo,
      generationStatus: 'ready',
    };

    let paperId;
    if (_autoPaperId) {
      // 自动生成模式：更新已创建的 generating 记录
      await db.collection('papers').doc(_autoPaperId).update({ data: paperData });
      paperId = _autoPaperId;
    } else {
      // 手动生成模式：新建记录
      const paperRes = await db.collection('papers').add({
        data: { ...paperData, createdAt: new Date() },
      });
      paperId = paperRes._id;
    }

    console.log('试卷生成完成：', paperId);
    return {
      success: true,
      paperId,
      pdfFileId,
      title: questionsData.title,
      questionCount: (questionsData.questions || []).length,
      verificationPack: questionsData.verificationPack || null,
      paperDate: normalizedPaperDate,
      ...paperCodes,
      ...pageInfo,
    };
  } catch (err) {
    console.error('generatePaper 失败：', err);
    return { success: false, error: '试卷生成失败，请稍后重试' };
  }
};

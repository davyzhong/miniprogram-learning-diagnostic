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
const { recordUsageStart, recordUsageSuccess, recordUsageFailure } = require('./usage-ledger');
const { getSubjectName, getSubjectCode } = require('./constants');

cloud.init({ env: cloud.SYMBOL_CURRENT_ENV });
const db = cloud.database();
const SUBJECTS = new Set(['math', 'chinese', 'english']);
const TYPES = new Set(['verification', 'default-diagnosis']);
const VERIFICATION_CORE_QUESTION_COUNT = 1;
const VERIFICATION_EXTENSION_QUESTION_COUNT = 1;
const VERIFICATION_QUESTIONS_PER_TARGET = VERIFICATION_CORE_QUESTION_COUNT + VERIFICATION_EXTENSION_QUESTION_COUNT;

// === 置信度分层出题 ===
// 根据 weight（0-100）决定每个卡点的出题数：
//   高置信（≥75）：3 题（2核心+1迁移）— 反复出现、需重点确认
//   中置信（45-74）：2 题（1核心+1迁移）— 正常验证强度
//   低置信（<45）：1 题（1核心）— 初步观察，轻量验证
const CONFIDENCE_HIGH_THRESHOLD = 75;
const CONFIDENCE_MEDIUM_THRESHOLD = 45;
const QUESTIONS_FOR_HIGH = 3;
const QUESTIONS_FOR_MEDIUM = 2;
const QUESTIONS_FOR_LOW = 1;

function confidenceLevel(weight) {
  const w = Number(weight) || 0;
  if (w >= CONFIDENCE_HIGH_THRESHOLD) return 'high';
  if (w >= CONFIDENCE_MEDIUM_THRESHOLD) return 'medium';
  return 'low';
}

function questionsForWeight(weight) {
  const level = confidenceLevel(weight);
  if (level === 'high') return QUESTIONS_FOR_HIGH;
  if (level === 'medium') return QUESTIONS_FOR_MEDIUM;
  return QUESTIONS_FOR_LOW;
}

function confidenceLabel(weight) {
  const level = confidenceLevel(weight);
  if (level === 'high') return '高置信';
  if (level === 'medium') return '中置信';
  return '低置信';
}

async function getPaperAccessForWrite(paperId, openId, expected = {}) {
  const existing = await db.collection('papers').doc(paperId).get();
  const paper = existing.data;
  if (!paper) return { ok: false, error: '试卷不存在' };

  if (
    (expected.studentId && paper.studentId !== expected.studentId)
    || (expected.subject && paper.subject !== expected.subject)
    || (expected.type && paper.type !== expected.type)
  ) {
    return { ok: false, error: '验证卷归属不匹配' };
  }

  const access = await getStudentAccess(db, paper.studentId, openId);
  if (!access.student) return { ok: false, error: '学生不存在' };
  if (!canOperateLearning(access)) return { ok: false, error: '无权执行该操作' };
  return { ok: true, paper, access };
}

// 验证卷按细分卡点（BN）出题，置信度分层。
// 全量 BN 可达 30-50 个，允许上限调大到 80 个 target。
const VERIFICATION_TASK_PACK_TARGET_LIMIT = 80;
// 总题数上限同步调大（80 target × 3 题 = 240 题上限）
const MAX_TOTAL_VERIFICATION_QUESTIONS = 240;

// 初始化 CloudBase AI SDK
const app = tcb.init({
  env: tcb.SYMBOL_CURRENT_ENV,
  timeout: 60000
});

// ========== 调用混元生成题目 ==========
function cleanLatex(text) {
  return String(text || '')
    // \frac{a}{b} → a/b（分数，简单数字不加括号）
    .replace(/\\frac\{([^{}]*)\}\{([^{}]*)\}/g, (m, a, b) => {
      const na = /^[0-9.]+$/.test(a) ? a : `(${a})`
      const nb = /^[0-9.]+$/.test(b) ? b : `(${b})`
      return `${na}/${nb}`
    })
    .replace(/\\frac\{([^{}]*)\}\{([^{}]*)\}/g, (m, a, b) => {
      const na = /^[0-9.]+$/.test(a) ? a : `(${a})`
      const nb = /^[0-9.]+$/.test(b) ? b : `(${b})`
      return `${na}/${nb}`
    })
    // \sqrt{x} → √x
    .replace(/\\sqrt\{([^{}]*)\}/g, '√($1)')
    // \times → ×, \div → ÷, \pm → ±, \leq → ≤, \geq → ≥, \neq → ≠
    .replace(/\\times/g, '×').replace(/\\div/g, '÷').replace(/\\pm/g, '±')
    .replace(/\\leq/g, '≤').replace(/\\geq/g, '≥').replace(/\\neq/g, '≠')
    .replace(/\\cdot/g, '·')
    // \text{...} → ...
    .replace(/\\text\{([^{}]*)\}/g, '$1')
    // 移除 \(\)、$、\[ \] 等 LaTeX 定界符
    .replace(/\\[\(\)\[\]]/g, '')
    .replace(/\$+/g, '')
    // 移除剩余的反斜杠命令（\quad, \, 等）
    .replace(/\\[a-zA-Z]+(\{[^{}]*\})?/g, ' ')
    // 合并多余空格和括号
    .replace(/\(\)/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function cleanPromptText(value, maxLength = 30) {
  return cleanLatex(value)
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
      explanation: cleanPromptText(question?.explanation, 400),
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
function buildTargetDescWithRules(targets, targetMap, subject, profile) {
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

  // 构建 BN → weight 映射（从 profile 读置信度）
  const weightMap = {};
  const evidenceMap = {};
  const parentNameMap = {};  // BN → 父级粗卡点名称（降级时给 LLM 上下文）
  const allBn = [
    ...(profile && profile.pendingBottlenecks || []),
    ...(profile && profile.currentBottlenecks || []),
  ];
  for (const item of allBn) {
    // 粗卡点本身的 weight
    if (item.lpCode) {
      weightMap[item.lpCode] = item.weight || 0;
      evidenceMap[item.lpCode] = {
        evidenceCount: item.evidenceCount || 0,
        passCount: item.verificationPassCount || 0,
        failCount: item.verificationFailCount || 0,
      };
    }
    // 细卡点的 weight（用 evidenceStrength 映射）
    for (const cand of (item.candidateBottlenecks || [])) {
      const bnId = cand.bottleneckId || cand.id;
      if (bnId) {
        const strength = cand.evidenceStrength;
        weightMap[bnId] = cand.weight || (strength === 'high' ? 85 : strength === 'medium' ? 60 : 30);
        evidenceMap[bnId] = {
          evidenceCount: cand.evidenceCount || (item.evidenceCount || 0),
          passCount: item.verificationPassCount || 0,
          failCount: item.verificationFailCount || 0,
        };
        // 记录父级名称（供 taxonomy 降级时使用）
        parentNameMap[bnId] = item.lpName || item.title || '';
      }
    }
  }

  return targets.map((code, i) => {
    const name = targetMap[code] || '未知卡点';
    const bn = taxonomyMap && taxonomyMap[code];
    const weight = weightMap[code] || 50;
    const qCount = questionsForWeight(weight);
    const confLabel = confidenceLabel(weight);
    const ev = evidenceMap[code] || {};
    const confTag = `[${confLabel}·出${qCount}题·weight${weight}·${ev.evidenceCount || 0}次证据·通过${ev.passCount || 0}/失败${ev.failCount || 0}]`;

    if (bn) {
      const symptom = (bn.symptomPatterns || [])[0] || '';
      const rule = (bn.microValidationRules || [])[0] || '';
      return `${i + 1}. ${code}（${name}） ${confTag}\n   症状：${symptom}\n   验证：${rule}`;
    }
    // 降级：不在 taxonomy 里，但用名称和父级类别给 LLM 足够上下文出题
    const parentName = parentNameMap[code] || '';
    const parentHint = parentName ? `\n   归属：${parentName}` : '';
    return `${i + 1}. ${code}（${name}） ${confTag}${parentHint}`;
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

  // 查询 profile（verification 模式需要 weight 来计算置信度分层题量）
  let profile = {};
  if (type === 'verification' && targets && targets.length > 0) {
    const profileRes = await db.collection('subjectProfiles')
      .where({ studentId: student._id })
      .get();
    profile = profileRes.data.find(item => item.subject === subject) || {};
  }

  // expectedCount：verification 按置信度分层累加，default-diagnosis 用传入的 questionCount
  let expectedCount;
  if (type === 'verification') {
    // 逐个 target 查 weight，累加 questionsForWeight(weight)
    const sumByConfidence = targets.reduce((sum, code) => {
      const w = findTargetWeight(profile, code);
      return sum + questionsForWeight(w);
    }, 0);
    // 兜底：若 weight 全为 0（profile 缺失），回退到 targets.length × 2
    expectedCount = sumByConfidence > 0
      ? Math.min(sumByConfidence, MAX_TOTAL_VERIFICATION_QUESTIONS)
      : Math.min(targets.length * VERIFICATION_QUESTIONS_PER_TARGET, MAX_TOTAL_VERIFICATION_QUESTIONS);
  } else {
    expectedCount = questionCount;
  }

  const subjectName = getSubjectName(subject, '数学');
  const typeName = type === 'verification' ? '验证试卷（针对已知卡点）' : '默认诊断试卷（全面诊断）';

  // 构建 targets 描述
  let targetDesc = '';
  let chineseReviewTargets = [];
  if (type === 'verification' && targets && targets.length > 0) {
    const targetMap = buildTargetNameMap(profile);
    // 构建含 taxonomy 微验证规则的卡点描述
    targetDesc = buildTargetDescWithRules(targets, targetMap, subject, profile);
    if (subject === 'chinese') {
      chineseReviewTargets = selectChineseReviewTargets(profile, targets, expectedCount);
    }
  }
  const chineseReviewPromptBlock = buildChineseReviewPromptBlock(chineseReviewTargets);

  const prompt = `你是${subjectName}老师，生成${typeName}。学生信息仅用于调整难度。

学生：${studentName || '同学'}，${grade || '未知'}年级
${targetDesc ? `本次验证覆盖以下学习卡点，共约 ${expectedCount} 题（按置信度分层）：\n${targetDesc}` : ''}
${chineseReviewPromptBlock}

要求：
1. 每个卡点的出题数严格按上面的置信度标签（[高置信·出3题]就出3题，[中置信·出2题]就出2题，[低置信·出1题]就出1题）
2. 出3题的卡点：2道核心题（直接复现典型错误场景，不同数字）+ 1道迁移题（变换情境）
3. 出2题的卡点：1道核心题 + 1道迁移题
4. 出1题的卡点：1道核心题
5. 核心题直接复现该卡点的典型错误场景
6. 迁移题变换情境（不同数字/不同表述），观察是否稳定
7. 难度匹配${grade || '该'}年级
8. lpCode填对应卡点代码，lpName写卡点名称
9. explanation 字段写【本题专属的】具体解题过程，必须包含：
   - 针对这道题具体数字的计算步骤（如"38×4=152，152+7=159"）
   - 关键判断点（如"这里需要先通分，最小公倍数是20"）
   严禁写"分析题目条件""确定运算顺序""注意检查"等通用废话
   每道题的 explanation 必须不同，紧扣该题的具体数字和考点
10. 题目和答案中不要使用 LaTeX 公式（如\\frac），分数写成"3/4"格式
11. 直接返回JSON，不要\`\`\`json包裹

输出：
{"title":"标题","questions":[{"index":1,"content":"题目","answer":"答案","explanation":"本题专属解题步骤：写出具体数字的计算过程和关键判断，不要通用模板话","points":5,"lpCode":"BN-...","lpName":"卡点名","questionRole":"core或transfer"}]}

开始生成：`;

  // 调用 CloudBase AI 生成题目
  const ai = app.ai();
  const model = ai.createModel('cloudbase');

  // AI 用量记账（pending）——写入失败不阻断业务
  let eventId = null
  try {
    const openId = cloud.getWXContext().OPENID
    if (openId) {
      eventId = await recordUsageStart({
        db, openId,
        eventType: 'paper_generation',
        studentId: student._id || '',
        subject,
        sourceType: 'paper',
        cloudFunction: 'generatePaper',
        model: 'deepseek-v4-flash'
      })
    }
  } catch (e) { console.error('[usage] recordUsageStart failed', e && e.message) }

  try {
    const result = await model.generateText({
      model: 'deepseek-v4-flash',
      messages: [{ role: 'user', content: prompt }],
      temperature: 0.3,
    });

    if (eventId) {
      await recordUsageSuccess({
        db, eventId, usage: result && result.usage, outputText: result && result.text,
        model: 'deepseek-v4-flash'
      }).catch(e => console.error('[usage] recordUsageSuccess failed', e && e.message))
    }

    const content = result.text || '';
    const cleaned = content.replace(/^```json\s*/i, '').replace(/\s*```$/, '').trim();
    return {
      ...normalizeQuestionsData(JSON.parse(cleaned), expectedCount),
      chineseReviewTargets,
    };
  } catch (err) {
    if (eventId) {
      await recordUsageFailure({ db, eventId, errorMessage: err && err.message, model: 'deepseek-v4-flash' })
        .catch(e => console.error('[usage] recordUsageFailure failed', e && e.message))
    }
    throw err;
  }
}

// ========== 主函数 ==========
exports.main = async (event) => {
  // PDF 重新生成模式：读取已有 paper 的全部题目，重新生成 PDF
  // 用于追加模式完成后，用合并的完整题目生成最终 PDF
  if (event._regeneratePdf && event.paperId) {
    try {
      const currentOpenId = cloud.getWXContext().OPENID;
      let paper;
      if (event._internalTrustedCall) {
        const pRes = await db.collection('papers').doc(event.paperId).get().catch(() => ({ data: null }));
        paper = pRes.data;
        if (!paper) return { success: false, error: '试卷不存在' };
      } else {
        const paperAccess = await getPaperAccessForWrite(event.paperId, currentOpenId);
        if (!paperAccess.ok) return { success: false, error: paperAccess.error };
        paper = paperAccess.paper;
      }
      const allQuestions = paper.questions || [];
      if (allQuestions.length === 0) return { success: false, error: '试卷无题目' };

      const subject = paper.subject || 'math';
      const type = paper.type || 'verification';
      const paperDate = paper.paperDate || '';

      // 重建 paperCode（正常路径用 createPaperCodes 生成，这里用已有或重建）
      const paperCodes = paper.paperCode
        ? { paperCode: paper.paperCode, paperDisplayCode: paper.paperDisplayCode || paper.paperCode }
        : await createPaperCodes(paper.studentId, subject, paperDate);

      // 重建 verificationPack（追加模式后题目数变了，旧的分页信息已失效）
      // 关键修复：按实际题目数量均匀分页，和 A4 双栏学生页容量保持一致。
      let verificationPack = paper.verificationPack || null;
      if (type === 'verification') {
        // 1. 清除题目里残留的旧 pageCode/questionId
        const cleanQuestions = allQuestions.map(q => {
          const { pageCode, questionId, ...rest } = q;
          return rest;
        });

        // 1b. 按 lpCode 分组排序（stable sort），让同卡点的题目连续排列。
        // 这样双栏配对时左右栏尽量是同一卡点，避免不同卡点交错导致连续画多个 group bar。
        cleanQuestions.sort((a, b) => {
          const la = (a.lpCode || a.targetId || '');
          const lb = (b.lpCode || b.targetId || '');
          if (la !== lb) return la < lb ? -1 : 1;
          return 0;  // 同 lpCode 保持原序（core 在前 transfer 在后）
        });

        // 2. 按实际题数分页（每页最多 8 题，双栏 4 行）
        const QUESTIONS_PER_PAGE = 8;
        const totalPages = Math.max(1, Math.ceil(cleanQuestions.length / QUESTIONS_PER_PAGE));
        const dateCode = formatDateCode(paperDate);
        const sequence = (paperCodes.paperCode.match(/-(\d+)$/)||[])[1] || '01';
        const subjectCode = subject.toUpperCase().replace(/[^A-Z]/g, '').slice(0,4) || 'MATH';

        const pages = [];
        for (let i = 0; i < totalPages; i++) {
          const pageStart = i * QUESTIONS_PER_PAGE;
          const pageQuestions = cleanQuestions.slice(pageStart, pageStart + QUESTIONS_PER_PAGE);
          const pageIndex = i + 1;
          const pageCode = `${subjectCode}-V-${dateCode}-${String(sequence).padStart(2,'0')}-P${String(pageIndex).padStart(2,'0')}`;
          const targetIds = Array.from(new Set(pageQuestions.map(q => q.lpCode || q.targetId || '综合')));
          pages.push({
            pageIndex,
            pageCode,
            status: 'pending',
            pageType: 'mixed_review',
            targetIds,
            questionIds: [],
          });
          // 给该页的题目打上 pageCode
          pageQuestions.forEach(q => {
            q.pageCode = pageCode;
            q.targetId = q.lpCode || q.targetId || '综合';
          });
        }

        // 3. 给每道题分配统一编号、questionId 和 questionRole
        // index 从 1 开始连续编号（覆盖 LLM 批次内的重复编号）
        const targetRoleCounts = new Map();
        let pageQuestionCounter = 0;
        let currentPageCode = '';
        cleanQuestions.forEach((q, idx) => {
          q.index = idx + 1;  // 全局连续编号 1, 2, 3...
          if (q.pageCode !== currentPageCode) {
            currentPageCode = q.pageCode;
            pageQuestionCounter = 0;
          }
          pageQuestionCounter++;
          q.questionId = `${q.pageCode}-Q${String(pageQuestionCounter).padStart(2,'0')}`;
          const roleCount = (targetRoleCounts.get(q.targetId) || 0) + 1;
          targetRoleCounts.set(q.targetId, roleCount);
          q.questionRole = q.questionRole || (roleCount <= 1 ? 'core' : 'transfer');
          q.targetType = q.targetType || inferTargetType(q.targetId);
          // 把 questionId 记到对应 page
          const packPage = pages.find(p => p.pageCode === q.pageCode);
          if (packPage) packPage.questionIds.push(q.questionId);
        });

        verificationPack = {
          packId: `VPK-${subjectCode}-${dateCode}-${sequence}`,
          subject,
          subjectCode,
          paperCode: paperCodes.paperCode,
          paperDate,
          dateCode,
          sequence,
          totalTargets: Array.from(new Set(cleanQuestions.map(q => q.targetId))).length,
          targetsPerPage: 0,  // 按题数分页，不按 target 数
          totalStudentPages: totalPages,
          scheduleStrategy: 'question_count_paginated',
          pages,
        };
        allQuestions.splice(0, allQuestions.length, ...cleanQuestions);
      }

      // 构造和正常路径一致的 questionsData
      const questionsData = {
        title: paper.title || `${subject === 'math' ? '数学' : subject}验证试卷`,
        questions: allQuestions,
        verificationPack,
      };

      const pdfResult = await generatePDF(questionsData, subject, type, {
        paperDate,
        paperCode: paperCodes.paperCode,
        paperDisplayCode: paperCodes.paperDisplayCode,
        verificationPack,
      });
      const pdfBuffer = Buffer.isBuffer(pdfResult) ? pdfResult : pdfResult.buffer;
      if (!Buffer.isBuffer(pdfBuffer)) throw new Error('PDF 生成结果无效');

      const timestamp = Date.now();
      const cloudPath = `papers/${paper.studentId}_${subject}_${type}_${timestamp}.pdf`;
      const upload = await cloud.uploadFile({ cloudPath, fileContent: pdfBuffer });

      const pageInfo = {
        studentPages: Number(pdfResult.studentPages) || Math.max(1, Math.ceil(allQuestions.length / 6)),
        answerPages: Number(pdfResult.answerPages) || 1,
        totalPages: Number(pdfResult.totalPages) || 0,
        studentPageCodes: Array.isArray(pdfResult.studentPageCodes) ? pdfResult.studentPageCodes : [],
        studentPageMetadata: Array.isArray(pdfResult.studentPageMetadata) ? pdfResult.studentPageMetadata : [],
      };
      if (!pageInfo.totalPages) pageInfo.totalPages = pageInfo.studentPages + pageInfo.answerPages;

      // 补全状态回写：_regeneratePdf 是用户手动重生成 PDF 的路径（前端 paper-preview 调用），
      // 之前只写了 generationStatus: 'ready'，漏了 generationProgress 和 report 同步，
      // 导致报告页 verificationPaperStatus 一直停在 'generating'、进度显示 0 批完成。
      const totalBatches = (paper.generationProgress && paper.generationProgress.totalBatches) || 1;
      const completedBatches = (paper.generationProgress && paper.generationProgress.completedBatches) || totalBatches;
      const succeededBatches = (paper.generationProgress && paper.generationProgress.succeededBatches) || completedBatches;
      const now = new Date();

      await db.collection('papers').doc(event.paperId).update({
        data: {
          pdfFileId: upload.fileID,
          paperCode: paperCodes.paperCode,
          paperDisplayCode: paperCodes.paperDisplayCode,
          verificationPack,
          questions: allQuestions,
          generationStatus: 'ready',
          generationError: '',
          generationProgress: { completedBatches, totalBatches, succeededBatches },
          generatedAt: now,
          updatedAt: now,
          ...pageInfo,
        },
      });

      // 同步回写报告状态（report.verificationPaperStatus）
      // 修复：之前 _regeneratePdf 路径没有回写 report，导致报告页状态停在 'generating'
      if (paper.triggeredByReport) {
        await db.collection('reports').doc(paper.triggeredByReport).update({
          data: { verificationPaperStatus: 'ready', verificationPaperId: event.paperId },
        }).catch(err => {
          console.warn('[generatePaper] 回写 report.verificationPaperStatus 失败:', err.message);
        });
      }

      return { success: true, paperId: event.paperId, pdfFileId: upload.fileID, questionCount: allQuestions.length, ...pageInfo };
    } catch (err) {
      console.error('重新生成 PDF 失败：', err);
      return { success: false, error: 'PDF 重新生成失败：' + (err.message || err) };
    }
  }

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
    _appendToPaperId = '',
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
  const normalizedQuestionCount = Math.min(MAX_TOTAL_VERIFICATION_QUESTIONS, Math.max(6, Number(questionCount) || 12));
  const normalizedPaperDate = normalizePaperDate(paperDate);

  try {
    const currentOpenId = cloud.getWXContext().OPENID;
    let student = null;
    // 内部续跑调用（从 regenerateVerificationPaper 调度）跳过权限检查
    if (event._internalTrustedCall) {
      console.log('[generatePaper] internal trusted call, skipping access check');
      const studentRes = await db.collection('students').doc(studentId).get().catch(() => ({ data: null }));
      student = studentRes.data;
    } else {
      const access = await getStudentAccess(db, studentId, currentOpenId);
      student = access.student;
      if (!student) {
        return { success: false, error: '学生不存在' };
      }
      if (!canOperateLearning(access)) {
        console.log('[generatePaper] access denied: openId=%s studentOpenId=%s', currentOpenId, student._openid);
        return { success: false, error: '无权执行该操作' };
      }
    }
    let appendPaper = null;
    if (_appendToPaperId) {
      if (event._internalTrustedCall) {
        const pRes = await db.collection('papers').doc(_appendToPaperId).get().catch(() => ({ data: null }));
        appendPaper = pRes.data;
        if (!appendPaper) return { success: false, error: '试卷不存在' };
      } else {
        const appendAccess = await getPaperAccessForWrite(_appendToPaperId, currentOpenId, {
          studentId,
          subject,
          type,
        });
        if (!appendAccess.ok) return { success: false, error: appendAccess.error };
        appendPaper = appendAccess.paper;
      }
    }
    if (_autoPaperId) {
      if (!event._internalTrustedCall) {
        const autoAccess = await getPaperAccessForWrite(_autoPaperId, currentOpenId, {
          studentId,
          subject,
          type,
        });
        if (!autoAccess.ok) return { success: false, error: autoAccess.error };
      }
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

    if (_appendToPaperId) {
      const oldData = appendPaper || {};
      const oldQuestions = Array.isArray(oldData.questions) ? oldData.questions : [];
      const oldTargets = Array.isArray(oldData.bottleneckTargets) ? oldData.bottleneckTargets : [];
      const oldSummaries = Array.isArray(oldData.bottleneckSummaries) ? oldData.bottleneckSummaries : [];
      const mergedQuestions = [...oldQuestions, ...(questionsData.questions || [])];
      const mergedTargets = Array.from(new Set([...oldTargets, ...targetCodes]));
      const mergedSummaries = [...oldSummaries, ...(bottleneckSummaries || [])];
      await db.collection('papers').doc(_appendToPaperId).update({
        data: {
          questions: mergedQuestions,
          bottleneckTargets: mergedTargets,
          bottleneckSummaries: mergedSummaries,
          updatedAt: new Date(),
          generationStatus: 'appending',
        },
      });
      console.log('试卷追加完成：', _appendToPaperId, '总题数:', mergedQuestions.length);
      return {
        success: true,
        paperId: _appendToPaperId,
        pdfFileId: oldData.pdfFileId || '',
        title: oldData.title || questionsData.title,
        questionCount: mergedQuestions.length,
        appendedQuestionCount: (questionsData.questions || []).length,
        verificationPack: oldData.verificationPack || questionsData.verificationPack || null,
        paperDate: normalizedPaperDate,
      };
    }

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

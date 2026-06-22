const { TAXONOMY_BN_LIST, BN_VARIANT_ALIASES } = require('./taxonomy-bn-list');

function cleanText(value, maxLength) {
  return String(value || '').slice(0, maxLength);
}

function cleanStringArray(values, maxItems = 8, maxLength = 100) {
  if (!Array.isArray(values)) return [];
  return values
    .map(value => cleanText(value, maxLength))
    .filter(Boolean)
    .slice(0, maxItems);
}

function normalizeEvidenceStrength(value) {
  return ['high', 'medium', 'low'].includes(value) ? value : '';
}

// evidenceStrength 强弱排序（high > medium > low > 空），归并时取更强值
const EVIDENCE_RANK = { high: 3, medium: 2, low: 1, '': 0 };
function strongerEvidence(a, b) {
  return (EVIDENCE_RANK[a] || 0) >= (EVIDENCE_RANK[b] || 0) ? a : b;
}

// title 标准化关键词：去掉 AI 常加的后缀变体，用于 title 匹配
const TITLE_SUFFIX_NOISE = /规则不熟练$|不熟练$|错误$|不稳$|不稳定$|失败$|混淆$|不足$|偏差$|错误。*$|不稳。*$/g;
function normalizeBnTitle(title) {
  return String(title || '')
    .replace(/（.*?）/g, '')      // 去括号注释
    .replace(TITLE_SUFFIX_NOISE, '')
    .trim();
}

/**
 * 将 AI 返回的 bottleneckId 归并到标准 taxonomy ID。
 * 三层匹配：
 *   1. 已在 taxonomy 28 个标准 ID 中 → 直接返回（含 isNew:false）
 *   2. 在 BN_VARIANT_ALIASES 变体映射表中 → 映射到标准 ID（含 isNew:false）
 *   3. 以上都不命中 → 保留原 ID，标记 isNew:true（宽松策略：保留新卡点）
 */
function canonicalizeBottleneckId(rawId, title) {
  const id = String(rawId || '').trim();
  if (!id) return { canonicalId: '', isNew: false };

  // 1. 已是标准 ID
  const isStandard = TAXONOMY_BN_LIST.some(bn => bn.id === id);
  if (isStandard) return { canonicalId: id, isNew: false };

  // 2. 在变体映射表中
  if (BN_VARIANT_ALIASES[id]) {
    return { canonicalId: BN_VARIANT_ALIASES[id], isNew: false };
  }

  // 3. title 关键词匹配：用归一化后的 title 与 taxonomy 做 substring 匹配
  const normTitle = normalizeBnTitle(title);
  if (normTitle.length >= 4) {
    for (const bn of TAXONOMY_BN_LIST) {
      const bnNormTitle = normalizeBnTitle(bn.title);
      if (bnNormTitle.length >= 4 && (normTitle.includes(bnNormTitle) || bnNormTitle.includes(normTitle))) {
        return { canonicalId: bn.id, isNew: false };
      }
    }
  }

  // 4. 都不命中：保留原 ID，标记为新卡点
  return { canonicalId: id, isNew: true };
}

function normalizeNextActionType(value) {
  return ['resourceReview', 'microValidation', 'verificationPaper'].includes(value) ? value : '';
}

function normalizeChineseItemType(value) {
  return [
    'character',
    'word',
    'pinyin',
    'poem_line',
    'idiom',
    'accumulation',
    'reading_skill',
    'writing_skill',
  ].includes(value) ? value : 'word';
}

function normalizeCandidateBottlenecks(items) {
  if (!Array.isArray(items)) return [];

  // 1. 结构化清洗 + canonicalize bottleneckId
  const cleaned = items
    .map(item => {
      if (typeof item === 'string') {
        return { rawId: item, title: '' };
      }
      if (!item || typeof item !== 'object') return null;
      return {
        rawId: cleanText(item.bottleneckId || item.id, 80),
        title: cleanText(item.title, 120),
        evidenceStrength: normalizeEvidenceStrength(item.evidenceStrength),
        microValidationRequired: Boolean(item.microValidationRequired),
        suggestedMicroValidation: cleanStringArray(item.suggestedMicroValidation, 6, 120),
        recommendedResourceIds: cleanStringArray(item.recommendedResourceIds, 6, 80),
      };
    })
    .filter(item => item && item.rawId);

  // 2. canonicalize + 按 canonical ID 归并去重（同义变体合并为一个标准 BN）
  const byCanonical = new Map();
  for (const item of cleaned) {
    const { canonicalId, isNew } = canonicalizeBottleneckId(item.rawId, item.title);
    if (!canonicalId) continue;

    if (!byCanonical.has(canonicalId)) {
      // 首次出现：用 canonicalId 作为 bottleneckId，保留 title（优先用 taxonomy 标准标题）
      const stdBn = TAXONOMY_BN_LIST.find(bn => bn.id === canonicalId);
      byCanonical.set(canonicalId, {
        bottleneckId: canonicalId,
        title: (stdBn && stdBn.title) || item.title,
        evidenceStrength: item.evidenceStrength || '',
        microValidationRequired: item.microValidationRequired || false,
        suggestedMicroValidation: item.suggestedMicroValidation || [],
        recommendedResourceIds: item.recommendedResourceIds || [],
        isNew,
      });
    } else {
      // 重复出现：归并（取更强 evidence、OR microValidation、并集 arrays）
      const existing = byCanonical.get(canonicalId);
      existing.evidenceStrength = strongerEvidence(existing.evidenceStrength, item.evidenceStrength);
      existing.microValidationRequired = existing.microValidationRequired || item.microValidationRequired;
      existing.suggestedMicroValidation = [...new Set([...(existing.suggestedMicroValidation||[]), ...(item.suggestedMicroValidation||[])])].slice(0, 6);
      existing.recommendedResourceIds = [...new Set([...(existing.recommendedResourceIds||[]), ...(item.recommendedResourceIds||[])])].slice(0, 6);
      existing.isNew = existing.isNew && isNew; // 只要任一来源是标准 ID，就不是新卡点
    }
  }

  return Array.from(byCanonical.values()).slice(0, 5);
}

function normalizeChineseErrorItems(items) {
  if (!Array.isArray(items)) return [];
  return items
    .map(item => {
      if (!item || typeof item !== 'object') return null;
      const targetText = cleanText(item.targetText, 120);
      const expectedAnswer = cleanText(item.expectedAnswer || item.correctAnswer || targetText, 160);
      if (!targetText && !expectedAnswer) return null;
      return {
        itemId: cleanText(item.itemId || item.id, 100),
        itemType: normalizeChineseItemType(item.itemType || item.type),
        targetText,
        expectedAnswer,
        studentAnswer: cleanText(item.studentAnswer || item.wrongAnswer, 160),
        sourceContext: cleanText(item.sourceContext || item.context, 300),
        mistakeType: cleanText(item.mistakeType, 80),
        sourceQuestion: cleanText(item.sourceQuestion, 160),
        evidenceStrength: normalizeEvidenceStrength(item.evidenceStrength),
        verificationMethods: cleanStringArray(item.verificationMethods, 5, 60),
        relatedLpCode: cleanText(item.relatedLpCode || item.lpCode, 30),
        suggestion: cleanText(item.suggestion, 300),
      };
    })
    .filter(Boolean)
    .slice(0, 100);
}

function normalizeBottlenecks(items) {
  return items
    .filter(item => item && typeof item.lpCode === 'string' && typeof item.lpName === 'string')
    .map(item => ({
      lpCode: item.lpCode.slice(0, 30),
      lpName: item.lpName.slice(0, 80),
      errorCount: Math.max(0, Number(item.errorCount) || 0),
      severity: ['high', 'medium', 'low'].includes(item.severity) ? item.severity : 'medium',
      rootCause: cleanText(item.rootCause, 300),
      suggestion: cleanText(item.suggestion, 300),
      nodeIds: cleanStringArray(item.nodeIds, 6, 80),
      candidateBottlenecks: normalizeCandidateBottlenecks(item.candidateBottlenecks),
      evidenceStrength: normalizeEvidenceStrength(item.evidenceStrength),
      nextActionType: normalizeNextActionType(item.nextActionType),
      nextActionText: cleanText(item.nextActionText, 200),
      recommendedResourceIds: cleanStringArray(item.recommendedResourceIds, 8, 80),
    }));
}

function normalizeErrorDetails(items) {
  return items.slice(0, 100).map(item => ({
    questionContent: cleanText(item.questionContent, 500),
    studentAnswer: cleanText(item.studentAnswer, 300),
    correctAnswer: cleanText(item.correctAnswer, 300),
    lpCode: cleanText(item.lpCode, 30),
    rootCause: cleanText(item.rootCause, 300),
    suggestion: cleanText(item.suggestion, 300),
  }));
}

function normalizeVerificationEvidence(items) {
  return items
    .filter(item => item && (typeof item.lpCode === 'string' || typeof item.targetId === 'string'))
    .map(item => {
      const evidence = {
        lpCode: cleanText(item.lpCode || item.targetId, 100),
        attemptedQuestionCount: Math.max(0, Number(item.attemptedQuestionCount) || 0),
        incorrectQuestionCount: Math.max(0, Number(item.incorrectQuestionCount) || 0),
        blankQuestionCount: Math.max(0, Number(item.blankQuestionCount) || 0),
        unclearQuestionCount: Math.max(0, Number(item.unclearQuestionCount) || 0),
        missingQuestionCount: Math.max(0, Number(item.missingQuestionCount) || 0),
      };
      const targetId = cleanText(item.targetId, 100);
      const pageCode = cleanText(item.pageCode, 80);
      if (targetId) evidence.targetId = targetId;
      if (pageCode) evidence.pageCode = pageCode;
      return evidence;
    })
}

function normalizeChineseReviewEvidence(items) {
  if (!Array.isArray(items)) return [];
  return items
    .filter(item => item && typeof item.itemId === 'string')
    .map(item => ({
      itemId: cleanText(item.itemId, 100),
      targetText: cleanText(item.targetText, 120),
      attemptedQuestionCount: Math.max(0, Number(item.attemptedQuestionCount) || 0),
      incorrectQuestionCount: Math.max(0, Number(item.incorrectQuestionCount) || 0),
      blankQuestionCount: Math.max(0, Number(item.blankQuestionCount) || 0),
      unclearQuestionCount: Math.max(0, Number(item.unclearQuestionCount) || 0),
      missingQuestionCount: Math.max(0, Number(item.missingQuestionCount) || 0),
    }));
}

function normalizePageResults(result, expectedPageCount) {
  if (!result || typeof result !== 'object' || !Array.isArray(result.pageResults)) {
    throw new Error('AI 返回的数据结构无效');
  }
  if (result.pageResults.length !== expectedPageCount) {
    throw new Error(`逐页分析结果数量不正确：期望 ${expectedPageCount} 页，实际 ${result.pageResults.length} 页`);
  }

  const seenIndexes = new Set();
  const pageResults = result.pageResults.map(page => {
    const imageIndex = Number(page.imageIndex);
    if (!Number.isInteger(imageIndex) || imageIndex < 1 || imageIndex > expectedPageCount || seenIndexes.has(imageIndex)) {
      throw new Error('图片序号无效或重复');
    }
    seenIndexes.add(imageIndex);
    const bottlenecks = normalizeBottlenecks(Array.isArray(page.bottlenecks) ? page.bottlenecks : []);
    const errorDetails = normalizeErrorDetails(Array.isArray(page.errorDetails) ? page.errorDetails : []);
    const verificationEvidence = normalizeVerificationEvidence(
      Array.isArray(page.verificationEvidence) ? page.verificationEvidence : []
    );
    const chineseReviewEvidence = normalizeChineseReviewEvidence(page.chineseReviewEvidence);
    return {
      imageIndex,
      pageCode: cleanText(page.pageCode, 80),
      ocrSummary: cleanText(page.ocrSummary, 1000),
      summary: cleanText(page.summary, 200),
      bottlenecks,
      errorDetails,
      chineseErrorItems: normalizeChineseErrorItems(page.chineseErrorItems),
      verificationEvidence,
      chineseReviewEvidence,
      totalErrors: errorDetails.length,
    };
  }).sort((a, b) => a.imageIndex - b.imageIndex);

  return { pageResults };
}

module.exports = {
  normalizePageResults,
  // 导出以下函数供测试
  normalizeCandidateBottlenecks,
  canonicalizeBottleneckId,
  normalizeBnTitle,
};

const { TAXONOMY_BN_LIST, BN_VARIANT_ALIASES } = require('./taxonomy-bn-list');
const { MATH_NODE_LIST, NODE_VARIANT_ALIASES } = require('./knowledge-node-catalog');

function cleanText(value, maxLength) {
  return String(value || '').slice(0, maxLength);
}

// 清理答案字段：AI 有时把推理注释塞进 correctAnswer/studentAnswer，
// 如 "0.12 (注：学生写的是0.12但被判定错...)"。去掉括号注释和分号后的说明。
function cleanAnswer(value, maxLength) {
  let s = String(value || '').trim();
  // 去掉中文/英文括号注释（包括嵌套）
  s = s.replace(/[（(][^）)]*[）)]/g, '').trim();
  // 去掉 " / " 或 "/。" 后的推理说明（如 "11/15 /。这是典型的..."）
  s = s.replace(/\s*\/[。.；;].*$/, '').trim();
  // 去掉中文句号后的说明（如 "0.03。学生..."）——只匹配中文句号，不匹配小数点
  s = s.replace(/[。][a-zA-Z\u4e00-\u9fa5)].*$/, '').trim();
  // 去掉英文句号后的说明（如 "answer. Student..."）——但不匹配数字中的小数点
  s = s.replace(/\.[\s][a-zA-Z\u4e00-\u9fa5)].*$/, '').trim();
  // 去掉分号/冒号后的说明
  s = s.replace(/[;；:].*$/, '').trim();
  // 去掉 "注：" 开头的尾巴
  s = s.replace(/注[：:].*$/, '').trim();
  // "A 或 B" / "A 或 B" 格式：AI 给了多个可能答案，取第一个
  s = s.replace(/\s+或\s+.*$/, '').trim();
  s = s.replace(/\s+or\s+.*$/i, '').trim();
  return s.slice(0, maxLength);
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

/**
 * 将 AI 返回的 nodeId 归并到标准知识节点 ID，返回标准 ID 或空串。
 * 五层匹配：
 *   1. 已是标准 ID → 直接返回
 *   2. 在 NODE_VARIANT_ALIASES 变体映射表中 → 映射到标准 ID
 *   3. ID 前缀互含（如 MATH-NUM-DEC-MUL-POINT-ERROR）→ 归并
 *   4. title 双向子串匹配（归一化后 ≥4 字，同 normalizeBnTitle 做法）→ 归并
 *   5. 都不命中 → 丢弃（返回空串）。与 BN 的"保留为新"策略不同：
 *      自由发挥的 nodeId 指向不存在的节点，留着只会污染掌握状态键。
 */
function canonicalizeNodeId(rawId, title) {
  const id = String(rawId || '').trim();
  if (!id) return '';

  // 1. 已是标准 ID
  if (MATH_NODE_LIST.some(node => node.id === id)) return id;

  // 2. 在变体映射表中
  if (NODE_VARIANT_ALIASES[id]) return NODE_VARIANT_ALIASES[id];

  // 3. ID 前缀互含。标准 ID 之间互不为前缀，所以"标准 ID 是 rawId 前缀"至多命中一个；
  //    "rawId 是标准 ID 前缀"可能命中多个（如 MATH-NUM-DEC），只在唯一时归并。
  const extended = MATH_NODE_LIST.find(node => id.startsWith(node.id));
  if (extended) return extended.id;
  const truncated = MATH_NODE_LIST.filter(node => node.id.startsWith(id));
  if (truncated.length === 1) return truncated[0].id;

  // 4. title 关键词匹配：用归一化后的 title 与节点目录做 substring 匹配
  const normTitle = normalizeBnTitle(title);
  if (normTitle.length >= 4) {
    for (const node of MATH_NODE_LIST) {
      const nodeNormTitle = normalizeBnTitle(node.title);
      if (nodeNormTitle.length >= 4 && (normTitle.includes(nodeNormTitle) || nodeNormTitle.includes(normTitle))) {
        return node.id;
      }
    }
  }

  // 5. 都不命中：丢弃
  return '';
}

/**
 * 归一化瓶颈的 nodeIds：逐个 canonicalize，命中的去重保留（cap 6）；
 * 被丢弃的原始值记入 unmatchedNodeIds（cap 6），供后续数据扩充时回溯真实 AI 输出。
 */
function canonicalizeNodeIds(values, title) {
  const rawValues = cleanStringArray(values, 12, 80);
  const nodeIds = [];
  const unmatchedNodeIds = [];
  for (const raw of rawValues) {
    const canonicalId = canonicalizeNodeId(raw, title);
    if (canonicalId) {
      if (!nodeIds.includes(canonicalId) && nodeIds.length < 6) nodeIds.push(canonicalId);
    } else if (!unmatchedNodeIds.includes(raw) && unmatchedNodeIds.length < 6) {
      unmatchedNodeIds.push(raw);
    }
  }
  return { nodeIds, unmatchedNodeIds };
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
    .map(item => {
      const { nodeIds, unmatchedNodeIds } = canonicalizeNodeIds(item.nodeIds, item.lpName);
      const normalized = {
        lpCode: item.lpCode.slice(0, 30),
        lpName: item.lpName.slice(0, 80),
        errorCount: Math.max(0, Number(item.errorCount) || 0),
        severity: ['high', 'medium', 'low'].includes(item.severity) ? item.severity : 'medium',
        rootCause: cleanText(item.rootCause, 300),
        suggestion: cleanText(item.suggestion, 300),
        nodeIds,
        candidateBottlenecks: normalizeCandidateBottlenecks(item.candidateBottlenecks),
        evidenceStrength: normalizeEvidenceStrength(item.evidenceStrength),
        nextActionType: normalizeNextActionType(item.nextActionType),
        nextActionText: cleanText(item.nextActionText, 200),
        recommendedResourceIds: cleanStringArray(item.recommendedResourceIds, 8, 80),
      };
      if (unmatchedNodeIds.length > 0) normalized.unmatchedNodeIds = unmatchedNodeIds;
      return normalized;
    });
}

function normalizeErrorDetails(items) {
  return items.slice(0, 100).map(item => ({
    imageIndex: Number(item.imageIndex) || 0,
    questionContent: cleanText(item.questionContent, 500),
    studentAnswer: cleanAnswer(item.studentAnswer, 300),
    correctAnswer: cleanAnswer(item.correctAnswer, 300),
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
  normalizeErrorDetails,
  // 导出以下函数供测试
  normalizeCandidateBottlenecks,
  canonicalizeBottleneckId,
  normalizeBnTitle,
  canonicalizeNodeId,
  canonicalizeNodeIds,
};

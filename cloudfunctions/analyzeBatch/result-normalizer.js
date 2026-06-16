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
  return items
    .map(item => {
      if (typeof item === 'string') {
        return { bottleneckId: cleanText(item, 80) };
      }
      if (!item || typeof item !== 'object') return null;
      return {
        bottleneckId: cleanText(item.bottleneckId || item.id, 80),
        title: cleanText(item.title, 120),
        evidenceStrength: normalizeEvidenceStrength(item.evidenceStrength),
        microValidationRequired: Boolean(item.microValidationRequired),
        suggestedMicroValidation: cleanStringArray(item.suggestedMicroValidation, 6, 120),
        recommendedResourceIds: cleanStringArray(item.recommendedResourceIds, 6, 80),
      };
    })
    .filter(item => item && item.bottleneckId)
    .slice(0, 5);
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

module.exports = { normalizePageResults };

function cleanText(value, maxLength) {
  return String(value || '').slice(0, maxLength);
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
    .filter(item => item && typeof item.lpCode === 'string')
    .map(item => ({
      lpCode: cleanText(item.lpCode, 30),
      attemptedQuestionCount: Math.max(0, Number(item.attemptedQuestionCount) || 0),
      incorrectQuestionCount: Math.max(0, Number(item.incorrectQuestionCount) || 0),
      blankQuestionCount: Math.max(0, Number(item.blankQuestionCount) || 0),
      unclearQuestionCount: Math.max(0, Number(item.unclearQuestionCount) || 0),
      missingQuestionCount: Math.max(0, Number(item.missingQuestionCount) || 0),
    }))
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
    return {
      imageIndex,
      ocrSummary: cleanText(page.ocrSummary, 1000),
      summary: cleanText(page.summary, 200),
      bottlenecks,
      errorDetails,
      verificationEvidence,
      totalErrors: errorDetails.length,
    };
  }).sort((a, b) => a.imageIndex - b.imageIndex);

  return { pageResults };
}

module.exports = { normalizePageResults };

// Pure helpers for the analyzePhotos workflow. Keep cloud/database writes in index.js.

function splitFileBatches(fileIDs = [], batchSize = 1) {
  const batches = [];
  for (let i = 0; i < fileIDs.length; i += batchSize) {
    batches.push(fileIDs.slice(i, i + batchSize));
  }
  return batches;
}

function failedBatchItems(batchResults = []) {
  return batchResults
    .map((result, index) => ({ result, index }))
    .filter(item => !item.result || !item.result.success);
}

function successfulBatchItems(batchResults = []) {
  return batchResults
    .map((result, index) => ({ result, index }))
    .filter(item => item.result && item.result.success);
}

function summarizeFailedBatchResults(batchResults = []) {
  const failed = batchResults
    .map((result, index) => ({ result, index }))
    .filter(item => !item.result || !item.result.success)
    .slice(0, 3)
    .map(item => `第${item.index + 1}批${item.result && item.result.error ? `：${item.result.error}` : ''}`)
    .join('；');
  return failed ? `存在未完成的图片分析批次（${failed}）` : '';
}

function assertUsableBatchResults(batchResults = []) {
  const successful = successfulBatchItems(batchResults);
  if (successful.length > 0) {
    return;
  }
  const detail = summarizeFailedBatchResults(batchResults);
  throw new Error(detail || 'AI 未返回可用的图片分析结果');
}

function collectPageResults(batchResults = []) {
  const pageResults = batchResults
    .filter(result => result && result.success)
    .flatMap(result => result.data.pageResults || []);
  if (pageResults.length === 0) {
    throw new Error('AI 未返回逐页分析结果');
  }
  return pageResults;
}

function mergeUniqueStrings(left = [], right = []) {
  return Array.from(new Set([...(left || []), ...(right || [])].filter(Boolean)));
}

function mergeCandidateBottlenecks(left = [], right = []) {
  const byId = new Map();
  for (const item of [...(left || []), ...(right || [])]) {
    if (!item || !item.bottleneckId) continue;
    const previous = byId.get(item.bottleneckId) || {};
    byId.set(item.bottleneckId, {
      ...previous,
      ...item,
      suggestedMicroValidation: mergeUniqueStrings(previous.suggestedMicroValidation, item.suggestedMicroValidation),
      recommendedResourceIds: mergeUniqueStrings(previous.recommendedResourceIds, item.recommendedResourceIds),
      microValidationRequired: Boolean(previous.microValidationRequired || item.microValidationRequired),
    });
  }
  return Array.from(byId.values());
}

function strongerEvidence(left = '', right = '') {
  const rank = { high: 3, medium: 2, low: 1 };
  return (rank[right] || 0) > (rank[left] || 0) ? right : left;
}

function batchFailureSummary(batchResults = [], batches = []) {
  return failedBatchItems(batchResults).map(({ result, index }) => ({
    batchIndex: index,
    fileIDs: batches[index] || [],
    error: result && result.error ? result.error : '图片分析失败，请稍后重试',
  }));
}

function mergeBatchResults(batchResults) {
  const allBottlenecks = {};
  const allErrorDetails = [];
  const allChineseErrorItems = [];
  let totalErrors = 0;

  for (const batch of batchResults) {
    if (!batch.success) {
      console.warn('批次失败：', batch.error);
      continue;
    }
    const data = batch.data;
    totalErrors += data.totalErrors || 0;

    for (const bn of data.bottlenecks || []) {
      const key = bn.lpCode;
      if (allBottlenecks[key]) {
        allBottlenecks[key].errorCount += bn.errorCount;
        const severityRank = { high: 3, medium: 2, low: 1 };
        if (severityRank[bn.severity] > severityRank[allBottlenecks[key].severity]) {
          allBottlenecks[key].severity = bn.severity;
        }
        allBottlenecks[key].nodeIds = mergeUniqueStrings(allBottlenecks[key].nodeIds, bn.nodeIds);
        allBottlenecks[key].candidateBottlenecks = mergeCandidateBottlenecks(
          allBottlenecks[key].candidateBottlenecks,
          bn.candidateBottlenecks
        );
        allBottlenecks[key].recommendedResourceIds = mergeUniqueStrings(
          allBottlenecks[key].recommendedResourceIds,
          bn.recommendedResourceIds
        );
        allBottlenecks[key].evidenceStrength = strongerEvidence(allBottlenecks[key].evidenceStrength, bn.evidenceStrength);
        allBottlenecks[key].nextActionType = allBottlenecks[key].nextActionType || bn.nextActionType || '';
        allBottlenecks[key].nextActionText = allBottlenecks[key].nextActionText || bn.nextActionText || '';
      } else {
        allBottlenecks[key] = { ...bn };
      }
    }

    if (data.errorDetails) {
      const sourceFields = {
        sourceImageIndex: data.imageIndex || 0,
        sourceFileID: data.fileID || '',
        sourceOcrSummary: data.ocrSummary || '',
      };
      allErrorDetails.push(...data.errorDetails.map(item => (
        item && typeof item === 'object'
          ? { ...sourceFields, ...item }
          : item
      )));
    }

    if (Array.isArray(data.chineseErrorItems) && data.chineseErrorItems.length > 0) {
      const sourceFields = {
        sourceImageIndex: data.imageIndex || 0,
        sourceFileID: data.fileID || '',
        sourceOcrSummary: data.ocrSummary || '',
      };
      allChineseErrorItems.push(...data.chineseErrorItems.map(item => (
        item && typeof item === 'object'
          ? { ...sourceFields, ...item }
          : item
      )));
    }
  }

  const bottlenecks = Object.values(allBottlenecks)
    .sort((a, b) => b.errorCount - a.errorCount);

  const topBottlenecks = bottlenecks.slice(0, 3).map(b => b.lpName).join('、');
  const summary = `共发现 ${totalErrors} 道错题，主要卡点：${topBottlenecks || '待确认'}`;

  return {
    summary,
    totalErrors,
    bottlenecks,
    errorDetails: allErrorDetails,
    chineseErrorItems: allChineseErrorItems,
    completedAt: new Date(),
  };
}

function buildImageFiles({ fileIDs = [], initialImageFiles = [], markedPages = [], report = {} } = {}) {
  const pageByFileID = new Map(markedPages.map(page => [page.fileID, page]));
  const failedFiles = new Map((report.failedImageFiles || []).map(item => [item.fileID, item]));
  return fileIDs.map((fileID, index) => {
    const initial = initialImageFiles.find(item => item.fileID === fileID) || {};
    const page = pageByFileID.get(fileID) || {};
    const failed = failedFiles.get(fileID);
    const imageFile = {
      fileID,
      fileName: initial.fileName || `照片${index + 1}`,
      fileSize: Number(initial.fileSize) || 0,
      uploadedAt: initial.uploadedAt || report.evidenceTime || report.createdAt,
      ocrSummary: page.ocrSummary || '',
      contentFingerprint: page.contentFingerprint || '',
      isDuplicate: Boolean(page.isDuplicate),
      duplicateOf: page.duplicateOf || '',
      analysisStatus: failed ? 'failed' : (page.fileID ? 'completed' : ''),
      analysisError: failed ? failed.error : '',
    };
    if (page.pageCode) {
      imageFile.pageCode = page.pageCode;
    }
    return imageFile;
  });
}

module.exports = {
  splitFileBatches,
  assertUsableBatchResults,
  summarizeFailedBatchResults,
  batchFailureSummary,
  collectPageResults,
  mergeBatchResults,
  buildImageFiles,
};

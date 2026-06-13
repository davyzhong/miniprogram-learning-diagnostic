// Pure helpers for the analyzePhotos workflow. Keep cloud/database writes in index.js.

function splitFileBatches(fileIDs = [], batchSize = 5) {
  const batches = [];
  for (let i = 0; i < fileIDs.length; i += batchSize) {
    batches.push(fileIDs.slice(i, i + batchSize));
  }
  return batches;
}

function assertCompleteBatchResults(batchResults = []) {
  if (batchResults.some(result => !result || !result.success)) {
    throw new Error('存在未完成的图片分析批次');
  }
}

function collectPageResults(batchResults = []) {
  const pageResults = batchResults.flatMap(result => result.data.pageResults || []);
  if (pageResults.length === 0) {
    throw new Error('AI 未返回逐页分析结果');
  }
  return pageResults;
}

function mergeBatchResults(batchResults) {
  const allBottlenecks = {};
  const allErrorDetails = [];
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
      } else {
        allBottlenecks[key] = { ...bn };
      }
    }

    if (data.errorDetails) {
      allErrorDetails.push(...data.errorDetails);
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
    completedAt: new Date(),
  };
}

function buildImageFiles({ fileIDs = [], initialImageFiles = [], markedPages = [], report = {} } = {}) {
  const pageByFileID = new Map(markedPages.map(page => [page.fileID, page]));
  return fileIDs.map((fileID, index) => {
    const initial = initialImageFiles.find(item => item.fileID === fileID) || {};
    const page = pageByFileID.get(fileID) || {};
    return {
      fileID,
      fileName: initial.fileName || `照片${index + 1}`,
      fileSize: Number(initial.fileSize) || 0,
      uploadedAt: initial.uploadedAt || report.evidenceTime || report.createdAt,
      ocrSummary: page.ocrSummary || '',
      contentFingerprint: page.contentFingerprint || '',
      isDuplicate: Boolean(page.isDuplicate),
      duplicateOf: page.duplicateOf || '',
    };
  });
}

module.exports = {
  splitFileBatches,
  assertCompleteBatchResults,
  collectPageResults,
  mergeBatchResults,
  buildImageFiles,
};

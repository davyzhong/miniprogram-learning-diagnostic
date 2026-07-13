const { compareBottlenecks, buildComparisonSummary } = require('./comparison');
const { markDuplicatePages } = require('./photo-dedup');
const { buildProfileSummary } = require('./profile-summary');
const { buildReportQuality } = require('./report-quality');
const { aggregateVerificationEvidence, aggregateChineseReviewEvidence } = require('./verification-evidence');
const {
  assertUsableBatchResults,
  batchFailureSummary,
  collectPageResults,
  mergeBatchResults,
  buildImageFiles,
} = require('./pipeline');

function buildVerificationPageEvidence(pages = []) {
  const byPageCode = new Map();
  for (const page of pages || []) {
    const evidenceItems = Array.isArray(page.verificationEvidence) ? page.verificationEvidence : [];
    const pageCodeFromPage = page.pageCode || '';
    if (pageCodeFromPage && !byPageCode.has(pageCodeFromPage)) {
      byPageCode.set(pageCodeFromPage, {
        pageCode: pageCodeFromPage,
        fileIDs: new Set(),
        targetIds: new Set(),
        attemptedQuestionCount: 0,
        incorrectQuestionCount: 0,
        blankQuestionCount: 0,
        unclearQuestionCount: 0,
        missingQuestionCount: 0,
      });
    }
    for (const evidence of evidenceItems) {
      const pageCode = evidence.pageCode || pageCodeFromPage;
      if (!pageCode) continue;
      if (!byPageCode.has(pageCode)) {
        byPageCode.set(pageCode, {
          pageCode,
          fileIDs: new Set(),
          targetIds: new Set(),
          attemptedQuestionCount: 0,
          incorrectQuestionCount: 0,
          blankQuestionCount: 0,
          unclearQuestionCount: 0,
          missingQuestionCount: 0,
        });
      }
      const total = byPageCode.get(pageCode);
      if (page.fileID) total.fileIDs.add(page.fileID);
      const targetId = evidence.targetId || evidence.lpCode || '';
      if (targetId) total.targetIds.add(targetId);
      total.attemptedQuestionCount += Math.max(0, Number(evidence.attemptedQuestionCount) || 0);
      total.incorrectQuestionCount += Math.max(0, Number(evidence.incorrectQuestionCount) || 0);
      total.blankQuestionCount += Math.max(0, Number(evidence.blankQuestionCount) || 0);
      total.unclearQuestionCount += Math.max(0, Number(evidence.unclearQuestionCount) || 0);
      total.missingQuestionCount += Math.max(0, Number(evidence.missingQuestionCount) || 0);
    }
    if (pageCodeFromPage && page.fileID) byPageCode.get(pageCodeFromPage).fileIDs.add(page.fileID);
  }
  return Array.from(byPageCode.values()).map(item => ({
    ...item,
    fileIDs: Array.from(item.fileIDs),
    targetIds: Array.from(item.targetIds),
  }));
}

function createAnalysisArtifactService(deps) {
  const {
    db,
    command,
    normalizeForLookup,
    normalizeForCompare,
    getHistoricalContext,
    reanalysisSourceReportIds,
    getSubjectProfile,
    updateSubjectProfile,
    clearSubjectProfileAnalysis,
    failedBatchDebugMessage,
  } = deps;

  async function buildAnalysisArtifacts({ reportId, report, fileIDs, batches, subject, studentId, mode, verificationPaper, batchResults }) {
    assertUsableBatchResults(batchResults);
    const pageResults = collectPageResults(batchResults);
    const failedBatches = batchFailureSummary(batchResults, batches);
    const failedImageFiles = failedBatches.flatMap(item => item.fileIDs.map(fileID => ({
      fileID,
      batchIndex: item.batchIndex,
      error: item.error,
    })));
    const historicalContext = await getHistoricalContext(studentId, subject, {
      excludeReportIds: [reportId, ...reanalysisSourceReportIds(report)],
    });
    const markedPages = markDuplicatePages(pageResults, historicalContext.historicalPhotos);
    const uniquePages = markedPages.filter(page => !page.isDuplicate);
    const merged = mergeBatchResults(uniquePages.map(page => ({ success: true, data: page })), subject);
    const imageFiles = buildImageFiles({
      fileIDs,
      initialImageFiles: Array.isArray(report.imageFiles) ? report.imageFiles : [],
      markedPages,
      report: { ...report, failedImageFiles },
    });
    let previousReport = null;
    let verificationTargets = [];
    let comparisonSummary = '';
    const partialSuccess = failedBatches.length > 0;
    const analysisWarning = partialSuccess
      ? `${fileIDs.length - failedImageFiles.length}/${fileIDs.length} 张照片完成分析，${failedImageFiles.length} 张照片因超时或服务异常未纳入。`
      : '';

    if (uniquePages.length === 0) {
      merged.summary = '本次照片均疑似重复，未更新学习卡点';
      comparisonSummary = '本次照片均疑似重复，未更新学习卡点。';
    } else if (mode === 'verification') {
      const paperQuestions = verificationPaper.paper && Array.isArray(verificationPaper.paper.questions)
        ? verificationPaper.paper.questions : [];
      if (Array.isArray(merged.errorDetails) && merged.errorDetails.length > 0) {
        const answerByContent = new Map();
        for (const question of paperQuestions) {
          const content = String(question.content || question.question || question.stem || '').trim();
          const answer = String(question.answer || question.correctAnswer || '').trim();
          if (content && answer) answerByContent.set(normalizeForLookup(content), answer);
        }
        if (answerByContent.size > 0) {
          merged.errorDetails = merged.errorDetails.map(item => {
            const authoritativeAnswer = answerByContent.get(normalizeForLookup(String(item.questionContent || '')));
            return authoritativeAnswer ? { ...item, correctAnswer: authoritativeAnswer } : item;
          });
        }
        const beforeCount = merged.errorDetails.length;
        const allCorrectAnswers = new Set(paperQuestions
          .map(question => normalizeForCompare(String(question.answer || question.correctAnswer || '')))
          .filter(Boolean));
        merged.errorDetails = merged.errorDetails.filter(item => {
          const studentAnswer = normalizeForCompare(item.studentAnswer);
          const correctAnswer = normalizeForCompare(item.correctAnswer);
          if (!studentAnswer || !correctAnswer) return true;
          return studentAnswer !== correctAnswer && !allCorrectAnswers.has(studentAnswer);
        });
        merged.totalErrors = Math.max(0, (merged.totalErrors || 0) - (beforeCount - merged.errorDetails.length));
      }
      previousReport = historicalContext.previousReport;
      verificationTargets = verificationPaper.targets;
      const verificationEvidence = aggregateVerificationEvidence(verificationPaper.plan, uniquePages);
      const passedCodes = verificationEvidence.filter(item => item.evidenceStatus === 'passed').map(item => item.lpCode);
      merged.bottlenecks = compareBottlenecks(previousReport ? previousReport.bottlenecks : [], merged.bottlenecks, passedCodes);
      comparisonSummary = buildComparisonSummary(merged.bottlenecks);
      merged.verificationEvidence = verificationEvidence;
      merged.chineseReviewEvidence = aggregateChineseReviewEvidence(verificationPaper.plan, uniquePages);
      merged.verificationPageEvidence = buildVerificationPageEvidence(uniquePages);
      merged.verificationPageCodes = merged.verificationPageEvidence.map(item => item.pageCode);
    } else {
      merged.bottlenecks = merged.bottlenecks.map(item => ({ ...item, status: 'found' }));
    }

    const quality = buildReportQuality({
      report,
      uniquePages,
      merged,
      failedBatches,
      verificationEvidence: merged.verificationEvidence || [],
      allPhotosDuplicate: uniquePages.length === 0,
    });
    const profile = await getSubjectProfile(studentId, subject);
    const profileSummary = buildProfileSummary(profile || {}, {
      _id: reportId,
      type: mode,
      totalErrors: merged.totalErrors,
      bottlenecks: merged.bottlenecks,
      chineseErrorItems: merged.chineseErrorItems || [],
      verificationTargets,
      verificationEvidence: merged.verificationEvidence || [],
      chineseReviewEvidence: merged.chineseReviewEvidence || [],
      allPhotosDuplicate: uniquePages.length === 0,
    }, report.evidenceTime || report.createdAt || new Date());
    if (quality.status === 'insufficient') {
      profileSummary.isEffective = false;
      profileSummary.changeSummary = quality.reasons[0] || '本次样本不足，未更新学习卡点';
    }
    return {
      merged, quality, imageFiles, previousReport, comparisonSummary, verificationTargets,
      profile, profileSummary, partialSuccess, analysisWarning, failedBatches, failedImageFiles,
    };
  }

  async function writeCompletedAnalysis({ reportId, studentId, subject, merged, quality, imageFiles, previousReport, comparisonSummary, verificationTargets, profile, profileSummary, partialSuccess, analysisWarning, failedBatches, failedImageFiles }) {
    await db.collection('reports').doc(reportId).update({
      data: {
        status: 'completed',
        error: '',
        summary: merged.summary,
        totalErrors: merged.totalErrors,
        bottlenecks: merged.bottlenecks,
        errorDetails: merged.errorDetails,
        chineseErrorItems: merged.chineseErrorItems || [],
        imageFiles,
        previousReportId: previousReport ? previousReport._id : '',
        comparisonSummary,
        verificationTargets,
        verificationEvidence: merged.verificationEvidence || [],
        chineseReviewEvidence: merged.chineseReviewEvidence || [],
        verificationPageCodes: merged.verificationPageCodes || [],
        verificationPageEvidence: merged.verificationPageEvidence || [],
        quality: command.set(quality),
        isEffective: profileSummary.isEffective,
        changeSummary: profileSummary.changeSummary,
        partialSuccess,
        analysisWarning,
        failedBatchCount: failedBatches.length,
        failedImageFiles,
        debugError: partialSuccess ? failedBatchDebugMessage(failedBatches) : '',
        completedAt: merged.completedAt,
      },
    });
    if (profileSummary.isEffective) {
      await updateSubjectProfile(profile, profileSummary, reportId);
      await db.collection('reports').doc(reportId).update({ data: { profileAppliedAt: new Date() } });
    } else {
      await clearSubjectProfileAnalysis(studentId, subject);
    }
  }

  return { buildAnalysisArtifacts, writeCompletedAnalysis };
}

module.exports = { createAnalysisArtifactService, buildVerificationPageEvidence };

const REPORT_TIMELINE_FIELDS = {
  _id: true, studentId: true, subject: true, type: true, status: true,
  summary: true, comparisonSummary: true, paperId: true, totalErrors: true,
  bottlenecks: true, bottleneckSummaries: true,
  'imageFiles.fileID': true, imageFileIds: true,
  isArchived: true, archivedAt: true,
  evidenceTime: true, createdAt: true, updatedAt: true,
};

const PAPER_TIMELINE_FIELDS = {
  _id: true, studentId: true, subject: true, type: true,
  paperCode: true, paperDisplayCode: true,
  bottleneckTargets: true, bottleneckSummaries: true,
  questionCount: true, pdfFileId: true, paperDate: true, grade: true,
  verificationPack: true, generatedAt: true,
  createdAt: true, updatedAt: true,
};

const ENGLISH_SESSION_FIELDS = {
  _id: true, studentId: true, functionType: true, type: true, status: true,
  analysisStatus: true, wordCount: true, wordItems: true, attempts: true,
  attemptCount: true, correctAttemptCount: true, incorrectAttemptCount: true, unclearAttemptCount: true,
  dictationResults: true, photoFileIds: true,
  createdAt: true, completedAt: true, submittedAt: true, analyzedAt: true, updatedAt: true,
};

const RESOURCE_PACK_FIELDS = {
  _id: true, studentId: true, subject: true, title: true, status: true,
  target: true, estimatedMinutes: true,
  completedAt: true, scheduledVerificationAt: true,
  createdAt: true, updatedAt: true,
};

const HOME_PROFILE_FIELDS = {
  _id: true, studentId: true, subject: true, subjectName: true, totalReports: true,
  updatedAt: true, currentBottlenecks: true, pendingBottlenecks: true, improvedBottlenecks: true,
};

const HOME_REPORT_FIELDS = {
  _id: true, studentId: true, subject: true, type: true, status: true, createdAt: true,
  evidenceTime: true, updatedAt: true, summary: true, comparisonSummary: true, changeSummary: true,
  totalErrors: true, bottlenecks: true, isEffective: true,
  'imageFiles.fileID': true, imageFileIds: true,
  isArchived: true, archivedAt: true,
};

const HOME_PAPER_FIELDS = {
  _id: true, studentId: true, subject: true, type: true, createdAt: true,
  paperCode: true, paperDisplayCode: true, questionCount: true,
  generationStatus: true, pdfFileId: true,
};

function bottleneckSummaryFrom(items = []) {
  const names = items
    .map(item => item && (item.summary || item.name || item.title || item.lpName || item.label))
    .filter(Boolean);
  return Array.from(new Set(names)).slice(0, 3).join('、');
}

function paperBottleneckSummary(paper) {
  const summaries = paper && paper.bottleneckSummaries;
  if (Array.isArray(summaries) && summaries.length > 0) {
    return summaries.filter(Boolean).slice(0, 3).join('、');
  }
  return bottleneckSummaryFrom(paper && paper.questions);
}

function paperDisplayCodeOf(paper) {
  return paper && (paper.paperDisplayCode || paper.paperCode || '');
}

function reportBottleneckSummary(report) {
  return bottleneckSummaryFrom(report && report.bottlenecks);
}

function reportBottleneckSummaries(report) {
  if (Array.isArray(report && report.bottleneckSummaries) && report.bottleneckSummaries.length > 0) {
    return report.bottleneckSummaries.filter(Boolean).slice(0, 3);
  }
  const summary = reportBottleneckSummary(report);
  return summary ? summary.split('、').filter(Boolean).slice(0, 3) : [];
}

function summarizeReportForTimeline(report = {}) {
  const imageFiles = Array.isArray(report.imageFiles) ? report.imageFiles : [];
  const imageFileIds = Array.isArray(report.imageFileIds) ? report.imageFileIds : [];
  return {
    _id: report._id,
    studentId: report.studentId,
    subject: report.subject,
    type: report.type,
    status: report.status,
    summary: report.summary || '',
    comparisonSummary: report.comparisonSummary || '',
    paperId: report.paperId || '',
    totalErrors: Number(report.totalErrors) || 0,
    bottleneckSummaries: reportBottleneckSummaries(report),
    imageFileCount: imageFiles.length || imageFileIds.length || 0,
    evidenceTime: report.evidenceTime || '',
    createdAt: report.createdAt,
    updatedAt: report.updatedAt,
  };
}

function summarizePaperForTimeline(paper = {}) {
  return {
    _id: paper._id,
    studentId: paper.studentId,
    subject: paper.subject,
    type: paper.type,
    paperCode: paper.paperCode || '',
    paperDisplayCode: paperDisplayCodeOf(paper),
    bottleneckTargets: Array.isArray(paper.bottleneckTargets) ? paper.bottleneckTargets : [],
    bottleneckSummaries: Array.isArray(paper.bottleneckSummaries) ? paper.bottleneckSummaries : [],
    questionCount: Number(paper.questionCount) || (Array.isArray(paper.questions) ? paper.questions.length : 0),
    pdfFileId: paper.pdfFileId || '',
    paperDate: paper.paperDate || '',
    grade: paper.grade,
    verificationPack: paper.verificationPack || null,
    generatedAt: paper.generatedAt || '',
    createdAt: paper.createdAt,
    updatedAt: paper.updatedAt,
  };
}

function summarizeEnglishSessionForTimeline(session = {}) {
  const wordItems = Array.isArray(session.wordItems) ? session.wordItems : [];
  return {
    _id: session._id,
    studentId: session.studentId || '',
    subject: 'english',
    functionType: session.functionType || '',
    type: session.type || '',
    status: session.status || '',
    analysisStatus: session.analysisStatus || '',
    wordCount: Number(session.wordCount) || wordItems.length,
    wordItems: wordItems.slice(0, 20).map(item => ({
      wordId: item.wordId || '',
      word: item.word || item.targetWord || '',
    })),
    attempts: (session.attempts || []).map(item => ({
      wordId: item.wordId || '',
      targetWord: item.targetWord || item.word || '',
      judgment: item.judgment || null,
      status: item.status || '',
    })),
    dictationResults: (session.dictationResults || []).map(item => ({
      wordId: item.wordId || '',
      targetWord: item.targetWord || '',
      verdict: item.verdict || '',
    })),
    photoFileIds: session.photoFileIds || [],
    createdAt: session.createdAt || '',
    completedAt: session.completedAt || '',
    submittedAt: session.submittedAt || '',
    analyzedAt: session.analyzedAt || '',
    updatedAt: session.updatedAt || '',
  };
}

function summarizeLearningResourcePackForTimeline(pack = {}) {
  return {
    _id: pack._id,
    studentId: pack.studentId || '',
    subject: pack.subject || '',
    title: pack.title || '',
    status: pack.status || '',
    target: pack.target || null,
    estimatedMinutes: Number(pack.estimatedMinutes) || 0,
    completedAt: pack.completedAt || '',
    scheduledVerificationAt: pack.scheduledVerificationAt || '',
    createdAt: pack.createdAt || '',
    updatedAt: pack.updatedAt || pack.createdAt || '',
  };
}

function sessionTimeOf(session = {}) {
  return session.analyzedAt || session.completedAt || session.submittedAt || session.updatedAt || session.createdAt || '';
}

function resourcePackTimeOf(pack = {}) {
  return pack.completedAt || pack.scheduledVerificationAt || pack.updatedAt || pack.createdAt || '';
}

function sessionVerdictCounts(session = {}) {
  const source = session.functionType === 'spelling'
    ? (session.dictationResults || [])
    : (session.attempts || []);
  return source.reduce((acc, item = {}) => {
    const status = item.verdict || (item.judgment && item.judgment.status) || item.status || 'unclear';
    if (status === 'correct') acc.correctCount += 1;
    else if (status === 'incorrect') acc.incorrectCount += 1;
    else acc.unclearCount += 1;
    return acc;
  }, { correctCount: 0, incorrectCount: 0, unclearCount: 0 });
}

module.exports = {
  REPORT_TIMELINE_FIELDS,
  PAPER_TIMELINE_FIELDS,
  ENGLISH_SESSION_FIELDS,
  RESOURCE_PACK_FIELDS,
  HOME_PROFILE_FIELDS,
  HOME_REPORT_FIELDS,
  HOME_PAPER_FIELDS,
  paperBottleneckSummary,
  paperDisplayCodeOf,
  summarizeReportForTimeline,
  summarizePaperForTimeline,
  summarizeEnglishSessionForTimeline,
  summarizeLearningResourcePackForTimeline,
  sessionTimeOf,
  resourcePackTimeOf,
  sessionVerdictCounts,
};

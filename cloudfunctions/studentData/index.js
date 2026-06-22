const cloud = require('wx-server-sdk');
const {
  getStudentAccess,
  canManageFamily,
  permissionsForRole,
  isMissingCollectionError,
} = require('./access');

cloud.init({ env: cloud.SYMBOL_CURRENT_ENV });
const db = cloud.database();

const ACTIONS = new Set([
  'getStudentDashboard',
  'getSubjectDashboard',
  'getLearningTimeline',
  'getReportDetail',
  'getPaperDetail',
  'getActiveVerificationPaper',
  'cleanupStaleLearningRecords',
]);

const STATUS_REPORT_STATES = new Set(['pending', 'uploading', 'analyzing', 'failed', 'timeout']);
const STALE_STATUS_MS = 30 * 60 * 1000;

function success(data = {}) {
  return { success: true, ...data };
}

function failure(error) {
  return { success: false, error };
}

function toTime(value) {
  return value ? new Date(value).getTime() : 0;
}

function reportTimeOf(report = {}) {
  return report.updatedAt || report.evidenceTime || report.createdAt || report.created_at || '';
}

function isArchivedReport(report = {}) {
  return Boolean(report.isArchived || report.archivedAt);
}

function isStaleStatusReport(report = {}, now = Date.now()) {
  if (!STATUS_REPORT_STATES.has(report.status)) return false;
  const time = toTime(reportTimeOf(report));
  if (!time) return false;
  return now - time > STALE_STATUS_MS;
}

function visibleReports(reports = []) {
  const now = Date.now();
  return reports.filter(report => !isArchivedReport(report) && !isStaleStatusReport(report, now));
}

function normalizeSubject(subject) {
  return ['math', 'chinese', 'english'].includes(subject) ? subject : 'math';
}

function normalizeLimit(value, fallback = 20, max = 100) {
  const limit = Math.floor(Number(value) || fallback);
  return Math.min(max, Math.max(1, limit));
}

function normalizeCursor(value) {
  const text = String(value || '').trim();
  return text && !Number.isNaN(new Date(text).getTime()) ? text : '';
}

function cursorFilter(cursor) {
  return cursor ? { createdAt: db.command.lt(cursor) } : {};
}

async function getAccess(studentId, openId) {
  return getStudentAccess(db, studentId, openId);
}

function withAccess(access, data = {}) {
  return success({
    role: access.role,
    permissions: permissionsForRole(access.role),
    ...data,
  });
}

async function getSubjectProfiles(studentId) {
  const res = await db.collection('subjectProfiles').where({ studentId }).get();
  return (res.data || []).sort((a, b) => toTime(b.updatedAt) - toTime(a.updatedAt));
}

async function getReports(studentId, subject, limit = 20, cursor = '') {
  const filter = subject
    ? { studentId, subject, ...cursorFilter(cursor) }
    : { studentId, ...cursorFilter(cursor) };
  const res = await db.collection('reports')
    .where(filter)
    .orderBy('createdAt', 'desc')
    .limit(limit)
    .get();
  return visibleReports(res.data || []);
}

async function getPapers(studentId, subject, limit = 20, cursor = '') {
  const filter = subject
    ? { studentId, subject, ...cursorFilter(cursor) }
    : { studentId, ...cursorFilter(cursor) };
  const res = await db.collection('papers')
    .where(filter)
    .orderBy('createdAt', 'desc')
    .limit(limit)
    .get();
  return res.data || [];
}

async function getEnglishSessions(studentId, subject, limit = 50, cursor = '') {
  if (subject && subject !== 'english') return [];
  const filter = { studentId, ...cursorFilter(cursor) };
  const res = await db.collection('englishPracticeSessions')
    .where(filter)
    .orderBy('createdAt', 'desc')
    .limit(limit)
    .get();
  return (res.data || []).map(session => ({
    subject: 'english',
    ...session,
  }));
}

function resourceCursorFilter(cursor) {
  return cursor ? { updatedAt: db.command.lt(cursor) } : {};
}

async function getLearningResourcePacks(studentId, subject, limit = 50, cursor = '') {
  const filter = subject
    ? { studentId, subject, ...resourceCursorFilter(cursor) }
    : { studentId, ...resourceCursorFilter(cursor) };
  try {
    const res = await db.collection('learningResourcePacks')
      .where(filter)
      .orderBy('updatedAt', 'desc')
      .limit(limit)
      .get();
    return res.data || [];
  } catch (error) {
    // 集合首次访问时 CloudBase 抛 -502005，建空集合后返回 []，避免时间线崩溃
    if (isMissingCollectionError(error) && db.createCollection) {
      try { await db.createCollection('learningResourcePacks') } catch (_) {}
      return [];
    }
    throw error;
  }
}

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
    verificationEvidence: Array.isArray(report.verificationEvidence) ? report.verificationEvidence : [],
    verificationPageCodes: Array.isArray(report.verificationPageCodes) ? report.verificationPageCodes : [],
    verificationPageEvidence: Array.isArray(report.verificationPageEvidence) ? report.verificationPageEvidence : [],
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

function buildTimeline({ reports = [], papers = [], englishSessions = [], learningResourcePacks = [] }) {
  const items = [];

  reports.forEach(report => {
    items.push({
      id: `report-${report._id}`,
      type: 'report',
      subject: report.subject,
      reportId: report._id,
      status: report.status,
      summary: report.summary || report.comparisonSummary || '',
      bottleneckSummary: reportBottleneckSummary(report),
      createdAt: report.createdAt,
      occurredAt: report.evidenceTime || report.createdAt,
    });

    (report.imageFiles || []).forEach(file => {
      items.push({
        id: `upload-${file.fileID || file.fileName || `${report._id}-${items.length}`}`,
        type: 'upload',
        subject: report.subject,
        reportId: report._id,
        fileID: file.fileID || '',
        fileName: file.fileName || '',
        ocrSummary: file.ocrSummary || '',
        isDuplicate: Boolean(file.isDuplicate),
        createdAt: file.uploadedAt || report.evidenceTime || report.createdAt,
        occurredAt: file.uploadedAt || report.evidenceTime || report.createdAt,
      });
    });
  });

  papers.forEach(paper => {
    const eventTime = paper.generatedAt || paper.createdAt || paper.paperDate;
    items.push({
      id: `paper-${paper._id}`,
      type: 'paper',
      subject: paper.subject,
      paperId: paper._id,
      paperType: paper.type,
      paperCode: paper.paperCode || '',
      paperDisplayCode: paperDisplayCodeOf(paper),
      questionCount: paper.questionCount || (paper.questions || []).length,
      pdfFileId: paper.pdfFileId || '',
      bottleneckSummary: paperBottleneckSummary(paper),
      paperDate: paper.paperDate || '',
      createdAt: eventTime,
      occurredAt: eventTime,
    });
  });

  englishSessions.forEach(session => {
    const eventTime = sessionTimeOf(session);
    const isSpelling = session.functionType === 'spelling' || session.type === 'word-dictation-paper';
    items.push({
      id: `english-session-${session._id}`,
      type: isSpelling ? 'english-dictation-session' : 'english-familiarity-session',
      subject: 'english',
      sessionId: session._id,
      functionType: isSpelling ? 'spelling' : 'familiarity',
      status: session.status || '',
      analysisStatus: session.analysisStatus || '',
      wordCount: session.wordCount || (session.wordItems || []).length,
      photoFileIds: session.photoFileIds || [],
      ...sessionVerdictCounts(session),
      createdAt: eventTime,
      occurredAt: eventTime,
    });
  });

  learningResourcePacks.forEach(pack => {
    const eventTime = resourcePackTimeOf(pack);
    const completed = pack.status === 'completed';
    const title = pack.title || (pack.target && pack.target.title) || '未命名卡点';
    items.push({
      id: `learning-resource-${pack._id}`,
      type: 'learning_resource',
      subject: pack.subject,
      packId: pack._id,
      status: pack.status || '',
      title: `学习任务包：${title}`,
      summary: completed ? '已完成学习' : '待完成学习',
      estimatedMinutes: pack.estimatedMinutes || 0,
      target: pack.target || null,
      url: `/pages/learning-resource/learning-resource?packId=${encodeURIComponent(pack._id || '')}`,
      createdAt: eventTime,
      occurredAt: eventTime,
    });
  });

  return items.sort((a, b) => toTime(b.occurredAt || b.createdAt) - toTime(a.occurredAt || a.createdAt));
}

async function getStudentDashboard(openId, studentId, options = {}) {
  if (!studentId) return failure('缺少 studentId');
  const access = await getAccess(studentId, openId);
  if (!access.allowed) return failure('无权访问该学生');

  const includeRecent = options.includeRecent !== false;
  const [subjectProfiles, reports, papers] = await Promise.all([
    getSubjectProfiles(studentId),
    includeRecent ? getReports(studentId, '', 10) : Promise.resolve([]),
    includeRecent ? getPapers(studentId, '', 10) : Promise.resolve([]),
  ]);

  return withAccess(access, {
    student: access.student,
    subjectProfiles,
    latestReport: includeRecent ? (reports[0] || null) : null,
    latestPaper: includeRecent ? (papers[0] || null) : null,
    recentReports: reports,
    recentPapers: papers,
  });
}

async function getSubjectDashboard(openId, studentId, subjectValue, options = {}) {
  if (!studentId) return failure('缺少 studentId');
  const access = await getAccess(studentId, openId);
  if (!access.allowed) return failure('无权访问该学生');

  const subject = normalizeSubject(subjectValue);
  const includePapers = options.includePapers !== false;
  const reportLimit = normalizeLimit(options.reportLimit, 20, 50);
  const paperLimit = normalizeLimit(options.paperLimit, 20, 50);
  const [profiles, reports, papers] = await Promise.all([
    getSubjectProfiles(studentId),
    getReports(studentId, subject, reportLimit),
    includePapers ? getPapers(studentId, subject, paperLimit) : Promise.resolve([]),
  ]);

  return withAccess(access, {
    student: access.student,
    subject,
    profile: profiles.find(item => item.subject === subject) || null,
    reports,
    papers,
  });
}

async function getLearningTimeline(openId, studentId, subjectValue, options = {}) {
  if (!studentId) return failure('缺少 studentId');
  const access = await getAccess(studentId, openId);
  if (!access.allowed) return failure('无权访问该学生');

  const subject = subjectValue ? normalizeSubject(subjectValue) : '';
  const limit = normalizeLimit(options.limit, 20, 100);
  const cursor = normalizeCursor(options.cursor);
  const fetchLimit = normalizeLimit(limit + 1, limit + 1, 101);
  const [reports, papers, englishSessions, learningResourcePacks] = await Promise.all([
    getReports(studentId, subject, fetchLimit, cursor),
    getPapers(studentId, subject, fetchLimit, cursor),
    getEnglishSessions(studentId, subject, fetchLimit, cursor),
    getLearningResourcePacks(studentId, subject, fetchLimit, cursor),
  ]);
  const candidates = [
    ...reports.map(report => ({
      kind: 'report',
      id: report._id,
      cursor: report.createdAt || report.evidenceTime || report.updatedAt || '',
      occurredAt: report.evidenceTime || report.createdAt || report.updatedAt || '',
    })),
    ...papers.map(paper => ({
      kind: 'paper',
      id: paper._id,
      cursor: paper.createdAt || paper.generatedAt || '',
      occurredAt: paper.generatedAt || paper.createdAt || paper.paperDate || '',
    })),
    ...englishSessions.map(session => ({
      kind: 'englishSession',
      id: session._id,
      cursor: session.createdAt || sessionTimeOf(session),
      occurredAt: sessionTimeOf(session),
    })),
    ...learningResourcePacks.map(pack => ({
      kind: 'learningResourcePack',
      id: pack._id,
      cursor: pack.updatedAt || pack.createdAt || resourcePackTimeOf(pack),
      occurredAt: resourcePackTimeOf(pack),
    })),
  ].sort((a, b) => toTime(b.occurredAt || b.cursor) - toTime(a.occurredAt || a.cursor));
  const pageRecords = candidates.slice(0, limit);
  const hasMore = candidates.length > limit;
  const reportIds = new Set(pageRecords.filter(item => item.kind === 'report').map(item => item.id));
  const paperIds = new Set(pageRecords.filter(item => item.kind === 'paper').map(item => item.id));
  const sessionIds = new Set(pageRecords.filter(item => item.kind === 'englishSession').map(item => item.id));
  const packIds = new Set(pageRecords.filter(item => item.kind === 'learningResourcePack').map(item => item.id));
  const pageReports = reports.filter(report => reportIds.has(report._id)).map(summarizeReportForTimeline);
  const pagePapers = papers.filter(paper => paperIds.has(paper._id)).map(summarizePaperForTimeline);
  const pageEnglishSessions = englishSessions
    .filter(session => sessionIds.has(session._id))
    .map(summarizeEnglishSessionForTimeline);
  const pageLearningResourcePacks = learningResourcePacks
    .filter(pack => packIds.has(pack._id))
    .map(summarizeLearningResourcePackForTimeline);
  const lastRecord = pageRecords[pageRecords.length - 1] || null;

  return withAccess(access, {
    student: access.student,
    subject,
    limit,
    cursor,
    nextCursor: hasMore && lastRecord ? lastRecord.cursor : '',
    hasMore,
    reports: pageReports,
    papers: pagePapers,
    englishSessions: pageEnglishSessions,
    learningResourcePacks: pageLearningResourcePacks,
    items: buildTimeline({
      reports: pageReports,
      papers: pagePapers,
      englishSessions: pageEnglishSessions,
      learningResourcePacks: pageLearningResourcePacks,
    }),
  });
}

async function getRawReports(studentId, subject, limit = 100) {
  const filter = subject ? { studentId, subject } : { studentId };
  const res = await db.collection('reports')
    .where(filter)
    .orderBy('createdAt', 'desc')
    .limit(limit)
    .get();
  return res.data || [];
}

async function cleanupProfileAnalysisState(studentId, subject, reportIds) {
  if (!studentId || reportIds.size === 0) return;
  const profiles = await getSubjectProfiles(studentId);
  const targets = profiles.filter(profile => {
    if (subject && profile.subject !== subject) return false;
    return reportIds.has(profile.currentAnalysisId) || profile.analysisStatus === 'analyzing';
  });
  await Promise.all(targets.map(profile => db.collection('subjectProfiles').doc(profile._id).update({
    data: {
      analysisStatus: null,
      currentAnalysisId: '',
      updatedAt: new Date(),
    },
  })));
}

async function cleanupStaleLearningRecords(openId, studentId, subjectValue, dryRun = false) {
  if (!studentId) return failure('缺少 studentId');
  const access = await getAccess(studentId, openId);
  if (!access.allowed) return failure('无权访问该学生');
  if (!canManageFamily(access)) return failure('只有档案管理者可以清理历史任务');

  const subject = subjectValue ? normalizeSubject(subjectValue) : '';
  const now = Date.now();
  const reports = await getRawReports(studentId, subject, 100);
  const staleReports = reports.filter(report => !isArchivedReport(report) && isStaleStatusReport(report, now));
  const archivedAt = new Date();

  if (dryRun) {
    return withAccess(access, {
      cleanedCount: staleReports.length,
      cleanedReportIds: staleReports.map(report => report._id),
      staleItems: staleReports.map(report => ({
        reportId: report._id,
        subject: report.subject || '',
        status: report.status || '',
        updatedAt: reportTimeOf(report),
      })),
      dryRun: true,
    });
  }

  await Promise.all(staleReports.map(report => db.collection('reports').doc(report._id).update({
    data: {
      isArchived: true,
      archivedAt,
      archivedReason: 'stale-analysis-cleanup',
      status: report.status === 'analyzing' || report.status === 'pending' || report.status === 'uploading'
        ? 'timeout'
        : report.status,
      updatedAt: archivedAt,
    },
  })));

  await cleanupProfileAnalysisState(studentId, subject, new Set(staleReports.map(report => report._id)));

  return withAccess(access, {
    cleanedCount: staleReports.length,
    cleanedReportIds: staleReports.map(report => report._id),
  });
}

async function getReportDetail(openId, reportId) {
  if (!reportId) return failure('缺少 reportId');
  const reportRes = await db.collection('reports').doc(reportId).get();
  const report = reportRes.data;
  if (!report) return failure('报告不存在');
  const access = await getAccess(report.studentId, openId);
  if (!access.allowed) return failure('无权访问该学生');
  let profile = null;
  try {
    const profileRes = await db.collection('subjectProfiles')
      .where({ studentId: report.studentId, subject: normalizeSubject(report.subject) })
      .limit(1)
      .get();
    profile = (profileRes.data || [])[0] || null;
  } catch (e) {
    profile = null;
  }
  const pendingCount = profile
    ? (Array.isArray(profile.currentBottlenecks)
      ? profile.currentBottlenecks.filter(item => item.status !== 'improved').length
      : (profile.pendingBottlenecks || []).length)
    : 0;
  let linkedPaper = null;
  if (report.paperId) {
    try {
      const paperRes = await db.collection('papers').doc(report.paperId).get();
      linkedPaper = paperRes.data || null;
    } catch (e) {
      linkedPaper = null;
    }
  }
  return withAccess(access, { student: access.student, report, linkedPaper, profile, pendingCount });
}

async function getPaperDetail(openId, paperId) {
  if (!paperId) return failure('缺少 paperId');
  const paperRes = await db.collection('papers').doc(paperId).get();
  const paper = paperRes.data;
  if (!paper) return failure('试卷不存在');
  const access = await getAccess(paper.studentId, openId);
  if (!access.allowed) return failure('无权访问该学生');

  const reports = await db.collection('reports')
    .where({ paperId, type: 'verification' })
    .orderBy('createdAt', 'desc')
    .limit(1)
    .get();
  return withAccess(access, {
    student: access.student,
    paper,
    latestVerificationReport: (reports.data || [])[0] || null,
  });
}

async function getActiveVerificationPaper(openId, studentId, subject, reportId) {
  if (!studentId) return failure('缺少 studentId');
  const access = await getAccess(studentId, openId);
  if (!access.allowed) return failure('无权访问该学生');

  // 构建查询条件：如果有 reportId，优先查该报告关联的验证卷（paper.triggeredByReport）
  const where = { studentId, subject, type: 'verification' };
  if (reportId) {
    where.triggeredByReport = reportId;
  }

  // 查最近 5 份验证卷，按优先级返回状态
  const res = await db.collection('papers')
    .where(where)
    .orderBy('createdAt', 'desc')
    .limit(5)
    .get();
  const papers = res.data || [];

  // 如果按 reportId 查不到，且传了 reportId，回退到学科维度（兼容旧数据）
  if (papers.length === 0 && reportId) {
    const fallbackRes = await db.collection('papers')
      .where({ studentId, subject, type: 'verification' })
      .orderBy('createdAt', 'desc')
      .limit(5)
      .get();
    papers.push(...(fallbackRes.data || []));
  }

  const hasPdfFile = paper => !!(paper && String(paper.pdfFileId || '').trim());
  const ready = papers.find(p => (p.generationStatus === 'ready' || !p.generationStatus) && hasPdfFile(p));
  if (ready) return withAccess(access, { paper: ready, status: 'ready' });

  const generating = papers.find(p => p.generationStatus === 'generating' || p.generationStatus === 'appending');
  if (generating) return withAccess(access, { paper: generating, status: 'generating' });

  const failed = papers.find(p => p.generationStatus === 'failed');
  if (failed) return withAccess(access, { paper: failed, status: 'failed' });

  const readyWithoutPdf = papers.find(p => p.generationStatus === 'ready' && !hasPdfFile(p));
  if (readyWithoutPdf) {
    return withAccess(access, {
      paper: {
        ...readyWithoutPdf,
        generationError: readyWithoutPdf.generationError || 'PDF 文件未生成',
      },
      status: 'failed',
    });
  }

  return withAccess(access, { paper: null, status: 'none' });
}

exports.main = async (event = {}) => {
  const wxContext = cloud.getWXContext();
  const openId = wxContext.OPENID;
  const action = event.action;

  if (!ACTIONS.has(action)) {
    return failure('操作类型无效');
  }

  try {
    if (action === 'getStudentDashboard') {
      return getStudentDashboard(openId, event.studentId, {
        includeRecent: event.includeRecent,
      });
    }
    if (action === 'getSubjectDashboard') {
      return getSubjectDashboard(openId, event.studentId, event.subject, {
        includePapers: event.includePapers,
        reportLimit: event.reportLimit,
        paperLimit: event.paperLimit,
      });
    }
    if (action === 'getLearningTimeline') {
      return getLearningTimeline(openId, event.studentId, event.subject, {
        limit: event.limit,
        cursor: event.cursor,
      });
    }
    if (action === 'getReportDetail') {
      return getReportDetail(openId, event.reportId);
    }
    if (action === 'getPaperDetail') {
      return getPaperDetail(openId, event.paperId);
    }
    if (action === 'getActiveVerificationPaper') {
      return getActiveVerificationPaper(openId, event.studentId, event.subject, event.reportId);
    }
    if (action === 'cleanupStaleLearningRecords') {
      return cleanupStaleLearningRecords(openId, event.studentId, event.subject, event.dryRun === true);
    }
    return failure('操作类型无效');
  } catch (error) {
    console.error('[studentData] failed:', error && error.message ? error.message : error);
    return failure('学习数据读取失败，请稍后重试');
  }
};

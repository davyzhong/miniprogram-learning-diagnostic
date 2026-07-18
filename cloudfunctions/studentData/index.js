const cloud = require('wx-server-sdk');
const {
  getStudentAccess,
  canManageFamily,
  permissionsForRole,
  isMissingCollectionError,
} = require('./access');
const { publicStudent } = require('./student-dto');
const { createHomeDashboard } = require('./home-dashboard');
const {
  REPORT_TIMELINE_FIELDS,
  PAPER_TIMELINE_FIELDS,
  ENGLISH_SESSION_FIELDS,
  RESOURCE_PACK_FIELDS,
  HOME_REPORT_FIELDS,
  paperBottleneckSummary,
  paperDisplayCodeOf,
  summarizeReportForTimeline,
  summarizePaperForTimeline,
  summarizeEnglishSessionForTimeline,
  summarizeLearningResourcePackForTimeline,
  sessionTimeOf,
  resourcePackTimeOf,
  sessionVerdictCounts,
} = require('./timeline-dto');
const { loadLatestFormalDiagnoses } = require('./formal-diagnosis');
const { taskFor, verdict } = require('./chinese-skill-tasks');
const { createRecentImageFileNames } = require('./recent-image-file-names');
// 验证卷续跑链每一步都会写 updatedAt；超过该阈值无写入视为调度中断（卡死）
const VERIFICATION_STALE_MS = 10 * 60 * 1000;

cloud.init({ env: cloud.SYMBOL_CURRENT_ENV });
const db = cloud.database();
const nodeMasteryService = require('./node-mastery-service').createNodeMasteryService({ db });

const ACTIONS = new Set([
  'getHomeDashboard',
  'getStudentDashboard',
  'getSubjectDashboard',
  'getLearningTimeline',
  'listRecentImageFileNames',
  'getReportDetail',
  'getPaperDetail',
  'getActiveVerificationPaper',
  'getLearningProgress',
  'cleanupStaleLearningRecords',
  'getChineseSkillTask',
  'submitChineseSkillTask',
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

function publicFeedback(item = {}) {
  return {
    _id: item._id,
    reportId: item.reportId,
    studentId: item.studentId,
    subject: item.subject,
    type: item.type,
    targetType: item.targetType,
    targetId: item.targetId,
    reason: item.reason,
    note: item.note,
    status: item.status,
    createdAt: item.createdAt,
    updatedAt: item.updatedAt,
  };
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
    .field(REPORT_TIMELINE_FIELDS)
    .get();
  return visibleReports(res.data || []);
}

async function getLatestFormalDiagnoses(studentId) {
  return loadLatestFormalDiagnoses(async (subject, offset, limit) => {
    try {
      const res = await db.collection('reports')
        .where({ studentId, subject })
        .orderBy('createdAt', 'desc')
        .skip(offset)
        .limit(limit)
        .field(HOME_REPORT_FIELDS)
        .get();
      return res.data || [];
    } catch (error) {
      if (isMissingCollectionError(error)) return [];
      throw error;
    }
  });
}

async function getPapers(studentId, subject, limit = 20, cursor = '') {
  const filter = subject
    ? { studentId, subject, ...cursorFilter(cursor) }
    : { studentId, ...cursorFilter(cursor) };
  const res = await db.collection('papers')
    .where(filter)
    .orderBy('createdAt', 'desc')
    .limit(limit)
    .field(PAPER_TIMELINE_FIELDS)
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
    .field(ENGLISH_SESSION_FIELDS)
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
      .field(RESOURCE_PACK_FIELDS)
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

const getHomeDashboard = createHomeDashboard({
  db,
  permissionsForRole,
  isMissingCollectionError,
  visibleReports,
  toTime,
});

async function getStudentDashboard(openId, studentId, options = {}) {
  if (!studentId) return failure('缺少 studentId');
  const access = await getAccess(studentId, openId);
  if (!access.allowed) return failure('无权访问该学生');

  const includeRecent = options.includeRecent !== false;
  const [subjectProfiles, reports, papers, latestDiagnosisReports] = await Promise.all([
    getSubjectProfiles(studentId),
    includeRecent ? getReports(studentId, '', 10) : Promise.resolve([]),
    includeRecent ? getPapers(studentId, '', 10) : Promise.resolve([]),
    includeRecent ? getLatestFormalDiagnoses(studentId) : Promise.resolve([]),
  ]);

  return withAccess(access, {
    student: publicStudent(access.student),
    subjectProfiles,
    latestReport: includeRecent ? (reports[0] || null) : null,
    latestDiagnosisReports,
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
    student: publicStudent(access.student),
    subject,
    profile: profiles.find(item => item.subject === subject) || null,
    reports,
    papers,
  });
}

async function getChineseSkillTask(openId, studentId) {
  const access = await getAccess(studentId, openId);
  if (!access.allowed) return failure('无权访问该学生');
  const profiles = await getSubjectProfiles(studentId);
  const profile = profiles.find(item => item.subject === 'chinese') || {};
  return withAccess(access, { task: taskFor(profile) });
}

async function submitChineseSkillTask(openId, event = {}) {
  const access = await getAccess(event.studentId, openId);
  if (!access.allowed) return failure('无权操作该学生');
  const profiles = await getSubjectProfiles(event.studentId);
  const profile = profiles.find(item => item.subject === 'chinese') || {};
  const task = taskFor(profile);
  if (event.taskId && event.taskId !== task.id) return failure('任务已更新，请重新进入');
  const answer = String(event.answer || '').trim().slice(0, 500);
  const evidenceStatus = verdict(answer, task);
  await db.collection('chineseSkillAttempts').add({ data: { studentId: event.studentId, taskId: task.id, taskType: task.type, answer, evidenceStatus, createdAt: db.serverDate(), updatedAt: db.serverDate() } });
  return withAccess(access, { evidenceStatus, task });
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
    student: publicStudent(access.student),
    subject,
    limit,
    cursor,
    nextCursor: hasMore && lastRecord ? lastRecord.cursor : '',
    hasMore,
    reports: pageReports,
    papers: pagePapers,
    englishSessions: pageEnglishSessions,
    learningResourcePacks: pageLearningResourcePacks,
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
const listRecentImageFileNames = createRecentImageFileNames({ db, normalizeSubject, normalizeLimit, isArchivedReport });
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

async function getReportSubjectProfile(report) {
  try {
    const profileRes = await db.collection('subjectProfiles')
      .where({ studentId: report.studentId, subject: normalizeSubject(report.subject) })
      .limit(1)
      .get();
    return (profileRes.data || [])[0] || null;
  } catch (e) {
    return null;
  }
}

async function getLinkedPaper(report) {
  if (!report.paperId) return null;
  try {
    const paperRes = await db.collection('papers').doc(report.paperId).get();
    return paperRes.data || null;
  } catch (e) {
    return null;
  }
}

async function getReportFeedbackItems(report) {
  try {
    const feedbackRes = await db.collection('reportFeedback')
      .where({ reportId: report._id })
      .orderBy('createdAt', 'desc')
      .limit(100)
      .get();
    return (feedbackRes.data || []).map(publicFeedback);
  } catch (error) {
    if (isMissingCollectionError(error)) return [];
    console.warn('[studentData] report feedback unavailable:', error && error.message ? error.message : error);
    return [];
  }
}

// 报告详情 DTO：剥离 report 页不消费的调试/原始 AI 字段
const REPORT_DETAIL_STRIP_FIELDS = new Set([
  'pageResults', 'rawPages', 'aiRaw', 'rawResponse',
]);

function stripReportDebugFields(report) {
  if (!report || typeof report !== 'object') return report;
  const out = {};
  for (const key of Object.keys(report)) {
    if (!REPORT_DETAIL_STRIP_FIELDS.has(key)) out[key] = report[key];
  }
  return out;
}

async function getReportDetail(openId, reportId) {
  if (!reportId) return failure('缺少 reportId');
  const reportRes = await db.collection('reports').doc(reportId).get();
  const report = reportRes.data;
  if (!report) return failure('报告不存在');
  const access = await getAccess(report.studentId, openId);
  if (!access.allowed) return failure('无权访问该学生');
  // 反馈改为按需加载（前端 loadFeedbackItems 已有 fallback 到 cloud.getReportFeedback）
  const [profile, linkedPaper] = await Promise.all([
    getReportSubjectProfile(report),
    getLinkedPaper(report),
  ]);
  const pendingCount = profile
    ? (Array.isArray(profile.currentBottlenecks)
      ? profile.currentBottlenecks.filter(item => item.status !== 'improved').length
      : (profile.pendingBottlenecks || []).length)
    : 0;

  // 查找关联的验证报告（诊断报告 → 验证卷 → 验证报告）
  let linkedVerificationReport = null;
  if (report.type === 'diagnosis') {
    // 先查该诊断报告触发的验证卷
    const paperRes = await db.collection('papers')
      .where({ triggeredByReport: reportId, type: 'verification' })
      .orderBy('createdAt', 'desc')
      .limit(1)
      .get();
    const paper = (paperRes.data || [])[0];
    if (paper) {
      // 再查该验证卷对应的验证报告
      const verReportRes = await db.collection('reports')
        .where({ paperId: paper._id, type: 'verification', status: 'completed' })
        .orderBy('createdAt', 'desc')
        .limit(1)
        .get();
      const verReport = (verReportRes.data || [])[0];
      if (verReport) {
        linkedVerificationReport = {
          reportId: verReport._id,
          createdAt: verReport.createdAt,
          totalErrors: verReport.totalErrors || 0,
          comparisonSummary: verReport.comparisonSummary || '',
          changeSummary: verReport.changeSummary || '',
          verificationEvidence: (verReport.verificationEvidence || []).map(e => ({
            lpCode: e.lpCode,
            lpName: e.lpName || e.displayName || '',
            evidenceStatus: e.evidenceStatus || '',
            attemptedQuestionCount: e.attemptedQuestionCount || 0,
            incorrectQuestionCount: e.incorrectQuestionCount || 0,
          })),
          bottlenecks: (verReport.bottlenecks || []).map(b => ({
            lpCode: b.lpCode,
            lpName: b.lpName || '',
            status: b.status || '',
            errorCount: b.errorCount || 0,
          })),
        };
      }
    }
  }

  return withAccess(access, {
    report: stripReportDebugFields(report),
    linkedPaper,
    profile,
    pendingCount,
    linkedVerificationReport,
  });
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
    student: publicStudent(access.student),
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
  if (generating) {
    // 卡死检测：续跑链每步都会写 updatedAt，超过阈值无写入视为调度中断，前端可引导恢复
    const lastWrite = new Date(generating.updatedAt || generating.generatedAt || generating.createdAt || 0).getTime();
    const stale = !!(lastWrite && Date.now() - lastWrite > VERIFICATION_STALE_MS);
    return withAccess(access, { paper: generating, status: 'generating', stale });
  }

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

async function getLearningProgress(openId, studentId, subject) {
  if (!studentId) return failure('缺少 studentId');
  const access = await getAccess(studentId, openId);
  if (!access.allowed) return failure('无权访问该学生');
  const normalizedSubject = normalizeSubject(subject);

  // 查所有已完成的诊断+验证报告（按时间正序）
  const reportRes = await db.collection('reports')
    .where({ studentId, subject: normalizedSubject, status: 'completed' })
    .orderBy('createdAt', 'asc')
    .limit(50)
    .get();
  const allReports = (reportRes.data || []).filter(r => !isArchivedReport(r));

  // 构建迭代时间线节点
  const timeline = allReports.map(r => {
    const isVerification = r.type === 'verification';
    const node = {
      reportId: r._id,
      type: r.type || 'diagnosis',
      createdAt: r.createdAt,
      totalErrors: r.totalErrors || 0,
      bottleneckCount: (r.bottlenecks || []).length,
      summary: (r.changeSummary || r.comparisonSummary || r.summary || '').slice(0, 100),
      isVerification,
    };
    if (isVerification) {
      const evidence = r.verificationEvidence || [];
      node.verificationPassed = evidence.filter(e => e.evidenceStatus === 'passed').length;
      node.verificationFailed = evidence.filter(e => e.evidenceStatus === 'failed').length;
      node.verificationUncertain = evidence.filter(e =>
        e.evidenceStatus === 'unclear' || e.evidenceStatus === 'incomplete' || e.evidenceStatus === 'missing'
      ).length;
      node.improvedBottlenecks = (r.bottlenecks || [])
        .filter(b => b.status === 'improved')
        .map(b => b.lpName || b.lpCode);
      node.previousReportId = r.previousReportId || '';
    }
    return node;
  });

  // 查 profile 的当前卡点状态
  const profileRes = await db.collection('subjectProfiles')
    .where({ studentId })
    .limit(1)
    .get();
  const profile = (profileRes.data || []).find(p => p.subject === normalizedSubject) || null;

  // 构建卡点状态矩阵：每行一个卡点，每列一个轮次
  const bottleneckMap = new Map(); // lpCode → { lpName, statuses: [{reportId, status}] }
  for (const r of allReports) {
    for (const b of (r.bottlenecks || [])) {
      if (!b.lpCode) continue;
      if (!bottleneckMap.has(b.lpCode)) {
        bottleneckMap.set(b.lpCode, { lpCode: b.lpCode, lpName: b.lpName || b.lpCode, statuses: [] });
      }
      const entry = bottleneckMap.get(b.lpCode);
      entry.statuses.push({ reportId: r._id, status: b.status || 'found', errorCount: b.errorCount || 0 });
    }
  }

  // 当前卡点状态（从 profile 取最新合并状态）
  const currentBottlenecks = profile && Array.isArray(profile.currentBottlenecks)
    ? profile.currentBottlenecks
    : [];

  // 综合建议
  const improvedCount = currentBottlenecks.filter(b => b.status === 'improved').length;
  const persistingCount = currentBottlenecks.filter(b => b.status === 'persisting' || b.status === 'worsened').length;
  const pendingCount = currentBottlenecks.filter(b => b.status === 'needs_verification' || b.status === 'found').length;

  let overallAdvice = '';
  if (persistingCount > 0) {
    overallAdvice = `${persistingCount} 个卡点仍需重点练习，建议优先攻克这些薄弱环节后再做验证。`;
  } else if (pendingCount > 0) {
    overallAdvice = `${pendingCount} 个卡点等待验证，建议完成验证卷确认改善情况。`;
  } else if (improvedCount > 0) {
    overallAdvice = `${improvedCount} 个卡点已改善，建议继续拍照诊断发现新的学习情况。`;
  } else {
    overallAdvice = '暂无学习卡点数据，建议先完成一次诊断。';
  }

  return withAccess(access, {
    timeline,
    bottleneckMatrix: Array.from(bottleneckMap.values()),
    currentBottlenecks: currentBottlenecks.map(b => ({
      lpCode: b.lpCode,
      lpName: b.lpName || b.lpCode,
      status: b.status || 'found',
      errorCount: b.errorCount || 0,
    })),
    summary: {
      totalRounds: timeline.length,
      diagnosisCount: timeline.filter(t => t.type === 'diagnosis').length,
      verificationCount: timeline.filter(t => t.type === 'verification').length,
      improvedCount,
      persistingCount,
      pendingCount,
    },
    overallAdvice,
  });
}

exports.main = async (event = {}) => {
  const openId = cloud.getWXContext().OPENID;
  const action = event.action;

  if (action === 'getNodeMasteryMap') return nodeMasteryService.getNodeMasteryMap(openId, event.studentId, event.subject);
  if (!ACTIONS.has(action)) {
    return failure('操作类型无效');
  }

  try {
    if (action === 'getHomeDashboard') {
      return getHomeDashboard(openId);
    }
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
    if (action === 'listRecentImageFileNames') return listRecentImageFileNames(openId, event);
    if (action === 'getChineseSkillTask') return getChineseSkillTask(openId, event.studentId)
    if (action === 'submitChineseSkillTask') return submitChineseSkillTask(openId, event)
    if (action === 'getReportDetail') {
      return getReportDetail(openId, event.reportId);
    }
    if (action === 'getPaperDetail') {
      return getPaperDetail(openId, event.paperId);
    }
    if (action === 'getActiveVerificationPaper') {
      return getActiveVerificationPaper(openId, event.studentId, event.subject, event.reportId);
    }
    if (action === 'getLearningProgress') {
      return getLearningProgress(openId, event.studentId, event.subject);
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

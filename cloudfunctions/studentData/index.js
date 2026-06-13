const cloud = require('wx-server-sdk');

cloud.init({ env: cloud.SYMBOL_CURRENT_ENV });
const db = cloud.database();

const ACTIONS = new Set([
  'getStudentDashboard',
  'getSubjectDashboard',
  'getLearningTimeline',
  'getReportDetail',
  'getPaperDetail',
]);

function success(data = {}) {
  return { success: true, ...data };
}

function failure(error) {
  return { success: false, error };
}

function toTime(value) {
  return value ? new Date(value).getTime() : 0;
}

function permissionsForRole(role) {
  const owner = role === 'owner';
  return {
    canView: true,
    canManageParents: owner,
    canUpload: owner,
    canGeneratePaper: owner,
    canRetryAnalysis: owner,
  };
}

function normalizeSubject(subject) {
  return ['math', 'chinese', 'english'].includes(subject) ? subject : 'math';
}

function isActive(member) {
  return member && member.status === 'active';
}

async function getStudent(studentId) {
  if (!studentId) return null;
  const res = await db.collection('students').doc(studentId).get();
  return res.data || null;
}

async function getMember(studentId, memberOpenId) {
  const res = await db.collection('studentMembers').where({ studentId, memberOpenId }).get();
  return (res.data || []).find(isActive) || null;
}

async function getAccess(studentId, openId) {
  const student = await getStudent(studentId);
  if (!student) return { allowed: false, role: '', student: null };
  if (student._openid && student._openid === openId) {
    return { allowed: true, role: 'owner', student };
  }
  const member = await getMember(studentId, openId);
  if (member) {
    return { allowed: true, role: member.role || 'viewer', student, member };
  }
  return { allowed: false, role: '', student };
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

async function getReports(studentId, subject, limit = 20) {
  const filter = subject ? { studentId, subject } : { studentId };
  const res = await db.collection('reports')
    .where(filter)
    .orderBy('createdAt', 'desc')
    .limit(limit)
    .get();
  return res.data || [];
}

async function getPapers(studentId, subject, limit = 20) {
  const filter = subject ? { studentId, subject } : { studentId };
  const res = await db.collection('papers')
    .where(filter)
    .orderBy('createdAt', 'desc')
    .limit(limit)
    .get();
  return res.data || [];
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

function buildTimeline({ reports = [], papers = [] }) {
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

  return items.sort((a, b) => toTime(b.occurredAt || b.createdAt) - toTime(a.occurredAt || a.createdAt));
}

async function getStudentDashboard(openId, studentId) {
  if (!studentId) return failure('缺少 studentId');
  const access = await getAccess(studentId, openId);
  if (!access.allowed) return failure('无权访问该学生');

  const [subjectProfiles, reports, papers] = await Promise.all([
    getSubjectProfiles(studentId),
    getReports(studentId, '', 10),
    getPapers(studentId, '', 10),
  ]);

  return withAccess(access, {
    student: access.student,
    subjectProfiles,
    latestReport: reports[0] || null,
    latestPaper: papers[0] || null,
    recentReports: reports,
    recentPapers: papers,
  });
}

async function getSubjectDashboard(openId, studentId, subjectValue) {
  if (!studentId) return failure('缺少 studentId');
  const access = await getAccess(studentId, openId);
  if (!access.allowed) return failure('无权访问该学生');

  const subject = normalizeSubject(subjectValue);
  const [profiles, reports, papers] = await Promise.all([
    getSubjectProfiles(studentId),
    getReports(studentId, subject, 20),
    getPapers(studentId, subject, 20),
  ]);

  return withAccess(access, {
    student: access.student,
    subject,
    profile: profiles.find(item => item.subject === subject) || null,
    reports,
    papers,
  });
}

async function getLearningTimeline(openId, studentId, subjectValue) {
  if (!studentId) return failure('缺少 studentId');
  const access = await getAccess(studentId, openId);
  if (!access.allowed) return failure('无权访问该学生');

  const subject = subjectValue ? normalizeSubject(subjectValue) : '';
  const [reports, papers] = await Promise.all([
    getReports(studentId, subject, 50),
    getPapers(studentId, subject, 50),
  ]);

  return withAccess(access, {
    student: access.student,
    subject,
    reports,
    papers,
    items: buildTimeline({ reports, papers }),
  });
}

async function getReportDetail(openId, reportId) {
  if (!reportId) return failure('缺少 reportId');
  const reportRes = await db.collection('reports').doc(reportId).get();
  const report = reportRes.data;
  if (!report) return failure('报告不存在');
  const access = await getAccess(report.studentId, openId);
  if (!access.allowed) return failure('无权访问该学生');
  let linkedPaper = null;
  if (report.paperId) {
    try {
      const paperRes = await db.collection('papers').doc(report.paperId).get();
      linkedPaper = paperRes.data || null;
    } catch (e) {
      linkedPaper = null;
    }
  }
  return withAccess(access, { student: access.student, report, linkedPaper });
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

exports.main = async (event = {}) => {
  const wxContext = cloud.getWXContext();
  const openId = wxContext.OPENID;
  const action = event.action;

  if (!ACTIONS.has(action)) {
    return failure('操作类型无效');
  }

  try {
    if (action === 'getStudentDashboard') {
      return getStudentDashboard(openId, event.studentId);
    }
    if (action === 'getSubjectDashboard') {
      return getSubjectDashboard(openId, event.studentId, event.subject);
    }
    if (action === 'getLearningTimeline') {
      return getLearningTimeline(openId, event.studentId, event.subject);
    }
    if (action === 'getReportDetail') {
      return getReportDetail(openId, event.reportId);
    }
    if (action === 'getPaperDetail') {
      return getPaperDetail(openId, event.paperId);
    }
    return failure('操作类型无效');
  } catch (error) {
    console.error('[studentData] failed:', error && error.message ? error.message : error);
    return failure('学习数据读取失败，请稍后重试');
  }
};

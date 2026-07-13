const { publicStudent } = require('./student-dto');
const {
  HOME_PROFILE_FIELDS,
  HOME_REPORT_FIELDS,
  HOME_PAPER_FIELDS,
} = require('./timeline-dto');
const {
  FORMAL_DIAGNOSIS_SUBJECTS,
  isFormalDiagnosis,
  latestFormalDiagnoses,
  summarizeFormalDiagnosis,
} = require('./formal-diagnosis');

const MAX_FALLBACK_SCAN_PAGES = 10;

function profileSummary(profile) {
  if (!profile) return null;
  return {
    _id: profile._id,
    studentId: profile.studentId,
    subject: profile.subject,
    subjectName: profile.subjectName,
    totalReports: profile.totalReports || 0,
    updatedAt: profile.updatedAt,
    currentBottlenecks: profile.currentBottlenecks || [],
    pendingBottlenecks: profile.pendingBottlenecks || [],
    improvedBottlenecks: profile.improvedBottlenecks || [],
  };
}

function reportSummary(report) {
  if (!report) return null;
  return {
    _id: report._id,
    studentId: report.studentId,
    subject: report.subject,
    type: report.type,
    status: report.status,
    createdAt: report.createdAt,
    evidenceTime: report.evidenceTime,
    summary: report.summary || '',
    totalErrors: report.totalErrors || 0,
    bottlenecks: (report.bottlenecks || []).map(b => ({
      lpCode: b.lpCode,
      lpName: b.lpName,
      errorCount: b.errorCount,
    })),
  };
}

function paperSummary(paper) {
  if (!paper) return null;
  return {
    _id: paper._id,
    studentId: paper.studentId,
    subject: paper.subject,
    type: paper.type,
    createdAt: paper.createdAt,
    paperCode: paper.paperCode || '',
    paperDisplayCode: paper.paperDisplayCode || '',
    questionCount: paper.questionCount || 0,
    generationStatus: paper.generationStatus || '',
    pdfFileId: paper.pdfFileId || '',
  };
}

function createHomeDashboard({ db, permissionsForRole, isMissingCollectionError, visibleReports, toTime }) {
  async function safeGetCollection(name, filter) {
    try {
      const res = await db.collection(name).where(filter).get();
      return res.data || [];
    } catch (error) {
      if (isMissingCollectionError(error)) return [];
      throw error;
    }
  }

  async function safeQueryLimited(name, filter, orderByField, orderByDir, limit, projection, offset = 0) {
    try {
      let query = db.collection(name).where(filter);
      if (projection) query = query.field(projection);
      const res = await query.orderBy(orderByField, orderByDir).skip(offset).limit(limit).get();
      return res.data || [];
    } catch (error) {
      if (isMissingCollectionError(error)) return [];
      throw error;
    }
  }

  async function findLatestHomeRecord(name, studentId, projection, predicate) {
    for (let page = 0; page < MAX_FALLBACK_SCAN_PAGES; page += 1) {
      const rows = await safeQueryLimited(name, { studentId }, 'createdAt', 'desc', 100, projection, page * 100);
      const match = rows.find(predicate);
      if (match || rows.length < 100) return match || null;
    }
    return null;
  }

  async function findLatestFormalDiagnosis(studentId, subject) {
    for (let page = 0; page < MAX_FALLBACK_SCAN_PAGES; page += 1) {
      const rows = await safeQueryLimited(
        'reports',
        { studentId, subject },
        'createdAt',
        'desc',
        100,
        HOME_REPORT_FIELDS,
        page * 100
      );
      const match = rows.find(isFormalDiagnosis);
      if (match || rows.length < 100) return match ? summarizeFormalDiagnosis(match) : null;
    }
    return null;
  }

  return async function getHomeDashboard(openId) {
    if (!openId) return { success: false, error: '未登录' };
    const _ = db.command;
    const ownedRes = await db.collection('students').where({ _openid: openId }).get();
    const joinedMembers = await safeGetCollection('studentMembers', { memberOpenId: openId, status: 'active' });
    const byId = new Map();

    for (const student of ownedRes.data || []) {
      byId.set(student._id, { ...publicStudent(student), role: 'owner', permissions: permissionsForRole('owner') });
    }
    const missingStudentIds = joinedMembers.filter(member => !byId.has(member.studentId)).map(member => member.studentId);
    if (missingStudentIds.length > 0) {
      const joinedRes = await db.collection('students').where({ _id: _.in(missingStudentIds) }).get();
      const joinedById = new Map((joinedRes.data || []).map(student => [student._id, student]));
      for (const member of joinedMembers) {
        const student = joinedById.get(member.studentId);
        if (!student) continue;
        const role = member.role || 'viewer';
        byId.set(student._id, { ...publicStudent(student), role, permissions: permissionsForRole(role) });
      }
    }

    const students = Array.from(byId.values()).sort((a, b) => toTime(b.createdAt) - toTime(a.createdAt));
    if (students.length === 0) return { success: true, students: [], perStudent: {} };
    const allStudentIds = students.map(student => student._id);
    const homeBatchLimit = Math.min(100, Math.max(10, 10 * allStudentIds.length));
    const [profileRows, reportRows, paperRows, ...diagnosisRowsBySubject] = await Promise.all([
      safeQueryLimited('subjectProfiles', { studentId: _.in(allStudentIds) }, 'updatedAt', 'desc', 100, HOME_PROFILE_FIELDS),
      safeQueryLimited('reports', { studentId: _.in(allStudentIds) }, 'createdAt', 'desc', homeBatchLimit, HOME_REPORT_FIELDS),
      safeQueryLimited('papers', { studentId: _.in(allStudentIds) }, 'createdAt', 'desc', homeBatchLimit, HOME_PAPER_FIELDS),
      ...FORMAL_DIAGNOSIS_SUBJECTS.map(subject => (
        safeQueryLimited('reports', { studentId: _.in(allStudentIds), subject }, 'createdAt', 'desc', homeBatchLimit, HOME_REPORT_FIELDS)
      )),
    ]);
    const allProfiles = [...profileRows];
    const allReports = [...reportRows];
    const allPapers = [...paperRows];
    const missingProfileIds = profileRows.length < 100 ? [] : allStudentIds.filter(studentId => !profileRows.some(row => row.studentId === studentId));
    const missingReportIds = reportRows.length < homeBatchLimit ? [] : allStudentIds.filter(studentId => (
      visibleReports(reportRows.filter(report => report.studentId === studentId)).length === 0
    ));
    const missingPaperIds = paperRows.length < homeBatchLimit ? [] : allStudentIds.filter(studentId => !paperRows.some(row => row.studentId === studentId));
    const [profileFallbacks, reportFallbacks, paperFallbacks] = await Promise.all([
      Promise.all(missingProfileIds.map(studentId => safeQueryLimited('subjectProfiles', { studentId }, 'updatedAt', 'desc', 3, HOME_PROFILE_FIELDS))),
      Promise.all(missingReportIds.map(studentId => findLatestHomeRecord('reports', studentId, HOME_REPORT_FIELDS, record => visibleReports([record]).length > 0))),
      Promise.all(missingPaperIds.map(studentId => findLatestHomeRecord('papers', studentId, HOME_PAPER_FIELDS, () => true))),
    ]);
    allProfiles.push(...profileFallbacks.flat());
    allReports.push(...reportFallbacks.filter(Boolean));
    allPapers.push(...paperFallbacks.filter(Boolean));

    const diagnosisRows = diagnosisRowsBySubject.flat();
    const diagnosisByStudent = new Map(students.map(student => [
      student._id,
      latestFormalDiagnoses(diagnosisRows.filter(report => report.studentId === student._id)),
    ]));
    const missingDiagnosisPairs = [];
    FORMAL_DIAGNOSIS_SUBJECTS.forEach((subject, subjectIndex) => {
      if ((diagnosisRowsBySubject[subjectIndex] || []).length < homeBatchLimit) return;
      students.forEach(student => {
        const hasSubject = (diagnosisByStudent.get(student._id) || []).some(report => report.subject === subject);
        if (!hasSubject) missingDiagnosisPairs.push({ studentId: student._id, subject });
      });
    });
    const diagnosisFallbacks = await Promise.all(missingDiagnosisPairs.map(pair => (
      findLatestFormalDiagnosis(pair.studentId, pair.subject)
    )));
    diagnosisFallbacks.filter(Boolean).forEach(report => {
      const current = diagnosisByStudent.get(report.studentId) || [];
      diagnosisByStudent.set(report.studentId, latestFormalDiagnoses([...current, report]));
    });

    const perStudent = {};
    for (const student of students) {
      const profiles = allProfiles.filter(row => row.studentId === student._id).sort((a, b) => toTime(b.updatedAt) - toTime(a.updatedAt));
      const reports = visibleReports(allReports.filter(row => row.studentId === student._id));
      const papers = allPapers.filter(row => row.studentId === student._id);
      perStudent[student._id] = {
        subjectProfiles: profiles.map(profileSummary),
        latestReportSummary: reports.length > 0 ? reportSummary(reports[0]) : null,
        latestDiagnosisReports: diagnosisByStudent.get(student._id) || [],
        latestPaperSummary: papers.length > 0 ? paperSummary(papers[0]) : null,
      };
    }
    return { success: true, students, perStudent };
  };
}

module.exports = { createHomeDashboard, MAX_FALLBACK_SCAN_PAGES };

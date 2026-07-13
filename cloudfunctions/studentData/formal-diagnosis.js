const FORMAL_DIAGNOSIS_SUBJECTS = ['math', 'chinese', 'english'];
const FORMAL_DIAGNOSIS_PAGE_SIZE = 100;
const MAX_FORMAL_DIAGNOSIS_SCAN_PAGES = 10;

function toTime(value) {
  const time = value ? new Date(value).getTime() : 0;
  return Number.isFinite(time) ? time : 0;
}

function isFormalDiagnosis(report = {}) {
  return report.status === 'completed'
    && report.type !== 'verification'
    && !report.isArchived
    && !report.archivedAt
    && report.isEffective !== false;
}

function summarizeFormalDiagnosis(report = {}) {
  const imageFiles = Array.isArray(report.imageFiles) ? report.imageFiles : [];
  const imageFileIds = Array.isArray(report.imageFileIds) ? report.imageFileIds : [];
  return {
    _id: report._id,
    studentId: report.studentId,
    subject: report.subject,
    type: report.type || 'diagnosis',
    status: report.status,
    summary: report.summary || '',
    comparisonSummary: report.comparisonSummary || '',
    changeSummary: report.changeSummary || '',
    totalErrors: Number(report.totalErrors) || 0,
    imageFileCount: imageFiles.length || imageFileIds.length || 0,
    bottlenecks: (report.bottlenecks || []).map(item => ({
      lpCode: item.lpCode,
      lpName: item.lpName,
      name: item.name,
      summary: item.summary,
      status: item.status,
      severity: item.severity,
      errorCount: Number(item.errorCount) || 0,
    })),
    evidenceTime: report.evidenceTime || '',
    createdAt: report.createdAt,
    updatedAt: report.updatedAt,
  };
}

function latestFormalDiagnoses(reports = []) {
  const bySubject = new Map();
  [...reports]
    .filter(isFormalDiagnosis)
    .sort((a, b) => toTime(b.createdAt) - toTime(a.createdAt))
    .forEach(report => {
      if (!FORMAL_DIAGNOSIS_SUBJECTS.includes(report.subject) || bySubject.has(report.subject)) return;
      bySubject.set(report.subject, summarizeFormalDiagnosis(report));
    });
  return FORMAL_DIAGNOSIS_SUBJECTS.map(subject => bySubject.get(subject)).filter(Boolean);
}

async function loadLatestFormalDiagnoses(queryPage) {
  const results = await Promise.all(FORMAL_DIAGNOSIS_SUBJECTS.map(async subject => {
    for (let page = 0; page < MAX_FORMAL_DIAGNOSIS_SCAN_PAGES; page += 1) {
      const rows = await queryPage(subject, page * FORMAL_DIAGNOSIS_PAGE_SIZE, FORMAL_DIAGNOSIS_PAGE_SIZE);
      const match = (rows || []).find(isFormalDiagnosis);
      if (match) return summarizeFormalDiagnosis(match);
      if (!rows || rows.length < FORMAL_DIAGNOSIS_PAGE_SIZE) return null;
    }
    return null;
  }));
  return results.filter(Boolean);
}

module.exports = {
  FORMAL_DIAGNOSIS_SUBJECTS,
  FORMAL_DIAGNOSIS_PAGE_SIZE,
  MAX_FORMAL_DIAGNOSIS_SCAN_PAGES,
  isFormalDiagnosis,
  summarizeFormalDiagnosis,
  latestFormalDiagnoses,
  loadLatestFormalDiagnoses,
};

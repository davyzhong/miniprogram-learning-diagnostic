function publicStudent(student = {}) {
  return {
    _id: student._id,
    name: student.name || '',
    grade: student.grade,
    avatarColor: student.avatarColor || '',
    reportCount: Number(student.reportCount) || 0,
    createdAt: student.createdAt || '',
    updatedAt: student.updatedAt || '',
  };
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

module.exports = { publicStudent, stripReportDebugFields };

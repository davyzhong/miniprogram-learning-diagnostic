// 上传页去重提示专用：只返回最近报告的照片文件名。
// field 投影只取 imageFiles.fileName（外加归档标记用于过滤），
// 避免客户端为取文件名直读 20 份全量报告（含 OCR 摘要、错题明细）。
const { getStudentAccess, permissionsForRole } = require('./access');

function success(data = {}) {
  return { success: true, ...data };
}

function failure(error) {
  return { success: false, error };
}

function createRecentImageFileNames({ db, normalizeSubject, normalizeLimit, isArchivedReport }) {
  return async function listRecentImageFileNames(openId, event = {}) {
    const { studentId, subject: subjectValue } = event;
    if (!studentId) return failure('缺少 studentId');
    const access = await getStudentAccess(db, studentId, openId);
    if (!access.allowed) return failure('无权访问该学生');

    const subject = subjectValue ? normalizeSubject(subjectValue) : '';
    const limit = normalizeLimit(event.limit, 20, 50);
    const filter = subject ? { studentId, subject } : { studentId };
    const res = await db.collection('reports')
      .where(filter)
      .orderBy('createdAt', 'desc')
      .limit(limit)
      .field({ 'imageFiles.fileName': true, isArchived: true, archivedAt: true })
      .get();
    const fileNames = (res.data || [])
      .filter(report => !isArchivedReport(report))
      .flatMap(report => (Array.isArray(report.imageFiles) ? report.imageFiles : []))
      .map(photo => photo && photo.fileName)
      .filter(Boolean);
    return success({
      role: access.role,
      permissions: permissionsForRole(access.role),
      fileNames: Array.from(new Set(fileNames)),
    });
  };
}

module.exports = { createRecentImageFileNames };

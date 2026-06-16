function isMissingCollectionError(error) {
  const text = String(
    (error && (error.errMsg || error.message || error.code || error.errCode)) || ''
  );
  return Boolean(error && error.errCode === -502005)
    || /collection not exists|Db or Table not exist|DATABASE_COLLECTION_NOT_EXIST|ResourceNotFound/i.test(text);
}

async function getStudent(db, studentId) {
  if (!studentId) return null;
  const res = await db.collection('students').doc(studentId).get();
  return res.data || null;
}

async function getActiveMember(db, studentId, openId) {
  if (!studentId || !openId) return null;
  try {
    const res = await db.collection('studentMembers').where({
      studentId,
      memberOpenId: openId,
      status: 'active',
    }).get();
    return (res.data || [])[0] || null;
  } catch (error) {
    if (isMissingCollectionError(error)) return null;
    throw error;
  }
}

async function getStudentAccess(db, studentId, openId) {
  const student = await getStudent(db, studentId);
  if (!student) return { allowed: false, owner: false, role: '', student: null };
  if (student._openid && student._openid === openId) {
    return { allowed: true, owner: true, role: 'owner', student };
  }
  const member = await getActiveMember(db, studentId, openId);
  if (member) {
    const role = member.role || 'viewer';
    return {
      allowed: true,
      owner: role === 'owner',
      role,
      student,
      member,
    };
  }
  return { allowed: false, owner: false, role: '', student };
}

async function getLearningResourceAccess(db, resource, openId) {
  if (!resource) return { allowed: false, owner: false, role: '', student: null };
  if (resource._openid && resource._openid === openId) {
    const student = resource.studentId ? await getStudent(db, resource.studentId) : null;
    return { allowed: true, owner: true, role: 'owner', student };
  }
  const member = await getActiveMember(db, resource.studentId, openId);
  if (member) {
    const role = member.role || 'viewer';
    const student = resource.studentId ? await getStudent(db, resource.studentId) : null;
    return {
      allowed: true,
      owner: role === 'owner',
      role,
      student,
      member,
    };
  }
  return { allowed: false, owner: false, role: '', student: null };
}

function canReadLearning(access) {
  return Boolean(access && access.allowed);
}

function canOperateLearning(access) {
  return Boolean(access && access.allowed);
}

function canManageFamily(access) {
  return Boolean(access && access.allowed && access.role === 'owner');
}

function permissionsForRole(role) {
  const owner = role === 'owner';
  return {
    canView: true,
    canReadLearning: true,
    canOperateLearning: true,
    canManageParents: owner,
    canUpload: true,
    canGeneratePaper: true,
    canRetryAnalysis: true,
  };
}

module.exports = {
  getStudent,
  getActiveMember,
  getStudentAccess,
  getLearningResourceAccess,
  canReadLearning,
  canOperateLearning,
  canManageFamily,
  permissionsForRole,
};

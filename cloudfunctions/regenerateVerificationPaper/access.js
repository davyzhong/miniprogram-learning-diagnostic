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

function canOperateLearning(access) {
  return Boolean(access && access.allowed);
}

module.exports = {
  getStudentAccess,
  canOperateLearning,
};

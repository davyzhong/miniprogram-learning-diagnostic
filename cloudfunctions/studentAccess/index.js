const cloud = require('wx-server-sdk');
const crypto = require('node:crypto');
const { permissionsForRole, canManageFamily } = require('../_shared/access');

cloud.init({ env: cloud.SYMBOL_CURRENT_ENV });
const db = cloud.database();

const ACTIONS = new Set([
  'getAccessibleStudents',
  'listMembers',
  'createInvite',
  'getInvite',
  'acceptInvite',
  'getInviteByCode',
  'acceptInviteByCode',
  'updateMemberProfile',
  'revokeMember',
]);

const RELATIONS = {
  owner: '创建者',
  father: '爸爸',
  mother: '妈妈',
  grandfather: '爷爷',
  grandmother: '奶奶',
  maternal_grandfather: '外公',
  maternal_grandmother: '外婆',
  teacher: '老师',
  other: '其他',
};

function now() {
  return new Date();
}

function success(data = {}) {
  return { success: true, ...data };
}

function failure(error) {
  return { success: false, error };
}

function hashToken(token) {
  return crypto.createHash('sha256').update(String(token || '')).digest('hex');
}

function createToken() {
  return crypto.randomBytes(18).toString('base64url');
}

function createInviteCode() {
  const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
  return Array.from(crypto.randomBytes(8))
    .map(byte => alphabet[byte % alphabet.length])
    .join('');
}

function addDays(date, days) {
  const copy = new Date(date);
  copy.setDate(copy.getDate() + days);
  return copy;
}

function toTime(value) {
  return value ? new Date(value).getTime() : 0;
}

function isActive(member) {
  return member && member.status === 'active';
}

function normalizeRelation(relation, fallbackRole = '') {
  if (relation && RELATIONS[relation]) return relation;
  if (fallbackRole === 'owner') return 'owner';
  return 'other';
}

function relationTextOf(relation) {
  return RELATIONS[normalizeRelation(relation)] || RELATIONS.other;
}

function sanitizeDisplayName(displayName, relation) {
  const value = String(displayName || '').trim().slice(0, 20);
  return value || relationTextOf(relation);
}

function withMemberDisplay(member) {
  const relation = normalizeRelation(member.relation, member.role);
  const relationText = member.relationText || relationTextOf(relation);
  return {
    ...member,
    relation,
    relationText,
    displayName: member.displayName || relationText,
  };
}

function isMissingCollectionError(error) {
  const text = String(
    (error && (error.errMsg || error.message || error.code || error.errCode)) || ''
  );
  return error && error.errCode === -502005
    || /collection not exists|Db or Table not exist|DATABASE_COLLECTION_NOT_EXIST|ResourceNotFound/i.test(text);
}

async function ensureCollection(collectionName) {
  if (typeof db.createCollection !== 'function') return;
  try {
    await db.createCollection(collectionName);
  } catch (error) {
    if (!isMissingCollectionError(error) && !/already exists|exists/i.test(String(error && (error.errMsg || error.message)))) {
      throw error;
    }
  }
}

async function getCollectionData(collectionName, filter = {}) {
  try {
    const res = await db.collection(collectionName).where(filter).get();
    return res.data || [];
  } catch (error) {
    if (isMissingCollectionError(error)) return [];
    throw error;
  }
}

async function addCollectionData(collectionName, data) {
  try {
    return await db.collection(collectionName).add({ data });
  } catch (error) {
    if (!isMissingCollectionError(error)) throw error;
    await ensureCollection(collectionName);
    return db.collection(collectionName).add({ data });
  }
}

async function createUniqueInviteCode() {
  for (let i = 0; i < 5; i += 1) {
    const inviteCode = createInviteCode();
    const existing = await getCollectionData('studentInvites', { inviteCode, status: 'active' });
    if (!existing.length) return inviteCode;
  }
  throw new Error('邀请码生成失败');
}

async function getStudent(studentId) {
  if (!studentId) return null;
  const res = await db.collection('students').doc(studentId).get();
  return res.data || null;
}

async function getMembersByStudent(studentId) {
  return getCollectionData('studentMembers', { studentId });
}

async function getMember(studentId, memberOpenId) {
  const members = await getCollectionData('studentMembers', { studentId, memberOpenId });
  return members.find(isActive) || null;
}

async function getAccess(studentId, openId) {
  const student = await getStudent(studentId);
  if (!student) return { allowed: false, owner: false, role: '', student: null };
  if (student._openid && student._openid === openId) {
    return { allowed: true, owner: true, role: 'owner', student };
  }
  const member = await getMember(studentId, openId);
  if (member) {
    return {
      allowed: true,
      owner: member.role === 'owner',
      role: member.role || 'viewer',
      student,
      member,
    };
  }
  return { allowed: false, owner: false, role: '', student };
}

function serializeStudent(student, role) {
  return {
    ...student,
    role,
    permissions: permissionsForRole(role),
  };
}

async function getAccessibleStudents(openId) {
  const ownedRes = await db.collection('students').where({ _openid: openId }).get();
  const joinedMembers = await getCollectionData('studentMembers', { memberOpenId: openId, status: 'active' });
  const byId = new Map();

  for (const student of ownedRes.data || []) {
    byId.set(student._id, serializeStudent(student, 'owner'));
  }

  for (const member of joinedMembers) {
    if (byId.has(member.studentId)) continue;
    const student = await getStudent(member.studentId);
    if (!student) continue;
    byId.set(member.studentId, serializeStudent(student, member.role || 'viewer'));
  }

  const students = Array.from(byId.values())
    .sort((a, b) => toTime(b.createdAt) - toTime(a.createdAt));
  return success({ students });
}

async function ensureOwnerMember(student, openId) {
  const existing = await getMember(student._id, openId);
  if (existing) return existing;
  const data = {
    studentId: student._id,
    ownerOpenId: student._openid || openId,
    memberOpenId: openId,
    role: 'owner',
    relation: 'owner',
    relationText: RELATIONS.owner,
    displayName: RELATIONS.owner,
    status: 'active',
    createdAt: now(),
    updatedAt: now(),
  };
  const res = await addCollectionData('studentMembers', data);
  return { _id: res._id, ...data };
}

async function listMembers(openId, studentId) {
  const access = await getAccess(studentId, openId);
  if (!access.allowed) return failure('无权访问该学生');
  let ownerMember = null;
  if (access.owner && access.student && access.student._openid === openId) {
    try {
      ownerMember = await ensureOwnerMember(access.student, openId);
    } catch (error) {
      console.warn('[studentAccess] owner member initialization skipped:', error && error.message);
    }
  }
  let members = (await getMembersByStudent(studentId))
    .filter(isActive)
    .sort((a, b) => {
      if (a.role === b.role) return toTime(a.createdAt) - toTime(b.createdAt);
      return a.role === 'owner' ? -1 : 1;
    });
  if (access.owner && ownerMember && !members.some(member => member.memberOpenId === openId)) {
    members = [ownerMember, ...members];
  }
  if (access.owner && !members.some(member => member.memberOpenId === openId)) {
    members = [{
      studentId,
      ownerOpenId: access.student._openid || openId,
      memberOpenId: openId,
      role: 'owner',
      relation: 'owner',
      relationText: RELATIONS.owner,
      displayName: RELATIONS.owner,
      status: 'active',
      createdAt: now(),
      updatedAt: now(),
    }, ...members];
  }
  return success({
    student: access.student,
    role: access.role,
    permissions: permissionsForRole(access.role),
    members: members.map(withMemberDisplay),
  });
}

async function createInvite(openId, studentId, presetRelation = '') {
  const access = await getAccess(studentId, openId);
  if (!canManageFamily(access)) return failure('无权执行该操作');
  const token = createToken();
  const inviteCode = await createUniqueInviteCode();
  const normalizedRelation = normalizeRelation(presetRelation, 'viewer');
  const createdAt = now();
  const expiresAt = addDays(createdAt, 7);
  const inviteData = {
    studentId,
    ownerOpenId: access.student._openid || openId,
    tokenHash: hashToken(token),
    inviteCode,
    status: 'active',
    role: 'viewer',
    presetRelation: normalizedRelation,
    presetRelationText: relationTextOf(normalizedRelation),
    expiresAt,
    createdAt,
    updatedAt: createdAt,
  };
  const res = await addCollectionData('studentInvites', inviteData);
  const path = `/pages/join-student/join-student?inviteId=${encodeURIComponent(res._id)}&token=${encodeURIComponent(token)}`;
  return success({
    inviteId: res._id,
    token,
    tokenHash: undefined,
    inviteCode,
    path,
    expiresAt,
    role: 'viewer',
    presetRelation: normalizedRelation,
    presetRelationText: relationTextOf(normalizedRelation),
  });
}

async function readInvite(inviteId, token) {
  if (!inviteId || !token) return { error: '邀请不存在或已失效' };
  let inviteRes;
  try {
    inviteRes = await db.collection('studentInvites').doc(inviteId).get();
  } catch (error) {
    if (isMissingCollectionError(error)) return { error: '邀请不存在或已失效' };
    throw error;
  }
  const invite = inviteRes.data;
  if (!invite || invite.tokenHash !== hashToken(token)) {
    return { error: '邀请不存在或已失效' };
  }
  return { invite };
}

async function readInviteByCode(inviteCode) {
  const normalizedCode = String(inviteCode || '').trim().toUpperCase();
  if (!normalizedCode) return { error: '请输入邀请码' };
  const matches = await getCollectionData('studentInvites', { inviteCode: normalizedCode, status: 'active' });
  const invite = matches[0];
  if (!invite) return { error: '邀请不存在或已失效' };
  return { invite };
}

function inviteUnavailableReason(invite) {
  if (!invite || invite.status !== 'active') return '邀请不存在或已失效';
  if (toTime(invite.expiresAt) <= Date.now()) return '邀请已过期';
  return '';
}

async function getInvite(openId, inviteId, token) {
  const read = await readInvite(inviteId, token);
  if (read.error) return failure(read.error);
  const student = await getStudent(read.invite.studentId);
  if (!student) return failure('邀请不存在或已失效');
  const existing = await getMember(read.invite.studentId, openId);
  if (student._openid === openId || existing) {
    return success({
      student,
      role: student._openid === openId ? 'owner' : existing.role,
      presetRelation: read.invite.presetRelation || '',
      presetRelationText: read.invite.presetRelationText || '',
      alreadyJoined: true,
    });
  }
  const unavailableReason = inviteUnavailableReason(read.invite);
  if (unavailableReason) return failure(unavailableReason);
  return success({
    student,
    role: read.invite.role || 'viewer',
    presetRelation: read.invite.presetRelation || '',
    presetRelationText: read.invite.presetRelationText || '',
    expiresAt: read.invite.expiresAt,
  });
}

async function getInviteByCode(openId, inviteCode) {
  const read = await readInviteByCode(inviteCode);
  if (read.error) return failure(read.error);
  const student = await getStudent(read.invite.studentId);
  if (!student) return failure('邀请不存在或已失效');
  const existing = await getMember(read.invite.studentId, openId);
  if (student._openid === openId || existing) {
    return success({
      student,
      role: student._openid === openId ? 'owner' : existing.role,
      presetRelation: read.invite.presetRelation || '',
      presetRelationText: read.invite.presetRelationText || '',
      alreadyJoined: true,
    });
  }
  const unavailableReason = inviteUnavailableReason(read.invite);
  if (unavailableReason) return failure(unavailableReason);
  return success({
    student,
    role: read.invite.role || 'viewer',
    presetRelation: read.invite.presetRelation || '',
    presetRelationText: read.invite.presetRelationText || '',
    expiresAt: read.invite.expiresAt,
  });
}

async function acceptInviteRecord(openId, invite, options = {}) {
  const student = await getStudent(invite.studentId);
  if (!student) return failure('邀请不存在或已失效');

  if (student._openid === openId) {
    return success({ student, role: 'owner', alreadyJoined: true });
  }

  const existing = await getMember(invite.studentId, openId);
  if (existing) {
    return success({ student, role: existing.role || 'viewer', alreadyJoined: true });
  }

  const unavailableReason = inviteUnavailableReason(invite);
  if (unavailableReason) return failure(unavailableReason);

  const joinedAt = now();
  const relation = normalizeRelation(options.relation || invite.presetRelation, 'viewer');
  const displayName = sanitizeDisplayName(options.displayName, relation);
  const memberData = {
    studentId: invite.studentId,
    ownerOpenId: invite.ownerOpenId,
    memberOpenId: openId,
    role: invite.role || 'viewer',
    relation,
    relationText: relationTextOf(relation),
    displayName,
    status: 'active',
    joinedByInviteId: invite._id,
    createdAt: joinedAt,
    updatedAt: joinedAt,
  };
  await addCollectionData('studentMembers', memberData);
  await db.collection('studentInvites').doc(invite._id).update({
    data: {
      status: 'accepted',
      acceptedByOpenId: openId,
      acceptedAt: joinedAt,
      updatedAt: joinedAt,
    },
  });
  return success({
    student,
    role: memberData.role,
    relation,
    relationText: relationTextOf(relation),
    displayName,
  });
}

async function acceptInvite(openId, inviteId, token, options = {}) {
  const read = await readInvite(inviteId, token);
  if (read.error) return failure(read.error);
  return acceptInviteRecord(openId, read.invite, options);
}

async function acceptInviteByCode(openId, inviteCode, options = {}) {
  const read = await readInviteByCode(inviteCode);
  if (read.error) return failure(read.error);
  return acceptInviteRecord(openId, read.invite, options);
}

async function updateMemberProfile(openId, studentId, memberOpenId, displayName, relation) {
  const access = await getAccess(studentId, openId);
  if (!canManageFamily(access)) return failure('无权执行该操作');
  const members = await getMembersByStudent(studentId);
  const target = members.find(member => member.memberOpenId === memberOpenId && member.status === 'active');
  if (!target) return failure('家长成员不存在');

  const normalizedRelation = normalizeRelation(relation, target.role);
  const safeDisplayName = sanitizeDisplayName(displayName, normalizedRelation);
  await db.collection('studentMembers').doc(target._id).update({
    data: {
      displayName: safeDisplayName,
      relation: normalizedRelation,
      relationText: relationTextOf(normalizedRelation),
      updatedAt: now(),
    },
  });
  return success({
    memberOpenId,
    displayName: safeDisplayName,
    relation: normalizedRelation,
    relationText: relationTextOf(normalizedRelation),
  });
}

async function revokeMember(openId, studentId, memberOpenId) {
  const access = await getAccess(studentId, openId);
  if (!canManageFamily(access)) return failure('无权执行该操作');
  if (!memberOpenId || memberOpenId === openId) return failure('不能移除自己');

  const members = await getMembersByStudent(studentId);
  const target = members.find(member => member.memberOpenId === memberOpenId && member.status === 'active');
  if (!target || target.role === 'owner') return failure('家长成员不存在或不可移除');

  const revokedAt = now();
  await db.collection('studentMembers').doc(target._id).update({
    data: {
      status: 'revoked',
      revokedAt,
      updatedAt: revokedAt,
    },
  });
  return success({ memberOpenId });
}

exports.main = async (event = {}) => {
  const action = event.action;
  const openId = cloud.getWXContext().OPENID;

  if (!ACTIONS.has(action)) {
    return failure('操作类型无效');
  }

  try {
    if (action === 'getAccessibleStudents') {
      return await getAccessibleStudents(openId);
    }
    if (action === 'listMembers') {
      return await listMembers(openId, event.studentId);
    }
    if (action === 'createInvite') {
      return await createInvite(openId, event.studentId, event.presetRelation);
    }
    if (action === 'getInvite') {
      return await getInvite(openId, event.inviteId, event.token);
    }
    if (action === 'acceptInvite') {
      return await acceptInvite(openId, event.inviteId, event.token, {
        displayName: event.displayName,
        relation: event.relation,
      });
    }
    if (action === 'getInviteByCode') {
      return await getInviteByCode(openId, event.inviteCode);
    }
    if (action === 'acceptInviteByCode') {
      return await acceptInviteByCode(openId, event.inviteCode, {
        displayName: event.displayName,
        relation: event.relation,
      });
    }
    if (action === 'updateMemberProfile') {
      return await updateMemberProfile(
        openId,
        event.studentId,
        event.memberOpenId,
        event.displayName,
        event.relation
      );
    }
    if (action === 'revokeMember') {
      return await revokeMember(openId, event.studentId, event.memberOpenId);
    }
  } catch (err) {
    console.error('[studentAccess] failed:', err && err.message);
    return failure('家长管理操作失败，请稍后重试');
  }

  return failure('操作类型无效');
};

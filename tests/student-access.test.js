const test = require('node:test')
const assert = require('node:assert/strict')
const crypto = require('node:crypto')
const {
  createCloudMock,
  createDatabase,
  loadModule
} = require('./helpers/cloud-function-harness')

function loadStudentAccess(db, openId = 'owner-1') {
  return loadModule('cloudfunctions/studentAccess/index.js', {
    'wx-server-sdk': createCloudMock({ db, openId })
  })
}

function sha256(value) {
  return crypto.createHash('sha256').update(String(value)).digest('hex')
}

test('getAccessibleStudents returns owned and joined active child profiles', async () => {
  const db = createDatabase({
    students: [
      { _id: 'owned-student', _openid: 'owner-1', name: '钟青羽', grade: 6, createdAt: '2026-06-11T10:00:00Z' },
      { _id: 'joined-student', _openid: 'owner-2', name: '小明', grade: 5, createdAt: '2026-06-10T10:00:00Z' },
      { _id: 'revoked-student', _openid: 'owner-3', name: '小红', grade: 4, createdAt: '2026-06-09T10:00:00Z' }
    ],
    studentMembers: [
      { _id: 'member-1', studentId: 'joined-student', ownerOpenId: 'owner-2', memberOpenId: 'owner-1', role: 'viewer', status: 'active' },
      { _id: 'member-2', studentId: 'revoked-student', ownerOpenId: 'owner-3', memberOpenId: 'owner-1', role: 'viewer', status: 'revoked' }
    ]
  })
  const handler = loadStudentAccess(db, 'owner-1')

  const result = await handler.main({ action: 'getAccessibleStudents' })

  assert.equal(result.success, true)
  assert.deepEqual(JSON.parse(JSON.stringify(result.students.map(item => item._id))), ['owned-student', 'joined-student'])
  assert.equal(result.students.find(item => item._id === 'owned-student').role, 'owner')
  assert.equal(result.students.find(item => item._id === 'joined-student').role, 'viewer')
  const joinedPermissions = result.students.find(item => item._id === 'joined-student').permissions
  assert.equal(joinedPermissions.canView, true)
  assert.equal(joinedPermissions.canUpload, true)
  assert.equal(joinedPermissions.canGeneratePaper, true)
  assert.equal(joinedPermissions.canRetryAnalysis, true)
  assert.equal(joinedPermissions.canManageParents, false)
})

test('owner can list members and create an invite, viewer cannot', async () => {
  const db = createDatabase({
    students: [{ _id: 'student-1', _openid: 'owner-1', name: '钟青羽', grade: 6 }],
    studentMembers: [
      { _id: 'owner-member', studentId: 'student-1', ownerOpenId: 'owner-1', memberOpenId: 'owner-1', role: 'owner', status: 'active' },
      { _id: 'viewer-member', studentId: 'student-1', ownerOpenId: 'owner-1', memberOpenId: 'viewer-1', role: 'viewer', status: 'active', displayName: '妈妈' }
    ],
    studentInvites: []
  })
  const owner = loadStudentAccess(db, 'owner-1')
  const viewer = loadStudentAccess(db, 'viewer-1')

  const membersResult = await owner.main({ action: 'listMembers', studentId: 'student-1' })
  assert.equal(membersResult.success, true)
  assert.deepEqual(membersResult.members.map(item => item.role), ['owner', 'viewer'])

  const inviteResult = await owner.main({ action: 'createInvite', studentId: 'student-1' })
  assert.equal(inviteResult.success, true)
  assert.match(inviteResult.path, /pages\/join-student\/join-student/)
  assert.equal(db.dump('studentInvites').length, 1)
  assert.equal(db.dump('studentInvites')[0].token, undefined)
  assert.equal(db.dump('studentInvites')[0].role, 'viewer')

  const viewerInvite = await viewer.main({ action: 'createInvite', studentId: 'student-1' })
  assert.equal(viewerInvite.success, false)
  assert.equal(viewerInvite.error, '无权执行该操作')
})

test('student access initializes missing parent collections for first-time owner flow', async () => {
  const db = createDatabase({
    students: [{ _id: 'student-1', _openid: 'owner-1', name: '钟青羽', grade: 6 }]
  }, {
    missingCollections: ['studentMembers', 'studentInvites']
  })
  const owner = loadStudentAccess(db, 'owner-1')

  const accessible = await owner.main({ action: 'getAccessibleStudents' })
  assert.equal(accessible.success, true)
  assert.deepEqual(JSON.parse(JSON.stringify(accessible.students.map(item => item._id))), ['student-1'])

  const membersResult = await owner.main({ action: 'listMembers', studentId: 'student-1' })
  assert.equal(membersResult.success, true)
  assert.equal(membersResult.student.name, '钟青羽')
  assert.deepEqual(JSON.parse(JSON.stringify(membersResult.members.map(item => item.role))), ['owner'])
  assert.equal(db.dump('studentMembers').length, 1)

  const inviteResult = await owner.main({ action: 'createInvite', studentId: 'student-1' })
  assert.equal(inviteResult.success, true)
  assert.match(inviteResult.path, /pages\/join-student\/join-student/)
  assert.equal(db.dump('studentInvites').length, 1)
})

test('owner member receives default display profile and can update viewer relation', async () => {
  const db = createDatabase({
    students: [{ _id: 'student-1', _openid: 'owner-1', name: '钟青羽', grade: 6 }],
    studentMembers: [
      { _id: 'viewer-member', studentId: 'student-1', ownerOpenId: 'owner-1', memberOpenId: 'viewer-1', role: 'viewer', status: 'active' }
    ],
    studentInvites: []
  })
  const owner = loadStudentAccess(db, 'owner-1')

  const before = await owner.main({ action: 'listMembers', studentId: 'student-1' })
  assert.equal(before.success, true)
  assert.equal(before.members.find(item => item.memberOpenId === 'owner-1').relationText, '创建者')
  assert.equal(before.members.find(item => item.memberOpenId === 'viewer-1').displayName, '其他')

  const updated = await owner.main({
    action: 'updateMemberProfile',
    studentId: 'student-1',
    memberOpenId: 'viewer-1',
    displayName: '青羽爸爸',
    relation: 'father'
  })
  assert.equal(updated.success, true)

  const viewer = db.dump('studentMembers').find(item => item.memberOpenId === 'viewer-1')
  assert.equal(viewer.displayName, '青羽爸爸')
  assert.equal(viewer.relation, 'father')
  assert.equal(viewer.relationText, '爸爸')
})

test('owner creates invite code with preset relation and parent can join by code', async () => {
  const db = createDatabase({
    students: [{ _id: 'student-1', _openid: 'owner-1', name: '钟青羽', grade: 6 }],
    studentMembers: [],
    studentInvites: []
  })
  const owner = loadStudentAccess(db, 'owner-1')
  const viewer = loadStudentAccess(db, 'viewer-1')

  const invite = await owner.main({
    action: 'createInvite',
    studentId: 'student-1',
    presetRelation: 'mother'
  })
  assert.equal(invite.success, true)
  assert.match(invite.inviteCode, /^[A-Z0-9]{6}$/)
  assert.equal(db.dump('studentInvites')[0].presetRelation, 'mother')
  assert.equal(db.dump('studentInvites')[0].presetRelationText, '妈妈')

  const preview = await viewer.main({ action: 'getInviteByCode', inviteCode: invite.inviteCode })
  assert.equal(preview.success, true)
  assert.equal(preview.student.name, '钟青羽')
  assert.equal(preview.presetRelationText, '妈妈')

  const accepted = await viewer.main({
    action: 'acceptInviteByCode',
    inviteCode: invite.inviteCode,
    displayName: '青羽妈妈'
  })
  assert.equal(accepted.success, true)
  const member = db.dump('studentMembers').find(item => item.memberOpenId === 'viewer-1')
  assert.equal(member.relation, 'mother')
  assert.equal(member.relationText, '妈妈')
  assert.equal(member.displayName, '青羽妈妈')
})

test('acceptInvite creates one active viewer member and rejects invalid tokens', async () => {
  const token = 'join-token'
  const db = createDatabase({
    students: [{ _id: 'student-1', _openid: 'owner-1', name: '钟青羽', grade: 6 }],
    studentMembers: [],
    studentInvites: [{
      _id: 'invite-1',
      studentId: 'student-1',
      ownerOpenId: 'owner-1',
      tokenHash: sha256(token),
      status: 'active',
      role: 'viewer',
      expiresAt: '2099-01-01T00:00:00Z',
      createdAt: '2026-06-11T10:00:00Z',
      updatedAt: '2026-06-11T10:00:00Z'
    }]
  })
  const viewer = loadStudentAccess(db, 'viewer-1')

  const invalid = await viewer.main({ action: 'acceptInvite', inviteId: 'invite-1', token: 'wrong-token' })
  assert.equal(invalid.success, false)
  assert.equal(invalid.error, '邀请不存在或已失效')

  const accepted = await viewer.main({ action: 'acceptInvite', inviteId: 'invite-1', token })
  assert.equal(accepted.success, true)
  assert.equal(accepted.student._id, 'student-1')
  assert.equal(accepted.role, 'viewer')
  assert.equal(db.dump('studentMembers').length, 1)
  assert.equal(db.dump('studentMembers')[0].memberOpenId, 'viewer-1')

  const acceptedAgain = await viewer.main({ action: 'acceptInvite', inviteId: 'invite-1', token })
  assert.equal(acceptedAgain.success, true)
  assert.equal(acceptedAgain.alreadyJoined, true)
  assert.equal(db.dump('studentMembers').length, 1)
})

test('accepted invite cannot be reused by another parent', async () => {
  const token = 'join-token'
  const db = createDatabase({
    students: [{ _id: 'student-1', _openid: 'owner-1', name: '钟青羽', grade: 6 }],
    studentMembers: [],
    studentInvites: [{
      _id: 'invite-1',
      studentId: 'student-1',
      ownerOpenId: 'owner-1',
      tokenHash: sha256(token),
      status: 'active',
      role: 'viewer',
      expiresAt: '2099-01-01T00:00:00Z',
      createdAt: '2026-06-11T10:00:00Z',
      updatedAt: '2026-06-11T10:00:00Z'
    }]
  })

  const firstParent = loadStudentAccess(db, 'viewer-1')
  const secondParent = loadStudentAccess(db, 'viewer-2')

  const accepted = await firstParent.main({ action: 'acceptInvite', inviteId: 'invite-1', token })
  assert.equal(accepted.success, true)

  const reused = await secondParent.main({ action: 'acceptInvite', inviteId: 'invite-1', token })
  assert.equal(reused.success, false)
  assert.equal(reused.error, '邀请不存在或已失效')
  assert.equal(db.dump('studentMembers').length, 1)
})

test('owner can revoke viewer member and viewer cannot revoke anyone', async () => {
  const db = createDatabase({
    students: [{ _id: 'student-1', _openid: 'owner-1', name: '钟青羽', grade: 6 }],
    studentMembers: [
      { _id: 'viewer-member', studentId: 'student-1', ownerOpenId: 'owner-1', memberOpenId: 'viewer-1', role: 'viewer', status: 'active' }
    ]
  })
  const owner = loadStudentAccess(db, 'owner-1')
  const viewer = loadStudentAccess(db, 'viewer-1')

  const denied = await viewer.main({ action: 'revokeMember', studentId: 'student-1', memberOpenId: 'viewer-1' })
  assert.equal(denied.success, false)
  assert.equal(denied.error, '无权执行该操作')

  const revoked = await owner.main({ action: 'revokeMember', studentId: 'student-1', memberOpenId: 'viewer-1' })
  assert.equal(revoked.success, true)
  assert.equal(db.dump('studentMembers')[0].status, 'revoked')
  assert.ok(db.dump('studentMembers')[0].revokedAt)
})

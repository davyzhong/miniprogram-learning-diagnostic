const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const { createWxMock, loadPage } = require('./helpers/page-harness')

const ROOT = path.resolve(__dirname, '..')

async function flushAsync(turns = 4) {
  for (let i = 0; i < turns; i += 1) {
    await Promise.resolve()
  }
}

async function waitForPageLoad(page) {
  if (page._loadPromise) {
    await page._loadPromise
    return
  }
  await flushAsync()
}

test('owner sees invite button and can create an invite', async () => {
  let createdFor = ''
  let createdRelation = ''
  const cloud = {
    listStudentMembers: async studentId => ({
      student: { _id: studentId, name: '钟青羽', grade: 6 },
      role: 'owner',
      permissions: { canManageParents: true },
      members: [{ memberOpenId: 'owner-1', role: 'owner', status: 'active' }]
    }),
    createStudentInvite: async (studentId, presetRelation) => {
      createdFor = studentId
      createdRelation = presetRelation
      return { inviteId: 'invite-1', inviteCode: 'QY8392', presetRelationText: '妈妈', path: '/pages/join-student/join-student?inviteId=invite-1&token=abc', expiresAt: '2026-06-20T00:00:00Z' }
    }
  }
  const { page } = loadPage('miniprogram/pages/parent-management/parent-management.js', {
    modules: { '../../utils/cloud': cloud }
  })

  page.onLoad({ studentId: 'student-1' })
  await waitForPageLoad(page)
  assert.equal(page.data.canInvite, true)
  assert.equal(page.data.members.length, 1)

  await page.onCreateInvite()
  assert.equal(createdFor, 'student-1')
  assert.equal(createdRelation, 'mother')
  assert.equal(page.data.invite.inviteId, 'invite-1')
  assert.equal(page.data.invite.inviteCode, 'QY8392')
  assert.match(page.data.invite.path, /join-student/)
})

test('owner can edit member display name and relation', async () => {
  let updated = null
  const cloud = {
    listStudentMembers: async studentId => ({
      student: { _id: studentId, name: '钟青羽', grade: 6 },
      role: 'owner',
      permissions: { canManageParents: true },
      members: [{ memberOpenId: 'viewer-1', role: 'viewer', relation: 'father', relationText: '爸爸', displayName: '爸爸', status: 'active' }]
    }),
    updateStudentMemberProfile: async payload => {
      updated = payload
      return { success: true }
    }
  }
  const { page } = loadPage('miniprogram/pages/parent-management/parent-management.js', {
    modules: { '../../utils/cloud': cloud }
  })

  page.setData({ studentId: 'student-1' })
  await page.loadMembers()
  assert.equal(page.data.members[0].displayText, '爸爸')
  assert.equal(page.data.members[0].relationText, '爸爸')

  page.onEditMember({ currentTarget: { dataset: { index: 0 } } })
  page.setData({ editingDisplayName: '青羽爸爸', editingRelation: 'father' })
  await page.onSaveMemberProfile()

  assert.equal(updated.studentId, 'student-1')
  assert.equal(updated.memberOpenId, 'viewer-1')
  assert.equal(updated.displayName, '青羽爸爸')
  assert.equal(updated.relation, 'father')
})

test('viewer can see members but does not see invite action', async () => {
  const cloud = {
    listStudentMembers: async studentId => ({
      student: { _id: studentId, name: '钟青羽', grade: 6 },
      role: 'viewer',
      permissions: { canManageParents: false },
      members: [
        { memberOpenId: 'owner-1', role: 'owner', status: 'active' },
        { memberOpenId: 'viewer-1', role: 'viewer', status: 'active' }
      ]
    }),
    createStudentInvite: async () => { throw new Error('should not create') }
  }
  const { page } = loadPage('miniprogram/pages/parent-management/parent-management.js', {
    modules: { '../../utils/cloud': cloud }
  })

  page.onLoad({ studentId: 'student-1' })
  await waitForPageLoad(page)
  assert.equal(page.data.role, 'viewer')
  assert.equal(page.data.canInvite, false)
  assert.equal(page.data.members.length, 2)
})

test('parent management hides backend details when member loading fails', async () => {
  const cloud = {
    listStudentMembers: async () => {
      throw new Error('失败 BN-ERROR-01 cloud://env/file')
    }
  }
  const { page } = loadPage('miniprogram/pages/parent-management/parent-management.js', {
    modules: { '../../utils/cloud': cloud }
  })

  page.setData({ studentId: 'student-route-id' })
  await page.loadMembers()

  assert.equal(page.data.error, '加载失败，请稍后重试')
  assert.equal(page.data.studentId, 'student-route-id')
})

test('parent management sanitizes editable names and selected relation labels', () => {
  const { page } = loadPage('miniprogram/pages/parent-management/parent-management.js', {
    modules: {
      '../../utils/cloud': {},
      '../../utils/constants': {
        RELATION_OPTIONS: [{ key: 'other', name: '失败 BN-RELATION-01 cloud://env/file' }]
      }
    }
  })

  page.onDisplayNameInput({ detail: { value: '复测 BN-PARENT-01 与 cloud://env/file' } })

  assert.equal(page.data.editingDisplayName, '复测')
  assert.equal(page.data.relationOptions[0].name, '家庭成员')
  assert.equal(page.data.editingRelationIndex, 0)
})

test('valid invite renders child summary and accepted invite navigates home', async () => {
  const wx = createWxMock()
  const cloud = {
    getStudentInvite: async (inviteId, token) => {
      assert.equal(inviteId, 'invite-1')
      assert.equal(token, 'abc')
      return { student: { _id: 'student-1', name: '钟青羽', grade: 6 }, role: 'viewer', presetRelation: 'mother', presetRelationText: '妈妈' }
    },
    acceptStudentInvite: async (inviteId, token, profile) => {
      assert.equal(profile.relation, 'mother')
      assert.equal(profile.displayName, '钟青羽妈妈')
      return { student: { _id: 'student-1', name: '钟青羽', grade: 6 }, role: 'viewer' }
    }
  }
  const { page } = loadPage('miniprogram/pages/join-student/join-student.js', {
    wx,
    modules: { '../../utils/cloud': cloud }
  })

  page.onLoad({ inviteId: 'invite-1', token: 'abc' })
  await waitForPageLoad(page)
  assert.equal(page.data.status, 'ready')
  assert.equal(page.data.student.name, '钟青羽')
  assert.equal(page.data.displayName, '钟青羽妈妈')

  await page.onAccept()
  assert.equal(page.data.status, 'success')
  assert.match(wx.calls.find(call => call.name === 'navigateTo').payload.url, /pages\/index\/index/)
})

for (const mode of ['link', 'code']) {
  test(`${mode} invite sanitizes the accepted student while preserving identity and navigation`, async () => {
    const wx = createWxMock()
    const acceptedStudent = {
      _id: '665f8c1a2b3c4d5e6f708192',
      name: 'BN-STUDENT-LEAK-01 cloud://env/file',
      grade: 6
    }
    const cloud = mode === 'link'
      ? {
          acceptStudentInvite: async () => ({ student: acceptedStudent, role: 'viewer' })
        }
      : {
          acceptStudentInviteByCode: async () => ({ student: acceptedStudent, role: 'viewer' })
        }
    const { page } = loadPage('miniprogram/pages/join-student/join-student.js', {
      wx,
      modules: { '../../utils/cloud': cloud }
    })

    page.setData({
      mode,
      status: 'ready',
      inviteId: 'invite-route-id',
      token: 'route-token',
      inviteCode: 'QY8392',
      student: { _id: 'student-before', name: '小明' }
    })
    await page.onAccept()

    assert.equal(page.data.student._id, acceptedStudent._id)
    assert.equal(page.data.student.name, '孩子档案')
    assert.equal(page.data.status, 'success')
    assert.match(wx.calls.find(call => call.name === 'navigateTo').payload.url, /pages\/index\/index/)
  })
}

test('join student hides backend details when invite loading fails', async () => {
  const cloud = {
    getStudentInvite: async () => {
      throw new Error('失败 BN-ERROR-01 cloud://env/file')
    }
  }
  const { page } = loadPage('miniprogram/pages/join-student/join-student.js', {
    modules: { '../../utils/cloud': cloud }
  })

  page.setData({ inviteId: 'invite-route-id', token: 'route-token' })
  await page.loadInvite()

  assert.equal(page.data.status, 'error')
  assert.equal(page.data.error, '加载失败，请稍后重试')
  assert.equal(page.data.inviteId, 'invite-route-id')
})

test('invite code lookup renders child summary and joins by code', async () => {
  const wx = createWxMock()
  const cloud = {
    getStudentInviteByCode: async inviteCode => {
      assert.equal(inviteCode, 'QY8392')
      return { student: { _id: 'student-1', name: '钟青羽', grade: 6 }, role: 'viewer', presetRelation: 'father', presetRelationText: '爸爸' }
    },
    acceptStudentInviteByCode: async payload => {
      assert.equal(payload.inviteCode, 'QY8392')
      assert.equal(payload.relation, 'father')
      assert.equal(payload.displayName, '钟青羽爸爸')
      return { student: { _id: 'student-1', name: '钟青羽', grade: 6 }, role: 'viewer' }
    }
  }
  const { page } = loadPage('miniprogram/pages/join-student/join-student.js', {
    wx,
    modules: { '../../utils/cloud': cloud }
  })

  page.onLoad({})
  await flushAsync()
  assert.equal(page.data.status, 'code')
  page.onInviteCodeInput({ detail: { value: 'qy8392' } })
  await page.onLookupCode()
  assert.equal(page.data.status, 'ready')
  assert.equal(page.data.inviteCode, 'QY8392')
  assert.equal(page.data.displayName, '钟青羽爸爸')

  await page.onAccept()
  assert.equal(page.data.status, 'success')
  assert.match(wx.calls.find(call => call.name === 'navigateTo').payload.url, /pages\/index\/index/)
})

test('join student sanitizes bound input values and selected relation labels', () => {
  const { page } = loadPage('miniprogram/pages/join-student/join-student.js', {
    modules: {
      '../../utils/cloud': {},
      '../../utils/constants': {
        RELATION_OPTIONS: [{ key: 'other', name: '失败 ERR-RELATION-01 cloud://env/file' }]
      }
    }
  })

  page.onInviteCodeInput({ detail: { value: 'BN-INPUT-01' } })
  page.onDisplayNameInput({ detail: { value: '复测 BN-NAME-01 与 cloud://env/file' } })

  assert.equal(page.data.inviteCode, '')
  assert.equal(page.data.displayName, '复测')
  assert.equal(page.data.relationOptions[0].name, '家庭成员')
  assert.equal(page.data.relationIndex, 0)
})

test('invalid invite shows error state', async () => {
  const cloud = {
    getStudentInvite: async () => { throw new Error('邀请不存在或已失效') }
  }
  const { page } = loadPage('miniprogram/pages/join-student/join-student.js', {
    modules: { '../../utils/cloud': cloud }
  })

  page.onLoad({ inviteId: 'bad', token: 'bad' })
  await waitForPageLoad(page)
  assert.equal(page.data.status, 'error')
  assert.equal(page.data.error, '邀请不存在或已失效')
})

test('join student preserves exact actionable invite errors but hides decorated backend errors', async () => {
  const messages = ['邀请已过期', '邀请码无效', '已绑定']
  for (const message of messages) {
    const { page } = loadPage('miniprogram/pages/join-student/join-student.js', {
      modules: {
        '../../utils/cloud': {
          getStudentInviteByCode: async () => { throw new Error(message) }
        }
      }
    })
    page.setData({ inviteCode: 'QY8392' })
    await page.onLookupCode()
    assert.equal(page.data.error, message)
  }

  const { page } = loadPage('miniprogram/pages/join-student/join-student.js', {
    modules: {
      '../../utils/cloud': {
        acceptStudentInvite: async () => { throw new Error('邀请已过期 BN-ERROR-01 cloud://env/file') }
      }
    }
  })
  page.setData({ status: 'ready', inviteId: 'invite-route-id', token: 'route-token' })
  await page.onAccept()
  assert.equal(page.data.error, '加入失败，请稍后重试')
})

test('B1 forms retain student creation and invite bindings with compact warm form controls', () => {
  const addStudent = fs.readFileSync(path.join(ROOT, 'miniprogram/pages/add-student/add-student.wxml'), 'utf8')
  const addStudentStyles = fs.readFileSync(path.join(ROOT, 'miniprogram/pages/add-student/add-student.wxss'), 'utf8')
  const joinStudent = fs.readFileSync(path.join(ROOT, 'miniprogram/pages/join-student/join-student.wxml'), 'utf8')
  const joinStudentStyles = fs.readFileSync(path.join(ROOT, 'miniprogram/pages/join-student/join-student.wxss'), 'utf8')

  assert.match(addStudent, /class="form b1-card form-card"/)
  assert.match(addStudent, /class="input form-input"/)
  assert.match(addStudent, /class="b1-button-primary form-primary btn-save" bindtap="onSave"/)
  assert.match(addStudent, /bindinput="onNameInput"/)
  assert.match(addStudent, /bindtap="onGradeTap"/)
  assert.match(addStudentStyles, /var\(--b1-surface\)/)
  assert.match(addStudentStyles, /var\(--b1-border\)/)
  assert.match(addStudentStyles, /var\(--b1-improved-fg\)/)

  assert.match(joinStudent, /class="card b1-card form-card code-card"/)
  assert.match(joinStudent, /class="code-input form-input"/)
  assert.match(joinStudent, /class="b1-button-primary form-primary" loading="\{\{lookingUp\}\}" bindtap="onLookupCode"/)
  assert.match(joinStudent, /bindinput="onInviteCodeInput"/)
  assert.match(joinStudent, /bindtap="onAccept"/)
  assert.match(joinStudentStyles, /var\(--b1-surface\)/)
  assert.match(joinStudentStyles, /var\(--b1-border\)/)
  assert.match(joinStudentStyles, /var\(--b1-improved-fg\)/)
})

test('B1 parent management keeps owner actions distinct from viewer permissions', () => {
  const source = fs.readFileSync(path.join(ROOT, 'miniprogram/pages/parent-management/parent-management.wxml'), 'utf8')
  const styles = fs.readFileSync(path.join(ROOT, 'miniprogram/pages/parent-management/parent-management.wxss'), 'utf8')

  assert.match(source, /wx:if="\{\{canInvite\}\}" class="b1-button-secondary member-edit"/)
  assert.match(source, /wx:if="\{\{canInvite\}\}" class="b1-button-primary management-primary"/)
  assert.match(source, /class="notice b1-neutral" wx:if="\{\{role === 'viewer'\}\}"/)
  // 移除入口按设计文档属于 owner 专属能力：viewer 不可见，owner 本人行也不出现
  assert.match(source, /wx:if="\{\{canInvite && item.role !== 'owner'\}\}".*bindtap="onRemoveMember"/)
  assert.match(styles, /var\(--b1-improved-fg\)/)
})

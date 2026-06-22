const cloud = require('../../utils/cloud')
const { RELATION_OPTIONS } = require('../../utils/constants')

function formatMember(member) {
  const role = member.role === 'owner' ? '档案创建者' : '共同家长'
  const relationText = member.relationText || (member.role === 'owner' ? '创建者' : '其他')
  return {
    ...member,
    roleText: role,
    relationText,
    displayText: member.displayName || relationText || role,
    avatarText: relationText.slice(0, 1) || (member.role === 'owner' ? '主' : '家'),
  }
}

Page({
  data: {
    studentId: '',
    student: null,
    role: '',
    permissions: {},
    canInvite: false,
    members: [],
    invite: null,
    loading: false,
    creating: false,
    saving: false,
    error: '',
    relationOptions: RELATION_OPTIONS,
    inviteRelation: 'mother',
    inviteRelationIndex: 1,
    editingMemberIndex: -1,
    editingDisplayName: '',
    editingRelation: 'other',
    editingRelationIndex: RELATION_OPTIONS.length - 1,
  },

  onLoad(options = {}) {
    this.setData({ studentId: options.studentId || '' })
    this._loadPromise = this.loadMembers().catch(error => {
      console.error('加载家长管理失败', error)
    })
  },

  async loadMembers() {
    if (!this.data.studentId) {
      this.setData({ error: '缺少孩子档案信息' })
      return
    }

    this.setData({ loading: true, error: '' })
    try {
      const result = await cloud.listStudentMembers(this.data.studentId)
      const permissions = result.permissions || {}
      this.setData({
        student: result.student || null,
        role: result.role || '',
        permissions,
        canInvite: Boolean(permissions.canManageParents),
        members: (result.members || []).map(formatMember),
        loading: false,
      })
    } catch (error) {
      this.setData({
        loading: false,
        error: error && error.message ? error.message : '家长信息加载失败',
      })
    }
  },

  async onCreateInvite() {
    if (!this.data.canInvite || this.data.creating) return

    this.setData({ creating: true, error: '' })
    try {
      const invite = await cloud.createStudentInvite(this.data.studentId, this.data.inviteRelation)
      this.setData({ invite, creating: false })
    } catch (error) {
      this.setData({
        creating: false,
        error: error && error.message ? error.message : '邀请创建失败',
      })
    }
  },

  onInviteRelationChange(e) {
    const index = Number(e.detail.value)
    const option = this.data.relationOptions[index] || this.data.relationOptions[0]
    this.setData({
      inviteRelationIndex: index,
      inviteRelation: option.key
    })
  },

  onEditMember(e) {
    if (!this.data.canInvite) return
    const index = Number(e.currentTarget.dataset.index)
    const member = this.data.members[index]
    if (!member) return
    const relationIndex = this.findRelationIndex(member.relation)
    this.setData({
      editingMemberIndex: index,
      editingDisplayName: member.displayName || member.displayText || '',
      editingRelation: this.data.relationOptions[relationIndex].key,
      editingRelationIndex: relationIndex,
      error: ''
    })
  },

  onCancelEditMember() {
    this.setData({
      editingMemberIndex: -1,
      editingDisplayName: '',
      editingRelation: 'other',
      editingRelationIndex: this.findRelationIndex('other')
    })
  },

  onDisplayNameInput(e) {
    this.setData({ editingDisplayName: e.detail.value })
  },

  onRelationChange(e) {
    const index = Number(e.detail.value)
    const option = this.data.relationOptions[index] || this.data.relationOptions[this.findRelationIndex('other')]
    this.setData({
      editingRelationIndex: index,
      editingRelation: option.key
    })
  },

  async onSaveMemberProfile() {
    if (this.data.saving) return
    const member = this.data.members[this.data.editingMemberIndex]
    if (!member) return

    this.setData({ saving: true, error: '' })
    try {
      await cloud.updateStudentMemberProfile({
        studentId: this.data.studentId,
        memberOpenId: member.memberOpenId,
        displayName: this.data.editingDisplayName,
        relation: this.data.editingRelation
      })
      this.setData({ saving: false })
      this.onCancelEditMember()
      await this.loadMembers()
      wx.showToast({ title: '已保存', icon: 'success' })
    } catch (error) {
      this.setData({
        saving: false,
        error: error && error.message ? error.message : '保存失败'
      })
    }
  },

  findRelationIndex(relation) {
    const index = this.data.relationOptions.findIndex(item => item.key === relation)
    return index >= 0 ? index : this.data.relationOptions.findIndex(item => item.key === 'other')
  },

  onRefresh() {
    return this.loadMembers()
  },
})

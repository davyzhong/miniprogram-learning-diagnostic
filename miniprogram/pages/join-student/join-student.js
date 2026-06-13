const cloud = require('../../utils/cloud')

const RELATION_OPTIONS = [
  { key: 'father', name: '爸爸' },
  { key: 'mother', name: '妈妈' },
  { key: 'grandfather', name: '爷爷' },
  { key: 'grandmother', name: '奶奶' },
  { key: 'maternal_grandfather', name: '外公' },
  { key: 'maternal_grandmother', name: '外婆' },
  { key: 'teacher', name: '老师' },
  { key: 'other', name: '其他' }
]

Page({
  data: {
    mode: 'link',
    inviteId: '',
    token: '',
    inviteCode: '',
    status: 'loading',
    student: null,
    role: '',
    relationOptions: RELATION_OPTIONS,
    relation: 'other',
    relationIndex: RELATION_OPTIONS.length - 1,
    displayName: '',
    error: '',
    accepting: false,
    lookingUp: false,
  },

  async onLoad(options = {}) {
    const inviteId = options.inviteId || ''
    const token = options.token || ''
    if (!inviteId || !token) {
      this.setData({ mode: 'code', status: 'code', inviteId: '', token: '' })
      return
    }
    this.setData({ mode: 'link', inviteId, token })
    await this.loadInvite()
  },

  async loadInvite() {
    if (!this.data.inviteId || !this.data.token) {
      this.setData({ status: 'error', error: '邀请信息不完整' })
      return
    }

    this.setData({ status: 'loading', error: '' })
    try {
      const result = await cloud.getStudentInvite(this.data.inviteId, this.data.token)
      const relation = result.presetRelation || 'other'
      const relationIndex = this.findRelationIndex(relation)
      this.setData({
        status: result.alreadyJoined ? 'joined' : 'ready',
        student: result.student || null,
        role: result.role || 'viewer',
        relation: this.data.relationOptions[relationIndex].key,
        relationIndex,
        displayName: this.buildDefaultDisplayName(result.student, result.presetRelationText),
      })
    } catch (error) {
      this.setData({
        status: 'error',
        error: error && error.message ? error.message : '邀请已失效',
      })
    }
  },

  async onAccept() {
    if (this.data.accepting || this.data.status === 'success') return

    this.setData({ accepting: true, error: '' })
    try {
      const profile = {
        displayName: this.data.displayName,
        relation: this.data.relation
      }
      const result = this.data.mode === 'code'
        ? await cloud.acceptStudentInviteByCode({ inviteCode: this.data.inviteCode, ...profile })
        : await cloud.acceptStudentInvite(this.data.inviteId, this.data.token, profile)
      this.setData({
        accepting: false,
        status: 'success',
        student: result.student || this.data.student,
        role: result.role || this.data.role,
      })
      wx.navigateTo({ url: '/pages/index/index' })
    } catch (error) {
      this.setData({
        accepting: false,
        status: 'error',
        error: error && error.message ? error.message : '加入失败，请稍后重试',
      })
    }
  },

  async onLookupCode() {
    if (this.data.lookingUp) return
    const inviteCode = String(this.data.inviteCode || '').trim().toUpperCase()
    if (!inviteCode) {
      this.setData({ error: '请输入邀请码' })
      return
    }
    this.setData({ lookingUp: true, error: '', status: 'loading' })
    try {
      const result = await cloud.getStudentInviteByCode(inviteCode)
      const relation = result.presetRelation || 'other'
      const relationIndex = this.findRelationIndex(relation)
      this.setData({
        mode: 'code',
        lookingUp: false,
        status: result.alreadyJoined ? 'joined' : 'ready',
        student: result.student || null,
        role: result.role || 'viewer',
        relation: this.data.relationOptions[relationIndex].key,
        relationIndex,
        displayName: this.buildDefaultDisplayName(result.student, result.presetRelationText),
      })
    } catch (error) {
      this.setData({
        mode: 'code',
        lookingUp: false,
        status: 'code',
        error: error && error.message ? error.message : '邀请码无效'
      })
    }
  },

  onInviteCodeInput(e) {
    this.setData({
      inviteCode: String(e.detail.value || '').trim().toUpperCase(),
      error: ''
    })
  },

  onDisplayNameInput(e) {
    this.setData({ displayName: e.detail.value })
  },

  onRelationChange(e) {
    const index = Number(e.detail.value)
    const option = this.data.relationOptions[index] || this.data.relationOptions[this.findRelationIndex('other')]
    this.setData({
      relationIndex: index,
      relation: option.key
    })
  },

  onRetry() {
    if (this.data.mode === 'code') {
      this.setData({ status: 'code', error: '' })
      return
    }
    return this.loadInvite()
  },

  onGoHome() {
    wx.navigateTo({ url: '/pages/index/index' })
  },

  findRelationIndex(relation) {
    const index = this.data.relationOptions.findIndex(item => item.key === relation)
    return index >= 0 ? index : this.data.relationOptions.findIndex(item => item.key === 'other')
  },

  buildDefaultDisplayName(student, relationText) {
    if (!student || !student.name || !relationText || relationText === '其他') return relationText || ''
    return `${student.name}${relationText}`
  },
})

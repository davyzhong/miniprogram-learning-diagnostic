const cloud = require('../../utils/cloud')
const { RELATION_OPTIONS } = require('../../utils/constants')
const { sanitizeUserText } = require('../../utils/user-facing-text')
const { symbolOf } = require('../../utils/ui-symbols')

function safeRelationOptions(options = []) {
  return options.map(option => {
    const rawName = String(option.name || '').trim()
    const name = sanitizeUserText(rawName, { treatAsId: true })
    return { ...option, name: name === rawName && name ? name : '家庭成员' }
  })
}

const VISIBLE_RELATION_OPTIONS = safeRelationOptions(RELATION_OPTIONS)
const DEFAULT_RELATION_INDEX = Math.max(0, VISIBLE_RELATION_OPTIONS.findIndex(option => option.key === 'other'))
const DEFAULT_RELATION = (VISIBLE_RELATION_OPTIONS[DEFAULT_RELATION_INDEX] || {}).key || 'other'

const INVITE_DOMAIN_ERROR_MESSAGES = new Set([
  '邀请不存在或已失效',
  '邀请已过期',
  '邀请码无效',
  '已绑定'
])

function inviteErrorText(error, fallback) {
  const message = String(error && error.message ? error.message : error || '').trim()
  return INVITE_DOMAIN_ERROR_MESSAGES.has(message) ? message : fallback
}

function safeStudent(student) {
  if (!student) return null
  return {
    ...student,
    name: sanitizeUserText(student.name || '孩子档案', { treatAsId: true }) || '孩子档案'
  }
}

Page({
  data: {
    mode: 'link',
    inviteId: '',
    token: '',
    inviteCode: '',
    status: 'loading',
    student: null,
    role: '',
    familySymbol: symbolOf('family'),
    studentSymbol: symbolOf('student'),
    relationOptions: VISIBLE_RELATION_OPTIONS,
    relation: DEFAULT_RELATION,
    relationIndex: DEFAULT_RELATION_INDEX,
    displayName: '',
    error: '',
    accepting: false,
    lookingUp: false,
  },

  onLoad(options = {}) {
    const inviteId = options.inviteId || ''
    const token = options.token || ''
    if (!inviteId || !token) {
      this.setData({ mode: 'code', status: 'code', inviteId: '', token: '' })
      return
    }
    this.setData({ mode: 'link', inviteId, token })
    this._loadPromise = this.loadInvite().catch(error => {
      console.error('加载邀请信息失败', error)
    })
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
        student: safeStudent(result.student),
        role: result.role || 'viewer',
        relation: this.data.relationOptions[relationIndex].key,
        relationIndex,
        displayName: sanitizeUserText(
          this.buildDefaultDisplayName(result.student, result.presetRelationText),
          { treatAsId: true }
        ),
      })
    } catch (error) {
      console.error('邀请信息加载失败', error)
      this.setData({
        status: 'error',
        error: inviteErrorText(error, '加载失败，请稍后重试'),
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
        student: safeStudent(result.student) || this.data.student,
        role: result.role || this.data.role,
      })
      wx.navigateTo({ url: '/pages/index/index' })
    } catch (error) {
      console.error('加入孩子档案失败', error)
      this.setData({
        accepting: false,
        status: 'error',
        error: inviteErrorText(error, '加入失败，请稍后重试'),
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
        student: safeStudent(result.student),
        role: result.role || 'viewer',
        relation: this.data.relationOptions[relationIndex].key,
        relationIndex,
        displayName: sanitizeUserText(
          this.buildDefaultDisplayName(result.student, result.presetRelationText),
          { treatAsId: true }
        ),
      })
    } catch (error) {
      console.error('邀请码查询失败', error)
      this.setData({
        mode: 'code',
        lookingUp: false,
        status: 'code',
        error: inviteErrorText(error, '查询失败，请稍后重试')
      })
    }
  },

  onInviteCodeInput(e) {
    const inviteCode = sanitizeUserText(String(e.detail.value || '').trim().toUpperCase(), { treatAsId: true })
    this.setData({
      inviteCode,
      error: ''
    })
  },

  onDisplayNameInput(e) {
    this.setData({
      displayName: sanitizeUserText(e.detail.value || '', { treatAsId: true })
    })
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

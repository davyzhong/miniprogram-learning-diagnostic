// aiUsage 云函数 — AI 用量账本 + 数据删除请求 + 内测授权。
//
// 事件写入（pending→succeeded/failed）由各 AI 云函数通过本地 usage-ledger.js 副本完成，
// 本函数只负责读取、聚合和删除/授权管理。所有读操作按 _openid 隔离（用户只能看自己的）。
//
// 设计文档：docs/superpowers/specs/2026-06-27-private-beta-ai-usage-design.md

const cloud = require('wx-server-sdk')
const {
  getStudentAccess,
  canOperateLearning,
  isMissingCollectionError
} = require('./access')

cloud.init({ env: cloud.SYMBOL_CURRENT_ENV })
const db = cloud.database()

const MAX_EVENTS = 50
const DELETION_SCOPES = new Set(['student_all', 'photos_only', 'usage_only'])
const DELETION_NOTE_MAX = 300

function cleanText(value, maxLength) {
  return String(value || '').trim().slice(0, maxLength)
}

function nowDate() {
  return db.serverDate ? db.serverDate() : new Date()
}

// 公开字段：剥离内部/敏感信息后返回给前端。
function publicEvent(item) {
  return {
    _id: item._id,
    studentId: item.studentId || '',
    subject: item.subject || '',
    eventType: item.eventType || '',
    sourceType: item.sourceType || '',
    cloudFunction: item.cloudFunction || '',
    model: item.model || '',
    inputTokens: Number(item.inputTokens) || 0,
    outputTokens: Number(item.outputTokens) || 0,
    totalTokens: Number(item.totalTokens) || 0,
    imageCount: Number(item.imageCount) || 0,
    pageCount: Number(item.pageCount) || 0,
    estimatedCostCny: Number(item.estimatedCostCny) || 0,
    costSource: item.costSource || '',
    status: item.status || '',
    isEstimate: Boolean(item.isEstimate),
    errorMessage: item.errorMessage || '',
    createdAt: item.createdAt,
    completedAt: item.completedAt
  }
}

function publicDeletionRequest(item) {
  return {
    _id: item._id,
    studentId: item.studentId || '',
    scope: item.scope || '',
    reason: item.reason || '',
    status: item.status || 'requested',
    createdAt: item.createdAt,
    processedAt: item.processedAt || null,
    note: item.note || ''
  }
}

// 月份过滤：createdAt 为 Date 或 serverDate，按 YYYY-MM 前缀匹配。
// mock 与真实 DB 的 createdAt 可能是 Date 或字符串，统一转 ISO 比较。
function inMonth(item, month) {
  if (!month) return true
  const raw = item.createdAt
  const iso = raw instanceof Date ? raw.toISOString() : String(raw || '')
  return iso.startsWith(month)
}

// ── listEvents：列出当前用户本月用量事件 ──
async function listEvents(event, openId) {
  if (!openId) return { success: false, error: '未登录' }
  let res
  try {
    res = await db.collection('aiUsageEvents')
      .where({ _openid: openId })
      .orderBy('createdAt', 'desc')
      .limit(MAX_EVENTS)
      .get()
  } catch (error) {
    if (isMissingCollectionError(error)) return { success: true, items: [], hasMore: false }
    throw error
  }
  const all = (res.data || []).filter(item => inMonth(item, event.month))
  return {
    success: true,
    items: all.map(publicEvent),
    hasMore: false
  }
}

// ── getSummary：聚合本月用量 ──
async function getSummary(event, openId) {
  if (!openId) return { success: false, error: '未登录' }
  let res
  try {
    res = await db.collection('aiUsageEvents')
      .where({ _openid: openId })
      .orderBy('createdAt', 'desc')
      .limit(500)
      .get()
  } catch (error) {
    if (isMissingCollectionError(error)) return emptySummary(event.month || currentMonth())
    throw error
  }
  const events = (res.data || []).filter(item => inMonth(item, event.month))
  return aggregateSummary(events, event.month || currentMonth())
}

function currentMonth() {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
}

function emptySummary(month) {
  return {
    success: true,
    month,
    totalTokens: 0,
    totalCostCny: 0,
    callCount: 0,
    studentCount: 0,
    byEventType: [],
    byModel: []
  }
}

function aggregateSummary(events, month) {
  let totalTokens = 0
  let totalCostCny = 0
  const students = new Set()
  const byEventTypeMap = {}
  const byModelMap = {}

  for (const item of events) {
    const tokens = Number(item.totalTokens) || 0
    const cost = Number(item.estimatedCostCny) || 0
    totalTokens += tokens
    totalCostCny += cost
    if (item.studentId) students.add(item.studentId)

    const et = item.eventType || 'unknown'
    if (!byEventTypeMap[et]) byEventTypeMap[et] = { eventType: et, callCount: 0, totalTokens: 0, totalCostCny: 0 }
    byEventTypeMap[et].callCount += 1
    byEventTypeMap[et].totalTokens += tokens
    byEventTypeMap[et].totalCostCny = round4(byEventTypeMap[et].totalCostCny + cost)

    const m = item.model || 'unknown'
    if (!byModelMap[m]) byModelMap[m] = { model: m, callCount: 0, totalTokens: 0, totalCostCny: 0 }
    byModelMap[m].callCount += 1
    byModelMap[m].totalTokens += tokens
    byModelMap[m].totalCostCny = round4(byModelMap[m].totalCostCny + cost)
  }

  return {
    success: true,
    month,
    totalTokens,
    totalCostCny: round4(totalCostCny),
    callCount: events.length,
    studentCount: students.size,
    byEventType: Object.values(byEventTypeMap).sort((a, b) => b.totalCostCny - a.totalCostCny),
    byModel: Object.values(byModelMap).sort((a, b) => b.totalCostCny - a.totalCostCny)
  }
}

function round4(value) {
  return Math.round((Number(value) || 0) * 10000) / 10000
}

// ── createDeletionRequest：发起数据删除请求 ──
async function createDeletionRequest(event, openId) {
  if (!openId) return { success: false, error: '未登录' }
  const scope = cleanText(event.scope, 30)
  if (!DELETION_SCOPES.has(scope)) return { success: false, error: '无效的删除范围' }
  const studentId = cleanText(event.studentId, 60)

  // 若指定 studentId，需校验归属
  if (studentId) {
    const access = await getStudentAccess(db, studentId, openId)
    if (!canOperateLearning(access)) return { success: false, error: '无权操作该学生数据' }
  }

  const data = {
    _openid: openId,
    studentId,
    scope,
    reason: cleanText(event.reason, 300),
    status: 'requested',
    createdAt: nowDate(),
    processedAt: null,
    processedBy: '',
    note: cleanText(event.note, DELETION_NOTE_MAX)
  }
  let res
  try {
    res = await db.collection('dataDeletionRequests').add({ data })
  } catch (error) {
    if (isMissingCollectionError(error) && db.createCollection) {
      await db.createCollection('dataDeletionRequests')
      res = await db.collection('dataDeletionRequests').add({ data })
    } else {
      throw error
    }
  }
  return { success: true, requestId: res._id }
}

// ── getDeletionRequests：查看自己的删除请求 ──
async function getDeletionRequests(event, openId) {
  if (!openId) return { success: false, error: '未登录' }
  let res
  try {
    res = await db.collection('dataDeletionRequests')
      .where({ _openid: openId })
      .orderBy('createdAt', 'desc')
      .limit(20)
      .get()
  } catch (error) {
    if (isMissingCollectionError(error)) return { success: true, items: [] }
    throw error
  }
  return { success: true, items: (res.data || []).map(publicDeletionRequest) }
}

// ── getBetaAuth / setBetaAuth：内测授权 ──
async function getBetaAuth(event, openId) {
  if (!openId) return { success: false, error: '未登录' }
  let res
  try {
    res = await db.collection('userConsents')
      .where({ _openid: openId })
      .limit(1)
      .get()
  } catch (error) {
    if (isMissingCollectionError(error)) return { success: true, consented: false, consentedAt: null }
    throw error
  }
  const doc = (res.data || [])[0]
  return {
    success: true,
    consented: Boolean(doc && doc.betaConsented),
    consentedAt: doc ? doc.consentedAt : null
  }
}

async function setBetaAuth(event, openId) {
  if (!openId) return { success: false, error: '未登录' }
  const consented = event.consented === true
  const existing = await getBetaAuth(event, openId)
  // 已授权且再次授权 → 幂等返回
  if (existing.consented && consented) {
    return { success: true, consented: true, consentedAt: existing.consentedAt }
  }

  const data = {
    _openid: openId,
    betaConsented: consented,
    consentedAt: consented ? nowDate() : null,
    updatedAt: nowDate()
  }
  try {
    // 先尝试查现有记录再决定 add/update
    const lookup = await db.collection('userConsents').where({ _openid: openId }).limit(1).get()
    const doc = (lookup.data || [])[0]
    if (doc && doc._id) {
      await db.collection('userConsents').doc(doc._id).update({ data: { betaConsented: consented, consentedAt: data.consentedAt, updatedAt: data.updatedAt } })
      return { success: true, consented, consentedAt: data.consentedAt }
    }
    await db.collection('userConsents').add({ data })
    return { success: true, consented, consentedAt: data.consentedAt }
  } catch (error) {
    if (isMissingCollectionError(error) && db.createCollection) {
      await db.createCollection('userConsents')
      await db.collection('userConsents').add({ data })
      return { success: true, consented, consentedAt: data.consentedAt }
    }
    throw error
  }
}

exports.main = async (event = {}) => {
  const openId = cloud.getWXContext().OPENID
  try {
    if (event.action === 'listEvents') return await listEvents(event, openId)
    if (event.action === 'getSummary') return await getSummary(event, openId)
    if (event.action === 'createDeletionRequest') return await createDeletionRequest(event, openId)
    if (event.action === 'getDeletionRequests') return await getDeletionRequests(event, openId)
    if (event.action === 'getBetaAuth') return await getBetaAuth(event, openId)
    if (event.action === 'setBetaAuth') return await setBetaAuth(event, openId)
    return { success: false, error: '未知操作' }
  } catch (error) {
    console.error('[aiUsage] failed', error)
    return { success: false, error: cleanText(error.message || '用量查询失败', 160) }
  }
}

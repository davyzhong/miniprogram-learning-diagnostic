const cloud = require('wx-server-sdk')

cloud.init({ env: cloud.SYMBOL_CURRENT_ENV })
const db = cloud.database()

const FEEDBACK_TYPES = new Set([
  'wrong_bottleneck',
  'wrong_question',
  'duplicate_photo',
  'unclear_result',
  'other'
])

const TARGET_TYPES = new Set([
  'report',
  'bottleneck',
  'errorDetail',
  'photo'
])

function cleanText(value, maxLength) {
  return String(value || '').trim().slice(0, maxLength)
}

function isMissingCollectionError(error) {
  const text = String((error && (error.errMsg || error.message || error.code || error.errCode)) || '')
  return Boolean(error && error.errCode === -502005)
    || /collection not exists|Db or Table not exist|DATABASE_COLLECTION_NOT_EXIST|ResourceNotFound/i.test(text)
}

async function getStudent(studentId) {
  if (!studentId) return null
  const res = await db.collection('students').doc(studentId).get()
  return res.data || null
}

async function getActiveMember(studentId, openId) {
  if (!studentId || !openId) return null
  const res = await db.collection('studentMembers').where({
    studentId,
    memberOpenId: openId,
    status: 'active'
  }).get()
  return (res.data || [])[0] || null
}

async function getLearningResourceAccess(resource, openId) {
  if (!resource) return { allowed: false, owner: false, role: '', student: null }
  if (resource._openid && resource._openid === openId) {
    const student = resource.studentId ? await getStudent(resource.studentId) : null
    return { allowed: true, owner: true, role: 'owner', student }
  }
  const member = await getActiveMember(resource.studentId, openId)
  if (member) {
    const role = member.role || 'viewer'
    const student = resource.studentId ? await getStudent(resource.studentId) : null
    return {
      allowed: true,
      owner: role === 'owner',
      role,
      student,
      member
    }
  }
  return { allowed: false, owner: false, role: '', student: null }
}

function canReadLearning(access) {
  return Boolean(access && access.allowed)
}

function canOperateLearning(access) {
  return Boolean(access && access.allowed)
}

function publicFeedback(item) {
  return {
    _id: item._id,
    reportId: item.reportId,
    studentId: item.studentId,
    subject: item.subject,
    type: item.type,
    targetType: item.targetType,
    targetId: item.targetId,
    reason: item.reason,
    note: item.note,
    status: item.status,
    createdAt: item.createdAt,
    updatedAt: item.updatedAt
  }
}

async function getReport(reportId) {
  if (!reportId) throw new Error('缺少 reportId')
  const res = await db.collection('reports').doc(reportId).get()
  if (!res.data) throw new Error('报告不存在')
  return res.data
}

async function assertReportAccess(report, openId, operation = 'read') {
  const access = await getLearningResourceAccess(report, openId)
  const allowed = operation === 'operate' ? canOperateLearning(access) : canReadLearning(access)
  if (!allowed) throw new Error('无权限访问该报告')
  return access
}

async function createFeedback(event, openId) {
  const report = await getReport(cleanText(event.reportId, 80))
  await assertReportAccess(report, openId, 'operate')

  const type = cleanText(event.type, 40)
  const targetType = cleanText(event.targetType || 'report', 40)
  const reason = cleanText(event.reason, 120)
  if (!FEEDBACK_TYPES.has(type)) throw new Error('反馈类型无效')
  if (!TARGET_TYPES.has(targetType)) throw new Error('反馈对象无效')
  if (!reason) throw new Error('请填写反馈原因')

  const now = new Date()
  const data = {
    _openid: openId,
    studentId: report.studentId,
    reportId: report._id || event.reportId,
    subject: report.subject || '',
    type,
    targetType,
    targetId: cleanText(event.targetId, 120),
    reason,
    note: cleanText(event.note, 500),
    status: 'submitted',
    createdAt: now,
    updatedAt: now
  }

  let res
  try {
    res = await db.collection('reportFeedback').add({ data })
  } catch (error) {
    if (!isMissingCollectionError(error) || typeof db.createCollection !== 'function') throw error
    await db.createCollection('reportFeedback')
    res = await db.collection('reportFeedback').add({ data })
  }
  return { success: true, feedback: publicFeedback({ _id: res._id, ...data }) }
}

async function listFeedbackByReport(event, openId) {
  const report = await getReport(cleanText(event.reportId, 80))
  await assertReportAccess(report, openId, 'read')
  let res
  try {
    res = await db.collection('reportFeedback')
      .where({ reportId: report._id || event.reportId })
      .orderBy('createdAt', 'desc')
      .limit(100)
      .get()
  } catch (error) {
    if (isMissingCollectionError(error)) {
      return { success: true, items: [] }
    }
    throw error
  }
  return {
    success: true,
    items: (res.data || []).map(publicFeedback)
  }
}

exports.main = async (event = {}) => {
  const openId = cloud.getWXContext().OPENID
  try {
    if (event.action === 'createFeedback') {
      return await createFeedback(event, openId)
    }
    if (event.action === 'listFeedbackByReport') {
      return await listFeedbackByReport(event, openId)
    }
    return { success: false, error: '未知操作' }
  } catch (error) {
    return { success: false, error: cleanText(error.message || '反馈操作失败', 160) }
  }
}

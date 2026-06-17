const cloud = require('wx-server-sdk')
const { buildResourcePackDraft } = require('./resource-pack-generator')
const {
  getStudentAccess,
  getLearningResourceAccess,
  canReadLearning,
  canOperateLearning
} = require('../_shared/access')

cloud.init({ env: cloud.SYMBOL_CURRENT_ENV })
const db = cloud.database()

function now() {
  return new Date()
}

function cleanText(value = '', maxLength = 160) {
  return String(value || '').trim().slice(0, maxLength)
}

function publicPack(pack = {}) {
  return {
    _id: pack._id,
    studentId: pack.studentId,
    subject: pack.subject,
    sourceType: pack.sourceType,
    sourceReportId: pack.sourceReportId,
    lpCode: pack.lpCode,
    bottleneckId: pack.bottleneckId,
    targetId: pack.targetId,
    title: pack.title,
    status: pack.status,
    estimatedMinutes: pack.estimatedMinutes,
    version: pack.version,
    blocks: pack.blocks || [],
    practiceItems: pack.practiceItems || [],
    externalResources: pack.externalResources || [],
    progress: pack.progress || null,
    verificationScheduled: Boolean(pack.verificationScheduled),
    verificationScheduledAt: pack.verificationScheduledAt || null,
    createdAt: pack.createdAt,
    updatedAt: pack.updatedAt
  }
}

async function assertStudentOperate(studentId, openId) {
  const access = await getStudentAccess(db, studentId, openId)
  if (!canOperateLearning(access)) throw new Error('无权操作该学生的学习材料')
  return access
}

async function getPackById(packId) {
  if (!packId) throw new Error('缺少学习任务包 ID')
  const res = await db.collection('learningResourcePacks').doc(packId).get()
  if (!res.data) throw new Error('学习任务包不存在')
  return res.data
}

async function assertPackAccess(pack, openId, operation = 'read') {
  const access = await getLearningResourceAccess(db, pack, openId)
  const allowed = operation === 'operate' ? canOperateLearning(access) : canReadLearning(access)
  if (!allowed) throw new Error('无权访问该学习任务包')
  return access
}

async function generatePack(event, openId) {
  const studentId = cleanText(event.studentId, 80)
  const subject = cleanText(event.subject || 'math', 20)
  if (subject !== 'math') throw new Error('第一版学习任务包仅支持数学')
  await assertStudentOperate(studentId, openId)

  // 安全校验：如果传了 sourceReportId，必须确认该报告确实属于当前 studentId，
  // 防止伪造任务包与报告的血缘关联
  const sourceReportId = cleanText(event.sourceReportId, 80)
  if (sourceReportId) {
    const reportRes = await db.collection('reports').doc(sourceReportId).get()
    const sourceReport = reportRes.data
    if (!sourceReport) throw new Error('关联的分析报告不存在')
    if (sourceReport.studentId !== studentId) throw new Error('关联报告归属与当前学生不匹配')
  }

  const draft = buildResourcePackDraft({
    studentId,
    subject,
    sourceReportId,
    target: event.target || {},
    resources: event.resources || []
  })
  const createdAt = now()
  const data = {
    ...draft,
    _openid: openId,
    createdAt,
    updatedAt: createdAt
  }
  const result = await db.collection('learningResourcePacks').add({ data })
  return {
    success: true,
    packId: result._id,
    pack: publicPack({ _id: result._id, ...data })
  }
}

async function getPack(event, openId) {
  const pack = await getPackById(cleanText(event.packId, 80))
  await assertPackAccess(pack, openId, 'read')
  return { success: true, pack: publicPack(pack) }
}

async function completePack(event, openId) {
  const packId = cleanText(event.packId, 80)
  const pack = await getPackById(packId)
  await assertPackAccess(pack, openId, 'operate')
  const completedAt = now()
  await db.collection('learningResourcePacks').doc(packId).update({
    data: {
      status: 'completed',
      progress: {
        completedAt,
        practiceResult: event.practiceResult || {}
      },
      updatedAt: completedAt
    }
  })
  return { success: true, completedAt }
}

async function scheduleVerification(event, openId) {
  const packId = cleanText(event.packId, 80)
  const pack = await getPackById(packId)
  await assertPackAccess(pack, openId, 'operate')
  const scheduledAt = now()
  await db.collection('learningResourcePacks').doc(packId).update({
    data: {
      verificationScheduled: true,
      verificationScheduledAt: scheduledAt,
      updatedAt: scheduledAt
    }
  })
  return { success: true, scheduledAt }
}

exports.main = async (event = {}) => {
  const openId = cloud.getWXContext().OPENID
  try {
    if (event.action === 'generatePack') return await generatePack(event, openId)
    if (event.action === 'getPack') return await getPack(event, openId)
    if (event.action === 'completePack') return await completePack(event, openId)
    if (event.action === 'scheduleVerification') return await scheduleVerification(event, openId)
    return { success: false, error: '未知学习材料操作' }
  } catch (error) {
    return {
      success: false,
      error: cleanText(error.message || '学习材料操作失败', 160),
      code: error.code || 'LEARNING_RESOURCE_ERROR'
    }
  }
}

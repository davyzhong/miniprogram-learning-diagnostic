// 家庭干预会话写路径（learningResource 侧）。
// completePack 完成学习任务包时，自动沉淀一条 interventionSessions 记录：
// 资源使用、当场练习结果、掌握状态前后变化、24h/72h 复测安排。
// 字段对齐 data/math/intervention-sessions.example.json 与干预会话模板。
// 设计权威：docs/superpowers/specs/2026-07-17-math-node-mastery-loop-design.md（Phase C 部分）
const { isMissingCollectionError } = require('./access')

const SESSIONS_COLLECTION = 'interventionSessions'
const REVIEW_24H_MS = 24 * 60 * 60 * 1000
const REVIEW_72H_MS = 72 * 60 * 60 * 1000

function pad(value, length) {
  return String(value).padStart(length, '0')
}

function dateCompactOf(date) {
  return `${date.getFullYear()}${pad(date.getMonth() + 1, 2)}${pad(date.getDate(), 2)}`
}

function dateTextOf(date) {
  return `${date.getFullYear()}-${pad(date.getMonth() + 1, 2)}-${pad(date.getDate(), 2)}`
}

async function countSessionsOnDate(db, studentId, dateText) {
  try {
    const res = await db.collection(SESSIONS_COLLECTION)
      .where({ studentId, date: dateText })
      .limit(100)
      .get()
    return (res.data || []).length
  } catch (error) {
    if (!isMissingCollectionError(error)) throw error
    return 0
  }
}

/**
 * 为已完成的学习任务包创建干预会话记录。
 * @param {object} args
 * @param {object} args.pack 学习任务包（需含 _id/studentId/subject/bottleneckId/title/externalResources）
 * @param {object} [args.practiceResult] 当场练习结果（correctCount/totalCount 或 manual）
 * @param {object} [args.masteryResult] recordResourcePracticePassed 的返回（beforeStatus/status/nextReviewAt）
 * @param {string} [args.nodeId] 目标知识节点（mastery 已应用时必传）
 * @param {Date} [args.now]
 * @returns {{created:boolean, reason?:string, session?:object}}
 */
async function createInterventionSession({ db, pack, practiceResult, masteryResult, nodeId, now = new Date() } = {}) {
  if (!pack || pack.subject !== 'math') return { created: false, reason: 'non-math' }
  const bnId = pack.bottleneckId || pack.targetId || ''
  if (!nodeId) return { created: false, reason: 'no-node' }

  const dateText = dateTextOf(now)
  const seq = (await countSessionsOnDate(db, pack.studentId, dateText)) + 1
  const practice = practiceResult && typeof practiceResult === 'object' ? practiceResult : {}
  const resourcesUsed = (pack.externalResources || []).slice(0, 5).map(resource => ({
    resourceId: resource.resourceId || '',
    platform: resource.platform || '',
    title: resource.title || '',
  }))

  const session = {
    sessionId: `SESSION-${dateCompactOf(now)}-${pad(seq, 3)}`,
    studentId: pack.studentId,
    subject: 'math',
    date: dateText,
    nodeId,
    bottleneckIds: bnId ? [bnId] : [],
    sourcePackId: pack._id || '',
    sourceType: 'learningResourcePack',
    goal: pack.title || '',
    resourcesUsed,
    childRetell: null, // v1 尚无复述输入口，保留字段
    variantPractice: Number.isFinite(Number(practice.totalCount)) && Number(practice.totalCount) > 0
      ? { correctCount: Number(practice.correctCount) || 0, totalCount: Number(practice.totalCount) }
      : null,
    outcome: masteryResult && masteryResult.applied ? 'practicePassed' : 'packCompleted',
    masteryUpdate: masteryResult && masteryResult.applied
      ? { before: masteryResult.beforeStatus || 'unobserved', after: masteryResult.status || '' }
      : null,
    review24At: new Date(now.getTime() + REVIEW_24H_MS),
    review72At: new Date(now.getTime() + REVIEW_72H_MS),
    review24Status: 'pending',
    review72Status: 'pending',
    notes: '',
    createdAt: now,
    updatedAt: now,
  }

  try {
    await db.collection(SESSIONS_COLLECTION).add({ data: session })
  } catch (error) {
    if (!isMissingCollectionError(error)) throw error
    if (db.createCollection) await db.createCollection(SESSIONS_COLLECTION)
    await db.collection(SESSIONS_COLLECTION).add({ data: session })
  }
  return { created: true, session }
}

module.exports = { createInterventionSession }

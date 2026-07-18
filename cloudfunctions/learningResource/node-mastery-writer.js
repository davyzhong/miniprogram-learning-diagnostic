// 节点掌握状态写路径（learningResource 侧）。
// completePack 完成学习任务包时，把"资源学习 + 当场练习通过"写入 studentNodeMastery。
// 设计权威：docs/superpowers/specs/2026-07-17-math-node-mastery-loop-design.md
const { applyEvent } = require('./node-mastery')
const { isMissingCollectionError } = require('./access')
const taxonomySeed = require('./math-seeds/bottleneck-taxonomy-v2.seed.js')

const MASTERY_COLLECTION = 'studentNodeMastery'

const bnNodeIdMap = new Map(
  (taxonomySeed.bottlenecks || [])
    .filter(item => item && item.bottleneckId && item.nodeId)
    .map(item => [item.bottleneckId, item.nodeId])
)

/**
 * 当场练习是否通过：
 * - practiceResult.passed === false → 未通过（家长明确标记）
 * - 带 correctCount/totalCount 记分 → 全部答对才算通过
 * - 无记分（manual_complete）→ 家长手动确认完成视为通过
 *   （家庭场景中家长现场监督，确认完成即"当场练习通过"的弱证据；
 *     掌握状态的最终确认仍由 ≥24h 间隔复测把关）
 */
function practicePassed(practiceResult = {}) {
  if (!practiceResult || typeof practiceResult !== 'object') return true
  if (practiceResult.passed === false) return false
  const correct = Number(practiceResult.correctCount)
  const total = Number(practiceResult.totalCount)
  if (Number.isFinite(correct) && Number.isFinite(total) && total > 0) return correct >= total
  return true
}

/**
 * completePack 时记录 resourcePracticePassed 事件。
 * @returns {{applied:boolean, reason?:string, status?:string}}
 */
async function recordResourcePracticePassed({ db, pack, practiceResult, now = new Date() } = {}) {
  if (!pack || pack.subject !== 'math') return { applied: false, reason: 'non-math' }
  const bnId = pack.bottleneckId || pack.targetId || ''
  const nodeId = bnNodeIdMap.get(String(bnId))
  if (!nodeId) return { applied: false, reason: 'no-node' }
  if (!practicePassed(practiceResult)) return { applied: false, reason: 'not-passed' }

  const coll = db.collection(MASTERY_COLLECTION)
  let existing = null
  try {
    const res = await coll.where({ studentId: pack.studentId, subject: 'math', nodeId }).limit(1).get()
    existing = (res.data || [])[0] || null
  } catch (error) {
    if (!isMissingCollectionError(error)) throw error
    if (db.createCollection) await db.createCollection(MASTERY_COLLECTION)
  }

  const record = applyEvent(existing, {
    type: 'resourcePracticePassed',
    nodeId,
    at: now,
    sourceId: pack._id || '',
    summary: `学习任务包「${pack.title || bnId}」当场练习通过`,
    bottleneckIds: [bnId],
  }, { now })
  // unobserved + 练习通过 = 无变化不创建记录（状态机语义）
  if (!record) return { applied: false, reason: 'no-change', nodeId }

  const beforeStatus = existing && existing.status ? existing.status : 'unobserved'
  const data = {
    status: record.status,
    confidence: record.confidence,
    evidenceRefs: record.evidenceRefs,
    activeBottleneckIds: record.activeBottleneckIds,
    lastEvidenceAt: record.lastEvidenceAt,
    lastPracticedAt: record.lastPracticedAt,
    nextReviewAt: record.nextReviewAt,
    updatedAt: now,
  }
  if (existing) {
    await coll.doc(existing._id).update({ data })
  } else {
    await coll.add({ data: { studentId: pack.studentId, subject: 'math', nodeId, ...data, createdAt: now } })
  }
  return { applied: true, status: record.status, beforeStatus, nextReviewAt: record.nextReviewAt || null, nodeId }
}

/**
 * 家长显式"安排复测"（scheduleVerification）：把该任务包对应节点的
 * nextReviewAt 写实到 studentNodeMastery（24h 后），今日行动据此露出到期复测。
 * 仅更新已存在的掌握记录（不为无证据节点制造复测）。
 * @returns {{scheduled:boolean, reason?:string, nodeId?:string, nextReviewAt?:Date}}
 */
async function scheduleNodeReview({ db, pack, now = new Date() } = {}) {
  if (!pack || pack.subject !== 'math') return { scheduled: false, reason: 'non-math' }
  const bnId = pack.bottleneckId || pack.targetId || ''
  const nodeId = bnNodeIdMap.get(String(bnId))
  if (!nodeId) return { scheduled: false, reason: 'no-node' }

  const coll = db.collection(MASTERY_COLLECTION)
  let existing = null
  try {
    const res = await coll.where({ studentId: pack.studentId, subject: 'math', nodeId }).limit(1).get()
    existing = (res.data || [])[0] || null
  } catch (error) {
    if (!isMissingCollectionError(error)) throw error
    if (db.createCollection) await db.createCollection(MASTERY_COLLECTION)
  }
  if (!existing) return { scheduled: false, reason: 'no-record', nodeId }

  const nextReviewAt = new Date(now.getTime() + 24 * 60 * 60 * 1000)
  await coll.doc(existing._id).update({ data: { nextReviewAt, updatedAt: now } })
  return { scheduled: true, nodeId, nextReviewAt }
}

module.exports = { recordResourcePracticePassed, practicePassed, scheduleNodeReview }

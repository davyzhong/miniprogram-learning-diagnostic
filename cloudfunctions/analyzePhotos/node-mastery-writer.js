// 节点掌握状态写路径（analyzePhotos 侧）。
// 在报告完成（writeCompletedAnalysis）且画像生效后，把本次报告证据转换为
// studentNodeMastery 集合的状态事件：
// - 普通诊断报告：bottlenecks[].nodeIds + candidateBottlenecks[].nodeId → errorEvidence
// - 验证卷报告：verificationEvidence 按 targetId(BN)→nodeId 映射 → verificationPassed/Failed
// 设计权威：docs/superpowers/specs/2026-07-17-math-node-mastery-loop-design.md
const { applyEvent } = require('./node-mastery')
const taxonomySeed = require('./math-seeds/bottleneck-taxonomy-v2.seed.js')

const MASTERY_COLLECTION = 'studentNodeMastery'

// studentNodeMastery 首次使用时云端尚不存在（-502005），
// 与 learningResource 的 queryPacks 同一处理：读→自动建集合并视为空。
// analyzePhotos 包内没有 access.js，这里自带最小判定。
function isMissingCollectionError(error) {
  if (!error) return false
  if (error.errCode === -502005) return true
  const text = String(error.errMsg || error.message || '')
  return /-502005|collection.*not.*exist|集合不存在/i.test(text)
}

async function loadExistingMastery(db, studentId, subject) {
  try {
    const res = await db.collection(MASTERY_COLLECTION).where({ studentId, subject }).limit(200).get()
    return res.data || []
  } catch (error) {
    if (!isMissingCollectionError(error)) throw error
    if (db.createCollection) await db.createCollection(MASTERY_COLLECTION)
    return []
  }
}

const bnNodeIdMap = new Map(
  (taxonomySeed.bottlenecks || [])
    .filter(item => item && item.bottleneckId && item.nodeId)
    .map(item => [item.bottleneckId, item.nodeId])
)

function nodeIdForBn(bnId) {
  return bnNodeIdMap.get(String(bnId || '')) || ''
}

/**
 * 从完成态报告推导掌握状态事件（纯函数，便于测试）。
 * @returns {Array<{nodeId:string,type:string,sourceId:string,summary:string,bottleneckIds:string[]}>}
 */
function deriveMasteryEvents({ subject, mode, merged = {}, reportId = '' } = {}) {
  if (subject !== 'math') return []
  const events = []

  if (mode === 'verification') {
    for (const item of merged.verificationEvidence || []) {
      const bnId = item.targetId || item.lpCode || ''
      const nodeId = nodeIdForBn(bnId)
      if (!nodeId) continue
      const summary = `验证卷「${item.displayName || bnId}」${item.evidenceStatus === 'passed' ? '通过' : '未通过'}`
      if (item.evidenceStatus === 'passed') {
        events.push({ nodeId, type: 'verificationPassed', sourceId: reportId, summary, bottleneckIds: [bnId] })
      } else if (item.evidenceStatus === 'failed') {
        events.push({ nodeId, type: 'verificationFailed', sourceId: reportId, summary, bottleneckIds: [bnId] })
      }
      // evidenceStatus 为 insufficient/其他：证据不足，不产生事件
    }
    return events
  }

  // 普通诊断报告：同一节点的多个瓶颈只产生一条 errorEvidence（按节点去重）
  const seenNodes = new Set()
  for (const bn of merged.bottlenecks || []) {
    const candidateNodeIds = (bn.candidateBottlenecks || []).map(c => c && c.nodeId).filter(Boolean)
    const nodeIds = [...(bn.nodeIds || []), ...candidateNodeIds].filter(Boolean)
    const bnIds = [...new Set([
      ...(bn.candidateBottlenecks || []).map(c => c && c.bottleneckId).filter(Boolean),
      bn.lpCode,
    ].filter(Boolean))]
    for (const nodeId of nodeIds) {
      if (seenNodes.has(nodeId)) continue
      seenNodes.add(nodeId)
      events.push({
        nodeId,
        type: 'errorEvidence',
        sourceId: reportId,
        summary: String(bn.lpName || bn.title || '错题证据').slice(0, 120),
        bottleneckIds: bnIds,
      })
    }
  }
  return events
}

/**
 * 把事件应用到 studentNodeMastery 集合（按节点聚合并 upsert）。
 * @returns {{created:number, updated:number, skipped:number}}
 */
async function applyMasteryEventsToCollection({ db, studentId, subject, events = [], now = new Date() } = {}) {
  const result = { created: 0, updated: 0, skipped: 0 }
  if (!studentId || !subject || events.length === 0) return result

  const coll = db.collection(MASTERY_COLLECTION)
  const existingDocs = await loadExistingMastery(db, studentId, subject)
  const existingByNode = new Map(existingDocs.map(item => [item.nodeId, item]))

  const eventsByNode = new Map()
  for (const event of events) {
    if (!event || !event.nodeId) continue
    if (!eventsByNode.has(event.nodeId)) eventsByNode.set(event.nodeId, [])
    eventsByNode.get(event.nodeId).push(event)
  }

  for (const [nodeId, nodeEvents] of eventsByNode) {
    const existing = existingByNode.get(nodeId) || null
    let record = existing
    for (const event of nodeEvents) {
      record = applyEvent(record, { ...event, nodeId }, { now })
    }
    // unobserved 不落库：事件未产生有效记录（理论上调用方不会传这种事件，防御）
    if (!record) {
      result.skipped += nodeEvents.length
      continue
    }
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
      result.updated += 1
    } else {
      await coll.add({
        data: {
          studentId,
          subject,
          nodeId,
          ...data,
          createdAt: now,
        },
      })
      result.created += 1
    }
  }
  return result
}

module.exports = { deriveMasteryEvents, applyMasteryEventsToCollection, nodeIdForBn }

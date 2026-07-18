// 节点掌握状态读路径（studentData 侧）。
// getNodeMasteryMap：返回学生某学科的全部 studentNodeMastery 记录，
// 知识地图页将其与前端 150 节点镜像合并渲染六态地图（无记录节点 = unobserved）。
// 设计权威：docs/superpowers/specs/2026-07-17-math-node-mastery-loop-design.md
const { getStudentAccess, isMissingCollectionError } = require('./access')

const MASTERY_COLLECTION = 'studentNodeMastery'

function publicMasteryRecord(item = {}) {
  return {
    nodeId: item.nodeId,
    status: item.status,
    confidence: item.confidence,
    activeBottleneckIds: item.activeBottleneckIds || [],
    evidenceRefs: (item.evidenceRefs || []).slice(-5),
    lastEvidenceAt: item.lastEvidenceAt || null,
    lastPracticedAt: item.lastPracticedAt || null,
    nextReviewAt: item.nextReviewAt || null,
    updatedAt: item.updatedAt || null,
  }
}

function createNodeMasteryService({ db }) {
  async function getNodeMasteryMap(openId, studentId, subject = 'math') {
    if (!studentId) throw new Error('缺少学生 ID')
    const access = await getStudentAccess(db, studentId, openId)
    if (!access || !access.allowed) throw new Error('无权访问该学生数据')
    let records = []
    try {
      const res = await db.collection(MASTERY_COLLECTION)
        .where({ studentId, subject })
        .limit(200)
        .get()
      records = res.data || []
    } catch (error) {
      // 集合尚未创建（从未产生过掌握记录）→ 返回空地图，前端全部按 unobserved 渲染
      if (!isMissingCollectionError(error)) throw error
    }
    return {
      success: true,
      studentId,
      subject,
      records: records.map(publicMasteryRecord),
    }
  }

  return { getNodeMasteryMap }
}

module.exports = { createNodeMasteryService, publicMasteryRecord }

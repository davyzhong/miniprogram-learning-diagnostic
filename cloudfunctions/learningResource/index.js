const cloud = require('wx-server-sdk')
const { buildResourcePackDraft } = require('./resource-pack-generator')
const {
  getStudentAccess,
  getLearningResourceAccess,
  canReadLearning,
  canOperateLearning,
  isMissingCollectionError
} = require('./access')
const { recordUsageStart, recordUsageSuccess, recordUsageFailure } = require('./usage-ledger')

cloud.init({ env: cloud.SYMBOL_CURRENT_ENV })
const db = cloud.database()

const PACKS_COLLECTION = 'learningResourcePacks'

function now() {
  return new Date()
}

// 集合首次访问时 CloudBase 会抛 -502005，统一在这里容错：
// 读/查 → 视为空结果；写 → 自动建集合后重试一次。
async function queryPacks(filter = {}, options = {}) {
  try {
    let cmd = db.collection(PACKS_COLLECTION).where(filter)
    if (options.orderBy) cmd = cmd.orderBy(options.orderBy, options.orderByDir || 'desc')
    if (options.limit) cmd = cmd.limit(options.limit)
    const res = await cmd.get()
    return res.data || []
  } catch (error) {
    if (isMissingCollectionError(error) && db.createCollection) {
      await db.createCollection(PACKS_COLLECTION)
      return []
    }
    throw error
  }
}

async function getPackDoc(packId) {
  try {
    const res = await db.collection(PACKS_COLLECTION).doc(packId).get()
    return res.data || null
  } catch (error) {
    if (isMissingCollectionError(error) && db.createCollection) {
      await db.createCollection(PACKS_COLLECTION)
      return null
    }
    throw error
  }
}

async function addPack(data) {
  try {
    return await db.collection(PACKS_COLLECTION).add({ data })
  } catch (error) {
    if (isMissingCollectionError(error) && db.createCollection) {
      await db.createCollection(PACKS_COLLECTION)
      return db.collection(PACKS_COLLECTION).add({ data })
    }
    throw error
  }
}

async function updatePack(packId, data) {
  return db.collection(PACKS_COLLECTION).doc(packId).update({ data })
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
    cacheVersion: pack.cacheVersion || 1,
    llmEnhanced: pack.llmEnhanced || false,
    enhancedAt: pack.enhancedAt || null,
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
  const pack = await getPackDoc(packId)
  if (!pack) throw new Error('学习任务包不存在')
  return pack
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

  const sourceReportId = cleanText(event.sourceReportId, 80)
  if (sourceReportId) {
    const reportRes = await db.collection('reports').doc(sourceReportId).get()
    const sourceReport = reportRes.data
    if (!sourceReport) throw new Error('关联的分析报告不存在')
    if (sourceReport.studentId !== studentId) throw new Error('关联报告归属与当前学生不匹配')
  }

  // 缓存检查：同一卡点是否已有增强后的 pack（集合不存在时自动建空）
  const target = event.target || {}
  const targetId = target.bottleneckId || target.targetId || target.lpCode || target.id || ''
  if (targetId) {
    const cached = await queryPacks(
      { studentId, subject, targetId, llmEnhanced: true },
      { orderBy: 'enhancedAt', orderByDir: 'desc', limit: 1 }
    )
    if (cached.length > 0) {
      return { success: true, packId: cached[0]._id, pack: publicPack(cached[0]) }
    }
  }

  const draft = buildResourcePackDraft({
    studentId,
    subject,
    sourceReportId,
    target: event.target || {},
    resources: event.resources || []
  })

  // LLM 增强：用 taxonomy 数据 + LLM 生成更深入的讲解内容
  let enhancedDraft = draft
  try {
    enhancedDraft = await enhancePackWithLLM(draft, subject, { openId, studentId })
  } catch (err) {
    console.warn('LLM 增强失败，使用 taxonomy 数据版本:', err.message)
  }

  const createdAt = now()
  const data = {
    ...enhancedDraft,
    _openid: openId,
    createdAt,
    updatedAt: createdAt
  }
  const result = await addPack(data)
  return {
    success: true,
    packId: result._id,
    pack: publicPack({ _id: result._id, ...data })
  }
}

// LLM 增强函数
async function enhancePackWithLLM(draft, subject, ledgerContext = {}) {
  if (subject !== 'math') return draft

  const target = {
    title: draft.title,
    bottleneckId: draft.bottleneckId,
    lpCode: draft.lpCode,
  }
  const blocks = draft.blocks || []

  // 从 taxonomy seed 加载全量诊断数据，注入 prompt
  const { loadTaxonomy } = require('./resource-pack-generator')
  const taxonomy = loadTaxonomy()
  const taxonomyBn = taxonomy && target.bottleneckId ? taxonomy[target.bottleneckId] : null

  // 构建 prompt
  const conceptBlock = blocks.find(b => b.type === 'concept') || {}
  const summaryBlock = blocks.find(b => b.type === 'summary') || {}
  const practiceBlock = blocks.find(b => b.type === 'practice') || {}

  // 把 taxonomy 的真实诊断数据塞进 prompt，让 LLM 基于具体卡点生成
  const taxonomyContext = taxonomyBn ? `
【已知诊断数据】
- 症状模式：${(taxonomyBn.symptomPatterns || []).join('；')}
- 根因信号：${(taxonomyBn.rootCauseSignals || []).join('；')}
- 验证规则：${(taxonomyBn.microValidationRules || []).join('；')}
- 修复策略：${(taxonomyBn.repairStrategy || []).join('；')}
- 达标证据：${(taxonomyBn.masteryEvidence || []).join('；')}
- 真实错例：${(taxonomyBn.sourceEvidence || []).join('；')}
` : ''

  const prompt = `你是经验丰富的数学老师，为以下学习卡点生成讲解内容。

面向对象：六年级学生家长（孩子即将升初中），需要专业、清晰、有条理的辅导指引，不要低幼化。

卡点：${target.bottleneckId || target.lpCode}（${target.title}）
${taxonomyContext}
现有症状描述：${conceptBlock.body || ''}

请基于上面的诊断数据生成讲解内容，直接返回 JSON：
{
  "summary": "简述这个卡点的核心问题和它对后续学习的影响（1-2句话，专业但不啰嗦）",
  "concept": "列出2-3个典型错误场景，每个附简要的原因分析。用换行分隔。格式：错误描述 → 为什么会这样",
  "workedExample": {"question":"一道典型题目（带具体数字，优先用真实错例的数字）","steps":["解题步骤1（写出关键判断）","步骤2","步骤3"]},
  "commonMistake": {"mistake":"最常见的错误做法（具体）","correction":"对应的正确做法","explanation":"如何快速判断孩子是否在犯这个错"},
  "practice": [{"question":"第1题：基础验证（难度较低，用真实错例的变式）","answer":"答案","explanation":"解题关键"},{"question":"第2题：进阶练习","answer":"答案","explanation":"解题关键"},{"question":"第3题：迁移应用（换情境）","answer":"答案","explanation":"解题关键"}]
}

要求：
- 内容具体，写出真实数字和完整计算过程
- 语气专业清晰，像一位有经验的家教在跟家长沟通
- 不要写'注意小数点'这类空洞提醒，直接写具体操作步骤
- 难度匹配六年级水平
- 如果有诊断数据，练习题优先用真实错例的数字变式`

  const app = cloud.init()
  const model = app.ai.createModel('cloudbase')

  // AI 用量记账（pending）——写入失败不阻断业务
  let eventId = null
  if (ledgerContext.openId) {
    try {
      eventId = await recordUsageStart({
        db, openId: ledgerContext.openId,
        eventType: 'learning_resource_pack',
        studentId: ledgerContext.studentId || '',
        subject,
        sourceType: 'resource_pack',
        cloudFunction: 'learningResource',
        model: 'deepseek-v4-flash'
      })
    } catch (e) { console.error('[usage] recordUsageStart failed', e && e.message) }
  }

  let result
  try {
    result = await model.generateText({
      model: 'deepseek-v4-flash',
      messages: [{ role: 'user', content: prompt }],
      temperature: 0.4,
    })
    if (eventId) {
      await recordUsageSuccess({
        db, eventId, usage: result && result.usage, outputText: result && result.text,
        model: 'deepseek-v4-flash'
      }).catch(e => console.error('[usage] recordUsageSuccess failed', e && e.message))
    }
  } catch (err) {
    if (eventId) {
      await recordUsageFailure({ db, eventId, errorMessage: err && err.message, model: 'deepseek-v4-flash' })
        .catch(e => console.error('[usage] recordUsageFailure failed', e && e.message))
    }
    throw err
  }

  const text = result.text || ''
  const cleanText = text.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim()
  const enhanced = JSON.parse(cleanText)

  // 用增强内容替换 draft.blocks（保留 mastery_check 作为第 6 板块）
  const draftMasteryBlock = draft.blocks.find(b => b.type === 'mastery_check')
  return {
    ...draft,
    cacheVersion: 2,
    llmEnhanced: true,
    enhancedAt: new Date(),
    blocks: [
      { type: 'summary', title: '这个卡点是什么', body: enhanced.summary || summaryBlock.body || draft.title },
      { type: 'concept', title: '为什么会这样错', body: enhanced.concept || conceptBlock.body || '' },
      { type: 'worked_example', title: '正确的解题路径',
        question: enhanced.workedExample?.question || practiceBlock.questions?.[0]?.question || '',
        steps: enhanced.workedExample?.steps || [] },
      { type: 'common_mistake', title: '容易踩的坑',
        mistake: enhanced.commonMistake?.mistake || '',
        correction: enhanced.commonMistake?.correction || '',
        explanation: enhanced.commonMistake?.explanation || '' },
      { type: 'practice', title: '练三道',
        questions: (enhanced.practice || []).map((p, i) => ({
          questionId: `${target.bottleneckId || 'math'}-LLM-P${i + 1}`,
          targetId: target.bottleneckId,
          question: p.question,
          answer: p.answer,
          explanation: p.explanation,
        })) },
      draftMasteryBlock || { type: 'mastery_check', title: '怎么算学会了', body: '能独立完成 3 道变式题且关键步骤均正确。' },
    ],
    practiceItems: (enhanced.practice || []).map((p, i) => ({
      questionId: `${target.bottleneckId || 'math'}-LLM-P${i + 1}`,
      targetId: target.bottleneckId,
      question: p.question,
      answer: p.answer,
      explanation: p.explanation,
    })),
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
  await updatePack(packId, {
    status: 'completed',
    progress: {
      completedAt,
      practiceResult: event.practiceResult || {}
    },
    updatedAt: completedAt
  })
  return { success: true, completedAt }
}

async function scheduleVerification(event, openId) {
  const packId = cleanText(event.packId, 80)
  const pack = await getPackById(packId)
  await assertPackAccess(pack, openId, 'operate')
  const scheduledAt = now()
  await updatePack(packId, {
    verificationScheduled: true,
    verificationScheduledAt: scheduledAt,
    updatedAt: scheduledAt
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

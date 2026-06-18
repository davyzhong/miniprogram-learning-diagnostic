const cloud = require('wx-server-sdk')
const { buildResourcePackDraft } = require('./resource-pack-generator')
const {
  getStudentAccess,
  getLearningResourceAccess,
  canReadLearning,
  canOperateLearning
} = require('./access')

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

  const sourceReportId = cleanText(event.sourceReportId, 80)
  if (sourceReportId) {
    const reportRes = await db.collection('reports').doc(sourceReportId).get()
    const sourceReport = reportRes.data
    if (!sourceReport) throw new Error('关联的分析报告不存在')
    if (sourceReport.studentId !== studentId) throw new Error('关联报告归属与当前学生不匹配')
  }

  // 缓存检查：同一卡点是否已有增强后的 pack
  const target = event.target || {}
  const targetId = target.bottleneckId || target.lpCode || target.id || ''
  if (targetId) {
    const cacheRes = await db.collection('learningResourcePacks')
      .where({ studentId, subject, targetId, llmEnhanced: true })
      .orderBy('enhancedAt', 'desc')
      .limit(1)
      .get()
    if (cacheRes.data.length > 0) {
      const cached = cacheRes.data[0]
      return { success: true, packId: cached._id, pack: publicPack(cached) }
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
    enhancedDraft = await enhancePackWithLLM(draft, subject)
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
  const result = await db.collection('learningResourcePacks').add({ data })
  return {
    success: true,
    packId: result._id,
    pack: publicPack({ _id: result._id, ...data })
  }
}

// LLM 增强函数
async function enhancePackWithLLM(draft, subject) {
  if (subject !== 'math') return draft

  const target = {
    title: draft.title,
    bottleneckId: draft.bottleneckId,
    lpCode: draft.lpCode,
  }
  const blocks = draft.blocks || []

  // 构建 prompt
  const conceptBlock = blocks.find(b => b.type === 'concept') || {}
  const summaryBlock = blocks.find(b => b.type === 'summary') || {}
  const practiceBlock = blocks.find(b => b.type === 'practice') || {}

  const prompt = `你是数学老师，为以下学习卡点生成讲解内容（面向家长辅导六年级孩子）。

卡点：${target.bottleneckId || target.lpCode}（${target.title}）
现有症状描述：${conceptBlock.body || ''}

请生成更深入的讲解，直接返回 JSON：
{
  "summary": "一句话说明为什么这个卡点重要，以及它如何影响后续学习",
  "concept": "2-3 个典型错误场景，每个附'为什么会这样想'的解释，用换行分隔",
  "workedExample": {"question":"一道具体题目","steps":["步骤1","步骤2","步骤3"]},
  "commonMistake": {"mistake":"学生常见的错误做法","correction":"正确做法","explanation":"如何判断和纠正"},
  "practice": [{"question":"练习题1","answer":"答案","explanation":"思路"},{"question":"练习题2","answer":"答案","explanation":"思路"},{"question":"练习题3","answer":"答案","explanation":"思路"}]
}

要求：
- 内容具体，写真实数字和计算过程
- 不要写泛泛提醒（如"注意小数点"），直接写具体步骤
- 难度匹配六年级`

  const app = cloud.init()
  const model = app.ai.createModel('cloudbase')
  const result = await model.generateText({
    model: 'deepseek-v4-flash',
    messages: [{ role: 'user', content: prompt }],
    temperature: 0.4,
  })

  const text = result.text || ''
  const cleanText = text.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim()
  const enhanced = JSON.parse(cleanText)

  // 用增强内容替换 draft.blocks
  return {
    ...draft,
    cacheVersion: 1,
    llmEnhanced: true,
    enhancedAt: new Date(),
    blocks: [
      { type: 'summary', title: '今天补什么', body: enhanced.summary || summaryBlock.body || draft.title },
      { type: 'concept', title: '为什么会错', body: enhanced.concept || conceptBlock.body || '' },
      { type: 'worked_example', title: '例题拆解',
        question: enhanced.workedExample?.question || practiceBlock.questions?.[0]?.question || '',
        steps: enhanced.workedExample?.steps || [] },
      { type: 'common_mistake', title: '常见错误对比',
        mistake: enhanced.commonMistake?.mistake || '',
        correction: enhanced.commonMistake?.correction || '',
        explanation: enhanced.commonMistake?.explanation || '' },
      { type: 'practice', title: '马上练 3 题',
        questions: (enhanced.practice || []).map((p, i) => ({
          questionId: `${target.bottleneckId || 'math'}-LLM-P${i + 1}`,
          targetId: target.bottleneckId,
          question: p.question,
          answer: p.answer,
          explanation: p.explanation,
        })) },
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

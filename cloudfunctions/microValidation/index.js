// 微验证云函数：围绕单个细卡点（BN）生成 3-6 道微验证小题，
// 家长陪同孩子当场作答并判定对错，系统据此确认或推翻疑似卡点，
// 结果经 verificationPassed/Failed 事件写入 studentNodeMastery。
// 设计权威：诊断输出合同 v2 §4 + docs/superpowers/specs/2026-07-17-math-node-mastery-loop-design.md
const cloud = require('wx-server-sdk')
const tcb = require('@cloudbase/node-sdk')
const { getStudentAccess, canOperateLearning, isMissingCollectionError } = require('./access')
const { recordUsageStart, recordUsageSuccess, recordUsageFailure } = require('./usage-ledger')
const { applyMasteryEventsToCollection } = require('./node-mastery-writer')
const taxonomySeed = require('./math-seeds/bottleneck-taxonomy-v2.seed.js')

cloud.init({ env: cloud.SYMBOL_CURRENT_ENV })
const db = cloud.database()
const app = tcb.init({ env: cloud.SYMBOL_CURRENT_ENV })

const SESSIONS_COLLECTION = 'microValidations'
const DEFAULT_QUESTION_COUNT = 4
const MAX_QUESTION_COUNT = 6

const bnById = new Map((taxonomySeed.bottlenecks || []).map(item => [item.bottleneckId, item]))

function cleanText(value = '', maxLength = 200) {
  return String(value || '').trim().slice(0, maxLength)
}

function normalizeQuestionCount(value) {
  const n = Number(value)
  if (!Number.isFinite(n) || n <= 0) return DEFAULT_QUESTION_COUNT
  return Math.min(MAX_QUESTION_COUNT, Math.max(3, Math.round(n)))
}

function normalizeQuestions(items, count) {
  if (!Array.isArray(items)) return []
  return items
    .map((item, index) => {
      if (!item || typeof item !== 'object') return null
      const content = cleanText(item.content || item.prompt, 300)
      const answer = cleanText(item.answer, 120)
      if (!content || !answer) return null
      return {
        index: index + 1,
        content,
        answer,
        observation: cleanText(item.observation || item.expectedObservation, 200),
      }
    })
    .filter(Boolean)
    .slice(0, count)
    .map((item, index) => ({ ...item, index: index + 1 }))
}

async function getStudent(studentId) {
  const res = await db.collection('students').doc(studentId).get()
  return res.data || null
}

async function assertOperate(studentId, openId) {
  const access = await getStudentAccess(db, studentId, openId)
  if (!access || !access.allowed) throw new Error('无权访问该学生数据')
  if (!canOperateLearning(access)) throw new Error('无权为该学生生成微验证')
  return access
}

function buildPrompt({ bn, grade, count }) {
  const symptoms = (bn.symptomPatterns || []).slice(0, 3).join('；')
  const rules = (bn.microValidationRules || []).slice(0, 3).join('；')
  return `你是数学老师，为一个具体学习卡点生成 ${count} 道微验证小题，用来确认孩子是否真的有这个卡点（区分偶发粗心与真实卡点）。

学生：${grade || '未知'}年级
卡点：${bn.title}
典型症状：${symptoms || '（无）'}
验证要点：${rules || '（无）'}

要求：
1. 每道题都直接复现该卡点的典型错误场景（换不同数字），难度匹配年级
2. 答案必须是可判定的短结果（数值或最简分数，如 26.86 或 3/4），不要开放问答
3. observation 写判分时观察什么（如"小数点位置是否正确"）
4. 不要使用 LaTeX，分数写成"3/4"格式
5. 直接返回 JSON，不要\`\`\`json包裹

输出：{"questions":[{"content":"题目","answer":"答案","observation":"观察点"}]}

开始生成：`
}

async function generateMicroValidation(event, openId) {
  const studentId = cleanText(event.studentId, 80)
  const targetCode = cleanText(event.targetCode || event.bottleneckId, 100)
  if (!studentId) throw new Error('缺少学生 ID')
  const bn = bnById.get(targetCode)
  if (!bn) throw new Error('未找到对应的细卡点')
  if (!bn.nodeId) throw new Error('该细卡点未绑定知识节点')
  await assertOperate(studentId, openId)
  const student = (await getStudent(studentId)) || {}
  const count = normalizeQuestionCount(event.questionCount)

  const ai = app.ai()
  const model = ai.createModel('cloudbase')
  let eventId = null
  try {
    if (openId) {
      eventId = await recordUsageStart({
        db, openId, eventType: 'micro_validation_generation',
        studentId, subject: 'math', sourceType: 'microValidation',
        cloudFunction: 'microValidation', model: 'deepseek-v4-flash',
      })
    }
  } catch (e) { console.error('[usage] recordUsageStart failed', e && e.message) }

  let questions
  try {
    const result = await model.generateText({
      model: 'deepseek-v4-flash',
      messages: [{ role: 'user', content: buildPrompt({ bn, grade: student.grade, count }) }],
      temperature: 0.3,
    })
    if (eventId) {
      await recordUsageSuccess({ db, eventId, usage: result && result.usage, outputText: result && result.text, model: 'deepseek-v4-flash' })
        .catch(e => console.error('[usage] recordUsageSuccess failed', e && e.message))
    }
    const cleaned = String(result.text || '').replace(/^```json\s*/i, '').replace(/\s*```$/, '').trim()
    questions = normalizeQuestions(JSON.parse(cleaned).questions, count)
  } catch (error) {
    if (eventId) {
      await recordUsageFailure({ db, eventId, errorMessage: error && error.message, model: 'deepseek-v4-flash' })
        .catch(e => console.error('[usage] recordUsageFailure failed', e && e.message))
    }
    throw error
  }
  if (questions.length < 3) throw new Error('微验证题目生成不足，请重试')

  const now = new Date()
  const doc = {
    studentId,
    subject: 'math',
    bottleneckId: bn.bottleneckId,
    nodeId: bn.nodeId,
    bnTitle: bn.title,
    questions,
    status: 'in_progress',
    verdicts: [],
    passVerdict: '',
    createdAt: now,
    updatedAt: now,
    _openid: openId,
  }
  let sessionId
  try {
    const added = await db.collection(SESSIONS_COLLECTION).add({ data: doc })
    sessionId = added.id || added._id
  } catch (error) {
    if (!isMissingCollectionError(error)) throw error
    if (db.createCollection) await db.createCollection(SESSIONS_COLLECTION)
    const added = await db.collection(SESSIONS_COLLECTION).add({ data: doc })
    sessionId = added.id || added._id
  }
  return { success: true, sessionId, bottleneckId: bn.bottleneckId, nodeId: bn.nodeId, bnTitle: bn.title, questions }
}

async function getSession(sessionId) {
  const res = await db.collection(SESSIONS_COLLECTION).doc(sessionId).get()
  return res.data || null
}

// 通过规则：答对数 ≥ 总题数的 2/3（向上取整），3 题对 2、4 题对 3、6 题对 4
function passRule(verdicts, total) {
  if (!total) return { correctCount: 0, passed: false }
  const correctCount = verdicts.filter(v => v === 'correct').length
  return { correctCount, passed: correctCount >= Math.ceil((total * 2) / 3) }
}

async function submitMicroValidation(event, openId) {
  const sessionId = cleanText(event.sessionId, 80)
  if (!sessionId) throw new Error('缺少微验证 ID')
  const session = await getSession(sessionId)
  if (!session) throw new Error('微验证不存在')
  await assertOperate(session.studentId, openId)
  if (session.status === 'completed') {
    return { success: true, alreadyCompleted: true, passVerdict: session.passVerdict, correctCount: session.correctCount, totalCount: session.questions.length }
  }

  const total = session.questions.length
  const verdicts = (Array.isArray(event.verdicts) ? event.verdicts : [])
    .slice(0, total)
    .map(v => (v === 'correct' ? 'correct' : 'incorrect'))
  while (verdicts.length < total) verdicts.push('incorrect')
  const { correctCount, passed } = passRule(verdicts, total)

  const now = new Date()
  // 并发/重试保护：先在事务里把 in_progress 占位为 completing，
  // 只有占位成功的提交才会继续写 mastery 事件，避免双击/重试导致掌握状态双倍计数
  let claimed = false
  await db.runTransaction(async ({ collection }) => {
    const snapshot = await collection(SESSIONS_COLLECTION).doc(sessionId).get()
    const current = snapshot.data
    if (!current || current.status !== 'in_progress') return
    await collection(SESSIONS_COLLECTION).doc(sessionId).update({
      data: { status: 'completing', updatedAt: now },
    })
    claimed = true
  })
  if (!claimed) {
    const latest = await getSession(sessionId)
    if (latest && latest.status === 'completed') {
      return { success: true, alreadyCompleted: true, passVerdict: latest.passVerdict, correctCount: latest.correctCount, totalCount: latest.questions.length }
    }
    throw new Error('这份微验证正在提交中，请稍候')
  }

  // 掌握状态事件：验证通过/失败 → studentNodeMastery（疑似卡点被确认或推翻）
  let masteryResult = null
  try {
    masteryResult = await applyMasteryEventsToCollection({
      db, studentId: session.studentId, subject: 'math', now,
      events: [{
        nodeId: session.nodeId,
        type: passed ? 'verificationPassed' : 'verificationFailed',
        sourceId: sessionId,
        summary: `微验证「${session.bnTitle}」${correctCount}/${total} 题正确，${passed ? '通过' : '未通过'}`,
        bottleneckIds: [session.bottleneckId],
      }],
    })
  } catch (error) {
    console.error('微验证掌握状态写入失败（不影响判定结果）', error)
  }

  await db.collection(SESSIONS_COLLECTION).doc(sessionId).update({
    data: {
      status: 'completed',
      verdicts,
      correctCount,
      passVerdict: passed ? 'passed' : 'failed',
      masteryResult: masteryResult || null,
      completedAt: now,
      updatedAt: now,
    },
  })
  return {
    success: true,
    passVerdict: passed ? 'passed' : 'failed',
    correctCount,
    totalCount: total,
    nodeId: session.nodeId,
    bottleneckId: session.bottleneckId,
  }
}

async function getMicroValidation(event, openId) {
  const sessionId = cleanText(event.sessionId, 80)
  if (!sessionId) throw new Error('缺少微验证 ID')
  const session = await getSession(sessionId)
  if (!session) throw new Error('微验证不存在')
  const access = await getStudentAccess(db, session.studentId, openId)
  if (!access || !access.allowed) throw new Error('无权访问该微验证')
  return { success: true, session }
}

exports.main = async (event = {}) => {
  const openId = cloud.getWXContext().OPENID
  try {
    if (event.action === 'generateMicroValidation') return await generateMicroValidation(event, openId)
    if (event.action === 'submitMicroValidation') return await submitMicroValidation(event, openId)
    if (event.action === 'getMicroValidation') return await getMicroValidation(event, openId)
    return { success: false, error: '未知微验证操作' }
  } catch (error) {
    console.error('[microValidation] failed:', error && error.message ? error.message : error)
    return { success: false, error: cleanText(error.message || '微验证操作失败', 160) }
  }
}

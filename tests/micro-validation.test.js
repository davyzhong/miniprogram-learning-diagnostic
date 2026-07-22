// tests/micro-validation.test.js
// microValidation 云函数：generate/submit 全链路（mock db + mock AI）+ 页面视图模型。
const test = require('node:test')
const assert = require('node:assert/strict')

const { createCloudMock, createDatabase, loadModule } = require('./helpers/cloud-function-harness')
const { buildMicroValidationView, buildMicroValidationResultView } = require('../miniprogram/pages/micro-validation/micro-validation-presenter')

const STUDENT = { _id: 'stu-1', _openid: 'owner-1', name: '测试', grade: 6 }

function aiMock(questions) {
  return {
    init: () => ({
      ai: () => ({
        createModel: () => ({
          generateText: async () => ({ text: JSON.stringify({ questions }) }),
        }),
      }),
    }),
  }
}

const AI_QUESTIONS = [
  { content: '8.5×3.16 = ?', answer: '26.86', observation: '小数点位置是否正确' },
  { content: '0.85×3.16 = ?', answer: '2.686', observation: '位数累计是否正确' },
  { content: '8.5×0.316 = ?', answer: '2.686', observation: '迁移场景是否稳定' },
  { content: '先估算再计算 1.25×0.8', answer: '1', observation: '是否有数量级估算' },
]

function loadMicroValidation(db, openId = 'owner-1') {
  const cloud = createCloudMock({ db, openId })
  return loadModule('cloudfunctions/microValidation/index.js', {
    'wx-server-sdk': cloud,
    '@cloudbase/node-sdk': aiMock(AI_QUESTIONS),
  })
}

test('generateMicroValidation：生成 4 题并落库，返回题目不含内部字段', async () => {
  const db = createDatabase({ students: [STUDENT] })
  const handler = loadMicroValidation(db)
  const result = await handler.main({ action: 'generateMicroValidation', studentId: 'stu-1', targetCode: 'BN-DEC-MUL-POINT-COUNT' })
  assert.equal(result.success, true)
  assert.ok(result.sessionId)
  assert.equal(result.questions.length, 4)
  assert.equal(result.questions[0].answer, '26.86')
  assert.equal(result.bnTitle, '小数乘法中积的小数位数判断错误')
  assert.equal(result.nodeId, 'MATH-NUM-DEC-MUL-POINT')
  const sessions = db.collection('microValidations').where({ studentId: 'stu-1' }).limit(10).get()
  assert.equal((await sessions).data.length, 1)
})

test('generateMicroValidation：未知卡点/无权用户被拒绝', async () => {
  const db = createDatabase({ students: [STUDENT] })
  const handler = loadMicroValidation(db)
  const bad = await handler.main({ action: 'generateMicroValidation', studentId: 'stu-1', targetCode: 'BN-UNKNOWN' })
  assert.equal(bad.success, false)
  const stranger = loadMicroValidation(db, 'stranger')
  const denied = await stranger.main({ action: 'generateMicroValidation', studentId: 'stu-1', targetCode: 'BN-DEC-MUL-POINT-COUNT' })
  assert.equal(denied.success, false)
})

test('submitMicroValidation：通过（≥2/3）写 verificationPassed 并更新 mastery', async () => {
  const db = createDatabase({
    students: [STUDENT],
    microValidations: [{
      _id: 'mv-1', studentId: 'stu-1', subject: 'math',
      bottleneckId: 'BN-DEC-MUL-POINT-COUNT', nodeId: 'MATH-NUM-DEC-MUL-POINT',
      bnTitle: '小数乘法中积的小数位数判断错误',
      questions: AI_QUESTIONS, status: 'in_progress', verdicts: [], passVerdict: '',
    }],
    studentNodeMastery: [{
      _id: 'm1', studentId: 'stu-1', subject: 'math', nodeId: 'MATH-NUM-DEC-MUL-POINT',
      status: 'suspected_gap', confidence: 0.5, evidenceRefs: [], activeBottleneckIds: [],
    }],
  })
  const handler = loadMicroValidation(db)
  const result = await handler.main({
    action: 'submitMicroValidation', sessionId: 'mv-1',
    verdicts: ['correct', 'correct', 'correct', 'incorrect'],
  })
  assert.equal(result.success, true)
  assert.equal(result.passVerdict, 'passed')
  assert.equal(result.correctCount, 3)
  const mastery = (await db.collection('studentNodeMastery').where({ nodeId: 'MATH-NUM-DEC-MUL-POINT' }).limit(1).get()).data[0]
  assert.equal(mastery.status, 'unobserved', '疑似漏洞被验证推翻')
  const session = (await db.collection('microValidations').where({}).limit(1).get()).data[0]
  assert.equal(session.status, 'completed')
  // 重复提交幂等
  const again = await handler.main({ action: 'submitMicroValidation', sessionId: 'mv-1', verdicts: [] })
  assert.equal(again.alreadyCompleted, true)
})

test('submitMicroValidation：未通过写 verificationFailed（suspected_gap→relearning）', async () => {
  const db = createDatabase({
    students: [STUDENT],
    microValidations: [{
      _id: 'mv-2', studentId: 'stu-1', subject: 'math',
      bottleneckId: 'BN-DEC-MUL-POINT-COUNT', nodeId: 'MATH-NUM-DEC-MUL-POINT',
      bnTitle: '小数乘法中积的小数位数判断错误',
      questions: AI_QUESTIONS, status: 'in_progress', verdicts: [], passVerdict: '',
    }],
    studentNodeMastery: [{
      _id: 'm1', studentId: 'stu-1', subject: 'math', nodeId: 'MATH-NUM-DEC-MUL-POINT',
      status: 'suspected_gap', confidence: 0.5, evidenceRefs: [], activeBottleneckIds: [],
    }],
  })
  const handler = loadMicroValidation(db)
  const result = await handler.main({
    action: 'submitMicroValidation', sessionId: 'mv-2',
    verdicts: ['correct', 'incorrect', 'incorrect', 'incorrect'],
  })
  assert.equal(result.passVerdict, 'failed')
  const mastery = (await db.collection('studentNodeMastery').where({ nodeId: 'MATH-NUM-DEC-MUL-POINT' }).limit(1).get()).data[0]
  assert.equal(mastery.status, 'relearning', '验证失败确认卡点，进入重学')
})

// ── 页面视图模型 ──

test('页面视图：判定进度、全部判定才可提交、判定后显示答案', () => {
  const view = buildMicroValidationView({ bnTitle: '测试卡点', questions: AI_QUESTIONS })
  assert.equal(view.totalCount, 4)
  assert.equal(view.canSubmit, false)
  assert.equal(view.questions[0].showAnswer, false)
  const full = buildMicroValidationView({
    bnTitle: '测试卡点', questions: AI_QUESTIONS,
    verdicts: ['correct', 'incorrect', 'correct', 'correct'],
  })
  assert.equal(full.canSubmit, true)
  assert.equal(full.answeredCount, 4)
  assert.equal(full.questions[1].showAnswer, true)
  assert.equal(full.questions[1].verdictText, '答错了')
})

test('结果视图：通过与未通过的文案与动作', () => {
  const passed = buildMicroValidationResultView({ passVerdict: 'passed', correctCount: 3, totalCount: 4, bnTitle: 'X' })
  assert.equal(passed.actionText, '返回知识地图')
  const failed = buildMicroValidationResultView({ passVerdict: 'failed', correctCount: 1, totalCount: 4, bnTitle: 'X' })
  assert.equal(failed.actionText, '去重学')
})

test('submitMicroValidation：并发占位保护，completing 状态拒绝重复提交', async () => {
  const db = createDatabase({
    students: [STUDENT],
    microValidations: [{
      _id: 'mv-race', studentId: 'stu-1', subject: 'math',
      bottleneckId: 'BN-DEC-MUL-POINT-COUNT', nodeId: 'MATH-NUM-DEC-MUL-POINT',
      bnTitle: '小数乘法中积的小数位数判断错误',
      questions: AI_QUESTIONS, status: 'completing', verdicts: [], passVerdict: '',
    }],
  })
  const handler = loadMicroValidation(db)
  const result = await handler.main({
    action: 'submitMicroValidation', sessionId: 'mv-race',
    verdicts: ['correct', 'correct', 'correct', 'correct'],
  })
  assert.equal(result.success, false)
  assert.match(result.error, /正在提交中/)
  const masteryDocs = (await db.collection('studentNodeMastery').where({}).limit(10).get()).data
  assert.equal(masteryDocs.length, 0, '占位失败的提交不得写入 mastery 事件')
})

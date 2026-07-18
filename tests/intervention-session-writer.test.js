// tests/intervention-session-writer.test.js
// Phase C：completePack 沉淀干预会话 + scheduleVerification 写实调度 + 首页到期复测行动卡。
const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')

const { createInterventionSession } = require('../cloudfunctions/learningResource/intervention-session-writer')
const { scheduleNodeReview } = require('../cloudfunctions/learningResource/node-mastery-writer')
const { buildLearningProfileHomeView } = require('../miniprogram/pages/index/index-presenter')

const T0 = new Date('2026-07-17T10:00:00+08:00')

function fakeDb({ sessions = [], mastery = [], sessionsMissing = false } = {}) {
  const sessionDocs = new Map(sessions.map(d => [d._id, { ...d }]))
  const masteryDocs = new Map(mastery.map(d => [d._id, { ...d }]))
  let seq = 0
  let addFailed = false
  const state = { createCollectionCalls: [] }
  const filterBy = (docs, filter) => [...docs.values()].filter(d =>
    Object.entries(filter).every(([k, v]) => d[k] === v))
  const db = {
    createCollection: async (name) => { state.createCollectionCalls.push(name) },
    collection: (name) => {
      const docs = name === 'interventionSessions' ? sessionDocs : masteryDocs
      return {
        where: (filter) => ({
          limit: () => ({
            get: async () => ({ data: filterBy(docs, filter) }),
          }),
        }),
        doc: (id) => ({
          update: async ({ data }) => { docs.set(id, { ...docs.get(id), ...data }) },
        }),
        add: async ({ data }) => {
          if (name === 'interventionSessions' && sessionsMissing && !addFailed) {
            addFailed = true
            const error = new Error('collection not exists')
            error.errCode = -502005
            throw error
          }
          seq += 1
          docs.set(`new-${seq}`, { _id: `new-${seq}`, ...data })
        },
      }
    },
  }
  return { db, sessionDocs, masteryDocs, state }
}

const MATH_PACK = {
  _id: 'pack-1', studentId: 'stu-1', subject: 'math',
  bottleneckId: 'BN-DEC-MUL-POINT-COUNT', title: '小数点定位任务包',
  externalResources: [
    { resourceId: 'RES-BILI-DEC-MUL-001', platform: 'B站', title: '小数乘法精讲' },
    { resourceId: 'RES-KHAN-DEC-MUL-001', platform: 'Khan Academy', title: 'Decimal place value' },
  ],
}

// ── createInterventionSession ──

test('创建干预会话：字段齐全，sessionId 按日期编序', async () => {
  const { db, sessionDocs } = fakeDb({
    sessions: [{ _id: 's0', studentId: 'stu-1', date: '2026-07-17', sessionId: 'SESSION-20260717-001' }],
  })
  const result = await createInterventionSession({
    db, pack: MATH_PACK, nodeId: 'MATH-NUM-DEC-MUL-POINT',
    practiceResult: { correctCount: 3, totalCount: 3 },
    masteryResult: { applied: true, beforeStatus: 'relearning', status: 'partial_mastery' },
    now: T0,
  })
  assert.equal(result.created, true)
  const session = result.session
  assert.equal(session.sessionId, 'SESSION-20260717-002', '同日已有 1 条，序号应递增')
  assert.equal(session.nodeId, 'MATH-NUM-DEC-MUL-POINT')
  assert.deepEqual(session.bottleneckIds, ['BN-DEC-MUL-POINT-COUNT'])
  assert.equal(session.resourcesUsed.length, 2)
  assert.equal(session.resourcesUsed[0].resourceId, 'RES-BILI-DEC-MUL-001')
  assert.deepEqual(session.variantPractice, { correctCount: 3, totalCount: 3 })
  assert.deepEqual(session.masteryUpdate, { before: 'relearning', after: 'partial_mastery' })
  assert.equal(session.review24At.getTime() - T0.getTime(), 24 * 3600 * 1000)
  assert.equal(session.review72At.getTime() - T0.getTime(), 72 * 3600 * 1000)
  assert.equal(session.review24Status, 'pending')
  assert.equal(sessionDocs.size, 2, '会话已写入集合')
})

test('创建干预会话：非数学/缺节点跳过；集合缺失自动建集重试', async () => {
  const { db } = fakeDb()
  assert.deepEqual(await createInterventionSession({ db, pack: { ...MATH_PACK, subject: 'chinese' }, nodeId: 'N', now: T0 }),
    { created: false, reason: 'non-math' })
  assert.deepEqual(await createInterventionSession({ db, pack: MATH_PACK, nodeId: '', now: T0 }),
    { created: false, reason: 'no-node' })

  const missing = fakeDb({ sessionsMissing: true })
  const result = await createInterventionSession({
    db: missing.db, pack: MATH_PACK, nodeId: 'MATH-NUM-DEC-MUL-POINT', now: T0,
  })
  assert.equal(result.created, true)
  assert.ok(missing.state.createCollectionCalls.includes('interventionSessions'))
})

test('mastery 未应用时也沉淀会话（outcome=packCompleted）', async () => {
  const { db } = fakeDb()
  const result = await createInterventionSession({
    db, pack: MATH_PACK, nodeId: 'MATH-NUM-DEC-MUL-POINT',
    masteryResult: { applied: false, reason: 'no-change' }, now: T0,
  })
  assert.equal(result.session.outcome, 'packCompleted')
  assert.equal(result.session.masteryUpdate, null)
})

// ── scheduleNodeReview ──

test('scheduleNodeReview：有记录时把 nextReviewAt 写实到 24h 后', async () => {
  const { db, masteryDocs } = fakeDb({
    mastery: [{
      _id: 'm1', studentId: 'stu-1', subject: 'math', nodeId: 'MATH-NUM-DEC-MUL-POINT',
      status: 'partial_mastery', nextReviewAt: null,
    }],
  })
  const result = await scheduleNodeReview({ db, pack: MATH_PACK, now: T0 })
  assert.equal(result.scheduled, true)
  assert.equal(result.nodeId, 'MATH-NUM-DEC-MUL-POINT')
  assert.equal(masteryDocs.get('m1').nextReviewAt.getTime() - T0.getTime(), 24 * 3600 * 1000)
})

test('scheduleNodeReview：无记录/非数学/未知卡点安全跳过', async () => {
  const { db } = fakeDb()
  assert.deepEqual(await scheduleNodeReview({ db, pack: MATH_PACK, now: T0 }),
    { scheduled: false, reason: 'no-record', nodeId: 'MATH-NUM-DEC-MUL-POINT' })
  assert.deepEqual(await scheduleNodeReview({ db, pack: { ...MATH_PACK, subject: 'chinese' }, now: T0 }),
    { scheduled: false, reason: 'non-math' })
})

// ── 首页到期复测行动卡 ──

const PAST = new Date(Date.now() - 3600 * 1000).toISOString()

test('首页行动队列：有到期复测时置顶 dueReview 卡并直跳验证卷配置器', () => {
  const view = buildLearningProfileHomeView({
    student: { _id: 'stu-1', name: '测试' },
    profiles: [],
    dueReviews: [{
      nodeId: 'MATH-NUM-DEC-MUL-POINT', status: 'partial_mastery',
      nextReviewAt: PAST, activeBottleneckIds: ['BN-DEC-MUL-POINT-COUNT'],
    }],
  })
  const first = view.personalActionQueue[0]
  assert.equal(first.key, 'dueReview')
  assert.match(first.title, /1 个知识点到期复测/)
  assert.match(first.summary, /小数乘法中的小数点定位/)
  assert.match(first.url, /generate-verification/)
  assert.match(first.url, /targetCode=BN-DEC-MUL-POINT-COUNT/)
})

test('首页行动队列：无到期复测/无关联卡点时不出现 dueReview 卡或回退知识地图', () => {
  const empty = buildLearningProfileHomeView({ student: { _id: 'stu-1', name: '测试' }, profiles: [], dueReviews: [] })
  assert.ok(!empty.personalActionQueue.some(item => item.key === 'dueReview'))

  const noBn = buildLearningProfileHomeView({
    student: { _id: 'stu-1', name: '测试' },
    profiles: [],
    dueReviews: [{ nodeId: 'MATH-NUM-DEC-MUL-POINT', status: 'partial_mastery', nextReviewAt: PAST, activeBottleneckIds: [] }],
  })
  const item = noBn.personalActionQueue.find(i => i.key === 'dueReview')
  assert.ok(item)
  assert.match(item.url, /knowledge-map/)
})

// ── 接线静态断言 ──

test('completePack 已接入干预会话生成；scheduleVerification 已接入写实调度', () => {
  const source = fs.readFileSync(path.resolve(__dirname, '../cloudfunctions/learningResource/index.js'), 'utf8')
  assert.match(source, /createInterventionSession/)
  assert.match(source, /scheduleNodeReview/)
})

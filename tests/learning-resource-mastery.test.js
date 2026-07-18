// tests/learning-resource-mastery.test.js
// learningResource completePack → studentNodeMastery 写路径。
const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')

const {
  recordResourcePracticePassed,
  practicePassed,
} = require('../cloudfunctions/learningResource/node-mastery-writer')

const T0 = new Date('2026-07-17T10:00:00+08:00')

test('practicePassed 判定规则', () => {
  assert.equal(practicePassed(undefined), true)
  assert.equal(practicePassed({ source: 'manual_complete' }), true)
  assert.equal(practicePassed({ passed: false }), false)
  assert.equal(practicePassed({ correctCount: 2, totalCount: 3 }), false)
  assert.equal(practicePassed({ correctCount: 3, totalCount: 3 }), true)
})

function fakeDb({ initial = [], missingOnce = false } = {}) {
  const docs = new Map(initial.map(d => [d._id, { ...d }]))
  let seq = 0
  let getCalls = 0
  const state = { createCollectionCalls: 0 }
  const db = {
    state,
    createCollection: async () => { state.createCollectionCalls += 1 },
    collection: () => ({
      where: (filter) => ({
        limit: () => ({
          get: async () => {
            getCalls += 1
            if (missingOnce && getCalls === 1) {
              const error = new Error('collection not exists')
              error.errCode = -502005
              throw error
            }
            return {
              data: [...docs.values()].filter(d =>
                Object.entries(filter).every(([k, v]) => d[k] === v)),
            }
          },
        }),
      }),
      doc: (id) => ({
        update: async ({ data }) => { docs.set(id, { ...docs.get(id), ...data }) },
      }),
      add: async ({ data }) => {
        seq += 1
        docs.set(`new-${seq}`, { _id: `new-${seq}`, ...data })
      },
    }),
  }
  return { db, docs, state }
}

const RELEARNING_RECORD = {
  _id: 'm1', studentId: 'stu-1', subject: 'math', nodeId: 'MATH-NUM-DEC-MUL-POINT',
  status: 'relearning', confidence: 0.6, evidenceRefs: [], activeBottleneckIds: ['BN-DEC-MUL-POINT-COUNT'],
  lastEvidenceAt: T0, lastPracticedAt: null, nextReviewAt: null,
}

const MATH_PACK = {
  _id: 'pack-1', studentId: 'stu-1', subject: 'math',
  bottleneckId: 'BN-DEC-MUL-POINT-COUNT', title: '小数点定位任务包',
}

test('completePack：relearning 记录 + 练习通过 → partial_mastery 并安排复测', async () => {
  const { db, docs } = fakeDb({ initial: [RELEARNING_RECORD] })
  const result = await recordResourcePracticePassed({
    db, pack: MATH_PACK, practiceResult: { source: 'manual_complete' }, now: T0,
  })
  assert.equal(result.applied, true)
  assert.equal(result.status, 'partial_mastery')
  const updated = docs.get('m1')
  assert.equal(updated.status, 'partial_mastery')
  assert.ok(updated.nextReviewAt, '进入 partial_mastery 应安排 24h 后复测')
  assert.ok(updated.evidenceRefs.some(e => e.type === 'resourcePracticePassed'))
})

test('completePack：非数学/未知卡点/未通过/无记录 均安全跳过', async () => {
  const { db, docs } = fakeDb({ initial: [RELEARNING_RECORD] })
  assert.deepEqual(await recordResourcePracticePassed({ db, pack: { ...MATH_PACK, subject: 'chinese' }, now: T0 }),
    { applied: false, reason: 'non-math' })
  assert.deepEqual(await recordResourcePracticePassed({ db, pack: { ...MATH_PACK, bottleneckId: 'BN-UNKNOWN' }, now: T0 }),
    { applied: false, reason: 'no-node' })
  assert.deepEqual(await recordResourcePracticePassed({ db, pack: MATH_PACK, practiceResult: { passed: false }, now: T0 }),
    { applied: false, reason: 'not-passed' })
  // 无既有记录 + 练习通过：unobserved 不落库
  const empty = fakeDb()
  const noChange = await recordResourcePracticePassed({ db: empty.db, pack: MATH_PACK, now: T0 })
  assert.deepEqual(noChange, { applied: false, reason: 'no-change', nodeId: 'MATH-NUM-DEC-MUL-POINT' })
  assert.equal(empty.docs.size, 0)
  // 前面的跳过用例都没有改动既有记录
  assert.equal(docs.get('m1').status, 'relearning')
})

test('completePack：studentNodeMastery 集合缺失时自动建集合并继续', async () => {
  // 不预置记录：集合"不存在"时第一次查询抛 -502005 → 视作无记录 → 练习通过在 unobserved 上不创建
  const { db, docs, state } = fakeDb({ missingOnce: true })
  const result = await recordResourcePracticePassed({ db, pack: MATH_PACK, now: T0 })
  assert.equal(state.createCollectionCalls, 1)
  assert.deepEqual(result, { applied: false, reason: 'no-change', nodeId: 'MATH-NUM-DEC-MUL-POINT' })
  assert.equal(docs.size, 0)
})

test('learningResource/index.js 已在 completePack 接入掌握状态写路径', () => {
  const source = fs.readFileSync(path.resolve(__dirname, '../cloudfunctions/learningResource/index.js'), 'utf8')
  assert.match(source, /recordResourcePracticePassed/)
})

test('node-mastery.js 三个云函数拷贝内容一致', () => {
  const root = path.resolve(__dirname, '..')
  const a = fs.readFileSync(path.join(root, 'cloudfunctions/studentData/node-mastery.js'), 'utf8')
  const b = fs.readFileSync(path.join(root, 'cloudfunctions/analyzePhotos/node-mastery.js'), 'utf8')
  const c = fs.readFileSync(path.join(root, 'cloudfunctions/learningResource/node-mastery.js'), 'utf8')
  assert.equal(a, b)
  assert.equal(a, c)
})

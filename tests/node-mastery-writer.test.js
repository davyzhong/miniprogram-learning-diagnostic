// tests/node-mastery-writer.test.js
// analyzePhotos 侧掌握状态写路径：事件推导（普通/验证卷）+ 集合 upsert + 状态机双拷贝一致性。
const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')

const {
  deriveMasteryEvents,
  applyMasteryEventsToCollection,
  nodeIdForBn,
} = require('../cloudfunctions/analyzePhotos/node-mastery-writer')

const T0 = new Date('2026-07-17T10:00:00+08:00')

// ── deriveMasteryEvents：普通诊断报告 ──

test('普通报告：bottlenecks.nodeIds 与 candidateBottlenecks.nodeId 合并去重为 errorEvidence', () => {
  const events = deriveMasteryEvents({
    subject: 'math',
    mode: 'diagnosis',
    reportId: 'report-1',
    merged: {
      bottlenecks: [
        {
          lpCode: 'LP-002', lpName: '小数乘法小数点定位',
          nodeIds: ['MATH-NUM-DEC-MUL-POINT'],
          candidateBottlenecks: [
            { bottleneckId: 'BN-DEC-MUL-POINT-COUNT', nodeId: 'MATH-NUM-DEC-MUL-POINT' },
          ],
        },
        {
          lpCode: 'LP-003', lpName: '百分数单位1',
          nodeIds: ['MATH-MOD-PERCENT-BASE', 'MATH-NUM-DEC-MUL-POINT'],
          candidateBottlenecks: [],
        },
      ],
    },
  })
  // MATH-NUM-DEC-MUL-POINT 在两个瓶颈中出现，只产生一条事件
  const nodeIds = events.map(e => e.nodeId)
  assert.deepEqual(nodeIds.sort(), ['MATH-MOD-PERCENT-BASE', 'MATH-NUM-DEC-MUL-POINT'])
  assert.ok(events.every(e => e.type === 'errorEvidence' && e.sourceId === 'report-1'))
  const decEvent = events.find(e => e.nodeId === 'MATH-NUM-DEC-MUL-POINT')
  assert.ok(decEvent.bottleneckIds.includes('BN-DEC-MUL-POINT-COUNT'))
})

test('普通报告：无 nodeIds 的瓶颈不产生事件；非数学直接返回空', () => {
  const noNode = deriveMasteryEvents({
    subject: 'math', mode: 'diagnosis', reportId: 'r',
    merged: { bottlenecks: [{ lpCode: 'LP-001', lpName: '计算' }] },
  })
  assert.deepEqual(noNode, [])
  const chinese = deriveMasteryEvents({
    subject: 'chinese', mode: 'diagnosis', reportId: 'r',
    merged: { bottlenecks: [{ lpCode: 'LP-101', nodeIds: ['MATH-NUM-DEC-MUL-POINT'] }] },
  })
  assert.deepEqual(chinese, [])
})

// ── deriveMasteryEvents：验证卷报告 ──

test('验证卷报告：按 BN→node 映射生成 passed/failed 事件，证据不足跳过', () => {
  const events = deriveMasteryEvents({
    subject: 'math',
    mode: 'verification',
    reportId: 'report-2',
    merged: {
      verificationEvidence: [
        { targetId: 'BN-DEC-MUL-POINT-COUNT', displayName: '小数点定位', evidenceStatus: 'passed' },
        { targetId: 'BN-FRACTION-DIV-RECIPROCAL-MISSING', displayName: '分数除法', evidenceStatus: 'failed' },
        { targetId: 'BN-PERCENT-BASE-WHOLE-MISSING', displayName: '单位1', evidenceStatus: 'insufficient' },
        { targetId: 'BN-NOT-EXIST', displayName: '未知', evidenceStatus: 'passed' },
      ],
    },
  })
  assert.equal(events.length, 2)
  const passed = events.find(e => e.type === 'verificationPassed')
  const failed = events.find(e => e.type === 'verificationFailed')
  assert.equal(passed.nodeId, nodeIdForBn('BN-DEC-MUL-POINT-COUNT'))
  assert.equal(failed.nodeId, nodeIdForBn('BN-FRACTION-DIV-RECIPROCAL-MISSING'))
  assert.ok(passed.nodeId && failed.nodeId)
})

// ── applyMasteryEventsToCollection：mock db upsert ──

function fakeDb(initial = []) {
  const docs = new Map(initial.map(d => [d._id, { ...d }]))
  let seq = 0
  const matches = (doc, filter) => Object.entries(filter).every(([k, v]) => doc[k] === v)
  return {
    docs,
    collection: () => ({
      where: (filter) => ({
        limit: () => ({ get: async () => ({ data: [...docs.values()].filter(d => matches(d, filter)) }) }),
      }),
      doc: (id) => ({
        update: async ({ data }) => { docs.set(id, { ...docs.get(id), ...data }) },
      }),
      add: async ({ data }) => {
        seq += 1
        const _id = `new-${seq}`
        docs.set(_id, { _id, ...data })
      },
    }),
  }
}

test('集合写入：新节点创建 suspected_gap 记录，已有节点追加证据并转移', async () => {
  const db = fakeDb([{
    _id: 'm1', studentId: 'stu-1', subject: 'math', nodeId: 'MATH-NUM-DEC-MUL-POINT',
    status: 'suspected_gap', confidence: 0.5, evidenceRefs: [], activeBottleneckIds: [],
    lastEvidenceAt: T0, lastPracticedAt: null, nextReviewAt: null,
  }])
  const result = await applyMasteryEventsToCollection({
    db, studentId: 'stu-1', subject: 'math', now: T0,
    events: [
      { nodeId: 'MATH-NUM-DEC-MUL-POINT', type: 'verificationFailed', sourceId: 'r1', summary: '验证未通过', bottleneckIds: ['BN-DEC-MUL-POINT-COUNT'] },
      { nodeId: 'MATH-MOD-PERCENT-BASE', type: 'errorEvidence', sourceId: 'r1', summary: '单位1判断错误', bottleneckIds: ['BN-PERCENT-BASE-WHOLE-MISSING'] },
    ],
  })
  assert.deepEqual(result, { created: 1, updated: 1, skipped: 0 })
  const updated = [...db.docs.values()].find(d => d._id === 'm1')
  assert.equal(updated.status, 'relearning')
  assert.equal(updated.evidenceRefs.length, 1)
  const created = [...db.docs.values()].find(d => d._id === 'new-1')
  assert.equal(created.status, 'suspected_gap')
  assert.equal(created.studentId, 'stu-1')
  assert.equal(created.subject, 'math')
})

test('集合写入：空事件与缺参直接 no-op', async () => {
  const db = fakeDb([])
  assert.deepEqual(await applyMasteryEventsToCollection({ db, studentId: 'stu-1', subject: 'math', events: [] }), { created: 0, updated: 0, skipped: 0 })
  assert.deepEqual(await applyMasteryEventsToCollection({ db, studentId: '', subject: 'math', events: [{ nodeId: 'N1', type: 'errorEvidence' }] }), { created: 0, updated: 0, skipped: 0 })
})

// ── 状态机模块双拷贝一致性（studentData ↔ analyzePhotos）──

test('node-mastery.js 在 studentData 与 analyzePhotos 中内容一致', () => {
  const root = path.resolve(__dirname, '..')
  const a = fs.readFileSync(path.join(root, 'cloudfunctions/studentData/node-mastery.js'), 'utf8')
  const b = fs.readFileSync(path.join(root, 'cloudfunctions/analyzePhotos/node-mastery.js'), 'utf8')
  assert.equal(a, b, '两个云函数中的 node-mastery.js 必须保持字节一致（打包安全拷贝）')
})

test('analysis-artifacts 已在画像生效后接入掌握状态写路径', () => {
  const source = fs.readFileSync(path.resolve(__dirname, '../cloudfunctions/analyzePhotos/analysis-artifacts.js'), 'utf8')
  assert.match(source, /deriveMasteryEvents/)
  assert.match(source, /applyMasteryEventsToCollection/)
  assert.match(source, /studentNodeMastery|节点掌握状态/)
})

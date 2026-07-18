// tests/node-mastery.test.js
// 六态掌握状态机：全转移路径 + 守卫规则（不跳级、不降级空转、unobserved 不落库）。
// 设计权威：docs/superpowers/specs/2026-07-17-math-node-mastery-loop-design.md
const test = require('node:test')
const assert = require('node:assert/strict')

const {
  NODE_MASTERY_STATUSES,
  nextStatus,
  applyEvent,
} = require('../cloudfunctions/studentData/node-mastery')

const DAY_MS = 24 * 60 * 60 * 1000
const T0 = new Date('2026-07-17T10:00:00+08:00')

// ── 转移表：4 事件 × 6 状态 ──

test('转移表：errorEvidence', () => {
  assert.equal(nextStatus('unobserved', 'errorEvidence'), 'suspected_gap')
  assert.equal(nextStatus('suspected_gap', 'errorEvidence'), 'suspected_gap')
  assert.equal(nextStatus('relearning', 'errorEvidence'), 'relearning')
  assert.equal(nextStatus('partial_mastery', 'errorEvidence'), 'recurring')
  assert.equal(nextStatus('mastered', 'errorEvidence'), 'recurring')
  assert.equal(nextStatus('recurring', 'errorEvidence'), 'recurring')
})

test('转移表：verificationFailed（任何状态都被证据推翻到 relearning）', () => {
  for (const status of NODE_MASTERY_STATUSES) {
    assert.equal(nextStatus(status, 'verificationFailed'), 'relearning', `${status} 应转 relearning`)
  }
})

test('转移表：resourcePracticePassed（重学/疑似/复发 → 部分掌握，其余不变）', () => {
  assert.equal(nextStatus('relearning', 'resourcePracticePassed'), 'partial_mastery')
  assert.equal(nextStatus('suspected_gap', 'resourcePracticePassed'), 'partial_mastery')
  assert.equal(nextStatus('recurring', 'resourcePracticePassed'), 'partial_mastery')
  for (const status of ['unobserved', 'partial_mastery', 'mastered']) {
    assert.equal(nextStatus(status, 'resourcePracticePassed'), status, `${status} 不应变化`)
  }
})

test('转移表：verificationPassed', () => {
  // 疑似漏洞被验证推翻 → 洗清回 unobserved（验证卷的核心作用：确认或推翻卡点假设）
  assert.equal(nextStatus('suspected_gap', 'verificationPassed'), 'unobserved')
  assert.equal(nextStatus('relearning', 'verificationPassed'), 'partial_mastery')
  assert.equal(nextStatus('recurring', 'verificationPassed'), 'partial_mastery')
  // partial_mastery 升 mastered 需要间隔 ≥24h
  assert.equal(
    nextStatus('partial_mastery', 'verificationPassed', { now: T0, lastPracticedAt: new Date(T0.getTime() - DAY_MS) }),
    'mastered')
  assert.equal(
    nextStatus('partial_mastery', 'verificationPassed', { now: T0, lastPracticedAt: new Date(T0.getTime() - DAY_MS + 1000) }),
    'partial_mastery', '间隔不足 24h 不得升 mastered')
  // unobserved/mastered 不变
  for (const status of ['unobserved', 'mastered']) {
    assert.equal(nextStatus(status, 'verificationPassed', { now: T0, lastPracticedAt: null }), status, `${status} 不应变化`)
  }
})

test('守卫：任何状态都不能一步到 mastered', () => {
  // 只有 partial_mastery 且间隔达标才允许升 mastered；其余起始状态经任何事件都到不了 mastered
  for (const status of ['unobserved', 'suspected_gap', 'relearning', 'recurring']) {
    for (const event of ['errorEvidence', 'verificationFailed', 'verificationPassed', 'resourcePracticePassed']) {
      const target = nextStatus(status, event, { now: T0, lastPracticedAt: new Date(T0.getTime() - 10 * DAY_MS) })
      assert.notEqual(target, 'mastered', `${status} + ${event} 不得直达 mastered`)
    }
  }
})

test('守卫：非法输入不改变状态', () => {
  assert.equal(nextStatus('bogus', 'errorEvidence'), 'suspected_gap', '非法状态按 unobserved 处理')
  assert.equal(nextStatus('mastered', 'not-an-event'), 'mastered')
  assert.equal(nextStatus('', ''), 'unobserved')
})

// ── applyEvent：记录创建与字段副作用 ──

test('unobserved 不落库：无记录 + 练习通过类事件 → 返回 null', () => {
  assert.equal(applyEvent(null, { type: 'verificationPassed', at: T0 }), null)
  assert.equal(applyEvent(null, { type: 'resourcePracticePassed', at: T0 }), null)
})

test('无记录 + errorEvidence → 创建 suspected_gap 记录', () => {
  const record = applyEvent(null, {
    type: 'errorEvidence', at: T0, sourceId: 'report-1', summary: '8.5×3.16 小数点定位错误',
    bottleneckIds: ['BN-DEC-MUL-POINT-COUNT'], nodeId: 'MATH-NUM-DEC-MUL-POINT',
  })
  assert.equal(record.status, 'suspected_gap')
  assert.equal(record.nodeId, 'MATH-NUM-DEC-MUL-POINT')
  assert.equal(record.evidenceRefs.length, 1)
  assert.equal(record.evidenceRefs[0].type, 'errorEvidence')
  assert.deepEqual(record.activeBottleneckIds, ['BN-DEC-MUL-POINT-COUNT'])
  assert.equal(record.confidence, 0.5)
})

test(' mastered 升级守卫：partial_mastery + 间隔不足 → 保持并记录证据', () => {
  const base = applyEvent(null, { type: 'verificationFailed', at: T0, nodeId: 'N1' })
  const partial = applyEvent(base, { type: 'resourcePracticePassed', at: new Date(T0.getTime() + 1000), nodeId: 'N1' })
  assert.equal(partial.status, 'partial_mastery')
  // 1 小时后验证通过：间隔不足，不能升 mastered（但此次练习会把 lastPracticedAt 推进到 T0+1h）
  const tooSoon = applyEvent(partial, { type: 'verificationPassed', at: new Date(T0.getTime() + 3600 * 1000), nodeId: 'N1' })
  assert.equal(tooSoon.status, 'partial_mastery')
  // 上次练习（T0+1h）满 24h 后再验证通过：升级
  const mastered = applyEvent(tooSoon, { type: 'verificationPassed', at: new Date(T0.getTime() + 25 * 3600 * 1000 + 1000), nodeId: 'N1' })
  assert.equal(mastered.status, 'mastered')
  assert.equal(mastered.nextReviewAt, null, 'mastered 后清空复测时间')
})

test('mastered + errorEvidence → recurring（回退路径存在）', () => {
  const mastered = {
    nodeId: 'N1', status: 'mastered', confidence: 0.9, evidenceRefs: [],
    activeBottleneckIds: [], lastEvidenceAt: T0, lastPracticedAt: T0, nextReviewAt: null,
  }
  const rec = applyEvent(mastered, { type: 'errorEvidence', at: new Date(T0.getTime() + 3 * DAY_MS), sourceId: 'report-9' })
  assert.equal(rec.status, 'recurring')
  // 复发后验证失败 → 回到重学
  const relearning = applyEvent(rec, { type: 'verificationFailed', at: new Date(T0.getTime() + 3 * DAY_MS + 1000) })
  assert.equal(relearning.status, 'relearning')
})

test('字段副作用：练习事件更新 lastPracticedAt，partial_mastery 安排 nextReviewAt', () => {
  const base = applyEvent(null, { type: 'verificationFailed', at: T0, nodeId: 'N1' })
  assert.equal(base.lastPracticedAt, null, '失败事件不是练习')
  const partialAt = new Date(T0.getTime() + 1000)
  const partial = applyEvent(base, { type: 'resourcePracticePassed', at: partialAt, nodeId: 'N1' })
  assert.deepEqual(partial.lastPracticedAt, partialAt)
  assert.deepEqual(partial.nextReviewAt, new Date(partialAt.getTime() + DAY_MS), '进入 partial_mastery 安排 24h 后复测')
})

test('activeBottleneckIds 并集去重且封顶 8 个', () => {
  let record = applyEvent(null, { type: 'errorEvidence', at: T0, nodeId: 'N1', bottleneckIds: ['BN-1', 'BN-2'] })
  record = applyEvent(record, { type: 'errorEvidence', at: T0, nodeId: 'N1', bottleneckIds: ['BN-2', 'BN-3'] })
  assert.deepEqual(record.activeBottleneckIds, ['BN-1', 'BN-2', 'BN-3'])
  for (let i = 0; i < 10; i += 1) {
    record = applyEvent(record, { type: 'errorEvidence', at: T0, nodeId: 'N1', bottleneckIds: [`BN-X${i}`] })
  }
  assert.ok(record.activeBottleneckIds.length <= 8)
})

test('confidence 随证据单调递增且有 0-1 边界', () => {
  let record = applyEvent(null, { type: 'errorEvidence', at: T0, nodeId: 'N1' })
  let previous = record.confidence
  for (let i = 0; i < 10; i += 1) {
    record = applyEvent(record, { type: 'errorEvidence', at: T0, nodeId: 'N1' })
    assert.ok(record.confidence >= previous, 'confidence 单调不减')
    assert.ok(record.confidence > 0 && record.confidence <= 1)
    previous = record.confidence
  }
  assert.ok(record.confidence <= 0.95, '封顶 0.95')
})

test('applyEvent 对非法事件与非法记录保持防御', () => {
  assert.equal(applyEvent(null, null), null)
  const record = { nodeId: 'N1', status: 'mastered', evidenceRefs: [], activeBottleneckIds: [] }
  assert.equal(applyEvent(record, { type: 'bogus' }), record)
})

// 学习修复双指标（验证覆盖率 + 严格修复率）聚合逻辑测试。
// 口径依据：docs/superpowers/specs/2026-08-09-repair-metrics-and-case-validation-design.md
const test = require('node:test')
const assert = require('node:assert/strict')
const { buildRepairMetricsView } = require('../cloudfunctions/studentData/repair-metrics')

function entry(overrides = {}) {
  return { lpCode: 'LP-001', lpName: '计算基础', status: 'persisting', ...overrides }
}

function profileWith(currentBottlenecks = [], improvedBottlenecks = []) {
  return { studentId: 'student-1', subject: 'math', currentBottlenecks, improvedBottlenecks }
}

test('空档案返回 empty 视图', () => {
  const view = buildRepairMetricsView({ profile: null, packs: [], interventionSessions: [], microValidations: [] })
  assert.equal(view.empty, true)
  assert.equal(view.coverageRate.denominator, 0)
  assert.equal(view.repairRate.denominator, 0)
})

test('验证覆盖率 = 有验证证据的卡点 / 全部卡点', () => {
  const snapshot = {
    profile: profileWith([
      entry({ lpCode: 'LP-001', verificationPassCount: 1, lastVerifiedAt: '2026-07-01T10:00:00Z', lastPassedAt: '2026-07-01T10:00:00Z' }),
      entry({ lpCode: 'LP-002', lpName: '分数运算' }),
      entry({ lpCode: 'LP-003', lpName: '小数百分数', verificationFailCount: 1, lastVerifiedAt: '2026-07-02T10:00:00Z' }),
      entry({ lpCode: 'LP-004', lpName: '单位换算' })
    ]),
    packs: [], interventionSessions: [], microValidations: []
  }
  const view = buildRepairMetricsView(snapshot)
  assert.equal(view.coverageRate.numerator, 2)
  assert.equal(view.coverageRate.denominator, 4)
  assert.equal(view.coverageRate.percent, 50)
})

test('严格修复率只统计修复完成后才通过的卡点', () => {
  const snapshot = {
    profile: profileWith([
      // 修复（7-01）后通过（7-05）→ 计入分子
      entry({ lpCode: 'LP-001', lastPassedAt: '2026-07-05T10:00:00Z', verificationPassCount: 1 }),
      // 通过（6-20）早于修复（7-01）→ 不计入分子，但计入分母
      entry({ lpCode: 'LP-002', lpName: '分数运算', lastPassedAt: '2026-06-20T10:00:00Z', verificationPassCount: 1 })
    ]),
    packs: [
      { _id: 'pack-1', studentId: 'student-1', subject: 'math', lpCode: 'LP-001', targetId: 'LP-001', status: 'completed', progress: { completedAt: '2026-07-01T10:00:00Z' } },
      { _id: 'pack-2', studentId: 'student-1', subject: 'math', lpCode: 'LP-002', targetId: 'LP-002', status: 'completed', progress: { completedAt: '2026-07-01T11:00:00Z' } }
    ],
    interventionSessions: [], microValidations: []
  }
  const view = buildRepairMetricsView(snapshot)
  assert.equal(view.repairRate.denominator, 2)
  assert.equal(view.repairRate.numerator, 1)
  assert.equal(view.repairRate.percent, 50)
})

test('四档分类互斥且覆盖全集', () => {
  const snapshot = {
    profile: profileWith([
      entry({ lpCode: 'LP-001', lastPassedAt: '2026-07-05T10:00:00Z', verificationPassCount: 1 }),          // 已修复
      entry({ lpCode: 'LP-002', lpName: '分数运算' }),                                                        // 修复中（有已完成任务包，未通过）
      entry({ lpCode: 'LP-003', lpName: '小数百分数', verificationFailCount: 1, lastVerifiedAt: '2026-07-02T10:00:00Z' }), // 已验证未通过
      entry({ lpCode: 'LP-004', lpName: '单位换算' })                                                          // 未验证
    ]),
    packs: [
      { _id: 'pack-2', studentId: 'student-1', subject: 'math', targetId: 'LP-002', status: 'completed', progress: { completedAt: '2026-07-01T11:00:00Z' } }
    ],
    interventionSessions: [], microValidations: []
  }
  const view = buildRepairMetricsView(snapshot)
  assert.deepEqual(view.buckets.repaired.map(r => r.lpCode), ['LP-001'])
  assert.deepEqual(view.buckets.repairing.map(r => r.lpCode), ['LP-002'])
  assert.deepEqual(view.buckets.verifiedNotPassed.map(r => r.lpCode), ['LP-003'])
  assert.deepEqual(view.buckets.unverified.map(r => r.lpCode), ['LP-004'])
})

test('微验证 completed 且 ≥2/3 正确算通过证据；in_progress 不算', () => {
  const snapshot = {
    profile: profileWith([
      entry({ lpCode: 'LP-001', candidateBottlenecks: [{ bottleneckId: 'BN-A' }] }),
      entry({ lpCode: 'LP-002', lpName: '分数运算', candidateBottlenecks: [{ bottleneckId: 'BN-B' }] })
    ]),
    packs: [], interventionSessions: [],
    microValidations: [
      { _id: 'mv-1', studentId: 'student-1', subject: 'math', bottleneckId: 'BN-A', status: 'completed', verdicts: ['correct', 'correct', 'incorrect'], correctCount: 2, completedAt: '2026-07-03T10:00:00Z' },
      { _id: 'mv-2', studentId: 'student-1', subject: 'math', bottleneckId: 'BN-B', status: 'in_progress', verdicts: ['correct'], completedAt: '' }
    ]
  }
  const view = buildRepairMetricsView(snapshot)
  assert.deepEqual(view.buckets.repaired.map(r => r.lpCode), ['LP-001'])
  assert.equal(view.coverageRate.numerator, 1)
})

test('干预会话算修复动作', () => {
  const snapshot = {
    profile: profileWith([entry({ lpCode: 'LP-001', candidateBottlenecks: [{ bottleneckId: 'BN-A' }] })]),
    packs: [],
    interventionSessions: [
      { sessionId: 'iv-1', studentId: 'student-1', subject: 'math', bottleneckIds: ['BN-A'], createdAt: '2026-07-01T09:00:00Z' }
    ],
    microValidations: [
      { _id: 'mv-1', studentId: 'student-1', subject: 'math', bottleneckId: 'BN-A', status: 'completed', passVerdict: true, correctCount: 3, completedAt: '2026-07-04T10:00:00Z' }
    ]
  }
  const view = buildRepairMetricsView(snapshot)
  assert.equal(view.repairRate.denominator, 1)
  assert.equal(view.repairRate.numerator, 1)
})

test('improvedBottlenecks 的 improvedDate 算通过证据且与 current 去重', () => {
  const snapshot = {
    profile: profileWith(
      [entry({ lpCode: 'LP-001', status: 'improved' })],
      [{ lpCode: 'LP-001', lpName: '计算基础', improvedDate: '2026-07-06T10:00:00Z' }]
    ),
    packs: [], interventionSessions: [], microValidations: []
  }
  const view = buildRepairMetricsView(snapshot)
  assert.equal(view.coverageRate.denominator, 1)
  assert.deepEqual(view.buckets.repaired.map(r => r.lpCode), ['LP-001'])
})

test('分母小于 5 标记小样本', () => {
  const snapshot = { profile: profileWith([entry()]), packs: [], interventionSessions: [], microValidations: [] }
  const view = buildRepairMetricsView(snapshot)
  assert.equal(view.coverageRate.smallSample, true)
})

test('timeline 按证据时间累计', () => {
  const snapshot = {
    profile: profileWith([
      entry({ lpCode: 'LP-001', lastVerifiedAt: '2026-07-01T10:00:00Z', lastFailedVerificationAt: '2026-07-01T10:00:00Z' }),
      entry({ lpCode: 'LP-002', lpName: '分数运算', lastVerifiedAt: '2026-07-03T10:00:00Z', lastPassedAt: '2026-07-03T10:00:00Z', verificationPassCount: 1 })
    ]),
    packs: [], interventionSessions: [], microValidations: []
  }
  const view = buildRepairMetricsView(snapshot)
  assert.equal(view.timeline.length, 2)
  assert.equal(view.timeline[0].date, '2026-07-01')
  assert.equal(view.timeline[0].verifiedTotal, 1)
  assert.equal(view.timeline[0].passedTotal, 0)
  assert.equal(view.timeline[1].date, '2026-07-03')
  assert.equal(view.timeline[1].verifiedTotal, 2)
  assert.equal(view.timeline[1].passedTotal, 1)
})

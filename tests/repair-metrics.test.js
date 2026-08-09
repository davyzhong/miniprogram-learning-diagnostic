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

test('通过与修复完成同一时间戳不计入严格修复率分子', () => {
  const snapshot = {
    profile: profileWith([
      entry({ lpCode: 'LP-001', lastPassedAt: '2026-07-01T10:00:00Z', verificationPassCount: 1 })
    ]),
    packs: [
      { _id: 'pack-1', studentId: 'student-1', subject: 'math', targetId: 'LP-001', status: 'completed', progress: { completedAt: '2026-07-01T10:00:00Z' } }
    ],
    interventionSessions: [], microValidations: []
  }
  const view = buildRepairMetricsView(snapshot)
  assert.equal(view.repairRate.denominator, 1)
  assert.equal(view.repairRate.numerator, 0)
})

test('微验证 completed 但正确率不足 2/3 算未通过证据', () => {
  const snapshot = {
    profile: profileWith([
      entry({ lpCode: 'LP-001', candidateBottlenecks: [{ bottleneckId: 'BN-A' }] })
    ]),
    packs: [], interventionSessions: [],
    microValidations: [
      { _id: 'mv-1', studentId: 'student-1', subject: 'math', bottleneckId: 'BN-A', status: 'completed', verdicts: ['correct', 'incorrect', 'incorrect'], correctCount: 1, completedAt: '2026-07-03T10:00:00Z' }
    ]
  }
  const view = buildRepairMetricsView(snapshot)
  assert.deepEqual(view.buckets.verifiedNotPassed.map(r => r.lpCode), ['LP-001'])
  assert.equal(view.timeline.length, 1)
  assert.equal(view.timeline[0].passedTotal, 0)
  assert.equal(view.timeline[0].verifiedTotal, 1)
})

test('pack 缺 progress.completedAt 时降级用 updatedAt 作为修复完成时间', () => {
  const snapshot = {
    profile: profileWith([
      entry({ lpCode: 'LP-001', lastPassedAt: '2026-07-05T10:00:00Z', verificationPassCount: 1 })
    ]),
    packs: [
      { _id: 'pack-1', studentId: 'student-1', subject: 'math', targetId: 'LP-001', status: 'completed', progress: {}, updatedAt: '2026-07-01T10:00:00Z' }
    ],
    interventionSessions: [], microValidations: []
  }
  const view = buildRepairMetricsView(snapshot)
  assert.equal(view.repairRate.denominator, 1)
  assert.equal(view.repairRate.numerator, 1)
})

const {
  createCloudMock,
  createDatabase,
  loadModule
} = require('./helpers/cloud-function-harness')

function loadStudentData(db, openId = 'owner-1') {
  return loadModule('cloudfunctions/studentData/index.js', {
    'wx-server-sdk': createCloudMock({ db, openId })
  })
}

test('getRepairMetrics：无权限拒绝、缺参拒绝、有权限返回双指标', async () => {
  const db = createDatabase({
    students: [
      { _id: 'student-1', _openid: 'owner-1', name: '小明', grade: 4 }
    ],
    studentMembers: [
      { _id: 'member-1', studentId: 'student-1', ownerOpenId: 'owner-1', memberOpenId: 'owner-1', role: 'owner', status: 'active' }
    ],
    subjectProfiles: [
      {
        _id: 'profile-math', studentId: 'student-1', subject: 'math',
        currentBottlenecks: [
          { lpCode: 'LP-001', lpName: '计算基础', status: 'persisting', verificationPassCount: 1, lastVerifiedAt: '2026-07-01T10:00:00Z', lastPassedAt: '2026-07-05T10:00:00Z' }
        ],
        improvedBottlenecks: []
      }
    ],
    learningResourcePacks: [
      { _id: 'pack-1', studentId: 'student-1', subject: 'math', targetId: 'LP-001', status: 'completed', progress: { completedAt: '2026-07-01T09:00:00Z' } }
    ],
    interventionSessions: [],
    microValidations: []
  })

  const mod = loadStudentData(db)

  const missing = await mod.main({ action: 'getRepairMetrics' })
  assert.equal(missing.success, false)

  const result = await mod.main({ action: 'getRepairMetrics', studentId: 'student-1' })
  assert.equal(result.success, true)
  assert.equal(result.metrics.coverageRate.numerator, 1)
  assert.equal(result.metrics.repairRate.numerator, 1)
  assert.equal(result.metrics.repairRate.denominator, 1)

  const stranger = loadStudentData(db, 'stranger-9')
  const denied = await stranger.main({ action: 'getRepairMetrics', studentId: 'student-1' })
  assert.equal(denied.success, false)
})

const { buildRepairMetricsPageView } = require('../miniprogram/pages/repair-metrics/repair-metrics-presenter')

test('presenter：空态与错误态', () => {
  assert.equal(buildRepairMetricsPageView(null).empty, true)
  assert.equal(buildRepairMetricsPageView({ metrics: { empty: true } }).empty, true)
})

test('presenter：双指标卡 + 分档 + 小样本提示 + 口径文案', () => {
  const view = buildRepairMetricsPageView({
    metrics: {
      empty: false,
      totals: { bottlenecks: 3, verified: 2, repaired: 1, repairing: 1, verifiedNotPassed: 0, unverified: 1 },
      coverageRate: { numerator: 2, denominator: 3, percent: 67, smallSample: true },
      repairRate: { numerator: 1, denominator: 1, percent: 100, smallSample: true },
      buckets: {
        repaired: [{ lpCode: 'LP-001', name: '计算基础' }],
        repairing: [{ lpCode: 'LP-002', name: '分数运算' }],
        verifiedNotPassed: [],
        unverified: [{ lpCode: 'LP-003', name: '小数百分数' }]
      },
      timeline: [{ date: '2026-07-03', passedTotal: 1, verifiedTotal: 2 }]
    }
  })
  assert.equal(view.empty, false)
  assert.equal(view.coverageCard.text, '67%（2/3）')
  assert.equal(view.repairCard.text, '100%（1/1）')
  assert.equal(view.smallSample, true)
  assert.equal(view.bucketGroups.length, 4)
  assert.equal(view.bucketGroups[0].title, '已修复')
  assert.equal(view.bucketGroups[0].rows.length, 1)
  assert.equal(view.bucketGroups[0].rows[0].name, '计算基础')
  assert.match(view.bucketGroups[0].rows[0].name, /计算基础/)
  assert.equal(view.timelineRows.length, 1)
  assert.match(view.timelineRows[0], /2026-07-03/)
  assert.ok(view.caliberLines.length >= 2)
})

test('presenter：分档名称不暴露内部编码', () => {
  const view = buildRepairMetricsPageView({
    metrics: {
      empty: false,
      totals: { bottlenecks: 1, verified: 0, repaired: 0, repairing: 0, verifiedNotPassed: 0, unverified: 1 },
      coverageRate: { numerator: 0, denominator: 1, percent: 0, smallSample: true },
      repairRate: { numerator: 0, denominator: 0, percent: 0, smallSample: true },
      buckets: { repaired: [], repairing: [], verifiedNotPassed: [], unverified: [{ lpCode: 'LP-009', name: '' }] },
      timeline: []
    }
  })
  const rows = view.bucketGroups.flatMap(group => group.rows)
  rows.forEach(row => {
    assert.doesNotMatch(row.name, /^(LP|BN|CHI|ERR|MATH)-/)
  })
})

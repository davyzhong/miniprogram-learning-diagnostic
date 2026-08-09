# 修复率指标页与案例验证波 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 落地家长可见的数学修复率指标页（验证覆盖率 + 严格修复率双指标），并完成案例验证波的线下材料，为 Go/No-Go 决策提供依据。

**Architecture:** 方案 A（实时聚合，零新增写入）：`studentData` 云函数新增只读 action `getRepairMetrics`，从 `subjectProfiles` / `learningResourcePacks` / `interventionSessions` / `microValidations` 现有数据现算双指标；前端新增分包页 `repair-metrics`，入口在数学学科工作台和家庭工作台。聚合核心是纯函数 `buildRepairMetricsView`，全部逻辑可离线单测。

**Tech Stack:** 微信小程序原生（Page/WXML/WXSS）+ 微信云开发云函数（Node.js）+ node:test 测试框架 + page-harness/cloud-function-harness 测试沙箱。

**Spec:** `docs/superpowers/specs/2026-08-09-repair-metrics-and-case-validation-design.md`

---

## 文件结构总览

**新建：**
- `cloudfunctions/studentData/repair-metrics.js` — 纯聚合函数 + 数据快照加载器
- `tests/repair-metrics.test.js` — 聚合单测 + 云函数集成测试
- `miniprogram/pages/repair-metrics/repair-metrics.js/.json/.wxml/.wxss` — 页面四件套
- `miniprogram/pages/repair-metrics/repair-metrics-presenter.js` — 视图预计算
- `tests/repair-metrics-page-flows.test.js` — 页面控制器测试
- 知识库：`00-总项目知识库/03-产品商业与传播/案例验证招募说明-v0.1.md`
- 知识库：`00-总项目知识库/06-案例验证/案例记录模板-v0.1.md`

**修改：**
- `cloudfunctions/studentData/index.js` — ACTIONS + 分发 + getRepairMetrics
- `miniprogram/utils/cloud.js` — getRepairMetrics 包装
- `miniprogram/app.json` — subPackages 注册
- `miniprogram/pages/subject-home/subject-home-presenter.js` + `subject-home.js` — 数学工具入口
- `miniprogram/pages/index/index-presenter.js` — 家庭行动队列入口
- `package.json` — test:unit / test:coverage 文件清单
- `tests/helpers/user-facing-page-audit.js` — 页面审计注册表
- `README.md`、`docs/CLOUD_FUNCTIONS.md`、`PRD.md`、`CHANGELOG.md` — 文档基线

**口径关键事实**（来自 spec 与 DATA_DICTIONARY，实现时不要偏离）：

- 卡点全集 = `subjectProfiles.currentBottlenecks` ∪ `improvedBottlenecks`（按 `lpCode` 去重），仅数学
- 卡点条目自带 `lastPassedAt` / `lastFailedVerificationAt` / `lastVerifiedAt` / `verificationPassCount` / `verificationFailCount` / `candidateBottlenecks[].bottleneckId`
- 任务包完成 = `learningResourcePacks.status === 'completed'`，完成时间取 `progress.completedAt || updatedAt || createdAt`；匹配键 `targetId` / `bottleneckId` / `lpCode`
- 干预会话 = `interventionSessions.bottleneckIds[]` 与卡点 id 集合相交，时间取 `createdAt`
- 微验证通过 = `microValidations.status === 'completed'` 且 `passVerdict === true` 或 `correctCount >= ceil(总数 × 2/3)`，时间取 `completedAt`
- improvedBottlenecks 条目的 `improvedDate` 视为通过证据时间
- 小样本阈值：分母 < 5

---

## Task 1: 纯聚合函数 buildRepairMetricsView（TDD）

**Files:**
- Create: `cloudfunctions/studentData/repair-metrics.js`
- Create: `tests/repair-metrics.test.js`
- Modify: `package.json`（test:unit 与 test:coverage 清单追加 `tests/repair-metrics.test.js`）

- [ ] **Step 1: 写失败测试**

创建 `tests/repair-metrics.test.js`：

```js
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
```

把 `tests/repair-metrics.test.js` 追加进 `package.json` 的 `test:unit` 和 `test:coverage` 两个脚本的文件清单（两处都是空格分隔的文件名列表，分别以 `tests/ai-usage-ledger.test.js` 开头；追加到各自列表末尾即可）。

- [ ] **Step 2: 运行确认失败**

Run: `node --test tests/repair-metrics.test.js`
Expected: FAIL — `Cannot find module '.../repair-metrics'`

- [ ] **Step 3: 实现聚合函数**

创建 `cloudfunctions/studentData/repair-metrics.js`：

```js
// 学习修复双指标聚合：验证覆盖率 + 严格修复率。
// 纯只读，不写任何集合。口径定义见
// docs/superpowers/specs/2026-08-09-repair-metrics-and-case-validation-design.md
const SMALL_SAMPLE_BELOW = 5;

function toTime(value) {
  if (!value) return 0;
  const time = new Date(value).getTime();
  return Number.isFinite(time) ? time : 0;
}

function formatBeijingDate(time) {
  return new Date(time + 8 * 3600 * 1000).toISOString().slice(0, 10);
}

// 卡点条目的全部可匹配 id：粗卡点 lpCode + 细卡点 bottleneckId
function entryTargetIds(entry = {}) {
  const ids = new Set();
  if (entry.lpCode) ids.add(entry.lpCode);
  (entry.candidateBottlenecks || []).forEach(candidate => {
    if (candidate && candidate.bottleneckId) ids.add(candidate.bottleneckId);
  });
  return ids;
}

function hits(ids, targetId) {
  return Boolean(targetId) && ids.has(targetId);
}

function hitsAny(ids, targetIds = []) {
  return (targetIds || []).some(targetId => ids.has(targetId));
}

// 已完成任务包的完成时间；未完成返回 0
function packCompletedAt(pack = {}) {
  if (pack.status !== 'completed') return 0;
  const progress = pack.progress || {};
  return Math.max(toTime(progress.completedAt), toTime(pack.updatedAt), toTime(pack.createdAt));
}

// 微验证会话的证据；未完成会话返回 null
function microValidationEvidence(session = {}) {
  if (session.status !== 'completed') return null;
  const total = (session.verdicts || []).length || (session.questions || []).length;
  const correctCount = typeof session.correctCount === 'number'
    ? session.correctCount
    : (session.verdicts || []).filter(v => v === 'correct').length;
  const passed = session.passVerdict === true || (total > 0 && correctCount >= Math.ceil((total * 2) / 3));
  return { passed, time: toTime(session.completedAt) || toTime(session.updatedAt) };
}

function collectEvidence(entry, snapshot) {
  const ids = entryTargetIds(entry);
  let repairCompletedAt = 0;
  let passedAt = toTime(entry.lastPassedAt);
  let failedAt = toTime(entry.lastFailedVerificationAt);
  let hasVerification = (entry.verificationPassCount || 0) > 0
    || (entry.verificationFailCount || 0) > 0
    || toTime(entry.lastVerifiedAt) > 0;

  (snapshot.packs || []).forEach(pack => {
    const matches = hits(ids, pack.targetId) || hits(ids, pack.bottleneckId) || hits(ids, pack.lpCode);
    if (!matches) return;
    const completedAt = packCompletedAt(pack);
    if (completedAt > repairCompletedAt) repairCompletedAt = completedAt;
  });

  (snapshot.interventionSessions || []).forEach(session => {
    if (!hitsAny(ids, session.bottleneckIds)) return;
    const time = toTime(session.createdAt) || toTime(session.updatedAt);
    if (time > repairCompletedAt) repairCompletedAt = time;
  });

  (snapshot.microValidations || []).forEach(session => {
    if (!hits(ids, session.bottleneckId)) return;
    const evidence = microValidationEvidence(session);
    if (!evidence) return;
    hasVerification = true;
    if (evidence.passed) {
      if (evidence.time > passedAt) passedAt = evidence.time;
    } else if (evidence.time > failedAt) {
      failedAt = evidence.time;
    }
  });

  return { repairCompletedAt, passedAt, failedAt, hasVerification };
}

function rate(numerator, denominator) {
  return {
    numerator,
    denominator,
    percent: denominator > 0 ? Math.round((numerator / denominator) * 100) : 0,
    smallSample: denominator < SMALL_SAMPLE_BELOW
  };
}

function rowOf(entry) {
  return { lpCode: entry.lpCode || '', name: entry.lpName || '待确认卡点' };
}

function buildRepairMetricsView(snapshot = {}) {
  const profile = snapshot.profile || {};
  const seen = new Set();
  const universe = [];
  [...(profile.improvedBottlenecks || []), ...(profile.currentBottlenecks || [])].forEach(entry => {
    const key = entry.lpCode || `row-${universe.length}`;
    if (seen.has(key)) return;
    seen.add(key);
    universe.push(entry);
  });

  const buckets = { repaired: [], repairing: [], verifiedNotPassed: [], unverified: [] };
  const events = [];
  let verifiedCount = 0;
  let repairDenominator = 0;
  let repairNumerator = 0;

  universe.forEach(entry => {
    const evidence = collectEvidence(entry, snapshot);
    const passedAt = Math.max(evidence.passedAt, toTime(entry.improvedDate));
    const hasVerification = evidence.hasVerification || passedAt > 0;

    if (passedAt > 0) {
      buckets.repaired.push(rowOf(entry));
      events.push({ time: passedAt, kind: 'passed' });
      if (evidence.failedAt > 0) events.push({ time: evidence.failedAt, kind: 'failed' });
    } else if (evidence.repairCompletedAt > 0) {
      buckets.repairing.push(rowOf(entry));
      if (evidence.failedAt > 0) events.push({ time: evidence.failedAt, kind: 'failed' });
    } else if (hasVerification) {
      buckets.verifiedNotPassed.push(rowOf(entry));
      if (evidence.failedAt > 0) events.push({ time: evidence.failedAt, kind: 'failed' });
    } else {
      buckets.unverified.push(rowOf(entry));
    }

    if (hasVerification) verifiedCount += 1;
    if (evidence.repairCompletedAt > 0) {
      repairDenominator += 1;
      if (passedAt > evidence.repairCompletedAt) repairNumerator += 1;
    }
  });

  events.sort((a, b) => a.time - b.time);
  // timeline 按证据事件累计：一个卡点有多条证据时按事件数累计，不按卡点数
  const timeline = [];
  let cumPassed = 0;
  let cumVerified = 0;
  events.forEach(event => {
    cumVerified += 1;
    if (event.kind === 'passed') cumPassed += 1;
    timeline.push({
      date: formatBeijingDate(event.time),
      passedTotal: cumPassed,
      verifiedTotal: cumVerified
    });
  });

  return {
    empty: universe.length === 0,
    totals: {
      bottlenecks: universe.length,
      verified: verifiedCount,
      repaired: buckets.repaired.length,
      repairing: buckets.repairing.length,
      verifiedNotPassed: buckets.verifiedNotPassed.length,
      unverified: buckets.unverified.length
    },
    coverageRate: rate(verifiedCount, universe.length),
    repairRate: rate(repairNumerator, repairDenominator),
    buckets,
    timeline
  };
}

module.exports = { buildRepairMetricsView };
```

- [ ] **Step 4: 运行确认通过**

Run: `node --test tests/repair-metrics.test.js`
Expected: PASS（9 个用例全过）

- [ ] **Step 5: Commit**

```bash
git add cloudfunctions/studentData/repair-metrics.js tests/repair-metrics.test.js package.json
git commit -m "feat: 学习修复双指标纯聚合函数（验证覆盖率 + 严格修复率）"
```

---

## Task 2: 快照加载器 + getRepairMetrics action 接入（TDD）

**Files:**
- Modify: `cloudfunctions/studentData/repair-metrics.js`（追加载器）
- Modify: `cloudfunctions/studentData/index.js`（import、ACTIONS、分发、action 函数）
- Modify: `tests/repair-metrics.test.js`（追加 harness 集成测试）

- [ ] **Step 1: 写失败集成测试**

在 `tests/repair-metrics.test.js` 末尾追加（文件头部已有 require 之外，新增 harness 引用）：

```js
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
```

- [ ] **Step 2: 运行确认失败**

Run: `node --test tests/repair-metrics.test.js`
Expected: FAIL — `操作类型无效`（action 未注册）

- [ ] **Step 3: 追加快照加载器**

在 `cloudfunctions/studentData/repair-metrics.js` 的 `module.exports` 之前追加：

```js
const { isMissingCollectionError } = require('./access');

async function safeGet(collectionRef) {
  try {
    const res = await collectionRef.get();
    return res.data || [];
  } catch (error) {
    if (isMissingCollectionError(error)) return [];
    throw error;
  }
}

// 读取双指标所需的全部现有数据；集合不存在按空处理（首次使用容错）
async function loadRepairMetricsSnapshot(db, studentId) {
  const where = { studentId, subject: 'math' };
  const [profiles, packs, sessions, validations] = await Promise.all([
    safeGet(db.collection('subjectProfiles').where(where).limit(1)),
    safeGet(db.collection('learningResourcePacks').where(where).limit(500)),
    safeGet(db.collection('interventionSessions').where(where).limit(500)),
    safeGet(db.collection('microValidations').where(where).limit(500))
  ]);
  return {
    profile: profiles[0] || null,
    packs,
    interventionSessions: sessions,
    microValidations: validations
  };
}
```

并把导出改为：

```js
module.exports = { buildRepairMetricsView, loadRepairMetricsSnapshot };
```

- [ ] **Step 4: 接入 index.js**

`cloudfunctions/studentData/index.js` 四处修改：

（a）顶部 require 区追加：

```js
const { buildRepairMetricsView, loadRepairMetricsSnapshot } = require('./repair-metrics');
```

（b）`ACTIONS` 集合追加一项 `'getRepairMetrics',`（加在 `'submitChineseSkillTask',` 之后）。

（c）在 `async function getLearningProgress` 附近追加（权限模式与它一致）：

```js
async function getRepairMetrics(openId, studentId) {
  if (!studentId) return failure('缺少 studentId');
  const access = await getAccess(studentId, openId);
  if (!access.allowed) return failure('无权访问该学生');
  const snapshot = await loadRepairMetricsSnapshot(db, studentId);
  return success({ metrics: buildRepairMetricsView(snapshot) });
}
```

（d）`exports.main` 分发区追加（放在 `getLearningProgress` 分支之后）：

```js
    if (action === 'getRepairMetrics') {
      return getRepairMetrics(openId, event.studentId);
    }
```

- [ ] **Step 5: 运行确认通过**

Run: `node --test tests/repair-metrics.test.js`
Expected: PASS（10 个用例全过）

Run: `npm run test:unit 2>&1 | tail -5`
Expected: 无新增失败

- [ ] **Step 6: Commit**

```bash
git add cloudfunctions/studentData/repair-metrics.js cloudfunctions/studentData/index.js tests/repair-metrics.test.js
git commit -m "feat: studentData.getRepairMetrics 只读聚合接口（双指标）"
```

---

## Task 3: cloud.js 包装 + 前端 presenter（TDD）

**Files:**
- Modify: `miniprogram/utils/cloud.js`
- Create: `miniprogram/pages/repair-metrics/repair-metrics-presenter.js`
- Modify: `tests/repair-metrics.test.js`（presenter 用例）

- [ ] **Step 1: 写失败测试**

在 `tests/repair-metrics.test.js` 末尾追加：

```js
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
```

- [ ] **Step 2: 运行确认失败**

Run: `node --test tests/repair-metrics.test.js`
Expected: FAIL — `Cannot find module '.../repair-metrics-presenter'`

- [ ] **Step 3: 实现 cloud 包装**

在 `miniprogram/utils/cloud.js` 的 `getNodeMasteryMap` 之后追加：

```js
async function getRepairMetrics(studentId) { return callFunction('studentData', { action: 'getRepairMetrics', studentId }) }
```

并在文件底部 `module.exports` 对象中加入 `getRepairMetrics,`。

- [ ] **Step 4: 实现 presenter**

创建 `miniprogram/pages/repair-metrics/repair-metrics-presenter.js`：

```js
// 学习修复指标页视图预计算：双指标卡、卡点去向四档、时间快照。
// 数据来自 studentData.getRepairMetrics（只读聚合）。
const { sanitizeUserText } = require('../../utils/user-facing-text')

const BUCKET_TITLES = [
  ['repaired', '已修复'],
  ['repairing', '修复中'],
  ['verifiedNotPassed', '已验证未通过'],
  ['unverified', '未验证']
]

const CALIBER_LINES = [
  '验证覆盖率 = 有验证证据的卡点 ÷ 档案中全部卡点',
  '严格修复率 = 修复完成后复测通过的卡点 ÷ 完成过修复动作的卡点',
  '复测证据包括微验证（3-6 题，≥2/3 对算通过）和验证卷作答判定'
]

function cardOf(rateItem = {}) {
  return {
    percent: rateItem.percent || 0,
    text: `${rateItem.percent || 0}%（${rateItem.numerator || 0}/${rateItem.denominator || 0}）`,
    smallSample: rateItem.smallSample === true
  }
}

function safeName(name) {
  const text = sanitizeUserText(String(name || ''))
  return text || '待确认卡点'
}

function buildRepairMetricsPageView(result) {
  const metrics = result && result.metrics
  if (!metrics || metrics.empty) {
    return { empty: true, caliberLines: CALIBER_LINES }
  }
  return {
    empty: false,
    coverageCard: cardOf(metrics.coverageRate),
    repairCard: cardOf(metrics.repairRate),
    caliberLines: CALIBER_LINES,
    bucketGroups: BUCKET_TITLES.map(([key, title]) => ({
      key,
      title,
      rows: ((metrics.buckets || {})[key] || []).map(row => ({
        lpCode: row.lpCode,
        name: safeName(row.name)
      }))
    })),
    timelineRows: (metrics.timeline || []).map(item =>
      `${item.date} · 累计验证 ${item.verifiedTotal} 个 · 通过 ${item.passedTotal} 个`),
    smallSample: (metrics.coverageRate && metrics.coverageRate.smallSample)
      || (metrics.repairRate && metrics.repairRate.smallSample)
  }
}

module.exports = { buildRepairMetricsPageView }
```

- [ ] **Step 5: 运行确认通过**

Run: `node --test tests/repair-metrics.test.js`
Expected: PASS（13 个用例全过）

- [ ] **Step 6: Commit**

```bash
git add miniprogram/utils/cloud.js miniprogram/pages/repair-metrics/repair-metrics-presenter.js tests/repair-metrics.test.js
git commit -m "feat: getRepairMetrics 前端包装与指标页 presenter"
```

---

## Task 4: 页面四件套 + app.json 注册

**Files:**
- Create: `miniprogram/pages/repair-metrics/repair-metrics.js`
- Create: `miniprogram/pages/repair-metrics/repair-metrics.json`
- Create: `miniprogram/pages/repair-metrics/repair-metrics.wxml`
- Create: `miniprogram/pages/repair-metrics/repair-metrics.wxss`
- Modify: `miniprogram/app.json`

- [ ] **Step 1: 创建页面控制器**

`miniprogram/pages/repair-metrics/repair-metrics.js`（加载模式与 knowledge-map.js 一致）：

```js
const cloud = require('../../utils/cloud')
const { buildRepairMetricsPageView } = require('./repair-metrics-presenter')

Page({
  data: {
    loading: true,
    studentId: '',
    studentName: '',
    view: null,
    errorText: ''
  },

  onLoad(options = {}) {
    const studentId = options.studentId || ''
    const studentName = decodeURIComponent(options.studentName || '')
    this.setData({ studentId, studentName })
    this._loadPromise = this.loadData().catch(error => {
      console.error('加载修复指标失败', error)
    })
  },

  async loadData() {
    if (!this.data.studentId) {
      this.setData({ loading: false, errorText: '缺少孩子档案信息' })
      return
    }
    this.setData({ loading: true })
    try {
      const result = await cloud.getRepairMetrics(this.data.studentId)
      const view = buildRepairMetricsPageView(result)
      this.setData({ loading: false, view, errorText: '' })
    } catch (err) {
      this.setData({ loading: false, view: null, errorText: '指标加载失败，请稍后重试' })
    }
  },

  onRetryTap() {
    this._loadPromise = this.loadData().catch(error => {
      console.error('加载修复指标失败', error)
    })
  }
})
```

- [ ] **Step 2: 创建 json**

`miniprogram/pages/repair-metrics/repair-metrics.json`：

```json
{
  "navigationBarTitleText": "学习修复指标",
  "usingComponents": {}
}
```

- [ ] **Step 3: 创建 wxml**

`miniprogram/pages/repair-metrics/repair-metrics.wxml`：

```xml
<view class="page">
  <view wx:if="{{loading}}" class="state-block">加载中…</view>

  <view wx:elif="{{errorText}}" class="state-block">
    <text>{{errorText}}</text>
    <button class="retry-btn" bindtap="onRetryTap">重试</button>
  </view>

  <view wx:elif="{{view.empty}}" class="state-block">
    还没有数学诊断记录。先上传试卷照片，诊断出学习卡点后，这里会展示验证覆盖率和修复率。
  </view>

  <block wx:elif="{{view}}">
    <view class="metric-cards">
      <view class="metric-card">
        <view class="metric-title">验证覆盖率</view>
        <view class="metric-value">{{view.coverageCard.text}}</view>
      </view>
      <view class="metric-card">
        <view class="metric-title">严格修复率</view>
        <view class="metric-value">{{view.repairCard.text}}</view>
      </view>
    </view>

    <view wx:if="{{view.smallSample}}" class="small-sample-note">
      当前样本较少（分母不足 5 个卡点），数字仅供参考，还不能作为稳定结论。
    </view>

    <view class="caliber">
      <view class="section-title">口径说明</view>
      <view wx:for="{{view.caliberLines}}" wx:key="*this" class="caliber-line">{{item}}</view>
    </view>

    <view class="buckets">
      <view class="section-title">卡点去向</view>
      <view wx:for="{{view.bucketGroups}}" wx:for-item="group" wx:key="key" class="bucket-group">
        <view class="bucket-title">{{group.title}}（{{group.rows.length}}）</view>
        <view wx:if="{{group.rows.length === 0}}" class="bucket-empty">暂无</view>
        <view wx:for="{{group.rows}}" wx:for-item="row" wx:key="lpCode" class="bucket-row">{{row.name}}</view>
      </view>
    </view>

    <view wx:if="{{view.timelineRows.length > 0}}" class="timeline">
      <view class="section-title">时间快照</view>
      <view wx:for="{{view.timelineRows}}" wx:key="*this" class="timeline-row">{{item}}</view>
    </view>
  </block>
</view>
```

- [ ] **Step 4: 创建 wxss**

`miniprogram/pages/repair-metrics/repair-metrics.wxss`：

```css
.page { padding: 24rpx 32rpx 64rpx; box-sizing: border-box; }
.state-block { padding: 96rpx 32rpx; color: #666; font-size: 28rpx; line-height: 1.6; text-align: center; }
.retry-btn { margin-top: 24rpx; font-size: 28rpx; }
.metric-cards { display: flex; gap: 24rpx; }
.metric-card { flex: 1; background: #fff; border-radius: 16rpx; padding: 28rpx 24rpx; box-shadow: 0 2rpx 8rpx rgba(0, 0, 0, 0.04); }
.metric-title { font-size: 26rpx; color: #666; }
.metric-value { margin-top: 12rpx; font-size: 40rpx; font-weight: 600; color: #1f1f1f; }
.small-sample-note { margin-top: 20rpx; padding: 16rpx 20rpx; background: #fff7e6; border-radius: 12rpx; color: #8a6d1a; font-size: 24rpx; line-height: 1.5; }
.section-title { margin: 32rpx 0 16rpx; font-size: 28rpx; font-weight: 600; color: #1f1f1f; }
.caliber-line { font-size: 24rpx; color: #666; line-height: 1.6; }
.bucket-group { margin-bottom: 24rpx; background: #fff; border-radius: 16rpx; padding: 20rpx 24rpx; }
.bucket-title { font-size: 26rpx; font-weight: 600; color: #333; }
.bucket-empty { margin-top: 8rpx; font-size: 24rpx; color: #999; }
.bucket-row { margin-top: 8rpx; font-size: 26rpx; color: #444; line-height: 1.5; }
.timeline-row { font-size: 24rpx; color: #666; line-height: 1.8; }
```

- [ ] **Step 5: 注册分包**

在 `miniprogram/app.json` 的 `"subPackages"` 数组中、`pages/knowledge-map` 条目之后插入：

```json
    {
      "root": "pages/repair-metrics",
      "pages": ["repair-metrics"]
    },
```

- [ ] **Step 6: 验证语法与页面完整性**

Run: `npm run check 2>&1 | tail -2`
Expected: `Checked 34X JavaScript files.`（无报错；文件数会比 342 多 2）

Run: `node --test tests/deployment-readiness.test.js 2>&1 | tail -5`
Expected: 若该测试断言 app.json 页面与四件套一致，应 PASS（新页面四件套齐全）

- [ ] **Step 7: Commit**

```bash
git add miniprogram/pages/repair-metrics miniprogram/app.json
git commit -m "feat: 学习修复指标页（repair-metrics 分包）"
```

---

## Task 5: 页面审计注册表 + page-flows 测试（TDD）

**Files:**
- Modify: `tests/helpers/user-facing-page-audit.js`
- Create: `tests/repair-metrics-page-flows.test.js`
- Modify: `package.json`（test:unit / test:coverage 追加 `tests/repair-metrics-page-flows.test.js`）

- [ ] **Step 1: 注册表加入新页面**

`tests/helpers/user-facing-page-audit.js` 两处修改：

（a）在 `async function aiUsageStates()` 之后追加状态生成函数（模式与它一致）：

```js
async function repairMetricsStates() {
  const metricsFixture = {
    metrics: {
      empty: false,
      totals: { bottlenecks: 1, verified: 1, repaired: 1, repairing: 0, verifiedNotPassed: 0, unverified: 0 },
      coverageRate: { numerator: 1, denominator: 1, percent: 100, smallSample: true },
      repairRate: { numerator: 0, denominator: 0, percent: 0, smallSample: true },
      buckets: {
        repaired: [{ lpCode: 'LP-001', name: '计算基础' }],
        repairing: [], verifiedNotPassed: [], unverified: []
      },
      timeline: [{ date: '2026-07-03', passedTotal: 1, verifiedTotal: 1 }]
    }
  }
  return [
    state('normal', await runController('miniprogram/pages/repair-metrics/repair-metrics.js', {
      getRepairMetrics: async () => metricsFixture
    }, async page => { await page.loadData() })),
    state('empty', await runController('miniprogram/pages/repair-metrics/repair-metrics.js', {
      getRepairMetrics: async () => ({ metrics: { empty: true } })
    }, async page => { await page.loadData() })),
    state('error', await runController('miniprogram/pages/repair-metrics/repair-metrics.js', {
      getRepairMetrics: async () => { throw new Error(BACKEND_ERROR) }
    }, async page => { await page.loadData() }))
  ]
}
```

（b）在 `RAW_PAGE_AUDIT_REGISTRY` 对象中、`'pages/ai-usage/ai-usage'` 条目之后追加（注册表现有格式是 `presenterAdapter(模块路径, 状态函数, supportsError)`）：

```js
  'pages/repair-metrics/repair-metrics': presenterAdapter('miniprogram/pages/repair-metrics/repair-metrics-presenter.js', repairMetricsStates, true),
```

- [ ] **Step 2: 写失败 page-flows 测试**

创建 `tests/repair-metrics-page-flows.test.js`：

```js
// 学习修复指标页控制器级验收测试（不依赖 DevTools）。
// 用 page-harness 加载 repair-metrics.js，注入 mock cloud API，验证：
//   1. onLoad 带 studentId 后 loadData 调 cloud.getRepairMetrics 并渲染视图
//   2. 缺 studentId 时进入错误态
//   3. 后端抛错时展示错误文案且 onRetryTap 会重试
//   4. wxml 契约：bindtap 与关键区块存在
const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const { loadPage } = require('./helpers/page-harness')
const ROOT = path.resolve(__dirname, '..')

const METRICS = {
  metrics: {
    empty: false,
    totals: { bottlenecks: 1, verified: 1, repaired: 1, repairing: 0, verifiedNotPassed: 0, unverified: 0 },
    coverageRate: { numerator: 1, denominator: 1, percent: 100, smallSample: true },
    repairRate: { numerator: 0, denominator: 0, percent: 0, smallSample: true },
    buckets: { repaired: [{ lpCode: 'LP-001', name: '计算基础' }], repairing: [], verifiedNotPassed: [], unverified: [] },
    timeline: []
  }
}

function loadRepairMetricsPage(cloudMock) {
  const { page } = loadPage('miniprogram/pages/repair-metrics/repair-metrics.js', {
    modules: { '../../utils/cloud': cloudMock }
  })
  return page
}

test('repair-metrics 加载成功渲染双指标视图', async () => {
  const calls = []
  const page = loadRepairMetricsPage({
    getRepairMetrics: async studentId => { calls.push(studentId); return METRICS }
  })
  page.onLoad({ studentId: 'student-1', studentName: encodeURIComponent('小明') })
  await page._loadPromise
  assert.deepEqual(calls, ['student-1'])
  assert.equal(page.data.loading, false)
  assert.equal(page.data.view.empty, false)
  assert.equal(page.data.view.coverageCard.text, '100%（1/1）')
})

test('repair-metrics 缺 studentId 进入错误态且不请求后端', async () => {
  let called = false
  const page = loadRepairMetricsPage({
    getRepairMetrics: async () => { called = true; return METRICS }
  })
  page.onLoad({})
  await page._loadPromise
  assert.equal(called, false)
  assert.equal(page.data.loading, false)
  assert.match(page.data.errorText, /缺少孩子档案/)
})

test('repair-metrics 后端失败可重试', async () => {
  let attempt = 0
  const page = loadRepairMetricsPage({
    getRepairMetrics: async () => {
      attempt += 1
      if (attempt === 1) throw new Error('boom')
      return METRICS
    }
  })
  page.onLoad({ studentId: 'student-1' })
  await page._loadPromise
  assert.match(page.data.errorText, /加载失败/)
  page.onRetryTap()
  await page._loadPromise
  assert.equal(page.data.errorText, '')
  assert.equal(page.data.view.empty, false)
})

test('repair-metrics wxml 契约：重试绑定与指标区块', () => {
  const wxml = fs.readFileSync(path.join(ROOT, 'miniprogram/pages/repair-metrics/repair-metrics.wxml'), 'utf8')
  assert.match(wxml, /bindtap="onRetryTap"/)
  assert.match(wxml, /验证覆盖率/)
  assert.match(wxml, /严格修复率/)
  assert.match(wxml, /卡点去向/)
})
```

把 `tests/repair-metrics-page-flows.test.js` 追加进 `package.json` 的 `test:unit` 与 `test:coverage` 清单。

- [ ] **Step 3: 运行确认通过**

Run: `node --test tests/repair-metrics-page-flows.test.js`
Expected: PASS（4 个用例）

Run: `node --test tests/user-facing-code-hygiene.test.js 2>&1 | tail -5`
Expected: PASS（新页面已在 app.json 注册，审计注册表条目生效）

- [ ] **Step 4: Commit**

```bash
git add tests/helpers/user-facing-page-audit.js tests/repair-metrics-page-flows.test.js package.json
git commit -m "test: 修复指标页 page-flows 与页面审计注册"
```

---

## Task 6: 两个用户入口

**Files:**
- Modify: `miniprogram/pages/subject-home/subject-home-presenter.js`（buildTools 数学分支）
- Modify: `miniprogram/pages/subject-home/subject-home.js`（navigateByAction）
- Modify: `miniprogram/pages/index/index-presenter.js`（repairMetricsUrl + 行动队列条目）
- Modify: `tests/subject-home-presenter.test.js`、`tests/index-presenter.test.js`（入口断言）

- [ ] **Step 1: 更新现有断言并写新增断言（先失败）**

（a）`tests/subject-home-presenter.test.js` 第 50-51 行的现有断言会因新增工具条目而变化，改为：

```js
  assert.deepEqual(view.tools.map(item => item.key), ['diagnosis', 'defaultPaper', 'history', 'repairMetrics'])
  assert.deepEqual(view.tools.map(item => item.icon), ['📸', '📄', '📚', '📊'])
```

并在该用例内追加：

```js
  const repairTool = view.tools.find(item => item.key === 'repairMetrics')
  assert.equal(repairTool.actionType, 'repairMetrics')
```

（b）`tests/index-presenter.test.js` 第 743-748 行的现有断言改为（repairMetrics 插在 knowledgeMap 之后）：

```js
  assert.deepEqual(view.personalActionQueue.map(item => item.key), [
    'bottleneckCenter',
    'uploadEvidence',
    'knowledgeMap',
    'repairMetrics',
    'learningRecords'
  ])
  assert.ok(view.personalActionQueue.every(item => item.url))
  assert.ok(view.personalActionQueue.find(item => item.key === 'repairMetrics').url.startsWith('/pages/repair-metrics/repair-metrics?'))
```

（c）全文搜索这两个测试文件中其他断言 `view.tools` / `personalActionQueue` 键序的用例（viewer 权限等变体），按同样规则补齐 `repairMetrics`（该入口是只读功能，不受 canWrite 限制，viewer 也可见）。

- [ ] **Step 2: 运行确认失败**

Run: `node --test tests/subject-home-presenter.test.js tests/index-presenter.test.js 2>&1 | tail -5`
Expected: FAIL（新断言找不到入口）

- [ ] **Step 3: subject-home 数学工具入口**

`miniprogram/pages/subject-home/subject-home-presenter.js` 的 `buildTools` 数学分支：在 `history` 条目之后、`.filter(Boolean)` 之前追加：

```js
    {
      key: 'repairMetrics',
      title: '修复指标',
      desc: '验证覆盖率与修复率',
      icon: symbolOf('report'),
      actionType: 'repairMetrics'
    },
```

`miniprogram/pages/subject-home/subject-home.js` 的 `navigateByAction` 中追加分支（放在 `history` 分支附近，参数从 `this.data` 取，与现有 navigateToVerification 的学生参数写法保持一致）：

```js
    if (actionType === 'repairMetrics') {
      wx.navigateTo({
        url: `/pages/repair-metrics/repair-metrics?studentId=${encodeURIComponent(this.data.studentId || '')}&studentName=${encodeURIComponent(this.data.studentName || '')}`
      })
      return
    }
```

- [ ] **Step 4: 家庭工作台入口**

`miniprogram/pages/index/index-presenter.js` 在 `knowledgeMapUrl` 之后追加：

```js
function repairMetricsUrl(student) {
  return `/pages/repair-metrics/repair-metrics?studentId=${encodeURIComponent(student._id || '')}&studentName=${encodeURIComponent(student.name || '')}`
}
```

`buildPersonalActionQueue` 返回数组中、`knowledgeMap` 条目之后追加：

```js
  {
    key: 'repairMetrics',
    symbol: symbolOf('report'),
    title: '数学修复指标',
    summary: '看验证覆盖率和修复率，了解修复闭环是否有效。',
    actionText: '看指标',
    url: repairMetricsUrl(student)
  },
```

- [ ] **Step 5: 运行确认通过**

Run: `node --test tests/subject-home-presenter.test.js tests/index-presenter.test.js 2>&1 | tail -5`
Expected: PASS

Run: `node --test tests/subject-home-page-flows.test.js tests/index-page-flows.test.js 2>&1 | tail -5`
Expected: PASS（入口改动不破坏现有流）

- [ ] **Step 6: Commit**

```bash
git add miniprogram/pages/subject-home miniprogram/pages/index tests/subject-home-presenter.test.js tests/index-presenter.test.js
git commit -m "feat: 学科工作台与家庭工作台接入修复指标入口"
```

---

## Task 7: 文档基线同步

**Files:**
- Modify: `README.md`（页面数 26→27）
- Modify: `docs/CLOUD_FUNCTIONS.md`（studentData action 表）
- Modify: `PRD.md`（§10 状态表追加一行）
- Modify: `CHANGELOG.md`（Unreleased 新条目）

- [ ] **Step 1: README**

Run: `grep -n "26" README.md | grep -i "页\|page"` 定位所有页面数表述，把注册页面数从 26 改为 27（已知两处：mermaid 图 `Pages[26 个注册页面]`、目录树注释 `（26 页面）`；事实基线表格如还有"26"的页面数行一并改）。

- [ ] **Step 2: CLOUD_FUNCTIONS.md**

在 studentData 的 action 表格（`getHomeDashboard` 所在表）追加一行：

```markdown
| `getRepairMetrics` | `studentId` | `metrics`：验证覆盖率与严格修复率（分子/分母/百分比/小样本标记）、卡点去向四档、时间快照。纯只读聚合，不写集合 |
```

- [ ] **Step 3: PRD.md**

在 §10 状态表（`验证试卷出卷配置` 行附近）追加：

```markdown
| 学习修复指标页（验证覆盖率 + 严格修复率） | ✅ | `studentData.getRepairMetrics` 只读聚合 + `pages/repair-metrics`，数学限定，分母 <5 标注小样本 |
```

- [ ] **Step 4: CHANGELOG.md**

在 `[Unreleased]` 段追加新条目：

```markdown
### 2026-08-09 学习修复指标页：验证覆盖率与严格修复率

#### Added

- 新增 `pages/repair-metrics` 分包页：数学验证覆盖率与严格修复率双指标、卡点去向四档、时间快照；分母 <5 标注小样本。
- `studentData` 新增只读 action `getRepairMetrics`：从 subjectProfiles / learningResourcePacks / interventionSessions / microValidations 现算，不新增、不写入任何集合。
- 数学学科工作台与家庭工作台新增修复指标入口。
- 口径依据 `docs/superpowers/specs/2026-08-09-repair-metrics-and-case-validation-design.md`。
```

- [ ] **Step 5: Commit**

```bash
git add README.md docs/CLOUD_FUNCTIONS.md PRD.md CHANGELOG.md
git commit -m "docs: 修复指标页文档基线同步（27 页面 / action 表 / PRD / CHANGELOG）"
```

---

## Task 8: 案例验证线下材料（知识库，不入 Git）

**Files:**
- Create: `00-总项目知识库/03-产品商业与传播/案例验证招募说明-v0.1.md`
- Create: `00-总项目知识库/06-案例验证/案例记录模板-v0.1.md`

- [ ] **Step 1: 招募说明**

创建 `00-总项目知识库/03-产品商业与传播/案例验证招募说明-v0.1.md`：

```markdown
# 学习卡点诊断 · 案例验证招募说明

> 版本：v0.1 | 日期：2026-08-09 | 状态：ACTIVE
> 用途：熟人圈招募材料。包含一页介绍与微信消息模板。真实学生信息不进 GitHub。

## 一页介绍（可转发）

**我们在做什么**
一个微信小程序：家长拍孩子的试卷照片，AI 找出错题背后的具体学习卡点（不是"粗心"这种粗标签），
生成针对性的验证小卷，复测确认卡点是否真的修复了。

**邀请您做什么**
- 提供孩子 3 道真实错题（拍照即可，数学优先）
- 跟着小程序走一遍：诊断 → 看报告 → 做修复练习 → 复测
- 全程约 2 周，每天不超过 15 分钟

**您会得到什么**
- 一份孩子当前数学卡点的完整诊断报告（可下载 PDF）
- 针对每个卡点的验证卷和修复建议
- 免费使用（内测期不收费）

**隐私承诺**
- 照片和作答数据只用于您孩子的诊断
- 随时可在小程序内发起数据删除
- 对外案例展示一律匿名

## 微信招募消息模板

> 最近在做一个小学生学习诊断的小程序内测：拍试卷照片，AI 找出错题背后真正的卡点，
> 再出小卷复测验证有没有修好。想请 3-5 个家长帮忙试用，提供 3 道孩子的真实错题就行，
> 全程免费，报告归你，随时可删数据。有兴趣的回我一下～
```

- [ ] **Step 2: 案例记录模板**

创建 `00-总项目知识库/06-案例验证/案例记录模板-v0.1.md`：

```markdown
# 案例验证记录模板

> 版本：v0.1 | 日期：2026-08-09 | 状态：ACTIVE
> 隐私红线：本表只留本地，不入 Git。孩子用编号（C1/C2…），不写真名。
> 真名与编号对照单独记录在本地密码管理工具中，不落文档。

## 案例登记表

| 编号 | 年级 | 参与日期 | 错题数 | 识别卡点数 | 完成修复动作 | 复测通过数 | 备注 |
| --- | --- | --- | --- | --- | --- | --- | --- |
| C1 | | | | | | | |

## 单卡点记录（每个卡点一行）

| 案例 | 卡点（可读名） | 发现日期 | 修复动作 | 修复完成日期 | 复测方式 | 复测日期 | 复测结果 |
| --- | --- | --- | --- | --- | --- | --- | --- |
| C1 | | | 任务包/干预会话 | | 微验证/验证卷 | | 通过/未通过 |

## Go/No-Go 汇总（案例结束时填写）

- 累计进入验证流程的卡点记录数（目标 ≥10）：
- 严格修复率分母（完成修复动作的卡点数，目标 ≥5）：
- 严格修复率 = 修复后复测通过 / 完成修复动作：
- 验证覆盖率 = 有验证证据 / 全部卡点：
- 阈值对照：<30% 闭环可能无效；30-50% 方向有效；50-70% 价值明显；>70% 假设很强
- 结论（Go / No-Go / 延长验证）：
- 家长反馈要点：
```

- [ ] **Step 3: 知识库 VERSION_LOG 记录**

在 `00-总项目知识库/VERSION_LOG.md` 末尾追加：

```markdown
## v0.5.1 - 2026-08-09

案例验证波材料入库：

- 新增 `03-产品商业与传播/案例验证招募说明-v0.1.md`（一页介绍 + 微信招募模板，面向熟人圈）。
- 新增 `06-案例验证/案例记录模板-v0.1.md`（脱敏编号记录 + Go/No-Go 汇总表）。
- 小程序侧修复率指标页设计与实现见 `miniprogram-learning-diagnostic/docs/superpowers/specs/2026-08-09-repair-metrics-and-case-validation-design.md`。
```

- [ ] **Step 4: 验证**

Run: `ls "00-总项目知识库/03-产品商业与传播/案例验证招募说明-v0.1.md" "00-总项目知识库/06-案例验证/案例记录模板-v0.1.md"`
Expected: 两个文件存在（知识库不入 Git，无需 commit）

---

## Task 9: 最终验证与发布门禁

**Files:** 无新增

- [ ] **Step 1: 全量测试 + 语法检查**

Run: `npm run verify 2>&1 | tail -8`
Expected: 全部通过（用例数 = 1089 + 新增 13 个左右），`Checked 34X JavaScript files.` 无错误

- [ ] **Step 2: 覆盖率门禁**

Run: `npm run test:coverage 2>&1 | tail -8`
Expected: 行/函数覆盖率 ≥80%，全部通过

- [ ] **Step 3: 主包体积门禁**

Run: `npm run check:size 2>&1 | tail -3`
Expected: 主包 ≤1200KB（新页面在分包，不影响主包）

- [ ] **Step 4: 编码红线全仓检查**

Run: `node --test tests/user-facing-code-hygiene.test.js 2>&1 | tail -3`
Expected: PASS（新页面所有可见文本无内部编码）

- [ ] **Step 5: 推送**

```bash
git push origin main
```

---

## 验收标准（对应 spec）

1. `getRepairMetrics` 对无权限/缺参返回失败，对有权限返回双指标（Task 2 集成测试覆盖）
2. 双指标口径与 spec §2 完全一致：时间先后、微验证 ≥2/3、干预会话、improvedDate（Task 1 单测覆盖）
3. 四档分类互斥且覆盖全集（Task 1 单测覆盖）
4. 分母 <5 页面显示小样本提示（Task 3 presenter 测试 + Task 4 wxml）
5. 两个入口可达（Task 5/6 测试）
6. 页面不暴露 LP/BN 等内部编码（hygiene 测试）
7. 不新增任何集合（无建集合代码）
8. 知识库两份线下材料就位（Task 8）

// 验收测试：rebuildSubjectProfile 的 merge 语义 + 归档保护
//
// 验证修复的核心设计目标：
//   1. rebuildSubjectProfile 聚合所有有效报告的卡点（不再只取最新一份覆盖）
//   2. 多份报告的不同卡点都会保留（模拟 33 个卡点不丢失的场景）
//   3. 旧 currentBottlenecks 被归档到 archivedBottlenecks（不直接丢弃）
//   4. improvedBottlenecks 不再被写空（从 merge 结果派生）
//   5. 恢复脚本的 rebuildByReplay 逻辑正确

const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')

const { buildProfileSummary } = require('../cloudfunctions/analyzePhotos/profile-summary')

const ROOT = path.join(__dirname, '..')

// ============================================================
// 1. buildProfileSummary 的 merge 语义：多份报告累加不丢卡点
// ============================================================

test('merge 语义：第一份报告的 2 个卡点 + 第二份报告的 3 个卡点 = 5 个卡点', () => {
  let profile = { currentBottlenecks: [], pendingBottlenecks: [], improvedBottlenecks: [] }

  // 第一份报告：2 个卡点
  const report1 = {
    _id: 'r1', createdAt: '2026-06-01T10:00:00+08:00',
    bottlenecks: [
      { lpCode: 'LP-A', lpName: '卡点A', severity: 'high' },
      { lpCode: 'LP-B', lpName: '卡点B', severity: 'medium' },
    ]
  }
  const summary1 = buildProfileSummary(profile, report1, new Date('2026-06-01T10:00:00+08:00'))
  assert.ok(summary1.isEffective, '报告1应有效')
  profile = { ...profile, currentBottlenecks: summary1.currentBottlenecks }
  assert.equal(profile.currentBottlenecks.length, 2, '第一份后应有 2 个卡点')

  // 第二份报告：3 个卡点（1 个新的 + 2 个重复的）
  const report2 = {
    _id: 'r2', createdAt: '2026-06-10T10:00:00+08:00',
    bottlenecks: [
      { lpCode: 'LP-A', lpName: '卡点A', severity: 'high' },      // 重复
      { lpCode: 'LP-C', lpName: '卡点C', severity: 'low' },        // 新的
      { lpCode: 'LP-D', lpName: '卡点D', severity: 'medium' },     // 新的
    ]
  }
  const summary2 = buildProfileSummary(profile, report2, new Date('2026-06-10T10:00:00+08:00'))
  assert.ok(summary2.isEffective, '报告2应有效')
  profile = { ...profile, currentBottlenecks: summary2.currentBottlenecks }

  // 关键断言：4 个不重复卡点（A, B, C, D），不是只有最新报告的 3 个
  const codes = profile.currentBottlenecks.map(b => b.lpCode).sort()
  assert.deepEqual(codes, ['LP-A', 'LP-B', 'LP-C', 'LP-D'], 'merge 后应有 4 个不重复卡点')
})

test('merge 语义：模拟 33 个卡点场景——11 份报告各 3 个不同卡点 = 33 个', () => {
  let profile = { currentBottlenecks: [], pendingBottlenecks: [], improvedBottlenecks: [] }

  // 模拟 11 份报告，每份 3 个不同的卡点（共 33 个）
  for (let i = 0; i < 11; i++) {
    const report = {
      _id: `r${i}`,
      createdAt: `2026-0${(i % 5) + 1}-${(i % 28) + 1}T10:00:00+08:00`,
      bottlenecks: [
        { lpCode: `LP-${i * 3}`, lpName: `卡点${i * 3}`, severity: 'high' },
        { lpCode: `LP-${i * 3 + 1}`, lpName: `卡点${i * 3 + 1}`, severity: 'medium' },
        { lpCode: `LP-${i * 3 + 2}`, lpName: `卡点${i * 3 + 2}`, severity: 'low' },
      ]
    }
    const summary = buildProfileSummary(profile, report, new Date(report.createdAt))
    if (summary.isEffective) {
      profile = { ...profile, currentBottlenecks: summary.currentBottlenecks }
    }
  }

  assert.equal(profile.currentBottlenecks.length, 33, '11 份报告 × 3 个不同卡点 = 33 个卡点，全部保留')
})

test('merge 语义：无效报告不缩水已有卡点', () => {
  // profile 已有 5 个卡点
  const profile = {
    currentBottlenecks: Array.from({ length: 5 }, (_, i) => ({
      lpCode: `LP-${i}`, lpName: `卡点${i}`, status: 'needs_verification', weight: 50,
    })),
  }
  // 一份无效报告（无 bottlenecks）
  const invalidReport = { _id: 'r-invalid', createdAt: '2026-06-15T10:00:00+08:00', bottlenecks: [] }
  const summary = buildProfileSummary(profile, invalidReport, new Date('2026-06-15T10:00:00+08:00'))

  assert.equal(summary.isEffective, false, '无卡点的报告应判定为无效')
  assert.equal(summary.currentBottlenecks.length, 5, '无效报告不应缩水已有卡点')
})

// ============================================================
// 2. rebuildSubjectProfile 改为 merge（静态校验源码）
// ============================================================

test('reanalyzeMathHistory/index.js 的 rebuildSubjectProfile 不再只取 latest 覆盖', () => {
  const source = fs.readFileSync(path.join(ROOT, 'cloudfunctions/reanalyzeMathHistory/index.js'), 'utf8')
  // 提取 rebuildSubjectProfile 函数体
  const fnMatch = source.match(/async function rebuildSubjectProfile[\s\S]*?\nasync function /)
  assert.ok(fnMatch, 'rebuildSubjectProfile 函数必须存在')
  const body = fnMatch[0]

  // 不应再有"只取最新一份"的覆盖逻辑
  assert.ok(!/sort\(\(a,\s*b\)\s*=>\s*timeOf\(b\)\s*-\s*timeOf\(a\)\)\[0\]/.test(body),
    '不应再只取最新一份报告（sort desc [0]）')

  // 应该有 merge 回放逻辑
  assert.match(body, /buildProfileSummary/, '应该用 buildProfileSummary 做 merge')
  assert.match(body, /timeOf\(a\)\s*-\s*timeOf\(b\)/, '应该按时间正序回放（sort asc）')

  // 应该有 archivedBottlenecks 归档保护
  assert.match(body, /archivedBottlenecks/, '应该把旧卡点归档到 archivedBottlenecks')

  // improvedBottlenecks 在 patch 里不再写空，而是从 merge 结果派生
  // 注意：mergedProfile 初始值里可以有 []，但 patch 里的 improvedBottlenecks 必须是派生的
  const patchMatch = body.match(/const patch = \{[\s\S]*?\}/)
  assert.ok(patchMatch, '必须有 patch 对象')
  assert.ok(!/improvedBottlenecks:\s*\[\s*\]/.test(patchMatch[0]),
    'patch 里不应再写死 improvedBottlenecks: []，应从 merge 结果派生')
  assert.match(patchMatch[0], /improvedBottlenecks,/, 'patch 的 improvedBottlenecks 应该是变量引用（从 merge 派生）')
})

test('reanalyzeMathHistory 目录下有 profile-summary.js 副本', () => {
  const exists = fs.existsSync(path.join(ROOT, 'cloudfunctions/reanalyzeMathHistory/profile-summary.js'))
  assert.ok(exists, 'reanalyzeMathHistory 目录下必须有 profile-summary.js（云函数 require 依赖）')
})

// ============================================================
// 3. 恢复脚本的 rebuildByReplay 逻辑（静态校验）
// ============================================================

test('restore-profile-from-reports.js 有 rebuildByReplay 回放逻辑', () => {
  const source = fs.readFileSync(path.join(ROOT, 'scripts/restore-profile-from-reports.js'), 'utf8')
  assert.match(source, /function rebuildByReplay/, '必须有 rebuildByReplay 函数')
  assert.match(source, /buildProfileSummary/, '必须用 buildProfileSummary 做 merge')
  assert.match(source, /archivedBottlenecks/, '写入时必须归档旧卡点')
  assert.match(source, /--dry-run|--apply/, '必须支持 dry-run 和 apply 两种模式')
})

// ============================================================
// 4. 恢复脚本的回放逻辑单元测试（复用 buildProfileSummary）
// ============================================================

test('rebuildByReplay 从空 profile 回放 3 份报告得到 6 个不重复卡点', () => {
  // 模拟 restore 脚本的 rebuildByReplay 核心逻辑
  function rebuildByReplay(reports) {
    let profile = { currentBottlenecks: [], pendingBottlenecks: [], improvedBottlenecks: [] }
    for (const report of reports) {
      const reportTime = report.createdAt ? new Date(report.createdAt) : new Date()
      const summary = buildProfileSummary(profile, report, reportTime)
      if (summary.isEffective) {
        profile = { ...profile, currentBottlenecks: summary.currentBottlenecks }
      }
    }
    return profile
  }

  const reports = [
    {
      _id: 'r1', createdAt: '2026-06-01T10:00:00+08:00',
      bottlenecks: [
        { lpCode: 'LP-1', lpName: '卡点1' },
        { lpCode: 'LP-2', lpName: '卡点2' },
      ]
    },
    {
      _id: 'r2', createdAt: '2026-06-05T10:00:00+08:00',
      bottlenecks: [
        { lpCode: 'LP-3', lpName: '卡点3' },
        { lpCode: 'LP-4', lpName: '卡点4' },
      ]
    },
    {
      _id: 'r3', createdAt: '2026-06-10T10:00:00+08:00',
      bottlenecks: [
        { lpCode: 'LP-5', lpName: '卡点5' },
        { lpCode: 'LP-6', lpName: '卡点6' },
      ]
    },
  ]

  const result = rebuildByReplay(reports)
  assert.equal(result.currentBottlenecks.length, 6, '3 份报告 × 2 个不同卡点 = 6 个，全部保留')

  // 模拟旧逻辑（只取最新一份）会得到什么
  const latestOnly = reports[reports.length - 1].bottlenecks
  assert.equal(latestOnly.length, 2, '旧逻辑只取最新报告 = 2 个（这就是 33→2 的原因）')
})

test('rebuildByReplay 跳过无效报告但保留有效报告的卡点', () => {
  function rebuildByReplay(reports) {
    let profile = { currentBottlenecks: [], pendingBottlenecks: [], improvedBottlenecks: [] }
    for (const report of reports) {
      const reportTime = report.createdAt ? new Date(report.createdAt) : new Date()
      const summary = buildProfileSummary(profile, report, reportTime)
      if (summary.isEffective) {
        profile = { ...profile, currentBottlenecks: summary.currentBottlenecks }
      }
    }
    return profile
  }

  const reports = [
    { _id: 'r1', createdAt: '2026-06-01T10:00:00+08:00', bottlenecks: [{ lpCode: 'LP-A', lpName: 'A' }] },
    { _id: 'r2', createdAt: '2026-06-05T10:00:00+08:00', bottlenecks: [] }, // 无效（空）
    { _id: 'r3', createdAt: '2026-06-10T10:00:00+08:00', bottlenecks: [{ lpCode: 'LP-B', lpName: 'B' }] },
  ]

  const result = rebuildByReplay(reports)
  assert.equal(result.currentBottlenecks.length, 2, '跳过无效报告，保留 2 个有效卡点')
})

// ============================================================
// 5. 归档保护：覆盖写之前先存档
// ============================================================

test('rebuildSubjectProfile 返回值包含归档统计（archivedCount）', () => {
  const source = fs.readFileSync(path.join(ROOT, 'cloudfunctions/reanalyzeMathHistory/index.js'), 'utf8')
  const fnMatch = source.match(/async function rebuildSubjectProfile[\s\S]*?\nasync function /)
  const body = fnMatch[0]
  // 返回值应包含归档统计
  assert.match(body, /archivedCount/, '返回值应包含 archivedCount')
  assert.match(body, /replayedReportCount/, '返回值应包含 replayedReportCount（回放了多少份报告）')
})

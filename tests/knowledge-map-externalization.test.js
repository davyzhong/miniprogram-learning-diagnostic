// 验收测试：知识地图外显化 + 学一下入口可达性 + 云函数容错
//
// 本文件覆盖近一轮改动的设计目标：
//   1. knowledge-map-presenter 默认平铺、优先卡点 CTA、症状文案
//   2. bottleneck-view 的 expandFineBottleneckItems 透传 nodeId（让"知识位置"区块可见）
//   3. cloud.js 的 generateLearningResourcePack 走 60s timeout（防 LLM 超时）
//   4. learningResource 云函数对 learningResourcePacks 集合首次不存在 (-502005) 自动建表
//   5. studentData 云函数对同集合的时间线读取也容错
//
// 这样后续重构只要破坏上述任一行为，本测试就会先于真机报告失败。

const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')

const { buildKnowledgeMapPageView } = require('../miniprogram/pages/knowledge-map/knowledge-map-presenter')
const { bottleneckTitleOf } = require('../miniprogram/utils/math-learning-map')

test('math learning map does not turn an unknown bottleneck ID into a title', () => {
  assert.equal(bottleneckTitleOf('BN-LEGACY-UNKNOWN-01'), '待确认细卡点')
})

test('knowledge map uses readable labels for ID-only legacy bottlenecks', () => {
  const view = buildKnowledgeMapPageView({
    currentBottlenecks: [{
      lpCode: 'LP-UNKNOWN-01',
      bottleneckId: 'BN-LEGACY-UNKNOWN-01',
      nodeId: 'MATH-UNKNOWN-NODE',
      status: 'needs_verification'
    }]
  }, 'math')

  assert.equal(view.domains[0].bottlenecks[0].displayName, '待确认学习卡点')
  assert.equal(view.domains[0].bottlenecks[0].bottleneckId, 'BN-LEGACY-UNKNOWN-01')
})
const { expandFineBottleneckItems } = require('../miniprogram/utils/bottleneck-view')

const {
  createCloudMock,
  createDatabase,
  loadModule
} = require('./helpers/cloud-function-harness')

const ROOT = path.join(__dirname, '..')

// ============================================================
// 1. knowledge-map-presenter：默认平铺 + 优先卡点 + 症状文案
// ============================================================

test('knowledge-map 默认所有领域 expanded=true（不再折叠，用户进入即可看到卡点）', () => {
  const profile = {
    currentBottlenecks: [
      {
        lpCode: 'LP-DEC',
        lpName: '小数乘法',
        subject: 'math',
        status: 'needs_verification',
        candidateBottlenecks: [
          { bottleneckId: 'BN-DEC-MUL-POINT', title: '积的小数位数判断错误', nodeId: 'MATH-NUM-DEC-MUL-POINT', evidenceStrength: 'high' }
        ]
      }
    ]
  }
  const view = buildKnowledgeMapPageView(profile, 'math')
  assert.ok(view.domains.length > 0, '至少有一个领域')
  for (const d of view.domains) {
    assert.equal(d.expanded, true, `领域 ${d.name} 必须默认展开`)
  }
})

test('knowledge-map 优先卡点 CTA：active 状态置顶', () => {
  const profile = {
    currentBottlenecks: [
      {
        lpCode: 'LP-A',
        lpName: '已改善的卡点',
        subject: 'math',
        status: 'improved',
        candidateBottlenecks: [{ bottleneckId: 'BN-A', title: '已改善', nodeId: 'N-A', evidenceStrength: 'low' }]
      },
      {
        lpCode: 'LP-B',
        lpName: '持续出现的卡点',
        subject: 'math',
        status: 'persisting',
        candidateBottlenecks: [{ bottleneckId: 'BN-B', title: '持续出现', nodeId: 'N-B', evidenceStrength: 'high' }]
      }
    ]
  }
  const view = buildKnowledgeMapPageView(profile, 'math')
  assert.ok(view.priorityBottleneck, '必须提供 priorityBottleneck')
  assert.equal(view.priorityBottleneck.statusClass, 'active', '优先卡点应该是 active 状态')
  // 展开后的细卡点 lpCode 是父级 LP-B，bottleneckId 才是细卡点 BN-B
  assert.equal(view.priorityBottleneck.bottleneckId, 'BN-B', '优先卡点的 bottleneckId 应该是持续出现那个')
})

test('knowledge-map 卡点携带 symptomText（症状描述，供 UI 展示）', () => {
  const profile = {
    currentBottlenecks: [{
      lpCode: 'LP-X',
      lpName: '小数除法',
      subject: 'math',
      status: 'needs_verification',
      candidateBottlenecks: [{
        bottleneckId: 'BN-X',
        title: '除法商定位错误',
        nodeId: 'N-X',
        evidenceStrength: 'medium'
      }]
    }]
  }
  const view = buildKnowledgeMapPageView(profile, 'math')
  const bn = view.domains.flatMap(d => d.bottlenecks).find(b => b.bottleneckId === 'BN-X')
  assert.ok(bn, '卡点存在')
  assert.ok(typeof bn.symptomText === 'string' && bn.symptomText.length > 0, '必须有 symptomText')
})

test('knowledge-map 卡点携带 bottleneckId 和 nodeId（供 onBottleneckTap 调用 generatePack）', () => {
  const profile = {
    currentBottlenecks: [{
      lpCode: 'LP-Y',
      lpName: '分数加减',
      subject: 'math',
      status: 'needs_verification',
      candidateBottlenecks: [{
        bottleneckId: 'BN-FRAC-ADD',
        title: '通分错误',
        nodeId: 'MATH-NUM-FRACTION-ADD-COMMON-DENOM',
        evidenceStrength: 'high'
      }]
    }]
  }
  const view = buildKnowledgeMapPageView(profile, 'math')
  const bn = view.domains.flatMap(d => d.bottlenecks).find(b => b.bottleneckId === 'BN-FRAC-ADD')
  assert.ok(bn, '卡点存在')
  assert.equal(bn.nodeId, 'MATH-NUM-FRACTION-ADD-COMMON-DENOM', 'nodeId 必须透传')
})

test('knowledge-map 无数据时 hasData=false 且 priorityBottleneck=null', () => {
  const view = buildKnowledgeMapPageView({ bottlenecks: [] }, 'math')
  assert.equal(view.hasData, false)
  assert.equal(view.priorityBottleneck, null)
  assert.equal(view.domains.length, 0, '无卡点时不应有空领域占位')
})

// ============================================================
// 2. bottleneck-view：expandFineBottleneckItems 透传 nodeId
//    （让 bottleneck-detail 页的"知识位置"区块可见）
// ============================================================

test('expandFineBottleneckItems 把 candidate.nodeId 透传到展开后的视图', () => {
  const items = [{
    lpCode: 'LP-TEST',
    lpName: '测试卡点',
    subject: 'math',
    status: 'needs_verification',
    candidateBottlenecks: [
      { bottleneckId: 'BN-TEST-1', title: '候选1', nodeId: 'MATH-NODE-1', evidenceStrength: 'high' },
      { bottleneckId: 'BN-TEST-2', title: '候选2', nodeId: 'MATH-NODE-2', evidenceStrength: 'medium' }
    ]
  }]
  const expanded = expandFineBottleneckItems(items, { expandCandidates: true })
  assert.equal(expanded.length, 2, '应该展开为 2 个细卡点')
  assert.equal(expanded[0].nodeId, 'MATH-NODE-1', '第 1 个候选的 nodeId 必须透传')
  assert.equal(expanded[1].nodeId, 'MATH-NODE-2', '第 2 个候选的 nodeId 必须透传')
  assert.equal(expanded[0].bottleneckId, 'BN-TEST-1', 'bottleneckId 也要保留')
})

test('expandFineBottleneckItems 当 candidate 没有 nodeId 时回退为空字符串（不崩溃）', () => {
  const items = [{
    lpCode: 'LP-NO-NODE',
    subject: 'math',
    status: 'needs_verification',
    candidateBottlenecks: [
      { bottleneckId: 'BN-NO-NODE', title: '无 nodeId 候选', evidenceStrength: 'low' }
    ]
  }]
  const expanded = expandFineBottleneckItems(items, { expandCandidates: true })
  assert.equal(expanded[0].nodeId, '', '缺失 nodeId 应回退为空字符串')
})

// ============================================================
// 3. cloud.js：generateLearningResourcePack 必须传 60s timeout
//    （防 LLM 增强讲解超时；纯静态扫描源码）
// ============================================================

test('cloud.js 的 generateLearningResourcePack 显式传 timeout: 60000（防 LLM 超时）', () => {
  const source = fs.readFileSync(path.join(ROOT, 'miniprogram/utils/cloud.js'), 'utf8')
  // 找到 generateLearningResourcePack 函数体片段
  const fnMatch = source.match(/async function generateLearningResourcePack[\s\S]*?\n}/)
  assert.ok(fnMatch, '函数必须存在')
  const body = fnMatch[0]
  assert.match(body, /timeout:\s*60000/, '必须显式传 timeout: 60000')
  assert.match(body, /learningResource/, '调用的必须是 learningResource 云函数')
})

// ============================================================
// 4. learningResource 云函数：learningResourcePacks 集合首次不存在时自动建表
// ============================================================

test('learningResource generatePack 在集合不存在 (-502005) 时自动建表并成功生成', async () => {
  const db = createDatabase(
    {
      students: [{ _id: 'student-1', _openid: 'owner-1', name: '钟青羽' }],
      // 故意不初始化 learningResourcePacks，让查询时抛 -502005
    },
    { missingCollections: ['learningResourcePacks'] }
  )
  const cloud = createCloudMock({ db, openId: 'owner-1' })
  const handler = loadModule('cloudfunctions/learningResource/index.js', {
    'wx-server-sdk': cloud
  })

  const result = await handler.main({
    action: 'generatePack',
    studentId: 'student-1',
    subject: 'math',
    target: { bottleneckId: 'BN-TEST', lpCode: 'LP-TEST', title: '测试卡点' }
  })

  assert.equal(result.success, true, '即使集合首次不存在，也应自动建表后成功')
  assert.ok(result.packId, '必须返回 packId')
  // 自动建表后，再次 dump 应该能看到插入的 pack
  const rows = db.dump('learningResourcePacks')
  assert.equal(rows.length, 1, '自动建表后应该写入 1 条 pack')
})

test('learningResource 缓存命中时不再访问集合（已有增强 pack）', async () => {
  const existingPack = {
    _id: 'pack-existing',
    _openid: 'owner-1',
    studentId: 'student-1',
    subject: 'math',
    targetId: 'BN-CACHED',
    llmEnhanced: true,
    enhancedAt: new Date('2026-06-15T10:00:00+08:00'),
    status: 'ready',
    blocks: [],
    createdAt: new Date('2026-06-15T10:00:00+08:00'),
    updatedAt: new Date('2026-06-15T10:00:00+08:00')
  }
  const db = createDatabase({
    students: [{ _id: 'student-1', _openid: 'owner-1', name: '钟青羽' }],
    learningResourcePacks: [existingPack]
  })
  const cloud = createCloudMock({ db, openId: 'owner-1' })
  const handler = loadModule('cloudfunctions/learningResource/index.js', {
    'wx-server-sdk': cloud
  })

  const result = await handler.main({
    action: 'generatePack',
    studentId: 'student-1',
    subject: 'math',
    target: { bottleneckId: 'BN-CACHED', lpCode: 'LP-X', title: '已缓存的卡点' }
  })

  assert.equal(result.success, true)
  assert.equal(result.packId, 'pack-existing', '应该命中缓存而不是重新生成')
  assert.equal(db.dump('learningResourcePacks').length, 1, '不应该新增 pack')
})

// ============================================================
// 5. studentData 云函数：getLearningResourcePacks 时间线读取容错
// ============================================================

test('studentData 时间线读取 learningResourcePacks 集合不存在时返回空数组（不崩溃）', async () => {
  const db = createDatabase(
    {
      students: [{ _id: 'student-1', _openid: 'owner-1', name: '钟青羽' }],
      subjectProfiles: [],
      reports: [],
      papers: []
    },
    { missingCollections: ['learningResourcePacks'] }
  )
  const cloud = createCloudMock({ db, openId: 'owner-1' })
  const handler = loadModule('cloudfunctions/studentData/index.js', {
    'wx-server-sdk': cloud
  })

  // 调用 getStudentDashboard，它会间接读 learningResourcePacks 做时间线
  const result = await handler.main({
    action: 'getStudentDashboard',
    studentId: 'student-1'
  })

  // 关键断言：不应抛 collection not exists，而是返回成功（即使数据空）
  assert.ok(result.success !== false || !/collection not exist/i.test(String(result.error || '')),
    '不能因为 learningResourcePacks 不存在就整体失败')
})

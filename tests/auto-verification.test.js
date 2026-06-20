const test = require('node:test')
const assert = require('node:assert/strict')
const {
  createCloudMock,
  createDatabase,
  loadModule
} = require('./helpers/cloud-function-harness')

const { extractFineBottlenecks, extractPendingTargets, supersedeOldPapers } = require('../cloudfunctions/analyzePhotos/auto-verification')

// ========== extractFineBottlenecks 单元测试 ==========

test('extractFineBottlenecks 展开粗卡点的 candidateBottlenecks', () => {
  const profile = {
    pendingBottlenecks: [
      { lpCode: 'LP-FD', lpName: '分数小数', severity: 'high', candidateBottlenecks: [
        { bottleneckId: 'BN-FD-1', title: '通分错误', evidenceStrength: 'high' },
        { bottleneckId: 'BN-FD-2', title: '小数点错误', evidenceStrength: 'medium' },
      ]},
      { lpCode: 'LP-RP', lpName: '比例', severity: 'medium', candidateBottlenecks: [
        { bottleneckId: 'BN-RP-1', title: '交叉相乘', evidenceStrength: 'high' },
      ]},
    ],
  }
  const fine = extractFineBottlenecks(profile)
  assert.equal(fine.length, 3)
  // 按 weight 降序排：BN-FD-1(high→85)、BN-RP-1(high→85) 同权重保持原序，BN-FD-2(medium→60) 最后
  assert.deepEqual(fine.map(f => f.bottleneckId), ['BN-FD-1', 'BN-RP-1', 'BN-FD-2'])
  assert.equal(fine[0].weight, 85)  // high evidenceStrength → weight 85
})

test('extractFineBottlenecks 去重', () => {
  const profile = {
    pendingBottlenecks: [
      { lpCode: 'LP-FD', lpName: '分数', severity: 'high', candidateBottlenecks: [
        { bottleneckId: 'BN-1', title: '卡点1' },
      ]},
      { lpCode: 'LP-RP', lpName: '比例', severity: 'medium', candidateBottlenecks: [
        { bottleneckId: 'BN-1', title: '卡点1' }, // 重复
        { bottleneckId: 'BN-2', title: '卡点2' },
      ]},
    ],
  }
  const fine = extractFineBottlenecks(profile)
  assert.equal(fine.length, 2) // BN-1 去重
})

test('extractFineBottlenecks 空 profile 返回空数组', () => {
  assert.deepEqual(extractFineBottlenecks({}), [])
  assert.deepEqual(extractFineBottlenecks({ pendingBottlenecks: [] }), [])
  assert.deepEqual(extractFineBottlenecks(null), [])
})

test('extractFineBottlenecks 不再限制数量（覆盖全量细分卡点）', () => {
  const profile = {
    pendingBottlenecks: [{
      lpCode: 'LP-FD', severity: 'high',
      candidateBottlenecks: Array.from({ length: 15 }, (_, i) => ({ bottleneckId: `BN-${i}`, title: `卡点${i}` })),
    }],
  }
  const fine = extractFineBottlenecks(profile)
  assert.equal(fine.length, 15, '15 个细分卡点应全部保留，不再截断到 10')
})

test('extractFineBottlenecks 无 candidateBottlenecks 时用粗卡点 fallback', () => {
  const profile = {
    pendingBottlenecks: [
      { lpCode: 'LP-FD', lpName: '分数小数', severity: 'high' },
    ],
  }
  const fine = extractFineBottlenecks(profile)
  assert.equal(fine.length, 1)
  assert.equal(fine[0].bottleneckId, 'LP-FD')
  assert.equal(fine[0].coarse, true)
})

test('extractPendingTargets 返回 bottleneckId 数组', () => {
  const profile = {
    pendingBottlenecks: [
      { lpCode: 'LP-FD', severity: 'high', candidateBottlenecks: [
        { bottleneckId: 'BN-1', title: '卡点1' },
      ]},
    ],
  }
  const targets = extractPendingTargets(profile)
  assert.deepEqual(targets, ['BN-1'])
})

// ========== supersedeOldPapers 单元测试 ==========

test('supersedeOldPapers 覆盖未验证的旧卷', async () => {
  const db = createDatabase({
    papers: [
      { _id: 'paper-old-1', studentId: 's1', subject: 'math', type: 'verification', generationStatus: 'ready' },
      { _id: 'paper-old-2', studentId: 's1', subject: 'math', type: 'verification', generationStatus: 'ready' },
    ],
    reports: [], // 无验证报告，说明旧卷未验证
  })

  const count = await supersedeOldPapers(db, 's1', 'math', 'report-new')
  assert.equal(count, 2)

  const papers = db.dump('papers')
  assert.equal(papers[0].generationStatus, 'superseded')
  assert.equal(papers[1].generationStatus, 'superseded')
  assert.ok(papers[0].supersededBy === 'report-new')
})

test('supersedeOldPapers 不覆盖已有验证报告的旧卷', async () => {
  const db = createDatabase({
    papers: [
      { _id: 'paper-verified', studentId: 's1', subject: 'math', type: 'verification', generationStatus: 'ready' },
      { _id: 'paper-pending', studentId: 's1', subject: 'math', type: 'verification', generationStatus: 'ready' },
    ],
    reports: [
      { _id: 'r1', studentId: 's1', subject: 'math', type: 'verification', paperId: 'paper-verified' },
    ],
  })

  const count = await supersedeOldPapers(db, 's1', 'math', 'report-new')
  assert.equal(count, 1) // 只覆盖 paper-pending

  const papers = db.dump('papers')
  const verified = papers.find(p => p._id === 'paper-verified')
  const pending = papers.find(p => p._id === 'paper-pending')
  assert.notEqual(verified.generationStatus, 'superseded') // 已验证的不覆盖
  assert.equal(pending.generationStatus, 'superseded')     // 未验证的覆盖
})

test('supersedeOldPapers 不覆盖已 superseded 的卷', async () => {
  const db = createDatabase({
    papers: [
      { _id: 'p1', studentId: 's1', subject: 'math', type: 'verification', generationStatus: 'superseded' },
    ],
    reports: [],
  })

  const count = await supersedeOldPapers(db, 's1', 'math', 'report-new')
  assert.equal(count, 0) // 已 superseded 的跳过
})

// ========== studentData getActiveVerificationPaper 集成测试 ==========

function loadStudentData(db) {
  const cloud = createCloudMock({ db })
  return loadModule('cloudfunctions/studentData/index.js', { 'wx-server-sdk': cloud })
}

test('getActiveVerificationPaper 返回 ready 状态', async () => {
  const db = createDatabase({
    students: [{ _id: 's1', _openid: 'owner-1', name: '钟青羽' }],
    papers: [
      { _id: 'p1', studentId: 's1', subject: 'math', type: 'verification', generationStatus: 'ready', pdfFileId: 'cloud://test.pdf', createdAt: new Date() },
    ],
    reports: [],
  })
  const handler = loadStudentData(db)
  const result = await handler.main({ action: 'getActiveVerificationPaper', studentId: 's1', subject: 'math' })
  assert.equal(result.success, true)
  assert.equal(result.status, 'ready')
  assert.ok(result.paper)
  assert.equal(result.paper._id, 'p1')
})

test('getActiveVerificationPaper 返回 generating 状态', async () => {
  const db = createDatabase({
    students: [{ _id: 's1', _openid: 'owner-1', name: '钟青羽' }],
    papers: [
      { _id: 'p1', studentId: 's1', subject: 'math', type: 'verification', generationStatus: 'generating', createdAt: new Date() },
    ],
    reports: [],
  })
  const handler = loadStudentData(db)
  const result = await handler.main({ action: 'getActiveVerificationPaper', studentId: 's1', subject: 'math' })
  assert.equal(result.status, 'generating')
})

test('getActiveVerificationPaper 返回 none 状态（无任何卷）', async () => {
  const db = createDatabase({
    students: [{ _id: 's1', _openid: 'owner-1', name: '钟青羽' }],
    papers: [],
    reports: [],
  })
  const handler = loadStudentData(db)
  const result = await handler.main({ action: 'getActiveVerificationPaper', studentId: 's1', subject: 'math' })
  assert.equal(result.status, 'none')
  assert.equal(result.paper, null)
})

// ========== generatePaper _autoPaperId 模式测试 ==========

test('generatePaper with _autoPaperId updates existing paper record', async () => {
  const questions = Array.from({ length: 3 }, (_, i) => ({
    index: i + 1, content: `题${i + 1}`, answer: String(i + 1), points: 10, lpCode: 'LP-001', lpName: '计算'
  }))
  const db = createDatabase({
    students: [{ _id: 's1', _openid: 'owner-1', name: '钟青羽', grade: 6 }],
    subjectProfiles: [{ _id: 'p1', studentId: 's1', subject: 'math', pendingBottlenecks: [{ lpCode: 'LP-001', lpName: '计算' }] }],
    papers: [
      { _id: 'auto-paper-1', studentId: 's1', subject: 'math', type: 'verification', generationStatus: 'generating', createdAt: new Date() },
    ],
  })
  const tcbMock = {
    init: () => ({
      ai: () => ({
        createModel: () => ({
          generateText: async () => ({ text: JSON.stringify({ title: '验证卷', questions }) }),
        }),
      }),
    }),
  }
  const handler = loadModule('cloudfunctions/generatePaper/index.js', {
    'wx-server-sdk': createCloudMock({ db }),
    '@cloudbase/node-sdk': tcbMock,
    './pdf-renderer': { generatePDF: async () => ({ buffer: Buffer.from('pdf'), studentPages: 1, answerPages: 1, totalPages: 2 }) },
  })

  const result = await handler.main({
    studentId: 's1', subject: 'math', type: 'verification', targets: ['LP-001'], _autoPaperId: 'auto-paper-1',
  })
  assert.equal(result.success, true)
  assert.equal(result.paperId, 'auto-paper-1') // 返回的是已有记录 ID

  const papers = db.dump('papers')
  const updated = papers.find(p => p._id === 'auto-paper-1')
  assert.ok(updated)
  assert.equal(updated.generationStatus, 'ready') // 状态更新为 ready
  assert.ok(updated.pdfFileId)                     // PDF 已生成
  assert.ok((updated.questions || []).length > 0)  // 题目已填充
})

// === 验收：extractFineBottlenecks 覆盖全量细分卡点（BN）===

test('extractFineBottlenecks 从 currentBottlenecks 展开全量细分卡点', () => {
  // 模拟实际 profile：currentBottlenecks 有 3 个粗卡点，共 8 个细分卡点
  const profile = {
    currentBottlenecks: [
      {
        lpCode: 'LP-001', lpName: '计算错误', severity: 'high',
        candidateBottlenecks: [
          { bottleneckId: 'BN-DEC-MUL-POINT', title: '小数位数' },
          { bottleneckId: 'BN-DEC-DIV-MOVE', title: '小数点移动' },
          { bottleneckId: 'BN-FRAC-DIV-RECIP', title: '分数除法倒数' },
        ]
      },
      {
        lpCode: 'LP-002', lpName: '分数运算', severity: 'medium',
        candidateBottlenecks: [
          { bottleneckId: 'BN-FRAC-ADD-COMMON', title: '通分错误' },
          { bottleneckId: 'BN-FRAC-SUB-ERROR', title: '减法通分' },
        ]
      },
      {
        lpCode: 'LP-003', lpName: '单位换算', severity: 'low',
        candidateBottlenecks: [
          { bottleneckId: 'BN-LENGTH-M-CM', title: '米厘米换算' },
          { bottleneckId: 'BN-AREA-UNIT', title: '面积单位' },
          { bottleneckId: 'BN-UNIT-TIME', title: '时间换算' },
        ]
      },
    ],
  }
  const fine = extractFineBottlenecks(profile)
  assert.equal(fine.length, 8, '应展开出全部 8 个细分卡点')
  // 每个 fine item 都有 bottleneckId、title、lpCode
  for (const item of fine) {
    assert.ok(item.bottleneckId, '必须有 bottleneckId')
    assert.ok(item.title, '必须有 title')
    assert.ok(item.lpCode, '必须有 lpCode（父级粗卡点）')
  }
})

test('extractFineBottlenecks 同时读 pendingBottlenecks 和 currentBottlenecks（去重）', () => {
  const profile = {
    pendingBottlenecks: [
      { lpCode: 'LP-001', severity: 'high', candidateBottlenecks: [{ bottleneckId: 'BN-A', title: 'A' }] },
    ],
    currentBottlenecks: [
      { lpCode: 'LP-001', severity: 'high', candidateBottlenecks: [
        { bottleneckId: 'BN-A', title: 'A' }, // 重复
        { bottleneckId: 'BN-B', title: 'B' }, // 新的
      ]},
      { lpCode: 'LP-002', severity: 'medium', candidateBottlenecks: [{ bottleneckId: 'BN-C', title: 'C' }] },
    ],
  }
  const fine = extractFineBottlenecks(profile)
  assert.equal(fine.length, 3, 'BN-A/B/C 三个不重复的细分卡点')
  const ids = fine.map(f => f.bottleneckId).sort()
  assert.deepEqual(ids, ['BN-A', 'BN-B', 'BN-C'])
})

test('extractFineBottlenecks 模拟实际数据：8 个粗卡点 → 39 个细分卡点', () => {
  // 用接近实际的数据量测试
  const coarse = [
    { lp: 'LP-001', fine: 10 }, { lp: 'LP-002', fine: 7 },
    { lp: 'LP-004', fine: 10 }, { lp: 'LP-006', fine: 8 },
    { lp: 'LP-003', fine: 1 }, { lp: 'LP-005', fine: 1 },
    { lp: 'LP-008', fine: 0 }, { lp: 'LP-010', fine: 0 },
  ]
  const profile = {
    currentBottlenecks: coarse.map(c => ({
      lpCode: c.lp, lpName: c.lp, severity: 'high',
      candidateBottlenecks: Array.from({ length: c.fine }, (_, i) => ({
        bottleneckId: `BN-${c.lp}-${i}`, title: `细分${i}`
      })),
    })),
  }
  const fine = extractFineBottlenecks(profile)
  const expectedTotal = coarse.reduce((s, c) => s + c.fine, 0) // 10+7+10+8+1+1+0+0 = 37
  // 加上 2 个无 candidate 的粗卡点 fallback = 37 + 2 = 39
  assert.equal(fine.length, expectedTotal + 2, '37 个细分 + 2 个无 candidate 的粗卡点 fallback = 39')
})

const test = require('node:test')
const assert = require('node:assert/strict')
const {
  createCloudMock,
  createDatabase,
  loadModule
} = require('./helpers/cloud-function-harness')

const { extractPendingTargets, supersedeOldPapers } = require('../cloudfunctions/analyzePhotos/auto-verification')

// ========== extractPendingTargets 单元测试 ==========

test('extractPendingTargets 从 profile 提取卡点代码', () => {
  const profile = {
    pendingBottlenecks: [
      { lpCode: 'LP-001', lpName: '计算错误' },
      { lpCode: 'LP-008', lpName: '审题理解', candidateBottlenecks: [{ bottleneckId: 'BN-FINE-1' }] },
    ],
  }
  const targets = extractPendingTargets(profile)
  assert.deepEqual(targets, ['LP-001', 'LP-008', 'BN-FINE-1'])
})

test('extractPendingTargets 去重', () => {
  const profile = {
    pendingBottlenecks: [
      { lpCode: 'LP-001' },
      { lpCode: 'LP-001' }, // 重复
      { lpCode: 'LP-002', candidateBottlenecks: [{ bottleneckId: 'LP-001' }] }, // 重复
    ],
  }
  const targets = extractPendingTargets(profile)
  assert.deepEqual(targets, ['LP-001', 'LP-002'])
})

test('extractPendingTargets 空返回空数组', () => {
  assert.deepEqual(extractPendingTargets({}), [])
  assert.deepEqual(extractPendingTargets({ pendingBottlenecks: [] }), [])
  assert.deepEqual(extractPendingTargets(null), [])
})

test('extractPendingTargets 限制最多8个', () => {
  const profile = {
    pendingBottlenecks: Array.from({ length: 12 }, (_, i) => ({ lpCode: `LP-${String(i + 1).padStart(3, '0')}` })),
  }
  const targets = extractPendingTargets(profile)
  assert.equal(targets.length, 8)
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

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

test('chunkTargets batches bottlenecks at BATCH_SIZE=5 to balance latency and timeout safety', () => {
  const autoVerification = loadModule('cloudfunctions/analyzePhotos/auto-verification.js')
  const chunks = autoVerification.chunkTargets(['BN-001', 'BN-002', 'BN-003', 'BN-004', 'BN-005', 'BN-006'])

  // BATCH_SIZE=5: 前5个一批，第6个单独一批
  assert.equal(JSON.stringify(chunks), JSON.stringify([['BN-001','BN-002','BN-003','BN-004','BN-005'], ['BN-006']]))
})

test('generateInBatches marks paper failed when any batch cannot be generated', async () => {
  const autoVerification = loadModule('cloudfunctions/analyzePhotos/auto-verification.js', {}, {
    setTimeout: callback => {
      callback()
      return 0
    }
  })
  const db = createDatabase({
    papers: [{
      _id: 'paper-1',
      studentId: 's1',
      subject: 'math',
      type: 'verification',
      questions: [],
      generationStatus: 'generating',
    }]
  })
  let pdfCalls = 0
  const cloud = {
    callFunction: async ({ data }) => {
      if (data._regeneratePdf) {
        pdfCalls += 1
        return { result: { success: true, questionCount: 8 } }
      }
      if ((data.targets || []).includes('BN-009')) {
        return { result: { success: false, error: 'AI 批次失败' } }
      }
      return { result: { success: true, appendedQuestionCount: (data.targets || []).length } }
    }
  }
  const targets = Array.from({ length: 9 }, (_, index) => `BN-${String(index + 1).padStart(3, '0')}`)

  await assert.rejects(
    () => autoVerification.generateInBatches(db, cloud, { paperId: 'paper-1', studentId: 's1', subject: 'math', targets }),
    /部分批次生成失败/
  )

  const paper = db.dump('papers')[0]
  assert.equal(pdfCalls, 0)
  assert.equal(paper.generationStatus, 'failed')
  // BATCH_SIZE=5: 9 个 target 分 2 批。BN-009 在第 2 批，第 2 批失败。
  assert.equal(paper.generationProgress.succeededBatches, 1)
  assert.equal(paper.generationProgress.failedBatches, 1)
  assert.deepEqual(paper.generationProgress.failedBatchIndexes, [2])
})

test('generateInBatches requires the final regenerated PDF file id before marking ready', async () => {
  const autoVerification = loadModule('cloudfunctions/analyzePhotos/auto-verification.js', {}, {
    setTimeout: callback => {
      callback()
      return 0
    }
  })
  const db = createDatabase({
    papers: [{
      _id: 'paper-1',
      studentId: 's1',
      subject: 'math',
      type: 'verification',
      questions: [],
      generationStatus: 'generating',
    }],
    reports: [{ _id: 'report-1', studentId: 's1', subject: 'math', type: 'diagnosis' }]
  })
  const cloud = {
    callFunction: async ({ data }) => {
      if (data._regeneratePdf) {
        return { result: { success: true, questionCount: 8 } }
      }
      return { result: { success: true, appendedQuestionCount: (data.targets || []).length } }
    }
  }

  await assert.rejects(
    () => autoVerification.generateInBatches(db, cloud, {
      paperId: 'paper-1',
      studentId: 's1',
      subject: 'math',
      targets: ['BN-001'],
      reportId: 'report-1'
    }),
    /PDF 文件未生成/
  )

  const paper = db.dump('papers')[0]
  const report = db.dump('reports')[0]
  assert.equal(paper.generationStatus, 'failed')
  assert.match(paper.generationError, /PDF 文件未生成/)
  assert.equal(report.verificationPaperStatus, 'failed')
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

function loadRegenerateVerificationPaper(db, openId = 'owner-1') {
  const cloud = createCloudMock({ db, openId })
  return loadModule('cloudfunctions/regenerateVerificationPaper/index.js', { 'wx-server-sdk': cloud })
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

test('getActiveVerificationPaper does not return ready when the PDF file is missing', async () => {
  const db = createDatabase({
    students: [{ _id: 's1', _openid: 'owner-1', name: '钟青羽' }],
    papers: [
      { _id: 'p1', studentId: 's1', subject: 'math', type: 'verification', generationStatus: 'ready', createdAt: new Date() },
    ],
    reports: [],
  })
  const handler = loadStudentData(db)
  const result = await handler.main({ action: 'getActiveVerificationPaper', studentId: 's1', subject: 'math' })

  assert.equal(result.success, true)
  assert.equal(result.status, 'failed')
  assert.equal(result.paper._id, 'p1')
  assert.match(result.paper.generationError, /PDF/)
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

test('regenerateVerificationPaper start rejects callers without access to the student', async () => {
  const db = createDatabase({
    students: [{ _id: 's1', _openid: 'owner-1', name: '钟青羽' }],
    subjectProfiles: [{
      _id: 'profile-1',
      studentId: 's1',
      subject: 'math',
      currentBottlenecks: [{
        lpCode: 'LP-001',
        severity: 'high',
        candidateBottlenecks: [{ bottleneckId: 'BN-001', title: '小数点定位' }]
      }]
    }],
    papers: [],
    reports: [],
  })
  const handler = loadRegenerateVerificationPaper(db, 'other-openid')

  const result = await handler.main({ action: 'start', studentId: 's1', subject: 'math', reportId: 'report-1' })

  assert.equal(result.success, false)
  assert.equal(result.error, '无权执行该操作')
  assert.equal(db.dump('papers').length, 0)
})

test('regenerateVerificationPaper finalize rejects paper/student mismatch', async () => {
  const db = createDatabase({
    students: [
      { _id: 's1', _openid: 'owner-1', name: '钟青羽' },
      { _id: 's2', _openid: 'owner-2', name: '弟弟' },
    ],
    papers: [{
      _id: 'paper-other',
      studentId: 's2',
      subject: 'math',
      type: 'verification',
      questions: [{ content: '1+1', answer: '2' }],
      pdfFileId: 'cloud://paper.pdf',
      generationStatus: 'generating',
    }],
    reports: [],
  })
  const handler = loadRegenerateVerificationPaper(db, 'owner-1')

  const result = await handler.main({ action: 'finalize', studentId: 's1', subject: 'math', paperId: 'paper-other' })

  assert.equal(result.success, false)
  assert.equal(result.error, '验证卷归属不匹配')
  assert.equal(db.dump('papers')[0].generationStatus, 'generating')
})

test('regenerateVerificationPaper finalize rejects incomplete generated papers', async () => {
  const db = createDatabase({
    students: [{ _id: 's1', _openid: 'owner-1', name: '钟青羽' }],
    papers: [{
      _id: 'paper-empty',
      studentId: 's1',
      subject: 'math',
      type: 'verification',
      questions: [],
      generationStatus: 'generating',
    }],
    reports: [],
  })
  const handler = loadRegenerateVerificationPaper(db, 'owner-1')

  const result = await handler.main({ action: 'finalize', studentId: 's1', subject: 'math', paperId: 'paper-empty' })

  assert.equal(result.success, false)
  assert.equal(result.error, '验证卷尚未生成完整题目或 PDF')
  assert.equal(db.dump('papers')[0].generationStatus, 'generating')
})

test('regenerateVerificationPaper continue advances only the next missing target and schedules another run', async () => {
  const db = createDatabase({
    students: [{ _id: 's1', _openid: 'owner-1', name: '钟青羽' }],
    papers: [{
      _id: 'paper-1',
      studentId: 's1',
      subject: 'math',
      type: 'verification',
      bottleneckTargets: ['BN-001', 'BN-002', 'BN-003'],
      questions: [{ questionId: 'q1', lpCode: 'BN-001', content: '已生成题' }],
      generationStatus: 'appending',
    }],
    reports: [{ _id: 'report-1', studentId: 's1', subject: 'math', type: 'diagnosis' }],
  })
  const cloudCalls = []
  const cloud = createCloudMock({
    db,
    openId: 'owner-1',
    callFunction: async payload => {
      cloudCalls.push(payload)
      if (payload.name === 'generatePaper') {
        return { result: { success: true, appendedQuestionCount: 1, questionCount: 2 } }
      }
      if (payload.name === 'regenerateVerificationPaper') {
        return { result: { success: true, scheduled: true } }
      }
      return { result: { success: true } }
    }
  })
  const handler = loadModule('cloudfunctions/regenerateVerificationPaper/index.js', {
    'wx-server-sdk': cloud
  })

  const result = await handler.main({
    action: 'continue',
    studentId: 's1',
    subject: 'math',
    paperId: 'paper-1',
    reportId: 'report-1',
  })

  assert.equal(result.success, true)
  assert.equal(result.status, 'appending')
  assert.equal(result.advancedTarget, 'BN-002')

  const generateCall = cloudCalls.find(call => call.name === 'generatePaper')
  assert.equal(JSON.stringify(generateCall.data.targets), JSON.stringify(['BN-002']))
  assert.equal(generateCall.data._appendToPaperId, 'paper-1')

  const continueCall = cloudCalls.find(call =>
    call.name === 'regenerateVerificationPaper' && call.data.action === 'continue'
  )
  assert.ok(continueCall, '应安排下一次续跑')
  assert.equal(continueCall.data.paperId, 'paper-1')

  const paper = db.dump('papers')[0]
  assert.equal(paper.generationStatus, 'appending')
  assert.equal(paper.generationProgress.completedBatches, 2)
  assert.equal(paper.generationProgress.totalBatches, 3)
})

test('regenerateVerificationPaper continue allows trusted backend continuation without openid', async () => {
  const db = createDatabase({
    students: [{ _id: 's1', _openid: 'owner-1', name: '钟青羽' }],
    papers: [{
      _id: 'paper-1',
      _openid: 'owner-1',
      studentId: 's1',
      subject: 'math',
      type: 'verification',
      triggeredByReport: 'report-1',
      bottleneckTargets: ['BN-001', 'BN-002'],
      questions: [{ questionId: 'q1', lpCode: 'BN-001', content: '已生成题' }],
      generationStatus: 'appending',
    }],
    reports: [{ _id: 'report-1', _openid: 'owner-1', studentId: 's1', subject: 'math', type: 'diagnosis' }],
  })
  const cloudCalls = []
  const cloud = createCloudMock({
    db,
    callFunction: async payload => {
      cloudCalls.push(payload)
      if (payload.name === 'generatePaper' && payload.data._regeneratePdf) {
        return { result: { success: true, pdfFileId: 'cloud://paper.pdf', questionCount: 2 } }
      }
      if (payload.name === 'generatePaper') {
        return { result: { success: true, appendedQuestionCount: 1, questionCount: 2 } }
      }
      return { result: { success: true } }
    }
  })
  cloud.getWXContext = () => ({ OPENID: '' })
  const handler = loadModule('cloudfunctions/regenerateVerificationPaper/index.js', {
    'wx-server-sdk': cloud
  })

  const result = await handler.main({
    action: 'continue',
    studentId: 's1',
    subject: 'math',
    paperId: 'paper-1',
    reportId: 'report-1',
  })

  assert.equal(result.success, true)
  assert.equal(result.status, 'ready')
  assert.equal(result.advancedTarget, 'BN-002')
  assert.ok(cloudCalls.some(call => call.name === 'generatePaper'))
})

test('regenerateVerificationPaper continue finalizes the PDF after the last missing target', async () => {
  const db = createDatabase({
    students: [{ _id: 's1', _openid: 'owner-1', name: '钟青羽' }],
    papers: [{
      _id: 'paper-1',
      studentId: 's1',
      subject: 'math',
      type: 'verification',
      bottleneckTargets: ['BN-001'],
      questions: [],
      generationStatus: 'generating',
    }],
    reports: [{ _id: 'report-1', studentId: 's1', subject: 'math', type: 'diagnosis' }],
  })
  const cloudCalls = []
  const cloud = createCloudMock({
    db,
    openId: 'owner-1',
    callFunction: async payload => {
      cloudCalls.push(payload)
      if (payload.name === 'generatePaper' && payload.data._regeneratePdf) {
        return { result: { success: true, pdfFileId: 'cloud://paper.pdf', questionCount: 1 } }
      }
      if (payload.name === 'generatePaper') {
        return { result: { success: true, appendedQuestionCount: 1, questionCount: 1 } }
      }
      throw new Error('不应继续调度')
    }
  })
  const handler = loadModule('cloudfunctions/regenerateVerificationPaper/index.js', {
    'wx-server-sdk': cloud
  })

  const result = await handler.main({
    action: 'continue',
    studentId: 's1',
    subject: 'math',
    paperId: 'paper-1',
    reportId: 'report-1',
  })

  assert.equal(result.success, true)
  assert.equal(result.status, 'ready')
  assert.equal(result.pdfFileId, 'cloud://paper.pdf')
  assert.ok(cloudCalls.some(call => call.name === 'generatePaper' && call.data._regeneratePdf))
  assert.equal(cloudCalls.some(call => call.name === 'regenerateVerificationPaper'), false)

  const paper = db.dump('papers')[0]
  const report = db.dump('reports')[0]
  assert.equal(paper.generationStatus, 'ready')
  assert.equal(report.verificationPaperStatus, 'ready')
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

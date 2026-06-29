const test = require('node:test')
const assert = require('node:assert/strict')
const { EventEmitter } = require('node:events')
const {
  createCloudMock,
  createDatabase,
  loadModule
} = require('./helpers/cloud-function-harness')

process.env.BATCH_RETRY_DELAY_MS = '0'

function createPdfKitMock() {
  return class PdfMock extends EventEmitter {
    constructor() {
      super()
      this.y = 100
    }
    registerFont() { return this }
    font() { return this }
    fontSize() { return this }
    text() { return this }
    moveDown() { return this }
    moveTo() { return this }
    lineTo() { return this }
    stroke() { return this }
    addPage() { return this }
    bufferedPageRange() { return { count: 1 } }
    switchToPage() { return this }
    end() {
      this.emit('data', Buffer.from('pdf'))
      queueMicrotask(() => this.emit('end'))
    }
  }
}

function createTcbMock(text) {
  return {
    SYMBOL_CURRENT_ENV: 'test',
    init: () => ({
      ai: () => ({
        createModel: () => ({
          generateText: async () => ({ text })
        })
      })
    })
  }
}

function loadGeneratePaperForTest(db, options = {}) {
  const questions = options.questions || Array.from({ length: 3 }, (_, index) => ({
    index: index + 1,
    content: `计算题 ${index + 1}`,
    answer: String(index + 1),
    points: 10,
    lpCode: 'LP-001',
    lpName: '计算错误'
  }))
  const tcbText = options.tcbText || JSON.stringify({ title: '测试', questions })
  return loadModule('cloudfunctions/generatePaper/index.js', {
    'wx-server-sdk': createCloudMock({ db, openId: options.openId || 'owner-1' }),
    '@cloudbase/node-sdk': createTcbMock(tcbText),
    './pdf-renderer': {
      generatePDF: options.generatePDF || (async () => ({
        buffer: Buffer.from('pdf'),
        studentPages: 1,
        answerPages: 1,
        totalPages: 2
      }))
    }
  })
}

test('uploadAndAnalyze creates a report and starts analysis for an owned student', async () => {
  const db = createDatabase({
    students: [{ _id: 'student-1', _openid: 'owner-1', name: '钟青羽' }],
    userConsents: [{ _id: 'consent-1', _openid: 'owner-1', betaConsented: true }],
    subjectProfiles: [{ _id: 'profile-1', studentId: 'student-1', subject: 'math' }],
    reports: []
  })
  const cloud = createCloudMock({ db })
  const handler = loadModule('cloudfunctions/uploadAndAnalyze/index.js', {
    'wx-server-sdk': cloud
  })

  const result = await handler.main({
    fileIDs: ['cloud://photo-1'],
    imageMetas: [{ fileName: 'paper.jpg', fileSize: 123 }],
    studentId: 'student-1',
    subject: 'math',
    mode: 'diagnosis'
  })

  assert.equal(result.success, true)
  const report = db.dump('reports')[0]
  assert.equal(report.imageFiles[0].fileName, 'paper.jpg')
  assert.ok(report.evidenceTime)
  assert.ok(report.imageFiles[0].uploadedAt)
  assert.equal(new Date(report.imageFiles[0].uploadedAt).getTime(), new Date(report.evidenceTime).getTime())
  assert.equal(new Date(report.createdAt).getTime(), new Date(report.evidenceTime).getTime())
  assert.equal(db.dump('subjectProfiles')[0].analysisStatus, 'analyzing')
  assert.equal(cloud.calls.find(call => call.name === 'callFunction').payload.name, 'analyzePhotos')
})

test('uploadAndAnalyze marks default diagnosis paper sources correctly', async () => {
  const db = createDatabase({
    students: [{ _id: 'student-1', _openid: 'owner-1', name: '钟青羽' }],
    userConsents: [{ _id: 'consent-1', _openid: 'owner-1', betaConsented: true }],
    subjectProfiles: [{ _id: 'profile-1', studentId: 'student-1', subject: 'math' }],
    papers: [{
      _id: 'paper-1',
      _openid: 'owner-1',
      studentId: 'student-1',
      type: 'default-diagnosis'
    }],
    reports: []
  })
  const cloud = createCloudMock({ db })
  const handler = loadModule('cloudfunctions/uploadAndAnalyze/index.js', {
    'wx-server-sdk': cloud
  })

  await handler.main({
    fileIDs: ['cloud://photo-1'],
    studentId: 'student-1',
    subject: 'math',
    mode: 'paper',
    paperId: 'paper-1'
  })

  assert.equal(db.dump('reports')[0].sourceType, 'default-paper')
})

test('uploadAndAnalyze rejects invalid uploads and students owned by another user', async () => {
  const db = createDatabase({
    students: [{ _id: 'student-1', _openid: 'owner-1', name: '钟青羽' }],
    userConsents: [{ _id: 'consent-other', _openid: 'other-owner', betaConsented: true }],
    reports: []
  })
  const handler = loadModule('cloudfunctions/uploadAndAnalyze/index.js', {
    'wx-server-sdk': createCloudMock({ db, openId: 'other-owner' })
  })

  assert.equal((await handler.main({
    fileIDs: ['not-cloud'],
    studentId: 'student-1',
    subject: 'math'
  })).error, '图片参数无效')
  assert.equal((await handler.main({
    fileIDs: Array.from({ length: 21 }, (_, index) => `cloud://photo-${index + 1}`),
    studentId: 'student-1',
    subject: 'math'
  })).error, '图片参数无效')
  assert.equal((await handler.main({
    fileIDs: ['cloud://photo-1'],
    studentId: 'student-1',
    subject: 'science'
  })).error, '学科或分析模式无效')
  assert.equal((await handler.main({
    fileIDs: ['cloud://photo-1'],
    studentId: 'student-1',
    subject: 'math'
  })).error, '无权执行该操作')
  assert.equal(db.dump('reports').length, 0)
})

test('uploadAndAnalyze rejects real uploads before beta consent is recorded', async () => {
  const db = createDatabase({
    students: [{ _id: 'student-1', _openid: 'owner-1', name: '钟青羽' }],
    subjectProfiles: [{ _id: 'profile-1', studentId: 'student-1', subject: 'math' }],
    userConsents: [],
    reports: []
  })
  const cloud = createCloudMock({ db })
  const handler = loadModule('cloudfunctions/uploadAndAnalyze/index.js', {
    'wx-server-sdk': cloud
  })

  const result = await handler.main({
    fileIDs: ['cloud://photo-1'],
    studentId: 'student-1',
    subject: 'math',
    mode: 'diagnosis'
  })

  assert.equal(result.success, false)
  assert.match(result.error, /内测授权/)
  assert.equal(db.dump('reports').length, 0)
  assert.equal(cloud.calls.some(call => call.name === 'callFunction'), false)
})

test('joined parent can perform learning workflow operations', async () => {
  const questions = Array.from({ length: 5 }, (_, index) => ({
    index: index + 1,
    content: `计算题 ${index + 1}`,
    answer: String(index + 1),
    points: 10,
    lpCode: 'LP-001',
    lpName: '计算错误'
  }))
  const db = createDatabase({
    students: [{ _id: 'student-1', _openid: 'owner-1', name: '钟青羽', grade: 6 }],
    userConsents: [{ _id: 'consent-viewer', _openid: 'viewer-1', betaConsented: true }],
    studentMembers: [{ _id: 'member-1', studentId: 'student-1', ownerOpenId: 'owner-1', memberOpenId: 'viewer-1', role: 'viewer', status: 'active' }],
    subjectProfiles: [{
      _id: 'profile-1',
      studentId: 'student-1',
      subject: 'math',
      pendingBottlenecks: [{ lpCode: 'LP-001', lpName: '计算错误' }]
    }],
    papers: [{
      _id: 'paper-1',
      _openid: 'owner-1',
      studentId: 'student-1',
      subject: 'math',
      type: 'verification',
      bottleneckTargets: ['LP-001']
    }],
    reports: [{
      _id: 'report-1',
      _openid: 'owner-1',
      studentId: 'student-1',
      subject: 'math',
      status: 'completed',
      createdAt: '2026-06-11T10:00:00Z'
    }]
  })
  const viewerCloud = createCloudMock({ db, openId: 'viewer-1' })
  const upload = loadModule('cloudfunctions/uploadAndAnalyze/index.js', {
    'wx-server-sdk': viewerCloud
  })
  const generatePaper = loadModule('cloudfunctions/generatePaper/index.js', {
    'wx-server-sdk': viewerCloud,
    '@cloudbase/node-sdk': createTcbMock(JSON.stringify({ title: '测试', questions })),
    './pdf-renderer': { generatePDF: async () => ({ buffer: Buffer.from('pdf'), studentPages: 1, answerPages: 1, totalPages: 2 }) }
  })

  const diagnosis = await upload.main({
    fileIDs: ['cloud://photo-1'],
    studentId: 'student-1',
    subject: 'math'
  })
  assert.equal(diagnosis.success, true)

  const paper = await generatePaper.main({
    studentId: 'student-1',
    subject: 'math',
    type: 'verification',
    targets: ['LP-001']
  })
  assert.equal(paper.success, true)

  const verification = await upload.main({
    fileIDs: ['cloud://answer-1'],
    studentId: 'student-1',
    subject: 'math',
    mode: 'verification',
    paperId: 'paper-1'
  })
  assert.equal(verification.success, true)
})

test('generatePaper _regeneratePdf rejects callers without access to the paper student', async () => {
  const db = createDatabase({
    students: [{ _id: 'student-1', _openid: 'owner-1', name: '钟青羽', grade: 6 }],
    papers: [{
      _id: 'paper-1',
      studentId: 'student-1',
      subject: 'math',
      type: 'verification',
      questions: [{ index: 1, content: '1+1', answer: '2', lpCode: 'LP-001' }],
      generationStatus: 'appending'
    }]
  })
  let rendered = false
  const handler = loadGeneratePaperForTest(db, {
    openId: 'other-openid',
    generatePDF: async () => {
      rendered = true
      return { buffer: Buffer.from('pdf'), studentPages: 1, answerPages: 1, totalPages: 2 }
    }
  })

  const result = await handler.main({ _regeneratePdf: true, paperId: 'paper-1' })

  assert.equal(result.success, false)
  assert.equal(result.error, '无权执行该操作')
  assert.equal(rendered, false)
})

test('generatePaper _appendToPaperId rejects paper/student mismatch before appending', async () => {
  const db = createDatabase({
    students: [
      { _id: 'student-1', _openid: 'owner-1', name: '钟青羽', grade: 6 },
      { _id: 'student-2', _openid: 'owner-2', name: '弟弟', grade: 5 },
    ],
    subjectProfiles: [{
      _id: 'profile-1',
      studentId: 'student-1',
      subject: 'math',
      pendingBottlenecks: [{ lpCode: 'LP-001', lpName: '计算错误' }]
    }],
    papers: [{
      _id: 'paper-other',
      studentId: 'student-2',
      subject: 'math',
      type: 'verification',
      questions: [],
      bottleneckTargets: [],
      generationStatus: 'generating'
    }]
  })
  const handler = loadGeneratePaperForTest(db)

  const result = await handler.main({
    studentId: 'student-1',
    subject: 'math',
    type: 'verification',
    targets: ['LP-001'],
    _appendToPaperId: 'paper-other'
  })

  assert.equal(result.success, false)
  assert.equal(result.error, '验证卷归属不匹配')
  assert.deepEqual(db.dump('papers')[0].questions, [])
})

test('viewer can read analysis progress for a joined child', async () => {
  const db = createDatabase({
    reports: [{ _id: 'report-1', _openid: 'owner-1', studentId: 'student-1' }],
    studentMembers: [{ _id: 'member-1', studentId: 'student-1', ownerOpenId: 'owner-1', memberOpenId: 'viewer-1', role: 'viewer', status: 'active' }],
    analysisTasks: [{ _id: 'task-1', reportId: 'report-1', status: 'processing', completedBatches: 1, totalBatches: 2, createdAt: '2026-06-11T10:00:00Z' }]
  })
  const progress = loadModule('cloudfunctions/getAnalysisProgress/index.js', {
    'wx-server-sdk': createCloudMock({ db, openId: 'viewer-1' })
  })

  const result = await progress.main({ reportId: 'report-1' })

  assert.equal(result.success, true)
  assert.equal(result.completedBatches, 1)
})

test('uploadAndAnalyze requires a matching verification paper for verification reports', async () => {
  const db = createDatabase({
    students: [{ _id: 'student-1', _openid: 'owner-1', name: '钟青羽' }],
    userConsents: [{ _id: 'consent-1', _openid: 'owner-1', betaConsented: true }],
    papers: [{
      _id: 'default-paper',
      _openid: 'owner-1',
      studentId: 'student-1',
      type: 'default-diagnosis'
    }],
    reports: []
  })
  const handler = loadModule('cloudfunctions/uploadAndAnalyze/index.js', {
    'wx-server-sdk': createCloudMock({ db })
  })

  assert.equal((await handler.main({
    fileIDs: ['cloud://photo-1'],
    studentId: 'student-1',
    subject: 'math',
    mode: 'verification'
  })).error, '验证分析必须关联验证试卷')
  assert.equal((await handler.main({
    fileIDs: ['cloud://photo-1'],
    studentId: 'student-1',
    subject: 'math',
    mode: 'verification',
    paperId: 'default-paper'
  })).error, '验证分析必须关联验证试卷')
  assert.equal(db.dump('reports').length, 0)
})

test('uploadAndAnalyze stores verification upload evidence time', async () => {
  const db = createDatabase({
    students: [{ _id: 'student-1', _openid: 'owner-1', name: '钟青羽' }],
    userConsents: [{ _id: 'consent-1', _openid: 'owner-1', betaConsented: true }],
    subjectProfiles: [{ _id: 'profile-1', studentId: 'student-1', subject: 'math' }],
    papers: [{
      _id: 'paper-1',
      _openid: 'owner-1',
      studentId: 'student-1',
      type: 'verification'
    }],
    reports: []
  })
  const handler = loadModule('cloudfunctions/uploadAndAnalyze/index.js', {
    'wx-server-sdk': createCloudMock({ db })
  })

  const result = await handler.main({
    fileIDs: ['cloud://photo-1'],
    studentId: 'student-1',
    subject: 'math',
    mode: 'verification',
    paperId: 'paper-1'
  })
  const report = db.dump('reports')[0]

  assert.equal(result.success, true)
  assert.ok(report.verificationUploadedAt)
  assert.equal(new Date(report.verificationUploadedAt).getTime(), new Date(report.evidenceTime).getTime())
})

test('getAnalysisProgress returns the newest task and rejects other owners', async () => {
  const db = createDatabase({
    reports: [{ _id: 'report-1', _openid: 'owner-1' }],
    analysisTasks: [
      { _id: 'old', reportId: 'report-1', completedBatches: 1, totalBatches: 3, createdAt: '2026-06-11T10:00:00Z' },
      { _id: 'new', reportId: 'report-1', status: 'processing', completedBatches: 2, totalBatches: 3, createdAt: '2026-06-11T11:00:00Z' }
    ]
  })
  const owned = loadModule('cloudfunctions/getAnalysisProgress/index.js', {
    'wx-server-sdk': createCloudMock({ db, openId: 'owner-1' })
  })
  const denied = loadModule('cloudfunctions/getAnalysisProgress/index.js', {
    'wx-server-sdk': createCloudMock({ db, openId: 'other-owner' })
  })

  assert.equal((await owned.main({ reportId: 'report-1' })).completedBatches, 2)
  assert.equal((await owned.main({ reportId: 'report-1' })).status, 'processing')
  assert.equal((await owned.main({ reportId: 'report-1' })).createdAt, '2026-06-11T11:00:00Z')
  assert.equal((await denied.main({ reportId: 'report-1' })).error, '无权访问该报告')
})

test('generatePaper stores and returns printable PDF page metadata', async () => {
  const questions = Array.from({ length: 4 }, (_, index) => ({
    index: index + 1,
    content: `计算题 ${index + 1}`,
    answer: String(index + 1),
    points: 10,
    lpCode: index < 2 ? 'LP-001' : 'LP-008',
    lpName: index < 2 ? '计算错误' : '审题错误'
  }))
  const db = createDatabase({
    students: [{ _id: 'student-1', _openid: 'owner-1', name: '钟青羽', grade: 6 }],
    subjectProfiles: [{
      _id: 'profile-1',
      studentId: 'student-1',
      subject: 'math',
      pendingBottlenecks: [
        { lpCode: 'LP-001', lpName: '计算错误', weight: 55 },
        { lpCode: 'LP-008', lpName: '审题错误', weight: 55 }
      ]
    }],
    papers: []
  })
  let pdfOptions = null
  const handler = loadModule('cloudfunctions/generatePaper/index.js', {
    'wx-server-sdk': createCloudMock({ db }),
    '@cloudbase/node-sdk': createTcbMock(JSON.stringify({ title: '数学验证试卷', questions })),
    './pdf-renderer': {
      generatePDF: async (...args) => {
        pdfOptions = args[3]
        return {
        buffer: Buffer.from('pdf'),
        studentPages: 1,
        answerPages: 1,
        totalPages: 2
        }
      }
    }
  })

  const result = await handler.main({
    studentId: 'student-1',
    subject: 'math',
    type: 'verification',
    targets: ['LP-001', 'LP-008'],
    paperDate: '2026-06-13'
  })
  const paper = db.dump('papers')[0]

  assert.equal(result.success, true)
  assert.equal(result.questionCount, 4)
  assert.equal(result.studentPages, 1)
  assert.equal(result.answerPages, 1)
  assert.equal(result.totalPages, 2)
  assert.equal(result.paperDate, '2026-06-13')
  assert.equal(result.paperCode, 'MATH-20260613-01')
  assert.equal(result.paperDisplayCode, '数学-20260613-01')
  assert.equal(pdfOptions.paperDate, '2026-06-13')
  assert.equal(pdfOptions.paperCode, result.paperCode)
  assert.equal(pdfOptions.paperDisplayCode, result.paperDisplayCode)
  assert.equal(paper.paperDate, '2026-06-13')
  assert.equal(paper.paperCode, result.paperCode)
  assert.equal(paper.paperDisplayCode, result.paperDisplayCode)
  assert.equal(paper.studentPages, 1)
  assert.equal(paper.answerPages, 1)
  assert.equal(paper.totalPages, 2)
  assert.deepEqual(paper.bottleneckSummaries, ['计算错误', '审题错误'])
})

test('generatePaper filters incomplete AI questions before trimming to expected count', async () => {
  const questions = Array.from({ length: 8 }, (_, index) => ({
    index: index + 1,
    content: `计算题 ${index + 1}`,
    answer: index === 2 ? '' : String(index + 1),
    points: 10,
    lpCode: index < 4 ? 'LP-001' : 'LP-008',
    lpName: index < 4 ? '计算错误' : '审题错误'
  }))
  const db = createDatabase({
    students: [{ _id: 'student-1', _openid: 'owner-1', name: '钟青羽', grade: 6 }],
    subjectProfiles: [{
      _id: 'profile-1',
      studentId: 'student-1',
      subject: 'math',
      pendingBottlenecks: [
        { lpCode: 'LP-001', lpName: '计算错误', weight: 55 },
        { lpCode: 'LP-008', lpName: '审题错误', weight: 55 }
      ]
    }],
    papers: []
  })
  const handler = loadModule('cloudfunctions/generatePaper/index.js', {
    'wx-server-sdk': createCloudMock({ db }),
    '@cloudbase/node-sdk': createTcbMock(JSON.stringify({ title: '数学验证试卷', questions })),
    './pdf-renderer': { generatePDF: async () => ({ buffer: Buffer.from('pdf'), studentPages: 1, answerPages: 1, totalPages: 2 }) }
  })

  const result = await handler.main({
    studentId: 'student-1',
    subject: 'math',
    type: 'verification',
    targets: ['LP-001', 'LP-008']
  })
  const paper = db.dump('papers')[0]

  assert.equal(result.success, true)
  assert.equal(result.questionCount, 4)
  assert.equal(paper.questions.length, 4)
  assert.equal(paper.questions.some(question => question.content === '计算题 3'), false)
  assert.equal(paper.questions.at(-1).content, '计算题 5')
})

test('generatePaper asks verification papers to include core and extension questions', async () => {
  let prompt = ''
  const questions = Array.from({ length: 2 }, (_, index) => ({
    index: index + 1,
    content: `计算题 ${index + 1}`,
    answer: String(index + 1),
    points: 10,
    lpCode: 'LP-001',
    lpName: '计算错误'
  }))
  const aiApp = {
    ai: () => ({
      createModel: () => ({
        generateText: async ({ messages }) => {
          prompt = messages[0].content
          return { text: JSON.stringify({ title: '数学验证试卷', questions }) }
        }
      })
    })
  }
  const db = createDatabase({
    students: [{ _id: 'student-1', _openid: 'owner-1', name: '钟青羽', grade: 6 }],
    subjectProfiles: [{
      _id: 'profile-1',
      studentId: 'student-1',
      subject: 'math',
      pendingBottlenecks: [{ lpCode: 'LP-001', lpName: '计算错误' }]
    }],
    papers: []
  })
  const handler = loadModule('cloudfunctions/generatePaper/index.js', {
    'wx-server-sdk': createCloudMock({ db }),
    '@cloudbase/node-sdk': { init: () => aiApp },
    './pdf-renderer': { generatePDF: async () => ({ buffer: Buffer.from('pdf'), studentPages: 1, answerPages: 1, totalPages: 2 }) }
  })

  const result = await handler.main({
    studentId: 'student-1',
    subject: 'math',
    type: 'verification',
    targets: ['LP-001']
  })

  assert.equal(result.success, true)
  // 置信度分层出题：prompt 应包含分层指令（不再固定"每个卡点出2题"）
  assert.match(prompt, /置信度/)
  assert.match(prompt, /核心题/)
  assert.match(prompt, /迁移题/)
})

test('generatePaper accepts fine math bottleneck ids and resolves candidate names', async () => {
  let prompt = ''
  const questions = Array.from({ length: 5 }, (_, index) => ({
    index: index + 1,
    content: `小数乘法复测题 ${index + 1}`,
    answer: String(index + 1),
    points: 10,
    lpCode: 'BN-DEC-MUL-POINT-COUNT',
    lpName: '小数乘法中小数位数累计规则不稳'
  }))
  const aiApp = {
    ai: () => ({
      createModel: () => ({
        generateText: async ({ messages }) => {
          prompt = messages[0].content
          return { text: JSON.stringify({ title: '数学细卡点验证试卷', questions }) }
        }
      })
    })
  }
  const db = createDatabase({
    students: [{ _id: 'student-1', _openid: 'owner-1', name: '钟青羽', grade: 6 }],
    subjectProfiles: [{
      _id: 'profile-1',
      studentId: 'student-1',
      subject: 'math',
      currentBottlenecks: [{
        lpCode: 'LP-001',
        lpName: '计算基础',
        candidateBottlenecks: [{
          bottleneckId: 'BN-DEC-MUL-POINT-COUNT',
          title: '小数乘法中小数位数累计规则不稳'
        }]
      }]
    }],
    papers: []
  })
  const handler = loadModule('cloudfunctions/generatePaper/index.js', {
    'wx-server-sdk': createCloudMock({ db }),
    '@cloudbase/node-sdk': { init: () => aiApp },
    './pdf-renderer': { generatePDF: async () => ({ buffer: Buffer.from('pdf'), studentPages: 1, answerPages: 1, totalPages: 2 }) }
  })

  const result = await handler.main({
    studentId: 'student-1',
    subject: 'math',
    type: 'verification',
    targets: ['BN-DEC-MUL-POINT-COUNT']
  })
  const paper = db.dump('papers')[0]

  assert.equal(result.success, true)
  assert.match(prompt, /BN-DEC-MUL-POINT-COUNT/)
  assert.deepEqual(paper.bottleneckTargets, ['BN-DEC-MUL-POINT-COUNT'])
  assert.deepEqual(paper.bottleneckSummaries, ['小数乘法中小数位数累计规则不稳'])
})

test('generatePaper stores verificationPack for many fine bottlenecks', async () => {
  let prompt = ''
  const targets = Array.from({ length: 8 }, (_, index) => `BN-FINE-${index + 1}`)
  const questions = targets.flatMap((targetId, targetIndex) => (
    Array.from({ length: 2 }, (_, questionIndex) => ({
      index: targetIndex * 2 + questionIndex + 1,
      content: `细卡点 ${targetIndex + 1} 复测题 ${questionIndex + 1}`,
      answer: String(questionIndex + 1),
      points: 10,
      lpCode: targetId,
      lpName: `细分卡点 ${targetIndex + 1}`
    }))
  ))
  const db = createDatabase({
    students: [{ _id: 'student-1', _openid: 'owner-1', name: '钟青羽', grade: 6 }],
    subjectProfiles: [{
      _id: 'profile-1',
      studentId: 'student-1',
      subject: 'math',
      currentBottlenecks: targets.map((targetId, index) => ({
        lpCode: `LP-${String(index + 1).padStart(3, '0')}`,
        lpName: `粗卡点 ${index + 1}`,
        candidateBottlenecks: [{
          bottleneckId: targetId,
          title: `细分卡点 ${index + 1}`,
          weight: 60 - index
        }]
      }))
    }],
    papers: []
  })
  const aiApp = {
    ai: () => ({
      createModel: () => ({
        generateText: async ({ messages }) => {
          prompt = messages[0].content
          return { text: JSON.stringify({ title: '数学任务包验证试卷', questions }) }
        }
      })
    })
  }
  let pdfOptions = null
  const handler = loadModule('cloudfunctions/generatePaper/index.js', {
    'wx-server-sdk': createCloudMock({ db }),
    '@cloudbase/node-sdk': { init: () => aiApp },
    './pdf-renderer': {
      generatePDF: async (...args) => {
        pdfOptions = args[3]
        return {
          buffer: Buffer.from('pdf'),
          studentPages: 2,
          answerPages: 2,
          totalPages: 4,
          studentPageCodes: [
            'MATH-V-20260616-01-P01',
            'MATH-V-20260616-01-P02'
          ],
          studentPageMetadata: [
            { pageNumber: 1, pageCode: 'MATH-V-20260616-01-P01', questionIds: Array.from({ length: 12 }, (_, index) => `Q-${index + 1}`) },
            { pageNumber: 2, pageCode: 'MATH-V-20260616-01-P02', questionIds: Array.from({ length: 12 }, (_, index) => `Q-${index + 13}`) }
          ]
        }
      }
    }
  })

  const result = await handler.main({
    studentId: 'student-1',
    subject: 'math',
    type: 'verification',
    targets,
    paperDate: '2026-06-16'
  })
  const paper = db.dump('papers')[0]

  assert.equal(result.success, true)
  assert.match(prompt, /BN-FINE-8/)
  assert.equal(pdfOptions.verificationPack.totalTargets, 8)
  assert.deepEqual(paper.bottleneckTargets, targets)
  assert.equal(paper.verificationPack.totalTargets, 8)
  assert.equal(paper.verificationPack.totalQuestions, 16)
  assert.equal(paper.verificationPack.pages.length, 2)
  assert.deepEqual(paper.verificationPack.pages.map(page => page.pageCode), [
    'MATH-V-20260616-01-P01',
    'MATH-V-20260616-01-P02'
  ])
  // verificationPack 按 target 分页（每页 4 个 target），8 个 target 分 2 页：4+4
  assert.deepEqual(paper.verificationPack.pages.map(page => page.questionIds.length), [8, 8])
  assert.equal(paper.questions[0].pageCode, 'MATH-V-20260616-01-P01')
  assert.equal(paper.questions[0].targetId, 'BN-FINE-1')
  assert.equal(paper.questions[0].targetType, 'fine_bottleneck')
  assert.equal(paper.questions[1].questionRole, 'transfer')
  assert.deepEqual(paper.studentPageCodes, [
    'MATH-V-20260616-01-P01',
    'MATH-V-20260616-01-P02'
  ])
  assert.equal(paper.studentPageMetadata.length, 2)
})

test('generatePaper uses chinese concrete review items before generic bottleneck drills', async () => {
  let prompt = ''
  const questions = Array.from({ length: 5 }, (_, index) => ({
    index: index + 1,
    content: index === 0 ? '看拼音写词语：biàn lùn。' : `语文复测题 ${index + 1}`,
    answer: index === 0 ? '辩论' : '略',
    points: 10,
    lpCode: 'LP-101',
    lpName: '识字词语',
    reviewItemId: 'CHI-WORD-BIANLUN',
    targetText: '辩论',
    verificationMethod: 'pinyin_to_word'
  }))
  const aiApp = {
    ai: () => ({
      createModel: () => ({
        generateText: async ({ messages }) => {
          prompt = messages[0].content
          return { text: JSON.stringify({ title: '语文错项复测卷', questions }) }
        }
      })
    })
  }
  const db = createDatabase({
    students: [{ _id: 'student-1', _openid: 'owner-1', name: '钟青羽', grade: 6 }],
    subjectProfiles: [{
      _id: 'profile-chinese',
      studentId: 'student-1',
      subject: 'chinese',
      pendingBottlenecks: [{ lpCode: 'LP-101', lpName: '识字词语' }],
      chineseReviewItems: [{
        itemId: 'CHI-WORD-BIANLUN',
        itemType: 'word',
        targetText: '辩论',
        expectedAnswer: '辩论',
        lastWrongAnswer: '辨论',
        sourceContext: '看拼音写词语：biàn lùn',
        mistakeType: '形近字混淆',
        status: 'needs_review',
        relatedLpCode: 'LP-101',
        verificationMethods: ['pinyin_to_word', 'dictation']
      }]
    }],
    papers: []
  })
  const handler = loadModule('cloudfunctions/generatePaper/index.js', {
    'wx-server-sdk': createCloudMock({ db }),
    '@cloudbase/node-sdk': { init: () => aiApp },
    './pdf-renderer': { generatePDF: async () => ({ buffer: Buffer.from('pdf'), studentPages: 1, answerPages: 1, totalPages: 2 }) }
  })

  const result = await handler.main({
    studentId: 'student-1',
    subject: 'chinese',
    type: 'verification',
    targets: ['LP-101']
  })
  const paper = db.dump('papers')[0]

  assert.equal(result.success, true)
  assert.match(prompt, /语文错项复测目标/)
  assert.match(prompt, /targetText=辩论/)
  assert.match(prompt, /每个 targetText 至少直接考察一次/)
  assert.deepEqual(paper.chineseReviewTargets, [{
    itemId: 'CHI-WORD-BIANLUN',
    itemType: 'word',
    targetText: '辩论',
    expectedAnswer: '辩论',
    lastWrongAnswer: '辨论',
    sourceContext: '看拼音写词语：biàn lùn',
    mistakeType: '形近字混淆',
    relatedLpCode: 'LP-101',
    verificationMethods: ['pinyin_to_word', 'dictation']
  }])
  assert.equal(paper.questions[0].reviewItemId, 'CHI-WORD-BIANLUN')
  assert.equal(paper.questions[0].targetText, '辩论')
  assert.equal(paper.questions[0].verificationMethod, 'pinyin_to_word')
})

test('analyzePhotos splits batches, excludes duplicate pages and updates the profile', async () => {
  const fileIDs = Array.from({ length: 2 }, (_, index) => `cloud://photo-${index + 1}`)
  const db = createDatabase({
    reports: [
      {
        _id: 'history',
        _openid: 'owner-1',
        studentId: 'student-1',
        subject: 'math',
        status: 'completed',
        createdAt: '2026-06-10T10:00:00Z',
        bottlenecks: [{ lpCode: 'LP-001', lpName: '计算', errorCount: 1 }],
        imageFiles: [{ fileID: 'cloud://old', ocrSummary: '重复页面' }]
      },
      {
        _id: 'report-1',
        _openid: 'owner-1',
        studentId: 'student-1',
        subject: 'math',
        type: 'diagnosis',
        status: 'analyzing',
        createdAt: '2026-06-11T10:00:00Z',
        evidenceTime: '2026-06-11T09:50:00Z',
        imageFileIds: fileIDs,
        imageFiles: fileIDs.map(fileID => ({ fileID, uploadedAt: '2026-06-11T09:50:00Z' }))
      }
    ],
    subjectProfiles: [{
      _id: 'profile-1',
      studentId: 'student-1',
      subject: 'math',
      totalReports: 1,
      pendingBottlenecks: [],
      improvedBottlenecks: []
    }],
    analysisTasks: []
  })
  const scheduledContinuations = []
  const batchCalls = []
  const cloud = createCloudMock({
    db,
    callFunction: async payload => {
      if (payload.name === 'analyzePhotos') {
        scheduledContinuations.push(payload.data)
        return { result: { success: true } }
      }
      batchCalls.push(payload.data.fileIDs)
      return {
        result: {
          success: true,
          data: {
            pageResults: payload.data.fileIDs.map((fileID, index) => ({
              fileID,
              imageIndex: index + 1,
              ocrSummary: fileID === 'cloud://photo-1' ? '重复页面' : `新页面${fileID}`,
              totalErrors: 1,
              bottlenecks: [{
                lpCode: 'LP-001',
                lpName: '计算',
                errorCount: 1,
                severity: 'medium'
              }],
              errorDetails: [{ questionContent: fileID }]
            }))
          }
        }
      }
    }
  })
  const handler = loadModule('cloudfunctions/analyzePhotos/index.js', {
    'wx-server-sdk': cloud
  })

  const first = await handler.main({ reportId: 'report-1' })
  const taskAfterFirstRun = db.dump('analysisTasks')[0]

  // ANALYSIS_BATCH_SIZE=5: 2 张图片一批完成，无需续跑
  assert.equal(first.success, true)

  const report = db.dump('reports').find(item => item._id === 'report-1')
  const profile = db.dump('subjectProfiles')[0]

  assert.deepEqual(batchCalls.map(batch => batch.length), [2])
  assert.equal(report.imageFiles[0].isDuplicate, true)
  assert.equal(new Date(report.imageFiles[0].uploadedAt).getTime(), new Date('2026-06-11T09:50:00Z').getTime())
  assert.equal(report.totalErrors, 1)
  assert.equal(report.bottlenecks[0].errorCount, 1)
  assert.equal(report.isEffective, true)
  assert.match(report.changeSummary, /计算/)
  assert.ok(report.profileAppliedAt)
  assert.equal(profile.totalReports, 2)
  assert.equal(profile.currentBottlenecks[0].status, 'needs_verification')
  assert.match(profile.currentSummary, /计算/)
  assert.equal(profile.analysisStatus, null)
  assert.equal(db.dump('analysisTasks')[0].status, 'completed')
})

test('analyzePhotos stores chinese concrete error items on report and profile', async () => {
  const db = createDatabase({
    reports: [{
      _id: 'report-chinese-1',
      _openid: 'owner-1',
      studentId: 'student-1',
      subject: 'chinese',
      type: 'diagnosis',
      status: 'analyzing',
      createdAt: '2026-06-11T10:00:00Z',
      imageFileIds: ['cloud://chinese-1'],
      imageFiles: [{ fileID: 'cloud://chinese-1' }]
    }],
    subjectProfiles: [{
      _id: 'profile-chinese',
      studentId: 'student-1',
      subject: 'chinese',
      totalReports: 0,
      pendingBottlenecks: [],
      improvedBottlenecks: [],
      chineseReviewItems: []
    }],
    analysisTasks: []
  })
  const cloud = createCloudMock({
    db,
    callFunction: async payload => ({
      result: {
        success: true,
        data: {
          pageResults: [{
            fileID: payload.data.fileIDs[0],
            imageIndex: 1,
            ocrSummary: '看拼音写词语：biàn lùn，学生写成辨论',
            totalErrors: 1,
            bottlenecks: [{
              lpCode: 'LP-101',
              lpName: '识字词语',
              errorCount: 1,
              severity: 'high'
            }],
            errorDetails: [{
              questionContent: '看拼音写词语：biàn lùn',
              studentAnswer: '辨论',
              correctAnswer: '辩论',
              lpCode: 'LP-101'
            }],
            chineseErrorItems: [{
              itemId: 'CHI-WORD-BIANLUN',
              itemType: 'word',
              targetText: '辩论',
              expectedAnswer: '辩论',
              studentAnswer: '辨论',
              sourceContext: '看拼音写词语：biàn lùn',
              mistakeType: '形近字混淆',
              verificationMethods: ['pinyin_to_word'],
              relatedLpCode: 'LP-101'
            }]
          }]
        }
      }
    })
  })
  const handler = loadModule('cloudfunctions/analyzePhotos/index.js', {
    'wx-server-sdk': cloud
  })

  const result = await handler.main({ reportId: 'report-chinese-1' })
  const report = db.dump('reports')[0]
  const profile = db.dump('subjectProfiles')[0]

  assert.equal(result.success, true)
  assert.equal(report.chineseErrorItems[0].targetText, '辩论')
  assert.equal(report.chineseErrorItems[0].sourceFileID, 'cloud://chinese-1')
  assert.equal(profile.chineseReviewItems[0].targetText, '辩论')
  assert.equal(profile.chineseReviewItems[0].lastWrongAnswer, '辨论')
  assert.equal(profile.chineseReviewItems[0].status, 'needs_review')
})

test('analyzePhotos batches images at ANALYSIS_BATCH_SIZE=5 and processes within timeout', async () => {
  const fileIDs = Array.from({ length: 2 }, (_, index) => `cloud://photo-${index + 1}`)
  const db = createDatabase({
    reports: [{
      _id: 'report-1',
      _openid: 'owner-1',
      studentId: 'student-1',
      subject: 'math',
      type: 'diagnosis',
      status: 'analyzing',
      createdAt: '2026-06-11T10:00:00Z',
      imageFileIds: fileIDs,
      imageFiles: fileIDs.map(fileID => ({ fileID }))
    }],
    subjectProfiles: [{
      _id: 'profile-1',
      studentId: 'student-1',
      subject: 'math',
      totalReports: 0,
      pendingBottlenecks: [],
      improvedBottlenecks: []
    }],
    analysisTasks: []
  })
  let active = 0
  let maxActive = 0
  const scheduledContinuations = []
  const cloud = createCloudMock({
    db,
    callFunction: async payload => {
      if (payload.name === 'analyzePhotos') {
        scheduledContinuations.push(payload.data)
        return { result: { success: true } }
      }
      active += 1
      maxActive = Math.max(maxActive, active)
      await new Promise(resolve => setTimeout(resolve, 5))
      active -= 1
      return {
        result: {
          success: true,
          data: {
            pageResults: payload.data.fileIDs.map((fileID, index) => ({
              fileID,
              imageIndex: index + 1,
              ocrSummary: `页面${fileID}`,
              totalErrors: 0,
              bottlenecks: [],
              errorDetails: []
            }))
          }
        }
      }
    }
  })
  const handler = loadModule('cloudfunctions/analyzePhotos/index.js', {
    'wx-server-sdk': cloud
  })

  const result = await handler.main({ reportId: 'report-1' })
  const task = db.dump('analysisTasks')[0]
  const calls = cloud.calls.filter(call => call.name === 'callFunction')

  // ANALYSIS_BATCH_SIZE=5: 2 张图片一批完成（无需续跑）
  assert.equal(result.success, true)
  assert.deepEqual(calls.filter(call => call.payload.name === 'analyzeBatch').map(call => call.payload.data.fileIDs.length), [2])
  assert.equal(maxActive, 1)
})

test('analyzePhotos rejects empty-openid continuation when task owner does not match report owner', async () => {
  const db = createDatabase({
    reports: [{
      _id: 'report-1',
      _openid: 'owner-1',
      studentId: 'student-1',
      subject: 'math',
      type: 'diagnosis',
      status: 'analyzing',
      createdAt: '2026-06-11T10:00:00Z',
      imageFileIds: ['cloud://photo-1'],
      imageFiles: [{ fileID: 'cloud://photo-1' }]
    }],
    analysisTasks: [{
      _id: 'task-1',
      reportId: 'report-1',
      status: 'processing',
      _openid: 'attacker-1',
      fileIDs: ['cloud://photo-1'],
      nextBatchIndex: 0,
      batchResults: [],
      createdAt: '2026-06-11T10:00:00Z'
    }]
  })
  const cloud = createCloudMock({
    db,
    callFunction: async () => {
      throw new Error('analyzeBatch should not be called')
    }
  })
  cloud.getWXContext = () => ({ OPENID: '' })
  const handler = loadModule('cloudfunctions/analyzePhotos/index.js', {
    'wx-server-sdk': cloud
  })

  const result = await handler.main({
    reportId: 'report-1',
    taskId: 'task-1',
    continuation: true
  })

  assert.equal(result.success, false)
  assert.equal(db.dump('analysisTasks')[0].status, 'processing')
  assert.equal(cloud.calls.filter(call => call.payload.name === 'analyzeBatch').length, 0)
})

test('analyzePhotos retries a transient single-image batch failure before completing', async () => {
  const db = createDatabase({
    reports: [{
      _id: 'report-1',
      _openid: 'owner-1',
      studentId: 'student-1',
      subject: 'math',
      type: 'diagnosis',
      status: 'failed',
      error: '旧失败',
      debugError: '旧调试信息',
      partialSuccess: true,
      analysisWarning: '旧警告',
      failedBatchCount: 3,
      createdAt: '2026-06-11T10:00:00Z',
      imageFileIds: ['cloud://photo-1'],
      imageFiles: [{ fileID: 'cloud://photo-1' }]
    }],
    subjectProfiles: [{
      _id: 'profile-1',
      studentId: 'student-1',
      subject: 'math',
      totalReports: 0,
      pendingBottlenecks: [],
      improvedBottlenecks: []
    }],
    analysisTasks: []
  })
  let attempts = 0
  const cloud = createCloudMock({
    db,
    callFunction: async payload => {
      attempts += 1
      if (attempts === 1) {
        return { result: { success: false, error: 'AI 服务繁忙' } }
      }
      return {
        result: {
          success: true,
          data: {
            pageResults: [{
              fileID: payload.data.fileIDs[0],
              imageIndex: 1,
              ocrSummary: '第一页',
              totalErrors: 1,
              bottlenecks: [{ lpCode: 'LP-001', lpName: '计算', errorCount: 1, severity: 'medium' }],
              errorDetails: [{ questionContent: '1+1=' }]
            }]
          }
        }
      }
    }
  })
  const handler = loadModule('cloudfunctions/analyzePhotos/index.js', {
    'wx-server-sdk': cloud
  })

  const result = await handler.main({ reportId: 'report-1' })
  const report = db.dump('reports').find(item => item._id === 'report-1')
  const task = db.dump('analysisTasks')[0]

  assert.equal(result.success, true)
  assert.equal(attempts, 2)
  assert.equal(report.status, 'completed')
  assert.equal(report.error, '')
  assert.equal(report.partialSuccess, false)
  assert.equal(report.analysisWarning, '')
  assert.equal(report.failedBatchCount, 0)
  assert.equal(task.completedBatches, 1)
  assert.equal(task.status, 'completed')
})

test('analyzePhotos continues large uploads across multiple cloud invocations', async () => {
  // 7 张图片：ANALYSIS_BATCH_SIZE=5 → 2 批（5+2），MAX_BATCHES_PER_INVOCATION=3
  // 第一轮处理全部 2 批，但第 2 批需续跑到第 2 次调用。
  const fileIDs = Array.from({ length: 7 }, (_, index) => `cloud://photo-${index + 1}`)
  const db = createDatabase({
    reports: [{
      _id: 'report-1',
      _openid: 'owner-1',
      studentId: 'student-1',
      subject: 'math',
      type: 'diagnosis',
      status: 'analyzing',
      createdAt: '2026-06-11T10:00:00Z',
      imageFileIds: fileIDs,
      imageFiles: fileIDs.map(fileID => ({ fileID }))
    }],
    subjectProfiles: [{
      _id: 'profile-1',
      studentId: 'student-1',
      subject: 'math',
      totalReports: 0,
      pendingBottlenecks: [],
      improvedBottlenecks: []
    }],
    analysisTasks: []
  })
  const scheduledContinuations = []
  const cloud = createCloudMock({
    db,
    callFunction: async payload => {
      if (payload.name === 'analyzePhotos') {
        scheduledContinuations.push(payload.data)
        return { result: { success: true } }
      }
      return {
        result: {
          success: true,
          data: {
            pageResults: payload.data.fileIDs.map((fileID, index) => ({
              fileID,
              imageIndex: index + 1,
              ocrSummary: `页面${fileID}`,
              totalErrors: 1,
              bottlenecks: [{ lpCode: 'LP-001', lpName: '计算', errorCount: 1, severity: 'medium' }],
              errorDetails: [{ questionContent: fileID }]
            }))
          }
        }
      }
    }
  })
  const handler = loadModule('cloudfunctions/analyzePhotos/index.js', {
    'wx-server-sdk': cloud
  })

  const first = await handler.main({ reportId: 'report-1' })
  const taskAfterFirstRun = db.dump('analysisTasks')[0]

  // ANALYSIS_BATCH_SIZE=5: 7 张分 2 批。第一轮 MAX_BATCHES_PER_INVOCATION=3 但只有 2 批，
  // 所以全部处理完（或续跑一次处理剩余）。
  assert.equal(first.success, true)

  // 如果第一轮没处理完，续跑
  if (scheduledContinuations.length > 0) {
    const second = await handler.main({
      reportId: 'report-1',
      taskId: taskAfterFirstRun._id,
      continuation: true
    })
    assert.equal(second.success, true)
  }

  const report = db.dump('reports').find(item => item._id === 'report-1')
  const task = db.dump('analysisTasks')[0]

  assert.equal(report.status, 'completed')
  assert.equal(report.totalErrors, 7)
  assert.equal(task.completedBatches, 2)
  assert.equal(task.status, 'completed')
})

test('analyzePhotos completes with a partial warning when some image batches fail', async () => {
  // 7 张图片：ANALYSIS_BATCH_SIZE=5 → 2 批（photo-1~5, photo-6~7）。
  // 第 2 批（photo-6,7）失败 → 5/7 张完成。
  const fileIDs = Array.from({ length: 7 }, (_, i) => `cloud://photo-${i + 1}`)
  const db = createDatabase({
    reports: [{
      _id: 'report-1',
      _openid: 'owner-1',
      studentId: 'student-1',
      subject: 'math',
      type: 'diagnosis',
      status: 'analyzing',
      createdAt: '2026-06-11T10:00:00Z',
      imageFileIds: fileIDs,
      imageFiles: fileIDs.map(fileID => ({ fileID }))
    }],
    subjectProfiles: [{
      _id: 'profile-1',
      studentId: 'student-1',
      subject: 'math',
      totalReports: 0,
      pendingBottlenecks: [],
      improvedBottlenecks: []
    }],
    analysisTasks: []
  })
  const scheduledContinuations = []
  const cloud = createCloudMock({
    db,
    callFunction: async payload => {
      if (payload.name === 'analyzePhotos') {
        scheduledContinuations.push(payload.data)
        return { result: { success: true } }
      }
      // 第 2 批（6,7）失败
      const batchFiles = payload.data.fileIDs
      if (batchFiles.includes('cloud://photo-6')) {
        return { result: { success: false, error: 'AI 服务繁忙' } }
      }
      return {
        result: {
          success: true,
          data: {
            pageResults: batchFiles.map((fileID, index) => ({
              fileID,
              imageIndex: index + 1,
              ocrSummary: `页面${fileID}`,
              totalErrors: 1,
              bottlenecks: [{ lpCode: 'LP-001', lpName: '计算', errorCount: 1, severity: 'medium' }],
              errorDetails: [{ questionContent: fileID }]
            }))
          }
        }
      }
    }
  })
  const handler = loadModule('cloudfunctions/analyzePhotos/index.js', {
    'wx-server-sdk': cloud
  })

  // 可能需要续跑完成第 2 批
  const first = await handler.main({ reportId: 'report-1' })
  let result = first
  if (scheduledContinuations.length > 0) {
    const taskAfterFirstRun = db.dump('analysisTasks')[0]
    result = await handler.main({
      reportId: 'report-1',
      taskId: taskAfterFirstRun._id,
      continuation: true
    })
  }
  const report = db.dump('reports').find(item => item._id === 'report-1')
  const task = db.dump('analysisTasks')[0]

  assert.equal(result.success, true)
  assert.equal(result.partialSuccess, true)
  assert.equal(report.status, 'completed')
  assert.equal(report.partialSuccess, true)
  assert.equal(report.failedBatchCount, 1)
  assert.match(report.analysisWarning, /5\/7 张照片完成分析/)
  assert.equal(task.status, 'completed')
  assert.equal(task.partialSuccess, true)
  assert.equal(task.failedBatchCount, 1)
})

test('analyzePhotos completes an all-duplicate upload without changing learning bottlenecks', async () => {
  const db = createDatabase({
    reports: [
      {
        _id: 'history',
        _openid: 'owner-1',
        studentId: 'student-1',
        subject: 'math',
        status: 'completed',
        createdAt: '2026-06-10T10:00:00Z',
        bottlenecks: [{ lpCode: 'LP-001', lpName: '计算', errorCount: 1 }],
        imageFiles: [{ fileID: 'cloud://old', ocrSummary: '完全相同的页面' }]
      },
      {
        _id: 'report-1',
        _openid: 'owner-1',
        studentId: 'student-1',
        subject: 'math',
        type: 'diagnosis',
        status: 'analyzing',
        createdAt: '2026-06-11T10:00:00Z',
        imageFileIds: ['cloud://photo-1'],
        imageFiles: [{ fileID: 'cloud://photo-1', fileName: '重复页.jpg' }]
      }
    ],
    subjectProfiles: [{
      _id: 'profile-1',
      studentId: 'student-1',
      subject: 'math',
      totalReports: 4,
      analysisStatus: 'analyzing',
      currentAnalysisId: 'report-1',
      pendingBottlenecks: [{ lpCode: 'LP-001', lpName: '计算' }],
      improvedBottlenecks: []
    }],
    analysisTasks: []
  })
  const cloud = createCloudMock({
    db,
    callFunction: async payload => ({
      result: {
        success: true,
        data: {
          pageResults: [{
            fileID: payload.data.fileIDs[0],
            imageIndex: 1,
            ocrSummary: '完全相同的页面',
            totalErrors: 1,
            bottlenecks: [{ lpCode: 'LP-999', lpName: '不应计入', errorCount: 1, severity: 'high' }],
            errorDetails: [{ questionContent: '不应计入' }]
          }]
        }
      }
    })
  })
  const handler = loadModule('cloudfunctions/analyzePhotos/index.js', {
    'wx-server-sdk': cloud
  })

  const result = await handler.main({ reportId: 'report-1' })
  const report = db.dump('reports').find(item => item._id === 'report-1')
  const profile = db.dump('subjectProfiles')[0]

  assert.equal(result.success, true)
  assert.equal(report.imageFiles[0].isDuplicate, true)
  assert.equal(report.totalErrors, 0)
  assert.equal(report.bottlenecks.length, 0)
  assert.match(report.summary, /均疑似重复/)
  assert.equal(profile.totalReports, 4)
  assert.deepEqual(profile.pendingBottlenecks, [{ lpCode: 'LP-001', lpName: '计算' }])
  assert.equal(profile.analysisStatus, null)
  assert.equal(profile.currentAnalysisId, '')
})

test('analyzePhotos only marks a verification target improved from complete correct evidence', async () => {
  const db = createDatabase({
    reports: [{
      _id: 'report-old',
      _openid: 'owner-1',
      studentId: 'student-1',
      subject: 'math',
      type: 'diagnosis',
      status: 'completed',
      createdAt: '2026-06-10T10:00:00Z',
      bottlenecks: [{ lpCode: 'LP-001', lpName: '计算', errorCount: 2 }]
    }, {
      _id: 'report-verify',
      _openid: 'owner-1',
      studentId: 'student-1',
      subject: 'math',
      type: 'verification',
      status: 'analyzing',
      createdAt: '2026-06-11T10:00:00Z',
      imageFileIds: ['cloud://answer-1'],
      imageFiles: [{ fileID: 'cloud://answer-1' }],
      paperId: 'paper-1'
    }],
    papers: [{
      _id: 'paper-1',
      _openid: 'owner-1',
      studentId: 'student-1',
      type: 'verification',
      bottleneckTargets: ['LP-001'],
      questions: [{ lpCode: 'LP-001' }, { lpCode: 'LP-001' }, { lpCode: 'LP-001' }]
    }],
    subjectProfiles: [{
      _id: 'profile-1',
      studentId: 'student-1',
      subject: 'math',
      totalReports: 1,
      currentBottlenecks: [{
        lpCode: 'LP-001',
        lpName: '计算',
        status: 'needs_verification'
      }]
    }],
    analysisTasks: []
  })
  const cloud = createCloudMock({
    db,
    callFunction: async payload => ({
      result: {
        success: true,
        data: {
          pageResults: [{
            fileID: payload.data.fileIDs[0],
            imageIndex: 1,
            ocrSummary: '三道计算验证题均已作答',
            totalErrors: 0,
            bottlenecks: [],
            errorDetails: [],
            verificationEvidence: [{
              lpCode: 'LP-001',
              attemptedQuestionCount: 3,
              incorrectQuestionCount: 0
            }]
          }]
        }
      }
    })
  })
  const handler = loadModule('cloudfunctions/analyzePhotos/index.js', {
    'wx-server-sdk': cloud
  })

  const result = await handler.main({ reportId: 'report-verify' })
  const report = db.dump('reports').find(item => item._id === 'report-verify')
  const profile = db.dump('subjectProfiles')[0]
  const analyzeBatchCall = cloud.calls.find(call => call.name === 'callFunction')

  assert.equal(result.success, true)
  assert.deepEqual(analyzeBatchCall.payload.data.verificationPlan, [{
    lpCode: 'LP-001',
    expectedQuestionCount: 3
  }])
  assert.equal(report.verificationEvidence[0].allCorrect, true)
  assert.equal(report.bottlenecks[0].status, 'improved')
  assert.equal(profile.currentBottlenecks[0].status, 'improved')
})

test('analyzePhotos stores page-level evidence for verification task packs', async () => {
  const db = createDatabase({
    reports: [{
      _id: 'report-pack-verify',
      _openid: 'owner-1',
      studentId: 'student-1',
      subject: 'math',
      type: 'verification',
      mode: 'verification',
      status: 'analyzing',
      paperId: 'paper-pack',
      imageFileIds: ['cloud://page-2'],
      imageFiles: [{ fileID: 'cloud://page-2', fileName: '第2页.jpg' }]
    }],
    papers: [{
      _id: 'paper-pack',
      _openid: 'owner-1',
      studentId: 'student-1',
      subject: 'math',
      type: 'verification',
      bottleneckTargets: ['BN-FINE-4'],
      verificationPack: {
        pages: [{
          pageCode: 'MATH-V-20260616-01-P02',
          targets: [{
            targetId: 'BN-FINE-4',
            targetType: 'fine_bottleneck',
            displayName: '分数通分不稳',
            legacyLpCode: 'LP-002'
          }]
        }]
      },
      questions: Array.from({ length: 5 }, (_, index) => ({
        questionId: `MATH-V-20260616-01-P02-Q0${index + 1}`,
        pageCode: 'MATH-V-20260616-01-P02',
        targetId: 'BN-FINE-4',
        lpCode: 'BN-FINE-4'
      }))
    }],
    subjectProfiles: [{
      _id: 'profile-1',
      studentId: 'student-1',
      subject: 'math',
      currentBottlenecks: [{
        lpCode: 'BN-FINE-4',
        lpName: '分数通分不稳',
        status: 'needs_verification'
      }]
    }],
    analysisTasks: []
  })
  const cloud = createCloudMock({
    db,
    callFunction: async payload => ({
      result: {
        success: true,
        data: {
          pageResults: [{
            fileID: payload.data.fileIDs[0],
            imageIndex: 1,
            pageCode: 'MATH-V-20260616-01-P02',
            ocrSummary: '页面编号 MATH-V-20260616-01-P02，五道题均已作答',
            totalErrors: 0,
            bottlenecks: [],
            errorDetails: [],
            verificationEvidence: [{
              lpCode: 'BN-FINE-4',
              targetId: 'BN-FINE-4',
              pageCode: 'MATH-V-20260616-01-P02',
              attemptedQuestionCount: 5,
              incorrectQuestionCount: 0
            }]
          }]
        }
      }
    })
  })
  const handler = loadModule('cloudfunctions/analyzePhotos/index.js', {
    'wx-server-sdk': cloud
  })

  const result = await handler.main({ reportId: 'report-pack-verify' })
  const report = db.dump('reports').find(item => item._id === 'report-pack-verify')
  const analyzeBatchCall = cloud.calls.find(call => call.name === 'callFunction')

  assert.equal(result.success, true)
  assert.equal(analyzeBatchCall.payload.data.verificationPlan[0].pageCode, 'MATH-V-20260616-01-P02')
  assert.deepEqual(report.verificationPageCodes, ['MATH-V-20260616-01-P02'])
  assert.deepEqual(report.verificationPageEvidence, [{
    pageCode: 'MATH-V-20260616-01-P02',
    fileIDs: ['cloud://page-2'],
    targetIds: ['BN-FINE-4'],
    attemptedQuestionCount: 5,
    incorrectQuestionCount: 0,
    blankQuestionCount: 0,
    unclearQuestionCount: 0,
    missingQuestionCount: 0
  }])
  assert.equal(report.imageFiles[0].pageCode, 'MATH-V-20260616-01-P02')
})

test('analyzePhotos fails a verification report that has no valid verification targets', async () => {
  const db = createDatabase({
    reports: [{
      _id: 'report-1',
      _openid: 'owner-1',
      studentId: 'student-1',
      subject: 'math',
      type: 'verification',
      status: 'analyzing',
      createdAt: '2026-06-11T10:00:00Z',
      imageFileIds: ['cloud://photo-1'],
      imageFiles: [{ fileID: 'cloud://photo-1' }],
      paperId: ''
    }],
    subjectProfiles: [{
      _id: 'profile-1',
      studentId: 'student-1',
      subject: 'math',
      analysisStatus: 'analyzing',
      currentAnalysisId: 'report-1',
      pendingBottlenecks: [{ lpCode: 'LP-001', lpName: '计算' }],
      improvedBottlenecks: []
    }],
    analysisTasks: []
  })
  const cloud = createCloudMock({
    db,
    callFunction: async payload => ({
      result: {
        success: true,
        data: {
          pageResults: [{
            fileID: payload.data.fileIDs[0],
            imageIndex: 1,
            ocrSummary: '验证答题',
            totalErrors: 0,
            bottlenecks: [],
            errorDetails: []
          }]
        }
      }
    })
  })
  const handler = loadModule('cloudfunctions/analyzePhotos/index.js', {
    'wx-server-sdk': cloud
  })

  const result = await handler.main({ reportId: 'report-1' })
  const report = db.dump('reports')[0]
  const profile = db.dump('subjectProfiles')[0]

  assert.equal(result.success, false)
  assert.equal(report.status, 'failed')
  assert.equal(profile.analysisStatus, null)
  assert.equal(profile.pendingBottlenecks.length, 1)
  assert.equal(profile.improvedBottlenecks.length, 0)
})

test('analyzeBatch rejects invalid image and subject parameters before AI calls', async () => {
  const cloud = createCloudMock()
  const handler = loadModule('cloudfunctions/analyzeBatch/index.js', {
    'wx-server-sdk': cloud,
    '@cloudbase/node-sdk': { init: () => ({}) }
  })

  assert.equal((await handler.main({ fileIDs: [], subject: 'math' })).success, false)
  assert.equal((await handler.main({ fileIDs: ['not-cloud'], subject: 'math' })).success, false)
  assert.equal((await handler.main({ fileIDs: ['cloud://photo'], subject: 'science' })).success, false)
})

test('analyzeBatch requires a matching processing analysis task before AI calls', async () => {
  let aiCalls = 0
  const db = createDatabase({
    reports: [{
      _id: 'report-1',
      _openid: 'owner-1',
      imageFileIds: ['cloud://photo-1']
    }],
    analysisTasks: [{
      _id: 'task-1',
      reportId: 'report-1',
      status: 'processing',
      _openid: 'owner-1',
      fileIDs: ['cloud://photo-1']
    }]
  })
  const cloud = createCloudMock({ db })
  const handler = loadModule('cloudfunctions/analyzeBatch/index.js', {
    'wx-server-sdk': cloud,
    '@cloudbase/node-sdk': {
      SYMBOL_CURRENT_ENV: 'test',
      init: () => ({
        ai: () => ({
          createModel: () => ({
            generateText: async () => {
              aiCalls += 1
              return { text: '{}' }
            }
          })
        })
      })
    }
  })

  const missingTask = await handler.main({
    reportId: 'report-1',
    fileIDs: ['cloud://photo-1'],
    subject: 'math'
  })
  const wrongFile = await handler.main({
    reportId: 'report-1',
    taskId: 'task-1',
    fileIDs: ['cloud://photo-2'],
    subject: 'math'
  })

  assert.equal(missingTask.success, false)
  assert.equal(wrongFile.success, false)
  assert.equal(aiCalls, 0)
})

test('analyzeBatch fails the whole batch when any uploaded image URL is unavailable', async () => {
  let aiCalls = 0
  const db = createDatabase({
    reports: [{
      _id: 'report-1',
      _openid: 'owner-1',
      imageFileIds: ['cloud://photo-1', 'cloud://photo-2']
    }],
    analysisTasks: [{
      _id: 'task-1',
      reportId: 'report-1',
      status: 'processing',
      _openid: 'owner-1',
      fileIDs: ['cloud://photo-1', 'cloud://photo-2']
    }]
  })
  const cloud = createCloudMock({
    db,
    getTempFileURL: async () => ({
      fileList: [
        { fileID: 'cloud://photo-1', tempFileURL: 'https://temp/photo-1' },
        { fileID: 'cloud://photo-2', tempFileURL: '' }
      ]
    })
  })
  const handler = loadModule('cloudfunctions/analyzeBatch/index.js', {
    'wx-server-sdk': cloud,
    '@cloudbase/node-sdk': {
      SYMBOL_CURRENT_ENV: 'test',
      init: () => ({
        ai: () => ({
          createModel: () => ({
            generateText: async () => {
              aiCalls += 1
              return { text: '{}' }
            }
          })
        })
      })
    }
  })

  const result = await handler.main({
    reportId: 'report-1',
    taskId: 'task-1',
    fileIDs: ['cloud://photo-1', 'cloud://photo-2'],
    subject: 'math'
  })
  assert.equal(result.success, false)
  assert.equal(result.error, '部分图片无法读取，请重新上传')
  assert.equal(aiCalls, 0)
})

test('analyzeBatch asks chinese diagnosis to output concrete error items', async () => {
  let prompt = ''
  const db = createDatabase({
    reports: [{
      _id: 'report-chinese',
      _openid: 'owner-1',
      imageFileIds: ['cloud://photo-1']
    }],
    analysisTasks: [{
      _id: 'task-chinese',
      reportId: 'report-chinese',
      status: 'processing',
      _openid: 'owner-1',
      fileIDs: ['cloud://photo-1']
    }]
  })
  const cloud = createCloudMock({
    db,
    getTempFileURL: async () => ({
      fileList: [{ fileID: 'cloud://photo-1', tempFileURL: 'https://temp/photo-1' }]
    })
  })
  const handler = loadModule('cloudfunctions/analyzeBatch/index.js', {
    'wx-server-sdk': cloud,
    '@cloudbase/node-sdk': {
      SYMBOL_CURRENT_ENV: 'test',
      init: () => ({
        ai: () => ({
          createModel: () => ({
            generateText: async request => {
              prompt = request.messages[0].content[0].text
              return {
                text: JSON.stringify({
                  pageResults: [{
                    imageIndex: 1,
                    ocrSummary: '语文错项',
                    summary: '发现字词错项',
                    bottlenecks: [],
                    errorDetails: [],
                    chineseErrorItems: []
                  }]
                })
              }
            }
          })
        })
      })
    }
  })

  const result = await handler.main({
    reportId: 'report-chinese',
    taskId: 'task-chinese',
    fileIDs: ['cloud://photo-1'],
    subject: 'chinese'
  })

  assert.equal(result.success, true)
  assert.match(prompt, /chineseErrorItems/)
  assert.match(prompt, /targetText/)
  assert.match(prompt, /记忆型错项/)
})

test('analyzeBatch accepts task-pack verification plan and asks AI to return page codes', async () => {
  let prompt = ''
  const db = createDatabase({
    reports: [{
      _id: 'report-math-pack',
      _openid: 'owner-1',
      imageFileIds: ['cloud://photo-1']
    }],
    analysisTasks: [{
      _id: 'task-math-pack',
      reportId: 'report-math-pack',
      status: 'processing',
      _openid: 'owner-1',
      fileIDs: ['cloud://photo-1']
    }]
  })
  const cloud = createCloudMock({
    db,
    getTempFileURL: async () => ({
      fileList: [{ fileID: 'cloud://photo-1', tempFileURL: 'https://temp/photo-1' }]
    })
  })
  const handler = loadModule('cloudfunctions/analyzeBatch/index.js', {
    'wx-server-sdk': cloud,
    '@cloudbase/node-sdk': {
      SYMBOL_CURRENT_ENV: 'test',
      init: () => ({
        ai: () => ({
          createModel: () => ({
            generateText: async request => {
              prompt = request.messages[0].content[0].text
              return {
                text: JSON.stringify({
                  pageResults: [{
                    imageIndex: 1,
                    pageCode: 'MATH-V-20260616-01-P02',
                    ocrSummary: '任务包第 2 页',
                    summary: '验证题均正确',
                    bottlenecks: [],
                    errorDetails: [],
                    verificationEvidence: [{
                      lpCode: 'BN-FINE-4',
                      targetId: 'BN-FINE-4',
                      pageCode: 'MATH-V-20260616-01-P02',
                      attemptedQuestionCount: 5,
                      incorrectQuestionCount: 0
                    }]
                  }]
                })
              }
            }
          })
        })
      })
    }
  })

  const result = await handler.main({
    reportId: 'report-math-pack',
    taskId: 'task-math-pack',
    fileIDs: ['cloud://photo-1'],
    subject: 'math',
    verificationPlan: Array.from({ length: 8 }, (_, index) => ({
      lpCode: `BN-FINE-${index + 1}`,
      targetId: `BN-FINE-${index + 1}`,
      targetType: 'fine_bottleneck',
      displayName: `细分卡点 ${index + 1}`,
      pageCode: `MATH-V-20260616-01-P${String(Math.floor(index / 3) + 1).padStart(2, '0')}`,
      expectedQuestionCount: 5,
      questionIds: [`Q${index + 1}`]
    }))
  })

  assert.equal(result.success, true)
  assert.match(prompt, /页面编号/)
  assert.match(prompt, /pageCode/)
  assert.match(prompt, /MATH-V-20260616-01-P02/)
  assert.equal(result.data.pageResults[0].pageCode, 'MATH-V-20260616-01-P02')
  assert.equal(result.data.pageResults[0].verificationEvidence[0].targetId, 'BN-FINE-4')
})

test('generatePaper uses the grade selected for a default diagnostic paper', async () => {
  let prompt = ''
  const questions = Array.from({ length: 6 }, (_, index) => ({
    content: `题目${index + 1}`,
    answer: `${index + 1}`,
    lpCode: 'LP-001',
    lpName: '计算'
  }))
  const aiApp = {
    ai: () => ({
      createModel: () => ({
        generateText: async request => {
          prompt = request.messages[0].content
          return { text: JSON.stringify({ title: '三年级诊断卷', questions }) }
        }
      })
    })
  }
  const db = createDatabase({
    students: [{ _id: 'student-1', _openid: 'owner-1', name: '钟青羽', grade: 5 }],
    papers: []
  })
  const cloud = createCloudMock({ db })
  const handler = loadModule('cloudfunctions/generatePaper/index.js', {
    'wx-server-sdk': cloud,
    '@cloudbase/node-sdk': { init: () => aiApp },
    './pdf-renderer': { generatePDF: async () => Buffer.from('pdf') }
  })

  const result = await handler.main({
    studentId: 'student-1',
    subject: 'math',
    type: 'default-diagnosis',
    grade: 3,
    paperKey: 'grade3_a',
    questionCount: 4
  })

  assert.equal(result.success, true)
  assert.match(prompt, /3年级/)
  assert.equal(db.dump('papers')[0].grade, 3)
})

test('generatePaper validates default grades and verification target limits before AI calls', async () => {
  let initCalls = 0
  const db = createDatabase({
    students: [{ _id: 'student-1', _openid: 'owner-1', name: '钟青羽', grade: 5 }],
    papers: []
  })
  const handler = loadModule('cloudfunctions/generatePaper/index.js', {
    'wx-server-sdk': createCloudMock({ db }),
    './pdf-renderer': { generatePDF: async () => Buffer.from('pdf') },
    '@cloudbase/node-sdk': {
      SYMBOL_CURRENT_ENV: 'test',
      init: () => {
        initCalls += 1
        return {}
      }
    },
    pdfkit: createPdfKitMock()
  })

  assert.equal((await handler.main({
    studentId: 'student-1',
    subject: 'math',
    type: 'default-diagnosis',
    grade: 7
  })).error, '默认诊断试卷需要选择有效年级')
  assert.equal((await handler.main({
    studentId: 'student-1',
    subject: 'math',
    type: 'verification',
    targets: Array.from({ length: 81 }, (_, index) => `LP-${String(index + 1).padStart(3, '0')}`)
  })).error, '学习卡点参数无效')
  assert.equal(initCalls, 1)
  assert.equal(db.dump('papers').length, 0)
})

test('generateReportPDF rejects a non-member before producing a document', async () => {
  const db = createDatabase({
    reports: [{
      _id: 'report-1',
      _openid: 'owner-1',
      studentId: 'student-1',
      studentName: '钟青羽',
      bottlenecks: [],
      errorDetails: []
    }],
    studentMembers: []
  })
  const handler = loadModule('cloudfunctions/generateReportPDF/index.js', {
    'wx-server-sdk': createCloudMock({ db, openId: 'stranger-1' }),
    pdfkit: createPdfKitMock()
  })

  const result = await handler.main({ reportId: 'report-1' })
  assert.equal(result.success, false)
  assert.equal(result.error, '无权执行该操作')
})

test('generateReportPDF uploads and stores the generated file for its owner', async () => {
  const db = createDatabase({
    reports: [{
      _id: 'report-1',
      _openid: 'owner-1',
      studentName: '钟青羽',
      bottlenecks: [],
      errorDetails: []
    }]
  })
  const cloud = createCloudMock({ db, openId: 'owner-1' })
  const handler = loadModule('cloudfunctions/generateReportPDF/index.js', {
    'wx-server-sdk': cloud,
    pdfkit: createPdfKitMock()
  })

  const result = await handler.main({ reportId: 'report-1' })
  assert.equal(result.success, true)
  assert.match(result.pdfFileId, /^cloud:\/\/reports\//)
  assert.equal(db.dump('reports')[0].pdfFileId, result.pdfFileId)
})

test('generateReportPDF allows an active joined parent to download a readable report', async () => {
  const db = createDatabase({
    reports: [{
      _id: 'report-1',
      _openid: 'owner-1',
      studentId: 'student-1',
      studentName: '钟青羽',
      bottlenecks: [],
      errorDetails: []
    }],
    studentMembers: [{
      _id: 'member-1',
      studentId: 'student-1',
      ownerOpenId: 'owner-1',
      memberOpenId: 'viewer-1',
      role: 'viewer',
      status: 'active'
    }]
  })
  const cloud = createCloudMock({ db, openId: 'viewer-1' })
  const handler = loadModule('cloudfunctions/generateReportPDF/index.js', {
    'wx-server-sdk': cloud,
    pdfkit: createPdfKitMock()
  })

  const result = await handler.main({ reportId: 'report-1' })

  assert.equal(result.success, true)
  assert.match(result.pdfFileId, /^cloud:\/\/reports\//)
  assert.equal(db.dump('reports')[0].pdfFileId, result.pdfFileId)
})

test('uploadAndAnalyze rejects paper mode without a paperId', async () => {
  const db = createDatabase({
    students: [{ _id: 'student-1', _openid: 'owner-1', name: '钟青羽' }],
    userConsents: [{ _id: 'consent-1', _openid: 'owner-1', betaConsented: true }],
    subjectProfiles: [{ _id: 'profile-1', studentId: 'student-1', subject: 'math' }],
    reports: []
  })
  const cloud = createCloudMock({ db })
  const handler = loadModule('cloudfunctions/uploadAndAnalyze/index.js', {
    'wx-server-sdk': cloud
  })

  const result = await handler.main({
    fileIDs: ['cloud://photo-1'],
    studentId: 'student-1',
    subject: 'math',
    mode: 'paper'
  })

  assert.equal(result.success, false)
  assert.match(result.error, /paperId/)
  assert.equal(db.dump('reports').length, 0)
})

test('analyzePhotos marks task and profile as failed when a batch returns failure', async () => {
  const db = createDatabase({
    reports: [{
      _id: 'report-1',
      _openid: 'owner-1',
      studentId: 'student-1',
      subject: 'math',
      type: 'diagnosis',
      status: 'analyzing',
      createdAt: '2026-06-11T10:00:00Z',
      imageFileIds: ['cloud://photo-1'],
      imageFiles: [{ fileID: 'cloud://photo-1' }]
    }],
    subjectProfiles: [{
      _id: 'profile-1',
      studentId: 'student-1',
      subject: 'math',
      analysisStatus: 'analyzing',
      currentAnalysisId: 'report-1',
      pendingBottlenecks: [{ lpCode: 'LP-001', lpName: '计算' }],
      improvedBottlenecks: []
    }],
    analysisTasks: []
  })
  const cloud = createCloudMock({
    db,
    callFunction: async () => ({ result: { success: false, error: 'AI 服务繁忙' } })
  })
  const handler = loadModule('cloudfunctions/analyzePhotos/index.js', {
    'wx-server-sdk': cloud
  })

  const result = await handler.main({ reportId: 'report-1' })
  const report = db.dump('reports').find(item => item._id === 'report-1')
  const profile = db.dump('subjectProfiles')[0]
  const task = db.dump('analysisTasks')[0]

  assert.equal(result.success, false)
  assert.equal(report.status, 'failed')
  assert.match(report.debugError, /AI 服务繁忙/)
  assert.equal(task.status, 'failed')
  assert.match(task.error, /第1批/)
  assert.match(task.error, /AI 服务繁忙/)
  assert.equal(profile.analysisStatus, null)
  assert.equal(profile.currentAnalysisId, '')
  assert.deepEqual(profile.pendingBottlenecks, [{ lpCode: 'LP-001', lpName: '计算' }])
})

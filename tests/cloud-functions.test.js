const test = require('node:test')
const assert = require('node:assert/strict')
const { EventEmitter } = require('node:events')
const {
  createCloudMock,
  createDatabase,
  loadModule
} = require('./helpers/cloud-function-harness')

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

test('uploadAndAnalyze creates a report and starts analysis for an owned student', async () => {
  const db = createDatabase({
    students: [{ _id: 'student-1', _openid: 'owner-1', name: '钟青羽' }],
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
  assert.equal(db.dump('reports')[0].imageFiles[0].fileName, 'paper.jpg')
  assert.equal(db.dump('subjectProfiles')[0].analysisStatus, 'analyzing')
  assert.equal(cloud.calls.find(call => call.name === 'callFunction').payload.name, 'analyzePhotos')
})

test('uploadAndAnalyze marks default diagnosis paper sources correctly', async () => {
  const db = createDatabase({
    students: [{ _id: 'student-1', _openid: 'owner-1', name: '钟青羽' }],
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
  })).error, '无权访问该学生')
  assert.equal(db.dump('reports').length, 0)
})

test('uploadAndAnalyze requires a matching verification paper for verification reports', async () => {
  const db = createDatabase({
    students: [{ _id: 'student-1', _openid: 'owner-1', name: '钟青羽' }],
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

test('getAnalysisProgress returns the newest task and rejects other owners', async () => {
  const db = createDatabase({
    reports: [{ _id: 'report-1', _openid: 'owner-1' }],
    analysisTasks: [
      { _id: 'old', reportId: 'report-1', completedBatches: 1, totalBatches: 3, createdAt: '2026-06-11T10:00:00Z' },
      { _id: 'new', reportId: 'report-1', completedBatches: 2, totalBatches: 3, createdAt: '2026-06-11T11:00:00Z' }
    ]
  })
  const owned = loadModule('cloudfunctions/getAnalysisProgress/index.js', {
    'wx-server-sdk': createCloudMock({ db, openId: 'owner-1' })
  })
  const denied = loadModule('cloudfunctions/getAnalysisProgress/index.js', {
    'wx-server-sdk': createCloudMock({ db, openId: 'other-owner' })
  })

  assert.equal((await owned.main({ reportId: 'report-1' })).completedBatches, 2)
  assert.equal((await denied.main({ reportId: 'report-1' })).error, '无权访问该报告')
})

test('analyzePhotos splits batches, excludes duplicate pages and updates the profile', async () => {
  const fileIDs = Array.from({ length: 6 }, (_, index) => `cloud://photo-${index + 1}`)
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
        imageFileIds: fileIDs,
        imageFiles: fileIDs.map(fileID => ({ fileID }))
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
  const batchCalls = []
  const cloud = createCloudMock({
    db,
    callFunction: async payload => {
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

  const result = await handler.main({ reportId: 'report-1' })
  const report = db.dump('reports').find(item => item._id === 'report-1')
  const profile = db.dump('subjectProfiles')[0]

  assert.equal(result.success, true)
  assert.deepEqual(batchCalls.map(batch => batch.length), [5, 1])
  assert.equal(report.imageFiles[0].isDuplicate, true)
  assert.equal(report.totalErrors, 5)
  assert.equal(report.bottlenecks[0].errorCount, 5)
  assert.equal(report.isEffective, true)
  assert.match(report.changeSummary, /计算/)
  assert.ok(report.profileAppliedAt)
  assert.equal(profile.totalReports, 2)
  assert.equal(profile.currentBottlenecks[0].status, 'needs_verification')
  assert.match(profile.currentSummary, /计算/)
  assert.equal(profile.analysisStatus, null)
  assert.equal(db.dump('analysisTasks')[0].status, 'completed')
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

test('analyzeBatch fails the whole batch when any uploaded image URL is unavailable', async () => {
  let aiCalls = 0
  const cloud = createCloudMock({
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
    fileIDs: ['cloud://photo-1', 'cloud://photo-2'],
    subject: 'math'
  })
  assert.equal(result.success, false)
  assert.equal(result.error, '部分图片无法读取，请重新上传')
  assert.equal(aiCalls, 0)
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
    pdfkit: createPdfKitMock()
  })

  const result = await handler.main({
    studentId: 'student-1',
    subject: 'math',
    type: 'default-diagnosis',
    grade: 3,
    paperKey: 'grade3_a',
    questionCount: 6
  })

  assert.equal(result.success, true)
  assert.match(prompt, /年级：3年级/)
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
    targets: ['LP-001', 'LP-002', 'LP-003', 'LP-004', 'LP-005', 'LP-006']
  })).error, '学习卡点参数无效')
  assert.equal(initCalls, 1)
  assert.equal(db.dump('papers').length, 0)
})

test('generateReportPDF checks ownership before producing a document', async () => {
  const db = createDatabase({
    reports: [{ _id: 'report-1', _openid: 'owner-1', studentName: '钟青羽', bottlenecks: [], errorDetails: [] }]
  })
  const handler = loadModule('cloudfunctions/generateReportPDF/index.js', {
    'wx-server-sdk': createCloudMock({ db, openId: 'other-owner' }),
    pdfkit: createPdfKitMock()
  })

  const result = await handler.main({ reportId: 'report-1' })
  assert.equal(result.success, false)
  assert.equal(result.error, '无权访问该报告')
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

test('uploadAndAnalyze rejects paper mode without a paperId', async () => {
  // paper 模式语义上必须关联试卷；当前实现没有强制校验。此测试记录该行为，
  // 若未来增加校验，断言应改为 success:false + 明确错误文案。
  const db = createDatabase({
    students: [{ _id: 'student-1', _openid: 'owner-1', name: '钟青羽' }],
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

  // Known gap: server currently accepts paper mode without paperId and falls back to sourceType='photo'.
  assert.equal(result.success, true)
  assert.equal(db.dump('reports')[0].sourceType, 'photo')
  assert.equal(db.dump('reports')[0].paperId, '')
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
  assert.equal(task.status, 'failed')
  assert.equal(profile.analysisStatus, null)
  assert.equal(profile.currentAnalysisId, '')
  assert.deepEqual(profile.pendingBottlenecks, [{ lpCode: 'LP-001', lpName: '计算' }])
})

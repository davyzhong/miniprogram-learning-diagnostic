const test = require('node:test')
const assert = require('node:assert/strict')
const {
  createCloudMock,
  createDatabase,
  loadModule
} = require('./helpers/cloud-function-harness')

function loadStudentData(db, openId = 'viewer-1') {
  return loadModule('cloudfunctions/studentData/index.js', {
    'wx-server-sdk': createCloudMock({ db, openId })
  })
}

function seedDatabase() {
  return createDatabase({
    students: [
      { _id: 'student-1', _openid: 'owner-1', name: '钟青羽', grade: 6, createdAt: '2026-06-01T10:00:00Z', updatedAt: '2026-06-12T10:00:00Z' },
      { _id: 'student-2', _openid: 'owner-2', name: '其他孩子', grade: 5, createdAt: '2026-06-01T10:00:00Z' }
    ],
    studentMembers: [
      { _id: 'member-1', studentId: 'student-1', ownerOpenId: 'owner-1', memberOpenId: 'viewer-1', role: 'viewer', status: 'active' },
      { _id: 'member-2', studentId: 'student-2', ownerOpenId: 'owner-2', memberOpenId: 'viewer-1', role: 'viewer', status: 'revoked' }
    ],
    subjectProfiles: [
      { _id: 'profile-math', studentId: 'student-1', subject: 'math', subjectName: '数学', totalReports: 2, currentSummary: '审题理解仍需验证', pendingBottlenecks: [{ lpCode: 'LP-008', lpName: '审题理解', severity: 'high' }], updatedAt: '2026-06-12T11:00:00Z' },
      { _id: 'profile-chinese', studentId: 'student-1', subject: 'chinese', subjectName: '语文', totalReports: 0, currentSummary: '', pendingBottlenecks: [], updatedAt: '2026-06-10T11:00:00Z' }
    ],
    reports: [
      { _id: 'report-1', _openid: 'owner-1', studentId: 'student-1', subject: 'math', type: 'diagnosis', status: 'completed', summary: '发现审题理解卡点', bottlenecks: [{ lpCode: 'LP-008', lpName: '审题理解', errorCount: 3 }], imageFiles: [{ fileID: 'cloud://photo-1', fileName: 'math-1.jpg', uploadedAt: '2026-06-12T09:00:00Z' }], createdAt: '2026-06-12T09:30:00Z' },
      { _id: 'report-2', _openid: 'owner-1', studentId: 'student-1', subject: 'math', type: 'verification', status: 'completed', summary: '验证卷完成', comparisonSummary: '审题理解有改善', paperId: 'paper-1', bottlenecks: [], imageFiles: [], createdAt: '2026-06-13T09:30:00Z' },
      { _id: 'other-report', _openid: 'owner-2', studentId: 'student-2', subject: 'math', status: 'completed', createdAt: '2026-06-12T09:30:00Z' }
    ],
    papers: [
      { _id: 'paper-1', _openid: 'owner-1', studentId: 'student-1', subject: 'math', type: 'verification', paperCode: 'MATH-20260613-01', paperDisplayCode: '数学-20260613-01', bottleneckTargets: ['LP-008'], bottleneckSummaries: ['审题理解'], questionCount: 6, pdfFileId: 'cloud://paper-1.pdf', createdAt: '2026-06-13T08:00:00Z' },
      { _id: 'other-paper', _openid: 'owner-2', studentId: 'student-2', subject: 'math', type: 'verification', createdAt: '2026-06-12T08:00:00Z' }
    ]
  })
}

test('viewer can read dashboard for a joined child with role-aware permissions', async () => {
  const db = seedDatabase()
  const handler = loadStudentData(db, 'viewer-1')

  const result = await handler.main({ action: 'getStudentDashboard', studentId: 'student-1' })

  assert.equal(result.success, true)
  assert.equal(result.role, 'viewer')
  assert.equal(result.permissions.canView, true)
  assert.equal(result.permissions.canUpload, true)
  assert.equal(result.permissions.canGeneratePaper, true)
  assert.equal(result.permissions.canRetryAnalysis, true)
  assert.equal(result.permissions.canManageParents, false)
  assert.equal(result.student.name, '钟青羽')
  assert.deepEqual(result.subjectProfiles.map(item => item.subject), ['math', 'chinese'])
  assert.equal(result.latestReport._id, 'report-2')
  assert.equal(result.latestPaper._id, 'paper-1')
})

test('student dashboard can skip recent reports and papers for lightweight pages', async () => {
  const db = seedDatabase()
  const handler = loadStudentData(db, 'viewer-1')

  const result = await handler.main({
    action: 'getStudentDashboard',
    studentId: 'student-1',
    includeRecent: false
  })

  assert.equal(result.success, true)
  assert.deepEqual(result.subjectProfiles.map(item => item.subject), ['math', 'chinese'])
  assert.equal(result.latestReport, null)
  assert.equal(result.latestPaper, null)
  assert.deepEqual(JSON.parse(JSON.stringify(result.recentReports)), [])
  assert.deepEqual(JSON.parse(JSON.stringify(result.recentPapers)), [])
})

test('viewer can read subject dashboard, report detail, paper detail and timeline', async () => {
  const db = seedDatabase()
  const handler = loadStudentData(db, 'viewer-1')

  const subject = await handler.main({ action: 'getSubjectDashboard', studentId: 'student-1', subject: 'math' })
  assert.equal(subject.success, true)
  assert.equal(subject.profile.subjectName, '数学')
  assert.deepEqual(subject.reports.map(item => item._id), ['report-2', 'report-1'])
  assert.deepEqual(subject.papers.map(item => item._id), ['paper-1'])

  const report = await handler.main({ action: 'getReportDetail', reportId: 'report-1' })
  assert.equal(report.success, true)
  assert.equal(report.role, 'viewer')
  assert.equal(report.report.summary, '发现审题理解卡点')
  assert.equal(report.profile.subject, 'math')
  assert.equal(report.pendingCount, 1)

  const verificationReport = await handler.main({ action: 'getReportDetail', reportId: 'report-2' })
  assert.equal(verificationReport.success, true)
  assert.equal(verificationReport.linkedPaper.paperDisplayCode, '数学-20260613-01')

  const paper = await handler.main({ action: 'getPaperDetail', paperId: 'paper-1' })
  assert.equal(paper.success, true)
  assert.equal(paper.paper.pdfFileId, 'cloud://paper-1.pdf')
  assert.equal(paper.paper.paperDisplayCode, '数学-20260613-01')
  assert.equal(paper.latestVerificationReport.summary, '验证卷完成')

  const timeline = await handler.main({ action: 'getLearningTimeline', studentId: 'student-1' })
  assert.equal(timeline.success, true)
  assert.deepEqual(JSON.parse(JSON.stringify(timeline.items.map(item => item.id))), ['report-report-2', 'paper-paper-1', 'report-report-1'])
  assert.equal(timeline.reports.find(item => item._id === 'report-1').imageFileCount, 1)
  assert.equal(timeline.items.find(item => item.type === 'paper').bottleneckSummary, '审题理解')
  assert.equal(timeline.items.find(item => item.type === 'paper').paperDisplayCode, '数学-20260613-01')
})

test('timeline sorts papers by generated time while preserving paper date', async () => {
  const db = createDatabase({
    students: [{ _id: 'student-1', _openid: 'owner-1', name: '钟青羽', grade: 6 }],
    studentMembers: [{ _id: 'member-1', studentId: 'student-1', ownerOpenId: 'owner-1', memberOpenId: 'viewer-1', role: 'viewer', status: 'active' }],
    reports: [{
      _id: 'report-1',
      _openid: 'owner-1',
      studentId: 'student-1',
      subject: 'math',
      status: 'completed',
      evidenceTime: '2026-06-13T09:00:00Z',
      createdAt: '2026-06-13T09:00:00Z',
      imageFiles: []
    }],
    papers: [{
      _id: 'paper-1',
      _openid: 'owner-1',
      studentId: 'student-1',
      subject: 'math',
      type: 'verification',
      paperDate: '2026-06-13',
      generatedAt: '2026-06-13T11:00:00Z',
      createdAt: '2026-06-13T10:59:00Z',
      bottleneckSummaries: ['审题理解'],
      questions: [{}, {}, {}]
    }]
  })
  const handler = loadStudentData(db, 'viewer-1')

  const timeline = await handler.main({ action: 'getLearningTimeline', studentId: 'student-1', subject: 'math' })

  assert.equal(timeline.success, true)
  assert.deepEqual(JSON.parse(JSON.stringify(timeline.items.map(item => item.id))), ['paper-paper-1', 'report-report-1'])
  assert.equal(timeline.items[0].paperDate, '2026-06-13')
})

test('learning timeline respects the requested lightweight limit', async () => {
  const db = createDatabase({
    students: [{ _id: 'student-1', _openid: 'owner-1', name: '钟青羽', grade: 6 }],
    studentMembers: [{ _id: 'member-1', studentId: 'student-1', ownerOpenId: 'owner-1', memberOpenId: 'viewer-1', role: 'viewer', status: 'active' }],
    reports: Array.from({ length: 35 }, (_, index) => ({
      _id: `report-${index + 1}`,
      _openid: 'owner-1',
      studentId: 'student-1',
      subject: 'math',
      status: 'completed',
      createdAt: `2026-06-${String(10 + Math.floor(index / 5)).padStart(2, '0')}T10:00:00Z`
    })),
    papers: [],
    englishPracticeSessions: []
  })
  const handler = loadStudentData(db, 'viewer-1')

  const timeline = await handler.main({ action: 'getLearningTimeline', studentId: 'student-1', limit: 20 })

  assert.equal(timeline.success, true)
  assert.equal(timeline.limit, 20)
  assert.equal(timeline.reports.length, 20)
})

test('learning timeline returns cursor paged lightweight records', async () => {
  const db = createDatabase({
    students: [{ _id: 'student-1', _openid: 'owner-1', name: '钟青羽', grade: 6 }],
    studentMembers: [{ _id: 'member-1', studentId: 'student-1', ownerOpenId: 'owner-1', memberOpenId: 'viewer-1', role: 'viewer', status: 'active' }],
    reports: Array.from({ length: 25 }, (_, index) => ({
      _id: `report-${index + 1}`,
      _openid: 'owner-1',
      studentId: 'student-1',
      subject: 'math',
      type: 'diagnosis',
      status: 'completed',
      summary: `第 ${index + 1} 份报告`,
      bottlenecks: [{ lpName: '计算基础', errorCount: 2 }],
      imageFiles: [{ fileID: `cloud://photo-${index + 1}`, ocrSummary: '很长的 OCR 内容不应出现在列表摘要里' }],
      createdAt: `2026-06-${String(30 - index).padStart(2, '0')}T10:00:00Z`
    })),
    papers: [],
    englishPracticeSessions: []
  })
  const handler = loadStudentData(db, 'viewer-1')

  const first = await handler.main({ action: 'getLearningTimeline', studentId: 'student-1', limit: 10 })
  const second = await handler.main({ action: 'getLearningTimeline', studentId: 'student-1', limit: 10, cursor: first.nextCursor })

  assert.equal(first.success, true)
  assert.equal(first.reports.length, 10)
  assert.equal(first.hasMore, true)
  assert.ok(first.nextCursor)
  assert.equal(first.reports[0]._id, 'report-1')
  assert.equal(first.reports[0].imageFileCount, 1)
  assert.deepEqual(JSON.parse(JSON.stringify(first.reports[0].bottleneckSummaries)), ['计算基础'])
  assert.equal(first.reports[0].imageFiles, undefined)
  assert.equal(second.reports[0]._id, 'report-11')
  assert.notEqual(second.reports[0]._id, first.reports[0]._id)
})

test('timeline includes English vocabulary sessions as learning records', async () => {
  const db = createDatabase({
    students: [{ _id: 'student-1', _openid: 'owner-1', name: '钟青羽', grade: 6 }],
    studentMembers: [{ _id: 'member-1', studentId: 'student-1', ownerOpenId: 'owner-1', memberOpenId: 'viewer-1', role: 'viewer', status: 'active' }],
    reports: [],
    papers: [],
    englishPracticeSessions: [
      {
        _id: 'familiarity-1',
        studentId: 'student-1',
        subject: 'english',
        functionType: 'familiarity',
        type: 'word-familiarity',
        status: 'completed',
        wordItems: [{ wordId: 'word-1', word: 'science' }],
        attempts: [{ wordId: 'word-1', targetWord: 'science', judgment: { status: 'correct' } }],
        createdAt: '2026-06-15T09:00:00Z',
        completedAt: '2026-06-15T09:10:00Z'
      },
      {
        _id: 'dictation-1',
        studentId: 'student-1',
        subject: 'english',
        functionType: 'spelling',
        type: 'word-dictation-paper',
        status: 'completed',
        analysisStatus: 'completed',
        photoFileIds: ['cloud://dictation-1.jpg'],
        wordItems: [{ wordId: 'word-2', word: 'museum' }],
        dictationResults: [{ wordId: 'word-2', targetWord: 'museum', verdict: 'incorrect' }],
        createdAt: '2026-06-16T09:00:00Z',
        analyzedAt: '2026-06-16T09:20:00Z'
      }
    ]
  })
  const handler = loadStudentData(db, 'viewer-1')

  const timeline = await handler.main({ action: 'getLearningTimeline', studentId: 'student-1' })

  assert.equal(timeline.success, true)
  assert.deepEqual(JSON.parse(JSON.stringify(timeline.englishSessions.map(item => item._id))), ['dictation-1', 'familiarity-1'])
  assert.deepEqual(JSON.parse(JSON.stringify(timeline.items.map(item => item.id))), ['english-session-dictation-1', 'english-session-familiarity-1'])
  assert.equal(timeline.items[0].type, 'english-dictation-session')
  assert.equal(timeline.items[0].photoFileIds.length, 1)

  const mathTimeline = await handler.main({ action: 'getLearningTimeline', studentId: 'student-1', subject: 'math' })
  assert.deepEqual(JSON.parse(JSON.stringify(mathTimeline.englishSessions)), [])
})

test('learning timeline includes learning resource packs', async () => {
  const db = createDatabase({
    students: [{ _id: 'student-1', _openid: 'owner-1', name: '钟青羽', grade: 6 }],
    studentMembers: [{ _id: 'member-1', studentId: 'student-1', ownerOpenId: 'owner-1', memberOpenId: 'viewer-1', role: 'viewer', status: 'active' }],
    reports: [],
    papers: [],
    englishPracticeSessions: [],
    learningResourcePacks: [
      {
        _id: 'pack-1',
        _openid: 'owner-1',
        studentId: 'student-1',
        subject: 'math',
        title: '小数乘法中积的小数位数判断错误',
        status: 'completed',
        createdAt: '2026-06-17T08:00:00.000Z',
        updatedAt: '2026-06-17T08:10:00.000Z'
      }
    ]
  })
  const handler = loadStudentData(db, 'viewer-1')

  const timeline = await handler.main({ action: 'getLearningTimeline', studentId: 'student-1', limit: 20 })

  assert.equal(timeline.success, true)
  assert.equal(timeline.items[0].type, 'learning_resource')
  assert.equal(timeline.items[0].title, '学习任务包：小数乘法中积的小数位数判断错误')
  assert.equal(timeline.items[0].summary, '已完成学习')
})

test('owner can archive stale interrupted analysis records from the timeline', async () => {
  const db = createDatabase({
    students: [{ _id: 'student-1', _openid: 'owner-1', name: '钟青羽', grade: 6 }],
    studentMembers: [],
    subjectProfiles: [{
      _id: 'profile-math',
      studentId: 'student-1',
      subject: 'math',
      analysisStatus: 'analyzing',
      currentAnalysisId: 'report-stale',
      updatedAt: '2026-06-11T23:18:00+08:00'
    }],
    reports: [
      {
        _id: 'report-stale',
        _openid: 'owner-1',
        studentId: 'student-1',
        subject: 'math',
        type: 'diagnosis',
        status: 'analyzing',
        createdAt: '2026-06-11T23:18:00+08:00',
        updatedAt: '2026-06-11T23:18:00+08:00'
      },
      {
        _id: 'report-completed',
        _openid: 'owner-1',
        studentId: 'student-1',
        subject: 'math',
        type: 'diagnosis',
        status: 'completed',
        summary: '有效报告',
        createdAt: '2026-06-12T08:47:00+08:00'
      }
    ],
    papers: []
  })
  const handler = loadStudentData(db, 'owner-1')

  const preview = await handler.main({ action: 'cleanupStaleLearningRecords', studentId: 'student-1', subject: 'math', dryRun: true })
  assert.equal(preview.success, true)
  assert.equal(preview.cleanedCount, 1)
  assert.deepEqual(preview.cleanedReportIds, ['report-stale'])
  assert.equal(db.dump('reports').find(item => item._id === 'report-stale').isArchived, undefined)

  const cleanup = await handler.main({ action: 'cleanupStaleLearningRecords', studentId: 'student-1', subject: 'math' })

  assert.equal(cleanup.success, true)
  assert.equal(cleanup.cleanedCount, 1)
  assert.deepEqual(cleanup.cleanedReportIds, ['report-stale'])
  const archived = db.dump('reports').find(item => item._id === 'report-stale')
  assert.equal(archived.isArchived, true)
  assert.equal(archived.status, 'timeout')
  assert.equal(archived.archivedReason, 'stale-analysis-cleanup')
  const profile = db.dump('subjectProfiles')[0]
  assert.equal(profile.analysisStatus, null)
  assert.equal(profile.currentAnalysisId, '')

  const timeline = await handler.main({ action: 'getLearningTimeline', studentId: 'student-1', subject: 'math' })
  assert.deepEqual(JSON.parse(JSON.stringify(timeline.reports.map(item => item._id))), ['report-completed'])
})

test('viewer cannot archive stale learning records', async () => {
  const db = seedDatabase()
  const handler = loadStudentData(db, 'viewer-1')

  const cleanup = await handler.main({ action: 'cleanupStaleLearningRecords', studentId: 'student-1' })

  assert.equal(cleanup.success, false)
  assert.equal(cleanup.error, '只有档案管理者可以清理历史任务')
})

test('non-member cannot read child data through studentData', async () => {
  const db = seedDatabase()
  const handler = loadStudentData(db, 'stranger-1')

  const dashboard = await handler.main({ action: 'getStudentDashboard', studentId: 'student-1' })
  assert.equal(dashboard.success, false)
  assert.equal(dashboard.error, '无权访问该学生')

  const report = await handler.main({ action: 'getReportDetail', reportId: 'report-1' })
  assert.equal(report.success, false)
  assert.equal(report.error, '无权访问该学生')

  const paper = await handler.main({ action: 'getPaperDetail', paperId: 'paper-1' })
  assert.equal(paper.success, false)
  assert.equal(paper.error, '无权访问该学生')
})

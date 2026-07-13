const test = require('node:test')
const assert = require('node:assert/strict')
const {
  createCloudMock,
  createDatabase,
  loadModule
} = require('./helpers/cloud-function-harness')
const { measureTimelinePayload } = require('../scripts/timeline-payload-baseline')

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
    ],
    reportFeedback: [
      { _id: 'feedback-1', reportId: 'report-1', studentId: 'student-1', subject: 'math', targetType: 'bottleneck', targetId: 'LP-008', type: 'wrong_bottleneck', reason: '卡点需要复核', status: 'submitted', createdAt: '2026-06-13T10:00:00Z' }
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
  assert.equal(result.student._openid, undefined)
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
  assert.equal(subject.student._openid, undefined)
  assert.equal(subject.profile.subjectName, '数学')
  assert.deepEqual(subject.reports.map(item => item._id), ['report-2', 'report-1'])
  assert.deepEqual(subject.papers.map(item => item._id), ['paper-1'])

  const report = await handler.main({ action: 'getReportDetail', reportId: 'report-1' })
  assert.equal(report.success, true)
  assert.equal(report.role, 'viewer')
  assert.equal(report.report.summary, '发现审题理解卡点')
  assert.equal(report.profile.subject, 'math')
  assert.equal(report.pendingCount, 1)
  // 反馈改为按需加载，不再内联到报告详情中
  assert.equal(report.feedback, undefined)

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
  // items 字段已移除（死代码），时间线数据通过 reports/papers/englishSessions 分组返回
  assert.equal(timeline.items, undefined)
  assert.deepEqual(timeline.reports.map(item => item._id), ['report-2', 'report-1'])
  assert.deepEqual(timeline.papers.map(item => item._id), ['paper-1'])
  assert.equal(timeline.reports.find(item => item._id === 'report-1').imageFileCount, 1)
  assert.equal(timeline.papers.find(item => item._id === 'paper-1').bottleneckSummaries.join('、'), '审题理解')
  assert.equal(timeline.papers.find(item => item._id === 'paper-1').paperDisplayCode, '数学-20260613-01')
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
  assert.deepEqual(timeline.reports.map(item => item._id), ['report-1'])
  assert.deepEqual(timeline.papers.map(item => item._id), ['paper-1'])
  assert.equal(timeline.papers[0].paperDate, '2026-06-13')
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
  assert.deepEqual(timeline.englishSessions.map(item => item._id), ['dictation-1', 'familiarity-1'])
  assert.equal(timeline.englishSessions[0].functionType, 'spelling')
  assert.equal(timeline.englishSessions[0].photoFileIds.length, 1)

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
  assert.equal(timeline.learningResourcePacks.length, 1)
  assert.equal(timeline.learningResourcePacks[0].title, '小数乘法中积的小数位数判断错误')
  assert.equal(timeline.learningResourcePacks[0].status, 'completed')
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

// ── Task 4: getHomeDashboard 聚合端点 ──

function seedHomeDashboardDatabase() {
  return createDatabase({
    students: [
      { _id: 'student-1', _openid: 'owner-1', name: '钟青羽', grade: 6, createdAt: '2026-06-01T10:00:00Z' },
      { _id: 'student-2', _openid: 'owner-1', name: '钟筱雨', grade: 4, createdAt: '2026-06-02T10:00:00Z' },
      // joined student（非 owned）
      { _id: 'student-3', _openid: 'owner-2', name: '其他孩子', grade: 3, createdAt: '2026-06-03T10:00:00Z' }
    ],
    studentMembers: [
      { _id: 'member-3', studentId: 'student-3', ownerOpenId: 'owner-2', memberOpenId: 'owner-1', role: 'viewer', status: 'active' }
    ],
    subjectProfiles: [
      { _id: 'profile-1', studentId: 'student-1', subject: 'math', subjectName: '数学', totalReports: 2, pendingBottlenecks: [{ lpCode: 'LP-001', lpName: '计算基础' }], updatedAt: '2026-06-12T11:00:00Z' },
      { _id: 'profile-2', studentId: 'student-2', subject: 'math', subjectName: '数学', totalReports: 1, pendingBottlenecks: [], updatedAt: '2026-06-11T11:00:00Z' },
      { _id: 'profile-3', studentId: 'student-3', subject: 'english', subjectName: '英语', totalReports: 0, pendingBottlenecks: [], updatedAt: '2026-06-10T11:00:00Z' }
    ],
    reports: [
      { _id: 'report-1', studentId: 'student-1', subject: 'math', type: 'diagnosis', status: 'completed', summary: '计算基础卡点', totalErrors: 3, bottlenecks: [{ lpCode: 'LP-001', lpName: '计算基础', errorCount: 2 }], createdAt: '2026-06-12T09:30:00Z' },
      { _id: 'report-2', studentId: 'student-2', subject: 'math', type: 'diagnosis', status: 'completed', summary: '分数基础', totalErrors: 1, createdAt: '2026-06-11T09:30:00Z' },
      { _id: 'report-3', studentId: 'student-3', subject: 'english', type: 'diagnosis', status: 'completed', summary: '词汇练习', totalErrors: 0, createdAt: '2026-06-10T09:30:00Z' }
    ],
    papers: [
      { _id: 'paper-1', studentId: 'student-1', subject: 'math', type: 'verification', paperCode: 'MATH-01', paperDisplayCode: '数学-01', questionCount: 6, generationStatus: 'ready', pdfFileId: 'cloud://paper-1.pdf', createdAt: '2026-06-12T10:00:00Z' }
    ]
  })
}

test('getHomeDashboard returns all accessible students with summaries in one call', async () => {
  const db = seedHomeDashboardDatabase()
  const handler = loadStudentData(db, 'owner-1')

  const result = await handler.main({ action: 'getHomeDashboard' })

  assert.equal(result.success, true)
  // 2 owned + 1 joined = 3 个学生
  assert.equal(result.students.length, 3)
  // joined 学生也包含在内
  assert.ok(result.students.find(s => s._id === 'student-3'))
  assert.ok(result.students.find(s => s._id === 'student-3').role === 'viewer')
  assert.ok(result.students.every(student => student._openid === undefined))
  // perStudent 包含每个学生的摘要
  assert.ok(result.perStudent['student-1'])
  assert.ok(result.perStudent['student-2'])
  assert.ok(result.perStudent['student-3'])
  // 验证 subjectProfiles 被正确分组
  assert.equal(result.perStudent['student-1'].subjectProfiles.length, 1)
  assert.equal(result.perStudent['student-1'].subjectProfiles[0].subject, 'math')
  // 验证 latestReportSummary
  assert.ok(result.perStudent['student-1'].latestReportSummary)
  assert.equal(result.perStudent['student-1'].latestReportSummary._id, 'report-1')
  // 验证 latestPaperSummary
  assert.ok(result.perStudent['student-1'].latestPaperSummary)
  assert.equal(result.perStudent['student-1'].latestPaperSummary._id, 'paper-1')
  // student-2 无 paper
  assert.equal(result.perStudent['student-2'].latestPaperSummary, null)
})

test('getHomeDashboard response excludes heavy fields (questions, errorDetails, imageFiles)', async () => {
  const db = createDatabase({
    students: [
      { _id: 'student-1', _openid: 'owner-1', name: '钟青羽', grade: 6, createdAt: '2026-06-01T10:00:00Z' }
    ],
    studentMembers: [],
    subjectProfiles: [],
    reports: [
      {
        _id: 'report-heavy', studentId: 'student-1', subject: 'math', type: 'diagnosis', status: 'completed',
        summary: '大报告', totalErrors: 10,
        bottlenecks: [{ lpCode: 'LP-001', lpName: '计算基础', errorCount: 5 }],
        // 这些大字段不应出现在 DTO 中
        errorDetails: Array.from({ length: 20 }, (_, i) => ({ _id: `err-${i}`, detail: 'x'.repeat(500) })),
        pageResults: Array.from({ length: 10 }, (_, i) => ({ pageIndex: i })),
        imageFiles: Array.from({ length: 15 }, (_, i) => ({ fileID: `cloud://img-${i}` })),
        createdAt: '2026-06-12T09:30:00Z'
      }
    ],
    papers: [
      {
        _id: 'paper-heavy', studentId: 'student-1', subject: 'math', type: 'verification',
        paperCode: 'MATH-01', paperDisplayCode: '数学-01', questionCount: 20,
        generationStatus: 'ready', pdfFileId: 'cloud://paper.pdf',
        // questions 不应出现在 DTO 中
        questions: Array.from({ length: 20 }, (_, i) => ({ questionId: `q-${i}`, stem: 'x'.repeat(500) })),
        createdAt: '2026-06-12T10:00:00Z'
      }
    ]
  })
  const handler = loadStudentData(db, 'owner-1')

  const result = await handler.main({ action: 'getHomeDashboard' })

  assert.equal(result.success, true)
  const detail = result.perStudent['student-1']
  // 确认大字段被剥离
  assert.equal(detail.latestReportSummary.errorDetails, undefined)
  assert.equal(detail.latestReportSummary.pageResults, undefined)
  assert.equal(detail.latestReportSummary.imageFiles, undefined)
  assert.equal(detail.latestPaperSummary.questions, undefined)
  // 确认轻量字段保留
  assert.equal(detail.latestReportSummary.summary, '大报告')
  assert.equal(detail.latestPaperSummary.questionCount, 20)
})

test('getHomeDashboard returns empty gracefully when user has no students', async () => {
  const db = createDatabase({
    students: [],
    studentMembers: []
  })
  const handler = loadStudentData(db, 'lonely-user')

  const result = await handler.main({ action: 'getHomeDashboard' })

  assert.equal(result.success, true)
  assert.equal(result.students.length, 0)
  assert.equal(Object.keys(result.perStudent).length, 0)
})

test('getHomeDashboard batches joined students without serial member loop', async () => {
  // 5 个 joined 学生 — 旧代码会串行 5 次 doc().get()，新代码用 1 次 where(in) 批量
  const joinedStudents = Array.from({ length: 5 }, (_, i) => ({
    _id: `joined-${i + 1}`,
    _openid: `other-owner-${i}`,
    name: `加入孩子${i + 1}`,
    grade: 3,
    createdAt: `2026-06-0${i + 1}T10:00:00Z`
  }))
  const db = createDatabase({
    students: joinedStudents,
    studentMembers: joinedStudents.map((s, i) => ({
      _id: `member-${i}`,
      studentId: s._id,
      ownerOpenId: s._openid,
      memberOpenId: 'owner-1',
      role: 'viewer',
      status: 'active'
    })),
    subjectProfiles: [],
    reports: [],
    papers: []
  })
  const handler = loadStudentData(db, 'owner-1')

  const result = await handler.main({ action: 'getHomeDashboard' })

  assert.equal(result.success, true)
  assert.equal(result.students.length, 5)
  // 所有 joined 学生都有 role
  assert.ok(result.students.every(s => s.role === 'viewer'))
})

test('getHomeDashboard does not let one child consume the family-wide history limit', async () => {
  const dominantReports = Array.from({ length: 21 }, (_, index) => ({
    _id: `dominant-report-${index}`,
    studentId: 'student-a',
    subject: 'math',
    status: 'completed',
    summary: `A-${index}`,
    createdAt: `2026-07-12T10:${String(index).padStart(2, '0')}:00Z`
  }))
  const dominantPapers = Array.from({ length: 21 }, (_, index) => ({
    _id: `dominant-paper-${index}`,
    studentId: 'student-a',
    subject: 'math',
    type: 'verification',
    paperDisplayCode: `A-${index}`,
    createdAt: `2026-07-12T10:${String(index).padStart(2, '0')}:30Z`
  }))
  const db = createDatabase({
    students: [
      { _id: 'student-a', _openid: 'owner-1', name: 'A', createdAt: '2026-01-02T00:00:00Z' },
      { _id: 'student-b', _openid: 'owner-1', name: 'B', createdAt: '2026-01-01T00:00:00Z' }
    ],
    studentMembers: [],
    subjectProfiles: [],
    reports: [...dominantReports, {
      _id: 'student-b-report', studentId: 'student-b', subject: 'math', status: 'completed',
      summary: 'B latest', createdAt: '2026-06-01T00:00:00Z'
    }],
    papers: [...dominantPapers, {
      _id: 'student-b-paper', studentId: 'student-b', subject: 'math', type: 'verification',
      paperDisplayCode: 'B-LATEST', createdAt: '2026-06-01T00:00:00Z'
    }]
  })
  const handler = loadStudentData(db, 'owner-1')

  const result = await handler.main({ action: 'getHomeDashboard' })

  assert.equal(result.perStudent['student-b'].latestReportSummary._id, 'student-b-report')
  assert.equal(result.perStudent['student-b'].latestPaperSummary._id, 'student-b-paper')
})

test('representative timeline baseline reduces database reads without changing visible ordering', async () => {
  const metrics = await measureTimelinePayload()

  assert.equal(metrics.visibleOrderingUnchanged, true)
  assert.equal(metrics.databaseReadReduction >= 0.6, true)
  assert.equal(metrics.projected.databaseReadBytes < metrics.thresholds.databaseReadBytes, true)
  assert.equal(metrics.projected.responseBytes < metrics.thresholds.responseBytes, true)
})

// ── Task 6: 报告详情 DTO ──

test('getReportDetail strips debug/raw AI fields but keeps rendering fields', async () => {
  const db = createDatabase({
    students: [{ _id: 'student-1', _openid: 'owner-1', name: '钟青羽', grade: 6 }],
    studentMembers: [],
    reports: [{
      _id: 'report-heavy',
      _openid: 'owner-1',
      studentId: 'student-1',
      subject: 'math',
      type: 'diagnosis',
      status: 'completed',
      summary: '计算基础卡点',
      totalErrors: 5,
      bottlenecks: [{ lpCode: 'LP-001', lpName: '计算基础', errorCount: 3 }],
      imageFiles: [{ fileID: 'cloud://img-1.jpg', fileName: 'paper.jpg' }],
      errorDetails: [{ _id: 'err-1', errorType: 'calc', question: '1/4 + 1/4' }],
      // 这些大字段应被剥离
      pageResults: Array.from({ length: 10 }, (_, i) => ({ pageIndex: i, ocrText: 'x'.repeat(500) })),
      rawPages: [{ rawText: 'x'.repeat(1000) }],
      aiRaw: { model: 'hy3-preview', response: 'x'.repeat(2000) },
      createdAt: '2026-06-12T09:30:00Z'
    }],
    papers: []
  })
  const handler = loadStudentData(db, 'owner-1')

  const detail = await handler.main({ action: 'getReportDetail', reportId: 'report-heavy' })

  assert.equal(detail.success, true)
  // 渲染必需字段保留
  assert.equal(detail.report.summary, '计算基础卡点')
  assert.equal(detail.report.totalErrors, 5)
  assert.ok(Array.isArray(detail.report.bottlenecks))
  assert.ok(Array.isArray(detail.report.imageFiles))
  assert.ok(Array.isArray(detail.report.errorDetails))
  // 调试/原始 AI 字段被剥离
  assert.equal(detail.report.pageResults, undefined)
  assert.equal(detail.report.rawPages, undefined)
  assert.equal(detail.report.aiRaw, undefined)
  // 反馈不在详情中内联（按需加载）
  assert.equal(detail.feedback, undefined)
})

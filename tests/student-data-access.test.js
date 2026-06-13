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
  assert.deepEqual(JSON.parse(JSON.stringify(timeline.items.map(item => item.id))), ['report-report-2', 'paper-paper-1', 'report-report-1', 'upload-cloud://photo-1'])
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

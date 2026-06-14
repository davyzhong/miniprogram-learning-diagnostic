const test = require('node:test')
const assert = require('node:assert/strict')

const {
  diagnoseFromUpload,
  getAnalysisStatus,
  generateDiagnosticReport,
  trackBottlenecks,
  generateVerificationPaper,
  evaluateVerificationSubmission,
  buildLearningTimeline
} = require('../services/skills')

function createAdapter(overrides = {}) {
  const calls = []
  const adapter = {
    calls,
    async uploadAndAnalyze(params) {
      calls.push(['uploadAndAnalyze', params])
      return { success: true, reportId: 'report-1', status: 'analyzing', message: '分析已启动' }
    },
    async getAnalysisProgress(params) {
      calls.push(['getAnalysisProgress', params])
      return { success: true, reportId: params.reportId, status: 'completed', progress: 100 }
    },
    async getReportDetail(params) {
      calls.push(['getReportDetail', params])
      return {
        success: true,
        report: {
          _id: params.reportId,
          type: 'diagnosis',
          subject: 'math',
          summary: '发现计算基础和审题理解两个学习卡点',
          bottlenecks: [{ lpCode: 'LP-001', lpName: '计算错误（加减乘除）' }],
          errorDetails: [{ title: '口算题错误' }]
        }
      }
    },
    async generateReportPDF(params) {
      calls.push(['generateReportPDF', params])
      return { success: true, reportId: params.reportId, pdfFileId: 'cloud://report.pdf', totalPages: 2 }
    },
    async getSubjectDashboard(params) {
      calls.push(['getSubjectDashboard', params])
      return {
        success: true,
        profile: {
          studentId: params.studentId,
          subject: params.subject,
          currentBottlenecks: [
            { lpCode: 'LP-001', lpName: '计算错误（加减乘除）', status: 'needs_verification', weight: 80 }
          ],
          improvedBottlenecks: []
        }
      }
    },
    async generatePaper(params) {
      calls.push(['generatePaper', params])
      return {
        success: true,
        paperId: 'paper-1',
        paperDisplayCode: '数学-20260614-01',
        pdfFileId: 'cloud://paper.pdf',
        questionCount: 6,
        studentPages: 1,
        answerPages: 1,
        totalPages: 2,
        bottleneckSummaries: ['计算基础', '审题理解']
      }
    },
    async getLearningTimeline(params) {
      calls.push(['getLearningTimeline', params])
      return {
        success: true,
        items: [{
          type: 'report',
          title: '数学诊断报告',
          summary: '发现计算基础',
          occurredAt: '2026-06-14T10:00:00+08:00'
        }]
      }
    },
    ...overrides
  }
  return adapter
}

test('diagnoseFromUpload starts diagnosis through the adapter with normalized file IDs', async () => {
  const adapter = createAdapter()
  const result = await diagnoseFromUpload({
    studentId: 'student-1',
    subject: 'math',
    fileIds: ['cloud://a.jpg'],
    imageMetas: [{ fileName: 'a.jpg', fileSize: 100 }]
  }, adapter)

  assert.equal(result.reportId, 'report-1')
  assert.equal(result.status, 'analyzing')
  assert.deepEqual(adapter.calls[0], ['uploadAndAnalyze', {
    studentId: 'student-1',
    subject: 'math',
    mode: 'diagnosis',
    fileIDs: ['cloud://a.jpg'],
    imageMetas: [{ fileName: 'a.jpg', fileSize: 100 }]
  }])
})

test('diagnoseFromUpload validates required inputs before calling the adapter', async () => {
  const adapter = createAdapter()
  await assert.rejects(
    () => diagnoseFromUpload({ studentId: 'student-1', subject: 'math', fileIds: [] }, adapter),
    /至少需要一张照片/
  )
  assert.equal(adapter.calls.length, 0)
})

test('getAnalysisStatus reads progress using reportId', async () => {
  const adapter = createAdapter()
  const result = await getAnalysisStatus({ reportId: 'report-1' }, adapter)

  assert.equal(result.status, 'completed')
  assert.deepEqual(adapter.calls[0], ['getAnalysisProgress', { reportId: 'report-1' }])
})

test('generateDiagnosticReport returns JSON report view and PDF export through one skill', async () => {
  const adapter = createAdapter()
  const json = await generateDiagnosticReport({ reportId: 'report-1', format: 'json' }, adapter)
  assert.equal(json.reportId, 'report-1')
  assert.equal(json.summary, '发现计算基础和审题理解两个学习卡点')
  assert.equal(json.bottlenecks[0].displayName, '计算基础')

  const pdf = await generateDiagnosticReport({ reportId: 'report-1', format: 'pdf' }, adapter)
  assert.equal(pdf.pdfFileId, 'cloud://report.pdf')
  assert.equal(pdf.totalPages, 2)
})

test('trackBottlenecks builds readable bottleneck state from subject dashboard', async () => {
  const adapter = createAdapter()
  const result = await trackBottlenecks({ studentId: 'student-1', subject: 'math' }, adapter)

  assert.equal(result.studentId, 'student-1')
  assert.equal(result.subject, 'math')
  assert.equal(result.active[0].name, '计算基础')
  assert.equal(result.active[0].code, 'LP-001')
})

test('generateVerificationPaper delegates selected bottlenecks and preserves paper metadata', async () => {
  const adapter = createAdapter()
  const result = await generateVerificationPaper({
    studentId: 'student-1',
    subject: 'math',
    bottleneckTargets: ['LP-001', 'LP-008'],
    paperDate: '2026-06-14'
  }, adapter)

  assert.equal(result.paperDisplayCode, '数学-20260614-01')
  assert.equal(result.totalPages, 2)
  assert.deepEqual(adapter.calls[0][1].targets, ['LP-001', 'LP-008'])
})

test('evaluateVerificationSubmission starts verification analysis against a paper', async () => {
  const adapter = createAdapter()
  const result = await evaluateVerificationSubmission({
    studentId: 'student-1',
    subject: 'math',
    paperId: 'paper-1',
    answerPhotoFileIds: ['cloud://answer.jpg']
  }, adapter)

  assert.equal(result.reportId, 'report-1')
  assert.deepEqual(adapter.calls[0], ['uploadAndAnalyze', {
    studentId: 'student-1',
    subject: 'math',
    mode: 'verification',
    paperId: 'paper-1',
    fileIDs: ['cloud://answer.jpg'],
    imageMetas: []
  }])
})

test('buildLearningTimeline returns derived learning timeline items', async () => {
  const adapter = createAdapter()
  const result = await buildLearningTimeline({ studentId: 'student-1', subject: 'math' }, adapter)

  assert.equal(result.items.length, 1)
  assert.equal(result.items[0].title, '数学诊断报告')
  assert.deepEqual(adapter.calls[0], ['getLearningTimeline', { studentId: 'student-1', subject: 'math' }])
})

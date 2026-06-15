const test = require('node:test')
const assert = require('node:assert/strict')

const {
  deriveLearningMetrics,
  formatMetricsSummary,
  parseMetricsConfig
} = require('../scripts/learning-metrics')

const sampleData = {
  reports: [
    {
      _id: 'report-diagnosis-ok',
      studentId: 'student-1',
      subject: 'math',
      type: 'diagnosis',
      status: 'completed',
      totalErrors: 5,
      bottlenecks: [{ lpCode: 'LP-001' }, { lpCode: 'LP-008' }],
      imageFiles: [
        { fileName: 'IMG_0001.jpg', ocrSummary: '敏感OCR内容：第1页', isDuplicate: false },
        { fileName: 'IMG_0002.jpg', ocrSummary: '敏感OCR内容：第2页', isDuplicate: true }
      ],
      quality: { level: 'high', status: 'usable' },
      createdAt: '2026-06-01T10:00:00Z'
    },
    {
      _id: 'report-diagnosis-failed',
      studentId: 'student-1',
      subject: 'math',
      type: 'diagnosis',
      status: 'failed',
      imageFiles: [],
      quality: { level: 'low', status: 'insufficient' },
      createdAt: '2026-06-04T10:00:00Z'
    },
    {
      _id: 'report-verification-mixed',
      studentId: 'student-1',
      subject: 'math',
      type: 'verification',
      status: 'completed',
      paperId: 'paper-1',
      imageFiles: [
        { fileName: 'answer.jpg', ocrSummary: '验证卷作答过程', isDuplicate: false }
      ],
      verificationEvidence: [
        { lpCode: 'LP-001', evidenceStatus: 'passed' },
        { lpCode: 'LP-008', evidenceStatus: 'failed' },
        { lpCode: 'LP-013', evidenceStatus: 'unclear' }
      ],
      createdAt: '2026-06-05T10:00:00Z'
    },
    {
      _id: 'report-other-student',
      studentId: 'student-2',
      subject: 'math',
      type: 'diagnosis',
      status: 'completed',
      imageFiles: [{ fileName: 'other.jpg', ocrSummary: '其他学生内容' }],
      createdAt: '2026-06-05T10:00:00Z'
    },
    {
      _id: 'report-verification-passed',
      studentId: 'student-1',
      subject: 'math',
      type: 'verification',
      status: 'completed',
      paperId: 'paper-2',
      verificationEvidence: [
        { lpCode: 'LP-001', complete: true, allCorrect: true }
      ],
      createdAt: '2026-06-09T10:00:00Z'
    }
  ],
  papers: [
    { _id: 'paper-1', studentId: 'student-1', subject: 'math', type: 'verification', createdAt: '2026-06-05T09:00:00Z' },
    { _id: 'paper-2', studentId: 'student-1', subject: 'math', type: 'verification', createdAt: '2026-06-09T09:00:00Z' },
    { _id: 'paper-other', studentId: 'student-2', subject: 'math', type: 'verification', createdAt: '2026-06-05T09:00:00Z' }
  ],
  feedback: [
    { _id: 'feedback-1', studentId: 'student-1', reportId: 'report-verification-mixed', type: 'wrong_question', createdAt: '2026-06-05T11:00:00Z' },
    { _id: 'feedback-other', studentId: 'student-2', reportId: 'report-other-student', type: 'other', createdAt: '2026-06-05T11:00:00Z' }
  ]
}

test('learning metrics derive operational summary from existing records', () => {
  const metrics = deriveLearningMetrics(sampleData, { studentId: 'student-1' })

  assert.equal(metrics.studentId, 'student-1')
  assert.equal(metrics.totals.reports, 4)
  assert.equal(metrics.totals.diagnosisReports, 2)
  assert.equal(metrics.totals.verificationReports, 2)
  assert.equal(metrics.totals.papers, 2)
  assert.equal(metrics.totals.feedback, 1)
  assert.equal(metrics.uploads.photoCount, 3)
  assert.equal(metrics.uploads.duplicatePhotoCount, 1)
  assert.equal(metrics.analysis.completedReports, 3)
  assert.equal(metrics.analysis.failedReports, 1)
  assert.equal(metrics.analysis.completionRate, 0.75)
  assert.deepEqual(metrics.quality.byLevel, { high: 1, medium: 0, low: 1, unknown: 2 })
  assert.deepEqual(metrics.quality.byStatus, { usable: 1, needs_review: 0, insufficient: 1, unknown: 2 })
  assert.equal(metrics.verification.targetCount, 4)
  assert.equal(metrics.verification.passedTargets, 2)
  assert.equal(metrics.verification.failedTargets, 1)
  assert.equal(metrics.verification.unclearTargets, 1)
  assert.equal(metrics.verification.passRate, 0.5)
  assert.equal(metrics.feedback.feedbackRate, 0.25)
  assert.deepEqual(metrics.weekly.map(week => week.weekStart), ['2026-06-01', '2026-06-08'])
})

test('learning metrics formatted output is compact and excludes image content', () => {
  const metrics = deriveLearningMetrics(sampleData, { studentId: 'student-1' })
  const text = formatMetricsSummary(metrics)

  assert.match(text, /学习指标摘要/)
  assert.match(text, /分析完成率 75%/)
  assert.match(text, /验证通过率 50%/)
  assert.doesNotMatch(text, /敏感OCR内容/)
  assert.doesNotMatch(text, /IMG_0001/)
  assert.doesNotMatch(text, /answer\.jpg/)
})

test('learning metrics config accepts env and cli arguments', () => {
  const config = parseMetricsConfig({
    env: {
      METRICS_INPUT: '/tmp/metrics.json',
      METRICS_STUDENT_ID: 'student-env'
    },
    argv: ['--student-id=student-cli', '--json']
  })

  assert.equal(config.inputPath, '/tmp/metrics.json')
  assert.equal(config.studentId, 'student-cli')
  assert.equal(config.json, true)
})

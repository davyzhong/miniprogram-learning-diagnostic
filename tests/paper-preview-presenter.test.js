const test = require('node:test')
const assert = require('node:assert/strict')
const {
  buildPaperPreviewState,
  buildWorkbenchStatus
} = require('../miniprogram/pages/paper-preview/paper-preview-presenter')
const { loadPage } = require('./helpers/page-harness')

function basePaper() {
  return {
    _id: 'paper-1',
    studentId: 'student-1',
    subject: 'math',
    type: 'verification',
    paperDisplayCode: '数学-20260613-01',
    paperDate: '2026-06-13',
    pdfFileId: 'cloud://paper.pdf',
    questions: [{ index: 1, content: '12 + 8 =', lpCode: 'LP-001' }],
    bottleneckSummaries: ['计算基础'],
    studentPages: 1,
    answerPages: 1,
    totalPages: 2
  }
}

test('paper preview lifecycle starts with generated paper and download as the next action', () => {
  const state = buildPaperPreviewState({
    paper: basePaper(),
    detail: { student: { name: '钟青羽' } },
    subjectName: '数学',
    pdfDownloaded: false
  })

  assert.equal(state.workbenchStatus, 'generated')
  assert.equal(state.workbenchStatusText, '试卷已生成')
  assert.equal(state.primaryActionType, 'download')
  assert.equal(state.primaryActionText, '下载 PDF，准备打印')
  assert.deepEqual(state.lifecycleSteps.map(step => step.status), ['active', 'waiting', 'waiting'])
})

test('paper preview lifecycle moves downloaded paper to upload as the next action', () => {
  const state = buildPaperPreviewState({
    paper: basePaper(),
    detail: { student: { name: '钟青羽' } },
    subjectName: '数学',
    pdfDownloaded: true
  })

  assert.equal(state.workbenchStatus, 'downloaded')
  assert.equal(state.workbenchStatusText, '已下载，等待作答')
  assert.equal(state.primaryActionType, 'upload')
  assert.equal(state.primaryActionText, '作答完成，上传验证')
  assert.deepEqual(state.lifecycleSteps.map(step => step.status), ['completed', 'active', 'waiting'])
})

test('paper preview lifecycle links in-progress feedback to the analyzing report', () => {
  const state = buildPaperPreviewState({
    paper: basePaper(),
    detail: {
      student: { name: '钟青羽' },
      latestVerificationReport: {
        _id: 'report-analyzing',
        status: 'analyzing',
        summary: 'AI 正在分析验证卷'
      }
    },
    subjectName: '数学',
    pdfDownloaded: true
  })

  assert.equal(state.workbenchStatus, 'analyzing')
  assert.equal(state.primaryActionType, 'report')
  assert.equal(state.primaryActionText, '查看分析进度')
  assert.match(state.statusUrl, /report-analyzing/)
  assert.match(state.primaryActionUrl, /report-analyzing/)
  assert.deepEqual(state.lifecycleSteps.map(step => step.status), ['completed', 'completed', 'active'])
})

test('paper preview lifecycle keeps failed feedback recoverable by re-uploading', () => {
  const status = buildWorkbenchStatus({ _id: 'report-failed', status: 'failed' }, { pdfDownloaded: true })
  const state = buildPaperPreviewState({
    paper: basePaper(),
    detail: {
      student: { name: '钟青羽' },
      latestVerificationReport: {
        _id: 'report-failed',
        status: 'failed',
        summary: '图片模糊，无法确认答案'
      }
    },
    subjectName: '数学',
    pdfDownloaded: true
  })

  assert.equal(status.status, 'failed')
  assert.equal(state.workbenchStatus, 'failed')
  assert.equal(state.primaryActionType, 'upload')
  assert.equal(state.primaryActionText, '重新上传作答')
  assert.match(state.primaryActionUrl, /upload/)
  assert.deepEqual(state.lifecycleSteps.map(step => step.status), ['completed', 'failed', 'failed'])
})

test('paper preview lifecycle sends completed feedback to the report', () => {
  const state = buildPaperPreviewState({
    paper: basePaper(),
    detail: {
      student: { name: '钟青羽' },
      latestVerificationReport: {
        _id: 'report-completed',
        status: 'completed',
        summary: '计算基础已有改善',
        verificationEvidence: [{ complete: true, allCorrect: true }]
      }
    },
    subjectName: '数学',
    pdfDownloaded: true
  })

  assert.equal(state.workbenchStatus, 'completed')
  assert.equal(state.primaryActionType, 'report')
  assert.equal(state.primaryActionText, '查看验证反馈')
  assert.match(state.primaryActionUrl, /report-completed/)
  assert.deepEqual(state.lifecycleSteps.map(step => step.status), ['completed', 'completed', 'completed'])
})

// ── Page-level helper (migrated from page-flows.test.js) ──

test('paper preview formats default paper names without repeating the grade key', () => {
  const { page } = loadPage('miniprogram/pages/paper-preview/paper-preview.js', {
    modules: { '../../utils/cloud': {} }
  })
  assert.equal(
    page.getPaperName({ type: 'default-diagnosis', grade: 3, paperKey: 'grade3_a' }),
    '3年级 A 卷'
  )
})

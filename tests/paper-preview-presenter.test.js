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
  assert.equal(state.primaryActionText, '下载验证卷')
  assert.equal(state.secondaryActionType, 'upload')
  assert.equal(state.secondaryActionText, '上传作答照片')
  assert.deepEqual(state.lifecycleSteps.map(step => step.status), ['active', 'waiting', 'waiting'])
})

test('paper preview lifecycle keeps downloaded paper downloadable and exposes upload separately', () => {
  const state = buildPaperPreviewState({
    paper: basePaper(),
    detail: { student: { name: '钟青羽' } },
    subjectName: '数学',
    pdfDownloaded: true
  })

  assert.equal(state.workbenchStatus, 'downloaded')
  assert.equal(state.workbenchStatusText, '已下载，等待作答')
  assert.equal(state.primaryActionType, 'download')
  assert.equal(state.primaryActionText, '下载验证卷')
  assert.equal(state.secondaryActionType, 'upload')
  assert.equal(state.secondaryActionText, '上传作答照片')
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
  assert.equal(state.primaryActionType, 'download')
  assert.equal(state.primaryActionText, '下载验证卷')
  assert.equal(state.secondaryActionType, 'report')
  assert.equal(state.secondaryActionText, '查看分析进度')
  assert.match(state.statusUrl, /report-analyzing/)
  assert.match(state.secondaryActionUrl, /report-analyzing/)
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
  assert.equal(state.primaryActionType, 'download')
  assert.equal(state.primaryActionText, '下载验证卷')
  assert.equal(state.secondaryActionType, 'upload')
  assert.equal(state.secondaryActionText, '重新上传作答')
  assert.match(state.secondaryActionUrl, /upload/)
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
  assert.equal(state.primaryActionType, 'download')
  assert.equal(state.primaryActionText, '下载验证卷')
  assert.equal(state.secondaryActionType, 'report')
  assert.equal(state.secondaryActionText, '查看验证反馈')
  assert.match(state.secondaryActionUrl, /report-completed/)
  assert.deepEqual(state.lifecycleSteps.map(step => step.status), ['completed', 'completed', 'completed'])
})

test('paper preview exposes verification task-pack page progress', () => {
  const paper = {
    ...basePaper(),
    verificationPack: {
      totalTargets: 7,
      pages: [
        { pageCode: 'MATH-V-20260616-01-P01', targets: [{ displayName: '细分卡点 1' }, { displayName: '细分卡点 2' }] },
        { pageCode: 'MATH-V-20260616-01-P02', targets: [{ displayName: '细分卡点 3' }] },
        { pageCode: 'MATH-V-20260616-01-P03', targets: [{ displayName: '细分卡点 4' }] }
      ]
    }
  }
  const state = buildPaperPreviewState({
    paper,
    detail: {
      student: { name: '钟青羽' },
      latestVerificationReport: {
        _id: 'report-pack',
        status: 'completed',
        verificationPageCodes: ['MATH-V-20260616-01-P02'],
        verificationEvidence: []
      }
    },
    subjectName: '数学',
    pdfDownloaded: true
  })

  assert.equal(state.taskPack.hasTaskPack, true)
  assert.equal(state.taskPack.progressText, '已回传 1/3 页')
  assert.deepEqual(state.taskPackPages.map(page => page.status), ['pending', 'completed', 'pending'])
  assert.equal(state.taskPackPages[0].targetText, '细分卡点 1、细分卡点 2')
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

test('paper-preview.wxml 不再有冗余的 action-bar（下载PDF+分享打印已合并到底部主按钮）', () => {
  const fs = require('fs')
  const path = require('path')
  const wxml = fs.readFileSync(
    path.join(__dirname, '..', 'miniprogram/pages/paper-preview/paper-preview.wxml'),
    'utf8'
  )
  // 不应再有 action-bar（原来的双按钮区域）
  assert.ok(!/class="action-bar"/.test(wxml), '不应再有 action-bar')
  // 不应再有"分享打印"假按钮
  assert.ok(!/分享打印/.test(wxml), '不应再有"分享打印"按钮')
  // 不应再有 onSharePrint 绑定
  assert.ok(!/onSharePrint/.test(wxml), '不应再绑定 onSharePrint')
  // 底部 bottom-bar 应该保留（统一主按钮）
  assert.match(wxml, /class="bottom-bar"/, '应有 bottom-bar 主操作区')
})

test('paper-preview.js 不再有 onSharePrint 方法', () => {
  const fs = require('fs')
  const path = require('path')
  const js = fs.readFileSync(
    path.join(__dirname, '..', 'miniprogram/pages/paper-preview/paper-preview.js'),
    'utf8'
  )
  assert.ok(!/onSharePrint\s*\(/.test(js), 'onSharePrint 方法应已删除')
  // onShareAppMessage 应保留（微信右上角系统分享）
  assert.match(js, /onShareAppMessage\s*\(/, 'onShareAppMessage 应保留（系统分享）')
})

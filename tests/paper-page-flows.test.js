const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const ROOT = path.resolve(__dirname, '..')
const { loadPageAndWait, flushAsync, waitForPageLoad, isThenable } = require('./helpers/page-flow-utils')
const { createWxMock, loadPage } = require('./helpers/page-harness')
const util = require('../miniprogram/utils/util')

test('default paper reuses an existing generated paper', async () => {
  let generateCalls = 0
  const cloud = {
    callGeneratePaper: async () => {
      generateCalls += 1
      return { paperId: 'new-paper' }
    }
  }
  const wx = createWxMock()
  const { page } = loadPage('miniprogram/pages/default-paper/default-paper.js', {
    wx,
    modules: { '../../utils/cloud': cloud }
  })
  page.setData({
    studentId: 'student-1',
    subject: 'math',
    grade: 5,
    papers: [{ key: 'grade5_a', exists: true, paperId: 'existing-paper', questionCount: 20 }]
  })

  await page.onUsePaper({ currentTarget: { dataset: { key: 'grade5_a' } } })
  assert.equal(generateCalls, 0)
  assert.match(wx.calls.find(call => call.name === 'navigateTo').payload.url, /paperId=existing-paper/)
})

test('default paper generation sends the selected grade and configured question count', async () => {
  let request = null
  const cloud = {
    callGeneratePaper: async payload => {
      request = payload
      return { paperId: 'paper-1' }
    }
  }
  const { page } = loadPage('miniprogram/pages/default-paper/default-paper.js', {
    modules: { '../../utils/cloud': cloud }
  })
  page.setData({
    studentId: 'student-1',
    subject: 'math',
    grade: 3,
    papers: [{ key: 'grade3_a', exists: false, questionCount: 16 }]
  })

  await page.onUsePaper({ currentTarget: { dataset: { key: 'grade3_a' } } })
  assert.equal(request.grade, 3)
  assert.equal(request.questionCount, 16)
  assert.equal(request.paperKey, 'grade3_a')
})



test('paper preview loads a saved paper and opens its upload flow', async () => {
  const cloud = {
    getPaperDetail: async () => ({
      student: { name: '钟青羽' },
      paper: {
        _id: 'paper-1',
        studentId: 'student-1',
        subject: 'math',
        type: 'verification',
        paperCode: 'MATH-20260613-01',
        paperDisplayCode: '数学-20260613-01',
        pdfFileId: 'cloud://paper.pdf',
        questions: Array.from({ length: 5 }, (_, index) => ({
          index: index + 1,
          content: `${index + 1}+1`,
          lpCode: 'LP-001',
          lpName: '计算错误'
        })),
        bottleneckTargets: ['LP-001'],
        bottleneckSummaries: ['计算错误'],
        paperDate: '2026-06-13',
        studentPages: 1,
        answerPages: 1,
        totalPages: 2
      },
      latestVerificationReport: {
        _id: 'report-verify',
        status: 'completed',
        summary: '验证卷完成',
        comparisonSummary: '计算基础有改善',
        verificationEvidence: [{ complete: true, allCorrect: true }]
      }
    })
  }
  const wx = createWxMock({
    getStorageSync: key => key === 'downloaded_pdf_cloud://paper.pdf'
  })
  const { page } = loadPage('miniprogram/pages/paper-preview/paper-preview.js', {
    wx,
    modules: { '../../utils/cloud': cloud }
  })

  await page.loadPaper('paper-1')
  assert.equal(page.data.pdfReady, true)
  assert.equal(page.data.typeText, '验证试卷')
  assert.equal(page.data.paperCodeText, '数学-20260613-01')
  assert.equal(page.data.bottleneckText, '计算错误')
  assert.equal(page.data.bottleneckHierarchy.hasHierarchy, true)
  assert.equal(page.data.bottleneckHierarchy.totalCount, 1)
  assert.equal(page.data.paperDate, '2026-06-13')
  assert.equal(page.data.pageSummary, '学生卷 1 页 · 答案 1 页 · 共 2 页')
  assert.equal(page.data.pdfDownloaded, true)
  assert.equal(page.data.questionPreview.length, 4)
  assert.equal(page.data.hasMoreQuestions, true)
  assert.equal(page.data.workbenchStatus, 'completed')
  assert.equal(page.data.feedback.summary, '计算基础有改善')
  assert.ok(page.data.feedback.chips.includes('1 个卡点有改善'))
  assert.match(page.data.paperCodeUrl, /paper-preview/)
  assert.match(page.data.statusUrl, /report-verify/)
  assert.match(page.data.uploadUrl, /upload/)
  assert.match(page.data.feedback.reportUrl, /report-verify/)
  assert.doesNotMatch(page.data.bottleneckText, /LP-\d+/)
  page.onToggleQuestions()
  assert.equal(page.data.questionPreview.length, 5)
  page.onViewFeedbackReport()
  assert.match(wx.calls.find(call => call.name === 'navigateTo').payload.url, /report-verify/)
  page.onTraceableUrlTap({ currentTarget: { dataset: { url: page.data.paperCodeUrl } } })
  assert.match(wx.calls.filter(call => call.name === 'navigateTo').pop().payload.url, /paper-preview/)
  page.onUpload()
  const url = wx.calls.filter(call => call.name === 'navigateTo').pop().payload.url
  assert.match(url, /mode=verification/)
  assert.match(url, /paperId=paper-1/)
  assert.match(url, /paperCode=/)
})

test('paper preview falls back to question bottleneck names for legacy papers', async () => {
  const cloud = {
    getPaper: async () => ({
      _id: 'paper-1',
      studentId: 'student-1',
      subject: 'math',
      type: 'verification',
      pdfFileId: 'cloud://paper.pdf',
      questions: [
        { content: '1+1', lpCode: 'LP-001', lpName: '计算错误（加减乘除）' },
        { content: '读题', lpCode: 'LP-008', lpName: '审题错误' }
      ],
      bottleneckTargets: ['LP-001', 'LP-008']
    }),
    getStudent: async () => ({ name: '钟青羽' })
  }
  const { page } = loadPage('miniprogram/pages/paper-preview/paper-preview.js', {
    modules: { '../../utils/cloud': cloud }
  })

  await page.loadPaper('paper-1')

  assert.equal(page.data.bottleneckText, '计算错误、审题错误')
  assert.equal(page.data.bottleneckHierarchy.hasHierarchy, true)
  assert.equal(page.data.bottleneckHierarchy.totalCount, 2)
})

test('paper preview allows multiple downloads (user may lose the file)', async () => {
  let downloadCount = 0
  const storage = {}
  const wx = createWxMock({
    getStorageSync: key => storage[key],
    setStorageSync: (key, value) => { storage[key] = value },
    cloud: {
      downloadFile: async payload => {
        downloadCount += 1
        assert.equal(payload.fileID, 'cloud://paper.pdf')
        return { tempFilePath: '/tmp/paper.pdf' }
      }
    }
  })
  const { page } = loadPage('miniprogram/pages/paper-preview/paper-preview.js', {
    wx,
    modules: { '../../utils/cloud': {} }
  })
  page.setData({ mode: 'paper', pdfFileId: 'cloud://paper.pdf' })

  await page.onDownload()
  assert.equal(page.data.downloading, false)
  assert.equal(page.data.pdfDownloaded, true)
  assert.equal(downloadCount, 1)
  assert.equal(wx.calls.find(call => call.name === 'openDocument').payload.filePath, '/tmp/paper.pdf')

  // 第二次下载：允许重复下载（用户可能找不到文件需要重新下载）
  await page.onDownload()
  assert.equal(downloadCount, 2, '第二次下载应成功，不再被阻止')
  assert.equal(page.data.downloading, false)
})

test('paper preview regenerates a missing PDF before downloading a saved paper', async () => {
  let regeneratePayload = null
  let downloadedFileId = ''
  const wx = createWxMock({
    cloud: {
      downloadFile: async payload => {
        downloadedFileId = payload.fileID
        return { tempFilePath: '/tmp/regenerated-paper.pdf' }
      }
    }
  })
  const cloud = {
    callGeneratePaper: async payload => {
      regeneratePayload = payload
      return { success: true, pdfFileId: 'cloud://regenerated-paper.pdf' }
    }
  }
  const { page } = loadPage('miniprogram/pages/paper-preview/paper-preview.js', {
    wx,
    modules: { '../../utils/cloud': cloud }
  })
  page.setData({ mode: 'paper', paperId: 'paper-1', pdfFileId: '' })

  await page.onDownload()

  assert.equal(regeneratePayload._regeneratePdf, true)
  assert.equal(regeneratePayload.paperId, 'paper-1')
  assert.equal(page.data.pdfFileId, 'cloud://regenerated-paper.pdf')
  assert.equal(page.data.pdfReady, true)
  assert.equal(page.data.pdfDownloaded, true)
  assert.equal(downloadedFileId, 'cloud://regenerated-paper.pdf')
  assert.equal(wx.calls.find(call => call.name === 'openDocument').payload.filePath, '/tmp/regenerated-paper.pdf')
})


test('paper preview does not share temporary preview file ids', () => {
  const { page } = loadPage('miniprogram/pages/paper-preview/paper-preview.js', {
    modules: {
      '../../utils/cloud': {},
      '../../utils/paper-display': {},
      '../../utils/poller': { createPoller: () => ({ start() {}, stop() {} }) },
      './paper-preview-presenter': {
        buildPaperPreviewView: () => ({}),
        getPaperName: () => '',
        getPaperCodeText: () => ''
      }
    }
  })
  page.setData({
    mode: 'preview',
    fileId: 'cloud://temp-preview.pdf',
    typeText: '验证试卷',
    paperCodeText: 'MATH-01',
    paperName: '临时预览'
  })

  const share = page.onShareAppMessage()

  assert.doesNotMatch(share.path || '', /fileId=/)
})

const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const ROOT = path.resolve(__dirname, '..')
const { loadPageAndWait, flushAsync, waitForPageLoad, isThenable } = require('./helpers/page-flow-utils')
const { createWxMock, loadPage } = require('./helpers/page-harness')
const util = require('../miniprogram/utils/util')

test('report uses editorial section markers and preserves its route actions', () => {
  const wxml = fs.readFileSync(path.join(ROOT, 'miniprogram/pages/report/report.wxml'), 'utf8')
  const wxss = fs.readFileSync(path.join(ROOT, 'miniprogram/pages/report/report.wxss'), 'utf8')

  assert.match(wxml, /class="report-section-marker"/)
  assert.match(wxml, /bindtap="onReportSectionTap"/)
  assert.match(wxml, /bindtap="onRetryAnalysis"/)
  assert.match(wxml, /bindtap="onGenerateVerification"/)
  assert.match(wxss, /\.report-editorial-section/)
  assert.match(wxss, /\.status-label-improved/)
  assert.match(wxss, /\.report-subject-math/)
})

test('report passes its subject name into verification paper generation', async () => {
  const wx = createWxMock()
  let activePaperCall = null
  const cloud = {
    getActiveVerificationPaper: async (studentId, subject, reportId) => {
      activePaperCall = { studentId, subject, reportId }
      return { status: 'ready', paper: { _id: 'paper-1' } }
    }
  }
  const { page } = loadPage('miniprogram/pages/report/report.js', {
    wx,
    modules: {
      '../../utils/cloud': cloud,
      '../../utils/util': { formatChineseDateTime: () => '' },
      '../../utils/poller': { createPoller: () => ({ start() {}, stop() {} }) },
      './report-presenter': { buildReportView: () => ({}) }
    }
  })
  page.setData({
    reportId: 'report-1',
    report: {
      studentId: 'student-1',
      subject: 'chinese',
      bottlenecks: [{ lpCode: 'LP-101' }]
    },
    canGeneratePaper: true
  })

  await page.onGenerateVerification()
  // 统一入口：查验证卷状态，ready 时直接跳预览
  assert.equal(activePaperCall.studentId, 'student-1')
  assert.equal(activePaperCall.subject, 'chinese')
  assert.equal(activePaperCall.reportId, 'report-1')
  const nav = wx.calls.find(call => call.name === 'navigateTo')
  assert.ok(nav, '应当跳转到预览页')
  assert.match(nav.payload.url, /paperId=paper-1/)
})

test('report verification entry only polls a generating paper without front-end generation', async () => {
  const wx = createWxMock()
  const generateCalls = []
  const regenerateCalls = []
  let pollStarts = 0
  const cloud = {
    getActiveVerificationPaper: async () => ({
      status: 'generating',
      paper: {
        _id: 'paper-generating',
        studentId: 'student-1',
        subject: 'math',
        type: 'verification',
        bottleneckTargets: ['BN-001'],
        questions: [],
        generationProgress: { completedBatches: 0, totalBatches: 1, succeededBatches: 0 }
      }
    }),
    callGeneratePaper: async payload => {
      generateCalls.push(payload)
      return { success: true, paperId: 'paper-generating' }
    },
    regenerateVerificationPaper: async payload => {
      regenerateCalls.push(payload)
      return { success: true }
    }
  }
  const { page } = loadPage('miniprogram/pages/report/report.js', {
    wx,
    modules: {
      '../../utils/cloud': cloud,
      '../../utils/util': { formatChineseDateTime: () => '' },
      '../../utils/poller': { createPoller: () => ({ start() { pollStarts += 1 }, stop() {} }) },
      './report-presenter': { buildReportView: () => ({}) }
    }
  })
  page.setData({
    reportId: 'report-1',
    report: {
      studentId: 'student-1',
      subject: 'math',
      bottlenecks: [{ lpCode: 'LP-001' }]
    },
    canGeneratePaper: true
  })

  await assert.doesNotReject(() => page.onGenerateVerification())

  assert.equal(generateCalls.length, 0)
  assert.equal(regenerateCalls.length, 0)
  require('../miniprogram/utils/shared-navigation').stopVerificationPoller()
  assert.equal(wx.calls.some(call => call.name === 'navigateTo'), false)
  assert.match(wx.calls.find(call => call.name === 'showToast').payload.title, /后台生成/)
})

test('report verification entry repairs a missing auto paper when the diagnosis already has targets', async () => {
  const wx = createWxMock()
  const regenerateCalls = []
  const cloud = {
    getActiveVerificationPaper: async () => ({ status: 'none', paper: null }),
    regenerateVerificationPaper: async payload => {
      regenerateCalls.push(payload)
      if (payload.action === 'start') {
        return { success: true, paperId: 'paper-new', batches: [['BN-001']], totalBatches: 1 }
      }
      return { success: true }
    },
    callGeneratePaper: async payload => {
      if (payload._appendToPaperId) throw new Error('批次 1 生成失败')
      return { success: true }
    }
  }
  const { page } = loadPage('miniprogram/pages/report/report.js', {
    wx,
    modules: {
      '../../utils/cloud': cloud,
      '../../utils/util': { formatChineseDateTime: () => '' },
      '../../utils/poller': { createPoller: () => ({ start() {}, stop() {} }) },
      './report-presenter': { buildReportView: () => ({}) }
    }
  })
  page.setData({
    reportId: 'report-1',
    report: {
      studentId: 'student-1',
      subject: 'math',
      bottlenecks: [{ lpCode: 'LP-001' }]
    },
    canGeneratePaper: true
  })

  await page.onGenerateVerification()

  assert.equal(regenerateCalls.length, 1)
  assert.equal(regenerateCalls[0].action, 'start')
  assert.equal(regenerateCalls[0].studentId, 'student-1')
  assert.equal(regenerateCalls[0].subject, 'math')
  assert.equal(regenerateCalls[0].reportId, 'report-1')
  assert.equal(wx.calls.some(call => call.name === 'navigateTo'), false)
  assert.match(wx.calls.filter(call => call.name === 'showToast').at(-1).payload.title, /正在准备验证卷/)
})

test('report retry treats a cloud timeout as background analysis and resumes polling', async () => {
  const timeout = new Error('timeout')
  let pollStarts = 0
  const cloud = {
    callAnalyzePhotos: async () => { throw timeout },
    isTimeoutError: error => error === timeout
  }
  const { page } = loadPage('miniprogram/pages/report/report.js', {
    modules: {
      '../../utils/cloud': cloud,
      '../../utils/util': { formatChineseDateTime: () => '' },
      '../../utils/poller': { createPoller: () => ({ start() {}, stop() {} }) },
      './report-presenter': { buildReportView: () => ({}) }
    }
  })
  page.startPolling = () => { pollStarts += 1 }
  page.setData({ reportId: 'report-1', analysisTaskMissing: true })

  page.onRetryAnalysis()
  await new Promise(resolve => setImmediate(resolve))

  assert.equal(page.data.retryingAnalysis, false)
  assert.equal(page.data.analysisTaskMissing, false)
  assert.equal(page.data.analysisStatusText, '分析已重新启动，正在后台处理')
  assert.equal(pollStarts, 1)
})

test('subject home polls the active report instead of whichever report is latest', async () => {
  const requested = []
  let pollOptions = null
  const cloud = {
    getReport: async reportId => {
      requested.push(reportId)
      return { _id: reportId, status: 'analyzing' }
    },
    getAnalysisProgress: async () => ({ completedBatches: 0, totalBatches: 1 })
  }
  const { page } = loadPage('miniprogram/pages/subject-home/subject-home.js', {
    modules: {
      '../../utils/cloud': cloud,
      '../../utils/util': { formatRelativeTime: () => '' },
      '../../utils/analysis-poller': {
        createAnalysisPoller: options => {
          pollOptions = options
          return { start() {}, stop() {}, isRunning: () => false }
        }
      }
    }
  })
  page.setData({ studentId: 'student-1', subject: 'math', currentAnalysisId: 'active-report' })

  page.startReportPolling()
  await pollOptions.loadReport()
  assert.deepEqual(requested, ['active-report'])
})


test('report exposes retry when an analysis task is stale', async () => {
  let pollOptions = null
  const { page } = loadPage('miniprogram/pages/report/report.js', {
    modules: {
      '../../utils/cloud': {},
      '../../utils/util': { formatChineseDateTime: () => '' },
      '../../utils/analysis-poller': {
        createAnalysisPoller: options => {
          pollOptions = options
          return { start() {}, stop() {} }
        }
      },
      './report-presenter': { buildReportView: () => ({}) }
    }
  })

  page.startPolling('report-1')
  await pollOptions.onTimeoutStatus()

  assert.equal(page.data.analysisTaskMissing, true)
  assert.equal(page.data.analysisStatusText, '分析超时，请重新分析')
})


test('report loads diagnosis data and toggles error details', async () => {
  const cloud = {
    getReport: async () => ({
      _id: 'report-1',
      studentId: 'student-1',
      subject: 'math',
      type: 'diagnosis',
      status: 'completed',
      createdAt: '2026-06-11T10:00:00Z',
      bottlenecks: [{ lpCode: 'LP-001', errorCount: 1 }],
      errorDetails: [{ questionContent: '1+1' }]
    }),
    getSubjectProfile: async () => ({ pendingBottlenecks: [{ lpCode: 'LP-001' }] })
  }
  const { page } = loadPage('miniprogram/pages/report/report.js', {
    modules: {
      '../../utils/cloud': cloud,
      '../../utils/util': { formatChineseDateTime: () => '2026年6月11日 10:00' },
      '../../utils/poller': { createPoller: () => ({ start() {}, stop() {} }) },
      './report-presenter': require('../miniprogram/pages/report/report-presenter')
    }
  })

  await page.loadReport('report-1')
  assert.equal(page.data.hasBottlenecks, true)
  assert.equal(page.data.pendingCount, 1)
  page.onToggleError({ currentTarget: { dataset: { index: 0 } } })
  assert.equal(page.data.errorDetailList[0].expanded, true)
})

test('report falls back to direct report read when detail cloud function fails', async () => {
  let directReportRead = false
  const cloud = {
    getReportDetail: async () => {
      throw new Error('detail unavailable')
    },
    getReport: async reportId => {
      directReportRead = true
      return {
        _id: reportId,
        studentId: 'student-1',
        subject: 'math',
        type: 'diagnosis',
        status: 'completed',
        summary: '发现计算基础卡点',
        totalErrors: 18,
        createdAt: '2026-06-14T14:53:53.804Z',
        imageFiles: Array.from({ length: 9 }, (_, index) => ({ fileID: `cloud://photo-${index + 1}` })),
        bottlenecks: [
          { lpCode: 'LP-001', lpName: '计算错误（加减乘除）', errorCount: 14 },
          { lpCode: 'LP-008', lpName: '审题理解', errorCount: 3 },
          { lpCode: 'LP-010', lpName: '应用建模', errorCount: 1 }
        ],
        errorDetails: [{ questionContent: '38 × 24' }]
      }
    },
    getSubjectProfile: async () => ({ pendingBottlenecks: [{ lpCode: 'LP-001' }] })
  }
  const wx = createWxMock()
  const { page } = loadPage('miniprogram/pages/report/report.js', {
    wx,
    modules: {
      '../../utils/cloud': cloud,
      '../../utils/util': { formatChineseDateTime: () => '2026年6月14日 22:53' },
      './report-presenter': require('../miniprogram/pages/report/report-presenter')
    }
  })

  await page.loadReport('report-real')

  assert.equal(directReportRead, true)
  assert.equal(page.data.report._id, 'report-real')
  assert.equal(page.data.report.totalErrors, 18)
  assert.equal(page.data.bottleneckCount, 3)
  assert.equal(page.data.sourceImageCount, 9)
  assert.equal(page.data.hasErrorDetails, true)
  assert.equal(wx.calls.some(call => call.name === 'showToast' && call.payload.title === '加载失败'), false)
})

test('report still renders when feedback loading fails', async () => {
  const cloud = {
    getReportDetail: async () => ({
      permissions: { canView: true },
      report: {
        _id: 'report-1',
        studentId: 'student-1',
        subject: 'math',
        type: 'diagnosis',
        status: 'completed',
        summary: '发现审题理解卡点',
        totalErrors: 3,
        createdAt: '2026-06-14T14:53:53.804Z',
        imageFiles: [{ fileID: 'cloud://photo-1' }],
        bottlenecks: [{ lpCode: 'LP-008', lpName: '审题理解', errorCount: 3 }],
        errorDetails: [{ questionContent: '应用题漏看条件' }]
      }
    }),
    getReportFeedback: async () => {
      throw new Error('feedback unavailable')
    },
    getSubjectDashboard: async () => ({ profile: { pendingBottlenecks: [{ lpCode: 'LP-008' }] } })
  }
  const wx = createWxMock()
  const { page } = loadPage('miniprogram/pages/report/report.js', {
    wx,
    modules: {
      '../../utils/cloud': cloud,
      '../../utils/util': { formatChineseDateTime: () => '2026年6月14日 22:53' },
      './report-presenter': require('../miniprogram/pages/report/report-presenter')
    }
  })

  await page.loadReport('report-1')

  assert.equal(page.data.report.totalErrors, 3)
  assert.equal(page.data.bottleneckCount, 1)
  assert.equal(page.data.sourceImageCount, 1)
  assert.deepEqual(JSON.parse(JSON.stringify(page.data.feedbackItems)), [])
  assert.deepEqual(JSON.parse(JSON.stringify(page.data.feedbackByTarget)), {})
  assert.equal(wx.calls.some(call => call.name === 'showToast' && call.payload.title === '加载失败'), false)
})

test('report uses detail pending count without loading the full subject dashboard', async () => {
  let dashboardCalls = 0
  const cloud = {
    getReportDetail: async () => ({
      permissions: { canView: true },
      pendingCount: 2,
      report: {
        _id: 'report-1',
        studentId: 'student-1',
        subject: 'math',
        type: 'diagnosis',
        status: 'completed',
        createdAt: '2026-06-14T14:53:53.804Z',
        bottlenecks: [{ lpCode: 'LP-001', lpName: '计算基础', errorCount: 3 }],
        errorDetails: []
      }
    }),
    getSubjectDashboard: async () => {
      dashboardCalls += 1
      throw new Error('subject dashboard should not be needed')
    }
  }
  const { page } = loadPage('miniprogram/pages/report/report.js', {
    modules: {
      '../../utils/cloud': cloud,
      '../../utils/util': { formatChineseDateTime: () => '2026年6月14日 22:53' },
      './report-presenter': require('../miniprogram/pages/report/report-presenter')
    }
  })

  await page.loadReport('report-1')

  assert.equal(page.data.pendingCount, 2)
  assert.equal(dashboardCalls, 0)
})

test('report keeps heavy source fields off page data and expands source evidence on demand', async () => {
  const cloud = {
    getReportDetail: async () => ({
      permissions: { canView: true },
      pendingCount: 1,
      report: {
        _id: 'report-heavy',
        studentId: 'student-1',
        subject: 'math',
        type: 'diagnosis',
        status: 'completed',
        totalErrors: 12,
        createdAt: '2026-06-14T14:53:53.804Z',
        imageFiles: Array.from({ length: 10 }, (_, index) => ({
          fileID: `cloud://photo-${index + 1}`,
          fileName: `第${index + 1}页.jpg`,
          ocrSummary: `第 ${index + 1} 页很长的 OCR 摘要`
        })),
        bottlenecks: [{ lpCode: 'LP-001', lpName: '计算基础', errorCount: 12 }],
        errorDetails: Array.from({ length: 25 }, (_, index) => ({
          questionContent: `错题 ${index + 1}`,
          sourceImageIndex: index + 1
        }))
      }
    })
  }
  const { page } = loadPage('miniprogram/pages/report/report.js', {
    modules: {
      '../../utils/cloud': cloud,
      '../../utils/util': { formatChineseDateTime: () => '2026年6月14日 22:53' },
      './report-presenter': require('../miniprogram/pages/report/report-presenter')
    }
  })

  await page.loadReport('report-heavy')

  assert.equal(page.data.report._id, 'report-heavy')
  assert.equal(page.data.report.imageFiles, undefined)
  assert.equal(page.data.report.errorDetails, undefined)
  assert.equal(page.data.sourceEvidenceItems.length, 3)
  assert.equal(page.data.hiddenSourceEvidenceCount, 7)
  assert.equal(page.data.errorDetailList.length, 20)
  assert.equal(page.data.hiddenErrorDetailCount, 5)

  page.onExpandSourceEvidence()

  assert.equal(page.data.sourceEvidenceItems.length, 10)
  assert.equal(page.data.hasMoreSourceEvidence, false)

  page.onExpandErrorDetails()

  assert.equal(page.data.errorDetailList.length, 25)
  assert.equal(page.data.hasMoreErrorDetails, false)
})

test('report page submits parent feedback and marks the target as submitted', async () => {
  let feedbackPayload = null
  const cloud = {
    getReportDetail: async () => ({
      permissions: { canView: true },
      feedback: [],
      report: {
        _id: 'report-1',
        studentId: 'student-1',
        subject: 'math',
        type: 'diagnosis',
        status: 'completed',
        createdAt: '2026-06-11T10:00:00Z',
        bottlenecks: [{ lpCode: 'LP-001', errorCount: 1 }],
        errorDetails: [{ questionContent: '1+1' }]
      }
    }),
    getSubjectDashboard: async () => ({ profile: { pendingBottlenecks: [] } }),
    createReportFeedback: async payload => {
      feedbackPayload = payload
      return { feedbackId: 'feedback-1' }
    },
    getReportFeedback: async () => [{
      _id: 'feedback-1',
      targetType: 'bottleneck',
      targetId: 'LP-001',
      type: 'wrong_bottleneck'
    }]
  }
  const wx = createWxMock()
  const { page } = loadPage('miniprogram/pages/report/report.js', {
    wx,
    modules: {
      '../../utils/cloud': cloud,
      '../../utils/util': { formatChineseDateTime: () => '2026年6月11日 10:00' },
      '../../utils/poller': { createPoller: () => ({ start() {}, stop() {} }) },
      './report-presenter': require('../miniprogram/pages/report/report-presenter')
    }
  })

  await page.loadReport('report-1')
  page.onOpenFeedback({ currentTarget: { dataset: { targetType: 'bottleneck', targetId: 'LP-001' } } })
  page.onFeedbackTypeTap({ currentTarget: { dataset: { type: 'wrong_bottleneck' } } })
  page.onFeedbackReasonInput({ detail: { value: '  这个 BN-REF-01 对应 cloud://env/evidence 不准确  ' } })
  page.onFeedbackNoteInput({ detail: { value: '请核对 NODE-REF-02 与原始记录\n' } })
  await page.onSubmitFeedback()

  assert.deepEqual(JSON.parse(JSON.stringify(feedbackPayload)), {
    reportId: 'report-1',
    type: 'wrong_bottleneck',
    targetType: 'bottleneck',
    targetId: 'LP-001',
    reason: '  这个 BN-REF-01 对应 cloud://env/evidence 不准确  ',
    note: '请核对 NODE-REF-02 与原始记录\n'
  })
  assert.equal(page.data.feedbackDialog.visible, false)
  assert.equal(page.data.feedbackByTarget['bottleneck:LP-001'].submitted, true)
  assert.ok(wx.calls.some(call => call.name === 'showToast' && /已记录/.test(call.payload.title)))
})

test('report co-parent can generate paper and retry analysis', async () => {
  let retryCalled = false
  const cloud = {
    getReportDetail: async () => ({
      permissions: { canView: true, canManageParents: false, canGeneratePaper: true, canRetryAnalysis: true },
      report: {
        _id: 'report-1',
        studentId: 'student-1',
        subject: 'math',
        type: 'diagnosis',
        status: 'completed',
        createdAt: '2026-06-11T10:00:00Z',
        bottlenecks: [{ lpCode: 'LP-001', errorCount: 1 }]
      }
    }),
    getSubjectDashboard: async () => ({ profile: { pendingBottlenecks: [{ lpCode: 'LP-001' }] } }),
    getActiveVerificationPaper: async () => ({ status: 'ready', paper: { _id: 'paper-ready' } }),
    callAnalyzePhotos: async () => { retryCalled = true }
  }
  const wx = createWxMock()
  const { page } = loadPage('miniprogram/pages/report/report.js', {
    wx,
    modules: {
      '../../utils/cloud': cloud,
      '../../utils/util': { formatChineseDateTime: () => '2026年6月11日 10:00' },
      '../../utils/poller': { createPoller: () => ({ start() {}, stop() {} }) },
      './report-presenter': require('../miniprogram/pages/report/report-presenter')
    }
  })

  await page.loadReport('report-1')
  assert.equal(page.data.canGeneratePaper, true)
  assert.equal(page.data.canRetryAnalysis, true)

  await page.onGenerateVerification()
  page.onRetryAnalysis()
  assert.equal(retryCalled, true)
  // 统一入口：ready 时跳预览页
  assert.match(wx.calls.find(call => call.name === 'navigateTo').payload.url, /paper-preview\?paperId=paper-ready/)
})

test('report learning resource cards copy resource links for parent review', () => {
  const wx = createWxMock()
  const { page } = loadPage('miniprogram/pages/report/report.js', {
    wx,
    modules: {
      '../../utils/cloud': {},
      '../../utils/util': { formatChineseDateTime: () => '' },
      '../../utils/poller': { createPoller: () => ({ start() {}, stop() {} }) },
      './report-presenter': { buildReportView: () => ({}) }
    }
  })

  page.onLearningResourceTap({
    currentTarget: {
      dataset: {
        url: 'https://www.bilibili.com/video/BV1M6B3BuEFn/',
        platform: 'B站',
        title: '小数乘法重点易错点'
      }
    }
  })

  const clipboardCall = wx.calls.find(call => call.name === 'setClipboardData')
  assert.equal(clipboardCall.payload.data, 'https://www.bilibili.com/video/BV1M6B3BuEFn/')
})

test('report preserves user-authored internal references in bound feedback values', () => {
  const { page } = loadPage('miniprogram/pages/report/report.js', {
    modules: {
      '../../utils/cloud': {},
      '../../utils/util': { formatChineseDateTime: () => '' },
      '../../utils/poller': { createPoller: () => ({ start() {}, stop() {} }) },
      './report-presenter': { buildReportView: () => ({}) }
    }
  })

  page.onFeedbackReasonInput({ detail: { value: '复测 BN-FEEDBACK-01 与 cloud://env/file' } })
  page.onFeedbackNoteInput({ detail: { value: '失败 ERR-FEEDBACK-01 cloud://env/file' } })

  assert.equal(page.data.feedbackDialog.reason, '复测 BN-FEEDBACK-01 与 cloud://env/file')
  assert.equal(page.data.feedbackDialog.note, '失败 ERR-FEEDBACK-01 cloud://env/file')
})

test('report feedback failure hides hostile backend error details', async () => {
  const wx = createWxMock()
  const { page } = loadPage('miniprogram/pages/report/report.js', {
    wx,
    modules: {
      '../../utils/cloud': {
        createReportFeedback: async () => { throw new Error('失败 BN-BACKEND-01 cloud://env/file') }
      },
      '../../utils/util': { formatChineseDateTime: () => '' },
      '../../utils/poller': { createPoller: () => ({ start() {}, stop() {} }) },
      './report-presenter': { buildReportView: () => ({}) }
    }
  })
  page.setData({ reportId: 'report-route-id' })
  page.onOpenFeedback({ currentTarget: { dataset: { targetType: 'report', targetId: 'report-route-id' } } })
  page.onFeedbackReasonInput({ detail: { value: '请检查 BN-USER-01' } })

  await page.onSubmitFeedback()

  const toast = wx.calls.filter(call => call.name === 'showToast').at(-1)
  assert.equal(toast.payload.title, '反馈提交失败')
  assert.equal(page.data.feedbackDialog.reason, '请检查 BN-USER-01')
})

test('report generates, downloads and opens its printable PDF', async () => {
  const cloud = {
    callGenerateReportPDF: async () => ({ pdfFileId: 'cloud://report.pdf' })
  }
  const wx = createWxMock({
    cloud: {
      downloadFile: options => options.success({ tempFilePath: '/tmp/report.pdf' })
    }
  })
  const { page } = loadPage('miniprogram/pages/report/report.js', {
    wx,
    modules: {
      '../../utils/cloud': cloud,
      '../../utils/util': { formatChineseDateTime: () => '' },
      '../../utils/poller': { createPoller: () => ({ start() {}, stop() {} }) },
      './report-presenter': { buildReportView: () => ({}) }
    }
  })
  page.setData({ reportId: 'report-1' })

  await page.onDownloadPDF()
  assert.equal(page.data.generatingPdf, false)
  assert.equal(wx.calls.find(call => call.name === 'openDocument').payload.filePath, '/tmp/report.pdf')
})

test('report page exposes compact layered navigation without hiding report sections', () => {
  const wxml = fs.readFileSync(path.join(ROOT, 'miniprogram/pages/report/report.wxml'), 'utf8')
  const wxss = fs.readFileSync(path.join(ROOT, 'miniprogram/pages/report/report.wxss'), 'utf8')

  assert.match(wxml, /report-layer-nav/)
  assert.match(wxml, /data-section="{{item.key}}"/)
  assert.match(wxml, /id="report-section-summary"/)
  assert.match(wxml, /id="report-section-evidence"/)
  assert.match(wxml, /id="report-section-change"/)
  assert.match(wxml, /id="report-section-action"/)
  assert.match(wxss, /\.report-layer-nav/)
  assert.match(wxss, /\.report-layer-item/)
})

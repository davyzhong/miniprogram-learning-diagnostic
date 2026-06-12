const test = require('node:test')
const assert = require('node:assert/strict')
const { createWxMock, loadPage } = require('./helpers/page-harness')
const util = require('../miniprogram/utils/util')

test('add student trims input and creates all subject profiles', async () => {
  let saved = null
  const cloud = {
    createStudentWithProfiles: async data => { saved = data }
  }
  const wx = createWxMock()
  const { page } = loadPage('miniprogram/pages/add-student/add-student.js', {
    wx,
    modules: { '../../utils/cloud': cloud }
  })

  page.onNameInput({ detail: { value: '  钟青羽  ' } })
  page.onGradeTap({ currentTarget: { dataset: { grade: 5 } } })
  assert.equal(page.data.canSave, true)

  await page.onSave()
  assert.equal(saved.name, '钟青羽')
  assert.equal(saved.grade, 5)
  assert.equal(page.data.saving, false)
})

test('student list combines profile report counts and opens subject selection', async () => {
  const cloud = {
    getStudents: async () => [{ _id: 'student-1', name: '钟青羽', grade: 5 }],
    getSubjectProfiles: async () => [{ totalReports: 2, updatedAt: '2026-06-11T10:00:00Z' }]
  }
  const wx = createWxMock()
  const { page } = loadPage('miniprogram/pages/index/index.js', {
    wx,
    modules: {
      '../../utils/cloud': cloud,
      '../../utils/util': { formatRelativeTime: () => '2小时前' }
    }
  })

  await page.loadStudents()
  assert.equal(page.data.students[0].totalReports, 2)
  assert.equal(page.data.students[0].gradeText, '5年级')
  page.onStudentTap({ currentTarget: { dataset: { id: 'student-1', name: '钟青羽', grade: 5 } } })
  assert.match(wx.calls.find(call => call.name === 'navigateTo').payload.url, /studentId=student-1/)
})

test('subject selection ensures a profile before entering the subject home', async () => {
  let ensured = null
  const cloud = {
    ensureSubjectProfile: async (...args) => { ensured = args }
  }
  const wx = createWxMock()
  const { page } = loadPage('miniprogram/pages/subject-select/subject-select.js', {
    wx,
    modules: { '../../utils/cloud': cloud }
  })
  page.setData({ studentId: 'student-1', studentName: '钟青羽', grade: 5 })

  await page.onSubjectTap({ currentTarget: { dataset: { key: 'math', name: '数学' } } })
  assert.deepEqual(ensured, ['student-1', 'math', '数学'])
  assert.match(wx.calls.find(call => call.name === 'navigateTo').payload.url, /pages\/subject-home\/subject-home/)
  assert.equal(page.data.enteringSubject, '')
})

test('upload selection warns about duplicate filenames but keeps the images', () => {
  const wx = createWxMock({
    chooseMedia: options => options.success({
      tempFiles: [
        { tempFilePath: '/tmp/paper.jpg', size: 100 },
        { tempFilePath: '/other/paper.jpg', size: 100 }
      ]
    })
  })
  const { page } = loadPage('miniprogram/pages/upload/upload.js', {
    wx,
    modules: { '../../utils/cloud': {} }
  })
  page.setData({ existingFileNames: ['paper.jpg'] })

  page.onChooseImage()
  assert.equal(page.data.images.length, 2)
  assert.ok(page.data.images.every(image => image.nameDuplicate))
  assert.equal(wx.calls.find(call => call.name === 'showToast').payload.title, '发现同名照片，仍可继续上传')
})

test('upload submits file metadata and navigates back on success', async () => {
  let submitted = null
  const cloud = {
    callUploadAndAnalyze: async payload => {
      submitted = payload
      return { success: true, reportId: 'report-1' }
    }
  }
  const wx = createWxMock()
  const { page } = loadPage('miniprogram/pages/upload/upload.js', {
    wx,
    modules: { '../../utils/cloud': cloud }
  })
  page.uploadOne = async (_, index) => `cloud://photo-${index + 1}`
  page.setData({
    studentId: 'student-1',
    subject: 'math',
    mode: 'diagnosis',
    images: [{ tempPath: '/tmp/paper.jpg', fileName: 'paper.jpg', fileSize: 100 }]
  })

  await page.onSubmit()
  assert.deepEqual(
    JSON.parse(JSON.stringify(submitted.imageMetas)),
    [{ fileName: 'paper.jpg', fileSize: 100 }]
  )
  assert.equal(page.data.uploadProgress, 100)
  assert.equal(wx.calls.find(call => call.name === 'showToast').payload.title, '已提交，AI 正在分析')
  assert.ok(wx.calls.some(call => call.name === 'navigateBack'))
})

test('verification page selects all available bottlenecks by default', async () => {
  const pendingBottlenecks = [
    { lpCode: 'LP-001', lpName: '计算错误', severity: 'medium' },
    { lpCode: 'LP-008', lpName: '审题错误', severity: 'high' }
  ]
  const cloud = {
    getSubjectProfile: async () => ({ pendingBottlenecks })
  }
  const { page } = loadPage('miniprogram/pages/generate-verification/generate-verification.js', {
    modules: { '../../utils/cloud': cloud }
  })
  page.setData({ studentId: 'student-1', subject: 'math' })

  await page.loadPendingBottlenecks()
  assert.equal(page.data.selectedCount, 2)
  assert.ok(page.data.bottlenecks.every(item => item.selected))
})

test('verification page shows readable bottleneck summaries instead of LP codes', async () => {
  const pendingBottlenecks = [
    { lpCode: 'LP-008', lpName: '审题错误', severity: 'high' },
    { lpCode: 'LP-001', lpName: '计算错误（加减乘除）', severity: 'medium' },
    { lpCode: 'LP-XXX', severity: 'low' }
  ]
  const cloud = {
    getSubjectProfile: async () => ({ pendingBottlenecks })
  }
  const { page } = loadPage('miniprogram/pages/generate-verification/generate-verification.js', {
    modules: { '../../utils/cloud': cloud }
  })
  page.setData({ studentId: 'student-1', subject: 'math' })

  await page.loadPendingBottlenecks()

  assert.deepEqual(
    JSON.parse(JSON.stringify(page.data.bottlenecks.map(item => item.displayName))),
    ['审题错误', '计算错误', '待确认卡点']
  )
  assert.equal(page.data.selectedSummary, '审题错误、计算错误、待确认卡点')
})

test('verification page selects at most five bottlenecks by severity priority', async () => {
  const pendingBottlenecks = [
    { lpCode: 'LP-001', severity: 'low' },
    { lpCode: 'LP-002', severity: 'medium' },
    { lpCode: 'LP-003', severity: 'high' },
    { lpCode: 'LP-004', severity: 'medium' },
    { lpCode: 'LP-005', severity: 'high' },
    { lpCode: 'LP-006', severity: 'low' },
    { lpCode: 'LP-007', severity: 'high' }
  ]
  const cloud = {
    getSubjectProfile: async () => ({ pendingBottlenecks })
  }
  const { page } = loadPage('miniprogram/pages/generate-verification/generate-verification.js', {
    modules: { '../../utils/cloud': cloud }
  })
  page.setData({ studentId: 'student-1', subject: 'math' })

  await page.loadPendingBottlenecks()
  assert.equal(page.data.selectedCount, 5)
  assert.deepEqual(
    JSON.parse(JSON.stringify(page.data.bottlenecks.filter(item => item.selected).map(item => item.lpCode))),
    ['LP-003', 'LP-005', 'LP-007', 'LP-002', 'LP-004']
  )
  assert.ok(page.data.bottlenecks.every(item => !/LP-\d+/.test(item.displayName)))
})

test('verification paper generation sends only selected bottlenecks and opens the saved paper', async () => {
  let request = null
  const cloud = {
    callGeneratePaper: async payload => {
      request = payload
      return { paperId: 'paper-1', pdfFileId: 'cloud://paper.pdf' }
    }
  }
  const wx = createWxMock()
  const { page } = loadPage('miniprogram/pages/generate-verification/generate-verification.js', {
    wx,
    modules: { '../../utils/cloud': cloud }
  })
  page.setData({
    studentId: 'student-1',
    subject: 'math',
    bottlenecks: [
      { lpCode: 'LP-001', selected: true },
      { lpCode: 'LP-002', selected: false }
    ]
  })

  await page.onGenerate()
  assert.deepEqual(JSON.parse(JSON.stringify(request.targets)), ['LP-001'])
  assert.equal(request.type, 'verification')
  assert.equal(request.preview, false)
  assert.match(wx.calls.find(call => call.name === 'navigateTo').payload.url, /paperId=paper-1/)
})

test('verification paper generation surfaces the backend error message', async () => {
  const cloud = {
    callGeneratePaper: async () => {
      throw new Error('云函数执行超时，请稍后重试')
    }
  }
  const wx = createWxMock()
  const { page } = loadPage('miniprogram/pages/generate-verification/generate-verification.js', {
    wx,
    modules: { '../../utils/cloud': cloud }
  })
  page.setData({
    studentId: 'student-1',
    subject: 'math',
    bottlenecks: [{ lpCode: 'LP-001', selected: true }]
  })

  await page.onGenerate()

  assert.equal(
    wx.calls.filter(call => call.name === 'showToast').at(-1).payload.title,
    '云函数执行超时，请稍后重试'
  )
})

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

test('paper preview formats default paper names without repeating the grade key', () => {
  const { page } = loadPage('miniprogram/pages/paper-preview/paper-preview.js', {
    modules: { '../../utils/cloud': {} }
  })
  assert.equal(
    page.getPaperName({ type: 'default-diagnosis', grade: 3, paperKey: 'grade3_a' }),
    '3年级 A 卷'
  )
})

test('paper preview loads a saved paper and opens its upload flow', async () => {
  const cloud = {
    getPaper: async () => ({
      _id: 'paper-1',
      studentId: 'student-1',
      subject: 'math',
      type: 'verification',
      pdfFileId: 'cloud://paper.pdf',
      questions: [{ content: '1+1' }],
      bottleneckTargets: ['LP-001'],
      bottleneckSummaries: ['计算错误']
    }),
    getStudent: async () => ({ name: '钟青羽' })
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
  assert.equal(page.data.bottleneckText, '计算错误')
  assert.equal(page.data.pdfDownloaded, true)
  assert.doesNotMatch(page.data.bottleneckText, /LP-\d+/)
  page.onUpload()
  const url = wx.calls.find(call => call.name === 'navigateTo').payload.url
  assert.match(url, /mode=verification/)
  assert.match(url, /paperId=paper-1/)
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
})

test('paper preview downloads once and marks the PDF as downloaded', async () => {
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

  await page.onDownload()
  assert.equal(downloadCount, 1)
  assert.ok(wx.calls.some(call => call.name === 'showToast' && /已下载/.test(call.payload.title)))
})

test('report passes its subject name into verification paper generation', () => {
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
  page.setData({
    report: {
      studentId: 'student-1',
      subject: 'chinese',
      bottlenecks: [{ lpCode: 'LP-101' }]
    }
  })

  page.onGenerateVerification()
  const url = wx.calls.find(call => call.name === 'navigateTo').payload.url
  assert.match(url, /subjectName=%E8%AF%AD%E6%96%87/)
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
      '../../utils/poller': {
        createPoller: options => {
          pollOptions = options
          return { start() {}, stop() {}, isRunning: () => false }
        }
      }
    }
  })
  page.setData({ studentId: 'student-1', subject: 'math', currentAnalysisId: 'active-report' })

  page.startReportPolling()
  await pollOptions.request()
  assert.deepEqual(requested, ['active-report'])
})

test('subject home stops polling and surfaces a stale analysis task', async () => {
  let pollOptions = null
  const { page } = loadPage('miniprogram/pages/subject-home/subject-home.js', {
    modules: {
      '../../utils/cloud': {},
      '../../utils/util': { formatRelativeTime: () => '' },
      '../../utils/poller': {
        createPoller: options => {
          pollOptions = options
          return { start() {}, stop() {}, isRunning: () => false }
        }
      }
    }
  })
  page.setData({ studentId: 'student-1', subject: 'math', currentAnalysisId: 'active-report' })

  page.startReportPolling()
  const shouldContinue = await pollOptions.onValue({
    report: { _id: 'active-report', status: 'analyzing' },
    progress: {
      status: 'processing',
      completedBatches: 0,
      totalBatches: 1,
      createdAt: '2020-01-01T00:00:00Z'
    }
  }, 2)

  assert.equal(shouldContinue, false)
  assert.equal(page.data.analysisStatusText, '分析超时，点击查看并重新分析')
})

test('report exposes retry when an analysis task is stale', async () => {
  let pollOptions = null
  const { page } = loadPage('miniprogram/pages/report/report.js', {
    modules: {
      '../../utils/cloud': {},
      '../../utils/util': { formatChineseDateTime: () => '' },
      '../../utils/poller': {
        createPoller: options => {
          pollOptions = options
          return { start() {}, stop() {} }
        }
      },
      './report-presenter': { buildReportView: () => ({}) }
    }
  })

  page.startPolling('report-1')
  const shouldContinue = await pollOptions.onValue({
    report: { _id: 'report-1', status: 'analyzing' },
    progress: {
      status: 'processing',
      completedBatches: 0,
      totalBatches: 1,
      createdAt: '2020-01-01T00:00:00Z'
    }
  }, 2)

  assert.equal(shouldContinue, false)
  assert.equal(page.data.analysisTaskMissing, true)
  assert.equal(page.data.analysisStatusText, '分析超时，请重新分析')
})

test('learning records group uploads reports and verification papers by day', async () => {
  const cloud = {
    getReports: async () => [
      {
        _id: 'report-1',
        type: 'diagnosis',
        createdAt: '2026-06-11T10:00:00Z',
        summary: '发现计算基础卡点',
        totalErrors: 2,
        bottlenecks: [{ lpCode: 'LP-001' }],
        imageFileIds: ['cloud://legacy-photo']
      },
      {
        _id: 'report-2',
        type: 'verification',
        createdAt: '2026-06-11T12:00:00Z',
        comparisonSummary: '1 个学习卡点已改善',
        verificationEvidence: [{ lpCode: 'LP-001', complete: true, allCorrect: true }],
        imageFiles: [{ fileID: 'cloud://verification-photo', fileName: '验证作答.jpg', ocrSummary: '验证题作答' }]
      }
    ],
    getPapers: async () => [{
      _id: 'paper-1',
      type: 'verification',
      createdAt: '2026-06-11T11:00:00Z',
      questions: [{}, {}, {}],
      bottleneckTargets: ['LP-001']
    }],
    getTempFileURLs: async () => [{
      fileID: 'cloud://legacy-photo',
      tempFileURL: 'https://temp/legacy-photo'
    }, {
      fileID: 'cloud://verification-photo',
      tempFileURL: 'https://temp/verification-photo'
    }]
  }
  const wx = createWxMock()
  const { page } = loadPage('miniprogram/pages/upload-history/upload-history.js', {
    wx,
    modules: {
      '../../utils/cloud': cloud,
      '../../utils/util': util
    }
  })
  page.setData({ studentId: 'student-1', subject: 'math' })

  await page.loadHistory()
  assert.equal(page.data.days.length, 1)
  assert.deepEqual(JSON.parse(JSON.stringify(page.data.days[0].events.map(event => event.kind))), [
    'verification-report',
    'verification-paper',
    'diagnosis-report'
  ])
  assert.equal(page.data.days[0].events[2].photos[0].fileName, '历史照片1')
  assert.match(page.data.days[0].events[2].photos[0].summaryText, /暂无 OCR/)
  page.onPreviewPhoto({ currentTarget: { dataset: { dayIndex: 0, eventIndex: 2, photoIndex: 0 } } })
  assert.equal(wx.calls.find(call => call.name === 'previewImage').payload.current, 'https://temp/legacy-photo')

  page.onEventTap({ currentTarget: { dataset: { dayIndex: 0, eventIndex: 1 } } })
  assert.match(wx.calls.find(call => call.name === 'navigateTo').payload.url, /paperId=paper-1/)
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

test('subject home resets analysis state and reloads data when polling completes or fails', async () => {
  let pollOptions = null
  let profileLoads = 0
  let recordLoads = 0
  const cloud = {
    getSubjectProfile: async () => ({
      totalReports: 3,
      pendingBottlenecks: [{ lpCode: 'LP-001' }],
      improvedBottlenecks: []
    }),
    getReports: async () => [],
    getReport: async () => ({ _id: 'active-report', status: 'analyzing' }),
    getAnalysisProgress: async () => ({ completedBatches: 0, totalBatches: 1 })
  }
  const wx = createWxMock()
  const { page } = loadPage('miniprogram/pages/subject-home/subject-home.js', {
    wx,
    modules: {
      '../../utils/cloud': cloud,
      '../../utils/util': { formatRelativeTime: () => '' },
      '../../utils/poller': {
        createPoller: options => {
          pollOptions = options
          return { start() {}, stop() {}, isRunning: () => false }
        }
      }
    }
  })
  // override loaders to count invocations
  page.loadProfile = async () => { profileLoads += 1 }
  page.loadRecords = async () => { recordLoads += 1 }
  page.setData({ studentId: 'student-1', subject: 'math', currentAnalysisId: 'active-report' })

  page.startReportPolling()
  // simulate completion
  const continueAfterComplete = await pollOptions.onValue(
    { report: { _id: 'active-report', status: 'completed' }, progress: null },
    1
  )
  assert.equal(continueAfterComplete, false)
  assert.equal(page.data.analysisStatus, '')
  assert.equal(page.data.currentAnalysisId, '')
  assert.equal(page.data.analysisStatusText, '分析完成')
  assert.equal(profileLoads, 1)
  assert.equal(recordLoads, 1)
  assert.ok(wx.calls.some(call => call.name === 'showToast' && call.payload.title === '诊断完成'))

  // reset counters and simulate failure branch
  profileLoads = 0
  recordLoads = 0
  wx.calls.length = 0
  const continueAfterFailure = await pollOptions.onValue(
    { report: { _id: 'active-report', status: 'failed' }, progress: null },
    2
  )
  assert.equal(continueAfterFailure, false)
  assert.equal(page.data.analysisStatus, '')
  assert.equal(page.data.currentAnalysisId, '')
  assert.equal(page.data.analysisStatusText, '')
  assert.equal(profileLoads, 0)
  assert.ok(wx.calls.some(call => call.name === 'showToast' && /失败/.test(call.payload.title)))

  // timeout branch clears state without reloading
  wx.calls.length = 0
  pollOptions.onTimeout()
  assert.equal(page.data.analysisStatus, '')
  assert.equal(page.data.currentAnalysisId, '')
  assert.equal(page.data.analysisStatusText, '')
  assert.ok(wx.calls.some(call => call.name === 'showToast' && /稍后/.test(call.payload.title)))
})

test('upload history degrades gracefully when some temporary URLs are empty', async () => {
  const cloud = {
    getReports: async () => [{
      _id: 'report-1',
      type: 'diagnosis',
      createdAt: '2026-06-11T10:00:00Z',
      imageFiles: [
        { fileID: 'cloud://ok', fileName: 'a.jpg', ocrSummary: 'OK' },
        { fileID: 'cloud://expired', fileName: 'b.jpg', ocrSummary: 'OLD' }
      ]
    }],
    getPapers: async () => [],
    getTempFileURLs: async () => [
      { fileID: 'cloud://ok', tempFileURL: 'https://temp/ok' },
      { fileID: 'cloud://expired', tempFileURL: '' }
    ]
  }
  const wx = createWxMock()
  const { page } = loadPage('miniprogram/pages/upload-history/upload-history.js', {
    wx,
    modules: {
      '../../utils/cloud': cloud,
      '../../utils/util': util
    }
  })
  page.setData({ studentId: 'student-1', subject: 'math' })

  await page.loadHistory()
  assert.equal(page.data.loading, false)
  assert.equal(page.data.days[0].events[0].photos[0].tempFileURL, 'https://temp/ok')
  assert.equal(page.data.days[0].events[0].photos[1].tempFileURL, '')

  // previewing the expired photo shows a toast and does not crash
  page.onPreviewPhoto({ currentTarget: { dataset: { dayIndex: 0, eventIndex: 0, photoIndex: 1 } } })
  const expiredToast = wx.calls.find(call => call.name === 'showToast' && /无法预览/.test(call.payload.title))
  assert.ok(expiredToast)
  assert.equal(wx.calls.some(call => call.name === 'previewImage'), false)

  // previewing the valid photo filters out the empty URL from the urls list
  page.onPreviewPhoto({ currentTarget: { dataset: { dayIndex: 0, eventIndex: 0, photoIndex: 0 } } })
  const previewCall = wx.calls.find(call => call.name === 'previewImage')
  assert.deepEqual(previewCall.payload.urls, ['https://temp/ok'])
  assert.equal(previewCall.payload.current, 'https://temp/ok')
})

test('upload history surfaces load errors without leaving the loading flag stuck', async () => {
  const cloud = {
    getReports: async () => { throw new Error('network down') },
    getPapers: async () => [],
    getTempFileURLs: async () => []
  }
  const wx = createWxMock()
  const { page } = loadPage('miniprogram/pages/upload-history/upload-history.js', {
    wx,
    modules: {
      '../../utils/cloud': cloud,
      '../../utils/util': util
    }
  })
  page.setData({ studentId: 'student-1', subject: 'math' })

  await page.loadHistory()
  assert.equal(page.data.loading, false)
  assert.equal(page.data.days.length, 0)
  const errorToast = wx.calls.find(call => call.name === 'showToast' && /加载失败/.test(call.payload.title))
  assert.ok(errorToast)
})

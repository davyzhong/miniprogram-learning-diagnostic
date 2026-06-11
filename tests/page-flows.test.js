const test = require('node:test')
const assert = require('node:assert/strict')
const { createWxMock, loadPage } = require('./helpers/page-harness')

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

test('upload submits file metadata and treats analysis timeout as background work', async () => {
  let submitted = null
  const timeout = new Error('timeout')
  const cloud = {
    callUploadAndAnalyze: async payload => {
      submitted = payload
      throw timeout
    },
    isTimeoutError: error => error === timeout
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
  assert.equal(page.data.uploading, false)
  assert.equal(wx.calls.find(call => call.name === 'showToast').payload.title, '已提交，AI将在后台分析')
  assert.ok(wx.calls.some(call => call.name === 'navigateBack'))
})

test('verification page selects at most five high priority bottlenecks', async () => {
  const pendingBottlenecks = Array.from({ length: 7 }, (_, index) => ({
    lpCode: `LP-00${index + 1}`,
    lpName: `卡点${index + 1}`,
    severity: 'high'
  }))
  const cloud = {
    getSubjectProfile: async () => ({ pendingBottlenecks })
  }
  const { page } = loadPage('miniprogram/pages/generate-verification/generate-verification.js', {
    modules: { '../../utils/cloud': cloud }
  })
  page.setData({ studentId: 'student-1', subject: 'math' })

  await page.loadPendingBottlenecks()
  assert.equal(page.data.selectedCount, 5)
  assert.equal(page.data.bottlenecks.filter(item => item.selected).length, 5)
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
      bottleneckTargets: ['LP-001']
    }),
    getStudent: async () => ({ name: '钟青羽' })
  }
  const wx = createWxMock()
  const { page } = loadPage('miniprogram/pages/paper-preview/paper-preview.js', {
    wx,
    modules: { '../../utils/cloud': cloud }
  })

  await page.loadPaper('paper-1')
  assert.equal(page.data.pdfReady, true)
  assert.equal(page.data.typeText, '验证试卷')
  page.onUpload()
  const url = wx.calls.find(call => call.name === 'navigateTo').payload.url
  assert.match(url, /mode=verification/)
  assert.match(url, /paperId=paper-1/)
})

test('paper preview downloads and opens the generated PDF', async () => {
  const wx = createWxMock({
    cloud: {
      downloadFile: async payload => {
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
  assert.equal(wx.calls.find(call => call.name === 'openDocument').payload.filePath, '/tmp/paper.pdf')
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

test('upload history supports legacy reports and previews available originals', async () => {
  const cloud = {
    getReports: async () => [{
      _id: 'report-1',
      type: 'diagnosis',
      createdAt: '2026-06-11T10:00:00Z',
      imageFileIds: ['cloud://legacy-photo']
    }],
    getTempFileURLs: async () => [{
      fileID: 'cloud://legacy-photo',
      tempFileURL: 'https://temp/legacy-photo'
    }]
  }
  const wx = createWxMock()
  const { page } = loadPage('miniprogram/pages/upload-history/upload-history.js', {
    wx,
    modules: {
      '../../utils/cloud': cloud,
      '../../utils/util': { formatChineseDateTime: () => '2026年6月11日 10:00' }
    }
  })
  page.setData({ studentId: 'student-1', subject: 'math' })

  await page.loadHistory()
  assert.equal(page.data.groups[0].photos[0].fileName, '历史照片1')
  assert.match(page.data.groups[0].photos[0].summaryText, /暂无 OCR/)
  page.onPreviewPhoto({ currentTarget: { dataset: { groupIndex: 0, photoIndex: 0 } } })
  assert.equal(wx.calls.find(call => call.name === 'previewImage').payload.current, 'https://temp/legacy-photo')
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

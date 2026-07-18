const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const ROOT = path.resolve(__dirname, '..')
const { loadPageAndWait, flushAsync, waitForPageLoad, isThenable } = require('./helpers/page-flow-utils')
const { createWxMock, loadPage } = require('./helpers/page-harness')
const util = require('../miniprogram/utils/util')

test('learning records group uploads reports and verification papers by day', async () => {
  const cloud = {
    getReports: async () => [
      {
        _id: 'report-1',
        subject: 'math',
        type: 'diagnosis',
        createdAt: '2026-06-11T10:00:00Z',
        evidenceTime: '2026-06-11T10:05:00Z',
        summary: '发现计算基础卡点',
        totalErrors: 2,
        bottlenecks: [{ lpCode: 'LP-001' }],
        imageFileIds: ['cloud://legacy-photo']
      },
      {
        _id: 'report-2',
        subject: 'math',
        type: 'verification',
        createdAt: '2026-06-11T12:00:00Z',
        evidenceTime: '2026-06-11T12:05:00Z',
        comparisonSummary: '1 个学习卡点已改善',
        verificationEvidence: [{ lpCode: 'LP-001', complete: true, allCorrect: true }],
        imageFiles: [{ fileID: 'cloud://verification-photo', fileName: '验证作答.jpg', ocrSummary: '验证题作答', uploadedAt: '2026-06-11T12:05:00Z' }]
      }
    ],
    getPapers: async () => [{
      _id: 'paper-1',
      subject: 'math',
      type: 'verification',
      paperDisplayCode: '数学-20260611-01',
      createdAt: '2026-06-11T11:00:00Z',
      generatedAt: '2026-06-11T11:02:00Z',
      paperDate: '2026-06-11',
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
  page.setData({ studentId: 'student-1', activeSubject: 'math' })

  await page.loadHistory()
  assert.equal(page.data.days.length, 1)
  assert.deepEqual(JSON.parse(JSON.stringify(page.data.days[0].events.map(event => event.kind))), [
    'verification-report',
    'verification-paper',
    'diagnosis-report'
  ])
  assert.equal(page.data.days[0].events[2].photos[0].fileName, '历史照片1')
  assert.ok(page.data.days[0].events[0].chips.some(chip => /证据时间 6月11日/.test(chip)))
  assert.equal(page.data.days[0].events[1].paperCode, '数学-20260611-01')
  assert.equal(page.data.days[0].events[1].showPaperCode, true)
  assert.ok(page.data.days[0].events[1].chips.includes('3题'))
  assert.match(page.data.days[0].events[2].photos[0].summaryText, /暂无 OCR/)
  page.onPreviewPhoto({ currentTarget: { dataset: { dayIndex: 0, eventIndex: 2, photoIndex: 0 } } })
  assert.equal(wx.calls.find(call => call.name === 'previewImage').payload.current, 'https://temp/legacy-photo')

  page.onEventTap({ currentTarget: { dataset: { dayIndex: 0, eventIndex: 1 } } })
  assert.match(wx.calls.find(call => call.name === 'navigateTo').payload.url, /paperId=paper-1/)
})

test('learning records fold evidence, compact transient states, and hide low frequency tool papers', async () => {
  const cloud = {
    getReports: async () => [
      {
        _id: 'report-1',
        subject: 'math',
        type: 'diagnosis',
        status: 'completed',
        createdAt: '2026-06-12T09:00:00Z',
        evidenceTime: '2026-06-12T09:05:00Z',
        summary: '发现计算基础卡点',
        bottlenecks: [{ lpCode: 'LP-001' }],
        imageFiles: [
          { fileID: 'cloud://photo-1', fileName: '数学卷1.jpg', ocrSummary: '计算题错 2 道' },
          { fileID: 'cloud://photo-2', fileName: '数学卷2.jpg', ocrSummary: '疑似重复', isDuplicate: true }
        ]
      },
      {
        _id: 'report-2',
        subject: 'math',
        type: 'verification',
        status: 'completed',
        paperId: 'paper-1',
        createdAt: '2026-06-12T11:00:00Z',
        comparisonSummary: '计算基础有改善',
        verificationEvidence: [{ lpCode: 'LP-001', complete: true, allCorrect: true }],
        bottlenecks: [{ lpCode: 'LP-001', status: 'improved' }],
        imageFiles: [{ fileID: 'cloud://answer-1', fileName: '验证卷作答.jpg', ocrSummary: '验证卷答题照片' }]
      },
      {
        _id: 'report-analyzing',
        subject: 'math',
        type: 'diagnosis',
        status: 'analyzing',
        createdAt: '2026-06-12T12:00:00Z'
      },
      {
        _id: 'report-failed',
        subject: 'math',
        type: 'diagnosis',
        status: 'failed',
        createdAt: '2026-06-12T12:30:00Z'
      }
    ],
    getPapers: async () => [
      {
        _id: 'paper-1',
        subject: 'math',
        type: 'verification',
        paperDisplayCode: '数学-20260612-01',
        createdAt: '2026-06-12T10:00:00Z',
        paperDate: '2026-06-12',
        questions: [{}, {}, {}, {}, {}, {}],
        bottleneckSummaries: ['计算基础']
      },
      {
        _id: 'default-paper',
        subject: 'math',
        type: 'default-diagnosis',
        createdAt: '2026-06-12T08:00:00Z'
      }
    ],
    getTempFileURLs: async () => [
      { fileID: 'cloud://photo-1', tempFileURL: 'https://temp/photo-1' },
      { fileID: 'cloud://photo-2', tempFileURL: 'https://temp/photo-2' },
      { fileID: 'cloud://answer-1', tempFileURL: 'https://temp/answer-1' }
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
  page.setData({ studentId: 'student-1', activeSubject: 'math' })

  await page.loadHistory()

  const day = page.data.days[0]
  assert.deepEqual(JSON.parse(JSON.stringify(day.events.map(event => event.kind))), [
    'verification-report',
    'verification-paper',
    'diagnosis-report'
  ])
  assert.equal(day.statusItems.length, 0)
  assert.equal(day.events.some(event => event.paperId === 'default-paper'), false)
  assert.equal(day.events.find(event => event.kind === 'diagnosis-report').foldedEvidence.length, 2)
  assert.equal(day.events.find(event => event.kind === 'verification-paper').paperCode, '数学-20260612-01')
  assert.equal(day.events.find(event => event.kind === 'verification-paper').showPaperCode, true)
  assert.ok(day.events.find(event => event.kind === 'verification-paper').chips.includes('学生卷1页 · 答案1页'))
  assert.ok(day.events.find(event => event.kind === 'verification-report').chips.includes('关联 数学-20260612-01'))
  assert.ok(day.events.find(event => event.kind === 'diagnosis-report').chips.includes('计算基础'))

  page.onPreviewFoldedEvidence({ currentTarget: { dataset: { dayIndex: 0, eventIndex: 2, evidenceIndex: 0 } } })
  assert.equal(wx.calls.find(call => call.name === 'previewImage').payload.current, 'https://temp/photo-1')
})


test('learning records surface stable readable codes for legacy verification papers', async () => {
  const cloud = {
    getReports: async () => [],
    getPapers: async () => [
      {
        _id: 'paper-early',
        subject: 'math',
        type: 'verification',
        createdAt: '2026-06-12T09:47:00+08:00',
        generatedAt: '2026-06-12T09:47:00+08:00',
        paperDate: '2026-06-12',
        questionCount: 6,
        totalPages: 2,
        bottleneckTargets: ['LP-001']
      },
      {
        _id: 'paper-late',
        subject: 'math',
        type: 'verification',
        createdAt: '2026-06-12T10:34:00+08:00',
        generatedAt: '2026-06-12T10:34:00+08:00',
        paperDate: '2026-06-12',
        questionCount: 6,
        totalPages: 2,
        bottleneckTargets: ['LP-008']
      }
    ],
    getTempFileURLs: async () => []
  }
  const { page } = loadPage('miniprogram/pages/upload-history/upload-history.js', {
    modules: {
      '../../utils/cloud': cloud,
      '../../utils/util': util
    }
  })
  page.setData({ studentId: 'student-1', activeSubject: 'math' })

  await page.loadHistory()

  const eventsById = new Map(page.data.days[0].events.map(event => [event.paperId, event]))
  assert.equal(eventsById.get('paper-early').paperCode, '数学-20260612-01')
  assert.equal(eventsById.get('paper-late').paperCode, '数学-20260612-02')
  assert.equal(eventsById.get('paper-late').showPaperCode, true)
  assert.ok(eventsById.get('paper-late').chips.includes('6题'))
  assert.ok(eventsById.get('paper-late').chips.includes('学生卷1页 · 答案1页'))
})

test('learning records load all subjects when no subject filter is provided', async () => {
  const seen = {}
  const cloud = {
    getReports: async (studentId, subject, limit) => {
      seen.reports = { studentId, subject, limit }
      return [{
        _id: 'report-1',
        subject: 'math',
        type: 'diagnosis',
        status: 'completed',
        createdAt: '2026-06-11T10:00:00Z',
        bottlenecks: [{ lpCode: 'LP-001' }]
      }]
    },
    getPapers: async filter => {
      seen.papers = filter
      return [{
        _id: 'paper-1',
        subject: 'math',
        type: 'verification',
        createdAt: '2026-06-11T11:00:00Z',
        questions: [{}, {}],
        bottleneckTargets: ['LP-001']
      }]
    },
    getTempFileURLs: async () => []
  }
  const { page } = loadPage('miniprogram/pages/upload-history/upload-history.js', {
    modules: {
      '../../utils/cloud': cloud,
      '../../utils/util': util
    }
  })
  page.setData({ studentId: 'student-1', subject: '', subjectName: '', studentName: '钟青羽' })

  await page.loadHistory()
  assert.deepEqual(JSON.parse(JSON.stringify(seen.reports)), {
    studentId: 'student-1',
    limit: 20
  })
  assert.deepEqual(JSON.parse(JSON.stringify(seen.papers)), { studentId: 'student-1' })
  assert.equal(page.data.activeSubject, '')
  assert.equal(page.data.titleText, '钟青羽 · 学习记录')
  assert.deepEqual(JSON.parse(JSON.stringify(page.data.days[0].events.map(event => event.title))), [
    '数学纸面验证卷',
    '数学诊断报告'
  ])
  assert.equal(page.data.filters.find(item => item.key === '').active, true)
  assert.equal(page.data.allDays.length, 1)
})

test('learning records prefer shared timeline access before legacy collection queries', async () => {
  const seen = { legacyReports: 0, legacyPapers: 0, timeline: null }
  const cloud = {
    getLearningTimeline: async params => {
      seen.timeline = params
      return {
        reports: [{
          _id: 'shared-report',
          subject: 'math',
          type: 'diagnosis',
          status: 'completed',
          createdAt: '2026-06-11T10:00:00Z',
          summary: '共享档案诊断'
        }],
        papers: [{
          _id: 'shared-paper',
          subject: 'math',
          type: 'verification',
          createdAt: '2026-06-11T11:00:00Z',
          questions: [{}, {}],
          bottleneckSummaries: ['审题理解']
        }]
      }
    },
    getReports: async () => {
      seen.legacyReports += 1
      return []
    },
    getPapers: async () => {
      seen.legacyPapers += 1
      return []
    },
    getTempFileURLs: async () => []
  }
  const { page } = loadPage('miniprogram/pages/upload-history/upload-history.js', {
    modules: {
      '../../utils/cloud': cloud,
      '../../utils/util': util
    }
  })
  page.setData({ studentId: 'student-1', subject: '', subjectName: '', studentName: '钟青羽' })

  await page.loadHistory()

  assert.deepEqual(JSON.parse(JSON.stringify(seen.timeline)), { studentId: 'student-1', limit: 20 })
  assert.equal(seen.legacyReports, 0)
  assert.equal(seen.legacyPapers, 0)
  assert.deepEqual(JSON.parse(JSON.stringify(page.data.days[0].events.map(event => event.title))), [
    '数学纸面验证卷',
    '数学诊断报告'
  ])
})

test('learning records render before stale cleanup preview resolves', async () => {
  let resolveCleanup
  const cleanupPromise = new Promise(resolve => {
    resolveCleanup = resolve
  })
  const cloud = {
    cleanupStaleLearningRecords: async payload => {
      assert.equal(payload.dryRun, true)
      return cleanupPromise
    },
    getReports: async () => [{
      _id: 'report-1',
      subject: 'math',
      type: 'diagnosis',
      status: 'completed',
      createdAt: '2026-06-11T10:00:00Z',
      summary: '数学计算卡点'
    }],
    getPapers: async () => [],
    getTempFileURLs: async () => []
  }
  const { page } = loadPage('miniprogram/pages/upload-history/upload-history.js', {
    modules: {
      '../../utils/cloud': cloud,
      '../../utils/util': util
    }
  })
  page.setData({ studentId: 'student-1', subject: 'math', activeSubject: 'math', studentName: '钟青羽' })

  await page.loadHistory()

  assert.equal(page.data.loading, false)
  assert.equal(page.data.days.length, 1)
  assert.equal(page.data.cleanup.hasCandidates, false)

  resolveCleanup({
    cleanedCount: 1,
    cleanedReportIds: ['report-stale'],
    permissions: { canManageParents: true }
  })
  await new Promise(resolve => setImmediate(resolve))

  assert.equal(page.data.cleanup.hasCandidates, true)
  assert.equal(page.data.cleanup.count, 1)
})

test('learning records limit temporary urls and cap inline photo previews', async () => {
  const tempUrlRequests = []
  const imageFiles = Array.from({ length: 20 }, (_, index) => ({
    fileID: `cloud://photo-${index + 1}`,
    fileName: `photo-${index + 1}.jpg`
  }))
  const cloud = {
    getReports: async () => [{
      _id: 'report-1',
      subject: 'math',
      type: 'diagnosis',
      status: 'completed',
      createdAt: '2026-06-11T10:00:00Z',
      imageFiles
    }],
    getPapers: async () => [],
    getTempFileURLs: async fileIDs => {
      tempUrlRequests.push(fileIDs)
      return fileIDs.map(fileID => ({ fileID, tempFileURL: `https://temp/${fileID}` }))
    }
  }
  const wx = createWxMock()
  const { page } = loadPage('miniprogram/pages/upload-history/upload-history.js', {
    wx,
    modules: {
      '../../utils/cloud': cloud,
      '../../utils/util': util
    }
  })
  page.setData({ studentId: 'student-1', subject: 'math', activeSubject: 'math', studentName: '钟青羽' })

  await page.loadHistory()

  assert.equal(tempUrlRequests.length, 1)
  assert.equal(tempUrlRequests[0].length, 12)
  assert.equal(page.data.days[0].events[0].foldedEvidence.length, 3)
  assert.equal(page.data.days[0].events[0].remainingEvidenceCount, 17)
  assert.equal(page.data.days[0].events[0].foldedEvidence[2].tempFileURL, 'https://temp/cloud://photo-3')

  await page.onPreviewFoldedEvidence({
    currentTarget: { dataset: { dayIndex: 0, eventIndex: 0, evidenceIndex: 2 } }
  })

  assert.equal(tempUrlRequests.length, 1)
  assert.equal(wx.calls.find(call => call.name === 'previewImage').payload.current, 'https://temp/cloud://photo-3')
})

test('learning records render English sessions from shared timeline', async () => {
  const cloud = {
    getLearningTimeline: async () => ({
      reports: [],
      papers: [],
      englishSessions: [{
        _id: 'dictation-1',
        subject: 'english',
        functionType: 'spelling',
        type: 'word-dictation-paper',
        status: 'completed',
        analysisStatus: 'completed',
        photoFileIds: ['cloud://dictation-1.jpg'],
        wordItems: [{ wordId: 'word-1', word: 'science' }],
        dictationResults: [{ wordId: 'word-1', targetWord: 'science', verdict: 'correct' }],
        createdAt: '2026-06-16T09:00:00Z'
      }],
      permissions: { canView: true }
    }),
    getReports: async () => {
      throw new Error('legacy reports should not be called')
    },
    getPapers: async () => {
      throw new Error('legacy papers should not be called')
    },
    getTempFileURLs: async fileIDs => fileIDs.map(fileID => ({ fileID, tempFileURL: `https://temp/${fileID}` }))
  }
  const { page } = loadPage('miniprogram/pages/upload-history/upload-history.js', {
    modules: {
      '../../utils/cloud': cloud,
      '../../utils/util': util
    }
  })
  page.setData({ studentId: 'student-1', activeSubject: 'english', subject: 'english', studentName: '钟青羽' })

  await page.loadHistory()

  assert.equal(page.data.days.length, 1)
  assert.equal(page.data.days[0].events[0].kind, 'english-dictation-session')
  assert.equal(page.data.days[0].events[0].title, '英语纸面听写')
  assert.equal(page.data.days[0].events[0].foldedEvidence[0].tempFileURL, 'https://temp/cloud://dictation-1.jpg')
  assert.equal(page.data.filters.find(item => item.key === 'english').count, 1)
})

test('learning records can load more timeline records by increasing the limit', async () => {
  const requests = []
  const cloud = {
    getLearningTimeline: async params => {
      requests.push(params)
      const start = params.cursor === 'cursor-page-2' ? 20 : 0
      return {
        reports: Array.from({ length: params.limit }, (_, index) => ({
          _id: `report-${start + index + 1}`,
          subject: 'math',
          type: 'diagnosis',
          status: 'completed',
          createdAt: `2026-06-${String(10 + Math.floor((start + index) / 5)).padStart(2, '0')}T10:00:00Z`,
          summary: `第 ${start + index + 1} 条记录`
        })),
        papers: [],
        englishSessions: [],
        nextCursor: params.cursor ? '' : 'cursor-page-2',
        hasMore: !params.cursor
      }
    },
    getTempFileURLs: async () => []
  }
  const { page } = loadPage('miniprogram/pages/upload-history/upload-history.js', {
    modules: {
      '../../utils/cloud': cloud,
      '../../utils/util': util
    }
  })
  page.setData({ studentId: 'student-1', studentName: '钟青羽' })

  await page.loadHistory()
  assert.deepEqual(JSON.parse(JSON.stringify(requests[0])), { studentId: 'student-1', limit: 20 })
  assert.equal(page.data.hasMoreRecords, true)
  assert.equal(page.data.nextCursor, 'cursor-page-2')

  await page.onLoadMoreRecords()

  assert.deepEqual(JSON.parse(JSON.stringify(requests[1])), {
    studentId: 'student-1',
    limit: 20,
    cursor: 'cursor-page-2'
  })
  assert.equal(page.data.timelineLimit, 20)
  assert.equal(page.data.hasMoreRecords, false)
  assert.equal(page.data.days.flatMap(day => day.events).length, 40)
})

test('learning records use lightweight summaries from timeline without full report payloads', async () => {
  const cloud = {
    getLearningTimeline: async () => ({
      reports: [{
        _id: 'report-summary',
        subject: 'math',
        type: 'diagnosis',
        status: 'completed',
        createdAt: '2026-06-11T10:00:00Z',
        summary: '数学计算卡点',
        bottleneckSummaries: ['计算基础'],
        imageFileCount: 18,
        errorCount: 12
      }],
      papers: [],
      englishSessions: [],
      hasMore: false
    }),
    getTempFileURLs: async () => {
      throw new Error('summary records should not request image URLs')
    }
  }
  const { page } = loadPage('miniprogram/pages/upload-history/upload-history.js', {
    modules: {
      '../../utils/cloud': cloud,
      '../../utils/util': util
    }
  })
  page.setData({ studentId: 'student-1', studentName: '钟青羽' })

  await page.loadHistory()

  const event = page.data.days[0].events[0]
  assert.equal(event.title, '数学诊断报告')
  assert.ok(event.chips.includes('计算基础'))
  assert.ok(event.chips.includes('18张照片'))
  assert.equal(event.foldedEvidence.length, 0)
})

test('learning records can load more timeline records by increasing the limit legacy fallback', async () => {
  const limits = []
  const cloud = {
    getLearningTimeline: null,
    getReports: async (studentId, subject, limit) => {
      limits.push(limit)
      return Array.from({ length: limit }, (_, index) => ({
          _id: `report-${index + 1}`,
          subject: 'math',
          type: 'diagnosis',
          status: 'completed',
          createdAt: `2026-06-${String(10 + Math.floor(index / 5)).padStart(2, '0')}T10:00:00Z`,
          summary: `第 ${index + 1} 条记录`
        }))
    },
    getTempFileURLs: async () => []
  }
  const { page } = loadPage('miniprogram/pages/upload-history/upload-history.js', {
    modules: {
      '../../utils/cloud': cloud,
      '../../utils/util': util
    }
  })
  page.setData({ studentId: 'student-1', studentName: '钟青羽' })

  await page.loadHistory()
  assert.equal(limits[0], 20)
  assert.equal(page.data.hasMoreRecords, true)

  await page.onLoadMoreRecords()

  assert.deepEqual(JSON.parse(JSON.stringify(limits)), [20, 40])
  assert.equal(page.data.timelineLimit, 40)
  assert.equal(page.data.days.flatMap(day => day.events).length, 40)
})

test('learning records treat route subject as an initial filter on the complete timeline', async () => {
  const seen = {}
  const cloud = {
    getReports: async (studentId, subject, limit) => {
      seen.reports = { studentId, subject, limit }
      return [
        {
          _id: 'math-report',
          subject: 'math',
          type: 'diagnosis',
          status: 'completed',
          createdAt: '2026-06-11T10:00:00Z',
          summary: '数学计算卡点'
        },
        {
          _id: 'chinese-report',
          subject: 'chinese',
          type: 'diagnosis',
          status: 'completed',
          createdAt: '2026-06-11T09:00:00Z',
          summary: '阅读理解卡点'
        }
      ]
    },
    getPapers: async filter => {
      seen.papers = filter
      return [{
        _id: 'english-paper',
        subject: 'english',
        type: 'verification',
        createdAt: '2026-06-11T11:00:00Z',
        questions: [{}, {}]
      }]
    },
    getTempFileURLs: async () => []
  }
  const { page } = loadPage('miniprogram/pages/upload-history/upload-history.js', {
    modules: {
      '../../utils/cloud': cloud,
      '../../utils/util': util
    }
  })
  page.setData({
    studentId: 'student-1',
    subject: 'math',
    activeSubject: 'math',
    subjectName: '数学',
    studentName: '钟青羽'
  })

  await page.loadHistory()

  assert.deepEqual(JSON.parse(JSON.stringify(seen.reports)), {
    studentId: 'student-1',
    limit: 20
  })
  assert.deepEqual(JSON.parse(JSON.stringify(seen.papers)), { studentId: 'student-1' })
  assert.equal(page.data.titleText, '钟青羽 · 学习记录')
  assert.equal(page.data.activeSubject, 'math')
  assert.deepEqual(JSON.parse(JSON.stringify(page.data.days[0].events.map(event => event.title))), [
    '数学诊断报告'
  ])
  assert.equal(page.data.allDays[0].events.length, 3)
  assert.equal(page.data.filters.find(item => item.key === 'math').active, true)

  page.onFilterTap({ currentTarget: { dataset: { subject: '' } } })

  assert.equal(page.data.activeSubject, '')
  assert.deepEqual(JSON.parse(JSON.stringify(page.data.days[0].events.map(event => event.title))), [
    '英语纸面验证卷',
    '数学诊断报告',
    '语文诊断报告'
  ])
  assert.equal(page.data.filters.find(item => item.key === '').active, true)
})

test('learning record screenshot fixture keeps a dense verification paper readable and sanitized', async () => {
  const rawTargets = Array.from({ length: 36 }, (_, index) =>
    `BN-SCREENSHOT-REGRESSION-${String(index + 1).padStart(2, '0')}`
  )
  const cloud = {
    getLearningTimeline: async () => ({
      reports: [{
        _id: 'report-internal-665f8c1a2b3c4d5e6f708192',
        subject: 'math',
        type: 'verification',
        status: 'completed',
        paperId: 'paper-internal-665f8c1a2b3c4d5e6f708192',
        createdAt: '2026-07-12T10:30:00+08:00',
        comparisonSummary: 'BN-SCREENSHOT-REGRESSION-01 已改善，RES-PRIVATE-01 已完成',
        verificationEvidence: [{
          bottleneckId: 'BN-SCREENSHOT-REGRESSION-01',
          complete: true,
          allCorrect: true
        }]
      }],
      papers: [{
        _id: 'paper-internal-665f8c1a2b3c4d5e6f708192',
        studentId: 'student-internal-665f8c1a2b3c4d5e6f708192',
        subject: 'math',
        type: 'verification',
        paperDisplayCode: '数学-20260712-06',
        createdAt: '2026-07-12T10:00:00+08:00',
        generatedAt: '2026-07-12T10:05:00+08:00',
        paperDate: '2026-07-12',
        questionCount: 36,
        studentPages: 12,
        answerPages: 4,
        totalPages: 16,
        bottleneckTargets: rawTargets,
        verificationPack: {
          pages: Array.from({ length: 12 }, (_, index) => ({
            pageCode: `VER-PAGE-INTERNAL-${index + 1}`,
            targetIds: rawTargets.slice(index * 3, index * 3 + 3)
          }))
        }
      }],
      hasMore: false
    }),
    getTempFileURLs: async () => []
  }
  const { page } = loadPage('miniprogram/pages/upload-history/upload-history.js', {
    modules: {
      '../../utils/cloud': cloud,
      '../../utils/util': util
    }
  })
  page.setData({ studentId: 'student-1', activeSubject: 'math', subjectName: '数学' })

  await page.loadHistory()

  const paperEvent = page.data.days[0].events.find(event => event.kind === 'verification-paper')
  const reportEvent = page.data.days[0].events.find(event => event.kind === 'verification-report')
  const paperVisibleModel = {
    icon: paperEvent.icon,
    title: paperEvent.title,
    summary: paperEvent.summary,
    statusText: paperEvent.statusText,
    paperCode: paperEvent.paperCode,
    chips: paperEvent.chips,
    actionText: paperEvent.actionText
  }
  const reportVisibleModel = {
    title: reportEvent.title,
    summary: reportEvent.summary,
    statusText: reportEvent.statusText,
    paperCode: reportEvent.paperCode,
    chips: reportEvent.chips
  }
  const visibleText = JSON.stringify([paperVisibleModel, reportVisibleModel])

  assert.equal(paperEvent.icon, '📄')
  assert.equal(paperEvent.paperCode, '数学-20260712-06')
  assert.equal(paperEvent.showPaperCode, true)
  assert.match(paperEvent.summary, /覆盖 36 个数学学习卡点/)
  assert.ok(paperEvent.chips.length <= 3)
  assert.ok(paperEvent.chips.includes('36题'))
  assert.ok(paperEvent.chips.some(chip => /学生卷12页/.test(chip) && /答案4页/.test(chip)))
  assert.equal(reportEvent.chips.filter(chip => chip.includes('数学-20260712-06')).length, 1)
  assert.doesNotMatch(visibleText, /(?:BN|LP|ERR|NODE|RES)-[A-Z0-9_-]+/)
  assert.doesNotMatch(visibleText, /665f8c1a2b3c4d5e6f708192/)

  const wxml = fs.readFileSync(path.join(ROOT, 'miniprogram/pages/upload-history/upload-history.wxml'), 'utf8')
  const wxss = fs.readFileSync(path.join(ROOT, 'miniprogram/pages/upload-history/upload-history.wxss'), 'utf8')
  assert.match(wxml, /class="event-meta"/)
  assert.match(wxml, /class="paper-code"/)
  assert.doesNotMatch(wxml, /paper-code-row/)
  assert.match(wxss, /\.event-meta\s*\{/)
  assert.match(wxss, /\.paper-code\s*\{/)
  assert.doesNotMatch(wxss, /paper-code-(?:row|label|value)/)
})

test('learning record keeps sanitized known bottleneck chips linked to the bottleneck center', async () => {
  const cloud = {
    getLearningTimeline: async () => ({
      reports: [{
        _id: 'report-known-bottleneck',
        studentId: 'student-1',
        subject: 'math',
        type: 'diagnosis',
        status: 'completed',
        createdAt: '2026-07-12T11:00:00+08:00',
        summary: '本次诊断已完成',
        bottleneckSummary: 'BN-DEC-MUL-POINT-COUNT'
      }],
      papers: [],
      hasMore: false
    }),
    getTempFileURLs: async () => []
  }
  const { page } = loadPage('miniprogram/pages/upload-history/upload-history.js', {
    modules: {
      '../../utils/cloud': cloud,
      '../../utils/util': util
    }
  })
  page.setData({ studentId: 'student-1', activeSubject: 'math', subjectName: '数学' })

  await page.loadHistory()

  const event = page.data.days[0].events[0]
  const bottleneckChip = event.chipItems.find(item => /小数/.test(item.text))
  assert.ok(bottleneckChip)
  assert.doesNotMatch(bottleneckChip.text, /BN-/)
  assert.match(bottleneckChip.url, /\/pages\/bottleneck-center\/bottleneck-center/)
})

test('learning record sanitizes complete visible evidence and resource models without losing internal file handles', async () => {
  const imageFiles = [
    { fileID: 'cloud://secret/path-1', fileName: 'BN-PRIVATE-TARGET.jpg', ocrSummary: 'RES-PRIVATE-01' },
    { fileID: 'cloud://secret/path-2', fileName: 'cloud://secret/path', ocrSummary: 'cloud://secret/ocr' },
    { fileID: 'cloud://secret/path-3', fileName: '665f8c1a2b3c4d5e6f708192.jpg', ocrSummary: 'NODE-PRIVATE-03' },
    { fileID: 'cloud://secret/path-4', fileName: '数学作答4.jpg', ocrSummary: '第四页计算过程' },
    { fileID: 'cloud://secret/path-5', fileName: '数学作答5.jpg', ocrSummary: '第五页计算过程' }
  ]
  const cloud = {
    getLearningTimeline: async () => ({
      reports: [{
        _id: 'report-evidence-owner',
        studentId: 'student-1',
        subject: 'math',
        type: 'verification',
        status: 'completed',
        paperId: 'paper-evidence-owner',
        createdAt: '2026-07-13T10:30:00+08:00',
        comparisonSummary: '验证反馈已生成',
        imageFiles
      }],
      papers: [{
        _id: 'paper-evidence-owner',
        studentId: 'student-1',
        subject: 'math',
        type: 'verification',
        paperDisplayCode: 'MATH-20260713-01',
        generatedAt: '2026-07-13T10:00:00+08:00',
        questionCount: 5
      }],
      learningResourcePacks: [{
        _id: 'pack-private',
        subject: 'math',
        title: 'RES-PRIVATE-01',
        status: 'pending',
        createdAt: '2026-07-13T09:00:00+08:00'
      }],
      hasMore: false
    }),
    getTempFileURLs: async fileIDs => fileIDs.map(fileID => ({
      fileID,
      tempFileURL: `https://temp/${encodeURIComponent(fileID)}`
    }))
  }
  const { page } = loadPage('miniprogram/pages/upload-history/upload-history.js', {
    modules: {
      '../../utils/cloud': cloud,
      '../../utils/util': util
    }
  })
  page.setData({ studentId: 'student-1', activeSubject: 'math', subjectName: '数学' })

  await page.loadHistory()

  const reportEvent = page.data.days.flatMap(day => day.events).find(event => event.kind === 'verification-report')
  const paperEvent = page.data.days.flatMap(day => day.events).find(event => event.kind === 'verification-paper')
  const resourceEvent = page.data.days.flatMap(day => day.events).find(event => event.kind === 'learning-resource')
  const visibleEventModel = event => ({
    icon: event.icon,
    title: event.title,
    timeText: event.timeText,
    summary: event.summary,
    statusText: event.statusText,
    actionText: event.actionText,
    paperCode: event.paperCode,
    chips: event.chips,
    remainingEvidenceCount: event.remainingEvidenceCount,
    foldedEvidence: event.foldedEvidence.map(item => ({
      icon: item.icon,
      title: item.title,
      summary: item.summary,
      isDuplicate: item.isDuplicate
    }))
  })
  const visibleText = JSON.stringify([
    visibleEventModel(reportEvent),
    visibleEventModel(paperEvent),
    visibleEventModel(resourceEvent)
  ])

  assert.doesNotMatch(visibleText, /(?:BN|LP|ERR|NODE|RES)-[A-Z0-9_-]+|cloud:\/\//)
  assert.equal(reportEvent.foldedEvidence.length, 3)
  assert.equal(reportEvent.remainingEvidenceCount, 2)
  assert.equal(reportEvent.evidenceCount, 5)
  assert.equal(reportEvent.foldedEvidence[0].title, '验证卷作答1')
  assert.equal(reportEvent.foldedEvidence[1].title, '验证卷作答2')
  assert.equal(reportEvent.foldedEvidence[0].fileID, 'cloud://secret/path-1')
  assert.match(reportEvent.foldedEvidence[0].tempFileURL, /^https:\/\/temp\//)
  assert.equal(paperEvent.foldedEvidence.length, 0)
  assert.equal(paperEvent.evidenceCount, 5)
  assert.match(resourceEvent.title, /学习任务包/)
  assert.doesNotMatch(resourceEvent.title, /RES-/)

  const wxml = fs.readFileSync(path.join(ROOT, 'miniprogram/pages/upload-history/upload-history.wxml'), 'utf8')
  assert.match(wxml, /remainingEvidenceCount/)
  assert.match(wxml, /class="fold-remaining"/)
})

test('learning record photo chip opens the report evidence destination through the controller', async () => {
  const cloud = {
    getLearningTimeline: async () => ({
      reports: [{
        _id: 'report-photo-destination',
        studentId: 'student-1',
        subject: 'math',
        type: 'diagnosis',
        status: 'completed',
        createdAt: '2026-07-13T11:00:00+08:00',
        imageFiles: [{ fileID: 'cloud://photo-destination', fileName: '数学试卷.jpg' }]
      }],
      papers: [],
      hasMore: false
    }),
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
  page.setData({ studentId: 'student-1', activeSubject: 'math', subjectName: '数学' })

  await page.loadHistory()

  const event = page.data.days[0].events[0]
  const photoChip = event.chipItems.find(item => item.text === '1张照片')
  page.onTraceableUrlTap({ currentTarget: { dataset: { url: photoChip.url } } })

  const navigation = wx.calls.find(call => call.name === 'navigateTo')
  assert.deepEqual(JSON.parse(JSON.stringify(navigation.payload)), {
    url: '/pages/report/report?id=report-photo-destination'
  })
})

test('learning record narrow-layout verifier enforces viewport and geometry bounds', () => {
  const scriptPath = path.join(ROOT, 'scripts/devtools-upload-history-layout.js')
  assert.equal(fs.existsSync(scriptPath), true, 'focused DevTools layout verifier must exist')
  const { validateLayoutMetrics } = require(scriptPath)
  const valid = {
    windowWidth: 375,
    windowHeight: 812,
    pageWidth: 375,
    filterCount: 4,
    recordCount: 2,
    codeHeight: 20,
    cardRects: [
      { left: 12, width: 351, height: 340 },
      { left: 12, width: 351, height: 210 }
    ],
    evidenceRects: [
      { left: 54, width: 295, height: 54 },
      { left: 54, width: 295, height: 54 },
      { left: 54, width: 295, height: 54 }
    ],
    titleRect: { left: 54, top: 120, width: 118, height: 24 },
    metaRect: { left: 178, top: 116, width: 171, height: 44 }
  }
  assert.doesNotThrow(() => validateLayoutMetrics(valid))
  assert.throws(() => validateLayoutMetrics({ ...valid, pageWidth: 410 }), /horizontal overflow/)
  assert.throws(() => validateLayoutMetrics({ ...valid, filterCount: 3 }), /filter controls/)
  assert.throws(() => validateLayoutMetrics({ ...valid, recordCount: 1 }), /record cards/)
  assert.throws(() => validateLayoutMetrics({
    ...valid,
    titleRect: { left: 54, top: 120, width: 200, height: 24 },
    metaRect: { left: 240, top: 116, width: 109, height: 44 }
  }), /title.*metadata overlap/)
  assert.throws(() => validateLayoutMetrics({
    ...valid,
    cardRects: [{ left: 12, width: 351, height: 500 }]
  }), /card height/)

  const source = fs.readFileSync(scriptPath, 'utf8')
  const wxss = fs.readFileSync(path.join(ROOT, 'miniprogram/pages/upload-history/upload-history.wxss'), 'utf8')
  const packageJson = JSON.parse(fs.readFileSync(path.join(ROOT, 'package.json'), 'utf8'))
  assert.match(source, /超长学科学习验证试卷号-20260712-999/)
  assert.match(source, /\/tmp\/learning-record-timeline-narrow\.png/)
  assert.match(source, /\.screenshot\(/)
  assert.match(source, /\.size\(\)/)
  assert.match(source, /\.offset\(\)/)
  assert.match(source, /375 × 812 viewport required/)
  assert.match(source, /MIN_FILTER_CONTROLS/)
  assert.match(wxss, /\.record-verification-paper \.event-topline\s*\{[^}]*flex-wrap:\s*wrap/s)
  assert.match(wxss, /\.record-verification-paper \.event-meta\s*\{[^}]*flex-basis:\s*100%/s)
  assert.match(wxss, /\.paper-code\s*\{[^}]*white-space:\s*nowrap/s)
  assert.equal(packageJson.scripts['test:e2e:upload-history-layout'], 'node scripts/devtools-upload-history-layout.js')
})

test('learning records use subject accents, readable text markers, and compact evidence', () => {
  const wxml = fs.readFileSync(path.join(ROOT, 'miniprogram/pages/upload-history/upload-history.wxml'), 'utf8')
  const wxss = fs.readFileSync(path.join(ROOT, 'miniprogram/pages/upload-history/upload-history.wxss'), 'utf8')

  assert.match(wxml, /class="record-card subject-\{\{event\.subject\}\}/)
  assert.match(wxml, /class="event-marker">\{\{event\.icon\}\}<\/view>/)
  assert.doesNotMatch(wxml, /class="event-icon"/)
  assert.match(wxss, /\.subject-math\s*\{[^}]*border-left-color:/s)
  assert.match(wxss, /\.subject-chinese\s*\{[^}]*border-left-color:/s)
  assert.match(wxss, /\.subject-english\s*\{[^}]*border-left-color:/s)
  assert.match(wxss, /\.event-marker\s*\{/)
  assert.match(wxss, /\.folded-evidence\s*\{[^}]*max-height:/s)
})

test('timeline events mark record types with whitelist emoji icons', () => {
  const presenter = require('../miniprogram/pages/upload-history/upload-history-presenter')
  const { events } = presenter.buildTimelineEvents(
    [
      { _id: 'r-diag', subject: 'math', type: 'diagnosis', status: 'completed', createdAt: '2026-07-01', bottlenecks: [] },
      { _id: 'r-ver', subject: 'math', type: 'verification', status: 'completed', createdAt: '2026-07-02', bottlenecks: [] }
    ],
    [{ _id: 'p-1', subject: 'math', type: 'verification', createdAt: '2026-07-03' }],
    new Map(),
    'math',
    '数学'
  )

  const byKind = Object.fromEntries(events.map(event => [event.kind, event.icon]))
  assert.equal(byKind['diagnosis-report'], '📊')
  assert.equal(byKind['verification-report'], '✅')
  assert.equal(byKind['verification-paper'], '📄')
})

test('learning records keep counts on a single summary line and inline status into the title row', () => {
  const wxml = fs.readFileSync(path.join(ROOT, 'miniprogram/pages/upload-history/upload-history.wxml'), 'utf8')
  const wxss = fs.readFileSync(path.join(ROOT, 'miniprogram/pages/upload-history/upload-history.wxss'), 'utf8')
  const presenter = require('../miniprogram/pages/upload-history/upload-history-presenter')

  // 去重铁律：计数只在 summaryText 单行出现（筛选 pill 计数算导航同一处），大数字格结构不得存在
  assert.doesNotMatch(wxml, /summary-grid|summaryCards/)
  assert.doesNotMatch(wxss, /\.summary-(?:grid|cell|value|label)/)
  const { events, statusItems } = presenter.buildTimelineEvents(
    [{ _id: 'r-diag', subject: 'math', type: 'diagnosis', status: 'completed', createdAt: '2026-07-01', bottlenecks: [] }],
    [],
    new Map(),
    'math',
    '数学'
  )
  const state = presenter.buildHistoryState(events, 'math', statusItems)
  assert.equal(state.summaryCards, undefined)
  assert.match(state.summaryText, /^共 \d+ 天 · \d+ 条主记录 · \d+ 份验证反馈$/)

  // 条目 ≤4 行：状态文字标签内联到标题行（topline 内、summary 之前），不独占一行
  const toplineToSummary = wxml.match(/<view class="event-topline">([\s\S]*?)<text class="event-summary">/)
  assert.ok(toplineToSummary, 'event-topline should be followed by event-summary')
  assert.match(toplineToSummary[1], /class="event-status"[^>]*>\{\{event\.statusText\}\}/)
  assert.match(wxss, /\.event-status\s*\{[^}]*white-space:\s*nowrap/s)

  // 留白预算：空态 padding ≤40rpx，条目上下 padding ≤12rpx
  assert.match(wxss, /\.loading,\s*\.empty\s*\{[^}]*padding:\s*40rpx 24rpx/s)
  assert.doesNotMatch(wxss, /padding:\s*110rpx/)
  assert.match(wxss, /\.record-card\s*\{[^}]*padding:\s*12rpx 16rpx/s)
})

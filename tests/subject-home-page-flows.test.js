const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const ROOT = path.resolve(__dirname, '..')
const { loadPageAndWait, flushAsync, waitForPageLoad, isThenable } = require('./helpers/page-flow-utils')
const { createWxMock, loadPage } = require('./helpers/page-harness')
const util = require('../miniprogram/utils/util')

test('subject home loads a compact action workbench', async () => {
  const cloud = {
    getSubjectProfile: async () => ({
      totalReports: 1,
      currentBottlenecks: [
        { lpCode: 'LP-001', lpName: '计算错误（加减乘除）', status: 'needs_verification', errorCount: 3 },
        { lpCode: 'LP-004', lpName: '单位换算错误', status: 'improved' }
      ]
    }),
    getReports: async () => [{
      _id: 'report-1',
      status: 'completed',
      isEffective: true,
      createdAt: '2026-06-12T14:20:00+08:00',
      changeSummary: '发现计算基础卡点'
    }]
  }
  const { page } = loadPage('miniprogram/pages/subject-home/subject-home.js', {
    modules: {
      '../../utils/cloud': cloud,
      '../../utils/util': { formatRelativeTime: () => '今天' },
      '../../utils/poller': { createPoller: () => ({ start() {}, stop() {}, isRunning: () => false }) }
    }
  })
  page.onLoad({
    studentId: 'student-1',
    subject: 'math',
    subjectName: encodeURIComponent('数学'),
    studentName: encodeURIComponent('钟青羽'),
    grade: '6'
  })

  await page.loadProfile()
  await page.loadRecords()

  assert.equal(page.data.subjectTitle, '数学工作台')
  assert.equal(page.data.primaryTask.actionType, 'verification')
  assert.deepEqual(JSON.parse(JSON.stringify(page.data.taskQueue.map(item => item.displayName))), ['计算基础'])
  assert.ok(page.data.latestDiagnosis)
  assert.ok(page.data.tools.every(item => item.key !== 'latestReport'))
})

test('subject home requests the shared dashboard without paper records for first paint', async () => {
  let dashboardArgs = null
  const cloud = {
    getSubjectDashboard: async (...args) => {
      dashboardArgs = args
      return {
        permissions: { canUpload: true, canGeneratePaper: true },
        profile: {
          totalReports: 1,
          currentBottlenecks: [{ lpCode: 'LP-001', status: 'needs_verification' }]
        },
        reports: [{ _id: 'report-1', status: 'completed', createdAt: '2026-06-12T10:00:00Z' }],
        papers: [{ _id: 'paper-should-not-be-needed' }]
      }
    }
  }
  const { page } = loadPage('miniprogram/pages/subject-home/subject-home.js', {
    modules: {
      '../../utils/cloud': cloud,
      '../../utils/util': { formatRelativeTime: () => '今天' },
      '../../utils/analysis-poller': { createAnalysisPoller: () => ({ start() {}, stop() {}, isRunning: () => false }) }
    }
  })
  page.onLoad({
    studentId: 'student-1',
    subject: 'math',
    subjectName: encodeURIComponent('数学'),
    studentName: encodeURIComponent('钟青羽'),
    grade: '6'
  })

  await page.loadProfile()

  assert.deepEqual(JSON.parse(JSON.stringify(dashboardArgs)), [
    'student-1',
    'math',
    { includePapers: false }
  ])
  assert.equal(page.data.primaryTask.actionType, 'verification')
})

test('subject home reuses a fresh dashboard snapshot until invalidated', async () => {
  let dashboardCalls = 0
  const cloud = {
    getSubjectDashboard: async () => {
      dashboardCalls += 1
      return {
        permissions: { canUpload: true, canGeneratePaper: true },
        profile: { totalReports: 0, currentBottlenecks: [] },
        reports: []
      }
    }
  }
  const { page } = loadPage('miniprogram/pages/subject-home/subject-home.js', {
    modules: {
      '../../utils/cloud': cloud,
      '../../utils/util': { formatRelativeTime: () => '今天' },
      '../../utils/analysis-poller': { createAnalysisPoller: () => ({ start() {}, stop() {}, isRunning: () => false }) }
    }
  })
  page.onLoad({
    studentId: 'student-1',
    subject: 'math',
    subjectName: encodeURIComponent('数学'),
    studentName: encodeURIComponent('钟青羽'),
    grade: '6'
  })

  await page.loadProfile()
  await page.loadProfile()
  assert.equal(dashboardCalls, 1)

  page.invalidateProfileCache()
  await page.loadProfile()
  assert.equal(dashboardCalls, 2)
})

test('English subject home loads vocabulary summary and opens English practice', async () => {
  const calls = []
  const cloud = {
    getSubjectDashboard: async () => ({
      permissions: { canUpload: true, canGeneratePaper: true },
      profile: { totalReports: 0, currentBottlenecks: [] },
      reports: []
    }),
    getEnglishVocabularySummary: async studentId => {
      calls.push(['summary', studentId])
      return {
        summary: {
          totalWords: 320,
          needsPracticeCount: 18,
          reviewingCount: 12,
          masteredCount: 90,
          dueReviewCount: 8
        },
        patternCount: 42
      }
    }
  }
  const wx = createWxMock()
  const { page } = loadPage('miniprogram/pages/subject-home/subject-home.js', {
    wx,
    modules: {
      '../../utils/cloud': cloud,
      '../../utils/util': { formatRelativeTime: () => '今天' },
      '../../utils/analysis-poller': { createAnalysisPoller: () => ({ start() {}, stop() {}, isRunning: () => false }) }
    }
  })
  page.onLoad({
    studentId: 'student-1',
    subject: 'english',
    subjectName: encodeURIComponent('英语'),
    studentName: encodeURIComponent('钟青羽'),
    grade: '6'
  })

  await page.loadProfile()
  page.onPrimaryAction()

  assert.deepEqual(calls, [['summary', 'student-1']])
  assert.equal(page.data.primaryTask.actionType, 'englishPractice')
  assert.equal(page.data.englishVocabularyStats.totalWords, 320)
  assert.deepEqual(page.data.englishActionCards.map(item => item.key), ['englishPractice', 'englishDictation'])
  assert.match(wx.calls.find(call => call.name === 'navigateTo').payload.url, /pages\/english-practice\/english-practice/)

  page.onEnglishActionTap({ currentTarget: { dataset: { actionType: 'englishDictation', disabled: false } } })
  assert.match(wx.calls.filter(call => call.name === 'navigateTo').at(-1).payload.url, /pages\/english-dictation\/english-dictation/)

  page.onToolTap({ currentTarget: { dataset: { key: 'englishWrongWords' } } })
  assert.match(wx.calls.filter(call => call.name === 'navigateTo').at(-1).payload.url, /pages\/english-wrong-words\/english-wrong-words/)
})

test('English subject home imports Zhong Qingyu personal vocabulary seed when empty', async () => {
  const calls = []
  let imported = false
  let resolveSeed
  const seedPromise = new Promise(resolve => {
    resolveSeed = resolve
  })
  const cloud = {
    getSubjectDashboard: async () => ({
      permissions: { canUpload: true, canGeneratePaper: true },
      profile: { totalReports: 0, currentBottlenecks: [] },
      reports: []
    }),
    getEnglishVocabularySummary: async studentId => ({
      summary: {
        totalWords: imported ? 505 : 0,
        needsPracticeCount: 0,
        reviewingCount: 0,
        masteredCount: 0,
        dueReviewCount: 0
      },
      weakWords: [],
      patternCount: 0,
      studentId
    }),
    seedEnglishPersonalVocabulary: async studentId => {
      calls.push(['seed', studentId])
      await seedPromise
      imported = true
      return { importedWordCount: 505, totalSeedWords: 505 }
    }
  }
  const wx = createWxMock()
  const { page } = loadPage('miniprogram/pages/subject-home/subject-home.js', {
    wx,
    modules: {
      '../../utils/cloud': cloud,
      '../../utils/util': { formatRelativeTime: () => '今天' },
      '../../utils/analysis-poller': { createAnalysisPoller: () => ({ start() {}, stop() {}, isRunning: () => false }) }
    }
  })
  page.onLoad({
    studentId: 'student-1',
    subject: 'english',
    subjectName: encodeURIComponent('英语'),
    studentName: encodeURIComponent('钟青羽'),
    grade: '6'
  })

  await page.loadProfile()

  assert.deepEqual(calls, [['seed', 'student-1']])
  assert.equal(page.data.englishVocabularyStats.totalWords, 0)

  resolveSeed()
  await page._englishAutoSeedPromise

  assert.equal(page.data.englishVocabularyStats.totalWords, 505)
  assert.equal(page.data.primaryTask.actionType, 'englishPractice')
  assert.ok(page.data.englishActionCards.every(item => item.disabled === false))
})

test('subject home shows learning workflow tools for co-parent access', async () => {
  const cloud = {
    getSubjectDashboard: async () => ({
      permissions: { canView: true, canManageParents: false, canUpload: true, canGeneratePaper: true, canRetryAnalysis: true },
      profile: {
        totalReports: 1,
        currentBottlenecks: [
          { lpCode: 'LP-001', lpName: '计算错误（加减乘除）', status: 'needs_verification' }
        ]
      },
      reports: [{ _id: 'report-1', status: 'completed', createdAt: '2026-06-12T10:00:00Z' }]
    })
  }
  const wx = createWxMock()
  const { page } = loadPage('miniprogram/pages/subject-home/subject-home.js', {
    wx,
    modules: {
      '../../utils/cloud': cloud,
      '../../utils/util': { formatRelativeTime: () => '今天' },
      '../../utils/poller': { createPoller: () => ({ start() {}, stop() {}, isRunning: () => false }) }
    }
  })
  page.onLoad({
    studentId: 'student-1',
    subject: 'math',
    subjectName: encodeURIComponent('数学'),
    studentName: encodeURIComponent('钟青羽'),
    grade: '6'
  })

  await page.loadProfile()
  assert.equal(page.data.canWriteActions, true)
  assert.deepEqual(page.data.tools.map(item => item.key), ['diagnosis', 'defaultPaper', 'history'])
  assert.equal(page.data.primaryTask.actionType, 'verification')

  page.onTaskTap({ currentTarget: { dataset: { code: 'LP-001' } } })
  assert.match(wx.calls.find(call => call.name === 'navigateTo').payload.url, /bottleneck-detail/)
})


test('subject home task and primary actions open the focused workflow', async () => {
  const wx = createWxMock()
  const cloud = {
    getActiveVerificationPaper: async () => ({ status: 'ready', paper: { _id: 'paper-1' } })
  }
  const { page } = loadPage('miniprogram/pages/subject-home/subject-home.js', {
    wx,
    modules: {
      '../../utils/cloud': cloud,
      '../../utils/util': { formatRelativeTime: () => '' },
      '../../utils/poller': { createPoller: () => ({ start() {}, stop() {}, isRunning: () => false }) }
    }
  })
  page.setData({
    studentId: 'student-1',
    subject: 'math',
    subjectName: '数学',
    studentName: '钟青羽',
    grade: '6',
    primaryTask: { actionType: 'verification' },
    canWriteActions: true
  })

  page.onTaskTap({ currentTarget: { dataset: { code: 'LP-001' } } })
  page.onPrimaryAction()
  await waitForPageLoad(page)

  const urls = wx.calls.filter(call => call.name === 'navigateTo').map(call => call.payload.url)
  assert.match(urls[0], /pages\/bottleneck-detail\/bottleneck-detail/)
  assert.match(urls[0], /lpCode=LP-001/)
  // 统一入口：ready 时跳预览页
  assert.match(urls[1], /pages\/paper-preview\/paper-preview\?paperId=paper-1/)
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
      '../../utils/analysis-poller': {
        createAnalysisPoller: options => {
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
  await pollOptions.onCompleted({ _id: 'active-report', status: 'completed' })
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
  await pollOptions.onFailed({ _id: 'active-report', status: 'failed' })
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

const test = require('node:test')
const assert = require('node:assert/strict')
const {
  createCloudMock,
  createDatabase,
  loadModule
} = require('./helpers/cloud-function-harness')
const { createWxMock, loadPage } = require('./helpers/page-harness')
const { createPoller } = require('../miniprogram/utils/poller')

// ========== poller extra guarantees ==========

test('poller does not invoke onTimeout when stopped before maxAttempts', async () => {
  let timedOut = false
  const poller = createPoller({
    request: async () => 'analyzing',
    onValue: () => true,
    maxAttempts: 5,
    onTimeout: () => { timedOut = true },
    schedule: () => 1,
    cancel: () => {}
  })

  await poller.start()
  poller.stop()
  assert.equal(timedOut, false)
  assert.equal(poller.isRunning(), false)
})

test('poller exposes the current attempt count', async () => {
  let scheduled = null
  const poller = createPoller({
    request: async () => 'analyzing',
    onValue: () => true,
    maxAttempts: 3,
    schedule: callback => {
      scheduled = callback
      return 1
    },
    cancel: () => {}
  })

  await poller.start()
  assert.equal(poller.getAttempts(), 1)
  await scheduled()
  assert.equal(poller.getAttempts(), 2)
})

// ========== cloud.js callFunction edge cases ==========

function loadCloudUtil(wx) {
  return loadModule('miniprogram/utils/cloud.js', {}, { wx })
}

test('callFunction throws a normalized error when wx.cloud rejects', async () => {
  const cloud = loadCloudUtil({
    cloud: {
      database: () => createDatabase(),
      callFunction: async () => { throw { errMsg: 'cloud.callFunction:fail' } }
    }
  })

  try {
    await cloud.callFunction('anyFn', {})
    assert.fail('expected callFunction to throw')
  } catch (err) {
    // vm.runInNewContext produces an Error from the sandbox realm, so instanceof
    // checks against the host Error constructor fail; duck-type on .message instead.
    assert.equal(typeof err.message, 'string')
    assert.equal(err.message, 'cloud.callFunction:fail')
  }
})

test('isTimeoutError matches common timeout phrases in both English and Chinese', () => {
  const db = createDatabase()
  const cloud = loadCloudUtil({ cloud: { database: () => db } })

  assert.equal(cloud.isTimeoutError(new Error('request:fail timeout')), true)
  assert.equal(cloud.isTimeoutError(new Error('timed out waiting')), true)
  assert.equal(cloud.isTimeoutError(new Error('调用超时')), true)
  assert.equal(cloud.isTimeoutError(new Error('permission denied')), false)
  assert.equal(cloud.isTimeoutError('plain string timeout'), true)
})

// ========== subject-home nav color branches ==========

test('subject home applies per-subject navigation bar colors and falls back to math', () => {
  const wx = createWxMock()
  const { page } = loadPage('miniprogram/pages/subject-home/subject-home.js', {
    wx,
    modules: {
      '../../utils/cloud': {
        getSubjectProfile: async () => null,
        getReports: async () => []
      },
      '../../utils/util': { formatRelativeTime: () => '' },
      '../../utils/poller': { createPoller: () => ({ start() {}, stop() {}, isRunning: () => false }) }
    }
  })

  page.onLoad({ studentId: 'student-1', subject: 'chinese', subjectName: '语文', studentName: '钟青羽' })
  const chineseCall = wx.calls.find(call => call.name === 'setNavigationBarColor')
  assert.equal(chineseCall.payload.backgroundColor, '#276749')
  assert.equal(chineseCall.payload.frontColor, '#ffffff')

  wx.calls.length = 0
  page.setData({ subject: 'english' })
  page.setNavColor()
  const englishCall = wx.calls.find(call => call.name === 'setNavigationBarColor')
  assert.equal(englishCall.payload.backgroundColor, '#9c4f24')

  wx.calls.length = 0
  page.setData({ subject: 'unknown-subject' })
  page.setNavColor()
  const fallbackCall = wx.calls.find(call => call.name === 'setNavigationBarColor')
  // unknown subjects fall back to math palette
  assert.equal(fallbackCall.payload.backgroundColor, '#1f4f82')
})

// ========== uploadAndAnalyze mode=paper without paperId (documenting current behaviour) ==========

test('uploadAndAnalyze accepts paper mode without paperId but leaves sourceType as photo (known gap)', async () => {
  const db = createDatabase({
    students: [{ _id: 'student-1', _openid: 'owner-1', name: '钟青羽' }],
    subjectProfiles: [{ _id: 'profile-1', studentId: 'student-1', subject: 'math' }],
    reports: []
  })
  const cloud = createCloudMock({ db })
  const handler = loadModule('cloudfunctions/uploadAndAnalyze/index.js', {
    'wx-server-sdk': cloud
  })

  const result = await handler.main({
    fileIDs: ['cloud://photo-1'],
    studentId: 'student-1',
    subject: 'math',
    mode: 'paper'
  })

  // Documenting known gap: server currently allows paper mode without paperId.
  // A future fix should change this assertion to expect success:false with a clear error.
  assert.equal(result.success, true)
  assert.equal(db.dump('reports')[0].sourceType, 'photo')
  assert.equal(db.dump('reports')[0].paperId, '')
})

// ========== analyzePhotos failure path ==========

test('analyzePhotos clears profile analysis state when all batches fail', async () => {
  const db = createDatabase({
    reports: [{
      _id: 'report-fail',
      _openid: 'owner-1',
      studentId: 'student-1',
      subject: 'math',
      type: 'diagnosis',
      status: 'analyzing',
      createdAt: '2026-06-11T10:00:00Z',
      imageFileIds: ['cloud://photo-1', 'cloud://photo-2'],
      imageFiles: [
        { fileID: 'cloud://photo-1' },
        { fileID: 'cloud://photo-2' }
      ]
    }],
    subjectProfiles: [{
      _id: 'profile-1',
      studentId: 'student-1',
      subject: 'math',
      analysisStatus: 'analyzing',
      currentAnalysisId: 'report-fail',
      pendingBottlenecks: [],
      improvedBottlenecks: []
    }],
    analysisTasks: []
  })
  const batchCalls = []
  const cloud = createCloudMock({
    db,
    callFunction: async payload => {
      batchCalls.push(payload.data.fileIDs)
      return { result: { success: false, error: 'AI quota exceeded' } }
    }
  })
  const handler = loadModule('cloudfunctions/analyzePhotos/index.js', {
    'wx-server-sdk': cloud
  })

  const result = await handler.main({ reportId: 'report-fail' })
  const report = db.dump('reports').find(item => item._id === 'report-fail')
  const profile = db.dump('subjectProfiles')[0]
  const task = db.dump('analysisTasks')[0]

  assert.equal(result.success, false)
  assert.equal(report.status, 'failed')
  assert.equal(task.status, 'failed')
  assert.equal(profile.analysisStatus, null)
  assert.equal(profile.currentAnalysisId, '')
  assert.deepEqual(profile.pendingBottlenecks, [])
})

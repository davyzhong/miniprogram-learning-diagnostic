const test = require('node:test')
const assert = require('node:assert/strict')

const { createPoller } = require('../miniprogram/utils/poller')
const {
  classifyAnalysisState,
  createAnalysisPoller
} = require('../miniprogram/utils/analysis-poller')

test('poller stops when onValue returns false', async () => {
  const values = ['analyzing', 'completed']
  let scheduled = null
  const seen = []
  const poller = createPoller({
    request: async () => values.shift(),
    onValue: value => {
      seen.push(value)
      return value !== 'completed'
    },
    schedule: callback => {
      scheduled = callback
      return 1
    },
    cancel: () => {}
  })

  await poller.start()
  assert.equal(poller.isRunning(), true)
  await scheduled()

  assert.deepEqual(seen, ['analyzing', 'completed'])
  assert.equal(poller.isRunning(), false)
})

test('poller calls onTimeout after the maximum attempts', async () => {
  let scheduled = null
  let timedOut = false
  const poller = createPoller({
    request: async () => 'analyzing',
    onValue: () => true,
    maxAttempts: 2,
    onTimeout: () => { timedOut = true },
    schedule: callback => {
      scheduled = callback
      return 1
    },
    cancel: () => {}
  })

  await poller.start()
  await scheduled()

  assert.equal(timedOut, true)
  assert.equal(poller.isRunning(), false)
})

test('poller continues scheduling after request errors and only times out at maxAttempts', async () => {
  let scheduled = null
  let cancelled = false
  const errors = []
  let timedOut = false
  let requestCalls = 0
  const poller = createPoller({
    request: async () => {
      requestCalls += 1
      throw new Error(`network-${requestCalls}`)
    },
    onValue: () => true,
    onError: (err, attempt) => {
      errors.push({ message: err.message, attempt })
    },
    onTimeout: () => { timedOut = true },
    maxAttempts: 3,
    schedule: callback => {
      scheduled = callback
      return 99
    },
    cancel: () => { cancelled = true }
  })

  await poller.start()
  // first attempt fails; scheduler should still be invoked for retry
  assert.equal(errors.length, 1)
  assert.equal(errors[0].attempt, 1)
  assert.equal(timedOut, false)
  assert.equal(poller.isRunning(), true)
  assert.equal(scheduled !== null, true)

  await scheduled()
  assert.equal(errors.length, 2)
  assert.equal(timedOut, false)
  assert.equal(poller.isRunning(), true)

  await scheduled()
  assert.equal(errors.length, 3)
  assert.equal(timedOut, true)
  assert.equal(poller.isRunning(), false)
  // stop() cancels the previously scheduled timer before onTimeout fires
  assert.equal(cancelled, true)
})

test('poller.stop cancels pending schedule during an async request', async () => {
  let resolveRequest = null
  let scheduled = null
  let cancelled = false
  const poller = createPoller({
    request: () => new Promise(resolve => { resolveRequest = resolve }),
    onValue: () => true,
    schedule: callback => {
      scheduled = callback
      return 7
    },
    cancel: () => { cancelled = true }
  })

  const started = poller.start()
  // stop while the request is in flight
  poller.stop()
  assert.equal(poller.isRunning(), false)

  // complete the pending request; tick should not reschedule because stop() ran
  resolveRequest('value')
  await started
  assert.equal(scheduled, null)
  assert.equal(cancelled, false)
})

test('analysis poller classifies completed, failed, stale and active progress states', () => {
  const now = new Date('2026-06-13T10:00:00+08:00').getTime()

  assert.equal(classifyAnalysisState({ report: { status: 'completed' }, now }).status, 'completed')
  assert.equal(classifyAnalysisState({ report: { status: 'failed' }, now }).status, 'failed')
  assert.deepEqual(classifyAnalysisState({
    report: { status: 'analyzing', createdAt: '2026-06-13T09:59:00+08:00' },
    progress: { status: 'running', totalBatches: 4, completedBatches: 1, createdAt: '2026-06-13T09:59:00+08:00' },
    attempt: 1,
    now
  }), {
    status: 'analyzing',
    shouldContinue: true,
    hasProgress: true,
    taskMissing: false,
    progressPercent: 25,
    completedBatches: 1,
    totalBatches: 4,
    currentBatch: 2
  })
  assert.equal(classifyAnalysisState({
    report: { status: 'analyzing' },
    progress: { status: 'running', createdAt: '2026-06-13T09:00:00+08:00' },
    now
  }).status, 'timeout')
  assert.equal(classifyAnalysisState({
    report: { status: 'analyzing', createdAt: '2026-06-13T09:58:00+08:00' },
    attempt: 2,
    now
  }).taskMissing, true)
})

test('analysis poller wraps createPoller and only loads progress for analyzing reports', async () => {
  const calls = []
  let onCompletedReport = null
  const poller = createAnalysisPoller({
    loadReport: async () => ({ _id: 'report-1', status: 'completed' }),
    loadProgress: async () => {
      calls.push('progress')
      return null
    },
    onCompleted: report => { onCompletedReport = report },
    createPoller: options => {
      calls.push('create')
      return {
        start: () => options.onValue({ report: { _id: 'report-1', status: 'completed' }, progress: null }, 1),
        stop: () => {},
        isRunning: () => false
      }
    }
  })

  await poller.start()

  assert.deepEqual(calls, ['create'])
  assert.equal(onCompletedReport._id, 'report-1')
})

test('analysis poller refetches the report once when progress reaches a terminal state', async () => {
  const loadReportContexts = []
  let completedReport = null
  const snapshot = { _id: 'report-1', status: 'analyzing', createdAt: '2026-06-13T09:59:00+08:00' }
  const fresh = { _id: 'report-1', status: 'completed' }
  const poller = createAnalysisPoller({
    loadReport: async (context = {}) => {
      loadReportContexts.push(context)
      return context.terminal ? fresh : snapshot
    },
    loadProgress: async () => ({
      status: 'completed',
      totalBatches: 4,
      completedBatches: 4,
      createdAt: '2026-06-13T09:59:00+08:00'
    }),
    isProgressTerminal: progress => progress.status === 'completed' || progress.status === 'failed',
    onCompleted: report => { completedReport = report },
    now: () => new Date('2026-06-13T10:00:00+08:00').getTime(),
    createPoller: options => ({
      start: () => options.request().then(value => options.onValue(value, 1)),
      stop: () => {},
      isRunning: () => false
    })
  })

  await poller.start()

  assert.equal(loadReportContexts.length, 2)
  assert.deepEqual(loadReportContexts[0], {})
  assert.equal(loadReportContexts[1].terminal, true)
  // completed 分支拿到的是重拉后的真实报告，而不是分析中的快照
  assert.equal(completedReport.status, 'completed')
})

test('analysis poller keeps the snapshot report while progress is not terminal', async () => {
  const loadReportContexts = []
  let analyzingState = null
  const snapshot = { _id: 'report-1', status: 'analyzing', createdAt: '2026-06-13T09:59:00+08:00' }
  const poller = createAnalysisPoller({
    loadReport: async (context = {}) => {
      loadReportContexts.push(context)
      return snapshot
    },
    loadProgress: async () => ({
      status: 'processing',
      totalBatches: 4,
      completedBatches: 1,
      createdAt: '2026-06-13T09:59:30+08:00'
    }),
    isProgressTerminal: progress => progress.status === 'completed' || progress.status === 'failed',
    onAnalyzing: state => { analyzingState = state },
    now: () => new Date('2026-06-13T10:00:00+08:00').getTime(),
    createPoller: options => ({
      start: () => options.request().then(value => options.onValue(value, 1)),
      stop: () => {},
      isRunning: () => true
    })
  })

  await poller.start()

  // 非终态：只调一次 loadReport（快照），不触发终态重拉
  assert.equal(loadReportContexts.length, 1)
  assert.deepEqual(loadReportContexts[0], {})
  assert.equal(analyzingState.status, 'analyzing')
  assert.equal(analyzingState.progressPercent, 25)
})

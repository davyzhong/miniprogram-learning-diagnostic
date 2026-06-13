const { createPoller } = require('./poller')

const STALE_ANALYSIS_MS = 10 * 60 * 1000
const MISSING_TASK_MS = 60 * 1000
const MISSING_TASK_ATTEMPTS = 2

function timeOf(value) {
  const time = value ? new Date(value).getTime() : 0
  return Number.isNaN(time) ? 0 : time
}

function classifyAnalysisState({
  report,
  progress = null,
  attempt = 1,
  now = Date.now(),
  staleMs = STALE_ANALYSIS_MS,
  missingTaskMs = MISSING_TASK_MS,
  missingTaskAttempts = MISSING_TASK_ATTEMPTS
} = {}) {
  if (!report) {
    return {
      status: 'waiting',
      shouldContinue: true,
      hasProgress: false,
      taskMissing: false,
      progressPercent: 0,
      completedBatches: 0,
      totalBatches: 0,
      currentBatch: 0
    }
  }

  if (report.status === 'completed') {
    return { status: 'completed', shouldContinue: false }
  }

  if (report.status === 'failed') {
    return { status: 'failed', shouldContinue: false }
  }

  const progressTime = timeOf(progress && progress.createdAt)
  const taskAge = progressTime ? now - progressTime : 0
  if (progress && (progress.status === 'failed' || taskAge > staleMs)) {
    return { status: 'timeout', shouldContinue: false }
  }

  const totalBatches = Number(progress && progress.totalBatches) || 0
  const completedBatches = Number(progress && progress.completedBatches) || 0
  const hasProgress = totalBatches > 0
  const reportAge = timeOf(report.createdAt) ? now - timeOf(report.createdAt) : 0
  const taskMissing = !hasProgress && (
    attempt >= missingTaskAttempts || reportAge > missingTaskMs
  )
  const progressPercent = hasProgress
    ? Math.round(completedBatches / totalBatches * 100)
    : 0

  return {
    status: 'analyzing',
    shouldContinue: true,
    hasProgress,
    taskMissing,
    progressPercent,
    completedBatches,
    totalBatches,
    currentBatch: hasProgress ? Math.min(completedBatches + 1, totalBatches) : 0
  }
}

function createAnalysisPoller(options = {}) {
  const {
    loadReport,
    loadProgress,
    onCompleted = () => {},
    onFailed = () => {},
    onTimeoutStatus = () => {},
    onAnalyzing = () => {},
    onWaiting = () => {},
    onError = () => {},
    onTimeout = () => {},
    now = Date.now,
    staleMs,
    missingTaskMs,
    missingTaskAttempts,
    createPoller: createBasePoller = createPoller,
    ...pollerOptions
  } = options

  return createBasePoller({
    ...pollerOptions,
    request: async () => {
      const report = await loadReport()
      let progress = null
      if (report && report.status === 'analyzing' && typeof loadProgress === 'function') {
        try {
          progress = await loadProgress(report)
        } catch (e) {
          progress = null
        }
      }
      return { report, progress }
    },
    onValue: async ({ report, progress }, attempt) => {
      const state = classifyAnalysisState({
        report,
        progress,
        attempt,
        now: now(),
        staleMs,
        missingTaskMs,
        missingTaskAttempts
      })

      if (state.status === 'completed') {
        await onCompleted(report, state)
        return false
      }
      if (state.status === 'failed') {
        await onFailed(report, state)
        return false
      }
      if (state.status === 'timeout') {
        await onTimeoutStatus({ report, progress, state })
        return false
      }
      if (state.status === 'waiting') {
        await onWaiting(state)
        return true
      }
      await onAnalyzing(state)
      return state.shouldContinue
    },
    onError,
    onTimeout
  })
}

module.exports = {
  STALE_ANALYSIS_MS,
  classifyAnalysisState,
  createAnalysisPoller
}

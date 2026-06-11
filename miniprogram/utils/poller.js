function createPoller(options) {
  const {
    request,
    onValue,
    onError = () => {},
    onTimeout = () => {},
    intervalMs = 10000,
    maxAttempts = 30,
    schedule = setTimeout,
    cancel = clearTimeout
  } = options

  let timer = null
  let attempts = 0
  let running = false

  function stop() {
    running = false
    if (timer !== null) {
      cancel(timer)
      timer = null
    }
  }

  async function tick() {
    if (!running) return
    attempts += 1

    try {
      const value = await request()
      const shouldContinue = await onValue(value, attempts)
      if (shouldContinue === false) {
        stop()
        return
      }
    } catch (error) {
      onError(error, attempts)
    }

    if (!running) return
    if (attempts >= maxAttempts) {
      stop()
      onTimeout()
      return
    }

    timer = schedule(tick, intervalMs)
  }

  function start() {
    stop()
    running = true
    attempts = 0
    return tick()
  }

  return {
    start,
    stop,
    isRunning: () => running,
    getAttempts: () => attempts
  }
}

module.exports = { createPoller }

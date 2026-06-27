// Shared helpers extracted from the original tests/page-flows.test.js.
// Each per-page page-flows test file requires these instead of duplicating them.
function isThenable(value) {
  return Boolean(value && typeof value.then === 'function')
}

async function loadPageAndWait(page, options = {}) {
  const result = page.onLoad(options)
  if (isThenable(result)) {
    await result
  }
  if (page._loadPromise) {
    await page._loadPromise
  }
}

async function flushAsync(turns = 4) {
  for (let i = 0; i < turns; i += 1) {
    await Promise.resolve()
  }
}

async function waitForPageLoad(page) {
  if (page && page._loadPromise) {
    await page._loadPromise
    return
  }
  await flushAsync()
}

module.exports = {
  isThenable,
  loadPageAndWait,
  flushAsync,
  waitForPageLoad
}

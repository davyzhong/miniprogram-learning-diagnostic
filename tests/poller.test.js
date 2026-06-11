const test = require('node:test')
const assert = require('node:assert/strict')

const { createPoller } = require('../miniprogram/utils/poller')

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

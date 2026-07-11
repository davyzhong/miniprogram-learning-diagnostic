const test = require('node:test')
const assert = require('node:assert/strict')

const { createStatusStore, OP_TYPES, OP_STATUS, EVENTS, ACTIVE_STATUSES } = require('../miniprogram/utils/status-store')

function makeStore() {
  // 每个测试用独立实例，避免全局单例污染
  return createStatusStore()
}

// ── 基本注册与查询 ──

test('registerOperation stores an operation retrievable by key', () => {
  const store = makeStore()
  const op = store.registerOperation({
    studentId: 's1', subject: 'math', opType: OP_TYPES.ANALYSIS,
    status: OP_STATUS.ANALYZING, reportId: 'r1', label: '试卷分析'
  })
  assert.equal(op.status, 'analyzing')
  assert.equal(op.reportId, 'r1')

  const got = store.getOperation('s1', 'math', OP_TYPES.ANALYSIS)
  assert.deepEqual(got, op)
})

test('getOperation returns null for unregistered key', () => {
  const store = makeStore()
  assert.equal(store.getOperation('s1', 'math', OP_TYPES.ANALYSIS), null)
})

test('registerOperation merges detail and preserves previous fields', () => {
  const store = makeStore()
  store.registerOperation({
    studentId: 's1', subject: 'math', opType: OP_TYPES.ANALYSIS,
    status: OP_STATUS.ANALYZING, label: '试卷分析', detail: { batch: 1 }
  })
  const updated = store.registerOperation({
    studentId: 's1', subject: 'math', opType: OP_TYPES.ANALYSIS,
    status: OP_STATUS.ANALYZING, progress: 50, detail: { totalBatches: 3 }
  })
  // label 从上一条保留
  assert.equal(updated.label, '试卷分析')
  // detail 合并
  assert.equal(updated.detail.batch, 1)
  assert.equal(updated.detail.totalBatches, 3)
  assert.equal(updated.progress, 50)
})

test('progress is clamped to 0-100', () => {
  const store = makeStore()
  const op = store.registerOperation({
    studentId: 's1', subject: 'math', opType: OP_TYPES.ANALYSIS,
    status: OP_STATUS.ANALYZING, progress: 150
  })
  assert.equal(op.progress, 100)
  const op2 = store.registerOperation({
    studentId: 's1', subject: 'math', opType: OP_TYPES.ANALYSIS,
    status: OP_STATUS.ANALYZING, progress: -10
  })
  assert.equal(op2.progress, 0)
})

// ── 查询 ──

test('getOperations filters by studentId and subject', () => {
  const store = makeStore()
  store.registerOperation({ studentId: 's1', subject: 'math', opType: OP_TYPES.ANALYSIS, status: OP_STATUS.ANALYZING })
  store.registerOperation({ studentId: 's1', subject: 'english', opType: OP_TYPES.ANALYSIS, status: OP_STATUS.ANALYZING })
  store.registerOperation({ studentId: 's2', subject: 'math', opType: OP_TYPES.ANALYSIS, status: OP_STATUS.ANALYZING })

  assert.equal(store.getOperations('s1').length, 2)
  assert.equal(store.getOperations('s1', 'math').length, 1)
  assert.equal(store.getOperations('s2').length, 1)
  assert.equal(store.getOperations().length, 3)
})

test('getActiveOperations returns only non-terminal ops', () => {
  const store = makeStore()
  store.registerOperation({ studentId: 's1', subject: 'math', opType: OP_TYPES.ANALYSIS, status: OP_STATUS.ANALYZING })
  store.registerOperation({ studentId: 's1', subject: 'math', opType: OP_TYPES.VERIFICATION_PAPER, status: OP_STATUS.GENERATING })
  store.registerOperation({ studentId: 's1', subject: 'english', opType: OP_TYPES.ANALYSIS, status: OP_STATUS.COMPLETED })

  const active = store.getActiveOperations('s1')
  assert.equal(active.length, 2)
  assert.ok(active.every(op => ACTIVE_STATUSES.has(op.status)))
})

test('hasActiveOperation checks a specific op type', () => {
  const store = makeStore()
  store.registerOperation({ studentId: 's1', subject: 'math', opType: OP_TYPES.ANALYSIS, status: OP_STATUS.ANALYZING })
  assert.equal(store.hasActiveOperation('s1', 'math', OP_TYPES.ANALYSIS), true)
  assert.equal(store.hasActiveOperation('s1', 'math', OP_TYPES.VERIFICATION_PAPER), false)
})

test('clearForStudent removes all ops for a student', () => {
  const store = makeStore()
  store.registerOperation({ studentId: 's1', subject: 'math', opType: OP_TYPES.ANALYSIS, status: OP_STATUS.ANALYZING })
  store.registerOperation({ studentId: 's2', subject: 'math', opType: OP_TYPES.ANALYSIS, status: OP_STATUS.ANALYZING })
  store.clearForStudent('s1')
  assert.equal(store.getOperations('s1').length, 0)
  assert.equal(store.getOperations('s2').length, 1)
})

// ── 事件总线 ──

test('on returns an unsubscribe function', () => {
  const store = makeStore()
  let called = 0
  const unsub = store.on(EVENTS.OPERATION_CHANGED, () => { called += 1 })
  assert.equal(typeof unsub, 'function')
  store.registerOperation({ studentId: 's1', subject: 'math', opType: OP_TYPES.ANALYSIS, status: OP_STATUS.ANALYZING })
  assert.equal(called, 1)
  unsub()
  store.registerOperation({ studentId: 's1', subject: 'math', opType: OP_TYPES.ANALYSIS, status: OP_STATUS.ANALYZING, progress: 50 })
  assert.equal(called, 1) // 退订后不再触发
})

test('emit delivers to all handlers for that event', () => {
  const store = makeStore()
  let a = 0
  let b = 0
  store.on('test', () => { a += 1 })
  store.on('test', () => { b += 1 })
  store.emit('test', {})
  assert.equal(a, 1)
  assert.equal(b, 1)
})

test('operation:registered fires when op goes from nothing to active', () => {
  const store = makeStore()
  let registered = null
  store.on(EVENTS.OPERATION_REGISTERED, op => { registered = op })
  store.registerOperation({ studentId: 's1', subject: 'math', opType: OP_TYPES.ANALYSIS, status: OP_STATUS.ANALYZING })
  assert.ok(registered)
  assert.equal(registered.opType, OP_TYPES.ANALYSIS)
})

test('operation:completed fires when op transitions from active to terminal', () => {
  const store = makeStore()
  store.registerOperation({ studentId: 's1', subject: 'math', opType: OP_TYPES.ANALYSIS, status: OP_STATUS.ANALYZING })
  let completed = null
  store.on(EVENTS.OPERATION_COMPLETED, op => { completed = op })
  store.registerOperation({ studentId: 's1', subject: 'math', opType: OP_TYPES.ANALYSIS, status: OP_STATUS.COMPLETED, reportId: 'r1' })
  assert.ok(completed)
  assert.equal(completed.status, 'completed')
  assert.equal(completed.reportId, 'r1')
})

test('operation:completed does NOT fire for terminal→terminal updates', () => {
  const store = makeStore()
  store.registerOperation({ studentId: 's1', subject: 'math', opType: OP_TYPES.ANALYSIS, status: OP_STATUS.COMPLETED })
  let completed = 0
  store.on(EVENTS.OPERATION_COMPLETED, () => { completed += 1 })
  // 重复 completed 不会再次触发 completed 事件
  store.registerOperation({ studentId: 's1', subject: 'math', opType: OP_TYPES.ANALYSIS, status: OP_STATUS.COMPLETED })
  assert.equal(completed, 0)
})

test('handler error does not break other handlers', () => {
  const store = makeStore()
  let secondCalled = false
  store.on(EVENTS.OPERATION_CHANGED, () => { throw new Error('boom') })
  store.on(EVENTS.OPERATION_CHANGED, () => { secondCalled = true })
  store.registerOperation({ studentId: 's1', subject: 'math', opType: OP_TYPES.ANALYSIS, status: OP_STATUS.ANALYZING })
  assert.equal(secondCalled, true)
})

test('cache:invalidated event is delivered', () => {
  const store = makeStore()
  let payload = null
  store.on(EVENTS.CACHE_INVALIDATED, p => { payload = p })
  store.emit(EVENTS.CACHE_INVALIDATED, { studentId: 's1', subject: 'math' })
  assert.deepEqual(payload, { studentId: 's1', subject: 'math' })
})

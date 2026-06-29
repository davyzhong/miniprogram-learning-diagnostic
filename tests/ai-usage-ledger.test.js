const test = require('node:test')
const assert = require('node:assert/strict')

const {
  createCloudMock,
  createDatabase,
  loadModule
} = require('./helpers/cloud-function-harness')

const pricing = require('../cloudfunctions/aiUsage/pricing')

// ── pricing 估算 ──

test('pricing exposes a versioned price table for known models', () => {
  assert.ok(pricing.PRICING_VERSION)
  assert.ok(pricing.priceOf('hy3-preview').input > 0)
  assert.ok(pricing.priceOf('deepseek-v4-flash').input > 0)
  // unknown model falls back to a non-zero default
  assert.ok(pricing.priceOf('unknown-model').input > 0)
})

test('estimateTokensFromText scales with character count', () => {
  assert.equal(pricing.estimateTokensFromText(''), 0)
  assert.equal(pricing.estimateTokensFromText(null), 0)
  const short = pricing.estimateTokensFromText('abc')
  const longer = pricing.estimateTokensFromText('a'.repeat(250))
  assert.ok(longer > short)
})

test('tokensFromUsage extracts real usage and returns null when empty', () => {
  assert.equal(pricing.tokensFromUsage(null), null)
  assert.equal(pricing.tokensFromUsage({}), null)
  assert.equal(pricing.tokensFromUsage({ inputTokens: 0, outputTokens: 0 }), null)
  assert.deepEqual(pricing.tokensFromUsage({ inputTokens: 100, outputTokens: 50 }), {
    inputTokens: 100, outputTokens: 50, totalTokens: 150
  })
  // 兼容下划线命名
  assert.deepEqual(pricing.tokensFromUsage({ prompt_tokens: 10, completion_tokens: 5, total_tokens: 15 }), {
    inputTokens: 10, outputTokens: 5, totalTokens: 15
  })
})

test('costFromTokens scales with model price and token count', () => {
  const cost = pricing.costFromTokens('deepseek-v4-flash', 1000, 1000)
  // input 1000*0.001 + output 1000*0.002 = 0.001 + 0.002 = 0.003
  assert.equal(cost, 0.003)
  assert.equal(pricing.costFromTokens('hy3-preview', 0, 0), 0)
})

test('costFromImages charges hy3-preview but not text-only models', () => {
  assert.equal(pricing.costFromImages('hy3-preview', 5), 0.05)
  assert.equal(pricing.costFromImages('deepseek-v4-flash', 5), 0)
  assert.equal(pricing.costFromImages('hy3-preview', 0), 0)
})

// ── usage-ledger 三态写入 ──

function loadLedger(db, openId = 'owner-1') {
  const cloud = createCloudMock({ db, openId })
  // usage-ledger 用 db 直接，不依赖 wx-server-sdk，但 require('./pricing') 是本地
  return loadModule('cloudfunctions/aiUsage/usage-ledger.js', {})
}

test('recordUsageStart writes a pending event and returns its id', async () => {
  const db = createDatabase({ aiUsageEvents: [] })
  const ledger = loadLedger(db)
  const eventId = await ledger.recordUsageStart({
    db, openId: 'owner-1',
    eventType: 'photo_analysis', studentId: 'student-1', subject: 'math',
    cloudFunction: 'analyzeBatch', model: 'hy3-preview', imageCount: 3
  })
  assert.ok(eventId, 'should return a non-null event id')
  const rows = db.dump('aiUsageEvents')
  assert.equal(rows.length, 1)
  assert.equal(rows[0].status, 'pending')
  assert.equal(rows[0].model, 'hy3-preview')
  assert.equal(rows[0].imageCount, 3)
  assert.equal(rows[0].pricingVersion, pricing.PRICING_VERSION)
})

test('recordUsageStart returns null without blocking when missing required fields', async () => {
  const db = createDatabase({ aiUsageEvents: [] })
  const ledger = loadLedger(db)
  assert.equal(await ledger.recordUsageStart({ db, openId: 'owner-1' }), null) // no eventType/model
  assert.equal(await ledger.recordUsageStart({ db, eventType: 'x', model: 'y' }), null) // no openId
  assert.equal(db.dump('aiUsageEvents').length, 0)
})

test('recordUsageSuccess prefers real provider usage over estimation', async () => {
  const db = createDatabase({ aiUsageEvents: [] })
  const ledger = loadLedger(db)
  const eventId = await ledger.recordUsageStart({
    db, openId: 'owner-1', eventType: 'paper_generation', model: 'deepseek-v4-flash'
  })
  await ledger.recordUsageSuccess({
    db, eventId, usage: { inputTokens: 500, outputTokens: 300 },
    outputText: '题目内容', model: 'deepseek-v4-flash'
  })
  const row = db.dump('aiUsageEvents')[0]
  assert.equal(row.status, 'succeeded')
  assert.equal(row.inputTokens, 500)
  assert.equal(row.outputTokens, 300)
  assert.equal(row.totalTokens, 800)
  assert.equal(row.costSource, 'provider_usage')
  assert.equal(row.isEstimate, false)
  assert.equal(row.estimatedCostCny, 0.0011) // 500*0.001/1000 + 300*0.002/1000
})

test('recordUsageSuccess falls back to char estimation when usage missing', async () => {
  const db = createDatabase({ aiUsageEvents: [] })
  const ledger = loadLedger(db)
  const eventId = await ledger.recordUsageStart({
    db, openId: 'owner-1', eventType: 'paper_generation', model: 'deepseek-v4-flash'
  })
  await ledger.recordUsageSuccess({
    db, eventId, usage: null, outputText: 'a'.repeat(250), model: 'deepseek-v4-flash'
  })
  const row = db.dump('aiUsageEvents')[0]
  assert.equal(row.status, 'succeeded')
  assert.equal(row.costSource, 'estimated_by_chars')
  assert.equal(row.isEstimate, true)
  assert.ok(row.totalTokens > 0)
})

test('recordUsageFailure marks failed and keeps an image-cost floor', async () => {
  const db = createDatabase({ aiUsageEvents: [] })
  const ledger = loadLedger(db)
  const eventId = await ledger.recordUsageStart({
    db, openId: 'owner-1', eventType: 'photo_analysis', model: 'hy3-preview', imageCount: 4
  })
  await ledger.recordUsageFailure({ db, eventId, errorMessage: 'AI timeout', model: 'hy3-preview', imageCount: 4 })
  const row = db.dump('aiUsageEvents')[0]
  assert.equal(row.status, 'failed')
  assert.equal(row.errorMessage, 'AI timeout')
  assert.equal(row.costSource, 'estimated_by_image_count')
  assert.equal(row.estimatedCostCny, 0.04) // 4 * 0.01
})

test('ledger writes auto-create the collection on first write', async () => {
  // collection 缺失 → add 抛 -502005 → helper 建表后重试
  const db = createDatabase({}, { missingCollections: ['aiUsageEvents'] })
  const ledger = loadLedger(db)
  const eventId = await ledger.recordUsageStart({
    db, openId: 'owner-1', eventType: 'photo_analysis', model: 'hy3-preview'
  })
  assert.ok(eventId)
  assert.equal(db.dump('aiUsageEvents').length, 1)
})

// ── aiUsage 云函数 ──

function loadAiUsage(db, openId = 'owner-1') {
  const cloud = createCloudMock({ db, openId })
  return { handler: loadModule('cloudfunctions/aiUsage/index.js', { 'wx-server-sdk': cloud }) }
}

function seedEvents() {
  const base = new Date('2026-06-15T10:00:00+08:00')
  return [
    { _id: 'e1', _openid: 'owner-1', eventType: 'photo_analysis', model: 'hy3-preview', studentId: 's1', subject: 'math', totalTokens: 800, estimatedCostCny: 0.05, status: 'succeeded', createdAt: base },
    { _id: 'e2', _openid: 'owner-1', eventType: 'paper_generation', model: 'deepseek-v4-flash', studentId: 's1', subject: 'math', totalTokens: 500, estimatedCostCny: 0.01, status: 'succeeded', createdAt: base },
    { _id: 'e3', _openid: 'owner-1', eventType: 'photo_analysis', model: 'hy3-preview', studentId: 's2', subject: 'english', totalTokens: 300, estimatedCostCny: 0.02, status: 'failed', errorMessage: 'timeout', createdAt: base },
    { _id: 'e4', _openid: 'stranger', eventType: 'photo_analysis', model: 'hy3-preview', studentId: 's3', subject: 'math', totalTokens: 100, estimatedCostCny: 0.01, status: 'succeeded', createdAt: base }
  ]
}

test('listEvents returns only the callers own events, scoped to month', async () => {
  const db = createDatabase({ aiUsageEvents: seedEvents() })
  const { handler } = loadAiUsage(db)
  const result = await handler.main({ action: 'listEvents', month: '2026-06' })
  assert.equal(result.success, true)
  // 排除 stranger 的事件；owner 有 3 条
  assert.equal(result.items.length, 3)
  assert.ok(result.items.every(item => item._openid === undefined)) // publicEvent 剥离 _openid
  assert.equal(result.items[0].eventType, 'photo_analysis') // createdAt desc
})

test('listEvents uses Beijing month boundaries before limiting rows', async () => {
  const newerJulyEvents = Array.from({ length: 60 }, (_, index) => ({
    _id: `jul-${index}`,
    _openid: 'owner-1',
    eventType: 'paper_generation',
    model: 'deepseek-v4-flash',
    totalTokens: 10,
    estimatedCostCny: 0.001,
    status: 'succeeded',
    createdAt: new Date(`2026-07-${String((index % 20) + 1).padStart(2, '0')}T10:00:00+08:00`)
  }))
  const beijingJuneEvent = {
    _id: 'bj-june-1',
    _openid: 'owner-1',
    eventType: 'photo_analysis',
    model: 'hy3-preview',
    totalTokens: 100,
    estimatedCostCny: 0.02,
    status: 'succeeded',
    // UTC 仍是 5 月 31 日，但北京时间已经是 6 月 1 日。
    createdAt: new Date('2026-05-31T16:30:00.000Z')
  }
  const db = createDatabase({ aiUsageEvents: [...newerJulyEvents, beijingJuneEvent] })
  const { handler } = loadAiUsage(db)

  const result = await handler.main({ action: 'listEvents', month: '2026-06' })

  assert.equal(result.success, true)
  assert.deepEqual(result.items.map(item => item._id), ['bj-june-1'])
})

test('listEvents returns empty gracefully when collection is missing', async () => {
  const db = createDatabase({}, { missingCollections: ['aiUsageEvents'] })
  const { handler } = loadAiUsage(db)
  const result = await handler.main({ action: 'listEvents', month: '2026-06' })
  assert.equal(result.success, true)
  assert.equal(result.items.length, 0)
})

test('getSummary uses Beijing month boundaries before limiting rows', async () => {
  const newerJulyEvents = Array.from({ length: 520 }, (_, index) => ({
    _id: `jul-${index}`,
    _openid: 'owner-1',
    eventType: 'paper_generation',
    model: 'deepseek-v4-flash',
    studentId: 's-july',
    totalTokens: 10,
    estimatedCostCny: 0.001,
    status: 'succeeded',
    createdAt: new Date(`2026-07-${String((index % 20) + 1).padStart(2, '0')}T10:00:00+08:00`)
  }))
  const beijingJuneEvent = {
    _id: 'bj-june-summary',
    _openid: 'owner-1',
    eventType: 'photo_analysis',
    model: 'hy3-preview',
    studentId: 's-june',
    totalTokens: 250,
    estimatedCostCny: 0.03,
    status: 'succeeded',
    createdAt: new Date('2026-05-31T16:30:00.000Z')
  }
  const db = createDatabase({ aiUsageEvents: [...newerJulyEvents, beijingJuneEvent] })
  const { handler } = loadAiUsage(db)

  const result = await handler.main({ action: 'getSummary', month: '2026-06' })

  assert.equal(result.success, true)
  assert.equal(result.callCount, 1)
  assert.equal(result.totalTokens, 250)
  assert.equal(result.studentCount, 1)
})

test('getSummary aggregates tokens, cost, and per-event-type breakdown', async () => {
  const db = createDatabase({ aiUsageEvents: seedEvents() })
  const { handler } = loadAiUsage(db)
  const result = await handler.main({ action: 'getSummary', month: '2026-06' })
  assert.equal(result.success, true)
  assert.equal(result.callCount, 3)
  assert.equal(result.totalTokens, 1600) // 800+500+300
  assert.equal(result.totalCostCny, 0.08) // 0.05+0.01+0.02
  assert.equal(result.studentCount, 2) // s1, s2
  const photo = result.byEventType.find(b => b.eventType === 'photo_analysis')
  assert.equal(photo.callCount, 2)
  assert.equal(photo.totalTokens, 1100)
})

test('createDeletionRequest writes a requested record for an owned student', async () => {
  const db = createDatabase({
    students: [{ _id: 's1', _openid: 'owner-1', name: '钟青羽' }],
    dataDeletionRequests: []
  })
  const { handler } = loadAiUsage(db)
  const result = await handler.main({
    action: 'createDeletionRequest', studentId: 's1', scope: 'student_all', reason: '测试'
  })
  assert.equal(result.success, true)
  assert.ok(result.requestId)
  const rows = db.dump('dataDeletionRequests')
  assert.equal(rows.length, 1)
  assert.equal(rows[0].status, 'requested')
  assert.equal(rows[0].scope, 'student_all')
})

test('createDeletionRequest rejects invalid scope', async () => {
  const db = createDatabase({ dataDeletionRequests: [] })
  const { handler } = loadAiUsage(db)
  const result = await handler.main({ action: 'createDeletionRequest', scope: 'nuke-everything' })
  assert.equal(result.success, false)
  assert.match(result.error, /无效/)
})

test('getBetaAuth returns consented=false when no consent record exists', async () => {
  const db = createDatabase({}, { missingCollections: ['userConsents'] })
  const { handler } = loadAiUsage(db)
  const result = await handler.main({ action: 'getBetaAuth' })
  assert.equal(result.success, true)
  assert.equal(result.consented, false)
})

test('setBetaAuth records consent and getBetaAuth reads it back', async () => {
  const db = createDatabase({ userConsents: [] })
  const { handler } = loadAiUsage(db)
  const set = await handler.main({ action: 'setBetaAuth', consented: true })
  assert.equal(set.success, true)
  assert.equal(set.consented, true)
  const get = await handler.main({ action: 'getBetaAuth' })
  assert.equal(get.consented, true)
  assert.equal(db.dump('userConsents').length, 1)
})

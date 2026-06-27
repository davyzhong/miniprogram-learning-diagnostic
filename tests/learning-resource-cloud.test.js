const test = require('node:test')
const assert = require('node:assert/strict')

const {
  createCloudMock,
  createDatabase,
  loadModule
} = require('./helpers/cloud-function-harness')

function loadLearningResource(db, openId = 'owner-1') {
  const cloud = createCloudMock({ db, openId })
  const handler = loadModule('cloudfunctions/learningResource/index.js', {
    'wx-server-sdk': cloud
  })
  return { handler, cloud }
}

test('learningResource generatePack stores a ready math pack', async () => {
  const db = createDatabase({
    students: [{ _id: 'student-1', _openid: 'owner-1', name: '钟青羽' }],
    learningResourcePacks: []
  })
  const { handler } = loadLearningResource(db)

  const result = await handler.main({
    action: 'generatePack',
    studentId: 'student-1',
    subject: 'math',
    target: {
      bottleneckId: 'BN-DEC-MUL-POINT-COUNT',
      lpCode: 'LP-001',
      title: '小数乘法中积的小数位数判断错误'
    },
    resources: [{
      resourceId: 'RES-KHAN-DEC-MUL-001',
      displayTitle: '小数乘法示例',
      platform: 'Khan Academy'
    }]
  })

  assert.equal(result.success, true)
  assert.equal(result.packId, 'learningResourcePacks-1')
  const rows = db.dump('learningResourcePacks')
  assert.equal(rows.length, 1)
  assert.equal(rows[0].status, 'ready')
  assert.equal(rows[0].subject, 'math')
  assert.equal(rows[0].studentId, 'student-1')
  assert.equal(rows[0]._openid, 'owner-1')
  assert.ok(rows[0].blocks.some(block => block.type === 'practice'))
  assert.equal(rows[0].externalResources.length, 1)
})

test('learningResource cache uses fine targetId before coarse LP code', async () => {
  const db = createDatabase({
    students: [{ _id: 'student-1', _openid: 'owner-1', name: '钟青羽' }],
    learningResourcePacks: [{
      _id: 'pack-existing',
      studentId: 'student-1',
      subject: 'math',
      targetId: 'LP-001',
      lpCode: 'LP-001',
      title: '粗颗粒计算基础',
      llmEnhanced: true,
      enhancedAt: '2026-06-16T10:00:00+08:00'
    }]
  })
  const { handler } = loadLearningResource(db)

  const result = await handler.main({
    action: 'generatePack',
    studentId: 'student-1',
    subject: 'math',
    target: {
      targetId: 'LP-001:小数乘法拆分后加法求和错误',
      lpCode: 'LP-001',
      title: '小数乘法拆分后加法求和错误'
    }
  })

  assert.equal(result.success, true)
  assert.notEqual(result.packId, 'pack-existing')
  assert.equal(result.pack.targetId, 'LP-001:小数乘法拆分后加法求和错误')
  assert.equal(db.dump('learningResourcePacks').length, 2)
})

test('learningResource denies non-members when generating packs', async () => {
  const db = createDatabase({
    students: [{ _id: 'student-1', _openid: 'owner-1', name: '钟青羽' }],
    learningResourcePacks: []
  })
  const { handler } = loadLearningResource(db, 'stranger-1')

  const result = await handler.main({
    action: 'generatePack',
    studentId: 'student-1',
    subject: 'math',
    target: { lpCode: 'LP-001', lpName: '计算基础' }
  })

  assert.equal(result.success, false)
  assert.match(result.error, /无权/)
  assert.equal(db.dump('learningResourcePacks').length, 0)
})

// ── getPack / completePack / scheduleVerification 行为测试 ──
// 这三个 action 之前零行为测试。访问权按 pack 的 _openid 判定（非 event.studentId）；
// 错误被 exports.main try/catch 吞成 {success:false,error}，用 result.error 匹配。

function seedOwnerPack(overrides = {}) {
  return {
    _id: 'pack-1',
    _openid: 'owner-1',
    studentId: 'student-1',
    subject: 'math',
    sourceType: 'fine_bottleneck',
    targetId: 'BN-DEC-MUL-POINT-COUNT',
    lpCode: 'LP-001',
    title: '小数乘法中积的小数位数判断错误',
    status: 'ready',
    llmEnhanced: false,
    verificationScheduled: false,
    verificationScheduledAt: null,
    progress: null,
    blocks: [{ type: 'concept', title: '小数点定位' }],
    practiceItems: [{ prompt: '0.3 × 0.2 = ?' }],
    externalResources: [{ resourceId: 'RES-1', displayTitle: '示例', platform: 'Khan Academy' }],
    createdAt: '2026-06-15T10:00:00+08:00',
    updatedAt: '2026-06-15T10:00:00+08:00',
    ...overrides
  }
}

function packDb(pack) {
  return createDatabase({
    students: [{ _id: 'student-1', _openid: 'owner-1', name: '钟青羽' }],
    learningResourcePacks: [pack]
  })
}

test('getPack returns the pack with publicPack shape for the owner', async () => {
  const db = packDb(seedOwnerPack())
  const { handler } = loadLearningResource(db)

  const result = await handler.main({ action: 'getPack', packId: 'pack-1' })

  assert.equal(result.success, true)
  assert.equal(result.pack._id, 'pack-1')
  assert.equal(result.pack.status, 'ready')
  assert.equal(result.pack.verificationScheduled, false)
  assert.ok(Array.isArray(result.pack.blocks))
  assert.equal(result.pack.externalResources.length, 1)
})

test('getPack denies a non-owner', async () => {
  const db = packDb(seedOwnerPack())
  const { handler } = loadLearningResource(db, 'stranger-1')

  const result = await handler.main({ action: 'getPack', packId: 'pack-1' })

  assert.equal(result.success, false)
  assert.match(result.error, /无权/)
})

test('getPack rejects an unknown packId', async () => {
  const db = createDatabase({
    students: [{ _id: 'student-1', _openid: 'owner-1', name: '钟青羽' }],
    learningResourcePacks: []
  })
  const { handler } = loadLearningResource(db)

  const result = await handler.main({ action: 'getPack', packId: 'nope' })

  assert.equal(result.success, false)
  assert.match(result.error, /不存在/)
})

test('completePack flips status to completed and stores practiceResult', async () => {
  const db = packDb(seedOwnerPack())
  const { handler } = loadLearningResource(db)

  const result = await handler.main({
    action: 'completePack',
    packId: 'pack-1',
    practiceResult: { correct: 2, total: 3 }
  })

  assert.equal(result.success, true)
  assert.ok(result.completedAt instanceof Date)
  const row = db.dump('learningResourcePacks')[0]
  assert.equal(row.status, 'completed')
  assert.equal(row.progress.practiceResult.correct, 2)
  assert.equal(row.progress.practiceResult.total, 3)
  assert.ok(row.progress.completedAt instanceof Date)
  // updatedAt 与 completedAt 是同一 now() 的两个 Date 对象，值相等而非引用相等
  assert.deepEqual(row.updatedAt, row.progress.completedAt)
  // 原字段保留（update 只写 3 个键，不清空其它字段）
  assert.equal(row.studentId, 'student-1')
  assert.ok(Array.isArray(row.blocks))
})

test('completePack defaults missing practiceResult to empty object', async () => {
  const db = packDb(seedOwnerPack())
  const { handler } = loadLearningResource(db)

  const result = await handler.main({ action: 'completePack', packId: 'pack-1' })

  assert.equal(result.success, true)
  const row = db.dump('learningResourcePacks')[0]
  assert.deepEqual(row.progress.practiceResult, {})
})

test('completePack denies a non-owner without writing', async () => {
  const db = packDb(seedOwnerPack())
  const { handler } = loadLearningResource(db, 'stranger-1')

  const result = await handler.main({
    action: 'completePack',
    packId: 'pack-1',
    practiceResult: { correct: 1, total: 1 }
  })

  assert.equal(result.success, false)
  assert.match(result.error, /无权/)
  assert.equal(db.dump('learningResourcePacks')[0].status, 'ready')
})

test('scheduleVerification flags the pack and records the time', async () => {
  const db = packDb(seedOwnerPack())
  const { handler } = loadLearningResource(db)

  const result = await handler.main({ action: 'scheduleVerification', packId: 'pack-1' })

  assert.equal(result.success, true)
  assert.ok(result.scheduledAt instanceof Date)
  const row = db.dump('learningResourcePacks')[0]
  assert.equal(row.verificationScheduled, true)
  assert.ok(row.verificationScheduledAt instanceof Date)
  // scheduledAt 与 updatedAt 是同一 now() 的两个 Date 对象，值相等而非引用相等
  assert.deepEqual(row.updatedAt, row.verificationScheduledAt)
})

test('scheduleVerification denies a non-owner without writing', async () => {
  const db = packDb(seedOwnerPack())
  const { handler } = loadLearningResource(db, 'stranger-1')

  const result = await handler.main({ action: 'scheduleVerification', packId: 'pack-1' })

  assert.equal(result.success, false)
  assert.match(result.error, /无权/)
  assert.equal(db.dump('learningResourcePacks')[0].verificationScheduled, false)
})

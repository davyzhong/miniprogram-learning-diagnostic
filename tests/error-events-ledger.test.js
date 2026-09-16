const test = require('node:test')
const assert = require('node:assert/strict')
const {
  createCloudMock,
  createDatabase,
  loadModule
} = require('./helpers/cloud-function-harness')

// ========== 云函数错误台账（errorEvents，2026-09-12 接入）==========

test('logErrorEvent writes a best-effort ledger document', async () => {
  const db = createDatabase({ errorEvents: [] })
  const cloud = createCloudMock({ db, openId: 'test-openid' })
  const mod = loadModule('cloudfunctions/analyzePhotos/index.js', { 'wx-server-sdk': cloud })

  await mod.logErrorEvent({
    function: 'analyzePhotos',
    action: 'main',
    message: '图片分析失败',
    error: new Error('boom'),
    studentId: 'student-1',
    reportId: 'report-1'
  })

  const docs = db.dump('errorEvents')
  assert.equal(docs.length, 1)
  assert.equal(docs[0].function, 'analyzePhotos')
  assert.equal(docs[0].action, 'main')
  assert.equal(docs[0].error, 'boom')
  assert.equal(docs[0].studentId, 'student-1')
  assert.equal(docs[0].reportId, 'report-1')
  assert.ok(docs[0].createdAt, 'createdAt should be set')
})

test('logErrorEvent never rejects even when the ledger collection is missing', async () => {
  const db = createDatabase({}, { missingCollections: ['errorEvents'] })
  const cloud = createCloudMock({ db, openId: 'test-openid' })
  const mod = loadModule('cloudfunctions/analyzePhotos/index.js', { 'wx-server-sdk': cloud })

  // 不应抛出：台账失败只记 console.error，主流程继续
  await mod.logErrorEvent({ function: 'analyzePhotos', action: 'main', error: null })
})

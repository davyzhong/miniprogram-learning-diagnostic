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

// tests/node-mastery-service.test.js
// studentData.getNodeMasteryMap 读路径：权限守卫 + 集合缺失容错 + 出参裁剪。
const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')

const {
  createNodeMasteryService,
  publicMasteryRecord,
} = require('../cloudfunctions/studentData/node-mastery-service')

const T0 = new Date('2026-07-17T10:00:00+08:00')

function fakeDb({ students = [], members = [], mastery = [], masteryMissing = false } = {}) {
  return {
    collection: (name) => {
      if (name === 'students') {
        return { doc: (id) => ({ get: async () => ({ data: students.find(s => s._id === id) || null }) }) }
      }
      if (name === 'studentMembers') {
        return {
          where: (filter) => ({
            limit: () => ({
              get: async () => ({
                data: members.filter(m => Object.entries(filter).every(([k, v]) => m[k] === v)),
              }),
            }),
          }),
        }
      }
      if (name === 'studentNodeMastery') {
        return {
          where: (filter) => ({
            limit: () => ({
              get: async () => {
                if (masteryMissing) {
                  const error = new Error('collection not exists')
                  error.errCode = -502005
                  throw error
                }
                return { data: mastery.filter(r => Object.entries(filter).every(([k, v]) => r[k] === v)) }
              },
            }),
          }),
        }
      }
      throw new Error(`unexpected collection ${name}`)
    },
  }
}

const OWNER_OPENID = 'openid-owner'
const STUDENT = { _id: 'stu-1', _openid: OWNER_OPENID, name: '测试学生' }
const MASTERY_RECORDS = [
  {
    _id: 'm1', studentId: 'stu-1', subject: 'math', nodeId: 'MATH-NUM-DEC-MUL-POINT',
    status: 'partial_mastery', confidence: 0.7, activeBottleneckIds: ['BN-DEC-MUL-POINT-COUNT'],
    evidenceRefs: Array.from({ length: 8 }, (_, i) => ({ type: 'errorEvidence', sourceId: `r${i}`, summary: 'x', at: T0 })),
    lastEvidenceAt: T0, lastPracticedAt: T0, nextReviewAt: T0, updatedAt: T0,
  },
]

test('owner 读取掌握地图：返回裁剪后的记录', async () => {
  const service = createNodeMasteryService({ db: fakeDb({ students: [STUDENT], mastery: MASTERY_RECORDS }) })
  const result = await service.getNodeMasteryMap(OWNER_OPENID, 'stu-1', 'math')
  assert.equal(result.success, true)
  assert.equal(result.records.length, 1)
  const record = result.records[0]
  assert.equal(record.nodeId, 'MATH-NUM-DEC-MUL-POINT')
  assert.equal(record.status, 'partial_mastery')
  assert.equal(record.evidenceRefs.length, 5, 'evidenceRefs 只回传最近 5 条')
  assert.equal(record._id, undefined, '不暴露内部 _id')
})

test('共同家长（active member）可读；无权用户被拒绝', async () => {
  const memberService = createNodeMasteryService({
    db: fakeDb({
      students: [STUDENT],
      members: [{ studentId: 'stu-1', memberOpenId: 'openid-mom', status: 'active', role: 'viewer' }],
      mastery: MASTERY_RECORDS,
    }),
  })
  const result = await memberService.getNodeMasteryMap('openid-mom', 'stu-1', 'math')
  assert.equal(result.records.length, 1)

  const strangerService = createNodeMasteryService({ db: fakeDb({ students: [STUDENT] }) })
  await assert.rejects(() => strangerService.getNodeMasteryMap('openid-stranger', 'stu-1', 'math'), /无权访问/)
})

test('集合不存在时返回空地图而不是报错', async () => {
  const service = createNodeMasteryService({ db: fakeDb({ students: [STUDENT], masteryMissing: true }) })
  const result = await service.getNodeMasteryMap(OWNER_OPENID, 'stu-1', 'math')
  assert.deepEqual(result.records, [])
})

test('缺少 studentId 直接抛错', async () => {
  const service = createNodeMasteryService({ db: fakeDb({}) })
  await assert.rejects(() => service.getNodeMasteryMap(OWNER_OPENID, '', 'math'), /缺少学生/)
})

test('publicMasteryRecord 字段默认值', () => {
  const record = publicMasteryRecord({ nodeId: 'N1', status: 'suspected_gap' })
  assert.deepEqual(record.activeBottleneckIds, [])
  assert.deepEqual(record.evidenceRefs, [])
  assert.equal(record.nextReviewAt, null)
})

test('studentData/index.js 已挂载 getNodeMasteryMap 且不超过 800 行上限', () => {
  const source = fs.readFileSync(path.resolve(__dirname, '../cloudfunctions/studentData/index.js'), 'utf8')
  assert.match(source, /getNodeMasteryMap/)
  assert.ok(source.split('\n').length <= 800, `index.js ${source.split('\n').length} 行，超过部署上限`)
})

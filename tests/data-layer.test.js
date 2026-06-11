const test = require('node:test')
const assert = require('node:assert/strict')
const {
  createDatabase,
  loadModule
} = require('./helpers/cloud-function-harness')

function loadCloudUtil(wx) {
  return loadModule('miniprogram/utils/cloud.js', {}, { wx })
}

test('createStudentWithProfiles creates math, Chinese and English profiles', async () => {
  const db = createDatabase({ students: [], subjectProfiles: [] })
  const cloud = loadCloudUtil({ cloud: { database: () => db } })

  const studentId = await cloud.createStudentWithProfiles({ name: '钟青羽', grade: 5 })
  const profiles = db.dump('subjectProfiles')

  assert.ok(studentId)
  assert.deepEqual(profiles.map(profile => profile.subject).sort(), ['chinese', 'english', 'math'])
  assert.ok(profiles.every(profile => profile.studentId === studentId))
})

test('cloud function wrapper exposes backend errors and recognizes timeouts', async () => {
  const db = createDatabase()
  const cloud = loadCloudUtil({
    cloud: {
      database: () => db,
      callFunction: async () => ({ result: { success: false, error: '参数无效' } })
    }
  })

  await assert.rejects(() => cloud.callFunction('test', {}), /参数无效/)
  assert.equal(cloud.isTimeoutError(new Error('request timeout')), true)
  assert.equal(cloud.isTimeoutError(new Error('permission denied')), false)
})

test('temporary cloud URLs are deduplicated and fetched in platform-sized batches', async () => {
  const db = createDatabase()
  const batches = []
  const cloud = loadCloudUtil({
    cloud: {
      database: () => db,
      getTempFileURL: async ({ fileList }) => {
        batches.push(fileList)
        return { fileList: fileList.map(fileID => ({ fileID, tempFileURL: `https://${fileID}` })) }
      }
    }
  })
  const fileIDs = Array.from({ length: 55 }, (_, index) => `file-${index}`)

  const results = await cloud.getTempFileURLs([...fileIDs, 'file-0'])
  assert.deepEqual(batches.map(batch => batch.length), [50, 5])
  assert.equal(results.length, 55)
})

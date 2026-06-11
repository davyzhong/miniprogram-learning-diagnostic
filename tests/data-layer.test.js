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

test('normalizeError maps wx errMsg/errCode and falls back to default message', () => {
  const db = createDatabase()
  const cloud = loadCloudUtil({ cloud: { database: () => db } })

  const fromErrMsg = cloud.normalizeError({ errMsg: 'uploadFile:fail auth' }, 'fallback')
  assert.equal(fromErrMsg.message, 'uploadFile:fail auth')

  const fromMessage = cloud.normalizeError({ message: 'timeout', code: -1 }, 'ignored')
  assert.equal(fromMessage.message, 'timeout')
  assert.equal(fromMessage.code, -1)

  const fromErrCode = cloud.normalizeError({ errCode: 404 }, 'not found')
  assert.equal(fromErrCode.message, 'not found')
  assert.equal(fromErrCode.code, 404)

  const nullInput = cloud.normalizeError(null, 'explicit fallback')
  assert.equal(nullInput.message, 'explicit fallback')

  const undefinedInput = cloud.normalizeError(undefined)
  assert.equal(undefinedInput.message, '操作失败，请稍后重试')

  const stringInput = cloud.normalizeError('plain string', 'fb')
  assert.equal(stringInput.message, 'fb')
})

test('getReports filters by student only when subject is omitted', async () => {
  const db = createDatabase({
    reports: [
      { _id: 'r-math', studentId: 'student-1', subject: 'math', createdAt: '2026-06-11T10:00:00Z' },
      { _id: 'r-chinese', studentId: 'student-1', subject: 'chinese', createdAt: '2026-06-11T09:00:00Z' },
      { _id: 'r-other', studentId: 'student-2', subject: 'math', createdAt: '2026-06-11T11:00:00Z' }
    ]
  })
  const cloud = loadCloudUtil({ cloud: { database: () => db } })

  const allSubjects = await cloud.getReports('student-1')
  assert.deepEqual(allSubjects.map(item => item._id).sort(), ['r-chinese', 'r-math'])

  const mathOnly = await cloud.getReports('student-1', 'math')
  assert.deepEqual(mathOnly.map(item => item._id), ['r-math'])
})

test('ensureSubjectProfile returns the existing profile without creating a duplicate', async () => {
  const db = createDatabase({
    subjectProfiles: [{ _id: 'profile-existing', studentId: 'student-1', subject: 'math', subjectName: '数学' }]
  })
  const cloud = loadCloudUtil({ cloud: { database: () => db } })

  const profile = await cloud.ensureSubjectProfile('student-1', 'math', '数学')
  assert.equal(profile._id, 'profile-existing')
  assert.equal(db.dump('subjectProfiles').length, 1)
})

test('ensureSubjectProfile documents concurrent duplicate creation race', async () => {
  // Current implementation uses check-then-act and does not guard against concurrent calls.
  // This test records the known behaviour so future refactors either keep it or deliberately fix it.
  const db = createDatabase({ subjectProfiles: [] })
  const cloud = loadCloudUtil({ cloud: { database: () => db } })

  const [first, second] = await Promise.all([
    cloud.ensureSubjectProfile('student-1', 'math', '数学'),
    cloud.ensureSubjectProfile('student-1', 'math', '数学')
  ])

  const stored = db.dump('subjectProfiles')
  // Both callers observed no existing profile, so both added one — documenting the race.
  assert.equal(stored.length, 2)
  assert.notEqual(first._id, second._id)
})

test('uploadPhoto builds a cloud path that preserves the original extension', async () => {
  const uploads = []
  const cloud = loadCloudUtil({
    cloud: {
      database: () => createDatabase(),
      uploadFile: async ({ cloudPath, filePath }) => {
        uploads.push({ cloudPath, filePath })
        return { fileID: `cloud://${cloudPath}` }
      }
    }
  })

  const fileID = await cloud.uploadPhoto('/tmp/paper.JPG', 'student-1', 'batch-1')
  assert.match(fileID, /^cloud:\/\/photos\/student-1\/batch-1\/\d+\.JPG$/)
  assert.equal(uploads[0].filePath, '/tmp/paper.JPG')
})

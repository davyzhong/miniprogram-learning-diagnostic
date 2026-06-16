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

test('cloud function wrapper annotates aggregate timeout errors with function and action context', async () => {
  const aggregateReaders = [
    ['getStudentDashboard', cloud => cloud.getStudentDashboard('student-1')],
    ['getSubjectDashboard', cloud => cloud.getSubjectDashboard('student-1', 'math')],
    ['getLearningTimeline', cloud => cloud.getLearningTimeline({ studentId: 'student-1' })],
    ['getReportDetail', cloud => cloud.getReportDetail('report-1')]
  ]

  for (const [action, invoke] of aggregateReaders) {
    const db = createDatabase()
    const cloud = loadCloudUtil({
      cloud: {
        database: () => db,
        callFunction: async () => { throw new Error('timeout') }
      }
    })

    await assert.rejects(
      () => invoke(cloud),
      error => {
        assert.match(error.message, new RegExp(`studentData:${action}`))
        assert.match(error.message, /超时|timeout/i)
        assert.equal(error.functionName, 'studentData')
        assert.equal(error.action, action)
        assert.equal(cloud.isTimeoutError(error), true)
        return true
      }
    )
  }
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

test('ensureSubjectProfile coalesces concurrent creation for the same student and subject', async () => {
  const db = createDatabase({ subjectProfiles: [] })
  const cloud = loadCloudUtil({ cloud: { database: () => db } })

  const [first, second] = await Promise.all([
    cloud.ensureSubjectProfile('student-1', 'math', '数学'),
    cloud.ensureSubjectProfile('student-1', 'math', '数学')
  ])

  const stored = db.dump('subjectProfiles')
  assert.equal(stored.length, 1)
  assert.equal(first._id, second._id)
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

test('English vocabulary helpers call englishVocabulary cloud function actions', async () => {
  const calls = []
  const cloud = loadCloudUtil({
    cloud: {
      database: () => createDatabase(),
      callFunction: async payload => {
        calls.push(payload)
        return { result: { success: true, action: payload.data.action } }
      }
    }
  })

  assert.equal((await cloud.getEnglishVocabularySummary('student-1')).action, 'getVocabularySummary')
  assert.equal((await cloud.createEnglishImportBatch({ studentId: 'student-1' })).action, 'createImportBatch')
  assert.equal((await cloud.confirmEnglishImportBatch('student-1', 'batch-1')).action, 'confirmImportBatch')
  assert.equal((await cloud.seedEnglishPersonalVocabulary('student-1')).action, 'seedPersonalVocabulary')
  assert.equal((await cloud.generateEnglishRecognitionSession({ studentId: 'student-1' })).action, 'generateRecognitionSession')
  assert.equal((await cloud.submitEnglishRecognitionAttempt({ studentId: 'student-1', sessionId: 'session-1' })).action, 'submitRecognitionAttempt')
  assert.equal((await cloud.generateEnglishPaperDictationSession({ studentId: 'student-1' })).action, 'generatePaperDictationSession')
  assert.equal((await cloud.submitEnglishDictationPhoto({ studentId: 'student-1', sessionId: 'session-1' })).action, 'submitDictationPhoto')
  assert.equal((await cloud.analyzeEnglishDictationPhoto({ studentId: 'student-1', sessionId: 'session-1' })).action, 'analyzeDictationPhoto')
  assert.equal((await cloud.generateEnglishPracticeSession({ studentId: 'student-1' })).action, 'generatePracticeSession')
  assert.equal((await cloud.submitEnglishDictationAttempt({ studentId: 'student-1', sessionId: 'session-1' })).action, 'submitDictationAttempt')
  assert.equal((await cloud.submitEnglishPracticeResult({ studentId: 'student-1', sessionId: 'session-1' })).action, 'submitPracticeResult')

  assert.deepEqual(calls.map(call => `${call.name}:${call.data.action}`), [
    'englishVocabulary:getVocabularySummary',
    'englishVocabulary:createImportBatch',
    'englishVocabulary:confirmImportBatch',
    'englishVocabulary:seedPersonalVocabulary',
    'englishVocabulary:generateRecognitionSession',
    'englishVocabulary:submitRecognitionAttempt',
    'englishVocabulary:generatePaperDictationSession',
    'englishVocabulary:submitDictationPhoto',
    'englishVocabulary:analyzeDictationPhoto',
    'englishVocabulary:generatePracticeSession',
    'englishVocabulary:submitDictationAttempt',
    'englishVocabulary:submitPracticeResult'
  ])
})

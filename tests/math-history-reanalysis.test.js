const test = require('node:test')
const assert = require('node:assert/strict')

const {
  imageFileIdsOf,
  isReanalysisCandidate,
  selectReanalysisCandidates,
  buildReplacementReport,
  legacyPendingPatch,
  legacyArchivePatch,
  finalizablePairs,
  activeMathReportsForProfile
} = require('../scripts/reanalyze-math-history')

test('collects image ids from both imageFileIds and imageFiles', () => {
  assert.deepEqual(imageFileIdsOf({
    imageFileIds: ['cloud://a', 'cloud://b'],
    imageFiles: [{ fileID: 'cloud://b' }, { fileID: 'cloud://c' }]
  }), ['cloud://a', 'cloud://b', 'cloud://c'])
})

test('selects only completed visible legacy math reports with images', () => {
  const reports = [
    { _id: 'r3', subject: 'math', status: 'completed', createdAt: '2026-06-03', imageFileIds: ['c'] },
    { _id: 'r1', subject: 'math', status: 'completed', createdAt: '2026-06-01', imageFileIds: ['a'] },
    { _id: 'english', subject: 'english', status: 'completed', imageFileIds: ['x'] },
    { _id: 'pending', subject: 'math', status: 'analyzing', imageFileIds: ['x'] },
    { _id: 'archived', subject: 'math', status: 'completed', isArchived: true, imageFileIds: ['x'] },
    { _id: 'replacement', subject: 'math', status: 'completed', imageFileIds: ['x'], reanalysis: { sourceReportId: 'r0' } },
    { _id: 'queued', subject: 'math', status: 'completed', imageFileIds: ['x'], replacedByReportId: 'new-queued' },
    { _id: 'empty', subject: 'math', status: 'completed', imageFileIds: [] }
  ]

  assert.equal(isReanalysisCandidate(reports[0]), true)
  assert.deepEqual(selectReanalysisCandidates(reports).map(item => item._id), ['r1', 'r3'])
})

test('builds replacement reports that keep image evidence but reset legacy analysis', () => {
  const replacement = buildReplacementReport({
    _id: 'old-report',
    _openid: 'owner-1',
    studentId: 'student-1',
    subject: 'math',
    subjectName: '数学',
    type: 'diagnosis',
    imageFileIds: ['cloud://a'],
    imageFiles: [{ fileID: 'cloud://a', fileName: 'a.jpg', ocrSummary: '旧 OCR', analysisStatus: 'completed' }],
    bottlenecks: [{ lpCode: 'LP-002' }],
    errorDetails: [{ lpCode: 'LP-002' }],
    createdAt: new Date('2026-06-01T00:00:00.000Z')
  }, {
    batchId: 'batch-1',
    now: new Date('2026-06-16T00:00:00.000Z')
  })

  assert.equal(replacement._openid, 'owner-1')
  assert.equal(replacement.status, 'analyzing')
  assert.deepEqual(replacement.imageFileIds, ['cloud://a'])
  assert.equal(replacement.imageFiles[0].ocrSummary, '')
  assert.deepEqual(replacement.bottlenecks, [])
  assert.deepEqual(replacement.errorDetails, [])
  assert.equal(replacement.reanalysis.sourceReportId, 'old-report')
  assert.equal(replacement.originalReportId, 'old-report')
})

test('legacy patches keep old reports until replacement is completed, then archive safely', () => {
  const now = new Date('2026-06-16T00:00:00.000Z')
  const pending = legacyPendingPatch('new-report', { batchId: 'batch-1', now })
  const archived = legacyArchivePatch('new-report', { batchId: 'batch-1', now })

  assert.equal(pending.replacedByReportId, 'new-report')
  assert.equal(pending.mathReanalysis.status, 'replacement_created')
  assert.equal(archived.isArchived, true)
  assert.equal(archived.archiveReason, 'replaced-by-math-learning-map-full-reanalysis')
  assert.equal(archived.mathReanalysis.status, 'archived_after_reanalysis')
})

test('finalize pairs only completed replacements and rebuilds profile from active reports', () => {
  const reports = [
    { _id: 'old-1', subject: 'math', status: 'completed', studentId: 'student-1', imageFileIds: ['a'] },
    { _id: 'old-2', subject: 'math', status: 'completed', studentId: 'student-1', imageFileIds: ['b'] },
    {
      _id: 'new-1',
      subject: 'math',
      status: 'completed',
      studentId: 'student-1',
      reanalysis: { sourceReportId: 'old-1' },
      bottlenecks: [{ lpCode: 'LP-002', nodeIds: ['MATH-NUM-FRACTION-DIV-RECIPROCAL'] }]
    },
    {
      _id: 'new-2',
      subject: 'math',
      status: 'analyzing',
      studentId: 'student-1',
      reanalysis: { sourceReportId: 'old-2' }
    }
  ]

  const pairs = finalizablePairs(reports)
  assert.deepEqual(pairs.map(pair => [pair.source._id, pair.replacement._id]), [['old-1', 'new-1']])

  const active = activeMathReportsForProfile(reports, new Set(['old-1']))
  assert.deepEqual(active.map(item => item._id), ['old-2', 'new-1'])
})

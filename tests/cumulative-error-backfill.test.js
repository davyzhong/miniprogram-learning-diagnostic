const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')

const {
  BACKFILL_VERSION,
  selectEffectiveDiagnosisReports,
  aggregateCumulativeErrors,
  applyMetricsToProfile
} = require('../cloudfunctions/reanalyzeMathHistory/cumulative-error-backfill')

function diagnosis(overrides = {}) {
  return {
    _id: 'report',
    studentId: 'student-1',
    subject: 'math',
    type: 'diagnosis',
    status: 'completed',
    isEffective: true,
    quality: { status: 'sufficient' },
    createdAt: '2026-07-01T00:00:00.000Z',
    bottlenecks: [{ lpCode: 'LP-001', errorCount: 2 }],
    ...overrides
  }
}

test('backfill selects only final effective diagnosis reports once per lineage', () => {
  const reports = [
    diagnosis({ _id: 'standalone' }),
    diagnosis({ _id: 'ineffective', isEffective: false }),
    diagnosis({ _id: 'duplicate', allPhotosDuplicate: true }),
    diagnosis({ _id: 'insufficient', quality: { status: 'insufficient' } }),
    diagnosis({ _id: 'source', replacedByReportId: 'replacement' }),
    diagnosis({
      _id: 'replacement',
      createdAt: '2026-07-02T00:00:00.000Z',
      reanalysis: { sourceReportId: 'source' },
      bottlenecks: [{ lpCode: 'LP-001', errorCount: 3 }]
    }),
    diagnosis({
      _id: 'canceled-replacement',
      createdAt: '2026-07-03T00:00:00.000Z',
      isArchived: true,
      reanalysis: { sourceReportId: 'source' }
    }),
    diagnosis({ _id: 'verification', type: 'verification' })
  ]

  assert.deepEqual(
    selectEffectiveDiagnosisReports(reports).map(item => item._id),
    ['standalone', 'replacement']
  )
  assert.deepEqual(aggregateCumulativeErrors(reports), {
    'LP-001': {
      lpCode: 'LP-001',
      cumulativeErrorCount: 5,
      occurrenceCount: 2
    }
  })
})

test('backfill prefers independently measurable fine bottlenecks', () => {
  const metrics = aggregateCumulativeErrors([diagnosis({
    bottlenecks: [{
      lpCode: 'LP-001',
      errorCount: 9,
      candidateBottlenecks: [{
        bottleneckId: 'BN-DEC-MUL-POINT-COUNT',
        errorCount: 5
      }]
    }]
  })])

  assert.deepEqual(metrics, {
    'BN-DEC-MUL-POINT-COUNT': {
      lpCode: 'LP-001',
      cumulativeErrorCount: 5,
      occurrenceCount: 1
    }
  })
})

test('profile application overwrites aggregates and is idempotent', () => {
  const metrics = {
    'LP-001': { lpCode: 'LP-001', cumulativeErrorCount: 5, occurrenceCount: 2 }
  }
  const completedAt = new Date('2026-07-16T00:00:00.000Z')
  const first = applyMetricsToProfile({
    currentBottlenecks: [{ lpCode: 'LP-001', cumulativeErrorCount: 99, evidenceCount: 9 }]
  }, metrics, completedAt)
  const second = applyMetricsToProfile({
    currentBottlenecks: first.currentBottlenecks,
    metricBackfill: first.metricBackfill
  }, metrics, completedAt)

  assert.equal(first.changed, true)
  assert.equal(first.currentBottlenecks[0].cumulativeErrorCount, 5)
  assert.equal(first.currentBottlenecks[0].evidenceCount, 2)
  assert.equal(first.metricBackfill.version, BACKFILL_VERSION)
  assert.equal(second.changed, false)
})

test('cloud function exposes a protected dry-run-first backfill phase', () => {
  const source = fs.readFileSync(
    path.join(__dirname, '../cloudfunctions/reanalyzeMathHistory/index.js'),
    'utf8'
  )

  assert.match(source, /async function backfillCumulativeErrors/)
  assert.match(source, /if \(!event\.apply\)/)
  assert.match(source, /phase === 'backfillCumulativeErrors'/)
  assert.match(source, /metricBackfill/)
})

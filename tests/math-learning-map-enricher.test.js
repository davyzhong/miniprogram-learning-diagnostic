const test = require('node:test')
const assert = require('node:assert/strict')

const {
  enrichMathReport
} = require('../cloudfunctions/analyzePhotos/math-learning-map-enricher')

const {
  rebuildProfileFromReports
} = require('../scripts/backfill-math-learning-map')

test('enriches historical fraction bottlenecks with fine-grained nodes and resources', () => {
  const result = enrichMathReport({
    _id: 'report-fraction',
    subject: 'math',
    status: 'completed',
    type: 'diagnosis',
    totalErrors: 1,
    summary: '分数除法错误',
    bottlenecks: [{
      lpCode: 'LP-002',
      lpName: '分数运算错误',
      severity: 'high',
      errorCount: 1,
      rootCause: '除以分数时没有转换成乘倒数'
    }],
    errorDetails: [{
      lpCode: 'LP-002',
      questionContent: '6 ÷ 7/8',
      studentAnswer: '50',
      correctAnswer: '48/7'
    }],
    imageFiles: [{ ocrSummary: '6 ÷ 7/8 得到 50，分数除法倒数规则不稳' }]
  }, { now: new Date('2026-06-16T00:00:00.000Z') })

  const bottleneck = result.report.bottlenecks[0]
  assert.equal(result.changed, true)
  assert.deepEqual(bottleneck.nodeIds, ['MATH-NUM-FRACTION-DIV-RECIPROCAL'])
  assert.equal(bottleneck.candidateBottlenecks[0].bottleneckId, 'BN-FRACTION-DIV-RECIPROCAL-MISSING')
  assert.equal(bottleneck.candidateBottlenecks[0].evidenceStrength, 'high')
  assert.ok(bottleneck.recommendedResourceIds.includes('RES-BILI-FRACTION-DIV-001'))
  assert.ok(bottleneck.resourcePlan.some(resource => resource.role === '高质量锚点'))
  assert.ok(bottleneck.resourcePlan.some(resource => resource.role === '国内补充'))
  assert.match(bottleneck.nextActionText, /资源|重学|微验证/)
})

test('enriches decimal multiplication errors with decimal-point learning resources', () => {
  const result = enrichMathReport({
    _id: 'report-decimal',
    subject: 'math',
    status: 'completed',
    bottlenecks: [{
      lpCode: 'LP-003',
      lpName: '百分数/小数转换错误',
      severity: 'medium',
      errorCount: 1
    }],
    errorDetails: [{
      lpCode: 'LP-003',
      questionContent: '8.5 × 3.16',
      studentAnswer: '2.186',
      correctAnswer: '26.86'
    }]
  })

  const bottleneck = result.report.bottlenecks[0]
  assert.ok(bottleneck.nodeIds.includes('MATH-NUM-DEC-MUL-POINT'))
  assert.ok(
    bottleneck.candidateBottlenecks.some(item => item.bottleneckId === 'BN-DEC-MUL-POINT-COUNT')
  )
  assert.ok(bottleneck.recommendedResourceIds.includes('RES-BILI-DEC-MUL-001'))
})

test('does not enrich non-math reports', () => {
  const source = {
    _id: 'report-english',
    subject: 'english',
    bottlenecks: [{ lpCode: 'LP-201', lpName: '英语词汇' }]
  }
  const result = enrichMathReport(source)

  assert.equal(result.changed, false)
  assert.deepEqual(result.report.bottlenecks, source.bottlenecks)
})

test('rebuilt subject profile keeps fine bottleneck and resource fields', () => {
  const enriched = enrichMathReport({
    _id: 'report-fraction',
    subject: 'math',
    status: 'completed',
    type: 'diagnosis',
    evidenceTime: new Date('2026-06-10T00:00:00.000Z'),
    bottlenecks: [{
      lpCode: 'LP-002',
      lpName: '分数运算错误',
      severity: 'high',
      errorCount: 1,
      rootCause: '除以分数未转换成乘倒数'
    }],
    errorDetails: [{ lpCode: 'LP-002', questionContent: '6 ÷ 7/8' }]
  }).report

  const profile = rebuildProfileFromReports({ studentId: 'student-1', subject: 'math' }, [enriched])
  const current = profile.currentBottlenecks[0]

  assert.equal(profile.latestEffectiveReportId, 'report-fraction')
  assert.deepEqual(current.nodeIds, ['MATH-NUM-FRACTION-DIV-RECIPROCAL'])
  assert.equal(current.candidateBottlenecks[0].bottleneckId, 'BN-FRACTION-DIV-RECIPROCAL-MISSING')
  assert.ok(current.recommendedResourceIds.includes('RES-BILI-FRACTION-DIV-001'))
  assert.ok(profile.pendingBottlenecks[0].candidateBottlenecks.length > 0)
})

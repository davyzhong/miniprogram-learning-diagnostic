const test = require('node:test')
const assert = require('node:assert/strict')

const {
  mergeBatchResults
} = require('../cloudfunctions/analyzePhotos/pipeline')

test('photo analysis pipeline preserves math learning map fields when merging repeated bottlenecks', () => {
  const merged = mergeBatchResults([
    {
      success: true,
      data: {
        totalErrors: 1,
        bottlenecks: [{
          lpCode: 'LP-FD',
          lpName: '分数除法',
          severity: 'medium',
          errorCount: 1,
          nodeIds: ['MATH-NUM-FRACTION-DIV-RECIPROCAL'],
          candidateBottlenecks: [{
            bottleneckId: 'BN-FRACTION-DIV-RECIPROCAL-MISSING',
            title: '除以分数未稳定转换为乘倒数',
            evidenceStrength: 'medium',
            microValidationRequired: true,
            suggestedMicroValidation: ['6÷7/8'],
            recommendedResourceIds: ['RES-YT-FRACTION-DIV-001']
          }],
          evidenceStrength: 'medium',
          nextActionType: 'resourceReview',
          nextActionText: '先重学分数除法概念。',
          recommendedResourceIds: ['RES-YT-FRACTION-DIV-001']
        }]
      }
    },
    {
      success: true,
      data: {
        totalErrors: 1,
        bottlenecks: [{
          lpCode: 'LP-FD',
          lpName: '分数除法',
          severity: 'high',
          errorCount: 1,
          nodeIds: ['MATH-NUM-FRACTION-DIV-RECIPROCAL', 'MATH-NUM-FRACTION-MEANING'],
          candidateBottlenecks: [{
            bottleneckId: 'BN-FRACTION-DIV-RECIPROCAL-MISSING',
            title: '除以分数未稳定转换为乘倒数',
            evidenceStrength: 'high',
            suggestedMicroValidation: ['3÷2/5'],
            recommendedResourceIds: ['RES-BILI-FRACTION-DIV-001']
          }],
          evidenceStrength: 'high',
          recommendedResourceIds: ['RES-BILI-FRACTION-DIV-001']
        }]
      }
    }
  ])

  const bottleneck = merged.bottlenecks[0]
  assert.equal(bottleneck.errorCount, 2)
  assert.equal(bottleneck.severity, 'high')
  assert.deepEqual(bottleneck.nodeIds, [
    'MATH-NUM-FRACTION-DIV-RECIPROCAL',
    'MATH-NUM-FRACTION-MEANING'
  ])
  assert.equal(bottleneck.evidenceStrength, 'high')
  assert.deepEqual(bottleneck.recommendedResourceIds, [
    'RES-YT-FRACTION-DIV-001',
    'RES-BILI-FRACTION-DIV-001'
  ])
  assert.deepEqual(bottleneck.candidateBottlenecks[0].suggestedMicroValidation, ['6÷7/8', '3÷2/5'])
  assert.deepEqual(bottleneck.candidateBottlenecks[0].recommendedResourceIds, [
    'RES-YT-FRACTION-DIV-001',
    'RES-BILI-FRACTION-DIV-001'
  ])
})

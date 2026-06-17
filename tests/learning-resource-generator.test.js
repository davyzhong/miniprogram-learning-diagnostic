const test = require('node:test')
const assert = require('node:assert/strict')

const {
  buildResourcePackDraft,
  buildPracticeItems,
  normalizeResourcePackTarget
} = require('../cloudfunctions/learningResource/resource-pack-generator')

test('buildResourcePackDraft creates child-facing blocks from a fine math bottleneck', () => {
  const pack = buildResourcePackDraft({
    studentId: 'student-1',
    subject: 'math',
    sourceReportId: 'report-1',
    target: {
      bottleneckId: 'BN-DEC-MUL-POINT-COUNT',
      lpCode: 'LP-001',
      title: '小数乘法中积的小数位数判断错误',
      nodeId: 'MATH-NUM-DEC-MUL-POINT',
      categoryPath: ['计算基础', '小数乘法', '小数点定位'],
      symptomPatterns: ['数字乘积正确，但小数点位置错误'],
      repairStrategy: ['先统计两个因数的小数位数', '再用估算检查结果数量级']
    },
    resources: [
      {
        resourceId: 'RES-KHAN-DEC-MUL-001',
        displayTitle: '小数乘法示例',
        platform: 'Khan Academy',
        url: 'https://example.com/khan',
        role: '家长参考'
      }
    ]
  })

  assert.equal(pack.subject, 'math')
  assert.equal(pack.status, 'ready')
  assert.equal(pack.title, '小数乘法中积的小数位数判断错误')
  assert.equal(pack.blocks[0].type, 'summary')
  assert.ok(pack.blocks.some(block => block.type === 'concept'))
  assert.ok(pack.blocks.some(block => block.type === 'worked_example'))
  assert.ok(pack.blocks.some(block => block.type === 'common_mistake'))
  assert.ok(pack.blocks.some(block => block.type === 'practice'))
  assert.equal(pack.externalResources.length, 1)
  assert.equal(pack.practiceItems.length, 3)
})

test('buildPracticeItems keeps first version short and card-point-specific', () => {
  const items = buildPracticeItems({
    target: {
      bottleneckId: 'BN-DEC-MUL-POINT-COUNT',
      title: '小数乘法中积的小数位数判断错误'
    }
  })

  assert.equal(items.length, 3)
  assert.ok(items.every(item => item.question && item.answer))
  assert.ok(items.every(item => item.targetId === 'BN-DEC-MUL-POINT-COUNT'))
})

test('normalizeResourcePackTarget preserves legacy LP code fallback', () => {
  const target = normalizeResourcePackTarget({
    lpCode: 'LP-008',
    lpName: '审题理解'
  })

  assert.equal(target.targetId, 'LP-008')
  assert.equal(target.lpCode, 'LP-008')
  assert.equal(target.title, '审题理解')
})

const test = require('node:test')
const assert = require('node:assert/strict')

const {
  buildVerificationPack,
  decorateQuestionsWithPack,
  inferTargetType,
  pageCodeOf
} = require('../cloudfunctions/generatePaper/verification-pack')

test('buildVerificationPack paginates many fine bottlenecks by printable page capacity', () => {
  const targets = Array.from({ length: 12 }, (_, index) => ({
    targetId: `BN-FINE-${index + 1}`,
    targetType: 'fine_bottleneck',
    displayName: `细分卡点 ${index + 1}`,
    lpCode: 'LP-001',
    weight: 80 - index
  }))

  const pack = buildVerificationPack({
    subject: 'math',
    paperCode: 'MATH-20260616-01',
    paperDate: '2026-06-16',
    targets
  })

  assert.equal(pack.packId, 'VPK-MATH-20260616-01')
  assert.equal(pack.totalTargets, 12)
  assert.ok(pack.pages.length > 1)
  assert.ok(pack.pages.every(page => page.targetIds.length <= 4))
  assert.equal(pack.pages[0].pageCode, 'MATH-V-20260616-01-P01')
  assert.deepEqual(pack.pages[0].targetIds, ['BN-FINE-1', 'BN-FINE-2', 'BN-FINE-3', 'BN-FINE-4'])
})

test('buildVerificationPack uses larger concrete-review pages for chinese item targets', () => {
  const targets = Array.from({ length: 10 }, (_, index) => ({
    itemId: `CHI-WORD-${index + 1}`,
    targetType: 'chinese_error_item',
    targetText: `易错字 ${index + 1}`,
    relatedLpCode: 'LP-101',
    weight: index
  }))

  const pack = buildVerificationPack({
    subject: 'chinese',
    paperCode: 'CHI-20260616-02',
    paperDate: '2026-06-16',
    targets
  })

  assert.equal(pack.totalTargets, 10)
  assert.deepEqual(pack.pages.map(page => page.targetIds.length), [8, 2])
  assert.equal(pack.pages[1].pageCode, 'CHI-V-20260616-02-P02')
})

test('buildVerificationPack preserves hierarchy scheduled pages', () => {
  const pack = buildVerificationPack({
    subject: 'math',
    paperCode: 'MATH-20260617-01',
    paperDate: '2026-06-17',
    targets: [
      {
        targetId: 'BN-DEC-MUL-POINT-COUNT',
        displayName: '小数乘法中积的小数位数判断错误',
        nodeId: 'MATH-NUM-DEC-MUL-POINT',
        weight: 90
      },
      {
        targetId: 'BN-DEC-MUL-POINT-ESTIMATE',
        displayName: '小数乘法后缺少数量级估算检查',
        nodeId: 'MATH-NUM-DEC-MUL-POINT',
        weight: 80
      }
    ],
    targetPlan: {
      strategy: 'hierarchy_pages_v1',
      pages: [{
        pageType: 'same_family',
        categoryId: 'MATH-CAT-CALC-RULE',
        categoryTitle: '计算规则',
        familyIds: ['MATH-FAM-DECIMAL-POINT'],
        familyTitle: '小数点定位与移动',
        nodeIds: ['MATH-NUM-DEC-MUL-POINT'],
        targetIds: ['BN-DEC-MUL-POINT-COUNT', 'BN-DEC-MUL-POINT-ESTIMATE'],
        targetNames: ['小数乘法中积的小数位数判断错误', '小数乘法后缺少数量级估算检查']
      }]
    }
  })

  assert.equal(pack.scheduleStrategy, 'hierarchy_pages_v1')
  assert.equal(pack.pages.length, 1)
  assert.equal(pack.pages[0].pageType, 'same_family')
  assert.equal(pack.pages[0].categoryTitle, '计算规则')
  assert.deepEqual(pack.pages[0].familyIds, ['MATH-FAM-DECIMAL-POINT'])
  assert.deepEqual(pack.pages[0].nodeIds, ['MATH-NUM-DEC-MUL-POINT'])
  assert.deepEqual(pack.pages[0].targetIds, ['BN-DEC-MUL-POINT-COUNT', 'BN-DEC-MUL-POINT-ESTIMATE'])
})

test('decorateQuestionsWithPack adds stable page and target metadata to generated questions', () => {
  const pack = buildVerificationPack({
    subject: 'math',
    paperCode: 'MATH-20260616-01',
    paperDate: '2026-06-16',
    targets: [
      { targetId: 'BN-FINE-1', displayName: '小数点定位不稳', weight: 100 },
      { targetId: 'BN-FINE-2', displayName: '分数通分不稳', weight: 90 },
      { targetId: 'BN-FINE-3', displayName: '面积单位换算不稳', weight: 80 },
      { targetId: 'BN-FINE-4', displayName: '百分数互化不稳', weight: 70 }
    ]
  })

  const { questions, pack: decoratedPack } = decorateQuestionsWithPack([
    { lpCode: 'BN-FINE-1', stem: '题 1' },
    { targetId: 'BN-FINE-4', stem: '题 2', questionRole: 'transfer' }
  ], pack)

  // 4 个 target，每页 4 个 → 全在第 1 页
  assert.deepEqual(questions.map(question => question.pageCode), [
    'MATH-V-20260616-01-P01',
    'MATH-V-20260616-01-P01'
  ])
  assert.deepEqual(questions.map(question => question.questionId), [
    'MATH-V-20260616-01-P01-Q01',
    'MATH-V-20260616-01-P01-Q02'
  ])
  assert.deepEqual(questions.map(question => question.targetType), ['fine_bottleneck', 'fine_bottleneck'])
  assert.equal(questions[0].questionRole, 'core')
  assert.equal(questions[1].questionRole, 'transfer')
  assert.deepEqual(decoratedPack.pages.map(page => page.questionIds), [
    ['MATH-V-20260616-01-P01-Q01', 'MATH-V-20260616-01-P01-Q02']
  ])
})

test('pageCodeOf and inferTargetType keep generated metadata readable and deterministic', () => {
  assert.equal(pageCodeOf({
    subject: 'math',
    paperDate: '2026-06-16',
    sequence: '03',
    pageIndex: 4
  }), 'MATH-V-20260616-03-P04')
  assert.equal(inferTargetType('BN-FINE-1'), 'fine_bottleneck')
  assert.equal(inferTargetType('MATH-NUM-DEC-MUL-POINT'), 'knowledge_node')
  assert.equal(inferTargetType('CHI-WORD-BIANLUN'), 'chinese_error_item')
  assert.equal(inferTargetType('LP-001'), 'legacy_bottleneck')
})

// 内容深度验收测试：学习任务包草稿必须包含丰富的结构化内容
//
// 验证 Fix 1-4 的设计目标：
//   1. buildResourcePackDraft 用 taxonomy seed 数据填充 6 个板块（不再只有标题+模板）
//   2. 每个 block 的 body/steps/questions 都有实质内容（非空、非模板话术）
//   3. 练习题从 taxonomy 的 sourceEvidence + microValidationRules 生成（非空泛"说一说"）
//   4. taxonomyEnhanced 标记正确
//   5. 未知 bottleneckId 降级到通用模板（不崩溃）

const test = require('node:test')
const assert = require('node:assert/strict')

const {
  buildResourcePackDraft,
  buildPracticeItems,
  buildPracticeFromTaxonomy,
  loadTaxonomy
} = require('../cloudfunctions/learningResource/resource-pack-generator')

// === 1. taxonomy 能加载（本地环境有 seed 文件）===
test('loadTaxonomy 本地能加载到 28 个 BN 卡点', () => {
  const taxonomy = loadTaxonomy()
  assert.ok(taxonomy, '本地环境 taxonomy 必须能加载')
  const keys = Object.keys(taxonomy)
  assert.ok(keys.length >= 20, `至少 20 个 BN，实际 ${keys.length}`)
  assert.ok(taxonomy['BN-DEC-MUL-POINT-COUNT'], 'BN-DEC-MUL-POINT-COUNT 必须存在')
})

// === 2. 草稿有 6 个结构化板块 ===
test('buildResourcePackDraft 生成 6 个结构化板块', () => {
  const draft = buildResourcePackDraft({
    studentId: 's1',
    subject: 'math',
    target: { bottleneckId: 'BN-DEC-MUL-POINT-COUNT', lpCode: 'LP-FD', title: '小数乘法中积的小数位数判断错误' }
  })
  assert.equal(draft.blocks.length, 6, '必须有 6 个板块')
  const types = draft.blocks.map(b => b.type)
  assert.deepEqual(types, ['summary', 'concept', 'worked_example', 'common_mistake', 'practice', 'mastery_check'])
})

// === 3. taxonomy 数据被正确填充到各板块 ===
test('buildResourcePackDraft 用 taxonomy 的 symptomPatterns 填充 concept 板块', () => {
  const draft = buildResourcePackDraft({
    studentId: 's1',
    subject: 'math',
    target: { bottleneckId: 'BN-DEC-MUL-POINT-COUNT', title: '小数位数判断错误' }
  })
  const conceptBlock = draft.blocks.find(b => b.type === 'concept')
  const taxonomy = loadTaxonomy()
  const bn = taxonomy['BN-DEC-MUL-POINT-COUNT']
  // concept body 应包含 taxonomy 的症状模式
  assert.ok(conceptBlock.body.length > 20, 'concept body 必须有实质内容')
  if (bn.symptomPatterns && bn.symptomPatterns.length > 0) {
    assert.ok(conceptBlock.body.includes(bn.symptomPatterns[0]), 'concept body 必须包含 taxonomy 的症状模式')
  }
})

test('buildResourcePackDraft 用 taxonomy 的 repairStrategy 填充 worked_example steps', () => {
  const draft = buildResourcePackDraft({
    studentId: 's1',
    subject: 'math',
    target: { bottleneckId: 'BN-DEC-MUL-POINT-COUNT', title: '小数位数判断错误' }
  })
  const workedExample = draft.blocks.find(b => b.type === 'worked_example')
  const taxonomy = loadTaxonomy()
  const bn = taxonomy['BN-DEC-MUL-POINT-COUNT']
  assert.ok(workedExample.question, 'worked_example 必须有 question')
  assert.ok(workedExample.steps.length >= 1, 'worked_example 必须有 steps')
  if (bn.repairStrategy && bn.repairStrategy.length > 0) {
    assert.ok(workedExample.steps.includes(bn.repairStrategy[0]), 'steps 必须包含 taxonomy 的修复策略')
  }
})

test('buildResourcePackDraft 用 taxonomy 的 masteryEvidence 填充 mastery_check', () => {
  const draft = buildResourcePackDraft({
    studentId: 's1',
    subject: 'math',
    target: { bottleneckId: 'BN-DEC-MUL-POINT-COUNT', title: '小数位数判断错误' }
  })
  const mastery = draft.blocks.find(b => b.type === 'mastery_check')
  const taxonomy = loadTaxonomy()
  const bn = taxonomy['BN-DEC-MUL-POINT-COUNT']
  assert.ok(mastery.body.length > 10, 'mastery_check body 必须有实质内容')
  if (bn.masteryEvidence && bn.masteryEvidence.length > 0) {
    assert.ok(mastery.body.includes(bn.masteryEvidence[0]), 'mastery body 必须包含 taxonomy 的达标证据')
  }
})

test('buildResourcePackDraft common_mistake 三行对比都有内容', () => {
  const draft = buildResourcePackDraft({
    studentId: 's1',
    subject: 'math',
    target: { bottleneckId: 'BN-DEC-MUL-POINT-COUNT', title: '小数位数判断错误' }
  })
  const mistake = draft.blocks.find(b => b.type === 'common_mistake')
  assert.ok(mistake.mistake, 'common_mistake.mistake 必须非空')
  assert.ok(mistake.correction, 'common_mistake.correction 必须非空')
  assert.ok(mistake.explanation, 'common_mistake.explanation 必须非空')
})

// === 4. 练习题从 taxonomy 的 sourceEvidence + microValidationRules 生成 ===
test('buildPracticeItems 用 taxonomy 的 sourceEvidence 生成针对性练习题', () => {
  const taxonomy = loadTaxonomy()
  const bn = taxonomy['BN-DEC-MUL-POINT-COUNT']
  const items = buildPracticeItems({
    target: { bottleneckId: 'BN-DEC-MUL-POINT-COUNT', targetId: 'BN-DEC-MUL-POINT-COUNT', title: '小数位数' }
  })
  assert.equal(items.length, 3, '必须有 3 道练习题')
  // 第一题应该用 sourceEvidence 的真实错例
  if (bn.sourceEvidence && bn.sourceEvidence.length > 0) {
    assert.ok(items[0].question.includes(bn.sourceEvidence[0]), '第 1 题应包含真实错例')
  }
  // 每题都要有 explanation
  for (const item of items) {
    assert.ok(item.explanation, `练习题 ${item.questionId} 必须有 explanation`)
    assert.ok(item.question, `练习题 ${item.questionId} 必须有 question`)
    assert.ok(item.answer, `练习题 ${item.questionId} 必须有 answer`)
  }
})

test('buildPracticeItems 不再用空泛的"说一说"模板（当 taxonomy 可用时）', () => {
  const items = buildPracticeItems({
    target: { bottleneckId: 'BN-DEC-MUL-POINT-COUNT', targetId: 'BN-DEC-MUL-POINT-COUNT', title: '小数位数' }
  })
  // 不应出现"用自己的话说一说"这种空泛模板
  for (const item of items) {
    assert.ok(!/用自己的话说一说/.test(item.question), `题目不应是空泛模板: ${item.question}`)
  }
})

// === 5. taxonomyEnhanced 标记 ===
test('buildResourcePackDraft 标记 taxonomyEnhanced=true（当 BN 在 taxonomy 中时）', () => {
  const draft = buildResourcePackDraft({
    studentId: 's1',
    subject: 'math',
    target: { bottleneckId: 'BN-DEC-MUL-POINT-COUNT', title: '小数位数' }
  })
  assert.equal(draft.taxonomyEnhanced, true, '已知 BN 必须标记 taxonomyEnhanced=true')
})

test('buildResourcePackDraft 标记 taxonomyEnhanced=false（当 BN 不在 taxonomy 中时）', () => {
  const draft = buildResourcePackDraft({
    studentId: 's1',
    subject: 'math',
    target: { bottleneckId: 'BN-UNKNOWN-XXX', title: '未知卡点' }
  })
  assert.equal(draft.taxonomyEnhanced, false, '未知 BN 应标记 taxonomyEnhanced=false')
  // 降级到模板但不应崩溃
  assert.equal(draft.blocks.length, 6, '降级时仍应有 6 个板块')
})

// === 6. 多个 BN 验证（不只测一个）===
test('buildResourcePackDraft 对多个不同 BN 都能生成丰富内容', () => {
  const taxonomy = loadTaxonomy()
  const testBnIds = ['BN-FRACTION-ADD-DENOM-MISMATCH', 'BN-INT-MUL-PARTIAL-OMIT', 'BN-DEC-PLACE-VALUE-WEAK']
  for (const bnId of testBnIds) {
    if (!taxonomy[bnId]) continue
    const draft = buildResourcePackDraft({
      studentId: 's1',
      subject: 'math',
      target: { bottleneckId: bnId, title: taxonomy[bnId].title }
    })
    assert.equal(draft.taxonomyEnhanced, true, `${bnId} 应标记 taxonomyEnhanced`)
    const concept = draft.blocks.find(b => b.type === 'concept')
    assert.ok(concept.body.length > 30, `${bnId} 的 concept body 必须丰富（>30字）`)
    const practice = draft.blocks.find(b => b.type === 'practice')
    assert.equal(practice.questions.length, 3, `${bnId} 必须有 3 道练习题`)
  }
})

// === 7. buildPracticeFromTaxonomy 单元测试 ===
test('buildPracticeFromTaxonomy 用 sourceEvidence 生成 3 题', () => {
  const taxonomy = loadTaxonomy()
  const bn = taxonomy['BN-DEC-MUL-POINT-COUNT']
  const items = buildPracticeFromTaxonomy(bn, { targetId: 'BN-DEC-MUL-POINT-COUNT', title: '小数位数' })
  assert.equal(items.length, 3)
  assert.ok(items[0].questionId.endsWith('-P01'))
  assert.ok(items[1].questionId.endsWith('-P02'))
  assert.ok(items[2].questionId.endsWith('-P03'))
})

test('buildPracticeFromTaxonomy 无 sourceEvidence 时降级但不崩溃', () => {
  const items = buildPracticeFromTaxonomy(
    { microValidationRules: ['规则1'], masteryEvidence: ['证据1'] },
    { targetId: 'BN-X', title: '卡点X' }
  )
  assert.equal(items.length, 3)
  assert.ok(items[0].question, '降级时第 1 题仍应有 question')
})

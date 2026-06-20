const test = require('node:test')
const assert = require('node:assert/strict')

const {
  buildLearningResourceView,
  extractBlocks
} = require('../miniprogram/pages/learning-resource/learning-resource-presenter')

test('buildLearningResourceView renders pack blocks and actions', () => {
  const view = buildLearningResourceView({
    _id: 'pack-1',
    title: '小数乘法中积的小数位数判断错误',
    estimatedMinutes: 8,
    blocks: [
      { type: 'summary', title: '这个卡点是什么', body: '小数点定位' },
      { type: 'concept', title: '为什么会这样错', body: '症状1\n根因1' },
      { type: 'worked_example', title: '正确的解题路径', question: '2.4 × 1.5 =', steps: ['步骤1', '步骤2'] },
      { type: 'common_mistake', title: '容易踩的坑', mistake: '错误做法', correction: '正确做法', explanation: '判断方法' },
      {
        type: 'practice',
        title: '练三道',
        questions: [{ question: '2.4 × 1.5 =', answer: '3.6', explanation: '解题关键' }]
      },
      { type: 'mastery_check', title: '怎么算学会了', body: '3 道变式题全对' }
    ],
    externalResources: [{ title: '小数乘法示例', platform: 'Khan Academy' }]
  })

  assert.equal(view.title, '小数乘法中积的小数位数判断错误')
  assert.equal(view.timeText, '约 8 分钟')
  assert.equal(view.practiceCount, 1)
  assert.equal(view.parentResourceText, '家长参考 1 个')
  // 结构化板块全部产出
  assert.ok(view.summaryBlock, '必须有 summaryBlock')
  assert.ok(view.conceptBlock, '必须有 conceptBlock')
  assert.ok(view.workedExampleBlock, '必须有 workedExampleBlock')
  assert.ok(view.commonMistakeBlock, '必须有 commonMistakeBlock')
  assert.ok(view.practiceBlock, '必须有 practiceBlock')
  assert.ok(view.masteryBlock, '必须有 masteryBlock')
  // worked_example 的 question 字段必须产出
  assert.equal(view.workedExampleBlock.question, '2.4 × 1.5 =')
  assert.equal(view.workedExampleBlock.steps.length, 2)
  // common_mistake 的三行对比必须产出
  assert.equal(view.commonMistakeBlock.mistake, '错误做法')
  assert.equal(view.commonMistakeBlock.correction, '正确做法')
  assert.equal(view.commonMistakeBlock.explanation, '判断方法')
  // practice 的 explanation 必须产出
  assert.equal(view.practiceBlock.questions[0].explanation, '解题关键')
  assert.ok(view.hasContent, 'hasContent 必须为 true')
})

test('buildLearningResourceView handles empty pack safely', () => {
  const view = buildLearningResourceView()

  assert.equal(view.title, '学习任务包')
  assert.equal(view.timeText, '5-10 分钟')
  assert.equal(view.practiceCount, 0)
  assert.equal(view.parentResourceText, '')
  assert.equal(view.canComplete, true)
  assert.equal(view.completed, false)
  assert.equal(view.hasContent, false, '空 pack 的 hasContent 必须为 false')
})

test('extractBlocks 把 blocks 数组拆成结构化字段', () => {
  const extracted = extractBlocks([
    { type: 'summary', title: 'A', body: 'a' },
    { type: 'practice', title: 'B', questions: [] },
    { type: 'mastery_check', title: 'C', body: 'c' },
  ])
  assert.equal(extracted.summaryBlock.title, 'A')
  assert.equal(extracted.practiceBlock.title, 'B')
  assert.equal(extracted.masteryBlock.title, 'C')
  assert.equal(extracted.conceptBlock, null, '不存在的板块返回 null')
  assert.equal(extracted.workedExampleBlock, null)
  assert.equal(extracted.commonMistakeBlock, null)
})

test('buildLearningResourceView practiceCount 安全处理无 questions 的 practice block', () => {
  const view = buildLearningResourceView({
    blocks: [{ type: 'practice', title: '练三道' /* 无 questions 字段 */ }]
  })
  assert.equal(view.practiceCount, 0, '无 questions 时 practiceCount 应为 0')
  assert.ok(view.practiceBlock, 'practiceBlock 仍应存在')
})

test('practice questions 默认 revealed=false（答案折叠，鼓励先想再点开）', () => {
  const view = buildLearningResourceView({
    blocks: [{
      type: 'practice',
      title: '练三道',
      questions: [
        { questionId: 'P01', question: '2.4 × 1.5 =', answer: '3.6', explanation: '解题关键' },
        { questionId: 'P02', question: '0.24 × 1.5 =', answer: '0.36', explanation: '解题关键2' },
      ]
    }]
  })
  for (const q of view.practiceBlock.questions) {
    assert.equal(q.revealed, false, `题目 ${q.questionId} 的 revealed 必须默认 false`)
  }
})

test('extractBlocks 给无 questionId 的题目也安全加 revealed', () => {
  const extracted = extractBlocks([{
    type: 'practice',
    title: '练三道',
    questions: [{ question: '没 ID 的题', answer: '答' }]
  }])
  assert.equal(extracted.practiceBlock.questions[0].revealed, false, '无 questionId 时 revealed 仍应为 false')
})

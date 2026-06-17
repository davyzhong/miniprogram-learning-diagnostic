const test = require('node:test')
const assert = require('node:assert/strict')

const {
  buildLearningResourceView
} = require('../miniprogram/pages/learning-resource/learning-resource-presenter')

test('buildLearningResourceView renders pack blocks and actions', () => {
  const view = buildLearningResourceView({
    _id: 'pack-1',
    title: '小数乘法中积的小数位数判断错误',
    estimatedMinutes: 8,
    blocks: [
      { type: 'summary', title: '今天补什么', body: '小数点定位' },
      {
        type: 'practice',
        title: '马上练 3 题',
        questions: [{ question: '2.4 × 1.5 =', answer: '3.6' }]
      }
    ],
    externalResources: [{ title: '小数乘法示例', platform: 'Khan Academy' }]
  })

  assert.equal(view.title, '小数乘法中积的小数位数判断错误')
  assert.equal(view.timeText, '约 8 分钟')
  assert.equal(view.blocks.length, 2)
  assert.equal(view.practiceCount, 1)
  assert.equal(view.parentResourceText, '家长参考 1 个')
})

test('buildLearningResourceView handles empty pack safely', () => {
  const view = buildLearningResourceView()

  assert.equal(view.title, '学习任务包')
  assert.equal(view.timeText, '5-10 分钟')
  assert.equal(view.practiceCount, 0)
  assert.equal(view.parentResourceText, '')
  assert.equal(view.canComplete, true)
  assert.equal(view.completed, false)
})

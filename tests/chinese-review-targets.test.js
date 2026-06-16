const test = require('node:test')
const assert = require('node:assert/strict')

const {
  selectChineseReviewTargets,
  buildChineseReviewPromptBlock
} = require('../cloudfunctions/generatePaper/chinese-review-targets')

test('selects chinese concrete review targets by related bottleneck code', () => {
  const targets = selectChineseReviewTargets({
    subject: 'chinese',
    chineseReviewItems: [
      {
        itemId: 'CHI-WORD-BIANLUN',
        itemType: 'word',
        targetText: '辩论',
        expectedAnswer: '辩论',
        lastWrongAnswer: '辨论',
        sourceContext: '看拼音写词语：biàn lùn',
        mistakeType: '形近字混淆',
        status: 'needs_review',
        relatedLpCode: 'LP-101',
        verificationMethods: ['pinyin_to_word', 'dictation']
      },
      {
        itemId: 'CHI-READ-001',
        itemType: 'reading_skill',
        targetText: '回原文找依据',
        expectedAnswer: '能引用原文依据',
        status: 'needs_review',
        relatedLpCode: 'LP-102'
      },
      {
        itemId: 'CHI-WORD-MASTERED',
        itemType: 'word',
        targetText: '陶醉',
        expectedAnswer: '陶醉',
        status: 'mastered',
        relatedLpCode: 'LP-101'
      }
    ]
  }, ['LP-101'], 5)

  assert.deepEqual(targets, [{
    itemId: 'CHI-WORD-BIANLUN',
    itemType: 'word',
    targetText: '辩论',
    expectedAnswer: '辩论',
    lastWrongAnswer: '辨论',
    sourceContext: '看拼音写词语：biàn lùn',
    mistakeType: '形近字混淆',
    relatedLpCode: 'LP-101',
    verificationMethods: ['pinyin_to_word', 'dictation']
  }])
})

test('builds a prompt block that requires direct retesting of original chinese items', () => {
  const block = buildChineseReviewPromptBlock([{
    itemId: 'CHI-POEM-SPRING',
    itemType: 'poem_line',
    targetText: '春风又绿江南岸',
    expectedAnswer: '春风又绿江南岸',
    lastWrongAnswer: '春风又到江南岸',
    sourceContext: '古诗默写《泊船瓜洲》',
    mistakeType: '诗句错字',
    relatedLpCode: 'LP-101',
    verificationMethods: ['poem_fill']
  }])

  assert.match(block, /语文错项复测目标/)
  assert.match(block, /春风又绿江南岸/)
  assert.match(block, /春风又到江南岸/)
  assert.match(block, /每个 targetText 至少直接考察一次/)
})

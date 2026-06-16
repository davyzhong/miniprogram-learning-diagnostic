const test = require('node:test')
const assert = require('node:assert/strict')

const seed = require('../data/english/zhong-qingyu-pep-vocabulary.seed.json')
const cloudSeed = require('../cloudfunctions/englishVocabulary/zhong-qingyu-pep-vocabulary.json')

function keyOf(word) {
  return [word.word, word.grade, word.volume, word.unit].join('|')
}

test('Zhong Qingyu PEP English vocabulary seed is complete enough for dictation', () => {
  assert.equal(seed.studentName, '钟青羽')
  assert.equal(seed.subject, 'english')
  assert.equal(seed.wordCount, seed.words.length)
  assert.ok(seed.wordCount >= 500)
  assert.equal(seed.sources.length, 7)
  assert.deepEqual(seed.sources.map(item => `${item.grade}${item.volume}`), [
    '3上册',
    '3下册',
    '4上册',
    '4下册',
    '5上册',
    '5下册',
    '6上册'
  ])
})

test('Zhong Qingyu PEP English vocabulary seed has stable word identities and meanings', () => {
  const keys = seed.words.map(keyOf)
  assert.equal(new Set(keys).size, keys.length)
  assert.equal(seed.words.filter(word => !word.word || !word.unit || !word.meanings || !word.meanings[0]).length, 0)

  const byKey = new Map(seed.words.map(word => [keyOf(word), word]))
  assert.equal(byKey.get('science|6|上册|Unit 1').meanings[0], '科学')
  assert.equal(byKey.get('museum|6|上册|Unit 1').meanings[0], '博物馆')
  assert.equal(byKey.get('classroom|4|上册|Unit 1').meanings[0], '教室')
  assert.equal(byKey.get('january|5|下册|Unit 3').meanings[0], '一月')
  assert.equal(byKey.get('breakfast|4|下册|Unit 2').meanings[0], '早餐；早饭')
})

test('cloud function seed copy stays in sync with the project archive seed', () => {
  assert.equal(cloudSeed.wordCount, seed.wordCount)
  assert.deepEqual(cloudSeed.words.map(keyOf), seed.words.map(keyOf))
})

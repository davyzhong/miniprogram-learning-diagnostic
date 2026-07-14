const test = require('node:test')
const assert = require('node:assert/strict')

const {
  isInternalIdentifier,
  readableNameOf,
  sanitizeUserText,
  compactReadableTargets
} = require('../miniprogram/utils/user-facing-text')

test('detects internal identifiers without treating readable labels as IDs', () => {
  const internalIds = [
    'BN-DEC-DIV-POINT',
    'LP-001',
    'ERR-MATH-01',
    'NODE-MATH-01',
    'RES-BILI-001',
    'CHI-READ-01',
    'MATH-NUM-DEC-MUL-POINT',
    'PAGE-HOME',
    'TASK-PAGE-MATH-01',
    'VER-PAGE-01',
    'cloud://learning-prod.abc/file-id'
  ]

  for (const value of internalIds) {
    assert.equal(isInternalIdentifier(value), true, value)
  }

  assert.equal(isInternalIdentifier('数学-20260712-06'), false)
  assert.equal(isInternalIdentifier('MATH-20260613-01'), false)
  assert.equal(isInternalIdentifier('CHI-20260616-02'), false)
  assert.equal(isInternalIdentifier('小数除法'), false)
  assert.equal(isInternalIdentifier('MATH-NUM-DEC-DIV-POINT'), true)
  assert.equal(isInternalIdentifier('CHI-READ-01'), true)
})

test('only detects opaque cloud and document IDs in an explicit ID context', () => {
  const opaqueId = '665f8c1a2b3c4d5e6f708192'

  assert.equal(isInternalIdentifier(opaqueId), false)
  assert.equal(isInternalIdentifier(opaqueId, { treatAsId: true }), true)
  assert.equal(isInternalIdentifier('期末数学复习资料', { treatAsId: true }), false)
})

test('resolves known legacy bottlenecks and math knowledge nodes', () => {
  assert.equal(readableNameOf('LP-001'), '计算基础')
  assert.equal(readableNameOf('MATH-NUM-DEC-DIV-POINT'), '小数除法中的小数点移动')
  assert.equal(readableNameOf({ bottleneckId: 'BN-DEC-DIV-POINT-MOVE' }), '除数是小数时小数点移动规则不熟练')
  assert.equal(readableNameOf({ displayName: '单位换算', lpCode: 'LP-004' }), '单位换算')
  assert.equal(readableNameOf('数学-20260712-06'), '数学-20260712-06')
})

test('sanitizes mixed prose with a semantic count and intact Chinese punctuation', () => {
  assert.equal(
    sanitizeUserText('复测 BN-A、BN-B、BN-C。纸面作答后上传。', { count: 3, noun: '数学学习卡点' }),
    '复测 3 个数学学习卡点。纸面作答后上传。'
  )
  assert.equal(
    sanitizeUserText('先复习 LP-001，再完成练习。'),
    '先复习 计算基础，再完成练习。'
  )
  assert.equal(
    sanitizeUserText('复习 LP-001、LP-001。'),
    '复习 计算基础。'
  )
})

test('preserves human paper codes in user-facing prose', () => {
  assert.equal(
    sanitizeUserText('试卷 MATH-20260613-01、CHI-20260616-02。'),
    '试卷 MATH-20260613-01、CHI-20260616-02。'
  )
  assert.equal(
    sanitizeUserText('查看（CHI-20260616-02）。'),
    '查看（CHI-20260616-02）。'
  )
})

test('removes dangling list punctuation after sanitizing identifier runs', () => {
  assert.equal(
    sanitizeUserText('复测 BN-A、BN-B、。', { count: 2 }),
    '复测 2 个学习卡点。'
  )
})

test('compacts at most three unique readable target names with a reliable total', () => {
  assert.equal(
    compactReadableTargets(['BN-A', { displayName: '小数除法' }, { title: '单位换算' }], { totalCount: 3 }),
    '小数除法、单位换算等 3 个学习卡点'
  )
  assert.equal(
    compactReadableTargets(['LP-001', 'LP-004', 'LP-001']),
    '计算基础、单位换算'
  )
  assert.equal(
    compactReadableTargets(['BN-A', 'BN-B'], { totalCount: 2 }),
    '2 个学习卡点'
  )
  assert.equal(
    compactReadableTargets(['小数除法', '单位换算', '分数运算', '几何概念'], { totalCount: 4 }),
    '小数除法、单位换算、分数运算等 4 个学习卡点'
  )
})

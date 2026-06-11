const test = require('node:test')
const assert = require('node:assert/strict')

const { buildSubjectHomeView } = require('../miniprogram/pages/subject-home/subject-home-presenter')

const relative = () => '今天'

test('builds current diagnosis counts and recent changes from new fields', () => {
  const view = buildSubjectHomeView({
    totalReports: 4,
    currentSummary: '应用题建模持续出现。',
    nextAction: '生成验证试卷',
    currentBottlenecks: [
      { lpCode: 'LP-001', lpName: '应用题建模', status: 'persisting' },
      { lpCode: 'LP-002', lpName: '分数运算', status: 'needs_verification' },
      { lpCode: 'LP-003', lpName: '单位换算', status: 'improved' }
    ]
  }, [{
    _id: 'report-1',
    status: 'completed',
    isEffective: true,
    profileAppliedAt: '2026-06-12',
    changeSummary: '发现分数运算卡点',
    createdAt: '2026-06-12'
  }], relative)

  assert.equal(view.currentSummary, '应用题建模持续出现。')
  assert.equal(view.persistingCount, 1)
  assert.equal(view.pendingCount, 1)
  assert.equal(view.improvedCount, 1)
  assert.equal(view.recentChanges[0].title, '发现分数运算卡点')
})

test('builds a compatible current diagnosis from legacy profile fields', () => {
  const view = buildSubjectHomeView({
    pendingBottlenecks: [{ lpCode: 'LP-001', lpName: '分数运算' }],
    improvedBottlenecks: [{ lpCode: 'LP-002', lpName: '单位换算' }]
  }, [], relative)

  assert.equal(view.currentBottlenecks[0].status, 'needs_verification')
  assert.equal(view.currentBottlenecks[1].status, 'improved')
  assert.equal(view.hasDiagnosis, true)
})

test('legacy completed reports fall back to comparison summary and summary', () => {
  const view = buildSubjectHomeView({}, [
    { _id: 'r1', status: 'completed', comparisonSummary: '单位换算已有改善', createdAt: '2026-06-12' },
    { _id: 'r2', status: 'completed', summary: '发现分数运算卡点', createdAt: '2026-06-11' }
  ], relative)

  assert.deepEqual(view.recentChanges.map(item => item.title), [
    '单位换算已有改善',
    '发现分数运算卡点'
  ])
})

test('empty profile exposes first-use state', () => {
  const view = buildSubjectHomeView({}, [], relative)

  assert.equal(view.hasDiagnosis, false)
  assert.equal(view.isFirstUse, true)
  assert.match(view.currentSummary, /第一份/)
})

const test = require('node:test')
const assert = require('node:assert/strict')

const { buildSubjectHomeView } = require('../miniprogram/pages/subject-home/subject-home-presenter')

const relative = () => '今天'

test('builds a subject workbench from current bottlenecks and latest reports', () => {
  const view = buildSubjectHomeView({
    totalReports: 4,
    currentBottlenecks: [
      { lpCode: 'LP-001', lpName: '计算错误（加减乘除）', status: 'needs_verification', errorCount: 4, severity: 'medium' },
      { lpCode: 'LP-008', lpName: '审题错误', status: 'persisting', relatedErrorCount: 2, severity: 'high' },
      { lpCode: 'LP-004', lpName: '单位换算错误', status: 'improved' }
    ]
  }, [{
    _id: 'report-1',
    status: 'completed',
    isEffective: true,
    changeSummary: '发现计算基础卡点',
    createdAt: '2026-06-12'
  }], relative, { subjectName: '数学' })

  assert.equal(view.subjectTitle, '数学工作台')
  assert.equal(view.primaryTask.actionType, 'verification')
  assert.equal(view.primaryTask.actionText, '生成验证试卷')
  assert.equal(view.primaryTask.summary, '2 个学习卡点等待验证，建议先做一张纸质验证卷。')
  assert.deepEqual(view.taskQueue.map(item => item.displayName), ['审题理解', '计算基础'])
  assert.deepEqual(view.taskQueue.map(item => item.evidenceText), ['最近 2 道相关错题', '最近 4 道相关错题'])
  assert.deepEqual(view.taskQueue.map(item => item.actionText), ['生成验证卷', '生成验证卷'])
  assert.equal(view.taskQueue[0].priorityText, '高优先级')
  assert.ok(view.taskQueue.every(item => item.status !== 'improved'))
  assert.deepEqual(view.tools.map(item => item.key), ['diagnosis', 'defaultPaper', 'history', 'latestReport'])
  assert.equal(view.latestReportId, 'report-1')
})

test('builds a compatible workbench from legacy profile fields', () => {
  const view = buildSubjectHomeView({
    pendingBottlenecks: [{ lpCode: 'LP-002', lpName: '分数运算错误', relatedErrorCount: 1 }],
    improvedBottlenecks: [{ lpCode: 'LP-004', lpName: '单位换算错误' }]
  }, [], relative, { subjectName: '数学' })

  assert.equal(view.hasDiagnosis, true)
  assert.equal(view.pendingCount, 1)
  assert.equal(view.improvedCount, 1)
  assert.deepEqual(view.taskQueue.map(item => item.displayName), ['分数运算'])
  assert.equal(view.taskQueue[0].evidenceText, '最近 1 道相关错题')
})

test('empty profile exposes a first-use workbench action', () => {
  const view = buildSubjectHomeView({}, [], relative, { subjectName: '数学' })

  assert.equal(view.hasDiagnosis, false)
  assert.equal(view.isFirstUse, true)
  assert.equal(view.primaryTask.actionType, 'diagnosis')
  assert.equal(view.primaryTask.actionText, '拍照诊断')
  assert.equal(view.taskQueue.length, 0)
  assert.deepEqual(view.tools.map(item => item.key), ['diagnosis', 'defaultPaper', 'history'])
})

test('English workbench uses vocabulary summary as the primary learning asset', () => {
  const view = buildSubjectHomeView({}, [], relative, {
    subject: 'english',
    subjectName: '英语',
    englishVocabulary: {
      summary: {
        totalWords: 320,
        familiarity: {
          masteredCount: 120,
          needsPracticeCount: 18,
          reviewingCount: 12,
          untestedCount: 170,
          dueReviewCount: 8
        },
        spelling: {
          masteredCount: 80,
          needsPracticeCount: 22,
          reviewingCount: 10,
          untestedCount: 208,
          dueReviewCount: 4
        },
        overall: {
          masteredCount: 70,
          partialCount: 180,
          untestedCount: 70
        }
      },
      patternCount: 42
    }
  })

  assert.equal(view.subjectTitle, '英语工作台')
  assert.equal(view.primaryTask.actionType, 'englishPractice')
  assert.equal(view.primaryTask.actionText, '开始单词熟悉度')
  assert.match(view.primaryTask.summary, /320 个个人词库单词/)
  assert.match(view.primaryTask.summary, /安排 20 个/)
  assert.equal(view.englishVocabularyStats.totalWords, 320)
  assert.equal(view.englishVocabularyStats.familiarityMasteredCount, 120)
  assert.equal(view.englishVocabularyStats.spellingNeedsPracticeCount, 22)
  assert.equal(view.englishVocabularyStats.overallMasteredCount, 70)
  assert.deepEqual(view.englishQuickStats.map(item => item.label), ['今日待练', '已熟悉', '拼写薄弱', '真正掌握'])
  assert.ok(view.tools.some(item => item.key === 'englishPractice'))
  assert.ok(view.tools.every(item => item.key !== 'diagnosis' && item.key !== 'defaultPaper'))
})

test('English workbench keeps familiarity entry visible before vocabulary is imported', () => {
  const view = buildSubjectHomeView({}, [], relative, {
    subject: 'english',
    subjectName: '英语',
    englishVocabulary: {
      summary: {
        totalWords: 0,
        needsPracticeCount: 0,
        reviewingCount: 0,
        masteredCount: 0,
        dueReviewCount: 0
      }
    }
  })

  assert.equal(view.subjectTitle, '英语工作台')
  assert.equal(view.primaryTask.actionType, 'importVocabulary')
  assert.equal(view.primaryTask.actionText, '导入个人词库')
  assert.match(view.primaryTask.summary, /个人词库还没有单词/)
  assert.ok(view.tools.some(item => item.key === 'importVocabulary'))
  assert.ok(view.tools.some(item => item.key === 'englishPractice'))
  assert.ok(view.tools.every(item => item.key !== 'diagnosis' && item.key !== 'defaultPaper'))
})

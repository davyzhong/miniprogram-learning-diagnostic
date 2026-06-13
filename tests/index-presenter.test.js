const test = require('node:test')
const assert = require('node:assert/strict')

const { buildLearningProfileHomeView } = require('../miniprogram/pages/index/index-presenter')

const relative = () => '今天'

test('learning profile home summarizes a math-only diagnosis', () => {
  const view = buildLearningProfileHomeView({
    student: { _id: 'student-1', name: '钟青羽', grade: 6 },
    profiles: [{
      subject: 'math',
      subjectName: '数学',
      totalReports: 1,
      updatedAt: '2026-06-12T14:20:00+08:00',
      currentBottlenecks: [
        { lpCode: 'LP-001', lpName: '计算错误（加减乘除）', status: 'needs_verification' },
        { lpCode: 'LP-008', lpName: '审题错误', status: 'needs_verification' }
      ]
    }, {
      subject: 'chinese',
      subjectName: '语文',
      totalReports: 0,
      currentBottlenecks: []
    }, {
      subject: 'english',
      subjectName: '英语',
      totalReports: 0,
      currentBottlenecks: []
    }],
    reports: [{
      _id: 'report-1',
      subject: 'math',
      type: 'diagnosis',
      status: 'completed',
      isEffective: true,
      createdAt: '2026-06-12T14:20:00+08:00',
      imageFiles: [{ fileID: 'cloud://a' }, { fileID: 'cloud://b' }],
      bottlenecks: [
        { lpCode: 'LP-001', lpName: '计算错误（加减乘除）' },
        { lpCode: 'LP-008', lpName: '审题错误' }
      ]
    }],
    papers: []
  }, relative)

  assert.equal(view.studentName, '钟青羽')
  assert.equal(view.gradeText, '6年级')
  assert.equal(view.headline, '数学学习线索已形成，其他学科仍待补充样本')
  assert.equal(view.sampleCoverageText, '样本覆盖：已分析数学试卷；语文、英语暂无有效诊断记录。')
  assert.deepEqual(view.metrics.map(item => [item.label, item.value]), [
    ['待验证', '2'],
    ['有效报告', '1'],
    ['最近更新', '今天']
  ])
  assert.equal(view.priorityHighlights[0].title, '数学有 2 个学习卡点待验证')
  assert.equal(view.priorityHighlights[0].summary, '重点关注：计算基础、审题理解')
  assert.equal(view.priorityHighlights[0].actionText, '进入数学工作台')
  assert.equal(view.recentRecords[0].kind, 'diagnosis-report')
  assert.equal(view.recentRecords[0].title, '数学诊断报告')
  assert.equal(view.recentRecords[0].summary, '今天 · 发现 2 条学习观察')
  assert.equal(view.recentRecords[0].metaText, '关注 计算基础、审题理解 · 诊断结果')
  assert.equal(view.nextAction.primaryText, '生成验证试卷')
  assert.deepEqual(view.subjects.map(item => [item.name, item.statusText]), [
    ['数学', '已有观察'],
    ['语文', '待采样'],
    ['英语', '待采样']
  ])
  assert.equal(view.isEmpty, false)
})

test('learning profile home exposes an empty first-use state', () => {
  const view = buildLearningProfileHomeView({
    student: { _id: 'student-1', name: '钟青羽', grade: 6 },
    profiles: [
      { subject: 'math', totalReports: 0, updatedAt: '2026-06-12T10:00:00+08:00', currentBottlenecks: [] },
      { subject: 'chinese', totalReports: 0, updatedAt: '2026-06-12T10:00:00+08:00', currentBottlenecks: [] },
      { subject: 'english', totalReports: 0, updatedAt: '2026-06-12T10:00:00+08:00', currentBottlenecks: [] }
    ],
    reports: [],
    papers: []
  }, relative)

  assert.equal(view.headline, '还没有形成有效学习观察')
  assert.equal(view.sampleCoverageText, '样本覆盖：暂无有效诊断记录。')
  assert.deepEqual(view.subjects.map(item => item.statusText), ['待采样', '待采样', '待采样'])
  assert.equal(view.nextAction.primaryText, '上传第一份试卷')
  assert.equal(view.metrics.some(item => item.label === '已改善'), false)
  assert.equal(view.isEmpty, false)
})

test('learning profile home shows improvement metric only when improvement exists', () => {
  const view = buildLearningProfileHomeView({
    student: { _id: 'student-1', name: '钟青羽', grade: 6 },
    profiles: [{
      subject: 'math',
      subjectName: '数学',
      totalReports: 2,
      updatedAt: '2026-06-12T14:20:00+08:00',
      currentBottlenecks: [
        { lpCode: 'LP-001', lpName: '计算错误（加减乘除）', status: 'improved' }
      ]
    }],
    reports: [
      { _id: 'report-1', subject: 'math', type: 'diagnosis', status: 'completed', createdAt: '2026-06-11T10:00:00+08:00' },
      { _id: 'report-2', subject: 'math', type: 'verification', status: 'completed', createdAt: '2026-06-12T14:20:00+08:00' }
    ],
    papers: []
  }, relative)

  assert.equal(view.headline, '近期验证显示部分学习观察已有改善')
  assert.ok(view.metrics.some(item => item.label === '已改善' && item.value === '1'))
  assert.equal(view.priorityHighlights[0].statusText, '已有改善')
  assert.equal(view.nextAction.primaryText, '上传新试卷')
})

test('learning profile recent records include generated verification papers in time order', () => {
  const view = buildLearningProfileHomeView({
    student: { _id: 'student-1', name: '钟青羽', grade: 6 },
    profiles: [{
      subject: 'math',
      totalReports: 1,
      currentBottlenecks: [{ lpCode: 'LP-001', status: 'needs_verification' }]
    }],
    reports: [{
      _id: 'report-1',
      subject: 'math',
      type: 'diagnosis',
      status: 'completed',
      isEffective: true,
      createdAt: '2026-06-11T10:00:00+08:00',
      bottlenecks: [{ lpCode: 'LP-001' }]
    }],
    papers: [{
      _id: 'paper-1',
      subject: 'math',
      type: 'verification',
      paperDisplayCode: '数学-20260611-01',
      createdAt: '2026-06-11T11:00:00+08:00',
      questions: [{}, {}, {}],
      bottleneckSummaries: ['计算基础'],
      totalPages: 2
    }]
  }, relative)

  assert.equal(view.recentRecords[0].kind, 'verification-paper')
  assert.equal(view.recentRecords[0].title, '数学验证试卷')
  assert.equal(view.recentRecords[0].summary, '今天 · 编号 数学-20260611-01 · 3 题 · 覆盖 计算基础')
  assert.equal(view.recentRecords[1].kind, 'diagnosis-report')
})

test('learning profile recent records suppress default diagnostic papers', () => {
  const view = buildLearningProfileHomeView({
    student: { _id: 'student-1', name: '钟青羽', grade: 6 },
    profiles: [{
      subject: 'math',
      totalReports: 1,
      currentBottlenecks: [{ lpCode: 'LP-001', status: 'needs_verification' }]
    }],
    reports: [],
    papers: [{
      _id: 'default-paper',
      subject: 'math',
      type: 'default-diagnosis',
      createdAt: '2026-06-11T09:00:00+08:00'
    }, {
      _id: 'paper-1',
      subject: 'math',
      type: 'verification',
      paperDisplayCode: '数学-20260611-01',
      createdAt: '2026-06-11T11:00:00+08:00',
      questions: [{}, {}],
      bottleneckSummaries: ['计算基础']
    }]
  }, relative)

  assert.equal(view.recentRecords.some(record => record.paperId === 'default-paper'), false)
  assert.equal(view.recentRecords.some(record => record.paperId === 'paper-1'), true)
  assert.equal(view.recentRecords[0].paperCode, '数学-20260611-01')
})

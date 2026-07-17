const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')

const ROOT = path.resolve(__dirname, '..')

const {
  buildBottleneckViews,
  buildConfidence,
  CONFIDENCE_LABELS
} = require('../miniprogram/utils/bottleneck-view')
const { buildSubjectBottleneckViews } = require('../miniprogram/pages/subject-home/subject-home-presenter')
const { buildLearningProfileHomeView } = require('../miniprogram/pages/index/index-presenter')

function read(relativePath) {
  return fs.readFileSync(path.join(ROOT, relativePath), 'utf8')
}

const INTERNAL_CODE = /^(LP|BN|CHI|ERR|MATH)-/

test('buildConfidence thresholds: weight>=75 high, 45-74 medium, <45 low', () => {
  assert.deepEqual(
    [buildConfidence({ weight: 75 }), buildConfidence({ weight: 45 }), buildConfidence({ weight: 44 })]
      .map(item => [item.label, item.dots, item.level]),
    [
      [CONFIDENCE_LABELS.high, '●●●', 'high'],
      [CONFIDENCE_LABELS.medium, '●●○', 'medium'],
      [CONFIDENCE_LABELS.low, '●○○', 'low']
    ]
  )
})

test('bottleneck views carry the unified confidence structure instead of weight/priority text', () => {
  const views = buildBottleneckViews([
    { lpCode: 'LP-001', status: 'persisting', trend: 'persisting', weight: 80 },
    { lpCode: 'LP-008', status: 'needs_verification', weight: 50 }
  ])

  for (const view of views) {
    assert.ok(view.confidenceLabel, '缺少 confidenceLabel')
    assert.ok(view.confidenceLevel, '缺少 confidenceLevel')
    assert.ok(view.confidenceDots, '缺少 confidenceDots')
    assert.equal(view.confidenceText, `${view.confidenceDots} ${view.confidenceLabel}`)
    assert.doesNotMatch(view.confidenceLabel, INTERNAL_CODE)
    assert.equal(view.weightText, undefined, 'weightText 已被置信度结构取代')
    assert.equal(view.priorityText, undefined, 'priorityText 已被置信度结构取代')
    assert.equal(view.priorityClass, undefined, 'priorityClass 已被置信度结构取代')
  }
  assert.equal(views[0].confidenceText, '●●● 高置信')
  assert.equal(views[1].confidenceText, '●●○ 中置信')
})

test('bottleneck center and detail cards render the confidence tag', () => {
  const center = read('miniprogram/pages/bottleneck-center/bottleneck-center.wxml')
  const detail = read('miniprogram/pages/bottleneck-detail/bottleneck-detail.wxml')
  assert.match(center, /confidence-\{\{item\.confidenceLevel\}\}">\{\{item\.confidenceText\}\}/)
  assert.match(detail, /confidence-\{\{bottleneck\.confidenceLevel\}\}">\{\{bottleneck\.confidenceText\}\}/)
  assert.doesNotMatch(center, /weightText|priorityText/)
  assert.doesNotMatch(detail, /weightText|priorityText/)
})

test('subject home queue rows expose and render the confidence tag', () => {
  const views = buildSubjectBottleneckViews({
    subject: 'math',
    currentBottlenecks: [
      { lpCode: 'LP-008', lpName: '审题错误', status: 'persisting', weight: 80, errorCount: 2 }
    ]
  }, { subject: 'math', subjectName: '数学' })

  assert.equal(views[0].confidenceText, '●●● 高置信')
  assert.equal(views[0].confidenceLevel, 'high')
  assert.doesNotMatch(views[0].confidenceLabel, INTERNAL_CODE)
  // 详情文案使用统一置信度标签（不再使用“高优先级”）
  assert.match(views[0].detailText, /高置信/)
  assert.doesNotMatch(views[0].detailText, /优先级/)

  const wxml = read('miniprogram/pages/subject-home/subject-home.wxml')
  assert.match(wxml, /confidence-tag confidence-\{\{item\.confidenceLevel\}\}">\{\{item\.confidenceText\}\}/)
})

test('index home subject rows and bottleneck highlight cards carry confidence labels', () => {
  const view = buildLearningProfileHomeView({
    student: { _id: 'student-1', name: '钟青羽' },
    profiles: [{
      subject: 'math',
      subjectName: '数学',
      totalReports: 1,
      currentBottlenecks: [
        { lpCode: 'LP-001', lpName: '计算错误（加减乘除）', status: 'needs_verification', weight: 80, errorCount: 3 },
        { lpCode: 'LP-008', lpName: '审题错误', status: 'persisting', weight: 50, errorCount: 1 }
      ]
    }],
    reports: [],
    papers: []
  })

  const mathRow = view.subjects.find(item => item.key === 'math')
  assert.equal(mathRow.confidenceText, '●●● 高置信')
  assert.equal(mathRow.confidenceLevel, 'high')

  assert.ok(view.priorityHighlights.length > 0, '缺少卡点高亮卡片')
  for (const card of view.priorityHighlights) {
    assert.ok(card.confidenceText, '高亮卡片缺少置信度标签')
    assert.match(card.confidenceText, /^(●●● 高置信|●●○ 中置信|●○○ 低置信)$/)
    assert.doesNotMatch(card.confidenceText, INTERNAL_CODE)
  }

  const wxml = read('miniprogram/pages/index/index.wxml')
  assert.match(wxml, /confidence-tag confidence-\{\{item\.confidenceLevel\}\}"[^>]*>\{\{item\.confidenceText\}\}/)
})

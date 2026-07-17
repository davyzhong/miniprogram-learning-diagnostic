// Batch 3（可视化 + emoji 集成）新接线的回归测试。
// 守护点：热力格 status→class/marker 映射、learning-progress 可追溯入口、
// 首页 trendText 与三色堆叠条渲染、知识地图/卡点详情/英语错词的构成条、
// 以及"可见文字不得出现原始内部 ID"红线。
const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')

const ROOT = path.resolve(__dirname, '..')
const { createWxMock, loadPage } = require('./helpers/page-harness')
const { buildTraceableUrl } = require('../miniprogram/utils/traceable-actions')
const { buildStatusSegments } = require('../miniprogram/utils/status-segments')
const { buildKnowledgeMapPageView } = require('../miniprogram/pages/knowledge-map/knowledge-map-presenter')
const { symbolOf, subjectSymbolOf } = require('../miniprogram/utils/ui-symbols')

const RAW_ID = /(?:^|\s)(?:LP|BN|CHI|ERR|MATH)-/

function read(relativePath) {
  return fs.readFileSync(path.join(ROOT, relativePath), 'utf8')
}

// ---------- status-segments 共享工具 ----------
test('buildStatusSegments filters zero counts and widths always total 100', () => {
  assert.deepEqual(buildStatusSegments([]), [])
  assert.deepEqual(buildStatusSegments([{ key: 'a', count: 0, tone: 'improved' }]), [])

  const segs = buildStatusSegments([
    { key: 'improved', label: '改善 1', count: 1, tone: 'improved' },
    { key: 'waiting', label: '待验证 2', count: 2, tone: 'waiting' },
    { key: 'persisting', label: '持续 1', count: 1, tone: 'priority' }
  ])
  assert.equal(segs.length, 3)
  assert.equal(segs.reduce((sum, s) => sum + s.widthPercent, 0), 100)
  assert.ok(segs.every(s => s.widthPercent >= 1))
})

// ---------- learning-progress 热力格 ----------
test('learning-progress maps matrix statuses to heat class + readable single-char marker', async () => {
  const cloud = {
    getLearningProgress: async () => ({
      success: true,
      data: {
        timeline: [{ reportId: 'r1' }, { reportId: 'r2' }],
        bottleneckMatrix: [{
          lpCode: 'LP-001',
          lpName: '计算基础',
          statuses: [
            { reportId: 'r1', status: 'needs_verification' },
            { reportId: 'r2', status: 'improved' }
          ]
        }, {
          lpCode: 'LP-002',
          lpName: '审题理解',
          statuses: [{ reportId: 'r1', status: 'persisting' }]
        }]
      }
    })
  }
  const { page } = loadPage('miniprogram/pages/learning-progress/learning-progress.js', {
    wx: createWxMock(),
    modules: { '../../utils/cloud': cloud }
  })
  page.studentId = 'student-1'
  page.subject = 'math'
  await page.loadData()

  const first = page.data.bottleneckMatrix[0]
  assert.deepEqual(JSON.parse(JSON.stringify(first.statusByRound)), ['pending', 'improved'])
  assert.deepEqual(JSON.parse(JSON.stringify(first.statusMarkers)), ['待', '改'])
  // statusIcons 契约保持不变（供其它页面/测试复用）
  assert.deepEqual(JSON.parse(JSON.stringify(first.statusIcons)), ['待验证', '改善'])

  const second = page.data.bottleneckMatrix[1]
  // 缺失的轮次退化为 none/中点，绝不空手
  assert.deepEqual(JSON.parse(JSON.stringify(second.statusByRound)), ['persisting', 'none'])
  assert.deepEqual(JSON.parse(JSON.stringify(second.statusMarkers)), ['持', '·'])
})

test('learning-progress wxml renders B1 heat cells and wxss carries no cold-blue residue', () => {
  const wxml = read('miniprogram/pages/learning-progress/learning-progress.wxml')
  const wxss = read('miniprogram/pages/learning-progress/learning-progress.wxss')
  assert.match(wxml, /heat-cell heat-\{\{item\.statusByRound\[index\]\}\}/)
  assert.match(wxml, /\{\{item\.statusMarkers\[index\]\}\}/)
  for (const cls of ['heat-pending', 'heat-persisting', 'heat-improved', 'heat-none']) {
    assert.match(wxss, new RegExp(`\\.${cls}\\s*\\{[^}]*var\\(--b1-`), `${cls} 应映射到 B1 token`)
  }
  assert.doesNotMatch(wxss, /#243244/)
  assert.doesNotMatch(wxss, /var\(--b1-math,/)
})

// ---------- learning-progress 可追溯入口 ----------
test('learning-progress is a traceable destination with studentId + subject', () => {
  const url = buildTraceableUrl({
    type: 'learning-progress',
    studentId: 'stu-1',
    studentName: '钟青羽',
    subject: 'math'
  })
  assert.ok(url.startsWith('/pages/learning-progress/learning-progress?'))
  assert.match(url, /studentId=stu-1/)
  assert.match(url, /subject=math/)
})

test('subject-home surfaces a learning-progress entry without breaking existing handlers', () => {
  const wxml = read('miniprogram/pages/subject-home/subject-home.wxml')
  const js = read('miniprogram/pages/subject-home/subject-home.js')
  const presenter = read('miniprogram/pages/subject-home/subject-home-presenter.js')
  assert.match(wxml, /bindtap="onLearningProgressTap"/)
  assert.match(wxml, /学习进展/)
  assert.match(js, /onLearningProgressTap\s*\(/)
  assert.match(js, /type: 'learning-progress'/)
  assert.match(presenter, /progressSymbol:/)
})

// ---------- 首页 trendText + 三色堆叠条 ----------
test('index renders trendText and three-color stacked bars on child + diagnosis cards', () => {
  const wxml = read('miniprogram/pages/index/index.wxml')
  const presenter = read('miniprogram/pages/index/index-presenter.js')
  // trendText 之前只在 presenter 计算、从未渲染 —— 现在必须出现在 WXML
  assert.match(presenter, /trendText/)
  assert.match(wxml, /\{\{item\.trendText\}\}/)
  // 诊断卡与孩子卡都要有堆叠条
  assert.match(wxml, /diagnosis-status-segments/)
  assert.match(wxml, /child-status-segments/)
  assert.match(wxml, /b1-seg b1-seg-\{\{seg\.tone\}\}/)
  // presenter 用共享 buildStatusSegments 供数据
  assert.match(presenter, /statusSegments: buildStatusSegments/)
})

// ---------- 知识地图掌握度条 ----------
test('knowledge-map computes per-domain mastery segments and renders the bar', () => {
  const view = buildKnowledgeMapPageView({
    subject: 'math',
    currentBottlenecks: [
      { lpCode: 'LP-001', lpName: '计算基础', status: 'improved', domain: '数与代数', weight: 82 },
      { lpCode: 'LP-002', lpName: '审题理解', status: 'needs_verification', domain: '数与代数', weight: 48 }
    ]
  }, 'math')

  const domain = view.domains[0]
  assert.equal(domain.count, 2)
  assert.equal(domain.masteredCount, 1)
  assert.equal(domain.pendingCount, 1)
  assert.equal(domain.masterySegments.reduce((sum, s) => sum + s.widthPercent, 0), 100)
  // 可见名称不得暴露原始 ID
  assert.doesNotMatch(domain.bottlenecks[0].displayName, RAW_ID)

  const wxml = read('miniprogram/pages/knowledge-map/knowledge-map.wxml')
  assert.match(wxml, /item\.masterySegments/)
})

// ---------- 卡点详情通过率条 + 横向点状时间线 ----------
test('bottleneck-detail renders a pass-rate bar and a horizontal dot evidence timeline', () => {
  const wxml = read('miniprogram/pages/bottleneck-detail/bottleneck-detail.wxml')
  const wxss = read('miniprogram/pages/bottleneck-detail/bottleneck-detail.wxss')
  const js = read('miniprogram/pages/bottleneck-detail/bottleneck-detail.js')
  assert.match(js, /passRateSegments/)
  assert.match(wxml, /passRateSegments/)
  assert.match(wxml, /pass-rate-card/)
  // 横向点状时间线：scroll-x 轨道 + 状态色圆点（timeText/statusClass 驱动）
  assert.match(wxml, /scroll-view class="evidence-timeline" scroll-x/)
  assert.match(wxml, /tl-dot tl-dot-\{\{item\.statusClass\}\}/)
  assert.match(wxml, /\{\{item\.timeText\}\}/)
  assert.match(wxss, /\.tl-dot-diagnosis/)
  assert.match(wxss, /\.tl-dot-pending/)
})

// ---------- 英语词库掌握构成条 ----------
test('english-wrong-words builds a two-part vocabulary composition that totals the library', async () => {
  const cloud = {
    getEnglishVocabularySummary: async () => ({
      summary: { totalWords: 10, overall: { masteredCount: 4 }, familiarity: {}, spelling: {} },
      weakWords: []
    }),
    getEnglishConfusionPractice: async () => ({ items: [] })
  }
  const { page } = loadPage('miniprogram/pages/english-wrong-words/english-wrong-words.js', {
    wx: createWxMock(),
    modules: { '../../utils/cloud': cloud }
  })
  page.setData({ studentId: 'stu-1' })
  await page.loadWrongWords()

  const segs = page.data.compositionSegments
  assert.equal(segs.length, 2)
  assert.equal(segs[0].key, 'mastered')
  assert.equal(segs[1].key, 'inProgress')
  assert.equal(segs.reduce((sum, s) => sum + s.widthPercent, 0), 100)

  const wxml = read('miniprogram/pages/english-wrong-words/english-wrong-words.wxml')
  assert.match(wxml, /compositionSegments/)
})

// ---------- emoji 语义键解析 ----------
test('curated emoji resolve from ui-symbols by semantic key (no raw literals needed in pages)', () => {
  assert.equal(symbolOf('trendUp'), '📈')
  assert.equal(symbolOf('pending'), '⏳')
  assert.equal(symbolOf('warning'), '⚠️')
  assert.equal(symbolOf('unknown-key'), '')
  assert.equal(subjectSymbolOf('math'), '🧮')
})

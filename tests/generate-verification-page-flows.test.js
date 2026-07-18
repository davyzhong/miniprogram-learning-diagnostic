const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const ROOT = path.resolve(__dirname, '..')
const { loadPageAndWait, flushAsync, waitForPageLoad, isThenable } = require('./helpers/page-flow-utils')
const { createWxMock, loadPage } = require('./helpers/page-harness')
const util = require('../miniprogram/utils/util')

test('verification page selects all available bottlenecks by default', async () => {
  const pendingBottlenecks = [
    { lpCode: 'LP-001', lpName: '计算错误', severity: 'medium' },
    { lpCode: 'LP-008', lpName: '审题错误', severity: 'high' }
  ]
  const cloud = {
    getSubjectProfile: async () => ({ pendingBottlenecks })
  }
  const { page } = loadPage('miniprogram/pages/generate-verification/generate-verification.js', {
    modules: { '../../utils/cloud': cloud }
  })
  page.setData({ studentId: 'student-1', subject: 'math' })

  await page.loadPendingBottlenecks()
  assert.equal(page.data.selectedCount, 2)
  assert.ok(page.data.bottlenecks.every(item => item.selected))
  // 置信度分层：medium(55)→2题，high(80)→3题，共5题
  assert.equal(page.data.paperConfig.questionCount, 5)
  assert.equal(page.data.paperConfig.pages, 1)
  assert.equal(page.data.paperConfig.strategyText, '按置信度分层：高置信3题、中置信2题、低置信1题')
})

test('verification page focuses the workbench target code when provided', async () => {
  const pendingBottlenecks = [
    { lpCode: 'LP-001', lpName: '计算错误', severity: 'medium' },
    { lpCode: 'LP-008', lpName: '审题错误', severity: 'high' }
  ]
  const cloud = {
    getSubjectProfile: async () => ({ pendingBottlenecks })
  }
  const { page } = loadPage('miniprogram/pages/generate-verification/generate-verification.js', {
    modules: { '../../utils/cloud': cloud }
  })

  page.onLoad({
    studentId: 'student-1',
    subject: 'math',
    subjectName: encodeURIComponent('数学'),
    targetCode: 'LP-008'
  })
  await page.loadPendingBottlenecks()

  assert.deepEqual(
    JSON.parse(JSON.stringify(page.data.bottlenecks.filter(item => item.selected).map(item => item.lpCode))),
    ['LP-008']
  )
  assert.equal(page.data.selectedCount, 1)
  assert.equal(page.data.selectedSummary, '审题理解')
  assert.equal(page.data.paperConfig.scopeText, '审题理解')
  // LP-008 severity high → weight 80 → 高置信 → 3题
  assert.equal(page.data.paperConfig.questionCount, 3)
})

test('verification page uses current bottlenecks with shared priority sorting', async () => {
  const cloud = {
    getSubjectProfile: async () => ({
      currentBottlenecks: [
        { lpCode: 'LP-004', status: 'improved', weight: 20 },
        { lpCode: 'LP-001', status: 'needs_verification', weight: 55 },
        { lpCode: 'LP-008', status: 'persisting', trend: 'recurring', weight: 40 }
      ]
    })
  }
  const { page } = loadPage('miniprogram/pages/generate-verification/generate-verification.js', {
    modules: { '../../utils/cloud': cloud }
  })
  page.setData({ studentId: 'student-1', subject: 'math' })

  await page.loadPendingBottlenecks()

  assert.deepEqual(
    JSON.parse(JSON.stringify(page.data.bottlenecks.map(item => item.displayName))),
    ['审题理解', '计算基础']
  )
  assert.equal(page.data.selectedCount, 2)
  assert.equal(page.data.selectedSummary, '审题理解、计算基础')
})

test('verification page shows readable bottleneck summaries instead of LP codes', async () => {
  const pendingBottlenecks = [
    { lpCode: 'LP-008', lpName: '审题错误', severity: 'high' },
    { lpCode: 'LP-001', lpName: '计算错误（加减乘除）', severity: 'medium' },
    { lpCode: 'LP-XXX', severity: 'low' }
  ]
  const cloud = {
    getSubjectProfile: async () => ({ pendingBottlenecks })
  }
  const { page } = loadPage('miniprogram/pages/generate-verification/generate-verification.js', {
    modules: { '../../utils/cloud': cloud }
  })
  page.setData({ studentId: 'student-1', subject: 'math' })

  await page.loadPendingBottlenecks()

  assert.deepEqual(
    JSON.parse(JSON.stringify(page.data.bottlenecks.map(item => item.displayName))),
    ['审题理解', '计算基础', '待确认卡点']
  )
  assert.equal(page.data.selectedSummary, '审题理解、计算基础、待确认卡点')
})

test('verification task pages use a readable scope for ID-only legacy targets', () => {
  const { page } = loadPage('miniprogram/pages/generate-verification/generate-verification.js')
  page.setData({ subject: 'math' })

  const pages = page.buildChunkedTaskPages([
    { bottleneckId: 'BN-LEGACY-UNKNOWN-01', lpCode: 'LP-UNKNOWN-01', weight: 40 }
  ])

  assert.deepEqual(JSON.parse(JSON.stringify(pages[0].targetNames)), ['待确认学习卡点'])
  assert.equal(pages[0].scopeText, '1 个学习卡点')
})

test('verification page expands math bottlenecks into fine-grained candidates', async () => {
  const currentBottlenecks = [{
    lpCode: 'LP-001',
    lpName: '计算错误（加减乘除）',
    status: 'needs_verification',
    severity: 'high',
    candidateBottlenecks: [
      {
        bottleneckId: 'BN-DEC-MUL-POINT-COUNT',
        title: '小数乘法中小数位数累计规则不稳',
        evidenceStrength: 'high'
      },
      {
        bottleneckId: 'BN-DEC-DIV-POINT-MOVE',
        title: '除数是小数的除法中，被除数小数点移动规则不熟练',
        evidenceStrength: 'medium'
      }
    ]
  }]
  const cloud = {
    getSubjectProfile: async () => ({ subject: 'math', currentBottlenecks })
  }
  const { page } = loadPage('miniprogram/pages/generate-verification/generate-verification.js', {
    modules: { '../../utils/cloud': cloud }
  })

  page.onLoad({
    studentId: 'student-1',
    subject: 'math',
    subjectName: encodeURIComponent('数学'),
    targetCode: 'BN-DEC-DIV-POINT-MOVE'
  })
  await page.loadPendingBottlenecks()

  assert.deepEqual(
    JSON.parse(JSON.stringify(page.data.bottlenecks.map(item => item.displayName))),
    [
      '小数乘法中小数位数累计规则不稳',
      '除数是小数的除法中，被除数小数点移动规则不熟练'
    ]
  )
  assert.deepEqual(
    JSON.parse(JSON.stringify(page.data.bottlenecks.filter(item => item.selected).map(item => item.bottleneckId))),
    ['BN-DEC-DIV-POINT-MOVE']
  )
  assert.match(page.data.selectedSummary, /除数是小数的除法中/)
})

test('verification page plans all report-selected fine math targets and sends fine target ids', async () => {
  let request = null
  const candidates = Array.from({ length: 7 }, (_, index) => ({
    bottleneckId: `BN-FINE-${index + 1}`,
    title: `细分卡点 ${index + 1}`,
    evidenceStrength: 'high'
  }))
  const currentBottlenecks = [{
    lpCode: 'LP-001',
    lpName: '计算错误（加减乘除）',
    status: 'needs_verification',
    severity: 'high',
    candidateBottlenecks: candidates
  }]
  const cloud = {
    getSubjectProfile: async () => ({ subject: 'math', currentBottlenecks }),
    callGeneratePaper: async payload => {
      request = payload
      return { paperId: 'paper-fine' }
    }
  }
  const wx = createWxMock()
  const { page } = loadPage('miniprogram/pages/generate-verification/generate-verification.js', {
    wx,
    modules: { '../../utils/cloud': cloud }
  })

  page.onLoad({
    studentId: 'student-1',
    subject: 'math',
    subjectName: encodeURIComponent('数学'),
    bottlenecks: 'LP-001'
  })
  await page.loadPendingBottlenecks()

  assert.equal(page.data.bottlenecks.length, 7)
  assert.equal(page.data.selectedCount, 7)
  assert.deepEqual(
    JSON.parse(JSON.stringify(page.data.bottlenecks.filter(item => item.selected).map(item => item.bottleneckId))),
    ['BN-FINE-1', 'BN-FINE-2', 'BN-FINE-3', 'BN-FINE-4', 'BN-FINE-5', 'BN-FINE-6', 'BN-FINE-7']
  )
  // 每页 4 个 BN：7 个 = 2 页（4 + 3）
  assert.equal(page.data.paperConfig.taskPageCount, 2)
  assert.deepEqual(
    JSON.parse(JSON.stringify(page.data.paperConfig.taskPages.map(item => item.targetCount))),
    [4, 3]
  )

  await page.onGenerate()

  assert.deepEqual(JSON.parse(JSON.stringify(request.targets)), [
    'BN-FINE-1',
    'BN-FINE-2',
    'BN-FINE-3',
    'BN-FINE-4',
    'BN-FINE-5',
    'BN-FINE-6',
    'BN-FINE-7'
  ])
  // 7 个 BN 全是 high(85) → 高置信 → 每个3题 = 21题
  assert.equal(request.questionCount, 21)
})

test('verification page uses Chinese concrete review items as selectable targets', async () => {
  let request = null
  const cloud = {
    getSubjectProfile: async () => ({
      subject: 'chinese',
      subjectName: '语文',
      chineseReviewItems: [
        {
          itemId: 'CHI-001',
          itemType: 'character',
          targetText: '莺',
          expectedAnswer: '莺',
          lastWrongAnswer: '鹰',
          sourceContext: '草长莺飞二月天',
          status: 'recurring',
          relatedLpCode: 'LP-101'
        },
        {
          itemId: 'CHI-002',
          itemType: 'poem',
          targetText: '春风拂槛露华浓',
          expectedAnswer: '春风拂槛露华浓',
          status: 'mastered',
          relatedLpCode: 'LP-104'
        }
      ]
    }),
    callGeneratePaper: async payload => {
      request = payload
      return { paperId: 'paper-chinese' }
    }
  }
  const wx = createWxMock()
  const { page } = loadPage('miniprogram/pages/generate-verification/generate-verification.js', {
    wx,
    modules: { '../../utils/cloud': cloud }
  })

  page.onLoad({
    studentId: 'student-1',
    subject: 'chinese',
    subjectName: encodeURIComponent('语文'),
    targetCode: 'CHI-001'
  })
  await page.loadPendingBottlenecks()

  assert.equal(page.data.bottlenecks.length, 1)
  assert.equal(page.data.bottlenecks[0].reviewItemId, 'CHI-001')
  assert.equal(page.data.bottlenecks[0].displayName, '莺')
  assert.equal(page.data.selectedSummary, '莺')

  await page.onGenerate()
  assert.deepEqual(JSON.parse(JSON.stringify(request.targets)), ['CHI-001'])
  assert.equal(request.subject, 'chinese')
})


test('verification paper generation sends only selected bottlenecks and opens the saved paper', async () => {
  let request = null
  const cloud = {
    callGeneratePaper: async payload => {
      request = payload
      return { paperId: 'paper-1', pdfFileId: 'cloud://paper.pdf' }
    }
  }
  const wx = createWxMock()
  const { page } = loadPage('miniprogram/pages/generate-verification/generate-verification.js', {
    wx,
    modules: { '../../utils/cloud': cloud }
  })
  page.setData({
    studentId: 'student-1',
    subject: 'math',
    bottlenecks: [
      { lpCode: 'LP-001', selected: true },
      { lpCode: 'LP-002', selected: false }
    ]
  })

  await page.onGenerate()
  assert.deepEqual(JSON.parse(JSON.stringify(request.targets)), ['LP-001'])
  // 无 weight 字段 → 低置信 → 1题
  assert.equal(request.questionCount, 1)
  assert.equal(request.type, 'verification')
  assert.equal(request.preview, false)
  assert.match(wx.calls.find(call => call.name === 'navigateTo').payload.url, /paperId=paper-1/)
})

test('verification paper generation hides backend error details', async () => {
  const cloud = {
    callGeneratePaper: async () => {
      throw new Error('失败 BN-ERROR-01 cloud://env/file')
    }
  }
  const wx = createWxMock()
  const { page } = loadPage('miniprogram/pages/generate-verification/generate-verification.js', {
    wx,
    modules: { '../../utils/cloud': cloud }
  })
  page.setData({
    studentId: 'student-1',
    subject: 'math',
    bottlenecks: [{ lpCode: 'LP-001', selected: true }]
  })

  await page.onGenerate()

  assert.equal(
    wx.calls.filter(call => call.name === 'showToast').at(-1).payload.title,
    '准备失败，请稍后重试'
  )
  assert.equal(page.data.studentId, 'student-1')
})


test('legacy verification page is a download/status entry, not a manual generation action', () => {
  const wxml = fs.readFileSync(path.join(ROOT, 'miniprogram/pages/generate-verification/generate-verification.wxml'), 'utf8')
  const js = fs.readFileSync(path.join(ROOT, 'miniprogram/pages/generate-verification/generate-verification.js'), 'utf8')

  assert.doesNotMatch(wxml, /bindtap="onPreview"/)
  assert.doesNotMatch(wxml, /预览\s*PDF/)
  assert.doesNotMatch(wxml, /预览生成中/)
  assert.doesNotMatch(wxml, /bindtap="onGenerate"/)
  assert.match(wxml, /查看\/下载验证卷/)
  assert.doesNotMatch(js, /async onPreview/)
  assert.doesNotMatch(js, /previewing/)
})

test('verification paper user-facing entries are download-first, not manual generation-first', () => {
  const files = [
    'miniprogram/utils/child-workbench.js',
    'miniprogram/pages/index/index-presenter.js',
    'miniprogram/pages/subject-home/subject-home-presenter.js',
    'miniprogram/utils/bottleneck-view.js',
    'miniprogram/pages/generate-verification/generate-verification.wxml',
    'miniprogram/pages/generate-verification/generate-verification.json'
  ].map(file => fs.readFileSync(path.join(ROOT, file), 'utf8')).join('\n')

  assert.doesNotMatch(files, /生成纸面验证卷/)
  assert.doesNotMatch(files, /生成并预览试卷/)
  assert.doesNotMatch(files, /生成试卷/)
  assert.doesNotMatch(files, /选择本次要验证/)
  assert.match(files, /下载验证卷|查看\/下载验证卷/)
})

test('verification paper uses a compact B1 subject identity and waiting state', () => {
  const wxml = fs.readFileSync(path.join(ROOT, 'miniprogram/pages/generate-verification/generate-verification.wxml'), 'utf8')
  const wxss = fs.readFileSync(path.join(ROOT, 'miniprogram/pages/generate-verification/generate-verification.wxss'), 'utf8')

  assert.match(wxml, /b1-paper-header/)
  assert.match(wxml, /b1-subject-\{\{subject\}\}/)
  assert.match(wxml, /b1-state-waiting/)
  assert.match(wxml, /查看\/下载验证卷/)
  assert.match(wxss, /var\(--b1-subject-math-fg\)/)
  assert.match(wxss, /var\(--b1-waiting-bg\)/)
})

test('verification preview stats are one compact line and the selected count appears only once', () => {
  const wxml = fs.readFileSync(path.join(ROOT, 'miniprogram/pages/generate-verification/generate-verification.wxml'), 'utf8')
  const wxss = fs.readFileSync(path.join(ROOT, 'miniprogram/pages/generate-verification/generate-verification.wxss'), 'utf8')

  // 大数字块矩阵已删除，统计收敛为 presenter 拼接的单行文本
  assert.doesNotMatch(wxml, /class="preview-stats"/)
  assert.doesNotMatch(wxml, /class="preview-stat"/)
  assert.doesNotMatch(wxss, /\.preview-num|\.preview-label/)
  assert.match(wxml, /class="preview-stats-line">\{\{paperConfig\.statsLine\}\}/)
  // selectedCount 只在 statsLine 里出现，范围标题不再重复计数
  assert.doesNotMatch(wxml, /验证范围（/)
  assert.match(wxml, /验证范围</)
  // 页头留白收紧到 22rpx 以内
  assert.doesNotMatch(wxss, /padding:\s*34rpx 28rpx 28rpx/)
})

test('verification paperConfig packs counts into a single statsLine without internal codes', () => {
  const { page } = loadPage('miniprogram/pages/generate-verification/generate-verification.js')
  page.setData({ subject: 'math' })

  const config = page.buildPaperConfig([{ lpCode: 'LP-001', weight: 80 }], '审题理解')

  assert.equal(config.statsLine, '1 个卡点 · 3 题 · 约 12 分钟 · A4 1 页')
  assert.doesNotMatch(config.statsLine, /LP-|BN-/)
})

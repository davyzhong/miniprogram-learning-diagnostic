const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const ROOT = path.resolve(__dirname, '..')
const { loadPageAndWait, flushAsync, waitForPageLoad, isThenable } = require('./helpers/page-flow-utils')
const { createWxMock, loadPage } = require('./helpers/page-harness')
const util = require('../miniprogram/utils/util')
const { buildChildWorkbenchCards } = require('../miniprogram/utils/child-workbench')

test('add student trims input and creates all subject profiles', async () => {
  let saved = null
  const cloud = {
    createStudentWithProfiles: async data => { saved = data }
  }
  const wx = createWxMock()
  const { page } = loadPage('miniprogram/pages/add-student/add-student.js', {
    wx,
    modules: { '../../utils/cloud': cloud }
  })

  page.onNameInput({ detail: { value: '  钟青羽  ' } })
  page.onGradeTap({ currentTarget: { dataset: { grade: 5 } } })
  assert.equal(page.data.canSave, true)

  await page.onSave()
  assert.equal(saved.name, '钟青羽')
  assert.equal(saved.grade, 5)
  assert.equal(page.data.saving, false)
})


test('single-child index opens directly as that child learning profile', async () => {
  const cloud = {
    getAccessibleStudents: async () => [
      { _id: 'student-1', name: '钟青羽', grade: 5, createdAt: '2026-06-01' }
    ],
    getStudentDashboard: async studentId => ({
      student: { _id: studentId, name: '钟青羽', grade: 5 },
      permissions: { canView: true, canUpload: true, canGeneratePaper: true, canRetryAnalysis: true, canManageParents: true },
      subjectProfiles: [{ subject: 'math', totalReports: 2, updatedAt: '2026-06-11T10:00:00Z' }],
      recentReports: [],
      recentPapers: []
    })
  }
  const wx = createWxMock()
  const { page } = loadPage('miniprogram/pages/index/index.js', {
    wx,
    modules: {
      '../../utils/cloud': cloud,
      '../../utils/util': { formatRelativeTime: () => '2小时前' }
    }
  })

  await page.loadStudents()
  assert.equal(page.data.homeMode, 'single-profile')
  assert.equal(page.data.students[0].totalReports, 2)
  assert.equal(page.data.students[0].gradeText, '5年级')
  assert.equal(page.data.home.studentName, '钟青羽')
  assert.equal(page.data.childCards.length, 0)
  page.onStudentTap({ currentTarget: { dataset: { id: 'student-1', name: '钟青羽', grade: 5 } } })
  assert.match(wx.calls.find(call => call.name === 'navigateTo').payload.url, /pages\/student-profile\/student-profile/)
  assert.match(wx.calls.find(call => call.name === 'navigateTo').payload.url, /studentId=student-1/)
})

test('empty index stays in add-first-child mode', async () => {
  const cloud = {
    getAccessibleStudents: async () => []
  }
  const { page } = loadPage('miniprogram/pages/index/index.js', {
    modules: {
      '../../utils/cloud': cloud,
      '../../utils/util': { ...util, formatRelativeTime: () => '今天' }
    }
  })

  await page.loadStudents()

  assert.equal(page.data.homeMode, 'empty')
  assert.equal(page.data.hasStudents, false)
  assert.equal(page.data.home, null)
  assert.equal(page.data.childCards.length, 0)
})

test('index shows a recovery state when student loading fails', async () => {
  // 直接 DB fallback 已移除：getAccessibleStudents 抛错时，错误被内部 catch，
  // 页面降级为空状态（add-first-child 模式），不进入外部 catch 的错误态，
  // 也不弹出"加载失败"toast，避免在云函数抖动时打断用户。
  const cloud = {
    getAccessibleStudents: async () => { throw new Error('shared access down') }
  }
  const wx = createWxMock()
  const { page } = loadPage('miniprogram/pages/index/index.js', {
    wx,
    setTimeout: () => 1,
    modules: {
      '../../utils/cloud': cloud,
      '../../utils/util': { ...util, formatRelativeTime: () => '今天' }
    }
  })

  await page.loadStudents({ force: true })

  assert.equal(page.data.loading, false)
  assert.equal(page.data.hasStudents, false)
  assert.equal(page.data.homeMode, 'empty')
  assert.equal(page.data.errorText, '')
  assert.equal(page.data.students.length, 0)
  assert.equal(wx.calls.some(call => call.name === 'showToast' && call.payload.title === '加载失败'), false)
})

test('index leaves a visible recovery state when first paint loading times out', () => {
  let watchdog = null
  const cloud = {
    getAccessibleStudents: async () => new Promise(() => {})
  }
  const { page } = loadPage('miniprogram/pages/index/index.js', {
    setTimeout: callback => {
      watchdog = callback
      return 1
    },
    modules: {
      '../../utils/cloud': cloud,
      '../../utils/util': { ...util, formatRelativeTime: () => '今天' }
    }
  })

  page.loadStudents({ force: true })
  assert.equal(page.data.loading, true)
  watchdog()

  assert.equal(page.data.loading, false)
  assert.match(page.data.errorText, /首页加载时间过长/)
})

test('page lifecycle handlers do not return promises to the mini program runtime', () => {
  const cloud = {
    getAccessibleStudents: async () => [],
    getStudentDashboard: async () => ({
      student: { _id: 'student-1', name: '钟青羽' },
      subjectProfiles: [],
      recentReports: [],
      recentPapers: []
    })
  }
  const wx = createWxMock()
  const { page: indexPage } = loadPage('miniprogram/pages/index/index.js', {
    wx,
    modules: {
      '../../utils/cloud': cloud,
      '../../utils/util': { ...util, formatRelativeTime: () => '今天' }
    }
  })
  const { page: profilePage } = loadPage('miniprogram/pages/student-profile/student-profile.js', {
    wx,
    modules: {
      '../../utils/cloud': cloud,
      '../../utils/util': { ...util, formatRelativeTime: () => '今天' }
    }
  })

  assert.equal(isThenable(indexPage.onShow()), false)
  assert.equal(isThenable(profilePage.onLoad({ studentId: 'student-1' })), false)
})

test('page onLoad handlers stay synchronous and start async work internally', () => {
  const pageFiles = fs.readdirSync(path.join(ROOT, 'miniprogram/pages'), { withFileTypes: true })
    .filter(entry => entry.isDirectory())
    .map(entry => path.join(ROOT, 'miniprogram/pages', entry.name, `${entry.name}.js`))
    .filter(file => fs.existsSync(file))

  for (const file of pageFiles) {
    const source = fs.readFileSync(file, 'utf8')
    assert.doesNotMatch(
      source,
      /async\s+onLoad\s*\(/,
      `${path.relative(ROOT, file)} should not expose an async onLoad lifecycle`
    )
  }
})

test('multi-child index shows only the family workbench and routes child cards to profile pages', async () => {
  const cloud = {
    getAccessibleStudents: async () => [
      { _id: 'student-1', name: '钟青羽', grade: 6, createdAt: '2026-06-01' },
      { _id: 'student-2', name: '弟弟', grade: 3, createdAt: '2026-06-02' }
    ],
    getStudentDashboard: async studentId => {
      const name = studentId === 'student-1' ? '钟青羽' : '弟弟'
      const grade = studentId === 'student-1' ? 6 : 3
      const subjectProfiles = studentId === 'student-1'
        ? [{ subject: 'math', totalReports: 2, currentBottlenecks: [{ lpCode: 'LP-001', status: 'needs_verification' }] }]
        : [{ subject: 'math', totalReports: 0, currentBottlenecks: [] }]
      return {
        student: { _id: studentId, name, grade },
        permissions: { canView: true, canUpload: true, canGeneratePaper: true, canRetryAnalysis: true, canManageParents: true },
        subjectProfiles,
        recentReports: [],
        recentPapers: []
      }
    }
  }
  const wx = createWxMock()
  const { page } = loadPage('miniprogram/pages/index/index.js', {
    wx,
    modules: {
      '../../utils/cloud': cloud,
      '../../utils/util': { ...util, formatRelativeTime: () => '今天' }
    }
  })

  await page.loadStudents()

  assert.equal(page.data.homeMode, 'family-workbench')
  assert.equal(page.data.home, null)
  assert.equal(page.data.childCards.length, 2)
  assert.match(page.data.childCards[0].profileUrl, /pages\/student-profile\/student-profile/)
  page.onStudentTap({ currentTarget: { dataset: { id: 'student-1', name: '钟青羽', grade: 6 } } })
  assert.match(wx.calls.find(call => call.name === 'navigateTo').payload.url, /pages\/student-profile\/student-profile/)
})

test('index family workbench renders the restored compact functional sections', () => {
  const wxml = fs.readFileSync(path.join(ROOT, 'miniprogram/pages/index/index.wxml'), 'utf8')
  const wxss = fs.readFileSync(path.join(ROOT, 'miniprogram/pages/index/index.wxss'), 'utf8')

  assert.match(wxml, /family-workbench-hero/)
  assert.match(wxml, /home-error-state/)
  assert.match(wxml, /onRetryLoadStudents/)
  assert.doesNotMatch(wxml, /\/assets\/images\//)
  assert.match(wxml, /child-priority-action/)
  assert.match(wxml, /secondary-action-grid/)
  assert.match(wxml, /child-quick-grid/)
  assert.match(wxml, /child-latest-diagnosis/)
  assert.match(wxml, /AI 用量/)
  assert.match(wxml, /\/pages\/ai-usage\/ai-usage/)
  assert.doesNotMatch(wxml, /child-latest-row/)
  assert.doesNotMatch(wxml, /child-next-row/)

  assert.match(wxss, /\.child-priority-action/)
  assert.match(wxss, /\.secondary-action-card/)
  assert.match(wxss, /\.child-quick-link/)
  assert.match(wxss, /\.family-workbench-hero/)
})

test('family workbench exposes the B1 hierarchy without removing dense learning content', () => {
  const wxml = fs.readFileSync(path.join(ROOT, 'miniprogram/pages/index/index.wxml'), 'utf8')

  assert.match(wxml, /class="[^"]*b1-family-summary/)
  assert.match(wxml, /class="[^"]*b1-metric[^"]*b1-metric-\{\{item\.tone\}\}/)
  assert.match(wxml, /class="[^"]*b1-priority/)
  assert.match(wxml, /class="[^"]*b1-subject-\{\{item\.subject\}\}/)
  assert.equal((wxml.match(/\/pages\/ai-usage\/ai-usage/g) || []).length, 1)
})

test('family workbench keeps every dense section without requiring icon bindings', () => {
  const wxml = fs.readFileSync(path.join(ROOT, 'miniprogram/pages/index/index.wxml'), 'utf8')

  for (const marker of [
    'family-hero-stats',
    'child-card-top',
    'child-status-grid',
    'child-priority-action',
    'child-subject-list',
    'child-latest-diagnosis',
    'child-quick-grid'
  ]) {
    assert.match(wxml, new RegExp(`class="[^"]*${marker}`), `${marker} should remain a semantic layout marker`)
  }

  for (const preservedSection of [
    /child\.statusItems/,
    /child\.priorityAction/,
    /child\.secondaryActions/,
    /child\.subjectRows/,
    /child\.diagnosisReports/,
    /child\.quickLinks/
  ]) {
    assert.match(wxml, preservedSection)
  }

  assert.match(wxml, />[^<]*AI 用量</)
  assert.match(wxml, />[^<]*添加孩子</)
  assert.match(wxml, /最新学科诊断/)
  assert.match(wxml, /priority-summary">{{child\.priorityAction\.summary}}/)
  assert.match(wxml, /quick-link-summary">{{item\.summary}}/)
  assert.doesNotMatch(wxml, /item\.icon|priorityAction\.icon|latestDiagnosis\.icon/)
  assert.doesNotMatch(wxml, /paperDisplayCode|paperCode/)
})

test('family workbench CSS keeps compact dimensions and four-column metrics', () => {
  const wxss = fs.readFileSync(path.join(ROOT, 'miniprogram/pages/index/index.wxss'), 'utf8')
  const rule = selector => {
    const escaped = selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
    const matches = [...wxss.matchAll(new RegExp(`${escaped}\\s*\\{([^}]*)\\}`, 'g'))]
    assert.ok(matches.length > 0, `${selector} should have a CSS rule`)
    return matches[matches.length - 1][1]
  }

  assert.match(rule('.child-status-grid'), /grid-template-columns:\s*repeat\(4,\s*1fr\)/)
  assert.match(rule('.child-card'), /padding:\s*16rpx 18rpx/)
  assert.match(rule('.child-card'), /border-radius:\s*12rpx/)
  assert.match(rule('.child-status-cell'), /min-height:\s*72rpx/)
  assert.match(rule('.child-avatar'), /width:\s*62rpx/)
  assert.match(rule('.child-avatar'), /height:\s*62rpx/)

  assert.match(rule('.child-subject-row'), /min-height:\s*58rpx/)
  assert.match(rule('.child-quick-link'), /min-height:\s*76rpx/)
})

test('family workbench uses compact grouped rows on the restored visual baseline', () => {
  const wxss = fs.readFileSync(path.join(ROOT, 'miniprogram/pages/index/index.wxss'), 'utf8')
  const rule = selector => {
    const escaped = selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
    const matches = [...wxss.matchAll(new RegExp(`${escaped}\\s*\\{([^}]*)\\}`, 'g'))]
    assert.ok(matches.length > 0, `${selector} should have a CSS rule`)
    return matches[matches.length - 1][1]
  }

  for (const selector of [
    '.child-status-cell',
    '.child-priority-action',
    '.secondary-action-card',
    '.child-subject-row',
    '.child-latest-diagnosis'
  ]) {
    assert.match(rule(selector), /(?:min-height|padding|margin-top)\s*:/)
  }
  assert.match(rule('.child-latest-diagnosis'), /border-left:\s*5rpx/)
})

test('family actions keep traceable taps on every compact section', () => {
  const wxml = fs.readFileSync(path.join(ROOT, 'miniprogram/pages/index/index.wxml'), 'utf8')
  const wxss = fs.readFileSync(path.join(ROOT, 'miniprogram/pages/index/index.wxss'), 'utf8')
  const tagsFor = className => wxml.match(new RegExp(`<(?:view|text)\\b[^>]*class="[^"]*\\b${className}\\b[^"]*"[^>]*>`, 'g')) || []
  const rule = selector => {
    const escaped = selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
    const matches = [...wxss.matchAll(new RegExp(`${escaped}\\s*\\{([^}]*)\\}`, 'g'))]
    assert.equal(matches.length, 1, `${selector} should have exactly one CSS rule`)
    return matches[0][1]
  }

  const [childCardTag] = tagsFor('child-card')
  const [childMetricTag] = tagsFor('child-status-cell')
  const [childProfileTag] = tagsFor('child-profile-link')
  const [familyHeroTag] = tagsFor('family-workbench-hero')
  assert.match(childCardTag, /bindtap="onStudentTap"/)
  assert.match(childCardTag, /data-id="{{child\.id}}"/)
  assert.match(familyHeroTag, /catchtap="onTraceableUrlTap"/)
  assert.match(childProfileTag, /catchtap="onTraceableUrlTap"/)
  assert.match(childMetricTag, /catchtap="onTraceableUrlTap"/)
  assert.match(childMetricTag, /data-url="{{item\.url}}"/)

  for (const className of [
    'child-status-cell',
    'child-priority-action',
    'secondary-action-card',
    'child-subject-row',
    'child-latest-diagnosis',
    'child-quick-link'
  ]) {
    const tags = tagsFor(className)
    assert.ok(tags.length > 0, `${className} should render an action`)
    for (const tag of tags) {
      assert.match(tag, /catchtap="onTraceableUrlTap"/)
      assert.match(tag, /data-url="{{[^}]+}}"/)
    }
  }
})

test('family identity keeps student metadata visible in the compact card', () => {
  const wxss = fs.readFileSync(path.join(ROOT, 'miniprogram/pages/index/index.wxss'), 'utf8')
  const wxml = fs.readFileSync(path.join(ROOT, 'miniprogram/pages/index/index.wxml'), 'utf8')
  assert.match(wxml, /child\.gradeText/)
  assert.match(wxml, /child\.roleText/)
  assert.match(wxml, /child\.memberText/)
  assert.match(wxml, /child\.recentUpdateText/)
  assert.doesNotMatch(wxss, /\.child-meta\s*\{[^}]*display:\s*none/s)
})

test('formal diagnosis heading is absent when a child has no diagnosis', () => {
  const wxml = fs.readFileSync(path.join(ROOT, 'miniprogram/pages/index/index.wxml'), 'utf8')
  const gatedDiagnosis = /<view class="child-diagnosis-list" wx:if="{{child\.diagnosisReports\.length > 0}}"/

  assert.match(wxml, gatedDiagnosis)
  assert.ok((wxml.match(/最新学科诊断/g) || []).length >= 1)
})

test('family page renders all three subjects and four quick actions exactly once', () => {
  const [card] = buildChildWorkbenchCards({
    students: [{ _id: 'student-cardinality', name: '钟青羽', grade: 6 }]
  })
  const wxml = fs.readFileSync(path.join(ROOT, 'miniprogram/pages/index/index.wxml'), 'utf8')
  const occurrences = pattern => (wxml.match(pattern) || []).length

  assert.equal(card.subjectRows.length, 3)
  assert.equal(card.quickLinks.length, 4)
  assert.equal(occurrences(/wx:for="{{child\.subjectRows}}"/g), 1)
  assert.equal(occurrences(/wx:for="{{child\.quickLinks}}"/g), 1)
  assert.doesNotMatch(wxml, /child\.(?:subjectRows|quickLinks)\.(?:slice|filter)/)
})

test('single-profile index markers remain intact beside family mode', () => {
  const wxml = fs.readFileSync(path.join(ROOT, 'miniprogram/pages/index/index.wxml'), 'utf8')

  assert.match(wxml, /homeMode === 'single-profile'/)
  assert.match(wxml, /diagnosis-workbench-section/)
  assert.match(wxml, /personal-action-queue/)
  assert.match(wxml, /personal-subject-list/)
  assert.match(wxml, /onParentManagement/)
  assert.equal((wxml.match(/\/pages\/ai-usage\/ai-usage/g) || []).length, 1)
})

test('index and student profile use one identity and action hierarchy without legacy duplicates', () => {
  const indexWxml = fs.readFileSync(path.join(ROOT, 'miniprogram/pages/index/index.wxml'), 'utf8')
  const profileWxml = fs.readFileSync(path.join(ROOT, 'miniprogram/pages/student-profile/student-profile.wxml'), 'utf8')
  const wxss = fs.readFileSync(path.join(ROOT, 'miniprogram/pages/index/index.wxss'), 'utf8')

  for (const wxml of [indexWxml, profileWxml]) {
    assert.match(wxml, /diagnosis-workbench-section/)
    assert.match(wxml, /diagnosis-workbench/)
    assert.match(wxml, /diagnosis-signal-line/)
    assert.match(wxml, /diagnosis-next/)
    assert.match(wxml, /personal-action-queue/)
    assert.match(wxml, /personal-subject-list/)
    assert.match(wxml, /profile-summary-line/)
    assert.doesNotMatch(wxml, /personal-hero-card/)
    assert.doesNotMatch(wxml, /personal-primary-action/)
    assert.doesNotMatch(wxml, /personal-report-card/)
    assert.doesNotMatch(wxml, /\/assets\/images\//)
  }

  assert.doesNotMatch(profileWxml, /coverage-card/)
  assert.doesNotMatch(profileWxml, /metric-strip/)
  assert.doesNotMatch(profileWxml, /highlight-row/)
  assert.doesNotMatch(profileWxml, /record-row/)
  assert.doesNotMatch(profileWxml, /next-card/)
  assert.doesNotMatch(profileWxml, /subject-grid/)

  assert.match(wxss, /\.diagnosis-workbench-section/)
  assert.match(wxss, /\.diagnosis-signal-line/)
  assert.match(wxss, /\.diagnosis-next/)
  assert.match(wxss, /\.personal-action-card/)
  assert.match(wxss, /\.personal-subject-row/)
  assert.doesNotMatch(indexWxml, /class="family-hero-image"/)
  assert.doesNotMatch(indexWxml, /class="personal-hero-image"/)
  assert.doesNotMatch(profileWxml, /class="personal-hero-image"/)
  assert.doesNotMatch(profileWxml, /back-arrow/)
  assert.doesNotMatch(profileWxml, /class="top-left" bindtap="onBackHome"/)
  assert.doesNotMatch(profileWxml, /返回首页/)
})

test('static illustration images are not wired into app pages', () => {
  const subjectHomeWxml = fs.readFileSync(path.join(ROOT, 'miniprogram/pages/subject-home/subject-home.wxml'), 'utf8')
  const reportWxml = fs.readFileSync(path.join(ROOT, 'miniprogram/pages/report/report.wxml'), 'utf8')
  const verificationWxml = fs.readFileSync(path.join(ROOT, 'miniprogram/pages/generate-verification/generate-verification.wxml'), 'utf8')
  const knowledgeMapWxml = fs.readFileSync(path.join(ROOT, 'miniprogram/pages/knowledge-map/knowledge-map.wxml'), 'utf8')
  const resourceWxml = fs.readFileSync(path.join(ROOT, 'miniprogram/pages/learning-resource/learning-resource.wxml'), 'utf8')
  const uploadWxml = fs.readFileSync(path.join(ROOT, 'miniprogram/pages/upload/upload.wxml'), 'utf8')
  const historyWxml = fs.readFileSync(path.join(ROOT, 'miniprogram/pages/upload-history/upload-history.wxml'), 'utf8')
  const englishPracticeWxml = fs.readFileSync(path.join(ROOT, 'miniprogram/pages/english-practice/english-practice.wxml'), 'utf8')
  const englishDictationWxml = fs.readFileSync(path.join(ROOT, 'miniprogram/pages/english-dictation/english-dictation.wxml'), 'utf8')
  const englishWrongWordsWxml = fs.readFileSync(path.join(ROOT, 'miniprogram/pages/english-wrong-words/english-wrong-words.wxml'), 'utf8')
  const defaultPaperWxml = fs.readFileSync(path.join(ROOT, 'miniprogram/pages/default-paper/default-paper.wxml'), 'utf8')
  const paperPreviewWxml = fs.readFileSync(path.join(ROOT, 'miniprogram/pages/paper-preview/paper-preview.wxml'), 'utf8')
  const bottleneckCenterWxml = fs.readFileSync(path.join(ROOT, 'miniprogram/pages/bottleneck-center/bottleneck-center.wxml'), 'utf8')
  const bottleneckDetailWxml = fs.readFileSync(path.join(ROOT, 'miniprogram/pages/bottleneck-detail/bottleneck-detail.wxml'), 'utf8')
  const addStudentWxml = fs.readFileSync(path.join(ROOT, 'miniprogram/pages/add-student/add-student.wxml'), 'utf8')
  const joinStudentWxml = fs.readFileSync(path.join(ROOT, 'miniprogram/pages/join-student/join-student.wxml'), 'utf8')
  const parentManagementWxml = fs.readFileSync(path.join(ROOT, 'miniprogram/pages/parent-management/parent-management.wxml'), 'utf8')

  for (const source of [
    subjectHomeWxml,
    reportWxml,
    verificationWxml,
    knowledgeMapWxml,
    resourceWxml,
    uploadWxml,
    historyWxml,
    englishPracticeWxml,
    englishDictationWxml,
    englishWrongWordsWxml,
    defaultPaperWxml,
    paperPreviewWxml,
    bottleneckCenterWxml,
    bottleneckDetailWxml,
    addStudentWxml,
    joinStudentWxml,
    parentManagementWxml
  ]) {
    assert.doesNotMatch(source, /\/assets\/images\//)
    assert.doesNotMatch(source, /imageSrc/)
    assert.doesNotMatch(source, /class="[^"]*(illustration|hero-image|empty-logo|loading-logo)[^"]*"/)
  }

  assert.match(uploadWxml, /class="preview-img" src="\{\{item\.tempPath\}\}"/)
})


test('learning profile home loads the active student summary', async () => {
  const cloud = {
    getAccessibleStudents: async () => [
      { _id: 'student-1', name: '钟青羽', grade: 6, createdAt: '2026-06-01' }
    ],
    getStudentDashboard: async studentId => {
      assert.equal(studentId, 'student-1')
      return {
        student: { _id: studentId, name: '钟青羽', grade: 6 },
        permissions: { canView: true, canUpload: true, canGeneratePaper: true, canRetryAnalysis: true, canManageParents: true },
        subjectProfiles: [{
          subject: 'math',
          subjectName: '数学',
          totalReports: 1,
          updatedAt: '2026-06-12T14:20:00+08:00',
          currentBottlenecks: [
            { lpCode: 'LP-001', lpName: '计算错误（加减乘除）', status: 'needs_verification' }
          ]
        }],
        recentReports: [{
          _id: 'report-1',
          subject: 'math',
          type: 'diagnosis',
          status: 'completed',
          isEffective: true,
          createdAt: '2026-06-12T14:20:00+08:00',
          bottlenecks: [{ lpCode: 'LP-001', lpName: '计算错误（加减乘除）' }]
        }],
        recentPapers: []
      }
    },
    getActiveVerificationPaper: async () => ({ status: 'ready', paper: { _id: 'paper-1' } })
  }
  const { page, wx } = loadPage('miniprogram/pages/index/index.js', {
    modules: {
      '../../utils/cloud': cloud,
      '../../utils/util': { ...util, formatRelativeTime: () => '今天' }
    },
    wx: createWxMock({ cloud: { callFunction: async () => ({ result: { success: true, status: 'none', paper: null } }) } })
  })

  await page.loadStudents()
  page._cloud = cloud  // 供 shared-navigation 的 navigateToVerificationByStatus 使用
  assert.equal(page.data.homeMode, 'single-profile')
  assert.equal(page.data.home.studentName, '钟青羽')
  assert.match(page.data.home.priorityHighlights[0].title, /数学/)
  assert.equal(page.data.home.priorityBottlenecks[0].displayName, '计算基础')
  assert.equal(page.data.activeStudentId, 'student-1')
  assert.equal(page.data.permissions.canManageParents, true)

  page.onViewAllBottlenecks()
  page.onBottleneckTap({ currentTarget: { dataset: { subject: 'math', lpCode: 'LP-001' } } })
  page.onBottleneckAction({ currentTarget: { dataset: { subject: 'math', lpCode: 'LP-001' } } })
  await waitForPageLoad(page)
  const urls = wx.calls.filter(call => call.name === 'navigateTo').map(call => call.payload.url)
  assert.match(urls[0], /pages\/bottleneck-center\/bottleneck-center/)
  assert.match(urls[1], /pages\/bottleneck-detail\/bottleneck-detail/)
  assert.match(urls[1], /lpCode=LP-001/)
  // 统一入口：ready 时跳预览页
  assert.match(urls[2], /pages\/paper-preview\/paper-preview\?paperId=paper-1/)
})

test('learning profile home degrades to empty state when shared access is unavailable', async () => {
  // 直接 DB fallback 已移除：getAccessibleStudents 抛错后不再回退到
  // getStudents/getSubjectProfiles/getReports/getPapers 等直接 collection 读取，
  // 页面降级为空状态（无学习摘要），避免绕过权限校验。
  const cloud = {
    getAccessibleStudents: async () => { throw new Error('cloud function not found') },
    // 这些遗留直接 DB 读函数不应被调用——一旦调用即抛错使测试失败
    getStudents: async () => { throw new Error('legacy getStudents must not be called') },
    getSubjectProfiles: async () => { throw new Error('legacy getSubjectProfiles must not be called') },
    getReports: async () => { throw new Error('legacy getReports must not be called') },
    getPapers: async () => { throw new Error('legacy getPapers must not be called') }
  }
  const { page } = loadPage('miniprogram/pages/index/index.js', {
    modules: {
      '../../utils/cloud': cloud,
      '../../utils/util': { ...util, formatRelativeTime: () => '今天' }
    }
  })

  await page.loadStudents()

  assert.equal(page.data.homeMode, 'empty')
  assert.equal(page.data.hasStudents, false)
  assert.equal(page.data.home, null)
  assert.equal(page.data.students.length, 0)
})


test('learning profile home opens parent management for the active student', async () => {
  const wx = createWxMock()
  const { page } = loadPage('miniprogram/pages/index/index.js', { wx })
  page.setData({
    activeStudentId: 'student-1',
    activeStudent: { _id: 'student-1', name: '钟青羽' },
    permissions: { canManageParents: true }
  })

  page.onParentManagement()

  const navigation = wx.calls.find(call => call.name === 'navigateTo')
  assert.match(navigation.payload.url, /pages\/parent-management\/parent-management/)
  assert.match(navigation.payload.url, /studentId=student-1/)
  assert.equal(typeof navigation.payload.fail, 'function')
})

test('learning profile home redirects to parent management when navigateTo fails', async () => {
  const wx = createWxMock({
    navigateTo: payload => {
      wx.calls.push({ name: 'navigateTo', payload })
      payload.fail({ errMsg: 'navigateTo:fail webview count limit exceed' })
      return Promise.resolve(payload)
    }
  })
  const { page } = loadPage('miniprogram/pages/index/index.js', { wx })
  page.setData({
    activeStudentId: 'student-1',
    activeStudent: { _id: 'student-1', name: '钟青羽' },
    permissions: { canManageParents: true }
  })

  page.onParentManagement()

  const redirect = wx.calls.find(call => call.name === 'redirectTo')
  assert.match(redirect.payload.url, /pages\/parent-management\/parent-management/)
  assert.match(redirect.payload.url, /studentId=student-1/)
})

test('learning profile home shows a message when parent management has no active student', async () => {
  const wx = createWxMock()
  const { page } = loadPage('miniprogram/pages/index/index.js', { wx })

  page.onParentManagement()

  assert.equal(wx.calls.find(call => call.name === 'navigateTo'), undefined)
  assert.equal(wx.calls.find(call => call.name === 'showToast').payload.title, '缺少孩子档案信息')
})

test('learning profile home uses shared access and lets co-parents operate learning workflows', async () => {
  const wx = createWxMock({ cloud: { callFunction: async () => ({ result: { success: true, status: 'none', paper: null } }) } })
  const cloud = {
    getAccessibleStudents: async () => [{
      _id: 'student-1',
      name: '钟青羽',
      grade: 6,
      role: 'viewer',
      permissions: { canView: true, canManageParents: false, canUpload: true, canGeneratePaper: true }
    }],
    getStudentDashboard: async studentId => ({
      student: { _id: studentId, name: '钟青羽', grade: 6 },
      permissions: { canView: true, canManageParents: false, canUpload: true, canGeneratePaper: true },
      subjectProfiles: [{
        subject: 'math',
        totalReports: 1,
        currentBottlenecks: [{ lpCode: 'LP-001', lpName: '计算错误（加减乘除）', status: 'needs_verification' }]
      }],
      recentReports: [{ _id: 'report-1', subject: 'math', status: 'completed', createdAt: '2026-06-12T10:00:00Z' }],
      recentPapers: []
    }),
    getActiveVerificationPaper: async () => ({ status: 'ready', paper: { _id: 'paper-1' } })
  }
  const { page } = loadPage('miniprogram/pages/index/index.js', {
    wx,
    modules: {
      '../../utils/cloud': cloud,
      '../../utils/util': { ...util, formatRelativeTime: () => '今天' }
    }
  })

  await page.loadStudents()
  page._cloud = cloud  // 供 shared-navigation 的 navigateToVerificationByStatus 使用
  assert.equal(page.data.homeMode, 'single-profile')
  assert.equal(page.data.permissions.canUpload, true)
  assert.equal(page.data.permissions.canManageParents, false)
  assert.equal(page.data.home.nextAction.primaryText, '下载验证卷')

  page.onPrimaryAction()
  await waitForPageLoad(page)
  assert.match(wx.calls.find(call => call.name === 'navigateTo').payload.url, /paper-preview\/paper-preview\?paperId=paper-1/)
})

test('index shared dashboard path avoids duplicate legacy profile reads', async () => {
  let subjectProfileCalls = 0
  let dashboardCalls = 0
  const cloud = {
    getAccessibleStudents: async () => [{
      _id: 'student-1',
      name: '钟青羽',
      grade: 6,
      permissions: { canView: true, canManageParents: true, canUpload: true, canGeneratePaper: true }
    }],
    getSubjectProfiles: async () => {
      subjectProfileCalls += 1
      return []
    },
    getStudentDashboard: async studentId => {
      dashboardCalls += 1
      return {
        student: { _id: studentId, name: '钟青羽', grade: 6 },
        permissions: { canView: true, canManageParents: true, canUpload: true, canGeneratePaper: true },
        subjectProfiles: [{
          subject: 'math',
          totalReports: 2,
          updatedAt: '2026-06-12T10:00:00Z',
          currentBottlenecks: []
        }],
        recentReports: [],
        recentPapers: []
      }
    },
    getReports: async () => { throw new Error('legacy reports should not be needed') },
    getPapers: async () => { throw new Error('legacy papers should not be needed') }
  }
  const { page } = loadPage('miniprogram/pages/index/index.js', {
    modules: {
      '../../utils/cloud': cloud,
      '../../utils/util': { ...util, formatRelativeTime: () => '今天' }
    }
  })

  await page.loadStudents()

  assert.equal(dashboardCalls, 1)
  assert.equal(subjectProfileCalls, 0)
  assert.equal(page.data.students[0].totalReports, 2)
})

test('index loads every child through one home dashboard cloud call', async () => {
  let homeCalls = 0
  const cloud = {
    getHomeDashboard: async () => {
      homeCalls += 1
      return {
        children: [
          {
            student: { _id: 'student-1', name: '钟青羽', grade: 6, permissions: { canView: true } },
            role: 'owner',
            permissions: { canView: true, canManageParents: true, canUpload: true, canGeneratePaper: true },
            subjectProfiles: [{ subject: 'math', totalReports: 2, currentBottlenecks: [] }],
            recentReports: [],
            recentPapers: []
          },
          {
            student: { _id: 'student-2', name: '钟筱雨', grade: 3, permissions: { canView: true } },
            role: 'viewer',
            permissions: { canView: true, canManageParents: false, canUpload: true, canGeneratePaper: true },
            subjectProfiles: [],
            recentReports: [],
            recentPapers: []
          }
        ]
      }
    },
    getAccessibleStudents: async () => { throw new Error('legacy access must not run') },
    getStudentDashboard: async () => { throw new Error('per-child dashboard must not run') },
    getSubjectProfiles: async () => { throw new Error('legacy profiles must not run') },
    getReports: async () => { throw new Error('legacy reports must not run') },
    getPapers: async () => { throw new Error('legacy papers must not run') }
  }
  const { page } = loadPage('miniprogram/pages/index/index.js', {
    modules: {
      '../../utils/cloud': cloud,
      '../../utils/util': { ...util, formatRelativeTime: () => '今天' }
    }
  })

  await page.loadStudents()

  assert.equal(homeCalls, 1)
  assert.equal(page.data.students.length, 2)
  assert.equal(page.data.homeMode, 'family-workbench')
})

test('index keeps an empty aggregate home response to one cloud call', async () => {
  let homeCalls = 0
  const cloud = {
    getHomeDashboard: async () => {
      homeCalls += 1
      return { children: [] }
    },
    getStudents: async () => { throw new Error('empty aggregate response must not use legacy reads') }
  }
  const { page } = loadPage('miniprogram/pages/index/index.js', {
    modules: { '../../utils/cloud': cloud }
  })

  await page.loadStudents()

  assert.equal(homeCalls, 1)
  assert.equal(page.data.homeMode, 'empty')
  assert.equal(page.data.loading, false)
})

test('index onShow reuses a fresh dashboard snapshot instead of refetching immediately', async () => {
  let accessibleCalls = 0
  let dashboardCalls = 0
  const cloud = {
    getAccessibleStudents: async () => {
      accessibleCalls += 1
      return [{ _id: 'student-1', name: '钟青羽', grade: 6 }]
    },
    getStudentDashboard: async studentId => {
      dashboardCalls += 1
      return {
        student: { _id: studentId, name: '钟青羽', grade: 6 },
        permissions: { canView: true, canManageParents: true, canUpload: true, canGeneratePaper: true },
        subjectProfiles: [],
        recentReports: [],
        recentPapers: []
      }
    }
  }
  const { page } = loadPage('miniprogram/pages/index/index.js', {
    modules: {
      '../../utils/cloud': cloud,
      '../../utils/util': { ...util, formatRelativeTime: () => '今天' }
    }
  })

  await page.loadStudents()
  await page.loadStudents()

  assert.equal(accessibleCalls, 1)
  assert.equal(dashboardCalls, 1)
  assert.equal(page.data.homeMode, 'single-profile')
})

test('index uses getHomeDashboard as a single aggregated call when available', async () => {
  let homeDashboardCalls = 0
  let accessibleCalls = 0
  let dashboardCalls = 0
  const cloud = {
    getHomeDashboard: async () => {
      homeDashboardCalls++
      return {
        students: [
          { _id: 'student-1', name: '钟青羽', grade: 5, createdAt: '2026-06-01', role: 'owner', permissions: { canView: true, canUpload: true, canGeneratePaper: true, canRetryAnalysis: true, canManageParents: true } },
          { _id: 'student-2', name: '钟筱雨', grade: 3, createdAt: '2026-06-02', role: 'owner', permissions: { canView: true, canUpload: true, canGeneratePaper: true, canRetryAnalysis: true, canManageParents: true } }
        ],
        perStudent: {
          'student-1': {
            subjectProfiles: [{ _id: 'p1', studentId: 'student-1', subject: 'math', subjectName: '数学', totalReports: 2, pendingBottlenecks: [], updatedAt: '2026-06-11T10:00:00Z' }],
            latestReportSummary: { _id: 'r1', studentId: 'student-1', subject: 'math', type: 'diagnosis', status: 'completed', summary: '计算基础', totalErrors: 2, bottlenecks: [], createdAt: '2026-06-12T09:30:00Z' },
            latestPaperSummary: null
          },
          'student-2': {
            subjectProfiles: [{ _id: 'p2', studentId: 'student-2', subject: 'math', subjectName: '数学', totalReports: 0, pendingBottlenecks: [], updatedAt: '2026-06-10T10:00:00Z' }],
            latestReportSummary: null,
            latestPaperSummary: null
          }
        }
      }
    },
    getAccessibleStudents: async () => { accessibleCalls++; return [] },
    getStudentDashboard: async () => { dashboardCalls++; return {} }
  }
  const { page } = loadPage('miniprogram/pages/index/index.js', {
    modules: {
      '../../utils/cloud': cloud,
      '../../utils/util': { ...util, formatRelativeTime: () => '今天' }
    }
  })

  await page.loadStudents()

  assert.equal(homeDashboardCalls, 1, 'should call getHomeDashboard once')
  assert.equal(accessibleCalls, 0, 'should NOT call getAccessibleStudents when getHomeDashboard is available')
  assert.equal(dashboardCalls, 0, 'should NOT call getStudentDashboard per student')
  assert.equal(page.data.homeMode, 'family-workbench')
  assert.equal(page.data.students.length, 2)
  assert.ok(page.data.childCards.length > 0)
})

test('index falls back to 1+N path when getHomeDashboard throws', async () => {
  let homeDashboardCalls = 0
  let accessibleCalls = 0
  const cloud = {
    getHomeDashboard: async () => { homeDashboardCalls++; throw new Error('not deployed yet') },
    getAccessibleStudents: async () => { accessibleCalls++; return [{ _id: 'student-1', name: '钟青羽', grade: 5, createdAt: '2026-06-01' }] },
    getStudentDashboard: async () => ({
      subjectProfiles: [],
      recentReports: [],
      recentPapers: []
    }),
    getSubjectProfiles: async () => [],
    getReports: async () => [],
    getPapers: async () => []
  }
  const { page } = loadPage('miniprogram/pages/index/index.js', {
    modules: {
      '../../utils/cloud': cloud,
      '../../utils/util': { ...util, formatRelativeTime: () => '今天' }
    }
  })

  await page.loadStudents()

  assert.equal(homeDashboardCalls, 1, 'should try getHomeDashboard first')
  assert.equal(accessibleCalls, 1, 'should fall back to getAccessibleStudents')
  assert.equal(page.data.homeMode, 'single-profile')
})

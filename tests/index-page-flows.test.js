const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const ROOT = path.resolve(__dirname, '..')
const { loadPageAndWait, flushAsync, waitForPageLoad, isThenable } = require('./helpers/page-flow-utils')
const { createWxMock, loadPage } = require('./helpers/page-harness')
const util = require('../miniprogram/utils/util')

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
    getStudents: async () => [{ _id: 'student-1', name: '钟青羽', grade: 5 }],
    getSubjectProfiles: async () => [{ subject: 'math', totalReports: 2, updatedAt: '2026-06-11T10:00:00Z' }],
    getReports: async () => [],
    getPapers: async () => []
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
    getAccessibleStudents: async () => [],
    getStudents: async () => []
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
  const cloud = {
    getAccessibleStudents: async () => { throw new Error('shared access down') },
    getStudents: async () => { throw new Error('legacy access down') }
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
  assert.match(page.data.errorText, /学习档案加载失败/)
  assert.equal(wx.calls.some(call => call.name === 'showToast' && call.payload.title === '加载失败'), true)
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
    getStudents: async () => [],
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
    getStudents: async () => [
      { _id: 'student-1', name: '钟青羽', grade: 6 },
      { _id: 'student-2', name: '弟弟', grade: 3 }
    ],
    getSubjectProfiles: async studentId => studentId === 'student-1'
      ? [{ subject: 'math', totalReports: 2, currentBottlenecks: [{ lpCode: 'LP-001', status: 'needs_verification' }] }]
      : [{ subject: 'math', totalReports: 0, currentBottlenecks: [] }],
    getReports: async () => [],
    getPapers: async () => []
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

test('index family workbench renders actionable card sections instead of old latest rows', () => {
  const wxml = fs.readFileSync(path.join(ROOT, 'miniprogram/pages/index/index.wxml'), 'utf8')
  const wxss = fs.readFileSync(path.join(ROOT, 'miniprogram/pages/index/index.wxss'), 'utf8')

  assert.match(wxml, /family-workbench-hero/)
  assert.match(wxml, /home-error-state/)
  assert.match(wxml, /onRetryLoadStudents/)
  assert.doesNotMatch(wxml, /\/assets\/images\//)
  assert.match(wxml, /child-priority-action/)
  assert.match(wxml, /secondary-action-grid/)
  assert.match(wxml, /child-quick-grid/)
  assert.match(wxml, /AI 用量/)
  assert.match(wxml, /\/pages\/ai-usage\/ai-usage/)
  assert.doesNotMatch(wxml, /child-latest-row/)
  assert.doesNotMatch(wxml, /child-next-row/)

  assert.match(wxss, /\.child-priority-action/)
  assert.match(wxss, /\.secondary-action-card/)
  assert.match(wxss, /\.child-quick-link/)
  assert.match(wxss, /\.family-workbench-hero/)
})

test('index and student profile render the redesigned personal action workbench', () => {
  const indexWxml = fs.readFileSync(path.join(ROOT, 'miniprogram/pages/index/index.wxml'), 'utf8')
  const profileWxml = fs.readFileSync(path.join(ROOT, 'miniprogram/pages/student-profile/student-profile.wxml'), 'utf8')
  const wxss = fs.readFileSync(path.join(ROOT, 'miniprogram/pages/index/index.wxss'), 'utf8')

  for (const wxml of [indexWxml, profileWxml]) {
    assert.match(wxml, /personal-hero-card/)
    assert.match(wxml, /personal-primary-action/)
    assert.match(wxml, /personal-report-card/)
    assert.match(wxml, /personal-action-queue/)
    assert.match(wxml, /personal-subject-list/)
    assert.doesNotMatch(wxml, /\/assets\/images\//)
  }

  assert.doesNotMatch(profileWxml, /coverage-card/)
  assert.doesNotMatch(profileWxml, /metric-strip/)
  assert.doesNotMatch(profileWxml, /highlight-row/)
  assert.doesNotMatch(profileWxml, /record-row/)
  assert.doesNotMatch(profileWxml, /next-card/)
  assert.doesNotMatch(profileWxml, /subject-grid/)

  assert.match(wxss, /\.personal-hero-card/)
  assert.match(wxss, /\.personal-primary-action/)
  assert.match(wxss, /\.personal-report-card/)
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
    getStudents: async () => [{ _id: 'student-1', name: '钟青羽', grade: 6 }],
    getSubjectProfiles: async studentId => {
      assert.equal(studentId, 'student-1')
      return [{
        subject: 'math',
        subjectName: '数学',
        totalReports: 1,
        updatedAt: '2026-06-12T14:20:00+08:00',
        currentBottlenecks: [
          { lpCode: 'LP-001', lpName: '计算错误（加减乘除）', status: 'needs_verification' }
        ]
      }]
    },
    getReports: async (studentId, subject) => {
      assert.equal(studentId, 'student-1')
      assert.equal(subject, undefined)
      return [{
        _id: 'report-1',
        subject: 'math',
        type: 'diagnosis',
        status: 'completed',
        isEffective: true,
        createdAt: '2026-06-12T14:20:00+08:00',
        bottlenecks: [{ lpCode: 'LP-001', lpName: '计算错误（加减乘除）' }]
      }]
    },
    getPapers: async filter => {
      assert.deepEqual(JSON.parse(JSON.stringify(filter)), { studentId: 'student-1' })
      return []
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

test('learning profile home falls back to legacy student reads when shared access is unavailable', async () => {
  const cloud = {
    getAccessibleStudents: async () => { throw new Error('cloud function not found') },
    getStudents: async () => [{ _id: 'student-1', name: '钟青羽', grade: 6 }],
    getSubjectProfiles: async () => [{
      subject: 'math',
      subjectName: '数学',
      totalReports: 2,
      updatedAt: '2026-06-12T14:20:00+08:00',
      currentBottlenecks: [{ lpCode: 'LP-001', lpName: '计算错误（加减乘除）', status: 'needs_verification' }]
    }],
    getStudentDashboard: async () => { throw new Error('studentData not deployed') },
    getReports: async () => [{
      _id: 'report-1',
      subject: 'math',
      type: 'diagnosis',
      status: 'completed',
      createdAt: '2026-06-12T14:20:00+08:00',
      summary: '发现计算基础卡点'
    }],
    getPapers: async () => [{
      _id: 'paper-1',
      subject: 'math',
      type: 'verification',
      createdAt: '2026-06-13T10:00:00+08:00',
      questions: [{}, {}, {}],
      bottleneckSummaries: ['计算基础']
    }]
  }
  const { page } = loadPage('miniprogram/pages/index/index.js', {
    modules: {
      '../../utils/cloud': cloud,
      '../../utils/util': { ...util, formatRelativeTime: () => '今天' }
    }
  })

  await page.loadStudents()

  assert.equal(page.data.homeMode, 'single-profile')
  assert.equal(page.data.hasStudents, true)
  assert.equal(page.data.activeStudent.name, '钟青羽')
  assert.equal(page.data.home.recentRecords.length, 2)
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
    getSubjectProfiles: async () => [],
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

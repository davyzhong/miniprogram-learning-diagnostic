const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const { createWxMock, loadPage } = require('./helpers/page-harness')
const util = require('../miniprogram/utils/util')

const ROOT = path.resolve(__dirname, '..')




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
  assert.match(wxml, /math-diagnostic-guide\.jpg/)
  assert.match(wxml, /child-priority-action/)
  assert.match(wxml, /secondary-action-grid/)
  assert.match(wxml, /child-quick-grid/)
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
    assert.match(wxml, /student-profile-hero\.png/)
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
  assert.match(indexWxml, /class="family-hero-image"[^>]*mode="aspectFill"/)
  assert.match(indexWxml, /class="personal-hero-image"[^>]*mode="aspectFill"/)
  assert.match(profileWxml, /class="personal-hero-image"[^>]*mode="aspectFill"/)
  assert.doesNotMatch(profileWxml, /back-arrow/)
  assert.doesNotMatch(profileWxml, /class="top-left" bindtap="onBackHome"/)
  assert.doesNotMatch(profileWxml, /返回首页/)
})

test('theme illustrations are wired into downstream learning pages', () => {
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

  assert.match(subjectHomeWxml, /subjectIllustration\.imageSrc/)
  assert.match(reportWxml, /heroIllustration\.imageSrc/)
  assert.match(verificationWxml, /verification-paper-hero\.jpg/)
  assert.match(knowledgeMapWxml, /knowledge-map-hero\.jpg/)
  assert.match(resourceWxml, /learning-resource-hero\.jpg/)
  assert.match(uploadWxml, /upload-photo-hero\.jpg/)
  assert.match(historyWxml, /learning-history-hero\.jpg/)
  assert.match(englishPracticeWxml, /english-practice-hero\.jpg/)
  assert.match(englishDictationWxml, /english-dictation-hero\.jpg/)
  assert.match(englishWrongWordsWxml, /english-wrong-words-hero\.jpg/)
  assert.match(defaultPaperWxml, /verification-paper-hero\.jpg/)
  assert.match(paperPreviewWxml, /verification-paper-hero\.jpg/)
  assert.match(bottleneckCenterWxml, /knowledge-map-hero\.jpg/)
  assert.match(bottleneckDetailWxml, /learning-resource-hero\.jpg/)
  assert.match(addStudentWxml, /student-profile-hero\.png/)
  assert.match(joinStudentWxml, /math-diagnostic-guide\.jpg/)
  assert.match(parentManagementWxml, /math-diagnostic-guide\.jpg/)

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
    assert.match(source, /mode="aspectFill"/)
  }
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
  await page.onBottleneckAction({ currentTarget: { dataset: { subject: 'math', lpCode: 'LP-001' } } })
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

  await page.onPrimaryAction()
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

  await page.onShow()
  await page.onShow()

  assert.equal(accessibleCalls, 1)
  assert.equal(dashboardCalls, 1)
  assert.equal(page.data.homeMode, 'single-profile')
})

test('student profile page loads one child and keeps profile actions clickable', async () => {
  const wx = createWxMock()
  const cloud = {
    getStudentDashboard: async studentId => {
      assert.equal(studentId, 'student-1')
      return {
        student: { _id: 'student-1', name: '钟青羽', grade: 6 },
        permissions: { canView: true, canManageParents: true, canUpload: true, canGeneratePaper: true },
        subjectProfiles: [{
          subject: 'math',
          totalReports: 1,
          currentBottlenecks: [{ lpCode: 'LP-001', lpName: '计算错误（加减乘除）', status: 'needs_verification' }]
        }],
        recentReports: [{
          _id: 'report-1',
          subject: 'math',
          type: 'diagnosis',
          status: 'completed',
          createdAt: '2026-06-12T10:00:00Z',
          bottlenecks: [{ lpCode: 'LP-001' }]
        }],
        recentPapers: []
      }
    }
  }
  const { page } = loadPage('miniprogram/pages/student-profile/student-profile.js', {
    wx,
    modules: {
      '../../utils/cloud': cloud,
      '../../utils/util': { ...util, formatRelativeTime: () => '今天' }
    }
  })

  await page.onLoad({ studentId: 'student-1' })

  assert.equal(page.data.home.studentName, '钟青羽')
  assert.equal(page.data.home.nextAction.primaryText, '下载验证卷')
  page.onPrimaryReportTap()
  page.onViewAllRecords()
  page.onSubjectTap({ currentTarget: { dataset: { subject: 'math' } } })
  const urls = wx.calls.filter(call => call.name === 'navigateTo').map(call => call.payload.url)
  assert.match(urls[0], /pages\/report\/report\?id=report-1/)
  assert.match(urls[1], /pages\/upload-history\/upload-history/)
  assert.match(urls[2], /pages\/subject-home\/subject-home/)
})

test('student profile reuses a fresh dashboard snapshot on repeated loads', async () => {
  let dashboardCalls = 0
  const cloud = {
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
  const { page } = loadPage('miniprogram/pages/student-profile/student-profile.js', {
    modules: {
      '../../utils/cloud': cloud,
      '../../utils/util': { ...util, formatRelativeTime: () => '今天' }
    }
  })
  page.setData({ studentId: 'student-1' })

  await page.loadProfile()
  await page.loadProfile()

  assert.equal(dashboardCalls, 1)
  assert.equal(page.data.loading, false)
  assert.equal(page.data.home.studentName, '钟青羽')
})

test('bottleneck center loads dashboard bottlenecks and filters by status', async () => {
  let dashboardArgs = null
  const cloud = {
    getStudentDashboard: async (...args) => {
      const [studentId] = args
      dashboardArgs = args
      assert.equal(studentId, 'student-1')
      return {
        student: { _id: 'student-1', name: '钟青羽' },
        subjectProfiles: [{
          subject: 'math',
          currentBottlenecks: [
            { lpCode: 'LP-001', status: 'persisting', trend: 'persisting', weight: 80, evidenceCount: 3 },
            { lpCode: 'LP-008', status: 'improved', trend: 'declining', weight: 30, verificationPassCount: 1 }
          ]
        }]
      }
    },
    getActiveVerificationPaper: async () => ({ status: 'ready', paper: { _id: 'paper-1' } })
  }
  const wx = createWxMock()
  const { page } = loadPage('miniprogram/pages/bottleneck-center/bottleneck-center.js', {
    wx,
    modules: { '../../utils/cloud': cloud }
  })

  await page.onLoad({ studentId: 'student-1', studentName: encodeURIComponent('钟青羽') })

  assert.deepEqual(JSON.parse(JSON.stringify(dashboardArgs)), ['student-1', { includeRecent: false }])
  assert.equal(page.data.stats.totalCount, 2)
  assert.equal(page.data.stats.activeCount, 1)
  assert.equal(page.data.filteredBottlenecks[0].displayName, '计算基础')

  page.onStatusFilterTap({ currentTarget: { dataset: { status: 'improved' } } })
  assert.deepEqual(JSON.parse(JSON.stringify(page.data.filteredBottlenecks.map(item => item.displayName))), ['审题理解'])

  page.onBottleneckTap({ currentTarget: { dataset: { subject: 'math', lpCode: 'LP-001' } } })
  await page.onGenerateForBottleneck({ currentTarget: { dataset: { subject: 'math', lpCode: 'LP-001' } } })
  const urls = wx.calls.filter(call => call.name === 'navigateTo').map(call => call.payload.url)
  assert.match(urls[0], /pages\/bottleneck-detail\/bottleneck-detail/)
  // 统一入口：ready 时跳预览页
  assert.match(urls[1], /pages\/paper-preview\/paper-preview\?paperId=paper-1/)
})

test('bottleneck pages expose learning task pack actions before verification', () => {
  const fs = require('node:fs')
  const path = require('node:path')
  const detailWxml = fs.readFileSync(path.resolve(__dirname, '../miniprogram/pages/bottleneck-detail/bottleneck-detail.wxml'), 'utf8')
  const centerWxml = fs.readFileSync(path.resolve(__dirname, '../miniprogram/pages/bottleneck-center/bottleneck-center.wxml'), 'utf8')

  assert.match(detailWxml, /学一下/)
  assert.match(detailWxml, /onOpenLearningResource/)
  assert.match(centerWxml, /学一下/)
  assert.match(centerWxml, /onOpenLearningResource/)
})


test('bottleneck detail builds a focused evidence workbench without repetitive report and paper lists', async () => {
  let dashboardArgs = null
  const cloud = {
    getSubjectDashboard: async (...args) => {
      const [studentId, subject] = args
      dashboardArgs = args
      assert.equal(studentId, 'student-1')
      assert.equal(subject, 'math')
      return {
        profile: {
          subject: 'math',
          currentBottlenecks: [{
            lpCode: 'LP-001',
            status: 'persisting',
            trend: 'persisting',
            weight: 82,
            evidenceCount: 3,
            recentErrorCount: 5,
            firstSeenAt: '2026-06-08T09:00:00+08:00',
            lastSeenAt: '2026-06-12T09:00:00+08:00'
          }]
        },
        reports: [
          {
            _id: 'report-2',
            subject: 'math',
            type: 'verification',
            status: 'completed',
            paperId: 'paper-1',
            createdAt: '2026-06-12T11:30:00+08:00',
            comparisonSummary: '计算基础已改善，仍需观察口算稳定性',
            verificationTargets: ['LP-001'],
            verificationEvidence: [{ lpCode: 'LP-001', complete: true, allCorrect: true }]
          },
          {
            _id: 'report-1',
            subject: 'math',
            type: 'diagnosis',
            status: 'completed',
            createdAt: '2026-06-12T09:30:00+08:00',
            summary: '计算基础需要继续验证',
            totalErrors: 5,
            imageFiles: [{}, {}],
            bottlenecks: [{ lpCode: 'LP-001' }]
          }
        ],
        papers: [
          {
            _id: 'paper-2',
            subject: 'math',
            type: 'verification',
            createdAt: '2026-06-13T10:30:00+08:00',
            paperDisplayCode: '数学-20260613-01',
            questionCount: 8,
            studentPages: 2,
            answerPages: 1,
            bottleneckTargets: ['LP-001'],
            bottleneckSummaries: ['计算基础']
          },
          {
            _id: 'paper-1',
            subject: 'math',
            type: 'verification',
            createdAt: '2026-06-12T10:30:00+08:00',
            paperDisplayCode: '数学-20260612-01',
            questions: [{}, {}, {}, {}, {}, {}],
            studentPages: 1,
            answerPages: 1,
            bottleneckTargets: ['LP-001'],
            bottleneckSummaries: ['计算基础']
          }
        ]
      }
    },
    getActiveVerificationPaper: async () => ({ status: 'ready', paper: { _id: 'paper-2' } })
  }
  const wx = createWxMock()
  const { page } = loadPage('miniprogram/pages/bottleneck-detail/bottleneck-detail.js', {
    wx,
    modules: { '../../utils/cloud': cloud }
  })

  await page.onLoad({
    studentId: 'student-1',
    subject: 'math',
    lpCode: 'LP-001',
    studentName: encodeURIComponent('钟青羽')
  })

  assert.deepEqual(JSON.parse(JSON.stringify(dashboardArgs)), [
    'student-1',
    'math',
    { reportLimit: 10, paperLimit: 10 }
  ])
  assert.equal(page.data.bottleneck.displayName, '计算基础')
  assert.equal(page.data.relatedReports.length, 2)
  assert.equal(page.data.relatedPapers.length, 2)
  assert.equal(page.data.evidenceChain.length, 4)
  assert.equal(page.data.visibleEvidenceChain.length, 3)
  assert.equal(page.data.hiddenEvidenceCount, 1)
  assert.deepEqual(JSON.parse(JSON.stringify(page.data.visibleEvidenceChain.map(item => item.category))), ['验证试卷', '验证反馈', '验证试卷'])
  assert.deepEqual(JSON.parse(JSON.stringify(page.data.visibleEvidenceChain.map(item => item.title))), ['数学-20260613-01', '验证反馈', '数学-20260612-01'])
  assert.match(page.data.visibleEvidenceChain[0].url, /pages\/paper-preview\/paper-preview\?paperId=paper-2/)
  assert.match(page.data.visibleEvidenceChain[1].url, /pages\/report\/report\?id=report-2/)
  assert.ok(page.data.visibleEvidenceChain[0].metaChips.includes('待上传'))
  assert.ok(page.data.visibleEvidenceChain[1].metaChips.includes('关联 数学-20260612-01'))
  assert.ok(page.data.visibleEvidenceChain[2].metaChips.includes('已反馈'))

  page.onToggleEvidence()
  assert.equal(page.data.visibleEvidenceChain.length, 4)
  assert.equal(page.data.showAllEvidence, true)

  await page.onGenerateVerification()
  page.onViewReport({ currentTarget: { dataset: { id: 'report-1' } } })
  page.onViewPaper({ currentTarget: { dataset: { id: 'paper-1' } } })
  const urls = wx.calls.filter(call => call.name === 'navigateTo').map(call => call.payload.url)
  // 统一入口：ready 时跳预览页
  assert.match(urls[0], /pages\/paper-preview\/paper-preview\?paperId=paper-2/)
  assert.match(urls[1], /pages\/report\/report\?id=report-1/)
  assert.match(urls[2], /pages\/paper-preview\/paper-preview\?paperId=paper-1/)
})

test('bottleneck detail opens math fine-grained candidate by bottleneck id', async () => {
  const cloud = {
    getSubjectDashboard: async () => ({
      profile: {
        subject: 'math',
        currentBottlenecks: [{
          lpCode: 'LP-001',
          lpName: '计算错误（加减乘除）',
          status: 'needs_verification',
          errorCount: 8,
          candidateBottlenecks: [{
            bottleneckId: 'BN-DEC-MUL-POINT-COUNT',
            title: '小数乘法中小数位数累计规则不稳',
            evidenceStrength: 'high',
            microValidationRequired: true,
            recommendedResourceIds: ['RES-BILI-DEC-MUL-001']
          }]
        }]
      },
      reports: [{
        _id: 'report-1',
        subject: 'math',
        type: 'diagnosis',
        status: 'completed',
        createdAt: '2026-06-12T09:30:00+08:00',
        summary: '计算基础需要继续验证',
        totalErrors: 8,
        bottlenecks: [{ lpCode: 'LP-001' }]
      }],
      papers: []
    })
  }
  const { page } = loadPage('miniprogram/pages/bottleneck-detail/bottleneck-detail.js', {
    modules: { '../../utils/cloud': cloud }
  })

  await page.onLoad({
    studentId: 'student-1',
    subject: 'math',
    lpCode: 'LP-001',
    bottleneckId: 'BN-DEC-MUL-POINT-COUNT',
    studentName: encodeURIComponent('钟青羽')
  })

  assert.equal(page.data.bottleneck.displayName, '小数乘法中小数位数累计规则不稳')
  assert.equal(page.data.bottleneck.bottleneckId, 'BN-DEC-MUL-POINT-COUNT')
  assert.match(page.data.bottleneck.evidenceText, /归属计算基础/)
  assert.equal(page.data.relatedReports.length, 1)
})


test('subject home loads a compact action workbench', async () => {
  const cloud = {
    getSubjectProfile: async () => ({
      totalReports: 1,
      currentBottlenecks: [
        { lpCode: 'LP-001', lpName: '计算错误（加减乘除）', status: 'needs_verification', errorCount: 3 },
        { lpCode: 'LP-004', lpName: '单位换算错误', status: 'improved' }
      ]
    }),
    getReports: async () => [{
      _id: 'report-1',
      status: 'completed',
      isEffective: true,
      createdAt: '2026-06-12T14:20:00+08:00',
      changeSummary: '发现计算基础卡点'
    }]
  }
  const { page } = loadPage('miniprogram/pages/subject-home/subject-home.js', {
    modules: {
      '../../utils/cloud': cloud,
      '../../utils/util': { formatRelativeTime: () => '今天' },
      '../../utils/poller': { createPoller: () => ({ start() {}, stop() {}, isRunning: () => false }) }
    }
  })
  page.onLoad({
    studentId: 'student-1',
    subject: 'math',
    subjectName: encodeURIComponent('数学'),
    studentName: encodeURIComponent('钟青羽'),
    grade: '6'
  })

  await page.loadProfile()
  await page.loadRecords()

  assert.equal(page.data.subjectTitle, '数学工作台')
  assert.equal(page.data.primaryTask.actionType, 'verification')
  assert.deepEqual(JSON.parse(JSON.stringify(page.data.taskQueue.map(item => item.displayName))), ['计算基础'])
  assert.ok(page.data.tools.some(item => item.key === 'latestReport'))
})

test('subject home requests the shared dashboard without paper records for first paint', async () => {
  let dashboardArgs = null
  const cloud = {
    getSubjectDashboard: async (...args) => {
      dashboardArgs = args
      return {
        permissions: { canUpload: true, canGeneratePaper: true },
        profile: {
          totalReports: 1,
          currentBottlenecks: [{ lpCode: 'LP-001', status: 'needs_verification' }]
        },
        reports: [{ _id: 'report-1', status: 'completed', createdAt: '2026-06-12T10:00:00Z' }],
        papers: [{ _id: 'paper-should-not-be-needed' }]
      }
    }
  }
  const { page } = loadPage('miniprogram/pages/subject-home/subject-home.js', {
    modules: {
      '../../utils/cloud': cloud,
      '../../utils/util': { formatRelativeTime: () => '今天' },
      '../../utils/analysis-poller': { createAnalysisPoller: () => ({ start() {}, stop() {}, isRunning: () => false }) }
    }
  })
  page.onLoad({
    studentId: 'student-1',
    subject: 'math',
    subjectName: encodeURIComponent('数学'),
    studentName: encodeURIComponent('钟青羽'),
    grade: '6'
  })

  await page.loadProfile()

  assert.deepEqual(JSON.parse(JSON.stringify(dashboardArgs)), [
    'student-1',
    'math',
    { includePapers: false }
  ])
  assert.equal(page.data.primaryTask.actionType, 'verification')
})

test('subject home reuses a fresh dashboard snapshot until invalidated', async () => {
  let dashboardCalls = 0
  const cloud = {
    getSubjectDashboard: async () => {
      dashboardCalls += 1
      return {
        permissions: { canUpload: true, canGeneratePaper: true },
        profile: { totalReports: 0, currentBottlenecks: [] },
        reports: []
      }
    }
  }
  const { page } = loadPage('miniprogram/pages/subject-home/subject-home.js', {
    modules: {
      '../../utils/cloud': cloud,
      '../../utils/util': { formatRelativeTime: () => '今天' },
      '../../utils/analysis-poller': { createAnalysisPoller: () => ({ start() {}, stop() {}, isRunning: () => false }) }
    }
  })
  page.onLoad({
    studentId: 'student-1',
    subject: 'math',
    subjectName: encodeURIComponent('数学'),
    studentName: encodeURIComponent('钟青羽'),
    grade: '6'
  })

  await page.loadProfile()
  await page.loadProfile()
  assert.equal(dashboardCalls, 1)

  page.invalidateProfileCache()
  await page.loadProfile()
  assert.equal(dashboardCalls, 2)
})

test('English subject home loads vocabulary summary and opens English practice', async () => {
  const calls = []
  const cloud = {
    getSubjectDashboard: async () => ({
      permissions: { canUpload: true, canGeneratePaper: true },
      profile: { totalReports: 0, currentBottlenecks: [] },
      reports: []
    }),
    getEnglishVocabularySummary: async studentId => {
      calls.push(['summary', studentId])
      return {
        summary: {
          totalWords: 320,
          needsPracticeCount: 18,
          reviewingCount: 12,
          masteredCount: 90,
          dueReviewCount: 8
        },
        patternCount: 42
      }
    }
  }
  const wx = createWxMock()
  const { page } = loadPage('miniprogram/pages/subject-home/subject-home.js', {
    wx,
    modules: {
      '../../utils/cloud': cloud,
      '../../utils/util': { formatRelativeTime: () => '今天' },
      '../../utils/analysis-poller': { createAnalysisPoller: () => ({ start() {}, stop() {}, isRunning: () => false }) }
    }
  })
  page.onLoad({
    studentId: 'student-1',
    subject: 'english',
    subjectName: encodeURIComponent('英语'),
    studentName: encodeURIComponent('钟青羽'),
    grade: '6'
  })

  await page.loadProfile()
  page.onPrimaryAction()

  assert.deepEqual(calls, [['summary', 'student-1']])
  assert.equal(page.data.primaryTask.actionType, 'englishPractice')
  assert.equal(page.data.englishVocabularyStats.totalWords, 320)
  assert.deepEqual(page.data.englishActionCards.map(item => item.key), ['englishPractice', 'englishDictation'])
  assert.match(wx.calls.find(call => call.name === 'navigateTo').payload.url, /pages\/english-practice\/english-practice/)

  page.onEnglishActionTap({ currentTarget: { dataset: { actionType: 'englishDictation', disabled: false } } })
  assert.match(wx.calls.filter(call => call.name === 'navigateTo').at(-1).payload.url, /pages\/english-dictation\/english-dictation/)

  page.onToolTap({ currentTarget: { dataset: { key: 'englishWrongWords' } } })
  assert.match(wx.calls.filter(call => call.name === 'navigateTo').at(-1).payload.url, /pages\/english-wrong-words\/english-wrong-words/)
})

test('English subject home imports Zhong Qingyu personal vocabulary seed when empty', async () => {
  const calls = []
  let imported = false
  let resolveSeed
  const seedPromise = new Promise(resolve => {
    resolveSeed = resolve
  })
  const cloud = {
    getSubjectDashboard: async () => ({
      permissions: { canUpload: true, canGeneratePaper: true },
      profile: { totalReports: 0, currentBottlenecks: [] },
      reports: []
    }),
    getEnglishVocabularySummary: async studentId => ({
      summary: {
        totalWords: imported ? 505 : 0,
        needsPracticeCount: 0,
        reviewingCount: 0,
        masteredCount: 0,
        dueReviewCount: 0
      },
      weakWords: [],
      patternCount: 0,
      studentId
    }),
    seedEnglishPersonalVocabulary: async studentId => {
      calls.push(['seed', studentId])
      await seedPromise
      imported = true
      return { importedWordCount: 505, totalSeedWords: 505 }
    }
  }
  const wx = createWxMock()
  const { page } = loadPage('miniprogram/pages/subject-home/subject-home.js', {
    wx,
    modules: {
      '../../utils/cloud': cloud,
      '../../utils/util': { formatRelativeTime: () => '今天' },
      '../../utils/analysis-poller': { createAnalysisPoller: () => ({ start() {}, stop() {}, isRunning: () => false }) }
    }
  })
  page.onLoad({
    studentId: 'student-1',
    subject: 'english',
    subjectName: encodeURIComponent('英语'),
    studentName: encodeURIComponent('钟青羽'),
    grade: '6'
  })

  await page.loadProfile()

  assert.deepEqual(calls, [['seed', 'student-1']])
  assert.equal(page.data.englishVocabularyStats.totalWords, 0)

  resolveSeed()
  await page._englishAutoSeedPromise

  assert.equal(page.data.englishVocabularyStats.totalWords, 505)
  assert.equal(page.data.primaryTask.actionType, 'englishPractice')
  assert.ok(page.data.englishActionCards.every(item => item.disabled === false))
})

test('subject home shows learning workflow tools for co-parent access', async () => {
  const cloud = {
    getSubjectDashboard: async () => ({
      permissions: { canView: true, canManageParents: false, canUpload: true, canGeneratePaper: true, canRetryAnalysis: true },
      profile: {
        totalReports: 1,
        currentBottlenecks: [
          { lpCode: 'LP-001', lpName: '计算错误（加减乘除）', status: 'needs_verification' }
        ]
      },
      reports: [{ _id: 'report-1', status: 'completed', createdAt: '2026-06-12T10:00:00Z' }]
    })
  }
  const wx = createWxMock()
  const { page } = loadPage('miniprogram/pages/subject-home/subject-home.js', {
    wx,
    modules: {
      '../../utils/cloud': cloud,
      '../../utils/util': { formatRelativeTime: () => '今天' },
      '../../utils/poller': { createPoller: () => ({ start() {}, stop() {}, isRunning: () => false }) }
    }
  })
  page.onLoad({
    studentId: 'student-1',
    subject: 'math',
    subjectName: encodeURIComponent('数学'),
    studentName: encodeURIComponent('钟青羽'),
    grade: '6'
  })

  await page.loadProfile()
  assert.equal(page.data.canWriteActions, true)
  assert.deepEqual(page.data.tools.map(item => item.key), ['diagnosis', 'defaultPaper', 'history', 'latestReport'])
  assert.equal(page.data.primaryTask.actionType, 'verification')

  page.onTaskTap({ currentTarget: { dataset: { code: 'LP-001' } } })
  assert.match(wx.calls.find(call => call.name === 'navigateTo').payload.url, /bottleneck-detail/)
})


test('subject home task and primary actions open the focused workflow', async () => {
  const wx = createWxMock()
  const cloud = {
    getActiveVerificationPaper: async () => ({ status: 'ready', paper: { _id: 'paper-1' } })
  }
  const { page } = loadPage('miniprogram/pages/subject-home/subject-home.js', {
    wx,
    modules: {
      '../../utils/cloud': cloud,
      '../../utils/util': { formatRelativeTime: () => '' },
      '../../utils/poller': { createPoller: () => ({ start() {}, stop() {}, isRunning: () => false }) }
    }
  })
  page.setData({
    studentId: 'student-1',
    subject: 'math',
    subjectName: '数学',
    studentName: '钟青羽',
    grade: '6',
    primaryTask: { actionType: 'verification' },
    canWriteActions: true
  })

  page.onTaskTap({ currentTarget: { dataset: { code: 'LP-001' } } })
  await page.onPrimaryAction()

  const urls = wx.calls.filter(call => call.name === 'navigateTo').map(call => call.payload.url)
  assert.match(urls[0], /pages\/bottleneck-detail\/bottleneck-detail/)
  assert.match(urls[0], /lpCode=LP-001/)
  // 统一入口：ready 时跳预览页
  assert.match(urls[1], /pages\/paper-preview\/paper-preview\?paperId=paper-1/)
})

test('English practice page generates a 20 word familiarity session without patterns', async () => {
  const generated = []
  const cloud = {
    generateEnglishRecognitionSession: async payload => {
      generated.push(payload)
      return {
        sessionId: 'session-1',
        functionType: 'familiarity',
        wordItems: Array.from({ length: 20 }, (_, index) => ({
          queueKey: `word-${index + 1}:0`,
          wordId: `word-${index + 1}`,
          word: `word${index + 1}`,
          meanings: [`词义${index + 1}`],
          promptType: index % 2 === 0 ? 'chinese' : 'english'
        })),
        patternItems: []
      }
    }
  }
  const { page } = loadPage('miniprogram/pages/english-practice/english-practice.js', {
    modules: { '../../utils/cloud': cloud }
  })

  await page.onLoad({
    studentId: 'student-1',
    studentName: encodeURIComponent('钟青羽'),
    grade: '6'
  })

  assert.equal(generated[0].studentId, 'student-1')
  assert.equal(generated[0].wordLimit, 20)
  assert.equal(generated[0].dimension, 'familiarity')
  assert.equal(page.data.sessionId, 'session-1')
  assert.equal(page.data.functionType, 'familiarity')
  assert.equal(page.data.queue.length, 20)
  assert.equal(page.data.currentItem.word, 'word1')
  assert.match(page.data.currentItem.promptText, /看中文意思/)
  assert.doesNotMatch(page.data.currentItem.promptText, /听中文/)
  assert.equal(page.data.recordButtonText, '开始录音回答')
  assert.equal(page.data.queue[1].promptTypeText, '英文提示')
  assert.match(page.data.queue[1].promptText, /看英文单词/)
  assert.doesNotMatch(page.data.queue[1].promptText, /听英文/)
  assert.equal(page.data.patternItems.length, 0)
})

test('English practice pages avoid duplicate custom back controls', () => {
  const sources = [
    'miniprogram/pages/english-practice/english-practice.wxml',
    'miniprogram/pages/english-dictation/english-dictation.wxml',
    'miniprogram/pages/english-wrong-words/english-wrong-words.wxml'
  ].map(file => fs.readFileSync(path.join(ROOT, file), 'utf8'))

  for (const source of sources) {
    assert.doesNotMatch(source, /class="back"/)
    assert.doesNotMatch(source, /bindtap="onBack"/)
  }
})

test('bottleneck detail uses forward action wording instead of duplicate return wording', () => {
  const source = fs.readFileSync(path.join(ROOT, 'miniprogram/pages/bottleneck-detail/bottleneck-detail.wxml'), 'utf8')

  assert.doesNotMatch(source, /返回卡点中心/)
  assert.match(source, /查看全部卡点/)
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

test('English practice page hides Chinese prompt playback', () => {
  const source = fs.readFileSync(path.join(ROOT, 'miniprogram/pages/english-practice/english-practice.wxml'), 'utf8')

  assert.match(source, /wx:if="\{\{currentItem\.canPlayPrompt\}\}"/)
})

test('English practice page explains when no vocabulary words are available', async () => {
  const cloud = {
    generateEnglishRecognitionSession: async () => ({
      sessionId: 'session-empty',
      functionType: 'familiarity',
      wordItems: [],
      patternItems: []
    })
  }
  const { page } = loadPage('miniprogram/pages/english-practice/english-practice.js', {
    modules: { '../../utils/cloud': cloud }
  })

  await page.onLoad({
    studentId: 'student-1',
    studentName: encodeURIComponent('钟青羽'),
    grade: '6'
  })

  assert.equal(page.data.finished, false)
  assert.match(page.data.error, /还没有可练习单词/)
  assert.equal(page.data.queue.length, 0)
})

test('English practice page submits AI recognition attempts and requeues wrong words', async () => {
  const submitted = []
  const cloud = {
    generateEnglishRecognitionSession: async () => ({
      sessionId: 'session-1',
      functionType: 'familiarity',
      wordItems: [{
        queueKey: 'word-1:0',
        wordId: 'word-1',
        word: 'science',
        meanings: ['科学'],
        promptType: 'chinese'
      }],
      patternItems: []
    }),
    submitEnglishRecognitionAttempt: async payload => {
      submitted.push(payload)
      return {
        judgment: { status: 'incorrect', normalizedText: 'siense', confidence: 0.5, reason: '拼写不同' },
        shouldRepeat: true
      }
    }
  }
  const { page } = loadPage('miniprogram/pages/english-practice/english-practice.js', {
    modules: { '../../utils/cloud': cloud }
  })

  await page.onLoad({
    studentId: 'student-1',
    studentName: encodeURIComponent('钟青羽'),
    grade: '6'
  })
  await page.onRecognitionResult({ recognizedText: 'siense', audioFileID: 'cloud://audio-1' })

  assert.equal(submitted[0].targetWord, 'science')
  assert.equal(submitted[0].recognizedText, 'siense')
  assert.equal(submitted[0].dimension, 'familiarity')
  assert.ok(submitted[0].durationMs > 0)
  assert.equal(page.data.lastResult.status, 'incorrect')
  assert.equal(page.data.lastAnsweredItem.word, 'science')
  assert.equal(page.data.queue.length, 2)
  assert.equal(page.data.currentIndex, 1)
  assert.equal(page.data.currentItem.retryCount, 1)
})

test('English practice page cleans voice and prompt audio resources', async () => {
  let stopCount = 0
  const manager = {
    onStop: () => {},
    onError: () => {},
    start: () => {},
    stop: () => { stopCount += 1 }
  }
  const audio = {
    src: '',
    play: () => {},
    stop: () => { audio.stopped = true },
    destroy: () => { audio.destroyed = true }
  }
  const wx = createWxMock({
    createInnerAudioContext: () => audio
  })
  const cloud = {
    generateEnglishRecognitionSession: async () => ({
      sessionId: 'session-1',
      functionType: 'familiarity',
      wordItems: [{
        queueKey: 'word-1:0',
        wordId: 'word-1',
        word: 'science',
        meanings: ['科学'],
        promptType: 'chinese'
      }],
      patternItems: []
    })
  }
  const { page } = loadPage('miniprogram/pages/english-practice/english-practice.js', {
    wx,
    requirePlugin: () => ({
      getRecordRecognitionManager: () => manager,
      textToSpeech: options => options.success({ filename: '/tmp/prompt.mp3' })
    }),
    modules: { '../../utils/cloud': cloud }
  })

  await page.onLoad({ studentId: 'student-1' })
  page.startRecord()
  page.onPlayPromptTap()
  page.onUnload()

  assert.equal(stopCount, 1)
  assert.equal(audio.stopped, true)
  assert.equal(audio.destroyed, true)
})

test('English practice page gives immediate feedback when stopping recording', async () => {
  let stopCount = 0
  const manager = {
    onStop: handler => { manager.stopHandler = handler },
    onError: () => {},
    start: () => {},
    stop: () => { stopCount += 1 }
  }
  const cloud = {
    generateEnglishRecognitionSession: async () => ({
      sessionId: 'session-1',
      functionType: 'familiarity',
      wordItems: [{
        queueKey: 'word-1:0',
        wordId: 'word-1',
        word: 'science',
        meanings: ['科学'],
        promptType: 'chinese'
      }],
      patternItems: []
    }),
    submitEnglishRecognitionAttempt: async () => ({
      judgment: { status: 'correct', reason: '正确' },
      shouldRepeat: false
    })
  }
  const { page } = loadPage('miniprogram/pages/english-practice/english-practice.js', {
    requirePlugin: () => ({ getRecordRecognitionManager: () => manager }),
    modules: { '../../utils/cloud': cloud }
  })

  await page.onLoad({ studentId: 'student-1' })
  page.onRecordTap()
  assert.equal(page.data.recording, true)

  page.onRecordTap()
  assert.equal(stopCount, 1)
  assert.equal(page.data.recording, false)
  assert.equal(page.data.recognizing, true)
  assert.equal(page.data.recordButtonText, '正在识别...')

  await manager.stopHandler({ result: 'science', tempFilePath: '/tmp/audio.mp3' })
  assert.equal(page.data.recognizing, false)
  assert.equal(page.data.recordButtonText, '开始录音回答')
})

test('English dictation page creates a paper session and uploads answer photos', async () => {
  const uploaded = []
  const submitted = []
  const analyzed = []
  const cloud = {
    generateEnglishPaperDictationSession: async payload => ({
      sessionId: 'paper-session-1',
      functionType: 'spelling',
      wordItems: Array.from({ length: 20 }, (_, index) => ({
        queueKey: `word-${index + 1}:0`,
        wordId: `word-${index + 1}`,
        word: `word${index + 1}`,
        meanings: [`词义${index + 1}`],
        promptType: index % 2 === 0 ? 'chinese' : 'english'
      })),
      request: payload
    }),
    uploadPhoto: async (filePath, studentId, batchId) => {
      uploaded.push({ filePath, studentId, batchId })
      return `cloud://${filePath.split('/').pop()}`
    },
    submitEnglishDictationPhoto: async payload => {
      submitted.push(payload)
      return { success: true, analysisStatus: 'pending_analysis', photoFileIds: payload.photoFileIds }
    },
    analyzeEnglishDictationPhoto: async payload => {
      analyzed.push(payload)
      return {
        success: true,
        analysisStatus: 'completed',
        results: [
          { wordId: 'word-1', targetWord: 'word1', verdict: 'correct' },
          { wordId: 'word-2', targetWord: 'word2', verdict: 'incorrect' }
        ]
      }
    }
  }
  const wx = createWxMock({
    chooseMedia: options => options.success({
      tempFiles: [
        { tempFilePath: '/tmp/dictation-1.jpg', size: 100 },
        { tempFilePath: '/tmp/dictation-2.jpg', size: 120 }
      ]
    })
  })
  const { page } = loadPage('miniprogram/pages/english-dictation/english-dictation.js', {
    wx,
    modules: { '../../utils/cloud': cloud }
  })

  await page.onLoad({
    studentId: 'student-1',
    studentName: encodeURIComponent('钟青羽'),
    grade: '6'
  })
  page.onNextTap()
  await page.onChoosePhotoTap()

  assert.equal(page.data.sessionId, 'paper-session-1')
  assert.equal(page.data.queue.length, 20)
  assert.equal(page.data.paperInstruction, '请按题号一行一个词写英文，保留修改痕迹。')
  assert.match(page.data.queue[0].promptText, /看中文意思/)
  assert.match(page.data.queue[1].promptText, /看英文单词/)
  assert.doesNotMatch(page.data.queue[0].promptText, /AI 读词|听中文/)
  assert.equal(page.data.currentIndex, 1)
  assert.equal(page.data.currentItem.word, 'word2')
  assert.equal(uploaded.length, 2)
  assert.equal(uploaded[0].studentId, 'student-1')
  assert.equal(submitted[0].sessionId, 'paper-session-1')
  assert.ok(submitted[0].durationMs > 0)
  assert.deepEqual(JSON.parse(JSON.stringify(submitted[0].photoFileIds)), ['cloud://dictation-1.jpg', 'cloud://dictation-2.jpg'])
  assert.equal(analyzed[0].sessionId, 'paper-session-1')
  assert.equal(page.data.analysisStatus, 'completed')
  assert.equal(page.data.dictationResults.length, 2)
  assert.equal(page.data.uploadedPhotoCount, 2)
  assert.equal(page.data.dictationPhase, 'reviewed')
})

test('English dictation page starts in ready phase with a 20-word preview list', async () => {
  const cloud = {
    generateEnglishPaperDictationSession: async () => ({
      sessionId: 'paper-session-1',
      functionType: 'spelling',
      wordItems: Array.from({ length: 20 }, (_, index) => ({
        queueKey: `word-${index + 1}:0`,
        wordId: `word-${index + 1}`,
        word: `word${index + 1}`,
        meanings: [`词义${index + 1}`],
        unit: `Unit ${Math.floor(index / 5) + 1}`,
        promptType: index % 2 === 0 ? 'chinese' : 'english',
        spellingStatus: index % 3 === 0 ? 'needs_practice' : 'untested'
      }))
    })
  }
  const { page } = loadPage('miniprogram/pages/english-dictation/english-dictation.js', {
    wx: createWxMock(),
    modules: { '../../utils/cloud': cloud }
  })

  await page.onLoad({ studentId: 'student-1', studentName: encodeURIComponent('钟青羽'), grade: '6' })

  assert.equal(page.data.dictationPhase, 'ready')
  assert.equal(page.data.playbackState, 'idle')
  assert.equal(page.data.queue.length, 20)
  assert.equal(page.data.wordListExpanded, true)
  assert.match(page.data.commandHint, /开始/)
  assert.equal(page.data.queue[0].word, 'word1')
  assert.equal(page.data.queue[0].meaningText, '词义1')
})

test('English dictation page auto-plays after start and advances on OK style commands', async () => {
  const spoken = []
  const timers = []
  const cloud = {
    generateEnglishPaperDictationSession: async () => ({
      sessionId: 'paper-session-1',
      functionType: 'spelling',
      wordItems: [
        { queueKey: 'word-1:0', wordId: 'word-1', word: 'science', meanings: ['科学'], promptType: 'chinese' },
        { queueKey: 'word-2:0', wordId: 'word-2', word: 'museum', meanings: ['博物馆'], promptType: 'english' }
      ]
    })
  }
  const { page } = loadPage('miniprogram/pages/english-dictation/english-dictation.js', {
    wx: createWxMock({
      createInnerAudioContext: () => ({
        src: '',
        play: () => {},
        stop: () => {},
        destroy: () => {}
      })
    }),
    setTimeout: (fn, ms) => {
      timers.push({ fn, ms })
      return timers.length
    },
    requirePlugin: () => ({
      getRecordRecognitionManager: () => ({ onStop: () => {}, onError: () => {}, start: () => {}, stop: () => {} }),
      textToSpeech: options => {
        spoken.push({ lang: options.lang, content: options.content })
        options.success({ filename: '/tmp/prompt.mp3' })
      }
    }),
    modules: { '../../utils/cloud': cloud }
  })

  await page.onLoad({ studentId: 'student-1' })
  page.onStartTap()

  assert.equal(page.data.dictationPhase, 'running')
  assert.equal(page.data.playbackState, 'writing')
  assert.equal(page.data.wordListExpanded, false)
  assert.deepEqual(spoken[0], { lang: 'zh_CN', content: '科学' })
  assert.equal(timers[0].ms, 7000)

  timers[0].fn()
  assert.equal(page.data.playbackState, 'waitingCommand')
  assert.match(page.data.commandHint, /好了/)

  page.handleVoiceNextCommand('OK')
  assert.equal(page.data.currentIndex, 1)
  assert.equal(page.data.dictationPhase, 'running')
  assert.deepEqual(spoken[1], { lang: 'en_US', content: 'museum' })
})

test('English dictation page supports optional voice next command and cleans resources', async () => {
  let stopCount = 0
  let onStopHandler = null
  const manager = {
    onStop: handler => { onStopHandler = handler },
    onError: () => {},
    start: () => {},
    stop: () => { stopCount += 1 }
  }
  const audio = {
    src: '',
    play: () => {},
    stop: () => { audio.stopped = true },
    destroy: () => { audio.destroyed = true }
  }
  const wx = createWxMock({
    createInnerAudioContext: () => audio
  })
  const cloud = {
    generateEnglishPaperDictationSession: async () => ({
      sessionId: 'paper-session-1',
      functionType: 'spelling',
      wordItems: [
        { queueKey: 'word-1:0', wordId: 'word-1', word: 'science', meanings: ['科学'], promptType: 'chinese' },
        { queueKey: 'word-2:0', wordId: 'word-2', word: 'museum', meanings: ['博物馆'], promptType: 'english' }
      ]
    })
  }
  const { page } = loadPage('miniprogram/pages/english-dictation/english-dictation.js', {
    wx,
    requirePlugin: () => ({
      getRecordRecognitionManager: () => manager,
      textToSpeech: options => options.success({ filename: '/tmp/prompt.mp3' })
    }),
    modules: { '../../utils/cloud': cloud }
  })

  await page.onLoad({ studentId: 'student-1' })
  page.onPlayPromptTap()
  page.onStartTap()
  page.onVoiceNextTap()
  onStopHandler({ result: '好了，下一个' })

  assert.equal(page.data.currentIndex, 1)
  assert.equal(page.data.recordingCommand, false)

  page.onUnload()
  assert.equal(stopCount, 1)
  assert.equal(audio.stopped, true)
  assert.equal(audio.destroyed, true)
})

test('English wrong words page summarizes weak vocabulary and opens practice flows', async () => {
  const wx = createWxMock()
  const cloud = {
    getEnglishVocabularySummary: async studentId => ({
      studentId,
      summary: {
        totalWords: 505,
        familiarity: { needsPracticeCount: 3, dueReviewCount: 2 },
        spelling: { needsPracticeCount: 5, dueReviewCount: 4 },
        overall: { masteredCount: 120 }
      },
      weakWords: [
        { wordId: 'word-1', word: 'Wednesday', wrongCount: 3, meanings: ['星期三'] },
        { wordId: 'word-2', word: 'science', wrongCount: 2, meanings: ['科学'] }
      ]
    })
  }
  const { page } = loadPage('miniprogram/pages/english-wrong-words/english-wrong-words.js', {
    wx,
    modules: { '../../utils/cloud': cloud }
  })

  await page.onLoad({
    studentId: 'student-1',
    studentName: encodeURIComponent('钟青羽'),
    grade: '6'
  })

  assert.equal(page.data.studentName, '钟青羽')
  assert.equal(page.data.summaryCards.find(item => item.key === 'weak').value, 8)
  assert.equal(page.data.summaryCards.find(item => item.key === 'review').value, 6)
  assert.equal(page.data.weakWords.length, 2)
  assert.equal(page.data.weakWords[0].displayMeaning, '星期三')
  assert.ok(page.data.groups.some(item => item.key === 'spellingWeak' && item.count === 5))

  page.onPracticeTap()
  assert.match(wx.calls.filter(call => call.name === 'navigateTo').at(-1).payload.url, /pages\/english-practice\/english-practice/)
  page.onDictationTap()
  assert.match(wx.calls.filter(call => call.name === 'navigateTo').at(-1).payload.url, /pages\/english-dictation\/english-dictation/)
})

test('upload selection warns about duplicate filenames but keeps the images', () => {
  const wx = createWxMock({
    chooseMedia: options => options.success({
      tempFiles: [
        { tempFilePath: '/tmp/paper.jpg', size: 100 },
        { tempFilePath: '/other/paper.jpg', size: 100 }
      ]
    })
  })
  const { page } = loadPage('miniprogram/pages/upload/upload.js', {
    wx,
    modules: { '../../utils/cloud': {} }
  })
  page.setData({ existingFileNames: ['paper.jpg'] })

  page.onChooseImage()
  assert.equal(page.data.images.length, 2)
  assert.ok(page.data.images.every(image => image.nameDuplicate))
  assert.equal(wx.calls.find(call => call.name === 'showToast').payload.title, '发现同名照片，仍可继续上传')
})

test('upload converts HEIF selections to JPEG before upload', async () => {
  let uploaded = null
  const wx = createWxMock({
    chooseMedia: options => options.success({
      tempFiles: [
        { tempFilePath: '/tmp/paper.HEIC', size: 100 }
      ]
    }),
    compressImage: options => {
      assert.equal(options.src, '/tmp/paper.HEIC')
      options.success({ tempFilePath: '/tmp/paper-converted.jpg' })
    },
    cloud: {
      uploadFile: options => {
        uploaded = options
        options.success({ fileID: 'cloud://paper-converted' })
      }
    }
  })
  const { page } = loadPage('miniprogram/pages/upload/upload.js', {
    wx,
    modules: { '../../utils/cloud': {} }
  })
  page.setData({ studentId: 'student-1', subject: 'math' })

  await page.onChooseImage()

  assert.equal(page.data.images.length, 1)
  assert.equal(page.data.images[0].tempPath, '/tmp/paper-converted.jpg')
  assert.equal(page.data.images[0].originalTempPath, '/tmp/paper.HEIC')
  assert.equal(page.data.images[0].fileName, 'paper.jpg')
  assert.equal(page.data.images[0].originalFileName, 'paper.HEIC')
  assert.equal(page.data.images[0].convertedFromHeif, true)

  const fileId = await page.uploadOne(page.data.images[0], 0)
  assert.equal(fileId, 'cloud://paper-converted')
  assert.equal(uploaded.filePath, '/tmp/paper-converted.jpg')
  assert.match(uploaded.cloudPath, /\.jpg$/)
})


test('upload submits file metadata and navigates back on success', async () => {
  let submitted = null
  const cloud = {
    callUploadAndAnalyze: async payload => {
      submitted = payload
      return { success: true, reportId: 'report-1' }
    }
  }
  const wx = createWxMock()
  const { page } = loadPage('miniprogram/pages/upload/upload.js', {
    wx,
    modules: { '../../utils/cloud': cloud }
  })
  page.uploadOne = async (_, index) => `cloud://photo-${index + 1}`
  page.setData({
    studentId: 'student-1',
    subject: 'math',
    mode: 'diagnosis',
    images: [{ tempPath: '/tmp/paper.jpg', fileName: 'paper.jpg', fileSize: 100 }]
  })

  await page.onSubmit()
  assert.deepEqual(
    JSON.parse(JSON.stringify(submitted.imageMetas)),
    [{ fileName: 'paper.jpg', fileSize: 100 }]
  )
  assert.equal(page.data.uploadProgress, 100)
  assert.equal(wx.calls.find(call => call.name === 'showToast').payload.title, '已提交，AI 正在分析')
  assert.ok(wx.calls.some(call => call.name === 'navigateBack'))
})

test('verification upload page shows the paper code context', async () => {
  const cloud = {
    getPaperDetail: async paperId => ({
      paper: {
        _id: paperId,
        subject: 'math',
        type: 'verification',
        paperDisplayCode: '数学-20260613-01',
        questions: [{}, {}, {}, {}, {}, {}]
      }
    })
  }
  const { page } = loadPage('miniprogram/pages/upload/upload.js', {
    modules: { '../../utils/cloud': cloud }
  })

  await page.loadPaperContext('paper-1')

  assert.equal(page.data.paperCodeText, '数学-20260613-01')
  assert.equal(page.data.paperName, '验证试卷')
  assert.equal(page.data.paperQuestionCount, 6)
})


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
  // 每页 5 个 BN：7 个 = 2 页（5 + 2）
  assert.equal(page.data.paperConfig.taskPageCount, 2)
  assert.deepEqual(
    JSON.parse(JSON.stringify(page.data.paperConfig.taskPages.map(item => item.targetCount))),
    [5, 2]
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

test('verification paper generation surfaces the backend error message', async () => {
  const cloud = {
    callGeneratePaper: async () => {
      throw new Error('云函数执行超时，请稍后重试')
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
    '云函数执行超时，请稍后重试'
  )
})

test('default paper reuses an existing generated paper', async () => {
  let generateCalls = 0
  const cloud = {
    callGeneratePaper: async () => {
      generateCalls += 1
      return { paperId: 'new-paper' }
    }
  }
  const wx = createWxMock()
  const { page } = loadPage('miniprogram/pages/default-paper/default-paper.js', {
    wx,
    modules: { '../../utils/cloud': cloud }
  })
  page.setData({
    studentId: 'student-1',
    subject: 'math',
    grade: 5,
    papers: [{ key: 'grade5_a', exists: true, paperId: 'existing-paper', questionCount: 20 }]
  })

  await page.onUsePaper({ currentTarget: { dataset: { key: 'grade5_a' } } })
  assert.equal(generateCalls, 0)
  assert.match(wx.calls.find(call => call.name === 'navigateTo').payload.url, /paperId=existing-paper/)
})

test('default paper generation sends the selected grade and configured question count', async () => {
  let request = null
  const cloud = {
    callGeneratePaper: async payload => {
      request = payload
      return { paperId: 'paper-1' }
    }
  }
  const { page } = loadPage('miniprogram/pages/default-paper/default-paper.js', {
    modules: { '../../utils/cloud': cloud }
  })
  page.setData({
    studentId: 'student-1',
    subject: 'math',
    grade: 3,
    papers: [{ key: 'grade3_a', exists: false, questionCount: 16 }]
  })

  await page.onUsePaper({ currentTarget: { dataset: { key: 'grade3_a' } } })
  assert.equal(request.grade, 3)
  assert.equal(request.questionCount, 16)
  assert.equal(request.paperKey, 'grade3_a')
})


test('paper preview loads a saved paper and opens its upload flow', async () => {
  const cloud = {
    getPaperDetail: async () => ({
      student: { name: '钟青羽' },
      paper: {
        _id: 'paper-1',
        studentId: 'student-1',
        subject: 'math',
        type: 'verification',
        paperCode: 'MATH-20260613-01',
        paperDisplayCode: '数学-20260613-01',
        pdfFileId: 'cloud://paper.pdf',
        questions: Array.from({ length: 5 }, (_, index) => ({
          index: index + 1,
          content: `${index + 1}+1`,
          lpCode: 'LP-001',
          lpName: '计算错误'
        })),
        bottleneckTargets: ['LP-001'],
        bottleneckSummaries: ['计算错误'],
        paperDate: '2026-06-13',
        studentPages: 1,
        answerPages: 1,
        totalPages: 2
      },
      latestVerificationReport: {
        _id: 'report-verify',
        status: 'completed',
        summary: '验证卷完成',
        comparisonSummary: '计算基础有改善',
        verificationEvidence: [{ complete: true, allCorrect: true }]
      }
    })
  }
  const wx = createWxMock({
    getStorageSync: key => key === 'downloaded_pdf_cloud://paper.pdf'
  })
  const { page } = loadPage('miniprogram/pages/paper-preview/paper-preview.js', {
    wx,
    modules: { '../../utils/cloud': cloud }
  })

  await page.loadPaper('paper-1')
  assert.equal(page.data.pdfReady, true)
  assert.equal(page.data.typeText, '验证试卷')
  assert.equal(page.data.paperCodeText, '数学-20260613-01')
  assert.equal(page.data.bottleneckText, '计算错误')
  assert.equal(page.data.paperDate, '2026-06-13')
  assert.equal(page.data.pageSummary, '学生卷 1 页 · 答案 1 页 · 共 2 页')
  assert.equal(page.data.pdfDownloaded, true)
  assert.equal(page.data.questionPreview.length, 4)
  assert.equal(page.data.hasMoreQuestions, true)
  assert.equal(page.data.workbenchStatus, 'completed')
  assert.equal(page.data.feedback.summary, '计算基础有改善')
  assert.ok(page.data.feedback.chips.includes('1 个卡点有改善'))
  assert.match(page.data.paperCodeUrl, /paper-preview/)
  assert.match(page.data.statusUrl, /report-verify/)
  assert.match(page.data.uploadUrl, /upload/)
  assert.match(page.data.feedback.reportUrl, /report-verify/)
  assert.doesNotMatch(page.data.bottleneckText, /LP-\d+/)
  page.onToggleQuestions()
  assert.equal(page.data.questionPreview.length, 5)
  page.onViewFeedbackReport()
  assert.match(wx.calls.find(call => call.name === 'navigateTo').payload.url, /report-verify/)
  page.onTraceableUrlTap({ currentTarget: { dataset: { url: page.data.paperCodeUrl } } })
  assert.match(wx.calls.filter(call => call.name === 'navigateTo').pop().payload.url, /paper-preview/)
  page.onUpload()
  const url = wx.calls.filter(call => call.name === 'navigateTo').pop().payload.url
  assert.match(url, /mode=verification/)
  assert.match(url, /paperId=paper-1/)
  assert.match(url, /paperCode=/)
})

test('paper preview falls back to question bottleneck names for legacy papers', async () => {
  const cloud = {
    getPaper: async () => ({
      _id: 'paper-1',
      studentId: 'student-1',
      subject: 'math',
      type: 'verification',
      pdfFileId: 'cloud://paper.pdf',
      questions: [
        { content: '1+1', lpCode: 'LP-001', lpName: '计算错误（加减乘除）' },
        { content: '读题', lpCode: 'LP-008', lpName: '审题错误' }
      ],
      bottleneckTargets: ['LP-001', 'LP-008']
    }),
    getStudent: async () => ({ name: '钟青羽' })
  }
  const { page } = loadPage('miniprogram/pages/paper-preview/paper-preview.js', {
    modules: { '../../utils/cloud': cloud }
  })

  await page.loadPaper('paper-1')

  assert.equal(page.data.bottleneckText, '计算错误、审题错误')
})

test('paper preview allows multiple downloads (user may lose the file)', async () => {
  let downloadCount = 0
  const storage = {}
  const wx = createWxMock({
    getStorageSync: key => storage[key],
    setStorageSync: (key, value) => { storage[key] = value },
    cloud: {
      downloadFile: async payload => {
        downloadCount += 1
        assert.equal(payload.fileID, 'cloud://paper.pdf')
        return { tempFilePath: '/tmp/paper.pdf' }
      }
    }
  })
  const { page } = loadPage('miniprogram/pages/paper-preview/paper-preview.js', {
    wx,
    modules: { '../../utils/cloud': {} }
  })
  page.setData({ mode: 'paper', pdfFileId: 'cloud://paper.pdf' })

  await page.onDownload()
  assert.equal(page.data.downloading, false)
  assert.equal(page.data.pdfDownloaded, true)
  assert.equal(downloadCount, 1)
  assert.equal(wx.calls.find(call => call.name === 'openDocument').payload.filePath, '/tmp/paper.pdf')

  // 第二次下载：允许重复下载（用户可能找不到文件需要重新下载）
  await page.onDownload()
  assert.equal(downloadCount, 2, '第二次下载应成功，不再被阻止')
  assert.equal(page.data.downloading, false)
})

test('report passes its subject name into verification paper generation', async () => {
  const wx = createWxMock()
  let activePaperCall = null
  const cloud = {
    getActiveVerificationPaper: async (studentId, subject, reportId) => {
      activePaperCall = { studentId, subject, reportId }
      return { status: 'ready', paper: { _id: 'paper-1' } }
    }
  }
  const { page } = loadPage('miniprogram/pages/report/report.js', {
    wx,
    modules: {
      '../../utils/cloud': cloud,
      '../../utils/util': { formatChineseDateTime: () => '' },
      '../../utils/poller': { createPoller: () => ({ start() {}, stop() {} }) },
      './report-presenter': { buildReportView: () => ({}) }
    }
  })
  page.setData({
    reportId: 'report-1',
    report: {
      studentId: 'student-1',
      subject: 'chinese',
      bottlenecks: [{ lpCode: 'LP-101' }]
    },
    canGeneratePaper: true
  })

  await page.onGenerateVerification()
  // 统一入口：查验证卷状态，ready 时直接跳预览
  assert.equal(activePaperCall.studentId, 'student-1')
  assert.equal(activePaperCall.subject, 'chinese')
  assert.equal(activePaperCall.reportId, 'report-1')
  const nav = wx.calls.find(call => call.name === 'navigateTo')
  assert.ok(nav, '应当跳转到预览页')
  assert.match(nav.payload.url, /paperId=paper-1/)
})

test('report verification entry only polls a generating paper without front-end generation', async () => {
  const wx = createWxMock()
  const generateCalls = []
  const regenerateCalls = []
  let pollStarts = 0
  const cloud = {
    getActiveVerificationPaper: async () => ({
      status: 'generating',
      paper: {
        _id: 'paper-generating',
        studentId: 'student-1',
        subject: 'math',
        type: 'verification',
        bottleneckTargets: ['BN-001'],
        questions: [],
        generationProgress: { completedBatches: 0, totalBatches: 1, succeededBatches: 0 }
      }
    }),
    callGeneratePaper: async payload => {
      generateCalls.push(payload)
      return { success: true, paperId: 'paper-generating' }
    },
    regenerateVerificationPaper: async payload => {
      regenerateCalls.push(payload)
      return { success: true }
    }
  }
  const { page } = loadPage('miniprogram/pages/report/report.js', {
    wx,
    modules: {
      '../../utils/cloud': cloud,
      '../../utils/util': { formatChineseDateTime: () => '' },
      '../../utils/poller': { createPoller: () => ({ start() { pollStarts += 1 }, stop() {} }) },
      './report-presenter': { buildReportView: () => ({}) }
    }
  })
  page.setData({
    reportId: 'report-1',
    report: {
      studentId: 'student-1',
      subject: 'math',
      bottlenecks: [{ lpCode: 'LP-001' }]
    },
    canGeneratePaper: true
  })

  await assert.doesNotReject(() => page.onGenerateVerification())

  assert.equal(generateCalls.length, 0)
  assert.equal(regenerateCalls.length, 0)
  require('../miniprogram/utils/shared-navigation').stopVerificationPoller()
  assert.equal(wx.calls.some(call => call.name === 'navigateTo'), false)
  assert.match(wx.calls.find(call => call.name === 'showToast').payload.title, /后台生成/)
})

test('report verification entry does not create a paper when no auto paper exists', async () => {
  const wx = createWxMock()
  const regenerateCalls = []
  const cloud = {
    getActiveVerificationPaper: async () => ({ status: 'none', paper: null }),
    regenerateVerificationPaper: async payload => {
      regenerateCalls.push(payload)
      if (payload.action === 'start') {
        return { success: true, paperId: 'paper-new', batches: [['BN-001']], totalBatches: 1 }
      }
      return { success: true }
    },
    callGeneratePaper: async payload => {
      if (payload._appendToPaperId) throw new Error('批次 1 生成失败')
      return { success: true }
    }
  }
  const { page } = loadPage('miniprogram/pages/report/report.js', {
    wx,
    modules: {
      '../../utils/cloud': cloud,
      '../../utils/util': { formatChineseDateTime: () => '' },
      '../../utils/poller': { createPoller: () => ({ start() {}, stop() {} }) },
      './report-presenter': { buildReportView: () => ({}) }
    }
  })
  page.setData({
    reportId: 'report-1',
    report: {
      studentId: 'student-1',
      subject: 'math',
      bottlenecks: [{ lpCode: 'LP-001' }]
    },
    canGeneratePaper: true
  })

  await page.onGenerateVerification()

  assert.equal(regenerateCalls.length, 0)
  assert.equal(wx.calls.some(call => call.name === 'navigateTo'), false)
  assert.match(wx.calls.filter(call => call.name === 'showToast').at(-1).payload.title, /暂无验证卷/)
})

test('report retry treats a cloud timeout as background analysis and resumes polling', async () => {
  const timeout = new Error('timeout')
  let pollStarts = 0
  const cloud = {
    callAnalyzePhotos: async () => { throw timeout },
    isTimeoutError: error => error === timeout
  }
  const { page } = loadPage('miniprogram/pages/report/report.js', {
    modules: {
      '../../utils/cloud': cloud,
      '../../utils/util': { formatChineseDateTime: () => '' },
      '../../utils/poller': { createPoller: () => ({ start() {}, stop() {} }) },
      './report-presenter': { buildReportView: () => ({}) }
    }
  })
  page.startPolling = () => { pollStarts += 1 }
  page.setData({ reportId: 'report-1', analysisTaskMissing: true })

  page.onRetryAnalysis()
  await new Promise(resolve => setImmediate(resolve))

  assert.equal(page.data.retryingAnalysis, false)
  assert.equal(page.data.analysisTaskMissing, false)
  assert.equal(page.data.analysisStatusText, '分析已重新启动，正在后台处理')
  assert.equal(pollStarts, 1)
})

test('subject home polls the active report instead of whichever report is latest', async () => {
  const requested = []
  let pollOptions = null
  const cloud = {
    getReport: async reportId => {
      requested.push(reportId)
      return { _id: reportId, status: 'analyzing' }
    },
    getAnalysisProgress: async () => ({ completedBatches: 0, totalBatches: 1 })
  }
  const { page } = loadPage('miniprogram/pages/subject-home/subject-home.js', {
    modules: {
      '../../utils/cloud': cloud,
      '../../utils/util': { formatRelativeTime: () => '' },
      '../../utils/analysis-poller': {
        createAnalysisPoller: options => {
          pollOptions = options
          return { start() {}, stop() {}, isRunning: () => false }
        }
      }
    }
  })
  page.setData({ studentId: 'student-1', subject: 'math', currentAnalysisId: 'active-report' })

  page.startReportPolling()
  await pollOptions.loadReport()
  assert.deepEqual(requested, ['active-report'])
})


test('report exposes retry when an analysis task is stale', async () => {
  let pollOptions = null
  const { page } = loadPage('miniprogram/pages/report/report.js', {
    modules: {
      '../../utils/cloud': {},
      '../../utils/util': { formatChineseDateTime: () => '' },
      '../../utils/analysis-poller': {
        createAnalysisPoller: options => {
          pollOptions = options
          return { start() {}, stop() {} }
        }
      },
      './report-presenter': { buildReportView: () => ({}) }
    }
  })

  page.startPolling('report-1')
  await pollOptions.onTimeoutStatus()

  assert.equal(page.data.analysisTaskMissing, true)
  assert.equal(page.data.analysisStatusText, '分析超时，请重新分析')
})

test('learning records group uploads reports and verification papers by day', async () => {
  const cloud = {
    getReports: async () => [
      {
        _id: 'report-1',
        subject: 'math',
        type: 'diagnosis',
        createdAt: '2026-06-11T10:00:00Z',
        evidenceTime: '2026-06-11T10:05:00Z',
        summary: '发现计算基础卡点',
        totalErrors: 2,
        bottlenecks: [{ lpCode: 'LP-001' }],
        imageFileIds: ['cloud://legacy-photo']
      },
      {
        _id: 'report-2',
        subject: 'math',
        type: 'verification',
        createdAt: '2026-06-11T12:00:00Z',
        evidenceTime: '2026-06-11T12:05:00Z',
        comparisonSummary: '1 个学习卡点已改善',
        verificationEvidence: [{ lpCode: 'LP-001', complete: true, allCorrect: true }],
        imageFiles: [{ fileID: 'cloud://verification-photo', fileName: '验证作答.jpg', ocrSummary: '验证题作答', uploadedAt: '2026-06-11T12:05:00Z' }]
      }
    ],
    getPapers: async () => [{
      _id: 'paper-1',
      subject: 'math',
      type: 'verification',
      paperDisplayCode: '数学-20260611-01',
      createdAt: '2026-06-11T11:00:00Z',
      generatedAt: '2026-06-11T11:02:00Z',
      paperDate: '2026-06-11',
      questions: [{}, {}, {}],
      bottleneckTargets: ['LP-001']
    }],
    getTempFileURLs: async () => [{
      fileID: 'cloud://legacy-photo',
      tempFileURL: 'https://temp/legacy-photo'
    }, {
      fileID: 'cloud://verification-photo',
      tempFileURL: 'https://temp/verification-photo'
    }]
  }
  const wx = createWxMock()
  const { page } = loadPage('miniprogram/pages/upload-history/upload-history.js', {
    wx,
    modules: {
      '../../utils/cloud': cloud,
      '../../utils/util': util
    }
  })
  page.setData({ studentId: 'student-1', activeSubject: 'math' })

  await page.loadHistory()
  assert.equal(page.data.days.length, 1)
  assert.deepEqual(JSON.parse(JSON.stringify(page.data.days[0].events.map(event => event.kind))), [
    'verification-report',
    'verification-paper',
    'diagnosis-report'
  ])
  assert.equal(page.data.days[0].events[2].photos[0].fileName, '历史照片1')
  assert.ok(page.data.days[0].events[0].chips.some(chip => /证据时间 6月11日/.test(chip)))
  assert.equal(page.data.days[0].events[1].paperCode, '数学-20260611-01')
  assert.equal(page.data.days[0].events[1].showPaperCode, true)
  assert.ok(page.data.days[0].events[1].chips.includes('试卷日期 6月11日'))
  assert.match(page.data.days[0].events[2].photos[0].summaryText, /暂无 OCR/)
  page.onPreviewPhoto({ currentTarget: { dataset: { dayIndex: 0, eventIndex: 2, photoIndex: 0 } } })
  assert.equal(wx.calls.find(call => call.name === 'previewImage').payload.current, 'https://temp/legacy-photo')

  page.onEventTap({ currentTarget: { dataset: { dayIndex: 0, eventIndex: 1 } } })
  assert.match(wx.calls.find(call => call.name === 'navigateTo').payload.url, /paperId=paper-1/)
})

test('learning records fold evidence, compact transient states, and hide low frequency tool papers', async () => {
  const cloud = {
    getReports: async () => [
      {
        _id: 'report-1',
        subject: 'math',
        type: 'diagnosis',
        status: 'completed',
        createdAt: '2026-06-12T09:00:00Z',
        evidenceTime: '2026-06-12T09:05:00Z',
        summary: '发现计算基础卡点',
        bottlenecks: [{ lpCode: 'LP-001' }],
        imageFiles: [
          { fileID: 'cloud://photo-1', fileName: '数学卷1.jpg', ocrSummary: '计算题错 2 道' },
          { fileID: 'cloud://photo-2', fileName: '数学卷2.jpg', ocrSummary: '疑似重复', isDuplicate: true }
        ]
      },
      {
        _id: 'report-2',
        subject: 'math',
        type: 'verification',
        status: 'completed',
        paperId: 'paper-1',
        createdAt: '2026-06-12T11:00:00Z',
        comparisonSummary: '计算基础有改善',
        verificationEvidence: [{ lpCode: 'LP-001', complete: true, allCorrect: true }],
        bottlenecks: [{ lpCode: 'LP-001', status: 'improved' }],
        imageFiles: [{ fileID: 'cloud://answer-1', fileName: '验证卷作答.jpg', ocrSummary: '验证卷答题照片' }]
      },
      {
        _id: 'report-analyzing',
        subject: 'math',
        type: 'diagnosis',
        status: 'analyzing',
        createdAt: '2026-06-12T12:00:00Z'
      },
      {
        _id: 'report-failed',
        subject: 'math',
        type: 'diagnosis',
        status: 'failed',
        createdAt: '2026-06-12T12:30:00Z'
      }
    ],
    getPapers: async () => [
      {
        _id: 'paper-1',
        subject: 'math',
        type: 'verification',
        paperDisplayCode: '数学-20260612-01',
        createdAt: '2026-06-12T10:00:00Z',
        paperDate: '2026-06-12',
        questions: [{}, {}, {}, {}, {}, {}],
        bottleneckSummaries: ['计算基础']
      },
      {
        _id: 'default-paper',
        subject: 'math',
        type: 'default-diagnosis',
        createdAt: '2026-06-12T08:00:00Z'
      }
    ],
    getTempFileURLs: async () => [
      { fileID: 'cloud://photo-1', tempFileURL: 'https://temp/photo-1' },
      { fileID: 'cloud://photo-2', tempFileURL: 'https://temp/photo-2' },
      { fileID: 'cloud://answer-1', tempFileURL: 'https://temp/answer-1' }
    ]
  }
  const wx = createWxMock()
  const { page } = loadPage('miniprogram/pages/upload-history/upload-history.js', {
    wx,
    modules: {
      '../../utils/cloud': cloud,
      '../../utils/util': util
    }
  })
  page.setData({ studentId: 'student-1', activeSubject: 'math' })

  await page.loadHistory()

  const day = page.data.days[0]
  assert.deepEqual(JSON.parse(JSON.stringify(day.events.map(event => event.kind))), [
    'verification-report',
    'verification-paper',
    'diagnosis-report'
  ])
  assert.equal(day.statusItems.length, 0)
  assert.equal(day.events.some(event => event.paperId === 'default-paper'), false)
  assert.equal(day.events.find(event => event.kind === 'diagnosis-report').foldedEvidence.length, 2)
  assert.equal(day.events.find(event => event.kind === 'verification-paper').paperCode, '数学-20260612-01')
  assert.equal(day.events.find(event => event.kind === 'verification-paper').showPaperCode, true)
  assert.ok(day.events.find(event => event.kind === 'verification-paper').chips.includes('学生卷1页'))
  assert.ok(day.events.find(event => event.kind === 'verification-paper').chips.includes('答案1页'))
  assert.ok(day.events.find(event => event.kind === 'verification-report').chips.includes('关联 数学-20260612-01'))
  assert.ok(day.events.find(event => event.kind === 'diagnosis-report').chips.includes('计算基础'))

  page.onPreviewFoldedEvidence({ currentTarget: { dataset: { dayIndex: 0, eventIndex: 2, evidenceIndex: 0 } } })
  assert.equal(wx.calls.find(call => call.name === 'previewImage').payload.current, 'https://temp/photo-1')
})


test('learning records surface stable readable codes for legacy verification papers', async () => {
  const cloud = {
    getReports: async () => [],
    getPapers: async () => [
      {
        _id: 'paper-early',
        subject: 'math',
        type: 'verification',
        createdAt: '2026-06-12T09:47:00+08:00',
        generatedAt: '2026-06-12T09:47:00+08:00',
        paperDate: '2026-06-12',
        questionCount: 6,
        totalPages: 2,
        bottleneckTargets: ['LP-001']
      },
      {
        _id: 'paper-late',
        subject: 'math',
        type: 'verification',
        createdAt: '2026-06-12T10:34:00+08:00',
        generatedAt: '2026-06-12T10:34:00+08:00',
        paperDate: '2026-06-12',
        questionCount: 6,
        totalPages: 2,
        bottleneckTargets: ['LP-008']
      }
    ],
    getTempFileURLs: async () => []
  }
  const { page } = loadPage('miniprogram/pages/upload-history/upload-history.js', {
    modules: {
      '../../utils/cloud': cloud,
      '../../utils/util': util
    }
  })
  page.setData({ studentId: 'student-1', activeSubject: 'math' })

  await page.loadHistory()

  const eventsById = new Map(page.data.days[0].events.map(event => [event.paperId, event]))
  assert.equal(eventsById.get('paper-early').paperCode, '数学-20260612-01')
  assert.equal(eventsById.get('paper-late').paperCode, '数学-20260612-02')
  assert.equal(eventsById.get('paper-late').showPaperCode, true)
  assert.ok(eventsById.get('paper-late').chips.includes('6题'))
  assert.ok(eventsById.get('paper-late').chips.includes('学生卷1页'))
  assert.ok(eventsById.get('paper-late').chips.includes('答案1页'))
})

test('learning records load all subjects when no subject filter is provided', async () => {
  const seen = {}
  const cloud = {
    getReports: async (studentId, subject, limit) => {
      seen.reports = { studentId, subject, limit }
      return [{
        _id: 'report-1',
        subject: 'math',
        type: 'diagnosis',
        status: 'completed',
        createdAt: '2026-06-11T10:00:00Z',
        bottlenecks: [{ lpCode: 'LP-001' }]
      }]
    },
    getPapers: async filter => {
      seen.papers = filter
      return [{
        _id: 'paper-1',
        subject: 'math',
        type: 'verification',
        createdAt: '2026-06-11T11:00:00Z',
        questions: [{}, {}],
        bottleneckTargets: ['LP-001']
      }]
    },
    getTempFileURLs: async () => []
  }
  const { page } = loadPage('miniprogram/pages/upload-history/upload-history.js', {
    modules: {
      '../../utils/cloud': cloud,
      '../../utils/util': util
    }
  })
  page.setData({ studentId: 'student-1', subject: '', subjectName: '', studentName: '钟青羽' })

  await page.loadHistory()
  assert.deepEqual(JSON.parse(JSON.stringify(seen.reports)), {
    studentId: 'student-1',
    limit: 20
  })
  assert.deepEqual(JSON.parse(JSON.stringify(seen.papers)), { studentId: 'student-1' })
  assert.equal(page.data.activeSubject, '')
  assert.equal(page.data.titleText, '钟青羽 · 学习记录')
  assert.deepEqual(JSON.parse(JSON.stringify(page.data.days[0].events.map(event => event.title))), [
    '数学纸面验证卷',
    '数学诊断报告'
  ])
  assert.equal(page.data.filters.find(item => item.key === '').active, true)
  assert.equal(page.data.allDays.length, 1)
})

test('learning records prefer shared timeline access before legacy collection queries', async () => {
  const seen = { legacyReports: 0, legacyPapers: 0, timeline: null }
  const cloud = {
    getLearningTimeline: async params => {
      seen.timeline = params
      return {
        reports: [{
          _id: 'shared-report',
          subject: 'math',
          type: 'diagnosis',
          status: 'completed',
          createdAt: '2026-06-11T10:00:00Z',
          summary: '共享档案诊断'
        }],
        papers: [{
          _id: 'shared-paper',
          subject: 'math',
          type: 'verification',
          createdAt: '2026-06-11T11:00:00Z',
          questions: [{}, {}],
          bottleneckSummaries: ['审题理解']
        }]
      }
    },
    getReports: async () => {
      seen.legacyReports += 1
      return []
    },
    getPapers: async () => {
      seen.legacyPapers += 1
      return []
    },
    getTempFileURLs: async () => []
  }
  const { page } = loadPage('miniprogram/pages/upload-history/upload-history.js', {
    modules: {
      '../../utils/cloud': cloud,
      '../../utils/util': util
    }
  })
  page.setData({ studentId: 'student-1', subject: '', subjectName: '', studentName: '钟青羽' })

  await page.loadHistory()

  assert.deepEqual(JSON.parse(JSON.stringify(seen.timeline)), { studentId: 'student-1', limit: 20 })
  assert.equal(seen.legacyReports, 0)
  assert.equal(seen.legacyPapers, 0)
  assert.deepEqual(JSON.parse(JSON.stringify(page.data.days[0].events.map(event => event.title))), [
    '数学纸面验证卷',
    '数学诊断报告'
  ])
})

test('learning records render before stale cleanup preview resolves', async () => {
  let resolveCleanup
  const cleanupPromise = new Promise(resolve => {
    resolveCleanup = resolve
  })
  const cloud = {
    cleanupStaleLearningRecords: async payload => {
      assert.equal(payload.dryRun, true)
      return cleanupPromise
    },
    getReports: async () => [{
      _id: 'report-1',
      subject: 'math',
      type: 'diagnosis',
      status: 'completed',
      createdAt: '2026-06-11T10:00:00Z',
      summary: '数学计算卡点'
    }],
    getPapers: async () => [],
    getTempFileURLs: async () => []
  }
  const { page } = loadPage('miniprogram/pages/upload-history/upload-history.js', {
    modules: {
      '../../utils/cloud': cloud,
      '../../utils/util': util
    }
  })
  page.setData({ studentId: 'student-1', subject: 'math', activeSubject: 'math', studentName: '钟青羽' })

  await page.loadHistory()

  assert.equal(page.data.loading, false)
  assert.equal(page.data.days.length, 1)
  assert.equal(page.data.cleanup.hasCandidates, false)

  resolveCleanup({
    cleanedCount: 1,
    cleanedReportIds: ['report-stale'],
    permissions: { canManageParents: true }
  })
  await new Promise(resolve => setImmediate(resolve))

  assert.equal(page.data.cleanup.hasCandidates, true)
  assert.equal(page.data.cleanup.count, 1)
})

test('learning records limit initial temporary urls and lazily load photo previews', async () => {
  const tempUrlRequests = []
  const imageFiles = Array.from({ length: 20 }, (_, index) => ({
    fileID: `cloud://photo-${index + 1}`,
    fileName: `photo-${index + 1}.jpg`
  }))
  const cloud = {
    getReports: async () => [{
      _id: 'report-1',
      subject: 'math',
      type: 'diagnosis',
      status: 'completed',
      createdAt: '2026-06-11T10:00:00Z',
      imageFiles
    }],
    getPapers: async () => [],
    getTempFileURLs: async fileIDs => {
      tempUrlRequests.push(fileIDs)
      return fileIDs.map(fileID => ({ fileID, tempFileURL: `https://temp/${fileID}` }))
    }
  }
  const wx = createWxMock()
  const { page } = loadPage('miniprogram/pages/upload-history/upload-history.js', {
    wx,
    modules: {
      '../../utils/cloud': cloud,
      '../../utils/util': util
    }
  })
  page.setData({ studentId: 'student-1', subject: 'math', activeSubject: 'math', studentName: '钟青羽' })

  await page.loadHistory()

  assert.equal(tempUrlRequests.length, 1)
  assert.equal(tempUrlRequests[0].length, 12)
  assert.equal(page.data.days[0].events[0].foldedEvidence[11].tempFileURL, 'https://temp/cloud://photo-12')
  assert.equal(page.data.days[0].events[0].foldedEvidence[12].tempFileURL, '')

  await page.onPreviewFoldedEvidence({
    currentTarget: { dataset: { dayIndex: 0, eventIndex: 0, evidenceIndex: 12 } }
  })

  assert.deepEqual(JSON.parse(JSON.stringify(tempUrlRequests[1])), ['cloud://photo-13'])
  assert.equal(wx.calls.find(call => call.name === 'previewImage').payload.current, 'https://temp/cloud://photo-13')
})

test('learning records render English sessions from shared timeline', async () => {
  const cloud = {
    getLearningTimeline: async () => ({
      reports: [],
      papers: [],
      englishSessions: [{
        _id: 'dictation-1',
        subject: 'english',
        functionType: 'spelling',
        type: 'word-dictation-paper',
        status: 'completed',
        analysisStatus: 'completed',
        photoFileIds: ['cloud://dictation-1.jpg'],
        wordItems: [{ wordId: 'word-1', word: 'science' }],
        dictationResults: [{ wordId: 'word-1', targetWord: 'science', verdict: 'correct' }],
        createdAt: '2026-06-16T09:00:00Z'
      }],
      permissions: { canView: true }
    }),
    getReports: async () => {
      throw new Error('legacy reports should not be called')
    },
    getPapers: async () => {
      throw new Error('legacy papers should not be called')
    },
    getTempFileURLs: async fileIDs => fileIDs.map(fileID => ({ fileID, tempFileURL: `https://temp/${fileID}` }))
  }
  const { page } = loadPage('miniprogram/pages/upload-history/upload-history.js', {
    modules: {
      '../../utils/cloud': cloud,
      '../../utils/util': util
    }
  })
  page.setData({ studentId: 'student-1', activeSubject: 'english', subject: 'english', studentName: '钟青羽' })

  await page.loadHistory()

  assert.equal(page.data.days.length, 1)
  assert.equal(page.data.days[0].events[0].kind, 'english-dictation-session')
  assert.equal(page.data.days[0].events[0].title, '英语纸面听写')
  assert.equal(page.data.days[0].events[0].foldedEvidence[0].tempFileURL, 'https://temp/cloud://dictation-1.jpg')
  assert.equal(page.data.filters.find(item => item.key === 'english').count, 1)
})

test('learning records can load more timeline records by increasing the limit', async () => {
  const requests = []
  const cloud = {
    getLearningTimeline: async params => {
      requests.push(params)
      const start = params.cursor === 'cursor-page-2' ? 20 : 0
      return {
        reports: Array.from({ length: params.limit }, (_, index) => ({
          _id: `report-${start + index + 1}`,
          subject: 'math',
          type: 'diagnosis',
          status: 'completed',
          createdAt: `2026-06-${String(10 + Math.floor((start + index) / 5)).padStart(2, '0')}T10:00:00Z`,
          summary: `第 ${start + index + 1} 条记录`
        })),
        papers: [],
        englishSessions: [],
        nextCursor: params.cursor ? '' : 'cursor-page-2',
        hasMore: !params.cursor
      }
    },
    getTempFileURLs: async () => []
  }
  const { page } = loadPage('miniprogram/pages/upload-history/upload-history.js', {
    modules: {
      '../../utils/cloud': cloud,
      '../../utils/util': util
    }
  })
  page.setData({ studentId: 'student-1', studentName: '钟青羽' })

  await page.loadHistory()
  assert.deepEqual(JSON.parse(JSON.stringify(requests[0])), { studentId: 'student-1', limit: 20 })
  assert.equal(page.data.hasMoreRecords, true)
  assert.equal(page.data.nextCursor, 'cursor-page-2')

  await page.onLoadMoreRecords()

  assert.deepEqual(JSON.parse(JSON.stringify(requests[1])), {
    studentId: 'student-1',
    limit: 20,
    cursor: 'cursor-page-2'
  })
  assert.equal(page.data.timelineLimit, 20)
  assert.equal(page.data.hasMoreRecords, false)
  assert.equal(page.data.days.flatMap(day => day.events).length, 40)
})

test('learning records use lightweight summaries from timeline without full report payloads', async () => {
  const cloud = {
    getLearningTimeline: async () => ({
      reports: [{
        _id: 'report-summary',
        subject: 'math',
        type: 'diagnosis',
        status: 'completed',
        createdAt: '2026-06-11T10:00:00Z',
        summary: '数学计算卡点',
        bottleneckSummaries: ['计算基础'],
        imageFileCount: 18,
        errorCount: 12
      }],
      papers: [],
      englishSessions: [],
      hasMore: false
    }),
    getTempFileURLs: async () => {
      throw new Error('summary records should not request image URLs')
    }
  }
  const { page } = loadPage('miniprogram/pages/upload-history/upload-history.js', {
    modules: {
      '../../utils/cloud': cloud,
      '../../utils/util': util
    }
  })
  page.setData({ studentId: 'student-1', studentName: '钟青羽' })

  await page.loadHistory()

  const event = page.data.days[0].events[0]
  assert.equal(event.title, '数学诊断报告')
  assert.ok(event.chips.includes('计算基础'))
  assert.ok(event.chips.includes('18张照片'))
  assert.equal(event.foldedEvidence.length, 0)
})

test('learning records can load more timeline records by increasing the limit legacy fallback', async () => {
  const limits = []
  const cloud = {
    getLearningTimeline: null,
    getReports: async (studentId, subject, limit) => {
      limits.push(limit)
      return Array.from({ length: limit }, (_, index) => ({
          _id: `report-${index + 1}`,
          subject: 'math',
          type: 'diagnosis',
          status: 'completed',
          createdAt: `2026-06-${String(10 + Math.floor(index / 5)).padStart(2, '0')}T10:00:00Z`,
          summary: `第 ${index + 1} 条记录`
        }))
    },
    getTempFileURLs: async () => []
  }
  const { page } = loadPage('miniprogram/pages/upload-history/upload-history.js', {
    modules: {
      '../../utils/cloud': cloud,
      '../../utils/util': util
    }
  })
  page.setData({ studentId: 'student-1', studentName: '钟青羽' })

  await page.loadHistory()
  assert.equal(limits[0], 20)
  assert.equal(page.data.hasMoreRecords, true)

  await page.onLoadMoreRecords()

  assert.deepEqual(JSON.parse(JSON.stringify(limits)), [20, 40])
  assert.equal(page.data.timelineLimit, 40)
  assert.equal(page.data.days.flatMap(day => day.events).length, 40)
})

test('learning records treat route subject as an initial filter on the complete timeline', async () => {
  const seen = {}
  const cloud = {
    getReports: async (studentId, subject, limit) => {
      seen.reports = { studentId, subject, limit }
      return [
        {
          _id: 'math-report',
          subject: 'math',
          type: 'diagnosis',
          status: 'completed',
          createdAt: '2026-06-11T10:00:00Z',
          summary: '数学计算卡点'
        },
        {
          _id: 'chinese-report',
          subject: 'chinese',
          type: 'diagnosis',
          status: 'completed',
          createdAt: '2026-06-11T09:00:00Z',
          summary: '阅读理解卡点'
        }
      ]
    },
    getPapers: async filter => {
      seen.papers = filter
      return [{
        _id: 'english-paper',
        subject: 'english',
        type: 'verification',
        createdAt: '2026-06-11T11:00:00Z',
        questions: [{}, {}]
      }]
    },
    getTempFileURLs: async () => []
  }
  const { page } = loadPage('miniprogram/pages/upload-history/upload-history.js', {
    modules: {
      '../../utils/cloud': cloud,
      '../../utils/util': util
    }
  })
  page.setData({
    studentId: 'student-1',
    subject: 'math',
    activeSubject: 'math',
    subjectName: '数学',
    studentName: '钟青羽'
  })

  await page.loadHistory()

  assert.deepEqual(JSON.parse(JSON.stringify(seen.reports)), {
    studentId: 'student-1',
    limit: 20
  })
  assert.deepEqual(JSON.parse(JSON.stringify(seen.papers)), { studentId: 'student-1' })
  assert.equal(page.data.titleText, '钟青羽 · 学习记录')
  assert.equal(page.data.activeSubject, 'math')
  assert.deepEqual(JSON.parse(JSON.stringify(page.data.days[0].events.map(event => event.title))), [
    '数学诊断报告'
  ])
  assert.equal(page.data.allDays[0].events.length, 3)
  assert.equal(page.data.filters.find(item => item.key === 'math').active, true)

  page.onFilterTap({ currentTarget: { dataset: { subject: '' } } })

  assert.equal(page.data.activeSubject, '')
  assert.deepEqual(JSON.parse(JSON.stringify(page.data.days[0].events.map(event => event.title))), [
    '英语纸面验证卷',
    '数学诊断报告',
    '语文诊断报告'
  ])
  assert.equal(page.data.filters.find(item => item.key === '').active, true)
})


test('report loads diagnosis data and toggles error details', async () => {
  const cloud = {
    getReport: async () => ({
      _id: 'report-1',
      studentId: 'student-1',
      subject: 'math',
      type: 'diagnosis',
      status: 'completed',
      createdAt: '2026-06-11T10:00:00Z',
      bottlenecks: [{ lpCode: 'LP-001', errorCount: 1 }],
      errorDetails: [{ questionContent: '1+1' }]
    }),
    getSubjectProfile: async () => ({ pendingBottlenecks: [{ lpCode: 'LP-001' }] })
  }
  const { page } = loadPage('miniprogram/pages/report/report.js', {
    modules: {
      '../../utils/cloud': cloud,
      '../../utils/util': { formatChineseDateTime: () => '2026年6月11日 10:00' },
      '../../utils/poller': { createPoller: () => ({ start() {}, stop() {} }) },
      './report-presenter': require('../miniprogram/pages/report/report-presenter')
    }
  })

  await page.loadReport('report-1')
  assert.equal(page.data.hasBottlenecks, true)
  assert.equal(page.data.pendingCount, 1)
  page.onToggleError({ currentTarget: { dataset: { index: 0 } } })
  assert.equal(page.data.errorDetailList[0].expanded, true)
})

test('report falls back to direct report read when detail cloud function fails', async () => {
  let directReportRead = false
  const cloud = {
    getReportDetail: async () => {
      throw new Error('detail unavailable')
    },
    getReport: async reportId => {
      directReportRead = true
      return {
        _id: reportId,
        studentId: 'student-1',
        subject: 'math',
        type: 'diagnosis',
        status: 'completed',
        summary: '发现计算基础卡点',
        totalErrors: 18,
        createdAt: '2026-06-14T14:53:53.804Z',
        imageFiles: Array.from({ length: 9 }, (_, index) => ({ fileID: `cloud://photo-${index + 1}` })),
        bottlenecks: [
          { lpCode: 'LP-001', lpName: '计算错误（加减乘除）', errorCount: 14 },
          { lpCode: 'LP-008', lpName: '审题理解', errorCount: 3 },
          { lpCode: 'LP-010', lpName: '应用建模', errorCount: 1 }
        ],
        errorDetails: [{ questionContent: '38 × 24' }]
      }
    },
    getSubjectProfile: async () => ({ pendingBottlenecks: [{ lpCode: 'LP-001' }] })
  }
  const wx = createWxMock()
  const { page } = loadPage('miniprogram/pages/report/report.js', {
    wx,
    modules: {
      '../../utils/cloud': cloud,
      '../../utils/util': { formatChineseDateTime: () => '2026年6月14日 22:53' },
      './report-presenter': require('../miniprogram/pages/report/report-presenter')
    }
  })

  await page.loadReport('report-real')

  assert.equal(directReportRead, true)
  assert.equal(page.data.report._id, 'report-real')
  assert.equal(page.data.report.totalErrors, 18)
  assert.equal(page.data.bottleneckCount, 3)
  assert.equal(page.data.sourceImageCount, 9)
  assert.equal(page.data.hasErrorDetails, true)
  assert.equal(wx.calls.some(call => call.name === 'showToast' && call.payload.title === '加载失败'), false)
})

test('report still renders when feedback loading fails', async () => {
  const cloud = {
    getReportDetail: async () => ({
      permissions: { canView: true },
      report: {
        _id: 'report-1',
        studentId: 'student-1',
        subject: 'math',
        type: 'diagnosis',
        status: 'completed',
        summary: '发现审题理解卡点',
        totalErrors: 3,
        createdAt: '2026-06-14T14:53:53.804Z',
        imageFiles: [{ fileID: 'cloud://photo-1' }],
        bottlenecks: [{ lpCode: 'LP-008', lpName: '审题理解', errorCount: 3 }],
        errorDetails: [{ questionContent: '应用题漏看条件' }]
      }
    }),
    getReportFeedback: async () => {
      throw new Error('feedback unavailable')
    },
    getSubjectDashboard: async () => ({ profile: { pendingBottlenecks: [{ lpCode: 'LP-008' }] } })
  }
  const wx = createWxMock()
  const { page } = loadPage('miniprogram/pages/report/report.js', {
    wx,
    modules: {
      '../../utils/cloud': cloud,
      '../../utils/util': { formatChineseDateTime: () => '2026年6月14日 22:53' },
      './report-presenter': require('../miniprogram/pages/report/report-presenter')
    }
  })

  await page.loadReport('report-1')

  assert.equal(page.data.report.totalErrors, 3)
  assert.equal(page.data.bottleneckCount, 1)
  assert.equal(page.data.sourceImageCount, 1)
  assert.deepEqual(JSON.parse(JSON.stringify(page.data.feedbackItems)), [])
  assert.deepEqual(JSON.parse(JSON.stringify(page.data.feedbackByTarget)), {})
  assert.equal(wx.calls.some(call => call.name === 'showToast' && call.payload.title === '加载失败'), false)
})

test('report uses detail pending count without loading the full subject dashboard', async () => {
  let dashboardCalls = 0
  const cloud = {
    getReportDetail: async () => ({
      permissions: { canView: true },
      pendingCount: 2,
      report: {
        _id: 'report-1',
        studentId: 'student-1',
        subject: 'math',
        type: 'diagnosis',
        status: 'completed',
        createdAt: '2026-06-14T14:53:53.804Z',
        bottlenecks: [{ lpCode: 'LP-001', lpName: '计算基础', errorCount: 3 }],
        errorDetails: []
      }
    }),
    getSubjectDashboard: async () => {
      dashboardCalls += 1
      throw new Error('subject dashboard should not be needed')
    }
  }
  const { page } = loadPage('miniprogram/pages/report/report.js', {
    modules: {
      '../../utils/cloud': cloud,
      '../../utils/util': { formatChineseDateTime: () => '2026年6月14日 22:53' },
      './report-presenter': require('../miniprogram/pages/report/report-presenter')
    }
  })

  await page.loadReport('report-1')

  assert.equal(page.data.pendingCount, 2)
  assert.equal(dashboardCalls, 0)
})

test('report keeps heavy source fields off page data and expands source evidence on demand', async () => {
  const cloud = {
    getReportDetail: async () => ({
      permissions: { canView: true },
      pendingCount: 1,
      report: {
        _id: 'report-heavy',
        studentId: 'student-1',
        subject: 'math',
        type: 'diagnosis',
        status: 'completed',
        totalErrors: 12,
        createdAt: '2026-06-14T14:53:53.804Z',
        imageFiles: Array.from({ length: 10 }, (_, index) => ({
          fileID: `cloud://photo-${index + 1}`,
          fileName: `第${index + 1}页.jpg`,
          ocrSummary: `第 ${index + 1} 页很长的 OCR 摘要`
        })),
        bottlenecks: [{ lpCode: 'LP-001', lpName: '计算基础', errorCount: 12 }],
        errorDetails: Array.from({ length: 25 }, (_, index) => ({
          questionContent: `错题 ${index + 1}`,
          sourceImageIndex: index + 1
        }))
      }
    })
  }
  const { page } = loadPage('miniprogram/pages/report/report.js', {
    modules: {
      '../../utils/cloud': cloud,
      '../../utils/util': { formatChineseDateTime: () => '2026年6月14日 22:53' },
      './report-presenter': require('../miniprogram/pages/report/report-presenter')
    }
  })

  await page.loadReport('report-heavy')

  assert.equal(page.data.report._id, 'report-heavy')
  assert.equal(page.data.report.imageFiles, undefined)
  assert.equal(page.data.report.errorDetails, undefined)
  assert.equal(page.data.sourceEvidenceItems.length, 3)
  assert.equal(page.data.hiddenSourceEvidenceCount, 7)
  assert.equal(page.data.errorDetailList.length, 20)
  assert.equal(page.data.hiddenErrorDetailCount, 5)

  page.onExpandSourceEvidence()

  assert.equal(page.data.sourceEvidenceItems.length, 10)
  assert.equal(page.data.hasMoreSourceEvidence, false)

  page.onExpandErrorDetails()

  assert.equal(page.data.errorDetailList.length, 25)
  assert.equal(page.data.hasMoreErrorDetails, false)
})

test('report page submits parent feedback and marks the target as submitted', async () => {
  let feedbackPayload = null
  const cloud = {
    getReportDetail: async () => ({
      permissions: { canView: true },
      feedback: [],
      report: {
        _id: 'report-1',
        studentId: 'student-1',
        subject: 'math',
        type: 'diagnosis',
        status: 'completed',
        createdAt: '2026-06-11T10:00:00Z',
        bottlenecks: [{ lpCode: 'LP-001', errorCount: 1 }],
        errorDetails: [{ questionContent: '1+1' }]
      }
    }),
    getSubjectDashboard: async () => ({ profile: { pendingBottlenecks: [] } }),
    createReportFeedback: async payload => {
      feedbackPayload = payload
      return { feedbackId: 'feedback-1' }
    },
    getReportFeedback: async () => [{
      _id: 'feedback-1',
      targetType: 'bottleneck',
      targetId: 'LP-001',
      type: 'wrong_bottleneck'
    }]
  }
  const wx = createWxMock()
  const { page } = loadPage('miniprogram/pages/report/report.js', {
    wx,
    modules: {
      '../../utils/cloud': cloud,
      '../../utils/util': { formatChineseDateTime: () => '2026年6月11日 10:00' },
      '../../utils/poller': { createPoller: () => ({ start() {}, stop() {} }) },
      './report-presenter': require('../miniprogram/pages/report/report-presenter')
    }
  })

  await page.loadReport('report-1')
  page.onOpenFeedback({ currentTarget: { dataset: { targetType: 'bottleneck', targetId: 'LP-001' } } })
  page.onFeedbackTypeTap({ currentTarget: { dataset: { type: 'wrong_bottleneck' } } })
  page.onFeedbackReasonInput({ detail: { value: '这个卡点不准确' } })
  page.onFeedbackNoteInput({ detail: { value: '孩子只是抄错了数字' } })
  await page.onSubmitFeedback()

  assert.deepEqual(JSON.parse(JSON.stringify(feedbackPayload)), {
    reportId: 'report-1',
    type: 'wrong_bottleneck',
    targetType: 'bottleneck',
    targetId: 'LP-001',
    reason: '这个卡点不准确',
    note: '孩子只是抄错了数字'
  })
  assert.equal(page.data.feedbackDialog.visible, false)
  assert.equal(page.data.feedbackByTarget['bottleneck:LP-001'].submitted, true)
  assert.ok(wx.calls.some(call => call.name === 'showToast' && /已记录/.test(call.payload.title)))
})

test('report co-parent can generate paper and retry analysis', async () => {
  let retryCalled = false
  const cloud = {
    getReportDetail: async () => ({
      permissions: { canView: true, canManageParents: false, canGeneratePaper: true, canRetryAnalysis: true },
      report: {
        _id: 'report-1',
        studentId: 'student-1',
        subject: 'math',
        type: 'diagnosis',
        status: 'completed',
        createdAt: '2026-06-11T10:00:00Z',
        bottlenecks: [{ lpCode: 'LP-001', errorCount: 1 }]
      }
    }),
    getSubjectDashboard: async () => ({ profile: { pendingBottlenecks: [{ lpCode: 'LP-001' }] } }),
    getActiveVerificationPaper: async () => ({ status: 'ready', paper: { _id: 'paper-ready' } }),
    callAnalyzePhotos: async () => { retryCalled = true }
  }
  const wx = createWxMock()
  const { page } = loadPage('miniprogram/pages/report/report.js', {
    wx,
    modules: {
      '../../utils/cloud': cloud,
      '../../utils/util': { formatChineseDateTime: () => '2026年6月11日 10:00' },
      '../../utils/poller': { createPoller: () => ({ start() {}, stop() {} }) },
      './report-presenter': require('../miniprogram/pages/report/report-presenter')
    }
  })

  await page.loadReport('report-1')
  assert.equal(page.data.canGeneratePaper, true)
  assert.equal(page.data.canRetryAnalysis, true)

  await page.onGenerateVerification()
  page.onRetryAnalysis()
  assert.equal(retryCalled, true)
  // 统一入口：ready 时跳预览页
  assert.match(wx.calls.find(call => call.name === 'navigateTo').payload.url, /paper-preview\?paperId=paper-ready/)
})

test('report learning resource cards copy resource links for parent review', () => {
  const wx = createWxMock()
  const { page } = loadPage('miniprogram/pages/report/report.js', {
    wx,
    modules: {
      '../../utils/cloud': {},
      '../../utils/util': { formatChineseDateTime: () => '' },
      '../../utils/poller': { createPoller: () => ({ start() {}, stop() {} }) },
      './report-presenter': { buildReportView: () => ({}) }
    }
  })

  page.onLearningResourceTap({
    currentTarget: {
      dataset: {
        url: 'https://www.bilibili.com/video/BV1M6B3BuEFn/',
        platform: 'B站',
        title: '小数乘法重点易错点'
      }
    }
  })

  const clipboardCall = wx.calls.find(call => call.name === 'setClipboardData')
  assert.equal(clipboardCall.payload.data, 'https://www.bilibili.com/video/BV1M6B3BuEFn/')
})

test('report generates, downloads and opens its printable PDF', async () => {
  const cloud = {
    callGenerateReportPDF: async () => ({ pdfFileId: 'cloud://report.pdf' })
  }
  const wx = createWxMock({
    cloud: {
      downloadFile: options => options.success({ tempFilePath: '/tmp/report.pdf' })
    }
  })
  const { page } = loadPage('miniprogram/pages/report/report.js', {
    wx,
    modules: {
      '../../utils/cloud': cloud,
      '../../utils/util': { formatChineseDateTime: () => '' },
      '../../utils/poller': { createPoller: () => ({ start() {}, stop() {} }) },
      './report-presenter': { buildReportView: () => ({}) }
    }
  })
  page.setData({ reportId: 'report-1' })

  await page.onDownloadPDF()
  assert.equal(page.data.generatingPdf, false)
  assert.equal(wx.calls.find(call => call.name === 'openDocument').payload.filePath, '/tmp/report.pdf')
})


test('paper preview does not share temporary preview file ids', () => {
  const { page } = loadPage('miniprogram/pages/paper-preview/paper-preview.js', {
    modules: {
      '../../utils/cloud': {},
      '../../utils/paper-display': {},
      '../../utils/poller': { createPoller: () => ({ start() {}, stop() {} }) },
      './paper-preview-presenter': {
        buildPaperPreviewView: () => ({}),
        getPaperName: () => '',
        getPaperCodeText: () => ''
      }
    }
  })
  page.setData({
    mode: 'preview',
    fileId: 'cloud://temp-preview.pdf',
    typeText: '验证试卷',
    paperCodeText: 'MATH-01',
    paperName: '临时预览'
  })

  const share = page.onShareAppMessage()

  assert.doesNotMatch(share.path || '', /fileId=/)
})

test('subject home resets analysis state and reloads data when polling completes or fails', async () => {
  let pollOptions = null
  let profileLoads = 0
  let recordLoads = 0
  const cloud = {
    getSubjectProfile: async () => ({
      totalReports: 3,
      pendingBottlenecks: [{ lpCode: 'LP-001' }],
      improvedBottlenecks: []
    }),
    getReports: async () => [],
    getReport: async () => ({ _id: 'active-report', status: 'analyzing' }),
    getAnalysisProgress: async () => ({ completedBatches: 0, totalBatches: 1 })
  }
  const wx = createWxMock()
  const { page } = loadPage('miniprogram/pages/subject-home/subject-home.js', {
    wx,
    modules: {
      '../../utils/cloud': cloud,
      '../../utils/util': { formatRelativeTime: () => '' },
      '../../utils/analysis-poller': {
        createAnalysisPoller: options => {
          pollOptions = options
          return { start() {}, stop() {}, isRunning: () => false }
        }
      }
    }
  })
  // override loaders to count invocations
  page.loadProfile = async () => { profileLoads += 1 }
  page.loadRecords = async () => { recordLoads += 1 }
  page.setData({ studentId: 'student-1', subject: 'math', currentAnalysisId: 'active-report' })

  page.startReportPolling()
  // simulate completion
  await pollOptions.onCompleted({ _id: 'active-report', status: 'completed' })
  assert.equal(page.data.analysisStatus, '')
  assert.equal(page.data.currentAnalysisId, '')
  assert.equal(page.data.analysisStatusText, '分析完成')
  assert.equal(profileLoads, 1)
  assert.equal(recordLoads, 1)
  assert.ok(wx.calls.some(call => call.name === 'showToast' && call.payload.title === '诊断完成'))

  // reset counters and simulate failure branch
  profileLoads = 0
  recordLoads = 0
  wx.calls.length = 0
  await pollOptions.onFailed({ _id: 'active-report', status: 'failed' })
  assert.equal(page.data.analysisStatus, '')
  assert.equal(page.data.currentAnalysisId, '')
  assert.equal(page.data.analysisStatusText, '')
  assert.equal(profileLoads, 0)
  assert.ok(wx.calls.some(call => call.name === 'showToast' && /失败/.test(call.payload.title)))

  // timeout branch clears state without reloading
  wx.calls.length = 0
  pollOptions.onTimeout()
  assert.equal(page.data.analysisStatus, '')
  assert.equal(page.data.currentAnalysisId, '')
  assert.equal(page.data.analysisStatusText, '')
  assert.ok(wx.calls.some(call => call.name === 'showToast' && /稍后/.test(call.payload.title)))
})

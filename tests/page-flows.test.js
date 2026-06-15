const test = require('node:test')
const assert = require('node:assert/strict')
const { createWxMock, loadPage } = require('./helpers/page-harness')
const util = require('../miniprogram/utils/util')
const {
  buildTraceableUrl,
  fallbackTraceableAction,
  isTraceableAction,
  normalizeTraceableAction
} = require('../miniprogram/utils/traceable-actions')

test('traceable actions build deterministic page urls', () => {
  assert.equal(
    buildTraceableUrl({
      type: 'subject-home',
      studentId: 'student-1',
      studentName: '钟青羽',
      grade: 6,
      subject: 'math',
      subjectName: '数学'
    }),
    '/pages/subject-home/subject-home?studentId=student-1&subject=math&subjectName=%E6%95%B0%E5%AD%A6&studentName=%E9%92%9F%E9%9D%92%E7%BE%BD&grade=6'
  )

  assert.equal(
    buildTraceableUrl({ type: 'report-detail', id: 'report-1' }),
    '/pages/report/report?id=report-1'
  )

  assert.equal(
    buildTraceableUrl({ type: 'paper-workbench', id: 'paper-1' }),
    '/pages/paper-preview/paper-preview?paperId=paper-1'
  )

  assert.equal(
    buildTraceableUrl({
      type: 'bottleneck-detail',
      studentId: 'student-1',
      subject: 'math',
      id: 'LP-001',
      studentName: '钟青羽'
    }),
    '/pages/bottleneck-detail/bottleneck-detail?studentId=student-1&subject=math&lpCode=LP-001&studentName=%E9%92%9F%E9%9D%92%E7%BE%BD'
  )
})

test('traceable actions support list, permission and empty-state fallbacks', () => {
  assert.equal(
    buildTraceableUrl({
      type: 'learning-records',
      studentId: 'student-1',
      studentName: '钟青羽',
      subject: 'math',
      filter: 'pending-upload'
    }),
    '/pages/upload-history/upload-history?studentId=student-1&studentName=%E9%92%9F%E9%9D%92%E7%BE%BD&subject=math&filter=pending-upload'
  )

  assert.equal(
    buildTraceableUrl({
      type: 'permission-info',
      studentId: 'student-1',
      title: '共同家长权限'
    }),
    '/pages/parent-management/parent-management?studentId=student-1&mode=permission&title=%E5%85%B1%E5%90%8C%E5%AE%B6%E9%95%BF%E6%9D%83%E9%99%90'
  )

  assert.equal(
    buildTraceableUrl(fallbackTraceableAction('empty', {
      studentId: 'student-1',
      subject: 'math',
      title: '暂无诊断记录'
    })),
    '/pages/upload-history/upload-history?studentId=student-1&subject=math&empty=1&title=%E6%9A%82%E6%97%A0%E8%AF%8A%E6%96%AD%E8%AE%B0%E5%BD%95'
  )
})

test('traceable action normalization rejects unknown actions safely', () => {
  assert.equal(isTraceableAction({ type: 'report-detail', id: 'report-1' }), true)
  assert.equal(isTraceableAction({ type: 'unknown', id: 'x' }), false)
  assert.equal(normalizeTraceableAction(null), null)
  assert.equal(buildTraceableUrl({ type: 'unknown', id: 'x' }), null)
})

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
    }
  }
  const { page, wx } = loadPage('miniprogram/pages/index/index.js', {
    modules: {
      '../../utils/cloud': cloud,
      '../../utils/util': { ...util, formatRelativeTime: () => '今天' }
    }
  })

  await page.loadStudents()
  assert.equal(page.data.homeMode, 'single-profile')
  assert.equal(page.data.home.studentName, '钟青羽')
  assert.match(page.data.home.priorityHighlights[0].title, /数学/)
  assert.equal(page.data.home.priorityBottlenecks[0].displayName, '计算基础')
  assert.equal(page.data.activeStudentId, 'student-1')
  assert.equal(page.data.permissions.canManageParents, true)

  page.onViewAllBottlenecks()
  page.onBottleneckTap({ currentTarget: { dataset: { subject: 'math', lpCode: 'LP-001' } } })
  page.onBottleneckAction({ currentTarget: { dataset: { subject: 'math', lpCode: 'LP-001' } } })
  const urls = wx.calls.filter(call => call.name === 'navigateTo').map(call => call.payload.url)
  assert.match(urls[0], /pages\/bottleneck-center\/bottleneck-center/)
  assert.match(urls[1], /pages\/bottleneck-detail\/bottleneck-detail/)
  assert.match(urls[1], /lpCode=LP-001/)
  assert.match(urls[2], /pages\/generate-verification\/generate-verification/)
  assert.match(urls[2], /targetCode=LP-001/)
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

test('learning profile home falls back to legacy student reads when shared access returns no students', async () => {
  const cloud = {
    getAccessibleStudents: async () => [],
    getStudents: async () => [{ _id: 'student-legacy', name: '钟青羽', grade: 6 }],
    getSubjectProfiles: async () => [],
    getStudentDashboard: async () => ({
      permissions: { canView: true, canUpload: true },
      subjectProfiles: [],
      recentReports: [],
      recentPapers: []
    }),
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

  assert.equal(page.data.homeMode, 'single-profile')
  assert.equal(page.data.hasStudents, true)
  assert.equal(page.data.activeStudentId, 'student-legacy')
  assert.equal(page.data.activeStudent.name, '钟青羽')
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
  const wx = createWxMock()
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
    })
  }
  const { page } = loadPage('miniprogram/pages/index/index.js', {
    wx,
    modules: {
      '../../utils/cloud': cloud,
      '../../utils/util': { ...util, formatRelativeTime: () => '今天' }
    }
  })

  await page.loadStudents()
  assert.equal(page.data.homeMode, 'single-profile')
  assert.equal(page.data.permissions.canUpload, true)
  assert.equal(page.data.permissions.canManageParents, false)
  assert.equal(page.data.home.nextAction.primaryText, '生成验证试卷')

  page.onPrimaryAction()
  assert.match(wx.calls.find(call => call.name === 'navigateTo').payload.url, /generate-verification/)
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
  assert.equal(page.data.home.nextAction.primaryText, '生成验证试卷')
  page.onPrimaryReportTap()
  page.onViewAllRecords()
  page.onSubjectTap({ currentTarget: { dataset: { subject: 'math' } } })
  const urls = wx.calls.filter(call => call.name === 'navigateTo').map(call => call.payload.url)
  assert.match(urls[0], /pages\/report\/report\?id=report-1/)
  assert.match(urls[1], /pages\/upload-history\/upload-history/)
  assert.match(urls[2], /pages\/subject-home\/subject-home/)
})

test('bottleneck center loads dashboard bottlenecks and filters by status', async () => {
  const cloud = {
    getStudentDashboard: async studentId => {
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
    }
  }
  const wx = createWxMock()
  const { page } = loadPage('miniprogram/pages/bottleneck-center/bottleneck-center.js', {
    wx,
    modules: { '../../utils/cloud': cloud }
  })

  await page.onLoad({ studentId: 'student-1', studentName: encodeURIComponent('钟青羽') })

  assert.equal(page.data.stats.totalCount, 2)
  assert.equal(page.data.stats.activeCount, 1)
  assert.equal(page.data.filteredBottlenecks[0].displayName, '计算基础')

  page.onStatusFilterTap({ currentTarget: { dataset: { status: 'improved' } } })
  assert.deepEqual(JSON.parse(JSON.stringify(page.data.filteredBottlenecks.map(item => item.displayName))), ['审题理解'])

  page.onBottleneckTap({ currentTarget: { dataset: { subject: 'math', lpCode: 'LP-001' } } })
  page.onGenerateForBottleneck({ currentTarget: { dataset: { subject: 'math', lpCode: 'LP-001' } } })
  const urls = wx.calls.filter(call => call.name === 'navigateTo').map(call => call.payload.url)
  assert.match(urls[0], /pages\/bottleneck-detail\/bottleneck-detail/)
  assert.match(urls[1], /pages\/generate-verification\/generate-verification/)
  assert.match(urls[1], /targetCode=LP-001/)
})

test('bottleneck center falls back to subject profiles when dashboard request times out', async () => {
  const cloud = {
    getStudentDashboard: async () => { throw new Error('studentData:getStudentDashboard 请求超时，请稍后重试') },
    getSubjectProfiles: async studentId => {
      assert.equal(studentId, 'student-1')
      return [{
        subject: 'math',
        subjectName: '数学',
        currentBottlenecks: [
          { lpCode: 'LP-001', status: 'persisting', trend: 'persisting', weight: 80, evidenceCount: 3 }
        ]
      }]
    }
  }
  const wx = createWxMock()
  const { page } = loadPage('miniprogram/pages/bottleneck-center/bottleneck-center.js', {
    wx,
    modules: { '../../utils/cloud': cloud }
  })

  await page.onLoad({ studentId: 'student-1', studentName: encodeURIComponent('钟青羽') })

  assert.equal(page.data.loading, false)
  assert.equal(page.data.stats.totalCount, 1)
  assert.equal(page.data.filteredBottlenecks[0].displayName, '计算基础')
  assert.equal(page.data.filteredBottlenecks[0].statusBadgeText, '持续观察')
  assert.equal(wx.calls.some(call => call.name === 'showToast' && call.payload.title === '学习卡点加载失败'), false)
})

test('bottleneck detail builds a focused evidence workbench without repetitive report and paper lists', async () => {
  const cloud = {
    getSubjectDashboard: async (studentId, subject) => {
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
    }
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

  assert.equal(page.data.bottleneck.displayName, '计算基础')
  assert.equal(page.data.relatedReports.length, 2)
  assert.equal(page.data.relatedPapers.length, 2)
  assert.equal(page.data.evidenceChain.length, 4)
  assert.equal(page.data.visibleEvidenceChain.length, 3)
  assert.equal(page.data.hiddenEvidenceCount, 1)
  assert.deepEqual(JSON.parse(JSON.stringify(page.data.visibleEvidenceChain.map(item => item.category))), ['验证试卷', '验证反馈', '验证试卷'])
  assert.deepEqual(JSON.parse(JSON.stringify(page.data.visibleEvidenceChain.map(item => item.title))), ['数学-20260613-01', '验证反馈', '数学-20260612-01'])
  assert.ok(page.data.visibleEvidenceChain[0].metaChips.includes('待上传'))
  assert.ok(page.data.visibleEvidenceChain[1].metaChips.includes('关联 数学-20260612-01'))
  assert.ok(page.data.visibleEvidenceChain[2].metaChips.includes('已反馈'))

  page.onToggleEvidence()
  assert.equal(page.data.visibleEvidenceChain.length, 4)
  assert.equal(page.data.showAllEvidence, true)

  page.onGenerateVerification()
  page.onViewReport({ currentTarget: { dataset: { id: 'report-1' } } })
  page.onViewPaper({ currentTarget: { dataset: { id: 'paper-1' } } })
  const urls = wx.calls.filter(call => call.name === 'navigateTo').map(call => call.payload.url)
  assert.match(urls[0], /pages\/generate-verification\/generate-verification/)
  assert.match(urls[0], /targetCode=LP-001/)
  assert.match(urls[1], /pages\/report\/report\?id=report-1/)
  assert.match(urls[2], /pages\/paper-preview\/paper-preview\?paperId=paper-1/)
})

test('subject selection ensures a profile before entering the subject home', async () => {
  let ensured = null
  const cloud = {
    ensureSubjectProfile: async (...args) => { ensured = args }
  }
  const wx = createWxMock()
  const { page } = loadPage('miniprogram/pages/subject-select/subject-select.js', {
    wx,
    modules: { '../../utils/cloud': cloud }
  })
  page.setData({ studentId: 'student-1', studentName: '钟青羽', grade: 5 })

  await page.onSubjectTap({ currentTarget: { dataset: { key: 'math', name: '数学' } } })
  assert.deepEqual(ensured, ['student-1', 'math', '数学'])
  assert.match(wx.calls.find(call => call.name === 'navigateTo').payload.url, /pages\/subject-home\/subject-home/)
  assert.equal(page.data.enteringSubject, '')
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

test('subject home falls back to legacy profile and reports when dashboard request times out', async () => {
  const cloud = {
    getSubjectDashboard: async () => { throw new Error('studentData:getSubjectDashboard 请求超时，请稍后重试') },
    getSubjectProfile: async (studentId, subject) => {
      assert.equal(studentId, 'student-1')
      assert.equal(subject, 'math')
      return {
        totalReports: 1,
        currentBottlenecks: [
          { lpCode: 'LP-001', status: 'persisting', trend: 'persisting', weight: 80, evidenceCount: 3 }
        ]
      }
    },
    getReports: async (studentId, subject) => {
      assert.equal(studentId, 'student-1')
      assert.equal(subject, 'math')
      return [{
        _id: 'report-1',
        status: 'completed',
        isEffective: true,
        createdAt: '2026-06-14T10:00:00+08:00',
        changeSummary: '计算基础仍需观察'
      }]
    }
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

  assert.equal(page.data.subjectTitle, '数学工作台')
  assert.equal(page.data.primaryTask.actionType, 'verification')
  assert.deepEqual(JSON.parse(JSON.stringify(page.data.taskQueue.map(item => item.displayName))), ['计算基础'])
  assert.ok(page.data.tools.some(item => item.key === 'latestReport'))
})

test('subject home task and primary actions open the focused workflow', () => {
  const wx = createWxMock()
  const { page } = loadPage('miniprogram/pages/subject-home/subject-home.js', {
    wx,
    modules: {
      '../../utils/cloud': {},
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
    primaryTask: { actionType: 'verification' }
  })

  page.onTaskTap({ currentTarget: { dataset: { code: 'LP-001' } } })
  page.onPrimaryAction()

  const urls = wx.calls.filter(call => call.name === 'navigateTo').map(call => call.payload.url)
  assert.match(urls[0], /pages\/bottleneck-detail\/bottleneck-detail/)
  assert.match(urls[0], /lpCode=LP-001/)
  assert.match(urls[1], /pages\/generate-verification\/generate-verification/)
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

test('upload skips HEIF images that cannot be converted with a readable toast', async () => {
  const wx = createWxMock({
    chooseMedia: options => options.success({
      tempFiles: [
        { tempFilePath: '/tmp/broken.heif', size: 100 }
      ]
    }),
    compressImage: options => options.fail(new Error('unsupported format'))
  })
  const { page } = loadPage('miniprogram/pages/upload/upload.js', {
    wx,
    modules: { '../../utils/cloud': {} }
  })

  await page.onChooseImage()

  assert.equal(page.data.images.length, 0)
  assert.equal(page.data.canSubmit, false)
  const toastTitles = wx.calls.filter(call => call.name === 'showToast').map(call => call.payload.title)
  assert.ok(toastTitles.some(title => /HEIF/.test(title)))
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

test('upload retry reuses already uploaded images and only uploads missing files', async () => {
  let submitted = null
  const uploadedTempPaths = []
  const cloud = {
    callUploadAndAnalyze: async payload => {
      submitted = payload
      return { success: true, reportId: 'report-1' }
    }
  }
  const { page } = loadPage('miniprogram/pages/upload/upload.js', {
    modules: { '../../utils/cloud': cloud }
  })
  page.uploadOne = async image => {
    uploadedTempPaths.push(image.tempPath)
    return `cloud://uploaded-${uploadedTempPaths.length}`
  }
  page.setData({
    studentId: 'student-1',
    subject: 'math',
    mode: 'diagnosis',
    images: [
      {
        tempPath: '/tmp/already.jpg',
        fileName: 'already.jpg',
        fileSize: 100,
        fileId: 'cloud://already-uploaded',
        uploaded: true
      },
      {
        tempPath: '/tmp/new.jpg',
        fileName: 'new.jpg',
        fileSize: 200,
        fileId: '',
        uploaded: false
      }
    ]
  })

  await page.onSubmit()

  assert.deepEqual(uploadedTempPaths, ['/tmp/new.jpg'])
  assert.deepEqual(JSON.parse(JSON.stringify(submitted.fileIDs)), [
    'cloud://already-uploaded',
    'cloud://uploaded-1'
  ])
  assert.equal(page.data.images[1].fileId, 'cloud://uploaded-1')
  assert.equal(page.data.images[1].uploaded, true)
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
  assert.equal(page.data.paperConfig.questionCount, 10)
  assert.equal(page.data.paperConfig.pages, 1)
  assert.equal(page.data.paperConfig.strategyText, '每个卡点 3 道核心题 + 2 道迁移题')
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
  assert.equal(page.data.paperConfig.questionCount, 5)
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

test('verification page selects at most five bottlenecks by severity priority', async () => {
  const pendingBottlenecks = [
    { lpCode: 'LP-001', severity: 'low' },
    { lpCode: 'LP-002', severity: 'medium' },
    { lpCode: 'LP-003', severity: 'high' },
    { lpCode: 'LP-004', severity: 'medium' },
    { lpCode: 'LP-005', severity: 'high' },
    { lpCode: 'LP-006', severity: 'low' },
    { lpCode: 'LP-007', severity: 'high' }
  ]
  const cloud = {
    getSubjectProfile: async () => ({ pendingBottlenecks })
  }
  const { page } = loadPage('miniprogram/pages/generate-verification/generate-verification.js', {
    modules: { '../../utils/cloud': cloud }
  })
  page.setData({ studentId: 'student-1', subject: 'math' })

  await page.loadPendingBottlenecks()
  assert.equal(page.data.selectedCount, 5)
  assert.deepEqual(
    JSON.parse(JSON.stringify(page.data.bottlenecks.filter(item => item.selected).map(item => item.lpCode))),
    ['LP-003', 'LP-005', 'LP-007', 'LP-002', 'LP-004']
  )
  assert.ok(page.data.bottlenecks.every(item => !/LP-\d+/.test(item.displayName)))
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
  assert.equal(request.questionCount, 5)
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

test('paper preview formats default paper names without repeating the grade key', () => {
  const { page } = loadPage('miniprogram/pages/paper-preview/paper-preview.js', {
    modules: { '../../utils/cloud': {} }
  })
  assert.equal(
    page.getPaperName({ type: 'default-diagnosis', grade: 3, paperKey: 'grade3_a' }),
    '3年级 A 卷'
  )
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

test('paper preview downloads once and marks the PDF as downloaded', async () => {
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

  await page.onDownload()
  assert.equal(downloadCount, 1)
  assert.ok(wx.calls.some(call => call.name === 'showToast' && /已下载/.test(call.payload.title)))
})

test('report passes its subject name into verification paper generation', () => {
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
  page.setData({
    report: {
      studentId: 'student-1',
      subject: 'chinese',
      bottlenecks: [{ lpCode: 'LP-101' }]
    }
  })

  page.onGenerateVerification()
  const url = wx.calls.find(call => call.name === 'navigateTo').payload.url
  assert.match(url, /subjectName=%E8%AF%AD%E6%96%87/)
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

test('subject home stops polling and surfaces a stale analysis task', async () => {
  let pollOptions = null
  const { page } = loadPage('miniprogram/pages/subject-home/subject-home.js', {
    modules: {
      '../../utils/cloud': {},
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
  await pollOptions.onTimeoutStatus()

  assert.equal(page.data.analysisStatusText, '分析可能超时，可刷新或重试')
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

test('learning records show only fresh transient states and hide stale dirty tasks', async () => {
  const now = new Date()
  const freshTime = new Date(now.getTime() - 5 * 60 * 1000).toISOString()
  const staleTime = new Date(now.getTime() - 60 * 60 * 1000).toISOString()
  const cloud = {
    getReports: async () => [
      {
        _id: 'report-fresh',
        subject: 'math',
        type: 'diagnosis',
        status: 'analyzing',
        createdAt: freshTime,
        updatedAt: freshTime
      },
      {
        _id: 'report-stale',
        subject: 'math',
        type: 'diagnosis',
        status: 'failed',
        createdAt: staleTime,
        updatedAt: staleTime
      }
    ],
    getPapers: async () => [],
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

  const statuses = page.data.days.flatMap(day => day.statusItems)
  assert.deepEqual(JSON.parse(JSON.stringify(statuses.map(item => item.reportId))), ['report-fresh'])
  assert.equal(statuses[0].status, 'analyzing')
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
    limit: 50
  })
  assert.deepEqual(JSON.parse(JSON.stringify(seen.papers)), { studentId: 'student-1' })
  assert.equal(page.data.activeSubject, '')
  assert.equal(page.data.titleText, '钟青羽 · 学习记录')
  assert.deepEqual(JSON.parse(JSON.stringify(page.data.days[0].events.map(event => event.title))), [
    '生成数学验证试卷',
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

  assert.deepEqual(JSON.parse(JSON.stringify(seen.timeline)), { studentId: 'student-1' })
  assert.equal(seen.legacyReports, 0)
  assert.equal(seen.legacyPapers, 0)
  assert.deepEqual(JSON.parse(JSON.stringify(page.data.days[0].events.map(event => event.title))), [
    '生成数学验证试卷',
    '数学诊断报告'
  ])
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
    limit: 50
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
    '生成英语验证试卷',
    '数学诊断报告',
    '语文诊断报告'
  ])
  assert.equal(page.data.filters.find(item => item.key === '').active, true)
})

test('learning records show a subject-filter empty state when the complete timeline has records', async () => {
  const cloud = {
    getReports: async () => [{
      _id: 'math-report',
      subject: 'math',
      type: 'diagnosis',
      status: 'completed',
      createdAt: '2026-06-11T10:00:00Z'
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
  page.setData({
    studentId: 'student-1',
    subject: 'chinese',
    activeSubject: 'chinese',
    subjectName: '语文',
    studentName: '钟青羽'
  })

  await page.loadHistory()

  assert.equal(page.data.allDays.length, 1)
  assert.equal(page.data.days.length, 0)
  assert.equal(page.data.emptyTitle, '当前学科暂无记录')
  assert.equal(page.data.emptyDesc, '可切换“全部”查看其他学习记录。')
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

  page.onGenerateVerification()
  page.onRetryAnalysis()
  assert.equal(retryCalled, true)
  assert.match(wx.calls.find(call => call.name === 'navigateTo').payload.url, /generate-verification/)
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

test('upload history degrades gracefully when some temporary URLs are empty', async () => {
  const cloud = {
    getReports: async () => [{
      _id: 'report-1',
      type: 'diagnosis',
      createdAt: '2026-06-11T10:00:00Z',
      imageFiles: [
        { fileID: 'cloud://ok', fileName: 'a.jpg', ocrSummary: 'OK' },
        { fileID: 'cloud://expired', fileName: 'b.jpg', ocrSummary: 'OLD' }
      ]
    }],
    getPapers: async () => [],
    getTempFileURLs: async () => [
      { fileID: 'cloud://ok', tempFileURL: 'https://temp/ok' },
      { fileID: 'cloud://expired', tempFileURL: '' }
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
  page.setData({ studentId: 'student-1', subject: 'math' })

  await page.loadHistory()
  assert.equal(page.data.loading, false)
  assert.equal(page.data.days[0].events[0].photos[0].tempFileURL, 'https://temp/ok')
  assert.equal(page.data.days[0].events[0].photos[1].tempFileURL, '')

  // previewing the expired photo shows a toast and does not crash
  page.onPreviewPhoto({ currentTarget: { dataset: { dayIndex: 0, eventIndex: 0, photoIndex: 1 } } })
  const expiredToast = wx.calls.find(call => call.name === 'showToast' && /无法预览/.test(call.payload.title))
  assert.ok(expiredToast)
  assert.equal(wx.calls.some(call => call.name === 'previewImage'), false)

  // previewing the valid photo filters out the empty URL from the urls list
  page.onPreviewPhoto({ currentTarget: { dataset: { dayIndex: 0, eventIndex: 0, photoIndex: 0 } } })
  const previewCall = wx.calls.find(call => call.name === 'previewImage')
  assert.deepEqual(previewCall.payload.urls, ['https://temp/ok'])
  assert.equal(previewCall.payload.current, 'https://temp/ok')
})

test('upload history keeps timeline visible when temporary URL loading fails', async () => {
  const cloud = {
    getLearningTimeline: async () => ({
      reports: [{
        _id: 'report-1',
        studentId: 'student-1',
        subject: 'math',
        status: 'completed',
        type: 'diagnosis',
        createdAt: '2026-06-14T10:00:00+08:00',
        summary: '发现计算基础卡点',
        imageFiles: [{ fileID: 'cloud://photo-1', fileName: 'math.jpg' }]
      }],
      papers: []
    }),
    getReports: async () => [],
    getPapers: async () => [],
    getTempFileURLs: async () => { throw new Error('getTempFileURL timeout') }
  }
  const wx = createWxMock()
  const { page } = loadPage('miniprogram/pages/upload-history/upload-history.js', {
    wx,
    modules: {
      '../../utils/cloud': cloud,
      '../../utils/util': util
    }
  })
  page.setData({ studentId: 'student-1', subject: 'math' })

  await page.loadHistory()

  assert.equal(page.data.loading, false)
  assert.equal(page.data.days.length, 1)
  assert.equal(page.data.days[0].events[0].title, '数学诊断报告')
  assert.equal(page.data.days[0].events[0].photos[0].tempFileURL, '')
  assert.equal(wx.calls.some(call => call.name === 'showToast' && /加载失败/.test(call.payload.title)), false)
})

test('upload history surfaces load errors without leaving the loading flag stuck', async () => {
  const cloud = {
    getReports: async () => { throw new Error('network down') },
    getPapers: async () => [],
    getTempFileURLs: async () => []
  }
  const wx = createWxMock()
  const { page } = loadPage('miniprogram/pages/upload-history/upload-history.js', {
    wx,
    modules: {
      '../../utils/cloud': cloud,
      '../../utils/util': util
    }
  })
  page.setData({ studentId: 'student-1', subject: 'math' })

  await page.loadHistory()
  assert.equal(page.data.loading, false)
  assert.equal(page.data.days.length, 0)
  const errorToast = wx.calls.find(call => call.name === 'showToast' && /加载失败/.test(call.payload.title))
  assert.ok(errorToast)
})

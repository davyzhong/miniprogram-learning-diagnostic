const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const ROOT = path.resolve(__dirname, '..')
const { loadPageAndWait, flushAsync, waitForPageLoad, isThenable } = require('./helpers/page-flow-utils')
const { createWxMock, loadPage } = require('./helpers/page-harness')
const util = require('../miniprogram/utils/util')

test('bottleneck pages derive B1 subject classes while retaining task and evidence actions', () => {
  const center = fs.readFileSync(path.join(ROOT, 'miniprogram/pages/bottleneck-center/bottleneck-center.wxml'), 'utf8')
  const detail = fs.readFileSync(path.join(ROOT, 'miniprogram/pages/bottleneck-detail/bottleneck-detail.wxml'), 'utf8')
  const detailJs = fs.readFileSync(path.join(ROOT, 'miniprogram/pages/bottleneck-detail/bottleneck-detail.js'), 'utf8')

  assert.match(center, /b1-subject-\{\{item\.subjectClass\}\}/)
  assert.match(detail, /b1-subject-\{\{bottleneck\.subjectClass\}\}/)
  assert.match(detail, /bindtap="onOpenLearningResource"/)
  assert.match(detailJs, /onEvidenceTap/)
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

  await loadPageAndWait(page, { studentId: 'student-1', studentName: encodeURIComponent('钟青羽') })

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

test('bottleneck detail sanitizes ID-only evidence summaries while retaining route IDs', async () => {
  const cloud = {
    getSubjectDashboard: async () => ({
      profile: {
        subject: 'math',
        currentBottlenecks: [{ lpCode: 'LP-UNKNOWN-01', status: 'needs_verification' }]
      },
      reports: [{
        _id: '665f8c1a2b3c4d5e6f708192',
        subject: 'math',
        status: 'completed',
        lpCode: 'LP-UNKNOWN-01',
        bottlenecks: [{ lpCode: 'LP-UNKNOWN-01' }],
        summary: '复测 BN-LEGACY-UNKNOWN-01 和 MATH-UNKNOWN-NODE'
      }],
      papers: []
    })
  }
  const { page } = loadPage('miniprogram/pages/bottleneck-detail/bottleneck-detail.js', {
    modules: { '../../utils/cloud': cloud }
  })

  await loadPageAndWait(page, {
    studentId: 'student-1',
    subject: 'math',
    lpCode: 'LP-UNKNOWN-01'
  })

  assert.equal(page.data.visibleEvidenceChain[0].id, '665f8c1a2b3c4d5e6f708192')
  assert.doesNotMatch(page.data.visibleEvidenceChain[0].summary, /BN-|MATH-/)
  assert.doesNotMatch(page.data.bottleneck.displayName, /LP-/)
})

test('learning progress compacts ID-only improved bottlenecks into readable text', async () => {
  const cloud = {
    getLearningProgress: async () => ({
      success: true,
      data: {
        timeline: [{
          reportId: 'report-route-id',
          isVerification: true,
          improvedBottlenecks: ['LP-001', 'BN-LEGACY-UNKNOWN-01']
        }],
        bottleneckMatrix: []
      }
    })
  }
  const { page } = loadPage('miniprogram/pages/learning-progress/learning-progress.js', {
    modules: { '../../utils/cloud': cloud }
  })

  page.studentId = 'student-1'
  page.subject = 'math'
  await page.loadData()

  assert.equal(page.data.timeline[0].reportId, 'report-route-id')
  assert.equal(page.data.timeline[0].improvedBottlenecksText, '计算基础等 2 个学习卡点')
})

test('learning progress sanitizes timeline summaries while preserving report route IDs', async () => {
  const cloud = {
    getLearningProgress: async () => ({
      success: true,
      data: {
        timeline: [{
          reportId: '665f8c1a2b3c4d5e6f708192',
          summary: '复测 BN-LEAK-01 与 cloud://env/file'
        }],
        bottleneckMatrix: []
      }
    })
  }
  const { page } = loadPage('miniprogram/pages/learning-progress/learning-progress.js', {
    modules: { '../../utils/cloud': cloud }
  })

  page.studentId = 'student-1'
  page.subject = 'math'
  await page.loadData()

  assert.equal(page.data.timeline[0].reportId, '665f8c1a2b3c4d5e6f708192')
  assert.doesNotMatch(page.data.timeline[0].summary, /BN-|cloud:\/\//)
  assert.equal(page.data.timeline[0].summary, '复测')
})

test('learning progress maps ID-only matrix labels without changing status route data', async () => {
  const cloud = {
    getLearningProgress: async () => ({
      success: true,
      data: {
        timeline: [{ reportId: 'report-route-id' }],
        bottleneckMatrix: [{
          lpCode: 'LP-LEAK-01',
          lpName: 'LP-LEAK-01',
          statuses: [{ reportId: 'report-route-id', status: 'persisting' }]
        }]
      }
    })
  }
  const { page } = loadPage('miniprogram/pages/learning-progress/learning-progress.js', {
    modules: { '../../utils/cloud': cloud }
  })

  page.studentId = 'student-1'
  page.subject = 'math'
  await page.loadData()

  assert.equal(page.data.bottleneckMatrix[0].lpCode, 'LP-LEAK-01')
  assert.equal(page.data.bottleneckMatrix[0].lpName, '待确认学习卡点')
  assert.deepEqual(JSON.parse(JSON.stringify(page.data.bottleneckMatrix[0].statusIcons)), ['持续'])
})

test('learning progress replaces backend error details with a neutral toast', async () => {
  const wx = createWxMock()
  const cloud = {
    // cloud 封装在 success === false 时会 throw（信封契约），这里模拟真实失败路径
    getLearningProgress: async () => {
      throw new Error('失败 BN-ERROR-01 cloud://env/file')
    }
  }
  const { page } = loadPage('miniprogram/pages/learning-progress/learning-progress.js', {
    wx,
    modules: { '../../utils/cloud': cloud }
  })

  page.studentId = 'student-route-id'
  page.subject = 'math'
  await page.loadData()

  const toast = wx.calls.find(call => call.name === 'showToast')
  assert.equal(toast.payload.title, '加载失败，请稍后重试')
  assert.equal(page.studentId, 'student-route-id')
})


test('bottleneck center opens learning resources for the tapped fine bottleneck', async () => {
  let requestedTarget = null
  const cloud = {
    getStudentDashboard: async () => ({
      student: { _id: 'student-1', name: '钟青羽' },
      subjectProfiles: [{
        subject: 'math',
        currentBottlenecks: [{
          lpCode: 'LP-001',
          lpName: '计算基础',
          status: 'persisting',
          candidateBottlenecks: [
            { title: '小数乘法拆分后加法求和错误', evidenceStrength: 'medium' },
            { title: '异分母分数加减法通分方法不熟练', evidenceStrength: 'medium' }
          ]
        }]
      }]
    }),
    generateLearningResourcePack: async payload => {
      requestedTarget = payload.target
      return { success: true, packId: 'pack-2' }
    }
  }
  const wx = createWxMock()
  const { page } = loadPage('miniprogram/pages/bottleneck-center/bottleneck-center.js', {
    wx,
    modules: { '../../utils/cloud': cloud }
  })

  await loadPageAndWait(page, { studentId: 'student-1', studentName: encodeURIComponent('钟青羽') })

  const second = page.data.filteredBottlenecks.find(item => item.displayName === '异分母分数加减法通分方法不熟练')
  assert.ok(second)
  await page.onOpenLearningResource({
    currentTarget: {
      dataset: {
        subject: second.subject,
        lpCode: second.lpCode,
        bottleneckId: second.bottleneckId,
        viewId: second.viewId
      }
    }
  })

  assert.equal(requestedTarget.title, '异分母分数加减法通分方法不熟练')
  assert.equal(requestedTarget.lpCode, 'LP-001')
  assert.equal(requestedTarget.targetId, second.viewId)
  assert.match(wx.calls.filter(call => call.name === 'navigateTo').pop().payload.url, /packId=pack-2/)
})

test('bottleneck task actions hide backend failure details', async () => {
  for (const pageName of ['bottleneck-center', 'bottleneck-detail']) {
    const wx = createWxMock()
    const cloud = {
      generateLearningResourcePack: async () => {
        throw new Error('失败 BN-ERROR-01 cloud://env/file')
      }
    }
    const { page } = loadPage(`miniprogram/pages/${pageName}/${pageName}.js`, {
      wx,
      modules: { '../../utils/cloud': cloud }
    })
    const bottleneck = { lpCode: 'LP-001', displayName: '计算基础', subject: 'math' }
    page.setData({
      studentId: 'student-route-id',
      subject: 'math',
      allBottlenecks: [bottleneck],
      bottleneck
    })

    await page.onOpenLearningResource({
      currentTarget: { dataset: { lpCode: 'LP-001', subject: 'math' } }
    })

    assert.equal(wx.calls.filter(call => call.name === 'showToast').at(-1).payload.title, '任务生成失败，请稍后重试')
    assert.equal(page.data.studentId, 'student-route-id')
  }
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

  await loadPageAndWait(page, {
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

  await loadPageAndWait(page, {
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



test('bottleneck detail uses forward action wording instead of duplicate return wording', () => {
  const source = fs.readFileSync(path.join(ROOT, 'miniprogram/pages/bottleneck-detail/bottleneck-detail.wxml'), 'utf8')

  assert.doesNotMatch(source, /返回卡点中心/)
  assert.match(source, /查看全部卡点/)
})

test('learning progress exposes an improvement rate for the header pill', async () => {
  const cloud = {
    getLearningProgress: async () => ({
      success: true,
      data: {
        timeline: [],
        bottleneckMatrix: [],
        summary: { totalRounds: 3, improvedCount: 2, pendingCount: 1, persistingCount: 1 }
      }
    })
  }
  const { page } = loadPage('miniprogram/pages/learning-progress/learning-progress.js', {
    modules: { '../../utils/cloud': cloud }
  })

  page.studentId = 'student-1'
  page.subject = 'math'
  await page.loadData()

  assert.equal(page.data.improvementRateText, '50%')
  assert.equal(page.data.headerSymbol, '📈')
})

test('learning progress hides the improvement rate when there are no bottlenecks', async () => {
  const cloud = {
    getLearningProgress: async () => ({
      success: true,
      data: { timeline: [], bottleneckMatrix: [], summary: { totalRounds: 0 } }
    })
  }
  const { page } = loadPage('miniprogram/pages/learning-progress/learning-progress.js', {
    modules: { '../../utils/cloud': cloud }
  })

  page.studentId = 'student-1'
  page.subject = 'math'
  await page.loadData()

  assert.equal(page.data.improvementRateText, '')
})

test('bottleneck center exposes a full status composition bar under the stats grid', async () => {
  const cloud = {
    getStudentDashboard: async () => ({
      student: { name: '钟青羽' },
      subjectProfiles: [{
        subject: 'math',
        currentBottlenecks: [
          { lpCode: 'LP-001', status: 'needs_verification' },
          { lpCode: 'LP-002', status: 'persisting' },
          { lpCode: 'LP-003', status: 'improved' }
        ]
      }]
    })
  }
  const { page } = loadPage('miniprogram/pages/bottleneck-center/bottleneck-center.js', {
    modules: { '../../utils/cloud': cloud }
  })

  await page.onLoad({ studentId: 'student-1' })

  assert.deepEqual(JSON.parse(JSON.stringify(page.data.statsSegments.map(item => item.key))), ['waiting', 'persisting', 'improved'])
  assert.deepEqual(JSON.parse(JSON.stringify(page.data.statsSegments.map(item => item.count))), [1, 1, 1])
  assert.equal(page.data.statsSegments.reduce((sum, item) => sum + item.widthPercent, 0), 100)
  assert.equal(page.data.learnSymbol, '📋')
  assert.equal(page.data.verifySymbol, '✅')
})

test('bottleneck detail builds a two-tone verification pass bar from counts', async () => {
  const cloud = {
    getSubjectDashboard: async () => ({
      profile: {
        subject: 'math',
        currentBottlenecks: [{
          lpCode: 'LP-001',
          lpName: '计算错误（加减乘除）',
          status: 'needs_verification',
          verificationPassCount: 3,
          verificationFailCount: 1
        }]
      },
      reports: [],
      papers: []
    })
  }
  const { page } = loadPage('miniprogram/pages/bottleneck-detail/bottleneck-detail.js', {
    modules: { '../../utils/cloud': cloud }
  })

  await loadPageAndWait(page, { studentId: 'student-1', subject: 'math', lpCode: 'LP-001' })

  assert.deepEqual(JSON.parse(JSON.stringify(page.data.passRateSegments.map(item => item.key))), ['pass', 'fail'])
  assert.deepEqual(JSON.parse(JSON.stringify(page.data.passRateSegments.map(item => item.tone))), ['improved', 'destructive'])
  assert.equal(page.data.passRateSegments.reduce((sum, item) => sum + item.widthPercent, 0), 100)
  assert.equal(page.data.subjectSymbol, '📐')
})

test('bottleneck detail hides the pass bar when there is no verification yet', async () => {
  const cloud = {
    getSubjectDashboard: async () => ({
      profile: {
        subject: 'math',
        currentBottlenecks: [{ lpCode: 'LP-001', lpName: '计算错误（加减乘除）', status: 'needs_verification' }]
      },
      reports: [],
      papers: []
    })
  }
  const { page } = loadPage('miniprogram/pages/bottleneck-detail/bottleneck-detail.js', {
    modules: { '../../utils/cloud': cloud }
  })

  await loadPageAndWait(page, { studentId: 'student-1', subject: 'math', lpCode: 'LP-001' })

  assert.deepEqual(JSON.parse(JSON.stringify(page.data.passRateSegments)), [])
})

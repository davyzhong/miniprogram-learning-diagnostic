const { loadPage, createWxMock } = require('./page-harness')

const INTERNAL_SUMMARY = '复测 BN-AUDIT-LEAK-01 与 cloud://env/file'
const BACKEND_ERROR = '失败 BN-ERROR-01 cloud://env/file'
const OPAQUE_ID = '665f8c1a2b3c4d5e6f708192'

function state(name, model) {
  return { state: name, model }
}

function presenterAdapter(modulePath, build, supportsError = false) {
  return { kind: 'presenter', modulePath, supportsError, buildStates: build }
}

function controllerAdapter(modulePath, build) {
  return { kind: 'controller', modulePath, supportsError: true, buildStates: build }
}

function visibleControllerModel(page, wx) {
  const toastMessages = wx.calls
    .filter(call => ['showToast', 'showLoading', 'setNavigationBarTitle'].includes(call.name))
    .map(call => call.payload && call.payload.title)
    .filter(Boolean)
  return { ...page.data, toastMessages }
}

async function runController(modulePath, cloud = {}, execute = async () => {}) {
  const wx = createWxMock()
  const { page } = loadPage(modulePath, { wx, modules: { '../../utils/cloud': cloud } })
  await execute(page, wx)
  return visibleControllerModel(page, wx)
}

function homePresenterStates() {
  const { buildLearningProfileHomeView } = require('../../miniprogram/pages/index/index-presenter')
  const build = input => buildLearningProfileHomeView(input, () => '今天')
  return [
    state('normal', build({ student: { _id: 'student-1', name: '小明' }, profiles: [], reports: [], papers: [] })),
    state('empty', build({ student: { _id: 'student-1', name: '小明' }, profiles: [], reports: [], papers: [] })),
    state('legacy-id-only', build({
      student: { _id: 'student-1', name: '小明' },
      profiles: [{ subject: 'math', currentBottlenecks: [{ lpCode: 'LP-AUDIT-LEAK-01', status: 'needs_verification' }] }],
      reports: [{ _id: OPAQUE_ID, subject: 'math', type: 'diagnosis', status: 'completed', summary: INTERNAL_SUMMARY }],
      papers: []
    }))
  ]
}

async function indexStates() {
  return [
    ...homePresenterStates(),
    state('error', await runController('miniprogram/pages/index/index.js', {
      getAccessibleStudents: async () => Object.defineProperty({}, 'length', {
        get() { throw new Error(BACKEND_ERROR) }
      })
    }, async page => { await page.loadStudents({ force: true }) }))
  ]
}

async function studentProfileStates() {
  return [
    ...homePresenterStates(),
    state('error', await runController('miniprogram/pages/student-profile/student-profile.js', {
      getStudents: async () => ({ find() { throw new Error(BACKEND_ERROR) } })
    }, async page => {
      page.setData({ studentId: 'student-route-id' })
      await page.loadProfile({ force: true })
    }))
  ]
}

async function subjectHomeStates() {
  const { buildSubjectHomeView } = require('../../miniprogram/pages/subject-home/subject-home-presenter')
  const build = (profile, reports) => buildSubjectHomeView(profile, reports, () => '今天', { subject: 'math', subjectName: '数学' })
  return [
    state('normal', build({ subject: 'math', currentBottlenecks: [{ lpCode: 'LP-001' }] }, [])),
    state('empty', build({}, [])),
    state('legacy-id-only', build(
      { subject: 'math', currentBottlenecks: [{ lpCode: 'LP-AUDIT-LEAK-01' }] },
      [{ _id: OPAQUE_ID, subject: 'math', type: 'diagnosis', status: 'completed', summary: INTERNAL_SUMMARY }]
    )),
    state('error', await runController('miniprogram/pages/subject-home/subject-home.js', {
      seedEnglishPersonalVocabulary: async () => { throw new Error(BACKEND_ERROR) }
    }, async page => {
      page.setData({ studentId: 'student-route-id', subject: 'english', canWriteActions: true })
      await page.importEnglishVocabulary()
    }))
  ]
}

async function reportStates() {
  const { buildReportView } = require('../../miniprogram/pages/report/report-presenter')
  return [
    state('normal', buildReportView({ subject: 'math', type: 'diagnosis', summary: '计算基础需要验证', bottlenecks: [{ lpCode: 'LP-001' }] })),
    state('empty', buildReportView({ subject: 'math', type: 'diagnosis', bottlenecks: [] })),
    state('legacy-id-only', buildReportView({
      _id: OPAQUE_ID,
      subject: 'math',
      type: 'diagnosis',
      summary: INTERNAL_SUMMARY,
      bottlenecks: [{ lpCode: 'LP-AUDIT-LEAK-01' }]
    })),
    state('error', await runController('miniprogram/pages/report/report.js', {
      generateLearningResourcePack: async () => { throw new Error(BACKEND_ERROR) }
    }, async page => {
      page._fullReport = { _id: OPAQUE_ID, studentId: 'student-route-id', subject: 'math' }
      await page.onBottleneckSnapshotTap({ currentTarget: { dataset: { lpCode: 'LP-001', lpName: '计算基础' } } })
    }))
  ]
}

async function uploadHistoryStates() {
  const presenter = require('../../miniprogram/pages/upload-history/upload-history-presenter')
  const build = report => {
    const { events, statusItems } = presenter.buildTimelineEvents(report ? [report] : [], [], new Map(), 'math', '数学')
    return presenter.buildHistoryState(events, 'math', statusItems)
  }
  return [
    state('normal', build({ _id: 'report-1', subject: 'math', status: 'completed', summary: '计算基础需要验证', createdAt: '2026-07-01' })),
    state('empty', build(null)),
    state('legacy-id-only', build({ _id: OPAQUE_ID, subject: 'math', status: 'completed', summary: INTERNAL_SUMMARY, createdAt: '2026-07-01' })),
    state('error', await runController('miniprogram/pages/upload-history/upload-history.js', {
      getLearningTimeline: async () => { throw new Error(BACKEND_ERROR) },
      getReports: async () => { throw new Error(BACKEND_ERROR) }
    }, async page => {
      page.setData({ studentId: 'student-route-id', subject: 'math' })
      await page.loadHistory()
    }))
  ]
}

async function knowledgeMapStates() {
  const { buildKnowledgeMapPageView } = require('../../miniprogram/pages/knowledge-map/knowledge-map-presenter')
  return [
    state('normal', buildKnowledgeMapPageView({ currentBottlenecks: [{ lpCode: 'LP-001' }] }, 'math')),
    state('empty', buildKnowledgeMapPageView({}, 'math')),
    state('legacy-id-only', buildKnowledgeMapPageView({ currentBottlenecks: [{ lpCode: 'LP-AUDIT-LEAK-01', bottleneckId: 'BN-AUDIT-LEAK-01' }] }, 'math')),
    state('error', await runController('miniprogram/pages/knowledge-map/knowledge-map.js', {
      getSubjectProfile: async () => { throw new Error(BACKEND_ERROR) }
    }, async page => {
      page.setData({ studentId: 'student-route-id', subject: 'math' })
      await page.loadData()
    }))
  ]
}

async function learningResourceStates() {
  const { buildLearningResourceView } = require('../../miniprogram/pages/learning-resource/learning-resource-presenter')
  return [
    state('normal', buildLearningResourceView({ title: '小数除法学习任务' })),
    state('empty', buildLearningResourceView({})),
    state('legacy-id-only', buildLearningResourceView({
      _id: OPAQUE_ID,
      title: INTERNAL_SUMMARY,
      externalResources: [{ resourceId: 'RES-AUDIT-LEAK-01', platform: 'B站' }]
    })),
    state('error', await runController('miniprogram/pages/learning-resource/learning-resource.js', {
      getLearningResourcePack: async () => ({ success: false, error: BACKEND_ERROR })
    }, async page => {
      page.setData({ packId: OPAQUE_ID })
      await page.loadPack()
    }))
  ]
}

async function paperPreviewStates() {
  const { buildPaperPreviewState } = require('../../miniprogram/pages/paper-preview/paper-preview-presenter')
  const build = paper => buildPaperPreviewState({ paper, subjectName: '数学' })
  return [
    state('normal', build({ _id: 'paper-1', subject: 'math', type: 'verification', paperDisplayCode: '数学-20260712-06' })),
    state('empty', build({})),
    state('legacy-id-only', build({
      _id: OPAQUE_ID,
      subject: 'math',
      type: 'verification',
      paperDisplayCode: 'MATH-20260613-01',
      bottleneckTargets: ['BN-AUDIT-LEAK-01']
    })),
    state('error', await runController('miniprogram/pages/paper-preview/paper-preview.js', {
      getPaperDetail: async () => { throw new Error(BACKEND_ERROR) }
    }, async page => {
      page.setData({ paperId: OPAQUE_ID, mode: 'paper' })
      await page.loadPaper(OPAQUE_ID)
    }))
  ]
}

async function aiUsageStates() {
  const { buildUsageState } = require('../../miniprogram/pages/ai-usage/ai-usage-presenter')
  return [
    state('normal', buildUsageState([], null, '2026-07', '')),
    state('empty', buildUsageState([], null, '2026-07', '')),
    state('legacy-id-only', buildUsageState([{
      _id: OPAQUE_ID,
      eventType: 'photo_analysis',
      status: 'failed',
      errorMessage: INTERNAL_SUMMARY,
      createdAt: '2026-07-01T00:00:00Z'
    }], null, '2026-07', '')),
    state('error', await runController('miniprogram/pages/ai-usage/ai-usage.js', {
      getAiUsageSummary: () => { throw new Error(BACKEND_ERROR) },
      getAiUsageEvents: async () => ({ items: [] })
    }, async page => {
      page.setData({ activeMonth: '2026-07' })
      await page.loadUsage()
    }))
  ]
}

async function addStudentStates() {
  const modulePath = 'miniprogram/pages/add-student/add-student.js'
  const failedSave = async message => runController(modulePath, {
    createStudentWithProfiles: async () => { throw new Error(message) }
  }, async page => {
    page.setData({ name: '小明', grade: 6 })
    await page.onSave()
  })
  return [
    state('normal', await runController(modulePath)),
    state('error', await failedSave(BACKEND_ERROR)),
    state('legacy-id-only', await failedSave(INTERNAL_SUMMARY))
  ]
}

async function uploadStates() {
  const modulePath = 'miniprogram/pages/upload/upload.js'
  return [
    state('normal', await runController(modulePath)),
    state('error', await runController(modulePath, {
      callUploadAndAnalyze: async () => { throw new Error(BACKEND_ERROR) }
    }, async page => {
      page.uploadOne = async () => 'cloud://internal/uploaded-file'
      page.setData({ studentId: 'student-route-id', subject: 'math', betaConsented: true, images: [{ tempPath: '/tmp/a.jpg', fileName: 'a.jpg' }] })
      await page.onSubmit()
    })),
    state('legacy-id-only', await runController(modulePath, {
      getPaperDetail: async () => ({ paper: { _id: OPAQUE_ID, subject: 'math', title: INTERNAL_SUMMARY, paperDisplayCode: 'MATH-001' } })
    }, async page => {
      page.setData({ paperId: OPAQUE_ID })
      await page.loadPaperContext(OPAQUE_ID)
    }))
  ]
}

async function learningProgressStates() {
  const modulePath = 'miniprogram/pages/learning-progress/learning-progress.js'
  const cloud = {
    getLearningProgress: async () => ({ success: true, data: {
      timeline: [{ reportId: OPAQUE_ID, summary: INTERNAL_SUMMARY, improvedBottlenecks: ['BN-AUDIT-LEAK-01'] }],
      bottleneckMatrix: [{ lpCode: 'LP-AUDIT-LEAK-01', lpName: 'LP-AUDIT-LEAK-01', statuses: [{ reportId: OPAQUE_ID, status: 'persisting' }] }]
    } })
  }
  return [
    state('loading', await runController(modulePath)),
    state('error', await runController(modulePath, {
      getLearningProgress: async () => ({ success: false, error: BACKEND_ERROR })
    }, async page => {
      page.studentId = 'student-route-id'; page.subject = 'math'; await page.loadData()
    })),
    state('legacy-id-only', await runController(modulePath, cloud, async page => {
      page.studentId = 'student-1'; page.subject = 'math'; await page.loadData()
    }))
  ]
}

async function bottleneckCenterStates() {
  const modulePath = 'miniprogram/pages/bottleneck-center/bottleneck-center.js'
  return [
    state('loading', await runController(modulePath)),
    state('error', await runController(modulePath, {
      getStudentDashboard: async () => { throw new Error(BACKEND_ERROR) },
      getSubjectProfile: async () => { throw new Error(BACKEND_ERROR) }
    }, async page => { await page.onLoad({ studentId: 'student-route-id' }) })),
    state('legacy-id-only', await runController(modulePath, {
      getStudentDashboard: async () => ({ student: { name: '小明' }, subjectProfiles: [{ subject: 'math', currentBottlenecks: [{ lpCode: 'LP-AUDIT-LEAK-01' }] }] })
    }, async page => { await page.onLoad({ studentId: 'student-1' }) }))
  ]
}

async function bottleneckDetailStates() {
  const modulePath = 'miniprogram/pages/bottleneck-detail/bottleneck-detail.js'
  return [
    state('loading', await runController(modulePath)),
    state('error', await runController(modulePath, {
      getSubjectDashboard: async () => { throw new Error(BACKEND_ERROR) }
    }, async page => { await page.onLoad({ studentId: 'student-route-id', subject: 'math', lpCode: 'LP-001' }) })),
    state('legacy-id-only', await runController(modulePath, {
      getSubjectDashboard: async () => ({
        profile: { subject: 'math', currentBottlenecks: [{ lpCode: 'LP-AUDIT-LEAK-01' }] },
        reports: [{ _id: OPAQUE_ID, subject: 'math', summary: INTERNAL_SUMMARY, bottlenecks: [{ lpCode: 'LP-AUDIT-LEAK-01' }] }],
        papers: []
      })
    }, async page => { await page.onLoad({ studentId: 'student-1', subject: 'math', lpCode: 'LP-AUDIT-LEAK-01' }) }))
  ]
}

async function englishSessionStates(modulePath, method, cloudMethod) {
  return [
    state('loading', await runController(modulePath)),
    state('error', await runController(modulePath, {
      [cloudMethod]: async () => { throw new Error(BACKEND_ERROR) }
    }, async page => {
      page.setData({ studentId: 'student-route-id' })
      await page[method]()
    })),
    state('legacy-id-only', await runController(modulePath, {
      [cloudMethod]: async () => { throw new Error(INTERNAL_SUMMARY) }
    }, async page => {
      page.setData({ studentId: 'student-1' })
      await page[method]()
    }))
  ]
}

async function wrongWordsStates() {
  const modulePath = 'miniprogram/pages/english-wrong-words/english-wrong-words.js'
  return [
    state('empty', await runController(modulePath)),
    state('error', await runController(modulePath, {
      getEnglishVocabularySummary: async () => { throw new Error(BACKEND_ERROR) }
    }, async page => { page.setData({ studentId: 'student-route-id' }); await page.loadWrongWords() })),
    state('legacy-id-only', await runController(modulePath, {
      getEnglishVocabularySummary: async () => { throw new Error(INTERNAL_SUMMARY) }
    }, async page => { page.setData({ studentId: 'student-1' }); await page.loadWrongWords() }))
  ]
}

async function generateVerificationStates() {
  const modulePath = 'miniprogram/pages/generate-verification/generate-verification.js'
  return [
    state('loading', await runController(modulePath)),
    state('error', await runController(modulePath, {
      getSubjectProfile: async () => { throw new Error(BACKEND_ERROR) }
    }, async page => { page.setData({ studentId: 'student-route-id', subject: 'math' }); await page.loadPendingBottlenecks() })),
    state('legacy-id-only', await runController(modulePath, {
      getSubjectProfile: async () => ({ pendingBottlenecks: [{ lpCode: 'LP-AUDIT-LEAK-01' }] })
    }, async page => { page.setData({ studentId: 'student-1', subject: 'math' }); await page.loadPendingBottlenecks() }))
  ]
}

async function defaultPaperStates() {
  const modulePath = 'miniprogram/pages/default-paper/default-paper.js'
  return [
    state('empty', await runController(modulePath)),
    state('error', await runController(modulePath, {
      callGeneratePaper: async () => { throw new Error(BACKEND_ERROR) }
    }, async page => {
      page.setData({ studentId: 'student-route-id', subject: 'math', grade: 6, papers: [{ key: 'grade6_a', questionCount: 20 }] })
      await page.onPreview({ currentTarget: { dataset: { key: 'grade6_a' } } })
    })),
    state('legacy-id-only', await runController(modulePath, {
      getPapers: async () => [{ _id: OPAQUE_ID }]
    }, async page => { page.setData({ grade: 6, studentId: 'student-1', subject: 'math' }); await page.loadPapers() }))
  ]
}

async function parentManagementStates() {
  const modulePath = 'miniprogram/pages/parent-management/parent-management.js'
  return [
    state('empty', await runController(modulePath)),
    state('error', await runController(modulePath, {
      listStudentMembers: async () => { throw new Error(BACKEND_ERROR) }
    }, async page => { page.setData({ studentId: 'student-route-id' }); await page.loadMembers() })),
    state('legacy-id-only', await runController(modulePath, {
      listStudentMembers: async () => ({
        student: { _id: OPAQUE_ID, name: INTERNAL_SUMMARY },
        permissions: {},
        members: [{ memberOpenId: OPAQUE_ID, displayName: 'BN-AUDIT-LEAK-01', relationText: '妈妈' }]
      })
    }, async page => { page.setData({ studentId: 'student-1' }); await page.loadMembers() }))
  ]
}

async function joinStudentStates() {
  const modulePath = 'miniprogram/pages/join-student/join-student.js'
  return [
    state('empty', await runController(modulePath)),
    state('error', await runController(modulePath, {
      getStudentInvite: async () => { throw new Error(BACKEND_ERROR) }
    }, async page => { page.setData({ inviteId: 'invite-route-id', token: 'route-token' }); await page.loadInvite() })),
    state('legacy-id-only', await runController(modulePath, {
      getStudentInvite: async () => ({ student: { _id: OPAQUE_ID, name: INTERNAL_SUMMARY }, presetRelationText: '妈妈' })
    }, async page => { page.setData({ inviteId: OPAQUE_ID, token: 'route-token' }); await page.loadInvite() }))
  ]
}

const PAGE_AUDIT_REGISTRY = {
  'pages/index/index': presenterAdapter('miniprogram/pages/index/index-presenter.js', indexStates, true),
  'pages/student-profile/student-profile': presenterAdapter('miniprogram/pages/index/index-presenter.js', studentProfileStates, true),
  'pages/add-student/add-student': controllerAdapter('miniprogram/pages/add-student/add-student.js', addStudentStates),
  'pages/subject-home/subject-home': presenterAdapter('miniprogram/pages/subject-home/subject-home-presenter.js', subjectHomeStates, true),
  'pages/upload/upload': controllerAdapter('miniprogram/pages/upload/upload.js', uploadStates),
  'pages/upload-history/upload-history': presenterAdapter('miniprogram/pages/upload-history/upload-history-presenter.js', uploadHistoryStates, true),
  'pages/report/report': presenterAdapter('miniprogram/pages/report/report-presenter.js', reportStates, true),
  'pages/learning-progress/learning-progress': controllerAdapter('miniprogram/pages/learning-progress/learning-progress.js', learningProgressStates),
  'pages/bottleneck-center/bottleneck-center': controllerAdapter('miniprogram/pages/bottleneck-center/bottleneck-center.js', bottleneckCenterStates),
  'pages/bottleneck-detail/bottleneck-detail': controllerAdapter('miniprogram/pages/bottleneck-detail/bottleneck-detail.js', bottleneckDetailStates),
  'pages/knowledge-map/knowledge-map': presenterAdapter('miniprogram/pages/knowledge-map/knowledge-map-presenter.js', knowledgeMapStates, true),
  'pages/english-practice/english-practice': controllerAdapter('miniprogram/pages/english-practice/english-practice.js', () => englishSessionStates('miniprogram/pages/english-practice/english-practice.js', 'generateSession', 'generateEnglishRecognitionSession')),
  'pages/english-dictation/english-dictation': controllerAdapter('miniprogram/pages/english-dictation/english-dictation.js', () => englishSessionStates('miniprogram/pages/english-dictation/english-dictation.js', 'generateSession', 'generateEnglishPaperDictationSession')),
  'pages/english-wrong-words/english-wrong-words': controllerAdapter('miniprogram/pages/english-wrong-words/english-wrong-words.js', wrongWordsStates),
  'pages/learning-resource/learning-resource': presenterAdapter('miniprogram/pages/learning-resource/learning-resource-presenter.js', learningResourceStates, true),
  'pages/generate-verification/generate-verification': controllerAdapter('miniprogram/pages/generate-verification/generate-verification.js', generateVerificationStates),
  'pages/default-paper/default-paper': controllerAdapter('miniprogram/pages/default-paper/default-paper.js', defaultPaperStates),
  'pages/paper-preview/paper-preview': presenterAdapter('miniprogram/pages/paper-preview/paper-preview-presenter.js', paperPreviewStates, true),
  'pages/parent-management/parent-management': controllerAdapter('miniprogram/pages/parent-management/parent-management.js', parentManagementStates),
  'pages/join-student/join-student': controllerAdapter('miniprogram/pages/join-student/join-student.js', joinStudentStates),
  'pages/ai-usage/ai-usage': presenterAdapter('miniprogram/pages/ai-usage/ai-usage-presenter.js', aiUsageStates, true)
}

module.exports = { PAGE_AUDIT_REGISTRY }

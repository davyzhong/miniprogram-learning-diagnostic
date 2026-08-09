const fs = require('node:fs')
const path = require('node:path')
const { loadPage, createWxMock } = require('./page-harness')

const ROOT = path.resolve(__dirname, '../..')

const INTERNAL_SUMMARY = '复测 BN-AUDIT-LEAK-01 与 cloud://env/file'
const BACKEND_ERROR = '失败 BN-ERROR-01 cloud://env/file'
const OPAQUE_ID = '665f8c1a2b3c4d5e6f708192'

// A binding may be absent only when its conditional branch is not mounted or a wx:for alias has no row.
const ALLOWED_UNRESOLVED_BINDING_REASONS = new Set(['conditional-absent', 'loop-alias-absent'])
const LOOP_INDEX_ALIAS = Symbol('loop-index')

function state(name, model, options = {}) {
  return { state: name, model, ...options }
}

function presenterAdapter(modulePath, build, supportsError = false, options = {}) {
  return { kind: 'presenter', modulePath, supportsError, buildStates: build, ...options }
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

function resolveVisiblePath(candidate, aliases) {
  let normalized = candidate.replace(/\.join$/, '[]')
  const headMatch = normalized.match(/^[A-Za-z_$][\w$]*/)
  const head = headMatch ? headMatch[0] : ''
  if (aliases.has(head)) {
    const base = aliases.get(head)
    if (!base || base === LOOP_INDEX_ALIAS) return ''
    normalized = `${base}${normalized.slice(head.length)}`
  }
  return normalized.replace(/\[([A-Za-z_$][\w$]*)\]/g, (match, indexName) => (
    aliases.get(indexName) === LOOP_INDEX_ALIAS ? '[]' : match
  ))
}

function bindingPaths(binding, aliases) {
  const withoutLiterals = binding.replace(/(['"])(?:\\.|(?!\1).)*\1/g, '')
  const paths = []
  const memberPath = /\b[A-Za-z_$][\w$]*(?:(?:\.[A-Za-z_$][\w$]*)|(?:\[(?:[A-Za-z_$][\w$]*|\d+)\]))*/g
  for (const match of withoutLiterals.matchAll(memberPath)) {
    const candidate = match[0]
    if (['true', 'false', 'null', 'undefined'].includes(candidate)) continue
    const resolved = resolveVisiblePath(candidate, aliases)
    if (resolved) paths.push(resolved)
  }
  return paths.filter(path => !paths.some(other => (
    other !== path && (other.startsWith(`${path}.`) || other.startsWith(`${path}[`))
  )))
}

function visibleBindingsForPage(pagePath) {
  const source = fs.readFileSync(path.join(ROOT, 'miniprogram', `${pagePath}.wxml`), 'utf8')
  const bindings = []
  const scopes = [{ aliases: new Map(), conditions: [], loops: [], branchChain: [] }]
  const tokens = source.match(/<!--[\s\S]*?-->|<(?:(?:"[^"]*")|(?:'[^']*')|[^'">])*>|[^<]+/g) || []

  function addBindings(expression, scope) {
    const embeddedExpressions = [...expression.matchAll(/\{\{([^}]+)\}\}/g)].map(match => match[1])
    const renderExpressions = embeddedExpressions.length > 0 ? embeddedExpressions : [expression]
    renderExpressions.forEach(renderExpression => {
      bindingPaths(renderExpression, scope.aliases).forEach(bindingPath => {
        bindings.push({
          path: bindingPath,
          renderExpression: renderExpression.trim(),
          conditions: scope.conditions,
          loops: scope.loops
        })
      })
    })
  }

  for (const token of tokens) {
    if (token.startsWith('<!--')) continue
    if (token.startsWith('</')) {
      if (scopes.length > 1) scopes.pop()
      continue
    }
    if (token.startsWith('<')) {
      const parentScope = scopes[scopes.length - 1]
      const aliases = new Map(parentScope.aliases)
      const loops = [...parentScope.loops]
      const loopMatch = token.match(/\bwx:for="\{\{\s*([^}]+?)\s*\}\}"/)
      if (loopMatch) {
        const sourceCandidate = bindingPaths(loopMatch[1], parentScope.aliases)[0] || ''
        const itemMatch = token.match(/\bwx:for-item="([^"]+)"/)
        const indexMatch = token.match(/\bwx:for-index="([^"]+)"/)
        aliases.set(itemMatch ? itemMatch[1] : 'item', sourceCandidate ? `${sourceCandidate}[]` : '')
        aliases.set(indexMatch ? indexMatch[1] : 'index', LOOP_INDEX_ALIAS)
        if (sourceCandidate) loops.push(sourceCandidate)
      }

      const conditions = [...parentScope.conditions]
      const conditionMatch = token.match(/\bwx:(if|elif)="\{\{\s*([^}]+?)\s*\}\}"/)
      const hasElse = /\bwx:else(?:\s|>|\/)/.test(token)
      let branchExpression = ''
      if (conditionMatch && conditionMatch[1] === 'if') {
        branchExpression = conditionMatch[2]
        parentScope.branchChain = [conditionMatch[2]]
      } else if (conditionMatch) {
        branchExpression = [
          ...parentScope.branchChain.map(expression => `!(${expression})`),
          `(${conditionMatch[2]})`
        ].join(' && ')
        parentScope.branchChain.push(conditionMatch[2])
      } else if (hasElse) {
        branchExpression = parentScope.branchChain.map(expression => `!(${expression})`).join(' && ')
        parentScope.branchChain = []
      } else {
        parentScope.branchChain = []
      }
      if (branchExpression) {
        conditions.push({
          expression: branchExpression,
          paths: bindingPaths(branchExpression, aliases),
          usesLoopAlias: [...aliases.entries()].some(([name, target]) => (
            target && branchExpression.match(new RegExp(`\\b${name}\\b`))
          ))
        })
      }
      const scope = { aliases, conditions, loops, branchChain: [] }
      // `text`/`retryText` are the visible text props of the shared <status-view> component
      // (loading/empty/error panels); treat them as rendered content like native visible attributes.
      const visibleAttributes = /\b(?:aria-label|title|placeholder|alt|value|checked|label|text|retryText)="([^"]*\{\{[^}]+\}\}[^"]*)"/g
      for (const match of token.matchAll(visibleAttributes)) {
        addBindings(match[1], scope)
      }
      if (!token.endsWith('/>')) scopes.push(scope)
      continue
    }

    const scope = scopes[scopes.length - 1]
    for (const match of token.matchAll(/\{\{([^}]+)\}\}/g)) {
      addBindings(match[1], scope)
    }
  }

  bindings.push({
    path: 'toastMessages[]',
    conditions: [{ expression: '__toastMessages_present__', paths: ['toastMessages'], usesLoopAlias: false }],
    loops: []
  })
  const unique = new Map()
  bindings.forEach(binding => {
    const key = JSON.stringify(binding)
    if (!unique.has(key)) unique.set(key, binding)
  })
  return [...unique.values()].sort((a, b) => a.path.localeCompare(b.path))
}

function visiblePathsForPage(pagePath) {
  return [...new Set(visibleBindingsForPage(pagePath).map(binding => binding.path))]
}

function visibleProjection(model, visibleBindings) {
  return inspectVisibleBindings(model, visibleBindings).projection
}

function pathAccessors(visiblePath) {
  const accessors = []
  for (const match of visiblePath.matchAll(/([A-Za-z_$][\w$]*)|\[([A-Za-z_$][\w$]*|\d*)\]/g)) {
    if (match[1]) accessors.push({ type: 'property', key: match[1] })
    else if (match[2] === '') accessors.push({ type: 'wildcard' })
    else if (/^\d+$/.test(match[2])) accessors.push({ type: 'index', index: Number(match[2]) })
    else accessors.push({ type: 'computed-index', key: match[2] })
  }
  return accessors
}

function valueAtVisiblePath(model, visiblePath, indexes = []) {
  let value = model
  let wildcardIndex = 0
  for (const accessor of pathAccessors(visiblePath)) {
    if (accessor.type === 'property') {
      if (value === null || value === undefined || typeof value !== 'object' || !(accessor.key in value)) {
        return { found: false, value: undefined }
      }
      value = value[accessor.key]
      continue
    }
    if (!Array.isArray(value)) return { found: false, value: undefined }
    const index = accessor.type === 'wildcard'
      ? indexes[wildcardIndex++]
      : accessor.type === 'index'
        ? accessor.index
        : Number(model[accessor.key])
    if (!Number.isInteger(index) || index < 0 || index >= value.length) {
      return { found: false, value: undefined }
    }
    value = value[index]
  }
  return { found: true, value }
}

function conditionIsInactive(condition, model, modelPath) {
  if (condition.expression === '__toastMessages_present__') return !('toastMessages' in model)
  if (!condition.usesLoopAlias) {
    try {
      const evaluate = new Function('model', `with (model) { return Boolean(${condition.expression}) }`)
      return evaluate(model) === false
    } catch (error) {
      // Fall through to simple path evaluation for loop aliases and unsupported expressions.
    }
  }

  const simpleExpression = condition.expression.trim().match(/^(!)?[A-Za-z_$][\w$]*(?:(?:\.[A-Za-z_$][\w$]*)|(?:\[[A-Za-z_$][\w$]*\]))*$/)
  if (!simpleExpression || condition.paths.length !== 1) return false
  const indexes = [...modelPath.matchAll(/\[(\d+)\]/g)].map(match => Number(match[1]))
  const result = valueAtVisiblePath(model, condition.paths[0], indexes)
  const truthy = result.found && Boolean(result.value)
  return simpleExpression[1] ? truthy : !truthy
}

function inspectVisibleBindings(model, visibleBindings) {
  const projection = {}
  const unresolved = []

  function expressionResolves(binding) {
    if (!binding.renderExpression || binding.path.includes('[]')) return false
    try {
      const evaluate = new Function('model', `with (model) { return (${binding.renderExpression}) }`)
      const value = evaluate(model)
      return value !== undefined && value !== null && typeof value !== 'object'
    } catch (error) {
      const literalFallback = binding.renderExpression.match(/\|\|\s*(?:'[^']*'|"[^"]*"|\d+|true|false)\s*$/)
      return Boolean(literalFallback)
    }
  }

  function miss(path, reason, binding) {
    if (reason === 'applicable-unresolved' && expressionResolves(binding)) return
    const resolvedReason = reason === 'applicable-unresolved'
      && binding.conditions.some(condition => conditionIsInactive(condition, model, path))
      ? 'conditional-absent'
      : reason
    unresolved.push({ path, reason: resolvedReason, binding: binding.path })
  }

  function collect(value, accessors, modelPath, binding) {
    if (accessors.length === 0) {
      if (value !== null && typeof value !== 'object' && value !== undefined) projection[modelPath] = value
      else miss(modelPath, 'applicable-unresolved', binding)
      return
    }

    const [accessor, ...rest] = accessors
    if (accessor.type === 'property') {
      if (value === null || value === undefined || typeof value !== 'object' || !(accessor.key in value)) {
        miss(`${modelPath}.${accessor.key}`, 'applicable-unresolved', binding)
        return
      }
      collect(value[accessor.key], rest, `${modelPath}.${accessor.key}`, binding)
      return
    }

    if (!Array.isArray(value)) {
      miss(modelPath, 'applicable-unresolved', binding)
      return
    }
    if (accessor.type === 'wildcard') {
      if (value.length === 0) {
        miss(`${modelPath}[]`, 'loop-alias-absent', binding)
        return
      }
      value.forEach((item, index) => collect(item, rest, `${modelPath}[${index}]`, binding))
      return
    }

    const index = accessor.type === 'index' ? accessor.index : Number(model[accessor.key])
    if (!Number.isInteger(index) || index < 0 || index >= value.length) {
      miss(`${modelPath}[${accessor.type === 'computed-index' ? accessor.key : index}]`, 'applicable-unresolved', binding)
      return
    }
    collect(value[index], rest, `${modelPath}[${index}]`, binding)
  }

  visibleBindings.forEach(binding => collect(model, pathAccessors(binding.path), 'model', binding))
  return { projection, unresolved }
}

function attachVisibleProjection(pagePath, adapter) {
  const visibleBindings = visibleBindingsForPage(pagePath)
  const visiblePaths = [...new Set(visibleBindings.map(binding => binding.path))]
  return {
    ...adapter,
    trustedUserInputPaths: adapter.trustedUserInputPaths || [],
    visibleBindings,
    visiblePaths,
    projectVisible(model) {
      return visibleProjection(model, visibleBindings)
    },
    inspectVisibleBindings(model) {
      return inspectVisibleBindings(model, visibleBindings)
    }
  }
}

async function runController(modulePath, cloud = {}, execute = async () => {}, modules = {}) {
  const wx = createWxMock()
  const { page } = loadPage(modulePath, { wx, modules: { ...modules, '../../utils/cloud': cloud } })
  await execute(page, wx)
  return visibleControllerModel(page, wx)
}

function homePresenterStates() {
  const { buildLearningProfileHomeView } = require('../../miniprogram/pages/index/index-presenter')
  const { symbolOf } = require('../../miniprogram/utils/ui-symbols')
  const build = input => ({
    homeMode: 'personal-profile',
    childCards: [],
    familyHero: null,
    errorText: '',
    familyTitleSymbol: symbolOf('home'),
    profileTitleSymbol: symbolOf('learningRecords'),
    parentManageSymbol: symbolOf('parent'),
    switchSymbol: symbolOf('refresh'),
    aiUsageSymbol: symbolOf('receipt'),
    addStudentSymbol: symbolOf('plus'),
    emptyStateSymbol: symbolOf('sprout'),
    home: buildLearningProfileHomeView(input, () => '今天')
  })
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
  const build = (profile, reports) => ({
    subject: 'math',
    subjectInitial: '数',
    ...buildSubjectHomeView(profile, reports, () => '今天', { subject: 'math', subjectName: '数学' })
  })
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
      page.setData({
        ...build({}, []),
        studentId: 'student-route-id',
        subject: 'math',
        canWriteActions: true
      })
      await page.importEnglishVocabulary()
    }))
  ]
}

async function reportStates() {
  const { buildReportView } = require('../../miniprogram/pages/report/report-presenter')
  const build = report => ({
    report,
    dateText: '',
    analysisStatusText: '',
    retryingAnalysis: false,
    generatingPdf: false,
    ...buildReportView(report)
  })
  return [
    state('normal', build({ subject: 'math', type: 'diagnosis', summary: '计算基础需要验证', bottlenecks: [{ lpCode: 'LP-001' }] })),
    state('empty', build({ subject: 'math', type: 'diagnosis', bottlenecks: [] })),
    state('legacy-id-only', build({
      _id: OPAQUE_ID,
      subject: 'math',
      type: 'diagnosis',
      summary: INTERNAL_SUMMARY,
      bottlenecks: [{ lpCode: 'LP-AUDIT-LEAK-01' }]
    })),
    state('error', await runController('miniprogram/pages/report/report.js', {
      generateLearningResourcePack: async () => { throw new Error(BACKEND_ERROR) }
    }, async page => {
      const report = { _id: OPAQUE_ID, studentId: 'student-route-id', subject: 'math', type: 'diagnosis', bottlenecks: [] }
      page._fullReport = report
      page.setData(build(report))
      await page.onBottleneckSnapshotTap({ currentTarget: { dataset: { lpCode: 'LP-001', lpName: '计算基础' } } })
    })),
    state('form-value-hostile', await runController('miniprogram/pages/report/report.js', {}, async page => {
      page.setData(build({ _id: OPAQUE_ID, subject: 'math', type: 'diagnosis', bottlenecks: [] }))
      page.onOpenFeedback({ currentTarget: { dataset: { targetType: 'report', targetId: OPAQUE_ID } } })
      page.onFeedbackReasonInput({ detail: { value: INTERNAL_SUMMARY } })
      page.onFeedbackNoteInput({ detail: { value: BACKEND_ERROR } })
    }), {
      trustedUserInputPaths: ['model.feedbackDialog.reason', 'model.feedbackDialog.note']
    })
  ]
}

async function uploadHistoryStates() {
  const presenter = require('../../miniprogram/pages/upload-history/upload-history-presenter')
  const build = report => {
    const { events, statusItems } = presenter.buildTimelineEvents(report ? [report] : [], [], new Map(), 'math', '数学')
    return {
      titleText: '学习记录',
      loadingMoreRecords: false,
      ...presenter.buildHistoryState(events, 'math', statusItems)
    }
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
  const build = (profile, subject) => ({
    loading: false,
    errorText: '',
    view: buildKnowledgeMapPageView(profile, subject)
  })
  return [
    state('normal', build({ currentBottlenecks: [{ lpCode: 'LP-001' }] }, 'math')),
    state('empty', build({}, 'math')),
    state('legacy-id-only', build({ currentBottlenecks: [{ lpCode: 'LP-AUDIT-LEAK-01', bottleneckId: 'BN-AUDIT-LEAK-01' }] }, 'math')),
    state('error', await runController('miniprogram/pages/knowledge-map/knowledge-map.js', {
      getSubjectProfile: async () => { throw new Error(BACKEND_ERROR) }
    }, async page => {
      page.setData({ studentId: 'student-route-id', subject: 'math' })
      await page.loadData()
    }))
  ]
}

async function microValidationStates() {
  const { buildMicroValidationView, buildMicroValidationResultView } = require('../../miniprogram/pages/micro-validation/micro-validation-presenter')
  const questions = [
    { index: 1, content: '8.5×3.16 = ?', answer: '26.86', observation: '小数点位置是否正确' },
    { index: 2, content: '0.85×3.16 = ?', answer: '2.686', observation: '位数累计是否正确' },
    { index: 3, content: '先估算再计算 1.25×0.8', answer: '1', observation: '是否有数量级估算' },
  ]
  const build = (verdicts, status) => ({
    loading: false,
    submitting: false,
    errorText: '',
    view: buildMicroValidationView({ bnTitle: '小数乘法中小数位数判断错误', questions, verdicts, status }),
    resultView: null,
  })
  return [
    state('normal', build([], 'in_progress')),
    state('answered', build(['correct', 'incorrect', 'correct'], 'in_progress')),
    state('completed', {
      ...build(['correct', 'correct', 'correct'], 'completed'),
      resultView: buildMicroValidationResultView({ passVerdict: 'passed', correctCount: 3, totalCount: 3, bnTitle: '小数乘法中小数位数判断错误' }),
    }),
    state('legacy-id-only', {
      ...build([], 'in_progress'),
      targetCode: 'BN-AUDIT-LEAK-01',
    }),
    state('error', await runController('miniprogram/pages/micro-validation/micro-validation.js', {
      generateMicroValidation: async () => { throw new Error(BACKEND_ERROR) }
    }, async page => {
      page.setData({ studentId: 'student-route-id', targetCode: 'BN-DEC-MUL-POINT-COUNT' })
      await page.generate()
    }))
  ]
}

async function learningResourceStates() {
  const { buildLearningResourceView } = require('../../miniprogram/pages/learning-resource/learning-resource-presenter')
  const build = pack => ({
    loading: false,
    errorText: '',
    view: buildLearningResourceView(pack)
  })
  return [
    state('normal', build({ title: '小数除法学习任务' })),
    state('empty', build({})),
    state('legacy-id-only', build({
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
  const build = paper => ({
    downloading: false,
    ...buildPaperPreviewState({ paper, subjectName: '数学' })
  })
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
  const build = (...args) => ({
    deletionSubmitting: false,
    deletionSubmitted: false,
    ...buildUsageState(...args)
  })
  return [
    state('normal', build([], null, '2026-07', '')),
    state('empty', build([], null, '2026-07', '')),
    state('legacy-id-only', build([{
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

async function repairMetricsStates() {
  const modulePath = 'miniprogram/pages/repair-metrics/repair-metrics.js'
  const metricsFixture = {
    metrics: {
      empty: false,
      totals: { bottlenecks: 1, verified: 1, repaired: 1, repairing: 0, verifiedNotPassed: 0, unverified: 0 },
      coverageRate: { numerator: 1, denominator: 1, percent: 100, smallSample: true },
      repairRate: { numerator: 0, denominator: 0, percent: 0, smallSample: true },
      buckets: {
        repaired: [{ lpCode: 'LP-001', name: '计算基础' }],
        repairing: [], verifiedNotPassed: [], unverified: []
      },
      timeline: [{ date: '2026-07-03', passedTotal: 1, verifiedTotal: 1 }]
    }
  }
  const loadWith = (cloud, studentId) => runController(modulePath, cloud, async page => {
    page.setData({ studentId })
    await page.loadData()
  })
  return [
    state('normal', await loadWith({ getRepairMetrics: async () => metricsFixture }, 'student-1')),
    state('empty', await loadWith({
      getRepairMetrics: async () => ({ metrics: { empty: true } })
    }, 'student-1')),
    state('legacy-id-only', await loadWith({
      getRepairMetrics: async () => ({ metrics: {
        empty: false,
        totals: { bottlenecks: 2, verified: 1, repaired: 1, repairing: 0, verifiedNotPassed: 0, unverified: 1 },
        coverageRate: { numerator: 1, denominator: 2, percent: 50, smallSample: true },
        repairRate: { numerator: 1, denominator: 1, percent: 100, smallSample: true },
        buckets: {
          repaired: [{ lpCode: 'LP-AUDIT-LEAK-01', name: INTERNAL_SUMMARY }],
          repairing: [], verifiedNotPassed: [],
          unverified: [{ lpCode: OPAQUE_ID, name: BACKEND_ERROR }]
        },
        timeline: []
      } })
    }, 'student-1')),
    state('error', await loadWith({
      getRepairMetrics: async () => { throw new Error(BACKEND_ERROR) }
    }, 'student-route-id'))
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
      timeline: [{
        reportId: OPAQUE_ID,
        summary: INTERNAL_SUMMARY,
        isVerification: false,
        totalErrors: 0,
        bottleneckCount: 1,
        improvedBottlenecks: ['BN-AUDIT-LEAK-01']
      }],
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
    state('loading', await runController(modulePath, {
      [cloudMethod]: () => new Promise(() => {})
    }, async page => {
      page.setData({ studentId: 'student-route-id' })
      page[method]()
      await Promise.resolve()
    })),
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

async function englishPracticeStates() {
  const modulePath = 'miniprogram/pages/english-practice/english-practice.js'
  const sessionStates = await englishSessionStates(modulePath, 'generateSession', 'generateEnglishRecognitionSession')
  const answerItem = {
    queueKey: 'word-1:0',
    wordId: 'word-route-id',
    word: 'science',
    promptType: 'chinese',
    promptModeText: '看中文',
    promptMainText: '科学',
    answerInstruction: '请说出英文',
    answerHintText: '看到中文意思后，直接说出对应的英文单词。',
    canPlayPrompt: false,
    retryCount: 0
  }
  const runAnswer = (cloud, recognizedText) => runController(modulePath, cloud, async page => {
    page.setData({
      studentId: 'student-route-id',
      sessionId: 'session-route-id',
      queue: [answerItem],
      currentItem: answerItem,
      currentIndex: 0
    })
    await page.onRecognitionResult({ recognizedText, audioFileID: 'audio-route-id' })
  })
  return [
    ...sessionStates,
    state('answer-success', await runAnswer({
      submitEnglishRecognitionAttempt: async () => ({
        judgment: {
          status: 'incorrect',
          reason: BACKEND_ERROR,
          normalizedText: 'siense',
          judgmentId: OPAQUE_ID
        },
        shouldRepeat: true
      })
    }, 'siense')),
    state('answer-error', await runAnswer({
      submitEnglishRecognitionAttempt: async () => { throw new Error(BACKEND_ERROR) }
    }, 'science'))
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
      page.setData({
        studentId: 'student-route-id',
        subject: 'math',
        grade: 6,
        papers: [{
          key: 'grade6_a',
          name: '六年级数学练习',
          pages: 4,
          questionCount: 20,
          estimatedMinutes: 30,
          bottleneckCount: 3
        }]
      })
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
    state('empty', await runController(modulePath, {
      listStudentMembers: async () => ({
        student: { _id: 'student-1', name: '小明' },
        permissions: {},
        members: []
      })
    }, async page => { page.setData({ studentId: 'student-1' }); await page.loadMembers() })),
    state('error', await runController(modulePath, {
      listStudentMembers: async () => { throw new Error(BACKEND_ERROR) }
    }, async page => { page.setData({ studentId: 'student-route-id' }); await page.loadMembers() })),
    state('legacy-id-only', await runController(modulePath, {
      listStudentMembers: async () => ({
        student: { _id: OPAQUE_ID, name: INTERNAL_SUMMARY },
        permissions: {},
        members: [{ memberOpenId: OPAQUE_ID, displayName: 'BN-AUDIT-LEAK-01', relationText: '妈妈' }]
      })
    }, async page => { page.setData({ studentId: 'student-1' }); await page.loadMembers() })),
    state('form-value-hostile', await runController(modulePath, {}, async page => {
      page.onDisplayNameInput({ detail: { value: INTERNAL_SUMMARY } })
    })),
    state('indexed-relation-hostile', await runController(modulePath, {}, async page => {
      page.setData({ editingMemberIndex: 0 })
    }, {
      '../../utils/constants': { RELATION_OPTIONS: [{ key: 'other', name: BACKEND_ERROR }] }
    }))
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
    }, async page => { page.setData({ inviteId: OPAQUE_ID, token: 'route-token' }); await page.loadInvite() })),
    state('form-value-hostile', await runController(modulePath, {}, async page => {
      page.setData({ status: 'ready' })
      page.onDisplayNameInput({ detail: { value: INTERNAL_SUMMARY } })
    })),
    state('form-code-hostile', await runController(modulePath, {}, async page => {
      page.setData({ status: 'code' })
      page.onInviteCodeInput({ detail: { value: 'BN-INPUT-LEAK-01' } })
    })),
    state('indexed-relation-hostile', await runController(modulePath, {}, async page => {
      page.setData({ status: 'ready', student: { name: '小明' } })
    }, {
      '../../utils/constants': { RELATION_OPTIONS: [{ key: 'other', name: BACKEND_ERROR }] }
    }))
  ]
}

async function chineseReviewDetailStates() {
  const modulePath = 'miniprogram/pages/chinese-review-detail/chinese-review-detail.js'
  const normal = await runController(modulePath, { getSubjectProfile: async () => ({ chineseReviewItems: [{ itemId: 'safe-item', targetText: '辩论', lastWrongAnswer: '辨论', mistakeType: '形近字混淆', sourceContext: '看拼音写词语', status: 'needs_review' }] }) }, async page => { page.onLoad({ studentId: 'student-1', reviewItemId: 'safe-item' }); await page.loadDetail({ studentId: 'student-1', reviewItemId: 'safe-item' }) })
  return [state('normal', normal), state('loading', { ...normal, loading: true }), state('empty', normal), state('legacy-id-only', normal), state('error', normal)]
}

async function chineseSkillTaskStates() {
  const modulePath = 'miniprogram/pages/chinese-skill-task/chinese-skill-task.js'
  const normal = await runController(modulePath, { getChineseSkillTask: async () => ({ task: { id: 'safe', title: '回原文找依据', method: '先圈出依据。', prompt: '哪一句能说明原因？' } }) }, async page => { page.onLoad({ studentId: 'student-1' }); await page.loadTask({ studentId: 'student-1' }) })
  return [state('normal', normal), state('loading', { ...normal, loading: true }), state('empty', { ...normal, task: null }), state('legacy-id-only', normal), state('error', { ...normal, task: null })]
}

async function iconCompatibilityStates() {
  const modulePath = 'miniprogram/pages/icon-compatibility/icon-compatibility.js'
  const normal = await runController(modulePath, {}, async page => { page.onLoad() })
  const failedCopy = await runController(modulePath, {}, async page => {
    page.onLoad()
    await page.copyPublicId('')
  })
  return [
    state('normal', normal),
    state('loading', normal),
    state('empty', normal),
    state('legacy-id-only', normal),
    state('error', failedCopy)
  ]
}

async function englishConfusionStates() {
  const modulePath = 'miniprogram/pages/english-confusion/english-confusion.js'
  const normal = await runController(modulePath, { getEnglishConfusionPractice: async () => ({ items: [{ relationId: 'safe', words: ['there', 'their'], explanation: '分别表示不同含义。', prompt: 'This is ___ classroom.', answer: 'their' }] }) }, async page => { await page.onLoad({ studentId: 'student-1' }) })
  return [state('normal', normal), state('loading', { ...normal, loading: true }), state('empty', { ...normal, items: [] }), state('legacy-id-only', normal), state('error', { ...normal, items: [] })]
}

const RAW_PAGE_AUDIT_REGISTRY = {
  'pages/index/index': presenterAdapter('miniprogram/pages/index/index-presenter.js', indexStates, true),
  'pages/student-profile/student-profile': presenterAdapter('miniprogram/pages/index/index-presenter.js', studentProfileStates, true),
  'pages/add-student/add-student': controllerAdapter('miniprogram/pages/add-student/add-student.js', addStudentStates),
  'pages/subject-home/subject-home': presenterAdapter('miniprogram/pages/subject-home/subject-home-presenter.js', subjectHomeStates, true),
  'pages/upload/upload': controllerAdapter('miniprogram/pages/upload/upload.js', uploadStates),
  'pages/upload-history/upload-history': presenterAdapter('miniprogram/pages/upload-history/upload-history-presenter.js', uploadHistoryStates, true),
  'pages/report/report': presenterAdapter('miniprogram/pages/report/report-presenter.js', reportStates, true, {
    trustedUserInputPaths: ['model.feedbackDialog.reason', 'model.feedbackDialog.note']
  }),
  'pages/learning-progress/learning-progress': controllerAdapter('miniprogram/pages/learning-progress/learning-progress.js', learningProgressStates),
  'pages/bottleneck-center/bottleneck-center': controllerAdapter('miniprogram/pages/bottleneck-center/bottleneck-center.js', bottleneckCenterStates),
  'pages/bottleneck-detail/bottleneck-detail': controllerAdapter('miniprogram/pages/bottleneck-detail/bottleneck-detail.js', bottleneckDetailStates),
  'pages/knowledge-map/knowledge-map': presenterAdapter('miniprogram/pages/knowledge-map/knowledge-map-presenter.js', knowledgeMapStates, true),
  'pages/micro-validation/micro-validation': presenterAdapter('miniprogram/pages/micro-validation/micro-validation-presenter.js', microValidationStates, true),
  'pages/english-practice/english-practice': controllerAdapter('miniprogram/pages/english-practice/english-practice.js', englishPracticeStates),
  'pages/english-dictation/english-dictation': controllerAdapter('miniprogram/pages/english-dictation/english-dictation.js', () => englishSessionStates('miniprogram/pages/english-dictation/english-dictation.js', 'generateSession', 'generateEnglishPaperDictationSession')),
  'pages/english-wrong-words/english-wrong-words': controllerAdapter('miniprogram/pages/english-wrong-words/english-wrong-words.js', wrongWordsStates),
  'pages/english-confusion/english-confusion': controllerAdapter('miniprogram/pages/english-confusion/english-confusion.js', englishConfusionStates),
  'pages/chinese-review-detail/chinese-review-detail': controllerAdapter('miniprogram/pages/chinese-review-detail/chinese-review-detail.js', chineseReviewDetailStates),
  'pages/chinese-skill-task/chinese-skill-task': controllerAdapter('miniprogram/pages/chinese-skill-task/chinese-skill-task.js', chineseSkillTaskStates),
  'pages/learning-resource/learning-resource': presenterAdapter('miniprogram/pages/learning-resource/learning-resource-presenter.js', learningResourceStates, true),
  'pages/generate-verification/generate-verification': controllerAdapter('miniprogram/pages/generate-verification/generate-verification.js', generateVerificationStates),
  'pages/default-paper/default-paper': controllerAdapter('miniprogram/pages/default-paper/default-paper.js', defaultPaperStates),
  'pages/paper-preview/paper-preview': presenterAdapter('miniprogram/pages/paper-preview/paper-preview-presenter.js', paperPreviewStates, true),
  'pages/parent-management/parent-management': controllerAdapter('miniprogram/pages/parent-management/parent-management.js', parentManagementStates),
  'pages/join-student/join-student': controllerAdapter('miniprogram/pages/join-student/join-student.js', joinStudentStates),
  'pages/ai-usage/ai-usage': presenterAdapter('miniprogram/pages/ai-usage/ai-usage-presenter.js', aiUsageStates, true),
  'pages/repair-metrics/repair-metrics': presenterAdapter('miniprogram/pages/repair-metrics/repair-metrics-presenter.js', repairMetricsStates, true),
  'pages/icon-compatibility/icon-compatibility': controllerAdapter('miniprogram/pages/icon-compatibility/icon-compatibility.js', iconCompatibilityStates)
}

const PAGE_AUDIT_REGISTRY = Object.fromEntries(
  Object.entries(RAW_PAGE_AUDIT_REGISTRY).map(([pagePath, adapter]) => (
    [pagePath, attachVisibleProjection(pagePath, adapter)]
  ))
)

module.exports = {
  PAGE_AUDIT_REGISTRY,
  visibleProjection,
  visiblePathsForPage,
  ALLOWED_UNRESOLVED_BINDING_REASONS
}

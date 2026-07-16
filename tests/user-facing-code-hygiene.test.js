const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')

const ROOT = path.resolve(__dirname, '..')

const {
  isInternalIdentifier,
  readableNameOf,
  sanitizeUserText,
  compactReadableTargets
} = require('../miniprogram/utils/user-facing-text')
const {
  PAGE_AUDIT_REGISTRY,
  ALLOWED_UNRESOLVED_BINDING_REASONS
} = require('./helpers/user-facing-page-audit')

function read(relativePath) {
  return fs.readFileSync(path.join(ROOT, relativePath), 'utf8')
}

function registeredPages() {
  const manifest = JSON.parse(read('miniprogram/app.json'))
  return [
    ...(manifest.pages || []),
    ...(manifest.subPackages || []).flatMap(pkg => (
      (pkg.pages || []).map(page => `${pkg.root}/${page}`)
    ))
  ]
}

function visibleModelFailures(page, state, projection) {
  const failures = []
  function visit(value, field) {
    if (typeof value === 'string') {
      const sanitized = sanitizeUserText(value, { treatAsId: true })
      if (sanitized !== value || isInternalIdentifier(value, { treatAsId: true })) {
        failures.push(`${page} / ${state} / ${field}: ${JSON.stringify(value)}`)
      }
      return
    }
    if (Array.isArray(value)) {
      value.forEach((item, index) => visit(item, `${field}[${index}]`))
      return
    }
    if (!value || typeof value !== 'object') return
    for (const [key, item] of Object.entries(value)) {
      visit(item, field ? `${field}.${key}` : key)
    }
  }
  visit(projection, 'visible')
  return failures
}

function visibleWxmlBindings(source) {
  const bindings = []
  const visibleAttributes = /\b(?:aria-label|title|placeholder|alt|value|checked|label)="([^"]*\{\{[^}]+\}\}[^"]*)"/g
  for (const match of source.matchAll(visibleAttributes)) bindings.push(match[1])
  const textNodes = source.replace(/<!--[\s\S]*?-->/g, '').replace(/<[^>]+>/g, '\n')
  for (const match of textNodes.matchAll(/\{\{[^}]+\}\}/g)) bindings.push(match[0])
  return bindings
}

test('page audit registry exactly matches every main and subpackage manifest page', () => {
  assert.deepEqual(Object.keys(PAGE_AUDIT_REGISTRY).sort(), registeredPages().sort())
  assert.equal(registeredPages().length, 24)
})

test('registered page sources do not use internal IDs as visible fallbacks', () => {
  const idField = '(?:documentId|fileId|resourceId|routeId|bottleneckId|lpCode|nodeId|targetId|pageCode)'
  const failures = []

  for (const page of registeredPages()) {
    const wxml = read(`miniprogram/${page}.wxml`)
    for (const binding of visibleWxmlBindings(wxml)) {
      if (new RegExp(`\\b${idField}\\b`).test(binding)) {
        failures.push(`${page} / wxml / visible binding: ${binding}`)
      }
    }

    const pageDir = path.dirname(path.join(ROOT, `miniprogram/${page}.js`))
    const pageBase = path.basename(page)
    const sourceFiles = [
      path.join(pageDir, `${pageBase}.js`),
      ...fs.readdirSync(pageDir)
        .filter(file => file.endsWith('-presenter.js'))
        .map(file => path.join(pageDir, file))
    ]
    const visibleFallback = new RegExp(
      `(?:title|label|summary|message|name|text|description|detail|desc|reason|feedback|hint|scopeText|targetNames)\\s*:\\s*[^\\n]*(?:\\|\\||\\.join\\()[^\\n]*\\b${idField}\\b`,
      'g'
    )
    for (const sourceFile of sourceFiles) {
      const js = fs.readFileSync(sourceFile, 'utf8')
      for (const match of js.matchAll(visibleFallback)) {
        failures.push(`${page} / ${path.basename(sourceFile)} / visible fallback: ${match[0].trim()}`)
      }
    }
  }

  assert.deepEqual(failures, [], `visible ID source leaks:\n${failures.join('\n')}`)
})

test('learning record paper codes preserve parent-readable dates while internal identifiers stay hidden', () => {
  const presenter = require('../miniprogram/pages/upload-history/upload-history-presenter')
  assert.equal(presenter.readablePaperCode('数学-20260712-06'), '数学-20260712-06')
  assert.equal(presenter.readablePaperCode('BN-20260712-06'), '')
  assert.equal(presenter.readablePaperCode('665f8c1a2b3c4d5e6f708192'), '')
})

test('all registered page adapters execute real modules and keep legacy IDs out of visible models', async () => {
  const failures = []
  for (const [page, adapter] of Object.entries(PAGE_AUDIT_REGISTRY)) {
    assert.match(adapter.modulePath, /miniprogram\/pages\//, `${page} missing real module path`)
    assert.ok(['presenter', 'controller'].includes(adapter.kind), `${page} missing real adapter kind`)
    assert.equal(typeof adapter.supportsError, 'boolean', `${page} missing supportsError declaration`)
    assert.ok(Array.isArray(adapter.visiblePaths) && adapter.visiblePaths.length > 0, `${page} missing WXML-derived visible paths`)
    assert.ok(Array.isArray(adapter.visibleBindings) && adapter.visibleBindings.length > 0, `${page} missing WXML binding metadata`)
    assert.ok(Array.isArray(adapter.trustedUserInputPaths), `${page} missing trusted-input declaration`)
    assert.equal(typeof adapter.projectVisible, 'function', `${page} missing visible projection`)
    assert.equal(typeof adapter.inspectVisibleBindings, 'function', `${page} missing binding resolution audit`)
    const states = await adapter.buildStates()
    assert.ok(states.some(item => ['normal', 'loading', 'empty'].includes(item.state)), `${page} missing supported base state`)
    if (adapter.supportsError) {
      assert.ok(states.some(item => item.state === 'error'), `${page} missing supported error state`)
    }
    assert.ok(states.some(item => item.state === 'legacy-id-only'), `${page} missing legacy ID-only state`)
    for (const fixture of states) {
      const { projection, unresolved } = adapter.inspectVisibleBindings(fixture.model)
      assert.ok(Object.keys(projection).length > 0, `${page} / ${fixture.state} has no rendered values`)
      const invalidUnresolved = unresolved.filter(item => !ALLOWED_UNRESOLVED_BINDING_REASONS.has(item.reason))
      assert.deepEqual(
        invalidUnresolved,
        [],
        `${page} / ${fixture.state} has unresolved applicable bindings:\n${invalidUnresolved.map(item => item.path).join('\n')}`
      )
      const trustedPaths = fixture.trustedUserInputPaths || []
      assert.deepEqual(
        trustedPaths.filter(item => !adapter.trustedUserInputPaths.includes(item)),
        [],
        `${page} / ${fixture.state} declares an unapproved trusted user-input path`
      )
      const backendProjection = Object.fromEntries(
        Object.entries(projection).filter(([modelPath]) => !trustedPaths.includes(modelPath))
      )
      failures.push(...visibleModelFailures(page, fixture.state, backendProjection))
    }
  }
  assert.deepEqual(failures, [], `visible model leaks:\n${failures.join('\n')}`)
})

test('runtime visible-model gate reports every leak with page, state, and field context', () => {
  const failures = visibleModelFailures('pages/example/example', 'error', {
    'model.title': 'BN-UNKNOWN-A',
    'model.errorMessage': '加载失败 cloud://env/file',
    'model.reason': '判断失败 BN-REASON-LEAK',
    'model.status': 'ERR-STATUS-LEAK',
    'model.url': 'cloud://env/rendered-file',
    'model.paperCodeText': 'MATH-20260613-01'
  })
  assert.equal(failures.length, 5)
  assert.match(failures[0], /pages\/example\/example \/ error \/ visible\.model\.title/)
  assert.match(failures[3], /model\.status/)
  assert.match(failures[4], /model\.url/)
})

test('page projections include WXML-rendered paths and exclude unrelated fields with the same name', () => {
  const projection = PAGE_AUDIT_REGISTRY['pages/bottleneck-detail/bottleneck-detail'].projectVisible({
    visibleEvidenceChain: [{ summary: 'rendered summary' }],
    relatedReports: [{ summary: 'not rendered here' }],
    routeId: 'BN-ROUTE-INTERNAL'
  })

  assert.deepEqual(projection, {
    'model.visibleEvidenceChain[0].summary': 'rendered summary'
  })
})

test('page projections include bound form values and resolve fixture-selected member paths', () => {
  const joinAdapter = PAGE_AUDIT_REGISTRY['pages/join-student/join-student']
  const projection = joinAdapter.projectVisible({
    inviteCode: 'BN-INPUT-LEAK',
    displayName: 'cloud://env/input-name',
    relationOptions: [
      { name: '妈妈' },
      { name: 'ERR-RELATION-LEAK' }
    ],
    relationIndex: 1
  })

  assert.equal(projection['model.inviteCode'], 'BN-INPUT-LEAK')
  assert.equal(projection['model.displayName'], 'cloud://env/input-name')
  assert.equal(projection['model.relationOptions[1].name'], 'ERR-RELATION-LEAK')
})

test('binding applicability rejects unconditional gaps but permits inactive branches and empty loops', () => {
  const addStudentAudit = PAGE_AUDIT_REGISTRY['pages/add-student/add-student'].inspectVisibleBindings({
    toastMessages: []
  })
  assert.ok(addStudentAudit.unresolved.some(item => (
    item.binding === 'name' && item.reason === 'applicable-unresolved'
  )))

  const joinAudit = PAGE_AUDIT_REGISTRY['pages/join-student/join-student'].inspectVisibleBindings({
    status: 'code',
    displayName: undefined,
    inviteCode: '',
    error: '',
    toastMessages: []
  })
  assert.ok(joinAudit.unresolved.some(item => (
    item.binding === 'displayName' && item.reason === 'conditional-absent'
  )))

  const activeJoinAudit = PAGE_AUDIT_REGISTRY['pages/join-student/join-student'].inspectVisibleBindings({
    status: 'ready',
    displayNmae: '拼写错误不会冒充显示名称',
    student: { name: '小明' },
    relationOptions: [{ name: '妈妈' }],
    relationIndex: 0,
    error: '',
    toastMessages: []
  })
  assert.ok(activeJoinAudit.unresolved.some(item => (
    item.binding === 'displayName' && item.reason === 'applicable-unresolved'
  )))

  const progressAudit = PAGE_AUDIT_REGISTRY['pages/learning-progress/learning-progress'].inspectVisibleBindings({
    timeline: [],
    bottleneckMatrix: [{}],
    toastMessages: []
  })
  assert.ok(progressAudit.unresolved.some(item => (
    item.binding.includes('timeline[]') && item.reason === 'loop-alias-absent'
  )))
})

test('detects internal identifiers without treating readable labels as IDs', () => {
  const internalIds = [
    'BN-DEC-DIV-POINT',
    'LP-001',
    'ERR-MATH-01',
    'NODE-MATH-01',
    'RES-BILI-001',
    'CHI-READ-01',
    'MATH-NUM-DEC-MUL-POINT',
    'PAGE-HOME',
    'TASK-MATH-01',
    'TASK-PAGE-MATH-01',
    'VER-PAGE-01',
    'cloud://learning-prod.abc/file-id',
    'wxfile://tmp_internal_123'
  ]

  for (const value of internalIds) {
    assert.equal(isInternalIdentifier(value), true, value)
  }

  assert.equal(isInternalIdentifier('数学-20260712-06'), false)
  assert.equal(isInternalIdentifier('MATH-20260613-01'), false)
  assert.equal(isInternalIdentifier('CHI-20260616-02'), false)
  assert.equal(isInternalIdentifier('MATH-001'), false)
  assert.equal(isInternalIdentifier('MATH-01'), false)
  assert.equal(isInternalIdentifier('小数除法'), false)
  assert.equal(isInternalIdentifier('MATH-NUM-DEC-DIV-POINT'), true)
  assert.equal(isInternalIdentifier('CHI-READ-01'), true)
})

test('only detects opaque cloud and document IDs in an explicit ID context', () => {
  const opaqueId = '665f8c1a2b3c4d5e6f708192'

  assert.equal(isInternalIdentifier(opaqueId), false)
  assert.equal(isInternalIdentifier(opaqueId, { treatAsId: true }), true)
  assert.equal(isInternalIdentifier('期末数学复习资料', { treatAsId: true }), false)
  assert.equal(isInternalIdentifier('file_8f3a7c91', { treatAsId: true }), true)
  assert.equal(isInternalIdentifier('resource-8f3a7c91', { treatAsId: true }), true)
})

test('resolves known legacy bottlenecks and math knowledge nodes', () => {
  assert.equal(readableNameOf('LP-001'), '计算基础')
  assert.equal(readableNameOf('MATH-NUM-DEC-DIV-POINT'), '小数除法中的小数点移动')
  assert.equal(readableNameOf({ bottleneckId: 'BN-DEC-DIV-POINT-MOVE' }), '除数是小数时小数点移动规则不熟练')
  assert.equal(readableNameOf({ displayName: '单位换算', lpCode: 'LP-004' }), '单位换算')
  assert.equal(readableNameOf('数学-20260712-06'), '数学-20260712-06')
})

test('sanitizes mixed prose with a semantic count and intact Chinese punctuation', () => {
  assert.equal(
    sanitizeUserText('复测 BN-A、BN-B、BN-C。纸面作答后上传。', { count: 3, noun: '数学学习卡点' }),
    '复测 3 个数学学习卡点。纸面作答后上传。'
  )
  assert.equal(
    sanitizeUserText('先复习 LP-001，再完成练习。'),
    '先复习 计算基础，再完成练习。'
  )
  assert.equal(
    sanitizeUserText('复习 LP-001、LP-001。'),
    '复习 计算基础。'
  )
})

test('preserves human paper codes in user-facing prose', () => {
  assert.equal(
    sanitizeUserText('试卷 MATH-20260613-01、CHI-20260616-02。'),
    '试卷 MATH-20260613-01、CHI-20260616-02。'
  )
  assert.equal(
    sanitizeUserText('查看（CHI-20260616-02）。'),
    '查看（CHI-20260616-02）。'
  )
  assert.equal(
    sanitizeUserText('历史试卷 MATH-001、MATH-01。'),
    '历史试卷 MATH-001、MATH-01。'
  )
})

test('removes dangling list punctuation after sanitizing identifier runs', () => {
  assert.equal(
    sanitizeUserText('复测 BN-A、BN-B、。', { count: 2, noun: '学习卡点' }),
    '复测 2 个学习卡点。'
  )
})

test('preserves closing delimiters around sanitized cloud identifiers', () => {
  assert.equal(
    sanitizeUserText('查看（cloud://env/file）。'),
    '查看。'
  )
})

test('removes backend identifiers from generic prose without inventing bottleneck meaning', () => {
  assert.equal(
    sanitizeUserText('文件上传失败：cloud://env/file。'),
    '文件上传失败。'
  )
})

test('keeps neutral prose grammatical when unknown tokens occur at clause boundaries', () => {
  assert.equal(
    sanitizeUserText('BN-UNKNOWN-01 与计算基础相关。'),
    '计算基础相关。'
  )
  assert.equal(
    sanitizeUserText('请查看 cloud://env/file 后重试。'),
    '请稍后重试。'
  )
  assert.equal(
    sanitizeUserText('上传失败，请查看 ERR-UPLOAD-01。'),
    '上传失败。'
  )
})

test('requires an ASCII left boundary without blocking Chinese-adjacent identifiers', () => {
  assert.equal(
    sanitizeUserText('图书 ISBN-9787300000000。'),
    '图书 ISBN-9787300000000。'
  )
  assert.equal(
    sanitizeUserText('复测BN-A。'),
    '复测。'
  )
})

test('sanitizes opaque document IDs when explicitly treated as IDs', () => {
  assert.equal(
    sanitizeUserText('文档665f8c1a2b3c4d5e6f708192。', { treatAsId: true }),
    '文档。'
  )
})

const explicitIdConsistencyCases = [
  {
    value: '665f8c1a2b3c4d5e6f708192a',
    internal: true,
    expected: '文档。'
  },
  {
    value: '123e4567-e89b-12d3-a456-426614174000x',
    internal: true,
    expected: '文档。'
  },
  {
    value: '1234567890123456789012345',
    internal: false,
    expected: '文档1234567890123456789012345。'
  },
  {
    value: 'MATH-20260613-000001',
    internal: false,
    expected: '文档MATH-20260613-000001。'
  }
]

for (const { value, internal, expected } of explicitIdConsistencyCases) {
  test(`keeps explicit-ID sanitation consistent for ${value}`, () => {
    assert.equal(isInternalIdentifier(value, { treatAsId: true }), internal, value)
    assert.equal(sanitizeUserText(`文档${value}。`, { treatAsId: true }), expected, value)
  })
}

test('compacts at most three unique readable target names with a reliable total', () => {
  assert.equal(
    compactReadableTargets(['BN-A', { displayName: '小数除法' }, { title: '单位换算' }], { totalCount: 3 }),
    '小数除法、单位换算等 3 个学习卡点'
  )
  assert.equal(
    compactReadableTargets(['LP-001', 'LP-004', 'LP-001']),
    '计算基础、单位换算'
  )
  assert.equal(
    compactReadableTargets(['BN-A', 'BN-B'], { totalCount: 2 }),
    '2 个学习卡点'
  )
  assert.equal(
    compactReadableTargets(['小数除法', '单位换算', '分数运算', '几何概念'], { totalCount: 4 }),
    '小数除法、单位换算、分数运算等 4 个学习卡点'
  )
})

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
const { PAGE_AUDIT_REGISTRY } = require('./helpers/user-facing-page-audit')

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

const VISIBLE_FIELD = /(?:title|label|summary|message|name|text|description|content|notice|hint|caption|heading|toast|error|empty|loading|accessibility|aria|pdf|scope|targetNames|display)/i
const INTERNAL_FIELD = /(?:^|\.)(?:_?id|.*Id|.*Ids|.*Code|.*Url|code|key|status|type|url|path|route|dataset|data)(?:\.|\[|$)/i
const INTERNAL_CONTAINER = /(?:^|\.)(?:relatedReports|relatedPapers|allEvents|allStatusItems)(?:\.|\[|$)/

function visibleModelFailures(page, state, model) {
  const failures = []
  function visit(value, field, visibleParent = false) {
    if (INTERNAL_CONTAINER.test(field)) return
    const isVisible = visibleParent || VISIBLE_FIELD.test(field)
    if (typeof value === 'string') {
      if (!isVisible || INTERNAL_FIELD.test(field)) return
      const sanitized = sanitizeUserText(value, { treatAsId: true })
      if (sanitized !== value || isInternalIdentifier(value, { treatAsId: true })) {
        failures.push(`${page} / ${state} / ${field}: ${JSON.stringify(value)}`)
      }
      return
    }
    if (Array.isArray(value)) {
      value.forEach((item, index) => visit(item, `${field}[${index}]`, isVisible))
      return
    }
    if (!value || typeof value !== 'object') return
    for (const [key, item] of Object.entries(value)) {
      visit(item, field ? `${field}.${key}` : key, isVisible && !INTERNAL_FIELD.test(key))
    }
  }
  visit(model, 'model')
  return failures
}

function visibleWxmlBindings(source) {
  const bindings = []
  const visibleAttributes = /\b(?:aria-label|title|placeholder|alt)="([^"]*\{\{[^}]+\}\}[^"]*)"/g
  for (const match of source.matchAll(visibleAttributes)) bindings.push(match[1])
  const textNodes = source.replace(/<!--[\s\S]*?-->/g, '').replace(/<[^>]+>/g, '\n')
  for (const match of textNodes.matchAll(/\{\{[^}]+\}\}/g)) bindings.push(match[0])
  return bindings
}

test('page audit registry exactly matches every main and subpackage manifest page', () => {
  assert.deepEqual(Object.keys(PAGE_AUDIT_REGISTRY).sort(), registeredPages().sort())
  assert.equal(registeredPages().length, 21)
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
      `(?:title|label|summary|message|name|text|description|scopeText|targetNames)\\s*:\\s*[^\\n]*(?:\\|\\||\\.join\\()[^\\n]*\\b${idField}\\b`,
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

test('all registered page adapters execute real modules and keep legacy IDs out of visible models', async () => {
  const failures = []
  for (const [page, adapter] of Object.entries(PAGE_AUDIT_REGISTRY)) {
    assert.match(adapter.modulePath, /miniprogram\/pages\//, `${page} missing real module path`)
    assert.ok(['presenter', 'controller'].includes(adapter.kind), `${page} missing real adapter kind`)
    assert.equal(typeof adapter.supportsError, 'boolean', `${page} missing supportsError declaration`)
    const states = await adapter.buildStates()
    assert.ok(states.some(item => ['normal', 'loading', 'empty'].includes(item.state)), `${page} missing supported base state`)
    if (adapter.supportsError) {
      assert.ok(states.some(item => item.state === 'error'), `${page} missing supported error state`)
    }
    assert.ok(states.some(item => item.state === 'legacy-id-only'), `${page} missing legacy ID-only state`)
    for (const fixture of states) {
      failures.push(...visibleModelFailures(page, fixture.state, fixture.model))
    }
  }
  assert.deepEqual(failures, [], `visible model leaks:\n${failures.join('\n')}`)
})

test('runtime visible-model gate reports every leak with page, state, and field context', () => {
  const failures = visibleModelFailures('pages/example/example', 'error', {
    title: 'BN-UNKNOWN-A',
    errorMessage: '加载失败 cloud://env/file',
    routeId: 'BN-ROUTE-ALLOWED',
    dataset: { bottleneckId: 'BN-DATASET-ALLOWED' },
    paperCodeText: 'MATH-20260613-01'
  })
  assert.equal(failures.length, 2)
  assert.match(failures[0], /pages\/example\/example \/ error \/ model\.title/)
  assert.match(failures[1], /model\.errorMessage/)
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
    sanitizeUserText('复测 BN-A、BN-B、。', { count: 2 }),
    '复测 2 个学习卡点。'
  )
})

test('preserves closing delimiters around sanitized cloud identifiers', () => {
  assert.equal(
    sanitizeUserText('查看（cloud://env/file）。'),
    '查看（1 个学习卡点）。'
  )
})

test('requires an ASCII left boundary without blocking Chinese-adjacent identifiers', () => {
  assert.equal(
    sanitizeUserText('图书 ISBN-9787300000000。'),
    '图书 ISBN-9787300000000。'
  )
  assert.equal(
    sanitizeUserText('复测BN-A。'),
    '复测1 个学习卡点。'
  )
})

test('sanitizes opaque document IDs when explicitly treated as IDs', () => {
  assert.equal(
    sanitizeUserText('文档665f8c1a2b3c4d5e6f708192。', { treatAsId: true }),
    '文档1 个学习卡点。'
  )
})

const explicitIdConsistencyCases = [
  {
    value: '665f8c1a2b3c4d5e6f708192a',
    internal: true,
    expected: '文档1 个学习卡点。'
  },
  {
    value: '123e4567-e89b-12d3-a456-426614174000x',
    internal: true,
    expected: '文档1 个学习卡点。'
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

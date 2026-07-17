const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')

const ROOT = path.resolve(__dirname, '..')

const { STATUS_META, normalizeStatus } = require('../miniprogram/utils/bottleneck-view')
const { buildKnowledgeMapPageView } = require('../miniprogram/pages/knowledge-map/knowledge-map-presenter')
const { buildReportView } = require('../miniprogram/pages/report/report-presenter')

function read(relativePath) {
  return fs.readFileSync(path.join(ROOT, relativePath), 'utf8')
}

const CONSUMERS = [
  'miniprogram/pages/learning-progress/learning-progress.js',
  'miniprogram/pages/knowledge-map/knowledge-map-presenter.js',
  'miniprogram/pages/report/report-presenter.js'
]

test('bottleneck status text mapping has a single source: bottleneck-view STATUS_META', () => {
  for (const file of CONSUMERS) {
    const source = read(file)
    assert.match(source, /STATUS_META/, `${file} 应引用 bottleneck-view 的 STATUS_META`)
    // 不允许再出现本地状态文案映射（第四套措辞：“需要验证/仍需练习/已有改善”）
    assert.doesNotMatch(source, /statusText:\s*'需要验证'/, `${file} 仍保留本地状态文案“需要验证”`)
    assert.doesNotMatch(source, /statusText:\s*'已有改善'/, `${file} 仍保留本地状态文案“已有改善”`)
    assert.doesNotMatch(source, /\?\s*'仍需练习'\s*:/, `${file} 仍保留本地状态文案“仍需练习”`)
  }
})

test('knowledge map status text comes from STATUS_META', () => {
  const view = buildKnowledgeMapPageView({
    currentBottlenecks: [
      { lpCode: 'LP-001', status: 'improved', domain: '数与代数' },
      { lpCode: 'LP-008', status: 'persisting', domain: '数与代数' },
      { lpCode: 'LP-003', status: 'needs_verification', domain: '数与代数' }
    ]
  }, 'math')
  const items = view.domains[0].bottlenecks

  for (const item of items) {
    const normalized = normalizeStatus({ status: item.statusClass === 'mastered' ? 'improved' : item.statusClass === 'active' ? 'persisting' : 'needs_verification' })
    assert.equal(item.statusText, STATUS_META[normalized].text)
    assert.equal(item.statusMarker, STATUS_META[normalized].icon)
  }
})

test('report verification status changes use STATUS_META wording', () => {
  const view = buildReportView({
    type: 'diagnosis',
    bottlenecks: [{ lpCode: 'LP-001', status: 'found', errorCount: 2 }],
    linkedVerificationReport: {
      reportId: 'ver-1',
      createdAt: '2026-06-15',
      bottlenecks: [
        { lpCode: 'LP-001', status: 'improved' },
        { lpCode: 'LP-002', status: 'persisting' },
        { lpCode: 'LP-003', status: 'needs_verification' }
      ],
      verificationEvidence: [
        { lpCode: 'LP-001', evidenceStatus: 'passed' },
        { lpCode: 'LP-002', evidenceStatus: 'failed' }
      ]
    }
  })

  const afterTexts = view.verificationStatusChanges.map(item => item.afterText)
  const allowed = Object.values(STATUS_META).map(meta => meta.text)
  for (const text of afterTexts) {
    assert.ok(allowed.includes(text), `状态文案“${text}”不在 STATUS_META 单一来源中`)
  }
  assert.deepEqual(afterTexts, ['已改善', '持续出现', '待验证'])
})

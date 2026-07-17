// tests/analyze-batch-node-catalog.test.js
// 验证数学知识节点目录（knowledge-node-catalog）与 seed 同步（防漂移），
// 以及 canonicalizeNodeId 的五层归并路径和 normalizeBottlenecks 的 nodeIds 归一化。
const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')

const root = path.resolve(__dirname, '..')
const knowledgeSeed = JSON.parse(
  fs.readFileSync(path.join(root, 'data/math/knowledge-nodes.seed.json'), 'utf8')
)
const {
  MATH_NODE_LIST,
  NODE_VARIANT_ALIASES,
} = require('../cloudfunctions/analyzeBatch/knowledge-node-catalog')
const {
  canonicalizeNodeId,
  normalizePageResults,
} = require('../cloudfunctions/analyzeBatch/result-normalizer')

function normalizeSingleBottleneck(bottleneck) {
  const result = normalizePageResults({
    pageResults: [{ imageIndex: 1, bottlenecks: [bottleneck], errorDetails: [] }]
  }, 1)
  return result.pageResults[0].bottlenecks[0]
}

test('knowledge-node-catalog 与 knowledge-nodes seed 同步（91 节点防漂移）', () => {
  const expected = (knowledgeSeed.nodes || []).map(node => ({
    id: node.nodeId,
    title: node.title,
    domain: node.domain,
  }))
  assert.equal(MATH_NODE_LIST.length, 91, '标准知识节点目录应有 91 个节点')
  assert.deepEqual(MATH_NODE_LIST, expected,
    'knowledge-node-catalog.js 与 seed 不同步，请重跑 scripts/build-math-node-catalog.js')
  assert.equal(new Set(MATH_NODE_LIST.map(node => node.id)).size, MATH_NODE_LIST.length, '节点 ID 应唯一')
})

test('NODE_VARIANT_ALIASES 的映射目标必须是标准节点 ID', () => {
  const standardIds = new Set(MATH_NODE_LIST.map(node => node.id))
  for (const [variant, target] of Object.entries(NODE_VARIANT_ALIASES)) {
    assert.ok(standardIds.has(target), `变体 ${variant} 映射到了未知节点 ${target}`)
  }
})

test('analyzeBatch prompt 注入知识节点目录（integration check）', () => {
  const source = fs.readFileSync(path.join(root, 'cloudfunctions/analyzeBatch/index.js'), 'utf8')
  assert.match(source, /require\(['"]\.\/knowledge-node-catalog['"]\)/)
  assert.match(source, /标准知识节点库/)
})

// ── canonicalizeNodeId 五层路径 ──

test('canonicalizeNodeId：标准 ID 直接返回', () => {
  assert.equal(canonicalizeNodeId('MATH-NUM-DEC-MUL-POINT', ''), 'MATH-NUM-DEC-MUL-POINT')
  assert.equal(canonicalizeNodeId('MATH-NUM-FRACTION-DIV-RECIPROCAL', '分数除法'), 'MATH-NUM-FRACTION-DIV-RECIPROCAL')
})

test('canonicalizeNodeId：变体映射表命中', () => {
  // NODE_VARIANT_ALIASES 初版为空骨架，临时注入一条验证映射路径
  NODE_VARIANT_ALIASES['MATH-TEST-VARIANT'] = 'MATH-NUM-DEC-MUL-POINT'
  try {
    assert.equal(canonicalizeNodeId('MATH-TEST-VARIANT', ''), 'MATH-NUM-DEC-MUL-POINT')
  } finally {
    delete NODE_VARIANT_ALIASES['MATH-TEST-VARIANT']
  }
})

test('canonicalizeNodeId：AI 加长的 ID 按前缀归并到标准 ID', () => {
  assert.equal(canonicalizeNodeId('MATH-NUM-DEC-MUL-POINT-ERROR', ''), 'MATH-NUM-DEC-MUL-POINT')
  assert.equal(canonicalizeNodeId('MATH-GEO-CYLINDER-VOLUME-X', ''), 'MATH-GEO-CYLINDER-VOLUME')
})

test('canonicalizeNodeId：AI 截断的 ID 唯一命中时归并，多命中时丢弃', () => {
  // MATH-NUM-FRACTION-DIV-RECIP 只可能是 MATH-NUM-FRACTION-DIV-RECIPROCAL
  assert.equal(canonicalizeNodeId('MATH-NUM-FRACTION-DIV-RECIP', ''), 'MATH-NUM-FRACTION-DIV-RECIPROCAL')
  // MATH-GEO-CYLINDER 同时是 VOLUME 和 SURFACE 的前缀，无法唯一归并
  assert.equal(canonicalizeNodeId('MATH-GEO-CYLINDER', ''), '')
  assert.equal(canonicalizeNodeId('MATH-NUM-DEC', ''), '')
})

test('canonicalizeNodeId：title 双向子串匹配归并', () => {
  // 标准 title 完整命中
  assert.equal(canonicalizeNodeId('MATH-CUSTOM-001', '小数乘法中的小数点定位'), 'MATH-NUM-DEC-MUL-POINT')
  // 标准 title 去掉括号注释后命中（小数除法（移动小数点） → 小数除法）
  assert.equal(canonicalizeNodeId('MATH-CUSTOM-002', '小数除法'), 'MATH-NUM-DEC-DIV')
})

test('canonicalizeNodeId：title 少于 4 字不做子串匹配', () => {
  assert.equal(canonicalizeNodeId('MATH-CUSTOM-003', '分数'), '')
})

test('canonicalizeNodeId：都不命中时丢弃，空输入返回空', () => {
  assert.equal(canonicalizeNodeId('MATH-QUANTUM-PHYSICS', '量子引力'), '')
  assert.equal(canonicalizeNodeId('BN-FRACTION-ADD-DENOM-MISMATCH', ''), '')
  assert.equal(canonicalizeNodeId('', ''), '')
  assert.equal(canonicalizeNodeId(null, null), '')
})

// ── normalizeBottlenecks 的 nodeIds 归一化 ──

test('normalizeBottlenecks：nodeIds 走 canonicalize，丢弃值记入 unmatchedNodeIds', () => {
  const bn = normalizeSingleBottleneck({
    lpCode: 'LP-002',
    lpName: '分数运算',
    nodeIds: [
      'MATH-NUM-FRACTION-ADD-SUB',           // 标准 ID
      'MATH-NUM-FRACTION-ADD-SUB',           // 重复，应去重
      'MATH-NUM-FRACTION-DIV-RECIPROCAL-ERR', // 前缀变体，应归并
      'MATH-INVENTED-XYZ',                   // 自创 ID，应丢弃
    ],
  })
  assert.deepEqual(bn.nodeIds, ['MATH-NUM-FRACTION-ADD-SUB', 'MATH-NUM-FRACTION-DIV-RECIPROCAL'])
  assert.deepEqual(bn.unmatchedNodeIds, ['MATH-INVENTED-XYZ'])
})

test('normalizeBottlenecks：归一化后的 nodeIds 100% 命中标准节点目录', () => {
  const standardIds = new Set(MATH_NODE_LIST.map(node => node.id))
  const bn = normalizeSingleBottleneck({
    lpCode: 'LP-001',
    lpName: '小数乘法中的小数点定位',
    nodeIds: ['MATH-NUM-DEC-MUL-POINT-ERROR', 'MATH-CUSTOM-DEC', 'MATH-INVENTED-XYZ'],
  })
  assert.ok(bn.nodeIds.length > 0)
  for (const id of bn.nodeIds) {
    assert.ok(standardIds.has(id), `${id} 不在标准节点目录中`)
  }
})

test('normalizeBottlenecks：无丢弃时不出现 unmatchedNodeIds 字段', () => {
  const bn = normalizeSingleBottleneck({
    lpCode: 'LP-002',
    lpName: '分数除法',
    nodeIds: ['MATH-NUM-FRACTION-DIV-RECIPROCAL'],
  })
  assert.deepEqual(bn.nodeIds, ['MATH-NUM-FRACTION-DIV-RECIPROCAL'])
  assert.equal('unmatchedNodeIds' in bn, false)
})

test('normalizeBottlenecks：nodeIds 缺失或非数组时返回空数组且无 unmatchedNodeIds', () => {
  const bn = normalizeSingleBottleneck({ lpCode: 'LP-001', lpName: '计算错误' })
  assert.deepEqual(bn.nodeIds, [])
  assert.equal('unmatchedNodeIds' in bn, false)
})

test('normalizeBottlenecks：nodeIds 去重后 cap 6', () => {
  const bn = normalizeSingleBottleneck({
    lpCode: 'LP-001',
    lpName: '计算错误',
    nodeIds: [
      'MATH-NUM-INT-MUL-PARTIAL',
      'MATH-NUM-INT-DIV-LONG',
      'MATH-NUM-DEC-PLACE-VALUE',
      'MATH-NUM-DEC-MUL-POINT',
      'MATH-NUM-FRACTION-MEANING',
      'MATH-NUM-FRACTION-ADD-SUB',
      'MATH-NUM-FRACTION-DIV-RECIPROCAL',
      'MATH-GEO-CYLINDER-VOLUME',
    ],
  })
  assert.equal(bn.nodeIds.length, 6, '归一化后的 nodeIds 应截断为 6')
  assert.equal('unmatchedNodeIds' in bn, false)
})

test('normalizeBottlenecks：unmatchedNodeIds cap 6', () => {
  const bn = normalizeSingleBottleneck({
    lpCode: 'LP-001',
    lpName: '计算错误',
    nodeIds: [
      'MATH-INVENTED-1',
      'MATH-INVENTED-2',
      'MATH-INVENTED-3',
      'MATH-INVENTED-4',
      'MATH-INVENTED-5',
      'MATH-INVENTED-6',
      'MATH-INVENTED-7',
      'MATH-INVENTED-8',
    ],
  })
  assert.deepEqual(bn.nodeIds, [])
  assert.equal(bn.unmatchedNodeIds.length, 6, 'unmatchedNodeIds 应截断为 6')
  assert.equal(bn.unmatchedNodeIds[0], 'MATH-INVENTED-1')
})

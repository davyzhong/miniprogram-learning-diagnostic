const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')

/**
 * L1 数据一致性守护测试
 *
 * 目标：每次修改 data/math/*.json 后，自动验证四库交叉引用 100% 一致。
 * 这是"改完数据立即验证"的第一道防线——比手动跑脚本更可靠。
 *
 * 四库：historical-error-replay ↔ bottleneck-taxonomy-v2 ↔ knowledge-nodes ↔ learning-resources
 */

const root = path.resolve(__dirname, '..')
const mathDataRoot = path.join(root, 'data/math')

function readJson(fileName) {
  return JSON.parse(fs.readFileSync(path.join(mathDataRoot, fileName), 'utf8'))
}

const replay = readJson('historical-error-replay.seed.json')
const taxonomy = readJson('bottleneck-taxonomy-v2.seed.json')
const nodes = readJson('knowledge-nodes.seed.json')
const resources = readJson('learning-resources.seed.json')

const bnIds = new Set(taxonomy.bottlenecks.map(b => b.bottleneckId))
const nodeIds = new Set(nodes.nodes.map(n => n.nodeId))
const resourceIds = new Set(resources.resources.map(r => r.resourceId))

// ── 1. 证据 → 卡点 引用完整性 ──

test('historical-error-replay: every primaryBottleneckId exists in taxonomy', () => {
  const missing = []
  for (const item of replay.items) {
    if (item.primaryBottleneckId && !bnIds.has(item.primaryBottleneckId)) {
      missing.push(`${item.errorId} → ${item.primaryBottleneckId}`)
    }
  }
  assert.deepEqual(missing, [], `dangling primaryBottleneckId references:\n  ${missing.join('\n  ')}`)
})

test('historical-error-replay: every candidateBottleneck exists in taxonomy', () => {
  const missing = []
  for (const item of replay.items) {
    for (const cand of item.candidateBottlenecks || []) {
      if (!bnIds.has(cand)) missing.push(`${item.errorId} → ${cand}`)
    }
  }
  assert.deepEqual(missing, [], `dangling candidateBottlenecks references:\n  ${missing.join('\n  ')}`)
})

// ── 2. 证据 → 知识节点 引用完整性 ──

test('historical-error-replay: every nodeId exists in knowledge-nodes', () => {
  const missing = []
  for (const item of replay.items) {
    for (const nid of item.nodeIds || []) {
      if (!nodeIds.has(nid)) missing.push(`${item.errorId} → ${nid}`)
    }
  }
  assert.deepEqual(missing, [], `dangling nodeId references:\n  ${missing.join('\n  ')}`)
})

// ── 3. 证据字段完整性 ──

const VALID_DIMENSIONS = new Set(['EXEC', 'CHECK', 'TRACK', 'CONVERT', 'BASE', 'MODEL'])
const VALID_EVIDENCE_TYPES = new Set(['hard_question', 'image_cluster', 'report_inference'])

test('historical-error-replay: every item has valid validationDimension', () => {
  const bad = []
  for (const item of replay.items) {
    if (!item.validationDimension) {
      bad.push(`${item.errorId}: missing`)
    } else if (!VALID_DIMENSIONS.has(item.validationDimension)) {
      bad.push(`${item.errorId}: unknown "${item.validationDimension}"`)
    }
  }
  assert.deepEqual(bad, [], `invalid validationDimension:\n  ${bad.join('\n  ')}`)
})

test('historical-error-replay: every item has valid evidenceType', () => {
  const bad = []
  for (const item of replay.items) {
    if (!item.evidenceType) {
      bad.push(`${item.errorId}: missing`)
    } else if (!VALID_EVIDENCE_TYPES.has(item.evidenceType)) {
      bad.push(`${item.errorId}: unknown "${item.evidenceType}"`)
    }
  }
  assert.deepEqual(bad, [], `invalid evidenceType:\n  ${bad.join('\n  ')}`)
})

// ── 4. 卡点 → 知识节点 反向引用 ──

test('bottleneck-taxonomy: every bottleneck.nodeId exists in knowledge-nodes', () => {
  const missing = []
  for (const bn of taxonomy.bottlenecks) {
    if (bn.nodeId && !nodeIds.has(bn.nodeId)) {
      missing.push(`${bn.bottleneckId} → ${bn.nodeId}`)
    }
  }
  assert.deepEqual(missing, [], `dangling bottleneck→node references:\n  ${missing.join('\n  ')}`)
})

test('bottleneck-taxonomy: every bottleneck has required definition fields', () => {
  const incomplete = []
  for (const bn of taxonomy.bottlenecks) {
    const issues = []
    if (!(bn.symptomPatterns || []).length) issues.push('symptomPatterns empty')
    if (!(bn.rootCauseSignals || []).length) issues.push('rootCauseSignals empty')
    if (!(bn.microValidationRules || []).length) issues.push('microValidationRules empty')
    if (issues.length) incomplete.push(`${bn.bottleneckId}: ${issues.join(', ')}`)
  }
  assert.deepEqual(incomplete, [], `incomplete bottleneck definitions:\n  ${incomplete.join('\n  ')}`)
})

// ── 5. 知识节点 ↔ 学习资源 双向一致 ──

test('knowledge-nodes: every resourceId in nodes exists in learning-resources', () => {
  const missing = []
  for (const node of nodes.nodes) {
    for (const rid of node.resourceIds || []) {
      if (!resourceIds.has(rid)) missing.push(`${node.nodeId} → ${rid}`)
    }
  }
  assert.deepEqual(missing, [], `dangling node→resource references:\n  ${missing.join('\n  ')}`)
})

test('learning-resources: every resource.nodeId exists in knowledge-nodes', () => {
  const missing = []
  for (const res of resources.resources) {
    if (res.nodeId && !nodeIds.has(res.nodeId)) {
      missing.push(`${res.resourceId} → ${res.nodeId}`)
    }
  }
  assert.deepEqual(missing, [], `dangling resource→node references:\n  ${missing.join('\n  ')}`)
})

test('learning-resources ↔ knowledge-nodes: bidirectional consistency', () => {
  // 正向：资源声明的 nodeId，该节点的 resourceIds 必须包含此 resourceId
  const inconsistent = []
  const nodeToResources = new Map()
  for (const node of nodes.nodes) {
    nodeToResources.set(node.nodeId, new Set(node.resourceIds || []))
  }
  for (const res of resources.resources) {
    if (!res.nodeId) continue
    const declared = nodeToResources.get(res.nodeId)
    if (declared && !declared.has(res.resourceId)) {
      inconsistent.push(`${res.resourceId} declares node ${res.nodeId}, but node.resourceIds missing it`)
    }
  }
  assert.deepEqual(inconsistent, [], `bidirectional inconsistencies:\n  ${inconsistent.join('\n  ')}`)
})

// ── 6. ID 唯一性 ──

test('all IDs are unique within each dataset', () => {
  function checkUnique(items, field, label) {
    const values = items.map(i => i[field]).filter(Boolean)
    const dupes = values.filter((v, i) => values.indexOf(v) !== i)
    assert.deepEqual([...new Set(dupes)], [], `${label} has duplicate ${field}: ${dupes.join(', ')}`)
  }
  checkUnique(nodes.nodes, 'nodeId', 'knowledge-nodes')
  checkUnique(taxonomy.bottlenecks, 'bottleneckId', 'bottleneck-taxonomy')
  checkUnique(resources.resources, 'resourceId', 'learning-resources')
  checkUnique(replay.items, 'errorId', 'historical-error-replay')
})

// ── 7. 前置依赖引用完整性 ──

test('knowledge-nodes: every prerequisite references an existing nodeId', () => {
  const missing = []
  for (const node of nodes.nodes) {
    for (const pre of node.prerequisites || []) {
      if (!nodeIds.has(pre)) missing.push(`${node.nodeId} prerequisite → ${pre}`)
    }
  }
  assert.deepEqual(missing, [], `dangling prerequisite references:\n  ${missing.join('\n  ')}`)
})

// ── 8. gradeRange 合法性 ──

test('knowledge-nodes: every gradeRange is valid [min, max] with min ≤ max', () => {
  const bad = []
  for (const node of nodes.nodes) {
    const gr = node.gradeRange
    if (!Array.isArray(gr) || gr.length !== 2) {
      bad.push(`${node.nodeId}: gradeRange not [min,max]`)
    } else if (!Number.isInteger(gr[0]) || !Number.isInteger(gr[1])) {
      bad.push(`${node.nodeId}: non-integer grades ${JSON.stringify(gr)}`)
    } else if (gr[0] < 1 || gr[1] > 9) {
      bad.push(`${node.nodeId}: grades out of range ${JSON.stringify(gr)}`)
    } else if (gr[0] > gr[1]) {
      bad.push(`${node.nodeId}: min > max ${JSON.stringify(gr)}`)
    }
  }
  assert.deepEqual(bad, [], `invalid gradeRange:\n  ${bad.join('\n  ')}`)
})

// ── 9. 数据规模下限守护（防止误删导致回退）──

test('data scale does not regress below current baseline', () => {
  assert.ok(nodes.nodes.length >= 91, `nodes should be ≥91, got ${nodes.nodes.length}`)
  assert.ok(taxonomy.bottlenecks.length >= 28, `bottlenecks should be ≥28, got ${taxonomy.bottlenecks.length}`)
  assert.ok(resources.resources.length >= 28, `resources should be ≥28, got ${resources.resources.length}`)
  assert.ok(replay.items.length >= 41, `replay items should be ≥41, got ${replay.items.length}`)
})

// ── 10. 领域与年级覆盖度 ──

test('knowledge-nodes covers all 4 core domains', () => {
  const domains = new Set(nodes.nodes.map(n => n.domain))
  const required = ['数与代数', '图形与几何', '统计与概率', '综合与实践']
  const missing = required.filter(d => !domains.has(d))
  assert.deepEqual(missing, [], `missing domains: ${missing.join(', ')}`)
})

test('knowledge-nodes covers grades 1 through 6', () => {
  const grades = new Set()
  for (const node of nodes.nodes) {
    if (Array.isArray(node.gradeRange)) {
      for (let g = node.gradeRange[0]; g <= node.gradeRange[1]; g++) grades.add(g)
    }
  }
  const missing = []
  for (let g = 1; g <= 6; g++) {
    if (!grades.has(g)) missing.push(g)
  }
  assert.deepEqual(missing, [], `grades with no node coverage: ${missing.join(', ')}`)
})

// ── 11. JSON 合法性（兜底）──

test('all 4 seed files are valid JSON', () => {
  for (const fn of ['historical-error-replay.seed.json', 'bottleneck-taxonomy-v2.seed.json',
                    'knowledge-nodes.seed.json', 'learning-resources.seed.json']) {
    assert.doesNotThrow(() => readJson(fn), `${fn} should be valid JSON`)
  }
})

// ── 12. 资源引用的 bottleneckIds 完整性 ──

test('learning-resources: every bottleneckId in resource exists in taxonomy', () => {
  const missing = []
  for (const res of resources.resources) {
    for (const bid of res.bottleneckIds || []) {
      if (!bnIds.has(bid)) missing.push(`${res.resourceId} → ${bid}`)
    }
  }
  assert.deepEqual(missing, [], `dangling resource→bottleneck references:\n  ${missing.join('\n  ')}`)
})

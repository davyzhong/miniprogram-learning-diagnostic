const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')

const root = path.resolve(__dirname, '..')
const mathDataRoot = path.join(root, 'data/math')

function readJson(fileName) {
  return JSON.parse(fs.readFileSync(path.join(mathDataRoot, fileName), 'utf8'))
}

function assertUnique(items, field, label) {
  const values = items.map(item => item[field])
  assert.equal(new Set(values).size, values.length, `${label} ${field} values should be unique`)
}

function assertKnownRefs(refs, known, label) {
  for (const ref of refs) {
    assert.ok(known.has(ref), `${label} references unknown id ${ref}`)
  }
}

test('math learning map seed files exist and parse', () => {
  for (const fileName of [
    'README.md',
    'knowledge-nodes.seed.json',
    'bottleneck-taxonomy-v2.seed.json',
    'learning-resources.seed.json',
    'historical-error-replay.seed.json',
    'student-node-mastery.example.json',
    'intervention-sessions.example.json',
    'resource-review-template.md',
    'intervention-session-template.md',
    'weekly-review-template.md'
  ]) {
    assert.equal(fs.existsSync(path.join(mathDataRoot, fileName)), true, `${fileName} should exist`)
  }

  assert.doesNotThrow(() => readJson('knowledge-nodes.seed.json'))
  assert.doesNotThrow(() => readJson('bottleneck-taxonomy-v2.seed.json'))
  assert.doesNotThrow(() => readJson('learning-resources.seed.json'))
  assert.doesNotThrow(() => readJson('historical-error-replay.seed.json'))
  assert.doesNotThrow(() => readJson('student-node-mastery.example.json'))
  assert.doesNotThrow(() => readJson('intervention-sessions.example.json'))
})

test('math seed data has enough coverage for the first execution batch', () => {
  const knowledge = readJson('knowledge-nodes.seed.json')
  const taxonomy = readJson('bottleneck-taxonomy-v2.seed.json')
  const resources = readJson('learning-resources.seed.json')
  const replay = readJson('historical-error-replay.seed.json')

  assert.ok(knowledge.nodes.length >= 30, 'should seed at least 30 knowledge nodes')
  assert.ok(taxonomy.bottlenecks.length >= 20, 'should seed at least 20 fine-grained bottlenecks')
  assert.ok(resources.resources.length >= 20, 'should seed at least 20 learning resources')
  assert.ok(replay.items.length >= 20, 'should seed at least 20 historical replay items')
})

test('math knowledge nodes, bottlenecks, resources and replay items use stable ids', () => {
  const knowledge = readJson('knowledge-nodes.seed.json')
  const taxonomy = readJson('bottleneck-taxonomy-v2.seed.json')
  const resources = readJson('learning-resources.seed.json')
  const replay = readJson('historical-error-replay.seed.json')

  assertUnique(knowledge.nodes, 'nodeId', 'knowledge nodes')
  assertUnique(taxonomy.bottlenecks, 'bottleneckId', 'bottlenecks')
  assertUnique(resources.resources, 'resourceId', 'resources')
  assertUnique(replay.items, 'errorId', 'historical replay items')

  for (const node of knowledge.nodes) {
    assert.match(node.nodeId, /^MATH-/)
  }
  for (const bottleneck of taxonomy.bottlenecks) {
    assert.match(bottleneck.bottleneckId, /^BN-/)
  }
  for (const resource of resources.resources) {
    assert.match(resource.resourceId, /^RES-/)
  }
})

test('math references resolve across nodes, bottlenecks, resources and replay evidence', () => {
  const knowledge = readJson('knowledge-nodes.seed.json')
  const taxonomy = readJson('bottleneck-taxonomy-v2.seed.json')
  const resources = readJson('learning-resources.seed.json')
  const replay = readJson('historical-error-replay.seed.json')
  const mastery = readJson('student-node-mastery.example.json')
  const sessions = readJson('intervention-sessions.example.json')

  const nodeIds = new Set(knowledge.nodes.map(node => node.nodeId))
  const bottleneckIds = new Set(taxonomy.bottlenecks.map(bottleneck => bottleneck.bottleneckId))
  const resourceIds = new Set(resources.resources.map(resource => resource.resourceId))

  for (const bottleneck of taxonomy.bottlenecks) {
    assertKnownRefs([bottleneck.nodeId], nodeIds, `bottleneck ${bottleneck.bottleneckId}`)
  }

  for (const resource of resources.resources) {
    assertKnownRefs([resource.nodeId], nodeIds, `resource ${resource.resourceId}`)
    assertKnownRefs(resource.bottleneckIds || [], bottleneckIds, `resource ${resource.resourceId}`)
  }

  for (const item of replay.items) {
    assertKnownRefs(item.nodeIds, nodeIds, `replay item ${item.errorId}`)
    assertKnownRefs(item.candidateBottlenecks, bottleneckIds, `replay item ${item.errorId}`)
  }

  for (const record of mastery.masteryRecords) {
    assertKnownRefs([record.nodeId], nodeIds, `mastery record ${record.nodeId}`)
    assertKnownRefs(record.activeBottlenecks, bottleneckIds, `mastery record ${record.nodeId}`)
  }

  for (const session of sessions.sessions) {
    assertKnownRefs([session.nodeId], nodeIds, `intervention session ${session.sessionId}`)
    assertKnownRefs(session.bottleneckIds, bottleneckIds, `intervention session ${session.sessionId}`)
    assertKnownRefs(session.resourcesUsed.map(resource => resource.resourceId), resourceIds, `intervention session ${session.sessionId}`)
  }
})

test('high priority bottlenecks are actionable before generating full verification papers', () => {
  const taxonomy = readJson('bottleneck-taxonomy-v2.seed.json')
  const highPriority = taxonomy.bottlenecks.filter(bottleneck => bottleneck.priority === 'high')

  assert.ok(highPriority.length >= 10, 'should have a meaningful high-priority bottleneck batch')
  for (const bottleneck of highPriority) {
    assert.ok(bottleneck.symptomPatterns.length > 0, `${bottleneck.bottleneckId} should include symptoms`)
    assert.ok(bottleneck.rootCauseSignals.length > 0, `${bottleneck.bottleneckId} should include root causes`)
    assert.ok(bottleneck.microValidationRules.length > 0, `${bottleneck.bottleneckId} should include micro validation rules`)
    assert.ok(bottleneck.repairStrategy.length > 0, `${bottleneck.bottleneckId} should include repair strategy`)
  }
})

test('resource library keeps platform links as parent-reviewed recommendations', () => {
  const resources = readJson('learning-resources.seed.json')

  assert.match(resources.childAccessRule, /家长/)
  assert.match(resources.resourcePolicy, /高质量讲法优先/)
  // 新的 selectionPolicy 结构（2026-06-18 更新）
  assert.deepEqual(resources.selectionPolicy.jumpablePlatforms.slice(0, 2), ['B站', '小红书'])
  assert.ok(resources.selectionPolicy.platformPriority['B站'] === 1)
  assert.ok(resources.selectionPolicy.platformPriority['小红书'] === 2)
  assert.ok(resources.resources.some(resource => resource.platform === 'B站'))
  assert.ok(resources.resources.some(resource => resource.platform === 'Khan Academy'))

  // 所有平台都应在 platformPriority 或已知列表中
  for (const resource of resources.resources) {
    assert.ok(['B站', '小红书', 'YouTube', 'Khan Academy', '公众号', '国家中小学智慧教育平台', '人教社'].includes(resource.platform))
    assert.ok(['video', 'animation', 'article', 'course_unit', 'searchEntry', 'search_query'].includes(resource.type))
    assert.ok(['A', 'B', 'C', 'D'].includes(resource.recommendationLevel))
    assert.match(resource.url, /^https?:\/\//)
    if (resource.type === 'searchEntry' || resource.type === 'search_query') {
      assert.notEqual(resource.recommendationLevel, 'A', `${resource.resourceId} search entries should not be default recommendations`)
      assert.match(resource.notes, /筛选|搜索|待|采集|入口/)
    }
  }
})

test('math subject design index links the upgraded docs', () => {
  const index = fs.readFileSync(path.join(root, 'docs/subject-design/README.md'), 'utf8')

  assert.match(index, /钟青羽数学学习地图与资源库升级详细设计\.md/)
  assert.match(index, /钟青羽数学诊断输出合同v2\.md/)
})

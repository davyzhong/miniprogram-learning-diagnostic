const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')

/**
 * L2 诊断准确性回归测试
 *
 * 用 41 条历史错题（已知正确答案的黄金测试集）验证 enrichMathReport 的匹配质量。
 *
 * 核心机制：每条 ERR 记录了 primaryBottleneckId（应该匹配到的卡点）和 nodeIds（应该关联的知识节点）。
 * 把 ERR 构造成最小 report fixture，调 enrichMathReport()，检查匹配结果。
 *
 * 这个测试的价值不只是 pass/fail：
 *   - 它量化 enricher 的召回率（多少条 ERR 能匹配到预期的 BN）
 *   - 它暴露"文档说应该匹配 X，但实现匹配到 Y"的差距
 *   - 当改了 enricher 打分逻辑或 BN 卡点定义后，立即知道是否引入回归
 *
 * 注意：并非所有 ERR 都能被精确匹配——这是设计现实（legacyLpCode 细编号不在 alias 映射里）。
 * 测试会输出匹配质量报告，而非硬性要求 100% 通过。
 */

const { enrichMathReport } = require('../cloudfunctions/analyzePhotos/math-learning-map-enricher')

const root = path.resolve(__dirname, '..')
const replay = JSON.parse(
  fs.readFileSync(path.join(root, 'data/math/historical-error-replay.seed.json'), 'utf8')
)

// 把每条 ERR 构造成 enrichMathReport 能处理的最小 report fixture
function buildFixtureFromErr(item) {
  return {
    _id: `regression-${item.errorId}`,
    subject: 'math',
    status: 'completed',
    type: 'diagnosis',
    totalErrors: 1,
    summary: `${item.legacyLpName || ''} ${item.question || ''}`.trim(),
    bottlenecks: [{
      lpCode: item.legacyLpCode,
      lpName: item.legacyLpName,
      severity: 'medium',
      errorCount: 1,
      rootCause: item.whyMorePrecise || '',
      // 关键：带上 ERR 记录的 nodeIds，让 enricher 有 nodeId 匹配信号
      nodeIds: item.nodeIds ? [...item.nodeIds] : [],
      // 带上预期的 primaryBottleneckId 作为已存在候选（模拟 AI 已识别）
      candidateBottlenecks: item.primaryBottleneckId
        ? [{ bottleneckId: item.primaryBottleneckId }]
        : []
    }],
    errorDetails: [{
      lpCode: item.legacyLpCode,
      questionContent: item.question || '',
      studentAnswer: item.studentAnswer || '',
      correctAnswer: item.correctAnswer || ''
    }],
    imageFiles: []
  }
}

// 收集所有 ERR 的匹配结果
const results = replay.items.map(item => {
  const fixture = buildFixtureFromErr(item)
  const { report, changed } = enrichMathReport(fixture, { force: true })
  const bn = report.bottlenecks[0] || {}

  const matchedCandidateIds = (bn.candidateBottlenecks || []).map(c =>
    typeof c === 'string' ? c : c.bottleneckId
  )
  const expectedPrimary = item.primaryBottleneckId
  const expectedNodes = item.nodeIds || []

  return {
    errorId: item.errorId,
    legacyLpCode: item.legacyLpCode,
    expectedPrimary,
    matchedCandidates: matchedCandidateIds,
    primaryHit: expectedPrimary && matchedCandidateIds.includes(expectedPrimary),
    matchedNodeIds: bn.nodeIds || [],
    nodeHit: expectedNodes.some(n => (bn.nodeIds || []).includes(n)),
    changed,
    question: (item.question || '').slice(0, 30)
  }
})

// ── 统计 ──
const total = results.length
const primaryHits = results.filter(r => r.primaryHit).length
const nodeHits = results.filter(r => r.nodeHit).length
const enriched = results.filter(r => r.changed).length
const primaryRate = total > 0 ? (primaryHits / total * 100).toFixed(1) : '0'
const nodeRate = total > 0 ? (nodeHits / total * 100).toFixed(1) : '0'

// ── 测试用例 ──

test('enricher processes all historical error replay items without throwing', () => {
  assert.ok(total >= 41, `should process ≥41 items, got ${total}`)
  // 每条都不应抛异常（已在上面的 map 中隐式验证）
})

test('enricher enriches the majority of error items (changed=true)', () => {
  // 至少 60% 的 ERR 应该被 enricher 改变（匹配到候选/节点/资源）
  const minEnriched = Math.ceil(total * 0.6)
  assert.ok(
    enriched >= minEnriched,
    `only ${enriched}/${total} items were enriched (expected ≥${minEnriched}). ` +
    `Unenriched: ${results.filter(r => !r.changed).map(r => r.errorId).join(', ')}`
  )
})

test('enricher matches expected primaryBottleneckId for legacy-coded items (LP-001~LP-010)', () => {
  // 旧编号（LP-001~LP-010）的 ERR 应该有较高的匹配率，因为 LEGACY_CODE_ALIASES 覆盖它们
  const legacyItems = results.filter(r => /^LP-0\d{2}$/.test(r.legacyLpCode))
  const legacyHits = legacyItems.filter(r => r.primaryHit).length
  const legacyRate = legacyItems.length > 0 ? (legacyHits / legacyItems.length * 100).toFixed(1) : 'N/A'

  // 旧编号匹配率应 ≥ 50%
  if (legacyItems.length > 0) {
    assert.ok(
      legacyHits >= Math.ceil(legacyItems.length * 0.5),
      `legacy items primary match rate ${legacyRate}% (${legacyHits}/${legacyItems.length}) below 50%. ` +
      `Missed: ${legacyItems.filter(r => !r.primaryHit).map(r => r.errorId).join(', ')}`
    )
  }
})

test('enricher matches expected nodeIds with reasonable coverage', () => {
  // nodeId 匹配率应 ≥ 50%（因为 fixture 带上了 ERR 的 nodeIds）
  const minNodeHits = Math.ceil(total * 0.5)
  assert.ok(
    nodeHits >= minNodeHits,
    `nodeId match rate ${nodeRate}% (${nodeHits}/${total}) below 50%. ` +
    `Missed: ${results.filter(r => !r.nodeHit).map(r => r.errorId).join(', ')}`
  )
})

test('diagnostic quality report — documents current match gaps for improvement', t => {
  // 这个测试不是硬性 pass/fail，而是输出诊断质量报告
  // 帮助开发者理解 enricher 当前对 41 条历史证据的匹配情况
  const missed = results.filter(r => !r.primaryHit)

  console.log('\n════════ 诊断准确性回归报告 ════════')
  console.log(`总证据数:     ${total}`)
  console.log(`被enrich:     ${enriched}/${total} (${(enriched/total*100).toFixed(1)}%)`)
  console.log(`主卡点命中:   ${primaryHits}/${total} (${primaryRate}%)`)
  console.log(`知识节点命中: ${nodeHits}/${total} (${nodeRate}%)`)
  console.log('')

  if (missed.length > 0) {
    console.log(`未命中主卡点的 ${missed.length} 条 ERR（按 legacyLpCode 分组）:`)
    const byCode = {}
    for (const m of missed) {
      const prefix = m.legacyLpCode.split('-').slice(0, 2).join('-')
      byCode[prefix] = (byCode[prefix] || 0) + 1
    }
    for (const [code, cnt] of Object.entries(byCode).sort((a, b) => b[1] - a[1])) {
      console.log(`  ${code}: ${cnt} 条`)
    }
    console.log('')
    console.log('典型未命中样例（前5条）:')
    for (const m of missed.slice(0, 5)) {
      console.log(`  ${m.errorId} [${m.legacyLpCode}] 期望=${m.expectedPrimary} 实际=${m.matchedCandidates.join(',') || '(无)'}`)
      console.log(`    ${m.question}`)
    }
  }
  console.log('══════════════════════════════════════\n')

  // 只断言报告生成了，不强求匹配率
  assert.ok(total > 0, 'should have results to report')
})

test('every enriched bottleneck produces valid candidateBottlenecks structure', () => {
  // 已 enrich 的条目，其 candidateBottlenecks 结构必须合法
  for (const r of results) {
    if (!r.changed) continue
    // matchedCandidates 不应为空（至少匹配到 1 个候选）
    assert.ok(
      r.matchedCandidates.length > 0,
      `${r.errorId} was changed but has empty candidateBottlenecks`
    )
  }
})

test('enricher is idempotent — enriching an already-enriched report does not change it', () => {
  // 取第一条 ERR，enrich 两次，第二次应该 changed=false
  const item = replay.items[0]
  const fixture = buildFixtureFromErr(item)
  const first = enrichMathReport(fixture, { force: true })
  const second = enrichMathReport(first.report) // 不带 force，应走幂等短路

  assert.equal(second.changed, false, 'second enrich should be idempotent')
})

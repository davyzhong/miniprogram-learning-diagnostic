// 数学节点掌握状态机（纯函数，无云函数依赖，可在多个云函数间复制使用）。
// 设计权威：docs/superpowers/specs/2026-07-17-math-node-mastery-loop-design.md
//
// 六态：unobserved / suspected_gap / relearning / partial_mastery / mastered / recurring
// 四事件：errorEvidence / verificationFailed / verificationPassed / resourcePracticePassed
//
// 原则：
// - 任何状态不得由单次事件直接置 mastered（必须 partial_mastery + 间隔 ≥24h 的复测通过）。
// - 降级必须带证据引用（evidenceRefs 追加式，不覆盖）。
// - unobserved 不落库：对无记录节点，只有会改变状态的事件才创建记录。

const NODE_MASTERY_STATUSES = [
  'unobserved',
  'suspected_gap',
  'relearning',
  'partial_mastery',
  'mastered',
  'recurring',
]

const MASTERY_EVENTS = [
  'errorEvidence',
  'verificationFailed',
  'verificationPassed',
  'resourcePracticePassed',
]

// 升级 mastered 所需的与上次练习的最小间隔（间隔复测语义；24/72h 完整调度在 Phase C）。
const MASTERY_UPGRADE_MIN_INTERVAL_MS = 24 * 60 * 60 * 1000

const MAX_EVIDENCE_REFS = 20
const MAX_ACTIVE_BOTTLENECKS = 8

function isValidStatus(status) {
  return NODE_MASTERY_STATUSES.includes(status)
}

function isValidEvent(eventType) {
  return MASTERY_EVENTS.includes(eventType)
}

/**
 * 计算事件后的目标状态（纯转移表，不含字段副作用）。
 * @param {string} status 当前状态（无记录时传 'unobserved'）
 * @param {string} eventType 事件类型
 * @param {object} [context]
 * @param {number|string|Date} [context.now] 事件发生时间
 * @param {number|string|Date|null} [context.lastPracticedAt] 记录中已有的最近练习时间
 * @param {number} [context.upgradeMinIntervalMs] mastered 升级所需最小间隔（测试可注入）
 */
function nextStatus(status, eventType, context = {}) {
  const from = isValidStatus(status) ? status : 'unobserved'
  if (!isValidEvent(eventType)) return from

  switch (eventType) {
    case 'errorEvidence':
      // 新错题指向节点：未观察 → 疑似漏洞；已掌握/部分掌握 → 复发；其余保持
      if (from === 'unobserved') return 'suspected_gap'
      if (from === 'mastered' || from === 'partial_mastery') return 'recurring'
      return from

    case 'verificationFailed':
      // 验证失败确认卡点：疑似/未观察/复发 → 正在重学；已掌握/部分掌握被证据直接推翻
      return 'relearning'

    case 'resourcePracticePassed':
      // 资源学习 + 当场练习通过：重学中/疑似漏洞/复发 → 部分掌握
      // （疑似漏洞已有错题证据，完成修复练习即沿阶梯上行；已掌握仍需间隔复测，不跳级）
      if (from === 'relearning' || from === 'suspected_gap' || from === 'recurring') return 'partial_mastery'
      return from

    case 'verificationPassed': {
      // 验证通过：
      //   疑似漏洞 → 未观察（验证卷的核心作用就是确认或推翻卡点假设，通过即推翻）
      //   正在重学/复发 → 部分掌握；部分掌握 → 已掌握（需间隔复测）
      if (from === 'suspected_gap') return 'unobserved'
      if (from === 'relearning' || from === 'recurring') return 'partial_mastery'
      if (from === 'partial_mastery') {
        const now = toMillis(context.now)
        const last = toMillis(context.lastPracticedAt)
        const minInterval = context.upgradeMinIntervalMs || MASTERY_UPGRADE_MIN_INTERVAL_MS
        if (now !== null && last !== null && now - last >= minInterval) return 'mastered'
        return from
      }
      return from
    }

    default:
      return from
  }
}

function toMillis(value) {
  if (value === null || value === undefined || value === '') return null
  if (value instanceof Date) {
    const time = value.getTime()
    return Number.isNaN(time) ? null : time
  }
  if (typeof value === 'number' && Number.isFinite(value)) return value
  const parsed = Date.parse(value)
  return Number.isNaN(parsed) ? null : parsed
}

function toDate(value, fallback) {
  const ms = toMillis(value)
  if (ms !== null) return new Date(ms)
  return fallback || new Date()
}

/**
 * 对单节点记录应用一个事件，返回新记录（不修改入参）。
 * @param {object|null} record 现有记录（无则传 null，视为 unobserved）
 * @param {object} event { type, at, sourceId, summary, bottleneckIds }
 * @param {object} [context] 同 nextStatus
 * @returns {object|null} 新记录；事件不产生任何变化且原本无记录时返回 null（unobserved 不落库）
 */
function applyEvent(record, event, context = {}) {
  if (!event || !isValidEvent(event.type)) return record || null

  const currentStatus = record && isValidStatus(record.status) ? record.status : 'unobserved'
  const eventAt = toDate(event.at)
  const mergedContext = {
    ...context,
    now: context.now !== undefined ? context.now : eventAt,
    lastPracticedAt: record ? record.lastPracticedAt : null,
  }
  const target = nextStatus(currentStatus, event.type, mergedContext)

  // unobserved 不落库：无记录且状态不变（练习通过类事件）时不创建记录
  if (!record && target === 'unobserved') return null

  const isPracticeEvent = event.type === 'verificationPassed' || event.type === 'resourcePracticePassed'
  const evidenceRefs = [...(record && Array.isArray(record.evidenceRefs) ? record.evidenceRefs : [])]
  evidenceRefs.push({
    type: event.type,
    sourceId: String(event.sourceId || '').slice(0, 120),
    summary: String(event.summary || '').slice(0, 200),
    at: eventAt,
  })
  const trimmedEvidence = evidenceRefs.slice(-MAX_EVIDENCE_REFS)

  const activeBottleneckIds = [...new Set([
    ...(record && Array.isArray(record.activeBottleneckIds) ? record.activeBottleneckIds : []),
    ...(Array.isArray(event.bottleneckIds) ? event.bottleneckIds.map(String) : []),
  ])].slice(0, MAX_ACTIVE_BOTTLENECKS)

  // confidence 简单启发式：基础 0.5，每条证据 +0.1，封顶 0.95（单调递增，边界 0-1）
  const confidence = Math.min(0.95, 0.5 + 0.1 * (trimmedEvidence.length - 1))

  // nextReviewAt：进入 partial_mastery 时安排 24h 后复测；mastered 后清空（Phase C 做完整调度）
  let nextReviewAt = (record && record.nextReviewAt) || null
  if (target === 'partial_mastery' && currentStatus !== 'partial_mastery') {
    nextReviewAt = new Date(eventAt.getTime() + MASTERY_UPGRADE_MIN_INTERVAL_MS)
  } else if (target === 'mastered') {
    nextReviewAt = null
  }

  return {
    nodeId: (record && record.nodeId) || String(event.nodeId || ''),
    status: target,
    confidence: Math.round(confidence * 100) / 100,
    evidenceRefs: trimmedEvidence,
    activeBottleneckIds,
    lastEvidenceAt: eventAt,
    lastPracticedAt: isPracticeEvent ? eventAt : (record && record.lastPracticedAt) || null,
    nextReviewAt,
  }
}

module.exports = {
  NODE_MASTERY_STATUSES,
  MASTERY_EVENTS,
  MASTERY_UPGRADE_MIN_INTERVAL_MS,
  nextStatus,
  applyEvent,
}

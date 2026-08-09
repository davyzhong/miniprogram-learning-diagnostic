// 学习修复双指标聚合：验证覆盖率 + 严格修复率。
// 纯只读，不写任何集合。口径定义见
// docs/superpowers/specs/2026-08-09-repair-metrics-and-case-validation-design.md
const SMALL_SAMPLE_BELOW = 5;

function toTime(value) {
  if (!value) return 0;
  const time = new Date(value).getTime();
  return Number.isFinite(time) ? time : 0;
}

function formatBeijingDate(time) {
  return new Date(time + 8 * 3600 * 1000).toISOString().slice(0, 10);
}

// 卡点条目的全部可匹配 id：粗卡点 lpCode + 细卡点 bottleneckId
function entryTargetIds(entry = {}) {
  const ids = new Set();
  if (entry.lpCode) ids.add(entry.lpCode);
  (entry.candidateBottlenecks || []).forEach(candidate => {
    if (candidate && candidate.bottleneckId) ids.add(candidate.bottleneckId);
  });
  return ids;
}

function hits(ids, targetId) {
  return Boolean(targetId) && ids.has(targetId);
}

function hitsAny(ids, targetIds = []) {
  return (targetIds || []).some(targetId => ids.has(targetId));
}

// 已完成任务包的完成时间；未完成返回 0
function packCompletedAt(pack = {}) {
  if (pack.status !== 'completed') return 0;
  const progress = pack.progress || {};
  return Math.max(toTime(progress.completedAt), toTime(pack.updatedAt), toTime(pack.createdAt));
}

// 微验证会话的证据；未完成会话返回 null
function microValidationEvidence(session = {}) {
  if (session.status !== 'completed') return null;
  const total = (session.verdicts || []).length || (session.questions || []).length;
  const correctCount = typeof session.correctCount === 'number'
    ? session.correctCount
    : (session.verdicts || []).filter(v => v === 'correct').length;
  const passed = session.passVerdict === true || (total > 0 && correctCount >= Math.ceil((total * 2) / 3));
  return { passed, time: toTime(session.completedAt) || toTime(session.updatedAt) };
}

function collectEvidence(entry, snapshot) {
  const ids = entryTargetIds(entry);
  let repairCompletedAt = 0;
  let passedAt = toTime(entry.lastPassedAt);
  let failedAt = toTime(entry.lastFailedVerificationAt);
  let hasVerification = (entry.verificationPassCount || 0) > 0
    || (entry.verificationFailCount || 0) > 0
    || toTime(entry.lastVerifiedAt) > 0;

  (snapshot.packs || []).forEach(pack => {
    const matches = hits(ids, pack.targetId) || hits(ids, pack.bottleneckId) || hits(ids, pack.lpCode);
    if (!matches) return;
    const completedAt = packCompletedAt(pack);
    if (completedAt > repairCompletedAt) repairCompletedAt = completedAt;
  });

  (snapshot.interventionSessions || []).forEach(session => {
    if (!hitsAny(ids, session.bottleneckIds)) return;
    const time = toTime(session.createdAt) || toTime(session.updatedAt);
    if (time > repairCompletedAt) repairCompletedAt = time;
  });

  (snapshot.microValidations || []).forEach(session => {
    if (!hits(ids, session.bottleneckId)) return;
    const evidence = microValidationEvidence(session);
    if (!evidence) return;
    hasVerification = true;
    if (evidence.passed) {
      if (evidence.time > passedAt) passedAt = evidence.time;
    } else if (evidence.time > failedAt) {
      failedAt = evidence.time;
    }
  });

  return { repairCompletedAt, passedAt, failedAt, hasVerification };
}

function rate(numerator, denominator) {
  return {
    numerator,
    denominator,
    percent: denominator > 0 ? Math.round((numerator / denominator) * 100) : 0,
    smallSample: denominator < SMALL_SAMPLE_BELOW
  };
}

function rowOf(entry) {
  return { lpCode: entry.lpCode || '', name: entry.lpName || '待确认卡点' };
}

function buildRepairMetricsView(snapshot = {}) {
  const profile = snapshot.profile || {};
  const seen = new Set();
  const universe = [];
  [...(profile.improvedBottlenecks || []), ...(profile.currentBottlenecks || [])].forEach(entry => {
    const key = entry.lpCode || `row-${universe.length}`;
    if (seen.has(key)) return;
    seen.add(key);
    universe.push(entry);
  });

  const buckets = { repaired: [], repairing: [], verifiedNotPassed: [], unverified: [] };
  const events = [];
  let verifiedCount = 0;
  let repairDenominator = 0;
  let repairNumerator = 0;

  universe.forEach(entry => {
    const evidence = collectEvidence(entry, snapshot);
    const passedAt = Math.max(evidence.passedAt, toTime(entry.improvedDate));
    const hasVerification = evidence.hasVerification || passedAt > 0;

    if (passedAt > 0) {
      buckets.repaired.push(rowOf(entry));
      events.push({ time: passedAt, kind: 'passed' });
      if (evidence.failedAt > 0) events.push({ time: evidence.failedAt, kind: 'failed' });
    } else if (evidence.repairCompletedAt > 0) {
      buckets.repairing.push(rowOf(entry));
      if (evidence.failedAt > 0) events.push({ time: evidence.failedAt, kind: 'failed' });
    } else if (hasVerification) {
      buckets.verifiedNotPassed.push(rowOf(entry));
      if (evidence.failedAt > 0) events.push({ time: evidence.failedAt, kind: 'failed' });
    } else {
      buckets.unverified.push(rowOf(entry));
    }

    if (hasVerification) verifiedCount += 1;
    if (evidence.repairCompletedAt > 0) {
      repairDenominator += 1;
      if (passedAt > evidence.repairCompletedAt) repairNumerator += 1;
    }
  });

  events.sort((a, b) => a.time - b.time);
  // timeline 按证据事件累计：一个卡点有多条证据时按事件数累计，不按卡点数
  const timeline = [];
  let cumPassed = 0;
  let cumVerified = 0;
  events.forEach(event => {
    cumVerified += 1;
    if (event.kind === 'passed') cumPassed += 1;
    timeline.push({
      date: formatBeijingDate(event.time),
      passedTotal: cumPassed,
      verifiedTotal: cumVerified
    });
  });

  return {
    empty: universe.length === 0,
    totals: {
      bottlenecks: universe.length,
      verified: verifiedCount,
      repaired: buckets.repaired.length,
      repairing: buckets.repairing.length,
      verifiedNotPassed: buckets.verifiedNotPassed.length,
      unverified: buckets.unverified.length
    },
    coverageRate: rate(verifiedCount, universe.length),
    repairRate: rate(repairNumerator, repairDenominator),
    buckets,
    timeline
  };
}

module.exports = { buildRepairMetricsView };

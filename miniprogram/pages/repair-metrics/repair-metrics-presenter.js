// 学习修复指标页视图预计算：双指标卡、卡点去向四档、时间快照。
// 数据来自 studentData.getRepairMetrics（只读聚合）。
const { sanitizeUserText } = require('../../utils/user-facing-text')

const BUCKET_TITLES = [
  ['repaired', '已修复'],
  ['repairing', '修复中'],
  ['verifiedNotPassed', '已验证未通过'],
  ['unverified', '未验证']
]

const CALIBER_LINES = [
  '验证覆盖率 = 有验证证据的卡点 ÷ 档案中全部卡点',
  '严格修复率 = 修复完成后复测通过的卡点 ÷ 完成过修复动作的卡点',
  '复测证据包括微验证（3-6 题，≥2/3 对算通过）和验证卷作答判定'
]

function cardOf(rateItem = {}) {
  return {
    percent: rateItem.percent || 0,
    text: `${rateItem.percent || 0}%（${rateItem.numerator || 0}/${rateItem.denominator || 0}）`,
    smallSample: rateItem.smallSample === true
  }
}

function safeName(name) {
  const text = sanitizeUserText(String(name || ''))
  return text || '待确认卡点'
}

function buildRepairMetricsPageView(result) {
  const metrics = result && result.metrics
  if (!metrics || metrics.empty) {
    return { empty: true, caliberLines: CALIBER_LINES }
  }
  // rowKey 供 wxml wx:key 使用：lpCode 非空用 lpCode，否则用全页递增序号兜底，避免空键碰撞。
  let rowSeq = 0
  return {
    empty: false,
    coverageCard: cardOf(metrics.coverageRate),
    repairCard: cardOf(metrics.repairRate),
    caliberLines: CALIBER_LINES,
    bucketGroups: BUCKET_TITLES.map(([key, title]) => ({
      key,
      title,
      rows: ((metrics.buckets || {})[key] || []).map(row => {
        rowSeq += 1
        return {
          rowKey: row.lpCode || `row-${rowSeq}`,
          lpCode: row.lpCode,
          name: safeName(row.name)
        }
      })
    })),
    timelineRows: (metrics.timeline || []).map(item =>
      `${item.date} · 累计验证 ${item.verifiedTotal} 个 · 通过 ${item.passedTotal} 个`),
    smallSample: (metrics.coverageRate && metrics.coverageRate.smallSample)
      || (metrics.repairRate && metrics.repairRate.smallSample)
  }
}

module.exports = { buildRepairMetricsPageView }

// 状态构成堆叠条（纯 WXSS 分段条）的宽度计算，唯一来源。
// 输入若干 { key, label, count, tone }，输出带 widthPercent 的分段（合计恰好 100%，末段吃余量）。
// tone 对应 app.wxss 的 .b1-seg-<tone> 色板（B1 语义色）。
function buildStatusSegments(entries = []) {
  const nonZero = (Array.isArray(entries) ? entries : [])
    .map(entry => ({
      key: String((entry && entry.key) || ''),
      label: String((entry && entry.label) || ''),
      count: Math.max(0, Number(entry && entry.count) || 0),
      tone: String((entry && entry.tone) || 'neutral')
    }))
    .filter(entry => entry.count > 0)

  const total = nonZero.reduce((sum, entry) => sum + entry.count, 0)
  if (total <= 0) return []

  let assigned = 0
  return nonZero.map((entry, index) => {
    const isLast = index === nonZero.length - 1
    const widthPercent = isLast
      ? Math.max(0, 100 - assigned)
      : Math.max(1, Math.round((entry.count / total) * 100))
    assigned += widthPercent
    return { ...entry, widthPercent }
  })
}

module.exports = { buildStatusSegments }

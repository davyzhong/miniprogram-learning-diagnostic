#!/usr/bin/env node
// 分析报告导出数据中的 unmatchedNodeIds：AI 产出但无法归并到标准节点目录的
// nodeId 原文，用于评估目录缺口、指导下一轮知识节点扩充。
//
// 用法：
//   node scripts/analyze-unmatched-node-ids.js <reports-export.json>
// 输入格式：reports 集合导出的 JSON 数组（元素为报告文档）。
// 输出：按出现频次排序的未归并 ID 清单 + 受影响报告数。
const fs = require('node:fs');

function collectUnmatched(reports = []) {
  const byRawId = new Map();
  let reportsWithUnmatched = 0;
  let mathReports = 0;

  for (const report of reports) {
    if (!report || report.subject !== 'math') continue;
    mathReports += 1;
    const rawIdsInReport = new Set();
    for (const bottleneck of report.bottlenecks || []) {
      for (const rawId of bottleneck.unmatchedNodeIds || []) {
        if (!rawId) continue;
        const id = String(rawId);
        rawIdsInReport.add(id);
        if (!byRawId.has(id)) byRawId.set(id, { rawId: id, count: 0, reportIds: new Set() });
        byRawId.get(id).count += 1;
        byRawId.get(id).reportIds.add(report._id || report.reportId || '(无ID)');
      }
    }
    if (rawIdsInReport.size > 0) reportsWithUnmatched += 1;
  }

  const items = [...byRawId.values()]
    .map(entry => ({ rawId: entry.rawId, count: entry.count, reportCount: entry.reportIds.size }))
    .sort((a, b) => b.count - a.count || a.rawId.localeCompare(b.rawId));
  return { mathReports, reportsWithUnmatched, items };
}

function formatReport(stats) {
  const lines = [
    `数学报告 ${stats.mathReports} 份，其中 ${stats.reportsWithUnmatched} 份含未归并 nodeId。`,
  ];
  if (stats.items.length === 0) {
    lines.push('没有未归并的 nodeId——标准目录覆盖良好。');
    return lines.join('\n');
  }
  lines.push('未归并 nodeId（按频次排序，候选新节点或目录别名）：');
  for (const item of stats.items) {
    lines.push(`  ${item.rawId}  出现 ${item.count} 次 / ${item.reportCount} 份报告`);
  }
  return lines.join('\n');
}

function main() {
  const file = process.argv[2];
  if (!file) {
    console.error('用法: node scripts/analyze-unmatched-node-ids.js <reports-export.json>');
    process.exit(1);
  }
  const reports = JSON.parse(fs.readFileSync(file, 'utf8'));
  if (!Array.isArray(reports)) {
    console.error('输入必须是报告文档的 JSON 数组');
    process.exit(1);
  }
  console.log(formatReport(collectUnmatched(reports)));
}

if (require.main === module) main();

module.exports = { collectUnmatched, formatReport };

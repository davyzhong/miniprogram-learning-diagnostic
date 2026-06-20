#!/usr/bin/env node
/**
 * E2E 结果聚合报告
 *
 * 把所有 E2E 脚本的结果聚合成一份结构化报告，便于发布前快速判断。
 * 读取 tmp/e2e/<suite>/ 下各 E2E 脚本的输出 JSON，汇总到 tmp/e2e/aggregate/aggregate-report.md
 *
 * 用法：node scripts/e2e-report-aggregator.js
 *       npm run test:e2e:all（聚合会自动在最后跑）
 */

const fs = require('node:fs')
const path = require('node:path')

const projectPath = path.resolve(__dirname, '..')
const tmpRoot = path.join(projectPath, 'tmp')
const outputDir = path.join(tmpRoot, 'e2e', 'aggregate')

// 各 E2E 脚本的输出位置
const SOURCES = [
  {
    name: '全量核心页面回归',
    script: 'devtools-e2e-fullpage',
    output: 'tmp/e2e/core',
    type: 'core',
  },
  {
    name: '数学数据驱动 E2E',
    script: 'devtools-e2e-data-driven',
    output: 'tmp/e2e/math-data',
    type: 'math',
  },
  {
    name: '数学知识地图 E2E',
    script: 'devtools-knowledge-map-e2e',
    output: 'tmp/e2e/math-knowledge-map',
    type: 'math',
  },
  {
    name: '英语 E2E',
    script: 'devtools-english-e2e',
    output: 'tmp/e2e/english',
    type: 'english',
  },
  {
    name: '真实数据冒烟',
    script: 'devtools-real-data-smoke',
    output: 'tmp/e2e/real-data',
    type: 'smoke',
  },
]

function readJsonResult(outputRelPath) {
  if (!outputRelPath) return null
  const dir = path.join(projectPath, outputRelPath)
  if (!fs.existsSync(dir)) return null
  const entries = fs.readdirSync(dir)
  const jsons = [
    'report.json',
    'results.json',
    'data-driven-report.json',
    ...entries.filter(f => /^report-\d+\.json$/.test(f)).sort().reverse(),
    ...entries.filter(f => f.endsWith('.json') && f.includes('report')).sort(),
  ].filter((fileName, index, list) => list.indexOf(fileName) === index && entries.includes(fileName))
  if (jsons.length === 0) return null
  try {
    return JSON.parse(fs.readFileSync(path.join(dir, jsons[0]), 'utf8'))
  } catch {
    return null
  }
}

function summarizeResult(data) {
  if (!data) return { status: 'NO_OUTPUT', detail: '未生成报告（脚本未跑或未输出 JSON）' }
  // 兼容两种报告格式：
  //   1. {passed, failed, total}（数据驱动 E2E 的格式）
  //   2. {summary: {total, passed, failed}}（fullpage 等的格式）
  const s = data.summary || data
  const passed = s.passed || s.pass || 0
  const failed = s.failed || s.fail || 0
  const total = s.total || s.totalTests || (passed + failed)
  const failedItems = (data.results || []).filter(r => r.status === 'FAIL' || r.status === 'FAIL*')
  return {
    status: failed === 0 ? 'PASS' : 'FAIL',
    detail: `${passed}/${total} 通过`,
    failed: failedItems,
  }
}

function main() {
  fs.mkdirSync(outputDir, { recursive: true })

  const lines = []
  lines.push('# E2E 测试聚合报告')
  lines.push('')
  lines.push(`生成时间: ${new Date().toISOString()}`)
  lines.push('')
  lines.push('| 脚本 | 类型 | 状态 | 详情 |')
  lines.push('|------|------|------|------|')

  let totalPass = 0
  let totalFail = 0
  let noOutput = 0

  for (const src of SOURCES) {
    const data = readJsonResult(src.output)
    const summary = summarizeResult(data)

    if (summary.status === 'NO_OUTPUT') {
      noOutput++
      lines.push(`| ${src.name} | ${src.type} | ⬜ 未跑 | ${summary.detail} |`)
    } else if (summary.status === 'PASS') {
      totalPass++
      lines.push(`| ${src.name} | ${src.type} | ✅ 通过 | ${summary.detail} |`)
    } else {
      totalFail++
      lines.push(`| ${src.name} | ${src.type} | ❌ 失败 | ${summary.detail} |`)
      // 列出失败项
      if (summary.failed && summary.failed.length > 0) {
        for (const f of summary.failed.slice(0, 5)) {
          lines.push(`|   └ ${f.name || f.scenario || '未知'} | | | ${f.reason || f.error || ''} |`)
        }
      }
    }
  }

  lines.push('')
  lines.push('## 汇总')
  lines.push('')
  lines.push(`- ✅ 通过的脚本: ${totalPass}`)
  lines.push(`- ❌ 失败的脚本: ${totalFail}`)
  lines.push(`- ⬜ 未跑的脚本: ${noOutput}`)
  lines.push(`- 📋 总脚本数: ${SOURCES.length}`)
  lines.push('')

  if (totalFail > 0) {
    lines.push('> ⚠️ 有失败的 E2E 脚本，发布前请修复。')
  } else if (noOutput === SOURCES.length) {
    lines.push('> ℹ️ 所有 E2E 脚本都未运行。请先跑 `npm run test:e2e:doctor` 确认环境，再逐个跑 E2E 脚本。')
  } else if (noOutput > 0) {
    lines.push(`> ℹ️ 有 ${noOutput} 个脚本未跑，其余通过。`)
  } else {
    lines.push('> ✅ 所有已运行的 E2E 脚本均通过。')
  }

  const reportPath = path.join(outputDir, 'aggregate-report.md')
  fs.writeFileSync(reportPath, lines.join('\n'))

  console.log(lines.join('\n'))
  console.log(`\n报告已写入: ${reportPath}`)

  process.exit(totalFail > 0 ? 1 : 0)
}

main()

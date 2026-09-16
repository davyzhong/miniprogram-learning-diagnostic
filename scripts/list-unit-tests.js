#!/usr/bin/env node
// 默认离线测试清单的唯一来源：tests/*.test.js 全集 − 排除清单。
// package.json 的 test:unit / test:coverage 通过 $(node scripts/list-unit-tests.js) 引用，
// 不再手工维护文件列表（历史上两处硬编码曾漂移，见 2026-07 提交记录）。
const fs = require('node:fs')
const path = require('node:path')

const EXCLUDED = new Set([
  // 真实云 / 真实图片：需 RUN_REAL_CLOUD=1 或真实图片环境，涉及费用与真实数据
  'e2e-real-cloud.test.js',
  'e2e-real-image.test.js',
  // 三个数学管线重载套件（历史全量重分析等长时场景）
  'math-bottleneck-hierarchy.test.js',
  'math-history-reanalysis.test.js',
  'math-learning-map-pipeline.test.js',
])

const dir = path.join(__dirname, '..', 'tests')
const files = fs.readdirSync(dir)
  .filter(f => f.endsWith('.test.js') && !EXCLUDED.has(f))
  .sort()

if (!files.length) {
  console.error('list-unit-tests: no test files found in tests/')
  process.exit(1)
}

console.log(files.map(f => `tests/${f}`).join(' '))

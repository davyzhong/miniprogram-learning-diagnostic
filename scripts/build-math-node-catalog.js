#!/usr/bin/env node
// 从 data/math/knowledge-nodes.seed.json 生成 analyzeBatch 用的知识节点固化目录。
// 用法：node scripts/build-math-node-catalog.js
// 修改 seed 后必须重跑本脚本，tests/analyze-batch-node-catalog.test.js 会校验同步。

const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '..');
const SEED_PATH = path.join(ROOT, 'data/math/knowledge-nodes.seed.json');
const OUTPUT_PATH = path.join(ROOT, 'cloudfunctions/analyzeBatch/knowledge-node-catalog.js');

const seed = JSON.parse(fs.readFileSync(SEED_PATH, 'utf8'));
const nodes = seed.nodes || [];

const lines = nodes.map(node => (
  `  { id: '${node.nodeId}', title: '${node.title}', domain: '${node.domain}' },`
));

const content = `// 由 scripts/build-math-node-catalog.js 自动生成，勿手改。
// 打包安全：云函数独立上传时 data/ 目录不会随函数上传，所以把知识节点目录固化在此 JS 模块里。
// 数据来源：data/math/knowledge-nodes.seed.json（${nodes.length} 个节点）
// 同步原则：修改 knowledge-nodes seed 后重跑生成脚本，并跑 tests/analyze-batch-node-catalog.test.js

/**
 * 标准知识节点列表（用于注入 AI prompt，约束 AI 只使用标准 nodeId）
 */
const MATH_NODE_LIST = [
${lines.join('\n')}
];

/**
 * AI 常见变体 ID → 标准节点 ID 的映射。
 * 初版为空骨架：只收真实观测到的变体，发现时加到此映射即可。
 */
const NODE_VARIANT_ALIASES = {};

module.exports = { MATH_NODE_LIST, NODE_VARIANT_ALIASES };
`;

fs.writeFileSync(OUTPUT_PATH, content);
console.log(`已生成 ${path.relative(ROOT, OUTPUT_PATH)}（${nodes.length} 个节点）`);

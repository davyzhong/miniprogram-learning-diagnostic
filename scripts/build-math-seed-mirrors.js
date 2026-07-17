#!/usr/bin/env node
// 把 data/math 的种子数据生成 JS 镜像（module.exports = <json>），供云函数打包内直接 require。
// 背景：微信开发者工具独立上传函数时 data/ 目录不随包，fs/path 探测相对路径会在云端静默缺失。
// 用法：node scripts/build-math-seed-mirrors.js
// 修改 seed 后必须重跑本脚本，tests/math-seed-mirrors-sync.test.js 会校验同步。

const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '..');
const SEED_DIR = path.join(ROOT, 'data/math');

// 目标目录 → 需要镜像的 seed 列表。
// analyzePhotos 额外镜像 bottleneck-categories（math-bottleneck-hierarchy 依赖它做层级归组）。
const TARGETS = [
  {
    dir: 'cloudfunctions/analyzePhotos/math-seeds',
    seeds: ['knowledge-nodes', 'bottleneck-taxonomy-v2', 'learning-resources', 'bottleneck-categories'],
  },
  {
    dir: 'cloudfunctions/generatePaper/math-seeds',
    seeds: ['knowledge-nodes', 'bottleneck-taxonomy-v2', 'learning-resources'],
  },
];

for (const target of TARGETS) {
  const outDir = path.join(ROOT, target.dir);
  fs.mkdirSync(outDir, { recursive: true });
  for (const seedName of target.seeds) {
    const seedPath = path.join(SEED_DIR, `${seedName}.seed.json`);
    const seed = JSON.parse(fs.readFileSync(seedPath, 'utf8'));
    const content = `// 由 scripts/build-math-seed-mirrors.js 自动生成，勿手改。
// 打包安全：云函数独立上传时 data/ 目录不会随函数上传，所以把 seed 固化为 JS 镜像。
// 数据来源：data/math/${seedName}.seed.json
module.exports = ${JSON.stringify(seed, null, 2)}
`;
    fs.writeFileSync(path.join(outDir, `${seedName}.seed.js`), content);
  }
  console.log(`已生成 ${target.seeds.length} 个镜像到 ${target.dir}`);
}

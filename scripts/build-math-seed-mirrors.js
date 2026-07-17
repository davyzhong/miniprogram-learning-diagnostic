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

// 前端镜像：miniprogram/data/math/*.seed.js 历史上手工维护，容易漂移；
// 统一由本脚本生成，内容与对应 seed JSON 一致（module.exports 前端加载约定）。
const FRONTEND_DESCRIPTIONS = {
  'knowledge-nodes': '小学数学知识节点库（前端版）',
  'bottleneck-taxonomy-v2': '细颗粒度学习卡点库（前端版）',
  'learning-resources': '全网学习资源链接、评价和推荐等级（前端版）',
  'bottleneck-categories': '小学数学学习卡点粗类与卡点家族治理库（前端版）',
};
const FRONTEND_DIR = path.join(ROOT, 'miniprogram/data/math');
for (const [seedName, description] of Object.entries(FRONTEND_DESCRIPTIONS)) {
  const seedPath = path.join(SEED_DIR, `${seedName}.seed.json`);
  const seed = JSON.parse(fs.readFileSync(seedPath, 'utf8'));
  const content = `// 由 scripts/build-math-seed-mirrors.js 自动生成，勿手改。
// ${description}。内容与 data/math/${seedName}.seed.json 保持一致；
// 这里改用 module.exports，符合 miniprogram/data 下 *.seed.js 的前端加载约定。
module.exports = ${JSON.stringify(seed, null, 2)}
`;
  fs.writeFileSync(path.join(FRONTEND_DIR, `${seedName}.seed.js`), content);
}
console.log(`已生成 ${Object.keys(FRONTEND_DESCRIPTIONS).length} 个镜像到 miniprogram/data/math`);

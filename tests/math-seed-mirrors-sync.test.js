// tests/math-seed-mirrors-sync.test.js
// 验证云函数打包内的 math seed JS 镜像与 data/math seed 深度相等（防漂移），
// 以及种子消费方已切换为直接 require 镜像（不再用 fs/path 探测 data/ 目录）。
const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')

const root = path.resolve(__dirname, '..')

function readSeed(seedName) {
  return JSON.parse(fs.readFileSync(path.join(root, 'data/math', `${seedName}.seed.json`), 'utf8'))
}

// 与 scripts/build-math-seed-mirrors.js 的 TARGETS 保持一致。
const MIRROR_TARGETS = [
  {
    dir: 'cloudfunctions/analyzePhotos/math-seeds',
    seeds: ['knowledge-nodes', 'bottleneck-taxonomy-v2', 'learning-resources', 'bottleneck-categories'],
  },
  {
    dir: 'cloudfunctions/generatePaper/math-seeds',
    seeds: ['knowledge-nodes', 'bottleneck-taxonomy-v2', 'learning-resources'],
  },
  {
    dir: 'miniprogram/data/math',
    seeds: ['knowledge-nodes', 'bottleneck-taxonomy-v2', 'learning-resources', 'bottleneck-categories'],
  },
]

test('math seed 镜像与 data/math seed 深度相等', () => {
  for (const target of MIRROR_TARGETS) {
    for (const seedName of target.seeds) {
      const mirrorPath = path.join(root, target.dir, `${seedName}.seed.js`)
      assert.ok(fs.existsSync(mirrorPath),
        `${target.dir}/${seedName}.seed.js 不存在，请运行 node scripts/build-math-seed-mirrors.js`)
      assert.deepEqual(require(mirrorPath), readSeed(seedName),
        `${target.dir}/${seedName}.seed.js 与 seed 不同步，请重跑 node scripts/build-math-seed-mirrors.js`)
    }
  }
})

test('math seed 镜像带自动生成头注释', () => {
  for (const target of MIRROR_TARGETS) {
    for (const seedName of target.seeds) {
      const content = fs.readFileSync(path.join(root, target.dir, `${seedName}.seed.js`), 'utf8')
      assert.match(content, /build-math-seed-mirrors\.js 自动生成，勿手改/,
        `${target.dir}/${seedName}.seed.js 缺少自动生成标记`)
    }
  }
})

test('analyzeBatch 知识节点目录与 knowledge-nodes seed 同步', () => {
  const { MATH_NODE_LIST } = require('../cloudfunctions/analyzeBatch/knowledge-node-catalog')
  const expected = (readSeed('knowledge-nodes').nodes || []).map(node => ({
    id: node.nodeId,
    title: node.title,
    domain: node.domain,
  }))
  assert.deepEqual(MATH_NODE_LIST, expected,
    'knowledge-node-catalog.js 与 seed 不同步，请重跑 node scripts/build-math-node-catalog.js')
})

test('种子消费方直接 require 打包内镜像，不再用 fs/path 探测 data/math', () => {
  const consumers = [
    'cloudfunctions/analyzePhotos/math-learning-map-enricher.js',
    'cloudfunctions/analyzePhotos/math-bottleneck-hierarchy.js',
    'cloudfunctions/generatePaper/index.js',
  ]
  for (const file of consumers) {
    const source = fs.readFileSync(path.join(root, file), 'utf8')
    assert.doesNotMatch(source, /require\(['"]\.\.\/\.\.\/data\//,
      `${file} 不应再直接 require ../../data/（云函数独立上传时 data/ 不随包）`)
    assert.doesNotMatch(source, /resolveData/,
      `${file} 不应再保留 fs/path 探测逻辑`)
  }
})

# 数学知识节点目录进诊断管线 + enricher 实时兜底 — 实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 把 91 个数学知识节点目录接入 analyzeBatch 的 prompt 与结果归一化，让 AI 产出的 nodeIds 100% 收敛到标准节点；同时把启发式 enricher 接入 analyzePhotos 实时管线做兜底，并把 data/math 种子数据统一为云函数打包内 JS 镜像。

**Architecture:** 照搬 BN 细卡点的成熟模式（固化目录 + prompt 注入 + canonicalize 归并）到知识节点。enricher 在 `buildAnalysisArtifacts` 内、报告合并后且 buildProfileSummary 前无条件调用，保证报告与画像写入同一份瓶颈数据。种子镜像由脚本从 seed 生成、提交入库，消费方直接 require，删除 fs/path 探测。

**Tech Stack:** WeChat Cloud Functions (CommonJS), Node.js `node:test`, 现有 seed/固化模块模式。

**设计稿:** `docs/superpowers/specs/2026-07-17-math-node-catalog-and-enricher-fallback-design.md`

---

## File Map

**Create**

- `scripts/build-math-node-catalog.js`: 从 knowledge-nodes seed 生成节点目录固化模块。
- `cloudfunctions/analyzeBatch/knowledge-node-catalog.js`: `MATH_NODE_LIST`（91 节点 {id,title,domain}）+ 空骨架 `NODE_VARIANT_ALIASES`，自动生成勿手改。
- `scripts/build-math-seed-mirrors.js`: 把 math seed 生成 `.js` 镜像到云函数目录。
- `cloudfunctions/analyzePhotos/math-seeds/`: 4 个镜像（knowledge-nodes、bottleneck-taxonomy-v2、learning-resources、bottleneck-categories）。
- `cloudfunctions/generatePaper/math-seeds/`: 3 个镜像（knowledge-nodes、bottleneck-taxonomy-v2、learning-resources）。
- `tests/analyze-batch-node-catalog.test.js`: 目录同步 + canonicalizeNodeId 五层 + nodeIds 归一化/unmatchedNodeIds。
- `tests/math-seed-mirrors-sync.test.js`: 镜像与 seed 深度相等 + catalog 与 seed 同步 + 消费方不再探测 data/。

**Modify**

- `cloudfunctions/analyzeBatch/index.js`: 注入 `mathNodeCatalog`（91 行，仅 math）；`mathLearningMapInstruction` 要求 nodeIds 必须从标准知识节点库选取、禁止自创、无法判断返回空数组。
- `cloudfunctions/analyzeBatch/result-normalizer.js`: 新增 `canonicalizeNodeId`/`canonicalizeNodeIds`；`normalizeBottlenecks` 的 nodeIds 走 canonicalize（去重 cap 6），丢弃值记入 `unmatchedNodeIds`（仅在有丢弃时出现，cap 6）。
- `cloudfunctions/analyzePhotos/analysis-artifacts.js`: 报告合并后对 math 报告调 `enrichMathReport` 兜底（buildProfileSummary 之前）。
- `cloudfunctions/analyzePhotos/math-learning-map-enricher.js`: 种子改为 require `./math-seeds/` 镜像。
- `cloudfunctions/analyzePhotos/math-bottleneck-hierarchy.js`: 同上，删除 fs/path 探测逻辑。
- `cloudfunctions/generatePaper/index.js`: taxonomy 改为 require `./math-seeds/bottleneck-taxonomy-v2.seed.js`，删除失效的 `./math-bottleneck-hierarchy` 探测。
- `tests/analyze-photos-pipeline.test.js`: 扩展兜底补齐/AI 字段保留/非数学不触发三个用例。
- `package.json`: 两个新测试文件登记 `test:unit` 和 `test:coverage`。

### Task 1: 知识节点目录固化模块

**Files:**
- Create: `scripts/build-math-node-catalog.js`
- Create: `cloudfunctions/analyzeBatch/knowledge-node-catalog.js`

- [x] **Step 1: 写生成脚本并从 seed 生成目录**

从 `data/math/knowledge-nodes.seed.json` 生成紧凑数组 `{ id, title, domain }`，文件头注释标注"由 scripts/build-math-node-catalog.js 自动生成，勿手改"，模式对齐 `taxonomy-bn-list.js`；`NODE_VARIANT_ALIASES` 为空骨架。

- [x] **Step 2: 运行脚本并验证产物**

```bash
node scripts/build-math-node-catalog.js
```

验证 91 个节点、四领域分布（数与代数 35、图形与几何 26、综合与实践 23、统计与概率 7）与 seed 一致。

### Task 2: prompt 注入节点目录

**Files:**
- Modify: `cloudfunctions/analyzeBatch/index.js`

- [x] **Step 1: 注入 mathNodeCatalog 段**

紧接 `mathBnCatalog` 之后注入（仅 math）：`- id：title（domain）` 逐行列出 91 节点，标题"标准知识节点库（nodeIds 必须从这里选取）"。

- [x] **Step 2: 更新 mathLearningMapInstruction 文案**

nodeIds 必须从"标准知识节点库"选取，禁止自创新 ID，无法判断时返回空数组。`mathBottleneckJsonFields` 的 4 个示例 nodeId 保持不动（已验证真实存在于 seed）。

### Task 3: nodeId 归一化

**Files:**
- Modify: `cloudfunctions/analyzeBatch/result-normalizer.js`

- [x] **Step 1: 新增 canonicalizeNodeId（五层）**

标准 ID 直返 → `NODE_VARIANT_ALIASES` 映射 → ID 前缀互含（标准 ID 间互不为前缀，加长方向唯一命中；截断方向仅唯一时归并）→ title 双向子串（归一化后 ≥4 字，复用 `normalizeBnTitle`）→ 丢弃返回空串。与 BN 的"保留为新"不同：自由发挥的 nodeId 会污染掌握状态键。

- [x] **Step 2: normalizeBottlenecks 接入**

`nodeIds` 改走 `canonicalizeNodeIds`（去重 cap 6）；丢弃的原始值记入 `unmatchedNodeIds`（仅在有丢弃时出现，cap 6），供 Phase D 回溯真实 AI 输出。

### Task 4: enricher 接实时管线兜底

**Files:**
- Modify: `cloudfunctions/analyzePhotos/analysis-artifacts.js`

- [x] **Step 1: 报告合并后调用 enrichMathReport**

在 `buildAnalysisArtifacts` 内、`mergeBatchResults` + `buildImageFiles` 之后、buildProfileSummary 之前，对 math 报告调用 `enrichMathReport({ subject, ...merged, imageFiles })` 并写回 `merged.bottlenecks`。放在 profileSummary 之前是为了让报告与画像写入同一份补齐数据；enricher 幂等，AI 已给字段时保留既有候选。

### Task 5: 种子分发统一为 JS 镜像

**Files:**
- Create: `scripts/build-math-seed-mirrors.js`
- Create: `cloudfunctions/analyzePhotos/math-seeds/`、`cloudfunctions/generatePaper/math-seeds/` 镜像
- Modify: `cloudfunctions/analyzePhotos/math-learning-map-enricher.js`
- Modify: `cloudfunctions/analyzePhotos/math-bottleneck-hierarchy.js`
- Modify: `cloudfunctions/generatePaper/index.js`

- [x] **Step 1: 写镜像生成脚本并生成镜像**

`module.exports = <json>` 带头注释，镜像提交入库。analyzePhotos 额外镜像 `bottleneck-categories`（math-bottleneck-hierarchy 依赖，设计稿三个 seed 之外的必要补充）。

- [x] **Step 2: 三个消费方改为直接 require 镜像**

enricher 与 hierarchy 改 require `./math-seeds/`，删除 fs/path 探测；generatePaper 改 require `./math-seeds/bottleneck-taxonomy-v2.seed.js`，删除始终失效的 `./math-bottleneck-hierarchy` 探测（该文件不在 generatePaper 包内，require 必抛异常，taxonomyMap 此前实际恒为 null）。

### Task 6: 测试与登记

**Files:**
- Create: `tests/analyze-batch-node-catalog.test.js`
- Create: `tests/math-seed-mirrors-sync.test.js`
- Modify: `tests/analyze-photos-pipeline.test.js`
- Modify: `package.json`

- [x] **Step 1: 节点目录测试**

目录与 seed 同步（91 节点防漂移）、alias 目标合法、canonicalizeNodeId 五层路径、normalizeBottlenecks 的 nodeIds 归一化（去重 cap 6）与 unmatchedNodeIds 记录（仅在有丢弃时出现、cap 6）、归一化后 nodeIds 100% 命中标准目录。

- [x] **Step 2: 镜像同步测试**

7 个镜像与 seed 深度相等；镜像带自动生成头注释；catalog 与 seed 同步；消费方源码不再 require `../../data/`、不再有 `resolveData` 探测。

- [x] **Step 3: 扩展 pipeline 测试**

无字段报告触发兜底补齐（merged 与 profileSummary 一致）；有字段报告保留 AI 给的 nodeIds/candidateBottlenecks/资源/nextAction；非数学学科不触发兜底。

- [x] **Step 4: 登记测试并全量验证**

两个新测试文件登记 `package.json` 的 `test:unit` 与 `test:coverage`；`npm run verify` 全绿；`diagnostic-accuracy-regression.test.js`（41 条黄金集）保持绿。

## 验收断言

- [x] 归一化后瓶颈的 nodeIds 100% 命中 91 节点目录（tests/analyze-batch-node-catalog.test.js 覆盖）
- [x] `npm run verify` 全绿
- [x] 镜像与 seed 深度相等（tests/math-seed-mirrors-sync.test.js 覆盖）

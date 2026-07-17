# 数学知识节点目录进诊断管线 + enricher 实时兜底 — 设计

> 日期：2026-07-17
> 状态：APPROVED（随 V3 总计划批准）
> 上游：会话计划 `V3 数学学习地图推进 — 实施计划` Phase A；`钟青羽数学诊断输出合同v2.md`

## 背景

诊断输出合同 v2 的 `nodeIds` 字段已进实时管线，但 analyzeBatch 的 prompt 只给了 4 个示例 nodeId（`index.js:81`），没有节点目录约束——AI 自由发挥产出的 nodeId 无法作为后续掌握状态（studentNodeMastery）的稳定键。同时 `analyzePhotos/math-learning-map-enricher.js` 的启发式补齐只服务历史回填脚本，实时管线中 AI 缺字段时没有兜底。

对照 BN 细卡点的成熟做法（`taxonomy-bn-list.js` 固化目录 + prompt 注入 + `canonicalizeBottleneckId` 归并），本设计把同一模式照搬到 91 个知识节点。

## 设计决策

### 1. 节点目录固化模块（analyzeBatch）

新建 `cloudfunctions/analyzeBatch/knowledge-node-catalog.js`：

- `MATH_NODE_LIST`：91 个节点的紧凑数组 `{ id, title, domain }`，从 `data/math/knowledge-nodes.seed.json` 生成。
- `NODE_VARIANT_ALIASES`：AI 常见变体 ID → 标准 ID 映射，初版只收真实观测到的变体，可为空骨架。
- 文件头注释标注"由 `scripts/build-math-node-catalog.js` 自动生成，勿手改"，模式对齐 `taxonomy-bn-list.js`。
- 新建生成脚本 `scripts/build-math-node-catalog.js`，测试断言目录与 seed 同步（防漂移）。

### 2. prompt 注入（analyzeBatch/index.js）

- 新增 `mathNodeCatalog` 段：`- id：title（domain）` 逐行列出 91 节点，紧接 `mathBnCatalog` 之后注入（仅 math）。
- 更新 `mathLearningMapInstruction` 文案：nodeIds **必须**从"标准知识节点库"选取，禁止自创新 ID；无法判断时返回空数组。
- `mathBottleneckJsonFields` 的示例保持不变（4 个示例 id 已验证真实存在于 seed）。

### 3. nodeId 归一化（result-normalizer.js）

新增 `canonicalizeNodeId(rawId, title)`，四层匹配：

1. 已是标准 ID → 直接返回；
2. 命中 `NODE_VARIANT_ALIASES` → 映射；
3. ID 前缀互含（rawId 与某标准 id 互为前缀，如 `MATH-NUM-DEC-MUL-POINT-ERROR`）→ 归并；
4. title 双向子串匹配（归一化后 ≥4 字，对齐 `normalizeBnTitle` 做法）→ 归并；
5. 都不命中 → **丢弃**（返回空），与 BN 的"保留为新"策略不同：自由发挥的 nodeId 指向不存在的节点，留着只会污染掌握状态键。

`normalizeBottlenecks` 中 `nodeIds` 改走 canonicalize（去重、cap 6）；被丢弃的原始值记录到新字段 `unmatchedNodeIds`（仅在有丢弃时出现，cap 6），供 Phase D 数据扩充时回溯真实 AI 输出。

### 4. enricher 接实时管线兜底（analyzePhotos）

在报告合并（`pipeline.js mergeBatchResults`）之后、落库之前，对 math 报告调用 `enrichMathReport(report)`。enricher 内部按 `hasLearningMapFields` 逐 bottleneck 跳过已丰富项（幂等，已被 41 条黄金集验证），所以接线无条件调用即可——AI 给了字段时它是 no-op，没给时启发式补齐。

### 5. 种子分发统一为 JS 镜像

现状：`analyzePhotos`（math-bottleneck-hierarchy.js、math-learning-map-enricher.js）和 `generatePaper`（index.js:316）用 fs/path 探测相对路径读 `data/math/*.json`，微信开发者工具独立上传函数时 data/ 不随包，云端静默缺失。

统一为 analyzeBatch 已验证的固化模式：

- 新建 `scripts/build-math-seed-mirrors.js`：把 `knowledge-nodes`、`bottleneck-taxonomy-v2`、`learning-resources` 三个 seed 生成为 `.js` 镜像（`module.exports = <json>`），输出到 `cloudfunctions/analyzePhotos/math-seeds/` 和 `cloudfunctions/generatePaper/math-seeds/`；镜像提交入库。
- 消费方改为直接 `require('./math-seeds/xxx')`，删除 fs/path 探测逻辑。
- 新建 `tests/math-seed-mirrors-sync.test.js`：镜像与 seed 深度相等（防漂移）；开发者改 seed 后跑脚本重新生成。

## 测试与验收

- 新增 `tests/analyze-batch-node-catalog.test.js`：目录与 seed 同步；canonicalizeNodeId 五层路径；normalizeBottlenecks 的 nodeIds 归一化 + unmatchedNodeIds 记录。
- 新增 `tests/math-seed-mirrors-sync.test.js`。
- 扩展 `tests/analyze-photos-pipeline.test.js`：无字段报告触发兜底补齐；有字段报告 no-op。
- 新测试文件登记 `package.json` 的 `test:unit` 和 `test:coverage` 两处。
- `npm run verify` 全绿；`diagnostic-accuracy-regression.test.js`（41 条黄金集）保持绿。
- 验收断言：归一化后瓶颈的 nodeIds 100% 命中 91 节点目录。

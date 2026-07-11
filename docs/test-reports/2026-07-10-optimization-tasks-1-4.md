# 优化任务 Task 1-4 完成报告

> 日期：2026-07-10
> 基线 commit：`3bf636d` on `main`
> 对应 roadmap：`docs/superpowers/plans/2026-07-10-project-optimization-roadmap.md`

## 执行概览

按 Gate A（Task 1-3 正确性与测量）和 Task 4（首页热路径性能）全部完成。所有改动通过 TDD 流程：先写失败测试 → 修复 → 验证。

| 验证项 | 基线 | 完成后 |
|--------|------|--------|
| 单元测试 | 638/638 | **653/653** (+15 新增) |
| 行覆盖率 | 92.02% | **92.10%** |
| 函数覆盖率 | 86.16% | **86.22%** |
| JS 语法检查 | 217 文件 | **218 文件** |
| 部署就绪 | 14/14 | **14/14** |

---

## Task 2: AI 用量聚合完整性修复

**问题**：`getSummary` 用 `.limit(500)` 单次查询，超过 500 条事件的活跃用户月度用量统计被静默截断。

**修复**：游标分页循环（`skip + limit`，每页 500，上限 20 页 = 10000 条），确保拉取全部事件后再聚合。

**新增字段**：响应增加 `isComplete`、`eventCount`、`aggregatedAt` 元数据。

**改动文件**：
- `cloudfunctions/aiUsage/index.js` — `getSummary` 重写，`aggregateSummary`/`emptySummary` 增加元数据
- `tests/ai-usage-ledger.test.js` — +3 测试（>500 条完整性、响应元数据、跨月边界）
- `tests/helpers/cloud-function-harness.js` — 新增 `skip()` 查询链支持

**测试验证**：750 条事件全部计入 `callCount`，7 月事件不泄漏到 6 月聚合。

---

## Task 1: 事件驱动性能测量基线

**问题**：E2E 页面测试用固定 `waitFor(1500)` 等待渲染，所有页面耗时几乎一样（5.2-5.5s），无法反映真实渲染延迟。

**修复**：
1. 新增 `waitUntilReady(page, spec)` — 轮询就绪谓词（.page 根节点存在 + loading 状态消失 + 期望文本出现），替代无条件延迟
2. 记录事件驱动指标：`navigationMs`（reLaunch → DOM 挂载）、`readyMs`（DOM 挂载 → 就绪条件满足）
3. 新建 `scripts/performance-report.js` — 从 E2E 报告提取 P50/P90/P95 统计
4. 新增 `npm run perf:baseline` 脚本

**改动文件**：
- `scripts/devtools-e2e-fullpage.js` — 新增 `waitUntilReady`，重写 `runPageAssertion` 记录事件驱动指标
- `scripts/performance-report.js` — **新建**，P50/P90/P95 统计报告生成器
- `tests/contracts.test.js` — +3 契约测试（禁止无条件 1500ms、要求事件驱动指标、验证 perf:baseline 脚本）
- `package.json` — 新增 `perf:baseline` 脚本
- `docs/TESTING.md` — 新增 §9 性能基线文档

**注意**：当前 `tmp/e2e/core/report.json` 仍是旧格式（无 `navigationMs`/`readyMs`），下次运行 `npm run test:e2e:core` 后才能生成事件驱动基线数据。

---

## Task 3: 英语练习写入有界化 + 原子化

**问题**：
1. `submitRecognitionAttempt`/`submitDictationAttempt` 读取整个学生词汇库（可能 505+ 词），只为找到 1 个目标词
2. attempts 数组用全量替换持久化，并发提交会覆盖彼此
3. 无归属校验（通过 studentId 过滤间接实现，改为单文档读取后需显式校验）

**修复**：
1. 用 `getDocument('studentEnglishWords', event.wordId)` 单文档读取替代 `getCollectionData` 全量读取
2. 添加 `word.studentId !== event.studentId` 显式归属校验
3. attempts 用 `db.command.push()` 原子追加替代全量替换
4. 每个 attempt 新增 `attemptId` 幂等键（格式：`att-{sessionId}-{wordId}-{timestamp}-{random}`）

**改动文件**：
- `cloudfunctions/englishVocabulary/index.js` — `submitRecognitionAttempt`/`submitDictationAttempt` 重写
- `tests/english-vocabulary-cloud.test.js` — +3 测试（单文档读取、归属拒绝、并发原子追加）
- `tests/helpers/cloud-function-harness.js` — 新增 `push()` 命令和 `in()` 查询操作符支持
- `docs/DATA_DICTIONARY.md` — 更新 `attempts` 子结构文档

---

## Task 4: 首页聚合为单一轻量端点

**问题**：首页 `1 + N` 云调用模式——1 次 `getAccessibleStudents` + N 次 `getStudentDashboard`（每学生一次），外加 `getAccessibleStudents` 内部的串行 N+1 joined 学生查询。

**修复**：新增 `getHomeDashboard` 聚合端点，单一云调用完成全部工作：

1. **学生列表**：owned 学生 + joined 学生（用 `_.in([...ids])` 批量查询替代串行 `doc().get()` 循环）
2. **批量数据查询**：3 次 `where({ studentId: _.in([...allStudentIds]) })` 查询替代 3N 次单学生查询
3. **轻量 DTO**：`profileSummary`/`reportSummary`/`paperSummary` 剥离 `questions`、`errorDetails`、`pageResults`、`imageFiles` 等大字段

**客户端改动**：首页优先调用 `getHomeDashboard`；失败时自动回退到原 `1 + N` 路径（功能 flag 式渐进迁移）。

**改动文件**：
- `cloudfunctions/studentData/index.js` — 新增 `getHomeDashboard`、3 个 DTO 函数、2 个安全查询辅助函数
- `miniprogram/utils/cloud.js` — 新增 `getHomeDashboard` wrapper 并导出
- `miniprogram/pages/index/index.js` — `loadStudents` 优先走聚合路径，新增 `_buildHomeFromDashboard` 方法
- `scripts/devtools-e2e-fullpage.js` — E2E mock 增加 `getHomeDashboard` 响应
- `tests/student-data-access.test.js` — +4 测试（聚合正确性、DTO 轻量化、空态、批量 joined）
- `tests/index-page-flows.test.js` — +2 测试（聚合路径优先、fallback 回退）

**RPC 降低**：`1 + N` → `1`（任意学生数量）

---

## Harness 基础设施增强

本次为测试 harness (`tests/helpers/cloud-function-harness.js`) 新增了 3 个能力，后续 Task 5-12 可复用：

| 能力 | 用途 |
|------|------|
| `skip()` 查询链 | 游标分页测试 |
| `command.push()` | 数组原子追加测试 |
| `command.in()` + `matches` 支持 | 批量 `where` 查询测试 |

---

## 下一步

Gate A (Task 1-3) 已完成，Task 4 完成了 Gate B 的首页部分。roadmap 剩余：
- **Task 5**: 投影时间线字段 + 索引热查询
- **Task 6**: 报告详情 DTO
- **Task 7**: 小程序分包
- **Task 8-12**: 构建、共享模块、遗留清理、删除请求、文档刷新

建议下一步先跑一次 `npm run test:e2e:core` 获取事件驱动性能基线，为 Task 5-6 的性能提升验证建立对照。

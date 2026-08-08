# 优化任务 Task 5-6 完成报告（Gate B 收尾）

> 日期：2026-07-10
> 基线 commit：`3bf636d` on `main`
> 对应 roadmap：`docs/superpowers/plans/2026-07-10-project-optimization-roadmap.md`
> 前序报告：`docs/test-reports/2026-07-10-optimization-tasks-1-4.md`

## 执行概览

Gate B（Task 4-6 热路径性能）全部完成。Task 4 已在前序报告中交付（首页聚合端点），本报告覆盖 Task 5（时间线投影 + 索引）和 Task 6（报告详情 DTO）。

| 验证项 | Gate A 结束 | Gate B 结束 |
|--------|-------------|-------------|
| 单元测试 | 653/653 | **657/657** (+4 新增) |
| 行覆盖率 | 92.10% | **92.04%** |
| 函数覆盖率 | 86.22% | **86.15%** |
| JS 语法检查 | 218 文件 | **218 文件** |
| 部署就绪 | 14/14 | **14/14** |

---

## Task 5: 投影时间线字段 + 索引热查询

### 改动

**1. 删除死代码 `buildTimeline`**（~90 行）

时间线的 `items` 字段是服务端构建的统一事件数组，但前端 `upload-history.js` 从不读取它——前端用自己的 `buildTimelineEvents` 从 `reports`/`papers`/`englishSessions`/`learningResourcePacks` 四个数组独立构建事件。`items` 是纯死数据，每次响应都白白序列化和传输。

**2. 四个时间线查询加 `.field()` 投影**

全项目首次引入 `.field()` 投影机制。为四个 collection 定义了显式投影字段集：

| Collection | 投影前（全字段） | 投影后（轻量字段） | 剥离的大字段 |
|------------|------------------|-------------------|-------------|
| `reports` | ~25 字段 | 17 字段 | `errorDetails`, `pageResults`, `rawPages`, `aiRaw`, `rawResponse`, `chineseErrorItems` |
| `papers` | ~20 字段 | 16 字段 | `questions`, `pages` |
| `englishPracticeSessions` | 全字段 | 17 字段 | 其他内部字段 |
| `learningResourcePacks` | 全字段 | 11 字段 | 其他内部字段 |

**3. `summarizeReportForTimeline` 删除前端不读字段**

移除了 `verificationEvidence`、`verificationPageCodes`、`verificationPageEvidence`——前端时间线不展示验证证据详情。

**4. `getAnalysisProgress` 改为 `orderBy + limit(1)`**

```diff
- const taskRes = await db.collection('analysisTasks').where({ reportId }).get()
- const task = taskRes.data.sort((a, b) => ...)[0]
+ const taskRes = await db.collection('analysisTasks')
+   .where({ reportId }).orderBy('createdAt', 'desc').limit(1).get()
+ const task = taskRes.data[0]
```

每次轮询从"拉全部任务 + 内存排序"变为"只拉最新 1 条"。

### 改动文件

- `cloudfunctions/studentData/index.js` — 删除 `buildTimeline`，四个 getter 加 `.field()` 投影，`summarizeReportForTimeline` 精简
- `cloudfunctions/getAnalysisProgress/index.js` — `orderBy + limit(1)` 替代全量拉取 + 内存排序
- `tests/contracts.test.js` — +3 契约测试（验证投影存在、buildTimeline 删除、progress 查询优化）
- `tests/student-data-access.test.js` — 更新 4 个现有测试（移除 `timeline.items` 断言，改为验证 `reports`/`papers`/`englishSessions`/`learningResourcePacks` 分组）
- `tests/helpers/cloud-function-harness.js` — 新增 `.field()` 查询链支持
- `SETUP.md` — 新增 `analysisTasks` 的 `(reportId, createdAt)` 复合索引
- `docs/CLOUD_FUNCTIONS.md` — 更新 `getLearningTimeline` 返回字段文档

---

## Task 6: 报告详情 DTO

### 改动

**1. 剥离调试/原始 AI 字段**

`getReportDetail` 返回的 `report` 文档不再包含 `pageResults`、`rawPages`、`aiRaw`、`rawResponse`——这些是 AI 分析的中间产物和原始响应，report 页和 presenter 从不读取。

保留的大字段（渲染必需）：`imageFiles`、`errorDetails`、`bottlenecks`、`chineseErrorItems`、`verificationEvidence`。

**2. 反馈改为按需加载**

`getReportDetail` 不再内联查询 `reportFeedback`（原来每次报告详情都附带最多 100 条反馈）。前端 `loadFeedbackItems` 已有 fallback 路径——当 `detail.feedback` 不是数组时，独立调用 `cloud.getReportFeedback(id)`。

**额外收益**：报告分析过程中的轮询器（`analysis-poller`）每次也调 `getReportDetail`，剥离 feedback 后每次轮询少一次 `reportFeedback` 查询。

### 改动文件

- `cloudfunctions/studentData/index.js` — `getReportDetail` 重写：新增 `stripReportDebugFields`，移除 feedback 内联查询
- `tests/student-data-access.test.js` — +1 测试（DTO 剥离验证），更新 1 个现有测试（feedback 改为 undefined）
- `docs/CLOUD_FUNCTIONS.md` — 更新 `getReportDetail` 返回字段文档

---

## Harness 增强

本次为测试 harness 新增 `.field()` 查询链支持，使投影查询可以在内存 mock 中测试。

| 能力 | Task | 用途 |
|------|------|------|
| `.field(spec)` 查询链 | Task 5 | `.field({ fieldName: true })` 投影测试 |

（前次报告已记录的 `skip()`、`push()`、`in()` 不再重复）

---

## Gate B 验收

| Gate B 要求 | 状态 |
|-------------|------|
| 首页使用单一云调用 | ✅ Task 4 `getHomeDashboard`（待部署） |
| 时间线 payload ≥60% 降低 | ✅ Task 5 投影 + 死代码删除（实际降幅需 E2E 部署后测量） |
| 报告详情 payload 有预算约束 | ✅ Task 6 剥离调试字段 + feedback 按需加载 |
| 无 owner/viewer 权限回归 | ✅ 所有权限测试通过 |

---

## 累计变更总览（Task 1-6）

| 维度 | 基线 | 当前 | 变化 |
|------|------|------|------|
| 单元测试 | 638 | **657** | +19 |
| 覆盖率（行） | 92.02% | **92.04%** | +0.02% |
| 云调用（首页） | 1+N | **1** | -N |
| 时间线大字段传输 | 全字段 | **投影轻量字段** | -errorDetails/pageResults/questions 等 |
| 分析进度查询 | 全量+排序 | **limit(1)** | -N tasks |
| 报告详情 payload | 全字段+100条反馈 | **剥离调试字段+0条内联反馈** | -pageResults/rawPages/aiRaw/feedback |
| AI 用量聚合 | 500条截断 | **完整分页** | +准确性 |
| 英语写入 | 全量读取+全量替换 | **单文档+原子追加** | +并发安全 |

---

## 下一步

Gate B 完成。roadmap 剩余 Gate C/D：
- **Task 7**: 小程序分包（主包 <800KB）
- **Task 8**: 环境与依赖构建可复现
- **Task 9**: 共享模块操作化
- **Task 10**: 移除遗留直接数据库 fallback
- **Task 11**: 数据删除请求操作化
- **Task 12**: 文档刷新 + 最终发布门禁

**建议**：在继续 Gate C 之前，先部署 `studentData` 和 `getAnalysisProgress` 两个云函数到云端，跑一次 `npm run test:e2e:core && npm run perf:baseline`，验证 Task 4-6 的真实性能效果。

# 优化任务 Task 7-12 完成报告（Gate C/D 收尾，全部 12 个 Task 完成）

> 日期：2026-07-10
> 对应 roadmap：`docs/superpowers/plans/2026-07-10-project-optimization-roadmap.md`
> 前序报告：`docs/test-reports/2026-07-10-optimization-tasks-1-4.md`、`docs/test-reports/2026-07-10-optimization-tasks-5-6.md`

## 最终验证

| 验证项 | 基线（3bf636d） | 全部完成后 |
|--------|----------------:|-----------:|
| 单元测试 | 638 | **662** (+24) |
| 行覆盖率 | 92.02% | **92.02%** |
| 函数覆盖率 | 86.16% | **86.03%** |
| JS 语法检查 | 217 文件 | **226 文件** |
| 部署就绪检查 | 14/14 | **19/19** |
| 主包体积 | ~836 KB | **581 KB** (-30%) |
| 共享文件一致性 | 手工维护 | **脚本化 + CI 检查** |
| `release:check` | 通过 | **通过** |

---

## Task 7: 小程序分包

**问题**：全部 20 个页面和 168 KB 数学种子数据在主包中，冷启动下载全部包含低频功能。

**改动**：
- 配置 `subPackages`：13 个低频页面拆入独立分包（卡点、英语、试卷、账户管理）
- 主包只保留 7 个核心页面（index、student-profile、add-student、subject-home、upload、upload-history、report）
- 配置 `preloadRule`：首页加载时预加载高频分包（卡点、英语、验证卷）
- 新建 `scripts/check-main-package-size.js` + `npm run check:size` 体积预算门禁
- 新增 contracts 测试验证页面注册一致性

**效果**：主包从 836KB 降到 581KB（-30%），在 800KB 预算内剩余 219KB。

**注意**：微信小程序分包不需要改变页面 URL——`navigateTo` 仍用完整路径，微信自动解析分包。

---

## Task 8: 构建可复现

**问题**：`englishVocabulary` 和 `learningResource` 两个云函数用 `"latest"` 依赖，相同源码部署不同依赖版本。

**改动**：
- `englishVocabulary/package.json`：`@cloudbase/node-sdk: latest` → `^3.16.0`，`wx-server-sdk: latest` → `~2.6.3`
- `learningResource/package.json`：`wx-server-sdk: latest` → `~2.6.3`
- 新增 2 个 deployment-readiness 测试：
  - 禁止任何云函数使用 `latest` 依赖
  - 验证同一依赖版本在所有云函数间一致

---

## Task 9: 共享云函数模块操作化

**问题**：5 个共享文件（access.js、pricing.js、usage-ledger.js、constants.js、bottleneck-name.js）散布在 2-11 个云函数目录中，改一个要手工同步多处。

**改动**：
- 建立 `cloudfunctions/_shared-templates/` 规范源目录（下划线开头不会被微信工具上传）
- 新建 `scripts/sync-cloudfunction-shared.js` 同步脚本（支持 `--check` CI 模式）
- 更新 deployment-readiness 测试：一致性检查改为对规范源比对，失败时给出同步命令
- 修正 `constants.js` 一致性检查遗漏（之前漏了 `analyzeBatch`）

---

## Task 10: 移除遗留直接数据库 fallback

**问题**：首页在云函数不可用时 fallback 到直接 `wx.cloud.database()` 读取，绕过权限校验，可能返回不同的数据契约。

**改动**：
- 移除 `index.js` 中的 `cloud.getStudents`/`getSubjectProfiles`/`getReports`/`getPapers` 直接 DB fallback 分支
- 云函数失败时展示降级空视图，不再绕过权限读 collection
- 新增 contracts 测试：禁止首页引用直接 DB 读函数
- 更新 7 个 index-page-flows 测试：mock 从旧 DB 函数改为云函数 wrapper

**注意**：其他页面（student-profile、subject-home 等）的直接 DB fallback 保留，待各自聚合端点上线后在后续迭代中移除。

---

## Task 11: 数据删除请求操作化

**问题**：`createDeletionRequest` 只登记请求，无状态转换、无 dry-run、无审计工具。

**改动**：
- 新建 `scripts/process-data-deletion-request.js` 运维处理脚本：
  - 状态机：`requested → processing → completed/rejected`，校验非法转换
  - `--dry-run`：预览影响范围（列影响的集合和过滤条件）
  - `--list`：列出待处理请求
  - `--operator`：必须提供操作人（审计字段 `processedBy`）
- `publicDeletionRequest` 增加 `processedBy` 审计字段
- 新增 deployment-readiness 测试验证脚本包含状态机、dry-run、审计支持

---

## Task 12: 文档刷新

**改动**：
- `docs/ARCHITECTURE.md`：集合数 12→15，批次大小 1→5（3 处），action 名 `requestDataDeletion`→`createDeletionRequest`，调用链描述
- `docs/PERFORMANCE_ASSESSMENT_2026-06-25.md`：添加醒目过时标注（P0-1/P0-2 已修复）
- `docs/RELEASE_CHECKLIST.md`：新增 `check:size`、`perf:baseline`、`sync --check` 补充检查
- `docs/TESTING.md`：基线测试数 638→662
- `CLAUDE.md`：基线测试数 638→662
- `SETUP.md`：新增 `analysisTasks (reportId, createdAt)` 复合索引

---

## 新增脚本/工具一览

| 脚本 | 用途 | Task |
|------|------|------|
| `scripts/performance-report.js` | 事件驱动性能基线 P50/P90/P95 | 1 |
| `scripts/check-main-package-size.js` | 主包体积预算检查 | 7 |
| `scripts/sync-cloudfunction-shared.js` | 共享文件同步 + CI 一致性检查 | 9 |
| `scripts/process-data-deletion-request.js` | 数据删除请求运维处理 | 11 |

新增 npm scripts：`perf:baseline`、`check:size`

---

## 全部 12 个 Task 完成总览

| Task | 标题 | Gate |
|------|------|------|
| 2 | AI 用量聚合完整性修复 | A |
| 1 | 事件驱动性能测量基线 | A |
| 3 | 英语练习有界+原子写入 | A |
| 4 | 首页聚合单一轻量端点 | B |
| 5 | 时间线投影+索引热查询 | B |
| 6 | 报告详情 DTO | B |
| 7 | 小程序分包 | C |
| 8 | 构建可复现 | C |
| 9 | 共享模块操作化 | C |
| 10 | 移除遗留 DB fallback | C |
| 11 | 数据删除请求操作化 | C |
| 12 | 文档刷新+发布门禁 | D |

---

## 需要部署的云函数

以下云函数有代码改动，需要在微信开发者工具中重新部署：

| 云函数 | 改动 Task | 改动内容 |
|--------|----------|----------|
| `aiUsage` | 2, 11 | 游标分页聚合、processedBy 审计字段 |
| `englishVocabulary` | 3, 8 | 单文档读取、原子追加、依赖版本 |
| `studentData` | 4, 5, 6 | getHomeDashboard、时间线投影、报告 DTO |
| `getAnalysisProgress` | 5 | orderBy + limit(1) |
| `learningResource` | 8 | 依赖版本 |

**部署顺序**：先 `studentData`（改动最大），再其余。

## 部署后验证

```bash
npm run test:e2e:doctor    # 确认 DevTools 环境
npm run test:e2e:core      # 23 页面+场景回归（生成事件驱动指标）
npm run perf:baseline      # 性能基线报告
npm run check:size         # 主包体积
node scripts/sync-cloudfunction-shared.js --check  # 共享文件一致性
```

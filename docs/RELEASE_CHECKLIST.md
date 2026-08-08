# 发布与回滚清单

> 更新日期：2026-08-01
> 目标：每次发布都同步代码、云函数、文档、测试和真实数据验收，避免只在本地通过。

## 2026-08-01 当前收口状态

| 项目 | 状态 | 证据 |
| --- | --- | --- |
| 本周期云函数部署 | ✅ | 项目负责人确认已完成部署 |
| 真机主流程验收 | ✅ | 项目负责人确认 Android / iPhone 主流程无重大问题 |
| DevTools E2E | ✅ | 核心 23/23、数学 4/4 + 10/10、语文 3/3、英语 7/7、家庭密度与上传历史布局通过 |
| 用户导览截图 | ✅ | 14 张匿名 mock 截图重新生成并抽查 |
| 离线质量门禁 | ✅ | 1089 项测试、342 个 JS 文件、809 KB / 1200 KB 主包 |
| 订阅消息 | ⏸ | 尚未实现；不属于本轮验收通过项，后续单独设计 |
| 学习资源扩展 | ⏸ | 本轮不展开，待发布收口后单独设计 |

详细记录见 [`archive/test-reports/2026-08-01-release-closure.md`](archive/test-reports/2026-08-01-release-closure.md)。

## 1. 发布前冻结范围

发布前先记录本次变更范围：

| 项目 | 记录 |
| --- | --- |
| 发布分支 | `main` |
| 发布 commit |  |
| 本次改动模块 |  |
| 需要部署的云函数 |  |
| 需要真实数据烟测的页面 |  |
| 是否包含数据结构变更 | 是 / 否 |

如果改动涉及 `cloudfunctions/*`，必须在表格里写清楚需要部署的云函数。只改小程序页面、文档或本地脚本时，也要明确写“无云函数变更”。

## 2. 本地发布门禁

在项目根目录依次执行：

```bash
npm run release:check
git diff --check
/Applications/wechatwebdevtools.app/Contents/MacOS/cli preview --project "/Users/qiming/Downloads/GoogleDrive/AI Learning/miniprogram-learning-diagnostic" --qr-output terminal --lang zh
```

如果本次包含云函数或数据库查询变更，先在云控制台确认 `database/indexes.json` 中的索引已生效，再执行：

```bash
CLOUDBASE_INDEXES_VERIFIED=1 npm run predeploy:check
```

`release:check` 当前等价于：

```bash
npm run check:deployment && npm run verify && npm run test:coverage
```

补充检查（手动执行）：

```bash
npm run check:size        # 主包体积预算（<1200KB，2026-07-18 由 800KB 上调）
npm run perf:baseline     # 事件驱动性能基线（需先跑 test:e2e:core）
node scripts/sync-cloudfunction-shared.js --check  # 共享文件一致性
```

通过标准：

- 自动化测试全部通过。
- JS 静态检查通过。
- 覆盖率门禁通过。
- 云函数部署清单检查通过（含依赖版本一致性、共享文件一致性）。
- 主包体积在预算内（<1200KB；微信平台硬限制 2MB）。
- `git diff --check` 无空白错误。
- 微信开发者工具 CLI `preview` 成功。

## 3. 云函数部署检查

当前必须维护部署状态的云函数：

| 云函数 | 什么时候需要部署 |
| --- | --- |
| `studentAccess` | 家长成员、邀请、权限逻辑变化 |
| `studentData` | 首页、学科、报告、试卷、学习记录聚合逻辑变化 |
| `reportFeedback` | 家长反馈数据结构或权限逻辑变化 |
| `englishVocabulary` | 英语词库、20 词听写、AI 判定或掌握度规则变化 |
| `learningResource` | 学习卡点任务包生成、缓存、状态或 AI 用量写入变化 |
| `microValidation` | 微验证题目生成、会话提交、节点掌握事件或并发保护变化 |
| `aiUsage` | 内测授权、AI 用量账本、删除请求或成本聚合变化 |
| `uploadAndAnalyze` | 上传、报告创建、验证卷作答入口变化 |
| `analyzePhotos` | 诊断合并、验证证据、报告质量、学习卡点更新变化 |
| `analyzeBatch` | AI prompt、图片识别、字段归一要求变化 |
| `generatePaper` | 试卷生成、PDF、验证题结构变化 |
| `regenerateVerificationPaper` | 验证卷续跑、补题、最终 PDF 生成变化 |
| `generateReportPDF` | 诊断报告 PDF 内容变化 |
| `getAnalysisProgress` | 分析进度轮询或 timeout 状态变化 |
| `reanalyzeMathHistory` | 数学历史报告回填、节点目录或学习地图迁移变化 |

部署后至少执行一次真实数据烟测：

```bash
REAL_DATA_STUDENT_ID=student-id REAL_DATA_STUDENT_NAME=钟青羽 npm run test:e2e:real-data
```

体验版内测或 AI 用量账本变更后，额外执行：

```bash
npm run test:e2e:doctor
npm run test:e2e:ai-usage
```

## 4. 发布后验收

发布后至少检查：

1. 首页能进入孩子学习档案。
2. 学习档案能展示综合摘要、学习记录、下一步建议。
3. 最新诊断报告能打开，报告内容不缺失。
4. 学习卡点中心能展示可读名称和状态。
5. 验证试卷能生成、下载、上传作答反馈。
6. 学习记录能看到诊断报告、验证试卷、验证反馈和照片证据。
7. 英语工作台无词库时能导入钟青羽 PEP 个人词库；导入后能进入“开始 20 词听写”，并能看到个人词库统计和高频错词。
8. 如果本次改动涉及指标脚本，使用脱敏 JSON 跑一次 `npm run metrics:student`。
9. AI 用量页可从首页进入，能展示本月汇总/空态和“内测成本估算，不代表应付款项”提示。
10. 未同意内测授权的账号不能通过上传页或直接调用 `uploadAndAnalyze` 创建真实报告。

## 5. 回滚流程

### 5.1 客户端回滚

1. 找到上一个稳定 commit 或已发布版本。
2. 使用 GitHub 或本地 Git 创建回滚提交，不直接改历史。
3. 重新执行发布门禁：

```bash
npm run release:check
git diff --check
/Applications/wechatwebdevtools.app/Contents/MacOS/cli preview --project "/Users/qiming/Downloads/GoogleDrive/AI Learning/miniprogram-learning-diagnostic" --qr-output terminal --lang zh
```

### 5.2 云函数回滚

1. 确认本次发布部署过哪些云函数。
2. 将对应云函数目录恢复到上一个稳定 commit。
3. 只重新部署受影响云函数。
4. 用真实数据烟测确认首页、报告、学习记录和验证试卷链路恢复。

### 5.3 数据回滚

当前 MVP 避免破坏性数据迁移。若出现错误数据：

- 优先用 `isArchived=true` 归档中断或无效记录。
- 不直接删除已完成报告、试卷、验证反馈和照片证据。
- 如果涉及家长反馈或学习卡点误判，保留原报告，通过反馈记录和后续诊断修正。

## 6. 发布记录模板

```markdown
## YYYY-MM-DD Release

- Commit:
- 变更摘要:
- 部署云函数:
- 本地门禁:
  - npm run release:check:
  - git diff --check:
  - DevTools CLI preview:
- 真实数据烟测:
- 已知风险:
- 回滚点:
```

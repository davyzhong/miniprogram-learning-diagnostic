# 学习卡点诊断小程序测试矩阵

> 更新日期：2026-07-17
> 范围：当前小程序 MVP + 数学学习地图升级 + 语文具体错项复习 + 英语词库闭环
> 当前单元自动化基线：`npm test` / `npm run test:unit` 共 916 个用例通过

## 1. 验证命令

```bash
npm run test:unit           # 单元自动化测试
npm run check               # JS 语法检查
npm run verify              # test:unit + check
npm run test:coverage       # 覆盖率
npm run test:e2e:doctor     # CLI E2E 环境检查
npm run test:e2e:math       # 数学页面 E2E，当前最完整
npm run test:e2e:chinese    # 语文轻量页面 E2E
npm run test:e2e:english    # 英语页面 E2E
npm run test:e2e:ai-usage   # AI 用量与内测授权专项 E2E
```

## 2. 核心功能测试矩阵

| 功能风险 | 单元自动化覆盖 | CLI E2E 覆盖 | 当前结论 |
|---|---|---|---|
| 添加学生、学科档案、首页分流 | `index-presenter.test.js`、`index-page-flows.test.js`、`student-profile-page-flows.test.js`、`student-access.test.js` | `test:e2e:core` | 已覆盖 |
| 多家长权限和家庭成员 | `student-access.test.js`、`student-data-access.test.js`、`parent-management-page-flows.test.js` | `test:devtools-parent-timeline` | 已覆盖 |
| 上传照片、报告创建、分析任务启动 | `cloud-functions.test.js`、`analyze-photos-pipeline.test.js`、`poller.test.js`、`upload-page-flows.test.js` | 真实图片需 `test:e2e:real-image` | 本地链路已覆盖（含 3 路并发上传、HEIF 转换瘦身、文件名轻量去重），真机拍照需人工验收 |
| 分批 AI 分析、OCR 摘要、重复照片 | `analyze-batch-result.test.js`、`analyze-photos-pipeline.test.js`、`cloud-functions.test.js` | 真实图片需 `test:e2e:real-image` | 已覆盖 |
| 诊断报告展示和报告质量 | `report-presenter.test.js`、`report-quality.test.js`、`report-page-flows.test.js` | `test:e2e:core`、`test:e2e:math` | 已覆盖；含轻量进度轮询（进行中只查 getAnalysisProgress）与超时后 operation:completed 自动刷新回归 |
| 数学细颗粒度学习卡点 | `bottleneck-view.test.js`、`bottleneck-hierarchy-regression.test.js`、`math-bottleneck-hierarchy.test.js` | `test:e2e:math` | 已覆盖 |
| 数学知识地图和学习资源 | `knowledge-map-*.test.js`、`learning-resource-*.test.js`、`learning-resource-cloud.test.js`、`math-learning-map-*.test.js`、`bottleneck-page-flows.test.js`、`generate-verification-page-flows.test.js` | `test:e2e:math` | 已覆盖；含细 `targetId` 缓存回归 |
| 验证卷自动触发、短任务续跑、分页、PDF、失败状态 | `verification-pack.test.js`、`generate-paper-pdf.test.js`、`auto-verification.test.js`、`report-paper-feedback-loop.test.js`、`cloud-functions.test.js`、`learning-records.test.js`、`paper-page-flows.test.js`、`report-page-flows.test.js` | `test:e2e:math` 覆盖页面入口 | 已覆盖；含覆盖卡点层级展示回归，真实打印需人工验收 |
| 验证反馈、页面编号、证据回传 | `verification-evidence.test.js`、`report-paper-feedback-loop.test.js`、`analyze-batch-result.test.js` | 后续补数学作答页完整 E2E | 单元层已覆盖 |
| 语文具体错项复习 | `chinese-review-targets.test.js`、`profile-summary.test.js`、`subject-home-presenter.test.js` | `test:e2e:chinese` | 轻量页面链路已建，完整作答回传待扩展 |
| 英语个人词库、认词练习、纸面听写、错词本 | `english-vocabulary.test.js`、`english-vocabulary-cloud.test.js`、`english-devtools-cases.test.js` | `test:e2e:english` 覆盖工作台、自动导入、认词、听写、学习记录、错词本、空态 | 已覆盖 |
| 学习记录和证据时间线 | `learning-records.test.js`、`student-data-access.test.js`、`upload-history-page-flows.test.js` | `test:e2e:core`、`test:e2e:english` | 已覆盖 |
| 数据归属、参数白名单、无堆栈返回 | `contracts.test.js`、`student-access.test.js`、`student-data-access.test.js` | 第二微信账号需人工验收 | 已覆盖主要入口 |
| E2E 命令和输出目录契约 | `contracts.test.js` | `scripts/e2e-report-aggregator.js` 聚合 | 已覆盖 |
| AI 用量账本、成本估算、内测授权、删除请求 | `ai-usage-ledger.test.js`、`ai-usage-presenter.test.js`、`cloud-functions.test.js`、`learning-resource-cloud.test.js`、`index-page-flows.test.js` | `test:e2e:ai-usage` 覆盖账单页、首页入口、上传授权和 aiUsage 云函数结构 | 已覆盖；含三态记账、真实/估算优先级、北京时间月份聚合、服务端授权门禁、账单视图模型 |
| B1 设计系统、emoji 白名单、可视化接线（热力格 / 三色堆叠条 / 通过率条 / 掌握度条 / 词库构成 / 趋势文案 / learning-progress 入口） | `bplus-design-system.test.js`、`ui-symbols.test.js`、`emoji-candidates.test.js`、`batch3-visualization-wiring.test.js` | DevTools 360/390px 截图人工核对 | 已覆盖；C01–C06 已验证 emoji 为白名单唯一来源，C09/C14 等高风险字形仍拦截，页面字号下限 20rpx |

## 3. 人工验收清单

以下场景无法完全由本地替身证明，部署后仍需人工验收：

1. 真机添加学生，选择数学，拍摄 1 张和 20 张照片并完成上传。
2. 使用真实手写、黑/蓝/红笔迹试卷，核对 OCR、错题、卡点和逐页摘要。
3. 分析中主动关闭小程序，再次进入后确认当前报告和进度可恢复。
4. 上传同名不同内容、不同名相同内容、全部重复内容三组照片。
5. 生成学习任务包，检查“学一下”入口、任务包内容、完成学习和学习记录回写；同一粗卡点下不同细卡点分别点击“学一下”时，任务包标题和内容必须对应各自细卡点。
6. 生成验证任务包和默认诊断卷，检查中文字体、A4 分页、页面编号、答题空间及打印效果。
7. 分页上传验证卷答案，核对只有已上传页面中的目标卡点会更新证据，未上传页面仍显示待回传。
8. 用第二个微信账号验证数据库安全规则和云函数归属校验。

## 4. 尚未完成的测试能力

| 能力 | 当前状态 | 后续方向 |
|---|---|---|
| 语文完整 CLI E2E | 已有轻量页面链路 | 补“具体错项 → 验证题 → 作答上传 → 状态更新” |
| 数学验证卷作答上传 CLI E2E | 单元层覆盖，页面入口覆盖 | 补真实页面编号上传回传流程 |
| 视觉回归 | 暂未接入 | 可基于 `tmp/e2e/*/*.png` 做截图 diff |
| 真机自动化 | 暂未接入 | 需要评估微信开发者工具 remote 能力 |

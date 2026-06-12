# 学习卡点诊断小程序测试矩阵

> 更新日期：2026-06-12
> 范围：`PRD.md`、`PROJECT_PLAN.md` 中的 MVP P0 功能
> 自动化结果：`npm test` → 128/128 通过；`npm run check` → 50 个 JS 文件语法正确

## 1. 自动化验证命令

```bash
npm run verify          # npm test && npm run check
npm run test:coverage   # 常规测试覆盖率
npm run test:e2e-real-image # 真实图片 E2E，发布前单独运行
```

自动化测试使用 Node.js 内置测试运行器（`node:test`），执行真实页面控制器、数据访问层和云函数主流程；微信 API、数据库、CloudBase AI 和 PDF 引擎在测试中使用可控替身。

## 2. P0 功能追踪

| 设计功能 | 自动化覆盖 | 当前结论 |
|---|---|---|
| 添加学生并创建数/语/英档案 | `data-layer.test.js`、`page-flows.test.js` | 已覆盖 |
| 学生列表、学科选择和学科隔离 | `page-flows.test.js` | 已覆盖 |
| 最多 20 张照片上传、文件元数据保存 | `cloud-functions.test.js`、`page-flows.test.js` | 核心规则已覆盖；相机和云存储需真机验证 |
| 同名照片软提示、OCR 摘要去重、学习记录照片查看 | `photo-dedup.test.js`、`cloud-functions.test.js`、`page-flows.test.js` | 已覆盖，包括全部重复时不更新卡点 |
| 分批 AI 分析、进度任务、报告和学科档案更新 | `cloud-functions.test.js`、`analyze-batch-result.test.js` | 已覆盖，包括 5+1 分批、逐页结果完整性和失败结果拒绝 |
| 诊断报告、错题详情、卡点统计 | `report-presenter.test.js`、`page-flows.test.js` | 已覆盖 |
| 家长可读的卡点短名称展示 | `util.test.js`、`report-presenter.test.js`、`subject-home-presenter.test.js`、`page-flows.test.js` | 已覆盖，不再向家长和学生展示裸 LP 编号 |
| 学习记录按天聚合报告、试卷和验证上传 | `page-flows.test.js` | 已覆盖；真实照片临时 URL 仍需真机验证 |
| 当前综合诊断三状态、最近变化和旧数据兼容 | `profile-summary.test.js`、`subject-home-presenter.test.js`、`cloud-functions.test.js` | 已覆盖 |
| 验证报告与改善证据判定 | `comparison.test.js`、`verification-evidence.test.js`、`cloud-functions.test.js` | 已覆盖；只有全部预期题目清晰作答且全对才确认改善 |
| 验证试卷选择、生成、PDF 下载、已下载状态、答题上传 | `page-flows.test.js`、`cloud-functions.test.js` | 已覆盖；真实 AI 题目质量和打印效果需人工验收 |
| 默认诊断试卷选择、年级、缓存复用、答题上传 | `page-flows.test.js`、`cloud-functions.test.js` | 同一学生复用已覆盖；跨学生复用未实现 |
| 报告 PDF 生成和下载 | `cloud-functions.test.js`、`page-flows.test.js` | 已覆盖；真实中文字体和 A4 排版需人工验收 |
| 分析超时、任务缺失和手动重试 | `poller.test.js`、`page-flows.test.js`、`contracts.test.js` | 客户端恢复路径已覆盖 |
| 页面注册、四件套文件和 WXML 事件绑定 | `project-integrity.test.js` | 已覆盖 |
| 数据归属校验、参数白名单、无堆栈返回 | `cloud-functions.test.js`、`contracts.test.js` | 已覆盖主要云函数入口 |
| 覆盖缺口补全（边界与回归） | `coverage-gap.test.js` | 已覆盖历史修复的回归场景 |
| 端到端真实图片链路 | `e2e-real-image.test.js` | 本地校验真实图片文件；CloudBase AI 缺少本地凭据时自动跳过云端步骤 |

## 3. 尚未完成的设计能力

| 能力 | 设计要求 | 当前实现 |
|---|---|---|
| 微信订阅消息 | P0，分析完成后推送 | `analyzePhotos/sendNotification` 仍为空实现 |
| 上传与分析解耦 | 创建报告后立即返回，分析独立执行 | 已实现：`uploadAndAnalyze` fire-and-forget 启动 `analyzePhotos` |
| 默认试卷跨学生缓存 | 不同学生可复用同一套默认试卷 PDF | 当前试卷记录按 `studentId` 查询和归属，尚未实现共享模板 |

## 4. 云端与真机验收清单

以下场景无法由本地替身证明，部署后必须执行：

1. 真机添加学生，选择数学，拍摄 1 张和 20 张照片并完成上传。
2. 使用真实手写、黑/蓝/红笔迹试卷，核对 OCR、错题、卡点和逐页摘要。
3. 让分析运行超过 20 秒，确认小程序已返回主页且云端仍能最终完成。
4. 分析中主动关闭小程序，再次进入后确认当前报告和进度可恢复。
5. 上传同名不同内容、不同名相同内容、全部重复内容三组照片。
6. 生成验证卷和默认诊断卷，检查中文字体、A4 分页、答题空间及打印效果。
7. 上传验证卷答案，核对只有本次目标卡点会被判定为已改善。
8. 用第二个微信账号验证数据库安全规则和云函数归属校验。
9. 配置订阅消息后验证授权、发送、点击跳转和拒绝授权路径。

## 5. 测试文件说明

| 文件 | 目的 | 用例数 |
|---|---|---|
| `tests/helpers/page-harness.js` | 执行真实小程序页面控制器 | — |
| `tests/helpers/cloud-function-harness.js` | 执行真实云函数并模拟数据库、存储和函数调用 | — |
| `tests/analyze-batch-result.test.js` | analyzeBatch 结果标准化 | 3 |
| `tests/cloud-functions.test.js` | 云函数集成流程、权限和边界 | 17 |
| `tests/comparison.test.js` | 验证报告对比算法 | 4 |
| `tests/contracts.test.js` | 跨模块契约和已修复缺陷回归保护 | 23 |
| `tests/coverage-gap.test.js` | 覆盖缺口补全 | 7 |
| `tests/data-layer.test.js` | 统一数据访问层 | 8 |
| `tests/e2e-real-image.test.js` | 端到端真实图片测试脚本 | 1（含云端条件步骤） |
| `tests/page-flows.test.js` | 页面主流程与错误恢复 | 27 |
| `tests/photo-dedup.test.js` | OCR 去重算法 | 3 |
| `tests/poller.test.js` | 通用轮询器 | 4 |
| `tests/project-integrity.test.js` | 页面文件和事件绑定完整性 | 2 |
| `tests/report-presenter.test.js` | 报告视图预计算 | 7 |
| `tests/profile-summary.test.js` | 当前综合诊断状态规则 | 6 |
| `tests/subject-home-presenter.test.js` | 学科主页综合诊断视图 | 4 |
| `tests/verification-evidence.test.js` | 验证试卷证据完整性 | 2 |
| `tests/util.test.js` | 工具函数 | 11 |
| **合计** | | **128 常规用例** |

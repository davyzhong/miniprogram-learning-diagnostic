# 学习卡点诊断小程序测试矩阵

> 更新日期：2026-06-17
> 范围：`PRD.md`、`PROJECT_PLAN.md` 中的 MVP P0 功能
> 自动化结果：`npm run verify` → 407/407 通过；`npm run check` → 143 个 JS 文件通过；微信开发者工具 CLI `preview` → 723.5 KB；云函数 `learningResource` / `studentData` 已部署到 `cloud1-d6gneg68m5a7a3876`

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
| 自适应首页、孩子档案、学科入口和学科隔离 | `index-presenter.test.js`、`page-flows.test.js` | 已覆盖；0 个孩子显示空态，1 个孩子直接显示学习档案，多孩子显示家庭工作台并进入孩子档案 |
| 多家长查看同一孩子档案 | `student-access.test.js`、`student-data-access.test.js`、`parent-management-page-flows.test.js`、`page-flows.test.js` | 已覆盖；owner 可邀请/移除，共同家长可参与学习流程但不能管理家庭成员 |
| 最多 20 张照片上传、文件元数据保存 | `cloud-functions.test.js`、`page-flows.test.js` | 核心规则已覆盖；相机和云存储需真机验证 |
| 同名照片软提示、OCR 摘要去重、学习记录照片查看 | `photo-dedup.test.js`、`cloud-functions.test.js`、`page-flows.test.js` | 已覆盖，包括全部重复时不更新卡点 |
| 分批 AI 分析、进度任务、报告和学科档案更新 | `cloud-functions.test.js`、`analyze-batch-result.test.js`、`analyze-photos-pipeline.test.js` | 已覆盖，包括 5+1 分批、逐页结果完整性和失败结果拒绝 |
| 诊断报告、错题详情、卡点统计 | `report-presenter.test.js`、`page-flows.test.js` | 已覆盖 |
| 家长可读的卡点短名称展示 | `util.test.js`、`report-presenter.test.js`、`subject-home-presenter.test.js`、`page-flows.test.js` | 已覆盖，不再向家长和学生展示裸 LP 编号 |
| 学习记录按天聚合报告、试卷、验证上传和英语练习会话 | `page-flows.test.js`、`student-data-access.test.js` | 已覆盖；真实照片临时 URL 仍需真机验证 |
| 学习记录四级展示分类 | `learning-records.test.js`、`page-flows.test.js`、`contracts.test.js` | 已覆盖；诊断报告/验证试卷/验证反馈/英语熟悉度/英语纸面听写为主记录，照片/OCR 和作答上传折叠，分析中/失败为紧凑状态，默认诊断试卷不进入主时间线 |
| 当前综合诊断三状态和旧数据兼容 | `profile-summary.test.js`、`cloud-functions.test.js` | 已覆盖 |
| 时间化学习卡点趋势和权重 | `time-aware-bottlenecks.test.js`、`profile-summary.test.js`、`cloud-functions.test.js`、`page-flows.test.js` | 已覆盖；照片证据以上传时间为准，验证卷保留 paperDate |
| 学科工作台主任务、待处理队列和工具入口 | `subject-home-presenter.test.js`、`page-flows.test.js`、`contracts.test.js` | 已覆盖；学科主页不再重复综合诊断摘要 |
| 验证报告与改善证据判定 | `comparison.test.js`、`verification-evidence.test.js`、`cloud-functions.test.js`、`report-presenter.test.js` | 已覆盖；只有全部预期题目清晰作答且全对才确认改善，空白/模糊/缺失均进入证据不足；报告页用“结论 / 依据 / 注意 / 下一步”解释验证结果 |
| 报告质量复核信号 | `report-quality.test.js`、`report-presenter.test.js` | 已覆盖；样本不足不更新长期卡点，部分失败显示“建议复核” |
| 家长反馈与纠错入口 | `report-feedback.test.js`、`page-flows.test.js` | 已覆盖；owner/viewer 可提交反馈，非成员不可提交，反馈不直接修改原报告 |
| 验证任务包出卷配置、生成、PDF 下载、生命周期状态、答题上传 | `verification-pack.test.js`、`paper-preview-presenter.test.js`、`page-flows.test.js`、`learning-records.test.js`、`cloud-functions.test.js`、`generate-paper-pdf.test.js` | 已覆盖；支持 LP/BN/CHI 目标，任务包最多 60 个目标，每目标 5 题（3 核心验证 + 2 迁移延展），数学默认每页 3 个目标，语文具体错项默认每页 8 个目标；PDF 学生页打印 pageCode，试卷页和学习记录可展示分页进度 |
| 验证任务包分页证据回传 | `verification-evidence.test.js`、`analyze-batch-result.test.js`、`cloud-functions.test.js`、`paper-preview-presenter.test.js` | 已覆盖；AI 分析提示识别页面编号，报告保存 `verificationPageCodes` / `verificationPageEvidence`，只对已上传页面形成证据，未上传页面保持待回传而不是自动判失败 |
| 学习卡点学习任务包 | `learning-resource-generator.test.js`、`learning-resource-cloud.test.js`、`learning-resource-presenter.test.js`、`page-flows.test.js`、`student-data-access.test.js`、`learning-records.test.js` | 已覆盖；可从卡点详情和卡点中心生成“学一下”任务包，任务包包含微讲解、例题、易错对比、练习和家长参考，完成后进入统一学习记录 |
| 默认诊断试卷选择、年级、缓存复用、答题上传 | `page-flows.test.js`、`cloud-functions.test.js` | 同一学生复用已覆盖；跨学生复用未实现 |
| 报告 PDF 生成和下载 | `cloud-functions.test.js`、`page-flows.test.js`、`contracts.test.js` | 已覆盖；中文字体已内置，真实 A4 排版需人工验收 |
| 分析超时、任务缺失和手动重试 | `poller.test.js`、`page-flows.test.js`、`contracts.test.js` | 客户端恢复路径已覆盖 |
| 页面注册、四件套文件和 WXML 事件绑定 | `project-integrity.test.js` | 已覆盖 |
| 数据归属校验、参数白名单、无堆栈返回 | `cloud-functions.test.js`、`contracts.test.js`、`student-access.test.js`、`student-data-access.test.js` | 已覆盖主要云函数入口；学习流程操作走成员权限，家庭成员管理 owner-only |
| 覆盖缺口补全（边界与回归） | `coverage-gap.test.js` | 已覆盖历史修复的回归场景 |
| 端到端真实图片链路 | `e2e-real-image.test.js`、`real-image-config.test.js` | 支持 mock、单图和 manifest 多案例模式；真实图片与运行报告默认保存在本机私有路径 |
| Skill / CLI P0 | `skills-p0.test.js`、`cli-p0.test.js` | 已覆盖；诊断、报告、卡点、验证卷、验证反馈和时间线能力可通过本地能力内核与 CLI 调用 |

## 3. 尚未完成的设计能力

| 能力 | 设计要求 | 当前实现 |
|---|---|---|
| 微信订阅消息 | 后续增强，需模板与用户授权 | 当前不承诺推送；上传页提示“完成后可在学习记录查看”，`analyzePhotos/sendNotification` 保留为预留钩子 |
| 上传与分析解耦 | 创建报告后立即返回，分析独立执行 | 已实现：`uploadAndAnalyze` fire-and-forget 启动 `analyzePhotos` |
| 默认试卷跨学生缓存 | 不同学生可复用同一套默认试卷 PDF | 当前试卷记录按 `studentId` 查询和归属，尚未实现共享模板 |

## 4. 云端与真机验收清单

以下场景无法由本地替身证明，部署后必须执行：

1. 真机添加学生，选择数学，拍摄 1 张和 20 张照片并完成上传。
2. 使用真实手写、黑/蓝/红笔迹试卷，核对 OCR、错题、卡点和逐页摘要。
3. 让分析运行超过 20 秒，确认小程序已返回主页且云端仍能最终完成。
4. 分析中主动关闭小程序，再次进入后确认当前报告和进度可恢复。
5. 上传同名不同内容、不同名相同内容、全部重复内容三组照片。
6. 生成学习任务包，检查“学一下”入口、任务包内容、完成学习和学习记录回写。
7. 生成验证任务包和默认诊断卷，检查中文字体、A4 分页、页面编号、答题空间及打印效果。
8. 分页上传验证卷答案，核对只有已上传页面中的目标卡点会更新证据，未上传页面仍显示待回传。
9. 用第二个微信账号验证数据库安全规则和云函数归属校验。
10. 配置订阅消息后验证授权、发送、点击跳转和拒绝授权路径。

## 5. 测试文件说明

| 文件 | 目的 | 用例数 |
|---|---|---|
| `tests/helpers/page-harness.js` | 执行真实小程序页面控制器 | — |
| `tests/helpers/cloud-function-harness.js` | 执行真实云函数并模拟数据库、存储和函数调用 | — |
| `tests/analyze-batch-result.test.js` | analyzeBatch 结果标准化 | 7 |
| `tests/analyze-photos-pipeline.test.js` | analyzePhotos 管线辅助函数 | 16 |
| `tests/bottleneck-view.test.js` | 共享学习卡点视图模型、排序和统计规则 | 3 |
| `tests/cli-p0.test.js` | P0 CLI 命令合同，使用 fixture adapter 离线验证 | 4 |
| `tests/cloud-functions.test.js` | 云函数集成流程、权限和边界 | 37 |
| `tests/comparison.test.js` | 验证报告对比算法 | 4 |
| `tests/contracts.test.js` | 跨模块契约和已修复缺陷回归保护 | 38 |
| `tests/coverage-gap.test.js` | 覆盖缺口补全 | 7 |
| `tests/data-layer.test.js` | 统一数据访问层 | 11 |
| `tests/e2e-real-image.test.js` | 端到端真实图片测试脚本 | 1（含云端条件步骤） |
| `tests/generate-paper-pdf.test.js` | 可打印 PDF 中文字体、分页和答案页回归 | 5 |
| `tests/index-presenter.test.js` | 孩子档案视图模型与家庭工作台卡片 | 9 |
| `tests/learning-records.test.js` | 学习记录四级分类、试卷编号、卡点名称、英语 session 和学习任务包展示规则 | 19 |
| `tests/learning-resource-cloud.test.js` | 学习任务包云函数权限、生成、读取、完成、加入验证 | 4 |
| `tests/learning-resource-generator.test.js` | 学习任务包内容生成器 | 4 |
| `tests/learning-resource-presenter.test.js` | 学习任务包页面视图模型 | 2 |
| `tests/page-flows.test.js` | 页面主流程、首页分流与错误恢复 | 76 |
| `tests/paper-preview-presenter.test.js` | 试卷预览、任务包页进度和下载状态视图模型 | 7 |
| `tests/parent-management-page-flows.test.js` | 家长管理和扫码加入页面流程 | 6 |
| `tests/photo-dedup.test.js` | OCR 去重算法 | 3 |
| `tests/poller.test.js` | 通用轮询器与分析轮询包装 | 6 |
| `tests/project-integrity.test.js` | 页面文件、事件绑定和品牌资产完整性 | 3 |
| `tests/real-image-config.test.js` | 真实图片 E2E 配置解析 | 5 |
| `tests/report-feedback.test.js` | 报告反馈云函数 | 3 |
| `tests/report-presenter.test.js` | 报告视图预计算、质量标签和验证证据状态 | 19 |
| `tests/report-quality.test.js` | 报告质量模型 | 4 |
| `tests/skills-p0.test.js` | P0 Skill 能力内核 | 8 |
| `tests/profile-summary.test.js` | 当前综合诊断状态规则 | 6 |
| `tests/student-access.test.js` | 家长成员、邀请、加入、移除权限和首次建表兜底 | 8 |
| `tests/student-data-access.test.js` | 共享家长学习数据访问 | 11 |
| `tests/subject-home-presenter.test.js` | 学科工作台视图模型 | 3 |
| `tests/time-aware-bottlenecks.test.js` | 时间化学习卡点趋势和权重 | 5 |
| `tests/verification-evidence.test.js` | 验证试卷证据完整性 | 5 |
| `tests/verification-pack.test.js` | 验证任务包分页、页面编号和题目归属规划 | 4 |
| `tests/util.test.js` | 工具函数 | 11 |
| **合计** | | **407 常规用例** |

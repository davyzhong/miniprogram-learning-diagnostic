# Changelog

本文件记录学习卡点诊断小程序的所有重要变更。格式遵循 [Keep a Changelog](https://keepachangelog.com/zh-CN/)，版本号遵循 [语义化版本](https://semver.org/lang/zh-CN/)。

---

## [Unreleased]

### Added

- 端到端真实图片测试脚本 (`tests/e2e-real-image.test.js`)，串通上传 → AI 分析 → 报告生成完整链路
- 学习档案首页：首屏展示综合摘要、样本覆盖、学习观察、学习记录和下一步建议 (`pages/index/`, `index-presenter.js`)
- 学习记录时间线：按天聚合诊断报告、验证试卷、验证作答上传和原始照片 (`pages/upload-history/`)
- 试卷 PDF 已下载状态：同一份试卷下载后显示「已下载」，避免重复下载 (`pages/paper-preview/`)
- 学习卡点短名称格式化：对家长和学生展示“小数分数、单位换算”等摘要，不直接暴露 LP 编号 (`utils/util.js`)
- 新版双女孩学习插图与应用分享 Logo 资源 (`miniprogram/assets/images/`, `brand-assets/`)

### Changed

- `index` 从学生列表改为单人 MVP 学习档案首页；`subject-select` 降级为兼容的学科入口页
- `upload-history` 支持不带学科参数时展示全学科学习记录
- `npm test` 改为只运行 136 个常规自动化用例；真实图片 E2E 改由 `npm run test:e2e-real-image` 单独运行
- PRD、项目计划、架构、测试、部署、云函数和故障排查文档更新到当前实现状态

---

## [0.3.0] - 2026-06-11

### Added

- 照片去重：基于 OCR 摘要的内容指纹比对，支持跨批次和跨历史报告去重 (`analyzePhotos/photo-dedup.js`)
- 上传历史页面：按诊断报告分组展示原始照片、OCR 摘要和疑似重复标记 (`pages/upload-history/`)
- AI 结果标准化模块：校验 pageResults 数量、imageIndex 唯一性、字段截断、severity 归一 (`analyzeBatch/result-normalizer.js`)
- 自动化测试框架：基于 Node.js 内置 test runner，覆盖页面流程、云函数、数据层、契约、去重、轮询、报告视图、工具函数等（100 用例）
- JS 语法检查脚本 (`scripts/check-js.js`)，校验全部 40 个 JavaScript 文件
- 项目完整性测试：验证 10 个页面四件套文件齐全且 WXML 事件绑定正确
- 覆盖缺口补全测试 (`tests/coverage-gap.test.js`)
- 跨模块契约与回归保护测试 (`tests/contracts.test.js`)
- 统一数据访问层 (`utils/cloud.js`)，封装学生/学科档案/报告/试卷/分析进度/云函数调用
- npm scripts：`test` / `test:coverage` / `check` / `verify`

### Changed

- 移除独立的 photos 集合，照片信息内嵌到 reports.imageFiles
- 重构 cloud.js，消除过时函数引用

### Fixed

- 全部照片疑似重复时仍错误更新学习卡点的问题——现在仅写 summary 不修改 bottlenecks/errorDetails
- analyzePhotos 中断链的 sendSubscribeMessage 调用已移除

---

## [0.2.0] - 2026-06-10

### Fixed

- 分析进度卡在 0% 的全链路 bug：重构分析触发链路，确保服务端可靠启动分析
- 客户端超时兜底机制：upload.js 设置 20s timeout，超时后按后台处理中返回学科主页
- 分析任务缺失时的手动重试功能 (`report.onRetryAnalysis()`)
- 稳定化 MVP 工作流：修复多处导致分析中断的边界情况
- make diagnostic analysis recoverable：增强分析流程的错误恢复能力

---

## [0.1.0] - 2026-06-09

### Added

- MVP 初始提交，包含完整的学习诊断系统
- 10 个小程序页面：首页 / 添加学生 / 学科选择 / 学科主页 / 拍照上传 / 上传历史 / 诊断报告 / 验证试卷生成 / 默认诊断试卷 / 试卷预览
- 6 个云函数：uploadAndAnalyze / analyzePhotos / analyzeBatch / getAnalysisProgress / generatePaper / generateReportPDF
- 三条诊断路径：拍照诊断 / 验证试卷 / 默认诊断试卷
- 异步分析架构：服务端同步调用 + 客户端超时兜底 + 前端轮询
- 5 张/批串行分析 + analysisTasks 进度追踪
- 验证报告对比逻辑：improved / worsened / new / persisting 四种状态
- 报告 PDF 生成与下载
- 试卷 PDF 生成（支持 preview 模式不落库）
- 通用轮询器 (`utils/poller.js`)
- openID 数据归属校验 + 参数白名单
- PRD.md v2.2 / PROJECT_PLAN.md / SETUP.md 项目文档

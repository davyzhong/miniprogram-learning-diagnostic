# Changelog

本文件记录学习卡点诊断小程序的所有重要变更。格式遵循 [Keep a Changelog](https://keepachangelog.com/zh-CN/)，版本号遵循 [语义化版本](https://semver.org/lang/zh-CN/)。

---

## [Unreleased]

### Added

- **本地 PDF 预览工具** `scripts/preview-pdf.js`：改完 PDF 渲染代码直接跑，不用上传云函数即可看效果。输出到 `tmp/preview-verification.pdf`
- **验证卷自动生成**：诊断报告完成后后台异步生成验证卷（含覆盖旧卷、失败重试 3 次、状态查询）
- **验证卷出题逻辑重新设计**：以细卡点（BN）为出题单位，每个 BN 出 2 题，上限 20 题。prompt 填充 taxonomy 的症状和验证规则
- **答案页解题思路**：LLM 生成 explanation 字段（具体计算步骤），答案页双栏显示题号+卡点名+答案+解题思路

- **L1-L4 测试框架**：数据一致性守护（18 断言）、诊断准确性回归（41 条证据）、卡点分组回归（28 卡点）、数据驱动 E2E、结果聚合、真实云回归
- **数据扩充 v0.3**：知识节点 31→91、历史证据 20→41、卡点 27→28、资源 26→28，四库交叉引用一致性 100%
- 家庭学习工作台与单孩子学习档案分流：0 个孩子显示空态，1 个孩子直接进入档案，多孩子显示高密度工作台
- 家长成员管理：owner 可邀请/移除共同家长，viewer 除成员管理外可查看资料并参与上传、出卷、重试等学习流程
- 学习卡点中心与单卡点详情：支持从首页、档案、学科页和报告页进入卡点工作台，查看证据链并生成验证卷
- P0 Skill / CLI 能力内核：`services/skills` 与 `cli/ldx.js` 覆盖诊断、报告、卡点、验证卷、验证反馈和时间线
- HEIF / HEIC 上传处理：上传页尽量转换为 JPEG，失败时给出可读提示
- 端到端真实图片测试脚本 (`tests/e2e-real-image.test.js`)，串通上传 → AI 分析 → 报告生成完整链路
- 学习档案首页：首屏展示综合摘要、样本覆盖、重点提示、学习记录和下一步建议 (`pages/index/`, `index-presenter.js`)
- 学科工作台视图：学科主页聚焦主任务、待处理队列和工具入口，不再重复综合诊断摘要 (`pages/subject-home/`)
- 验证试卷出卷配置器：支持 `targetCode` 单卡点预选，并展示题量、预计用时和 A4 页数 (`pages/generate-verification/`)
- 学习记录时间线：按天聚合诊断报告、验证试卷、验证作答上传和原始照片 (`pages/upload-history/`)
- 试卷 PDF 已下载状态：同一份试卷下载后显示「已下载」，避免重复下载 (`pages/paper-preview/`)
- 学习卡点短名称格式化：对家长和学生展示"小数分数、单位换算"等摘要，不直接暴露 LP 编号 (`utils/util.js`)
- 新版双女孩学习插图与应用分享 Logo 资源 (`miniprogram/assets/images/`, `brand-assets/`)

### Changed

- **PDF 验证卷格式大幅优化**：双栏布局、题号题目合并、演算区扩大、标题栏精简、答案页改显示解题思路。20 题从 ~4 页压缩到 3 页
- **验证卷题量调整**：每个细卡点 2 题（1 核心+1 延展），总上限 20 题
- **验证卷 prompt 增强**：填充 taxonomy 的 symptomPatterns 和 microValidationRules
- **云函数 `_shared` 子目录重构**：微信开发者工具上传时跳过下划线前缀子目录，导致 `require('./_shared/access')` 在云端失败、预览/真机空白。8 个云函数的共享文件移到各自根目录，改为 `require('./access')`；删除顶层 `cloudfunctions/_shared/`
- **Intl API 兼容性修复**：微信 iOS/Mac 运行时不支持 `Intl`，导致首页 `formatRelativeTime` 崩溃、预览/真机完全空白。3 处 `Intl.DateTimeFormat` 替换为纯数学时区计算（UTC+8 偏移 + `getUTC*`）
- **试卷生成超时优化**：`generatePaper` 每卡点题量 5→3（2核心+1延展），卡点上限 60→8，temperature 0.7→0.3，prompt 精简，确保 LLM 在 60 秒内返回
- **前端 LLM 调用超时修复**：`callGeneratePaper`/`callGenerateReportPDF`/`confirmEnglishImportBatch`/`analyzeEnglishDictationPhoto` 加 `timeout: 60000`（微信默认 20 秒不够）
- 验证试卷题量调整为每个学习卡点 3 道题：2 道核心验证题 + 1 道迁移延展题，用于复测当前卡点并观察相邻卡点
- 批量照片分析改为服务端按图片串行异步处理，并通过后续云函数调用延续大批量任务，避免单次函数超过 60 秒限制
- 学习记录主卡片更强调诊断报告、验证试卷和验证反馈，分析中/失败等中间态保持紧凑展示
- `index` 从学生列表改为单人 MVP 学习档案首页；`subject-select` 降级为兼容的学科入口页
- 首页”学习观察”收敛为”重点提示”，诊断解释主要保留在首页摘要和报告页
- `upload-history` 支持不带学科参数时展示全学科学习记录
- `npm test` 当前运行 447 个常规自动化用例（49 个测试文件）；真实图片 E2E 改由 `npm run test:e2e-real-image` 单独运行
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

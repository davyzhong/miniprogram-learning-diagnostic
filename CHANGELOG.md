# Changelog

本文件记录学习卡点诊断小程序的所有重要变更。格式遵循 [Keep a Changelog](https://keepachangelog.com/zh-CN/)，版本号遵循 [语义化版本](https://semver.org/lang/zh-CN/)。

---

## [Unreleased]

### 2026-07-17 数学学习地图 V3：节点目录、掌握状态闭环与复测调度

#### Added

- **标准知识节点目录进诊断管线**：91→150 节点固化目录注入 analyzeBatch prompt（nodeIds 必须从目录选取），`canonicalizeNodeId` 五层归并（标准/别名/前缀/标题/丢弃并记录 unmatchedNodeIds）；`math-learning-map-enricher` 接入实时管线兜底，报告与画像写入同一份数据
- **种子镜像统一**：`scripts/build-math-seed-mirrors.js` 一次生成云函数与前端全部 seed 镜像（修复 generatePaper taxonomy 静默缺失的死代码问题）；同步测试防漂移
- **掌握状态闭环（六态）**：`studentNodeMastery` 集合 + 纯函数状态机（unobserved/suspected_gap/relearning/partial_mastery/mastered/recurring，四事件驱动，mastered 需 ≥24h 间隔复测）。诊断报告→疑似漏洞、验证卷通过/失败→重学或部分掌握、资源包完成→部分掌握、同类错误再现→复发
- **知识地图页升级**：150 个知识节点按四领域六态展示（风险态优先，未观察按领域汇总计数），与既有卡点行动卡并存
- **干预会话与复测调度**：completePack 自动沉淀 `interventionSessions`（资源使用、当场练习、掌握前后状态、24h/72h 复测安排）；scheduleVerification 写实 nextReviewAt；首页个人行动队列置顶"到期复测"卡并直跳验证卷配置器
- **数据库索引声明**：studentNodeMastery（studentId+subject+nodeId）、interventionSessions（studentId+date）
- 知识节点数据扩充 v0.4.0：91→150 节点（四大领域 1-6 年级主干，8 个节点挂接现有细卡点）；掌握状态 example 数据迁移为六态

#### Fixed

- enricher 读取已改名的 selectionPolicy 字段导致资源角色分类失效（conceptAnchor/jumpable/authoritative 重新映射）
- 知识地图页双请求并行时同步抛错会造成另一 Promise unhandledRejection

### 2026-07-18 文档与 GitHub 项目主页重制

#### Changed

- README 重构为产品展示型 GitHub 项目主页，集中呈现学习闭环、三学科差异、关键界面、工程架构、快速开始与质量基线；完整操作步骤移入图文用户导览。
- 当前规范文档统一到代码事实基线：25 个注册页面、14 个业务云函数、17 个数据库集合、89 个测试文件库存、默认离线集 1008/1008 通过、313 个 JavaScript 文件和 789 KB 主包。
- 新增 `docs/README.md` 文档中心，明确当前规范、专题设计与历史 specs/plans/test-reports 的边界。
- 图文用户导览按家庭工作台、正式诊断、验证、学习记录、语文原项复测和英语双维词汇闭环重新组织。

#### Documentation

- emoji 兼容描述更新为 B01 202 项和 B02 996 项 Android/iOS 目标设备双端通过；4 个 Android 方格项继续排除。
- 测试口径区分“89 个测试文件库存”与“默认脚本显式执行 84 个文件”，真实云、真实图片和数学专项管线保持独立运行。

### 2026-07-18 可靠性、可视化与 emoji 全量接入（详细报告见 `docs/test-reports/2026-07-18-visualization-emoji-and-reliability.md`）

#### Added

- **202 个已验证 emoji 全量接入**：`utils/ui-symbols.js` 重构为 C01-C14 全量 205 键白名单（含 ZWJ 家庭组合、键帽、旗帜），25 个注册页面完成图标化（页头、区块标题、动作、空态装饰、时间线类型标记）；学科图标数学 🧮 / 语文 📖 / 英语 🔤；卡点五态获全局状态符号（⏳🔴🟢🔁📉）。emoji 只辅助识别，文字标签全部保留。
- **界面可视化**：learning-progress 卡点矩阵升级为 B1 色块热力图并新增首页/学科页入口；首页孩子卡三色状态构成堆叠条与趋势 pill；报告页变化构成色带与验证通过率三段色带；英语词库构成条、知识地图掌握度条、卡点详情通过率条与点状证据时间线；共享实现 `utils/status-segments.js` 与 `.b1-seg-*` 公共类。
- **公共状态组件** `components/status-view`（loading/empty/error+retry），knowledge-map、learning-resource、learning-progress、report 错误态统一为可重试区块。
- **验证卷卡死恢复**：`studentData` 标记 `stale`（generating 超 10 分钟无写入），`regenerateVerificationPaper` 新增 `resume` action，前端弹窗引导家长自助重试。
- **轻量去重读取**：`studentData?action=listRecentImageFileNames`（服务端投影），替代拉取全量历史报告。
- **移除共同家长**：parent-management 成员行接入 owner 专属的移除入口（二次确认）。

#### Changed

- **性能**：报告页分析中轮询只查轻量进度（约省 90% DB 读）；验证卷轮询预算 120s→6 分钟；上传改 3 路并发，HEIF 转换 quality 80 + 限宽 1600px。
- **一致性**：学科色收敛为 B1 token 单源（淘汰三套旧色值并加测试断言）；置信度 ●●● 标签全局执行（bottleneck-center/index/subject-home 补齐）；卡点状态文案收敛为单一来源。
- **体验**：分析超时后 report 页通过状态总线自动刷新；字号下限收敛到 20rpx。
- **主包预算**：内部预算 800 KB → 1200 KB（微信平台硬限制 2 MB，保留 ~800 KB 平台余量），功能扩展不再受旧预算挤压。
- **数学**：知识节点 91→150 个，`analyzeBatch` 内置标准节点目录，nodeIds 100% 归并；节点掌握闭环（六态模型）完成设计待实现。

#### Fixed

- paper-preview 预览模式隐藏必失败的"上传作答照片"按钮；学习资源外链跳转逻辑（运算符优先级 + 假 appId）；语文微任务提交静默失败；英语页面真实学生名兜底文案；SETUP.md/README 补齐 `chineseSkillAttempts` 与 `englishPracticeAttempts` 集合。

### Added

- **家庭工作台 B+ 紧凑界面**：家庭首页以图标化四项指标、优先行动、三科学习状态、最新正式诊断和快捷入口组织每个孩子的信息；保留原有入口并提升首屏信息密度。
- **正式诊断优先展示**：学习档案和家庭工作台按学科展示最新正式诊断报告，并将报告后的下一步行动整合到同一条工作流中。
- **全页面可见文本编码防护**：21 个注册页面的真实 Presenter/Controller 状态均纳入门禁；内部卡点、资源、数据库、文件和错误编码不再透传到家长界面。
- **脱敏界面导览**：README 与 `docs/user-guide/` 增加当前版本自动化生成的家庭工作台和学习记录截图，并保留完整图文操作导览。
- **语文原错项验证闭环**：自动验证卷以未掌握的语文具体错项为独立目标；每个原错字、词或句必须先有原项复测题，同音、同形、形近和多义题仅作为绑定原错项的迁移扩展。
- **语文分阶段验证卷**：按原项复测、巩固复测、迁移观察安排题目和复测间隔；PDF、试卷预览和语文工作台明确区分原项复测与举一反三，并保持逐错项反馈。

- **统一状态感知体系**：新建 `utils/status-store.js`（全局状态 Store + 事件总线）和 `utils/app-status.js`（app 级单例 + `bindPageStatus` 页面混入）。覆盖所有异步操作（诊断分析、验证卷生成、报告 PDF、听写批改），操作状态变更时自动通知所有订阅页面。上传成功后直接跳转报告页轮询（修复"AI 分析中之后无反馈"），首页/学科页/学习记录页收到 `operation:completed` 事件自动刷新。
- **上传页授权遮罩修复**：内测授权守卫改用页内遮罩（WXML overlay）替代不可靠的 `wx.showModal`，修复"点击上传按钮无反应"。
- **AI 用量与成本估算账本**（体验版内测）：`aiUsage` 云函数 + `aiUsageEvents` 追加式事件账本。各 AI 云函数（analyzeBatch/generatePaper/learningResource/englishVocabulary）在真实调用边界写入 pending→succeeded/failed 事件，成本优先用真实 token usage，无 usage 时按字符/图片数估算并标记。账单页（`pages/ai-usage`）展示月度汇总、按功能拆分和按天明细，强制标注"内测成本估算，不代表应付款项"。
- **内测授权与数据删除**：首次上传前展示内测说明弹层（收集内容/用途/风险/删除方式），用户同意后才能继续；`userConsents` 集合记录授权；AI 用量页可发起 `dataDeletionRequests`。设计文档见 `docs/superpowers/specs/2026-06-27-private-beta-ai-usage-design.md`。
- 验证卷预览页“覆盖卡点”层级展示：新增 `paperDisplay.bottleneckHierarchy`，按粗类、卡点家族、细卡点展示覆盖范围，并兼容旧 LP/摘要数据。
- 验证卷范围页卡点层级提示：数学目标显示“粗类 / 卡点组”，语文具体错项继续显示错项说明。
- **本地 PDF 预览工具** `scripts/preview-pdf.js`：改完 PDF 渲染代码直接跑，不用上传云函数即可看效果。输出到 `tmp/preview-verification.pdf`
- **验证卷自动生成**：诊断报告完成后由后端自动准备验证卷（含覆盖旧卷、分批推进、状态查询）
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
- 试卷 PDF 已下载状态：同一份验证卷下载后仍保留「下载验证卷」主动作，允许重复下载和打印 (`pages/paper-preview/`)
- 学习卡点短名称格式化：对家长和学生展示"小数分数、单位换算"等摘要，不直接暴露 LP 编号 (`utils/util.js`)
- 应用分享 Logo 资源 (`brand-assets/app-logo.png`) 和文档用界面截图 (`docs/user-guide/images/`)
- 家庭与个人学习工作台重构：家庭页增加行动总览入口，个人页增加个人行动摘要、今日行动、最新诊断报告、行动队列和三科学科入口，所有卡片均可点击进入真实页面

### Changed

- **学习记录时间线**：验证试卷卡片改为可读覆盖摘要、紧凑状态和有限证据预览；保留“数学-YYYYMMDD-NN”这类家长可理解的试卷编号，不展示内部编码。
- **性能与交付**：主包维持在 800 KB 内部预算以内，家庭首页使用聚合数据读取；新增家庭首屏密度、学习记录窄屏布局和内部编码的 DevTools 验收入口。

- PRD、README、项目计划、部署、测试和 CODEMAPS 文档同步到 2026-07-02 当前实现：20 个注册页面、14 个云函数、638 个常规自动化用例，并改用 `docs/user-guide/images/` 中的有效界面截图。
- AI 用量账本聚合改为按北京时间自然月过滤，并在数据库查询阶段带上月份范围后再分页，避免月末 UTC 边界和“先 limit 再过滤”导致账单缺失。
- AI 用量专项 DevTools E2E 纳入正式脚本入口：`npm run test:e2e:ai-usage`，覆盖账单页、首页入口、上传授权检查、`aiUsage.getSummary` 和 `aiUsage.getBetaAuth`。
- 学习资源任务包目标契约：`bottleneck-center` / `bottleneck-detail` 生成任务包时显式传入 `targetId`，云函数缓存优先按细目标匹配，避免同一粗 LP 下多个细卡点复用同一内容。
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
- 验证卷主流程收敛为后台自动准备、前端状态轮询、ready 后下载；前端不再创建或推进验证卷生成。
- `index` 从学生列表改为家庭/个人学习工作台；`subject-select` 学科选择页已从当前 `app.json` 移除，学科入口收敛到首页、个人档案和 `subject-home`
- 首页”学习观察”收敛为”重点提示”，诊断解释主要保留在首页摘要和报告页
- `upload-history` 支持不带学科参数时展示全学科学习记录
- `npm test` 当前运行 638 个常规自动化用例；真实图片和 DevTools E2E 脚本按需单独运行
- PRD、项目计划、架构、测试、部署、云函数和故障排查文档更新到当前实现状态
- 小程序主包静态 hero 插图已移除，避免影响 2MB 预览限制；当前文档图片统一引用 `docs/user-guide/images/` 的界面截图。

### Fixed

- 验证试卷页“覆盖卡点”兼容历史/AI 变体细卡点 ID，`BN-...` 编码不再直接显示给家长，统一转换为可读中文卡点名。
- 验证试卷页不再展示无行动价值的“任务页进度 0/N”，仅在已有作答页回传证据时展示“作答回传进度”，并移除内部页编码和“目标待补充”占位。
- AI 用量事件完成/失败写入不再 fire-and-forget；`analyzeBatch`、`generatePaper`、`learningResource`、`englishVocabulary` 在返回业务结果前等待账本状态落库，降低 `pending` 残留风险。
- `uploadAndAnalyze` 服务端新增内测授权校验，未写入 `userConsents.betaConsented=true` 的用户不能绕过前端直接上传真实资料。
- `paper/default-paper` 上传模式必须关联 `paperId`，避免无关联试卷的上传被误落成普通照片诊断。
- 首页多孩子工作台增加全局「AI 用量」入口，确保所有家庭结构都能进入账本页。
- 学习卡点中心“学一下”内容重复：修复同一 `lpCode` 下多个细卡点点击学习时误匹配第一个卡点的问题，并补充前后端缓存回归测试。
- 验证卷“覆盖卡点”长文本堆叠：改为层级卡片，避免几十个细卡点平铺成一大段文本。
- 重复返回入口：移除英语听写、错词本和个人档案页的自定义返回箭头，卡点详情页入口文案改为“查看全部卡点”，减少与系统导航返回重复。
- 验证卷历史生成页降级为“验证卷下载入口”，主流程不再暴露手动生成动作。
- 验证卷工作台将“下载验证卷”固定为主按钮，“上传作答照片/查看验证反馈”作为独立二级动作，避免下载后主按钮被替换。

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

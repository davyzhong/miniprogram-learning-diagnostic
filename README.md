# 学习卡点诊断小程序

<p align="center">
  <img src="brand-assets/app-logo.png" alt="学习卡点诊断小程序 Logo" width="104" />
</p>

<p align="center">
  <strong>把"这道题做错了"，变成家长看得懂、孩子做得到、结果可验证的下一步行动。</strong>
</p>

<p align="center">
  面向小学家庭的 AI 学习诊断微信小程序。拍照上传试卷后，系统用视觉 AI 定位学习卡点、生成正式诊断报告，<br />
  再把学习任务、验证试卷和作答反馈串成一条持续改善闭环。
</p>

<p align="center">
  <img alt="WeChat Mini Program" src="https://img.shields.io/badge/WeChat-Mini_Program-07C160?style=flat-square" />
  <img alt="CloudBase" src="https://img.shields.io/badge/Backend-CloudBase-2F80ED?style=flat-square" />
  <img alt="Tests" src="https://img.shields.io/badge/tests-1110_passing-2E8B57?style=flat-square" />
  <img alt="Main package" src="https://img.shields.io/badge/main_package-809_KB-F2A900?style=flat-square" />
  <img alt="AI Model" src="https://img.shields.io/badge/AI-Vision-qwen3.5--plus-6366F1?style=flat-square" />
</p>

<p align="center">
  <img src="docs/user-guide/images/01-family-workbench.png" alt="家庭学习工作台" width="270" />
  <img src="docs/user-guide/images/04-report.png" alt="诊断报告" width="270" />
  <img src="docs/user-guide/images/12-english-workbench.png" alt="英语工作台" width="270" />
</p>

> 以上截图于 2026-08-01 由自动化脚本使用匿名 mock 数据重新生成，不包含真实学生资料。更多界面见[图文用户导览](docs/user-guide/README.md)。

## 为什么做这个项目

家长看到错题时，通常知道"错了什么"，却不容易判断：这是偶然失误，还是稳定存在的学习卡点？应该先讲知识、做相似题，还是直接复测？过几天以后又该如何确认孩子真的掌握了？

本项目把这些判断变成一套可追踪的产品流程：

```mermaid
flowchart LR
    A[拍照上传试卷] --> B[视觉 AI 识别错题与证据]
    B --> C[生成正式诊断报告]
    C --> D[定位学习卡点]
    D --> E[学习任务与针对性练习]
    E --> F[生成验证试卷]
    F --> G[上传作答反馈]
    G --> H[更新掌握状态与学习档案]
    H --> D
```

产品不止给出一份报告，而是持续回答三个问题：

1. **现在发生了什么**：哪些错误重复出现，证据来自哪里，结论可信到什么程度。
2. **接下来做什么**：优先处理哪个卡点，学习、练习和复测如何衔接。
3. **是否真的改善**：验证结果如何，哪些问题已经改善，哪些仍需观察或再次处理。

## 真实运行数据

以下是内测阶段的真实数据（截至 2026-07-12，已脱敏）：

| 指标 | 数据 |
| --- | --- |
| 累计诊断图片 | **120 张**（去重后纳入分析） |
| 单次综合诊断报告 | 基于 120 张试卷照片，识别 **242 道错题**，定位 **10 个学习卡点** |
| 验证卷 | 生成 **70 道针对性验证题**，覆盖 69 个细粒度卡点 |
| 验证卷答题分析 | 上传 4 张答题照片，精准识别 **2 道真实错题**，零假阳性 |
| 数学知识地图 | **150 个知识节点**，40 个标准细卡点 |
| AI 用量追踪 | 每次调用记录 token 数和估算成本，按月汇总 |

### 诊断报告样例（真实数据脱敏）

120 张数学试卷照片的综合诊断结果：

| 学习卡点 | 错题数 | 严重度 |
| --- | ---: | --- |
| 审题理解 | 51 | 高 |
| 应用建模 | 45 | 高 |
| 书写规范 | 40 | 高 |
| 计算基础 | 34 | 高 |
| 几何概念 | 32 | 中 |
| 小数百分数 | 19 | 中 |
| 分数运算 | 15 | 中 |
| 符号理解 | 7 | 低 |
| 抄写检查 | 4 | 低 |
| 单位换算 | 2 | 低 |

### 验证卷反馈样例（真实数据脱敏）

验证卷答题上传后的分析结果，展示三层防线如何消除假阳性：

| AI 初始报告 | 三层防线处理后 | 说明 |
| --- | --- | --- |
| 9 道错题 | **2 道真实错题** | 权威答案替换 + 数值归一化 + OCR 交叉验证 |
| 2.7×3.8=11.26（应 10.26） | ✓ 保留 | 真实错题（进位错误） |
| 3.2m×45cm=144m²（应 1.44m²） | ✓ 保留 | 真实错题（单位未统一） |
| 0.6×0.05=0.03（标答 0.03） | ✗ 已过滤 | 答案正确，AI 误报（红叉干扰） |
| 1/2+1/3=2/5（AI 读成 2/7） | ✗ 已过滤 | 学生写对，AI 读错手写分数 |

## 核心体验

### 家庭学习工作台

家庭首页按孩子组织信息，并把最重要的动作提前：快捷入口、每门学科的最新正式诊断、优先行动、四项学习统计和紧凑学科状态。没有正式诊断的学科不会占据诊断区空间；AI 用量与成本估算只在家庭首页提供统一入口。

<p align="center">
  <img src="docs/user-guide/images/01-family-workbench.png" alt="家庭学习工作台" width="270" />
  <img src="docs/user-guide/images/02-student-profile.png" alt="个人学习档案" width="270" />
  <img src="docs/user-guide/images/07-learning-records.png" alt="学习记录时间线" width="270" />
</p>

### 诊断→验证→反馈迭代闭环

报告页展示完整的迭代过程：诊断结论、验证反馈（改善/仍需练习）、卡点状态变化、下一步行动建议。不再是一份静态报告，而是持续追踪学习进展的动态档案。

<p align="center">
  <img src="docs/user-guide/images/04-report.png" alt="诊断报告（含验证反馈）" width="220" />
  <img src="docs/user-guide/images/05-generate-verification.png" alt="验证卷生成" width="220" />
  <img src="docs/user-guide/images/06-paper-preview.png" alt="验证卷预览" width="220" />
</p>

**验证反馈卡片**（诊断报告关联了验证结果时自动显示）：
- 验证状态摘要：`已验证 X 个卡点：Y 个已改善，Z 个仍需练习`
- 卡点状态变化：`发现卡点 → 已改善` 或 `发现卡点 → 仍需练习`
- 下一步行动建议：根据验证结果动态生成

**学习进展页面**（独立页面，展示完整迭代历史）：
- 迭代时间线：纵向展示每一轮诊断和验证
- 卡点变化矩阵：每行一个卡点，每列一个轮次，直观展示状态流转
- 综合建议：基于当前所有卡点状态给出整体学习建议

## AI 视觉模型架构

### 模型选型

| 模型 | 用途 | 调用方式 |
| --- | --- | --- |
| **qwen3.5-plus** | 多模态视觉识别（图片分析） | `enable_thinking: false` 关闭深度思考，单张图 ~15s |
| **deepseek-v4-flash** | 文本生成（题目、学习资源） | 纯文本，不处理图片 |

**模型选型铁律**：必须使用真正的多模态视觉模型，绝不能用纯文本模型做图片分析。

> **历史教训**：项目最初使用 `hy3-preview` 做图片分析，但该模型是纯文本模型（CloudBase [官方文档](https://docs.cloudbase.net/ai/model/multimodal) 明确列为不支持图片），传入图片会被忽略。导致 AI 只从 prompt 文字脑补题目和答案，所有分析结果不可信。2026-07-11 修复为 qwen3.5-plus + enable_thinking:false。

### 验证分析三层防线

验证卷模式专用，确保验证报告零假阳性：

1. **权威标准答案替换**：用 `paper.questions` 的标准答案替换 AI 返回的 `correctAnswer`，防止 AI 自己算错标准答案
2. **数值归一化比较**：`normalizeForCompare` 把 studentAnswer 和 correctAnswer 归一化为可比数值（处理分数↔小数、单位去除），数值相等则丢弃假阳性
3. **OCR 误读交叉验证**：如果 AI 读到的 studentAnswer 恰好等于验证卷中某道题的标准答案，说明 AI 读错了手写体（如把 7/12 读成 2/7），丢弃

详见 [CLAUDE.md](CLAUDE.md) 的"AI 视觉模型架构"章节。

## 三个学科，三种诊断逻辑

同一套闭环不能机械套用到所有学科。本项目为数学、语文和英语保留不同的证据模型和行动方式。

| 学科 | 诊断重点 | 下一步行动 | 验证方式 |
| --- | --- | --- | --- |
| **数学** | 错题背后的知识节点、细粒度卡点、出现频次与置信度 | 知识地图、任务包、同类题迁移练习 | 围绕同一卡点生成新的相似题，验证能否举一反三 |
| **语文** | 具体错字、错词、读音、释义等记忆型错项，以及阅读表达能力型卡点 | 原项复习优先，再补充同音、同形、形近或多义迁移 | 必须把原来识别错误的字词再次放入验证卷，同时加入有限迁移题 |
| **英语** | 个人词库中的"会认"和"会写"两条独立掌握状态 | 今日词汇、认词练习、纸面听写、易混词巩固和错词本 | 口头识别与纸面拼写分别留存证据、分别更新状态 |

<p align="center">
  <img src="docs/user-guide/images/03-subject-workbench.png" alt="数学工作台" width="210" />
  <img src="docs/user-guide/images/09-chinese-workbench.png" alt="语文工作台" width="210" />
  <img src="docs/user-guide/images/12-english-workbench.png" alt="英语工作台" width="210" />
</p>

更多学科规则见[学科设计索引](docs/subject-design/README.md)。

## 工程架构

```mermaid
flowchart TB
    subgraph Client[微信小程序]
      Pages[27 个注册页面]
      Presenters[Presenter 与状态组件]
      Services[数据层与 P0 Skills]
    end
    subgraph Cloud[微信云开发 CloudBase]
      Functions[15 个业务云函数]
      Database[20 个数据库集合]
      Storage[试卷图片与 PDF]
      AI[qwen3.5-plus 视觉 + deepseek-v4-flash 文本]
    end
    subgraph Quality[质量体系]
      Unit[1110 个自动化测试]
      CLI[微信开发者工具 CLI E2E]
      Perf[性能与包体基线]
    end
    Pages --> Presenters --> Services --> Functions
    Functions --> Database
    Functions --> Storage
    Functions --> AI
    Unit --> Services
    CLI --> Pages
    Perf --> Client
```

| 层级 | 主要技术 |
| --- | --- |
| 客户端 | 微信小程序原生 WXML / WXSS / JavaScript，按需注入与 17 个独立分包 |
| 云端 | 微信云开发 CloudBase，15 个业务云函数、云数据库、云存储 |
| AI | `qwen3.5-plus` 多模态视觉识别 + `deepseek-v4-flash` 题目与内容生成 |
| 文档与 PDF | pdfkit、内置 Noto CJK 字体、结构化报告与验证卷 |
| 测试 | Node.js `node:test`、自研页面 harness、`miniprogram-automator` CLI E2E |

详细设计见[系统架构](docs/ARCHITECTURE.md)、[云函数 API](docs/CLOUD_FUNCTIONS.md)和[数据字典](docs/DATA_DICTIONARY.md)。

## 项目结构

```text
miniprogram-learning-diagnostic/
├── miniprogram/              # 小程序页面、组件、服务和本地数据（27 页面）
├── cloudfunctions/           # 15 个业务云函数与共享模板
├── data/                     # 150 个数学知识节点、40 个细卡点、脱敏示例数据
├── scripts/                  # 构建、校验、性能、截图和 DevTools E2E
├── tests/                    # 99 个测试文件，1110 个自动化测试
├── docs/                     # 产品、学科、架构、测试和图文文档
├── database/                 # 数据库索引声明
├── README.md                 # GitHub 项目主页
├── PRD.md                    # 当前产品需求基线
├── CLAUDE.md                 # AI 编码助手约定（含 AI 视觉模型架构）
└── SETUP.md                  # 本地与云开发配置
```

## 快速开始

### 环境要求

- Node.js 18 或更高版本
- npm
- 微信开发者工具
- 已开通云开发的微信小程序账号

### 本地检查

```bash
git clone <repository-url>
cd miniprogram-learning-diagnostic
npm install
npm run verify          # 1110 个自动化测试 + 347 个 JS 文件语法检查
npm run check:size      # 主包体积预算检查
```

使用微信开发者工具导入项目根目录，确认 `project.config.json` 中的 AppID 和云开发环境配置，再按[部署指南](SETUP.md)创建集合、索引并部署云函数。

### 常用命令

```bash
npm test                    # 1110 个常规自动化测试
npm run check               # 检查 347 个 JavaScript 文件
npm run check:size          # 主包体积预算检查
npm run test:coverage       # 覆盖率门禁
npm run test:e2e:doctor     # 检查微信开发者工具 CLI 环境
npm run test:e2e:all        # 主要页面与学科 CLI E2E
npm run perf:baseline       # CLI 性能基线
```

真实云环境、真实图片和真机测试默认与离线测试隔离，避免误调用 AI 或写入真实数据。完整说明见[测试指南](docs/TESTING.md)。

## 当前质量基线

以下数字来自 2026-08-01 当前工作区的发布收口验证：

| 指标 | 当前结果 | 复现命令 |
| --- | ---: | --- |
| 常规自动化测试 | **1110 / 1110 通过** | `npm test` |
| JavaScript 语法检查 | 347 个文件通过 | `npm run check` |
| 主包体积 | **810 KB / 1200 KB**（剩余 390 KB） | `npm run check:size` |
| 注册页面 | 27 | `miniprogram/app.json` |
| 业务云函数 | 15 | `cloudfunctions/`，不含 `_shared-templates` |
| 测试文件 | 99 个 | `package.json` |
| 数据库集合 | 20 | `docs/DATA_DICTIONARY.md` |
| 数学知识节点 | 150 | `data/math/knowledge-nodes.seed.json` |
| 标准细卡点 | 40 | `cloudfunctions/analyzeBatch/taxonomy-bn-list.js` |

主包距离 1200 KB 内部预算约有 391 KB 空间，但新增大体积资源仍应优先评估分包，且不得突破微信平台 2 MB 主包限制。发布门禁、真实数据烟测和回滚流程见[发布清单](docs/RELEASE_CHECKLIST.md)。

## 文档导航

| 想了解什么 | 从这里开始 |
| --- | --- |
| 产品定位与当前范围 | [PRD](PRD.md) · [产品文档索引](docs/product/README.md) |
| 看图了解完整使用流程 | [图文用户导览](docs/user-guide/README.md) |
| 数学、语文、英语为什么不同 | [学科设计索引](docs/subject-design/README.md) |
| AI 视觉模型架构与三层防线 | [CLAUDE.md](CLAUDE.md) "AI 视觉模型架构"章节 |
| 前后端如何协作 | [系统架构](docs/ARCHITECTURE.md) · [云函数 API](docs/CLOUD_FUNCTIONS.md) |
| 数据存在哪里 | [数据字典](docs/DATA_DICTIONARY.md) |
| 如何配置和部署 | [部署指南](SETUP.md) · [部署与烟测](docs/DEPLOYMENT.md) |
| 如何测试和发布 | [测试指南](docs/TESTING.md) · [测试矩阵](docs/TEST_MATRIX.md) · [发布清单](docs/RELEASE_CHECKLIST.md) |
| 遇到问题如何处理 | [故障排查](docs/TROUBLESHOOTING.md) |
| 全部当前文档与历史资料 | [文档中心](docs/README.md) |

## 隐私与数据边界

本仓库只应包含脱敏示例、结构化种子数据和实现文档。真实孩子姓名、学校、班级、账号、试卷原图、诊断报告、PDF 输出和任何可识别个人身份的数据不得提交到 GitHub。对外分享截图前应再次检查头像、姓名、原始作答和云文件信息。

## 项目状态

当前项目处于**私有内测和持续迭代阶段**。数学诊断、微验证与节点掌握六态闭环，语文具体错项复测，以及英语词汇双维闭环均已落地。2026-08-01 已确认本周期云函数部署完成、主要流程真机验收无重大问题，并完成全部 DevTools E2E 与 14 张用户导览截图刷新。订阅消息发送链路仍未实现；学习资源扩展与订阅消息方案将在本轮收口之后另行设计。

项目的重要变化记录在 [CHANGELOG](CHANGELOG.md)。

## License

Private project. All rights reserved.

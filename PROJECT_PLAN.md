# 学习卡点诊断小程序 — 项目开发计划

**创建日期**: 2026-06-09
**最后更新**: 2026-07-18
**项目状态**: 私有内测持续迭代；数学、语文具体错项复测和英语词汇双维闭环已落地。默认离线测试 1008/1008、JS 检查 313 个文件、主包 791 KB/1200 KB（预算 2026-07-18 由 800 上调）；Android/iOS emoji 目标设备兼容基线已固化
**负责人**: qiming

---

## 一、项目概述

### 1.1 项目背景

本项目是学习诊断 MVP 的微信小程序产品。此前已通过纯 AI 流程完成了钟青羽的学习卡点诊断（第一版 + 第二版，共分析 132 张试卷图片、80+ 道错题、10 大类卡点），并生成了诊断报告、验证卷等纸质材料。

核心问题是：诊断流程依赖电脑端操作（拍照 → 传到电脑 → QoderWork 分析），不够便捷。需要一个微信小程序，让家长可以直接用手机拍照上传试卷，自动完成 AI 分析并查看诊断报告。

### 1.2 产品定位

面向家长的轻量级学习诊断工具：拍照上传试卷 → AI 定位学习卡点 → 生成报告 → 出验证卷 → 上传作答反馈。

### 1.2A 当前界面截图

文档截图位于 `docs/user-guide/images/`，由匿名 mock 数据生成，可用于产品说明和验收对照：

| 家庭工作台 | 学科工作台 | 诊断报告 |
|---|---|---|
| ![家庭工作台](docs/user-guide/images/01-family-workbench.png) | ![学科工作台](docs/user-guide/images/03-subject-workbench.png) | ![诊断报告](docs/user-guide/images/04-report.png) |

### 1.3 核心功能（V1）

MVP 三条诊断路径：

| 路径 | 流程 | 优先级 |
|------|------|--------|
| 拍照诊断 | 上传试卷照片 → AI 异步分析 → 推送通知 → 查看报告 | P0 |
| 验证试卷 | 选历史卡点 → AI 生成验证卷(A4 PDF) → 打印答题 → 上传 → 验证报告 | P0 |
| 默认诊断试卷 | 选年级 → AI 生成诊断卷(A4 PDF) → 打印答题 → 上传 → 诊断报告 | P0 |

**P0 功能清单**：

| 功能 | 说明 |
|------|------|
| 个人学习工作台 | 个人行动摘要、今日行动、最新诊断报告、行动队列和三科学科入口 |
| 家庭工作台 / 学生管理 | 0/1/多孩子自适应入口，多孩子显示行动总览的家庭工作台，单孩子直接进入个人学习工作台 |
| 家长成员管理 | owner 可邀请共同家长，共同家长除成员管理外具备学习流程操作权限 |
| 学科工作台 | 数/语/英三科独立，学科页承接主任务、待处理队列和工具入口 |
| 拍照上传 | 支持最多 20 张，支持 HEIF 转换或提示，上传即返回，分析异步进行 |
| AI 诊断分析 | 云函数分批处理（5张/批），混元 hy3-preview 视觉模型 |
| 诊断报告 | 卡点排行、错题详情、改善/加重/新增状态对比 |
| 验证试卷生成 | 出卷配置器选择范围，AI 生成 5 题/卡点（3 核心验证 + 2 迁移延展），A4 PDF 下载 |
| 默认诊断试卷 | AI 按年级动态生成，无需预存题库 |
| 学习记录 | 按天聚合诊断报告、验证试卷、验证上传和原始照片 |
| 卡点短名称 | 对家长和学生展示“小数分数、单位换算”等短摘要，不直接暴露 LP 编号 |
| PDF 下载状态 | 已下载试卷显示「已下载」，避免重复下载 |
| 异步推送 | 微信订阅消息，分析完成后推送通知 |

---

## 二、项目路径

```
/Users/qiming/Downloads/GoogleDrive/AI Learning/miniprogram-learning-diagnostic/
```

### 2.1 目录结构（最新）

```
miniprogram-learning-diagnostic/
├── project.config.json              # 微信开发者工具项目配置（cloudbaseRoot: cloud1-d6gneg68m5a7a3876）
├── package.json                     # npm scripts: test / test:coverage / check / verify
├── PROJECT_PLAN.md                  # 本文件
├── PRD.md                           # 产品设计文档（v2.9）
├── SETUP.md                         # 部署指南
│
├── miniprogram/                     # 小程序前端代码
│   ├── app.js                       # 全局入口，初始化云开发（env: cloud1-d6gneg68m5a7a3876）
│   ├── app.json                     # 全局配置（25 个页面路由：主包 8 + 分包 17）
│   ├── app.wxss                     # 全局样式
│   ├── sitemap.json                 # 站点地图配置
│   │
│   ├── utils/
│   │   ├── util.js                  # 日期/严重度/卡点短名称等工具函数
│   │   ├── cloud.js                 # 云函数调用封装 + 数据访问层
│   │   └── poller.js                # 通用轮询器（createPoller）
│   │
│   ├── components/                  # 自定义组件目录（当前为空占位）
│   │
│   ├── components/                  # 公共组件（status-view 状态区块）
│   └── pages/                       # 25 个注册页面
│       ├── index/                   # Page 1：首页（空态/家庭工作台/单孩子分流）
│       ├── student-profile/         # Page 1A：单孩子学习档案
│       ├── add-student/             # 添加学生页（创建学生+三条学科档案）
│       ├── subject-home/            # Page 3：学科工作台（主任务 + 待处理队列 + 工具）
│       ├── upload/                  # Page 4：拍照上传（异步）
│       ├── upload-history/          # Page 4A：学习记录时间线
│       ├── parent-management/       # Page 5A：家庭成员管理
│       ├── join-student/            # Page 5B：扫码加入孩子档案
│       ├── report/                  # Page 6：诊断/验证报告（含 presenter）
│       ├── bottleneck-center/       # Page 6A：学习卡点中心
│       ├── bottleneck-detail/       # Page 6B：单卡点详情与证据链
│       ├── knowledge-map/           # 数学知识地图
│       ├── learning-resource/       # 学习资源包/任务包
│       ├── english-practice/        # 英语认词练习
│       ├── english-dictation/       # 英语纸面听写
│       ├── english-wrong-words/     # 英语错词本
│       ├── generate-verification/   # Page 7：验证试卷出卷配置器
│       ├── default-paper/           # Page 8：默认诊断试卷选择
│       ├── paper-preview/           # Page 9：试卷预览/打印
│       └── ai-usage/                # AI 用量账本、内测授权和数据删除入口
│
├── cloudfunctions/                  # 云函数（后端，14 个）
│   ├── uploadAndAnalyze/            # 入口：校验参数、创建 reports、后台触发 analyzePhotos
│   ├── analyzePhotos/               # 主控：拆分批次、串行分析、去重、合并、对比、落库
│   │   ├── index.js                 #   主流程
│   │   ├── comparison.js            #   验证报告对比逻辑
│   │   └── photo-dedup.js           #   OCR 摘要去重
│   ├── analyzeBatch/                # 单批次分析（≤5张）
│   │   ├── index.js                 #   调 CloudBase AI hy3-preview
│   │   └── result-normalizer.js     #   AI 返回结构化归一
│   ├── getAnalysisProgress/         # 轻量查询 analysisTasks 进度
│   ├── studentAccess/               # 家长成员、邀请和加入管理
│   ├── studentData/                 # 访问感知的学习资料聚合读取
│   ├── generatePaper/               # 生成验证/默认试卷 + A4 PDF（支持 preview）
│   ├── regenerateVerificationPaper/  # 验证卷短任务续跑
│   ├── generateReportPDF/           # 生成报告 PDF，回写 reports.pdfFileId
│   ├── reportFeedback/              # 家长反馈入口，记录报告/卡点/错题/照片纠错
│   ├── englishVocabulary/           # 英语个人词库、20 词听写、AI 判定和掌握度更新
│   ├── learningResource/            # 学习卡点任务包生成和状态更新
│   ├── reanalyzeMathHistory/        # 历史数学报告重算维护工具
│   └── aiUsage/                     # AI 用量账本、内测授权、删除请求
│
├── cloud1-d6gneg68m5a7a3876/        # cloudbaseRoot 本地映射（微信开发者工具使用）
├── services/skills/                 # P0 Skill 能力内核
├── cli/ldx.js                       # 本地 CLI 入口
│
├── tests/                           # Node.js 内置测试运行器用例
│   ├── helpers/
│   │   ├── page-harness.js          # 执行真实小程序页面控制器
│   │   └── cloud-function-harness.js# 执行真实云函数并模拟依赖
│   ├── analyze-batch-result.test.js # analyzeBatch 结果标准化
│   ├── cloud-functions.test.js      # 云函数集成流程、权限、边界
│   ├── comparison.test.js           # 验证报告对比算法
│   ├── contracts.test.js            # 跨模块契约与回归保护
│   ├── coverage-gap.test.js         # 覆盖缺口补全
│   ├── data-layer.test.js           # 统一数据访问层
│   ├── e2e-real-image.test.js       # 端到端真实图片测试脚本（独立运行，不计入 npm test）
│   ├── page-flows.test.js           # 页面主流程与错误恢复
│   ├── english-vocabulary.test.js   # 英语词库抽题、AI 判定和间隔复测规则
│   ├── english-vocabulary-cloud.test.js # 英语词库云函数流程
│   ├── photo-dedup.test.js          # OCR 去重算法
│   ├── poller.test.js               # 通用轮询器
│   ├── project-integrity.test.js    # 页面四件套与 WXML 事件绑定
│   ├── report-presenter.test.js     # 报告视图预计算
│   └── util.test.js                 # 工具函数
│
├── scripts/
│   └── check-js.js                  # node --check 语法检查
│
└── docs/
    ├── TEST_MATRIX.md               # 测试矩阵与验收清单
    └── superpowers/plans/           # 规划辅助材料
```

**工程基线**: 313 个 JavaScript 文件（`npm run check` 校验）；仓库有 89 个 `.test.js` 文件，默认离线集显式执行其中 84 个并通过 1008 个用例。其余为真实云/真实图片 E2E 和专项数学管线测试，按需单独运行。

### 2.2 相关文件索引

| 文件 | 用途 |
|------|------|
| `学习卡点诊断报告_第二版.md` | 钟青羽完整诊断报告（132 张图 / 80+ 错题 / 10 大类） |
| `学习卡点诊断报告_第二版.pdf` | A4 可打印版诊断报告 |
| `第二版验证卷_学生版.pdf` | 19 题验证卷（7 类卡点） |
| `第二版验证卷_教师版.pdf` | 含答案 + 诊断观察要点 |
| `~/.qoderwork/skills/learning-diagnostic/` | 诊断 Skill（含 bug-taxonomy.md 分类体系） |

---

## 三、技术架构

### 3.1 技术选型

| 层级 | 技术 | 说明 |
|------|------|------|
| 前端框架 | 微信小程序原生 | WXML/WXSS/JS，不使用第三方框架 |
| 后端服务 | 微信云开发 (CloudBase) | 云函数 + 云数据库 + 云存储，零服务器 |
| AI 模型（图像） | CloudBase AI `hy3-preview` | 腾讯云混元视觉模型，多模态图片分析 |
| AI 模型（文本） | CloudBase AI `deepseek-v4-flash` | 用于 generatePaper 生成题目 |
| 数据库 | 云开发 MongoDB 兼容数据库 | 15 个核心集合：students / subjectProfiles / reports / papers / analysisTasks / studentMembers / studentInvites / reportFeedback / englishImportBatches / studentEnglishWords / englishPracticeSessions / learningResourcePacks / aiUsageEvents / dataDeletionRequests / userConsents |
| 图片存储 | 云开发云存储 | 试卷照片上传至云存储，生成临时 URL 供 AI 分析 |
| PDF 生成 | pdfkit（云函数内） | 生成 A4 试卷/报告 PDF，上传云存储；云函数内置 Noto CJK 中文字体 |
| 本地测试 | Node.js 内置 test runner | `npm test` 显式运行常规测试文件，真实图片 E2E 单独运行，无需 Jest/Mocha |

### 3.2 架构图

```
┌─────────────────────────────────────────────────────────────┐
│                     微信小程序（前端）                        │
│                                                             │
│  ┌──────────┐  ┌──────────┐  ┌──────────┐  ┌────────────┐  │
│  │ 首页      │→│ 学科详情  │→│ 拍照上传  │→│ 报告展示    │  │
│  │ 学习档案  │  │ +学习记录 │  │ 多张批量  │  │ 卡点/错题  │  │
│  └──────────┘  └──────────┘  └──────────┘  └────────────┘  │
│       ↑              ↑             │              ↑         │
│       └──────────────┴─────────────┴──────────────┘         │
│                    cloud.js 封装调用                         │
└──────────────────────────┬──────────────────────────────────┘
                           │ wx.cloud.callFunction()
                           ▼
┌─────────────────────────────────────────────────────────────┐
│                    微信云开发（后端）                          │
│                                                             │
│  ┌─────────────────┐  ┌────────────┐  ┌──────────────────┐  │
│  │ analyzePhotos   │  │generateRpt │  │ getStudentData   │  │
│  │                 │  │            │  │                  │  │
│  │ 1.下载图片→b64  │  │ 格式化报告  │  │ 学生档案         │  │
│  │ 2.调混元 Vision │  │ +趋势对比   │  │ +进度追踪        │  │
│  │ 3.解析JSON结果  │  │            │  │ +卡点统计         │  │
│  │ 4.存DB          │  │            │  │                  │  │
│  └────────┬────────┘  └────────────┘  └──────────────────┘  │
│           │                                                  │
│           ▼                                                  │
│  ┌─────────────────┐  ┌────────────┐  ┌──────────────────┐  │
│  │  云存储 (photos) │  │ 云数据库    │  │  混元 AI API     │  │
│  │  试卷图片文件    │  │ students   │  │  hy3-preview     │  │
│  │                 │  │ reports    │  │  hunyuan.        │  │
│  │                 │  │ photos     │  │  tencentcloudapi │  │
│  └─────────────────┘  └────────────┘  └──────────────────┘  │
└─────────────────────────────────────────────────────────────┘
```

### 3.3 数据模型（调整后）

#### students 集合

```javascript
{
  _id: String,
  _openid: String,
  name: String,
  grade: Number,        // 1-6
  avatarColor: String,
  createdAt: Date,
  updatedAt: Date
}
```

#### subjectProfiles 集合（新增）

```javascript
{
  _id: String,
  _openid: String,
  studentId: String,
  subject: String,      // 'math' | 'chinese' | 'english'
  totalReports: Number,
  pendingBottlenecks: [
    { lpCode: String, lpName: String, severity: String, sinceDate: Date }
  ],
  improvedBottlenecks: [
    { lpCode: String, lpName: String, improvedDate: Date }
  ],
  currentAnalysisId: String,
  analysisStatus: String,  // 'uploading' | 'analyzing' | null
  createdAt: Date,
  updatedAt: Date
}
```

#### reports 集合（更新）

```javascript
{
  _id: String,
  _openid: String,
  studentId: String,
  subject: String,
  type: String,           // 'diagnosis' | 'verification'
  sourceType: String,     // 'photo' | 'paper' | 'default-paper'
  status: String,         // 'analyzing' | 'completed' | 'failed'
  imageFileIds: [String], // 云存储文件 ID 列表（替代独立 photos 集合）
  paperId: String,        // 关联的试卷 ID
  
  // 分析结果
  summary: String,
  totalErrors: Number,
  bottlenecks: [
    { lpCode, lpName, errorCount, severity, status, rootCause, suggestion }
  ],
  errorDetails: [
    { questionContent, studentAnswer, correctAnswer, lpCode, rootCause }
  ],
  
  // 验证报告对比
  previousReportId: String,
  comparisonSummary: String,
  
  completedAt: Date,
  createdAt: Date
}
```

#### papers 集合（新增）

```javascript
{
  _id: String,
  _openid: String,
  studentId: String,
  subject: String,
  type: String,           // 'verification' | 'default-diagnosis'
  grade: Number,
  bottleneckTargets: [String],
  questions: [
    { index: Number, lpCode: String, content: String, answer: String, points: Number }
  ],
  pdfFileId: String,
  totalPages: Number,
  createdAt: Date
}
```

#### analysisTasks 集合（新增，异步任务追踪）

```javascript
{
  _id: String,
  _openid: String,
  reportId: String,
  totalBatches: Number,
  completedBatches: Number,
  status: String,        // 'pending' | 'processing' | 'completed' | 'failed'
  imageFileIds: [String],
  mode: String,           // 'diagnosis' | 'verification' | 'paper'
  subject: String,
  studentId: String,
  createdAt: Date,
  completedAt: Date
}
```

### 3.4 页面路由（最新，与 app.json 一致）

| 页面 | 路径 | 参数 | 功能 |
|------|------|------|------|
| 首页 | `pages/index/index` | — | 家庭学习工作台 / 单孩子个人学习工作台 |
| 添加学生 | `pages/add-student/add-student` | — | 创建学生并同步生成三条学科档案 |
| 学科主页 | `pages/subject-home/subject-home` | `?studentId=&subject=&subjectName=&studentName=&grade=` | 学科工作台：主任务 + 待处理队列 + 工具入口 + 分析状态轮询 |
| 拍照上传 | `pages/upload/upload` | `?mode=diagnosis\|verification\|paper&studentId=&subject=&paperId=` | 上传照片，最多 20 张；创建报告后立即返回 |
| 学习记录 | `pages/upload-history/upload-history` | `?studentId=&subject=&subjectName=&studentName=` | 按天聚合报告、试卷、验证上传、照片、OCR 摘要和重复标记 |
| 诊断/验证报告 | `pages/report/report` | `?id=reportId` | 卡点排行 + 错题详情 + 验证入口 + PDF 下载 + 重试分析 |
| 验证试卷生成 | `pages/generate-verification/generate-verification` | `?studentId=&subject=&subjectName=&bottlenecks=&targetCode=` | 配置出题范围 → 预览/生成 A4 PDF |
| 默认诊断试卷 | `pages/default-paper/default-paper` | `?studentId=&subject=&subjectName=&studentName=&grade=` | 选年级/套题 → 缓存复用或 AI 生成 |
| 试卷预览/打印 | `pages/paper-preview/paper-preview` | `?paperId=` 或 `?fileId=&type=` | A4 预览 + 下载 PDF + 分享打印 + 跳转上传答题 |

> 注：原"AI 分析中"独立页面和 `pages/subject-select/subject-select` 学科选择页已移除；分析状态在学科主页和报告页通过 `createPoller()` 每 10s 轮询展示。

---

## 四、AI 分析流程（当前实现）

### 4.1 当前架构：服务端可靠触发 + 前端立即返回

```
用户操作（小程序端）          云函数（后台）
─────────────────────      ──────────────────────────
拍照上传 → 云存储
  → callUploadAndAnalyze
                           ↓
                    uploadAndAnalyze:
                      - 校验参数与学生归属
                      - 创建 reports (status=analyzing)
                      - 更新 subjectProfiles.analysisStatus
                      - cloud.callFunction('analyzePhotos') ← fire-and-forget
                      - 立即返回 reportId
                           ↓
                    analyzePhotos:
                      - 读取 reports，拆分 5 张/批
                      - 创建 analysisTasks (status=processing)
                      - 串行调用 analyzeBatch × N
                      - markDuplicatePages() 标记重复
                      - mergeBatchResults() 仅汇总唯一页面
                      - 验证模式调 compareBottlenecks()
                      - 更新 reports / subjectProfiles / analysisTasks
                      - sendNotification() ← 当前空实现
                           ↓
                    返回 { success, reportId }
  ← 提交成功后返回学科主页
                           ↓
                    subject-home / report 每 10s 轮询
                           ↓
                    status=completed → 刷新视图
```

> **当前实现说明**：`uploadAndAnalyze` 已经不等待 `analyzePhotos` 完成；云函数超时保持在微信平台允许的 60 秒以内，长耗时分析通过任务进度、轮询和手动重试恢复。

### 4.2 云函数设计

| 云函数 | 职责 |
|----------|------|
| `uploadAndAnalyze` | 接收 fileIDs/imageMetas/studentId/subject/mode/paperId → 校验 → 创建 reports + 更新 subjectProfiles → fire-and-forget 启动 analyzePhotos |
| `analyzePhotos` | 读取 reports → 拆 5 张/批 → 串行调 analyzeBatch → markDuplicatePages → mergeBatchResults → compareBottlenecks（验证模式）→ 写库 |
| `analyzeBatch` | 接收 ≤5 张 fileID → getTempFileURL → CloudBase AI hy3-preview → result-normalizer 归一 → 返回 pageResults |
| `getAnalysisProgress` | 按 reportId 查询最新 analysisTasks，返回 status/completedBatches/totalBatches |
| `generatePaper` | 调 deepseek-v4-flash 生成题目 → pdfkit 渲染 A4 PDF → 上传云存储；支持 preview=true 不落库 |
| `generateReportPDF` | 读 reports → pdfkit 渲染报告 PDF → 上传云存储 → 回写 reports.pdfFileId |
| `reportFeedback` | 接收报告、卡点、错题和照片维度的家长反馈，记录纠错线索但不覆盖原始报告 |
| `englishVocabulary` | 管理钟青羽个人英语词库，生成 20 词听写队列，接收语音识别结果并更新掌握度和复测节奏 |

### 4.3 AI Prompt 设计

System Prompt 包含：

- **角色定义**：资深小学数学教师
- **颜色规则**：黑色=原始作答，蓝色=订正，红色=批改
- **输出格式**：结构化 JSON（bottlenecks 数组 + summary + errorDetails）
- **每道错题字段**：questionContent, studentAnswer, correctAnswer, lpCode, rootCause, suggestion

### 4.3 卡点分类体系（10 大类）

来自 `learning-diagnostic` Skill 的 `bug-taxonomy.md`：

| 代号 | 类别 | 说明 |
|------|------|------|
| BUG-OP | 运算顺序与优先级 | 子运算执行失败导致连锁错误 |
| BUG-FD | 分数/小数基础计算 | 通分、约分、小数点定位、加减方向 |
| BUG-RP | 比例与比值概念 | 参照系混淆、正反比例搞反 |
| BUG-PT | 百分比应用 | 基准量识别、分率 vs 具体量 |
| BUG-UN | 单位与量纲 | 面积/体积公式串扰、单位混用 |
| BUG-GEO | 空间与几何 | 圆周长/面积增量、旋转体、嵌套立体 |
| BUG-MOD | 应用题建模 | 植树问题、借瓶、周期分析、分段行程 |
| BUG-PRE | 计算精度与验算 | 改对为错、最后一步出错、缺乏验算 |
| BUG-LANG | 数学语言转换 | "延长 n 倍"语义、做到一半就停 |
| BUG-AXIS | 数轴与代数几何 | 折叠对称方向、动点距离 |

---

## 五、环境与模型配置

`analyzeBatch` 和 `generatePaper` 通过 `@cloudbase/node-sdk` 使用当前云开发环境的 CloudBase AI 能力，调用 `hy3-preview`（图像）与 `deepseek-v4-flash`（文本）。部署前需在该环境开通这两个模型。代码不再读取 `SECRET_ID`、`SECRET_KEY`、`AI_API_KEY`、`AI_API_URL`。

`generatePaper` 和 `generateReportPDF` 云函数目录内已内置 `NotoSansCJKsc-Regular.otf`。部署时请确认字体文件随云函数一起上传；不需要再配置字体环境变量，也不会回退到 Helvetica。

---

## 六、当前进度（2026-07-02 更新）

### 6.1 已完成（代码 + 自动化测试）

| 类别 | 状态 | 说明 |
|------|------|------|
| **前端页面（20个）** | ✅ | `index` / `student-profile` / `add-student` / `subject-home` / `upload` / `upload-history` / `parent-management` / `join-student` / `report` / `bottleneck-center` / `bottleneck-detail` / `knowledge-map` / `learning-resource` / `english-practice` / `english-dictation` / `english-wrong-words` / `generate-verification` / `default-paper` / `paper-preview` / `ai-usage`，全部四件套完整且 WXML 事件绑定正确 |
| **云函数（14个）** | ✅ | `uploadAndAnalyze` / `analyzePhotos`（含 comparison.js、photo-dedup.js）/ `analyzeBatch`（含 result-normalizer.js）/ `getAnalysisProgress` / `studentAccess` / `studentData` / `generatePaper` / `regenerateVerificationPaper` / `generateReportPDF` / `reportFeedback` / `englishVocabulary` / `learningResource` / `reanalyzeMathHistory` / `aiUsage` |
| **数据访问层** | ✅ | `utils/cloud.js` 封装学生/学科档案/报告/试卷/分析进度/云函数调用；无过时 photos 集合引用 |
| **通用轮询器** | ✅ | `utils/poller.js` 支持 stop/onTimeout/异步 request，被 subject-home 与 report 使用 |
| **卡点短名称展示** | ✅ | `utils/util.js` 提供 `formatBottleneckDisplayName/List`，页面不再向家长展示裸 LP 编号 |
| **结果标准化** | ✅ | `analyzeBatch/result-normalizer.js` 校验 pageResults 数量、imageIndex 唯一、字段截断、severity 归一 |
| **OCR 去重** | ✅ | `analyzePhotos/photo-dedup.js` 跨批次+跨历史报告指纹比对；全部重复时仅写 summary 不更新卡点 |
| **验证对比** | ✅ | `analyzePhotos/comparison.js` 输出 improved/worsened/new/persisting + 摘要文案 |
| **上传分析解耦** | ✅ | `uploadAndAnalyze` 创建报告后 fire-and-forget 启动 `analyzePhotos`；`report.onRetryAnalysis()` 支持手动重启 |
| **参数校验与归属校验** | ✅ | 各云函数入口检查 fileIDs/studentId/subject/mode/paperId/openID |
| **PRD.md** | ✅ | v2.9，含家庭/个人学习工作台、页面职责边界、卡点透出体系、英语个人词库听写和实现状态总览 |
| **SETUP.md** | ✅ | 部署指南（环境配置 + 索引 + 字体 + 云函数部署） |
| **学习卡点透出体系** | ✅ | 首页高优先级卡点、卡点中心、单卡点工作台和验证卷 `targetCode` 闭环已接通 |
| **Skill / CLI P0** | ✅ | `services/skills` 和 `cli/ldx.js` 覆盖诊断、报告、卡点、验证卷、反馈和时间线能力 |
| **自动化测试** | ✅ | 1008 个默认离线用例全绿（`npm test`），覆盖页面流程、云函数、数据层、契约、去重、轮询、报告视图、语文错项、英语词库听写、AI 用量账本、工具函数、Skill/CLI 和设计系统契约 |
| **端到端真实图片脚本** | ✅ | `tests/e2e-real-image.test.js` 单独运行，串通上传 → AI 分析 → 报告生成链路 |
| **JS 语法检查** | ✅ | `npm run check` 校验 217 个文件 |
| **学科隔离** | ✅ | 数/语/英三科独立档案，家庭页和个人页都提供可点击学科入口，单学科工作台承接具体操作 |
| **20张照片支持** | ✅ | `upload` 页面限制 20 张，`analyzePhotos` 自动分批（5张/批） |
| **学习记录** | ✅ | `upload-history` 按天展示诊断报告、验证试卷、验证批复和原始照片 |
| **试卷下载状态** | ✅ | `paper-preview` 对已下载 PDF 显示「已下载」，防止重复下载 |
| **PDF 中文字体内置** | ✅ | `generatePaper` 与 `generateReportPDF` 使用函数目录内的 Noto CJK 字体，缺失时直接返回明确错误 |
| **AI 模型通过 CloudBase AI 调用** | ✅ | `analyzeBatch` 与 `generatePaper` 使用 `@cloudbase/node-sdk`，不再读取 SECRET_ID/SECRET_KEY/AI_API_KEY |
| **英语词汇闭环** | ✅ | 英语工作台改为个人词库掌握首页，`english-practice` 做认词练习，`english-dictation` 做纸面听写与 OCR 批改，`english-wrong-words` 汇总错词与复测 |

### 6.2 待完成（部署 + 配置 + 真机验收）

| 步骤 | 状态 | 说明 |
|------|------|------|
| 配置云开发环境 ID | ⬜ | 已写入 `project.config.json.cloudbaseRoot` 与 `app.js`；如需更换环境请同步修改两处 |
| 开通 CloudBase AI 模型 | ⬜ | 在当前云开发环境开通 `hy3-preview` 与 `deepseek-v4-flash` |
| 确认内置中文字体 | ⬜ | 确认 `generatePaper` 与 `generateReportPDF` 目录内的 `NotoSansCJKsc-Regular.otf` 随云函数上传 |
| 部署云函数 | ⬜ | 微信开发者工具 → 右键每个云函数目录 → "上传并部署：云端安装依赖"；所有云函数超时保持在 60 秒以内 |
| 添加微信同声传译插件 | ⬜ | 英语听写依赖 WechatSI 语音识别与 TTS；插件不可用时页面会展示可恢复降级提示 |
| 创建数据库集合与安全规则 | ⬜ | 主学习数据集合使用创建者规则；`studentMembers` / `studentInvites` 通过云函数访问 |
| 创建数据库复合索引 | ⬜ | 见 SETUP.md 第五章"数据库索引"表 |
| 真机端到端验收 | ⬜ | 添加学生 → 上传 1/20 张试卷 → AI 分析 → 查看报告 → 生成验证卷 → 下载 PDF → 打印 |
| 微信订阅消息 | ⬜ | PRD P0；当前 `sendNotification` 为空实现，需申请模板并完成授权、发送和跳转 |
| 默认试卷跨学生缓存 | ⬜ | 当前只复用同一学生已生成的试卷，尚未实现共享模板 |
| 上传与分析解耦 | ✅ | `uploadAndAnalyze` 已 fire-and-forget 启动后台分析 |
| 验证结论证据完整性 | ⚠️ | 当前按"本次未识别出该卡点错误"判定改善，尚未区分答对、空白、模糊或 OCR 漏识别 |

---

## 七、部署操作步骤（详细）

### Step 1: 开通 CloudBase AI 并确认字体

1. 在当前云开发环境中确认 CloudBase AI 可用，并开通 `hy3-preview` 与 `deepseek-v4-flash` 两个模型
2. 确认 `generatePaper` 与 `generateReportPDF` 云函数目录内包含 `NotoSansCJKsc-Regular.otf`

### Step 2: 上传云函数

在微信开发者工具中，对每个云函数目录执行：

1. 左侧文件树找到 `cloudfunctions/<函数名>`
2. **右键** → "上传并部署：云端安装依赖（不上传 node_modules）"
3. 等待控制台显示"上传成功"
4. 对 `cloudfunctions/` 下全部 14 个云函数重复：`uploadAndAnalyze` / `analyzePhotos` / `analyzeBatch` / `getAnalysisProgress` / `studentAccess` / `studentData` / `generatePaper` / `regenerateVerificationPaper` / `generateReportPDF` / `reportFeedback` / `englishVocabulary` / `learningResource` / `reanalyzeMathHistory` / `aiUsage`
5. 在云开发控制台确认各云函数执行超时均不超过 **60 秒**

AI 用量账本或体验版内测相关变更还需要同步部署：`aiUsage`、`analyzeBatch`、`generatePaper`、`learningResource`、`englishVocabulary`、`uploadAndAnalyze`。其中 `uploadAndAnalyze` 负责服务端内测授权门禁，其他 AI 云函数负责真实调用边界的用量事件写入。

### Step 3: 确认云函数配置

1. 点顶部"云开发"按钮 → 进入控制台
2. "云函数" → 逐个检查函数配置
3. 确认 AI 模型已开通、函数超时不超过 60 秒、PDF 字体文件随函数包上传

### Step 4: 编译测试

1. 点左上角"编译"
2. 模拟器显示首页 → 点"添加学生" → 填写提交
3. 点学生卡片 → 点"拍照上传" → 拍 1-2 张试卷 → 点"开始分析"
4. 等待 AI 分析完成 → 自动跳转报告页

### Step 5: 真机预览

1. 点工具栏"预览"按钮 → 扫码在手机上测试
2. 重点验证：相机拍照、图片上传、AI 分析耗时、报告展示

---

## 八、后续版本规划

### V2: 在线验证题

- 在小程序内做验证卷（选择/填空/简答）
- 自动批改 + 更新诊断置信度
- 验证结果与诊断报告的联动展示

### V3: 智能推送

- 根据诊断结果每日推送 3-5 道针对性练习题
- 练习结果反馈到诊断系统，形成"诊断→练习→复诊"闭环

### V4: 多科目扩展

- 语文：字词、阅读理解、作文
- 英语：词汇、语法、阅读
- 复用诊断框架，扩展 bug-taxonomy

---

## 九、已知风险与限制

| 风险 | 影响 | 缓解措施 |
|------|------|---------|
| 混元视觉模型对手写体识别率 | 分析准确率下降 | Prompt 中加入"手写体辨识有不确定性，低置信度要标注" |
| AI 分析耗时（图片多时） | 用户等待体验差 | 限制单次 20 张，显示上传/分析进度 |
| 云函数超时限制 | 大量图片分析超时 | 所有云函数保持 60 秒以内；客户端提交后先返回，依靠任务进度、轮询和手动重试恢复 |
| 腾讯云 API 调用费用 | 持续运营成本 | 个人使用量级费用极低，可忽略 |
| 图片 base64 体积大 | 请求体超限 | 上传时已压缩（sizeType: compressed） |

# 学习卡点诊断小程序 — 项目开发计划

**创建日期**: 2026-06-09
**项目状态**: 设计确认（PRD 完成，待写代码）
**负责人**: qiming

---

## 一、项目概述

### 1.1 项目背景

本项目是"AI Learning OS"体系的移动端入口。此前已通过 QoderWork 完成了钟青羽的学习卡点诊断（第一版 + 第二版，共分析 132 张试卷图片、80+ 道错题、10 大类卡点），并生成了诊断报告、验证卷等纸质材料。

核心问题是：诊断流程依赖电脑端操作（拍照 → 传到电脑 → QoderWork 分析），不够便捷。需要一个微信小程序，让家长可以直接用手机拍照上传试卷，自动完成 AI 分析并查看诊断报告。

### 1.2 产品定位

面向家长的轻量级学习诊断工具：拍照 → AI 分析 → 看报告。

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
| 学生管理 | 添加/选择学生，每人独立档案 |
| 学科隔离 | 数/语/英三科独立，每次操作先选科目 |
| 拍照上传 | 支持最多 20 张，上传即返回，分析异步进行 |
| AI 诊断分析 | 云函数分批处理（5张/批），混元 hy3-preview 视觉模型 |
| 诊断报告 | 卡点排行、错题详情、改善/加重/新增状态对比 |
| 验证试卷生成 | 基于历史卡点，AI 生成 3 题/卡点，A4 PDF 下载 |
| 默认诊断试卷 | AI 按年级动态生成，无需预存题库 |
| 异步推送 | 微信订阅消息，分析完成后推送通知 |

---

## 二、项目路径

```
/Users/qiming/Downloads/GoogleDrive/AI Learning/miniprogram-learning-diagnostic/
```

### 2.1 目录结构（调整后）

```
miniprogram-learning-diagnostic/
├── project.config.json              # 微信开发者工具项目配置
├── PROJECT_PLAN.md               # 本文件
├── PRD.md                       # 产品设计文档（v2.0）
│
├── miniprogram/                     # 小程序前端代码
│   ├── app.js                       # 全局入口，初始化云开发
│   ├── app.json                     # 全局配置（7个页面路由）
│   ├── app.wxss                     # 全局样式
│   ├── sitemap.json                 # 站点地图配置
│   │
│   ├── utils/
│   │   ├── util.js                  # 工具函数
│   │   └── cloud.js                 # 云函数调用封装
│   │
│   └── pages/
│       ├── index/                   # Page 1：首页（学生列表）
│       ├── subject-select/          # Page 2：学科选择
│       ├── subject-home/           # Page 3：学科主页（三入口）
│       ├── upload/                 # Page 4：拍照上传（异步）
│       ├── report/                 # Page 6：诊断/验证报告
│       ├── generate-verification/  # Page 7：验证试卷生成
│       ├── default-paper/          # Page 8：默认诊断试卷选择
│       ├── upload-history/         # Page 4A：上传历史
│       └── paper-preview/          # Page 9：试卷预览/打印
│
└── cloudfunctions/                  # 云函数（后端）
    ├── uploadAndAnalyze/           # 上传完成后的入口，创建分析任务
    ├── analyzePhotos/              # 主控：拆分批次、串行调用分析
    ├── analyzeBatch/               # 单批次分析（5张），被 analyzePhotos 调用
    ├── generatePaper/              # 生成验证/默认试卷 + A4 PDF
    ├── generateReportPDF/          # 生成报告 PDF（用于分享/下载）
    └── getAnalysisProgress/        # 查询分析任务进度
```

**文件总数**: 32 个

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
| AI 模型 | 混元 hy3-preview | 腾讯云 Hunyuan 视觉模型，支持多模态图片分析 |
| 数据库 | 云开发 MongoDB 兼容数据库 | 5 个集合：students / subjectProfiles / reports / papers / analysisTasks |
| 图片存储 | 云开发云存储 | 试卷照片上传至云存储，生成临时 URL 供 AI 分析 |
| PDF 生成 | pdfkit（云函数内） | 生成 A4 试卷/报告 PDF，上传云存储 |

### 3.2 架构图

```
┌─────────────────────────────────────────────────────────────┐
│                     微信小程序（前端）                        │
│                                                             │
│  ┌──────────┐  ┌──────────┐  ┌──────────┐  ┌────────────┐  │
│  │ 首页      │→│ 学生详情  │→│ 拍照上传  │→│ 报告展示    │  │
│  │ 学生列表  │  │ +历史报告 │  │ 多张批量  │  │ 卡点/错题  │  │
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

### 3.4 页面路由（调整后）

| 页面 | 路径 | 参数 | 功能 |
|------|------|------|------|
| 首页 | `pages/index/index` | — | 学生列表，添加学生 |
| 学科选择 | `pages/subject-select/subject-select` | `?studentId=` | 数/语/英三科卡片 |
| 学科主页 | `pages/subject-home/subject-home` | `?studentId=&subject=` | 三入口 + 历史记录 + 分析状态 |
| 拍照上传 | `pages/upload/upload` | `?mode=diagnosis|verification|paper` | 上传照片，最多 20 张，上传即返回 |
| 诊断/验证报告 | `pages/report/report` | `?id=reportId` | 卡点排行 + 错题详情 + 验证入口 |
| 验证试卷生成 | `pages/generate-verification/generate-verification` | `?studentId=&subject=` | 选卡点 → 生成 A4 PDF |
| 默认诊断试卷 | `pages/default-paper/default-paper` | `?studentId=&subject=&grade=` | 选年级/套题 → 生成 A4 PDF |
| 试卷预览/打印 | `pages/paper-review/paper-review` | `?paperId=` | A4 预览 + 下载 PDF + 分享打印 |

> 注：原"AI 分析中"独立页面已移除，改为在学科主页显示分析状态，结果通过微信订阅消息推送。

---

## 四、AI 分析流程（异步架构）

### 4.1 目标架构：上传与分析完全解耦

当前实现已经支持任务记录、分批分析、轮询和客户端 20 秒超时返回，但 `uploadAndAnalyze` 仍同步等待 `analyzePhotos`。以下流程是目标架构，不代表已经全部完成：

```
用户操作（小程序端）          云函数（后台异步）
─────────────────────      ──────────────────────────
拍照上传 → 云存储
  → 立即返回学科主页
                           ↓
                    拆分图片为 5 张/批
                           ↓
                    逐批调用混元 API
                           ↓
                    每批结果写入 analysisTasks
                           ↓
                    全部完成 → 合并结果
                           ↓
                    更新 reports + subjectProfiles
                           ↓
                    微信订阅消息推送通知
                           ↓
                    用户点击通知 → 查看报告
```

### 4.2 云函数设计

| 云函数 | 职责 |
|----------|------|
| `uploadAndAnalyze` | 接收 fileID 列表 → 创建 reports + analysisTasks 记录 → 触发 analyzePhotos |
| `analyzePhotos` | 读取 analysisTasks → 按 5 张/批拆分 → 串行调用 analyzeBatch → 合并结果 |
| `analyzeBatch` | 接收 5 张 fileID → 下载图片 → 调混元 API → 返回结构化 JSON |
| `generatePaper` | 根据卡点/年级 → 调混元生成题目 → 用 pdfkit 生成 A4 PDF → 上传云存储 |
| `generateReportPDF` | 根据 reportId → 生成报告 PDF → 上传云存储 |

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

`analyzeBatch` 和 `generatePaper` 通过 `@cloudbase/node-sdk` 使用当前云开发环境的 CloudBase AI 能力。部署前需在该环境开通代码中使用的模型。

`generatePaper` 和 `generateReportPDF` 需要配置：

| 变量名 | 必填 | 说明 | 示例值 |
|--------|------|------|--------|
| `FONT_FILE_ID` | 是 | 云存储中的中文字体 | `cloud://xxxxx/SimHei.ttf` |

---

## 六、当前进度（最新）

### 6.1 已完成（前端 + 云函数代码全部写完）

| 类别 | 状态 | 说明 |
|------|------|------|
| **前端页面（9个）** | ✅ | `index` / `subject-select` / `subject-home` / `upload` / `report` / `generate-verification` / `default-paper` / `paper-preview` / `add-student` |
| **云函数（5个）** | ✅ | `uploadAndAnalyze` / `analyzePhotos` / `analyzeBatch` / `generatePaper` / `generateReportPDF` |
| **PRD.md** | ✅ | 完整产品设计文档（v2.0） |
| **SETUP.md** | ✅ | 部署指南（环境配置 + 环境变量 + 云函数部署） |
| **分析任务与轮询** | ⚠️ | 已有任务记录、分批分析和客户端超时返回；`uploadAndAnalyze` 仍同步等待 `analyzePhotos`，尚未完全解耦 |
| **轮询逻辑** | ✅ | `subject-home` + `report` 页面支持轮询分析状态（每10秒） |
| **学科隔离** | ✅ | 数/语/英三科独立档案，每次操作前先选科目 |
| **20张照片支持** | ✅ | `upload` 页面支持最多20张，`analyzePhotos` 自动分批（5张/批） |

### 6.2 待完成（部署 + 配置）

| 步骤 | 状态 | 说明 |
|------|------|------|
| 配置云开发环境 ID | ⬜ | 在微信开发者工具里开通云开发，获取 envID，更新到 `project.config.json` |
| 配置环境变量 | ⬜ | 为 `generatePaper` 和 `generateReportPDF` 配置 `FONT_FILE_ID` |
| 上传中文字体 | ⬜ | 将 `SimHei.ttf` 上传到云存储，获取 `fileID`，配置到 `FONT_FILE_ID` |
| 部署云函数 | ⬜ | 微信开发者工具 → 右键云函数目录 → "上传并部署：云端安装依赖" |
| 创建数据库集合 | ⬜ | `students` / `subjectProfiles` / `reports` / `papers` / `analysisTasks` |
| 配置数据库安全规则 | ⬜ | 每个集合设置：仅创建者可读写 |
| 真机测试 | ⬜ | 添加学生 → 上传试卷 → AI分析 → 查看报告 → 生成验证试卷 |
| 微信订阅消息 | ⬜ | PRD 中为 P0；当前 `sendNotification` 仍为空实现，需申请模板并完成授权、发送和跳转 |
| 默认试卷跨学生缓存 | ⬜ | 当前只复用同一学生已生成的试卷，尚未实现共享模板 |
| 自动化与真机验收 | ⚠️ | 本地自动化见 `docs/TEST_MATRIX.md`；真实 AI、相机、云存储、打印和消息仍需真机验证 |

---

## 七、部署操作步骤（详细）

### Step 1: 开通 CloudBase AI 并上传字体

1. 在当前云开发环境中确认 CloudBase AI 可用，并开通代码使用的模型
2. 将中文字体上传到云存储，记录 `FONT_FILE_ID`

### Step 2: 上传云函数

在微信开发者工具中，对每个云函数目录执行：

1. 左侧文件树找到 `cloudfunctions/analyzePhotos`
2. **右键** → "上传并部署：云端安装依赖（不上传 node_modules）"
3. 等待控制台显示"上传成功"
4. 对 `cloudfunctions/` 下全部六个云函数重复

### Step 3: 配置环境变量

1. 点顶部"云开发"按钮 → 进入控制台
2. "云函数" → `generatePaper` → "配置"标签
3. "环境变量" → 添加：
   - `FONT_FILE_ID` = Step 1 上传字体得到的 fileID
4. 保存，并为 `generateReportPDF` 配置相同变量

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
| 云函数 60s 超时限制 | 大量图片分析超时 | 可拆分为多次调用，每次 5-8 张 |
| 腾讯云 API 调用费用 | 持续运营成本 | 个人使用量级费用极低，可忽略 |
| 图片 base64 体积大 | 请求体超限 | 上传时已压缩（sizeType: compressed） |

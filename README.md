# 学习卡点诊断小程序（Learning Diagnostic Mini Program）

面向家长的 AI 学习诊断工具——拍照上传试卷，自动分析错题并定位学习卡点。

---

## 项目简介

小学家长在辅导孩子时，往往只能看到"这道题做错了"，却难以判断错误背后的知识卡点是什么、是否已经改善。本项目将此前在电脑端完成的诊断流程（已分析 132 张试卷、80+ 道错题、10 大类卡点）迁移到微信小程序，让家长用手机拍照即可获得结构化的诊断报告。

**目标用户**：小学孩子的家长（主操作者），孩子是被诊断对象。

**核心价值**：
- 拍照即诊断：上传试卷照片，AI 自动识别错题并归类到 10 大卡点体系
- 闭环验证：针对历史卡点生成验证试卷，打印作答后再次上传，对比改善情况
- 零门槛使用：微信内完成全流程，无需注册登录，无需专业知识

---

## 功能特性

### 已实现

- ✅ 学生管理：添加/选择学生，每人独立档案
- ✅ 学习档案首页：首屏展示综合摘要、样本覆盖、重点提示、学习记录和下一步建议
- ✅ 学科工作台：数学/语文/英语三科独立，学科页只承载待处理队列、主任务和工具入口
- ✅ 拍照诊断：支持最多 20 张照片批量上传，异步 AI 分析
- ✅ 诊断报告：卡点排行条形图 + 错题详情折叠列表 + 改善状态标注
- ✅ 验证试卷出卷配置：基于历史卡点选择出题范围，生成 A4 PDF 下载打印
- ✅ 默认诊断试卷：按年级动态生成标准诊断卷（1-6 年级 A/B 卷），无需预存题库
- ✅ 试卷预览与打印：A4 预览 + PDF 下载 + 分享打印
- ✅ 试卷下载状态：同一份 PDF 下载后显示「已下载」，避免重复下载
- ✅ 学习记录：按天整理诊断报告、验证试卷、验证作答上传和原始照片，形成学习证据链
- ✅ 照片去重：跨批次 + 跨历史报告的 OCR 指纹比对，避免重复计入
- ✅ AI 结果标准化：字段截断、严重度归一、结构化校验
- ✅ 验证报告对比：标注改善 / 加重 / 新增 / 持续四种状态
- ✅ 分析进度轮询：学科主页和报告页每 10s 轮询，支持手动重试
- ✅ 报告 PDF 生成与下载
- ✅ 数据归属校验：openID 隔离 + 参数白名单
- ✅ 自动化测试：140 个常规用例通过，JS 语法检查 52 文件通过

### 待完善

- ⚠️ 微信订阅消息推送（`sendNotification` 当前为空实现，待申请模板）
- ✅ 上传与分析解耦：创建报告后服务端 fire-and-forget 启动分析，客户端提交后即可返回
- ⚠️ 默认试卷跨学生共享模板（当前仅同学生复用）
- ⬜ 真机端到端验收

---

## 技术栈

| 层级 | 技术 | 说明 |
|------|------|------|
| 前端 | 微信小程序原生 | WXML / WXSS / JS，不使用第三方框架 |
| 后端 | 微信云开发 (CloudBase) | 云函数 + 云数据库 + 云存储，零服务器 |
| AI（图像） | CloudBase AI `hy3-preview` | 腾讯云混元视觉模型，多模态图片分析 |
| AI（文本） | CloudBase AI `deepseek-v4-flash` | 用于生成试卷题目 |
| 数据库 | 云开发 MongoDB 兼容数据库 | 5 个集合：students / subjectProfiles / reports / papers / analysisTasks |
| PDF 生成 | pdfkit | 云函数内生成 A4 试卷/报告 PDF |
| 测试 | Node.js 内置 test runner | `node --test`，无外部测试框架依赖 |

---

## 目录结构

```
miniprogram-learning-diagnostic/
├── miniprogram/                 # 小程序前端
│   ├── app.js / app.json        # 全局入口与配置（10 个页面路由）
│   ├── utils/                   # cloud.js（数据访问层）、poller.js（轮询器）、util.js
│   └── pages/                   # 10 个页面（index / add-student / subject-select /
│                                #   subject-home / upload / upload-history / report /
│                                #   generate-verification / default-paper / paper-preview）
├── cloudfunctions/              # 云函数后端（6 个）
│   ├── uploadAndAnalyze/        #   入口：校验 → 创建报告 → 触发分析
│   ├── analyzePhotos/           #   主控：分批 → 串行分析 → 去重 → 合并 → 对比
│   ├── analyzeBatch/            #   单批次 AI 分析 + 结果标准化
│   ├── getAnalysisProgress/     #   轻量进度查询
│   ├── generatePaper/           #   生成验证/默认试卷 + A4 PDF
│   └── generateReportPDF/       #   生成报告 PDF
├── tests/                       # 自动化测试（140 个常规用例 + 真实图片 E2E 脚本）
├── scripts/                     # check-js.js（语法检查）
├── docs/                        # 补充文档
├── PRD.md                       # 产品设计文档
├── PROJECT_PLAN.md              # 技术架构与开发计划
├── SETUP.md                     # 部署指南
└── package.json                 # npm scripts
```

---

## 快速开始

### 环境要求

- [微信开发者工具](https://developers.weixin.qq.com/miniprogram/dev/devtools/download.html)（最新稳定版）
- Node.js ≥ 18（运行测试和语法检查）
- 微信云开发环境（已在 `project.config.json` 中配置 `cloudbaseRoot`）

### 克隆与打开

```bash
git clone <repo-url>
cd miniprogram-learning-diagnostic
```

用微信开发者工具打开项目根目录，等待编译完成。

### 部署云函数

1. 在云开发控制台开通 `hy3-preview` 和 `deepseek-v4-flash` 两个 AI 模型
2. 将中文字体（推荐 SimHei.ttf）上传到云存储，记录 fileID
3. 对 `cloudfunctions/` 下每个云函数目录右键 → "上传并部署：云端安装依赖"
4. 将 `analyzePhotos` 的执行超时调整为 **900 秒**（`uploadAndAnalyze` 负责快速创建报告和启动任务）
5. 为 `generatePaper` 和 `generateReportPDF` 配置环境变量 `FONT_FILE_ID`

### 配置数据库

在云开发控制台创建以下集合，安全规则设为 `doc._openid == auth.openid`：

- `students`
- `subjectProfiles`
- `reports`
- `papers`
- `analysisTasks`

详细步骤参见 [SETUP.md](./SETUP.md)。

---

## 测试

```bash
# 运行常规自动化测试（140 用例，不含真实图片 E2E）
npm test

# 带覆盖率报告
npm run test:coverage

# 完整验证（测试 + JS 语法检查）
npm run verify
```

端到端真实图片测试脚本需单独运行：

```bash
npm run test:e2e-real-image
```

该脚本依赖本机真实试卷图片路径与 CloudBase 环境，适合作为发布前手动验收。

---

## 项目文档索引

| 文档 | 说明 |
|------|------|
| [PRD.md](./PRD.md) | 产品设计文档 v2.6：学习档案首页、页面职责边界、数据模型、异步架构、学习记录、实现状态总览 |
| [PROJECT_PLAN.md](./PROJECT_PLAN.md) | 技术架构、目录结构、AI 分析流程、部署步骤、版本规划 |
| [SETUP.md](./SETUP.md) | 部署指南：环境配置、云函数部署、字体配置、数据库索引、真机验收 |
| [docs/TEST_MATRIX.md](./docs/TEST_MATRIX.md) | 测试矩阵与验收清单 |

---

## License

[Apache License 2.0](./LICENSE)

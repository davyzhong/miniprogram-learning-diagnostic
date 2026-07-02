# 系统架构文档

> 基于实际代码实现生成，非设计文档。

## 1. 系统概览

学习诊断小程序是一款面向小学生家长的 AI 错题分析工具。用户在小程序内拍照上传试卷/作业，云函数调用腾讯云混元视觉模型（hy3-preview）进行多模态分析，识别错题并归类到预定义的学习卡点体系，最终生成结构化诊断报告和 PDF。系统还支持根据历史卡点自动生成验证试卷和默认诊断试卷，形成"诊断 → 练习 → 验证"的闭环。整个后端运行在微信云开发平台上，零服务器运维。

### 技术栈

| 层级 | 技术 | 说明 |
|------|------|------|
| 前端框架 | 微信小程序原生 | WXML/WXSS/JS，不使用第三方框架 |
| 能力层 | `services/skills` | 诊断、报告、学习卡点、验证卷、验证反馈、时间线等 P0 Skill |
| CLI | `cli/ldx.js` | 面向批量处理、自动化测试和运营调试的命令入口；当前使用 fixture adapter 离线验证 |
| 后端服务 | 微信云开发 (CloudBase) | 云函数 + 云数据库 + 云存储，零服务器 |
| AI 模型（图像分析） | CloudBase AI `hy3-preview` | 腾讯云混元视觉模型，多模态图片分析 |
| AI 模型（题目生成） | CloudBase AI `deepseek-v4-flash` | 用于 generatePaper 生成试卷题目 |
| 数据库 | 云开发 MongoDB 兼容数据库 | 12 个核心集合：students / studentMembers / studentInvites / subjectProfiles / reports / papers / analysisTasks / reportFeedback / englishImportBatches / studentEnglishWords / englishPracticeSessions / learningResourcePacks |
| 文件存储 | 云开发云存储 | 试卷照片、生成的 PDF 文件 |
| PDF 生成 | pdfkit（Node.js） | 云函数内生成 A4 试卷/报告 PDF |
| 中文字体 | 内置 Noto CJK 字体 | `generatePaper` / `generateReportPDF` 随函数部署字体文件，不依赖环境变量 |
| 本地测试 | Node.js 内置 test runner | `npm test` 运行常规测试；真实图片 E2E 单独运行 |

---

## 2. 架构图

```
┌─────────────────────────────────────────────────────────────────────┐
│                       微信小程序（前端）                              │
│                                                                     │
│  ┌──────────┐  ┌────────────┐  ┌──────────────┐  ┌──────────────┐  │
│  │ index    │→│ student-   │→│ subject-     │→│ report       │  │
│  │ 自适应首页 │  │ profile    │  │ home         │  │ 报告展示      │  │
│  │/家庭工作台│  │ 孩子档案     │  │ 学科工作台     │  │ 卡点/错题/PDF │  │
│  └──────────┘  └────────────┘  └──────────────┘  └──────────────┘  │
│  ┌──────────────┐  ┌──────────────┐                               │
│  │parent-       │  │join-student   │                               │
│  │management    │  │扫码加入档案     │                               │
│  └──────────────┘  └──────────────┘                               │
│       ↑              ↑               ↑                  ↑          │
│       └──────────────┴───────────────┴──────────────────┘          │
│                    utils/cloud.js（数据访问层）                       │
│                    utils/poller.js（轮询器）                          │
│                    utils/util.js （格式化/UI 工具）                    │
└────────────────────────────┬────────────────────────────────────────┘
                             │ wx.cloud.callFunction()
                             ▼
┌─────────────────────────────────────────────────────────────────────┐
│                      微信云开发（后端）                                │
│                                                                     │
│  ┌──────────────────┐    ┌──────────────────┐    ┌───────────────┐  │
│  │uploadAndAnalyze  │───→│ analyzePhotos    │───→│analyzeBatch   │  │
│  │入口：校验+建报告   │同步 │主控：拆批+串行+合并│同步 │单批AI分析     │  │
│  └──────────────────┘    └────────┬─────────┘    └───────┬───────┘  │
│                                   │                       │          │
│  ┌──────────────────┐    ┌────────┴─────────┐    ┌───────┴───────┐  │
│  │generatePaper     │    │getAnalysisProgress│    │CloudBase AI   │  │
│  │AI出题+PDF生成     │    │轻量进度查询        │    │hy3-preview    │  │
│  └──────────────────┘    └──────────────────┘    │deepseek-v4    │  │
│                                                   └───────────────┘  │
│  ┌──────────────────┐                                               │
│  │generateReportPDF │    ┌──────────────┐  ┌────────────────────┐   │
│  │报告PDF生成        │    │ 云数据库      │  │ 云存储              │   │
│  └──────────────────┘    │ 12 个核心集合  │  │ photos/ papers/    │   │
│                           │              │  │ reports/           │   │
│                           └──────────────┘  └────────────────────┘   │
│  ┌──────────────────┐    ┌──────────────────┐                       │
│  │studentAccess     │    │studentData       │                       │
│  │家长成员/邀请管理   │    │共享学习数据层      │                       │
│  └──────────────────┘    └──────────────────┘                       │
└─────────────────────────────────────────────────────────────────────┘
```

---

### 2.1 Skill 与 CLI 能力层

P0 阶段新增 `services/skills` 和 `cli/ldx.js`：

- `services/skills` 把诊断闭环抽象为可复用能力，包括上传诊断、分析状态、诊断报告、学习卡点、验证试卷、验证反馈和学习时间线。
- `cli/ldx.js` 是命令行入口，当前通过 `--fixture` 使用离线 adapter 验证命令合同，后续可接入真实 CloudBase adapter。
- 小程序现有页面仍继续通过 `miniprogram/utils/cloud.js` 调用云函数；Skill 层先作为独立能力内核和自动化入口，不改变现有页面运行链路。
- 新增测试文件 `tests/skills-p0.test.js` 和 `tests/cli-p0.test.js` 已纳入 `npm test`。

当前 P0 CLI 命令覆盖：

```bash
ldx upload photos
ldx analyze status
ldx report show
ldx report pdf
ldx bottleneck list
ldx paper generate
ldx verification upload
ldx timeline show
```

---

## 3. 数据流图

### 流程 A：拍照诊断

```
用户拍照（最多20张）
    │
    ▼
upload 页面：wx.cloud.uploadFile() × N → 获得 fileIDs
    │
    ▼
cloud.callUploadAndAnalyze({ fileIDs, studentId, subject, mode:'diagnosis' })
    │
    ▼
[uploadAndAnalyze 云函数]
    ├── 1. 校验参数 + 权限
    ├── 2. 创建 reports 记录（status='analyzing'）
    ├── 3. 更新 subjectProfiles.analysisStatus='analyzing'
    └── 4. fire-and-forget 调用 cloud.callFunction('analyzePhotos', { reportId })
              │
              ▼
         [analyzePhotos 云函数]
              ├── 1. 读取 reports.imageFileIds
              ├── 2. 检查陈旧 processing 任务（>10min → 标记 failed）
              ├── 3. 创建 analysisTasks 记录（status='processing'）
              ├── 4. 按 1 张/批拆分，每次函数只处理 1 批，完成后异步续跑下一批
              │       │
              │       ▼
              │  [analyzeBatch 云函数]
              │       ├── getTempFileURL() → 临时链接
              │       ├── callAI(hy3-preview) → JSON
              │       └── normalizePageResults() → 结构化结果
              │
              ├── 5. markDuplicatePages() → 去重
              ├── 6. mergeBatchResults() → 合并卡点+错题
              ├── 7. 更新 reports（status='completed', bottlenecks, errorDetails...）
              ├── 8. updateSubjectProfile() → 累计 pendingBottlenecks
              └── 9. 更新 analysisTasks（status='completed'）
    │
    ▼
客户端收到 reportId → 返回学科主页并轮询分析状态
    │
    ▼
report 页面：createPoller 每 10s 轮询 getAnalysisProgress
    → status='completed' → 渲染报告内容
    → 可点击生成 PDF → callGenerateReportPDF
```

### 流程 B：验证试卷

```
subject-home 学科工作台 → 点击主任务或待处理队列
    │
    ▼
generate-verification 页面（历史兼容页；主流程优先走自动验证卷）
    ├── getSubjectProfile() → 获取 pendingBottlenecks
    ├── targetCode 存在时预选单个学习卡点，否则按严重度默认选择
    ├── 展示出卷配置（卡点数、题量、预计用时、A4 页数、粗/细卡点层级摘要）
    └── callGeneratePaper({ type:'verification', targets:[...] })
              │
              ▼
         [generatePaper 云函数]
             ├── generateQuestionsWithAI(deepseek-v4-flash) → 按置信度每个目标 1-3 道题
              ├── generatePDF(pdfkit) → Buffer
              ├── uploadFile() → 云存储
              └── 写入 papers 集合
    │
    ▼
paper-preview 页面 → 展示 bottleneckHierarchy 覆盖层级 → 预览/下载 PDF（已下载后显示“已下载”）→ 线下答题
    │
    ▼
答题完成后 → upload 页面（mode='verification', paperId=xxx）
    │
    ▼
同流程 A，但 uploadAndAnalyze 传入 mode='verification' + paperId
    │
    ▼
analyzePhotos 额外执行：
    ├── getVerificationPaper() → 获取目标卡点和各卡点预期题数
    ├── aggregateVerificationEvidence() → 汇总清晰作答数和错题数
    ├── compareBottlenecks(上次bottlenecks, 本次bottlenecks, 已完整通过的目标)
    └── buildComparisonSummary() → 改善/持续/新发现统计
    │
    ▼
report 页面展示对比摘要 + 卡点状态标签（improved/worsened/new/persisting）
```

### 流程 C：默认诊断试卷

```
subject-home 页面 → 点击"默认诊断试卷"
    │
    ▼
default-paper 页面
    ├── getPapers({ studentId, subject, type:'default-diagnosis' }) → 已有试卷
    ├── 选择年级 + 题数（6-20）
    └── callGeneratePaper({ type:'default-diagnosis', grade, questionCount })
              │
              ▼
         [generatePaper 云函数]
              ├── generateQuestionsWithAI() → 综合诊断题
              ├── generatePDF() → Buffer
              ├── uploadFile() → 云存储
              └── 写入 papers 集合
    │
    ▼
paper-preview 页面 → 预览/下载 PDF（已下载后显示“已下载”）→ 线下答题
    │
    ▼
答题完成后 → upload 页面（mode='default-paper', paperId=xxx）
    │
    ▼
同流程 A，sourceType='default-paper'
    │
    ▼
report 页面展示诊断结果（不执行验证对比逻辑）
```

### 流程 D：家长管理与扫码加入

```
owner 在首页点击"家长管理"
    │
    ▼
parent-management 页面
    ├── cloud.listStudentMembers(studentId) → 展示 owner/viewer 成员
    └── cloud.createStudentInvite(studentId) → 生成一次性扫码路径
              │
              ▼
         [studentAccess 云函数]
              ├── 校验当前 OPENID 是档案 owner
              ├── 生成明文 token + tokenHash
              └── 写入 studentInvites（7 天有效）
    │
    ▼
另一个微信扫码进入 join-student 页面
    ├── cloud.getStudentInvite(inviteId, token) → 预览孩子档案
    └── cloud.acceptStudentInvite(inviteId, token)
              │
              ▼
         [studentAccess 云函数]
              ├── 校验 tokenHash、状态和过期时间
              ├── 幂等创建 studentMembers viewer 关系
              └── 返回 studentId，进入首页/学科页参与学习流程
```

### 流程 E：时间化学习卡点追踪

```
照片上传 / 验证卷上传
    │
    ▼
reports.evidenceTime = 上传进入系统的时间
imageFiles[].uploadedAt = 每张照片上传时间
papers.paperDate = 打印试卷的醒目日期
    │
    ▼
analyzePhotos.updateSubjectProfile()
    ├── 以 evidenceTime 记录 firstSeenAt / lastSeenAt
    ├── 以验证证据记录 lastVerifiedAt / lastPassedAt / lastFailedVerificationAt
    ├── 累计 evidenceCount / recentErrorCount / verificationPassCount / verificationFailCount
    └── 计算 trend + weight：new / persisting / declining / improved / recurring
    │
    ▼
subject-home / report / upload-history
    └── 展示"最近发现、验证日期、趋势、权重"，但仍保留简化主线，不把复杂分析前置给家长
```

---

## 4. 前端页面路由图

```
index（自适应首页）
  ├── 0 个孩子 → 显示添加孩子空状态
  ├── 1 个孩子 → 直接渲染该孩子学习档案
  ├── 多个孩子 → 显示家庭学习工作台
  ├── navigateTo → add-student（管理孩子/添加学生）
  └── navigateTo → student-profile（点击某个孩子卡片）

student-profile（孩子学习档案）
  ├── navigateTo → parent-management（家长管理，仅 owner 可见）
  ├── navigateTo → subject-home（重点提示/学科入口）
  ├── navigateTo → upload-history（学习记录）
  ├── navigateTo → report?id=xxx（最近报告）
  ├── navigateTo → paper-preview?paperId=xxx（最近试卷）
  └── navigateTo → generate-verification 或 upload（下一步建议）

join-student（扫码加入孩子档案）
  └── acceptInvite 成功后 → redirect/reLaunch → index 或 subject-home

subject-home（学科工作台）
  ├── navigateTo → upload?mode=diagnosis（拍照诊断）
  ├── navigateTo → generate-verification（生成验证试卷，可带 targetCode）
  ├── navigateTo → bottleneck-center（统计块/待处理/已改善入口）
  ├── navigateTo → default-paper（默认诊断试卷）
  ├── navigateTo → knowledge-map / learning-resource（数学知识地图与学习资源）
  ├── navigateTo → english-practice / english-dictation / english-wrong-words（英语词汇闭环）
  ├── navigateTo → upload-history（学习记录）
  ├── navigateTo → report?id=xxx（查看报告）
  └── navigateTo → report?id=currentAnalysisId（分析中报告）

upload（拍照上传）
  └── 上传成功后 → redirect/reLaunch → subject-home 或 report

upload-history（学习记录）
  ├── navigateTo → report?id=xxx
  ├── navigateTo → paper-preview?paperId=xxx
  ├── navigateTo → bottleneck-center（卡点标签）
  └── navigateTo → upload?mode=verification（待上传状态）

report（报告详情）
  ├── navigateTo → generate-verification（带卡点参数）
  ├── navigateTo → bottleneck-detail（卡点详情）
  ├── navigateTo → bottleneck-center（指标卡）
  └── navigateTo → upload-history（证据时间/来源）

generate-verification（验证试卷出卷配置）
  └── navigateTo → paper-preview?fileId=xxx 或 ?paperId=xxx

default-paper（默认诊断试卷）
  └── navigateTo → paper-preview?fileId=xxx 或 ?paperId=xxx

paper-preview（试卷预览）
  ├── navigateTo → upload?mode=verification/default-paper（作答完成后上传批复）
  ├── navigateTo → report?id=xxx（验证反馈）
  └── navigateTo → bottleneck-detail / bottleneck-center（题目卡点）

bottleneck-center（学习卡点中心）
  ├── navigateTo → bottleneck-detail（卡点详情）
  └── navigateTo → generate-verification（单卡点验证）

bottleneck-detail（学习卡点详情）
  ├── navigateTo → report?id=xxx（证据报告）
  ├── navigateTo → paper-preview?paperId=xxx（关联验证卷）
  └── redirectTo → bottleneck-center（返回中心，避免回退栈绕路）

ai-usage（AI 用量账本）
  ├── callFunction aiUsage.getSummary / listEvents
  └── callFunction aiUsage.getBetaAuth / setBetaAuth / requestDataDeletion
```

### 全局交互原则：信息即入口

本产品的核心对象是诊断报告、验证试卷、学习卡点和证据链。凡是页面中出现这些对象的摘要、编号、状态、数量或标签，默认都应可点击，并进入最贴近该信息语义的页面：

- 报告摘要、错题数、证据时间 → 报告详情或学习记录。
- 验证卷编号、题目数、页数、待上传状态 → 验证试卷工作台或上传页。
- 学习卡点名称、状态、权重、已改善数量 → 卡点详情或卡点中心筛选视图。
- 中间态和异常态不作为主记录铺开；在学习记录中折叠为状态条，点击后进入可恢复的报告页。
- 若数据不足以跳转，应给出轻提示，不让用户点了没有反馈。

### 首页与孩子档案边界

`pages/index/index` 是自适应入口，不固定承担孩子档案详情：

- 没有孩子时，只显示添加第一个孩子的空状态。
- 只有一个孩子时，首页直接显示该孩子的学习档案，不额外显示"孩子学习工作台"。
- 有多个孩子时，首页只显示家庭学习工作台，不混入某一个孩子的完整档案。
- 多孩子场景点击孩子卡片后进入 `pages/student-profile/student-profile`，该页面展示单个孩子的诊断报告、学习卡点、学习记录、学科入口和下一步建议。

### 页面清单

| 页面路径 | 功能 | 核心依赖 |
|----------|------|----------|
| `pages/index/index` | 自适应首页：0 个孩子显示空状态，1 个孩子显示学习档案，多孩子显示家庭工作台 | cloud.getStudents, getAccessibleStudents, getStudentDashboard, child-workbench, index-presenter |
| `pages/student-profile/student-profile` | 单个孩子学习档案：综合摘要、报告、卡点、学习记录、学科入口和下一步建议 | cloud.getStudentDashboard, getSubjectProfiles, getReports, getPapers, index-presenter |
| `pages/add-student/add-student` | 新增学生 + 自动创建三科档案 | cloud.createStudentWithProfiles |
| `pages/parent-management/parent-management` | 家长成员列表、生成扫码邀请、移除协同家长 | cloud.listStudentMembers, createStudentInvite, revokeStudentMember |
| `pages/join-student/join-student` | 通过邀请扫码加入孩子档案 | cloud.getStudentInvite, acceptStudentInvite |
| `pages/subject-home/subject-home` | 学科工作台：主任务、待处理队列、工具入口、状态轮询 | cloud.getSubjectProfile, getReports, getLatestReport, getAnalysisProgress; poller |
| `pages/upload/upload` | 拍照/选图 + 上传 + 触发分析 | cloud.uploadPhoto, callUploadAndAnalyze, getReports |
| `pages/upload-history/upload-history` | 学习记录时间线 | cloud.getLearningTimeline, getReports, getPapers, getTempFileURLs |
| `pages/report/report` | 报告详情 + 分析进度轮询 + PDF 生成 | cloud.getReport, getSubjectProfile, getAnalysisProgress, callAnalyzePhotos, callGenerateReportPDF; poller |
| `pages/bottleneck-center/bottleneck-center` | 学习卡点中心：筛选待验证、持续出现、复发和已改善卡点 | cloud.getStudentDashboard, callGeneratePaper |
| `pages/bottleneck-detail/bottleneck-detail` | 单卡点详情：证据链、学习资源、验证入口 | cloud.getStudentDashboard, getReportDetail, generateLearningResourcePack |
| `pages/knowledge-map/knowledge-map` | 数学知识地图：按知识层级展示掌握状态和学习入口 | cloud.getSubjectDashboard, generateLearningResourcePack |
| `pages/learning-resource/learning-resource` | 学习资源包：读取/完成任务包并回写学习记录 | cloud.getLearningResourcePack, completeLearningResourcePack |
| `pages/english-practice/english-practice` | 英语认词练习 | cloud.generateEnglishRecognitionSession, submitEnglishRecognitionAttempt, submitEnglishPracticeResult |
| `pages/english-dictation/english-dictation` | 英语纸面听写与 OCR 批改 | cloud.generateEnglishPaperDictationSession, submitEnglishDictationPhoto, analyzeEnglishDictationPhoto |
| `pages/english-wrong-words/english-wrong-words` | 英语错词本与复测入口 | cloud.getEnglishVocabularySummary |
| `pages/generate-verification/generate-verification` | 出卷配置器：选择范围 → 分层展示覆盖卡点 → 生成验证试卷 | cloud.getSubjectProfile, callGeneratePaper |
| `pages/default-paper/default-paper` | 选年级 → 生成/选择默认诊断试卷 | cloud.getPapers, callGeneratePaper |
| `pages/paper-preview/paper-preview` | 预览/下载试卷 PDF，展示覆盖卡点层级，记录已下载状态 | cloud.getPaper, getStudent |
| `pages/ai-usage/ai-usage` | AI 用量账本、内测授权和数据删除请求 | cloud.getAiUsageSummary, getAiUsageEvents, createDeletionRequest |

### 聚合读取与降级原则

`studentData` 云函数提供首页、学科工作台、报告详情和学习记录的访问感知聚合数据。它是性能优化路径，不是页面唯一数据来源。真实数据量变大或云函数暂时超时时，页面应优先展示可恢复的核心内容：

- `index` / `student-profile`：`getStudentDashboard` 失败时回退到 `getStudents`、`getSubjectProfiles`、`getReports`、`getPapers`。
- `subject-home`：`getSubjectDashboard` 失败时回退到 `getSubjectProfile` 和 `getReports`，保留主任务、待处理卡点和工具入口。
- `bottleneck-center`：`getStudentDashboard` 失败时回退到各学科档案里的当前卡点。
- `report`：`getReportDetail` 失败时回退到直接读取 `reports`；反馈读取或学科档案读取失败不能阻塞报告正文。
- `upload-history`：`getLearningTimeline` 成功时会合并 `reports`、`papers` 和 `englishPracticeSessions`；失败时回退到 `reports` / `papers`；`getTempFileURLs` 失败时继续展示文字时间线，只禁用原图预览。

`utils/cloud.js` 会在云函数超时时把错误标注为 `functionName:action`，例如 `studentData:getLearningTimeline 请求超时，请稍后重试`。页面日志应保留这个上下文，但面向用户只显示可恢复提示，避免把后端函数名暴露为主要交互文案。

---

## 5. 云函数调用链

```
客户端
  │
  ├─→ studentAccess（家长成员、邀请创建、扫码加入）
  │
  ├─→ studentData（共享家长可读的首页、学科、报告、试卷、时间线数据）
  │
  ├─→ uploadAndAnalyze ──(fire-and-forget)──→ analyzePhotos ──(同步 await, 串行)──→ analyzeBatch × N
  │                                        │
  │                                        ├──(异步 fire-and-forget)──→ sendNotification（预留钩子，当前不承诺推送）
  │                                        │
  │                                        └── 直接 DB 操作：reports / subjectProfiles / analysisTasks
  │
  ├─→ getAnalysisProgress（独立轻量查询，读 analysisTasks）
  │
  ├─→ generatePaper（独立，调 AI + 生成 PDF + 写 papers）
  │
  └─→ generateReportPDF（独立，读 reports + 生成 PDF + 回写 reports.pdfFileId）
```

### 调用方式标注

| 调用方 | 被调用方 | 方式 | 说明 |
|--------|----------|------|------|
| 客户端 upload 页面 | uploadAndAnalyze | wx.cloud.callFunction | 创建报告并启动后台分析 |
| 客户端 index/subject-home/report/upload-history/paper-preview | studentData | wx.cloud.callFunction | 访问感知的学习数据聚合，支持 owner/viewer |
| 客户端 parent-management/join-student | studentAccess | wx.cloud.callFunction | 家长成员管理、邀请创建、扫码加入 |
| uploadAndAnalyze | analyzePhotos | cloud.callFunction (fire-and-forget) | 服务端触发后台分析，立即返回 reportId |
| analyzePhotos | analyzeBatch | cloud.callFunction (同步 await, 单图续跑) | 每批 1 张；每次 analyzePhotos 调用只处理 1 批，完成后异步触发下一次 |
| analyzePhotos | sendNotification | Promise.catch (fire-and-forget) | 预留钩子；订阅消息模板和授权链路接入前，前端只提示“完成后可在学习记录查看” |
| 客户端 report 页面 | getAnalysisProgress | wx.cloud.callFunction | 轮询调用 |
| 客户端 report 页面 | callAnalyzePhotos | wx.cloud.callFunction (20s 超时) | 重试入口（分析报告页发现未完成时） |
| 客户端 generate-verification | generatePaper | wx.cloud.callFunction | 生成验证试卷 |
| 客户端 default-paper | generatePaper | wx.cloud.callFunction | 生成默认诊断试卷 |
| 客户端 report 页面 | generateReportPDF | wx.cloud.callFunction | 按需生成报告 PDF |

---

## 6. 模块依赖关系

### 页面 → utils/cloud.js 方法

| 页面 | 调用的 cloud.js 方法 |
|------|---------------------|
| index | getAccessibleStudents, getStudentDashboard, getStudents, getSubjectProfiles |
| add-student | createStudentWithProfiles |
| parent-management | listStudentMembers, createStudentInvite, revokeStudentMember |
| join-student | getStudentInvite, acceptStudentInvite |
| subject-home | getSubjectDashboard, getSubjectProfile, getReports, getLatestReport, getReport, getAnalysisProgress |
| upload | getReports, uploadPhoto*, callUploadAndAnalyze |
| upload-history | getLearningTimeline, getReports, getPapers, getTempFileURLs |
| report | getReportDetail, getReport, getSubjectProfile, getAnalysisProgress, callAnalyzePhotos, callGenerateReportPDF |
| bottleneck-center | getStudentDashboard, callGeneratePaper |
| bottleneck-detail | getStudentDashboard, getReportDetail, generateLearningResourcePack |
| knowledge-map | getSubjectDashboard, generateLearningResourcePack |
| learning-resource | getLearningResourcePack, completeLearningResourcePack |
| english-practice | generateEnglishRecognitionSession, submitEnglishRecognitionAttempt, submitEnglishPracticeResult |
| english-dictation | generateEnglishPaperDictationSession, uploadPhoto, submitEnglishDictationPhoto, analyzeEnglishDictationPhoto |
| english-wrong-words | getEnglishVocabularySummary |
| generate-verification | getSubjectProfile, callGeneratePaper |
| default-paper | getPapers, callGeneratePaper |
| paper-preview | getPaperDetail, getPaper, getStudent |
| ai-usage | getAiUsageSummary, getAiUsageEvents, createDeletionRequest |

> *uploadPhoto 在 upload 页面内部使用 wx.cloud.uploadFile 直接上传，cloud.js 中的 uploadPhoto 封装了路径生成逻辑。

### 页面 → utils/poller.js

| 页面 | 用途 |
|------|------|
| subject-home | 轮询分析进度（currentAnalysisId 存在时），每 10s 查询 getAnalysisProgress |
| report | 轮询报告状态（status='analyzing' 时），每 10s 查询 getAnalysisProgress |

### 页面 → utils/util.js

| 页面 | 使用的方法 |
|------|-----------|
| index | formatRelativeTime |
| subject-home | formatRelativeTime, formatBottleneckDisplayList |
| upload-history | formatChineseDateTime, formatBottleneckDisplayList |
| report | formatChineseDateTime, formatBottleneckDisplayName |
| generate-verification | formatBottleneckDisplayName |
| paper-preview | formatBottleneckDisplayList |
| parent-management | formatRelativeTime |

### 云函数内部模块依赖

| 云函数 | 内部模块 | 用途 |
|--------|----------|------|
| analyzePhotos | comparison.js | compareBottlenecks, buildComparisonSummary（验证模式对比） |
| analyzePhotos | photo-dedup.js | markDuplicatePages, normalizeOcrSummary（跨批次/跨报告去重） |
| analyzeBatch | result-normalizer.js | normalizePageResults（校验并规范化 AI 返回结构） |

---

## 7. 异步分析机制

### analysisTasks 状态机

```
                   创建
                    │
                    ▼
              ┌──────────┐
              │processing│ ← 初始状态
              └────┬─────┘
                   │
          ┌────────┼────────┐
          ▼        ▼        ▼
     ┌────────┐ ┌────────┐ ┌──────────────────┐
     │completed│ │ failed │ │ failed (stale)   │
     └────────┘ └────────┘ │ >10min 自动清理    │
                            └────────┬─────────┘
                                     │
                                     ▼
                               允许重新创建
                              新的 processing
```

### 状态转换规则

| 触发条件 | 状态变化 | 执行位置 |
|----------|----------|----------|
| analyzePhotos 启动 | → processing | analyzePhotos 创建 analysisTasks 记录 |
| 每批完成 | completedBatches++ | analyzePhotos 循环内 update |
| 全部批次成功 + 合并完成 | → completed | analyzePhotos 末尾 |
| 任意异常 | → failed + error 信息 | analyzePhotos catch 块 |
| processing 超过 10 分钟 | → failed（"超时，允许重新启动"） | analyzePhotos 启动时检查 |

### 轮询机制

`utils/poller.js` 的 `createPoller` 是一个通用轮询器工厂：

```javascript
const poller = createPoller({
  request: () => cloud.getAnalysisProgress(reportId),  // 异步请求函数
  onValue: (value, attempts) => {                       // 返回值决定是否继续
    if (value.status === 'completed') return false       // 停止轮询
    if (value.status === 'failed') return false
    return true                                          // 继续
  },
  onError: (error) => { /* 错误处理 */ },
  onTimeout: () => { /* 达到最大次数 */ },
  intervalMs: 10000,   // 每 10 秒一次
  maxAttempts: 30,     // 最多 30 次（5 分钟）
})
poller.start()
```

关键特性：
- **可注入调度器**：`schedule`/`cancel` 参数支持测试时替换为假定时器
- **幂等启停**：重复调用 `start()` 会先 `stop()` 再重启
- **异步安全**：`request()` 和 `onValue()` 都是 async，await 完成后才安排下一次 tick
- **running 守卫**：每次 tick 开头和 await 之后都检查 `running` 标志，防止 stop 后继续执行

### 超时处理

| 场景 | 超时设置 | 处理方式 |
|------|----------|----------|
| 客户端 → uploadAndAnalyze | 快速返回 | 服务端创建 reports + 启动 analyzePhotos 后立即返回 reportId |
| 客户端 → analyzePhotos（重试） | 20s | 服务端幂等检查避免重复启动，超时按后台处理中处理 |
| analyzePhotos → analyzeBatch | 云函数默认超时 | 失败推入 batchResults，最终检查是否有未成功批次 |
| 轮询 getAnalysisProgress | 10s × 30 次 = 5min | onTimeout 回调提示用户稍后再看 |
| analysisTasks.processing | 10 分钟 | 下次 analyzePhotos 启动时自动标记 failed 并允许重建 |

---

## 8. 关键技术决策

### 为什么用串行而非并行批处理？

**决策**：analyzePhotos 中 1 张/批串行调用 analyzeBatch；每次云函数调用只处理 1 批，随后 fire-and-forget 续跑下一批，不用 Promise.all 并行。

**原因**：
1. **CloudBase AI 并发限制**：hy3-preview 模型有 QPS 限制，并行调用容易触发限流导致整批失败
2. **云函数内存约束**：每个 analyzeBatch 需要加载图片临时 URL 并传递给 AI，并行会导致内存峰值过高
3. **进度追踪精度**：串行可以精确更新 `analysisTasks.completedBatches`，客户端能看到真实进度；并行时进度更新变得复杂且不准确
4. **故障隔离**：某一批失败只影响该批，不会因并行 reject 导致所有批次结果丢失
5. **稳定性优先**：20 张照片会拆成 20 次后台续跑，耗时线性增加，但上传入口已异步返回，用户可以离开页面后在学习记录中等待报告完成

### 为什么 uploadAndAnalyze 使用 fire-and-forget 启动 analyzePhotos？

**决策**：`uploadAndAnalyze` 创建报告、更新学科档案后，调用 `cloud.callFunction({ name: 'analyzePhotos' })` 但不 await，立即返回 `reportId`。

**原因**：
1. **上传体验更轻**：客户端只等待图片上传和报告创建，不等待 AI 完整分析
2. **长任务独立运行**：`analyzePhotos` 在 60s 云函数上限内尽量完成后台分析；前端通过进度轮询、超时提示和重试入口恢复异常状态
3. **前端状态简单**：客户端拿到 `reportId` 后回到学科主页，通过 `analysisTasks` 轮询展示进度
4. **失败可恢复**：如果后台任务缺失或失败，报告页的重试入口会重新调用 `analyzePhotos`

### 为什么 report 页面还有 callAnalyzePhotos 重试入口？

**决策**：report 页面在发现报告 status='analyzing' 且无对应 processing 任务时，会主动调用 `callAnalyzePhotos({ reportId })`。

**原因**：
1. **兜底恢复**：极端情况下 uploadAndAnalyze 成功创建了 reports 但 analyzePhotos 调用失败（网络抖动、云函数部署中等），此时报告永远卡在 analyzing 状态
2. **幂等保证**：analyzePhotos 内部检查已有 processing 任务和 completed 状态，不会重复分析
3. **用户感知**：用户进入报告页看到"分析中"时自动触发重试，无需手动操作

### 为什么照片去重用 OCR 摘要指纹而非像素级比较？

**决策**：`photo-dedup.js` 将 AI 返回的 `ocrSummary` 归一化后作为 contentFingerprint，相同指纹视为重复。

**原因**：
1. **零额外成本**：ocrSummary 是 AI 分析时顺便返回的，不需要额外的图像处理 API 调用
2. **语义级去重**：同一道题的不同拍摄角度/光线会产生不同像素但相同 OCR 文本，指纹法能正确识别为重复
3. **跨报告去重**：历史报告的 imageFiles 中保存了 ocrSummary，新照片可以和所有历史照片比对
4. **容错性**：归一化去除标点和空白差异，降低误判率

### 为什么 subjectProfiles 冗余存储 pendingBottlenecks 而非每次从 reports 聚合？

**决策**：analyzePhotos 完成后增量更新 subjectProfiles.pendingBottlenecks / improvedBottlenecks。

**原因**：
1. **首页性能**：index 页面需要展示每个学生的最新卡点概况，如果每次从 reports 聚合，N 个学生 × M 条报告 = O(NM) 查询
2. **减少数据库读取**：小程序云数据库单次查询限制 20 条，聚合需要多次分页查询
3. **写入频率低**：只在分析完成时更新一次，读写比合理
4. **数据一致性**：通过分析流程的事务性更新保证，失败时 clearSubjectProfileAnalysis 清空状态

### 为什么共同家长可以参与学习流程，但不能管理家庭成员？

**决策**：孩子档案支持多个家长共同使用。active viewer 在产品语义上是"共同家长"：可以查看首页、学科主页、学习记录、报告和试卷，也可以上传试卷、生成验证卷、重试分析和下载报告 PDF；邀请、编辑和移除家庭成员仍要求 owner。

**原因**：
1. **符合家庭真实协作**：另一位家长不只是旁观者，通常也需要上传卷子、打印验证卷和补充作答反馈。
2. **学习闭环完整**：诊断、出卷、作答上传和反馈都属于同一学习流程，拆成只读会让共同家长无法完成闭环。
3. **家庭管理边界清晰**：`studentAccess` 仍将邀请、移除、成员身份管理限制为 owner，避免权限纠纷。
4. **数据模型保持简单**：第一版不引入复杂角色层级，内部 role 仍可保留 `viewer`，但权限语义由共享 access helper 统一解释为共同家长。

### 为什么照片使用上传时间，而试卷使用试卷日期？

**决策**：照片和报告的证据时间以上传进入系统的时间为准；验证试卷单独保存 `paperDate`，并在 PDF 学生卷和答案页醒目显示。

**原因**：
1. **历史试卷不可追溯真实作答日**：用户上传旧卷时，系统能确定的是"何时被纳入诊断"。
2. **验证过程需要时间序列**：同一学习卡点经过多套验证卷后，`lastVerifiedAt`、`lastPassedAt`、`trend` 和 `weight` 才能解释改善或反复。
3. **纸笔场景友好**：打印卷上的日期放大后，家长拍照回传时更容易把本次验证和历史记录对应起来。

### 为什么 generatePaper 支持 preview 模式不落库？

**决策**：`preview=true` 时只生成临时 PDF 上传云存储，不写入 papers 集合。

**原因**：
1. **避免垃圾数据**：用户在生成页面可能多次调整参数预览，每次都落库会产生大量无用记录
2. **节省存储**：papers 集合存储完整题目结构，预览只需 PDF 文件
3. **简化清理**：临时 PDF 可通过云存储生命周期规则自动清理，无需应用层删除逻辑

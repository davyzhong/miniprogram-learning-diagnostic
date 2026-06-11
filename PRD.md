# Learning Diagnostic MVP 产品设计文档（PRD）

> 版本：v2.0 | 日期：2026-06-10 | 状态：设计确认

---

## 1. 产品定位

**一句话**：帮助家长用手机拍试卷照片，5 分钟拿到孩子的学习卡点诊断报告。

**目标用户**：小学孩子的家长（主操作者），孩子是被诊断对象。

**核心假设**：学习中的卡点可以被发现、定位、改善和复测。

**MVP 成功标准**：一个不懂教育、不懂技术的家长，能独立完成「选科目 → 上传试卷 → 拿到报告 → 生成验证试卷」这条完整链路，且看得懂报告。

---

## 2. 三条诊断路径

```
学科主页（三个入口）
  │
  ├─ 路径 A：拍照诊断
  │   上传已有试卷照片 → AI 异步分析 → 推送通知 → 查看诊断报告
  │
  ├─ 路径 B：验证试卷
  │   选历史卡点 → AI 生成验证试卷(A4 PDF) → 打印答题 → 拍照上传 → AI 分析 → 验证报告
  │
  └─ 路径 C：默认诊断试卷
      选年级 → AI 生成诊断卷(A4 PDF) → 打印答题 → 拍照上传 → AI 分析 → 诊断报告
```

---

## 3. 页面设计（共 10 页）

### Page 1：首页（学生列表）

**路由**：`pages/index/index`

| 区域 | 内容 |
|------|------|
| 顶部 | 应用标题"学习诊断" |
| 主体 | 学生卡片列表，每个卡片显示：头像、姓名、年级、最近诊断时间 |
| 底部 | 「添加学生」按钮 |

**交互**：点击学生卡片 → 进入 Page 2

---

### Page 2：学科选择页

**路由**：`pages/subject-select/subject-select`

| 区域 | 内容 |
|------|------|
| 顶部 | 返回箭头 + 学生姓名 |
| 主体 | 三个学科卡片：数学（蓝）、语文（绿）、英语（琥珀），每个显示最近报告数量和待验证卡点数 |

**交互**：点击学科卡片 → 进入 Page 3

**数据**：首次进入某学科时，`subjectProfiles` 集合自动创建该学科的档案记录。

---

### Page 3：学科主页（核心枢纽）

**路由**：`pages/subject-home/subject-home`

| 区域 | 内容 |
|------|------|
| 顶部 | 返回箭头 + "学科 - 学生名" + 年级 |
| 概况条 | 三列统计：历史报告数 / 待验证卡点数 / 已改善数 |
| 入口 A | **拍照诊断**：上传已有试卷照片，AI 识别错题并分析卡点 |
| 入口 B | **生成验证试卷**：基于历史卡点自动出题，验证改善情况（显示待验证卡点列表） |
| 入口 C | **默认诊断试卷**：没有试卷？选一套标准题来做诊断 |
| 入口 D | **上传历史**：查看原始照片、OCR 摘要和疑似重复记录 |
| 底部 | 最近记录列表（区分诊断报告和验证报告，显示日期、卡点数、状态） |
| 分析中卡片 | 如有正在分析的任务，显示进度条和"分析中"状态 |

**交互**：
- 点入口 A → 进入 Page 4（场景参数：`mode=diagnosis`）
- 点入口 B → 进入 Page 7
- 点入口 C → 进入 Page 8
- 点入口 D → 进入 Page 4A
- 点记录项 → 进入 Page 6
- 点"分析中"卡片 → 显示当前分析进度

**设计决策**：
- 不使用 Tab 切换，三个入口并列展示，用颜色和图标区分
- 上传与分析解耦后，学科主页是用户等待分析期间的主要停留页

---

### Page 4：拍照上传页

**路由**：`pages/upload/upload`

| 区域 | 内容 |
|------|------|
| 顶部 | 返回箭头 + 场景标题（由来源页参数决定） |
| 说明条 | 当前场景说明（拍照诊断/验证上传/试卷上传，由 `mode` 参数控制文案） |
| 拍照提示 | 光线充足、试卷铺平、字迹清晰、红笔批注可见 |
| 照片网格 | 4×5 网格，最多 20 张，支持拍照和相册选择，每张可删除 |
| 上传进度 | 上传中时显示进度条（已上传 X/总数） |
| 异步提示 | "上传完成后即可返回，AI 将在后台分析，完成后推送通知" |
| 底部按钮 | 「上传并开始分析 (N张)」 |

**场景参数**：
- `mode=diagnosis`：拍照诊断（默认），标题"拍照上传试卷"
- `mode=verification`：验证上传，标题"上传验证试卷答题"
- `mode=paper`：试卷上传，标题"上传诊断试卷答题"

**设计决策**：
- 不使用 Tab 切换模式，模式由上一个页面通过 URL 参数决定
- 不预留 Lonsid 智能笔 UI，MVP 只做拍照上传
- 上传完成后立即返回 Page 3，触发云函数异步分析
- 去掉"AI 分析中"独立页面，改为在 Page 3 显示分析状态
- 历史中出现同名文件时只做轻提示，不阻止上传；最终由 OCR 摘要判断是否疑似重复

### Page 4A：上传历史页

**路由**：`pages/upload-history/upload-history`

按诊断报告分组展示所有历史上传照片。每张照片可预览原图，并显示文件名、OCR 识别摘要和“疑似重复”标记。疑似重复照片仍保留在历史中，但不重复计入诊断报告的错题和学习卡点统计。若一次上传全部为疑似重复照片，本次记录不更新学习卡点或改善结论。旧报告没有 OCR 摘要时，仍展示原始照片。

---

### Page 5：（已移除）

原来的"AI 分析中"独立页面已移除。上传完成后用户直接返回 Page 3，分析结果通过微信订阅消息推送。

---

### Page 6：诊断/验证报告页

**路由**：`pages/report/report`

| 区域 | 内容 |
|------|------|
| 顶部 | 返回箭头 + "诊断报告/验证报告" + 日期 |
| 区块 A | **今天发现了什么**：一句话总结 + 卡点分布统计（发现/已改善/新增/待验证） |
| 区块 B | **卡点排行**：按错题数量排序的条形图，每个卡点显示 LP 编号、名称、错题数、优先级 |
| 改善标记 | 与上次报告对比，标注已改善的卡点（绿色背景） |
| 区块 C | **错题详情**：折叠列表，点击展开查看每道错题的根因分析 |
| 区块 D | **下一步**：生成验证试卷入口（绿色边框高亮），"针对 N 个卡点生成验证试卷" |
| 底部 | 分享报告 + 下载 PDF |

**报告类型**：
- 诊断报告：首次发现卡点，`type=diagnosis`
- 验证报告：对比历史卡点，标注改善/加重/新增，`type=verification`

**验证报告特有**：
- 每个卡点标注状态：🟢 改善 / 🔴 加重 / 🆕 新增 / ⚪ 持续
- 底部总结："X 个卡点已改善，Y 个仍在，Z 个新增"

---

### Page 7：验证试卷生成页

**路由**：`pages/generate-verification/generate-verification`

| 区域 | 内容 |
|------|------|
| 顶部 | 返回箭头 + "生成验证试卷" |
| 说明 | 选择需要验证的卡点，系统针对每个卡点生成 3 道验证题 |
| 卡点列表 | 待验证卡点勾选列表，每个显示：LP 编号、名称、上次发现日期、优先级标签（高/中/低） |
| 试卷预览 | 摘要统计：选中卡点数 / 题目总数 / 预估时间 / 纸幅(A4) |
| 底部 | 「预览 PDF」 + 「生成试卷 (A4 PDF)」 |

**逻辑**：
- 默认选中所有高优先级卡点
- 最低选 1 个卡点，最多选 5 个
- 点击「生成试卷」→ AI 根据卡点 + 年级生成题目 → 生成 A4 PDF → 跳转 Page 9

---

### Page 8：默认诊断试卷选择页

**路由**：`pages/default-paper/default-paper`

| 区域 | 内容 |
|------|------|
| 顶部 | 返回箭头 + "默认诊断试卷" |
| 说明 | 没有现成试卷？选一套标准题来做诊断 |
| 年级选择 | 一年级～六年级 标签组 |
| 试卷列表 | 每个年级 2 套试卷（A/B 卷），显示：覆盖卡点、题目数、预估时间、A4 页数 |
| 底部提示 | "建议先打印让孩子在纸上作答，完成后拍照上传" |
| 试卷操作 | 每套试卷：「预览 PDF」+ 「使用这套试卷」 |

**逻辑**：
- 点击「使用这套试卷」→ 如尚未生成则 AI 动态生成 → 生成 A4 PDF → 跳转 Page 9
- 默认试卷由 AI 根据年级 + 常见卡点动态生成，不预存题库
- 同一套试卷的题目模板固定（通过 prompt seed 控制），保证一致性

---

### Page 9：试卷预览/打印页

**路由**：`pages/paper-preview/paper-preview`

| 区域 | 内容 |
|------|------|
| 顶部 | 返回箭头 + "试卷预览" + 页码 |
| 试卷标签 | 类型标签（验证试卷/诊断试卷）+ 学科 + 学生名 |
| A4 预览区 | 缩略图展示 A4 试卷内容，按卡点分组排列题目 |
| 操作按钮 | 「下载 PDF」+ 「分享打印」 |
| 主按钮 | 「作答完成，拍照上传」→ 跳转 Page 4（mode=verification 或 paper） |

---

## 4. 数据模型

### 4.1 students 集合

```javascript
{
  _id: String,          // 自动生成
  _openid: String,      // 用户 openID
  name: String,         // 学生姓名
  grade: Number,        // 年级 (1-6)
  avatarColor: String,  // 头像颜色
  createdAt: Date,
  updatedAt: Date
}
```

### 4.2 subjectProfiles 集合

```javascript
{
  _id: String,
  _openid: String,
  studentId: String,    // 关联学生
  subject: String,      // 'math' | 'chinese' | 'english'
  totalReports: Number, // 历史报告总数
  pendingBottlenecks: [ // 待验证卡点
    {
      lpCode: String,   // 'LP-003'
      lpName: String,   // '分数运算'
      severity: String, // 'high' | 'medium' | 'low'
      sinceDate: Date   // 首次发现日期
    }
  ],
  improvedBottlenecks: [ // 已改善卡点
    {
      lpCode: String,
      lpName: String,
      improvedDate: Date
    }
  ],
  currentAnalysisId: String, // 当前正在分析的 reportId（null 表示无）
  analysisStatus: String,    // 'uploading' | 'analyzing' | null
  createdAt: Date,
  updatedAt: Date
}
```

### 4.3 reports 集合

```javascript
{
  _id: String,
  _openid: String,
  studentId: String,
  subject: String,
  type: String,           // 'diagnosis' | 'verification'
  sourceType: String,     // 'photo' | 'paper' | 'default-paper'
  status: String,         // 'analyzing' | 'completed' | 'failed'
  imageFileIds: [String], // 云存储文件 ID 列表
  imageFiles: [{          // 每张照片的历史与 OCR 去重信息
    fileID: String,
    fileName: String,
    fileSize: Number,
    ocrSummary: String,
    contentFingerprint: String,
    isDuplicate: Boolean,
    duplicateOf: String
  }],
  paperId: String,        // 关联的试卷 ID（验证/默认试卷上传时有值）
  
  // 分析结果
  summary: String,        // 一句话总结
  totalErrors: Number,    // 错题总数
  bottlenecks: [
    {
      lpCode: String,
      lpName: String,
      errorCount: Number,
      severity: String,     // 'high' | 'medium' | 'low'
      status: String,       // 'found' | 'improved' | 'worsened' | 'new' | 'persisting'
      rootCause: String,    // AI 给出的根因假设
      suggestion: String    // 修复建议
    }
  ],
  errorDetails: [
    {
      questionContent: String,  // 题目内容
      studentAnswer: String,    // 学生答案
      correctAnswer: String,    // 正确答案
      lpCode: String,           // 关联卡点
      rootCause: String         // 根因
    }
  ],
  
  // 验证报告对比
  previousReportId: String,    // 对比的上一份报告 ID
  comparisonSummary: String,   // 对比总结
  
  completedAt: Date,
  createdAt: Date
}
```

### 4.4 papers 集合（试卷）

```javascript
{
  _id: String,
  _openid: String,
  studentId: String,
  subject: String,
  type: String,           // 'verification' | 'default-diagnosis'
  grade: Number,
  bottleneckTargets: [String], // 覆盖的 LP 编号列表
  questions: [
    {
      index: Number,
      lpCode: String,
      content: String,      // 题目内容
      answer: String,        // 正确答案（不显示在试卷上）
      points: Number
    }
  ],
  pdfFileId: String,       // 生成的 PDF 云存储 ID
  totalPages: Number,
  createdAt: Date
}
```

### 4.5 analysisTasks 集合（异步任务追踪）

```javascript
{
  _id: String,
  _openid: String,
  reportId: String,          // 关联的报告 ID
  totalBatches: Number,      // 总批次数
  completedBatches: Number,  // 已完成批次数
  status: String,            // 'pending' | 'processing' | 'completed' | 'failed'
  imageFileIds: [String],    // 所有图片文件 ID
  mode: String,              // 'diagnosis' | 'verification' | 'paper'
  subject: String,
  studentId: String,
  createdAt: Date,
  completedAt: Date
}
```

---

## 5. 异步分析架构

### 核心原则：上传与分析完全解耦

```
用户拍照上传 → 云存储 → 立即返回学科主页 → 云函数后台分批分析 → 完成后推送通知
```

### 流程详解

1. **上传阶段**（Page 4）
   - 用户选择照片 → 逐张上传到云存储 → 获得 fileID 列表
   - 上传进度实时显示
   - 全部上传完成 → 创建 `reports` 记录（status=analyzing）+ `analysisTasks` 记录 → 返回 Page 3

2. **分析阶段**（云函数，用户无感）
   - 云函数 `analyzePhotos` 被触发
   - 按 5 张/批拆分，串行调用混元 API
   - 每批结果写入 `analysisTasks.completedBatches`
   - 全部批次完成 → 合并分析结果 → 更新 `reports` 记录 → 更新 `subjectProfiles`

3. **通知阶段**
   - 分析完成后，调用微信订阅消息 API 推送通知
   - 用户在 Page 3 的"最近记录"中看到新报告状态变为"查看报告"
   - 点击即可查看完整报告

### 云函数设计

```
cloudfunctions/
  uploadAndAnalyze/    # 上传完成后的入口，创建分析任务
  analyzeBatch/        # 单批次分析（5张），被 analyzePhotos 调用
  analyzePhotos/       # 主管控：拆分批次、串行调用 analyzeBatch、合并结果
  generatePaper/       # 生成验证/默认试卷 + A4 PDF
  generateReportPDF/   # 生成报告 PDF（用于分享/下载）
```

---

## 6. 默认诊断试卷的 AI 生成策略

### 生成流程

1. 用户选择年级 → 选择 A/B 卷
2. 云函数 `generatePaper` 调用混元 API，prompt 包含：
   - 年级信息
   - 该年级对应的常见卡点列表（预设 4-6 个）
   - A/B 卷的题型偏好（A 卷偏计算应用，B 卷偏推理建模）
   - 题目格式要求（填空题为主，标注卡点编码）
3. AI 返回结构化题目列表 → 存入 `papers` 集合
4. 用 `pdfkit` 或类似库生成 A4 PDF → 上传云存储

### 一致性保证

- 同一年级同一套试卷（如"三年级 A 卷"），prompt 模板固定
- 生成后缓存 PDF，同一学生重复请求不重新生成
- 不同学生请求同一套试卷，可复用已缓存的 PDF

---

## 7. 页面路由配置

```json
{
  "pages": [
    "pages/index/index",
    "pages/subject-select/subject-select",
    "pages/subject-home/subject-home",
    "pages/upload/upload",
    "pages/upload-history/upload-history",
    "pages/report/report",
    "pages/generate-verification/generate-verification",
    "pages/default-paper/default-paper",
    "pages/paper-preview/paper-preview"
  ]
}
```

共 10 个注册页面（包含添加学生页和上传历史页，Page 5 已移除）。

---

## 8. MVP 功能优先级

### P0（必须上线）

| 功能 | 页面 | 说明 |
|------|------|------|
| 学生管理 | Page 1 | 添加/选择学生 |
| 学科选择 | Page 2 | 数/语/英三科 |
| 拍照诊断 | Page 3→4 | 上传→异步分析→报告 |
| 诊断报告 | Page 6 | 卡点排行 + 错题详情 |
| 验证试卷生成 | Page 3→7→9 | 选卡点→生成 PDF→打印 |
| 默认诊断试卷 | Page 3→8→9 | 选年级→生成 PDF→打印 |
| 异步分析 + 推送 | 云函数 | 核心技术架构 |

### P1（第二批迭代）

| 功能 | 说明 |
|------|------|
| 报告趋势对比 | 多次报告的卡点变化趋势图 |
| 报告分享图 | 生成长图分享到家长群 |
| 语文/英语卡点体系 | 独立于数学的 bug-taxonomy |
| Lonsid 智能笔集成 | 蓝牙连接 + 笔迹数据同步 |
| 家长仪表盘 | 跨学科、跨时间的全局视图 |

---

## 9. 关键设计决策记录

| 决策 | 选择 | 理由 |
|------|------|------|
| 上传模式切换 | 不用 Tab，由来源页参数决定 | 减少用户选择负担，模式由上下文隐含 |
| Lonsid 智能笔 | MVP 不做，不预留 UI | 避免未完成功能干扰用户，减少开发量 |
| 默认试卷来源 | AI 动态生成 | 无需维护题库，灵活适配各年级 |
| 上传与分析 | 完全解耦，异步处理 | 避免 20 张照片导致的超时问题，用户体验更好 |
| 分析进度展示 | 在学科主页显示状态，不用独立页面 | 减少页面数，用户可在等待期间浏览其他内容 |
| 通知方式 | 微信订阅消息推送 | 合规且用户触达率高 |
| 登录方式 | wx.login() 静默获取 openID | 零摩擦，无需注册登录页 |
| 数据隔离 | 云数据库安全规则，按 openID 读写 | 一行规则解决多用户数据隔离 |

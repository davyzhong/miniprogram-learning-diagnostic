# 数据字典

> 基于实际代码实现提取，非设计文档。所有字段均来自云函数和前端代码中的真实读写操作。

## 1. 集合概览

| 集合名称 | 用途 | 创建时机 | 主要写入方 |
|----------|------|----------|-----------|
| `students` | 学生基本信息 | 用户手动添加 | 前端 add-student 页面（通过 cloud.createStudentWithProfiles） |
| `subjectProfiles` | 学科档案：卡点追踪、分析状态 | 添加学生时自动创建三科；首次进入学科时幂等补建 | cloud.createStudentWithProfiles / ensureSubjectProfile；analyzePhotos 更新 |
| `reports` | 诊断/验证报告 | 上传照片触发分析时 | uploadAndAnalyze 创建初始记录；analyzePhotos 填充分析结果；generateReportPDF 回写 pdfFileId |
| `papers` | 生成的试卷记录 | AI 生成试卷后 | generatePaper 云函数 |
| `analysisTasks` | 异步分析任务进度追踪 | analyzePhotos 启动时 | analyzePhotos 云函数 |

---

## 2. 集合详细字段定义

### 2.1 students 集合

| 字段名 | 类型 | 必填 | 默认值 | 描述 | 示例值 |
|--------|------|------|--------|------|--------|
| `_id` | String | 是 | 自动生成 | 文档唯一标识 | `"665a1b2c3d4e5f6a7b8c9d0e"` |
| `_openid` | String | 是 | 云开发自动注入 | 创建者的微信 openID，用于数据隔离 | `"oXXXX-xxxxxxxxxxxx"` |
| `name` | String | 是 | — | 学生姓名，≤30 字 | `"张小明"` |
| `grade` | Number | 是 | — | 年级，1-6 | `3` |
| `avatarColor` | String | 否 | — | 头像背景色，前端按姓名 hash 计算 | `"#4299e1"` |
| `reportCount` | Number | 是 | `0` | 历史报告计数，addStudent 初始化为 0 | `0` |
| `createdAt` | Date | 是 | serverDate() | 创建时间 | `ISODate("2025-06-01T08:00:00Z")` |
| `updatedAt` | Date | 是 | serverDate() | 最后更新时间 | `ISODate("2025-06-01T08:00:00Z")` |

**代码来源**：`cloud.js` → `addStudent()`、`createStudentWithProfiles()`

---

### 2.2 subjectProfiles 集合

| 字段名 | 类型 | 必填 | 默认值 | 描述 | 示例值 |
|--------|------|------|--------|------|--------|
| `_id` | String | 是 | 自动生成 | 文档唯一标识 | `"665a1b2c3d4e5f6a7b8c9d0f"` |
| `_openid` | String | 是 | 云开发自动注入 | 创建者 openID | `"oXXXX-xxxxxxxxxxxx"` |
| `studentId` | String | 是 | — | 关联 students._id | `"665a1b2c3d4e5f6a7b8c9d0e"` |
| `subject` | String | 是 | — | 学科标识：`'math'` \| `'chinese'` \| `'english'` | `"math"` |
| `subjectName` | String | 是 | — | 学科中文名（冗余，便于展示） | `"数学"` |
| `totalReports` | Number | 是 | `0` | 该学科历史报告总数，analyzePhotos 用 `_.inc(1)` 累加 | `5` |
| `pendingBottlenecks` | Array\<Object\> | 是 | `[]` | 待验证的学习卡点列表 | 见下方子结构 |
| `improvedBottlenecks` | Array\<Object\> | 是 | `[]` | 已改善的学习卡点列表 | 见下方子结构 |
| `currentAnalysisId` | String | 是 | `''` | 当前正在分析的 reportId，空串表示空闲 | `"665a1b2c..."` |
| `analysisStatus` | String | 是 | `''` | 分析状态：`'analyzing'` \| `''`（空串=空闲）\| `null`（完成后清空） | `"analyzing"` |
| `createdAt` | Date | 是 | serverDate() | 创建时间 | `ISODate("2025-06-01T08:00:00Z")` |
| `updatedAt` | Date | 是 | serverDate() | 最后更新时间 | `ISODate("2025-06-01T10:30:00Z")` |

#### pendingBottlenecks 子结构

| 字段名 | 类型 | 描述 | 示例值 |
|--------|------|------|--------|
| `lpCode` | String | 卡点编码 | `"LP-003"` |
| `lpName` | String | 卡点名称 | `"百分数/小数转换错误"` |
| `severity` | String | 严重程度：`'high'` \| `'medium'` \| `'low'` | `"high"` |
| `sinceDate` | Date | 首次发现日期 | `ISODate("2025-05-20T...")` |

#### improvedBottlenecks 子结构

| 字段名 | 类型 | 描述 | 示例值 |
|--------|------|------|--------|
| `lpCode` | String | 卡点编码 | `"LP-001"` |
| `lpName` | String | 卡点名称 | `"计算错误（加减乘除）"` |
| `improvedDate` | Date | 确认改善日期 | `ISODate("2025-06-01T...")` |

**代码来源**：`cloud.js` → `createStudentWithProfiles()`、`ensureSubjectProfile()`；`analyzePhotos/index.js` → `updateSubjectProfile()`、`clearSubjectProfileAnalysis()`

---

### 2.3 reports 集合

| 字段名 | 类型 | 必填 | 默认值 | 描述 | 示例值 |
|--------|------|------|--------|------|--------|
| `_id` | String | 是 | 自动生成 | 文档唯一标识 | `"665a1b2c3d4e5f6a7b8c9d10"` |
| `_openid` | String | 是 | 云开发自动注入 | 创建者 openID | `"oXXXX-xxxxxxxxxxxx"` |
| `studentId` | String | 是 | — | 关联 students._id | `"665a1b2c3d4e5f6a7b8c9d0e"` |
| `studentName` | String | 是 | — | 学生姓名（冗余，≤30 字） | `"张小明"` |
| `subject` | String | 是 | `'math'` | 学科：`'math'` \| `'chinese'` \| `'english'` | `"math"` |
| `type` | String | 是 | — | 报告类型：`'diagnosis'` \| `'verification'` | `"diagnosis"` |
| `sourceType` | String | 是 | `'photo'` | 数据来源：`'photo'` \| `'paper'` \| `'default-paper'` | `"photo"` |
| `status` | String | 是 | `'analyzing'` | 状态：`'analyzing'` \| `'completed'` \| `'failed'` | `"completed"` |
| `imageFileIds` | Array\<String\> | 是 | — | 云存储文件 ID 列表 | `["cloud://xxx/a.jpg", ...]` |
| `imageFiles` | Array\<Object\> | 是 | — | 每张照片的元数据和 OCR 去重信息 | 见下方子结构 |
| `paperId` | String | 是 | `''` | 关联 papers._id（验证/默认试卷模式时有值） | `"665a1b2c..."` |
| `summary` | String | 是 | `''` | 一句话诊断总结 | `"共发现 8 道错题，主要卡点：分数运算、单位换算"` |
| `totalErrors` | Number | 是 | `0` | 错题总数（已去重） | `8` |
| `bottlenecks` | Array\<Object\> | 是 | `[]` | 学习卡点列表（按 errorCount 降序） | 见下方子结构 |
| `errorDetails` | Array\<Object\> | 是 | `[]` | 错题详情列表 | 见下方子结构 |
| `previousReportId` | String | 否 | `''` | 对比的上一份已完成报告 ID（验证模式） | `"665a1b2c..."` |
| `comparisonSummary` | String | 是 | `''` | 与上次报告的对比总结 | `"2 个学习卡点已改善，1 个仍需继续验证..."` |
| `pdfFileId` | String | 否 | — | 报告 PDF 的云存储 fileID（generateReportPDF 写入） | `"cloud://xxx/report.pdf"` |
| `error` | String | 否 | — | status='failed' 时的错误原因 | `"图片分析失败，请稍后重试"` |
| `completedAt` | Date | 否 | — | 分析完成时间 | `ISODate("2025-06-01T10:32:00Z")` |
| `createdAt` | Date | 是 | new Date() | 创建时间 | `ISODate("2025-06-01T10:30:00Z")` |
| `updatedAt` | Date | 是 | new Date() | 最后更新时间 | `ISODate("2025-06-01T10:32:00Z")` |

#### imageFiles 子结构

| 字段名 | 类型 | 描述 | 示例值 |
|--------|------|------|--------|
| `fileID` | String | 云存储文件 ID | `"cloud://xxx/photo.jpg"` |
| `fileName` | String | 文件名（≤120 字） | `"照片1"` |
| `fileSize` | Number | 文件大小（字节） | `1048576` |
| `ocrSummary` | String | AI 返回的 OCR 摘要（≤1000 字），用于去重指纹 | `"第3题：1/2+1/3=..."` |
| `contentFingerprint` | String | 归一化后的内容指纹 | `"第3题1213"` |
| `isDuplicate` | Boolean | 是否与历史或本次其他照片重复 | `false` |
| `duplicateOf` | String | 首次出现该指纹的 fileID（重复时有值） | `""` |

#### bottlenecks 子结构

| 字段名 | 类型 | 描述 | 示例值 |
|--------|------|------|--------|
| `lpCode` | String | 卡点编码（≤30 字） | `"LP-002"` |
| `lpName` | String | 卡点名称（≤80 字） | `"分数运算错误"` |
| `errorCount` | Number | 该卡点出现的错题次数 | `3` |
| `severity` | String | 严重程度：`'high'` \| `'medium'` \| `'low'` | `"high"` |
| `status` | String | 卡点状态（验证模式有值）：`'found'` \| `'improved'` \| `'worsened'` \| `'new'` \| `'persisting'` | `"new"` |
| `rootCause` | String | AI 给出的根因假设（≤300 字） | `"通分规则不熟练"` |
| `suggestion` | String | 修复建议（≤300 字） | `"练习异分母分数加减法"` |

#### errorDetails 子结构

| 字段名 | 类型 | 描述 | 示例值 |
|--------|------|------|--------|
| `questionContent` | String | 题目内容（≤500 字） | `"计算：1/2 + 1/3 = ?"` |
| `studentAnswer` | String | 学生答案（≤300 字） | `"2/5"` |
| `correctAnswer` | String | 正确答案（≤300 字） | `"5/6"` |
| `lpCode` | String | 关联卡点编码（≤30 字） | `"LP-002"` |
| `rootCause` | String | 根因（≤300 字） | `"未找到公分母直接相加"` |
| `suggestion` | String | 改进建议（≤300 字） | `"先求最小公倍数再通分"` |

**代码来源**：`uploadAndAnalyze/index.js` 创建初始记录；`analyzePhotos/index.js` 填充分析结果；`generateReportPDF/index.js` 回写 pdfFileId

---

### 2.4 papers 集合

| 字段名 | 类型 | 必填 | 默认值 | 描述 | 示例值 |
|--------|------|------|--------|------|--------|
| `_id` | String | 是 | 自动生成 | 文档唯一标识 | `"665a1b2c3d4e5f6a7b8c9d11"` |
| `_openid` | String | 是 | 云开发自动注入 | 创建者 openID | `"oXXXX-xxxxxxxxxxxx"` |
| `studentId` | String | 是 | — | 关联 students._id | `"665a1b2c3d4e5f6a7b8c9d0e"` |
| `subject` | String | 是 | `'math'` | 学科 | `"math"` |
| `type` | String | 是 | — | 试卷类型：`'verification'` \| `'default-diagnosis'` | `"verification"` |
| `grade` | Number | 是 | — | 适用年级 | `3` |
| `paperKey` | String | 是 | `''` | 套题标识（默认试卷用，如 `'grade3_a'`；验证试卷为空串，≤20 字） | `"grade3_a"` |
| `bottleneckTargets` | Array\<String\> | 是 | `[]` | 覆盖的 LP 编号列表（验证试卷用，最多 5 个） | `["LP-002", "LP-003"]` |
| `questions` | Array\<Object\> | 是 | — | 题目列表 | 见下方子结构 |
| `pdfFileId` | String | 是 | — | 生成的 PDF 云存储 fileID | `"cloud://xxx/paper.pdf"` |
| `totalPages` | Number | 是 | 计算值 | 预估页数（每页 6 题） | `2` |
| `createdAt` | Date | 是 | new Date() | 创建时间 | `ISODate("2025-06-01T09:00:00Z")` |

#### questions 子结构

| 字段名 | 类型 | 描述 | 示例值 |
|--------|------|------|--------|
| `index` | Number | 题号（从 1 开始） | `1` |
| `content` | String | 题目内容（≤500 字） | `"计算：3/4 ÷ 1/2 = ?"` |
| `answer` | String | 参考答案（≤300 字，不显示在试卷上） | `"3/2"` |
| `points` | Number | 分值 | `10` |
| `lpCode` | String | 关联卡点编码（≤30 字） | `"LP-002"` |
| `lpName` | String | 卡点名称（≤80 字） | `"分数运算错误"` |

**代码来源**：`generatePaper/index.js` 创建；preview 模式下不落库

---

### 2.5 analysisTasks 集合

| 字段名 | 类型 | 必填 | 默认值 | 描述 | 示例值 |
|--------|------|------|--------|------|--------|
| `_id` | String | 是 | 自动生成 | 文档唯一标识 | `"665a1b2c3d4e5f6a7b8c9d12"` |
| `_openid` | String | 是 | 继承自 report | 创建者 openID | `"oXXXX-xxxxxxxxxxxx"` |
| `reportId` | String | 是 | — | 关联 reports._id | `"665a1b2c3d4e5f6a7b8c9d10"` |
| `totalBatches` | Number | 是 | — | 总批次数（每批 ≤5 张） | `4` |
| `completedBatches` | Number | 是 | `0` | 已完成批次数 | `2` |
| `status` | String | 是 | `'processing'` | 状态：`'processing'` \| `'completed'` \| `'failed'` | `"processing"` |
| `fileIDs` | Array\<String\> | 是 | — | 所有图片文件 ID（注意字段名为 fileIDs，与 reports.imageFileIds 区分） | `["cloud://xxx/a.jpg", ...]` |
| `mode` | String | 是 | — | 分析模式：`'diagnosis'` \| `'verification'` | `"diagnosis"` |
| `subject` | String | 是 | — | 学科 | `"math"` |
| `studentId` | String | 是 | — | 关联 students._id | `"665a1b2c3d4e5f6a7b8c9d0e"` |
| `error` | String | 否 | — | status='failed' 时的错误原因 | `"图片分析失败，请稍后重试"` |
| `createdAt` | Date | 是 | new Date() | 创建时间 | `ISODate("2025-06-01T10:30:01Z")` |
| `completedAt` | Date | 否 | — | 完成/失败时间 | `ISODate("2025-06-01T10:32:00Z")` |

**代码来源**：`analyzePhotos/index.js` 创建和更新；`getAnalysisProgress/index.js` 读取最新一条

**注意**：同一 reportId 可能存在多条 analysisTasks 记录（超时重建场景），查询时按 `createdAt` 倒序取第一条作为当前任务。

---

## 3. 集合间关系图

```
┌──────────────┐       ┌─────────────────┐
│   students   │ 1───N │ subjectProfiles │
│              │       │                 │
│ _id ◄────────┼───────┤ studentId       │
│ name         │       │ subject         │
│ grade        │       │ pendingBN[]     │
│ reportCount  │       │ improvedBN[]    │
└──────┬───────┘       │ currentAnalysisId│
       │               │ analysisStatus   │
       │               └─────────────────┘
       │                        ▲
       │ 1                      │ N
       │                        │
       ▼                        │
┌──────────────┐                │
│   reports    │                │
│              │                │
│ _id          │                │
│ studentId ───┼────────────────┘
│ subject      │
│ type         │
│ status       │
│ paperId ─────┼────────┐
│ bottlenecks[]│        │
│ errorDetails[]       │
│ previousReportId     │
│ pdfFileId            │
└──────────────────────┼────────────────────┐
       │               │                    │
       │ 1             │ N                  │ 1
       │               │                    │
       ▼               ▼                    ▼
┌──────────────┐ ┌──────────────┐    ┌──────────────┐
│analysisTasks │ │   papers     │    │ 云存储        │
│              │ │              │    │              │
│ reportId ────┤ │ _id ◄────────┤    │ photos/      │
│ totalBatches │ │ studentId    │    │ papers/      │
│ completedBN  │ │ subject      │    │ reports/     │
│ status       │ │ type         │    │              │
│ fileIDs[]    │ │ bottleneckTgts│   │ reports.*.pdf│
└──────────────┘ │ pdfFileId    │    │ papers.*.pdf │
                 └──────────────┘    └──────────────┘
```

### 关系说明

| 关系 | 基数 | 关联字段 | 说明 |
|------|------|----------|------|
| students → subjectProfiles | 1:N | subjectProfiles.studentId = students._id | 每个学生最多 3 条学科档案 |
| students → reports | 1:N | reports.studentId = students._id | 一个学生有多份报告 |
| students → papers | 1:N | papers.studentId = students._id | 一个学生有多份试卷 |
| reports → analysisTasks | 1:N | analysisTasks.reportId = reports._id | 一份报告可能有多条任务记录（超时重建） |
| reports → papers | N:1 | reports.paperId = papers._id | 验证/默认试卷模式下关联试卷 |
| reports → reports | 自引用 | reports.previousReportId = reports._id | 验证报告引用上一份报告做对比 |
| subjectProfiles ← reports | 逻辑关联 | subjectProfiles.currentAnalysisId = reports._id | 指向当前正在分析的报告 |

---

## 4. 索引设计说明

以下索引基于 SETUP.md 中的配置要求和实际查询模式：

| 集合 | 索引字段 | 排序 | 对应查询场景 |
|------|----------|------|-------------|
| `students` | `createdAt`, `_openid` | 降序, 升序 | index 页面按创建时间倒序获取学生列表 |
| `subjectProfiles` | `studentId`, `_openid` | 升序, 升序 | 按学生获取学科档案（内存中筛选 subject） |
| `reports` | `studentId`, `subject`, `createdAt`, `_openid` | 升序, 升序, 降序, 升序 | subject-home/upload-history 按学生+学科获取报告列表 |
| `reports` | `studentId`, `subject`, `status`, `createdAt`, `_openid` | 升序, 升序, 升序, 降序, 升序 | analyzePhotos 查找最近一份 completed 报告做对比 |
| `papers` | `studentId`, `subject`, `type`, `grade`, `paperKey`, `_openid` | 全部升序 | default-paper 页面查询已有试卷 |

### 索引设计要点

1. **`_openid` 放在末尾**：安全规则限制为"仅创建者可读写"时，数据库引擎要求查询条件包含 `_openid`，将其放在复合索引末尾既满足权限要求又不影响前缀查询效率
2. **subjectProfiles 不再需要三字段复合索引**：代码改为先按 `studentId` 查询（最多返回 3 条），再在内存中 `find(item => item.subject === subject)` 筛选，避免维护复杂索引
3. **reports 有两个复合索引**：分别优化"列表查询"和"按状态过滤查询"两种不同访问模式
4. **analysisTasks 无显式索引**：该集合数据量小（每份报告 1-2 条），且仅在 getAnalysisProgress 中按 reportId 查询，云数据库默认 _id 索引 + 全表扫描可接受

---

## 5. 安全规则说明

### 统一安全规则

所有 5 个集合使用相同的安全规则：

```json
{
  "read": "doc._openid == auth.openid",
  "write": "doc._openid == auth.openid"
}
```

含义：只有文档的创建者（`_openid` 字段匹配当前登录用户的 `auth.openid`）才能读写该文档。

### 云函数端的归属校验

安全规则仅防止客户端 SDK 的直接越权访问。云函数在服务端执行时绕过安全规则，因此每个云函数入口都有额外的归属校验：

| 云函数 | 校验逻辑 |
|--------|----------|
| `uploadAndAnalyze` | 检查 student._openid === currentOpenId；检查 paper._openid === currentOpenId |
| `analyzePhotos` | 检查 report._openid === currentOpenId |
| `getAnalysisProgress` | 检查 report._openid === currentOpenId |
| `generatePaper` | 检查 student._openid === currentOpenId |
| `generateReportPDF` | 检查 reportData._openid === currentOpenId |

### 参数校验

各云函数入口还执行以下输入校验：

| 校验项 | 涉及云函数 | 规则 |
|--------|-----------|------|
| fileIDs 非空且 ≤20 | uploadAndAnalyze | 数组长度 1-20，每项以 `cloud://` 开头 |
| studentId 非空 | uploadAndAnalyze, generatePaper | 字符串非空 |
| subject 枚举 | uploadAndAnalyze, analyzeBatch, generatePaper | 仅限 `math/chinese/english` |
| mode 枚举 | uploadAndAnalyze | 仅限 `diagnosis/verification/paper/default-paper` |
| type 枚举 | generatePaper | 仅限 `verification/default-diagnosis` |
| targets 格式 | generatePaper | 正则 `/^LP-[A-Z0-9-]{1,24}$/`，最多 5 个 |
| grade 范围 | generatePaper | default-diagnosis 模式要求 1-6 |
| questionCount 范围 | generatePaper | 6-20，默认 12 |
| paperId 关联校验 | uploadAndAnalyze | paper.studentId === studentId，type 与 mode 匹配 |

# 数据字典

> 基于实际代码实现提取，非设计文档。所有字段均来自云函数和前端代码中的真实读写操作。

## 1. 集合概览

| 集合名称 | 用途 | 创建时机 | 主要写入方 |
|----------|------|----------|-----------|
| `students` | 学生基本信息 | 用户手动添加 | 前端 add-student 页面（通过 cloud.createStudentWithProfiles） |
| `studentMembers` | 孩子档案的家长成员关系 | 创建孩子、接受邀请、首次进入家长管理时补建 | studentAccess 云函数 |
| `studentInvites` | 家长扫码加入邀请 | 档案拥有者点击邀请家长 | studentAccess 云函数 |
| `subjectProfiles` | 学科档案：卡点追踪、分析状态 | 添加学生时自动创建三科；首次进入学科时幂等补建 | cloud.createStudentWithProfiles / ensureSubjectProfile；analyzePhotos 更新 |
| `reports` | 诊断/验证报告 | 上传照片触发分析时 | uploadAndAnalyze 创建初始记录；analyzePhotos 填充分析结果；generateReportPDF 回写 pdfFileId |
| `reportFeedback` | 家长对报告、卡点、错题、照片的纠错反馈 | 报告页提交反馈时 | reportFeedback 云函数 |
| `papers` | 生成的试卷记录 | AI 生成试卷后 | generatePaper 云函数 |
| `analysisTasks` | 异步分析任务进度追踪 | analyzePhotos 启动时 | analyzePhotos 云函数 |

> 学习记录页面不是独立集合，而是前端按天聚合 `reports`、`papers` 和 `reports.imageFiles` 后得到的时间线视图。

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

### 2.1.1 studentMembers 集合

| 字段名 | 类型 | 必填 | 默认值 | 描述 | 示例值 |
|--------|------|------|--------|------|--------|
| `_id` | String | 是 | 自动生成 | 文档唯一标识 | `"member_xxx"` |
| `studentId` | String | 是 | — | 关联 students._id | `"665a1b2c3d4e5f6a7b8c9d0e"` |
| `ownerOpenId` | String | 是 | — | 档案拥有者 openID | `"oOWNER"` |
| `memberOpenId` | String | 是 | — | 可访问该档案的家长 openID | `"oPARENT"` |
| `role` | String | 是 | `'viewer'` | 成员角色：`'owner'` \| `'viewer'` | `"viewer"` |
| `status` | String | 是 | `'active'` | 成员状态：`'active'` \| `'revoked'` | `"active"` |
| `displayName` | String | 否 | `''` | 家长备注名或微信昵称摘要 | `"妈妈"` |
| `joinedByInviteId` | String | 否 | `''` | 通过哪个邀请加入 | `"invite_xxx"` |
| `createdAt` | Date | 是 | serverDate() | 加入时间 | `ISODate("2026-06-13T08:00:00Z")` |
| `updatedAt` | Date | 是 | serverDate() | 最后更新时间 | `ISODate("2026-06-13T08:00:00Z")` |
| `revokedAt` | Date | 否 | — | 被移除时间 | `ISODate("2026-06-20T08:00:00Z")` |

**访问规则**：前端不直接查询该集合，统一通过 `studentAccess` 获取可访问学生、成员列表和权限信息。

---

### 2.1.2 studentInvites 集合

| 字段名 | 类型 | 必填 | 默认值 | 描述 | 示例值 |
|--------|------|------|--------|------|--------|
| `_id` | String | 是 | 自动生成 | 文档唯一标识 | `"invite_xxx"` |
| `studentId` | String | 是 | — | 关联 students._id | `"665a1b2c3d4e5f6a7b8c9d0e"` |
| `ownerOpenId` | String | 是 | — | 发起邀请的档案拥有者 openID | `"oOWNER"` |
| `tokenHash` | String | 是 | — | 邀请 token 的 SHA-256 哈希，不保存明文 token | `"9f86d081..."` |
| `inviteCode` | String | 是 | — | 8 位大写字母/数字邀请码，用于另一位家长手动输入加入 | `"QY8392AB"` |
| `role` | String | 是 | `'viewer'` | 接受邀请后获得的角色 | `"viewer"` |
| `status` | String | 是 | `'active'` | 邀请状态：`'active'` \| `'accepted'` \| `'expired'` | `"active"` |
| `expiresAt` | Date | 是 | 创建后 7 天 | 过期时间 | `ISODate("2026-06-20T08:00:00Z")` |
| `acceptedByOpenId` | String | 否 | `''` | 接受邀请的家长 openID | `"oPARENT"` |
| `acceptedAt` | Date | 否 | — | 接受时间 | `ISODate("2026-06-14T08:00:00Z")` |
| `createdAt` | Date | 是 | serverDate() | 创建时间 | `ISODate("2026-06-13T08:00:00Z")` |
| `updatedAt` | Date | 是 | serverDate() | 最后更新时间 | `ISODate("2026-06-13T08:00:00Z")` |

**访问规则**：邀请明文 token 只在创建时返回一次；后续校验时由 `studentAccess` 重新计算哈希并匹配。邀请码也只通过 `studentAccess` 查询和接受，前端不直接读写 `studentInvites`。

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
| `currentSummary` | String | 是 | `''` | 面向家长的当前综合诊断摘要 | `"应用题建模持续出现，建议优先训练"` |
| `currentBottlenecks` | Array\<Object\> | 是 | `[]` | 当前综合诊断卡点，状态仅为需要验证/持续出现/已有改善 | 见设计规格 |
| `nextAction` | String | 是 | `"拍照诊断"` | 当前建议的主要行动 | `"生成验证试卷"` |
| `latestEffectiveReportId` | String | 是 | `''` | 最近一次成功更新综合诊断的报告 ID | `"665a1b2c..."` |
| `pendingBottlenecks` | Array\<Object\> | 是 | `[]` | 待验证的学习卡点列表 | 见下方子结构 |
| `improvedBottlenecks` | Array\<Object\> | 是 | `[]` | 已改善的学习卡点列表 | 见下方子结构 |
| `currentAnalysisId` | String | 是 | `''` | 当前正在分析的 reportId，空串表示空闲 | `"665a1b2c..."` |
| `analysisStatus` | String | 是 | `''` | 分析状态：`'analyzing'` \| `''`（空串=空闲）\| `null`（完成后清空） | `"analyzing"` |
| `createdAt` | Date | 是 | serverDate() | 创建时间 | `ISODate("2025-06-01T08:00:00Z")` |
| `updatedAt` | Date | 是 | serverDate() | 最后更新时间 | `ISODate("2025-06-01T10:30:00Z")` |

#### currentBottlenecks 子结构

| 字段名 | 类型 | 描述 | 示例值 |
|--------|------|------|--------|
| `lpCode` | String | 卡点编码 | `"LP-001"` |
| `lpName` | String | 卡点名称 | `"计算错误（加减乘除）"` |
| `status` | String | 当前处理状态：`needs_verification` \| `persisting` \| `improved` | `"persisting"` |
| `trend` | String | 时间化趋势：`new` \| `persisting` \| `declining` \| `improved` \| `recurring` | `"declining"` |
| `firstSeenAt` | Date | 首次发现时间，使用报告 evidenceTime | `ISODate("2026-06-01T...")` |
| `lastSeenAt` | Date | 最近一次在诊断中出现的时间 | `ISODate("2026-06-12T...")` |
| `lastVerifiedAt` | Date | 最近一次验证时间 | `ISODate("2026-06-13T...")` |
| `lastPassedAt` | Date | 最近一次完整通过验证时间 | `ISODate("2026-06-13T...")` |
| `lastFailedVerificationAt` | Date | 最近一次验证未通过时间 | `ISODate("2026-06-13T...")` |
| `evidenceCount` | Number | 该卡点累计被诊断发现的次数 | `2` |
| `recentErrorCount` | Number | 最近一次诊断中相关错题数 | `3` |
| `verificationPassCount` | Number | 完整通过验证次数 | `1` |
| `verificationFailCount` | Number | 验证未通过次数 | `0` |
| `weight` | Number | 0-100 的当前关注权重，越高越需要优先处理 | `50` |

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

### 2.2.1 学习卡点展示元数据

学习卡点的家长可读名称、短名、分类、说明和验证方式由小程序端 `miniprogram/utils/bottleneck-taxonomy.js` 统一维护。`bottleneck-name.js`、`bottleneck-view.js`、学习记录、报告页和试卷预览均应通过该元数据或其兼容 helper 生成展示文本，避免同一 `lpCode` 在不同页面显示成不同名称。

MVP 数学卡点当前包含：

| 编码 | 短名 | 分类 | 验证方式 |
|------|------|------|----------|
| `LP-001` | 计算基础 | 计算与运算 | 计算过程验证题 |
| `LP-002` | 分数运算 | 分数小数 | 分数运算验证题 |
| `LP-003` | 小数百分数 | 分数小数 | 小数百分数互化题 |
| `LP-004` | 单位换算 | 单位量纲 | 单位换算验证题 |
| `LP-005` | 应用建模 | 应用建模 | 应用题建模验证题 |
| `LP-006` | 几何概念 | 空间几何 | 图形概念验证题 |
| `LP-007` | 符号理解 | 数学语言 | 数学符号理解题 |
| `LP-008` | 审题理解 | 数学语言 | 审题理解验证题 |
| `LP-009` | 书写规范 | 验算习惯 | 规范书写观察题 |
| `LP-010` | 抄写检查 | 验算习惯 | 抄写检查验证题 |

未知编码统一显示为“待确认卡点”，不把 `LP-xxx` 作为主要展示文字。

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
| `evidenceTime` | Date | 是 | 上传时刻 | 本次诊断证据进入系统的时间；历史试卷也以上传时间为准 | `ISODate("2026-06-13T10:00:00Z")` |
| `verificationUploadedAt` | Date | 否 | — | 验证试卷作答照片上传时间，仅 verification 报告写入 | `ISODate("2026-06-13T10:00:00Z")` |
| `summary` | String | 是 | `''` | 一句话诊断总结 | `"共发现 8 道错题，主要卡点：分数运算、单位换算"` |
| `totalErrors` | Number | 是 | `0` | 错题总数（已去重） | `8` |
| `bottlenecks` | Array\<Object\> | 是 | `[]` | 学习卡点列表（按 errorCount 降序） | 见下方子结构 |
| `errorDetails` | Array\<Object\> | 是 | `[]` | 错题详情列表 | 见下方子结构 |
| `previousReportId` | String | 否 | `''` | 对比的上一份已完成报告 ID（验证模式） | `"665a1b2c..."` |
| `comparisonSummary` | String | 是 | `''` | 与上次报告的对比总结 | `"2 个学习卡点已改善，1 个仍需继续验证..."` |
| `verificationTargets` | Array\<String\> | 是 | `[]` | 本次验证试卷的目标卡点编码 | `["LP-001"]` |
| `verificationEvidence` | Array\<Object\> | 是 | `[]` | 按目标卡点汇总的验证作答证据；只有完整且全对才确认改善 | 见下方子结构 |
| `quality` | Object | 是 | 规则计算 | 报告证据质量，决定是否可作为强结论更新长期档案 | 见下方子结构 |
| `isEffective` | Boolean | 是 | `false` | 是否允许参与综合诊断和最近变化 | `true` |
| `changeSummary` | String | 是 | `''` | 面向家长的一句话变化描述 | `"发现分数运算卡点"` |
| `profileAppliedAt` | Date | 否 | — | 成功应用到综合诊断的时间 | `ISODate("2026-06-12T...")` |
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
| `uploadedAt` | Date | 该照片上传到系统的时间；分析完成后继续保留 | `ISODate("2026-06-13T10:00:00Z")` |
| `ocrSummary` | String | AI 返回的 OCR 摘要（≤1000 字），用于去重指纹 | `"第3题：1/2+1/3=..."` |
| `contentFingerprint` | String | 归一化后的内容指纹 | `"第3题1213"` |
| `isDuplicate` | Boolean | 是否与历史或本次其他照片重复 | `false` |
| `duplicateOf` | String | 首次出现该指纹的 fileID（重复时有值） | `""` |
| `analysisStatus` | String | 单张照片分析状态：`completed` \| `failed` \| `''` | `"completed"` |
| `analysisError` | String | 单张照片分析失败原因，仅 failed 时有值 | `"timeout"` |

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
| `sourceImageIndex` | Number | 错题来自第几张上传照片，按上传顺序从 1 开始 | `1` |
| `sourceFileID` | String | 错题来源照片 fileID，用于报告页关联原图/OCR 摘要 | `"cloud://xxx/photo.jpg"` |
| `sourceOcrSummary` | String | 来源页 OCR 摘要快照，便于旧数据或图片链接失效时仍可解释来源 | `"第一页主要是小数乘除计算"` |

> `sourceImageIndex` / `sourceFileID` 由 `analyzePhotos.mergeBatchResults()` 在合并逐页结果时补充。历史报告可能没有这些字段；前端会按缺省值安全展示，不要求迁移。

#### verificationEvidence 子结构

| 字段名 | 类型 | 描述 | 示例值 |
|--------|------|------|--------|
| `lpCode` | String | 验证目标卡点编码 | `"LP-001"` |
| `expectedQuestionCount` | Number | 验证试卷中该卡点的预期题数；当前验证卷默认每卡点 5 题 | `5` |
| `attemptedQuestionCount` | Number | OCR 明确识别到已经作答的题数 | `3` |
| `incorrectQuestionCount` | Number | 已识别作答中的错题数 | `0` |
| `blankQuestionCount` | Number | 清晰可见但没有作答或明显空白的题数 | `0` |
| `unclearQuestionCount` | Number | 模糊、遮挡或无法确认对错的题数 | `0` |
| `missingQuestionCount` | Number | 预期题目中未形成有效证据的题数 | `0` |
| `complete` | Boolean | 是否形成完整且可判定的作答证据；仅 passed/failed 为 true | `true` |
| `allCorrect` | Boolean | 是否在完整、清晰前提下全部正确；仅 passed 为 true | `true` |
| `evidenceStatus` | String | 证据状态：`passed` \| `failed` \| `incomplete` \| `unclear` \| `missing` | `"passed"` |
| `evidenceReason` | String | 面向家长展示的证据说明 | `"5 道验证题均清晰作答且全部正确"` |

> 改善判定规则：只有 `evidenceStatus === 'passed'` 的学习卡点，才允许进入 `improved`。空白、模糊、缺失或 AI 未返回证据，均不能判定为已改善。

#### quality 子结构

| 字段名 | 类型 | 描述 | 示例值 |
|--------|------|------|--------|
| `level` | String | 质量等级：`high` \| `medium` \| `low` | `"medium"` |
| `status` | String | 使用状态：`usable` \| `needs_review` \| `insufficient` | `"needs_review"` |
| `score` | Number | 0-100 的规则评分 | `72` |
| `reasons` | Array\<String\> | 需要复核或样本不足的原因 | `["部分照片分析失败", "样本较少"]` |
| `sampleSummary` | String | 样本规模摘要 | `"2 张有效照片，3 道相关错题"` |

> `quality.status === 'insufficient'` 的报告会展示给家长，但不会更新 `subjectProfiles.currentBottlenecks`，避免模糊或重复样本污染长期学习档案。

**代码来源**：`uploadAndAnalyze/index.js` 创建初始记录；`analyzePhotos/index.js` 填充分析结果；`generateReportPDF/index.js` 回写 pdfFileId

---

### 2.3.1 reportFeedback 集合

| 字段名 | 类型 | 必填 | 默认值 | 描述 | 示例值 |
|--------|------|------|--------|------|--------|
| `_id` | String | 是 | 自动生成 | 文档唯一标识 | `"feedback_xxx"` |
| `_openid` | String | 是 | 当前 OPENID | 提交反馈的家长 openID | `"oPARENT"` |
| `studentId` | String | 是 | — | 关联 students._id | `"stu_xxx"` |
| `reportId` | String | 是 | — | 关联 reports._id | `"report_xxx"` |
| `subject` | String | 是 | `''` | 学科标识 | `"math"` |
| `type` | String | 是 | — | 反馈类型：`wrong_bottleneck` \| `wrong_question` \| `duplicate_photo` \| `unclear_result` \| `other` | `"wrong_bottleneck"` |
| `targetType` | String | 是 | `'report'` | 反馈对象：`report` \| `bottleneck` \| `errorDetail` \| `photo` | `"bottleneck"` |
| `targetId` | String | 否 | `''` | 具体对象 ID，例如 LP 编号、错题序号或 fileID | `"LP-001"` |
| `reason` | String | 是 | — | 家长反馈原因（≤120 字） | `"这个卡点不准确"` |
| `note` | String | 否 | `''` | 补充说明（≤500 字） | `"孩子只是抄错了数字"` |
| `status` | String | 是 | `'submitted'` | 处理状态：`submitted` \| `reviewed` \| `ignored` | `"submitted"` |
| `createdAt` | Date | 是 | new Date() | 提交时间 | `ISODate("2026-06-15T...")` |
| `updatedAt` | Date | 是 | new Date() | 更新时间 | `ISODate("2026-06-15T...")` |

**规则**：反馈只记录复核线索，不直接修改 `reports`、`subjectProfiles` 或学习记录派生结果。权限由 `reportFeedback` 云函数校验，owner 和 active viewer 均可提交。

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
| `bottleneckSummaries` | Array\<String\> | 否 | `[]` | 面向家长和学生展示的卡点短名称 | `["分数运算", "审题理解"]` |
| `questions` | Array\<Object\> | 是 | — | 题目列表 | 见下方子结构 |
| `pdfFileId` | String | 是 | — | 生成的 PDF 云存储 fileID | `"cloud://xxx/paper.pdf"` |
| `paperDate` | String | 是 | 生成当天 | 试卷日期，打印卷和答案页会醒目显示 | `"2026-06-13"` |
| `generatedAt` | Date | 否 | 生成时刻 | PDF 生成完成并落库的时间 | `ISODate("2026-06-13T10:00:00Z")` |
| `studentPages` | Number | 否 | 计算值 | 学生作答页数 | `1` |
| `answerPages` | Number | 否 | 计算值 | 参考答案页数 | `1` |
| `totalPages` | Number | 是 | 计算值 | PDF 总页数，包含学生卷和答案页 | `2` |
| `createdAt` | Date | 是 | new Date() | 创建时间 | `ISODate("2025-06-01T09:00:00Z")` |

> 验证试卷的题量规则：`questions.length = bottleneckTargets.length × 5`。每个学习卡点包含 3 道核心验证题和 2 道迁移延展题；默认诊断试卷仍使用 `questionCount` 参数（6-20，默认 12）。

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

**学习记录备注**：正式落库的验证试卷和默认诊断试卷会进入学习记录时间线；`preview=true` 生成的临时 PDF 不进入学习记录。

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
| students → studentMembers | 1:N | studentMembers.studentId = students._id | 一个孩子档案可以有多个家长成员 |
| students → studentInvites | 1:N | studentInvites.studentId = students._id | 拥有者可为孩子档案创建多个邀请 |

---

## 4. 索引设计说明

以下索引基于 SETUP.md 中的配置要求和实际查询模式：

| 集合 | 索引字段 | 排序 | 对应查询场景 |
|------|----------|------|-------------|
| `students` | `createdAt`, `_openid` | 降序, 升序 | index 学习档案首页按创建时间倒序获取当前孩子 |
| `studentMembers` | `memberOpenId`, `status` | 升序, 升序 | studentAccess 获取当前微信可访问的孩子档案 |
| `studentMembers` | `studentId`, `status` | 升序, 升序 | studentAccess 获取某个孩子档案的家长成员列表 |
| `studentMembers` | `studentId`, `memberOpenId`, `status` | 升序, 升序, 升序 | studentAccess 判断当前用户是否已加入或是否可重复接受邀请 |
| `studentInvites` | `studentId`, `status` | 升序, 升序 | studentAccess 获取/校验某个孩子档案的有效邀请 |
| `studentInvites` | `inviteCode`, `status` | 升序, 升序 | 通过 8 位邀请码查找仍有效的家庭邀请 |
| `studentInvites` | `expiresAt`, `status` | 升序, 升序 | 后续清理过期邀请或调试查询 |
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

核心学习数据集合继续使用创建者隔离规则：

```json
{
  "read": "doc._openid == auth.openid",
  "write": "doc._openid == auth.openid"
}
```

含义：只有文档的创建者（`_openid` 字段匹配当前登录用户的 `auth.openid`）才能直接读写该文档。

`studentMembers` 和 `studentInvites` 是授权辅助集合，前端不直接读写，统一通过 `studentAccess` 云函数操作。后续共享家长读取报告、试卷、上传记录时，也应通过访问感知的数据云函数读取，避免把主数据集合的客户端规则放宽。

### 云函数端的归属校验

安全规则仅防止客户端 SDK 的直接越权访问。云函数在服务端执行时绕过安全规则，因此每个云函数入口都有额外的归属校验：

| 云函数 | 校验逻辑 |
|--------|----------|
| `studentAccess` | 基于当前 OPENID 校验 owner/viewer 关系；owner 才能邀请和移除家长 |
| `studentData` | 基于当前 OPENID 校验 owner/viewer 关系；聚合返回学习资料和角色权限 |
| `uploadAndAnalyze` | 通过共享 access helper 校验当前 OPENID 是否可操作对应学生/试卷 |
| `analyzePhotos` | 通过共享 access helper 校验触发者或当前用户是否可操作对应报告 |
| `getAnalysisProgress` | 通过共享 access helper 校验当前 OPENID 是否可读取对应报告进度 |
| `generatePaper` | 通过共享 access helper 校验当前 OPENID 是否可为对应学生生成试卷 |
| `generateReportPDF` | 通过共享 access helper 校验当前 OPENID 是否可读取并生成对应报告 PDF |

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

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
| `englishImportBatches` | 英语词库候选导入批次 | 导入 PEP 单词表图片或结构化候选时 | englishVocabulary 云函数 |
| `studentEnglishWords` | 单个孩子的个人英语单词库 | 家长确认英语导入批次后 | englishVocabulary 云函数 |
| `englishPracticeSessions` | 英语单词熟悉度、纸面听写会话和逐题/照片证据记录 | 开始英语练习时 | englishVocabulary 云函数 |
| `learningResourcePacks` | 数学学习卡点任务包 | 点击“学一下”生成或读取时 | learningResource 云函数 |
| `papers` | 生成的试卷记录 | AI 生成试卷后 | generatePaper 云函数 |
| `analysisTasks` | 异步分析任务进度追踪 | analyzePhotos 启动时 | analyzePhotos 云函数 |
| `aiUsageEvents` | AI 用量追加事件账本（token、估算成本、状态） | AI 云函数发起调用时 | analyzeBatch / generatePaper / learningResource / englishVocabulary（通过 usage-ledger） |
| `dataDeletionRequests` | 用户发起的数据删除请求 | 用户在 AI 用量页申请时 | aiUsage 云函数 |
| `userConsents` | 内测授权同意记录 | 用户首次同意内测说明时 | aiUsage 云函数 |

> 学习记录页面不是独立集合，而是前端按天聚合 `reports`、`papers`、`reports.imageFiles`、`englishPracticeSessions` 和 `learningResourcePacks` 后得到的时间线视图。页面会派生学习天数、主记录数、验证试卷数、验证反馈数、学习任务包数等摘要；长时间中断的分析记录通过 `studentData.cleanupStaleLearningRecords` 预检和 owner 确认后归档，不新增事件集合。

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
| `archivedBottlenecks` | Array\<Object\> | 否 | `[]` | 归档保护：rebuild/restore 时把旧 currentBottlenecks 存档，防止丢失 | 见 currentBottlenecks 子结构 |
| `archivedAt` | Date | 否 | — | 归档时间 | `ISODate("2026-06-19T08:26:35Z")` |
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
| `nodeIds` | Array\<String\> | 关联数学知识地图节点；旧 LP 卡点可为空，新数学诊断应尽量填充 | `["MATH-NUM-DEC-MUL-POINT"]` |
| `candidateBottlenecks` | Array\<Object\> | 细颗粒度候选卡点，含粗类、家族、细卡点和证据强度 | 见 reports.bottlenecks 子结构 |
| `recommendedResourceIds` | Array\<String\> | 推荐重学资源 ID 列表 | `["RES-BILI-DEC-MUL-001"]` |
| `resourcePlan` | Array\<Object\> | 面向家长的资源顺序、平台、链接和角色 | `[{ "platform": "B站" }]` |
| `evidenceStrength` | String | 证据强度：`high` \| `medium` \| `low` | `"high"` |
| `nextActionType` | String | 下一步动作类型：`resourceReview` \| `microValidation` 等 | `"resourceReview"` |
| `nextActionText` | String | 面向家长的下一步建议 | `"先看高质量锚点校准小数乘法..."` |

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
| `verificationPaperId` | String | 否 | `''` | 诊断报告自动触发生成的验证卷 ID（report→paper 正向关联） | `"5caf1a7c..."` |
| `verificationPaperStatus` | String | 否 | `''` | 验证卷生成状态：`'generating'` \| `'ready'` \| `'failed'` | `"ready"` |
| `evidenceTime` | Date | 是 | 上传时刻 | 本次诊断证据进入系统的时间；历史试卷也以上传时间为准 | `ISODate("2026-06-13T10:00:00Z")` |
| `verificationUploadedAt` | Date | 否 | — | 验证试卷作答照片上传时间，仅 verification 报告写入 | `ISODate("2026-06-13T10:00:00Z")` |
| `summary` | String | 是 | `''` | 一句话诊断总结 | `"共发现 8 道错题，主要卡点：分数运算、单位换算"` |
| `totalErrors` | Number | 是 | `0` | 错题总数（已去重） | `8` |
| `bottlenecks` | Array\<Object\> | 是 | `[]` | 学习卡点列表（按 errorCount 降序） | 见下方子结构 |
| `errorDetails` | Array\<Object\> | 是 | `[]` | 错题详情列表 | 见下方子结构 |
| `previousReportId` | String | 否 | `''` | 对比的上一份已完成报告 ID（验证模式） | `"665a1b2c..."` |
| `comparisonSummary` | String | 是 | `''` | 与上次报告的对比总结 | `"2 个学习卡点已改善，1 个仍需继续验证..."` |
| `verificationTargets` | Array\<String\> | 是 | `[]` | 本次验证试卷的目标卡点编码，兼容 LP/BN/CHI 目标 | `["BN-FINE-4"]` |
| `verificationEvidence` | Array\<Object\> | 是 | `[]` | 按目标卡点汇总的验证作答证据；只有完整且全对才确认改善 | 见下方子结构 |
| `verificationPageCodes` | Array\<String\> | 否 | `[]` | 本次作答照片中识别到的验证任务页编号 | `["MATH-V-20260616-01-P02"]` |
| `verificationPageEvidence` | Array\<Object\> | 否 | `[]` | 按页面编号汇总的验证证据，用于追踪任务包哪几页已回传 | 见下方子结构 |
| `quality` | Object | 是 | 规则计算 | 报告证据质量，决定是否可作为强结论更新长期档案 | 见下方子结构 |
| `isEffective` | Boolean | 是 | `false` | 是否允许参与综合诊断和最近变化 | `true` |
| `learningMapBackfill` | Object | 否 | — | 数学旧报告学习地图/层级字段回填记录 | `{ "version": "math-learning-map-v2.2-hierarchy" }` |
| `reanalysis` | Object | 否 | — | 历史重分析标记；合并快照会包含 `aggregateCurrentSnapshot=true` | `{ "version": "math-full-reanalysis-v2.2-hierarchy" }` |
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
| `pageCode` | String | 验证任务页编号，只有验证卷作答照片识别到页面编号时有值 | `"MATH-V-20260616-01-P02"` |
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
| `nodeIds` | Array\<String\> | 关联知识地图节点 ID | `["MATH-NUM-FRACTION-ADD-SUB-COMMON"]` |
| `candidateBottlenecks` | Array\<Object\> | 数学细颗粒度卡点候选；每个候选必须尽量带粗类/家族字段 | 见下方 |
| `evidenceStrength` | String | 综合证据强度：`high` \| `medium` \| `low` | `"medium"` |
| `recommendedResourceIds` | Array\<String\> | 推荐学习资源 ID | `["RES-BILI-FRACTION-DIV-001"]` |
| `resourcePlan` | Array\<Object\> | 推荐资源的可展示计划，保存平台、标题、URL、推荐等级和角色 | `[{ "role": "国内补充" }]` |
| `nextActionType` | String | 下一步动作类型 | `"resourceReview"` |
| `nextActionText` | String | 家长可读下一步建议 | `"先用推荐资源重学，再做微验证。"` |

#### candidateBottlenecks 子结构

| 字段名 | 类型 | 描述 | 示例值 |
|--------|------|------|--------|
| `bottleneckId` | String | 细卡点 ID，通常为 `BN-*` | `"BN-DEC-MUL-POINT-COUNT"` |
| `title` | String | 细卡点中文标题 | `"小数乘法中积的小数位数判断错误"` |
| `nodeId` | String | 对应知识节点 ID | `"MATH-NUM-DEC-MUL-POINT"` |
| `categoryId` | String | 粗类 ID，用于展示分组和资源/验证调度 | `"MATH-CAT-CALC-RULE"` |
| `categoryTitle` | String | 粗类中文名 | `"计算规则"` |
| `familyId` | String | 卡点家族 ID，用于把同类细卡点合并到同一验证任务页 | `"MATH-FAM-DECIMAL-POINT"` |
| `familyTitle` | String | 卡点家族中文名 | `"小数点定位与移动"` |
| `categoryPath` | Array\<String\> | 中文层级路径 | `["计算规则", "小数点定位与移动", "小数乘法中积的小数位数判断错误"]` |
| `evidenceStrength` | String | 此候选卡点的证据强度 | `"high"` |
| `microValidationRequired` | Boolean | 是否需要微验证确认 | `true` |
| `suggestedMicroValidation` | Array\<String\> | 微验证题型建议 | `["给出 3 道小数乘法判断积的小数位数"]` |
| `recommendedResourceIds` | Array\<String\> | 针对此候选卡点的资源 ID | `["RES-BILI-DEC-MUL-001"]` |

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
| `lpCode` | String | 验证目标卡点编码；细卡点验证时可为 `BN-*` | `"BN-FINE-4"` |
| `targetId` | String | 细卡点、知识节点或语文具体错项 ID；旧数据可能为空 | `"BN-FINE-4"` |
| `targetType` | String | 目标类型：`fine_bottleneck` \| `knowledge_node` \| `chinese_error_item` \| `legacy_bottleneck` | `"fine_bottleneck"` |
| `displayName` | String | 家长可读目标名称 | `"分数通分不稳"` |
| `legacyLpCode` | String | 兼容旧粗卡点的父级 LP 编码 | `"LP-002"` |
| `pageCode` | String | 该目标所在验证任务页编号 | `"MATH-V-20260616-01-P02"` |
| `questionIds` | Array\<String\> | 该目标对应的题目 ID 列表 | `["MATH-V-20260616-01-P02-Q01"]` |
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

#### verificationPageEvidence 子结构

| 字段名 | 类型 | 描述 | 示例值 |
|--------|------|------|--------|
| `pageCode` | String | 验证任务页编号 | `"MATH-V-20260616-01-P02"` |
| `fileIDs` | Array\<String\> | 回传该页的照片 fileID 列表 | `["cloud://page-2.jpg"]` |
| `targetIds` | Array\<String\> | 该页形成证据的目标 ID | `["BN-FINE-4"]` |
| `attemptedQuestionCount` | Number | 本页清晰作答且可判断对错的题数 | `5` |
| `incorrectQuestionCount` | Number | 本页明确答错题数 | `0` |
| `blankQuestionCount` | Number | 本页空白题数 | `0` |
| `unclearQuestionCount` | Number | 本页模糊或无法判断题数 | `0` |
| `missingQuestionCount` | Number | 本页未形成有效证据题数 | `0` |

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

### 2.3.2 英语个人词库集合

#### englishImportBatches

| 字段名 | 类型 | 描述 | 示例值 |
|--------|------|------|--------|
| `studentId` | String | 关联 students._id | `"stu_xxx"` |
| `subject` | String | 固定为 `english` | `"english"` |
| `sourceFile` | String | 来源文件名或资料说明 | `"PEP六年级上册 英语单词句型表.pdf"` |
| `sourceType` | String | 来源类型；内置个人词库为 `pep-vocabulary-seed` | `"pep-vocabulary-seed"` |
| `status` | String | `pending_review` \| `confirmed` | `"pending_review"` |
| `candidateWords` | Array\<Object\> | AI/OCR 提取后的候选单词，确认前不进入正式词库 | 见 `studentEnglishWords` 字段 |
| `wordCandidateCount` | Number | 候选单词数量 | `96` |
| `sourceSummary` | Array\<Object\> | 内置词库导入时记录各册来源、URL 和词数 | `[{ "grade": 6, "volume": "上册", "wordCount": 88 }]` |
| `createdAt` / `updatedAt` | Date | 创建和更新时间 | `ISODate("2026-06-15T...")` |

#### studentEnglishWords

| 字段名 | 类型 | 描述 | 示例值 |
|--------|------|------|--------|
| `studentId` | String | 关联 students._id | `"stu_xxx"` |
| `word` | String | 英文单词，统一小写去重 | `"science"` |
| `meanings` | Array\<String\> | 中文释义，可合并多个来源 | `["科学", "科学课"]` |
| `grade` / `volume` / `unit` | Number/String/String | 来源年级、册别、单元 | `6`, `"上册"`, `"Unit 1"` |
| `familiarity` | Object | 熟悉度维度进度，由口头熟悉度功能更新 | `{ "status": "untested", "correctCount": 0, "wrongCount": 0, "lastTestedAt": "", "nextReviewAt": "", "lastDirection": "" }` |
| `spelling` | Object | 拼写维度进度，由纸面听写功能更新 | `{ "status": "untested", "correctCount": 0, "wrongCount": 0, "lastTestedAt": "", "nextReviewAt": "" }` |
| `overallMastery` | String | 双维派生掌握状态：`untested` \| `partial` \| `mastered` | `"untested"` |
| `masteryStatus` | String | `untested` \| `needs_practice` \| `reviewing` \| `mastered` | `"needs_practice"` |
| `correctCount` | Number | 连续复测正确次数，错误后清零 | `2` |
| `wrongCount` | Number | 累计错误次数，用于高频错词排序 | `3` |
| `lastReviewedAt` | String | 最近听写日期，`YYYY-MM-DD` | `"2026-06-15"` |
| `nextReviewAt` | String | 下次复测日期；已掌握为空 | `"2026-06-18"` |
| `sources` | Array\<Object\> | 来源批次、文件、页面和来源链接；重复导入时按来源去重合并 | `[{ "batchId": "batch_xxx", "sourceFile": "PEP六年级上册 英语单词句型表.pdf" }]` |

**内置个人词库**：`data/english/zhong-qingyu-pep-vocabulary.seed.json` 是钟青羽当前英语学习使用的 PEP 个人词库归档，覆盖 3上、3下、4上、4下、5上、5下、6上，共 505 条单词/教材词组。云函数部署包内的副本位于 `cloudfunctions/englishVocabulary/zhong-qingyu-pep-vocabulary.json`。

**双维进度兼容规则**：2026-06-16 起，新导入和种子导入的单词会写入 `familiarity`、`spelling` 和 `overallMastery`。旧字段 `masteryStatus`、`correctCount`、`wrongCount`、`lastReviewedAt`、`nextReviewAt` 暂时保留作为兼容字段；缺少双维字段的旧词在读取时会被归一化为 `familiarity = legacy masteryStatus`、`spelling = untested`，避免历史词库不可用。

**双维状态机规则**：`familiarity` 和 `spelling` 独立运行 `untested → needs_practice → reviewing → mastered` 状态机。`correct` 推进 1 天、3 天、7 天复测；`incorrect` 回到 `needs_practice`；`unclear` 不更新状态。抽词按双维薄弱、当前维薄弱、到期复测、另一维已掌握但当前维未测、新词、未到期 reviewing 的顺序选择。

#### englishPracticeSessions

| 字段名 | 类型 | 描述 | 示例值 |
|--------|------|------|--------|
| `studentId` | String | 关联 students._id | `"stu_xxx"` |
| `subject` | String | 固定为 `english` | `"english"` |
| `functionType` | String | v2 功能维度：`familiarity` \| `spelling`；旧记录可能为空 | `"familiarity"` |
| `type` | String | 会话类型：`word-familiarity` \| `word-dictation-paper` \| `word-dictation` | `"word-familiarity"` |
| `status` | String | `in_progress` \| `submitted` \| `completed` | `"in_progress"` |
| `analysisStatus` | String | 纸面听写分析状态：`waiting_upload` \| `pending_analysis` \| `completed`；熟悉度会话可为空 | `"pending_analysis"` |
| `wordItems` | Array\<Object\> | 本轮词队列，默认 20 个词，中文/英文提示约各半 | `[{ "word": "science" }]` |
| `attempts` | Array\<Object\> | 逐题识别和 AI 判定记录 | 见下方 |
| `photoFileIds` | Array\<String\> | 纸面听写上传的答案照片 fileID | `["cloud://xxx"]` |
| `dictationResults` | Array\<Object\> | 候选词约束 OCR 后的逐词批改结果，只服务纸面听写 | `[{ "targetWord": "science", "verdict": "correct" }]` |
| `durationMs` | Number | 熟悉度逐题答题耗时或纸面听写整场耗时，静默记录用于后续区分不会/不熟/粗心 | `4200` |

`attempts` 子结构：`attemptId`（幂等键，格式 `att-{sessionId}-{wordId}-{timestamp}-{random}`）、`wordId`、`targetWord`、`promptType`、`recognizedText`、`audioFileID`、`durationMs`、`judgment.status`（`correct/incorrect/unclear`）、`retryCount`、`reviewedAt`。`unclear` 只安排本轮重听，不更新正误计数。每次提交通过 `db.command.push` 原子追加，避免并发覆盖。

`dictationResults` 子结构：`queueKey`、`wordId`、`targetWord`、`recognizedText`、`verdict`（`correct/incorrect/unclear`）、`reason`、`confidence`、`editDistance`。缺失、空白、模糊或无法对应候选词的项统一落到 `unclear`；AI/OCR 返回后会用目标词和识别文本做确定性拼写复核，不直接信任 AI verdict。

**熟悉度规则**：默认每轮 20 词；错词本轮稍后重现并更新 `familiarity`；正确词按 1 天、3 天、7 天进入复测，完成连续复测后进入 `mastered`。

**纸面听写规则**：先创建 `functionType=spelling` 的听写会话并保存 `photoFileIds` 作为答案证据；随后用本次 `wordItems` 作为候选词做约束 OCR，只有 `correct/incorrect` 更新 `spelling`，`unclear` 只记录证据、不计正误、不更新 `familiarity`。

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
| `bottleneckTargets` | Array\<String\> | 是 | `[]` | 覆盖的验证目标编码，兼容 LP/BN/CHI；任务包模式最多 80 个 | `["BN-FINE-1", "BN-FINE-2"]` |
| `bottleneckSummaries` | Array\<String\> | 否 | `[]` | 面向家长和学生展示的卡点短名称 | `["分数运算", "审题理解"]` |
| `verificationPack` | Object | 否 | `null` | 验证任务包元数据，记录目标分页、页面编号和题目归属 | 见下方子结构 |
| `questions` | Array\<Object\> | 是 | — | 题目列表 | 见下方子结构 |
| `pdfFileId` | String | 是 | — | 生成的 PDF 云存储 fileID | `"cloud://xxx/paper.pdf"` |
| `paperDate` | String | 是 | 生成当天 | 试卷日期，打印卷和答案页会醒目显示 | `"2026-06-13"` |
| `generatedAt` | Date | 否 | 生成时刻 | PDF 生成完成并落库的时间 | `ISODate("2026-06-13T10:00:00Z")` |
| `studentPages` | Number | 否 | 计算值 | 学生作答页数 | `1` |
| `answerPages` | Number | 否 | 计算值 | 参考答案页数 | `1` |
| `totalPages` | Number | 是 | 计算值 | PDF 总页数，包含学生卷和答案页 | `2` |
| `studentPageCodes` | Array\<String\> | 否 | `[]` | PDF 学生作答页中打印出的页面编号 | `["MATH-V-20260616-01-P01"]` |
| `studentPageMetadata` | Array\<Object\> | 否 | `[]` | 学生作答页编号与题目 ID 的对应关系 | `[{ "pageCode": "MATH-V-...", "questionIds": [...] }]` |
| `createdAt` | Date | 是 | new Date() | 创建时间 | `ISODate("2025-06-01T09:00:00Z")` |
| `triggeredByReport` | String | 否 | `''` | 自动生成时关联的诊断报告 ID（report→paper 正向关联） | `"117e1a7d..."` |
| `verificationStatus` | String | 否 | `'pending'` | 验证卷生命周期：`'pending'`（待作答）\| `'completed'`（已生成验证报告） | `"pending"` |
| `verificationReportId` | String | 否 | `''` | 验证完成后关联的验证报告 ID | `"5caf1a7c..."` |
| `verifiedAt` | Date | 否 | — | 验证报告完成时间 | `ISODate("2026-06-20T10:00:00Z")` |
| `generationStatus` | String | 否 | `'ready'` | 生成状态：`'generating'` \| `'appending'` \| `'ready'` \| `'failed'` \| `'superseded'` | `"ready"` |
| `generationProgress` | Object | 否 | `null` | 验证卷短任务生成进度（v4）：`totalBatches` 等于待覆盖目标数；后端每次 `continue` 追加 1 个目标，字段格式为 `{ completedBatches, totalBatches, succeededBatches, failedBatches?, failedBatchIndexes? }`，供前端轮询展示 | `{"completedBatches":18,"totalBatches":38,"succeededBatches":18,"failedBatches":0}` |
| `generationError` | String | 否 | `''` | 生成失败时的错误信息 | `"PDF 重新生成失败"` |
| `autoGenerated` | Boolean | 否 | `false` | 是否自动触发生成（vs 手动） | `true` |
| `supersededBy` | String | 否 | `''` | 被哪份新报告的验证卷覆盖（旧卷 superseded 时写入） | `"117e1a7d..."` |

> 验证卷的题量规则（置信度分层）：每个 BN 按 weight 分层出题——高置信（≥75）出 3 题，中置信（45-74）出 2 题，低置信（<45）出 1 题。详见 `docs/subject-design/置信度驱动分层验证模型设计文档.md`。

> 前端展示用的 `bottleneckHierarchy` 不落库，由 `miniprogram/utils/paper-display.js` 基于 `verificationPack.targets/pages`、`questions[].targetId/lpCode`、`bottleneckTargets` 和 `bottleneckSummaries` 派生。试卷预览和验证卷列表必须优先使用该层级结构展示“覆盖卡点”，不要退回到长文本拼接。

#### verificationPack 子结构

| 字段名 | 类型 | 描述 | 示例值 |
|--------|------|------|--------|
| `packId` | String | 任务包 ID | `"VPK-MATH-20260616-01"` |
| `mode` | String | 任务包模式，当前为 `task_pack` | `"task_pack"` |
| `scheduleStrategy` | String | 目标排序与分页策略 | `"weight_desc_paginated"` |
| `totalTargets` | Number | 任务包总目标数 | `33` |
| `totalQuestions` | Number | 总题数 | `165` |
| `totalStudentPages` | Number | 计划学生任务页数 | `11` |
| `completedStudentPages` | Number | 已回传学生任务页数，生成时为 0，展示时可由报告派生 | `0` |
| `pages` | Array\<Object\> | 任务页列表，每页包含 `pageCode`、`pageType`、粗类/家族字段、`targetIds`、`targets`、`questionIds` | `[{ "pageCode": "MATH-V-20260616-01-P01" }]` |

> 试卷生命周期不新增数据库字段，由前端根据 `papers`、关联的最新 `reports(type='verification')` 和本机 PDF 下载标记派生：`generated`（已生成待下载）、`downloaded`（已下载待作答）、`analyzing`（作答已上传，反馈分析中）、`failed`（反馈失败，可重新上传）、`completed`（验证反馈已完成）。学习记录中同一份试卷优先展示最新一次验证反馈状态。

`verificationPack.pages[]` 在数学层级组卷时会额外包含：

| 字段名 | 类型 | 描述 | 示例值 |
|--------|------|------|--------|
| `pageType` | String | `same_family` \| `micro_confirm` \| `mixed_review` | `"same_family"` |
| `categoryId` / `categoryTitle` | String | 该页主要验证的粗类 | `"计算规则"` |
| `familyIds` / `familyTitle` | Array\<String\> / String | 该页覆盖的卡点家族 | `"小数点定位与移动"` |
| `nodeIds` | Array\<String\> | 该页覆盖的知识节点 | `["MATH-NUM-DEC-MUL-POINT"]` |
| `targetSummary` | String | 页面标题/范围摘要 | `"小数点定位与移动"` |
| `targetNames` | Array\<String\> | 该页覆盖的细卡点中文名 | `["小数乘法中积的小数位数判断错误"]` |

#### questions 子结构

| 字段名 | 类型 | 描述 | 示例值 |
|--------|------|------|--------|
| `index` | Number | 题号（从 1 开始） | `1` |
| `content` | String | 题目内容（≤500 字） | `"计算：3/4 ÷ 1/2 = ?"` |
| `answer` | String | 参考答案（≤300 字，不显示在试卷上） | `"3/2"` |
| `points` | Number | 分值 | `10` |
| `lpCode` | String | 关联卡点编码（≤30 字） | `"LP-002"` |
| `lpName` | String | 卡点名称（≤80 字） | `"分数运算错误"` |
| `questionId` | String | 任务包题目 ID | `"MATH-V-20260616-01-P02-Q01"` |
| `pageCode` | String | 题目所在任务页编号 | `"MATH-V-20260616-01-P02"` |
| `targetId` | String | 题目直接验证的目标 ID | `"BN-FINE-4"` |
| `targetType` | String | 目标类型 | `"fine_bottleneck"` |
| `questionRole` | String | 题目角色：`core` \| `transfer` | `"core"` |

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
| users(openid) → userConsents | 1:1 | userConsents._openid = auth.openid | 体验版内测授权状态；真实上传前由前端和 `uploadAndAnalyze` 服务端双重校验 |
| users(openid) → aiUsageEvents | 1:N | aiUsageEvents._openid = auth.openid | 当前微信的 AI 用量事件；账单页按北京时间自然月聚合 |
| users(openid) → dataDeletionRequests | 1:N | dataDeletionRequests._openid = auth.openid | 用户发起的数据删除请求和处理状态 |

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
| `englishImportBatches` | `studentId`, `status`, `createdAt` | 升序, 升序, 降序 | 英语候选词库导入和确认 |
| `studentEnglishWords` | `studentId`, `masteryStatus`, `nextReviewAt` | 升序, 升序, 升序 | 英语听写抽取待练、错词和待复测词 |
| `englishPracticeSessions` | `studentId`, `createdAt` | 升序, 降序 | 英语听写历史记录 |
| `learningResourcePacks` | `studentId`, `subject`, `updatedAt` | 升序, 升序, 降序 | 学习卡点任务包列表和学习记录时间线 |
| `aiUsageEvents` | `_openid`, `createdAt` | 升序, 降序 | AI 用量账单页按用户读取本月事件 |
| `aiUsageEvents` | `studentId`, `createdAt` | 升序, 降序 | 维护者按孩子统计用量（预留） |
| `dataDeletionRequests` | `_openid`, `createdAt` | 升序, 降序 | 用户查看自己发起的删除请求 |
| `userConsents` | `_openid`, `updatedAt` | 升序, 降序 | 上传前读取当前用户内测授权状态 |

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
| `uploadAndAnalyze` | 先校验 `userConsents.betaConsented=true`，再通过共享 access helper 校验当前 OPENID 是否可操作对应学生/试卷 |
| `aiUsage` | 所有读写都按当前 OPENID 限定；`listEvents/getSummary` 使用北京时间自然月范围查询 |
| `analyzePhotos` | 通过共享 access helper 校验触发者或当前用户是否可操作对应报告 |
| `getAnalysisProgress` | 通过共享 access helper 校验当前 OPENID 是否可读取对应报告进度 |
| `generatePaper` | 通过共享 access helper 校验当前 OPENID 是否可为对应学生生成试卷 |
| `regenerateVerificationPaper` | 普通入口通过当前 OPENID 校验学生权限；后端自调度 `continue` 可在 `paper.triggeredByReport === reportId` 时无 OPENID 续跑；所有路径都校验 paper/report 与 studentId、subject 归属一致 |
| `generateReportPDF` | 通过共享 access helper 校验当前 OPENID 是否可读取并生成对应报告 PDF |
| `englishVocabulary` | 通过共享 access helper 校验 owner/viewer 是否可读取词库或写入听写记录 |
| `learningResource` | 通过共享 access helper 校验 owner/viewer 是否可生成、读取和更新学习任务包 |

### 参数校验

各云函数入口还执行以下输入校验：

| 校验项 | 涉及云函数 | 规则 |
|--------|-----------|------|
| fileIDs 非空且 ≤20 | uploadAndAnalyze | 数组长度 1-20，每项以 `cloud://` 开头 |
| studentId 非空 | uploadAndAnalyze, generatePaper | 字符串非空 |
| subject 枚举 | uploadAndAnalyze, analyzeBatch, generatePaper | 仅限 `math/chinese/english` |
| mode 枚举 | uploadAndAnalyze | 仅限 `diagnosis/verification/paper/default-paper` |
| 内测授权 | uploadAndAnalyze | 当前 openid 必须已有 `userConsents.betaConsented=true`，否则不能创建 reports 或触发分析 |
| type 枚举 | generatePaper | 仅限 `verification/default-diagnosis` |
| targets 格式 | generatePaper | 验证卷兼容 `LP-*` 粗卡点、`BN-*` 细卡点、`CHI-*` 语文错项目标，任务包模式最多 80 个；自动验证卷续跑时每次只传 1 个目标；默认诊断卷不使用 targets |
| paperId 归属 | regenerateVerificationPaper | `paper.studentId === studentId` 且 `paper.subject === subject`；如传 `reportId`，还要求 `report.studentId/subject` 一致 |
| grade 范围 | generatePaper | default-diagnosis 模式要求 1-6 |
| questionCount 范围 | generatePaper | 6-20，默认 12 |
| paperId 关联校验 | uploadAndAnalyze | `verification/paper/default-paper` 模式必须传 `paperId`；paper.studentId === studentId，type 与 mode 匹配 |
| wordLimit 范围 | englishVocabulary.generatePracticeSession | 1-40，默认 20 |
| 内置词库导入 | englishVocabulary.seedPersonalVocabulary | 仅接收 `studentId`；固定使用项目内置钟青羽 PEP 个人词库 |
| dictation judgment 枚举 | englishVocabulary.submitDictationAttempt | 仅返回 `correct/incorrect/unclear`，由云函数根据识别文本判定 |
| dictation OCR 判定枚举 | englishVocabulary.analyzeDictationPhoto | 仅接收 AI 输出中的 `correct/incorrect/unclear`；缺失或非法值归一为 `unclear` |

---

## learningResourcePacks

`learningResourcePacks` 保存从数学学习卡点生成的小程序内学习任务包。它不是外部链接收藏夹，而是孩子可以直接打开完成的结构化学习材料。

| 字段 | 类型 | 说明 |
| --- | --- | --- |
| `_id` | String | 任务包 ID |
| `_openid` | String | 创建者 OPENID |
| `studentId` | String | 学生 ID |
| `subject` | String | 第一版固定为 `math` |
| `sourceType` | String | 第一版固定为 `bottleneck` |
| `sourceReportId` | String | 来源报告 ID，可为空 |
| `lpCode` | String | 兼容旧粗卡点代码 |
| `bottleneckId` | String | 细颗粒度卡点 ID |
| `targetId` | String | 当前任务包绑定的目标 ID；缓存和任务包唯一目标优先键，优先 BN id，其次细卡点 viewId，最后才回退 LP |
| `title` | String | 家长和孩子可读的任务包标题 |
| `status` | String | `ready / completed / archived` |
| `estimatedMinutes` | Number | 建议学习时长，第一版通常为 8 |
| `blocks` | Array | 子模块：`summary / concept / worked_example / common_mistake / practice` |
| `practiceItems` | Array | 3 道以内即时练习题 |
| `externalResources` | Array | 家长参考资源，孩子不直接进入平台信息流 |
| `progress` | Object | 完成时间和轻量练习结果 |
| `verificationScheduled` | Boolean | 是否已加入后续验证 |
| `verificationScheduledAt` | Date | 加入验证时间 |
| `createdAt` | Date | 创建时间 |
| `updatedAt` | Date | 更新时间 |

---

## aiUsageEvents

`aiUsageEvents` 是追加式 AI 用量账本。每一次真实 AI 请求写入一条 `pending` 事件，并在请求成功或失败后补写为 `succeeded/failed`。账单页按当前 `_openid` 和北京时间自然月读取，不用于表达用户应付款项。

| 字段 | 类型 | 说明 |
| --- | --- | --- |
| `_id` | String | 事件 ID |
| `_openid` | String | 发起 AI 调用的微信 openid |
| `studentId` | String | 关联孩子，可为空 |
| `subject` | String | `math / chinese / english` |
| `eventType` | String | `photo_analysis / paper_generation / learning_resource_pack / dictation_grading` 等 |
| `sourceId` | String | reportId、paperId、resourcePackId、sessionId 等 |
| `sourceType` | String | `report / paper / resource_pack / english_session` 等 |
| `cloudFunction` | String | 触发调用的云函数 |
| `provider` | String | 第一阶段为 `cloudbase_ai` |
| `model` | String | `hy3-preview`、`deepseek-v4-flash` 等 |
| `inputTokens` | Number | 输入 token；没有真实 usage 时为估算 |
| `outputTokens` | Number | 输出 token；没有真实 usage 时为估算 |
| `totalTokens` | Number | 输入 + 输出 token |
| `imageCount` | Number | 图片数量，文本模型通常为 0 |
| `pageCount` | Number | 页数或批次数 |
| `estimatedCostCny` | Number | 平台成本估算，单位元 |
| `pricingVersion` | String | 当前价格表版本 |
| `costSource` | String | `provider_usage / estimated_by_chars / estimated_by_image_count` |
| `isEstimate` | Boolean | 是否含估算 |
| `isTest` | Boolean | 是否为测试或 mock 事件 |
| `status` | String | `pending / succeeded / failed` |
| `errorMessage` | String | 失败原因摘要 |
| `createdAt` | Date | 事件创建时间 |
| `completedAt` | Date | 成功或失败补写时间 |

## userConsents

`userConsents` 保存体验版内测授权。上传页会读取它决定是否展示授权弹层；`uploadAndAnalyze` 服务端也会再次校验，防止老客户端或直接云函数调用绕过授权。

| 字段 | 类型 | 说明 |
| --- | --- | --- |
| `_id` | String | 授权记录 ID |
| `_openid` | String | 当前微信 openid |
| `betaConsented` | Boolean | 是否同意体验版内测说明 |
| `consentedAt` | Date | 最近一次授权/取消授权时间 |
| `updatedAt` | Date | 更新时间 |

## dataDeletionRequests

`dataDeletionRequests` 保存用户在 AI 用量页发起的数据删除请求。第一阶段只负责记录请求和状态，后续由维护者或维护脚本处理。

| 字段 | 类型 | 说明 |
| --- | --- | --- |
| `_id` | String | 请求 ID |
| `_openid` | String | 发起请求的微信 openid |
| `studentId` | String | 目标孩子，可为空 |
| `scope` | String | `student_all / photos_only / usage_only` |
| `reason` | String | 用户填写或系统默认原因 |
| `status` | String | `requested / processing / completed / rejected` |
| `createdAt` | Date | 发起时间 |
| `processedAt` | Date | 处理时间 |
| `processedBy` | String | 处理者 |
| `note` | String | 处理说明 |

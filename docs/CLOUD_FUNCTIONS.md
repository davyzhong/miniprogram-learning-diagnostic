# 云函数 API 参考文档

> 本文档基于项目 `cloudfunctions/` 目录下各云函数的实际实现整理，包含入参、出参、错误处理、依赖与调用关系。所有云函数均部署在微信云开发环境，通过 `wx.cloud.callFunction` 调用。

---

## 目录

- [uploadAndAnalyze](#uploadandanalyze)
- [studentAccess](#studentaccess)
- [studentData](#studentdata)
- [reportFeedback](#reportfeedback)
- [englishVocabulary](#englishvocabulary)
- [analyzePhotos](#analyzephotos)
- [analyzeBatch](#analyzebatch)
- [generatePaper](#generatepaper)
- [reanalyzeMathHistory](#reanalyzemathhistory)
- [generateReportPDF](#generatereportpdf)
- [getAnalysisProgress](#getanalysisprogress)
- [辅助模块](#辅助模块)
  - [result-normalizer.js](#result-normalizerjs)
  - [photo-dedup.js](#photo-dedupjs)
  - [comparison.js](#comparisonjs)

---

## studentAccess

### 功能描述

轻量家长管理云函数。一个孩子档案可以有多个家长成员，拥有者可以创建邀请、查看成员、移除协同家长；扫码加入的共同家长可以参与学习诊断相关流程，但不能继续邀请或移除家庭成员。

### 调用方式

```javascript
wx.cloud.callFunction({
  name: 'studentAccess',
  data: {
    action: 'getAccessibleStudents'
  }
})
```

### action 列表

| action | 必填参数 | 权限 | 描述 |
| --- | --- | --- | --- |
| `getAccessibleStudents` | — | 当前登录用户 | 获取当前微信可访问的孩子档案，包含自己创建和受邀加入 |
| `listMembers` | `studentId` | owner/viewer 可查看 | 获取某个孩子档案的家长成员列表 |
| `createInvite` | `studentId` | owner | 创建扫码加入邀请，返回一次性明文 token 和小程序路径 |
| `getInvite` | `inviteId`, `token` | 持有邀请者 | 加入前预览邀请信息 |
| `acceptInvite` | `inviteId`, `token` | 持有邀请者 | 接受邀请，成为 viewer 成员 |
| `revokeMember` | `studentId`, `memberOpenId` | owner | 移除协同家长，不能移除自己或 owner |

### 输出示例

**getAccessibleStudents**

```json
{
  "success": true,
  "students": [
    {
      "_id": "stu_xxx",
      "name": "钟青羽",
      "grade": 6,
      "role": "owner",
      "permissions": {
        "canView": true,
        "canManageParents": true,
        "canUpload": true,
        "canGeneratePaper": true,
        "canRetryAnalysis": true
      }
    }
  ]
}
```

**createInvite**

```json
{
  "success": true,
  "inviteId": "invite_xxx",
  "token": "明文token仅返回一次",
  "inviteCode": "QY8392AB",
  "path": "/pages/join-student/join-student?inviteId=invite_xxx&token=...",
  "expiresAt": "2026-06-20T00:00:00.000Z"
}
```

### 错误码 / 错误消息

| 错误消息 | 触发条件 |
| --- | --- |
| 操作类型无效 | action 不在白名单 |
| 缺少 studentId | 需要 studentId 的 action 未传入 |
| 无权访问该学生 | 当前微信不是 owner，也不是 active viewer |
| 无权执行该操作 | viewer 尝试创建邀请或移除成员 |
| 邀请不存在或已失效 | inviteId/token 不匹配，或邀请状态不可用 |
| 邀请已过期 | 当前时间超过 expiresAt |
| 不能移除自己 | owner 尝试 revoke 自己 |
| 家长成员不存在或不可移除 | 目标成员不存在、已移除，或目标是 owner |
| 家长管理操作失败，请稍后重试 | 任意未预期异常兜底 |

### 安全说明

1. 邀请只在数据库保存 `tokenHash`，不保存明文 token。
2. `createInvite` 返回的明文 token 只用于生成一次性扫码路径。
3. `inviteCode` 为 8 位大写字母/数字，供另一位家长手动输入加入。
4. 邀请默认 7 天过期，接受后状态改为 `accepted`。
5. 同一微信重复接受同一孩子档案邀请时保持幂等，不重复创建成员。
6. 前端不直接查询 `studentMembers / studentInvites`，统一由本云函数做 OPENID 和角色校验。

---

## studentData

### 功能描述

访问感知的学习数据读取云函数。用于共享家长查看同一个孩子的首页摘要、学科主页、学习记录、报告详情和试卷详情。所有 action 都会先校验当前 OPENID 是否为档案 owner 或 active viewer。

### 调用方式

```javascript
wx.cloud.callFunction({
  name: 'studentData',
  data: {
    action: 'getSubjectDashboard',
    studentId: 'stu_xxx',
    subject: 'math'
  }
})
```

### action 列表

| action | 必填参数 | 返回重点 |
| --- | --- | --- |
| `getStudentDashboard` | `studentId` | student、subjectProfiles、latestReport、latestPaper、recentReports、recentPapers |
| `getSubjectDashboard` | `studentId`, `subject` | student、profile、reports、papers |
| `getLearningTimeline` | `studentId`；`subject` 可选 | reports、papers、englishSessions、items 派生时间线 |
| `getReportDetail` | `reportId` | student、report |
| `getPaperDetail` | `paperId` | student、paper |
| `cleanupStaleLearningRecords` | `studentId`；`subject` 可选；`dryRun` 可选 | owner 清理长时间中断的分析记录；`dryRun=true` 只返回可清理数量和记录 ID，不写库 |

### 统一返回字段

成功返回会携带角色和权限：

```json
{
  "success": true,
  "role": "viewer",
  "permissions": {
    "canView": true,
    "canReadLearning": true,
    "canOperateLearning": true,
    "canManageParents": false,
    "canUpload": true,
    "canGeneratePaper": true,
    "canRetryAnalysis": true
  }
}
```

### 错误码 / 错误消息

| 错误消息 | 触发条件 |
| --- | --- |
| 操作类型无效 | action 不在白名单 |
| 缺少 studentId | 读取首页、学科主页或时间线时未传 studentId |
| 缺少 reportId | 读取报告详情时未传 reportId |
| 缺少 paperId | 读取试卷详情时未传 paperId |
| 报告不存在 | reports 查无该记录 |
| 试卷不存在 | papers 查无该记录 |
| 无权访问该学生 | 当前微信不是 owner，也不是 active viewer |
| 学习数据读取失败，请稍后重试 | 任意未预期异常兜底 |

### 注意事项

1. 除 `cleanupStaleLearningRecords` 外，本函数只做共享读取，不创建、不修改学习数据。
2. 时间线仍是派生视图，由 `reports`、`papers`、`reports.imageFiles` 和 `englishPracticeSessions` 汇总，不新增独立事件集合。
3. `cleanupStaleLearningRecords` 只归档长时间停留在分析中、失败或超时的中间态报告，不删除已完成报告、试卷和照片证据；页面会先用 `dryRun=true` 预检，再由 owner 确认执行。
4. `studentData` 本身只做读取聚合；共同家长是否能上传、重试或生成试卷由对应写入云函数的成员权限校验决定。

---

## reportFeedback

### 功能描述

收集家长对诊断报告的纠错和复核线索。第一版只记录反馈，不直接修改 AI 原始报告、综合学习卡点或学习记录。

### 调用方式

```javascript
wx.cloud.callFunction({
  name: 'reportFeedback',
  data: {
    action: 'createFeedback',
    reportId: 'report_xxx',
    type: 'wrong_bottleneck',
    targetType: 'bottleneck',
    targetId: 'LP-001',
    reason: '这个卡点不准确',
    note: '孩子只是抄错了数字'
  }
})
```

### action 列表

| action | 必填参数 | 权限 | 描述 |
| --- | --- | --- | --- |
| `createFeedback` | `reportId`, `type`, `targetType`, `reason` | owner/viewer 可提交 | 对报告、卡点、错题或照片提交反馈 |
| `listFeedbackByReport` | `reportId` | owner/viewer 可查看 | 读取当前报告的反馈记录，用于页面显示“已反馈” |

### 枚举

`type`：

- `wrong_bottleneck`：学习卡点不准确
- `wrong_question`：错题识别错误
- `duplicate_photo`：照片重复或不清楚
- `unclear_result`：报告结果需要复核
- `other`：其他问题

`targetType`：

- `report`
- `bottleneck`
- `errorDetail`
- `photo`

### 输出示例

```json
{
  "success": true,
  "feedback": {
    "_id": "feedback_xxx",
    "reportId": "report_xxx",
    "studentId": "stu_xxx",
    "subject": "math",
    "type": "wrong_bottleneck",
    "targetType": "bottleneck",
    "targetId": "LP-001",
    "reason": "这个卡点不准确",
    "status": "submitted"
  }
}
```

### 错误码 / 错误消息

| 错误消息 | 触发条件 |
| --- | --- |
| 缺少 reportId | 未传入报告 ID |
| 报告不存在 | reports 查无该记录 |
| 无权限访问该报告 | 当前微信不是 owner，也不是 active viewer |
| 反馈类型无效 | type 不在白名单 |
| 反馈对象无效 | targetType 不在白名单 |
| 请填写反馈原因 | reason 为空 |

---

## uploadAndAnalyze

### 功能描述

接收图片 fileID 列表，创建 `reports` 记录（初始状态为 `analyzing`），更新学科档案分析状态，并在服务端 fire-and-forget 触发 `analyzePhotos` 执行后台分析。客户端不等待完整 AI 分析完成。

### 调用方式

```javascript
wx.cloud.callFunction({
  name: 'uploadAndAnalyze',
  data: {
    fileIDs: ['cloud://xxx/a.jpg', 'cloud://xxx/b.jpg'],
    imageMetas: [
      { fileName: '作业1.jpg', fileSize: 102400 },
      { fileName: '作业2.jpg', fileSize: 98304 }
    ],
    studentId: 'stu_xxx',
    subject: 'math',        // math | chinese | english
    mode: 'diagnosis',      // diagnosis | verification | paper | default-paper
    paperId: ''             // 仅验证模式必填
  }
})
```

### 输入参数

| 参数名 | 类型 | 必填 | 描述 | 示例 |
| --- | --- | --- | --- | --- |
| fileIDs | string[] | 是 | 云存储 fileID 数组，长度 1~20，必须以 `cloud://` 开头 | `['cloud://env.xxx/path/a.jpg']` |
| imageMetas | object[] | 否 | 与 fileIDs 一一对应的元信息；缺失时按索引生成默认文件名 | `[{ fileName: '作业.jpg', fileSize: 102400 }]` |
| studentId | string | 是 | 学生文档 ID，必须属于当前 openid | `'stu_xxx'` |
| subject | string | 否 | 学科，默认 `'math'`；可选 `math / chinese / english` | `'math'` |
| mode | string | 否 | 分析模式，默认 `'diagnosis'`；可选 `diagnosis / verification / paper / default-paper` | `'verification'` |
| paperId | string | 条件必填 | `mode === 'verification'` 时必填，且该试卷必须为 `type === 'verification'` | `'paper_xxx'` |

### 输出格式

**成功**

```json
{
  "success": true,
  "reportId": "report_xxx",
  "message": "分析完成"
}
```

**失败**

```json
{
  "success": false,
  "error": "fileIDs 不能为空"
}
```

### 错误码 / 错误消息

| 错误消息 | 触发条件 |
| --- | --- |
| fileIDs 不能为空 | fileIDs 非数组或长度为 0 |
| 缺少 studentId | studentId 为空 |
| 图片参数无效 | fileIDs 长度 > 20，或存在非字符串 / 不以 `cloud://` 开头的项 |
| 学科或分析模式无效 | subject 不在白名单，或 mode 不在白名单 |
| 验证分析必须关联验证试卷 | mode 为 verification 但 paperId 为空，或关联试卷 type 不是 verification |
| 验证试卷必须使用验证分析模式 | 关联试卷为 verification 但 mode 不是 verification |
| 学生不存在 | students 集合查无此 doc |
| 无权执行该操作 | 当前微信不是该孩子档案成员，不能上传并触发新分析 |
| 关联试卷不存在或无权访问 | papers 查不到 / studentId 不匹配 / openid 不匹配 |
| 创建分析任务失败，请稍后重试 | 任意未预期异常（已 try-catch 兜底） |

### 超时配置建议

- **推荐云函数超时：60s**。本函数只负责参数校验、创建报告和启动后台任务，正常会快速返回。
- 微信云函数超时时间上限为 60s。长耗时分析由 `analyzePhotos` 后台执行，前端通过进度轮询、超时提示和重试入口恢复异常状态。

### 依赖的外部服务

- 微信云数据库（students、studentMembers、papers、subjectProfiles、reports 集合）
- 微信云存储（fileID 引用）
- 内部云函数：`analyzePhotos`

### 内部调用关系

- ➡️ `cloud.callFunction({ name: 'analyzePhotos', data: { reportId } })`（fire-and-forget，不等待完成）

### 注意事项

1. 本函数不等待 `analyzePhotos` 完成；客户端收到 `reportId` 后应通过学科主页或报告页轮询进度。
2. 会写入 `subjectProfiles.analysisStatus = 'analyzing'`，失败时会保留该状态，需由下游清理。
3. `imageMetas` 中的 `fileName` 会被截断到 120 字符，`fileSize` 强制转为非负数。
4. 仅在 `mode === 'verification'` 时校验 paperId；其他模式下传入 paperId 会作为普通关联记录。

---

## englishVocabulary

### 功能描述

钟青羽个人英语词库与 20 词语音听写云函数。当前阶段只服务单词掌握：导入 PEP 个人词库、生成听写队列、接收语音识别文本并由云函数自动判定 `correct / incorrect / unclear`。

### 调用方式

```javascript
wx.cloud.callFunction({
  name: 'englishVocabulary',
  data: {
    action: 'generatePracticeSession',
    studentId: 'stu_xxx',
    wordLimit: 20
  }
})
```

### action 列表

| action | 必填参数 | 权限 | 描述 |
| --- | --- | --- | --- |
| `createImportBatch` | `studentId`, `sourceFile`；`words` 或 `pageFileIDs` | owner/viewer 可操作 | 从结构化候选或词表图片创建待确认单词批次 |
| `confirmImportBatch` | `studentId`, `batchId` | owner/viewer 可操作 | 将候选单词写入 `studentEnglishWords` |
| `seedPersonalVocabulary` | `studentId` | owner/viewer 可操作 | 将项目内置的钟青羽 PEP 3上-6上个人词库写入 `studentEnglishWords`，重复导入只合并来源不新增重复词 |
| `getVocabularySummary` | `studentId` | owner/viewer 可查看 | 返回总词数、熟悉度维度、拼写维度、整体掌握和高频错词 |
| `listWords` | `studentId` | owner/viewer 可查看 | 按状态或单元读取个人词库 |
| `generateRecognitionSession` | `studentId` | owner/viewer 可操作 | 默认生成 20 个单词的熟悉度口头练习会话，方向为中英混合 |
| `submitRecognitionAttempt` | `studentId`, `sessionId`, `wordId`, `recognizedText`, `durationMs` | owner/viewer 可操作 | 逐题提交熟悉度语音识别结果，只更新 `familiarity` 维度，并记录本题耗时 |
| `generatePaperDictationSession` | `studentId` | owner/viewer 可操作 | 默认生成 20 个单词的纸面听写会话，只创建 `spelling` 维度任务，不更新掌握状态 |
| `submitDictationPhoto` | `studentId`, `sessionId`, `photoFileIds`, `durationMs` | owner/viewer 可操作 | 保存纸面听写照片证据，状态置为 `pending_analysis`，并记录整场听写耗时 |
| `analyzeDictationPhoto` | `studentId`, `sessionId` | owner/viewer 可操作 | 对本次听写纸做候选词约束 OCR，并用本地拼写距离复核逐词判定，只更新 `spelling` 维度 |
| `generatePracticeSession` | `studentId` | owner/viewer 可操作 | 默认生成 20 个单词的 `word-dictation` 听写会话 |
| `submitDictationAttempt` | `studentId`, `sessionId`, `wordId`, `recognizedText` | owner/viewer 可操作 | 逐题提交语音识别结果，云函数自动判定并更新掌握度 |
| `submitPracticeResult` | `studentId`, `sessionId` | owner/viewer 可操作 | 标记会话完成，兼容旧练习提交 |

### 听写判定

| 判定 | 规则 | 数据影响 |
| --- | --- | --- |
| `correct` | 识别文本与目标单词一致，或可明确还原为目标拼写 | `correctCount + 1`，按 1/3/7 天推进复测，连续完成后 `mastered` |
| `incorrect` | 识别文本存在明确拼写差异 | `wrongCount + 1`，`masteryStatus=needs_practice`，本轮建议重现 |
| `unclear` | 识别为空、噪音过大或无法判断字母序列 | 只记录 attempt，不计正确也不计错误，本轮重听 |

### 输出示例

**generatePracticeSession**

```json
{
  "success": true,
  "sessionId": "englishPracticeSessions-1",
  "wordItems": [
    {
      "queueKey": "word-1:0:0",
      "wordId": "word-1",
      "word": "science",
      "meanings": ["科学"],
      "promptType": "chinese",
      "retryCount": 0
    }
  ],
  "patternItems": []
}
```

**seedPersonalVocabulary**

```json
{
  "success": true,
  "batchId": "englishImportBatches-1",
  "importedWordCount": 505,
  "importedPatternCount": 0,
  "totalSeedWords": 505,
  "sourceCount": 7
}
```

**getVocabularySummary**

```json
{
  "success": true,
  "summary": {
    "totalWords": 505,
    "familiarity": {
      "untestedCount": 300,
      "needsPracticeCount": 20,
      "reviewingCount": 80,
      "masteredCount": 105,
      "dueReviewCount": 12
    },
    "spelling": {
      "untestedCount": 420,
      "needsPracticeCount": 15,
      "reviewingCount": 40,
      "masteredCount": 30,
      "dueReviewCount": 8
    },
    "overall": {
      "untestedCount": 280,
      "partialCount": 195,
      "masteredCount": 30
    }
  },
  "weakWords": [],
  "patternCount": 0
}
```

`summary.needsPracticeCount`、`summary.reviewingCount`、`summary.masteredCount`、`summary.dueReviewCount` 仍作为兼容字段保留，当前按 `familiarity` 维度派生。

**generateRecognitionSession**

```json
{
  "success": true,
  "sessionId": "englishPracticeSessions-1",
  "wordItems": [
    {
      "queueKey": "word-1:0:0",
      "wordId": "word-1",
      "word": "science",
      "meanings": ["科学"],
      "promptType": "chinese",
      "direction": "cn2en",
      "retryCount": 0
    }
  ]
}
```

**submitRecognitionAttempt**

```json
{
  "success": true,
  "judgment": {
    "status": "correct",
    "reason": "识别文本与目标释义一致"
  },
  "shouldRepeat": false
}
```

**generatePaperDictationSession**

```json
{
  "success": true,
  "sessionId": "englishPracticeSessions-2",
  "functionType": "spelling",
  "wordItems": [
    {
      "queueKey": "word-1:0:0",
      "wordId": "word-1",
      "word": "science",
      "meanings": ["科学"],
      "promptType": "chinese",
      "retryCount": 0
    }
  ]
}
```

**submitDictationPhoto**

```json
{
  "success": true,
  "sessionId": "englishPracticeSessions-2",
  "analysisStatus": "pending_analysis",
  "photoFileIds": ["cloud://dictation-1.jpg"]
}
```

**analyzeDictationPhoto**

```json
{
  "success": true,
  "sessionId": "englishPracticeSessions-2",
  "analysisStatus": "completed",
  "results": [
    {
      "wordId": "word-1",
      "targetWord": "science",
      "recognizedText": "science",
      "verdict": "correct",
      "reason": "拼写正确",
      "confidence": 0.98
    },
    {
      "wordId": "word-2",
      "targetWord": "museum",
      "recognizedText": "musem",
      "verdict": "incorrect",
      "reason": "少写一个 u",
      "confidence": 0.9
    }
  ]
}
```

**submitDictationAttempt**

```json
{
  "success": true,
  "judgment": {
    "status": "incorrect",
    "normalizedText": "siense",
    "normalizedTarget": "science",
    "reason": "识别文本与目标单词拼写不同"
  },
  "shouldRepeat": true
}
```

### 注意事项

1. 当前阶段不生成时态、句型、阅读或作文任务。
2. 单词熟悉度的语音识别由小程序端插件完成，云函数只接收识别文本并做 AI 判定式归一。
3. 高频错词由 `wrongCount` 和 `needs_practice` 状态派生，展示在英语工作台首页；v2 新页面应优先读取双维 summary。
4. `unclear` 保留为独立状态，避免把识别失败误算成孩子拼错。
5. 内置个人词库由 `data/english/zhong-qingyu-pep-vocabulary.seed.json` 生成，并同步复制到 `cloudfunctions/englishVocabulary/` 供云函数部署使用。
6. 纸面听写先通过 `submitDictationPhoto` 保存 `photoFileIds`，再通过 `analyzeDictationPhoto` 读取本次 `wordItems` 作为候选词做约束 OCR；`unclear` 不更新正误计数，`correct/incorrect` 只更新 `spelling`，不影响 `familiarity`。

---

## analyzePhotos

### 功能描述

分析主控函数：根据 `reportId` 读取报告，将图片拆分为单图批次，严格按顺序调用 `analyzeBatch`。每次 `analyzePhotos` 云函数调用只处理 1 张图片，处理完成后异步续跑下一张；全部图片完成后再合并结果、去重、对比历史卡点，并更新 `reports / subjectProfiles / analysisTasks`。当前保留 `sendNotification` 钩子，但在订阅消息模板和用户授权链路完成前，不向用户承诺推送。

### 调用方式

```javascript
wx.cloud.callFunction({
  name: 'analyzePhotos',
  data: {
    reportId: 'report_xxx'
  }
})
```

> ⚠️ 通常由 `uploadAndAnalyze` 在服务端触发，前端不应直接调用。

### 输入参数

| 参数名 | 类型 | 必填 | 描述 | 示例 |
| --- | --- | --- | --- | --- |
| reportId | string | 是 | reports 集合文档 ID | `'report_xxx'` |

### 输出格式

**成功（新完成）**

```json
{
  "success": true,
  "reportId": "report_xxx",
  "totalErrors": 12,
  "bottleneckCount": 3,
  "summary": "共发现 12 道错题，主要卡点：计算错误（加减乘除）、分数运算错误、审题错误"
}
```

**幂等返回（已完成 / 已启动）**

```json
{ "success": true, "reportId": "report_xxx", "message": "报告已经分析完成" }
// 或
{ "success": true, "reportId": "report_xxx", "message": "分析任务已经启动" }
```

**异步续跑中**

```json
{
  "success": true,
  "reportId": "report_xxx",
  "status": "processing",
  "message": "已完成 1/6 批，继续分析中"
}
```

**失败**

```json
{
  "success": false,
  "error": "图片分析失败，请稍后重试",
  "reportId": "report_xxx"
}
```

### 错误码 / 错误消息

| 错误消息 | 触发条件 |
| --- | --- |
| 缺少 reportId | 未传 reportId |
| 报告不存在 | reports.doc(reportId).get() 返回空 |
| 无权访问该报告 | 报告 `_openid` 与当前 OPENID 不一致 |
| 报告中没有待分析图片 | `imageFileIds.length === 0` |
| 存在未完成的图片分析批次 | 任一 analyzeBatch 返回 `success: false` |
| AI 未返回逐页分析结果 | 合并后的 pageResults 为空 |
| 验证报告没有关联验证试卷 | mode=verification 但 report.paperId 为空 |
| 关联验证试卷归属不一致 | paper.studentId 或 _openid 与 report 不匹配 |
| 关联验证试卷没有有效学习卡点 | paper.type !== 'verification' 或 bottleneckTargets 为空 |
| 图片分析失败，请稍后重试 | 任意未预期异常；同时会将 reports / analysisTasks 状态置为 failed |

### 超时配置建议

- **推荐云函数超时：60s**。这是当前平台允许的上限。
- 单报告图片数过多时，总耗时会随图片数量线性增长；但单次 `analyzePhotos` 只处理 1 张图片，降低触发 60s 超时的概率。前端会展示分析中/超时提示，报告页可重新触发分析。

### 依赖的外部服务

- 微信云数据库（reports、analysisTasks、subjectProfiles、papers 集合）
- 微信云存储（通过 analyzeBatch 间接访问）
- 内部云函数：`analyzeBatch`
- 预留：`sendSubscribeMessage`（尚未实现，当前仅打日志）

### 内部调用关系

- ➡️ `cloud.callFunction({ name: 'analyzeBatch', ... })`（串行，每批 1 张）
- ➡️ `cloud.callFunction({ name: 'analyzePhotos', data: { reportId, taskId, continuation: true } })`（未完成时 fire-and-forget 续跑下一张）
- ⬅️ 被 `uploadAndAnalyze` 调用
- 📦 使用本地模块：`./comparison.js`、`./photo-dedup.js`

### 注意事项

1. **串行执行批次**：每批 1 张、每次云函数调用只处理 1 批，保证顺序、进度可追踪，但总耗时线性增长。
2. **僵尸任务保护**：若存在 `status === 'processing'` 且创建时间超过 10 分钟的任务，会自动标记为 failed 并允许重新启动。
3. **去重逻辑**：基于 OCR 摘要指纹识别重复页面，重复页不参与卡点合并，但仍保留在 `imageFiles` 中（带 `isDuplicate: true`）。
4. **验证模式对比**：会从 papers 集合读取 `bottleneckTargets`，仅对目标卡点做 improved/persisting/worsened/new 分类。
5. **失败回滚**：异常时会将 `reports.status` 和 `analysisTasks.status` 都置为 `failed`，并清空 `subjectProfiles.analysisStatus`。
6. `sendNotification` 目前是预留钩子；后续接入 `sendSubscribeMessage` 云函数、模板 ID 和前端订阅授权后，再恢复“完成后推送通知”的产品文案。

---

## analyzeBatch

### 功能描述

单批次分析：将 fileID 转为临时 URL，调用 CloudBase AI（hy3-preview 多模态模型）进行 OCR + 错题根因分析，返回结构化 JSON。当前由 `analyzePhotos` 按单图批次调用。

### 调用方式

```javascript
wx.cloud.callFunction({
  name: 'analyzeBatch',
  data: {
    fileIDs: ['cloud://xxx/a.jpg', 'cloud://xxx/b.jpg'],
    subject: 'math',
    batchIndex: 0,
    reportId: 'report_xxx'
  }
})
```

> ⚠️ 由 `analyzePhotos` 内部调用，前端不应直接使用。

### 输入参数

| 参数名 | 类型 | 必填 | 描述 | 示例 |
| --- | --- | --- | --- | --- |
| fileIDs | string[] | 是 | 本批图片 fileID，长度 1~5，必须以 `cloud://` 开头 | `['cloud://xxx/a.jpg']` |
| subject | string | 否 | 学科，默认 `'math'`；可选 `math / chinese / english` | `'chinese'` |
| batchIndex | number | 否 | 批次序号，从 0 开始，用于日志追踪 | `0` |
| reportId | string | 否 | 所属报告 ID，便于追溯 | `'report_xxx'` |

### 输出格式

**成功**

```json
{
  "success": true,
  "data": {
    "pageResults": [
      {
        "imageIndex": 1,
        "fileID": "cloud://xxx/a.jpg",
        "ocrSummary": "本页包含 5 道分数加法题...",
        "summary": "分数通分错误 2 处",
        "bottlenecks": [
          {
            "lpCode": "LP-002",
            "lpName": "分数运算错误",
            "errorCount": 2,
            "severity": "high",
            "rootCause": "通分时最小公倍数求错",
            "suggestion": "复习短除法求最小公倍数"
          }
        ],
        "errorDetails": [
          {
            "questionContent": "1/3 + 1/4 =",
            "studentAnswer": "2/7",
            "correctAnswer": "7/12",
            "lpCode": "LP-002",
            "rootCause": "分子分母分别相加",
            "suggestion": "强调通分步骤"
          }
        ],
        "totalErrors": 1
      }
    ],
    "batchIndex": 0,
    "analyzedFileIDs": ["cloud://xxx/a.jpg"],
    "timestamp": 1718000000000
  }
}
```

**失败**

```json
{
  "success": false,
  "error": "图片分析失败，请稍后重试"
}
```

### 错误码 / 错误消息

| 错误消息 | 触发条件 |
| --- | --- |
| fileIDs 不能为空 | 未传或非数组 / 长度为 0 |
| 单次最多处理5张图片 | fileIDs.length > 5 |
| 图片参数无效 | 存在非字符串或不以 `cloud://` 开头的 fileID |
| 学科参数无效 | subject 不在白名单 |
| 部分图片无法读取，请重新上传 | getTempFileURL 未能获取全部临时链接 |
| 解析AI返回失败：... | AI 返回内容无法解析为合法 JSON |
| AI 返回的数据结构无效 | 解析后缺少 pageResults 数组 |
| 逐页分析结果数量不正确 | pageResults.length !== 期望图片数 |
| 图片序号无效或重复 | imageIndex 越界 / 非整数 / 重复 |
| 图片分析失败，请稍后重试 | 任意未预期异常兜底 |

### 超时配置建议

- **推荐超时：60s**。CloudBase AI SDK 初始化 timeout 已设为 60000ms。
- 单次调用含：getTempFileURL + AI 推理 + JSON 解析，典型耗时 5–15s。

### 依赖的外部服务

- 微信云存储（`cloud.getTempFileURL` 获取临时访问链接）
- CloudBase AI（模型：`hy3-preview`，多模态）
- 微信云数据库（无直接读写，但通过 reportId 关联）

### 内部调用关系

- ⬅️ 被 `analyzePhotos` 串行调用
- 📦 使用本地模块：`./result-normalizer.js`

### 注意事项

1. **Prompt 内置颜色规则**：黑色=原始作答、蓝色=订正、红色=批改标记，AI 据此判断错题。
2. **严格 JSON 输出**：Prompt 要求不加 ```json``` 包裹，但代码仍做了兼容清洗。
3. **结果归一化**：所有字段经 `normalizePageResults` 校验并截断，防止 AI 返回过长内容撑爆数据库。
4. **fileID 回填**：AI 只返回 imageIndex，代码根据索引映射回真实 fileID；若映射失败则过滤该页。
5. temperature 固定为 0.3，保证分析结果稳定可复现。

---

## generatePaper

### 功能描述

调用 CloudBase AI（deepseek-v4-flash）生成验证试卷或默认诊断试卷题目，使用 pdfkit 渲染 A4 PDF 并上传云存储；可选择是否持久化到 `papers` 集合。

### 调用方式

```javascript
wx.cloud.callFunction({
  name: 'generatePaper',
  data: {
    studentId: 'stu_xxx',
    subject: 'math',
    type: 'verification',         // verification | default-diagnosis
    targets: ['BN-DEC-MUL-POINT-COUNT', 'BN-DEC-MUL-POINT-ESTIMATE'],
    targetPlan: {
      strategy: 'hierarchy_pages_v1',
      pages: [{
        pageType: 'same_family',
        categoryTitle: '计算规则',
        familyTitle: '小数点定位与移动',
        targetIds: ['BN-DEC-MUL-POINT-COUNT', 'BN-DEC-MUL-POINT-ESTIMATE']
      }]
    },
    preview: false,               // true 时仅生成 PDF，不写入 papers
    paperKey: 'v202406',          // 套题标识，≤20 字符
    questionCount: 12,            // 仅 default-diagnosis 生效，6~20
    grade: 4                      // 仅 default-diagnosis 必填，1~6
  }
})
```

### 输入参数

| 参数名 | 类型 | 必填 | 描述 | 示例 |
| --- | --- | --- | --- | --- |
| studentId | string | 是 | 学生文档 ID | `'stu_xxx'` |
| subject | string | 否 | 学科，默认 `'math'` | `'english'` |
| type | string | 否 | 试卷类型，默认 `'verification'`；可选 `verification / default-diagnosis` | `'default-diagnosis'` |
| targets | string[] | 条件必填 | 验证模式下必填，1~60 个目标编码；兼容 `LP-*` 粗卡点、`BN-*` 数学细卡点、`CHI-*` 语文错项目标 | `['BN-DEC-MUL-POINT-COUNT']` |
| targetPlan | Object | 否 | 验证任务分页计划；数学层级组卷使用 `strategy='hierarchy_pages_v1'`，可按粗类/家族合并同类细卡点 | 见下方 |
| preview | boolean | 否 | 是否预览模式，默认 false；true 时不写库 | `true` |
| paperKey | string | 否 | 套题标识，截断至 20 字符 | `'v202406'` |
| questionCount | number | 否 | 默认诊断试卷题目数，clamp 到 6~20，默认 12 | `15` |
| grade | number | 条件必填 | default-diagnosis 时必填，1~6 | `4` |

### 输出格式

**成功（正式生成）**

```json
{
  "success": true,
  "paperId": "paper_xxx",
  "pdfFileId": "cloud://env.xxx/papers/stu_xxx_math_verification_1718000000000.pdf",
  "title": "数学验证试卷 - 计算错误（加减乘除）",
  "questionCount": 10,
  "studentPages": 1,
  "answerPages": 1,
  "totalPages": 2,
  "verificationPack": {
    "scheduleStrategy": "hierarchy_pages_v1",
    "totalTargets": 2,
    "totalStudentPages": 1
  }
}
```

**成功（预览模式）**

```json
{
  "success": true,
  "pdfFileId": "cloud://env.xxx/papers/stu_xxx_math_verification_preview_1718000000000.pdf",
  "title": "数学验证试卷 - 计算错误（加减乘除）",
  "questionCount": 10,
  "studentPages": 1,
  "answerPages": 1,
  "totalPages": 2
}
```

**失败**

```json
{
  "success": false,
  "error": "试卷生成失败，请稍后重试"
}
```

### 错误码 / 错误消息

| 错误消息 | 触发条件 |
| --- | --- |
| 缺少 studentId | 未传 studentId |
| 学科或试卷类型无效 | subject / type 不在白名单 |
| 学习卡点参数无效 | targets 非数组 / 长度 > 60 / code 不符合 `LP-*`、`BN-*` 或 `CHI-*` 目标格式 |
| 验证试卷至少需要一个学习卡点 | type=verification 但 targets 为空 |
| 默认诊断试卷需要选择有效年级 | type=default-diagnosis 但 grade 不在 1~6 |
| 学生不存在 | students 查无此 doc |
| 无权执行该操作 | 当前微信不是该孩子档案成员，不能生成试卷 |
| AI 返回的试卷结构无效 | 解析后缺少 questions 数组 |
| AI 返回题目数量不足 | 过滤不完整题后，完整题数量少于期望值（验证=targets×5，诊断=questionCount） |
| 试卷生成失败，请稍后重试 | 任意未预期异常兜底 |

### 超时配置建议

- **推荐超时：60s**。AI 生成 + PDF 渲染 + 云存储上传三步串行。
- CloudBase AI SDK timeout 已设为 60000ms。

### 依赖的外部服务

- 微信云数据库（students、subjectProfiles、papers 集合）
- 微信云存储（上传生成的 PDF）
- CloudBase AI（模型：`deepseek-v4-flash`，纯文本）
- npm 包：`pdfkit`
- 内置字体：`NotoSansCJKsc-Regular.otf`

### 内部调用关系

- 无内部云函数调用
- 📦 本地工具函数：`cleanPromptText`、`normalizeQuestionsData`、`generatePDF`

### 注意事项

1. **中文字体**：字体文件随云函数部署，缺失时会直接返回试卷生成失败，避免静默生成乱码 PDF。
2. **Prompt 防注入**：学生姓名、paperKey 等均经 `cleanPromptText` 清洗（去换行、去尖括号、截断）。
3. **题目数量校验**：先过滤缺少题干或答案的不完整题；完整题数量不足期望值时抛错，若 AI 多生成则截取前 N 道。
4. **预览模式**：`preview=true` 时 PDF 仍会上传云存储，但不写 papers 记录，适合即时预览。
5. 验证试卷题目数 = `targets.length × 5`，每个目标固定为 3 道核心验证题 + 2 道迁移延展题。
6. 数学细卡点较多时，前端可传入 `targetPlan.pages`；后端会把同一家族/同一粗类的细卡点安排到同一任务页，并在 `verificationPack.pages` 中保存 `pageType/categoryTitle/familyTitle/targetIds/questionIds`。
7. PDF 学生页会打印唯一 `pageCode`，孩子可以批量打印、分批作答；上传照片后可按页追踪验证效果。
8. PDF 分页阈值 y > 700，每题预留答题空白区。

---

## reanalyzeMathHistory

### 功能描述

数学历史报告维护云函数。用于把历史图片重新进入当前 AI 诊断链路，或把同一学生的历史图片合并成一份“截至当前时间点”的完整数学诊断快照。当前版本标记为 `math-full-reanalysis-v2.2-hierarchy`，输出应使用数学卡点层级版学习地图：粗类、卡点家族、细卡点、知识节点和推荐资源。

### action / phase 列表

| phase | 必填参数 | 描述 |
| --- | --- | --- |
| `aggregate` | `studentId` 可选；`apply` 可选 | 按学生聚合所有可见历史数学报告图片，创建一份 `sourceType='history-aggregate'` 的待分析快照报告 |
| `status` | `reportId` | 查询重分析报告和关联 `analysisTasks` 的进度，返回 `learningMapBackfill` 与 `reanalysis` 标记 |
| `retryAggregateFailedBatch` | `reportId` | 对历史合并报告中失败的单页批次执行补跑 |
| `resumeAggregateFinalization` | `reportId` | 批次均完成但最终合并中断时恢复最终合并 |
| `finalize` | `studentId` 可选；`apply` 可选 | 逐份替换模式下归档旧报告并重建数学 `subjectProfiles` |

### 输出重点

`aggregate` 创建的新报告会写入：

```json
{
  "sourceType": "history-aggregate",
  "reanalysis": {
    "version": "math-full-reanalysis-v2.2-hierarchy",
    "learningMapVersion": "math-learning-map-v2.2-hierarchy",
    "aggregateCurrentSnapshot": true,
    "bottleneckHierarchy": {
      "enabled": true,
      "levels": ["category", "family", "fineBottleneck"]
    }
  }
}
```

### 注意事项

1. 自用场景优先使用 `aggregate`：把历史图片合并成一份当前完整快照，而不是为每份旧报告生成多份新版报告。
2. 历史快照仍保留 `sourceReportIds`、`imageFileIds` 和 `imageFiles`，便于追溯证据来源。
3. 层级字段由 `analyzePhotos/math-learning-map-enricher.js` 写入 `reports.bottlenecks[].candidateBottlenecks[]`，维护脚本 `scripts/backfill-math-learning-map.js` 可对旧报告补齐并输出 `hierarchyBackfilledCount / missingHierarchyCount`。
4. 本地直接 dry-run 需要 `wx-server-sdk` 或云函数环境；没有 SDK 时可用 `--input` 本地 JSON 做预演。

---

## generateReportPDF

### 功能描述

读取已完成的分析报告数据，使用 pdfkit 渲染 A4 PDF（含摘要、卡点分布、错题详情、对比摘要），上传云存储并回写 `reports.pdfFileId`。

### 调用方式

```javascript
wx.cloud.callFunction({
  name: 'generateReportPDF',
  data: {
    reportId: 'report_xxx'
  }
})
```

### 输入参数

| 参数名 | 类型 | 必填 | 描述 | 示例 |
| --- | --- | --- | --- | --- |
| reportId | string | 是 | 已完成的报告文档 ID | `'report_xxx'` |

### 输出格式

**成功**

```json
{
  "success": true,
  "reportId": "report_xxx",
  "pdfFileId": "cloud://env.xxx/reports/report_xxx_1718000000000.pdf",
  "message": "PDF 已生成，可在报告页下载"
}
```

**失败**

```json
{
  "success": false,
  "error": "报告 PDF 生成失败，请稍后重试"
}
```

### 错误码 / 错误消息

| 错误消息 | 触发条件 |
| --- | --- |
| 缺少 reportId | 未传 reportId |
| 报告不存在 | reports.doc(reportId).get() 返回空数据 |
| 无权执行该操作 | 当前微信不是报告所属孩子档案成员，不能生成报告 PDF |
| 报告 PDF 生成失败，请稍后重试 | 任意未预期异常兜底 |

### 超时配置建议

- **推荐超时：30s**。仅涉及数据库读取 + PDF 渲染 + 上传，无 AI 调用。
- 大报告（errorDetails 很多）可能接近 30s。

### 依赖的外部服务

- 微信云数据库（reports 集合）
- 微信云存储（上传 PDF）
- npm 包：`pdfkit`
- 内置字体：`NotoSansCJKsc-Regular.otf`

### 内部调用关系

- 无内部云函数调用
- 📦 本地工具函数：`useChineseFont`、`generatePDF`

### 注意事项

1. **前置条件**：报告必须已完成分析（status=completed），否则生成的 PDF 内容为空或残缺。
2. **内容截断**：卡点最多显示 10 条，错题详情最多显示 10 条。
3. **验证报告特有章节**：当 `comparisonSummary` 非空时自动追加「对比上次诊断」板块。
4. **页脚**：每页底部居中打印生成时间与页码。
5. 每次调用都会重新生成 PDF 并覆盖 `reports.pdfFileId`，支持重生成。

---

## getAnalysisProgress

### 功能描述

轻量查询函数：根据 `reportId` 返回最新 `analysisTasks` 记录的进度信息，供前端轮询展示分析进度。

### 调用方式

```javascript
wx.cloud.callFunction({
  name: 'getAnalysisProgress',
  data: {
    reportId: 'report_xxx'
  }
})
```

### 输入参数

| 参数名 | 类型 | 必填 | 描述 | 示例 |
| --- | --- | --- | --- | --- |
| reportId | string | 是 | 报告文档 ID | `'report_xxx'` |

### 输出格式

**成功**

```json
{
  "success": true,
  "reportId": "report_xxx",
  "status": "processing",
  "completedBatches": 2,
  "totalBatches": 4
}
```

**失败**

```json
{
  "success": false,
  "error": "未找到分析任务"
}
```

### 错误码 / 错误消息

| 错误消息 | 触发条件 |
| --- | --- |
| 缺少 reportId | 未传 reportId |
| 报告不存在 | reports.doc(reportId).get() 返回空 |
| 无权访问该报告 | 当前微信不是报告 owner，也不是该孩子档案的 active 成员 |
| 未找到分析任务 | analysisTasks 中无对应 reportId 的记录 |
| 获取分析进度失败，请稍后重试 | 任意未预期异常兜底 |

### 超时配置建议

- **推荐超时：10s**。纯数据库查询，响应极快。
- 前端轮询间隔建议 10s；报告页和学科主页通过 `utils/poller.js` 控制最大轮询次数和超时提示。

### 依赖的外部服务

- 微信云数据库（reports、analysisTasks 集合）

### 内部调用关系

- 无内部云函数调用

### 注意事项

1. 返回的是**最新创建**的 analysisTask（按 createdAt 降序取第一条）。
2. status 取值：`processing / completed / failed`。
3. 当 status=completed 或 failed 时，前端应停止轮询并刷新报告详情。
4. 本函数不做任何写操作，安全幂等。

---

## learningResource

**位置**：`cloudfunctions/learningResource/index.js`

**用途**：围绕数学学习卡点生成小程序内学习任务包，并记录完成学习、加入验证等轻量状态。第一版只支持 `subject === 'math'`，外部资源链接仅作为家长参考，孩子主入口是任务包内的微讲解、例题拆解、易错对比和 3 道练习。

### Actions

| action | 入参 | 出参 | 说明 |
| --- | --- | --- | --- |
| `generatePack` | `studentId`, `subject`, `target`, `resources?`, `sourceReportId?` | `{ success, packId, pack }` | 根据一个学习卡点生成 `learningResourcePacks` 记录 |
| `getPack` | `packId` | `{ success, pack }` | 读取已有学习任务包 |
| `completePack` | `packId`, `practiceResult?` | `{ success, completedAt }` | 标记任务包已完成，保存轻量练习结果 |
| `scheduleVerification` | `packId` | `{ success, scheduledAt }` | 标记该任务包目标已加入后续验证 |

### 权限

- `generatePack` 使用 `getStudentAccess + canOperateLearning` 校验当前 OPENID 是否可操作对应学生。
- `getPack / completePack / scheduleVerification` 使用 `getLearningResourceAccess` 校验当前用户是否可读或可操作该任务包。
- 非成员不能生成、读取或更新学习任务包。

---

## 辅助模块

以下模块不是独立云函数，而是被主云函数 require 的本地工具模块。它们不对外暴露 API，但承载了关键业务逻辑。

### result-normalizer.js

**位置**：`cloudfunctions/analyzeBatch/result-normalizer.js`

**用途**：校验并归一化 CloudBase AI 返回的逐页分析结果，防止脏数据写入数据库。

**导出函数**

| 函数 | 签名 | 说明 |
| --- | --- | --- |
| normalizePageResults | `(result, expectedPageCount) => { pageResults }` | 校验 pageResults 数组长度、imageIndex 唯一性，截断所有文本字段 |

**归一化规则**

- `pageResults.length` 必须严格等于 `expectedPageCount`，否则抛错
- `imageIndex` 必须是 1~expectedPageCount 的不重复整数
- 字段截断上限：
  - `ocrSummary`: 1000 字符
  - `summary`: 200 字符
  - `bottlenecks.lpCode`: 30 字符
  - `bottlenecks.lpName`: 80 字符
  - `bottlenecks.rootCause / suggestion`: 300 字符
  - `errorDetails.questionContent`: 500 字符
  - `errorDetails.studentAnswer / correctAnswer / lpCode / rootCause / suggestion`: 300 字符
- `severity` 仅接受 `high / medium / low`，非法值降级为 `medium`
- `errorCount` 强制转为非负整数
- `errorDetails` 最多保留 100 条
- 最终按 `imageIndex` 升序排列

**被调用方**：`analyzeBatch/index.js` 的 `parseResult` 函数

---

### photo-dedup.js

**位置**：`cloudfunctions/analyzePhotos/photo-dedup.js`

**用途**：基于 OCR 摘要指纹识别重复照片页面，避免同一份作业被多次分析导致卡点计数虚高。

**导出函数**

| 函数 | 签名 | 说明 |
| --- | --- | --- |
| normalizeOcrSummary | `(summary) => string` | 转小写、去除非标点符号字符、截断至 4000 字符，生成内容指纹 |
| markDuplicatePages | `(pages, historicalPhotos?) => Page[]` | 为每页标注 `contentFingerprint / isDuplicate / duplicateOf` |

**去重算法**

1. 先将历史照片（同学生同学科已完成报告的 imageFiles）的 ocrSummary 指纹注册到 Map
2. 遍历当前批次页面：
   - 计算当前页指纹
   - 若指纹已在 Map 中 → 标记 `isDuplicate: true`，记录 `duplicateOf` 为首次出现的 fileID
   - 若指纹未出现 → 标记 `isDuplicate: false`，并将指纹注册到 Map
3. 指纹为空字符串的页面不参与去重判定

**被调用方**：`analyzePhotos/index.js` 在合并批次结果前调用

**注意事项**

- 去重粒度是「页面级」而非「题目级」，只要整页内容相似即判重
- 重复页仍保留在 `imageFiles` 中（带标记），只是不参与卡点合并
- 历史照片查询范围为最近 20 份已完成报告

---

### comparison.js

**位置**：`cloudfunctions/analyzePhotos/comparison.js`

**用途**：在验证模式下，将本次分析的卡点与上次报告对比，标注改善状态；生成人类可读的对比摘要。

**导出函数**

| 函数 | 签名 | 说明 |
| --- | --- | --- |
| compareBottlenecks | `(previousBottlenecks, currentBottlenecks, verifiedCodes) => Bottleneck[]` | 对比两次卡点列表，为每个卡点标注 status |
| buildComparisonSummary | `(bottlenecks) => string` | 统计各状态数量，生成一句话摘要 |

**status 分类规则**

| status | 含义 | 判定条件 |
| --- | --- | --- |
| new | 本次新发现 | 上次报告中不存在该 lpCode |
| improved | 已改善 | 本次 errorCount < 上次，或在上次存在但本次未出现（且在验证范围内） |
| worsened | 恶化 | 本次 errorCount > 上次 |
| persisting | 持续存在 | 本次 errorCount === 上次 |

**验证范围约束**

- 当 `verifiedCodes` 非空时，仅对指定 lpCode 的卡点做「消失即 improved」判定
- 未在验证范围内的历史卡点即使本次未出现，也不会被标记为 improved

**摘要格式**

```
{n_improved} 个学习卡点已改善，{n_pending} 个仍需继续验证，{n_discovered} 个为本次新发现。
```

其中 `n_pending` = persisting + worsened 的数量。

**被调用方**：`analyzePhotos/index.js` 在 `mode === 'verification'` 时调用

**注意事项**

- 对比基准是「最近一份有 bottlenecks 的已完成报告」（通过 `getPreviousReport` 获取）
- 结果按 errorCount 降序排列
- 非验证模式下不调用此模块，所有卡点统一标记为 `status: 'found'`

# Backend (Cloud Functions)

<!-- Generated: 2026-06-25 | Files scanned: 254 | Token estimate: ~950 -->

## 云函数清单（14 个）

| 函数 | 职责 | AI 模型 | 关键 actions |
|------|------|---------|-------------|
| `uploadAndAnalyze` | 上传图片→启动诊断 | — | — |
| `analyzePhotos` | 诊断主控：分批串行+合并+报告+自动验证卷 | — | — |
| `analyzeBatch` | 单批AI分析(≤5图)→结构化JSON | hy3-preview | — |
| `generatePaper` | 生成验证卷/诊断卷PDF | deepseek-v4-flash | `_regeneratePdf`, `_appendToPaperId` |
| `regenerateVerificationPaper` | 手动重新生成验证卷 | — | start, continue, finalize, fail |
| `studentData` | 读：仪表盘/报告/试卷/验证卷/时间线 | — | getSubjectDashboard, getReportDetail, getPaperDetail... |
| `studentAccess` | 权限：学生列表/成员/邀请 | — | getAccessibleStudents, acceptInviteByCode... |
| `englishVocabulary` | 英语双功能：口语+听写+OCR | hy3-preview | submitRecognitionAttempt, submitDictationPhoto... |
| `learningResource` | 学习资源包（按细 targetId 缓存） | deepseek-v4-flash | generatePack, getPack, completePack |
| `generateReportPDF` | 报告→PDF | — | — |
| `getAnalysisProgress` | 轮询分析进度 | — | — |
| `reanalyzeMathHistory` | 历史报告重分析(token) | — | — |
| `reportFeedback` | 反馈学习 | — | createFeedback, listFeedbackByReport |
| `aiUsage` | AI 用量账本、内测授权、删除请求 | — | listEvents, getSummary, getBetaAuth, setBetaAuth |

## 调用链路

```
# 诊断主流程
uploadAndAnalyze
  → analyzePhotos (主控)
    → analyzeBatch (AI 逐图分析, 分批串行)
      ← pipeline.mergeBatchResults (合并)
    → profile-summary.buildProfileSummary (更新 profile)
    → auto-verification.triggerAutoVerificationPaper
      → generatePaper(_appendToPaperId) × N 批
      → generatePaper(_regeneratePdf) (最终PDF)
    → report 写入 reports 集合

# 验证卷手动重生成
regenerateVerificationPaper(start/continue/finalize)
  → generatePaper(_appendToPaperId)
  → generatePaper(_regeneratePdf)
```

## 关键文件

```
cloudfunctions/analyzeBatch/
  index.js              prompt 构建 + AI 调用 (338L)
  result-normalizer.js  AI 输出清洗 + BN canonicalize 归并 (275L)
  taxonomy-bn-list.js   28标准BN + 变体映射表 (打包安全, 88L)
  bottleneck-name.js    LP代码→中文名 + 别名

cloudfunctions/analyzePhotos/
  index.js              主控 (818L)
  auto-verification.js  自动验证卷引擎 (447L)
  pipeline.js           批次合并 (202L)
  profile-summary.js    跨报告 profile 合并 (385L)
  math-learning-map-enricher.js  taxonomy评分+BN丰富化 (374L)

cloudfunctions/generatePaper/
  index.js              出题主控 + _regeneratePdf (888L)
  pdf-renderer.js       PDFKit A4双栏渲染 (540L)
  verification-pack.js  分页策略 (298L)

cloudfunctions/learningResource/
  index.js              任务包生成/复用，缓存键=bottleneckId||targetId||lpCode||id

cloudfunctions/aiUsage/
  index.js              月度用量聚合、内测授权、删除请求
  usage-ledger.js       AI 用量事件 start/success/failure 三态写入
  pricing.js            模型价格与估算规则
```

## 权限模型

```
getStudentAccess(db, studentId, openId)
  → access.student      学生存在?
  → canOperateLearning  家长/owner 可读写?
  → canReadLearning     viewer 只读?
权限=家庭工具设计：canOperate == canRead（家庭成员间不区分读写）
```

## 共享文件（独立打包要求）

每个云函数内部各有一份 `_shared/` 或顶层副本（非 `../_shared/`）：
`access.js`, `constants.js`, `bottleneck-name.js`, `profile-summary.js`
→ `tests/deployment-readiness.test.js` 验证一致性

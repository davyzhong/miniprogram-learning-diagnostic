# Data Model

<!-- Generated: 2026-06-25 | Files scanned: 254 | Token estimate: ~800 -->

## 数据库集合（10 collections）

| 集合 | 作用 | 关键字段 |
|------|------|----------|
| `students` | 学生 | _id, name, grade, _openid |
| `studentMembers` | 家长成员 | studentId, memberOpenId, role(owner/viewer) |
| `studentInvites` | 邀请码 | studentId, code, role |
| `subjectProfiles` | 学科画像 | studentId, subject, pendingBottlenecks[], currentBottlenecks[] |
| `reports` | 诊断/验证报告 | type(diagnosis/verification), bottlenecks[], verificationPaperId |
| `papers` | 验证卷/诊断卷 | type, generationStatus, questions[], pdfFileId, verificationPack |
| `analysisTasks` | 分析任务 | reportId, fileIDs[], status, batchResults[] |
| `learningResourcePacks` | 资源包 | studentId, targetId, status, sections[] |
| `englishPracticeSessions` | 英语练习 | studentId, sessionType, words[] |
| `reportFeedback` | 反馈 | reportId, feedbackType, content |

## 实体关系

```
students 1──N studentMembers      (家长成员)
students 1──N subjectProfiles     (每学科一个 profile)
students 1──N reports             (诊断+验证报告)
students 1──N papers              (验证卷)
students 1──N englishPracticeSessions

reports N──1 papers               (report.verificationPaperId ↔ paper.triggeredByReport)
reports 1──N reportFeedback       (反馈学习)
analysisTasks N──1 reports        (分析任务)
```

## 验证卷生命周期

```
paper.generationStatus: generating → appending → ready | failed | superseded
paper.verificationStatus: pending → completed
report.verificationPaperStatus: generating → ready | failed
report.verificationPaperId → papers._id
paper.triggeredByReport → reports._id
```

## 种子数据（data/math/）

```
bottleneck-taxonomy-v2.seed.json   28个标准细BN (id/title/symptom/repair)
bottleneck-categories.seed.json    8 category + 21 family
knowledge-nodes.seed.json          知识节点图（prerequisites/successors）
learning-resources.seed.json       资源库（B站/可汗/课本锚点）

层级：category → family → node → bottleneck(BN)
打包：miniprogram/data/math/*.seed.js（.js 副本，小程序运行时用）
      cloudfunctions/analyzeBatch/taxonomy-bn-list.js（云函数打包安全副本）
```

## profile 卡点结构

```
subjectProfiles.currentBottlenecks[]:
  {
    lpCode: "LP-001",           粗卡点代码
    lpName: "计算错误",
    severity: "high",
    errorCount: 178,
    weight: 85,                 置信度权重(0-100)
    candidateBottlenecks[]: [   细BN
      { bottleneckId: "BN-DEC-MUL-POINT-COUNT",
        title: "...", evidenceStrength: "high" }
    ],
    status: needs_verification | improved | persisting,
    trend: new | improved | recurring | declining | persisting
  }
```

## 置信度分层（出题量）

```
weight ≥ 75  → 高置信 → 验证卷出 3 题（2核心+1迁移）
weight ≥ 45  → 中置信 → 出 2 题（1核心+1迁移）
weight < 45  → 低置信 → 出 1 题（1核心）
```

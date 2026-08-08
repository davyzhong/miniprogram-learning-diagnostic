# Frontend (Mini Program)

<!-- Generated: 2026-07-02 | Files scanned: 254 | Token estimate: ~850 -->

## 页面树（20 pages）

```
pages/
├── index/                  首页：家庭工作台 / 个人工作台
│   ├── index-presenter.js  状态：homeMode = family-workbench | single-profile
│   └── child-workbench.js  子卡片+验证卷入口
├── student-profile/        学生档案
├── add-student/            添加学生
├── join-student/           邀请码加入
├── parent-management/      家长成员管理
│
├── subject-home/           学科首页（工作台）
│   └── subject-home-presenter.js  卡点队列 + 验证卷状态
├── upload/                 拍照上传（诊断/验证）
├── upload-history/         上传历史 + 分析进度
│
├── report/                 诊断报告
│   └── report-presenter.js 全量卡点(profile.currentBottlenecks) + 知识地图
├── bottleneck-center/      卡点中心（学一下按细 targetId 打开任务包）
├── bottleneck-detail/      卡点详情（细卡点证据 + 学习/验证入口）
├── knowledge-map/          知识地图（category→family→node→BN）
├── learning-resource/      学习资源包（targetId 绑定细卡点）
│
├── generate-verification/  验证卷生成（历史兼容页，主流程自动）
├── default-paper/          默认诊断卷
├── paper-preview/          试卷预览/下载（覆盖卡点层级 + _regeneratePdf PDF）
├── ai-usage/               AI 用量账本、内测授权、删除请求
│
├── english-practice/       英语认词练习
├── english-dictation/      英语纸面听写（OCR）
└── english-wrong-words/    英语错词本
```

## 统一云调用入口

```
miniprogram/utils/cloud.js  ← 所有 wx.cloud.callFunction 封装
  ├── callUploadAndAnalyze, callAnalyzePhotos
  ├── callGeneratePaper, regenerateVerificationPaper
  ├── callStudentData(action), callStudentAccess(action)
  ├── callEnglishVocabulary(action)
  └── callGenerateReportPDF, getAnalysisProgress
```

## 核心页面状态流

```
# 诊断报告页 (report)
report.js → getReportDetail → report-presenter.js
  profile.currentBottlenecks (全量) → buildReportBottleneckViews (展开细BN)
  → 报告显示 N 个卡点（含 taxonomy BN）
  → "查看验证卷" → navigateToVerificationPaper

# 验证卷预览页 (paper-preview)
paper-preview.js → getPaperDetail → paper-preview-presenter.js
  → buildTaskPackView (verificationPack.pages)
  → buildPaperDisplay / bottleneckHierarchy (覆盖卡点层级)
  → onDownload → callGeneratePaper(_regeneratePdf) → PDF

# 学习卡点中心/详情 (bottleneck-center / bottleneck-detail)
onOpenLearningResource / onOpenLearning
  → targetId = bottleneckId || viewId || lpCode
  → cloud.generateLearningResourcePack
  → learning-resource?packId=...

# 学科首页 (subject-home)
subject-home.js → getSubjectDashboard → subject-home-presenter.js
  → taskQueue (扁平卡点队列)
  → getActiveVerificationPaper(reportId) → 验证卷状态
```

## 关键 utils

```
utils/
├── cloud.js                  云函数统一封装
├── bottleneck-view.js        卡点视图构建 + 细BN展开
├── math-bottleneck-hierarchy.js  taxonomy 层级分组
├── math-learning-map.js      知识地图(加载 .seed.js)
├── paper-display.js          试卷编号格式化 + 覆盖卡点层级
├── shared-navigation.js      统一导航（含 reportId 传递）
├── traceable-actions.js      可追踪操作 URL
├── learning-records.js       学习记录展示
└── child-workbench.js        首页子卡片
```

## 数据流（前端视角）

```
首页 → 学生档案 → 学科首页 → 拍照上传 → 分析进度(轮询)
                                         ↓
                    诊断报告 ← getReportDetail ← reports
                         ↓ 点击"查看验证卷"
                    试卷预览 ← getPaperDetail ← papers
                         ↓ 下载PDF打印作答
                    拍照上传(verification) → analyzePhotos → 验证报告
```

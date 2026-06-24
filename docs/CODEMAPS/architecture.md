# Architecture

<!-- Generated: 2026-06-25 | Files scanned: 254 | Token estimate: ~900 -->

## 项目类型

微信小程序 + CloudBase 云开发。单应用，非 monorepo。

## 系统全景

```
┌─────────────────────────────────────────────────────────┐
│                    微信小程序前端                         │
│  miniprogram/ (19 pages, 20 utils, 17471 lines JS)       │
│  ├── 首页/学生档案/学科首页                                │
│  ├── 拍照诊断 → 诊断报告                                  │
│  ├── 验证卷生成/预览/下载                                  │
│  ├── 知识地图/卡点中心/学习资源                             │
│  └── 英语双功能（口语+听写）                               │
└──────────────────────────┬──────────────────────────────┘
                           │ wx.cloud.callFunction
┌──────────────────────────▼──────────────────────────────┐
│              CloudBase 云函数 (12,645 lines)              │
│                                                          │
│  诊断闭环：                                                │
│  uploadAndAnalyze → analyzePhotos → analyzeBatch(AI)      │
│       ↓                              ↓                    │
│  reports(诊断报告)    ──→   auto-verification             │
│       ↓                              ↓                    │
│  paper-preview  ←──  generatePaper(AI) → papers(验证卷)   │
│       ↓                              ↓                    │
│  用户打印作答 → 拍照上传 → analyzePhotos(mode=verification)│
│                            ↓                             │
│                     reportFeedback(反馈学习)               │
└──────────────────────────┬──────────────────────────────┘
                           │ CloudBase DB + Storage + AI
┌──────────────────────────▼──────────────────────────────┐
│                    CloudBase 基础设施                     │
│  数据库(10 collections) | 云存储(PDF/图片) | AI(混元/deepseek)│
└─────────────────────────────────────────────────────────┘
```

## 核心闭环：诊断 → 验证 → 反馈

```
1. 拍照上传错题       uploadAndAnalyze → analyzePhotos → analyzeBatch(AI OCR)
2. AI 生成诊断报告     analyzePhotos → profile-summary → reports.diagnosis
3. 自动生成验证卷      auto-verification → generatePaper(AI 出题) → PDF
4. 用户打印/作答/拍照   upload → analyzePhotos(mode=verification)
5. 反馈学习闭环        reportFeedback → reports.verification → profile 更新
```

## 服务边界

| 层 | 职责 | 关键文件 |
|----|------|----------|
| 前端 | UI、拍照、PDF预览、轮询 | `miniprogram/pages/*`, `miniprogram/utils/cloud.js` |
| 云函数 | 业务逻辑、AI 调用、数据库 | `cloudfunctions/*/index.js` |
| AI | OCR 出题、错题分析 | 混元 `hy3-preview`、deepseek `deepseek-v4-flash` |
| 数据 | 持久化 | `data/math/*.seed.json`（taxonomy 种子库）|

## 约束

- 主包 ≤ 2MB（当前 ~1028KB）
- 单次云函数 ≤ 60s 超时（分批追加规避）
- CloudBase 每个云函数独立打包（`_shared/` 须复制到各函数内）

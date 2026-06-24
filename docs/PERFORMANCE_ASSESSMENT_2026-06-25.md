# 性能评估报告

> 生成时间：2026-06-25 | 扫描范围：13 云函数 + 19 前端页面 + 10 数据库集合

## 总览

| 层级 | P0（严重） | P1（高） | P2（中） | P3（低） |
|------|-----------|---------|---------|---------|
| 前端 | 2 | 8 | 5 | 3 |
| 云函数 | 3 | 5 | 4 | 5 |
| **合计** | **5** | **13** | **9** | **8** |

核心瓶颈集中在两个领域：**串行分批（batch size = 1）** 和 **N+1 查询模式**。

---

## P0 — 必须修复（影响核心用户体验）

### P0-1 照片分析逐张串行（batch size = 1）
**文件**：`cloudfunctions/analyzePhotos/index.js:24-26`
```
ANALYSIS_BATCH_SIZE = 1; MAX_CONCURRENT_BATCHES = 1; MAX_BATCHES_PER_INVOCATION = 1;
```
N 张照片 = N 次串行 `analyzeBatch` AI 调用 + N 次 DB 进度写入。钟青羽的 160 张试卷照片意味着 **160 次串行 AI 调用**，每次 ≤60s 超时。

**修复**：`ANALYSIS_BATCH_SIZE` 改为 5（analyzeBatch 已支持 ≤5 张/批），`MAX_BATCHES_PER_INVOCATION` 改为 3。**160 张从 160 次调用降到 ~32 次，提速 5 倍。**

### P0-2 验证卷生成逐卡点串行（batch size = 1）
**文件**：`cloudfunctions/analyzePhotos/auto-verification.js:14`、`regenerateVerificationPaper/index.js:13`
```
BATCH_SIZE = 1  （两个文件都是）
```
38 个卡点 = 38 次串行 `generatePaper` 调用（每次 ≤60s + 3 次重试 × 10s 退避），再加最终 `_regeneratePdf`。

**修复**：`BATCH_SIZE` 改为 5（每批 5 个 BN，对应 ~10-15 题，单次 60s 内可完成）。**38 个卡点从 38 批降到 8 批，提速 ~5 倍。**

### P0-3 supersedeOldPapers N+1 查询
**文件**：`cloudfunctions/analyzePhotos/auto-verification.js:124-141`
每次诊断完成后，循环最多 20 份旧验证卷，逐份查询是否有验证报告 → 最多 21 次串行 DB 往返。

**修复**：单次查询所有相关验证报告，构建 `Set<paperId>`，再批量 supersede。**21 次往返 → 2 次。**

### P0-4 首页加载 N+1 云调用
**文件**：`miniprogram/pages/index/index.js:134-172`
首页对每个孩子串行调用 `getStudentDashboard`，且两组 `Promise.all` 之间串行等待。N 个孩子 = 最多 3N 次串行往返阻塞首屏。

**修复**：合并为一次 `Promise.all`；fallback 读取也并行。

### P0-5 验证卷轮询器泄漏（4 个页面不清理）
**文件**：`miniprogram/utils/shared-navigation.js:273-304`
模块级单例 `_activePoller`，被 5 个页面启动，但只有 `report.js` 在 `onUnload` 调 `stopVerificationPoller()`。其余 4 个页面（subject-home、bottleneck-center、bottleneck-detail、generate-verification）导航离开后**轮询器继续运行**，持续调 `getActiveVerificationPaper`，且可能触发已失效页面的 `navigateTo`。

**修复**：每个启动轮询器的页面在 `onUnload`/`onHide` 调 `stopVerificationPoller()`。

---

## P1 — 高优先级（显著延迟，热路径）

### 前端

| # | 文件:行 | 问题 | 修复 |
|---|---------|------|------|
| P1-1 | `upload/upload.js:287-308` | 上传循环中每张图 `setData` 全量 images 数组 | 改用路径更新 `images[i]` |
| P1-2 | `cloud.js:218-226` | `getTempFileURLs` 50 张一批串行 await | `Promise.all` 并行批 |
| P1-3 | `cloud.js:125-133` | `getSubjectProfile` 拉取全学科再 `.find` | `.where({studentId, subject})` 精确查 |
| P1-4 | `default-paper.js:76-89` | 循环内逐卷串行云查询 | 单查询或 `Promise.all` |
| P1-5 | `report.js:188-199` | report/profile/paper-preview 串行 await 独立请求 | `Promise.all` |
| P1-6 | `upload-history.js:231-237` | 筛选切换重建全量 days 树 + setData | 预算分片，只 setData 当前筛选 |
| P1-7 | `subject-home.js:254-259` | 轮询每 tick setData 相同状态字符串 | 加相等性检查 |
| P1-8 | `report.wxml:55,197` | `wx:key="index"` 在可变列表上 → 全量重渲染 | 改用稳定唯一字段 |

### 云函数

| # | 文件:行 | 问题 | 修复 |
|---|---------|------|------|
| P1-9 | `analyzePhotos/index.js:148-182` | `getHistoricalPhotos` 和 `getPreviousReport` 查询完全相同，串行执行两次 | 合并为一次查询 |
| P1-10 | `studentData/index.js:591-623` | `getReportDetail` 3 次串行 DB 往返 | profile 和 paper 查询 `Promise.all` |
| P1-11 | `studentAccess/index.js:189-208` | `getAccessibleStudents` 逐成员串行查 student | `Promise.all` 批量 |
| P1-12 | `studentData/index.js:451-516` | `getLearningTimeline` 拉取 4×101 全量文档（含 bottlenecks/questions 数组），只用摘要字段 | `field()` 投影只取必要字段 |
| P1-13 | `studentData/access.js:15-28` | `getActiveMember` 无 `.limit(1)`，每次鉴权全扫 | 加 `.limit(1)` |

---

## P2 — 中优先级（规模/成本问题）

| # | 位置 | 问题 |
|---|------|------|
| P2-1 | 多处 | **缺复合索引**：reports 需 `(studentId, subject, createdAt)`、papers 需 `(studentId, subject, type)`。当前可能全表扫描 |
| P2-2 | 7 处 | `subjectProfiles.where({studentId}).get()` 拉全量再 `.find(subject)`。每次 3× 过量传输 |
| P2-3 | 6 处 | 无 `.limit()` 的 `.where().get()`，潜在无界读取 |
| P2-4 | `subject-home.js:72-79` | `onShow` 每次返回页面都跑 `loadProfile` + `checkAnalysisStatus` |
| P2-5 | `bottleneck-center.js:135-163` | 筛选点击双 setData（状态 + 过滤结果） |

---

## P3 — 低优先级（可优化但不紧急）

- `auto-verification.js:99` sort 内 `indexOf` 是 O(n²)（n=50 时可忽略）
- `generatePaper/index.js:91-100` `cleanLatex` 同一 `\frac` 正则跑两遍
- `generatePaper/index.js:164-176` `createPaperCodes` 查全量 papers 只为 `.length`
- `perf.js:23` metrics buffer 用 `Array.shift`（O(n)）
- `profile-summary.js:75-114` `mergeChineseReviewItems` 每次插入 spread 克隆 → O(n²)

---

## 修复 ROI 排序（投入产出比最高的 5 项）

| 排名 | 修复项 | 预计提速 | 改动量 |
|------|--------|----------|--------|
| 🥇 | P0-1 + P0-2 批量大小从 1 改到 5 | **5 倍**（照片分析 + 验证卷生成） | 改 2 个常量 |
| 🥈 | P0-3 supersedeOldPapers N+1 | **10 倍**（21 次往返 → 2 次） | 重写 1 个函数 |
| 🥉 | P0-5 轮询器泄漏 | 消除后台无效请求 + 假死导航 | 4 个页面加 stop |
| 4 | P1-9 验证完成重复查询 | **2 倍**（验证完成路径 DB 成本减半） | 合并 2 个函数 |
| 5 | P2-1 加复合索引 | DB 查询从全表扫描变索引查找 | CloudBase 控制台操作 |

---

## 已确认健康的部分（无需改动）

- ✅ `studentData` 三个 dashboard 函数顶层已用 `Promise.all` 并行查多集合
- ✅ `analyzeBatch` 鉴权已 `Promise.all` 并行读 report + task
- ✅ PDF 渲染器是线性遍历 + Map 分组，无 O(n²)
- ✅ BN canonicalize 归并是 O(28) 固定开销，可忽略
- ✅ 照片去重 `markDuplicatePages` 是 O(n) Map 查找
- ✅ 轮询器有 `maxAttempts` 上限（分析 5 分钟、验证 2 分钟），无无限轮询风险
- ✅ 无云端 `<image>` 标签未加 lazy-load 的问题

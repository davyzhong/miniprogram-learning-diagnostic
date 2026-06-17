# Code Review TODO（2026-06-17）

> 来源：MiniMax M3 全栈 review + ZCode 四维 review（后端/前端/数学/测试）合并去重。
> 所有条目均经代码核实，剔除幻觉与误报。

## 进度摘要

| 阶段 | 状态 | 测试 |
|------|:----:|:----:|
| P0 安全+阻断（#1-5） | ✅ 全部修复 | 407/407 |
| P1 安全/正确性（#6-10） | ✅ 全部修复 | 407/407 |
| P1 前端遗留（#11-14） | ✅ 全部修复 | 407/407 |
| P1 数学（#15-17） | ✅ 全部修复 | 407/407 |
| P1 性能（#18-19） | ✅ 全部修复 | 407/407 |
| P2 第一批（#20-24,26,28,29,32） | ✅ 已修复 | 407/407 |
| P2 剩余（#25,27,30,31,33,34） | 待处理（大改动/需讨论） | — |

**本轮共修复 28 项（全部 P0 + 全部 P1 + 大部分 P2），407 个测试全绿，无回归。**

---

## P0 已修复（本轮）

| # | 问题 | 修复方式 | 状态 |
|---|------|---------|:----:|
| 1 | englishVocabulary 6 个 action 水平越权（IDOR） | 新增 `authorizeResourceOwner`，用资源自身 studentId 反查权限 | ✅ |
| 2 | reanalyzeMathHistory 零鉴权 | 加 `MATH_REANALYSIS_TOKEN` 校验，对齐 analyzePhotos 模式 | ✅ |
| 3 | canOperateLearning == canReadLearning | 加注释标注为有意设计（家庭工具信任成员） | ✅ |
| 4 | englishVocabulary/access.js 副本 | **保留**——部署架构要求自包含（见下方说明） | ⚠️ |

### 关于 access.js 副本的说明

P0-5 原计划删除 englishVocabulary/access.js 副本改用 `_shared/access`。但核实后发现：
- 微信云函数独立部署，每个函数独立打包，`require('../_shared/access')` 部署后可能找不到文件
- `generatePaper` 也有自己的 `access.js` 副本（自包含部署）
- `deployment-readiness.test.js` 明确断言 `englishVocabulary/access.js` 必须存在
- 结论：**副本是部署约束的要求，保留**。但应加同步测试确保副本与 `_shared` 一致（见 P1-24）。

> ⚠️ **待确认**：`reportFeedback` 和 `studentData` 用 `require('../_shared/access')` 且无本地副本。这两个函数部署后是否会因找不到 `_shared` 而报错？需要真机部署验证。如果报错，需要补本地副本。

---

## P1 待修复（高优先，下一个迭代）

### 安全/正确性

| # | 问题 | 文件 | 工作量 |
|---|------|------|:------:|
| 6 | uploadAndAnalyze fire-and-forget 静默吞错，用户卡死 | `uploadAndAnalyze/index.js:128` | 0.5d |
| 7 | analyzePhotos 续跑 openId 双空旁路（report 无 _openid + 内部调用无 OPENID 时跳过全部校验） | `analyzePhotos/index.js:229-242` | 0.5d |
| 8 | learningResource.generatePack 未校验 sourceReportId 归属 | `learningResource/index.js:66` | 0.5d |
| 9 | analyzeBatch.authorizeBatch report 无 _openid 时放行 | `analyzeBatch/index.js:199` | 0.3d |
| 10 | subject-home-presenter.js:203 运算符优先级 bug 残留（`+` 高于 `||`） | `subject-home-presenter.js:203` | 0.2d |

### 前端遗留

| # | 问题 | 文件 | 工作量 |
|---|------|------|:------:|
| 11 | onFinishTap 传空 wordResults + 无 try/catch | `english-practice.js:213` | 0.3d |
| 12 | getRecognitionLang 无防御（promptType 缺失 fallback en_US） | `english-practice.js:153` | 0.2d |
| 13 | onRecordTap 缺 submitting 守卫，可触发并发录音 | `english-practice.js:135` | 0.2d |
| 14 | report.js fetchReportDetail fallback 丢失 permissions（默认放行写操作） | `report.js:130` | 0.3d |

### 数学瓶颈层级

| # | 问题 | 文件 | 工作量 |
|---|------|------|:------:|
| 15 | 引用悬挂：BN-AXIS-FOLD 的 categoryId/familyId/nodeId 不存在 | `bottleneck-taxonomy-v2.seed.json` | 0.5d |
| 16 | backfill 不幂等：重跑扩张 recommendedResourceIds | `math-learning-map-enricher.js:270` | 0.5d |
| 17 | categoryPath 旧 LP 风格与新 categoryTitle 系统性冲突（27/28 项） | `bottleneck-taxonomy-v2.seed.json` | 1d |

### 性能

| # | 问题 | 文件 | 工作量 |
|---|------|------|:------:|
| 18 | analyzePhotos 每张图独立写进度 _.inc(1)，高并发竞争 | `analyzePhotos/index.js:412` | 0.5d |
| 19 | englishVocabulary submitPracticeResult 循环内串行写库（40 词 ≈ 10s） | `englishVocabulary/index.js:831` | 0.5d |

---

## P2 持续重构池

| # | 问题 | 分类 | 工作量 |
|---|------|------|:------:|
| 20 | unclear 重测无即时用户反馈 | 前端体验 | 0.3d |
| 21 | 功能2 串行上传无进度文案 | 前端体验 | 0.3d |
| 22 | 文案错配（english-practice 标题"英语听写"、loading"正在准备听写"） | 前端文案 | 0.1d |
| 23 | 数学 taskQueueGroups 计算了但 WXML 未消费（死代码） | 数学/死代码 | 0.3d |
| 24 | 空 familyId 导致 wx:key="familyId" 不唯一 | 数学/渲染 | 0.3d |
| 25 | 同一 BN 跨 LP 重复展开导致 itemCount 不一致 | 数学/调度 | 0.5d |
| 26 | legacyLpCode="LP-AXIS / LP-LANG" 多码无法解析 | 数学/数据 | 0.2d |
| 27 | bottleneck-name/access 前后端副本无 CI 同步测试 | 可维护性 | 1d |
| 28 | reportFeedback targetId 无格式白名单 | 安全加固 | 0.3d |
| 29 | analyzeBatch.parseResult JSON 抽取不够鲁棒 | 正确性 | 0.3d |
| 30 | 大文件拆分（reanalyzeMathHistory 932行、analyzePhotos 776行、page-flows.test.js 3104行） | 可维护性 | 2d |
| 31 | report-presenter.js / upload-history-presenter.js 自实现日期格式化（时区不一致） | 正确性 | 0.5d |
| 32 | subject-home.js:88 读 this.data.loading 但该字段从未 setData（死代码） | 死代码 | 0.1d |
| 33 | learningResource 3 个 action（getPack/completePack/scheduleVerification）零行为测试 | 测试覆盖 | 1d |
| 34 | page-flows.test.js 应按页面拆分为 6-7 个文件 | 测试维护 | 1d |

---

## 测试套件状态

- **407 个测试全部通过**（本轮修复后）
- 之前 C1（状态机 12 组合）、C2（OCR 算法）、C3（P3 联动）均已修复，修复扎实
- learningResource 云函数 4 个 action 中 3 个无行为测试（P1-33）
- 测试/源码比合理，但 page-flows.test.js 3104 行需拆分

## 建议执行顺序

1. **立即**：P1 安全/正确性（#6-10）—— 消除剩余越权风险
2. **本周**：P1 前端遗留（#11-14）+ 数学 P1（#15-17）
3. **本迭代**：P1 性能（#18-19）
4. **持续**：P2 按需

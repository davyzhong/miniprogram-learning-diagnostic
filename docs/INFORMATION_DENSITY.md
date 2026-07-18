# 信息密度设计准则（项目级）

> 来源：2026-07-18 诊断报告页三轮密度重构（`276bfc2` / `2d1c46c` / `ae6a410`）验证有效后沉淀为全项目准则。
> 适用范围：所有面向家长的页面。新页面必须遵守，旧页面按优化清单逐步收敛。

## 核心原则：每一行都必须承载不可替代的信息

### 1. 同一数据，全页只出现一次（去重铁律）

同一信息在同一页面出现两次以上即为 bug 级问题。常见重复模式与正解：

| 重复模式 | 正解 |
|---|---|
| 结论/标题同时出现在页头和正文 | 页头只放元信息（类型·日期·状态 chip），完整结论只在正文出现一次 |
| 同一组计数出现在说明文字 + 大数字条 + 导航计数 | 只保留一处；导航计数算同一处 |
| 日期与"证据时间"同一天 | 同日不显示证据时间（跨天才保留），按北京时间比较 |
| 状态同时用色点 + 文字标签 + 文字行描述 | 色点/色块 + 一个文字标签，不另起描述行 |
| 质量提示（如"建议复核"）出现在 chip + 独立卡片 + 注意行 | chip（页头）+ 注意行（说原因），不开独立卡片 |

### 2. 量化证据单行化，禁用大数字块

- **禁止**"数字块矩阵"（每个指标一个大格子）。多个量化指标拼装为**单行统计文本**，在 presenter 层统一拼（如 `综合置信分 100 · 出现 37 次 · 错题 34 道 · 复测 2/1`），用 ` · ` 分隔。
- 趋势/构成关系用**细色带 + 单行图例**（`.b1-seg-*`），色条与图例同处一行，不各占一行。
- 有信息量的构成才画色带；单一分段（100% 一种状态）时色带可省略为文字。

### 3. 行合并：每个条目最多 4 行

列表条目的标准结构（诊断报告页卡点条目为基准）：

```
● 标题（加粗）                        [状态标签]
单行统计（置信分 · 量化证据 · 复测）
首见 · 最近 · 时长 · 口径 · 证据摘要…      反馈
```

- 标题行：状态色点 + 标题 + 状态文字标签，一行。
- 统计行：所有数字一行。
- 底部行：时间、口径、来源、摘要合并为一个 muted 行，次级操作（反馈/更多）内联到行尾，不独占一行。
- 补充说明（根因/建议）确有价值才保留，且不超过 2 行。

### 4. 页头紧凑标准

- 元信息**一行**（自动换行）：类型符号+类型 · 日期 · 状态 chip · 关联编号；不出现大标题、不出现装饰插图、不把正文内容提前到页头。
- 页头上下 padding ≤ 22rpx，行间距 ≤ 8rpx；学科色底边 8rpx 保留（学科身份）。
- 原生导航栏已有页面名时，页头不再重复大号页面名。

### 5. 留白预算（rpx）

| 部位 | 上限 |
|---|---|
| 卡片内边距 | 18 |
| 卡片间距 | 12 |
| 区块（section）上下 | 14 |
| 列表条目上下 padding | 12 |
| 条目间距 | 8 |
| 标题下距 | 10 |
| 主行动按钮高度 | 76 |
| 页底留白 | 24 |

超出即视为密度缺陷。字号不动本准则（正文下限 20rpx、标题阶梯保持）——密度靠结构与留白，不靠缩字。

### 6. 导航与层级

- 页内锚点导航：sticky、单行、高度 ≤ 46rpx，图标 + 短标签 + 计数。
- 分组层级最多两级（组 → 条目）；组标题与家族标题各占一行已是上限，信息可合并时合并。

### 7. 默认折叠

- 超过 5 条的证据/来源列表默认只展示前 3 条 + "展开剩余 N 条"。
- 错题详情默认折叠，点条目展开。
- 长列表分页加载或限高滚动，不一屏铺到底。

## 检验方法

每页自查三个问题：
1. 同一个数字/日期/状态在页面上出现几次？（>1 即违规）
2. 页头占了几个信息行？（>3 即违规）
3. 任一列表条目超过 4 行吗？（超过即违规）

回归测试参考 `tests/report-page-flows.test.js` 的防重复断言（headline 全页仅一次、数字块矩阵禁用等），新页面落地时应补同类契约测试。

---

## 附录：2026-07-18 全页面密度审查结果（优化清单）

按性价比排序（报告页为已达标基准；icon-compatibility 为内部工具豁免；english-confusion / chinese-skill-task 已紧凑无需动）。

### 第一批（结构级，省 30%+ 高度）

1. **upload-history**：删 summary-grid 大数字格（计数与 summaryText、筛选 pill 三处重复，留单行文本）；记录条目 6 行→4 行（status 并入 topline）；空态 padding 110rpx 超标。
2. **bottleneck-center**：删 stats-grid 4 大格（与色带图例、筛选 chips 三处重复，留色带）；卡片去状态三重复（badge 文字+左边框+chip 留 chip）；desc/time 合并行。
3. **bottleneck-detail**：metrics 4 大数字块改单行并入 hero（与通过率图例、证据链计数、置信度 chip/卡重复）；hero 5 行→3 行。
4. **index + student-profile**（共用 presenter，改一处两页受益）：诊断卡 signal-line 与色带图例二留一；child-card status-grid 与 segments 二留一；家庭 hero 内 stats 大数字块/色带图例/summary 三处计数留一处。
5. **learning-progress**：advice-stats 3 大数字块单行化（与页头计数重复）；timeline 条目 5 行→4 行；卡片 padding 28→18。
6. **ai-usage**：summary-grid 4 大数字卡改单行统计；event-row padding 24→12。
7. **english-wrong-words**：汇总卡与构成图例二留一；weakWords 默认 3 条 + 展开（当前未截断）；hero padding 42/34→22。
8. **subject-home**：quick-strip 3 大数字格改单行（pendingTaskCount 与地图入口计数重复、improvedCount 与学习进展入口重复）；hero 标题与按钮同文案去重。

### 第二批（留白与合并行）

9. **generate-verification**：preview-stats 4 格单行化；selectedCount 与"验证范围（N）"去重；hero padding 34/28→22。
10. **english-dictation**：progress-card 并入 prompt-top 行；批改结果 3 数字块单行化；卡片 padding 30→18；hero padding→22。
11. **paper-preview**：meta-grid 4 格改单行 meta 文本；workbench-card padding 28→18。
12. **knowledge-map**：置顶 priority 卡与 domain 列表内同一卡点去重（保留一处）；bn-item padding 20/24→12。
13. **add-student**：hero 3 行→2 行；表单卡 padding 24→18、表单项间距 28→16。
14. **join-student**：state-icon 96rpx→64rpx；卡片 padding 32→18；主按钮 96→76rpx。
15. **parent-management**：卡片 padding 28→18；member 条目 padding 24→12。

### 第三批（局部微调）

16. **default-paper**：「A4 N 页」并入 meta 行；卡片 padding 24→18。
17. **chinese-review-detail**：卡片/hero padding 28→18；value 上下 margin 22→12。
18. **english-practice**：shell gap 24→14；舞台卡 padding 36→20、min-height 480 酌减；进度 pill 与进度条二留一。
19. **learning-resource**：block padding 28→18、间距→14（学习内容页，优先级低）。
20. **upload**：photo-tips 装饰 chip 精简；async-tip 与 pageDesc 语义合并。

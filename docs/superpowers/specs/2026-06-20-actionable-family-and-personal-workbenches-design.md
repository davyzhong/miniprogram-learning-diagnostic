# 家庭与个人学习工作台重构落地设计

日期：2026-06-20  
状态：已落地  
范围：`index` 家庭学习工作台、`index` 单孩子模式、`student-profile` 个人学习工作台

## 1. 设计结论

本轮重构把首页和个人档案页统一为“行动优先”的学习工作台，而不是最近记录列表。

核心原则：

1. 每个卡片和信息块都必须能点击进入真实页面。
2. 首页可以提高信息密度，但不能展开长细卡点列表。
3. 诊断报告信息必须在个人工作台可见，但完整解释留在报告页。
4. 家庭工作台负责跨孩子调度；个人工作台负责单个孩子的下一步行动。
5. 图示图形不是装饰位，而是可点击的行动入口。

## 2. 家庭学习工作台

家庭页仅在多个孩子时显示，排序固定为：

1. 钟青羽 / 钟青宇，六年级优先；
2. 钟筱雨；
3. 其他孩子按 `createdAt` 倒序。

页面结构：

1. 家庭今日总览插图卡：使用 `/assets/images/math-diagnostic-guide.jpg`，点击进入当前最重要行动。
2. 孩子卡片：显示孩子信息、待办状态、今日优先行动、二级行动、三科学习状态、快捷入口。
3. 每个状态数字、学科行、快捷入口都带 `buildTraceableUrl` 生成的真实 URL。

家庭总览卡规则：

- 如果有待上传验证卷，优先进入试卷预览/上传。
- 否则如果有待验证卡点，进入验证卷生成或学科工作台。
- 否则进入孩子档案或学习记录。

## 3. 个人学习工作台

个人页同时用于：

- 首页只有一个孩子时的 `index` 单孩子模式；
- 从家庭页进入的 `student-profile` 页面。

两个入口共享 `buildLearningProfileHomeView()` 生成的同一套 view model。

页面结构：

1. 个人插图卡：使用 `/assets/images/student-profile-hero.png`，点击进入今日主行动。
2. 今日行动卡：生成验证卷、上传新试卷或查看学习记录。
3. 最新诊断报告卡：显示报告标题、生成时间、证据时间、主要结论、照片/错题证据，点击进入报告页；无报告时引导上传作业。
4. 接下来可以做什么：卡点中心、上传新作业、数学知识地图、学习记录。
5. 三科学习入口：数学、语文、英语三行均可点击进入学科工作台。

个人页移除首页级重复展示：

- 不再单独展示 `coverage-card`。
- 不再单独展示 `metric-strip`。
- 不再展开 `highlight-row`、`record-row`、`next-card`、旧 `subject-grid`。

这些信息仍保留在 view model 中，供旧导航、测试和其他页面兼容；个人主页只展示更清晰的行动结构。

## 4. 数据模型与代码边界

主要 view model：

- `buildChildWorkbenchCards()`：生成家庭孩子卡片。
- `buildFamilyWorkbenchHero()`：生成家庭今日总览插图卡。
- `buildLearningProfileHomeView()`：生成个人工作台。

新增个人工作台字段：

- `personalHero`
- `primaryActionCard`
- `reportPanel`
- `personalActionQueue`
- `subjects[].url / subjects[].summary / subjects[].actionText`

共享导航：

- `sharedNavigation.onTraceableUrlTap()` 统一处理带 `data-url` 的卡片跳转。
- `index` 仍保留本页同名兜底方法；`student-profile` 通过共享导航获得同样能力。

## 5. 验收标准

功能验收：

- 家庭页顶部出现图示总览卡，点击可进入真实行动。
- 钟青羽显示在钟筱雨前面。
- 孩子卡片不再展示冗长的最近试卷覆盖文本。
- 个人页出现个人插图、今日行动、最新诊断报告、行动队列、三科学科入口。
- 个人页所有卡片均可点击。
- 个人页不再重复堆叠样本覆盖、指标条、重点提示、学习记录列表和下一步建议。

测试验收：

- `tests/index-presenter.test.js` 覆盖家庭 hero 和个人工作台 view model。
- `tests/page-flows.test.js` 覆盖家庭/个人 WXML 结构。
- 全量 `npm test`、`npm run check`、核心 CLI E2E 需要通过后再提交。

# 家庭首页紧凑汇总条设计

> 日期：2026-07-18
> 状态：用户已确认方案 A

## 1. 问题

家庭学习工作台当前在页面标题与孩子卡之间展示“家庭今日总览”大卡片。该卡片再次呈现优先孩子、优先行动、行动说明和状态构成，而每个孩子卡随后又展示同一份优先行动与状态，因此占用约 250rpx 高度，却没有形成独立的信息职责。

家庭层真正独有的信息只有跨孩子聚合：全家共有多少事项待处理、多少作答待上传、多少学习卡点已经改善。

## 2. 目标

把大卡片改为 64–72rpx 的单行家庭汇总条，使第二个孩子卡更早进入首屏，同时保持家长对全家学习状态的快速判断。

本次不调整孩子卡内部已经确认的信息顺序：快捷入口、最新正式诊断、优先行动、次要行动、状态构成和紧凑学科入口保持原职责。

## 3. 信息结构

汇总条只包含以下内容：

```text
家庭今日 | 3 待处理 | 1 待上传 | 2 已改善
```

- `待处理`：当前各孩子卡 `analyzing + pendingVerification` 的合计。
- `待上传`：当前各孩子卡 `pendingUpload` 的合计。
- `已改善`：当前各孩子卡 `improved` 的合计。
- 数值为 0 的类别不渲染，不保留空占位。
- 待处理和待上传均为 0 时显示 `今日无待办`；如果存在改善项，同时显示 `N 已改善`。
- 待处理或待上传任一大于 0 时，不显示 `今日无待办`。
- 所有显示数字最大为 `99+`，原始数值仍保留在模型中用于测试，不把截断值用于计算。
- 聚合值沿用孩子卡已经计算出的 `statusItems`，不新增数据库查询或云函数字段。因此它是**当前孩子卡快照汇总**，不宣称覆盖数据库中未进入当前首页快照的所有历史记录。

## 4. 视觉与交互

- 汇总条高度控制在 64–72rpx，左右内边距约 16rpx，圆角不超过 8rpx。
- 使用浅绿色或中性浅底，边框保持克制，不使用阴影、大面积渐变、装饰图标或独立卡片标题区。
- `家庭今日` 使用中性深色或深绿色；待处理为金色、待上传为红色、已改善为绿色。
- 字号与孩子卡紧凑标签一致，不使用标题级大字。
- 汇总条不点击、不跳转、不带箭头。它只回答“当前孩子卡合计有多少事项”，具体行动只在对应孩子卡中执行。
- 整条提供连贯的无障碍文本，例如 `家庭今日，3项待处理，1项待上传，2项已改善`；不把三个彩色数字作为缺少上下文的孤立朗读项。
- 删除原总览中的 kicker、标题、说明、行动按钮、装饰符号和状态构成条。

## 5. 数据模型

`buildFamilyWorkbenchHero(cards)` 改为返回紧凑汇总模型。为控制改动范围，可以保留现有函数名和 `familyHero` 页面字段，但返回结构收敛为：

```js
{
  label: '家庭今日',
  metrics: [
    { key: 'pending', label: '待处理', value: 3, displayValue: '3', tone: 'waiting' },
    { key: 'pendingUpload', label: '待上传', value: 1, displayValue: '1', tone: 'destructive' },
    { key: 'improved', label: '已改善', value: 2, displayValue: '2', tone: 'improved' }
  ],
  idleText: '',
  ariaLabel: '家庭今日，3项待处理，1项待上传，2项已改善'
}
```

`metrics` 只包含值大于 0 的项，`displayValue` 使用 `value > 99 ? '99+' : String(value)`。状态输出必须满足：

| 输入状态 | 输出 |
| --- | --- |
| 仅待处理大于 0 | `N 待处理`，`idleText=''` |
| 仅待上传大于 0 | `N 待上传`，`idleText=''` |
| 仅已改善大于 0 | `今日无待办 · N 已改善` |
| 三类均为 0 | `今日无待办`，`metrics=[]` |

不再返回或消费 `title`、`summary`、`actionText`、`url`、`kickerSymbol` 和 `statusSegments`。旧字段不得在 WXML 留下不可见兼容分支，以免未来重新形成重复信息。

## 6. 修改范围

- `miniprogram/utils/child-workbench.js`：收敛家庭聚合模型。
- `miniprogram/pages/index/index.wxml`：用单行汇总条替换可点击大卡片。
- `miniprogram/pages/index/index.wxss`：删除旧 hero 大卡片样式，加入紧凑汇总条样式。
- `miniprogram/pages/index/index.js`：移除不再需要的家庭总览装饰符号；保留现有数据装配流程。
- `tests/index-presenter.test.js`、`tests/index-page-flows.test.js`：更新模型和页面合同。
- `tests/family-density-e2e-validator.test.js` 或对应密度校验：增加汇总条高度与重复文案守卫。
- `scripts/devtools-family-density-e2e.js`：如现有断言依赖旧 hero 文案，则同步为紧凑汇总条。

工作区中这些文件已经包含其他已确认任务的修改。实施只允许修改家庭汇总模型、原 hero 对应的 WXML 节点、其专属 WXSS 选择器、废弃的 `familyHeroSymbol` 绑定和直接相关断言，不得覆盖、回退或整体替换现有改动。删除 `.family-workbench-hero:active` 时，必须保留同一共享规则中的 `.personal-action-card:active`、`.personal-subject-row:active` 等其他选择器。孩子卡 `<view class="child-card">` 子树及其事件、字段和样式不属于本次修改范围。

## 7. 验收标准

1. 家庭首页不再出现 `家庭今日总览`、`今天先看…的学习行动`、`处理今日优先行动`和原总览说明文案。
2. 多孩子场景显示单行 `家庭今日` 汇总条，且三个原始数字与当前孩子卡 `statusItems` 合计一致；文案和文档均不将其描述为数据库全量任务数。
3. pending-only、upload-only、improved-only 和 all-zero 四种状态严格符合上表；任一显示数字超过 99 时显示 `99+`。
4. 汇总条没有点击事件、URL、箭头、装饰 emoji、状态构成条、大标题或 `:active` 状态，并提供完整 `aria-label`。
5. DevTools 密度校验把 72rpx 按当前窗口换算为像素上限，分别断言 360px 与 390px 下：汇总条不超过上限、每个指标位于容器内部、宽高大于 0、无换行或裁切。
6. 孩子卡 WXML 子树、快捷入口、最新诊断、行动、统计和学科入口行为保持不变；测试必须继续断言其关键事件绑定与字段存在。
7. 删除旧 hero 样式后，个人行动卡和个人学科入口的 active 规则仍存在。
8. 首页相关单元测试通过，`npm run check` 与 `git diff --check` 通过；微信开发者工具服务端口可用时补跑家庭首页密度 E2E 和截图检查。

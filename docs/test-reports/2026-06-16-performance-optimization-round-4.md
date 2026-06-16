# 2026-06-16 性能优化测试报告（第四轮）

## 背景

第三轮已经完成学习记录列表的 cursor 分页和字段瘦身。继续观察后，下一处高风险页面是诊断报告详情页：单份真实报告可能包含大量试卷图片、OCR 摘要和错题明细，页面首屏会因为 `setData` 大对象和长列表渲染变慢。

本轮目标：优化报告详情页首屏数据量和渲染量，不改变报告信息完整性。

## 优化内容

### 1. 报告详情页不再把完整大报告写入 page data

旧逻辑：

- `report.imageFiles`
- `report.errorDetails`
- OCR 摘要
- 其他大字段

会随 `report` 一起进入页面 `data`。

新逻辑：

- 完整报告保存在页面实例私有字段 `_fullReport`。
- 页面 `data.report` 只保留轻量字段。
- `imageFiles / imageFileIds / errorDetails / pageResults / rawPages / aiRaw` 不再进入 `data.report`。
- 需要生成验证试卷、展开来源或展开错题时，从 `_fullReport` 使用。

### 2. 来源证据首屏限量

旧逻辑：

- “本次使用的试卷”下会一次性渲染所有来源图片、OCR 摘要和关联错题。

新逻辑：

- 首屏只展示前 3 条来源证据。
- 显示“展开剩余 N 条来源摘要”。
- 点击后再局部展开完整来源证据。

### 3. 错题详情首屏限量

旧逻辑：

- “相关错题详情”一次性渲染所有错题条目。

新逻辑：

- 首屏只展示前 20 道错题。
- 显示“展开剩余 N 道错题”。
- 点击后再局部展开完整错题列表。

## 影响范围

主要文件：

- `miniprogram/pages/report/report.js`
- `miniprogram/pages/report/report-presenter.js`
- `miniprogram/pages/report/report.wxml`
- `miniprogram/pages/report/report.wxss`

新增或更新测试：

- `tests/report-presenter.test.js`
- `tests/page-flows.test.js`

## 自动化验证

### 报告页专项测试

命令：

```bash
node --test tests/report-presenter.test.js tests/page-flows.test.js
```

结果：

- 94 个测试通过。

重点覆盖：

- 报告来源证据首屏只展示 3 条。
- 来源证据可以按需展开。
- 错题详情首屏只展示 20 条。
- 错题详情可以按需展开。
- 页面 `data.report` 不再保留完整 `imageFiles/errorDetails`。

### 全量验证

命令：

```bash
npm run verify
```

结果：

- 392 个测试通过。
- JS 检查通过，共检查 133 个 JavaScript 文件。

### 格式检查

命令：

```bash
git diff --check
```

结果：

- 通过。

## 预期体感改善

报告详情页在以下场景会明显更稳：

- 单份报告包含很多试卷图片。
- OCR 摘要较长。
- 错题明细很多。
- 从学习档案或学习记录点击“阅读完整报告”。

本轮优化不会减少信息完整性，只是将大内容从“首屏全部渲染”改为“首屏摘要 + 按需展开”。

## 后续建议

下一轮优先级：

1. 小程序分包：把英语练习、报告详情、学习记录、验证试卷拆出主包。
2. 真机性能面板：开发环境展示最近云函数耗时与 payload 大小。
3. 图片缩略图：真实列表和报告来源统一使用缩略图，预览时再取原图。

# 2026-06-16 性能优化测试报告（第三轮）

## 背景

随着数学、英语、学习记录、学习卡点中心等功能增加，页面打开速度再次变慢。本轮从“继续加缓存”转向系统性减负：

- 先加性能埋点，定位云函数耗时和数据体积。
- 学习记录改为真正游标分页，避免加载更多时重复拉取旧数据。
- `studentData.getLearningTimeline` 返回轻量摘要，列表页不再搬运完整照片、OCR 和报告大对象。

## 本轮优化内容

### 1. 云函数调用性能埋点

新增：

- `miniprogram/utils/perf.js`
- `cloud.callFunction.duration`
- `cloud.callFunction.payloadBytes`
- `cloud.callFunction.resultBytes`

作用：

- 每次云函数调用都会记录耗时。
- 每次调用都会记录入参和返回结果大致体积。
- 在小程序环境中优先调用 `wx.reportPerformance`。
- 同时保留本地最近指标缓冲，便于测试和后续调试页读取。

### 2. 学习记录改为 cursor 分页

旧逻辑：

```text
第一页 limit=20
第二页 limit=40
第三页 limit=60
```

问题：

- 每次“加载更多”都会重复拉取前面已经展示过的记录。
- 数据越多，后续分页越慢。

新逻辑：

```text
第一页 limit=20
第二页 limit=20 + cursor=上一页最后时间
第三页 limit=20 + cursor=上一页最后时间
```

影响：

- 每次只取下一页 20 条。
- 前端将新事件追加到已有时间线，并按事件 id 去重。
- 共享时间线为空时不再重复回退旧集合读取。

### 3. 学习记录接口字段瘦身

`studentData.getLearningTimeline` 现在返回列表页需要的轻量摘要：

- 报告：标题、状态、时间、学科、卡点摘要、照片数量、错题数量。
- 试卷：题目数量、试卷编号、卡点摘要、页数摘要。
- 英语听写：词数、结果计数、少量必要照片 id。

不再在列表接口返回：

- 完整 `imageFiles`
- 大段 OCR 摘要
- 完整错题详情
- 完整报告正文

影响：

- 学习记录页仍能看到“18张照片”这类摘要。
- 具体原图、OCR 和详细证据应进入报告详情页查看。
- 列表页首屏和翻页的传输体积明显下降。

### 4. 测试数据库支持 cursor 查询

测试用的云数据库 mock 增加：

- `db.command.lt`
- `db.command.lte`
- `db.command.gt`
- `db.command.gte`

用于覆盖真实云数据库的游标分页行为。

## 自动化验证

### 目标测试

命令：

```bash
node --test tests/data-layer.test.js tests/page-flows.test.js tests/student-data-access.test.js
```

结果：

- 95 个测试通过。

覆盖内容：

- 云函数调用耗时与 payload/result size 埋点。
- 学习记录 cursor 分页。
- 学习记录轻量摘要。
- 云函数 `getLearningTimeline` 游标分页。
- 旧版 fallback 分页兼容。

### 全量验证

命令：

```bash
npm run verify
```

结果：

- 389 个测试通过。
- JS 检查通过，共检查 133 个 JavaScript 文件。

### 代码格式检查

命令：

```bash
git diff --check
```

结果：

- 通过。

## 预期体感改善

### 学习记录页

- 首屏固定只取 20 条轻量记录。
- 加载更多不再重复拉前面 20/40/60 条。
- 大量照片和 OCR 不再阻塞列表加载。

### 学科主页与档案页

- 能通过统一埋点看到各云函数耗时。
- 后续可以基于指标判断到底是云函数慢、数据大、还是页面渲染慢。

### 云函数链路

- `studentData.getLearningTimeline` 返回体积会明显小于上一版。
- 真实数据越多，cursor 分页收益越明显。

## 剩余优化点

1. 报告详情页仍可能较重：单份报告图片和 OCR 很多时，详情页还需要做折叠和图片懒加载。
2. 需要增加可视化性能调试页：把最近 `cloud.callFunction.*` 指标直接在开发环境展示出来。
3. 主包分包还没做：英语练习、报告详情、学习记录、验证试卷等低频页面后续应拆分到分包。
4. 云数据库索引仍需人工确认：`studentId + subject + createdAt` 是学习记录 cursor 分页的关键索引。

## 部署提醒

本轮修改涉及 `studentData` 云函数。真机要生效，需要重新部署：

```bash
/Applications/wechatwebdevtools.app/Contents/MacOS/cli cloud functions deploy \
  --env cloud1-d6gneg68m5a7a3876 \
  --names studentData \
  --remote-npm-install \
  --project "/Users/qiming/Downloads/GoogleDrive/AI Learning/miniprogram-learning-diagnostic"
```

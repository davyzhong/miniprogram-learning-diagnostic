# 2026-06-16 性能优化测试报告（第二轮）

## 背景

真实数据量增加后，小程序多个页面出现明显变慢，主要体感问题集中在：首页、孩子学习档案、学科主页、学习记录、学习卡点中心和学习卡点详情。

本轮目标不是新增功能，而是减少首屏无关数据加载、避免重复请求、让大列表按需加载。

## 本轮优化内容

### 1. 孩子学习档案增加短时缓存

- 页面：`student-profile`
- 策略：30 秒内重复进入不重新拉取完整 dashboard。
- 影响：从首页进入档案、返回再进入时，减少一次完整云函数调用。

### 2. 学习卡点中心改用轻量 dashboard

- 页面：`bottleneck-center`
- 策略：只读取学生与学科档案，不再顺带读取最近报告和试卷。
- 影响：学习卡点中心首屏更轻，避免为了统计卡点加载无关历史材料。

### 3. 学习记录改为分页时间线

- 页面：`upload-history`
- 策略：首次只读取 20 条记录，点击“加载更多”后按 20 条递增。
- 影响：钟青羽已有大量真实记录后，进入学习记录页不再一次性拉取 50 条以上数据。

### 4. 学习记录图片临时链接懒加载

- 页面：`upload-history`
- 策略：首次最多解析 12 张图片临时链接，更多图片在预览时再解析。
- 影响：大量上传照片不会阻塞学习记录文字时间线的首屏展示。

### 5. 学习卡点详情限制证据拉取量

- 页面：`bottleneck-detail`
- 策略：详情首屏只取最近 10 份报告和 10 份试卷作为证据来源。
- 影响：详情页避免为了一个卡点拉取过多历史记录。

### 6. 学科主页增加短时缓存与失效机制

- 页面：`subject-home`
- 策略：30 秒内重复进入复用当前学科 dashboard；上传新试卷或分析完成后强制失效。
- 影响：减少从学习记录、报告页返回学科主页时的重复等待，同时保证新数据能刷新。

### 7. 云函数增加轻量参数

- 云函数：`studentData`
- 新增能力：
  - `getStudentDashboard({ includeRecent: false })`
  - `getSubjectDashboard({ includePapers: false, reportLimit, paperLimit })`
  - `getLearningTimeline({ limit })`
- 影响：前端不同页面可以按职责只取必要数据，不再所有页面都加载完整数据包。

## 测试结果

### 自动化测试

命令：

```bash
npm run verify
```

结果：

- 354 个测试通过。
- JS 结构检查通过。

### 重点回归测试

命令：

```bash
node --test tests/page-flows.test.js tests/student-data-access.test.js
```

结果：

- 76 个测试通过。
- 覆盖了学习记录分页、临时图片懒加载、学生档案缓存、学科主页缓存、轻量 dashboard。

### 代码格式检查

命令：

```bash
git diff --check
```

结果：

- 通过。

### 微信开发者工具预览

命令：

```bash
/Applications/wechatwebdevtools.app/Contents/MacOS/cli preview --project "/Users/qiming/Downloads/GoogleDrive/AI Learning/miniprogram-learning-diagnostic" --qr-output terminal
```

结果：

- 预览成功。
- 预览包体积：670.6 KB。

## 预期体感改善

- 首页与孩子档案：短时间内返回和再次进入，应明显减少等待。
- 学科主页：返回时不应频繁出现重新加载卡顿。
- 学习记录：大量真实照片存在时，应先看到文字记录，再按需解析图片。
- 学习卡点中心：不再因为加载历史报告/试卷而拖慢首屏。
- 学习卡点详情：只看最近证据，打开速度应更稳定。

## 仍需观察的性能瓶颈

### 1. 云函数冷启动

首次打开某些页面仍可能慢，这通常来自云函数冷启动，不是前端渲染本身。

建议后续观察：

- `studentData`
- `englishVocabulary`
- `analyzePhotos`

如果冷启动明显，可以考虑拆分高频轻量函数，或减少高频函数依赖体积。

### 2. 云数据库索引

真实数据量继续增长后，如果查询字段没有索引，云端查询会越来越慢。

重点集合：

- `reports`
- `papers`
- `subjectProfiles`
- `englishPracticeSessions`
- `studentEnglishWords`

建议重点索引：

- `studentId + subject + createdAt`
- `studentId + subject + generatedAt`
- `studentId + subject + updatedAt`
- `studentId + nextReviewAt`

### 3. 报告详情大图片与证据展示

报告页目前已经避免额外加载完整学科 dashboard，但如果单份报告包含大量图片，报告本身仍可能较重。

后续可优化：

- 报告页图片证据折叠。
- 默认只展示前几张来源图片。
- 点击后再懒加载临时链接。

### 4. 上传链路仍可能慢

本轮主要优化页面打开速度，没有大幅改造上传链路。

后续可优化：

- 图片压缩策略。
- 上传并发控制。
- 大批量图片分批创建任务。
- 上传后立即返回，后台继续分析。

### 5. 英语词库统计缓存需要线上验证

英语词库摘要已经做缓存，但真实设备上还需要观察：

- 自动导入后缓存是否及时失效。
- 听写结果提交后首页统计是否及时刷新。
- 大词库下 `studentEnglishWords` 查询是否需要更多索引。

## 下一步建议

1. 先把本轮云函数部署到当前云环境，否则云端轻量参数不会在真机生效。
2. 用钟青羽当前真实数据真机走一遍：首页、学习档案、数学工作台、学习记录、学习卡点中心、英语工作台。
3. 如果仍慢，优先抓具体页面和具体等待点，再针对该页面做第三轮专项优化。

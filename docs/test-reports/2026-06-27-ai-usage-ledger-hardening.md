# 2026-06-27 AI 用量账本加固与专项 E2E 报告

## 1. 变更范围

本轮基于 AI 用量账本实施结果做 review 后，修复并验证以下内容：

- AI 用量事件成功/失败补写改为等待落库，避免云函数返回后长期停留在 `pending`。
- `aiUsage.listEvents/getSummary` 按北京时间自然月过滤，并在数据库查询阶段限定 `createdAt` 后再分页/聚合。
- `uploadAndAnalyze` 服务端校验 `userConsents.betaConsented=true`，不能只依赖上传页前端弹窗。
- `paper/default-paper` 上传模式必须关联 `paperId`，避免无关联试卷误落为普通照片诊断。
- 首页顶部增加全局「AI 用量」入口，多孩子家庭工作台也可进入账本页。
- 新增 `npm run test:e2e:ai-usage`，覆盖账单页、首页入口、上传授权检查和 `aiUsage` 云函数结构。

## 2. 自动化测试

| 命令 | 结果 |
| --- | --- |
| `npm run check` | 通过，217 个 JavaScript 文件 |
| `npm test` | 通过，636/636 |
| `git diff --check` | 通过 |
| `npm run test:e2e:doctor` | 通过，5/5 |
| `npm run test:e2e:ai-usage` | 通过，5/5 |
| `npm run test:e2e:all` | 通过，核心 23/23、数学数据 4/4、知识地图 10/10、语文 3/3、英语 7/7 |
| `npm run test:e2e:real-data` | 未执行：缺少 `REAL_DATA_STUDENT_ID` |

AI 用量专项 E2E 输出截图：

```text
tmp/e2e/ai-usage/bill-page.png
```

全量 E2E 聚合报告：

```text
tmp/e2e/aggregate/aggregate-report.md
```

## 3. 发布提醒

本轮涉及云函数和前端页面。体验版或真机验证前至少重新部署：

- `aiUsage`
- `uploadAndAnalyze`
- `analyzeBatch`
- `generatePaper`
- `learningResource`
- `englishVocabulary`

同时确认数据库集合和索引：

- `aiUsageEvents`: `_openid + createdAt`
- `dataDeletionRequests`: `_openid + createdAt`
- `userConsents`: `_openid + updatedAt`

## 4. 剩余风险

- `npm run test:e2e:ai-usage` 验证的是开发者工具环境和当前账号下的云函数结构；真实朋友账号仍需体验版成员实测一次完整上传、账单记录和删除请求。
- 真实云端冒烟需要先指定 `REAL_DATA_STUDENT_ID`；真实图片识别和真机体验版成员验证仍需按发布清单单独执行。
- 当前账单仍是“平台估算成本”，不代表应付款项；充值、扣费和余额系统仍未实现。

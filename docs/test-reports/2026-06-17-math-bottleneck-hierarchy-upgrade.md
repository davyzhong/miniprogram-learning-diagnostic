# 2026-06-17 数学学习卡点层级升级验收报告

## 背景

本轮把数学学习卡点从“平铺的细卡点列表”升级为“粗类 → 卡点家族 → 细卡点 → 知识节点”的层级体系，用于诊断报告展示、资源重学、验证试卷组卷和历史报告回填。

## 已完成内容

1. 新增数学卡点粗类和家族种子数据，所有细卡点均绑定 `categoryId/categoryTitle/familyId/familyTitle`。
2. 新增前端和云函数共享的层级归一化 helper。
3. `analyzePhotos` 学习地图 enrich 流程会为候选细卡点补齐粗类、家族、知识节点和资源字段。
4. 报告页和数学工作台按粗类/家族展示卡点，同时保留细卡点明细。
5. 验证试卷支持最多 60 个目标，并通过 `targetPlan.strategy = hierarchy_pages_v1` 把同类细卡点排入同一任务页。
6. 历史回填脚本输出 `hierarchyBackfilledCount / missingHierarchyCount`，历史重分析版本升级为 `math-full-reanalysis-v2.2-hierarchy`。
7. 系统文档补充 `generatePaper.targetPlan`、`verificationPack.pages`、`reports.bottlenecks[].candidateBottlenecks[]` 和历史重分析说明。

## 自动化验证

### 目标测试组合

命令：

```bash
node --test tests/math-bottleneck-hierarchy.test.js tests/math-learning-map-enricher.test.js tests/bottleneck-view.test.js tests/report-presenter.test.js tests/subject-home-presenter.test.js tests/verification-pack.test.js tests/generate-paper-pdf.test.js tests/math-history-reanalysis.test.js
```

结果：

- 61 个测试通过。

### JS 检查

命令：

```bash
npm run check
```

结果：

- 通过，检查 138 个 JavaScript 文件。

### 部署就绪检查

命令：

```bash
npm run check:deployment
```

结果：

- 10 个部署就绪测试通过。

### Diff 检查

命令：

```bash
git diff --check
```

结果：

- 通过。

## 云函数部署状态

尝试通过微信开发者工具 CLI 部署：

```bash
/Applications/wechatwebdevtools.app/Contents/MacOS/cli cloud functions deploy --env cloud1-d6gneg68m5a7a3876 --names analyzePhotos generatePaper reanalyzeMathHistory --remote-npm-install --project "/Users/qiming/Downloads/GoogleDrive/AI Learning/miniprogram-learning-diagnostic" --lang zh
```

结果：

- CLI 成功连接微信开发者工具。
- `analyzePhotos`、`generatePaper`、`reanalyzeMathHistory` 均在上传部署阶段失败。
- 微信云端签名接口返回：`getCloudAPISignedHeader failed`，`ret=41002`，`errmsg=system error`。

随后单独重试 `generatePaper`，仍返回同样错误。因此本轮状态为：代码已通过本地验证和部署就绪检查，但云函数实际部署被微信云端接口错误阻断，需要稍后在微信开发者工具中重试部署。

## 已知注意事项

1. 数学验证卷不再默认限制 5 个卡点，前端选择上限为 60 个目标，后端按任务包分页。
2. 批量打印后的每一页都有唯一 `pageCode`，后续照片回传可按页追踪验证证据。
3. 历史完整快照推荐走 `reanalyzeMathHistory.phase = aggregate`，生成一份当前完整数学诊断报告，而不是保留多份重复新版报告。
4. 本地直接执行 `node scripts/backfill-math-learning-map.js --dry-run` 需要 `wx-server-sdk` 或云函数环境；当前本机未安装该 SDK，云库 dry-run 未执行。

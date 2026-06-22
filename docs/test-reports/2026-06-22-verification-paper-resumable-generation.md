# 2026-06-22 验证卷短任务续跑测试报告

## 背景

真实数学数据中，一份验证卷可能覆盖 30+ 个细分学习卡点。此前即使按 2-8 个卡点分批，仍可能触发微信云函数 60 秒超时，导致验证卷长期停留在 `generating` 或最终 PDF 不完整。

本次改造把自动验证卷生成改为后端短任务续跑：

1. `analyzePhotos` 只创建 `generating` 试卷记录并回写报告关联。
2. `regenerateVerificationPaper?action=continue` 每次只推进 1 个未生成 BN。
3. 后端自动调度下一次 `continue`。
4. 全部目标生成后统一调用 `_regeneratePdf` 生成最终 PDF。

## 自动化测试

| 命令 | 结果 | 说明 |
| --- | --- | --- |
| `node --test tests/auto-verification.test.js` | PASS | 26 个用例通过，覆盖 1 BN/批、续跑、最终 PDF、无 OPENID 后端续跑 |
| `node --test tests/auto-verification.test.js tests/report-paper-feedback-loop.test.js tests/page-flows.test.js --test-name-pattern "verification\|验证卷\|断裂A\|断裂B"` | PASS | 131 个用例通过，覆盖报告入口、验证卷状态轮询、反馈链路 |
| `node --test tests/cloud-functions.test.js tests/verification-pack.test.js tests/generate-paper-pdf.test.js tests/auto-verification.test.js tests/report-paper-feedback-loop.test.js` | PASS | 85 个用例通过，覆盖云函数、PDF、验证任务包 |
| `npm run verify` | PASS | 578 个单元/页面/契约用例通过；`check-js` 检查 188 个 JS 文件通过 |
| `git diff --check` | PASS | 无空白错误 |

## 云函数部署

```bash
/Applications/wechatwebdevtools.app/Contents/MacOS/cli cloud functions deploy \
  --env cloud1-d6gneg68m5a7a3876 \
  --names analyzePhotos regenerateVerificationPaper \
  --remote-npm-install \
  --project "/Users/qiming/Downloads/GoogleDrive/AI Learning/miniprogram-learning-diagnostic" \
  --lang zh
```

结果：

| 云函数 | success | 文件数 | 包大小 |
| --- | --- | --- | --- |
| `analyzePhotos` | true | 12 | 29.9 KB |
| `regenerateVerificationPaper` | true | 4 | 5.2 KB |

## 微信开发者工具预览

```bash
/Applications/wechatwebdevtools.app/Contents/MacOS/cli preview \
  --project "/Users/qiming/Downloads/GoogleDrive/AI Learning/miniprogram-learning-diagnostic" \
  --qr-format terminal \
  --lang zh
```

结果：PASS，预览包体 `673.7 KB`。

## 结论

验证卷生成链路已经从“长时间单次/大批次生成”调整为“后端可续跑短任务”。当前自动化、云函数部署和小程序预览均通过。后续真实新诊断报告生成验证卷时，应观察 `papers.generationProgress.completedBatches` 是否按 BN 数逐步推进，并最终进入 `ready`。

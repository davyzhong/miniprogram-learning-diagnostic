# 2026-06-16 英语学科 DevTools 页面自动化测试

## 结论

通过。

本次为英语学科建立了独立的页面自动化测试用例库，并通过微信开发者工具 CLI + `miniprogram-automator` 跑通英语核心功能点。结果为 6/6 通过。

本轮体验优化后再次执行，结果仍为 6/6 通过。英语工作台已收敛为“今日建议 + 学习进度 + 继续练习”，词库维护不再作为常驻首页入口。

## 环境

- 日期：2026-06-16
- 工具：微信开发者工具 CLI + `miniprogram-automator`
- 项目：`miniprogram-learning-diagnostic`
- 测试数据：脚本内 mock 的钟青羽英语数据
- 输出目录：`tmp/english-devtools-e2e/`

## 执行命令

```bash
npm run test:devtools-english
```

## 页面结果

| 用例 | 功能 | 页面 | 结果 |
| --- | --- | --- | --- |
| ENG-WB-001 | 英语工作台展示个人词库和双任务入口 | `subject-home` | PASS |
| ENG-IMPORT-001 | 英语词库为空时自动导入 PEP 个人词库 | `subject-home` | PASS |
| ENG-FAM-001 | 单词熟悉度生成 20 词并提交一次 AI 判定 | `english-practice` | PASS |
| ENG-DICT-001 | 纸面听写生成 20 词、支持语音下一个并上传批改 | `english-dictation` | PASS |
| ENG-RECORD-001 | 学习记录展示英语熟悉度、纸面听写和听写纸证据 | `upload-history` | PASS |
| ENG-EMPTY-001 | 无词库时单词熟悉度页面给出可恢复空态 | `english-practice` | PASS |

## 本轮体验优化覆盖

- 英语工作台只保留一个主 CTA：`开始今日练习`。
- 系统根据熟悉度和拼写维度的薄弱/复测数量推荐“单词熟悉度”或“纸面听写”。
- 工具区不再重复当前主任务，只展示另一个练习入口和学习记录。
- 词库维护不再常驻首页，词库状态改为“词已准备”的低优先级说明。
- 单词熟悉度反馈改为儿童友好文案：熟了、需要再见几次、没听清。
- 纸面听写上传后展示“已批改”和正确/待加强/看不清数量。

## 本次发现并修复的问题

- 学习记录页在 `cleanupPreview === null` 时会抛错，导致英语学习记录无法展示。
- 已补充单元测试：`learning history state tolerates unavailable stale cleanup preview`。
- 已修复：`buildCleanupState` 对 `null` 进行安全兜底。

## 本地产物

- `tmp/english-devtools-e2e/results.json`
- `tmp/english-devtools-e2e/ENG-WB-001.png`
- `tmp/english-devtools-e2e/ENG-IMPORT-001.png`
- `tmp/english-devtools-e2e/ENG-FAM-001.png`
- `tmp/english-devtools-e2e/ENG-DICT-001.png`
- `tmp/english-devtools-e2e/ENG-RECORD-001.png`
- `tmp/english-devtools-e2e/ENG-EMPTY-001.png`

`tmp/` 已加入 `.gitignore`，截图和 JSON 结果不提交仓库。

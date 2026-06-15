# 2026-06-15 真实数据 DevTools 烟测记录

## 结论

通过。

本次跳过真实设备确认，改用微信开发者工具 + `miniprogram-automator` 对真实 CloudBase 数据进行页面级烟测。核心页面 3/3 通过。

## 环境

- 日期：2026-06-15
- 工具：微信开发者工具 CLI + `miniprogram-automator`
- 项目：`miniprogram-learning-diagnostic`
- 学生：钟青羽
- 输出目录：`tmp/real-data-smoke/`

## 执行命令

```bash
REAL_DATA_STUDENT_ID=<真实学生 ID，本地执行时填写> \
REAL_DATA_STUDENT_NAME=钟青羽 \
REAL_DATA_SMOKE_ROUTES=profile,bottlenecks,records \
npm run test:real-data-smoke
```

## 页面结果

| 页面 | 路由 | 结果 |
| --- | --- | --- |
| 学习档案 | `/pages/student-profile/student-profile` | PASS |
| 学习卡点中心 | `/pages/bottleneck-center/bottleneck-center` | PASS |
| 学习记录 | `/pages/upload-history/upload-history` | PASS |

## 本地产物

- `tmp/real-data-smoke/results.json`
- `tmp/real-data-smoke/profile.png`
- `tmp/real-data-smoke/bottlenecks.png`
- `tmp/real-data-smoke/records.png`

`tmp/` 已加入 `.gitignore`，截图和 JSON 结果不提交仓库。

## 备注

- 本次只验证页面能基于真实数据打开，不替代完整真机验收。
- 如果后续需要扩大范围，可以把 `REAL_DATA_SMOKE_ROUTES` 改为默认全量页面。

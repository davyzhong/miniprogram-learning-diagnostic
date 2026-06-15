# 2026-06-15 真实数据 DevTools 烟测记录

## 结论

通过。

本次跳过真实设备确认，改用微信开发者工具 + `miniprogram-automator` 对真实 CloudBase 数据进行页面级烟测。核心页面 3/3 通过。

2026-06-15 晚间在钟青羽新增大量真实试卷图片后复测，扩展为核心页面 6/6 通过。学习记录页已能读取到新增后的真实时间线数据，页面显示 `3 天 · 20 条主记录 · 9 份验证试卷 · 0 份验证反馈`，6 月 15 日当天显示 `9 条主记录`。

## 环境

- 日期：2026-06-15
- 工具：微信开发者工具 CLI + `miniprogram-automator`
- 项目：`miniprogram-learning-diagnostic`
- 学生：钟青羽
- 学生 ID：`966151a66a29599400006aca3e38ffaf`
- 输出目录：`tmp/real-data-smoke/`

## 执行命令

```bash
REAL_DATA_STUDENT_ID=<真实学生 ID，本地执行时填写> \
REAL_DATA_STUDENT_NAME=钟青羽 \
REAL_DATA_SMOKE_ROUTES=profile,bottlenecks,records \
npm run test:real-data-smoke
```

本轮复测使用全量默认页面：

```bash
REAL_DATA_STUDENT_ID=966151a66a29599400006aca3e38ffaf \
REAL_DATA_STUDENT_NAME=钟青羽 \
npm run test:real-data-smoke
```

## 页面结果

| 页面 | 路由 | 结果 | 耗时 |
| --- | --- | --- | --- |
| 首页 | `/pages/index/index` | PASS | 7.3s |
| 学习档案 | `/pages/student-profile/student-profile` | PASS | 5.9s |
| 数学工作台 | `/pages/subject-home/subject-home` | PASS | 5.6s |
| 学习卡点中心 | `/pages/bottleneck-center/bottleneck-center` | PASS | 5.8s |
| 学习记录 | `/pages/upload-history/upload-history` | PASS | 6.0s |
| 生成验证试卷 | `/pages/generate-verification/generate-verification` | PASS | 5.9s |

## 真实数据观察

- 学习档案：显示最近更新时间为 32 分钟前，最新数学诊断报告生成于 `2026年6月15日 19:53`。
- 最新诊断报告：共发现 `10 道相关错题`，主要卡点为 `计算基础`。
- 当前学习卡点：`3` 个待跟进、`3` 个持续出现、`0` 个已改善。
- 学习记录：显示 `3 天 · 20 条主记录 · 9 份验证试卷 · 0 份验证反馈`。
- 6 月 15 日学习记录：显示 `9 条主记录`，包含生成数学验证试卷、数学诊断报告和多张试卷照片记录。
- 学习卡点中心：显示 `计算基础`、`审题理解`、`应用建模` 三个数学卡点；卡点状态文案为“持续观察”，不再使用无意义的问号/感叹号图标。

## 本地产物

- `tmp/real-data-smoke/results.json`
- `tmp/real-data-smoke/home.png`
- `tmp/real-data-smoke/profile.png`
- `tmp/real-data-smoke/subjectMath.png`
- `tmp/real-data-smoke/bottlenecks.png`
- `tmp/real-data-smoke/records.png`
- `tmp/real-data-smoke/verification.png`

`tmp/` 已加入 `.gitignore`，截图和 JSON 结果不提交仓库。

## 备注

- 本次验证的是开发者工具中的真实 CloudBase 数据读取、页面渲染和基础可访问性，不替代完整真机验收。
- 本轮未直接做云数据库集合数量审计；若要精确统计 70-80 张图片对应的 `reports/papers/imageFiles` 分布，建议下一步补一个只读数据审计脚本或云函数。

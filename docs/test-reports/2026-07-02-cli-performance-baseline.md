# 2026-07-02 CLI 性能基线报告

## 1. 测试范围

本次使用微信开发者工具 CLI + `miniprogram-automator` 跑核心页面回归，并以脚本输出的 `durationMs` 建立性能基线。

| 项目 | 结果 |
| --- | --- |
| 命令 | `npm run test:e2e:doctor`、`npm run test:e2e:core` |
| 原始报告 | `tmp/e2e/core/report.json` |
| 测试环境 | DevTools，SDK 3.16.1，iPhone 12/13 (Pro) |
| 项目提交 | `acfa710`，当前工作区含页面加载性能优化改动 |
| 执行时间 | 2026-07-02 23:12 CST |

说明：`test:e2e:core` 每个页面包含固定等待与断言，因此这里的耗时是“CLI 自动化页面可用耗时”，不是纯渲染耗时。后续比较基线时应使用同一命令、同一 DevTools 环境和同一 mock 数据。

## 2. 汇总结果

| 指标 | 页面基线 | 跨页场景基线 |
| --- | ---: | ---: |
| 样本数 | 17 页 | 6 条场景 |
| 通过率 | 17/17 | 6/6 |
| 最小值 | 5,278 ms | 6,822 ms |
| 平均值 | 5,390 ms | 8,980 ms |
| P50 | 5,361 ms | 6,840 ms |
| P90 | 5,533 ms | 13,553 ms |
| P95 | 5,561 ms | 13,553 ms |
| 最大值 | 5,561 ms | 13,553 ms |

## 3. 页面耗时基线

| 页面 | 状态 | 耗时 |
| --- | --- | ---: |
| `index 首页/家庭工作台` | PASS | 5,296 ms |
| `student-profile 学生档案` | PASS | 5,502 ms |
| `add-student 添加学生` | PASS | 5,348 ms |
| `subject-home 数学学科工作台` | PASS | 5,396 ms |
| `upload 拍照上传` | PASS | 5,353 ms |
| `upload-history 学习记录` | PASS | 5,313 ms |
| `parent-management 家长管理` | PASS | 5,354 ms |
| `join-student 加入学生` | PASS | 5,533 ms |
| `report 诊断报告` | PASS | 5,442 ms |
| `bottleneck-center 卡点中心` | PASS | 5,454 ms |
| `bottleneck-detail 卡点详情` | PASS | 5,332 ms |
| `learning-resource 学习资源` | PASS | 5,311 ms |
| `english-practice 英语练习` | PASS | 5,408 ms |
| `english-dictation 英语听写` | PASS | 5,381 ms |
| `verification-paper-download 验证卷下载入口` | PASS | 5,361 ms |
| `default-paper 默认试卷` | PASS | 5,278 ms |
| `paper-preview 试卷预览` | PASS | 5,561 ms |

最慢页面：

1. `paper-preview 试卷预览`：5,561 ms
2. `join-student 加入学生`：5,533 ms
3. `student-profile 学生档案`：5,502 ms
4. `bottleneck-center 卡点中心`：5,454 ms
5. `report 诊断报告`：5,442 ms

## 4. 跨页场景耗时基线

| 场景 | 状态 | 耗时 |
| --- | --- | ---: |
| 家庭工作台 → 学生档案 → 家长管理 → 生成邀请 | PASS | 12,567 ms |
| 学科工作台 → 拍照 → 学习记录 → 默认试卷 | PASS | 13,553 ms |
| 卡点中心 → 筛选数学 → 卡点详情 | PASS | 7,271 ms |
| 学生档案 → 学习卡点行动 → 卡点中心 | PASS | 6,824 ms |
| 时间线 → 报告卡 → 报告详情 | PASS | 6,840 ms |
| 家长管理 → 生成邀请 → 验证邀请码显示 | PASS | 6,822 ms |

## 5. 回归阈值

后续性能回归建议以以下阈值作为 CI/人工判断线：

| 指标 | 通过阈值 | 预警阈值 |
| --- | ---: | ---: |
| 页面 P95 | ≤ 6,000 ms | > 6,000 ms |
| 页面最大值 | ≤ 6,200 ms | > 6,200 ms |
| 跨页场景 P95 | ≤ 14,500 ms | > 14,500 ms |
| 跨页场景最大值 | ≤ 14,500 ms | > 14,500 ms |
| CLI 通过率 | 100% | 任一失败 |
| 页面错误/console error | 0 | 任一真实错误 |

由于脚本包含固定等待，阈值应主要用于发现明显退化；如果要评估真实首屏渲染，需要补充页面内 `performance.now()` 埋点或 DevTools 性能面板采样。

## 6. 本次观察

- 核心页面耗时集中在 5.3-5.6 秒，说明脚本固定等待占主要部分；页面之间差异较小。
- 最慢的单页是 `paper-preview`，其次是 `join-student` 和 `student-profile`。
- 最慢的跨页链路是“学科工作台 → 拍照 → 学习记录 → 默认试卷”，主要因为包含多次页面跳转和等待。
- 本轮工作区已包含报告详情聚合、个人档案 fallback 并行、临时文件 URL 分批并行等页面加载优化；建议后续用同一命令复跑，观察 `student-profile`、`report`、`upload-history` 是否继续稳定在阈值内。

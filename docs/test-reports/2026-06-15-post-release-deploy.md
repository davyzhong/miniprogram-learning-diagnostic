# 2026-06-15 发布后部署与烟测记录

## 1. 部署范围

本次继续执行发布后变更，部署云函数：

| 云函数 | 环境 | 结果 |
| --- | --- | --- |
| `studentData` | `cloud1-d6gneg68m5a7a3876` | PASS |

部署命令：

```bash
/Applications/wechatwebdevtools.app/Contents/MacOS/cli cloud functions deploy \
  --env cloud1-d6gneg68m5a7a3876 \
  --names studentData \
  --remote-npm-install \
  --project "/Users/qiming/Downloads/GoogleDrive/AI Learning/miniprogram-learning-diagnostic" \
  --lang zh
```

部署结果：

- success: true
- filesCount: 3
- packSize: 3.7 KB

## 2. 客户端预览

```bash
/Applications/wechatwebdevtools.app/Contents/MacOS/cli preview \
  --project "/Users/qiming/Downloads/GoogleDrive/AI Learning/miniprogram-learning-diagnostic" \
  --qr-output terminal \
  --lang zh
```

结果：

- PASS
- 包体：516.7 KB

## 3. DevTools 自动化烟测

```bash
npm run test:devtools-parent-timeline
```

结果：

- PASS
- 18 / 18 场景通过
- exceptionCount: 0

覆盖页面和链路：

1. 家庭工作台
2. 学习档案
3. 家长管理和邀请
4. 扫码加入
5. 添加孩子
6. 学科选择
7. 数学工作台
8. 生成验证试卷
9. 学习卡点中心和详情
10. 学习记录时间线
11. 诊断报告
12. 验证反馈
13. 试卷预览
14. 照片预览

## 4. 本轮修正

`scripts/devtools-parent-timeline-e2e.js` 的云函数 mock 补充了 `studentData.cleanupStaleLearningRecords`。原因是学习记录页新增了中断记录 dry-run 预检，自动化脚本没有同步 mock 这个 action，导致时间线在烟测中进入空态。补齐 mock 后学习记录链路恢复。

## 5. 真实数据烟测状态

本机未配置 `REAL_DATA_STUDENT_ID`，因此本轮没有执行真实学生 ID 定位的 `npm run test:real-data-smoke`。拿到钟青羽真实学生 `_id` 后可继续执行：

```bash
REAL_DATA_STUDENT_ID=<真实学生ID> REAL_DATA_STUDENT_NAME=钟青羽 npm run test:real-data-smoke
```

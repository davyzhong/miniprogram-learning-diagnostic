# 部署与烟测手册

本文记录小程序本地验证、云函数部署和发布前烟测流程。目标是让每次改动都能按同一套步骤交付，避免漏部署云函数或只在本地测试通过。

## 1. 发布前检查

在项目根目录执行：

```bash
npm run check:deployment
npm run verify
git diff --check
```

`check:deployment` 会检查关键云函数是否具备：

- `package.json`
- `config.json`
- 合法 `timeout`
- 前端 `miniprogram/utils/cloud.js` 是否暴露对应调用封装

## 2. 必须部署的云函数

当前学习诊断链路依赖以下云函数：

| 云函数 | 作用 |
| --- | --- |
| `uploadAndAnalyze` | 创建报告记录并触发后台分析 |
| `analyzePhotos` | 分批分析试卷图片、合并报告、更新学习卡点 |
| `analyzeBatch` | 调用视觉 AI 分析单批图片 |
| `generatePaper` | 生成默认诊断试卷和验证试卷 PDF |
| `generateReportPDF` | 生成可下载诊断报告 PDF |
| `getAnalysisProgress` | 前端轮询分析任务进度 |
| `studentAccess` | 家庭成员、邀请、访问权限 |
| `studentData` | 访问感知的学生主页、学科、报告、试卷、学习记录聚合读取 |
| `reportFeedback` | 收集家长对报告、卡点、错题、照片的纠错反馈 |

## 3. 微信开发者工具部署步骤

使用微信开发者工具打开项目：

```bash
/Applications/wechatwebdevtools.app/Contents/MacOS/cli open \
  --project "/Users/qiming/Downloads/GoogleDrive/AI Learning/miniprogram-learning-diagnostic"
```

然后在开发者工具中逐个上传并部署上述云函数。建议部署顺序：

1. `studentAccess`
2. `studentData`
3. `reportFeedback`
4. `uploadAndAnalyze`
5. `analyzePhotos`
6. `analyzeBatch`
7. `generatePaper`
8. `generateReportPDF`
9. `getAnalysisProgress`

如果只改了单个云函数，可以只部署该函数；但涉及报告结构、卡点更新、反馈或访问权限时，优先部署相关函数组合，避免前后端结构不一致。

## 4. 预览构建

部署后使用微信开发者工具 CLI 做一次预览构建：

```bash
/Applications/wechatwebdevtools.app/Contents/MacOS/cli preview \
  --project "/Users/qiming/Downloads/GoogleDrive/AI Learning/miniprogram-learning-diagnostic" \
  --qr-output terminal \
  --lang zh
```

预览成功只说明客户端可构建，不代表云函数逻辑已经完成真实数据验收。

## 5. 最小烟测路径

跳过真实设备时，至少在微信开发者工具中用已有真实数据检查：

1. 首页能进入钟青羽学习档案。
2. 学习档案能展示最新报告摘要和学习卡点。
3. 点击最新报告能打开完整诊断报告。
4. 点击学习卡点中心能展示卡点列表。
5. 点击生成验证试卷能进入出卷页。
6. 学习记录能展示报告、试卷和反馈事件。

如果出现 `timeout`，查看 vConsole 中的错误上下文。现在前端会尽量显示类似：

```text
studentData:getStudentDashboard 请求超时，请稍后重试
```

这表示需要优先检查对应云函数、数据量或索引，而不是只看微信运行时的通用 `WAServiceMainContext timeout`。

## 6. 常见问题

### 页面显示空白或“页面不存在”

先确认 `app.json` 中页面已注册，然后重新编译小程序。

### 报告页信息大量缺失

优先确认 `studentData` 已部署。报告页会在聚合读取失败时回退到直接读取报告，但权限、关联试卷和反馈信息仍依赖相关云函数。

### 学习卡点中心超时

学习卡点中心会先读 `studentData:getStudentDashboard`，失败后回退到 `subjectProfiles`。如果仍然为空，需要检查：

- 该学生是否有 `subjectProfiles`
- 学科档案里是否存在 `currentBottlenecks`
- 当前账号是否有访问该学生的权限

### 反馈提交失败

确认 `reportFeedback` 已部署，并且云数据库中允许云函数创建或读写 `reportFeedback` 集合。该集合缺失时，云函数会尝试自动创建。

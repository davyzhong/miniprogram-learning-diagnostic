# 部署与烟测手册

> 更新日期：2026-07-18

本文记录小程序本地验证、14 个业务云函数的部署和发布前烟测流程。目标是让每次改动都能按同一套步骤交付，避免漏部署云函数或只在本地测试通过。

完整发布门禁、回滚步骤和发布记录模板见 [RELEASE_CHECKLIST.md](./RELEASE_CHECKLIST.md)。

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
- `database/indexes.json` 是否声明代码依赖的数据库索引

部署前还必须在云控制台确认清单内索引已进入“正常”状态，再执行：

```bash
CLOUDBASE_INDEXES_VERIFIED=1 npm run predeploy:check
```

不要在索引仍处于创建中或失败状态时设置 `CLOUDBASE_INDEXES_VERIFIED`。

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
| `englishVocabulary` | 英语个人词库、20 词听写、AI 判定和掌握度更新 |
| `learningResource` | 数学学习卡点任务包生成、读取、完成和验证安排 |
| `regenerateVerificationPaper` | 自动验证卷短任务续跑和 PDF 最终生成 |
| `reanalyzeMathHistory` | 历史数学报告重算维护工具 |
| `aiUsage` | 体验版内测授权、AI 用量账本、成本估算和删除请求 |

## 3. 微信开发者工具部署步骤

使用微信开发者工具打开项目：

```bash
/Applications/wechatwebdevtools.app/Contents/MacOS/cli open \
  --project "/Users/qiming/Downloads/GoogleDrive/AI Learning/miniprogram-learning-diagnostic"
```

先按第 4 节创建数据库索引并等待生效，再在开发者工具中逐个上传并部署上述云函数。建议部署顺序：

1. `studentAccess`
2. `studentData`
3. `reportFeedback`
4. `englishVocabulary`
5. `learningResource`
6. `aiUsage`
7. `uploadAndAnalyze`
8. `analyzePhotos`
9. `analyzeBatch`
10. `generatePaper`
11. `regenerateVerificationPaper`
12. `generateReportPDF`
13. `getAnalysisProgress`
14. `reanalyzeMathHistory`

如果只改了单个云函数，可以只部署该函数；但涉及报告结构、卡点更新、反馈或访问权限时，优先部署相关函数组合，避免前后端结构不一致。

AI 用量账本相关改动需要同步部署 `aiUsage`、`analyzeBatch`、`generatePaper`、`learningResource`、`englishVocabulary`；这些函数内的 `pricing.js` 与 `usage-ledger.js` 是部署自包含副本，必须保持一致。

## 4. 数据库索引

首次部署或新增集合后，需要在云开发控制台为热查询创建复合索引。完整索引清单见 [SETUP.md 第五章「数据库索引」](../SETUP.md#数据库索引)，设计说明见 [DATA_DICTIONARY.md §4](./DATA_DICTIONARY.md#4-索引设计说明)。

最关键的几个索引（缺了会全表扫描，列表页变慢）：

| 集合 | 索引字段 | 排序 |
| --- | --- | --- |
| `reports` | `studentId`, `subject`, `createdAt`, `_openid` | 升序、升序、降序、升序 |
| `analysisTasks` | `reportId`, `createdAt` | 升序、降序 |
| `papers` | `studentId`, `subject`, `type`, `grade`, `paperKey`, `_openid` | 全部升序 |
| `learningResourcePacks` | `studentId`, `subject`, `updatedAt`, `_openid` | 升序、升序、降序、升序 |
| `studentEnglishWords` | `studentId`, `masteryStatus`, `nextReviewAt` | 升序、升序、升序 |
| `aiUsageEvents` | `_openid`, `createdAt` | 升序、降序 |
| `dataDeletionRequests` | `_openid`, `createdAt` | 升序、降序 |
| `userConsents` | `_openid`, `updatedAt` | 升序、降序 |

操作路径：`云开发控制台 → 数据库 → 对应集合 → 索引管理 → 新建索引`。开发者工具中 `cloud://createindex` 链接经常超时，直接到控制台手动建更可靠。创建后通常需等待几十秒到数分钟生效。

> 注：`subjectProfiles` 仅按 `studentId` 查询后内存筛选 `subject`（每个学生最多 3 条），用 `studentId + _openid` 索引即可，不需要三字段复合索引。`analysisTasks` 的进度轮询按 `reportId` 过滤并按 `createdAt` 倒序，因此必须先建立清单中的复合索引，再部署新版 `getAnalysisProgress` 和 `analyzePhotos`。

## 5. 预览构建

部署后使用微信开发者工具 CLI 做一次预览构建：

```bash
/Applications/wechatwebdevtools.app/Contents/MacOS/cli preview \
  --project "/Users/qiming/Downloads/GoogleDrive/AI Learning/miniprogram-learning-diagnostic" \
  --qr-output terminal \
  --lang zh
```

预览成功只说明客户端可构建，不代表云函数逻辑已经完成真实数据验收。

## 6. 数学累计错题历史回填

先部署最新的 `reanalyzeMathHistory`，并在云函数环境变量中配置 `MATH_REANALYSIS_TOKEN`。回填默认只预览，不写数据。

在微信开发者工具控制台执行 dry-run：

```js
wx.cloud.callFunction({
  name: 'reanalyzeMathHistory',
  data: {
    phase: 'backfillCumulativeErrors',
    apply: false,
    studentId: '<可选：单个学生 ID>',
    limit: 1000,
    reanalysisToken: '<MATH_REANALYSIS_TOKEN>'
  }
}).then(console.log)
```

确认 `proposals` 中替代报告没有重复计数、累计错题数合理后，将 `apply` 改为 `true`。应用完成后再次执行相同 dry-run：

```js
wx.cloud.callFunction({
  name: 'reanalyzeMathHistory',
  data: {
    phase: 'backfillCumulativeErrors',
    apply: false,
    limit: 1000,
    reanalysisToken: '<MATH_REANALYSIS_TOKEN>'
  }
}).then(({ result }) => console.log(result.proposedChangeCount))
```

预期 `proposedChangeCount` 为 `0`，证明同版本回填幂等。回填失败不能阻断报告展示；旧档案会继续隐藏缺失的累计错题指标。

## 7. 最小烟测路径

跳过真实设备时，至少在微信开发者工具中用已有真实数据检查：

1. 首页能进入钟青羽学习档案。
2. 学习档案能展示最新报告摘要和学习卡点。
3. 点击最新报告能打开完整诊断报告。
4. 点击学习卡点中心能展示卡点列表。
5. 点击生成验证试卷能进入出卷页。
6. 学习记录能展示报告、试卷和反馈事件。
7. 英语工作台在无词库时能导入钟青羽 PEP 个人词库；导入后能展示个人词库统计，并能进入 20 词听写页。
8. 英语听写页能基于 `studentEnglishWords` 生成单词队列；真机上麦克风/语音识别不可用时有可读降级提示。
9. AI 用量页能打开，显示“内测成本估算”提示；首页顶部有「AI 用量」入口。
10. 上传页在未同意内测授权时完成授权检查并阻止真实上传；同意后 `uploadAndAnalyze` 服务端允许继续。

如果出现 `timeout`，查看 vConsole 中的错误上下文。现在前端会尽量显示类似：

```text
studentData:getStudentDashboard 请求超时，请稍后重试
```

这表示需要优先检查对应云函数、数据量或索引，而不是只看微信运行时的通用 `WAServiceMainContext timeout`。

## 8. 常见问题

### 页面显示空白或“页面不存在”

先确认 `app.json` 中页面已注册，然后重新编译小程序。

如果控制台出现：

```text
onPageNotFound error: page "" is not found
```

这通常不是业务页面丢失，而是微信开发者工具的本机私有启动配置为空。检查被 Git 忽略的 `project.private.config.json`，确保 `condition.miniprogram.list` 至少包含首页：

```json
{
  "condition": {
    "miniprogram": {
      "list": [
        {
          "name": "首页",
          "pathName": "pages/index/index",
          "query": "",
          "launchMode": "default"
        }
      ]
    }
  }
}
```

修复后清理编译缓存并重新预览：

```bash
/Applications/wechatwebdevtools.app/Contents/MacOS/cli cache --clean compile --project "/Users/qiming/Downloads/GoogleDrive/AI Learning/miniprogram-learning-diagnostic"
/Applications/wechatwebdevtools.app/Contents/MacOS/cli preview --project "/Users/qiming/Downloads/GoogleDrive/AI Learning/miniprogram-learning-diagnostic" --qr-output terminal --lang zh
```

### 报告页信息大量缺失

优先确认 `studentData` 已部署。报告页会在聚合读取失败时回退到直接读取报告，但权限、关联试卷和反馈信息仍依赖相关云函数。

### 学习卡点中心超时

学习卡点中心会先读 `studentData:getStudentDashboard`，失败后回退到 `subjectProfiles`。如果仍然为空，需要检查：

- 该学生是否有 `subjectProfiles`
- 学科档案里是否存在 `currentBottlenecks`
- 当前账号是否有访问该学生的权限

### 反馈提交失败

确认 `reportFeedback` 已部署，并且云数据库中允许云函数创建或读写 `reportFeedback` 集合。该集合缺失时，云函数会尝试自动创建。

### 英语单词熟悉度无法语音识别

英语单词熟悉度页面会优先尝试调用“微信同声传译”插件；如果插件授权、版本或当前环境不支持，页面会显示“语音插件暂不可用”或“当前环境暂不支持语音识别”的降级提示。

当前代码已在 `miniprogram/app.json` 中声明该插件：

```json
"plugins": {
  "WechatSI": {
    "version": "0.3.5",
    "provider": "wx069ba97219f66d99"
  }
}
```

如果开发者工具预览提示 `插件未授权使用`，请重新确认小程序后台的插件管理中已添加“微信同声传译”，并检查授权的小程序 AppID 是否与 `project.config.json` 中的 AppID 一致。正式发布前，还需要在小程序隐私保护指引中声明麦克风用途。

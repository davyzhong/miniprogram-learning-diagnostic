# Skill 与 CLI 设计文档

> 本文档记录学习诊断 MVP 的能力抽象与自动化命令建设。P0 能力内核已经落地，当前目标是继续把已跑通的小程序闭环沉淀为可复用、可测试、可批量执行的 Skill 与 CLI 能力。

## 1. 背景

当前产品已经形成清晰的学习诊断闭环：

```text
上传试卷照片
→ OCR / AI 识别
→ 生成诊断报告
→ 提取学习卡点
→ 更新孩子学科档案
→ 生成验证试卷
→ 打印作答
→ 上传验证卷
→ 分析验证结果
→ 更新学习卡点状态
→ 形成学习时间线
```

这条链路目前主要通过微信小程序页面、前端工具函数和云函数组合完成。随着项目进入多孩子、多学科、批量试卷验证阶段，仅靠页面交互会遇到几个问题：

- 大批量试卷需要自动化处理，不能只依赖手动点击。
- 核心能力散落在页面和云函数之间，后续复用成本高。
- 诊断、报告、验证卷、学习卡点追踪需要独立测试和回放。
- 未来可能需要被小程序、CLI、后台任务、AI Agent 共同调用。

因此，项目已经先完成 P0“学习诊断能力内核”，后续继续把家庭工作台、导出、批量处理和清理监控能力纳入同一套 Skill / CLI 体系。

## 2. 基本定义

### 2.1 Skill

Skill 指一个稳定的领域能力单元，具备清晰输入、输出、错误处理和测试边界。

Skill 不关心页面展示，不处理 WXML，也不直接管理按钮交互。它只回答一个问题：

```text
给定明确输入，如何完成一个学习诊断领域动作，并返回可被不同端消费的结果？
```

例如：

- 上传照片后启动诊断。
- 根据诊断结果生成报告。
- 根据学习卡点生成验证试卷。
- 上传验证卷后判断学习卡点是否改善。

### 2.2 CLI

CLI 指面向开发者、运营和测试的命令行入口。

CLI 的价值不是替代小程序，而是提供以下能力：

- 批量处理上百张历史试卷。
- 快速回放完整诊断闭环。
- 生成测试数据和验证报告。
- 在没有小程序 UI 的情况下调用同一套能力。
- 为未来 CI、自动化验收和数据迁移提供入口。

### 2.3 页面、Skill、CLI 的边界

| 层级 | 职责 | 不应承担 |
| --- | --- | --- |
| 页面 | 展示、交互、跳转、状态反馈 | 复杂领域规则 |
| Skill | 诊断、报告、卡点、试卷、时间线等领域能力 | 页面布局、按钮状态 |
| CLI | 批量调用、自动化回放、测试辅助 | 小程序视觉体验 |
| 云函数 | 权限校验、数据库读写、AI 调用、文件生成 | 页面表现逻辑 |

核心原则：

```text
页面调用 Skill。
CLI 调用 Skill。
Skill 调用云函数或本地适配器。
云函数执行受权限保护的数据与 AI 操作。
```

## 3. 当前能力盘点

### 3.1 已经具备后端基础的能力

| 能力 | 当前主要实现 | 可抽象程度 |
| --- | --- | --- |
| 上传并启动诊断 | `uploadAndAnalyze` | 高 |
| AI 图片分析 | `analyzePhotos`、`analyzeBatch` | 高 |
| 分析进度查询 | `getAnalysisProgress` | 高 |
| 诊断报告详情 | `studentData.getReportDetail`、`report-presenter` | 高 |
| 报告 PDF 导出 | `generateReportPDF` | 高 |
| 验证试卷生成 | `generatePaper` | 高 |
| 试卷详情 | `studentData.getPaperDetail`、`paper-preview-presenter` | 高 |
| 学习卡点追踪 | `subjectProfiles`、`profile-summary`、`bottleneck-view` | 高 |
| 学习记录时间线 | `studentData.getLearningTimeline`、`learning-records` | 高 |
| 家长访问权限 | `studentAccess`、`_shared/access.js` | 高 |

### 3.2 仍偏页面交互的能力

| 能力 | 当前位置 | 是否适合抽成 Skill |
| --- | --- | --- |
| 首页工作台展示 | `index`、`index-presenter` | 部分适合，作为 dashboard presenter |
| 孩子学习档案展示 | `student-profile` | 部分适合，作为 student profile presenter |
| 学科主页展示 | `subject-home` | 部分适合，作为 subject dashboard presenter |
| 验证卷页面交互 | `paper-preview` | 领域数据适合，交互不适合 |
| 家长管理页面 | `parent-management` | 数据操作适合，页面交互不适合 |

### 3.3 不建议抽成 Skill 的内容

以下内容应继续留在页面或 UI 工具层：

- WXML / WXSS 布局。
- 页面跳转。
- tab、筛选、折叠状态。
- 按钮 loading、toast、modal。
- 小程序分享卡片文案。
- 视觉元素、图标、插图和卡片样式。

## 4. Skill 分层设计

建议分为三层：

```text
Domain Skill
    ↓
Service Adapter
    ↓
Runtime Adapter
```

### 4.1 Domain Skill

领域能力的主入口，定义稳定输入输出。

示例：

```text
diagnose-from-upload
generate-verification-paper
evaluate-verification-submission
```

### 4.2 Service Adapter

负责把领域调用转换为具体运行环境调用。

小程序内：

```text
Skill → miniprogram/utils/cloud.js → wx.cloud.callFunction
```

CLI 内：

```text
Skill → cli/adapters/fixture.js / cloudbase.js → 本地 fixture / CloudBase SDK
```

### 4.3 Runtime Adapter

处理不同运行环境差异。

| 运行环境 | 适配内容 |
| --- | --- |
| 微信小程序 | `wx.cloud`、页面路由、本地临时文件 |
| Node CLI | CloudBase SDK、文件系统、命令行参数 |
| 测试环境 | fixtures、mock cloud、内存数据库 |

## 5. P0 Skill 设计

P0 是学习诊断闭环的最小完整能力集合，当前已通过 `services/skills/index.js`、`cli/ldx.js`、`tests/skills-p0.test.js` 和 `tests/cli-p0.test.js` 实现并纳入默认测试。

### 5.1 `diagnose-from-upload`

**目标**

上传试卷照片后，创建诊断报告并启动异步 AI 分析。

**输入**

```js
{
  studentId: 'stu_xxx',
  subject: 'math',
  mode: 'diagnosis',
  fileIds: ['cloud://...'],
  imageMetas: [
    { fileName: '20260612-数学-1.jpg', fileSize: 102400 }
  ]
}
```

**输出**

```js
{
  reportId: 'report_xxx',
  status: 'analyzing',
  taskId: 'task_xxx',
  estimatedSeconds: 120
}
```

**当前映射**

- `uploadAndAnalyze`
- `analyzePhotos`
- `getAnalysisProgress`

**CLI**

```bash
ldx upload photos --student <studentId> --subject math --files ./photos/*.jpg
ldx analyze status --report <reportId>
```

### 5.2 `generate-diagnostic-report`

**目标**

读取诊断结果，生成适合页面、Markdown、JSON 或 PDF 使用的报告模型。

**输入**

```js
{
  reportId: 'report_xxx',
  format: 'json'
}
```

**输出**

```js
{
  reportId: 'report_xxx',
  type: 'diagnosis',
  summary: '本次发现 2 个主要学习卡点...',
  bottlenecks: [],
  evidence: [],
  nextActions: []
}
```

**当前映射**

- `studentData.getReportDetail`
- `report-presenter`
- `generateReportPDF`

**CLI**

```bash
ldx report show --report <reportId>
ldx report pdf --report <reportId> --out ./report.pdf
```

### 5.3 `track-bottlenecks`

**目标**

维护学生在某学科下的学习卡点列表、权重、状态、趋势和证据链。

**输入**

```js
{
  studentId: 'stu_xxx',
  subject: 'math',
  reportId: 'report_xxx'
}
```

**输出**

```js
{
  studentId: 'stu_xxx',
  subject: 'math',
  active: [
    {
      code: 'LP-008',
      name: '审题理解',
      weight: 80,
      status: 'needs_verification',
      evidenceCount: 5
    }
  ],
  improved: [],
  pending: []
}
```

**当前映射**

- `subjectProfiles`
- `cloudfunctions/analyzePhotos/profile-summary.js`
- `miniprogram/utils/bottleneck-view.js`
- `miniprogram/utils/bottleneck-name.js`

**CLI**

```bash
ldx bottleneck list --student <studentId> --subject math
ldx bottleneck detail --student <studentId> --subject math --code LP-008
```

### 5.4 `generate-verification-paper`

**目标**

根据学习卡点生成可打印的 A4 验证试卷，包含学生卷和答案页，并生成唯一试卷编号。

**输入**

```js
{
  studentId: 'stu_xxx',
  subject: 'math',
  bottleneckTargets: ['LP-001', 'LP-008'],
  questionCountPerTarget: 5,
  questionMix: '3 core verification + 2 transfer extension',
  paperDate: '2026-06-14'
}
```

**输出**

```js
{
  paperId: 'paper_xxx',
  paperDisplayCode: '数学-20260614-01',
  pdfFileId: 'cloud://...',
  questionCount: 10,
  studentPages: 1,
  answerPages: 1,
  totalPages: 2,
  bottleneckSummaries: ['计算基础', '审题理解']
}
```

**当前映射**

- `generatePaper`
- `paper-display`
- `paper-preview-presenter`

**CLI**

```bash
ldx paper generate --student <studentId> --subject math --targets LP-001,LP-008 --out ./paper.pdf
```

### 5.5 `evaluate-verification-submission`

**目标**

上传已作答验证卷照片后，对照验证卷进行分析，判断学习卡点是否改善，并更新学习档案。

**输入**

```js
{
  studentId: 'stu_xxx',
  subject: 'math',
  paperId: 'paper_xxx',
  answerPhotoFileIds: ['cloud://...'],
  submittedAt: '2026-06-14T10:00:00.000Z'
}
```

**输出**

```js
{
  reportId: 'report_xxx',
  paperDisplayCode: '数学-20260614-01',
  improvedBottlenecks: ['计算基础'],
  persistingBottlenecks: ['审题理解'],
  nextActions: [
    '继续观察审题理解',
    '一周后再次生成验证卷'
  ]
}
```

**当前映射**

- `uploadAndAnalyze` with `mode='verification'`
- `analyzePhotos`
- `verification-evidence`
- `comparison`
- `profile-summary`

**CLI**

```bash
ldx verification upload --paper <paperId> --files ./answers/*.jpg
ldx verification status --report <reportId>
```

### 5.6 `build-learning-timeline`

**目标**

从报告、试卷、上传记录中派生统一学习时间线，不新增独立事件表。

**输入**

```js
{
  studentId: 'stu_xxx',
  subject: 'math',
  filter: 'all'
}
```

**输出**

```js
{
  studentId: 'stu_xxx',
  items: [
    {
      type: 'report',
      title: '数学诊断报告',
      occurredAt: '2026-06-14T09:30:00.000Z',
      summary: '发现计算基础、审题理解两个学习卡点',
      url: '/pages/report/report?id=report_xxx'
    }
  ]
}
```

**当前映射**

- `studentData.getLearningTimeline`
- `learning-records`
- `traceable-actions`

**CLI**

```bash
ldx timeline show --student <studentId>
ldx timeline show --student <studentId> --subject math --since 2026-06-01
```

## 6. P1 Skill 设计

P1 是多孩子、多家长、多页面透出所需要的扩展能力。

### 6.1 `build-student-profile`

生成单个孩子学习档案的数据模型。

当前映射：

- `student-profile`
- `child-workbench`
- `index-presenter`
- `studentData.getStudentDashboard`

CLI：

```bash
ldx student profile --student <studentId>
```

### 6.2 `build-family-workbench`

生成多孩子家庭工作台。

当前映射：

- `index`
- `studentAccess.getAccessibleStudents`
- `child-workbench`

CLI：

```bash
ldx family dashboard
```

### 6.3 `manage-family-access`

管理孩子档案的共同家长权限。

当前映射：

- `studentAccess`
- `parent-management`
- `join-student`

CLI：

```bash
ldx family members --student <studentId>
ldx family invite --student <studentId> --relation 妈妈
ldx family revoke --student <studentId> --member <memberOpenId>
```

### 6.4 `export-learning-assets`

统一导出报告、试卷、答案页和学习记录。

当前映射：

- `generateReportPDF`
- `generatePaper`
- `wx.cloud.downloadFile`

CLI：

```bash
ldx export report --report <reportId> --out ./report.pdf
ldx export paper --paper <paperId> --out ./paper.pdf
ldx export timeline --student <studentId> --out ./timeline.md
```

## 7. P2 Skill 设计

P2 是效率、清理、质量和规模化能力。

### 7.1 `batch-diagnose`

批量导入历史试卷并按目录、文件名或配置文件分组。

CLI：

```bash
ldx batch diagnose --student <studentId> --subject math --dir ./202606/
ldx batch diagnose --config ./batch.json
```

### 7.2 `cleanup-stale-records`

清理或归档长期卡住、失败、无效的分析记录。

CLI：

```bash
ldx cleanup stale-analysis --before 2026-06-14 --dry-run
ldx cleanup stale-analysis --before 2026-06-14 --apply
```

### 7.3 `photo-dedup-check`

识别疑似重复上传照片。

CLI：

```bash
ldx photos dedup --student <studentId> --subject math
```

### 7.4 `progress-monitor`

监控异步诊断任务，输出卡住、失败、完成的任务列表。

CLI：

```bash
ldx analyze monitor --student <studentId>
```

### 7.5 `run-e2e-flow`

执行端到端回归测试。

CLI：

```bash
ldx test flow diagnosis
ldx test flow verification
ldx test flow family-access
```

## 8. CLI 设计

### 8.1 命令名称

推荐使用短命令：

```bash
ldx
```

含义：

```text
Learning Diagnostic Experience
```

长命令可以作为别名：

```bash
learning-diagnostic
```

### 8.2 命令分组

```text
ldx student      孩子档案
ldx family       家庭与共同家长
ldx upload       上传照片
ldx analyze      诊断任务
ldx report       诊断报告
ldx bottleneck   学习卡点
ldx paper        试卷生成与查看
ldx verification 验证卷反馈
ldx timeline     学习时间线
ldx export       文件导出
ldx batch        批量处理
ldx cleanup      数据清理
ldx test         自动化验收
```

### 8.3 通用参数

| 参数 | 说明 |
| --- | --- |
| `--env` | 云开发环境 ID |
| `--student` | 学生 ID 或名称 |
| `--subject` | `math / chinese / english` |
| `--format` | `json / markdown / text` |
| `--out` | 输出文件路径 |
| `--dry-run` | 只预览，不写入 |
| `--verbose` | 输出详细日志 |

### 8.4 输出格式

默认输出人类可读文本。

当指定 `--format json` 时，输出可被脚本处理的 JSON。

```bash
ldx report show --report report_xxx --format json
```

### 8.5 错误码约定

| 退出码 | 含义 |
| --- | --- |
| `0` | 成功 |
| `1` | 参数错误 |
| `2` | 权限错误 |
| `3` | 远程调用失败 |
| `4` | AI 分析失败 |
| `5` | 文件读写失败 |
| `6` | 数据不存在 |
| `7` | 测试失败 |

## 9. 数据与权限原则

### 9.1 权限

CLI 不能绕过现有权限模型。

所有涉及学生数据的操作必须复用云函数权限校验：

- owner 可以管理家庭成员。
- owner / viewer 都可以参与学习诊断相关流程。
- viewer 不能邀请或移除家长。

### 9.2 数据源

Skill 不新增数据库集合，除非有明确必要。

第一阶段继续复用：

- `students`
- `studentMembers`
- `studentInvites`
- `subjectProfiles`
- `reports`
- `papers`
- `analysisTasks`

### 9.3 时间线

学习时间线继续采用派生模式：

```text
reports + papers + upload evidence → timeline items
```

不新增 `learningEvents` 集合。

### 9.4 学习卡点命名

Skill 和 CLI 默认展示文字摘要，不直接向用户暴露 LP 编号。

优先级：

1. AI 或报告中的 `summary / name / title`
2. 本地统一字典
3. 原始文本摘要
4. 最后才 fallback 到 LP 编号

## 10. 推荐目录结构

后续实现时建议增加：

```text
miniprogram-learning-diagnostic/
  services/
    skills/
      diagnose-from-upload.js
      diagnostic-report.js
      bottleneck-tracking.js
      verification-paper.js
      verification-submission.js
      learning-timeline.js
      family-access.js
      dashboard.js
    adapters/
      wechat-cloud.js
      local-fixture.js
  cli/
    ldx.js
    commands/
      student.js
      family.js
      upload.js
      analyze.js
      report.js
      bottleneck.js
      paper.js
      verification.js
      timeline.js
      batch.js
      cleanup.js
  tests/
    skills/
    cli/
```

说明：

- `services/skills` 放可复用领域能力。
- `services/adapters` 隔离微信云、小程序和本地测试差异。
- `cli` 只负责参数解析、调用 skill、格式化输出。
- 小程序页面后续可以逐步改为调用同一套 skill。

## 11. 测试策略

### 11.1 Skill 单元测试

每个 P0 skill 至少覆盖：

- 正常输入。
- 缺少必填字段。
- 权限失败。
- 数据不存在。
- 异步任务失败。
- 输出结构稳定。

### 11.2 CLI 合同测试

每个 CLI command 至少覆盖：

- 参数解析正确。
- 缺少参数时返回非 0。
- `--format json` 输出合法 JSON。
- `--dry-run` 不写入。
- 远程失败时错误信息可读。

### 11.3 端到端测试

P0 完成后需要覆盖三条核心链路：

```text
诊断链路：
上传照片 → 生成报告 → 查看卡点

验证链路：
生成验证卷 → 上传作答 → 生成验证反馈

时间线链路：
报告、试卷、验证反馈按时间正确出现
```

### 11.4 默认验证命令

最终目标是把 Skill 和 CLI 测试纳入：

```bash
npm run verify
```

避免出现“功能能跑，但自动化测试没覆盖”的情况。

## 12. 实施优先级

### P0：诊断闭环能力内核

状态：基础版已实现。

已落地内容：

- `services/skills/index.js`
- `cli/ldx.js`
- `cli/adapters/fixture.js`
- `tests/skills-p0.test.js`
- `tests/cli-p0.test.js`
- P0 测试已纳入 `npm test`

目标：

```text
让诊断、报告、学习卡点、验证卷、验证反馈、时间线都可以脱离页面被调用。
```

完成项：

1. 已建立 `services/skills` 基础结构。
2. 已抽象 `diagnose-from-upload`。
3. 已抽象 `generate-diagnostic-report`。
4. 已抽象 `track-bottlenecks`。
5. 已抽象 `generate-verification-paper`。
6. 已抽象 `evaluate-verification-submission`。
7. 已抽象 `build-learning-timeline`。
8. 已建立 CLI 基础入口 `ldx`。
9. 已实现 P0 CLI 命令。
10. 已补齐 P0 skill 与 CLI 测试。

### P1：多孩子、多家长、导出能力

目标：

```text
让家庭工作台、孩子档案、共同家长、报告导出和试卷导出也可以被统一能力层支撑。
```

任务：

1. 抽象 `build-student-profile`。
2. 抽象 `build-family-workbench`。
3. 抽象 `manage-family-access`。
4. 抽象 `export-learning-assets`。
5. 实现对应 CLI 命令。
6. 补齐家庭权限和多孩子测试。

### P2：批量处理、清理、监控、回归

目标：

```text
支持真实大规模试卷导入、脏数据清理和自动化验收。
```

任务：

1. 实现 `batch-diagnose`。
2. 实现 `cleanup-stale-records`。
3. 实现 `photo-dedup-check`。
4. 实现 `progress-monitor`。
5. 实现 `run-e2e-flow`。
6. 将关键流程接入默认验证命令。

## 13. 成功标准

P0 已满足：

- 小程序现有功能不回退。
- CLI 可以启动一次诊断，并查询报告结果。
- CLI 可以生成一份验证试卷。
- CLI 可以上传验证卷作答照片并得到反馈报告。
- CLI 可以查看某个孩子的学习卡点和学习时间线。
- 所有新增能力都有自动化测试。
- `npm run verify` 全部通过。

P1 完成时，应满足：

- 多孩子家庭工作台和单孩子档案由统一能力支撑。
- owner / viewer 权限在 CLI 和小程序中一致。
- 报告和试卷可以通过 CLI 导出。

P2 完成时，应满足：

- 可以批量处理历史试卷目录。
- 可以清理中断、失败和长期卡住的分析记录。
- 可以自动回放主要端到端流程。

## 14. 总结

当前项目已经从“一个微信小程序”演化成了“学习诊断能力系统”。

下一阶段的关键不是继续堆页面，而是把已经验证过的闭环沉淀成稳定能力：

```text
诊断 Skill
报告 Skill
学习卡点 Skill
验证卷 Skill
验证反馈 Skill
时间线 Skill
家庭权限 Skill
```

这些 Skill 会成为小程序、CLI、自动化测试和未来 AI Agent 的共同基础。

下一步建议从 P1 / P2 继续推进：让多孩子家庭工作台、共同家长、导出、批量历史试卷处理、脏数据清理和进度监控逐步复用同一套能力内核。

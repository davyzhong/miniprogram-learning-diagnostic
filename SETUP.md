# 部署指南（SETUP）

## 一、云开发环境配置

### 1. 开通云开发
1. 打开微信开发者工具
2. 进入项目：`miniprogram-learning-diagnostic`
3. 点击顶部「云开发」按钮
4. 按指引开通（选择「免费版」即可）
5. 开通后，记录「环境 ID」（如：`cloud1-xxxxx`）

### 2. 配置 project.config.json
打开 `project.config.json`，确认以下字段存在：
```json
{
  "miniprogramRoot": "miniprogram/",
  "cloudfunctionRoot": "cloudfunctions/",
  "appid": "wxfd705adf17992394",
  "projectname": "learning-diagnostic"
}
```

如果云开发环境 ID 需要配置，在 `project.config.json` 里增加：
```json
{
  "cloudbaseRoot": "cloud1-xxxxx"  // 替换成你的环境 ID
}
```

---

## 二、CloudBase AI 配置

`analyzeBatch` 和 `generatePaper` 使用当前云开发环境中的 CloudBase AI 能力，不读取 `SECRET_ID`、`SECRET_KEY`、`AI_API_KEY` 或 `AI_API_URL`。部署前需确认当前云开发环境已经开通代码中使用的模型。

---

## 三、中文字体

`generatePaper` 和 `generateReportPDF` 云函数目录内已内置 `NotoSansCJKsc-Regular.otf`。部署时请确认该字体文件随云函数一起上传；不需要再上传字体到云存储，也不需要配置 `FONT_FILE_ID`。

---

## 四、云函数部署

在微信开发者工具里：
1. 进入「云函数」面板
2. 右键点击每个云函数目录 → 「上传并部署：云端安装依赖」
3. 需要部署的云函数：
   - `analyzeBatch`
   - `analyzePhotos`
   - `uploadAndAnalyze`
   - `generatePaper`
   - `generateReportPDF`
   - `getAnalysisProgress`
   - `studentAccess`
   - `studentData`
   - `reportFeedback`
   - `englishVocabulary`
   - `learningResource`
   - `regenerateVerificationPaper`
   - `reanalyzeMathHistory`
   - `aiUsage`

### 注意：
- `uploadAndAnalyze` 会先校验内测授权、学生权限、上传模式与 `paperId` 关联，再在服务端创建报告并 fire-and-forget 启动 `analyzePhotos`
- `aiUsage` 提供内测授权、AI 用量账本和删除请求；体验版内测前必须部署，并与各 AI 云函数的 `pricing.js` / `usage-ledger.js` 副本保持一致
- 所有云函数执行超时需保持在微信平台允许的 **60 秒以内**；长耗时分析通过任务进度、轮询和手动重试恢复
- `analyzeBatch` 按图片返回 OCR 摘要；`analyzePhotos` 使用归一化摘要标记疑似重复照片，并只汇总唯一页面
- 每个云函数的 `package.json` 都已写好，云端会自动安装依赖

---

## 五、数据库集合创建

在微信开发者工具里，进入「云开发」控制台 → 「数据库」，创建以下集合：

| 集合名 | 权限 | 说明 |
|--------|------|------|
| `students` | 仅创建者可读写 | 学生档案 |
| `subjectProfiles` | 仅创建者可读写 | 学科档案 |
| `reports` | 仅创建者可读写 | 诊断报告 |
| `papers` | 仅创建者可读写 | 试卷记录 |
| `analysisTasks` | 仅创建者可读写 | 分析任务 |
| `studentMembers` | 云函数访问 | 孩子档案的家长成员关系 |
| `studentInvites` | 云函数访问 | 扫码加入邀请 |
| `reportFeedback` | 云函数访问 | 家长对报告、卡点、错题、照片的纠错反馈 |
| `englishImportBatches` | 云函数访问 | 英语词库候选导入批次 |
| `studentEnglishWords` | 云函数访问 | 单个孩子的个人英语单词库 |
| `englishPracticeSessions` | 云函数访问 | 英语 20 词听写会话与逐题记录 |
| `learningResourcePacks` | 仅创建者可读写 | 数学学习卡点任务包 |
| `aiUsageEvents` | 仅创建者可读写 | AI 用量追加式事件账本 |
| `dataDeletionRequests` | 仅创建者可读写 | 用户发起的数据删除请求 |
| `userConsents` | 仅创建者可读写 | 体验版内测授权记录 |

### 数据库安全规则（推荐配置）
主学习数据集合（`students` / `subjectProfiles` / `reports` / `papers` / `analysisTasks`）建议保持创建者直接读写规则：
```json
{
  "read": "doc._openid == auth.openid",
  "write": "doc._openid == auth.openid"
}
```

`studentMembers`、`studentInvites` 和 `reportFeedback` 是授权辅助集合，前端不直接读写，统一通过对应云函数访问；可配置为客户端不可直接读写，由云函数完成权限校验。

### 数据库索引

开发者工具显示 `cloud://createindex?... Error: timeout` 时，不需要反复点击快速创建链接。请进入：

`云开发控制台 → 数据库 → 对应集合 → 索引管理 → 新建索引`

创建以下复合索引。若集合安全规则限制为创建者读取，将 `_openid` 放在末尾：

| 集合 | 索引字段 | 排序 |
|------|----------|------|
| `students` | `createdAt`, `_openid` | 降序、升序 |
| `subjectProfiles` | `studentId`, `_openid` | 升序、升序 |
| `reports` | `studentId`, `subject`, `createdAt`, `_openid` | 升序、升序、降序、升序 |
| `reports` | `studentId`, `subject`, `status`, `createdAt`, `_openid` | 升序、升序、升序、降序、升序 |
| `papers` | `studentId`, `subject`, `type`, `grade`, `paperKey`, `_openid` | 全部升序 |
| `learningResourcePacks` | `studentId`, `subject`, `updatedAt`, `_openid` | 升序、升序、降序、升序 |
| `aiUsageEvents` | `_openid`, `createdAt` | 升序、降序 |
| `dataDeletionRequests` | `_openid`, `createdAt` | 升序、降序 |
| `userConsents` | `_openid`, `updatedAt` | 升序、降序 |
| `studentEnglishWords` | `studentId`, `masteryStatus`, `nextReviewAt` | 升序、升序、升序 |
| `englishPracticeSessions` | `studentId`, `createdAt`, `_openid` | 升序、降序、升序 |

`subjectProfiles` 现在仅按 `studentId` 查询，再从最多三条学科档案中筛选 `subject`，因此不再依赖原来的 `studentId + subject + _openid` 三字段复合索引。若安全规则要求按创建者读取，仍应创建上表中的 `studentId + _openid` 索引。

创建索引后通常需要等待几十秒到数分钟生效，再重新编译小程序。

---

## 六、微信订阅消息配置（尚未实现）

PRD 将「分析完成后推送通知」列为 P0，但当前 `analyzePhotos/sendNotification` 仍为空实现。完成订阅授权、模板配置和发送云函数后，再执行以下平台配置：

1. 登录微信公众平台：https://mp.weixin.qq.com/
2. 进入「功能」→ 「订阅消息」
3. 申请模板（选择「学习诊断通知」类目）
4. 将模板 ID 配置到小程序代码中（`subject-home.js` 或云函数里）

---

## 七、真机测试

1. 在微信开发者工具里，点击「预览」
2. 用手机微信扫描二维码
3. 进入小程序，完成以下测试：
   - 添加学生
   - 如有多个学生，确认首页显示家庭学习工作台；如只有一个学生，确认直接进入该学生学习档案
   - 进入家长管理，确认 owner 可创建邀请，共同家长可查看学习资料但不能管理成员
   - 选择学科
   - 上传试卷照片（1-20 张；如手机相册包含 HEIF，确认可自动转为 JPEG 或给出清晰提示）
   - 等待分析完成
   - 查看诊断报告
   - 生成验证试卷，确认每个学习卡点生成 5 题（3 道核心验证题 + 2 道迁移延展题）
   - 下载 PDF，并确认按钮变为「已下载」且再次点击不会重复下载
   - 进入「学习记录」，确认当天能看到诊断报告、生成的试卷、验证上传和原始照片

---

## 八、常见问题

### Q1：CloudBase AI 调用失败？
- 确认当前云开发环境已开通 CloudBase AI 和代码中使用的模型
- 查看 `analyzeBatch` 或 `generatePaper` 云函数日志中的模型调用错误

### Q2：PDF 中文显示乱码？
- 确认 `cloudfunctions/generatePaper/NotoSansCJKsc-Regular.otf` 存在并随函数部署
- 确认 `cloudfunctions/generateReportPDF/NotoSansCJKsc-Regular.otf` 存在并随函数部署
- 重新上传并部署 `generatePaper` / `generateReportPDF`

### Q3：上传图片后，一直显示「分析中」？
- 检查 `analyzePhotos` 云函数是否部署成功
- 查看云函数日志（云开发控制台 → 「日志」）
- 微信云函数超时时间最高只能在平台允许的 60 秒以内配置；不要尝试调到 60 秒以上
- 当前架构会先返回报告 ID，再由后台按图片串行分析；如中途失败，可在报告页或学习记录页手动重试

### Q4：小程序预览时，报错「云函数不存在」？
- 确认云函数已部署到云端
- 确认 `project.config.json` 里的 `cloudfunctionRoot` 配置正确

### Q5：开发者工具提示 `cloud://createindex?... Error: timeout`？
- 不需要反复点击快速创建链接
- 按「数据库索引」章节在云开发控制台手动创建索引
- 确认小程序代码与全部云函数均已重新部署

---

## 九、目录结构检查

确认以下内容已存在：
```
miniprogram-learning-diagnostic/
├── miniprogram/
│   ├── app.js                 ✅
│   ├── app.json               ✅（20 个页面路径）
│   ├── app.wxss               ✅
│   └── pages/                ✅（20 个页面）
│       ├── index/
│       ├── student-profile/
│       ├── add-student/
│       ├── subject-home/
│       ├── upload/
│       ├── upload-history/
│       ├── parent-management/
│       ├── join-student/
│       ├── report/
│       ├── bottleneck-center/
│       ├── bottleneck-detail/
│       ├── knowledge-map/
│       ├── learning-resource/
│       ├── english-practice/
│       ├── english-dictation/
│       ├── english-wrong-words/
│       ├── generate-verification/
│       ├── default-paper/
│       ├── paper-preview/
│       └── ai-usage/
├── cloudfunctions/
│   ├── analyzeBatch/         ✅
│   ├── analyzePhotos/        ✅
│   ├── uploadAndAnalyze/     ✅
│   ├── generatePaper/        ✅
│   ├── generateReportPDF/    ✅
│   ├── getAnalysisProgress/  ✅
│   ├── studentAccess/        ✅
│   ├── studentData/          ✅
│   ├── reportFeedback/       ✅
│   ├── englishVocabulary/    ✅
│   ├── learningResource/     ✅
│   ├── reanalyzeMathHistory/ ✅
│   ├── regenerateVerificationPaper/ ✅
│   └── aiUsage/              ✅
├── services/skills/          ✅（P0 Skill 能力内核）
├── cli/ldx.js                ✅（本地 CLI 入口）
├── tests/                    ✅（常规测试文件 + 真实图片 E2E 脚本 + helpers，638 常规用例）
├── scripts/check-js.js       ✅（217 文件语法检查）
├── project.config.json        ✅
├── package.json              ✅（npm scripts: test / test:coverage / test:e2e:* / check / verify / release:check）
├── PROJECT_PLAN.md          ✅
├── PRD.md                   ✅（v2.9）
├── SETUP.md                ✅（本文件）
└── docs/TEST_MATRIX.md     ✅
```

---

**完成上述配置后，小程序即可正常运行。**

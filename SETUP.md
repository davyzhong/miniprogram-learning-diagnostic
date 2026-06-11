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

## 二、环境变量配置

在微信开发者工具里，进入「云开发」控制台 → 「设置」→ 「环境变量」，添加以下变量：

### 方案 A：TC3 签名认证（推荐）
| 变量名 | 说明 | 示例 |
|--------|------|------|
| `SECRET_ID` | 腾讯云 SecretId | `AKIDxxxxxxxx` |
| `SECRET_KEY` | 腾讯云 SecretKey | `xxxxxxxxxxxx` |
| `AI_API_URL` | 混元 API 地址 | `https://api.hunyuan.cloud.tencent.com/hyllm/v1/chat/completions` |
| `AI_MODEL` | 混元模型名 | `hunyuan-vision` 或 `hunyuan-turbo` |
| `FONT_FILE_ID` | 云存储中的中文字体文件 ID | `cloud://xxxxx/SimHei.ttf` |

### 方案 B：Bearer Token 认证（简单）
| 变量名 | 说明 | 示例 |
|--------|------|------|
| `AI_API_KEY` | 混元 API Key（Bearer 格式） | `TC3xxxxxxxxxxxx` 或 `sk-xxxxxxxx` |
| `AI_API_URL` | 混元 API 地址 | `https://api.hunyuan.cloud.tencent.com/hyllm/v1/chat/completions` |
| `AI_MODEL` | 混元模型名 | `hunyuan-vision` |
| `FONT_FILE_ID` | 云存储中的中文字体文件 ID | `cloud://xxxxx/SimHei.ttf` |

### 如何获取混元 API Key？
1. 登录腾讯云控制台：https://console.cloud.tencent.com/
2. 进入「混元大模型」→ 「API 密钥管理」
3. 创建密钥（SecretId + SecretKey）或直接获取 API Key
4. 将密钥配置到环境变量中

---

## 三、中文字体准备

`generatePaper` 和 `generateReportPDF` 云函数需要中文字体来生成 PDF。

### 步骤：
1. 下载中文字体（推荐 `SimHei.ttf` 或 `NotoSansCJK-Regular.ttf`）
2. 在微信开发者工具里，把字体文件上传到云存储
3. 记录字体文件的 `fileID`（如：`cloud://xxxxx/SimHei.ttf`）
4. 将 `fileID` 配置到环境变量 `FONT_FILE_ID`

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

### 注意：
- `uploadAndAnalyze` 会在服务端可靠调用 `analyzePhotos`，两者执行超时建议在云端配置为 **900 秒**
- 小程序等待 20 秒后会返回学科主页，服务端继续完成分析
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

### 数据库安全规则（推荐配置）
对于每个集合，设置安全规则为：
```json
{
  "read": "doc._openid == auth.openid",
  "write": "doc._openid == auth.openid"
}
```

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

`subjectProfiles` 现在仅按 `studentId` 查询，再从最多三条学科档案中筛选 `subject`，因此不再依赖原来的 `studentId + subject + _openid` 三字段复合索引。若安全规则要求按创建者读取，仍应创建上表中的 `studentId + _openid` 索引。

创建索引后通常需要等待几十秒到数分钟生效，再重新编译小程序。

---

## 六、微信订阅消息配置（可选）

如果要使用「分析完成后推送通知」功能：

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
   - 选择学科
   - 上传试卷照片（1-5 张）
   - 等待分析完成
   - 查看诊断报告
   - 生成验证试卷
   - 下载 PDF

---

## 八、常见问题

### Q1：云函数调用失败，报错 `invalid credential`？
- 检查环境变量 `SECRET_ID` / `SECRET_KEY` / `AI_API_KEY` 是否配置正确
- 确认混元 API 密钥是否已开通、是否有余额

### Q2：PDF 中文显示乱码？
- 检查 `FONT_FILE_ID` 环境变量是否配置
- 确认字体文件已上传到云存储，且 `fileID` 正确

### Q3：上传图片后，一直显示「分析中」？
- 检查 `analyzePhotos` 云函数是否部署成功
- 查看云函数日志（云开发控制台 → 「日志」）
- 可能是混元 API 调用超时，需要增大云函数超时时间

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
│   ├── app.json               ✅（9 个页面路径）
│   ├── app.wxss               ✅
│   └── pages/                ✅（9 个页面）
│       ├── index/
│       ├── subject-select/
│       ├── subject-home/
│       ├── upload/
│       ├── report/
│       ├── generate-verification/
│       ├── default-paper/
│       └── paper-preview/
├── cloudfunctions/
│   ├── analyzeBatch/         ✅
│   ├── analyzePhotos/        ✅
│   ├── uploadAndAnalyze/     ✅
│   ├── generatePaper/        ✅
│   ├── generateReportPDF/    ✅
│   └── getAnalysisProgress/  ✅
├── project.config.json        ✅
├── PROJECT_PLAN.md          ✅
├── PRD.md                   ✅
└── SETUP.md                ✅（本文件）
```

---

**完成上述配置后，小程序即可正常运行。**

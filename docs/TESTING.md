# 测试指南（TESTING）

> 更新日期：2026-06-16
> 适用对象：本项目的开发者与贡献者
> 配套文档：`docs/TEST_MATRIX.md`、`SETUP.md`、`docs/TROUBLESHOOTING.md`

## 1. 测试框架概述

本项目**只使用 Node.js 内置能力**运行测试，不引入任何第三方测试框架：

- 测试运行器：`node:test`（Node.js ≥ 18 内置）
- 断言库：`node:assert/strict`
- 模块隔离：`node:vm` + 自研 harness
- 覆盖率：`--experimental-test-coverage`（V8 原生采集，无需 Istanbul/c8）

收益：

- `npm install` 零外部依赖，CI/本地环境一致
- 测试直接加载真实页面控制器与云函数源码，避免"为测试重写一份逻辑"
- 微信 API、数据库、CloudBase AI、PDFKit 全部通过 harness 注入替身，用例可离线、可重复

约束：

- `node:test` 仍在演进中，部分高级特性（如快照、参数化）需手写辅助
- 覆盖率报告格式受 Node 版本影响，建议固定 Node LTS（≥ 20）

## 2. 运行命令

| 命令 | 用途 | 备注 |
|------|------|------|
| `npm test` | 运行常规自动化测试 | 串行运行常规测试文件，不包含真实图片 E2E |
| `npm run test:coverage` | 运行常规测试并收集覆盖率 | 使用 V8 原生覆盖，输出到 stdout |
| `npm run test:e2e-real-image` | 单独运行真实图片端到端脚本 | 依赖本机图片路径和 CloudBase 环境，发布前人工验收使用 |
| `npm run test:devtools-english` | 使用微信开发者工具自动测试英语学科页面 | 依赖 `miniprogram-automator` 和微信开发者工具 CLI，输出到 `tmp/english-devtools-e2e` |
| `npm run test:real-data-smoke` | 使用微信开发者工具打开真实数据页面 | 需设置 `REAL_DATA_STUDENT_ID`，不提交截图产物 |
| `npm run metrics:student` | 从本地 JSON 导出计算单个孩子的运营指标 | 需设置 `METRICS_INPUT`，详见 `docs/METRICS.md` |
| `npm run check:deployment` | 检查云函数部署清单和前端封装 | 发布前确认没有漏部署函数 |
| `npm run release:check` | 发布前自动门禁 | 执行 `check:deployment` 和 `verify`；仍需手动跑 `git diff --check` 与 DevTools CLI `preview` |
| `npm run check` | 静态语法检查 | 执行 `scripts/check-js.js`，扫描当前全部 JS 文件 |
| `npm run verify` | 完整本地验证 | `npm test && npm run check`，提交前必跑 |

常用场景：

```bash
# 只跑某个文件
node --test tests/cloud-functions.test.js

# 按名称过滤用例
node --test --test-name-pattern="uploadAndAnalyze" tests/cloud-functions.test.js

# 调试单个用例（配合 node:test 的 only）
node --inspect-brk --test tests/page-flows.test.js

# 查看覆盖率详情（HTML 报告需额外工具，可结合 c8）
npm run test:coverage

# 真实图片 E2E：离线 mock 模式
npm run test:e2e-real-image -- --mock

# 真实图片 E2E：单张私有图片
REAL_IMAGE_PATH=/path/to/photo.jpg npm run test:e2e-real-image

# 真实图片 E2E：多案例 manifest
REAL_IMAGE_MANIFEST=/path/to/private-manifest.json npm run test:e2e-real-image

# 真实数据烟测：打开指定学生的核心页面并保存截图/结果
REAL_DATA_STUDENT_ID=student-id REAL_DATA_STUDENT_NAME=钟青羽 npm run test:real-data-smoke

# 真实数据烟测：只检查部分页面
REAL_DATA_STUDENT_ID=student-id REAL_DATA_SMOKE_ROUTES=profile,bottlenecks npm run test:real-data-smoke

# 英语学科页面自动化：工作台、自动导入、熟悉度、纸面听写、学习记录、空态
npm run test:devtools-english

# 单个孩子运营指标：文本摘要
METRICS_INPUT=/path/to/student-export.json METRICS_STUDENT_ID=student-id npm run metrics:student

# 单个孩子运营指标：JSON 输出
npm run metrics:student -- --input=/path/to/student-export.json --student-id=student-id --json

# 发布前自动门禁
npm run release:check
```

注意：`tests/e2e-real-image.test.js` 不进入 `npm test`，避免普通开发验证依赖本机图片路径或云端 AI 凭据。

## 3. 测试文件说明

| 文件 | 职责 | 用例数 |
|------|------|:------:|
| `analyze-batch-result.test.js` | `analyzeBatch/result-normalizer.js` 字段截断、严重度归一 | 4 |
| `analyze-photos-pipeline.test.js` | 分批、合并、imageFiles 构造、对比算法、OCR 去重 | 15 |
| `bottleneck-view.test.js` | 共享卡点视图模型、排序、统计、分类元数据和别名解析 | 7 |
| `cli-p0.test.js` | P0 `ldx` CLI 命令合同，使用 fixture adapter 离线验证 | 4 |
| `cloud-functions.test.js` | 10 个云函数的集成流程、权限校验、边界条件 | 30 |
| `contracts.test.js` | 架构红线：SDK 初始化、env 硬编码、PDF 字体、安全、共享模块复用 | 21 |
| `coverage-gap.test.js` | 轮询器边界、callFunction 错误规范化、isTimeoutError、导航栏颜色 | 6 |
| `data-layer.test.js` | `miniprogram/utils/cloud.js` 统一数据访问层 | 10 |
| `deployment-readiness.test.js` | 云函数部署清单、前端封装、发布回滚文档、页面四件套完整性 | 9 |
| `e2e-real-image.test.js` | 端到端真实图片链路脚本，单独运行（不在 npm test 中） | — |
| `english-devtools-cases.test.js` | 英语 DevTools 页面自动化用例库结构和功能覆盖校验 | 2 |
| `english-vocabulary-cloud.test.js` | 英语词库导入、确认、种子数据、熟悉度/拼写练习、AI 听写 | 17 |
| `english-vocabulary.test.js` | 英语词库前端工具和会话状态逻辑 | 14 |
| `generate-paper-pdf.test.js` | 验证试卷 PDF 中文字体、分页和答案页回归 | 4 |
| `index-presenter.test.js` | 孩子档案视图模型、家庭工作台卡片、样本覆盖、重点提示、卡点透出 | 9 |
| `learning-records.test.js` | 学习记录四级分类、验证卷编号、时间线统计、运营指标 | 17 |
| `math-learning-map-seed.test.js` | 数学知识图谱种子数据完整性 | 7 |
| `page-flows.test.js` | 主要页面流程：首页分流、学科工作台、英语练习、上传、出卷、报告、学习记录 | 68 |
| `paper-preview-presenter.test.js` | 试卷预览生命周期、工作台状态、默认试卷命名 | 6 |
| `parent-management-page-flows.test.js` | 家长管理和扫码加入页面流程 | 6 |
| `poller.test.js` | 通用轮询器与分析轮询包装 | 6 |
| `profile-summary.test.js` | 当前综合诊断状态规则 | 6 |
| `real-data-smoke-config.test.js` | 真实数据烟测配置、页面路由和输出目录解析 | 5 |
| `real-image-config.test.js` | 真实图片 E2E 参数、manifest 和临时报告输出 | 5 |
| `report-feedback.test.js` | 家长反馈云函数权限、参数白名单和列表读取 | 4 |
| `report-presenter.test.js` | 报告视图预计算、质量标签和验证证据状态 | 14 |
| `report-quality.test.js` | 报告质量等级、样本不足和复核规则 | 4 |
| `skills-p0.test.js` | P0 Skill 能力内核，覆盖诊断、报告、卡点、验证卷、验证反馈、时间线 | 8 |
| `student-access.test.js` | `studentAccess` 家长成员、邀请、加入、移除权限和首次建表兜底 | 8 |
| `student-data-access.test.js` | `studentData` 共享家长学习数据访问、学习记录 dry-run 清理权限 | 9 |
| `subject-home-presenter.test.js` | 学科工作台视图模型 | 6 |
| `time-aware-bottlenecks.test.js` | 时间化学习卡点趋势和权重 | 5 |
| `traceable-actions.test.js` | 可追踪操作 URL 构建、归一化和 fallback | 3 |
| `util.test.js` | 时间、卡点短名称等纯工具函数 | 11 |
| `verification-evidence.test.js` | 验证试卷证据完整性和证据状态规则 | 3 |
| **合计** | | **以 `npm test` 输出为准** |

> 注：常规测试以 `npm test` 输出为准；真实图片 E2E 由于依赖本机文件和云端环境，始终单独运行。

### 3.1 真实图片 E2E 常态化

真实学生试卷图片属于私有样本，**不提交仓库**。脚本支持三种入口：

1. `--mock`：本地离线回归，不依赖图片和 CloudBase 凭据。
2. `REAL_IMAGE_PATH`：单图快速验证。
3. `REAL_IMAGE_MANIFEST`：多案例回归，适合每次调整 Prompt、去重、证据判定后复测。

manifest 示例见 `tests/fixtures/real-image-manifest.example.json`：

```json
{
  "cases": [
    {
      "caseId": "math-single-clear-page",
      "subject": "math",
      "mode": "diagnosis",
      "filePaths": ["/absolute/private/path/math-page-1.jpg"],
      "expectedMinPages": 1,
      "expectedKeywords": ["计算", "分数"]
    }
  ]
}
```

运行后会生成本地临时报告 `tmp/e2e-real-image-report.json`，该目录已加入 `.gitignore`。路径错误、manifest 为空、非绝对路径都会显式报错，不会静默通过。

### 3.2 真实数据烟测

真实数据烟测用于跳过真机确认时的开发者工具验证。它不会上传图片，也不会提交任何真实学生数据，只会打开核心页面、保存截图并生成本地 JSON 结果。

必填环境变量：

- `REAL_DATA_STUDENT_ID`：要烟测的学生 `_id`。

可选环境变量：

- `REAL_DATA_STUDENT_NAME`：用于页面路由里的显示名。
- `REAL_DATA_SMOKE_ROUTES`：逗号分隔页面 key。默认 `home,profile,subjectMath,bottlenecks,records,verification`。
- `REAL_DATA_SMOKE_OUTPUT_DIR`：截图和 `results.json` 输出目录，默认 `tmp/real-data-smoke`。
- `WECHAT_DEVTOOLS_CLI`：微信开发者工具 CLI 路径，默认 `/Applications/wechatwebdevtools.app/Contents/MacOS/cli`。

示例：

```bash
REAL_DATA_STUDENT_ID=your-student-id \
REAL_DATA_STUDENT_NAME=钟青羽 \
npm run test:real-data-smoke
```

输出：

- `tmp/real-data-smoke/results.json`
- `tmp/real-data-smoke/*.png`

这些产物只用于本机验收，`tmp/` 已加入 `.gitignore`。

### 3.3 英语学科 DevTools 页面自动化

英语学科页面自动化用于验证当前单词 MVP 的完整页面职责：

- 英语工作台展示今日建议、学习进度、弱词提示和不重复的继续练习入口。
- 词库为空时自动导入钟青羽 PEP 个人词库。
- 单词熟悉度页面生成 20 词并提交一次 AI 判定。
- 纸面听写页面生成 20 词，支持“下一个”语音辅助，上传听写纸并展示 AI 批改结果。
- 学习记录展示英语熟悉度、纸面听写和听写纸照片证据。
- 无词库时展示可恢复空态。

机器可读用例库：

```text
tests/fixtures/english-devtools-test-cases.json
```

人工阅读版：

```text
docs/test-cases/钟青羽英语学科测试用例库.md
```

运行：

```bash
npm run test:devtools-english
```

输出：

- `tmp/english-devtools-e2e/results.json`
- `tmp/english-devtools-e2e/*.png`

这些产物只用于本机验收，`tmp/` 已加入 `.gitignore`。

## 4. 测试 Harness 使用指南

两个 harness 都位于 `tests/helpers/`，它们的核心思路一致：**用 `vm.runInNewContext` 在沙箱里执行真实源码，通过注入替身控制外部依赖**。

### 4.1 cloud-function-harness.js

适用于云函数（`cloudfunctions/*/index.js`）。导出三个工厂：

#### `createDatabase(initial?)`

内存中的轻量数据库替身，支持：

- `collection(name).add({ data })` / `.doc(id).get()` / `.doc(id).update({ data })`
- `collection(name).where(filter).orderBy(field, dir).limit(n).get()`
- `command.inc(value)` 原子加
- `serverDate()` 返回固定时间 `2026-06-11T12:00:00+08:00`，避免用例随时间漂移
- `dump(name)` 取出集合当前快照用于断言

示例：

```js
const db = createDatabase({
  students: [{ _id: 'student-1', _openid: 'owner-1', name: '钟青羽' }],
  reports: []
})

// 写入后断言
await db.collection('reports').add({ data: { _id: 'r1', status: 'new' } })
assert.equal(db.dump('reports')[0].status, 'new')
```

注意：

- 初始数据和每次读写都会 `structuredClone`，防止用例间污染
- `matches()` 仅支持顶层字段的严格相等；复杂查询请在业务侧拆成多步

#### `createCloudMock(options?)`

模拟 `wx-server-sdk` 的主要 API：

| 选项 | 作用 |
|------|------|
| `db` | 指定 `createDatabase()` 实例，默认新建空库 |
| `openId` | `getWXContext().OPENID` 返回值，默认 `'owner-1'` |
| `callFunction(payload)` | 自定义 `cloud.callFunction` 行为，常用于模拟下游云函数返回 |
| `getTempFileURL(payload)` | 自定义临时链接生成 |
| `uploadFile(payload)` | 自定义上传行为 |
| `downloadFile(payload)` | 自定义下载行为（字体/PDF 测试常用） |

`cloud.calls` 数组记录所有被调用的副作用（`callFunction`、`uploadFile`），便于断言"是否触发了某次调用"。

#### `loadModule(relativePath, mocks?, globals?)`

从项目根加载任意 JS 文件并在沙箱中执行：

- `mocks`：键为 `require()` 的请求路径，值为替换对象。例如 `{ 'wx-server-sdk': cloud }`
- 相对路径的 `require('./foo')` 仍走真实文件系统
- `globals`：向沙箱注入额外全局变量（例如覆盖 `Date`）

完整示例：

```js
const db = createDatabase({ /* ... */ })
const cloud = createCloudMock({ db, openId: 'owner-1' })
const handler = loadModule('cloudfunctions/uploadAndAnalyze/index.js', {
  'wx-server-sdk': cloud
})

const result = await handler.main({
  fileIDs: ['cloud://photo-1'],
  studentId: 'student-1',
  subject: 'math',
  mode: 'diagnosis'
})

assert.equal(result.success, true)
assert.equal(cloud.calls.find(c => c.name === 'callFunction').payload.name, 'analyzePhotos')
```

### 4.2 page-harness.js

适用于小程序页面（`miniprogram/pages/*/*.js`）。

#### `createWxMock(overrides?)`

模拟 `wx.*` API。默认实现会把所有调用记录到 `wx.calls` 并返回 `Promise.resolve(payload)`，方便断言导航、提示等行为：

```js
const wx = createWxMock()
// 触发一些操作后
const nav = wx.calls.find(c => c.name === 'navigateTo')
assert.match(nav.payload.url, /studentId=student-1/)
```

可覆盖的方法：`showLoading`、`hideLoading`、`showToast`、`navigateTo`、`navigateBack`、`setNavigationBarTitle`、`setNavigationBarColor`、`previewImage`、`openDocument`、`chooseMedia`，以及 `wx.cloud.*`。

#### `loadPage(relativePath, options?)`

加载页面 JS 并返回 `{ page, wx }`：

- `options.wx`：自定义 wx mock，默认 `createWxMock()`
- `options.modules`：拦截页面内的 `require()`，例如替换 `../../utils/cloud`
- `options.Date` / `options.setTimeout`：控制时间与定时器，避免真等待
- 自动解析 `Page({...})` 注册的定义，并提供 `setData()` 实现（支持路径表达式如 `'list[0].active'`）

完整示例：

```js
const cloud = {
  getStudents: async () => [{ _id: 's1', name: '钟青羽', grade: 5 }]
}
const wx = createWxMock()
const { page } = loadPage('miniprogram/pages/index/index.js', {
  wx,
  modules: { '../../utils/cloud': cloud }
})

await page.loadStudents()
assert.equal(page.data.students[0].gradeText, '5年级')
assert.equal(page.data.homeMode, 'single-profile')
```

注意事项：

- 页面代码中的 `setTimeout` 默认会被同步执行（见 harness 源码），若需模拟异步 tick，请传入自定义 `setTimeout`
- `loadPage` 会抛出 "did not register a Page" 如果目标文件没有调用 `Page()`，这通常意味着路径错误或文件未正确导出

## 5. 如何编写新测试

### 5.1 添加云函数测试

1. 确认测试归属：主流流程放 `cloud-functions.test.js`；纯结果标准化放 `analyze-batch-result.test.js`；跨模块契约放 `contracts.test.js`
2. 准备最小数据集：只用当前用例需要的集合和字段，不要复制整个 fixture
3. 用 `createCloudMock` 注入依赖；如需模拟下游云函数返回，使用 `callFunction` 选项
4. 断言三要素：**返回值**、**数据库最终状态**（`db.dump()`）、**副作用调用**（`cloud.calls`）

模板：

```js
test('myFunction 处理正常输入并写入结果', async () => {
  const db = createDatabase({
    reports: [{ _id: 'r1', _openid: 'owner-1', status: 'pending' }]
  })
  const cloud = createCloudMock({ db })
  const handler = loadModule('cloudfunctions/myFunction/index.js', {
    'wx-server-sdk': cloud
  })

  const result = await handler.main({ reportId: 'r1' })

  assert.equal(result.success, true)
  assert.equal(db.dump('reports')[0].status, 'done')
})
```

### 5.2 添加页面测试

1. 明确要验证的是数据流（`setData` 后的状态）还是副作用（`wx.showToast`、`navigateTo`）
2. 用 `modules` 替换 `../../utils/cloud`，避免真实网络
3. 触发页面方法时，按 WXML 的事件结构构造参数（`{ currentTarget: { dataset: {...} } }`）
4. 对异步方法使用 `await`；harness 默认把 `setTimeout` 同步化，无需等待

模板：

```js
test('详情页加载失败时显示 toast 且不卡在 loading', async () => {
  const cloud = {
    getReport: async () => { throw new Error('network down') }
  }
  const wx = createWxMock()
  const { page } = loadPage('miniprogram/pages/report/report.js', {
    wx,
    modules: {
      '../../utils/cloud': cloud,
      '../../utils/util': { formatChineseDateTime: () => '' },
      '../../utils/poller': { createPoller: () => ({ start() {}, stop() {} }) },
      './report-presenter': { buildReportView: () => ({}) }
    }
  })
  page.setData({ reportId: 'r1' })

  await page.loadReport('r1')

  assert.equal(page.data.loading, false)
  assert.ok(wx.calls.some(c => c.name === 'showToast' && /失败/.test(c.payload.title)))
})
```

### 5.3 添加契约测试

契约测试用于防止"改了 A 忘了改 B"这类回归。常见模式：

- **命名一致性**：前后端字段名必须相同（如 `pdfFileId` vs `fileID`）
- **初始化顺序**：`cloud.init()` 必须在 `cloud.database()` 之前
- **敏感信息**：禁止返回 `stack`、禁止硬编码环境 ID
- **CSS 类名拼写**：防止 wxml 引用了不存在的 class
- **API 收敛**：页面不应绕过 `utils/cloud.js` 直接调用 `wx.cloud.callFunction`

模板：

```js
test('新增的云函数也应遵守 init-before-db 规则', () => {
  const source = read('cloudfunctions/newFunction/index.js')
  assert.ok(
    source.indexOf('cloud.init(') < source.indexOf('cloud.database()'),
    'newFunction must initialize cloud before database access'
  )
})
```

写完新契约后，记得把它加入 `contracts.test.js` 而不是另起文件，保持契约集中管理。

## 6. Mock 策略

| 依赖 | 是否需要 mock | 原因 |
|------|---------------|------|
| `wx-server-sdk` | ✅ 必须 | 只能在云端运行；harness 提供完整替身 |
| `@cloudbase/node-sdk` | ✅ 必须 | CloudBase AI 调用不可离线复现 |
| `pdfkit` | ✅ 必须 | 真实字体和 PDF 生成慢且依赖磁盘；用 EventEmitter 替身即可 |
| 数据库 | ✅ 必须 | 用 `createDatabase()` 内存替身保证幂等 |
| `wx.*` 客户端 API | ✅ 必须 | 只能在微信运行时内执行 |
| `miniprogram/utils/cloud.js` | 视情况 | 测页面流程时 mock；测数据层本身时不 mock |
| `miniprogram/utils/util.js` | 视情况 | 纯函数可不 mock；涉及时间格式化且需要稳定输出时可替换 |
| `miniprogram/utils/poller.js` | 视情况 | 测轮询逻辑时用真实实现；测页面流程时可用空壳避免真等待 |
| Node 内置模块 (`fs`, `path`, `events`) | ❌ 不要 mock | harness 已透传；mock 它们会让测试失去真实性 |
| 业务子模块（如 `result-normalizer.js`） | ❌ 不要 mock | 它们是测试对象的一部分；除非单独有单元测试 |

原则：**只 mock 无法在 Node 进程里运行的东西**。其余尽量用真实代码，让测试反映真实行为。

## 7. 覆盖率目标和现状

- **目标**：核心模块行覆盖 ≥ 80%，云函数主入口 ≥ 90%
- **当前采集方式**：`npm run test:coverage`（V8 原生）
- **已知缺口**：
  - `sendNotification()` 是订阅消息预留钩子；模板与授权链路接入前不作为覆盖率目标
  - `e2e-real-image.test.js` 不计入覆盖率
  - 部分错误分支仅在真机触发（相机、存储鉴权）

提升覆盖率的优先级：

1. 云函数的参数校验与权限拒绝分支（已有大部分，继续补全）
2. 页面错误恢复路径（网络失败、超时、数据为空）
3. 工具函数的边界值（空字符串、非法日期、超长数组）

不要在以下场景强追覆盖率：

- 纯 UI 样式逻辑（应由视觉验收）
- 微信运行时特有行为（应在真机验收清单中覆盖）
- 第三方 SDK 内部实现

## 8. CI 集成

项目已接入最小 GitHub Actions 校验：`.github/workflows/verify.yml`。

### 推荐的最小 CI 流水线

```yaml
# .github/workflows/verify.yml
name: Verify

on:
  push:
    branches: [ main, master ]
  pull_request:

jobs:
  verify:
    runs-on: ubuntu-latest

    steps:
      - name: Checkout
        uses: actions/checkout@v4
      - name: Setup Node.js
        uses: actions/setup-node@v4
        with:
          node-version: 20
      - name: Install dependencies
        run: npm install
      - name: Run verification
        run: npm run verify
```

### 接入要点

1. **不需要安装微信开发者工具**：所有自动化测试都在 Node 中运行
2. **不需要云开发凭证**：harness 完全隔离了云端依赖
3. **依赖安装**：当前使用 `npm install`，与本地验证方式保持一致
4. **覆盖率上报**：可将 `npm run test:coverage` 的输出接入 Codecov/Coveralls；如需 LCOV 格式，再叠加 `c8`
5. **真机验收不进 CI**：`e2e-real-image.test.js` 需要真实环境与密钥，应作为发布前的手动检查项

### 分支保护建议

- PR 必须通过 `npm run verify`
- 主分支禁止直推，强制走 PR
- 合并前人工确认 SETUP.md 第七章的真机验收清单已执行

## 9. 测试纪律（长期规则）

> 这些规则用于防止测试套件再次膨胀。每次新增测试前对照检查。

### 9.1 新增测试必须回答：保护什么风险？

写测试之前先回答这个问题。如果答不上来，不写。

好的回答：
- "防止云函数向客户端泄露 stack trace"
- "防止 shared access 模块被绕过导致权限不一致"
- "防止分析流水线在全部批次失败时静默成功"

不好的回答：
- "提高覆盖率"
- "这个函数还没有测试"
- "防止以后有人改这个代码"

### 9.2 一个行为只测一次

不要在 page flow 里测已经在 presenter / unit test 里测过的逻辑。

判断方法：如果删掉这个测试，行为是否仍然被其他测试保护？如果是，这个测试就是冗余的。

### 9.3 不测实现细节

- 不测 CSS 类名拼写（用视觉验收）
- 不测变量名或函数名（重命名不应该导致测试失败）
- 不测函数调用顺序（只测可观察的行为结果）
- 不测源码字符串匹配（`assert.match(sourceCode, /pattern/)` 仅用于架构红线，放在 `contracts.test.js`）

### 9.4 fallback 测试上限

每个模块最多 1-2 个 fallback 测试（最可能触发的那个）。

常见错误：同一个 fallback 路径写了 3-4 个变体（"接口超时"、"返回空"、"返回 null"、"抛出异常"）。选最有代表性的 1 个即可。

### 9.5 文件大小上限

单测试文件 ≤ 300 行。超过就拆分。

按功能域拆分，不按文件类型拆分：
- ✅ `upload-and-paper-flows.test.js`（上传 + 试卷相关页面）
- ❌ `all-page-tests.test.js`（所有页面放一起）

### 9.6 季度审查

每季度跑一次：

```bash
wc -l tests/*.test.js | sort -rn | head -10
```

超过 300 行的文件列入下个迭代的拆分或精简计划。同时检查 `npm test` 的总耗时，如果 > 10s 就排查最慢的测试。

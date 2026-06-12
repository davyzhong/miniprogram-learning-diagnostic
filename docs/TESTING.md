# 测试指南（TESTING）

> 更新日期：2026-06-13
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
| `npm test` | 运行常规自动化测试 | 显式运行 16 个常规测试文件，不包含真实图片 E2E |
| `npm run test:coverage` | 运行常规测试并收集覆盖率 | 使用 V8 原生覆盖，输出到 stdout |
| `npm run test:e2e-real-image` | 单独运行真实图片端到端脚本 | 依赖本机图片路径和 CloudBase 环境，发布前人工验收使用 |
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
```

注意：`tests/e2e-real-image.test.js` 不进入 `npm test`，避免普通开发验证依赖本机图片路径或云端 AI 凭据。

## 3. 测试文件说明

| 文件 | 职责 | 用例数 |
|------|------|--------|
| `analyze-batch-result.test.js` | `analyzeBatch/result-normalizer.js` 字段截断、严重度归一 | 3 |
| `cloud-functions.test.js` | 6 个云函数的集成流程、权限校验、边界条件 | 17 |
| `comparison.test.js` | 验证报告对比算法（improved/worsened/new/persisting） | 4 |
| `contracts.test.js` | 跨模块契约、命名一致性、已修复缺陷回归保护 | 27 |
| `coverage-gap.test.js` | 历史修复的回归场景、轮询器/数据层边界分支 | 7 |
| `data-layer.test.js` | `miniprogram/utils/cloud.js` 统一数据访问层 | 8 |
| `e2e-real-image.test.js` | 端到端真实图片链路脚本，单独运行 | 1（含云端条件步骤） |
| `index-presenter.test.js` | 学习档案首页视图模型、样本覆盖、重点提示和空态 | 3 |
| `page-flows.test.js` | 10 个页面的主流程、错误恢复、导航跳转 | 32 |
| `photo-dedup.test.js` | OCR 摘要去重算法（含完全重复分支） | 3 |
| `poller.test.js` | 通用轮询器 `utils/poller.js` | 4 |
| `project-integrity.test.js` | 页面四件套完整性、WXML 事件绑定匹配、品牌资产完整性 | 3 |
| `profile-summary.test.js` | 当前综合诊断状态规则 | 6 |
| `report-presenter.test.js` | 报告视图预计算与展示文本 | 7 |
| `subject-home-presenter.test.js` | 学科工作台视图模型 | 3 |
| `util.test.js` | 时间、卡点短名称等纯工具函数 | 11 |
| `verification-evidence.test.js` | 验证试卷证据完整性 | 2 |
| **合计** | | **140 常规用例 + 1 个真实图片 E2E 脚本** |

> 注：常规测试以 `npm test` 输出为准；真实图片 E2E 由于依赖本机文件和云端环境，始终单独运行。

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
  - `sendNotification()` 空实现无覆盖
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

## 8. CI 集成建议

当前项目未接入 CI，但架构已为 CI 准备好：

### 推荐的最小 CI 流水线

```yaml
# .github/workflows/ci.yml 示例
name: CI
on: [push, pull_request]
jobs:
  test:
    runs-on: ubuntu-latest
    strategy:
      matrix:
        node-version: [20, 22]
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: ${{ matrix.node-version }}
      - run: npm run verify
```

### 接入要点

1. **不需要安装微信开发者工具**：所有自动化测试都在 Node 中运行
2. **不需要云开发凭证**：harness 完全隔离了云端依赖
3. **缓存 `node_modules`**：虽然本项目零外部依赖，但保留这一步便于未来扩展
4. **覆盖率上报**：可将 `npm run test:coverage` 的输出接入 Codecov/Coveralls；如需 LCOV 格式，再叠加 `c8`
5. **真机验收不进 CI**：`e2e-real-image.test.js` 需要真实环境与密钥，应作为发布前的手动检查项

### 分支保护建议

- PR 必须通过 `npm run verify`
- 主分支禁止直推，强制走 PR
- 合并前人工确认 SETUP.md 第七章的真机验收清单已执行

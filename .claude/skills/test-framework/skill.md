---
name: test-framework
description: "学习诊断小程序三层测试框架（L1 静态守卫 + L2 逻辑守卫 + L3 DevTools 渲染守卫）。什么时候用什么命令、怎么加新测试、harness 和 mock 怎么用。修改代码后必须跑对应的测试层。"
---

# 三层测试框架

> 分层架构详见 `docs/TEST_FRAMEWORK_DESIGN.md`。

```
L1 静态守卫 (check-js / contracts / 部署完整性) — <1s
    ↓
L2 逻辑守卫 (node:test 436+ 用例) — <3s
    ↓
L3 渲染守卫 (DevTools E2E 17页+6场景) — ~2min
```

## 核心约束

- **修改代码后必须跑 `npm run verify`**（L1+L2，<5s）
- **改了页面文案或页面控制流 → 同时更新 L3 断言**（否则 E2E 会 fail）
- **新增测试文件必须加到 `package.json` 的 `test` 和 `test:coverage` 脚本里**（项目不用 glob）
- **退出码约定**：L1/L2/L3 通用 0=全过 1=有失败；L3 额外 2=环境不可用

## 命令速查

```bash
# L1+L2（每次提交前必跑）
npm run verify                          # = npm test + npm run check
npm run check:deployment                # 云函数清单 + 页面四件套完整性

# L2：全量 + 单文件 + 覆盖率
npm test                                # 436+ 用例串行
node --test tests/cloud-functions.test.js  # 单文件
npm run test:coverage                   # 覆盖率（行+函数≥80%）

# L3 环境探测 + 全量回归
npm run test:e2e:doctor                 # DevTools CLI / automator / 端口
npm run test:e2e:fullpage               # 17 页 + 6 场景（带断言）
npm run test:e2e:data-driven            # 数据驱动场景（带真实卡点数据）
npm run test:e2e:all                    # fullpage + data-driven + 聚合报告

# L3 专项 E2E
npm run test:devtools-english           # 英语模块专域
npm run test:devtools-parent-timeline   # 家长管理 + 时间线
npm run test:real-data-smoke            # 真学生数据冒烟

# 预发布门禁
npm run release:check                   # deploy + verify + coverage
```

## L2：写测试（node:test + harness）

### 基础模式

所有测试用 `node:test` + `node:assert/strict`：

```js
const test = require('node:test')
const assert = require('node:assert/strict')

test('描述行为', () => {
  assert.equal(actual, expected)
  assert.deepEqual(actualArray, expectedArray)
  assert.ok(condition)
})
```

### Presenter 测试（最简）

Presenter 是纯函数，无 wx 依赖，直接 `require`：

```js
const { buildLearningProfileHomeView } = require('../miniprogram/pages/index/index-presenter')

test('学习档案首页处理仅数学诊断', () => {
  const view = buildLearningProfileHomeView({ student, profiles, reports, papers }, relativeTime)
  assert.match(view.headline, /数学/)
  assert.equal(view.bottleneckStats.activeCount, 2)
})
```

### 云函数测试（用 cloud-function-harness）

```js
const { createCloudMock, createDatabase, loadModule } = require('./helpers/cloud-function-harness')

test('uploadAndAnalyze 为有权限的学生创建报告', async () => {
  const db = createDatabase({
    students: [{ _id: 's1', _openid: 'owner-1', name: '钟青羽' }],
    subjectProfiles: [{ _id: 'p1', studentId: 's1', subject: 'math' }],
    reports: []
  })
  const cloud = createCloudMock({ db })
  const handler = loadModule('cloudfunctions/uploadAndAnalyze/index.js', { 'wx-server-sdk': cloud })
  const result = await handler.main({ fileIDs: ['cloud://photo'], studentId: 's1', subject: 'math' })
  assert.equal(result.success, true)
  assert.equal(db.dump('reports').length, 1)
})
```

关键点：
- `createDatabase(initialData)` — 内存 MongoDB，自动生成 `_id`，支持 `where`/`doc`/`add`/`update`
- `createCloudMock({ db, openId })` — 替 `wx-server-sdk`，模拟 `callFunction`/`getTempFileURL`/`uploadFile`
- `loadModule(path, { mocks })` — 通过 `node:vm` 加载真源码，注入替身
- `db.dump(name)` — 跑完后读数据库状态来断言

### 页面控制器测试（用 page-harness）

```js
const { loadPage, createWxMock } = require('./helpers/page-harness')

test('index 页面单学生直接进学习档案模式', async () => {
  const page = loadPage('miniprogram/pages/index/index.js', {
    modules: { '../../utils/cloud': { getAccessibleStudents: async () => [student] } }
  })
  // 触发 onShow
  await page.callMethod('onShow')
  assert.equal(page.data().homeMode, 'single-profile')
})
```

- `loadPage(relativePath, { wx, modules })` — 执行真实页面控制器，注入 wx mock
- `createWxMock()` — 模拟 `showLoading`/`navigateTo`/`cloud.callFunction` 等
- `page.data()` — 读页面 `data` 对象
- `page.callMethod(name)` — 触发页面方法

### 数据一致性守卫测试（新增模式）

```js
test('卡点引用完整性', () => {
  const missing = replay.items.filter(i => i.primaryBottleneckId && !bnIds.has(i.primaryBottleneckId))
  assert.deepEqual(missing, [], '证据指向不存在的卡点')
})
```

### 加新测试文件步骤

1. 创建 `tests/<name>.test.js`
2. 打开 `package.json`，把文件名加到 `scripts.test` 和 `scripts['test:coverage']`（两个都要加！）
3. 在 `docs/TEST_MATRIX.md` 对应的 PRD 功能行更新测试覆盖状态
4. 跑 `npm run verify` 确认通过

## L3：写 E2E 测试（DevTools）

### 单一页面断言模式（devtools-e2e-fullpage.js）

```js
{
  name: 'index 首页/家庭工作台',
  route: '/pages/index/index',
  expect: {
    text: ['家庭学习工作台', '钟青羽', '添加孩子'],  // 必须全部出现
    notText: ['加载中', '页面不存在'],                 // 不应出现
    minChildren: 1,                                   // root 至少 N 子元素
  },
},
```

`text` 来自 PRD 中该页的"区域/内容"表。改产品文案 → 必须同步更新。

### 跨页场景模式

```js
{
  name: 'scenario: 学科工作台 → 拍照 → 学习记录',
  steps: [
    { route: '/pages/subject-home/subject-home?...', wait: 1800, expect: { text: ['拍照诊断'] } },
    { action: 'tapByText', selector: '.tool-item', text: '学习记录', wait: 1200, expect: { path: 'pages/upload-history/upload-history' } },
  ],
},
```

步骤类型：
- `{ route: url, ... }` — `reLaunch` 到该路由
- `{ action: 'tapByText', selector, text, ... }` — 从匹配的元素中找含文本的 tap
- `{ action: 'tap', selector, ... }` — 直接 selector tap

### Cloud Mock 注入模式

L3 不走真实云函数。`installCloudMocks(mp)` 在 `miniProgram.evaluate()` 中全局替换 `wx.cloud.callFunction`。Mock 数据（student/report/paper/member）在脚本顶部定义。**改变 mock 数据 → 同步改断言。**

### 加一个新页面后的 E2E 步骤

1. 在 `pages` 数组加一个 entry（`name` + `route` + `expect`）
2. 如果这个页是跨页场景中间节点 → 更新相关 `scenarios`
3. 断言文本用页面 PRD 设计的文案，不要偷懒抄 loading 态文本

## 测试数据管理

| 层 | 数据来源 | 生命周期 |
|----|----------|----------|
| L2 云函数测试 | `createDatabase()` 参数 | 单个 `test()` 内 |
| L2 Presenter 测试 | 测试文件的常量 | 单个 `test()` 内 |
| L3 全量 | `devtools-e2e-fullpage.js` 顶部 fixture | 全局（通过 mock 注入） |
| L3 数据驱动 | `data/math/*.seed.json` | 每次 reLaunch 后页面加载 |

**原则**：所有测试数据写在代码里，不让 CI/他人依赖真实云数据库。

## 已知差距（测试覆盖范围）

| PRD 能力 | 测试层 | 状态 |
|----------|--------|------|
| 验证结论区分答对/空白/OCR 漏识别 | L2 + L3 | ⚠️ 未覆盖（产品已知差距） |
| 微信订阅消息推送 | 人工 | ⚠️ 空实现 |
| 默认试卷跨学生共享模板 | L2 合约 | ⚠️ 未实现 |
| single-profile → student-profile 入口 | L3 E2E | ⚠️ 产品路径不存在 |
| 真机相机、CloudBase AI、打印 | 人工 | ⬜ 待验收 |

## 相关文档

- `docs/TEST_FRAMEWORK_DESIGN.md` — 完整设计文档（三层架构、测试流程、CI、改进机制）
- `docs/TESTING.md` — 测试操作指南（命令、文件说明、调试技巧）
- `docs/TEST_MATRIX.md` — PRD 功能 → 测试文件映射矩阵
- `tests/helpers/cloud-function-harness.js` — 云函数测试 harness 源码
- `tests/helpers/page-harness.js` — 页面控制器测试 harness 源码

# 测试指南（TESTING）

> 更新日期：2026-06-20
> 适用对象：本项目的开发者与后续维护 agent
> 配套文档：`docs/TEST_FRAMEWORK_DESIGN.md`、`docs/TEST_STRATEGY_V2.md`、`docs/TEST_MATRIX.md`

## 1. 测试体系概述

本项目 V2 测试体系只分两大类：

| 类别 | 目标 | 默认命令 | 是否依赖微信开发者工具 |
|---|---|---|---|
| 单元自动化测试 | 离线验证云函数、Presenter、工具函数、数据层、合同、知识库一致性和诊断回归 | `npm run test:unit` / `npm test` | 否 |
| CLI End-to-End 测试 | 通过微信开发者工具 CLI 打开真实小程序页面，验证页面渲染和跨页交互 | `npm run test:e2e:*` | 是 |

单元自动化测试继续使用：

- 测试运行器：`node:test`
- 断言库：`node:assert/strict`
- 模块隔离：`node:vm` + 自研 harness
- 覆盖率：`--experimental-test-coverage`

CLI E2E 使用：

- 微信开发者工具 CLI
- `miniprogram-automator`
- 页面内 cloud mock 或真实 CloudBase 数据

## 2. 常用命令

| 命令 | 用途 | 备注 |
|---|---|---|
| `npm test` | 运行全部单元自动化测试 | `npm run test:unit` 的别名 |
| `npm run test:unit` | 运行全部离线测试 | 当前基线 545 个用例 |
| `npm run test:coverage` | 单元测试覆盖率 | 行/函数 80% 门槛 |
| `npm run check` | JS 语法检查 | 扫描项目 JS 文件 |
| `npm run verify` | 提交前本地门禁 | `test:unit + check` |
| `npm run check:deployment` | 云函数部署清单检查 | 发布前使用 |
| `npm run release:check` | 发布前自动门禁 | 部署检查 + verify + coverage |
| `node scripts/preview-pdf.js` | 本地 PDF 预览 | 改 PDF 布局后必跑 |

## 3. CLI E2E 命令

运行任何 E2E 前先执行：

```bash
npm run test:e2e:doctor
```

E2E 套件：

| 命令 | 学科/范围 | 覆盖重点 | 输出目录 |
|---|---|---|---|
| `npm run test:e2e:core` | 通用核心页面 | 17 页面 + 基础跨页流程 | `tmp/e2e/core/` |
| `npm run test:e2e:math` | 数学 | 数据驱动诊断、细卡点、知识地图、学习资源 | `tmp/e2e/math-data/`、`tmp/e2e/math-knowledge-map/` |
| `npm run test:e2e:chinese` | 语文 | 语文工作台、诊断报告、错项复测出卷页 | `tmp/e2e/chinese/` |
| `npm run test:e2e:english` | 英语 | 工作台、词库、熟悉度、纸面听写、学习记录 | `tmp/e2e/english/` |
| `npm run test:e2e:all` | 聚合套件 | core + math + english + 聚合报告 | `tmp/e2e/aggregate/` |
| `npm run test:e2e:real-data` | 真实数据烟测 | 指定真实学生页面打开和截图 | `tmp/e2e/real-data/` |
| `npm run test:e2e:real-image` | 真实图片链路 | mock、单图或 manifest 图片诊断 | `tmp/e2e-real-image-report.json` |
| `npm run test:e2e:real-cloud` | 真实云函数 | 真实云端 analyzeBatch 结构校验 | 需要 `RUN_REAL_CLOUD=1` |

兼容旧命令：

| 旧命令 | 新命令 |
|---|---|
| `npm run test:e2e:fullpage` | `npm run test:e2e:core` |
| `npm run test:devtools-english` | `npm run test:e2e:english` |
| `npm run test:real-data-smoke` | `npm run test:e2e:real-data` |
| `npm run test:e2e-real-image` | `npm run test:e2e:real-image` |
| `npm run test:real-cloud` | `npm run test:e2e:real-cloud` |

## 4. 真实数据和真实图片

真实数据烟测：

```bash
REAL_DATA_STUDENT_ID=student-id \
REAL_DATA_STUDENT_NAME=钟青羽 \
npm run test:e2e:real-data
```

只检查部分页面：

```bash
REAL_DATA_STUDENT_ID=student-id \
REAL_DATA_SMOKE_ROUTES=profile,bottlenecks \
npm run test:e2e:real-data
```

真实图片 E2E：

```bash
# 离线 mock 模式
npm run test:e2e:real-image -- --mock

# 单张私有图片
REAL_IMAGE_PATH=/absolute/path/to/photo.jpg npm run test:e2e:real-image

# 多案例 manifest
REAL_IMAGE_MANIFEST=/absolute/path/to/private-manifest.json npm run test:e2e:real-image
```

真实图片和真实学生数据不得提交到仓库。`tmp/` 下的截图和报告只用于本机验收。

## 5. Harness 使用指南

两个核心 harness 位于 `tests/helpers/`：

| Harness | 用途 |
|---|---|
| `cloud-function-harness.js` | 在 Node 进程中执行真实云函数，注入内存数据库、`wx-server-sdk` 替身、CloudBase AI mock 和 PDF mock |
| `page-harness.js` | 在 Node 进程中执行小程序页面控制器，注入 `wx.*` 和页面依赖模块 |

### 5.1 云函数测试模板

```js
const db = createDatabase({
  reports: [{ _id: 'r1', _openid: 'owner-1', status: 'pending' }]
})
const cloud = createCloudMock({ db, openId: 'owner-1' })
const handler = loadModule('cloudfunctions/myFunction/index.js', {
  'wx-server-sdk': cloud
})

const result = await handler.main({ reportId: 'r1' })

assert.equal(result.success, true)
assert.equal(db.dump('reports')[0].status, 'done')
```

### 5.2 页面测试模板

```js
const wx = createWxMock()
const { page } = loadPage('miniprogram/pages/report/report.js', {
  wx,
  modules: {
    '../../utils/cloud': {
      getReportDetail: async () => ({ report: { _id: 'r1', status: 'completed' } })
    }
  }
})

await page.loadReport('r1')

assert.equal(page.data.loading, false)
assert.ok(wx.calls.some(call => call.name === 'setNavigationBarTitle'))
```

## 6. Mock 策略

| 依赖 | 策略 |
|---|---|
| `wx-server-sdk`、`wx.*`、CloudBase AI、数据库、PDFKit | 必须 mock 或使用 harness 替身 |
| `miniprogram/utils/cloud.js` | 测页面流程时 mock；测数据层本身时用真实实现 |
| 业务子模块 | 默认使用真实模块，除非该模块本身是当前测试对象的外部依赖 |
| Node 内置模块 | 不 mock |

原则：只 mock 无法在 Node 进程里稳定运行的外部依赖，其余尽量跑真实代码。

## 7. 新增测试纪律

新增测试前必须回答：这个测试保护什么风险？

保留规则：

- 一个行为只测一次；不要在 page flow 里重复测 presenter 已覆盖的纯逻辑。
- 不测变量名、CSS 类名、函数调用顺序等实现细节，除非它是明确的架构红线。
- 每个模块最多保留 1-2 个代表性 fallback 测试。
- 单个测试文件过大时，按业务域拆分。
- 发现 bug 后先写失败测试，再修复。

## 8. CI 与发布

最小 CI 只需要跑：

```bash
npm run verify
```

发布前建议：

```bash
npm run release:check
npm run test:e2e:doctor
npm run test:e2e:math
```

涉及英语时追加：

```bash
npm run test:e2e:english
```

涉及语文错项复习或语文验证卷时追加：

```bash
npm run test:e2e:chinese
```

涉及真实数据读取、线上云函数或真实图片识别时，按第 4 节执行对应人工验收。

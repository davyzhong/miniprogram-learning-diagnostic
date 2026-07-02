# 学习诊断小程序测试框架设计 V2

> 更新日期：2026-07-02
> 基线：`npm test` / `npm run test:unit` 当前 638 个离线用例通过
> 配套执行计划：`docs/TEST_STRATEGY_V2.md`

## 一、设计目标

测试框架只回答两个问题：

1. **本地逻辑是否可靠？**
   用单元自动化测试回答，要求快、稳定、离线、可重复。

2. **真实小程序页面是否能跑通？**
   用微信开发者工具 CLI E2E 回答，要求按学科组织、可截图、可输出结构化报告。

这个设计刻意不追求“层级越多越高级”。旧版 L0-L4 容易让测试职责重叠，现在统一收敛为两大类。

## 二、总体架构

```text
测试框架 V2
├── 单元自动化测试（Node.js）
│   ├── 云函数测试
│   ├── Presenter / 纯函数测试
│   ├── 页面 controller 流程测试
│   ├── 数据访问层测试
│   ├── 合同与部署守卫
│   ├── 数学知识地图 / 卡点回归
│   ├── 语文具体错项回归
│   └── 英语词库与听写逻辑测试
└── CLI End-to-End 测试（微信开发者工具）
    ├── core：通用核心页面
    ├── math：数学完整链路
    ├── chinese：语文轻量链路
    ├── english：英语完整链路
    ├── ai-usage：AI 用量账本与内测授权
    ├── real-data：真实学生数据烟测
    ├── real-image：真实图片诊断链路
    └── real-cloud：真实云函数可用性
```

## 三、单元自动化测试

### 3.1 入口

```bash
npm run test:unit
npm test
npm run test:coverage
npm run verify
```

### 3.2 技术选择

| 能力 | 工具 |
|---|---|
| 测试运行器 | `node:test` |
| 断言 | `node:assert/strict` |
| 云函数隔离 | `tests/helpers/cloud-function-harness.js` |
| 页面 controller 隔离 | `tests/helpers/page-harness.js` |
| 数据库替身 | `createDatabase(initial)` |
| 微信 API 替身 | `createWxMock()` |
| 覆盖率 | Node.js V8 原生覆盖率 |

### 3.3 覆盖范围

| 范围 | 代表文件 |
|---|---|
| 云函数主流程和权限 | `tests/cloud-functions.test.js`、`tests/student-access.test.js`、`tests/student-data-access.test.js` |
| 页面 controller 和视图模型 | `tests/*-page-flows.test.js`（按页面拆分，共 12 个文件）、`tests/report-presenter.test.js`、`tests/subject-home-presenter.test.js` |
| 验证卷和反馈闭环 | `tests/verification-pack.test.js`、`tests/verification-evidence.test.js`、`tests/report-paper-feedback-loop.test.js` |
| 数学学习地图 | `tests/math-learning-map-*.test.js`、`tests/bottleneck-hierarchy-regression.test.js` |
| 语文具体错项 | `tests/chinese-review-targets.test.js` |
| 英语词库和听写 | `tests/english-vocabulary*.test.js` |
| 合同和部署守卫 | `tests/contracts.test.js`、`tests/deployment-readiness.test.js`、`tests/data-consistency-guard.test.js` |

### 3.4 设计原则

- 单元自动化测试不依赖真实 CloudBase、真实图片、微信开发者工具或网络。
- 测试加载真实业务源码，只替换外部运行时依赖。
- 新 bug 必须先写失败测试，再修复。
- 不为覆盖率硬写低价值测试；每条测试都要能说清楚保护的风险。

## 四、CLI End-to-End 测试

### 4.1 环境检查

```bash
npm run test:e2e:doctor
```

该命令验证：

- 微信开发者工具 CLI 可达。
- `miniprogram-automator` 可加载。
- `project.config.json` 可识别。
- DevTools 可被自动化启动。

### 4.2 套件划分

| 套件 | 命令 | 说明 |
|---|---|---|
| core | `npm run test:e2e:core` | 核心通用页面和基础跨页流程 |
| math | `npm run test:e2e:math` | 数学数据驱动诊断 + 知识地图 + 学习资源 |
| chinese | `npm run test:e2e:chinese` | 语文工作台、诊断报告、错项复测出卷轻量链路 |
| english | `npm run test:e2e:english` | 英语工作台、自动导入、认词练习、纸面听写、学习记录、错词本、空态 |
| all | `npm run test:e2e:all` | core + math + chinese + english + 聚合报告 |
| real-data | `npm run test:e2e:real-data` | 指定真实学生数据页面烟测 |
| real-image | `npm run test:e2e:real-image` | 真实图片或 manifest 诊断链路 |
| real-cloud | `npm run test:e2e:real-cloud` | 真实云函数结构校验 |

### 4.3 输出目录

| 套件 | 输出目录 | 报告 |
|---|---|---|
| core | `tmp/e2e/core/` | `report.json` |
| math-data | `tmp/e2e/math-data/` | `report.json` |
| math-knowledge-map | `tmp/e2e/math-knowledge-map/` | `report.json` |
| chinese | `tmp/e2e/chinese/` | `report.json` |
| english | `tmp/e2e/english/` | `report.json` + `ENG-*-initial.png` + `ENG-*-after-*.png` |
| real-data | `tmp/e2e/real-data/` | `report.json` |
| aggregate | `tmp/e2e/aggregate/` | `aggregate-report.md` |

聚合器 `scripts/e2e-report-aggregator.js` 读取标准目录，同时兼容历史报告文件名：`results.json`、`data-driven-report.json`、`report-<timestamp>.json`。

### 4.4 学科优先级

| 学科 | 当前成熟度 | 策略 |
|---|---|---|
| 数学 | 最高 | 作为 E2E 样板，覆盖诊断、卡点、资源、知识地图和验证卷 |
| 英语 | 较高 | 使用 `tests/fixtures/english-devtools-test-cases.json` 作为专属用例库；每个用例必须声明页面路由、模拟器动作、数据断言和截图产物 |
| 语文 | 起步 | 先覆盖错项复测的页面入口，后续补“错项一一对应验证”完整链路 |

## 五、日常开发流程

```text
改代码
  ↓
npm run test:unit
  ↓
npm run check
  ↓
按改动范围选择 E2E：
  - 数学：npm run test:e2e:math
  - 语文：npm run test:e2e:chinese
  - 英语：npm run test:e2e:english
  - 通用页面：npm run test:e2e:core
```

提交前至少运行：

```bash
npm run verify
```

## 六、发布前建议

```bash
npm run release:check
npm run test:e2e:doctor
npm run test:e2e:math
```

如果改动涉及通用页面，追加：

```bash
npm run test:e2e:core
```

如果改动涉及英语或语文，追加对应学科：

```bash
npm run test:e2e:english
npm run test:e2e:chinese
```

真实数据、真实图片和真实云函数仍属于人工验收范畴，不进入默认本地测试。

## 七、后续改进

1. 抽取 E2E 公共 helper：启动 DevTools、安装 cloud mock、断言文本、截图、写报告。
2. 扩展语文 E2E：覆盖具体错字/词语/背诵项与验证题一一对应。
3. 为数学验证卷补页面编号上传回传的 CLI E2E。
4. 将 `tmp/e2e/*/report.json` 接入更稳定的趋势报告。

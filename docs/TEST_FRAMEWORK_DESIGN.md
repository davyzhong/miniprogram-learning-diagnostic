# 学习诊断小程序 — 自动化测试框架设计

> 设计日期：2026-06-17 | 作者：qiming + Claude
> 基于：PRD v2.9 / PROJECT_PLAN / 现有 50 个测试文件 460 用例 / 现场跑通 23/23 DevTools E2E
> AI agent 入口：本框架已沉淀为 skill `learning-diagnostic-testing`，agent 在本项目说"测试/验证/跑回归"时会自动加载，命令和分层见 skill 的 SKILL.md。

## 一、目标

**一句话**：每次改动后，一条命令能自动验证"PRD 里写了的功能在代码里都在"、"刚改的东西没破坏别的"、"修复的 bug 不会再回来"。

**三层递进**：

1. **L1 静态守卫**：语法 + 架构红线 + 部署完整性，秒级反馈
2. **L2 逻辑守卫**：460 单元/集成用例覆盖全部云函数、Presenter、工具函数，<3 秒跑完
3. **L3 渲染守卫**：通过微信开发者工具 CLI 驱动真实小程序页面，断言渲染文案和跨页交互

**反目标**：不搞 100% 覆盖率崇拜、不造"为测试而测试"的用例、测试代码不做无意义抽象。

---

## 二、分层架构

```
┌─────────────────────────────────────────────────────────────────┐
│                     L3 渲染守卫 (DevTools E2E)                     │
│   17 页面真实渲染 + 6 跨页场景 + 专业域（英语/数学/家长时间线）      │
│   工具：miniprogram-automator + DevTools CLI + cloud mock 注入    │
│   耗时：~2 分钟（17 页 + 6 场景）                                  │
│   触发：发布前 / PR / 主动跑                                       │
├─────────────────────────────────────────────────────────────────┤
│                     L2 逻辑守卫 (node:test)                       │
│   460 用例：云函数、Presenter、工具函数、数据访问层、合约红线       │
│   工具：Node.js 内置 test runner + 自研 harness                    │
│   耗时：<3 秒                                                     │
│   触发：每次提交前 (npm run verify)                                │
├─────────────────────────────────────────────────────────────────┤
│                     L1 静态守卫 (check-js)                         │
│   143 个 JS 文件语法检查 + 部署清单完整性                           │
│   耗时：<1 秒                                                     │
│   触发：每次保存 / 每次提交前                                       │
└─────────────────────────────────────────────────────────────────┘
```

### 2.1 L1：静态守卫

**工具**：`scripts/check-js.js` + `tests/deployment-readiness.test.js` + `tests/contracts.test.js` + `tests/data-consistency-guard.test.js`

**检查清单**：

| 项目 | 工具 | 说明 |
|------|------|------|
| JS 语法 | `check-js.js` | 扫描全部 `.js` 文件，检查语法错误 |
| 部署完整性 | `deployment-readiness.test.js` | 云函数清单 vs 实际目录、页面四件套完整性 |
| 架构红线 | `contracts.test.js` | SDK 初始化顺序、env 硬编码、PDF 字体存在、共享模块复用、安全约束 |
| 四库交叉引用完整性 | `data-consistency-guard.test.js` | evidence→bottleneck→node→resource 四库 ID 交叉引用必须全部可达（18 断言） |

**设计原则**：
- L1 不调用任何外部服务，不加载页面运行时
- 零依赖，纯文件系统 + AST 检查
- 可秒级跑完，适合保存后自动触发（通过 hooks）

### 2.2 L2：逻辑守卫

**工具**：`node --test`（Node.js 内置）+ 两个自研 harness

**两个 harness**：

| Harness | 位置 | 能力 |
|---------|------|------|
| `cloud-function-harness.js` | `tests/helpers/` | 内存数据库、`wx-server-sdk` 替身、CloudBase AI mock、PDFKit mock |
| `page-harness.js` | `tests/helpers/` | 执行真实页面控制器文件，注入微信 API 替身 |

**核心能力**：

1. **`createDatabase(initial)`** — 内存 MongoDB，支持 `where`/`doc`/`add`/`update`/`orderBy`/`limit`/`skip`/`count`，完全模拟云数据库语义
2. **`createCloudMock({ db, openId })`** — `wx-server-sdk` 的替身，包含 `cloud.database()`、`cloud.callFunction()`、`cloud.getTempFileURL()`、`cloud.uploadFile()`、`cloud.downloadFile()`、CloudBase AI mock
3. **`loadModule(path, mockMap)`** — 通过 `node:vm` 沙箱加载云函数源码，注入 mock 替身，隔离文件系统和真实 SDK

**设计原则**：

- **测试加载真实源码**，不写"测试专用逻辑"。云函数 `index.js` 的 `exports.main` 直接从文件系统 `require` 后通过 `vm.Module` 执行
- **替身要像**：内存数据库要真实 `throw` ResourceNotFound、支持 `_.inc()` 操作符
- **隔离性**：每个 `test()` 独立创建数据库和 mock，不互相污染
- **速度优先**：不用 `child_process` fork，不启动真服务，纯内存跑

**测试分类**：

```
L2 测试
├── 云函数集成测试（cloud-functions.test.js, 37 用例）
│   └── uploadAndAnalyze → analyzePhotos → analyzeBatch 全链路
├── Presenter 单元测试（*presenter*.test.js, ~130 用例）
│   └── 纯函数：入参 → 出参，无副作用，最易测试
├── 数据访问层测试（data-layer.test.js, 11 用例）
│   └── cloud.js 封装层：callFunction 错误处理、缓存、超时
├── 工具函数测试（util.test.js, poller.test.js, ...）
│   └── 日期格式化、卡点短名称、轮询器状态机
├── 访问控制测试（student-access.test.js, student-data-access.test.js）
│   └── 权限矩阵：owner/viewer/非成员 三种角色 × 7 操作
├── 业务流程测试（page-flows.test.js, 81 用例）
│   └── 页面 controller 的完整生命周期：首页分流 → 学科主页 → 拍照 → 报告
├── 合约红线测试（contracts.test.js, 22 用例）
│   └── env 字符串硬编码、SDK init 顺序、字体文件存在、瓶颈命名两份同步
├── 回归补丁测试（coverage-gap.test.js, 6 用例）
│   └── 历史修复场景的防止回归
├── 诊断准确性回归（diagnostic-accuracy-regression.test.js, 41 证据）
│   └── 41 条历史证据回放，验证 enricher 输出不漂移
└── 卡点归组回归（bottleneck-hierarchy-regression.test.js, 28 卡点）
    └── 28 个卡点归组验证，防止 bottleneck 层级分组退化
```

### 2.3 L3：渲染守卫

**工具**：`miniprogram-automator` + 微信开发者工具 CLI

**现有脚本**：

| 脚本 | 覆盖 | 断言强度 | 状态 |
|------|------|----------|------|
| `devtools-e2e-fullpage.js` | 17 页 + 6 跨页场景 | 强（每页断言关键文本 + 禁止文本） | ✅ 23/23 |
| `devtools-fullpage-smoke.js` | 17 页加载不报错 | 弱（只采集 error） | 可用 |
| `devtools-parent-timeline-e2e.js` | 19 个家长/时间线场景 | 强 | 可用 |
| `devtools-english-e2e.js` | 英语模块专域 | 强 | 可用 |
| `devtools-real-data-smoke.js` | 真实数据冒烟 | 中（依赖真实学生数据） | 人工跑 |
| `devtools-e2e-data-driven.js` | 数据驱动 E2E | 强（从 seed.json 动态读取，注入真实卡点/资源） | 可用 |
| `e2e-report-aggregator.js` | 多脚本结果聚合 | 汇总各 E2E report.json 为统一 Markdown 报告 | 可用 |
| `e2e-real-cloud.test.js` | L4 真实云回归 | 强（真实 analyzeBatch 结构校验） | 默认跳过（RUN_REAL_CLOUD=1） |
| `devtools-cli-doctor.js` | 环境探测 | 诊断 | ✅ 5/5 |

**cloud mock 注入模式**（核心创新）：

```
automator.launch() → miniProgram.evaluate(cloudMocks)
                   → 全局替换 wx.cloud.callFunction / wx.cloud.database
                   → 后续所有 reLaunch 的页面都走 mock 数据
                   → 零真实云函数调用，完全离线，秒级稳定
```

**与 `devtools-fullpage-smoke.js` 的区别**：
- smoke 只判断"页面没崩"（pass when no console.error）
- e2e-fullpage 判断"文案对不对"（必须是 `['钟青羽', '当前综合摘要', ...]`，缺一个就 FAIL）

**smoke 的保留价值**：轻量回归，比 fullpage 快（无断言逻辑），适合改了 WXSS/CSS 后只看渲染不崩。

**设计原则**：

- **每个页面的断言来自 PRD 中的"区域/内容"表** — 这就是自动验证"PRD 写了的东西代码里有"
- **`notText` 检查不该出现的内容** — 防止 loading 骨架、错误信息、LP 裸编号等偷渡到用户面前
- **截图只在失败时生成**，通过时不产生垃圾
- **输出结构化 JSON 报告**，方便 CI 解析和趋势追踪
- **退出码规范**：0 全过、1 有失败、2 环境不可用

---

## 三、测试流程

### 3.1 日常开发流程

```
改代码
  ↓
npm run verify          ← L1 + L2，<5 秒
  ├─ npm run check      ← L1 语法
  └─ npm test           ← L2 460 用例
  ↓ 通过？
  ├─ 否 → 修
  └─ 是 → 进入下一层
       ↓
   npm run test:e2e:doctor    ← 确认 DevTools 可达
       ↓
   npm run test:e2e:fullpage  ← L3 全量
       ↓
   提交
```

### 3.2 发布前流程

```
npm run release:check
  ├─ check:deployment    ← 云函数清单完整性
  ├─ verify              ← L1 + L2
  └─ test:coverage       ← 覆盖率检查（80% 行 + 80% 函数）
       ↓
npm run test:e2e:fullpage      ← L3 全量
npm run test:e2e:real-image    ← 真实图片 E2E（人工验收）
       ↓
DevTools CLI preview           ← 真机预览
       ↓
发布
```

### 3.3 CI 流程（建议）

```yaml
# .github/workflows/test.yml
jobs:
  L1-L2:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout
      - uses: actions/setup-node (v22)
      - run: npm run verify
      - run: npm run test:coverage

  L3-render:
    runs-on: macos-latest  # 微信开发者工具只支持 macOS/Windows
    steps:
      - uses: actions/checkout
      - run: npm i --no-save miniprogram-automator
      - run: npm run test:e2e:doctor
      - run: npm run test:e2e:fullpage
      - uses: actions/upload-artifact (截图 + report.json)
```

---

## 四、从 PRD 到测试用例的映射

### 4.1 已建立映射（当前 TEST_MATRIX.md 覆盖）

TEST_MATRIX.md 已经逐条映射了 PRD 功能 → 测试文件 → 覆盖状态。当前矩阵覆盖完整，无遗漏的 P0 功能。

### 4.2 映射缺口（后续补）

| PRD 描述 | 当前状态 | 建议测试层 |
|----------|---------|-----------|
| 验证结论区分答对/空白/OCR 漏识别 | ⚠️ 已知差距 | L2 + L3 |
| 微信订阅消息推送 | ⚠️ 空实现 | 人工验收 |
| 默认试卷跨学生共享模板 | ⚠️ 未实现 | L2 合约（实现后） |
| 真机相机、CloudBase AI、打印 | ⬜ 待验收 | 真机手动 |
| single-profile 模式进 student-profile 的入口 | ⬜ 缺失（见下方发现） | L3 E2E |

### 4.3 本次测试发现的设计偏差

通过 L3 全量测试发现了一个**产品设计缺口**：

**问题**：`homeMode === 'single-profile'`（单学生）模式下，首页没有任何入口进入 `student-profile` 页面。hero-card 无 `bindtap`，nav 区域只有"管理孩子"（跳 add-student）和"家长管理"（跳 parent-management）。

**PRD 描述**（Page 1A 第 66 行）：
> 交互：点击最新报告 → Page 6；点击学习卡点 → Page 11/12；点击学科 → Page 3；点击家长管理 → Page 5A。

PRD 没有描述"从首页如何进入 student-profile"。但在 family-workbench 模式下，`.child-card` 上绑了 `onStudentTap`，可以跳转。**两个模式的数据入口不一致**。

**影响**：当前 L3 E2E 的 scenario 1 "家庭工作台 → 学生档案" 必须在 family-workbench 模式（≥2 学生）下才能跑通。如果用户只有一个孩子，该系统路径不存在。

---

## 五、测试数据管理

### 5.1 L2 测试数据

- 所有测试数据在 `test()` 闭包内定义，作用域即生命周期
- 云函数 harness 的 `createDatabase(initial)` 接受初始数据，测试完自动丢弃
- 不读真实数据库，不依赖 CloudBase 环境

### 5.2 L3 测试数据

- cloud mock 在 `devtools-e2e-fullpage.js` 顶部定义：
  - `student` / `student2`：两个测试学生（触发 family-workbench 模式）
  - `subjectProfiles`：数学学科档案（含卡点 LP-001、LP-008）
  - `reports`：两份报告（diagnosis + verification）
  - `papers`：一份验证卷
  - `members`：owner + viewer
- 所有日期固定为 `2026-06-17T09:30:00+08:00`，保证可重复
- mock 通过 `miniProgram.evaluate()` 全局注入，后续所有页面都走 mock

### 5.3 真实数据测试

- `devtools-real-data-smoke.js` 需要真实学生 ID：`REAL_DATA_STUDENT_ID=...`
- `e2e-real-image.test.js` 需要真实图片路径：`REAL_IMAGE_PATH=/path/to/photo.jpg`
- 这两种不进 `npm test`，发布前单独跑

---

## 六、持续改进机制

### 6.1 新增功能的测试要求

```
功能开发完成 ≠ 可以合入
                 ↓
          三件事必须做：
          1. L2：写一条 test() 覆盖核心逻辑路径
          2. L3：在 e2e-fullpage.js 对应页面加 expect.text 断言
          3. 跑 npm run release:check
```

### 6.2 发现 bug 后的流程

```
发现 bug
  ↓
1. 写一条 L2 测试复现（RED）      ← 这就是回归测试
  ↓
2. 修 bug（GREEN）
  ↓
3. 如果 bug 是页面渲染级别的 → L3 加一条 expect 断言
  ↓
4. npm run verify + npm run test:e2e:fullpage
```

### 6.3 测试腐烂防护

- **断言过严 / 过时**（本次遇到的主要问题）：每次改产品文案后，更新对应 L3 断言
- **`notText` 误伤**（本次"当前综合摘要"）：`notText` 应该只禁止真正的异常文案（"加载中"、"页面不存在"），不要禁止正常模块名
- **selector 腐烂**（本次 `.child-card-top`）：前端改了 class 名后更新对应 selector

---

## 七、工具链总览

| 工具 | 层级 | 触发 | 耗时 | 退出码 |
|------|------|------|------|--------|
| `npm run check` | L1 语法 | 每次保存 | <1s | 0/1 |
| `npm run check:deployment` | L1 部署 | 发布前 | <1s | 0/1 |
| `npm test` | L2 逻辑 | 每次提交 | <3s | 0/1 |
| `npm run test:coverage` | L2 覆盖率 | 发布前 | <5s | 0/1 |
| `npm run verify` | L1+L2 | 每次提交 | <5s | 0/1 |
| `npm run test:e2e:doctor` | L3 环境 | L3 前置 | <5s | 0/1/2 |
| `npm run test:e2e:fullpage` | L3 全量 | 发布前/PR | ~2min | 0/1/2 |
| `npm run test:e2e:real-image` | L3 真图 | 人工验收 | 按需 | 0/1 |
| `npm run release:check` | ALL | 发布前 | 全部 | 0/1 |

---

## 八、下一步建议

### 优先级 P0（本周可做）

1. **把 L3 E2E 加入 `release:check`**：目前只有 L1+L2+覆盖率，L3 全量通过后也应为门禁
2. **加一条 contract 测试**：验证 `_shared/bottleneck-name.js` 和 `miniprogram/utils/bottleneck-name.js` 两份文件内容一致（已知差距，防漂移）
3. **修复 E2E 脚本退出码**：当前有 FAIL 也返回 0（已追踪到原因，需单独修）

### 优先级 P1（下周）

4. **单学生 → student-profile 入口**（产品决策）
5. **自动化截图 diff**：L3 全量每次跑完对比上次截图，发现 UI 回归（视觉回归测试）
6. **CI 集成**：GitHub Actions macOS runner 跑 L3

### 优先级 P2（后续迭代）

7. **真机自动化**：通过 `miniprogram-automator` 的 `remote` 模式连接真机
8. **性能基测**：页面加载时间基线和回归检测
9. **测试数据工厂**：抽离 L2 测试的 mock 数据构造逻辑到 `tests/fixtures/`

# 测试框架 V2 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 将测试体系重构为“单元自动化测试”和“通过微信开发者工具 CLI 调用的 end-to-end 测试”两大类，并把页面 E2E 按学科组织，优先固化数学学科完整链路。

**Architecture:** 单元自动化测试继续使用 Node.js 内置 `node:test` 和现有 harness，作为日常提交门禁。CLI E2E 统一由微信开发者工具 CLI + `miniprogram-automator` 驱动，并按 `core / math / chinese / english / real-data` 分套件输出结构化报告。聚合器读取统一输出目录，避免脚本之间路径和命名漂移。

**Tech Stack:** Node.js 内置 test runner、`node:assert/strict`、微信开发者工具 CLI、`miniprogram-automator`、现有 `tests/helpers/*` harness。

## Global Constraints

- 不引入第三方测试框架；单元测试继续基于 `node:test`。
- 普通开发默认只跑离线、可重复的单元自动化测试，不依赖真实 CloudBase、真实图片或微信开发者工具。
- CLI E2E 必须通过 `npm run test:e2e:doctor` 先确认环境。
- 页面 E2E 按学科拆分；数学学科优先完整，语文与英语允许分阶段补齐。
- E2E 产物统一保存在 `tmp/e2e/<suite>/`，不提交截图、JSON 报告或真实学生数据。
- 真实数据与真实图片 E2E 只作为人工验收，不进入默认 `npm test`。

---

## 1. 目标结构

| 类别 | 入口命令 | 运行环境 | 覆盖范围 | 通过标准 |
|---|---|---|---|---|
| 单元自动化测试 | `npm run test:unit` / `npm test` | 本地 Node.js | 云函数、Presenter、工具函数、数据层、合同、知识库一致性、诊断回归 | `node:test` 全部通过 |
| 单元覆盖率 | `npm run test:coverage` | 本地 Node.js | 与单元自动化同源 | 行覆盖率和函数覆盖率达到 80% |
| CLI E2E 环境检查 | `npm run test:e2e:doctor` | 微信开发者工具 CLI | CLI、项目配置、automator 可用性 | 退出码 0 |
| CLI E2E 核心页面 | `npm run test:e2e:core` | 微信开发者工具 CLI | 17 页面 + 跨页基础流程 | 报告无失败页面 |
| CLI E2E 数学 | `npm run test:e2e:math` | 微信开发者工具 CLI | 数学工作台、诊断报告、细卡点、知识地图、资源、验证卷 | 报告无失败场景 |
| CLI E2E 语文 | `npm run test:e2e:chinese` | 微信开发者工具 CLI | 语文错项复习和验证卷链路 | 初期允许指向核心页面占位，后续补专属脚本 |
| CLI E2E 英语 | `npm run test:e2e:english` | 微信开发者工具 CLI | 英语工作台、自动导入、认词练习、纸面听写、学习记录、错词本、空态 | 报告无失败用例 |
| CLI E2E 全量 | `npm run test:e2e:all` | 微信开发者工具 CLI | core + math + english + 聚合报告 | 聚合报告无失败 |
| 真实数据烟测 | `npm run test:e2e:real-data` | 微信开发者工具 CLI + 真实 CloudBase 数据 | 指定学生真实页面渲染 | 页面可打开且截图输出 |
| 真实图片 E2E | `npm run test:e2e:real-image` | Node.js + 真实图片或 mock | 上传图片到诊断报告链路 | mock 或指定 manifest 通过 |
| 真实云 E2E | `npm run test:e2e:real-cloud` | Node.js + 真实云函数 | 真实云函数可用性 | `RUN_REAL_CLOUD=1` 时通过 |

## 2. 学科 E2E 划分

| 学科 | 当前基础 | V2 定位 | 短期动作 |
|---|---|---|---|
| 数学 | `devtools-e2e-data-driven.js`、`devtools-knowledge-map-e2e.js`、`devtools-e2e-fullpage.js` | 最完整主链路，作为 CLI E2E 样板 | 新增 `test:e2e:math` 聚合数学专项脚本 |
| 语文 | 单元层已有 `chinese-review-targets.test.js` 和验证卷逻辑，页面 E2E 不完整 | 具体错项和验证题一一对应链路 | 新增 `test:e2e:chinese` 入口，先保留文档化占位，后续接专属脚本 |
| 英语 | `devtools-english-e2e.js` 和 `tests/fixtures/english-devtools-test-cases.json` | 专属学科 E2E | 每个用例沉淀 route、steps、dataAssertions、artifacts，旧命令 `test:devtools-english` 保留兼容 |
| 通用/家庭 | `devtools-e2e-fullpage.js`、`devtools-parent-timeline-e2e.js` | 非学科基础页面和家庭成员链路 | 新增 `test:e2e:core`，保留家长时间线兼容入口 |

## 3. 输出目录规范

| 套件 | 输出目录 | 主报告文件 |
|---|---|---|
| core | `tmp/e2e/core/` | `report.json` |
| math-data | `tmp/e2e/math-data/` | `report.json` |
| math-knowledge-map | `tmp/e2e/math-knowledge-map/` | `report.json` |
| chinese | `tmp/e2e/chinese/` | `report.json` |
| english | `tmp/e2e/english/` | `report.json` + `ENG-*-initial.png` + `ENG-*-after-*.png` |
| real-data | `tmp/e2e/real-data/` | `report.json` |
| aggregate | `tmp/e2e/aggregate/` | `aggregate-report.md` |

兼容期内，脚本可继续识别历史输出文件名，例如 `results.json`、`data-driven-report.json`，但新脚本和文档统一使用 `report.json`。

## 4. 执行计划表

| 阶段 | 目标 | 文件 | 验收 |
|---|---|---|---|
| Phase 1 | 落盘 V2 测试策略和任务清单 | `docs/TEST_STRATEGY_V2.md` | 文档包含两大测试类别、学科 E2E 划分、输出目录规范和 to-do list |
| Phase 2 | 用单元测试锁定新命令和 E2E 聚合契约 | `tests/contracts.test.js`、`scripts/e2e-report-aggregator.js` | 新测试先失败，说明旧命令和旧目录不符合 V2 |
| Phase 3 | 重构 `package.json` 脚本 | `package.json` | 新增 `test:unit`、`test:e2e:core`、`test:e2e:math`、`test:e2e:chinese`、`test:e2e:english`、`test:e2e:real-data`、`test:e2e:real-image`、`test:e2e:real-cloud` |
| Phase 4 | 统一 E2E 聚合器来源和输出目录 | `scripts/e2e-report-aggregator.js` | 聚合器可读取 `tmp/e2e/*/report.json`，兼容旧报告文件名 |
| Phase 5 | 同步主要测试文档 | `README.md`、`docs/TESTING.md`、`docs/TEST_FRAMEWORK_DESIGN.md`、`docs/TEST_MATRIX.md` | 文档不再以 L0-L4 作为主结构，数字更新到当前基线 |
| Phase 6 | 验证 | `npm test`、`npm run check` | 单元测试和 JS 检查通过；旧目录/旧命令残留只保留兼容说明 |

## 5. To-Do List

- [x] Phase 1：创建本计划文档。
- [x] Phase 2.1：在 `tests/contracts.test.js` 增加 package scripts 合同测试，要求存在 V2 命令入口。
- [x] Phase 2.2：在 `tests/contracts.test.js` 增加 E2E 聚合器合同测试，要求读取 `tmp/e2e/*` 标准目录并兼容 `report.json`。
- [x] Phase 2.3：运行 `node --test --test-name-pattern="E2E test framework V2" tests/contracts.test.js`，确认新增测试在旧实现下失败。
- [x] Phase 3.1：修改 `package.json`，新增 V2 命令，并保留旧命令兼容别名。
- [x] Phase 3.2：修改 `scripts/devtools-*.js` 的默认输出目录到 `tmp/e2e/<suite>/`，必要时保留参数覆盖能力。
- [x] Phase 4.1：修改 `scripts/e2e-report-aggregator.js`，统一读取 V2 输出目录。
- [x] Phase 4.2：聚合器兼容 `report.json`、`results.json`、`data-driven-report.json` 和时间戳报告。
- [x] Phase 5.1：更新 README 测试段落为“两大类”。
- [x] Phase 5.2：重写 `docs/TESTING.md` 的命令表、E2E 分学科说明和输出目录说明。
- [x] Phase 5.3：更新 `docs/TEST_FRAMEWORK_DESIGN.md`，从 L1/L2/L3 改成 Unit Automation + CLI E2E。
- [x] Phase 5.4：更新 `docs/TEST_MATRIX.md` 的当前基线、命令和缺失测试文件引用。
- [x] Phase 6.1：运行新增合同测试，确认通过。
- [x] Phase 6.2：运行 `npm test`。
- [x] Phase 6.3：运行 `npm run check`。
- [x] Phase 6.4：搜索旧命令、旧目录和过期数字，确认没有误导性主文档残留。

## 6. 后续不在本轮完成的工作

- 语文学科专属 DevTools E2E 脚本：本轮只建立命令入口和文档位置，后续按语文错项复习设计补充场景。
- E2E 公共 helper 抽取：当前脚本重复的 automator 启动、截图、报告输出逻辑较多，本轮先统一契约，后续再抽 `scripts/e2e/lib/*`。
- 将 CLI E2E 加入 `release:check`：本轮不默认加入，避免日常发布命令强依赖微信开发者工具环境。

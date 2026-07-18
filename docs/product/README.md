# Product Documentation

> Scope: product and implementation-facing documents for the Learning Diagnostic WeChat Mini Program.  
> Updated: 2026-07-18

This directory contains the curated product documents that are directly useful for building, maintaining, testing, and extending the mini program.

## Recommended Reading Order

1. [当前 PRD](../../PRD.md)
2. [Learning Diagnostic Product Brief](./learning-diagnostic-product-brief.md)
3. [MVP Roadmap And Product Boundaries](./mvp-roadmap-and-boundaries.md)
4. [Family Learning Workflow](./family-learning-workflow.md)
5. [Subject Design Index](../subject-design/README.md)
6. [Prompt And Agent Design](./prompt-and-agent-design.md)
7. [Architecture](../ARCHITECTURE.md) 与 [Data Dictionary](../DATA_DICTIONARY.md)
8. [Visual User Guide](../user-guide/README.md)

## Product Screens

<p align="center">
  <img src="../user-guide/images/01-family-workbench.png" alt="脱敏家庭学习工作台" width="220" />
  <img src="../user-guide/images/04-report.png" alt="脱敏诊断报告" width="220" />
  <img src="../user-guide/images/07-learning-records.png" alt="脱敏学习记录" width="220" />
</p>

当前产品以“正式诊断报告 → 学习行动 → 验证试卷 → 作答反馈 → 学习记录”为主线。家庭工作台先展示快捷操作和每个孩子的最新正式诊断，再展示行动、统计和紧凑学科状态；个人学习档案展开诊断证据，AI 用量只在家庭首页保留统一入口。验证卷编号使用可读的“学科 + 日期 + 序号”，内部数据编码不面向家长展示。

## Current Delivery Status

| 模块 | 当前状态 |
| --- | --- |
| 数学 | 最完整：照片诊断、150 节点知识地图、细卡点、任务包、验证卷和反馈闭环 |
| 语文 | 已落地具体错项原项复测、相似迁移题与阅读表达微任务 |
| 英语 | 已落地个人词库、认词、纸面听写、双维掌握、易混词和错词本 |
| 家庭工作台 | 多孩子卡片、最新正式诊断、行动建议、学习统计与统一 AI 用量入口 |

## Document Boundary

Keep these materials in this GitHub repository:

- Product requirements that affect mini program behavior.
- Subject design documents that drive pages, cloud functions, prompts, data contracts, and tests.
- Engineering architecture, CloudBase functions, data dictionaries, test matrices, deployment notes, and troubleshooting.
- Desensitized examples and seed data used by the app.

Keep these materials outside this repository:

- Broad AI Learning OS strategy and white paper drafts.
- Investment decks, public article drafts, and communication assets.
- External learning science notes copied from paid or third-party sources.
- Raw student photos, real exam papers, personal reports, PDF/DOCX outputs, and any identifiable child data.

## Source Consolidation

This directory consolidates earlier root-level drafts:

- `19-MVP PRD产品需求文档.md`
- `22-Learning Diagnostic MVP路线图与计划表.md`
- `23-Learning Diagnostic项目需求书.md`
- `11-学习诊断Prompt与Agent设计.md`
- `14-15分钟家庭学习流程.md`
- `16-学习行为数据模型.md`

Those drafts are archived in the local total project knowledge base, not copied wholesale here.

# 项目文档中心

> 更新日期：2026-08-01
> 规则：当前规范以代码和可复现命令为事实来源；带日期的设计、计划、评审和测试报告保留当时结论，不作为当前基线。

## 第一次了解项目

1. [GitHub 项目主页](../README.md)：产品价值、界面、三学科设计、架构和快速开始。
2. [图文用户导览](user-guide/README.md)：用 14 张脱敏截图了解完整使用流程。
3. [产品需求 PRD](../PRD.md)：当前产品范围、角色、主流程和验收标准。
4. [产品文档索引](product/README.md)：产品简报、路线图、家庭流程和 Prompt 设计。

## 开发与维护

| 主题 | 当前权威文档 |
| --- | --- |
| 系统边界与模块关系 | [系统架构](ARCHITECTURE.md) |
| 云函数入参、出参与错误 | [云函数 API](CLOUD_FUNCTIONS.md) |
| 集合与字段 | [数据字典](DATA_DICTIONARY.md) |
| 本地和云环境配置 | [部署指南](../SETUP.md) |
| 部署、烟测与回滚 | [部署与烟测](DEPLOYMENT.md) · [发布清单](RELEASE_CHECKLIST.md) |
| 自动化测试与 E2E | [测试指南](TESTING.md) · [测试矩阵](TEST_MATRIX.md) |
| 指标与运营观测 | [学习指标](METRICS.md) |
| 常见故障 | [故障排查](TROUBLESHOOTING.md) |
| CLI 与 Skills | [Skill 与 CLI 设计](SKILL_AND_CLI_DESIGN.md) |
| emoji 真机兼容 | [兼容白名单](EMOJI_COMPATIBILITY_WHITELIST.md) |
| 2026-08-01 发布收口证据 | [云部署、真机、E2E 与文档收口报告](test-reports/2026-08-01-release-closure.md) |

## 学科设计

从[学科设计索引](subject-design/README.md)进入。当前实现分为：

- 数学：知识节点、细粒度卡点、置信度、学习资源和迁移验证。
- 语文：具体错项原项复测与能力型微任务双轨闭环。
- 英语：个人词库、认词和拼写双维状态、纸面听写与错词本。

## 历史材料

以下目录用于追溯决策过程，不应批量改写为当前状态：

| 目录 | 内容 |
| --- | --- |
| `superpowers/specs/` | 已确认的设计规格 |
| `superpowers/plans/` | 对应实施计划 |
| `test-reports/` | 某个提交或日期下的测试结论 |
| `CODEMAPS/` | 代码结构快照 |
| `subject-design/legacy/` | 已被替代或仅供背景参考的学科方案 |

判断某项能力是否已经实现时，优先查看当前代码、[CHANGELOG](../CHANGELOG.md)、[测试矩阵](TEST_MATRIX.md)和最近测试结果，不要只依据历史计划中的勾选状态。

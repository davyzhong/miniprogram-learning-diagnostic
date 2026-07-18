# 数学学习地图与资源库数据索引

> 更新日期：2026-07-18。这里保存当前 150 节点知识地图、卡点体系所需的脱敏种子和评审模板；真实试卷、学生身份和可识别诊断报告不得进入本目录。

本目录承接根目录 `26-数学学习地图与资源库升级计划.md` 和 `27-数学学习地图与资源库落地执行TODO.md`，用于沉淀数学学习地图、细颗粒度卡点、资源库、历史错题回放和家庭干预记录。

## 文件说明

| 文件 | 用途 |
| --- | --- |
| `knowledge-nodes.seed.json` | 小学数学知识地图节点种子数据 |
| `bottleneck-taxonomy-v2.seed.json` | 细颗粒度学习卡点库 |
| `learning-resources.seed.json` | 全网学习资源链接、评价和推荐等级 |
| `historical-error-replay.seed.json` | 历史错题到知识节点和细卡点的回放标注 |
| `student-node-mastery.example.json` | 钟青羽数学节点掌握状态样例 |
| `intervention-sessions.example.json` | 家庭干预会话样例 |
| `resource-review-template.md` | 资源评价模板 |
| `intervention-session-template.md` | 单次家庭干预记录模板 |
| `weekly-review-template.md` | 每周知识地图复盘模板 |

## ID 规则

| 对象 | 规则 | 示例 |
| --- | --- | --- |
| 知识节点 | `MATH-<DOMAIN>-<TOPIC>-<DETAIL>` | `MATH-NUM-DEC-MUL-POINT` |
| 细卡点 | `BN-<TOPIC>-<ERROR>` | `BN-DEC-MUL-POINT-COUNT` |
| 学习资源 | `RES-<PLATFORM>-<NODE>-<SEQ>` | `RES-BILI-DEC-MUL-001` |
| 干预会话 | `SESSION-YYYYMMDD-<SEQ>` | `SESSION-20260616-001` |

## 执行原则

- 数据先服务家庭自用，不以产品化为首要目标。
- 资源只保存链接、摘要、评价和适用场景，不搬运正文或视频。
- 孩子不直接刷平台信息流；资源由家长筛选后定向使用。
- 官方资源用于准确性校验和备用讲法，不作为默认首选。
- AI 初次诊断只生成候选卡点，确认卡点必须经过微验证或后续证据支持。

# 数学节点掌握状态闭环 — 设计

> 日期：2026-07-17
> 状态：APPROVED（随 V3 总计划批准；代码实现等待 B1 批次收尾后启动）
> 上游：会话计划 `V3 数学学习地图推进 — 实施计划` Phase B；`27-数学学习地图与资源库落地执行TODO.md` Phase 6；`docs/subject-design/math/math-learning-map-roadmap.md` Phase 5；`钟青羽数学诊断输出合同v2.md`

## 背景

Phase A 之后，诊断报告的 `nodeIds` 已 100% 归并到 91 个标准知识节点。但"掌握状态"仍然零落地：无存储、无状态机、无写路径，知识地图页只是卡点列表。掌握模型目前存在三套词汇，必须先定版：

| 来源 | 词汇 |
| --- | --- |
| `27-TODO` Phase 6 | unobserved / suspected_gap / learning / partial / mastered / regressed |
| `math-learning-map-roadmap.md` Phase 5 | unobserved / suspected_gap / relearning / partial_mastery / mastered / recurring |
| `data/math/student-node-mastery.example.json` | mastered / mostlyMastered / partial / weak / unknown（五态） |
| 线上瓶颈层状态（BN/LP 粒度，保留不动） | improved / persisting / needs_verification / recurring |

## 设计决策

### 1. 六态词汇定版（节点粒度唯一权威）

采用仓内 roadmap 文档命名：**`unobserved / suspected_gap / relearning / partial_mastery / mastered / recurring`**，与 `27-TODO` §8.3 的六个展示态一一对应：

| status | 展示 | 含义 |
| --- | --- | --- |
| `unobserved` | 未观察 | 无任何证据（默认态，不落库） |
| `suspected_gap` | 疑似漏洞 | 错题指向节点，未微验证确认 |
| `relearning` | 正在重学 | 验证失败确认卡点，修复进行中 |
| `partial_mastery` | 部分掌握 | 资源学习 + 当场练习通过 |
| `mastered` | 已掌握 | 间隔复测通过 |
| `recurring` | 复发 | 掌握/部分掌握后同类错误再现 |

瓶颈层状态（improved/persisting 等）是 BN/LP 粒度，保持不变；两者并存，不互相替代。

example 数据文件五态 → 六态迁移映射：`unknown→unobserved`、`weak→suspected_gap`、`partial→partial_mastery`、`mostlyMastered→mastered`（confidence 保留）、`mastered→mastered`。

### 2. 存储：studentNodeMastery 集合

每文档 = 一个 (studentId, subject, nodeId)：

```
{ studentId, subject: 'math', nodeId, status, confidence: 0-1,
  evidenceRefs: [{ type, sourceId, summary, at }],   // 追加式
  activeBottleneckIds: [], lastEvidenceAt, lastPracticedAt,
  nextReviewAt: null, createdAt, updatedAt }
```

- `unobserved` 不落库（无记录即未观察），控制集合体积。
- `database/indexes.json` 加复合索引 `studentId asc + subject asc + nodeId asc`，`requiredBy` 列三个消费函数；`npm run check:indexes` 守护。
- SETUP.md / docs 集合清单补登（对齐 1535ec8 的做法）。
- 读写走既有 access 模块的 family/student 校验（同 subjectProfiles）。

### 3. 状态机（纯函数）

`node-mastery.js`，事件驱动，四事件：

| 事件 | 转移 | 守卫 |
| --- | --- | --- |
| `errorEvidence`（新错题指向节点） | unobserved→suspected_gap；mastered/partial_mastery→recurring | suspected_gap/relearning/recurring 不变（不重复降级） |
| `verificationFailed`（验证/微验证失败） | suspected_gap/unobserved/recurring→relearning | mastered/partial_mastery→relearning（证据直接推翻） |
| `resourcePracticePassed`（资源包当场练习通过） | relearning→partial_mastery | 其他状态不变（不允许跳级） |
| `verificationPassed`（验证通过） | relearning→partial_mastery；partial_mastery→mastered | 升 mastered 需距 lastPracticedAt ≥24h（间隔复测语义；24/72h 完整调度在 Phase C） |

原则：任何状态不得由单次 AI 判断直接置 mastered；所有降级必须带证据引用；confidence 用证据条数/强度的简单启发式（实现内给出，测试只约束 0-1 边界与单调性）。

### 4. 写路径

- **analyzePhotos**：在 `analysis-artifacts.js` 报告组装处（Phase A enricher 接线点之后、`buildProfileSummary` 之前）调 `node-mastery-writer`：
  - 普通诊断报告：bottlenecks[].nodeIds → `errorEvidence`；
  - 验证卷报告：verificationEvidence 按 targetId(BN)→nodeId（经 taxonomy 镜像）→ `verificationFailed` / `verificationPassed`。
- **learningResource**：`completePack` 当场练习通过时 → `resourcePracticePassed`。
- 状态机 + writer 按仓惯例随函数打包（每消费函数一份拷贝 + 一致性测试），不恢复 `_shared` 目录。

### 5. 读路径

- `studentData` 新 action `getNodeMasteryMap(openId, studentId, subject)` → records 数组。index.js 只加薄分发（当前 745-799 行，接近 800 行部署上限；逻辑全部放 `studentData/node-mastery.js`）。

### 6. 知识地图页升级（等 B1 批次收尾后实施）

- 数据源：前端 `miniprogram/data/math/knowledge-nodes.seed.js`（91 节点，已有镜像）× `getNodeMasteryMap` records 合并；无记录节点 = unobserved。
- 四领域分组；组内按状态优先级排序（recurring > suspected_gap > relearning > partial_mastery > mastered > unobserved）。
- 状态标记走 B1 统一后的 `STATUS_META`（bottleneck-view 单一来源），新增节点态 → STATUS_META 映射；不另起文案。
- 节点详情沿用 bottleneck-detail 已有的知识位图展示，不新建页面。

### 7. 数据迁移与文档

- `student-node-mastery.example.json` 按决策 1 映射重写为六态；`tests/math-learning-map-seed.test.js` 同步更新。
- `知识地图外显设计文档.md` 状态 DRAFT→APPROVED（三阶段已落地：首页卡片 index-presenter.js:94、报告嵌入 report-presenter.js:573、独立页 + 外显测试 14 例）。
- `math-learning-map-roadmap.md` Phase 5 标注"以本设计为权威实现口径"。

## 测试与验收

- 新增 `tests/node-mastery.test.js`：全转移路径 + 守卫（不降级、不跳级、recurring 回退）+ confidence 边界。
- 新增 `tests/node-mastery-writer.test.js`：模拟诊断报告/验证卷报告 → 期望转移；writer 多拷贝一致性。
- 扩展 studentData action 测试、knowledge-map presenter/wiring 测试。
- 新测试文件登记 `package.json` 的 `test:unit` 和 `test:coverage`。
- `npm run verify` + `npm run test:coverage`（80% 门槛）全绿。
- **验收**：一条历史错题走通 unobserved→suspected_gap→relearning→partial_mastery→(≥24h 验证通过)→mastered→recurring 全链；知识地图页展示 91 节点六态；合并前跑 `npm run test:e2e:knowledge-map`。

## 明确不做（本阶段）

- 24/72h 复测调度与到期提醒、interventionSessions 集合 → Phase C。
- 节点数据扩充（91→150+）、isNew 候选被 enricher 丢弃的回溯利用 → Phase D。
- 图谱可视化、初中覆盖（沿 TODO §12）。

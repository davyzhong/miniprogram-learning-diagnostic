# 干预会话与 24/72h 复测调度 — 实施计划

> 日期：2026-07-17
> 上游：`docs/superpowers/specs/2026-07-17-math-node-mastery-loop-design.md`、V3 总计划 Phase C
> 状态：已完成（verify 1058/1058，2026-07-17）

## 任务清单

### C-1 干预会话沉淀

- [x] `cloudfunctions/learningResource/intervention-session-writer.js`：completePack 时自动创建 `interventionSessions` 记录（sessionId 按 `SESSION-YYYYMMDD-NNN` 日期编序；resourcesUsed、当场练习结果、masteryUpdate 前后状态、review24At/review72At、pending 状态）
- [x] `node-mastery-writer.js` 返回增强（beforeStatus/nodeId/nextReviewAt）供会话记录使用
- [x] 集合缺失容错（-502005 自动建集重试）；非数学/缺节点安全跳过
- [x] `database/indexes.json` 新增 interventionSessions `studentId+date` 索引（check:indexes 通过）

### C-2 到期复测进今日行动

- [x] 首页两条数据路径都接入：getHomeDashboard 聚合路径新增 `_loadDueReviewsByStudentId`（按学生拉取 mastery 到期记录，失败降级为空）；1+N 路径在 Promise.all 中并行拉取
- [x] `index-presenter.js` 新增 `buildDueReviewActionItem`：到期节点置顶行动卡（⏰ N 个知识点到期复测），有关联卡点直跳验证卷配置器（targetCode 预选），无则回退知识地图
- [x] 节点标题从前端 knowledge-nodes 镜像解析，不向家长暴露 nodeId

### C-3 scheduleVerification 写实调度

- [x] `scheduleNodeReview`：把节点 nextReviewAt 写实到 studentNodeMastery（24h 后），仅更新已存在记录
- [x] `scheduleVerification` action 接入并返回 review24At/reviewNodeId（兼容原 pack 标记）

### 测试

- [x] `tests/intervention-session-writer.test.js`（8 例：会话字段/编序/容错/调度/行动卡/接线）
- [x] `tests/learning-resource-mastery.test.js` 期望值同步（返回新增 nodeId 字段）
- [x] `npm run verify` 1058/1058 全绿

## 明确不做（本阶段）

- 订阅消息到期提醒（需要定时触发器，另行评估）
- 家庭工作台（多孩子）卡片级到期复测露出（v1 先覆盖个人行动队列）
- interventionSessions 的前端列表页（v1 云端沉淀，今日行动已消费其调度结果）

# 数学节点掌握状态闭环 — 实施计划

> 日期：2026-07-17
> 设计稿：`docs/superpowers/specs/2026-07-17-math-node-mastery-loop-design.md`（含 v1.1 转移表修正）
> 状态：已完成（verify 1050/1050、coverage 门槛通过，2026-07-17）

## 任务清单

### B-1 状态机

- [x] `cloudfunctions/studentData/node-mastery.js`：六态（unobserved/suspected_gap/relearning/partial_mastery/mastered/recurring）+ 四事件（errorEvidence/verificationFailed/verificationPassed/resourcePracticePassed）纯函数状态机
- [x] v1.1 修正：suspected_gap 死端修复（验证通过→unobserved；练习通过/复发→partial_mastery），spec 同步修订
- [x] `tests/node-mastery.test.js`：全转移表 + 守卫（不跳级 mastered、unobserved 不落库、24h 复测间隔）+ confidence 单调性

### B-2 analyzePhotos 写路径

- [x] `database/indexes.json`：studentNodeMastery 复合索引（studentId+subject+nodeId），`check:indexes` 通过
- [x] `cloudfunctions/analyzePhotos/node-mastery-writer.js`：deriveMasteryEvents（普通报告 errorEvidence 按节点去重；验证卷报告 BN→nodeId 映射 passed/failed）+ applyMasteryEventsToCollection（upsert）
- [x] 集合缺失容错（-502005 → 自动建集合，analyzePhotos 包内无 access.js，自带最小判定）
- [x] 接线 `analysis-artifacts.js` writeCompletedAnalysis（画像生效后、仅数学、失败不阻断报告）
- [x] `tests/node-mastery-writer.test.js`

### B-3 learningResource 写路径

- [x] `cloudfunctions/learningResource/math-seeds/` 新增 taxonomy 镜像（build-math-seed-mirrors.js 扩展目标）
- [x] `cloudfunctions/learningResource/node-mastery-writer.js`：completePack → resourcePracticePassed（passed===false 跳过；记分制需全对；manual_complete 视为家长见证通过）
- [x] 接线 `learningResource/index.js` completePack（失败不阻断）
- [x] `tests/learning-resource-mastery.test.js`（含三函数 node-mastery.js 拷贝一致性）

### B-4 studentData 读路径

- [x] `cloudfunctions/studentData/node-mastery-service.js`：getNodeMasteryMap（getStudentAccess 权限守卫 + 集合缺失返回空地图 + 出参裁剪 evidenceRefs 最近 5 条）
- [x] `studentData/index.js` 挂载 action（800 行部署上限内腾挪：合并 wxContext 两行、删一个空行，现压线 800）
- [x] `miniprogram/utils/cloud.js` getNodeMasteryMap 包装
- [x] `tests/node-mastery-service.test.js`

### B-5 知识地图页升级

- [x] `utils/bottleneck-view.js`：NODE_STATUS_META（六态文案/样式单一来源）+ NODE_STATUS_ORDER
- [x] `knowledge-map-presenter.js` buildNodeMapView：150 节点 × 记录合并，风险态优先排序，未观察按领域汇总（避免灰块噪音），nextReviewAt/关联卡点摘要
- [x] `knowledge-map.js` 双请求并行加载（先挂 rejection 处理再 Promise.all，修复 mock 缺失导致的 unhandledRejection 风险）
- [x] `knowledge-map.wxml/wxss` 节点掌握地图区块
- [x] `tests/knowledge-map-node-map.test.js`；page-controller/wiring/hygiene 测试保持绿

### B-6 数据迁移与门禁

- [x] `student-node-mastery.example.json` 五态→六态迁移（unknown→unobserved、weak→suspected_gap、partial→partial_mastery、mostlyMastered→mastered），statusScale 重写
- [x] 全部新测试登记 package.json test:unit + test:coverage
- [x] `npm run verify` 1050/1050 全绿；`npm run test:coverage` 80% 门槛通过

## 遗留（后续阶段）

- [ ] Phase C：24/72h 复测调度（nextReviewAt 已写入，今日行动接入未做）、interventionSessions 集合、订阅消息提醒
- [ ] Phase D-3：BN 28→40、资源覆盖核查、CHANGELOG
- [ ] 真实数据验证：新诊断报告产生后确认 studentNodeMastery 记录生成（需真机/真实云回归 `npm run test:e2e:real-cloud`）
- [ ] DevTools E2E：`npm run test:e2e:knowledge-map`（需本机 DevTools 环境）

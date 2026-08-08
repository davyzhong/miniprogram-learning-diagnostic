# 家长管理与学习时间线测试记录

测试时间：2026-06-13

## 测试范围

- 微信开发者工具预览包生成。
- 微信开发者工具自动化预览点击测试。
- 学习档案首页加载。
- 家长管理入口、成员列表、邀请另一位家长。
- 扫码加入页面与加入后回到学习档案首页。
- 学习记录时间线入口、数学筛选、报告详情、验证试卷预览、照片预览入口。
- 后台单元测试与项目级 JS 检查。

## 发现的问题

- 学习档案首页可以看到历史记录，但进入学习记录时间线后显示 0 条。
- 根因是学习记录页仍优先读取旧的 `reports/papers` 集合查询；在家长共享访问场景下，应该优先通过 `studentData.getLearningTimeline` 云函数读取同一份共享档案数据。
- 真实云端家长管理页面进入后报“家长管理操作失败”，根因是 `studentMembers` 和 `studentInvites` 两个新集合尚未创建，`studentAccess` 查询成员时直接抛出 `-502005`。

## 修复结果

- `upload-history` 页面已改为优先走共享时间线接口，旧集合查询仅作为兜底。
- `studentAccess` 已支持首次进入时自动初始化家长成员/邀请集合，并已重新部署到 `cloud1-d6gneg68m5a7a3876`。
- 新增单元测试覆盖“优先使用共享时间线，不误走旧查询”。
- 新增单元测试覆盖“家长管理集合不存在时，创建者首次进入可自动建表并生成邀请”。
- 新增 `npm run test:devtools-parent-timeline`，用于复跑微信开发者工具点击测试。

## 验证结果

- `node --test tests/page-flows.test.js`：44/44 通过。
- `node scripts/devtools-parent-timeline-e2e.js`：10/10 通过。
- `npm run verify`：182/182 通过，JS 检查 61 个文件通过。
- 真实云端只读/点击检查：钟青羽学习档案存在；学习记录显示 14 条数学记录；家长管理显示档案创建者；生成邀请成功。

自动化截图：

- `/tmp/learning-diagnostic-parent-timeline-index.png`
- `/tmp/learning-diagnostic-parent-management.png`
- `/tmp/learning-diagnostic-learning-timeline.png`

# 可靠性修复、可视化升级与 emoji 全量接入工作报告

日期：2026-07-18

## 背景

本轮工作起于 2026-07-17 的完整代码与功能评审（`code-reviews/code-review-2026-07-17.md`，工作区仓库外），按"发布风险 → 断链 → 性能 → 一致性 → 可视化"顺序推进，随后完成 202 个已验证 emoji 的全量接入与界面图标化。全部改动已推送到 GitHub main。

## 最终验证基线

| 检查 | 结果 |
|---|---|
| `npm test` | 1006 / 1006 通过（评审时基线 845） |
| `npm run check` | 311 个 JavaScript 文件通过 |
| `npm run test:coverage` | 80% 行/函数门槛通过 |
| 主包体积 | 788 KB / 1200 KB 预算（预算于 2026-07-18 由 800 KB 上调，微信硬限制 2 MB） |
| 注册页面 | 25 个（主包 8 + 分包 17），另有 `components/status-view` 公共组件 |

## 一、发布风险修复（2026-07-17 首批 8 个提交）

| 修复 | 内容 |
|---|---|
| 图标测试入口管控 | 图标兼容性测试入口默认不在家庭首屏展示，`wx.setStorageSync('iconCompatibilityEntryEnabled','1')` 后恢复（`pages/index/index.js`） |
| 真实学生名清除 | 英语练习/听写/错词本等 6 处用户可见文案的真实姓名兜底改为"孩子"，同步 E2E fixture |
| paper-preview 死路按钮 | 预览模式（无 studentId/paperId）不再渲染"上传作答照片"次级按钮 |
| 验证卷卡死恢复 | `studentData` 对 generating 超 10 分钟无写入的验证卷标记 `stale`；`regenerateVerificationPaper` 新增 `resume` action（权限校验 + 活跃生成拒绝 + failed 重置后续跑）；前端 `navigateToVerificationPaper` 在 stale/failed 时弹窗引导重试，resume 调用 60s 超时 |
| 移除共同家长 | parent-management 成员行接入"移除"（owner 专属、二次确认、调 `revokeStudentMember`）；设计文档本就包含该能力，测试契约已修正 |
| 学习资源外链修复 | 修掉 `&&`/`||` 优先级错误与"跳转成功也弹复制提示"；假 appId 占位改为"未配置真实 appId 统一复制链接" |
| 语文微任务静默失败 | chinese-skill-task 提交/加载失败有 toast 提示 |
| 集合清单补全 | SETUP.md/README 补上 `chineseSkillAttempts`、`englishPracticeAttempts`（按旧文档新部署这两个功能必坏） |

## 二、性能批次（cfad138）

- **报告页轻量轮询**：分析进行中每 tick 只调 `getAnalysisProgress`（约省 90% DB 读），终态才拉一次 `getReportDetail`；`analysis-poller` 新增 `isProgressTerminal` 选项。
- **分析超时自动恢复**：report 页接入 `bindPageStatus`，分析完成事件驱动自动刷新；轮询超时文案改为"完成后本页会自动刷新"。
- **验证卷轮询预算**：120s → 6 分钟（5s × 72），超时引导至学科首页/学习记录。
- **上传**：3 路并发池（保序、单张失败不阻塞）；HEIF 转换 quality 92→80、限宽 1600px；去重读取从"拉 20 份全量报告"改为 `studentData?action=listRecentImageFileNames`（服务端 field 投影，仅返回文件名）。

## 三、一致性批次（92e92a6）

- **学科色单源化**：淘汰 `#1f4f82`/`#2b6cb0`/`#9c4f24`/`#c05621` 三套旧色，全部统一到 app.wxss 的 B1 token（`var(--b1-*)`），并有测试断言旧 hex 不再出现。
- **置信度全局执行**：`buildConfidence` 唯一实现（●●● 高 / ●●○ 中 / ●○○ 低，阈值 75/45），bottleneck-center、index、subject-home 的卡点展示全部补齐。
- **卡点状态文案单源**：`bottleneck-view.js` 的映射为唯一来源，learning-progress、knowledge-map-presenter、report-presenter 的三份私货已删除（`status-text-single-source.test.js` 守护）。
- **公共状态组件**：新建 `components/status-view`（loading/empty/error+retry），knowledge-map、learning-resource、learning-progress、report 的错误态从"死路文本/toast-only"改为"文案+重试按钮"。

## 四、可视化批次（b27cfef）

- **learning-progress**：卡点矩阵从文字升级为 B1 状态色块热力图，页头加改善率 pill；入口从 1 处（report.js 程序化跳转）增加到首页孩子卡"已改善"指标、subject-home 状态块、report 页三处（`buildTraceableUrl` 统一）。
- **index 首页**：孩子卡四指标下加三色状态构成堆叠条（金/红/绿）；family hero 同构汇总条；三科行迷你条；`trendText`（之前算了没渲染）显示为状态 pill。
- **report 页**：页头从旧冷蓝并入 B1 暖墨 + 学科色底边（修掉英语被错映射为绿色）；`buildTrendSummary` 结构化 → 变化构成色带；验证报告加通过率三段色带（通过/未通过/不确定）。
- **其他**：subject-home 英语词库构成条、bottleneck-detail 通过率双色条 + 横向点状证据时间线、knowledge-map 领域掌握度条、bottleneck-center 状态构成条。共享实现：`utils/status-segments.js` + app.wxss 的 `.b1-seg-*` 公共类。
- **字号下限**：index.wxss 17 处 17-19rpx 上调至 20rpx，全仓正文无 <20rpx。

## 五、emoji 全量接入（873bd13 + 并行会话的兼容性实验批次）

- **验证资产**：`pages/icon-compatibility`（分包实验室页）完成 202 个候选表情（C01-C14 共 14 类）的 Android 真机验证，全部可显示；第二批数据集与 manifest 校验脚本（`scripts/emoji-compatibility/`）固化基线。
- **白名单**：`utils/ui-symbols.js` 重构为按 C01-C14 组织的 205 键映射（202 规范键 + 3 学科别名），约 6.2KB；ZWJ 家庭组合、键帽、旗帜、肤色修饰符全部解禁；202 之外的野生 emoji 仍被 `bplus-design-system.test.js` 扫描拦截。学科图标：数学 🧮、语文 📖、英语 🔤。
- **底线保留**：emoji 只辅助识别，所有入口和状态必须保留文字标签；正文图标 28-32rpx，空态装饰 64-96rpx；页面经 presenter 用 `symbolOf()` 注入，WXML 不写 emoji 字面量。
- **全局状态符号**：`bottleneck-view.js` 的 `STATUS_META` 增加 `symbolKey`（待验证 ⏳ / 持续 🔴 / 改善 🟢 / 复发 🔁 / 下降 📉），报告、卡点中心、详情页自动受益。
- **全 25 页图标化**：页头、区块标题、动作按钮、空态装饰、时间线记录类型标记（学习记录七种记录类型文字标全部换 emoji）等；家庭 hero 使用 👨‍👩‍👧‍👦 组合图标。
- 设计文档 `docs/superpowers/specs/2026-07-16-math-workbench-confidence-and-emoji-design.md` 已两次追加更新记录（C01-C06 → C01-C14 全量）。

## 六、并行会话的数学线工作（已同批推送）

- 知识节点 91 → **150 个**（`data/math/knowledge-nodes.seed.json`），云函数种子镜像同步刷新（`e2ee848`）。
- 诊断输出 `nodeIds` 归并到标准节点目录，`analyzeBatch` 内置 `knowledge-node-catalog.js`（`b0f081b`）。
- 数学节点掌握闭环（六态模型）完成设计：`docs/superpowers/specs/2026-07-17-math-node-mastery-loop-design.md`（`unobserved / suspected_gap / relearning / partial_mastery / mastered / recurring`，实现待启动）。

## 后续约束（重要）

1. **主包预算已上调至 1200 KB**（2026-07-18，微信硬限制 2 MB）：短期不再紧迫。数学种子数据（`miniprogram/data/math/`，150 节点）仍被主包顶层 require，下沉到分包可回收 ~70 KB，属良好卫生但不再紧急。
2. **云函数部署**：`studentData`（listRecentImageFileNames、stale 标记）、`regenerateVerificationPaper`（resume action）、`analyzeBatch`（节点目录）需在开发者工具重新部署后线上生效。
3. **真机验收**：iOS 尚未系统验证 C14 键帽/旗帜类字形；Android 已全量通过。
4. `getAnalysisProgress` 云函数不返回 `updatedAt`，超 10 分钟的正常分析仍会落入前端超时分支（已有自动刷新兜底，根治需补字段）。
5. 微信订阅消息推送（`sendNotification`）仍为空实现，待申请模板。

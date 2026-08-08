# 测试套件收敛计划

> **日期**：2026-06-16
> **当前状态**：365 个测试，37 个文件
> **目标状态**：~200 个测试，~22 个文件
> **原则**：每个测试必须能回答"它在保护什么风险"——答不上来的就删。

> 2026-07-02 复核：本文是历史收敛计划，当前测试体系已升级为 V2，最新基线见 `docs/TESTING.md`、`docs/TEST_FRAMEWORK_DESIGN.md` 和 `docs/TEST_MATRIX.md`。当前常规自动化为 638 个用例，`subject-select` 页面已从 `app.json` 移除。

---

## 一、问题诊断

### 1.1 测试分布现状

| 文件 | 用例 | 问题 |
|------|:----:|------|
| `page-flows.test.js` | 76 | 单文件 87KB，混杂 17 个页面的流程和边缘 case |
| `contracts.test.js` | 45 | 大部分是源码正则匹配，不是行为测试 |
| `cloud-functions.test.js` | 30 | 合理 |
| 20 个中等文件（5-14） | 155 | 合理 |
| 10 个小文件（3-4） | 46 | 过度拆分，增加认知成本 |
| 其余 | 13 | config/smoke |

### 1.2 三类低价值测试

**类型 A：源码字符串匹配（~30 个）**
`contracts.test.js` 里大量 `assert.match(sourceCode, /pattern/)` — 测试"代码里有没有某个字符串"，不是"代码做了什么"。变量改名、加注释就可能失败，脆弱且价值低。

**类型 B：过度边缘的 fallback 测试（~40 个）**
`page-flows.test.js` 里大量"当 X 接口超时/不可用/返回空时的 fallback"测试。这些场景在真实使用中极少触发，且 fallback 逻辑本身很简单（显示 toast 或降级读取）。

**类型 C：过度拆分的小文件（~15 个）**
3-4 个用例单独成文件（如 `comparison.test.js`、`photo-dedup.test.js`），增加文件导航成本，应该合并到相关的功能测试文件里。

---

## 二、分阶段计划

### 阶段 1：contracts.test.js 瘦身（45 → 15）

**操作**：只保留架构红线，删除代码风格/设计哲学/实现细节检查。

**保留（~15 个）**：

| 保留的测试 | 保护的风险 |
|-----------|-----------|
| cloud SDK 在 database 访问前初始化 | 运行时崩溃 |
| 云函数使用部署配置而非硬编码 env/font | 环境切换失败 |
| 云函数超时配置使用 60 秒 | 平台限制导致超时 |
| generatePaper 不静默回退到无中文字形的字体 | PDF 乱码 |
| 云函数不向客户端返回 stack trace | 信息泄露 |
| 页面使用共享的 cloud 数据访问层 | 架构退化 |
| studentData/reportFeedback 复用 _shared/access | 权限不一致 |
| analyzeBatch prompt 使用共享卡点名 | 前后端卡点名漂移 |
| uploadAndAnalyze fire-and-forget 触发 analyzePhotos | 分析不启动 |
| analysis 由服务端入口可靠启动 | 分析不启动 |
| 已删除的页面和样式保持删除 | 死代码复活 |
| bottleneck summary 使用共享显示名模块 | 显示名不一致 |
| paper display 使用共享 helper | 显示不一致 |
| analysis status 使用共享 poller wrapper | 轮询行为不一致 |
| pages use shared cloud data access layer | 架构退化 |

**删除（~30 个）**：
- "subject home is an action workbench instead of another diagnosis summary" — 设计哲学，不是可测试的行为
- "verification page is framed as a paper configurator" — 同上
- "index page is an adaptive entry and child cards route through student profile tap" — 同上
- "bottleneck center cards use readable status badges instead of punctuation icons" — UI 细节
- "report analyzing CSS class names are spelled correctly" — CSS 拼写
- "subject home relies on native navigation instead of rendering a second top bar" — UI 实现
- "heavy pages keep presentation logic in presenter modules" — 结构性，code review 管
- "single bottleneck actions carry target codes into verification paper generation" — 应由行为测试覆盖
- "upload page does not set a callFunction timeout for analysis" — 实现细节
- 其余"设计意图"和"代码风格"类

**预期**：-30 个测试

---

### 阶段 2：page-flows.test.js 拆分与精简（76 → 25）

**拆分为 4 个文件**，同时删除过度边缘的 case：

| 新文件 | 用例数 | 内容 |
|--------|:------:|------|
| `index-and-profile-flows.test.js` | ~6 | add student、single/multi-child index、student profile |
| `subject-and-workflow.test.js` | ~8 | subject-home、english-practice、english-dictation、english-wrong-words；`subject-select` 已下线，不再纳入新合并目标 |
| `upload-and-paper-flows.test.js` | ~6 | upload、verification、default-paper、paper-preview |
| `report-and-history-flows.test.js` | ~5 | report、upload-history、learning records |

**删除原则**：

1. **删除重复 fallback 变体**：每个页面最多保留 1 个 fallback 测试（最有代表性的那个），删除其余变体。例如：
   - "falls back to legacy student reads when shared access is unavailable" ✅ 保留
   - "falls back to legacy student reads when shared access returns no students" ❌ 删除（同类）
   - "falls back to legacy profile and reports when dashboard request times out" ❌ 删除（同类）

2. **删除纯函数测试**（应属于 unit test）：
   - "traceable actions build deterministic page urls" → 移到 `util.test.js`
   - "paper preview formats default paper names without repeating the grade key" → 移到 `paper-preview-presenter.test.js`
   - "verification page uses current bottlenecks with shared priority sorting" → 移到 presenter 测试

3. **删除过于具体的边缘 case**：
   - "HEIF conversions / skips HEIF that cannot be converted" — 太特定的图片格式处理
   - "upload retry reuses already uploaded images and only uploads missing files" — 重试逻辑的特定实现
   - "upload history degrades gracefully when some temporary URLs are empty" — 极端网络条件
   - "upload history keeps timeline visible when temporary URL loading fails" — 同类
   - "report keeps PDF generation locked until download finishes" — 实现细节

4. **删除"should be unit test"类**：
   - "verification page selects at most five bottlenecks by severity priority" → presenter 测试
   - "verification page shows readable bottleneck summaries instead of LP codes" → 已由 contracts 保护

**预期**：-51 个测试，+3 个新文件（净 -1 文件）

---

### 阶段 3：小文件合并（消除 6 个文件）

| 源文件（删除） | 合并到 | 操作 |
|---------------|--------|------|
| `bottleneck-taxonomy.test.js` (3) | `bottleneck-view.test.js` (4) | 合并 → 7 |
| `comparison.test.js` (4) | `analyze-photos-pipeline.test.js` (8) | 合并 → 12 |
| `photo-dedup.test.js` (3) | `analyze-photos-pipeline.test.js` | 合并 → 15 |
| `english-vocabulary-seed.test.js` (3) | `english-vocabulary-cloud.test.js` (13) | 合并 → 16 |
| `learning-metrics.test.js` (3) | `learning-records.test.js` (13) | 合并 → 16 |
| `project-integrity.test.js` (3) | `deployment-readiness.test.js` (5) | 合并 → 8 |

**合并时审查**：不是简单 append，合并时检查是否有重复覆盖（同一个行为在两个文件里都测了），删除重复项。

**预期**：-6 个文件，~12 个重复测试

---

### 阶段 4：其余文件审查（~10 个测试）

逐文件审查，删除以下类型的测试：

1. **coverage-gap.test.js (7)**：文件名暗示"填覆盖漏洞"，检查每个用例是否已被其他测试覆盖。已被覆盖的删除。
2. **real-image-config.test.js (5) + real-data-smoke-config.test.js (5)**：如果 config 验证已由 deployment-readiness 覆盖，合并或删除。
3. **e2e-real-image.test.js (0 test() calls)**：无 test() 调用，检查是否需要保留（可能是手动运行的脚本）。

**预期**：~10 个测试

---

### 阶段 5：建立长期纪律

在 `docs/TESTING.md` 里加入以下规则：

1. **新增测试必须回答**：这个测试保护什么风险？如果答不上来，不写。
2. **一个行为只测一次**：不要在 page flow 里测已经在 presenter/unit 里测过的逻辑。
3. **不测实现细节**：不测 CSS 类名、变量名、函数调用顺序。只测可观察行为。
4. **fallback 测试上限**：每个模块最多 1-2 个 fallback 测试（最可能触发的那个）。
5. **文件大小上限**：单测试文件 ≤ 300 行。超过就拆分。
6. **季度审查**：每季度跑一次 `wc -l tests/*.test.js`，超过 300 行的文件列入下个迭代的拆分计划。

---

## 三、预期结果

| 指标 | 当前 | 阶段 1 后 | 阶段 2 后 | 阶段 3 后 | 阶段 4 后 |
|------|:----:|:---------:|:---------:|:---------:|:---------:|
| 测试数 | 365 | 335 | 284 | 272 | ~262 |
| 文件数 | 37 | 37 | 39 | 33 | ~31 |

> 注：这是保守估计。实际合并时会发现更多重复，最终预计落在 **200-220** 区间。

---

## 四、执行顺序与节奏

| 阶段 | 工作量 | 风险 | 建议时机 |
|------|:------:|:----:|---------|
| 1 contracts 瘦身 | 小（1-2 小时） | 极低（删的不是行为测试） | 立即可做 |
| 2 page-flows 拆分 | 中（3-4 小时） | 低（需要仔细分类） | 下个迭代 |
| 3 小文件合并 | 小（1-2 小时） | 极低（只是移动代码） | 随时可做 |
| 4 其余审查 | 小（1 小时） | 低 | 随时可做 |
| 5 纪律建立 | 小（30 分钟） | 无 | 阶段 1-4 完成后 |

**建议**：阶段 1 + 3 可以一次做完（都是低风险操作），阶段 2 单独做（需要仔细判断每个 case 的价值）。

---

## 五、验证方法

每个阶段完成后：

1. `npm run verify` — 全部通过
2. `npm run test:coverage` — 覆盖率不低于当前基线（允许 ±2% 波动）
3. 人工检查：被删除的测试是否有对应的行为测试在其他地方覆盖

---

## 六、不做的事

- **不为减测试而减测试**：如果一个测试确实保护了重要风险，即使看起来"多余"也保留
- **不删 e2e 测试**：`e2e-real-image.test.js` 和 `devtools-parent-timeline-e2e.js` 是端到端验证，不在收敛范围
- **不降低覆盖率目标**：收敛的目标是去掉噪音，不是降低质量

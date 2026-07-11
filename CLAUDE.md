# CLAUDE.md

## Project

WeChat Mini Program for K-12 learning diagnosis. Parents photograph exam papers; a CloudBase serverless backend uses AI to detect errors and classify them into a bottleneck taxonomy. The mini program then generates targeted verification papers and compares follow-up uploads to track improvement.

No backend secrets are required — CloudBase AI calls authenticate via the current cloud environment identity. The cloud env ID `cloud1-d6gneg68m5a7a3876` is hardcoded in `miniprogram/app.js` and `project.config.json` (`cloudbaseRoot`); changing environments means editing both.

The WechatSI plugin (`"WechatSI":{"version":"0.3.5","provider":"wx069ba97219f66d99"}` in `app.json`) is load-bearing for English — it provides TTS (`textToSpeech`) for paper dictation and ASR (`getRecordRecognitionManager`) for recognition practice. Do not remove it.

### Product scope & priorities (decide before adding features)

Authoritative in `docs/product/mvp-roadmap-and-boundaries.md`. Current priorities: **P0 traceable verification** → **P1 math knowledge map** → **P2 English written diagnosis** → **P3 Chinese review**.

- **Math is the deepest diagnostic loop** — the photo→diagnosis→bottleneck→verification-paper→feedback chain is fully built for math first. Other subjects scaffold on top.
- **English = written diagnosis only** (拼写/语法/阅读/书写). 口语/听力 are **exploratory, not in the MVP main path** — do not wire oral/listening scoring into the core reports/bottlenecks/papers chain. The WechatSI plugin transcribes but **does not score**; treat ASR output as candidate text requiring parent/AI judgment.
- **Chinese focuses on concrete review items, not broad labels** — preserve item-level evidence and follow-up status.
- This repo implements the **Learning Diagnostic** product, NOT the full AI Learning OS platform. Whitepapers, fundraising narratives, public-article drafts, raw student materials, and external paid-course notes are **out of scope** for this repo (see `docs/product/mvp-roadmap-and-boundaries.md` §3).

## Commands

There is no CLI build for the mini program itself — compilation, preview, and cloud-function deployment happen in the **WeChat Developer Tools IDE** (compile = 编译, deploy a cloud function = right-click its dir → "上传并部署：云端安装依赖"). Set cloud functions to the platform max timeout of **60s**.

The test framework is **V2 (two categories)** — see `docs/TEST_STRATEGY_V2.md`. The old L0–L4 layered model is retired.

**Unit automation** (offline, `node:test` + `node:assert/strict`, no `wx`):

| Action | Command |
|--------|---------|
| Full unit suite (= `npm test`) | `npm run test:unit` |
| Unit tests with 80% coverage gate | `npm run test:coverage` |
| Run **one** test file | `node --test tests/<file>.test.js` |
| JS syntax check | `npm run check` |
| Full verify (unit + syntax) | `npm run verify` |
| Pre-deployment readiness | `npm run check:deployment` |
| Full pre-release gate | `npm run release:check` (deployment + verify + coverage) |

`npm test` is now an **alias** of `npm run test:unit`; it no longer enumerates files inline. The `tests/` directory holds 70 `.test.js` files; `test:unit` currently enumerates 62 files and passes 662 unit tests in the local baseline. To add a new test file you still must list it in **both** `test:unit` and `test:coverage` in `package.json` (no glob).

**CLI E2E** (WeChat DevTools CLI + `miniprogram-automator`, organized **by subject**, output → `tmp/e2e/<suite>/report.json`). Not in `npm test`; require a running DevTools instance. Run `npm run test:e2e:doctor` first to verify the environment.

| Suite | Command |
|-------|---------|
| Core (17-page + 6-scenario) | `npm run test:e2e:core` (alias `test:e2e:fullpage`) |
| Math | `npm run test:e2e:math` (= data-driven + knowledge-map) |
| Chinese | `npm run test:e2e:chinese` |
| English | `npm run test:e2e:english` (alias `test:devtools-english`) |
| Real-data smoke | `npm run test:e2e:real-data` |
| Real-image | `npm run test:e2e:real-image` |
| Real-cloud (needs `RUN_REAL_CLOUD=1`) | `npm run test:e2e:real-cloud` |
| Parent/timeline | `npm run test:devtools-parent-timeline` |
| All E2E + aggregated report | `npm run test:e2e:all` |

Deferred (not yet done): Chinese subject-specific DevTools scripts beyond the base suite, E2E common-helper extraction, and adding CLI E2E to `release:check`. Run `npm run verify` after any change; run `npm run release:check` before tagging a release.

## Architecture

```
Mini Program (20 pages, WXML/WXSS/JS)
    │  wx.cloud.callFunction()  /  direct wx.cloud.database() reads
    ▼
CloudBase (serverless, 14 cloud functions)
    ├─ uploadAndAnalyze   → creates report record, fire-and-forget starts analyzePhotos
    ├─ analyzePhotos      → splits into batches of 5, calls analyzeBatch serially, dedups, merges, writes report/profile
    │                        (also triggers auto-verification-paper record creation on report completion)
    ├─ analyzeBatch       → downloads images, calls CloudBase AI vision model (hy3-preview)
    ├─ getAnalysisProgress→ lightweight read on analysisTasks
    ├─ generatePaper      → AI (deepseek-v4-flash) generates questions → pdfkit renders A4 PDF
    ├─ generateReportPDF  → renders diagnosis report PDF, writes back reports.pdfFileId
    ├─ regenerateVerificationPaper → verification-paper task-pack controller (continue/finalize/fail actions)
    ├─ studentAccess      → family member invites + owner-only family management
    ├─ studentData        → access-aware reads of student/report/paper/timeline
    ├─ reportFeedback     → parent feedback on reports, bottlenecks, errors, photos
    ├─ englishVocabulary  → personal word library, recognition/dictation practice, paper-dictation photo OCR
    ├─ learningResource   → per-subject resource generation (math map seeds, english vocab)
    ├─ aiUsage            → AI usage ledger, private-beta consent, data deletion requests
    └─ reanalyzeMathHistory → re-runs analyzeBatch over historical math reports
```

### Workbench architecture (family vs personal)

The home/profile pages split into two view-model layers — do not duplicate logic between them:

- **Family workbench** (multi-child): `miniprogram/utils/child-workbench.js` exports `buildChildWorkbenchCards` (one action card per child: statusItems / subjectRows / priorityAction / secondaryActions / quickLinks) and `buildFamilyWorkbenchHero` (cross-child todo aggregate). Rendered on `index` when >1 child.
- **Personal workbench** (single-child): `miniprogram/pages/index/index-presenter.js` exports `buildLearningProfileHomeView` (personalHero / primaryActionCard / reportPanel / personalActionQueue / knowledge-map card / per-subject highlights). Rendered on `index` (1 child) **and** `student-profile`.
- **Child order is fixed** by `sortFamilyStudents`: 钟青羽(6年级) first → 钟筱雨 second → others by `createdAt` descending. Do not re-sort children by activity/recency.
- **Home page is action-first**, not report-first. Priority order for the "today's priority action": 待上传验证卷 > 待验证卡点 > 语文具体错项复习/复测 > 英语认词或纸面听写 > 上传第一份作业. Full fine-bottleneck lists do **not** belong on the home page — they live in 学科页 / 卡点中心 / 报告页.

### English module (self-contained loop)

English is a **vocabulary-mastery loop**, NOT wired into the math `reports → bottlenecks → papers` chain. Three pages, all routing through the `englishVocabulary` cloud function via wrappers in `miniprogram/utils/cloud.js`:

- `english-practice` — recognition practice: voice ASR (`WechatSI.getRecordRecognitionManager`) checks spoken Chinese↔English meaning. Dimension: `familiarity`.
- `english-dictation` — paper dictation with a **voice-paced state machine** (`dictationPhase`: ready/running/paused/finished/reviewed; `playbackState`: idle/speaking/writing/waitingCommand). TTS reads words, accepts voice commands (开始/重读/暂停/继续/好了/下一个), then photo upload + OCR updates the `spelling` dimension.
- `english-wrong-words` — aggregates weak words (high-frequency / spelling-weak / recognition-weak / review-due / stable) from both dimensions; routes to practice or dictation.

Collections: `englishImportBatches`, `studentEnglishWords` (personal word library), `englishPracticeSessions`. LLM-backed English actions (`confirmImportBatch`, `analyzeDictationPhoto`) need `timeout: 60000`.

### Cross-cutting patterns (read multiple files before changing these)

- **Server trigger + client polling**: `uploadAndAnalyze` creates the report then starts `analyzePhotos` fire-and-forget; the client returns immediately and relies on polling. Frontend polling builds on the generic `miniprogram/utils/poller.js` (`createPoller`), wrapped by `miniprogram/utils/analysis-poller.js` which classifies analysis state (waiting / in-progress / completed / failed / timeout, including stale-task detection). `subject-home` and `report` pages use this wrapper.
- **Batch pipeline + OCR dedup**: `analyzePhotos` splits images into batches of 5 and processes them serially via `analyzeBatch`, writing progress to `analysisTasks.completedBatches`. The orchestration is split into `analyzePhotos/pipeline.js`; cross-batch and cross-historical-report deduplication lives in `analyzePhotos/photo-dedup.js`.
- **Centralized access control**: `access.js` is the single source of permission checks (`getStudentAccess`, `getLearningResourceAccess`). Each cloud function has its own root-level copy (e.g. `cloudfunctions/studentAccess/access.js`); they must all stay identical — the test `各云函数的共享文件副本互相保持一致` enforces this. Every cloud function that touches a student or learning resource must go through it. Co-parents (invited `studentMembers` with role) can operate learning workflows (upload, generate papers, retry analysis, read/download reports); **family-member management stays owner-only**.
- **Shared file distribution**: Shared files (`access.js`, `constants.js`, `bottleneck-name.js`, `math-bottleneck-hierarchy.js`) are copied into each cloud function's root directory — NOT in a `_shared/` subdirectory. WeChat DevTools skips underscore-prefixed directories during upload, so `require('./_shared/access')` fails on the cloud. Use `require('./access')` (root-level) instead. The test `cloudfunctions 下不再有 _shared 目录` prevents regression.
- **Bottleneck naming**: Internal IDs are LP-style codes (`LP-001`–`LP-010` math, `LP-101`–`LP-104` Chinese, `LP-201`–`LP-204` English). User-facing surfaces (UI, PDF, report) must show readable summaries like "计算基础" / "审题理解", never raw LP codes. The mapping + alias normalization lives in **two parallel copies** that must stay in sync: `miniprogram/utils/bottleneck-name.js` and the per-function `cloudfunctions/*/bottleneck-name.js`.
- **Fine bottleneck display red line**: User-facing surfaces must never expose raw fine-bottleneck/internal IDs such as `BN-...`, `CHI-...`, `ERR-...`, `MATH-CAT-...`, or `MATH-FAM-...`. This applies especially to verification-paper coverage, learning records, reports, bottleneck center/detail, knowledge map, PDFs, and learning resources. If historical data or AI output contains variant IDs, normalize/map/dedupe them in the display layer (for math, see `miniprogram/utils/math-bottleneck-hierarchy.js`) and show readable Chinese titles instead. Every fix in this area must add a regression test that asserts visible names do not match `/^(LP|BN|CHI|ERR|MATH)-/`.
- **Subject constants**: `miniprogram/utils/constants.js` and `cloudfunctions/*/constants.js` define the three subjects (math / chinese / english), their display names, codes, and colors. The frontend copy additionally carries short names and per-subject color tokens.
- **Presenter split**: Heavy pages keep UI in `<page>.js` and extract testable logic into a plain-JS module with no `wx` dependency so it can be unit-tested directly. Page-specific presenters: `index-presenter`, `report-presenter`, `paper-preview-presenter`, `subject-home-presenter`, `upload-history-presenter`, `knowledge-map-presenter`, `learning-resource-presenter`. Shared view-model modules (no `-presenter` suffix but same role): `utils/child-workbench.js` (family), `utils/bottleneck-view.js`, `utils/paper-display.js`.
- **Data access layer**: `miniprogram/utils/cloud.js` wraps `wx.cloud.callFunction` (expecting a `{success, data, error}` envelope — `success === false` throws) and also exposes direct DB reads. Pages and other utils call through it rather than hitting `wx.cloud` directly.
- **PDF generation**: `pdfkit` runs inside cloud functions using a bundled `NotoSansCJKsc-Regular.otf`. A missing font must fail loudly, not produce garbled Chinese.
- **Traceable navigation**: Card/button destinations go through `buildTraceableUrl` (`utils/traceable-actions.js`) + a shared `onTraceableUrlTap` handler so every entry point records where it came from. New home/dashboard cards should use this rather than raw `wx.navigateTo`.

### Database collections

`students`, `studentMembers` (owner/co-parent access), `studentInvites` (one-time join tokens), `subjectProfiles` (per-subject bottleneck tracking + analysis status), `reports` (diagnosis/verification, with `bottlenecks[]`, `errorDetails[]`, `pdfFileId`, `verificationPaperStatus`), `papers` (generated/default, with `paperKey` for default-paper caching, `generationStatus: generating|ready|failed`), `analysisTasks` (async job progress), `reportFeedback` (parent feedback), `englishImportBatches` (vocabulary import staging), `studentEnglishWords` / personal vocabulary (PEP base ~505 words + per-student mastery), `englishPracticeSessions` (recognition/dictation sessions, per-attempt `durationMs`), `learningResources` (per-subject generated resources: math map nodes, english word packs — links/metadata only, no content mirroring), `mathHistoryReanalysisTasks` (reanalysis job progress). Full schema in `docs/DATA_DICTIONARY.md`.

## Conventions

- Cloud function envelopes follow `{success, data, error}`; throw on `success === false` from the client wrapper.
- When adding a subject, subject color, or bottleneck code, update the root-level copies in BOTH cloud functions (`cloudfunctions/*/constants.js`, `cloudfunctions/*/bottleneck-name.js`) and frontend (`miniprogram/utils/`). Never use a `_shared/` subdirectory — put shared files at the cloud function root.
- Chinese PDF fonts are bundled inside the cloud function directories — do not configure `FONT_FILE_ID` or external font paths.
- **Never use `Intl` API in miniprogram code** — WeChat iOS/macOS runtime does not support it. Use `getUTC*` methods with manual timezone offset instead (see `beijingParts` in `miniprogram/utils/util.js`).
- **LLM cloud functions need frontend `timeout: 60000`** — `wx.cloud.callFunction` defaults to 20s, but `generatePaper` / `generateReportPDF` / LLM-backed actions need up to 60s. See `callGeneratePaper` in `cloud.js`.
- **PDF 格式迭代用本地预览工具** — `node scripts/preview-real-paper.js`（真实数据）或 `preview-pdf.js`（模拟数据）生成到 `tmp/`，不用上传云函数。改完 `pdf-renderer.js` 直接跑看效果。**每次调整 PDF 格式后，清除旧验证试卷并重新生成。**
- **验证卷异步自动生成（v4）** — 诊断报告完成后 `analyzePhotos` 只创建 `generationStatus='generating'` 的 paper 记录并调度 `regenerateVerificationPaper?action=continue`。后端每次只推进 1 个未生成 BN，成功后自调度下一次；全部 BN 完成后调用 `generatePaper(_regeneratePdf)` 统一重排学生页和答案页。前端 `navigateToVerificationPaper`（`utils/shared-navigation.js`）只查状态、轮询和进入 `paper-preview`，不得直接调用 `_appendToPaperId` 拼批次。题量按置信度分层（高3/中2/低1题）。任一目标或最终 PDF 连续失败会把 paper/report 标记 `failed`。`generate-verification` 页已降级为历史兼容页 / 验证卷下载入口，不再是主生成路径。详见 `docs/subject-design/验证卷完整设计文档.md`。
- **验证卷 PDF 渲染规范（数学）** — ①按题数均匀分页（10题/页）②分页前按 lpCode stable sort（同卡点连续，避免双栏交错）③题目统一连续编号（`index=idx+1`，不用 LLM 批次内编号）④卡点标签栏内跟随（`drawColumnGroupLabel`，只占栏宽不占整行，左右栏各自独立跟踪 lpCode）⑤卡点名完整不截断、无 ABCD 字母编号 ⑥双栏严格对齐（文字区取 max、演算区统一 52pt）⑦LaTeX 清理（`cleanLatex`：`\frac{1}{4}`→`1/4`）⑧explanation 禁止模板废话、必须含本题具体数字计算步骤。

### 全局信息一致性原则（CRITICAL）

**同一份业务数据在不同页面展示时，统计口径必须完全一致。** 如果任何两个页面的数字不一致，就是 bug。

#### 卡点统计统一口径

所有展示"待修复卡点数"的页面，**必须**使用统一定义：

```
待修复 = status !== 'improved'（含 needs_verification + persisting + recurring + worsened）
```

**禁止**以下写法：
- ❌ 只数 `persisting`（漏了 needs_verification）
- ❌ 只数 `needs_verification`（漏了 persisting）
- ❌ 用 `pendingBottlenecks.length`（粗卡点未展开，和展开后的数字不一致）

**实现位置**：`buildBottleneckStats()` 的 `pendingCount` 和 `activeCount` 都用 `status !== 'improved'`。

#### 卡点展示粒度一致性（CRITICAL）

数学学科的卡点有粗（LP-xxx，8 个）和细（BN-xxx，~38 个）两层。**所有页面展示卡点数量时，必须统一使用"展开细卡点后的计数"**，否则同一份数据在不同页面会显示不同数字（8 vs 38）。

涉及页面（修改时必须全部检查）：
| 页面 | 数据源 | 展示粒度 | 计数字段 | 口径 |
|---|---|---|---|---|
| index（首页） | `allSubjectBottleneckViews`（数学展开 BN） | 细 | metrics"待验证" + bottleneckStats | status !== 'improved' |
| student-profile | 同上（复用 index-presenter） | 细 | bottleneckStats.activeCount + metrics | status !== 'improved' |
| subject-home | `buildSubjectBottleneckViews`（数学展开 BN） | 细 | pendingTaskCount | status !== 'improved' |
| knowledge-map | `expandFineBottleneckItems`（展开 BN） | 细 | pendingCount（statusClass !== 'mastered'） | status !== 'improved' |
| bottleneck-center | `buildBottleneckViews`（expandCandidates: true） | 细 | buildBottleneckStats | status !== 'improved' |
| report | `buildReportBottleneckViews`（数学展开 BN） | 细 | bottleneckCount（全量）/ pendingCount | 全量 / status !== 'improved' |

**关键**：`buildBottleneckViews` 调用时，数学学科**必须**传 `expandCandidates: true`，否则细卡点不会展开，计数会是粗卡点数（8）而非细卡点数（38）。`allSubjectBottleneckViews`（index-presenter.js）按学科分别构建，对 `subject.key === 'math'` 传 `expandCandidates`。

#### 置信度统一

所有展示卡点的地方必须附带置信度标签（`buildConfidence` 函数计算）：
- 阈值：weight≥75 = 高置信，45-74 = 中置信，<45 = 低置信
- 展示格式：`●●● 高置信` / `●●○ 中置信` / `●○○ 低置信`
- 颜色：红/黄/灰三色体系
- 云函数出题（`questionsForWeight`）和前端展示（`buildConfidence`）的阈值**必须一致**

详见 `docs/subject-design/置信度驱动分层验证模型设计文档.md`。

### 证据与状态判定（不可越界）

Authoritative in `docs/product/learning-diagnostic-product-brief.md` §7 and `docs/product/family-learning-workflow.md`.

- **纸面是主要证据载体** — 当需要过程痕迹时，以纸质作业为准（原始作答、中间步骤、草稿、涂改痕迹、老师批注、家长订正色）。OCR/AI 只做辅助。
- **不隐藏不确定性** — 区分 7 种证据状态：confirmed / suspected / improved / persisting / missing / blank / unclear。不要把"疑似"显示成"确诊"。
- **上传证据要分态记录** — blank（空白）/ unclear（模糊）/ wrong（错）/ partial（部分对）/ correct（对）必须分别记录，不能合并成一个"对/错"。（当前 Known gap：系统还无法可靠区分 correct 与 blank/ambiguous/OCR 漏识 —— 这是待实现的前向约束，不是允许的现状。）
- **没有明确验证证据，不得标记 improved** — 一道卡点"已修复"必须有后续上传的证据支撑，不能仅凭 AI 置信度变化改状态。这正是"全局信息一致性"用 `status !== 'improved'` 作待修复口径的原因。
- **一次只修一个小卡点** — 推荐 15–20 分钟一个学习单元，聚焦一个细卡点，不是整章。验证卷/资源推送都应服务这个粒度。

### 资源与隐私边界

- **只存链接/摘要/评价/适用场景，不下载、不复制平台内容** — `learningResources` 集合存的是指引，不是内容镜像。B站/小红书等外部资源只跳转，不内嵌。
- **孩子不直接浏览平台推荐流** — 家长 + AI 过滤后定向使用（`docs/product/family-learning-workflow.md`）。
- **只提交脱敏样本 + 结构化种子数据** — 真实学生原始材料（姓名、照片、原始作答）不入库、不进 GitHub（`00-总项目知识库/04-小程序文档迁移记录` 明确说明）。
- **官方教材资源只作验证/兜底** — 不以官方为唯一来源（`docs/product/mvp-roadmap-and-boundaries.md`）。

### WeChat 平台硬约束（英语口语/听音相关，动前必查）

任何涉及录音/语音识别的工作，先确认这些限制（来源 `99-待补与决策/资料缺口与补全计划-v0.1.md` §6.3，标注为"动前必查"）：

- `RecorderManager` 单次录音默认 **60s** 上限；企业版有条件可到 **300s**。
- 录音输出默认 aac/mp3，**不支持 wav**；部分 ASR 服务（如有道）要求 pcm/wav，需服务端 ffmpeg 转码。
- 微信同声传译插件（WechatSI）**只转写、不打分** —— 评分必须靠纸面 OCR 或家长判断。
- CloudBase 云函数 **60s 超时 + 内存上限** 会限制 ffmpeg 等重计算。

### `data/math/` 数据质量约束

数学种子数据（`data/math/` 下 `historical-error-replay` / `bottleneck-taxonomy-v2` / `knowledge-nodes` / `learning-resources`）遵守：

- `validationDimension` 枚举仅 6 值：`EXEC / CHECK / TRACK / CONVERT / BASE / MODEL`。多维情形取主维（对齐 `primaryBottleneckId`），次维放可选 `secondaryDimensions[]`。
- `evidenceType` 枚举仅 3 值：`hard_question`（题库题，有学生答+正确答）/ `image_cluster`（图片级证据）/ `report_inference`（报告级推断）。
- 每个 BN 卡点定义需 症状/根因/微验证 各 **≥2 条**。
- 引用完整性 100%：ERR → BN → MATH → RES 无孤儿引用、双向一致、JSON 全部合法。

## Documentation obligations (Quality Gates)

Per-change documentation discipline — from `docs/product/mvp-roadmap-and-boundaries.md` §6. Treat these as part of "done", not optional:

- `npm run verify` must pass before pushing implementation changes.
- **Data schema change → update `docs/DATA_DICTIONARY.md`.**
- **New cloud function behavior → update `docs/CLOUD_FUNCTIONS.md`.**
- **New test coverage → reflect in `docs/TEST_MATRIX.md`.**
- **Subject behavior change → update `docs/subject-design/`.**

Doc authority priority (from `00-总项目知识库/00-文档库治理/文档分类与版本规则-v0.1.md`): 已实现工程事实 > 最近正式 PRD > 真实案例/测试报告 > 纯假设. Early vision docs do NOT override current MVP boundary. External facts (竞品/API/平台能力) >30 天未复核的应标 `NEEDS_REVIEW`.

## GitHub sync workflow

When the user asks to sync / pull / align with GitHub, **GitHub is the source of truth — make local match it exactly.** Default flow (do not ask each step, but stop and confirm before any irreversible delete per the red lines):

1. `git fetch --all --prune` — pull all remote refs, drop stale branches.
2. Check `git status`: if there are local commits, uncommitted changes, or untracked files, **surface them before doing anything.** Distinguish two cases:
   - Local commits that are already in `origin/main` (already merged upstream) → safe to discard.
   - Local commits NOT in `origin/main` (genuine divergent work) → **stop and ask** before overwriting.
3. Check every local branch with `git rev-list --count main..<branch>`: if `0` commits ahead of main, it is fully merged and deletable; if `>0`, **stop and ask.**
4. Switch to `main` and fast-forward: `git checkout main && git merge --ff-only origin/main`. If ff-only fails (local main has diverged), **stop and ask** — never force-push or reset without confirmation.
5. Delete fully-merged local branches (`git branch -d`); `git worktree remove` any stale worktrees first if a branch is checked out there.
6. Clean leftover untracked junk that is redundant vs `origin/main` (old `_shared/` copies, `*.backup/`, scratch scripts already removed upstream). **Verify each item is redundant before removing** (e.g. content already in `origin/main`, or file already deleted upstream). Per red lines: confirm with the user before deleting anything you did not create in this session.
7. End state: `git status` shows `working tree clean`, `git branch` shows only active branches, no stale stash, local `main` == `origin/main`.

## Known gaps

- `analyzePhotos/sendNotification()` is a no-op; the WeChat subscribe-message template has not been applied for, so users get no push on completion (rely on polling + manual retry).
- Default-paper caching (`default-paper.js`) is keyed per-student; cross-student reuse of the same grade/A-B template is not implemented.
- A bottleneck is marked "improved" when a verification upload surfaces no errors for it — the system does not yet distinguish correct answers from blank/ambiguous/OCR-missed responses (this is a **forward constraint**, see 证据与状态判定 above — evidence must be recorded as blank/unclear/wrong/partial/correct separately).
- WechatSI ASR transcribes but does not score — English oral scoring relies on parent/paper-OCR judgment, not voice confidence.
- All page hero illustrations (`miniprogram/assets/images/*-hero.*`) were added then deleted in `57821ed`; `miniprogram/utils/page-illustrations.js` still exists but carries only `alt` text, no image paths. Do not reintroduce static page hero assets into the miniprogram main package without re-checking the 2MB preview limit.

## Reference docs

- `PRD.md` — product requirements (v2.9)
- `PROJECT_PLAN.md` — architecture, data models, progress tracker
- `SETUP.md` — deployment (env, DB setup, font upload)
- `docs/ARCHITECTURE.md`, `docs/CLOUD_FUNCTIONS.md`, `docs/DATA_DICTIONARY.md`, `docs/TROUBLESHOOTING.md`, `docs/TEST_MATRIX.md`
- **Test framework (V2)**: `docs/TEST_STRATEGY_V2.md` (current — two-category model), `docs/TESTING.md`, `docs/TEST_FRAMEWORK_DESIGN.md` (both rewritten to V2)
- **Product docs** (`docs/product/`): `mvp-roadmap-and-boundaries.md` (priorities P0–P3, scope, quality gates), `learning-diagnostic-product-brief.md` (positioning + 7 product principles), `family-learning-workflow.md` (15–20 min session, evidence sub-states), `prompt-and-agent-design.md` (AI prompt chain + agent roles)
- **Subject design** (`docs/subject-design/`): `README.md` (总入口), `验证卷完整设计文档.md` + `置信度驱动分层验证模型设计文档.md` (verification + confidence model + 信息一致性全局原则), `math/` (math learning map), `english/` (vocabulary loop, paper-dictation voice flow, written-diagnosis decision), `legacy/` (superseded notes)
- External knowledge base (NOT in this repo, for traceability only): `../00-总项目知识库/` — vision/governance docs. Implementation specs live in this GitHub repo; the KB keeps conclusions and indices only.
- `.claude/skills/test-framework/skill.md` — test framework skill (may still describe the old L0–L4 model; `docs/TEST_STRATEGY_V2.md` is authoritative for the current two-category model).

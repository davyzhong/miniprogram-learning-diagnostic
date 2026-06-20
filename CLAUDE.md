# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project

WeChat Mini Program for K-12 learning diagnosis. Parents photograph exam papers; a CloudBase serverless backend uses AI to detect errors and classify them into a bottleneck taxonomy. The mini program then generates targeted verification papers and compares follow-up uploads to track improvement.

No backend secrets are required — CloudBase AI calls authenticate via the current cloud environment identity. The cloud env ID `cloud1-d6gneg68m5a7a3876` is hardcoded in `miniprogram/app.js` and `project.config.json` (`cloudbaseRoot`); changing environments means editing both.

## Commands

There is no CLI build for the mini program itself — compilation, preview, and cloud-function deployment happen in the **WeChat Developer Tools IDE** (compile = 编译, deploy a cloud function = right-click its dir → "上传并部署：云端安装依赖"). Set cloud functions to the platform max timeout of **60s**.

Node.js tasks run from the repo root:

| Action | Command | Layer |
|--------|---------|-------|
| Full test suite | `npm test` | L2 |
| Tests with coverage | `npm run test:coverage` | L2 |
| Run **one** test file | `node --test tests/<file>.test.js` | L2 |
| JS syntax check (121 files) | `npm run check` | L1 |
| Full verify (tests + syntax) | `npm run verify` | L1+L2 |
| Real-image e2e (not in `npm test`) | `npm run test:e2e-real-image` | L3 |
| Pre-deployment readiness | `npm run check:deployment` | L1 |
| Full pre-release gate | `npm run release:check` (deployment + verify + coverage) | L1+L2 |
| DevTools environment doctor | `npm run test:e2e:doctor` | L3 |
| 17-page + 6-scenario full E2E | `npm run test:e2e:fullpage` | L3 |
| Data-driven E2E scenarios | `npm run test:e2e:data-driven` | L3 |
| All E2E + aggregated report | `npm run test:e2e:all` | L3 |
| English module E2E | `npm run test:devtools-english` | L3 |
| Parent/timeline E2E | `npm run test:devtools-parent-timeline` | L3 |

The `tests/` directory currently holds 50 `.test.js` files; `npm test` enumerates 44 of them explicitly (no glob), so any new test file must be added to both `test` and `test:coverage` scripts in `package.json`. Tests use the Node.js built-in runner (`node --test`), no external framework — 460 tests, <3s. Run `npm run verify` after any change; run `npm run release:check` before tagging a release.

## Architecture

```
Mini Program (16 pages, WXML/WXSS/JS)
    │  wx.cloud.callFunction()  /  direct wx.cloud.database() reads
    ▼
CloudBase (serverless, 12 cloud functions)
    ├─ uploadAndAnalyze   → creates report record, fire-and-forget starts analyzePhotos
    ├─ analyzePhotos      → splits into batches of 5, calls analyzeBatch serially, dedups, merges, writes report/profile
    ├─ analyzeBatch       → downloads images, calls CloudBase AI vision model (hy3-preview)
    ├─ getAnalysisProgress→ lightweight read on analysisTasks
    ├─ generatePaper      → AI (deepseek-v4-flash) generates questions → pdfkit renders A4 PDF
    ├─ generateReportPDF  → renders diagnosis report PDF, writes back reports.pdfFileId
    ├─ studentAccess      → family member invites + owner-only family management
    ├─ studentData        → access-aware reads of student/report/paper/timeline
    ├─ reportFeedback     → parent feedback on reports, bottlenecks, errors, photos
    ├─ englishVocabulary  → personal word library, familiarity/spelling practice, AI dictation
    ├─ learningResource   → per-subject resource generation (math map seeds, english vocab)
    └─ reanalyzeMathHistory → re-runs analyzeBatch over historical math reports
```

### Cross-cutting patterns (read multiple files before changing these)

- **Server trigger + client polling**: `uploadAndAnalyze` creates the report then starts `analyzePhotos` fire-and-forget; the client returns immediately and relies on polling. Frontend polling builds on the generic `miniprogram/utils/poller.js` (`createPoller`), wrapped by `miniprogram/utils/analysis-poller.js` which classifies analysis state (waiting / in-progress / completed / failed / timeout, including stale-task detection). `subject-home` and `report` pages use this wrapper.
- **Batch pipeline + OCR dedup**: `analyzePhotos` splits images into batches of 5 and processes them serially via `analyzeBatch`, writing progress to `analysisTasks.completedBatches`. The orchestration is split into `analyzePhotos/pipeline.js`; cross-batch and cross-historical-report deduplication lives in `analyzePhotos/photo-dedup.js`.
- **Centralized access control**: `access.js` is the single source of permission checks (`getStudentAccess`, `getLearningResourceAccess`). Each cloud function has its own root-level copy (e.g. `cloudfunctions/studentAccess/access.js`); they must all stay identical — the test `各云函数的共享文件副本互相保持一致` enforces this. Every cloud function that touches a student or learning resource must go through it. Co-parents (invited `studentMembers` with role) can operate learning workflows (upload, generate papers, retry analysis, read/download reports); **family-member management stays owner-only**.
- **Shared file distribution**: Shared files (`access.js`, `constants.js`, `bottleneck-name.js`, `math-bottleneck-hierarchy.js`) are copied into each cloud function's root directory — NOT in a `_shared/` subdirectory. WeChat DevTools skips underscore-prefixed directories during upload, so `require('./_shared/access')` fails on the cloud. Use `require('./access')` (root-level) instead. The test `cloudfunctions 下不再有 _shared 目录` prevents regression.
- **Bottleneck naming**: Internal IDs are LP-style codes (`LP-001`–`LP-010` math, `LP-101`–`LP-104` Chinese, `LP-201`–`LP-204` English). User-facing surfaces (UI, PDF, report) must show readable summaries like "计算基础" / "审题理解", never raw LP codes. The mapping + alias normalization lives in **two parallel copies** that must stay in sync: `miniprogram/utils/bottleneck-name.js` and the per-function `cloudfunctions/*/bottleneck-name.js`.
- **Subject constants**: `miniprogram/utils/constants.js` and `cloudfunctions/*/constants.js` define the three subjects (math / chinese / english), their display names, codes, and colors. The frontend copy additionally carries short names and per-subject color tokens.
- **Presenter split**: Heavy pages keep UI in `<page>.js` and extract testable logic into `<page>-presenter.js` (see `index`, `upload-history`, `paper-preview`, `report`, `subject-home`). Presenters are plain JS with no `wx` dependency so they can be unit-tested directly.
- **Data access layer**: `miniprogram/utils/cloud.js` wraps `wx.cloud.callFunction` (expecting a `{success, data, error}` envelope — `success === false` throws) and also exposes direct DB reads. Pages and other utils call through it rather than hitting `wx.cloud` directly.
- **PDF generation**: `pdfkit` runs inside cloud functions using a bundled `NotoSansCJKsc-Regular.otf`. A missing font must fail loudly, not produce garbled Chinese.

### Database collections

`students`, `studentMembers` (owner/co-parent access), `studentInvites` (one-time join tokens), `subjectProfiles` (per-subject bottleneck tracking + analysis status), `reports` (diagnosis/verification, with `bottlenecks[]`, `errorDetails[]`, `pdfFileId`), `papers` (generated/default, with `paperKey` for default-paper caching), `analysisTasks` (async job progress), `reportFeedback` (parent feedback), `englishImportBatches` (vocabulary import staging), `studentEnglishWords` (personal word library), `englishPracticeSessions` (practice/dictation sessions), `learningResources` (per-subject generated resources: math map nodes, english word packs), `mathHistoryReanalysisTasks` (reanalysis job progress). Full schema in `docs/DATA_DICTIONARY.md`.

## Conventions

- Cloud function envelopes follow `{success, data, error}`; throw on `success === false` from the client wrapper.
- When adding a subject, subject color, or bottleneck code, update the root-level copies in BOTH cloud functions (`cloudfunctions/*/constants.js`, `cloudfunctions/*/bottleneck-name.js`) and frontend (`miniprogram/utils/`). Never use a `_shared/` subdirectory — put shared files at the cloud function root.
- Chinese PDF fonts are bundled inside the cloud function directories — do not configure `FONT_FILE_ID` or external font paths.
- **Never use `Intl` API in miniprogram code** — WeChat iOS/macOS runtime does not support it. Use `getUTC*` methods with manual timezone offset instead (see `beijingParts` in `miniprogram/utils/util.js`).
- **LLM cloud functions need frontend `timeout: 60000`** — `wx.cloud.callFunction` defaults to 20s, but `generatePaper` / `generateReportPDF` / LLM-backed actions need up to 60s. See `callGeneratePaper` in `cloud.js`.
- **PDF 格式迭代用本地预览工具** — `node scripts/preview-real-paper.js`（真实数据）或 `preview-pdf.js`（模拟数据）生成到 `tmp/`，不用上传云函数。改完 `pdf-renderer.js` 直接跑看效果。**每次调整 PDF 格式后，清除旧验证试卷并重新生成。**
- **验证卷异步自动生成（v3）** — 诊断报告完成后 `analyzePhotos` 只创建 generating 记录（不实际生成，因云函数 return 后进程销毁）。前端 `navigateToVerificationPaper` 检测到 generating 且 completedBatches===0 时驱动逐批生成：循环调 `generatePaper(_appendToPaperId)` 每批 6-8 个 BN，最后调 `_regeneratePdf`。题量按置信度分层（高3/中2/低1题）。所有入口的"查看验证卷"按钮统一调 `navigateToVerificationPaper`。详见 `docs/subject-design/验证卷完整设计文档.md`。
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
- A bottleneck is marked "improved" when a verification upload surfaces no errors for it — the system does not yet distinguish correct answers from blank/ambiguous/OCR-missed responses.

## Reference docs

- `PRD.md` — product requirements (v2.9)
- `PROJECT_PLAN.md` — architecture, data models, progress tracker
- `SETUP.md` — deployment (env, DB setup, font upload)
- `docs/ARCHITECTURE.md`, `docs/CLOUD_FUNCTIONS.md`, `docs/DATA_DICTIONARY.md`, `docs/TESTING.md`, `docs/TROUBLESHOOTING.md`, `docs/TEST_MATRIX.md`, `docs/TEST_FRAMEWORK_DESIGN.md`
- `docs/subject-design/置信度驱动分层验证模型设计文档.md` — **置信度分层出题、卡点细颗粒度模型、诊断报告↔验证卷↔反馈闭环、信息一致性全局原则**
- `.claude/skills/test-framework/skill.md` — 三层测试框架 skill（测试分层、命令、写测试模式、harness 用法）

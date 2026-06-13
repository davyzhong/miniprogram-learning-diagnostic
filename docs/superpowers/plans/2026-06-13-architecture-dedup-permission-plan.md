# Architecture Deduplication And Co-parent Permissions Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Resolve the verified architecture duplication issues while updating co-parent permissions so a joined parent can use every learning workflow except family member management.

**Architecture:** Treat duplicated policy code as the first-class problem: permissions, subject constants, bottleneck names, paper display, and analysis polling should each have one source of truth. Execute in small, reversible slices with tests around every behavior change. Leave high-risk core pipeline refactors, especially `analyzePhotos`, until the policy and presenter seams are stable.

**Tech Stack:** WeChat Mini Program, CloudBase cloud functions, Node.js built-in test runner, existing `npm run verify` quality gate.

---

## Product Permission Decision

共同家长不是只读角色。共同家长除了不能管理家庭成员以外，其他学习相关功能都应该具备。

| Capability | Owner | Co-parent |
|---|---:|---:|
| 查看孩子档案 | Yes | Yes |
| 查看学科主页 | Yes | Yes |
| 查看学习记录/时间线 | Yes | Yes |
| 查看诊断报告 | Yes | Yes |
| 下载诊断 PDF | Yes | Yes |
| 查看验证试卷 | Yes | Yes |
| 下载/分享验证试卷 PDF | Yes | Yes |
| 上传原始试卷照片 | Yes | Yes |
| 发起 AI 分析 | Yes | Yes |
| 生成验证试卷 | Yes | Yes |
| 上传验证卷作答照片 | Yes | Yes |
| 触发验证反馈分析 | Yes | Yes |
| 重新触发失败/超时分析 | Yes | Yes |
| 创建邀请 | Yes | No |
| 修改家庭成员名称/身份 | Yes | No |
| 移除家庭成员 | Yes | No |

Implementation language:

- Replace the old mental model `viewer = read-only` with `co-parent = can collaborate on learning workflows`.
- Keep internal role names if changing database shape is unnecessary, but derive permissions from helpers rather than role name assumptions in pages.
- Family management remains owner-only.

---

## Execution Table

| Phase | Task | Outcome | Main Files | Risk | Verification |
|---:|---|---|---|---|---|
| 0 | Update permission contract tests | Tests encode the new co-parent policy before code changes | `tests/cloud-functions.test.js`, `tests/student-access.test.js`, `tests/student-data-access.test.js`, `tests/page-flows.test.js` | Low | Targeted tests fail first where behavior is still old |
| 1 | Centralize access semantics | One shared policy for read/write/manage, no scattered role assumptions | `cloudfunctions/_shared/access.js`, cloud functions | Medium | Co-parent can upload/generate/retry/download; cannot manage members |
| 2 | Frontend permission gating | Buttons and routes match backend permissions | `miniprogram/pages/report`, `subject-home`, `generate-verification`, `paper-preview`, `parent-management` | Medium | Page-flow tests for co-parent visible actions |
| 3 | Centralize subject constants/colors | Subject names and nav/page colors stop drifting | `miniprogram/utils/constants.js`, `cloudfunctions/_shared/constants.js`, relevant pages/functions | Low | Existing color/name contract tests |
| 4 | Centralize bottleneck display names | User-facing UI/PDF never exposes LP codes as primary text | `miniprogram/utils/bottleneck-name.js`, PDF generation helpers | Low | Bottleneck display tests |
| 5 | Extract paper display helpers | Paper code, page count, bottleneck summary, PDF status display are consistent | `miniprogram/utils/paper-display.js`, `upload`, `paper-preview`, `upload-history` | Medium | Page-flow and learning-record tests |
| 6 | Extract analysis poller wrapper | Analysis status/retry/timeout behavior is consistent | `miniprogram/utils/analysis-poller.js`, `subject-home`, `report` | Medium | Poller/page-flow tests |
| 7 | Presenter split for heavy pages | Timeline and paper workbench logic becomes testable and less fragile | `upload-history-presenter.js`, `paper-preview-presenter.js` | Medium | Presenter tests + page-flow regression |
| 8 | Split `analyzePhotos` pipeline | Core function becomes readable without behavior change | `cloudfunctions/analyzePhotos/index.js`, new local helper files | High | Full cloud-function regression |
| 9 | Clean dead/legacy code and docs | Remove stale constants and update project docs | `miniprogram/utils/util.js`, `CLAUDE.md`, docs | Low | `npm run verify` |

---

## Phase 0: Permission Contract Tests

**Files:**

- Modify: `tests/cloud-functions.test.js`
- Modify: `tests/student-access.test.js`
- Modify: `tests/student-data-access.test.js`
- Modify: `tests/page-flows.test.js`
- Modify: `tests/parent-management-page-flows.test.js`

- [x] **Step 1: Write co-parent workflow tests**

Add tests that a joined active parent can:

- call `uploadAndAnalyze` for an existing child profile.
- call `generatePaper`.
- call `generateReportPDF`.
- call `getAnalysisProgress`.
- call `studentData.getReportDetail`.
- call `studentData.getPaperDetail`.
- read timeline data.

- [x] **Step 2: Write owner-only family management tests**

Add tests that a joined active parent cannot:

- create invite.
- update member display name/relation.
- revoke another member.
- archive or mutate member-management-only state if such action is family-management scoped.

- [x] **Step 3: Run expected failing tests**

Run:

```bash
node --test tests/cloud-functions.test.js tests/student-access.test.js tests/student-data-access.test.js tests/page-flows.test.js tests/parent-management-page-flows.test.js
```

Expected: tests fail where backend or frontend still assumes co-parent is read-only.

---

## Phase 1: Centralize Access Semantics

**Files:**

- Create: `cloudfunctions/_shared/access.js`
- Modify: `cloudfunctions/uploadAndAnalyze/index.js`
- Modify: `cloudfunctions/generatePaper/index.js`
- Modify: `cloudfunctions/generateReportPDF/index.js`
- Modify: `cloudfunctions/getAnalysisProgress/index.js`
- Modify: `cloudfunctions/studentData/index.js`
- Modify: `cloudfunctions/studentAccess/index.js`
- Test: `tests/cloud-functions.test.js`
- Test: `tests/student-access.test.js`
- Test: `tests/student-data-access.test.js`

**Important deployment note:** If WeChat developer tools do not package shared sibling modules reliably, keep `_shared` as the canonical source and add a lightweight sync/check script in a later step. Do not introduce a CloudBase Layer until deployment friction is clear.

- [x] **Step 1: Create explicit permission helpers**

Create helpers with this semantic shape:

```js
function canReadLearning(access) {
  return Boolean(access && access.allowed)
}

function canOperateLearning(access) {
  return Boolean(access && access.allowed)
}

function canManageFamily(access) {
  return Boolean(access && access.allowed && access.role === 'owner')
}
```

Use `canOperateLearning` for upload, analyze, retry, generate paper, download paper/report.

- [x] **Step 2: Migrate read functions first**

Use shared access helper in:

- `getAnalysisProgress`
- `generateReportPDF`
- `studentData.getReportDetail`
- `studentData.getPaperDetail`
- `studentData.getTimeline`

- [x] **Step 3: Migrate learning operation functions**

Use `canOperateLearning` in:

- `uploadAndAnalyze`
- `generatePaper`
- report retry analysis entry points
- verification upload entry points

- [x] **Step 4: Keep family management owner-only**

Use `canManageFamily` in:

- invite creation.
- member update.
- member revoke.

- [x] **Step 5: Verify**

Run:

```bash
node --test tests/cloud-functions.test.js tests/student-access.test.js tests/student-data-access.test.js
npm run verify
```

- [ ] **Step 6: Commit**

```bash
git add cloudfunctions tests
git commit -m "refactor: centralize learning access permissions"
```

---

## Phase 2: Frontend Permission Gating

**Files:**

- Modify: `miniprogram/pages/report/report.js`
- Modify: `miniprogram/pages/report/report.wxml`
- Modify: `miniprogram/pages/subject-home/subject-home.js`
- Modify: `miniprogram/pages/subject-home/subject-home.wxml`
- Modify: `miniprogram/pages/generate-verification/generate-verification.js`
- Modify: `miniprogram/pages/paper-preview/paper-preview.js`
- Modify: `miniprogram/pages/parent-management/parent-management.js`
- Test: `tests/page-flows.test.js`
- Test: `tests/parent-management-page-flows.test.js`

- [x] **Step 1: Replace role-name checks with permission flags**

Pages should consume role-aware fields like:

```js
permissions: {
  canReadLearning: true,
  canOperateLearning: true,
  canManageFamily: false
}
```

Avoid checks like `role === 'owner'` outside family management UI.

- [x] **Step 2: Show learning actions to co-parent**

Co-parent should see and use:

- 拍照诊断.
- 生成验证试卷.
- 下载 PDF.
- 上传验证.
- 重试分析.

- [x] **Step 3: Hide family management mutation actions**

Co-parent can open family management and view members, but should not see:

- 创建邀请.
- 修改成员.
- 移除成员.

- [x] **Step 4: Verify**

Run:

```bash
node --test tests/page-flows.test.js tests/parent-management-page-flows.test.js
npm run verify
```

- [ ] **Step 5: Commit**

```bash
git add miniprogram/pages tests
git commit -m "fix: allow co-parent learning actions"
```

---

## Phase 3: Centralize Subject Constants And Colors

**Files:**

- Create: `miniprogram/utils/constants.js`
- Create: `cloudfunctions/_shared/constants.js`
- Modify: `miniprogram/pages/index/index.js`
- Modify: `miniprogram/pages/index/index-presenter.js`
- Modify: `miniprogram/pages/subject-home/subject-home.js`
- Modify: `miniprogram/pages/subject-home/subject-home.wxss`
- Modify: `miniprogram/pages/upload-history/upload-history.js`
- Modify: `miniprogram/utils/cloud.js`
- Modify: `cloudfunctions/analyzeBatch/index.js`
- Modify: `cloudfunctions/generatePaper/index.js`
- Modify: `cloudfunctions/generatePaper/pdf-renderer.js`
- Modify: `cloudfunctions/generateReportPDF/index.js`
- Test: `tests/contracts.test.js`
- Test: `tests/coverage-gap.test.js`

- [ ] **Step 1: Add frontend constants**

Use one source:

```js
const SUBJECT_NAMES = {
  math: '数学',
  chinese: '语文',
  english: '英语'
}

const SUBJECT_COLORS = {
  math: { bg: '#1f4f82', fg: '#ffffff' },
  chinese: { bg: '#276749', fg: '#ffffff' },
  english: { bg: '#9c4f24', fg: '#ffffff' }
}
```

- [ ] **Step 2: Replace page-local maps**

Replace duplicated subject maps in pages and utils.

- [ ] **Step 3: Add cloud constants**

Use the same semantic values in cloud functions.

- [ ] **Step 4: Verify**

Run:

```bash
node --test tests/contracts.test.js tests/coverage-gap.test.js
npm run verify
```

- [ ] **Step 5: Commit**

```bash
git add miniprogram cloudfunctions tests
git commit -m "refactor: centralize subject constants"
```

---

## Phase 4: Centralize Bottleneck Display Names

**Files:**

- Create: `miniprogram/utils/bottleneck-name.js`
- Create or sync: `cloudfunctions/_shared/bottleneck-name.js`
- Modify: `miniprogram/utils/util.js`
- Modify: `miniprogram/utils/bottlenecks.js`
- Modify: `cloudfunctions/generatePaper/bottleneck-display.js`
- Modify: `cloudfunctions/generatePaper/pdf-renderer.js`
- Test: `tests/util.test.js`
- Test: `tests/generate-paper-pdf.test.js`
- Test: `tests/contracts.test.js`

- [ ] **Step 1: Define the single display algorithm**

Priority:

1. AI/report `summary/name/title`.
2. local LP dictionary.
3. cleaned raw text.
4. LP code only as last-resort internal fallback.

- [ ] **Step 2: Remove or isolate dead category mappings**

Either delete unused `CATEGORY_NAMES`, or keep only if a real caller uses it. Do not let user-facing display depend on incompatible `LP-OP` prefixes.

- [ ] **Step 3: Verify all user-facing output**

Check:

- pages do not show `LP-001` as primary text.
- PDF does not show `LP-001` as primary text.
- learning record cards use readable summaries.

- [ ] **Step 4: Commit**

```bash
git add miniprogram cloudfunctions tests
git commit -m "refactor: unify bottleneck display names"
```

---

## Phase 5: Extract Paper Display Helpers

**Files:**

- Create: `miniprogram/utils/paper-display.js`
- Modify: `miniprogram/pages/upload/upload.js`
- Modify: `miniprogram/pages/paper-preview/paper-preview.js`
- Modify: `miniprogram/pages/upload-history/upload-history.js`
- Modify: `miniprogram/pages/report/report.js`
- Test: `tests/page-flows.test.js`
- Test: `tests/learning-records.test.js`

- [ ] **Step 1: Extract paper display code**

Centralize:

- `paperDisplayCode`
- `paperTitle`
- `studentPagesText`
- `answerPagesText`
- `questionCountText`
- `bottleneckSummaryText`
- `paperStatusText`

- [ ] **Step 2: Replace duplicated page logic**

Remove local `getPaperCodeText`, `getPaperName`, `buildBottleneckSummaries` duplicates.

- [ ] **Step 3: Verify timeline and paper workbench**

Run:

```bash
node --test tests/page-flows.test.js tests/learning-records.test.js
npm run verify
```

- [ ] **Step 4: Commit**

```bash
git add miniprogram tests
git commit -m "refactor: centralize paper display helpers"
```

---

## Phase 6: Extract Analysis Poller Wrapper

**Files:**

- Create: `miniprogram/utils/analysis-poller.js`
- Modify: `miniprogram/pages/subject-home/subject-home.js`
- Modify: `miniprogram/pages/report/report.js`
- Test: `tests/poller.test.js`
- Test: `tests/page-flows.test.js`

- [ ] **Step 1: Keep low-level `createPoller` unchanged**

Do not rewrite the timer primitive. Add a business wrapper on top.

- [ ] **Step 2: Create `createAnalysisPoller`**

Centralize:

- stale threshold.
- completed/failed/timeout decisions.
- progress callback shape.

- [ ] **Step 3: Replace page-specific branches**

`subject-home` and `report` should provide callbacks, not duplicate state-machine logic.

- [ ] **Step 4: Verify**

Run:

```bash
node --test tests/poller.test.js tests/page-flows.test.js
npm run verify
```

- [ ] **Step 5: Commit**

```bash
git add miniprogram tests
git commit -m "refactor: centralize analysis polling"
```

---

## Phase 7: Presenter Split For Heavy Pages

**Files:**

- Create: `miniprogram/pages/upload-history/upload-history-presenter.js`
- Create: `miniprogram/pages/paper-preview/paper-preview-presenter.js`
- Modify: `miniprogram/pages/upload-history/upload-history.js`
- Modify: `miniprogram/pages/paper-preview/paper-preview.js`
- Test: `tests/learning-records.test.js`
- Test: `tests/page-flows.test.js`

- [ ] **Step 1: Extract pure timeline presentation**

Move grouping, filter counts, collapsed states, and card view-model construction out of `upload-history.js`.

- [ ] **Step 2: Extract pure paper workbench presentation**

Move PDF status, paper metadata, preview list, and feedback state shaping out of `paper-preview.js`.

- [ ] **Step 3: Keep Page files focused**

Page files should mainly handle:

- `onLoad`
- data loading
- `setData`
- navigation
- user actions

- [ ] **Step 4: Verify**

Run:

```bash
node --test tests/learning-records.test.js tests/page-flows.test.js
npm run verify
```

- [ ] **Step 5: Commit**

```bash
git add miniprogram tests
git commit -m "refactor: split heavy page presenters"
```

---

## Phase 8: Split `analyzePhotos` Pipeline

**Files:**

- Modify: `cloudfunctions/analyzePhotos/index.js`
- Optionally create: `cloudfunctions/analyzePhotos/pipeline.js`
- Optionally create: `cloudfunctions/analyzePhotos/verification.js`
- Optionally create: `cloudfunctions/analyzePhotos/dedup.js`
- Test: `tests/cloud-functions.test.js`
- Test: `tests/analyze-batch-result.test.js`
- Test: `tests/verification-evidence.test.js`

- [ ] **Step 1: Add characterization tests for existing behavior**

Before splitting, ensure tests cover:

- duplicate handling.
- batch partial failure.
- all-duplicate report.
- verification evidence.
- stale interrupted tasks.
- profile status writeback.

- [ ] **Step 2: Extract helpers without changing behavior**

Candidate helpers:

- `loadReportContext`
- `recoverStaleTasks`
- `runAnalyzeBatches`
- `mergeBatchResults`
- `deduplicatePageResults`
- `applyVerificationEvidence`
- `writeReportAndProfile`

- [ ] **Step 3: Keep main function as orchestration**

The exported `main` should read like a workflow, not a 200-line implementation block.

- [ ] **Step 4: Verify**

Run:

```bash
node --test tests/cloud-functions.test.js tests/analyze-batch-result.test.js tests/verification-evidence.test.js
npm run verify
```

- [ ] **Step 5: Commit**

```bash
git add cloudfunctions/analyzePhotos tests
git commit -m "refactor: split photo analysis pipeline"
```

---

## Phase 9: Clean Dead Code And Docs

**Files:**

- Modify: `miniprogram/utils/util.js`
- Modify: `CLAUDE.md`
- Modify: `docs/superpowers/plans/2026-06-13-code-review-debt-execution.md` or mark superseded
- Test: `tests/project-integrity.test.js`
- Test: `tests/contracts.test.js`

- [ ] **Step 1: Remove or fix dead helpers**

Review:

- `severityBadgeClass`
- `CATEGORY_NAMES`
- unused subject maps.
- stale permission text.

- [ ] **Step 2: Update docs**

Make docs say:

- co-parent can operate learning workflows.
- family management remains owner-only.
- LP codes are internal identifiers.

- [ ] **Step 3: Verify**

Run:

```bash
npm run verify
```

- [ ] **Step 4: Commit**

```bash
git add miniprogram docs CLAUDE.md tests
git commit -m "chore: clean architecture debt documentation"
```

---

## Rollout Notes

- Deploy changed cloud functions after phases that touch backend code.
- Test in WeChat Developer Tools after Phase 2, Phase 5, and Phase 8.
- Keep commits small. If any phase fails, revert only that phase.
- Do not combine `analyzePhotos` splitting with permission changes in the same commit.

## Acceptance Criteria

- Co-parent can complete the same learning loop as owner:
  - upload paper photos.
  - trigger diagnosis.
  - read and download reports.
  - generate verification paper.
  - upload verification answers.
  - read feedback.
- Co-parent cannot manage family members.
- Subject names/colors have one source of truth.
- Bottleneck display has one source of truth.
- Learning record and paper pages show the same paper identifiers and status language.
- Analysis status handling is consistent across report and subject home.
- `npm run verify` passes after every phase.

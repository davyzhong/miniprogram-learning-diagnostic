# Traceable Multi-Child Workbench Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Upgrade the mini-program into a multi-child, multi-subject family learning workbench where every meaningful number, status, label, bottleneck, report, paper code, and evidence item is traceable and clickable.

**Architecture:** Keep the current presenter pattern and cloud-function permission model. Add a small shared navigation/action model for traceable UI elements, then update page presenters and WXML views so cards are not only readable but also drill-downable. Defer large infrastructure changes, but include review-identified reliability tasks in the same execution backlog.

**Tech Stack:** WeChat Mini Program WXML/WXSS/JS, Tencent Cloud Functions, Node.js built-in test runner, existing presenter utilities under `miniprogram/utils` and `miniprogram/pages/*/*-presenter.js`.

---

## Global Decisions

- Homepage uses the **B + C child card** model: each child card is a small workbench showing pending status, subject overview, latest value, and next action.
- Child cards are uniform. Do not visually distinguish whether the child was created by the current user or shared by another parent.
- Subjects remain fixed to `math/chinese/english`, with per-child visibility controls. Hidden subjects preserve data.
- Apply the global **traceable interaction principle**:
  - Every displayed semantic value is clickable when it has a source, list, evidence chain, detail page, permission explanation, or empty-state explanation.
  - No-data and no-permission states remain clickable and open empty/permission explanation pages instead of becoming dead UI.
- Preserve existing data. Do not delete or migrate user learning records unless a cleanup task explicitly targets obviously stuck/dirty state records.
- Current dirty worktree note: `scripts/devtools-parent-timeline-e2e.js` is already modified. Inspect it before editing; do not revert it.

## Files And Responsibilities

### New Or Expanded Shared Utilities

- `miniprogram/utils/traceable-actions.js`
  - Define action types, URL builders, and empty/permission action fallbacks.
  - Keep page JS handlers small and consistent.

- `miniprogram/utils/child-workbench.js`
  - Build per-child homepage card view models from students, subject profiles, reports, papers, and status items.
  - Keep multi-child logic out of `pages/index/index.js`.

- `miniprogram/utils/bottleneck-view.js`
  - Add shared helpers for profile bottleneck extraction and filters.
  - Remove repeated `profileBottlenecks` logic from page files where possible.

- `miniprogram/utils/bottleneck-name.js` and `cloudfunctions/_shared/bottleneck-name.js`
  - Keep behavior identical.
  - Either add a generation/check script or document the duplication as intentional with an integrity test.

### Page Presenters And Controllers

- `miniprogram/pages/index/index-presenter.js`
  - Move from single active child home model to child card list model.
  - Expose traceable actions for child card header, status blocks, subject rows, latest report, paper code, and next action.

- `miniprogram/pages/index/index.js`
  - Add one generic traceable handler and specific wrappers for child card regions.
  - Keep current navigation helpers as implementation detail.

- `miniprogram/pages/subject-home/subject-home-presenter.js`
  - Add action metadata to quick stats and task queue chips.

- `miniprogram/pages/report/report-presenter.js` and `miniprogram/pages/report/report.js`
  - Make report metrics, bottleneck items, paper code, evidence time, source photos, and error sections traceable.

- `miniprogram/pages/paper-preview/paper-preview-presenter.js` and `miniprogram/pages/paper-preview/paper-preview.js`
  - Make paper code, status, page counts, covered bottlenecks, question bottleneck tags, and feedback chips traceable.

- `miniprogram/pages/bottleneck-center/*` and `miniprogram/pages/bottleneck-detail/*`
  - Add stat, chip, evidence, metric, related report, and related paper drill-downs.

- `miniprogram/pages/generate-verification/*`
  - Keep row tap as select/deselect.
  - Add a separate "查看" or info affordance for bottleneck detail.

- `miniprogram/pages/upload-history/*`
  - Make timeline chips, paper code, photo count, evidence time, and status items independently traceable.

- `miniprogram/pages/upload/*`
  - Allow selected photo preview.
  - Make duplicate/name warning explainable.

- `miniprogram/pages/parent-management/*`
  - Allow invite code/path copy or share.
  - Add clickable permission explanation for viewer state.

- `miniprogram/pages/default-paper/*`
  - Make paper metadata open a coverage/detail explanation instead of remaining inert.

### Tests And Docs

- `tests/index-presenter.test.js`
- `tests/subject-home-presenter.test.js`
- `tests/report-presenter.test.js`
- `tests/learning-records.test.js`
- `tests/page-flows.test.js`
- `tests/parent-management-page-flows.test.js`
- `tests/project-integrity.test.js`
- `scripts/devtools-parent-timeline-e2e.js`
- `docs/ARCHITECTURE.md`
- `docs/TESTING.md`
- `docs/superpowers/specs/*` or a new spec note for the global traceable principle.

---

## Phase 1: Lock The Traceable Interaction Contract

**Files:**
- Create: `miniprogram/utils/traceable-actions.js`
- Test: `tests/page-flows.test.js`
- Test: `tests/project-integrity.test.js`
- Modify docs: `docs/ARCHITECTURE.md`

- [ ] **Step 1: Write tests for the action contract**

Add tests that assert action objects support these minimum forms:

```js
{
  type: 'student-profile' | 'subject-home' | 'report-detail' | 'paper-workbench' |
    'bottleneck-detail' | 'learning-records' | 'upload-history' |
    'permission-info' | 'empty-state-info',
  studentId: 'student_1',
  subject: 'math',
  id: 'optional-target-id',
  filter: 'optional-filter',
  title: 'reader-facing label'
}
```

Expected behavior:
- Valid actions build deterministic mini-program URLs.
- Permission and empty-state actions do not fail; they build explanation routes or fallback query params.
- Unknown action types return `null` and page handlers show a friendly toast.

- [ ] **Step 2: Run the new tests and verify failure**

Run:

```bash
npm test -- tests/page-flows.test.js
```

Expected: FAIL because `traceable-actions.js` does not exist.

- [ ] **Step 3: Implement `traceable-actions.js`**

Implement:
- `buildTraceableUrl(action)`
- `normalizeTraceableAction(action)`
- `isTraceableAction(action)`
- `fallbackTraceableAction(kind, context)`

Keep it dependency-light. Use existing page routes:
- `/pages/subject-home/subject-home`
- `/pages/report/report`
- `/pages/paper-preview/paper-preview`
- `/pages/bottleneck-center/bottleneck-center`
- `/pages/bottleneck-detail/bottleneck-detail`
- `/pages/upload-history/upload-history`
- `/pages/parent-management/parent-management`

- [ ] **Step 4: Add documentation**

Document the global principle:

> Any displayed semantic value with a backing data source must expose a traceable action. No-data and no-permission states remain clickable and open explanation states.

- [ ] **Step 5: Run verification**

Run:

```bash
npm run verify
```

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add miniprogram/utils/traceable-actions.js tests/page-flows.test.js tests/project-integrity.test.js docs/ARCHITECTURE.md
git commit -m "feat: define traceable interaction contract"
```

---

## Phase 2: Homepage Multi-Child B+C Workbench

**Files:**
- Create: `miniprogram/utils/child-workbench.js`
- Modify: `miniprogram/pages/index/index-presenter.js`
- Modify: `miniprogram/pages/index/index.js`
- Modify: `miniprogram/pages/index/index.wxml`
- Modify: `miniprogram/pages/index/index.wxss`
- Test: `tests/index-presenter.test.js`
- Test: `tests/page-flows.test.js`

- [ ] **Step 1: Write presenter tests for child cards**

Cover:
- Two children are displayed in one list.
- A shared child and owned child render with the same visual model.
- Each child card exposes actions for:
  - card body -> child profile summary
  - analyzing count -> status list
  - pending verification -> verification queue
  - pending upload -> upload verification queue
  - improved -> improved bottlenecks
  - subject row -> subject home
  - latest report -> report detail
  - paper code / next action -> paper workbench
- Hidden subjects render as visible management/explanation chips, not dead text.

- [ ] **Step 2: Run tests and verify failure**

Run:

```bash
npm test -- tests/index-presenter.test.js tests/page-flows.test.js
```

Expected: FAIL because child workbench view model is not present yet.

- [ ] **Step 3: Implement `child-workbench.js`**

Build pure functions:
- `buildChildWorkbenchCards({ students, profiles, reports, papers, statusItems })`
- `buildChildStatusSummary(childData)`
- `buildSubjectRowsForChild(childData)`
- `buildChildNextAction(childData)`

Use existing subject constants from `miniprogram/utils/constants.js`.

- [ ] **Step 4: Update index presenter and page**

Keep backwards compatibility while switching the primary UI to `childCards`.

Add a generic handler:

```js
onTraceableTap(e) {
  const action = decodeActionFromDataset(e.currentTarget.dataset)
  const url = buildTraceableUrl(action)
  if (!url) {
    wx.showToast({ title: '暂时没有可查看内容', icon: 'none' })
    return
  }
  wx.navigateTo({ url })
}
```

Use `catchtap` on nested elements to prevent the parent card tap from swallowing deep links.

- [ ] **Step 5: Update WXML/WXSS**

Implement the B+C card:
- child identity and grade
- shared parent count
- status mini-grid
- subject rows
- latest report/paper summary
- next action strip

All semantic values must have `bindtap` or `catchtap` with a traceable action.

- [ ] **Step 6: Verify**

Run:

```bash
npm run verify
```

Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add miniprogram/utils/child-workbench.js miniprogram/pages/index tests/index-presenter.test.js tests/page-flows.test.js
git commit -m "feat: add multi-child traceable workbench"
```

---

## Phase 3: Core Value Pages - Report And Paper Workbench

**Files:**
- Modify: `miniprogram/pages/report/report-presenter.js`
- Modify: `miniprogram/pages/report/report.js`
- Modify: `miniprogram/pages/report/report.wxml`
- Modify: `miniprogram/pages/report/report.wxss`
- Modify: `miniprogram/pages/paper-preview/paper-preview-presenter.js`
- Modify: `miniprogram/pages/paper-preview/paper-preview.js`
- Modify: `miniprogram/pages/paper-preview/paper-preview.wxml`
- Modify: `miniprogram/pages/paper-preview/paper-preview.wxss`
- Test: `tests/report-presenter.test.js`
- Test: `tests/verification-evidence.test.js`
- Test: `tests/page-flows.test.js`

- [ ] **Step 1: Write report traceability tests**

Assert report view state includes actions for:
- total errors -> error section/list
- bottleneck count -> bottleneck list
- source image count -> upload history/sources
- bottleneck item -> bottleneck detail
- paper code -> paper workbench
- evidence time -> source/evidence context

- [ ] **Step 2: Write paper workbench traceability tests**

Assert paper preview state includes actions for:
- paper code -> same paper workbench/detail
- status pill -> feedback report or upload action
- question count -> question preview section
- page summary -> PDF download/preview explanation
- covered bottlenecks -> bottleneck detail or filtered bottleneck list
- question bottleneck tag -> bottleneck detail
- feedback chips -> feedback report/detail

- [ ] **Step 3: Run tests and verify failure**

Run:

```bash
npm test -- tests/report-presenter.test.js tests/verification-evidence.test.js tests/page-flows.test.js
```

Expected: FAIL because actions are not exposed yet.

- [ ] **Step 4: Implement presenter actions**

Do not put business logic in WXML. Add action objects to presenter output and bind them in WXML.

- [ ] **Step 5: Implement page handlers**

Use `traceable-actions.js` for navigation.

For same-page sections, support local scroll/expand where possible; otherwise navigate to the relevant list page with query filters.

- [ ] **Step 6: Verify**

Run:

```bash
npm run verify
```

Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add miniprogram/pages/report miniprogram/pages/paper-preview tests/report-presenter.test.js tests/verification-evidence.test.js tests/page-flows.test.js
git commit -m "feat: make report and paper details traceable"
```

---

## Phase 4: Subject, Bottleneck, Timeline, Upload, Parent, Default Paper Pages

**Files:**
- Modify: `miniprogram/pages/subject-home/*`
- Modify: `miniprogram/pages/bottleneck-center/*`
- Modify: `miniprogram/pages/bottleneck-detail/*`
- Modify: `miniprogram/pages/generate-verification/*`
- Modify: `miniprogram/pages/upload-history/*`
- Modify: `miniprogram/pages/upload/*`
- Modify: `miniprogram/pages/parent-management/*`
- Modify: `miniprogram/pages/default-paper/*`
- Test: `tests/subject-home-presenter.test.js`
- Test: `tests/bottleneck-view.test.js`
- Test: `tests/learning-records.test.js`
- Test: `tests/parent-management-page-flows.test.js`

- [ ] **Step 1: Write tests for page-specific traceability**

Cover:
- Subject quick stats are clickable.
- Bottleneck center stats filter the list.
- Bottleneck detail metrics open evidence/report/paper views.
- Generate verification card rows still select, while the new info affordance opens detail.
- Timeline chips and paper codes have actions.
- Upload photo preview is reachable.
- Parent invite code/path can be copied.
- Default paper metadata opens detail/explanation.

- [ ] **Step 2: Run tests and verify failure**

Run:

```bash
npm test -- tests/subject-home-presenter.test.js tests/bottleneck-view.test.js tests/learning-records.test.js tests/parent-management-page-flows.test.js
```

Expected: FAIL for missing actions/handlers.

- [ ] **Step 3: Implement subject and bottleneck traceability**

Also clean up known review issues while touching these files:
- Extract duplicated `profileBottlenecks` to `miniprogram/utils/bottleneck-view.js`.
- Use shared subject constants instead of local `SUBJECT_NAMES` duplicates.
- Change `bottleneck-detail.onBackToCenter` from `navigateTo` to `redirectTo`.
- Remove the dead `pending` branch in `bottleneck-center.matchesStatus`.

- [ ] **Step 4: Implement timeline traceability**

Make these independent:
- paper code
- event status
- chips
- folded evidence
- source photo rows

Keep status/anomaly records visually folded as designed, but clickable.

- [ ] **Step 5: Implement flow-page traceability**

Upload:
- tap photo thumbnail -> preview image
- tap duplicate warning -> duplicate explanation

Parent management:
- tap invite code/path -> copy
- viewer notice -> permission explanation

Default paper:
- tap coverage/metadata -> coverage explanation

- [ ] **Step 6: Verify**

Run:

```bash
npm run verify
```

Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add miniprogram/pages/subject-home miniprogram/pages/bottleneck-center miniprogram/pages/bottleneck-detail miniprogram/pages/generate-verification miniprogram/pages/upload-history miniprogram/pages/upload miniprogram/pages/parent-management miniprogram/pages/default-paper miniprogram/utils/bottleneck-view.js tests
git commit -m "feat: apply traceable interactions across learning pages"
```

---

## Phase 5: Reliability And Experience Items From Review

**Files:**
- Modify: `cloudfunctions/analyzePhotos/index.js`
- Modify: `miniprogram/pages/upload/upload.wxml`
- Modify: `miniprogram/pages/upload/upload.js`
- Modify: `miniprogram/pages/report/report.js`
- Modify: `cloudfunctions/studentAccess/index.js`
- Modify: `docs/CLOUD_FUNCTIONS.md`
- Test: `tests/student-access.test.js`
- Test: `tests/analyze-photos-pipeline.test.js`
- Test: `tests/page-flows.test.js`

- [ ] **Step 1: Fix notification truthfulness**

Current issue: `sendNotification` is a stub, while upload UI says analysis completion will push a notification.

Choose the minimal current implementation:
- If subscription messages are not actually enabled, change UI copy to "完成后可在学习记录查看" and keep `sendNotification` documented as reserved.
- If subscription setup exists, implement the actual call and tests.

For today's scope, prefer truthful copy over a half-implemented push system.

- [ ] **Step 2: Improve batch upload/analysis status copy**

Add estimate text based on image count:
- 1-5 photos: about 1 minute
- 6-10 photos: about 1-2 minutes
- 11-20 photos: about 2-4 minutes

Make "analyzing" state clickable to report/status detail.

- [ ] **Step 3: Strengthen invite code**

Update invite code length from 6 to 8 characters or add failure-rate lockout.

Recommended: 8 characters now, lockout later if necessary.

Update tests for:
- invite code format
- existing valid code still accepted if present in database

- [ ] **Step 4: Verify**

Run:

```bash
npm run verify
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add cloudfunctions/analyzePhotos cloudfunctions/studentAccess miniprogram/pages/upload miniprogram/pages/report tests docs/CLOUD_FUNCTIONS.md
git commit -m "fix: improve analysis status and invite reliability"
```

---

## Phase 6: Engineering Debt Cleanup

**Files:**
- Modify/Create: `.github/workflows/verify.yml`
- Modify: `tests/project-integrity.test.js`
- Modify: `docs/TESTING.md`
- Modify: `docs/ARCHITECTURE.md`
- Delete if confirmed unused: `cloudfunctions_old_backup/`
- Optional later: font handling in `cloudfunctions/generatePaper` and `cloudfunctions/generateReportPDF`

- [ ] **Step 1: Add CI**

Create GitHub Actions workflow:

```yaml
name: Verify
on:
  push:
  pull_request:
jobs:
  verify:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: 20
      - run: npm run verify
```

- [ ] **Step 2: Handle bottleneck-name duplication**

Pick one:
- Add a sync/check script that compares behavior and fails on drift.
- Or generate one copy from a canonical file.

For today, keep duplication but strengthen integrity testing because mini-program and cloud-function module formats may differ.

- [ ] **Step 3: Remove obsolete backup directory**

Check contents:

```bash
find cloudfunctions_old_backup -maxdepth 2 -type f | sed -n '1,80p'
```

If no user data or active code depends on it, delete it and verify `.gitignore` no longer needs to mention it.

- [ ] **Step 4: Document font-size debt**

Do not move fonts in this same round unless deploy size is blocking.

Record:
- current duplicate 16MB fonts
- later option: shared storage font or subsetting
- current reason for keeping: PDF reliability and no environment variable dependency

- [ ] **Step 5: Decide WXML error boundary scope**

If WeChat base library supports the chosen error boundary pattern, add a small shared error-state component or documented fallback.

If not, document a page-level error-state convention and defer actual componentization.

- [ ] **Step 6: Verify**

Run:

```bash
npm run verify
```

Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add .github docs tests
git add -A cloudfunctions_old_backup
git commit -m "chore: add verify ci and clean engineering debt"
```

---

## Phase 7: Full Acceptance Testing

**Files:**
- Modify: `scripts/devtools-parent-timeline-e2e.js`
- Test: manual WeChat DevTools preview
- Docs: `docs/TESTING.md`

- [ ] **Step 1: Extend DevTools E2E coverage**

Add checks for:
- homepage renders multiple child workbench cards
- child card body enters child profile/summary
- status blocks enter corresponding filtered pages
- subject rows enter subject pages
- latest report opens report page
- paper code opens paper workbench
- report metrics are clickable
- paper workbench chips are clickable
- parent invite code can be copied
- upload photo preview works

- [ ] **Step 2: Run local verification**

Run:

```bash
npm run verify
npm run test:devtools-parent-timeline
```

Expected: PASS.

- [ ] **Step 3: Manual preview checklist**

In WeChat DevTools preview:
- Switch between two children.
- Open math subject from child card.
- Open current report from child card.
- Open current bottleneck from report.
- Generate or open a verification paper.
- Open paper code workbench.
- Upload verification result route is reachable.
- Viewer/shared parent can view but not manage family members.
- Empty and no-permission states are clickable and explanatory.

- [ ] **Step 4: Update docs**

Update:
- `docs/ARCHITECTURE.md`
- `docs/TESTING.md`
- `docs/DATA_DICTIONARY.md` if child/subject visibility fields are added
- relevant superpowers specs if the interaction principle changes page ownership

- [ ] **Step 5: Final commit and push**

```bash
git status --short
npm run verify
git add .
git commit -m "feat: complete traceable multi-child learning workbench"
git push
```

---

## Acceptance Criteria

- Homepage supports multiple children and uses high-density B+C child cards.
- All child cards expose traceable sub-actions for status, subject, report, paper, bottleneck, and next action.
- Report and paper pages make their core evidence, counts, labels, and identifiers clickable.
- Subject, bottleneck, timeline, upload, parent management, and default paper pages follow the same interaction rule.
- No-data and no-permission states are clickable and explanatory.
- Existing data is preserved.
- `npm run verify` passes.
- WeChat DevTools E2E smoke test passes.
- Documentation reflects the global traceable interaction principle.

## Defer Explicitly

- Full subscription message implementation if the account authorization/template setup is not ready.
- PDF font relocation or subsetting unless deployment size blocks release.
- Large database migration for multi-tenant family roles.
- Automatic background retry for failed AI analysis.

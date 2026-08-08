# Learning Bottleneck System ABC Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a three-layer learning bottleneck system: homepage bottleneck board, all-bottleneck center, and single-bottleneck workbench.

**Execution status:** Completed on 2026-06-14. Final verification: `npm run verify` passed with 228/228 regular tests and 78 JavaScript files checked.

**Architecture:** Reuse the existing `subjectProfiles.currentBottlenecks` data as the source of truth. Add a shared frontend presenter for `BottleneckView`, then render the same normalized object across homepage, bottleneck center, and bottleneck detail/workbench. Do not introduce a database migration in this phase; derive evidence from existing reports, papers, and timelines.

**Tech Stack:** WeChat Mini Program pages, existing CloudBase data access via `miniprogram/utils/cloud.js`, Node.js `node:test`, page harness tests, existing shared bottleneck naming helpers.

---

## File Structure

- Create: `miniprogram/utils/bottleneck-view.js`
  - Single responsibility: convert raw profile bottlenecks, reports, and papers into reader-facing `BottleneckView` objects.
- Create: `tests/bottleneck-view.test.js`
  - Unit tests for status, priority, evidence text, action routing, and LP-code hiding.
- Modify: `miniprogram/pages/index/index-presenter.js`
  - Add `priorityBottlenecks` and `bottleneckStats` to the homepage view.
- Modify: `miniprogram/pages/index/index.wxml`
  - Add homepage "当前学习卡点" board below the latest report card.
- Modify: `miniprogram/pages/index/index.wxss`
  - Add compact bottleneck board/card styles.
- Modify: `miniprogram/pages/index/index.js`
  - Add navigation from homepage bottleneck board to center/detail/generate-verification.
- Create: `miniprogram/pages/bottleneck-center/bottleneck-center.js`
- Create: `miniprogram/pages/bottleneck-center/bottleneck-center.wxml`
- Create: `miniprogram/pages/bottleneck-center/bottleneck-center.wxss`
- Create: `miniprogram/pages/bottleneck-center/bottleneck-center.json`
  - All-bottleneck center with subject/status filters and sorted cards.
- Create: `miniprogram/pages/bottleneck-detail/bottleneck-detail.js`
- Create: `miniprogram/pages/bottleneck-detail/bottleneck-detail.wxml`
- Create: `miniprogram/pages/bottleneck-detail/bottleneck-detail.wxss`
- Create: `miniprogram/pages/bottleneck-detail/bottleneck-detail.json`
  - Single bottleneck workbench with evidence chain, trends, related reports/papers, and next actions.
- Modify: `miniprogram/app.json`
  - Register the two new pages.
- Modify: `tests/page-flows.test.js`
  - Page flow tests for homepage navigation, bottleneck center, and detail actions.
- Modify: `tests/project-integrity.test.js`
  - Existing page-bundle registration test should pass after adding pages.
- Modify: `tests/contracts.test.js`
  - Contract tests ensuring bottleneck surfaces use shared presenter and do not show LP codes as primary text.
- Modify: `README.md`, `PROJECT_PLAN.md`, `docs/TESTING.md`, `docs/TEST_MATRIX.md`
  - Update test counts only after new tests are added and verified.

---

## Task 0: Baseline And Working Tree Hygiene

**Files:**
- Inspect only: whole repository

- [ ] **Step 1: Check current working tree**

Run:

```bash
git status --short
```

Expected: note existing uncommitted changes, especially prior report/PDF fixes and homepage report-card changes.

- [ ] **Step 2: Run baseline verification**

Run:

```bash
npm run verify
```

Expected: current baseline passes before bottleneck work begins.

- [ ] **Step 3: Decide commit boundary**

If prior unrelated changes are still uncommitted, either commit them first with a separate message or keep them intentionally grouped only if the user confirms. Do not mix architecture/PDF fixes into the bottleneck-system commit by accident.

---

## Task 1: Shared `BottleneckView` Presenter

**Files:**
- Create: `miniprogram/utils/bottleneck-view.js`
- Create: `tests/bottleneck-view.test.js`
- Modify: `package.json` only if the test script explicitly lists files and does not already include all tests

- [ ] **Step 1: Write failing tests for display normalization**

Add tests covering:

```js
const {
  buildBottleneckViews,
  buildBottleneckStats,
  findBottleneckView
} = require('../miniprogram/utils/bottleneck-view')

test('bottleneck view hides LP codes and formats readable state', () => {
  const views = buildBottleneckViews([{
    lpCode: 'LP-001',
    lpName: '计算错误（加减乘除）',
    status: 'persisting',
    trend: 'persisting',
    weight: 80,
    evidenceCount: 3,
    recentErrorCount: 5,
    firstSeenAt: '2026-06-08T09:00:00+08:00',
    lastSeenAt: '2026-06-12T09:00:00+08:00',
    verificationFailCount: 1
  }])

  assert.equal(views[0].displayName, '计算基础')
  assert.equal(views[0].statusText, '持续出现')
  assert.equal(views[0].priorityText, '高优先级')
  assert.equal(views[0].evidenceText, '3 次证据 · 最近 5 道相关错题')
  assert.doesNotMatch(views[0].displayName, /LP-\d+/)
})
```

- [ ] **Step 2: Verify the test fails**

Run:

```bash
node --test tests/bottleneck-view.test.js
```

Expected: FAIL because `miniprogram/utils/bottleneck-view.js` does not exist.

- [ ] **Step 3: Implement the shared presenter**

Implement:

```js
const { bottleneckLabelOf } = require('./learning-records')

const STATUS_META = {
  persisting: { text: '持续出现', className: 'persisting', actionText: '生成验证卷' },
  needs_verification: { text: '待验证', className: 'pending', actionText: '生成验证卷' },
  improved: { text: '已改善', className: 'improved', actionText: '查看证据' }
}

const TREND_META = {
  new: '新发现',
  persisting: '持续出现',
  declining: '下降中',
  improved: '已改善',
  recurring: '再次出现'
}
```

Export:

- `buildBottleneckViews(rawItems, options)`
- `buildBottleneckStats(views)`
- `findBottleneckView(views, lpCode)`
- `sortBottleneckViews(views)`

Rules:

- Use `bottleneckLabelOf` for display names.
- Never expose LP code as primary display.
- Sort by active risk first: recurring/persisting, needs_verification, declining, improved.
- Within the same state, sort by `weight` desc, then `recentErrorCount` desc, then `lastSeenAt` desc.
- Treat `weight >= 75` as high priority, `>= 45` as medium, otherwise low.

- [ ] **Step 4: Verify unit tests pass**

Run:

```bash
node --test tests/bottleneck-view.test.js
```

Expected: PASS.

- [ ] **Step 5: Add contract test**

In `tests/contracts.test.js`, add an assertion that homepage, subject home, center, and detail presenters import or rely on `bottleneck-view.js` once those pages exist.

- [ ] **Step 6: Commit**

```bash
git add miniprogram/utils/bottleneck-view.js tests/bottleneck-view.test.js tests/contracts.test.js
git commit -m "feat: add shared bottleneck view presenter"
```

---

## Task 2: A - Homepage Bottleneck Board

**Files:**
- Modify: `miniprogram/pages/index/index-presenter.js`
- Modify: `miniprogram/pages/index/index.wxml`
- Modify: `miniprogram/pages/index/index.wxss`
- Modify: `miniprogram/pages/index/index.js`
- Test: `tests/index-presenter.test.js`
- Test: `tests/page-flows.test.js`

- [ ] **Step 1: Write failing presenter test**

In `tests/index-presenter.test.js`, add:

```js
test('learning profile home surfaces priority bottlenecks below the primary report', () => {
  const view = buildLearningProfileHomeView({
    student: { _id: 'student-1', name: '钟青羽', grade: 6 },
    profiles: [{
      subject: 'math',
      subjectName: '数学',
      currentBottlenecks: [
        { lpCode: 'LP-001', status: 'persisting', trend: 'persisting', weight: 80, recentErrorCount: 5, evidenceCount: 3 },
        { lpCode: 'LP-008', status: 'improved', trend: 'declining', weight: 35, verificationPassCount: 1 }
      ]
    }],
    reports: [],
    papers: []
  }, relative)

  assert.equal(view.priorityBottlenecks.length, 2)
  assert.equal(view.priorityBottlenecks[0].displayName, '计算基础')
  assert.equal(view.priorityBottlenecks[0].actionText, '生成验证卷')
  assert.equal(view.bottleneckStats.activeCount, 1)
  assert.equal(view.bottleneckStats.improvedCount, 1)
})
```

- [ ] **Step 2: Verify presenter test fails**

Run:

```bash
node --test tests/index-presenter.test.js
```

Expected: FAIL because `priorityBottlenecks` does not exist.

- [ ] **Step 3: Implement presenter fields**

In `index-presenter.js`:

- Import `buildBottleneckViews` and `buildBottleneckStats`.
- Build all bottlenecks from all subject profiles.
- Add:
  - `home.priorityBottlenecks`: first 3 sorted views.
  - `home.bottleneckStats`: counts by status.
  - `home.hasBottleneckBoard`.

- [ ] **Step 4: Add homepage WXML**

Place below `primary-report-card`:

- Header: `当前学习卡点`
- Right link: `查看全部`
- Cards for `home.priorityBottlenecks`
- Each card shows:
  - displayName
  - statusText / priorityText
  - evidenceText
  - actionText

- [ ] **Step 5: Add navigation handlers**

In `index.js`:

- `onViewAllBottlenecks()`: navigate to `/pages/bottleneck-center/bottleneck-center?studentId=...`
- `onBottleneckTap(e)`: navigate to `/pages/bottleneck-detail/bottleneck-detail?studentId=...&subject=...&lpCode=...`
- `onBottleneckAction(e)`: if active/persisting, navigate to generate verification with `targetCode`.

- [ ] **Step 6: Add page flow test**

In `tests/page-flows.test.js`, assert:

- Homepage loaded with bottlenecks exposes `home.priorityBottlenecks`.
- `onViewAllBottlenecks` navigates to bottleneck center.
- `onBottleneckTap` navigates to bottleneck detail.

- [ ] **Step 7: Verify tests**

Run:

```bash
node --test tests/index-presenter.test.js tests/page-flows.test.js
```

Expected: PASS.

- [ ] **Step 8: Commit**

```bash
git add miniprogram/pages/index tests/index-presenter.test.js tests/page-flows.test.js
git commit -m "feat: surface priority bottlenecks on home"
```

---

## Task 3: B - Bottleneck Center Page

**Files:**
- Create: `miniprogram/pages/bottleneck-center/bottleneck-center.js`
- Create: `miniprogram/pages/bottleneck-center/bottleneck-center.wxml`
- Create: `miniprogram/pages/bottleneck-center/bottleneck-center.wxss`
- Create: `miniprogram/pages/bottleneck-center/bottleneck-center.json`
- Modify: `miniprogram/app.json`
- Test: `tests/page-flows.test.js`
- Test: `tests/project-integrity.test.js`

- [ ] **Step 1: Write failing page-flow test**

Add a test that loads the page with mocked `cloud.getStudentDashboard`:

```js
const { page } = loadPage('miniprogram/pages/bottleneck-center/bottleneck-center.js', {
  modules: {
    '../../utils/cloud': {
      getStudentDashboard: async () => ({
        student: { _id: 'student-1', name: '钟青羽' },
        subjectProfiles: [{
          subject: 'math',
          currentBottlenecks: [
            { lpCode: 'LP-001', status: 'persisting', weight: 80 },
            { lpCode: 'LP-008', status: 'improved', weight: 30 }
          ]
        }]
      })
    }
  }
})
await page.onLoad({ studentId: 'student-1' })
assert.equal(page.data.stats.totalCount, 2)
assert.equal(page.data.filteredBottlenecks[0].displayName, '计算基础')
```

- [ ] **Step 2: Verify test fails**

Run:

```bash
node --test tests/page-flows.test.js
```

Expected: FAIL because page does not exist or is not registered.

- [ ] **Step 3: Implement page data loading**

Page state:

- `studentId`
- `studentName`
- `activeSubject`: `all | math | chinese | english`
- `activeStatus`: `all | active | pending | persisting | improved | recurring`
- `allBottlenecks`
- `filteredBottlenecks`
- `stats`
- `loading`

Use `cloud.getStudentDashboard(studentId)` and `buildBottleneckViews`.

- [ ] **Step 4: Implement filters**

Handlers:

- `onSubjectFilterTap`
- `onStatusFilterTap`
- `onBottleneckTap`
- `onGenerateForBottleneck`

Filtering rules:

- `active`: status not improved.
- `pending`: `needs_verification`.
- `persisting`: `persisting`.
- `improved`: `improved` or trend `declining`.
- `recurring`: trend `recurring`.

- [ ] **Step 5: Implement WXML and WXSS**

Layout:

- Top summary cards: total,待验证,持续,已改善,复发.
- Subject segmented control.
- Status segmented control.
- Bottleneck list cards.
- Empty states for each filter.

- [ ] **Step 6: Register page**

Add to `miniprogram/app.json`:

```json
"pages/bottleneck-center/bottleneck-center"
```

- [ ] **Step 7: Verify tests**

Run:

```bash
node --test tests/page-flows.test.js tests/project-integrity.test.js
```

Expected: PASS.

- [ ] **Step 8: Commit**

```bash
git add miniprogram/app.json miniprogram/pages/bottleneck-center tests/page-flows.test.js
git commit -m "feat: add bottleneck center"
```

---

## Task 4: C - Single Bottleneck Workbench

**Files:**
- Create: `miniprogram/pages/bottleneck-detail/bottleneck-detail.js`
- Create: `miniprogram/pages/bottleneck-detail/bottleneck-detail.wxml`
- Create: `miniprogram/pages/bottleneck-detail/bottleneck-detail.wxss`
- Create: `miniprogram/pages/bottleneck-detail/bottleneck-detail.json`
- Modify: `miniprogram/app.json`
- Test: `tests/page-flows.test.js`

- [ ] **Step 1: Write failing detail page test**

Mock `cloud.getSubjectDashboard` with:

- profile containing `currentBottlenecks`
- reports containing `bottlenecks`
- papers containing `bottleneckTargets`

Expected:

- `page.data.bottleneck.displayName === '计算基础'`
- `page.data.evidenceChain.length >= 2`
- `page.data.relatedReports.length === 1`
- `page.data.relatedPapers.length === 1`
- primary action navigates to generate verification with target code.

- [ ] **Step 2: Verify test fails**

Run:

```bash
node --test tests/page-flows.test.js
```

Expected: FAIL because page does not exist.

- [ ] **Step 3: Implement detail data loading**

Route params:

- `studentId`
- `subject`
- `lpCode`
- optional `studentName`

Data source:

- `cloud.getSubjectDashboard(studentId, subject)`
- Use `findBottleneckView(profile.currentBottlenecks, lpCode)`.
- Derive:
  - `relatedReports`: reports where `report.bottlenecks.some(b => b.lpCode === lpCode)`
  - `relatedPapers`: papers where `paper.bottleneckTargets.includes(lpCode)`
  - `verificationReports`: reports where `report.verificationTargets.includes(lpCode)` or `report.verificationEvidence` contains code
  - `evidenceChain`: normalized timeline rows from reports and papers.

- [ ] **Step 4: Implement actions**

Handlers:

- `onGenerateVerification`: navigate to generate-verification with `targetCode`.
- `onViewReport`: navigate to report detail.
- `onViewPaper`: navigate to paper preview.
- `onBackToCenter`: navigate to bottleneck center.

- [ ] **Step 5: Implement WXML/WXSS**

Sections:

- Hero: displayName, subject, status, weight.
- Trend summary: first seen, last seen, verification pass/fail counts.
- Evidence chain: date rows with report/paper links.
- Related reports.
- Related verification papers.
- Next step action panel.

- [ ] **Step 6: Register page and verify integrity**

Run:

```bash
node --test tests/project-integrity.test.js
```

Expected: PASS.

- [ ] **Step 7: Verify page tests**

Run:

```bash
node --test tests/page-flows.test.js
```

Expected: PASS.

- [ ] **Step 8: Commit**

```bash
git add miniprogram/app.json miniprogram/pages/bottleneck-detail tests/page-flows.test.js
git commit -m "feat: add bottleneck workbench"
```

---

## Task 5: Connect Subject Home And Verification Flow

**Files:**
- Modify: `miniprogram/pages/subject-home/subject-home-presenter.js`
- Modify: `miniprogram/pages/subject-home/subject-home.wxml`
- Modify: `miniprogram/pages/subject-home/subject-home.js`
- Modify: `miniprogram/pages/generate-verification/generate-verification.js`
- Test: `tests/subject-home-presenter.test.js`
- Test: `tests/page-flows.test.js`

- [ ] **Step 1: Write failing subject-home test**

Expected:

- Subject home task queue uses the shared `BottleneckView`.
- Tapping a task opens `bottleneck-detail`, not only a generic toast or old handler.
- Primary action still opens generate-verification for multiple active bottlenecks.

- [ ] **Step 2: Refactor subject presenter**

Use `buildBottleneckViews` instead of duplicating status display logic.

- [ ] **Step 3: Update task tap behavior**

In `subject-home.js`, `onTaskTap` should navigate to:

```txt
/pages/bottleneck-detail/bottleneck-detail?studentId=...&subject=...&lpCode=...
```

- [ ] **Step 4: Improve generate-verification default selection**

When `targetCode` is present, select that one card first. When absent, select top 5 active bottlenecks using shared sorting.

- [ ] **Step 5: Verify tests**

Run:

```bash
node --test tests/subject-home-presenter.test.js tests/page-flows.test.js
```

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add miniprogram/pages/subject-home miniprogram/pages/generate-verification tests/subject-home-presenter.test.js tests/page-flows.test.js
git commit -m "feat: connect bottleneck workbench across subject flows"
```

---

## Task 6: Contracts, Docs, And Full Verification

**Files:**
- Modify: `tests/contracts.test.js`
- Modify: `README.md`
- Modify: `PROJECT_PLAN.md`
- Modify: `docs/TESTING.md`
- Modify: `docs/TEST_MATRIX.md`
- Modify: `PRD.md` if product status/test counts are listed
- Modify: `SETUP.md` if test counts are listed

- [ ] **Step 1: Add contract tests**

Assert:

- User-facing bottleneck surfaces do not render LP codes as primary text.
- `bottleneck-center` and `bottleneck-detail` pages are registered.
- Homepage, subject home, center, detail use shared presenter.
- Generate verification receives `targetCode` for single-bottleneck actions.

- [ ] **Step 2: Run full verification**

Run:

```bash
npm run verify
```

Expected: all tests pass and JS check passes.

- [ ] **Step 3: Update docs test counts**

Search:

```bash
rg -n "219|测试|用例" README.md SETUP.md PROJECT_PLAN.md PRD.md docs/TESTING.md docs/TEST_MATRIX.md
```

Update counts to the new final value only after `npm run verify`.

- [ ] **Step 4: Run final verification again**

Run:

```bash
npm run verify
```

Expected: all tests pass after doc updates.

- [ ] **Step 5: Commit**

```bash
git add tests/contracts.test.js README.md SETUP.md PROJECT_PLAN.md PRD.md docs/TESTING.md docs/TEST_MATRIX.md
git commit -m "test: cover bottleneck system contracts"
```

---

## Acceptance Criteria

- Homepage shows latest report and priority bottlenecks together.
- Homepage "查看全部" opens bottleneck center.
- Bottleneck center shows all bottlenecks across subjects with filters.
- Bottleneck detail page shows one bottleneck's evidence chain, trend, related reports, related papers, and next action.
- Single-bottleneck "生成验证卷" opens verification generation with that target selected.
- No user-facing primary text uses LP codes.
- Shared `BottleneckView` presenter is the single source for card labels, status text, priority text, and evidence text.
- `npm run verify` passes.

---

## Recommended Execution Order

1. Commit current unrelated work first if needed.
2. Task 1: shared presenter.
3. Task 2: homepage board.
4. Task 3: bottleneck center.
5. Task 4: bottleneck detail.
6. Task 5: subject home and verification flow wiring.
7. Task 6: contracts, docs, full verification.

This order keeps every step testable and avoids building new pages before the shared bottleneck display model exists.

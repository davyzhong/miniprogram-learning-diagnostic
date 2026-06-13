# Code Review Debt Execution Plan

> Superseded on 2026-06-13 by `docs/superpowers/plans/2026-06-13-architecture-dedup-permission-plan.md`.
> This document is kept as historical review context. Its earlier `viewer = read-only` assumptions are no longer the current product policy: an invited co-parent can operate learning workflows, while family member management remains owner-only.

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Resolve the verified code review findings without disrupting the single-child learning diagnostic MVP flow.

**Architecture:** Execute in small, testable slices. Start with user-visible bugs and permission semantics, then centralize constants and access rules, then refactor large files and repeated presenters only after behavior is covered by tests.

**Tech Stack:** WeChat Mini Program, CloudBase cloud functions, Node.js built-in test runner, existing `npm run verify` quality gate.

---

## Scope And Order

This plan intentionally avoids a big-bang rewrite. The recommended order is:

1. Fix small user-visible bugs.
2. Make permission semantics explicit and shared.
3. Consolidate constants that affect UI and data labels.
4. Clean up dead naming/code paths.
5. Extract repeated presenter/poller/paper helpers.
6. Split `analyzePhotos` after regression coverage is strong.

The already-decided change "共同家长可以下载诊断报告 PDF" is implemented separately in this branch and should be verified with this plan's regression commands.

---

### Task 1: Fix Join Success Navigation

**Files:**
- Modify: `miniprogram/pages/join-student/join-student.js`
- Test: `tests/parent-management-page-flows.test.js`

- [ ] **Step 1: Write the failing test**

Add assertions that accepting by link and by invite code use `wx.reLaunch({ url: '/pages/index/index' })`, not `navigateTo`.

```js
test('accepted invite returns to home with reLaunch', async () => {
  const wx = createWxMock()
  const cloud = {
    acceptStudentInvite: async () => ({ student: { _id: 'student-1', name: '钟青羽' }, role: 'viewer' })
  }
  const { page } = loadPage('miniprogram/pages/join-student/join-student.js', {
    wx,
    modules: { '../../utils/cloud': cloud }
  })
  page.setData({ status: 'ready', inviteId: 'invite-1', token: 'token-1', displayName: '妈妈', relation: 'mother' })

  await page.onAccept()

  assert.equal(wx.calls.find(call => call.name === 'navigateTo'), undefined)
  assert.match(wx.calls.find(call => call.name === 'reLaunch').payload.url, /pages\/index\/index/)
})
```

- [ ] **Step 2: Run the failing test**

Run:

```bash
node --test tests/parent-management-page-flows.test.js --test-name-pattern "accepted invite returns to home"
```

Expected: FAIL because current code calls `navigateTo`.

- [ ] **Step 3: Implement the minimal fix**

In `miniprogram/pages/join-student/join-student.js`, replace both home navigation calls:

```js
wx.reLaunch({ url: '/pages/index/index' })
```

- [ ] **Step 4: Verify**

Run:

```bash
node --test tests/parent-management-page-flows.test.js
npm run verify
```

Expected: all tests pass.

- [ ] **Step 5: Commit**

```bash
git add miniprogram/pages/join-student/join-student.js tests/parent-management-page-flows.test.js
git commit -m "fix: return home after joining student"
```

---

### Task 2: Define Shared Permission Semantics

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

- [ ] **Step 1: Write characterization tests**

Add tests for the intended policy:

- viewer cannot upload photos.
- viewer cannot generate verification papers.
- viewer can read analysis progress.
- viewer can read report details.
- viewer can generate/download report PDF.
- stranger can do none of the above.

Run:

```bash
node --test tests/cloud-functions.test.js tests/student-data-access.test.js tests/student-access.test.js
```

Expected: existing behavior mostly passes except any newly added contract not yet implemented.

- [ ] **Step 2: Create shared access helper**

Create `cloudfunctions/_shared/access.js`:

```js
async function getStudent(db, studentId) {
  if (!studentId) return null
  const res = await db.collection('students').doc(studentId).get()
  return res.data || null
}

async function getActiveMember(db, studentId, openId) {
  if (!studentId || !openId) return null
  const res = await db.collection('studentMembers').where({ studentId, memberOpenId: openId, status: 'active' }).get()
  return (res.data || [])[0] || null
}

async function getStudentAccess(db, studentId, openId) {
  const student = await getStudent(db, studentId)
  if (!student) return { allowed: false, role: '', student: null }
  if (student._openid && student._openid === openId) return { allowed: true, role: 'owner', student }
  const member = await getActiveMember(db, studentId, openId)
  if (!member) return { allowed: false, role: '', student }
  return { allowed: true, role: member.role || 'viewer', student, member }
}

function canRead(access) {
  return Boolean(access && access.allowed)
}

function canWrite(access) {
  return Boolean(access && access.allowed && access.role === 'owner')
}

module.exports = { getStudentAccess, canRead, canWrite }
```

- [ ] **Step 3: Migrate one cloud function at a time**

Start with `generateReportPDF`, then `getAnalysisProgress`, then owner-only functions. Keep behavior unchanged except where the tests define the product decision.

- [ ] **Step 4: Verify after each function**

Run after each migration:

```bash
node --test tests/cloud-functions.test.js --test-name-pattern "viewer|generateReportPDF|getAnalysisProgress|generatePaper|uploadAndAnalyze"
```

- [ ] **Step 5: Run full regression**

```bash
npm run verify
```

- [ ] **Step 6: Commit**

```bash
git add cloudfunctions tests
git commit -m "refactor: centralize student access checks"
```

---

### Task 3: Centralize Subject Constants And Colors

**Files:**
- Create: `miniprogram/utils/constants.js`
- Create: `cloudfunctions/_shared/constants.js`
- Modify: `miniprogram/pages/index/index.js`
- Modify: `miniprogram/pages/index/index-presenter.js`
- Modify: `miniprogram/pages/subject-home/subject-home.js`
- Modify: `miniprogram/pages/subject-home/subject-home.wxss`
- Modify: `miniprogram/pages/upload-history/upload-history.js`
- Modify: `cloudfunctions/generatePaper/index.js`
- Modify: `cloudfunctions/analyzeBatch/index.js`
- Modify: `cloudfunctions/analyzePhotos/index.js`
- Test: `tests/coverage-gap.test.js`
- Test: `tests/contracts.test.js`

- [ ] **Step 1: Write failing tests for color consistency**

Update `tests/coverage-gap.test.js` so `subject-home.setNavColor()` expects the same math/chinese/english colors used by `.top-bar`.

Expected colors:

```js
math: '#1f4f82'
chinese: '#276749'
english: '#9c4f24'
```

- [ ] **Step 2: Create frontend constants**

Create `miniprogram/utils/constants.js`:

```js
const SUBJECTS = ['math', 'chinese', 'english']

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

module.exports = { SUBJECTS, SUBJECT_NAMES, SUBJECT_COLORS }
```

- [ ] **Step 3: Replace page-local subject maps**

Migrate only files touched by tests first:

- `subject-home.js`
- `index.js`
- `upload-history.js`
- `index-presenter.js`

- [ ] **Step 4: Create cloud constants**

Create `cloudfunctions/_shared/constants.js` with `SUBJECTS`, `SUBJECT_NAMES`, and `SUBJECT_CODES`.

- [ ] **Step 5: Migrate cloud subject maps**

Replace local maps in:

- `generatePaper/index.js`
- `analyzeBatch/index.js`
- `analyzePhotos/index.js`

- [ ] **Step 6: Verify**

```bash
node --test tests/coverage-gap.test.js tests/contracts.test.js tests/cloud-functions.test.js
npm run verify
```

- [ ] **Step 7: Commit**

```bash
git add miniprogram cloudfunctions tests
git commit -m "refactor: centralize subject constants"
```

---

### Task 4: Clean Bottleneck Naming Dead Paths

**Files:**
- Modify: `miniprogram/utils/util.js`
- Modify: `miniprogram/utils/bottlenecks.js`
- Modify: `cloudfunctions/generatePaper/bottleneck-display.js`
- Test: `tests/util.test.js`
- Test: `tests/learning-records.test.js`
- Test: `tests/generate-paper-pdf.test.js`

- [ ] **Step 1: Decide canonical scheme**

Use `LP-001` style as canonical because current AI prompts, tests, generated papers, and reports all use it.

- [ ] **Step 2: Write tests for current canonical behavior**

Add tests:

```js
assert.equal(formatBottleneckDisplayName({ lpCode: 'LP-001' }), '计算基础')
assert.equal(formatBottleneckDisplayName({ lpCode: 'LP-008' }), '审题理解')
assert.equal(formatBottleneckDisplayName({ lpCode: 'LP-OP-001' }), '待确认卡点')
```

- [ ] **Step 3: Remove or isolate old category map**

Remove `CATEGORY_NAMES` if no production caller depends on `LP-OP` categories. If backward compatibility is desired, move it to a clearly named `LEGACY_CATEGORY_NAMES`.

- [ ] **Step 4: Consolidate display-name cleanup**

Use one implementation for:

- front-end display names,
- generated paper preview names,
- PDF chip names.

Keep cloud and mini-program copies separate only if module sharing is impractical.

- [ ] **Step 5: Verify**

```bash
node --test tests/util.test.js tests/learning-records.test.js tests/generate-paper-pdf.test.js
npm run verify
```

- [ ] **Step 6: Commit**

```bash
git add miniprogram/utils cloudfunctions/generatePaper tests
git commit -m "refactor: simplify bottleneck naming"
```

---

### Task 5: Extract Paper Display Helpers

**Files:**
- Create: `miniprogram/utils/paper.js`
- Modify: `miniprogram/pages/paper-preview/paper-preview.js`
- Modify: `miniprogram/pages/upload/upload.js`
- Test: `tests/page-flows.test.js`
- Test: `tests/util.test.js`

- [ ] **Step 1: Write helper tests**

Create tests for:

- `getPaperName(paper)`,
- `getPaperCodeText(paper)`,
- `buildBottleneckSummaries(paper)`,
- default paper grade naming,
- legacy paper fallback.

- [ ] **Step 2: Extract helpers**

Move duplicated logic from `paper-preview.js` and `upload.js` into `miniprogram/utils/paper.js`.

- [ ] **Step 3: Replace page-local methods**

Update both pages to call shared helpers. Keep page data shapes unchanged.

- [ ] **Step 4: Verify**

```bash
node --test tests/page-flows.test.js --test-name-pattern "paper preview|verification upload"
npm run verify
```

- [ ] **Step 5: Commit**

```bash
git add miniprogram/pages/paper-preview miniprogram/pages/upload miniprogram/utils/paper.js tests
git commit -m "refactor: share paper display helpers"
```

---

### Task 6: Extract Shared Analysis Poller

**Files:**
- Create: `miniprogram/utils/analysis-poller.js`
- Modify: `miniprogram/pages/subject-home/subject-home.js`
- Modify: `miniprogram/pages/report/report.js`
- Test: `tests/poller.test.js`
- Test: `tests/page-flows.test.js`
- Test: `tests/coverage-gap.test.js`

- [ ] **Step 1: Write tests for shared stale behavior**

Cover:

- completed analysis stops polling,
- failed analysis stops polling,
- stale task triggers timeout handling,
- missing task allows retry where permitted.

- [ ] **Step 2: Create `createAnalysisPoller`**

Wrap existing `createPoller` without changing its API:

```js
function createAnalysisPoller({ reportId, requestProgress, onCompleted, onFailed, onStale, onProgress }) {
  // Use existing createPoller and central STALE_ANALYSIS_MS.
}
```

- [ ] **Step 3: Replace page-specific pollers**

Update `subject-home.js` and `report.js` only after tests cover both paths.

- [ ] **Step 4: Verify**

```bash
node --test tests/poller.test.js tests/page-flows.test.js tests/coverage-gap.test.js
npm run verify
```

- [ ] **Step 5: Commit**

```bash
git add miniprogram/utils/analysis-poller.js miniprogram/pages/subject-home miniprogram/pages/report tests
git commit -m "refactor: share analysis polling behavior"
```

---

### Task 7: Split Upload History Presenter

**Files:**
- Create: `miniprogram/pages/upload-history/upload-history-presenter.js`
- Modify: `miniprogram/pages/upload-history/upload-history.js`
- Test: `tests/page-flows.test.js`
- Test: `tests/learning-records.test.js`

- [ ] **Step 1: Characterize current event building**

Move tests or add focused tests for:

- diagnosis report event,
- verification report event,
- verification paper event with display code,
- stale status filtering,
- subject filters,
- day grouping.

- [ ] **Step 2: Extract pure functions**

Move pure functions from `upload-history.js` into `upload-history-presenter.js`:

- `buildTimelineEvents`
- `buildHistoryState`
- `groupEventsByDay`
- `buildPaperEvent`
- `buildReportEvent`

- [ ] **Step 3: Keep Page file as controller**

`upload-history.js` should retain only:

- lifecycle,
- cloud calls,
- `setData`,
- navigation,
- preview handlers.

- [ ] **Step 4: Verify**

```bash
node --test tests/page-flows.test.js --test-name-pattern "learning records"
npm run verify
```

- [ ] **Step 5: Commit**

```bash
git add miniprogram/pages/upload-history tests
git commit -m "refactor: extract upload history presenter"
```

---

### Task 8: Split `analyzePhotos` Into Pipeline Functions

**Files:**
- Create: `cloudfunctions/analyzePhotos/pipeline.js`
- Modify: `cloudfunctions/analyzePhotos/index.js`
- Test: `tests/cloud-functions.test.js`
- Test: `tests/analyze-batch-result.test.js`
- Test: `tests/photo-dedup.test.js`
- Test: `tests/verification-evidence.test.js`

- [ ] **Step 1: Add pipeline characterization tests**

Before moving code, ensure tests cover:

- stale task recovery,
- batch split and failure,
- duplicate-only reports,
- verification evidence,
- profile update,
- task status write-back.

- [ ] **Step 2: Extract one function at a time**

Suggested extraction order:

1. `recoverStaleTask`
2. `createAnalysisTask`
3. `runBatches`
4. `dedupAndMergePages`
5. `applyVerificationComparison`
6. `writeReportAndProfile`

- [ ] **Step 3: Keep `exports.main` as orchestration**

Target shape:

```js
exports.main = async event => {
  const context = await loadAnalysisContext(event.reportId)
  await recoverStaleTask(context)
  const task = await createAnalysisTask(context)
  const batchResults = await runBatches(context, task)
  const merged = await dedupAndMergePages(context, batchResults)
  const result = await writeReportAndProfile(context, merged, task)
  return result
}
```

- [ ] **Step 4: Verify after each extraction**

```bash
node --test tests/cloud-functions.test.js --test-name-pattern "analyzePhotos"
```

- [ ] **Step 5: Full verify**

```bash
npm run verify
```

- [ ] **Step 6: Commit**

```bash
git add cloudfunctions/analyzePhotos tests
git commit -m "refactor: split analyze photos pipeline"
```

---

## Final Verification

Run before considering the full plan complete:

```bash
npm run verify
```

Manual smoke test in WeChat DevTools:

1. Add or open 钟青羽档案.
2. Open 学习记录 and verify old stale records do not dominate the timeline.
3. Open a completed diagnosis report as owner and download PDF.
4. Join as a second parent account if available and verify report PDF download works.
5. Confirm viewer still cannot upload photos or generate verification papers.
6. Generate a verification paper and confirm its display code appears in learning records and paper preview.

# Verification Task Pack Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [x]`) syntax for tracking.

**Goal:** Replace the current single verification paper target-selection flow with a task-pack model that can schedule many fine-grained bottlenecks across independently traceable pages.

**Architecture:** Add a pure planning layer that converts candidate learning targets into paginated verification pages, then embed the resulting `verificationPack` metadata into existing `papers` records. Later tasks print page codes into PDFs, match uploaded photos by page code, and update evidence per page and per target.

**Tech Stack:** WeChat Mini Program JavaScript, CloudBase cloud functions, Node.js test runner, existing `papers` / `reports` / `subjectProfiles` collections, PDFKit.

---

## Spec Reference

- Design spec: `docs/subject-design/钟青羽验证任务包与分页验证卷设计文档.md`
- Existing math design: `docs/subject-design/钟青羽数学学习地图与资源库升级详细设计.md`
- Existing Chinese design: `docs/subject-design/钟青羽语文错项驱动诊断与验证设计文档.md`

---

## File Structure

### New Files

- `cloudfunctions/generatePaper/verification-pack.js`
  - Pure helpers for target normalization, scheduling, page assignment, page code generation, question metadata decoration, and pack progress calculation.

- `tests/verification-pack.test.js`
  - Unit tests for scheduling, pagination, page codes, question metadata, and legacy compatibility.

### Modified Files

- `cloudfunctions/generatePaper/index.js`
  - Replace direct `targets.length * 5` paper semantics with task-pack generation.
  - Store `verificationPack` in `papers`.
  - Accept more than five targets when using task-pack mode.

- `cloudfunctions/generatePaper/pdf-renderer.js`
  - Print page-level `pageCode` on each student page.
  - Return page metadata alongside PDF buffer.

- `cloudfunctions/analyzePhotos/verification-evidence.js`
  - Build verification plan from `paper.verificationPack.pages` when present.
  - Keep legacy `paper.bottleneckTargets` fallback.

- `cloudfunctions/analyzePhotos/index.js`
  - Pass page-code-aware verification plan to `analyzeBatch`.
  - Persist `verificationPageCodes` and page-level evidence on verification reports.

- `cloudfunctions/analyzeBatch/index.js`
  - Ask AI to identify printed `pageCode` and return page-scoped evidence when a verification plan contains page codes.

- `miniprogram/pages/generate-verification/generate-verification.js`
  - Change default mode from manual card selection to generated plan preview.
  - Keep manual advanced selection as fallback.

- `miniprogram/pages/generate-verification/generate-verification.wxml`
  - Display recommended task-pack pages instead of a long checkbox list by default.

- `miniprogram/pages/generate-verification/generate-verification.wxss`
  - Style task-pack page cards and plan summary.

- `miniprogram/pages/paper-preview/paper-preview-presenter.js`
  - Expose task-pack progress and page rows.

- `miniprogram/pages/paper-preview/paper-preview.wxml`
  - Show page status list.

- `miniprogram/utils/paper-display.js`
  - Add display helpers for pack/page status.

- `docs/DATA_DICTIONARY.md`
  - Document `papers.verificationPack` and page-level verification report fields.

- `docs/TEST_MATRIX.md`
  - Add task-pack coverage rows.

---

## Task 1: Add Pure Verification Pack Planner

**Files:**
- Create: `cloudfunctions/generatePaper/verification-pack.js`
- Create: `tests/verification-pack.test.js`
- Modify: `package.json` test file list if needed

- [x] **Step 1: Write failing tests for target scheduling and pagination**

Add tests covering:

```js
test('buildVerificationPack paginates many fine bottlenecks instead of capping the whole paper at five', () => {
  const targets = Array.from({ length: 12 }, (_, index) => ({
    targetId: `BN-FINE-${index + 1}`,
    targetType: 'fine_bottleneck',
    displayName: `细分卡点 ${index + 1}`,
    lpCode: 'LP-001',
    weight: 80 - index
  }))

  const pack = buildVerificationPack({
    subject: 'math',
    paperCode: 'MATH-20260616-01',
    paperDate: '2026-06-16',
    targets
  })

  assert.equal(pack.totalTargets, 12)
  assert.ok(pack.pages.length > 1)
  assert.ok(pack.pages.every(page => page.targetIds.length <= 3))
  assert.deepEqual(pack.pages[0].pageCode, 'MATH-V-20260616-01-P01')
})
```

- [x] **Step 2: Run test to verify RED**

Run:

```bash
node --test tests/verification-pack.test.js
```

Expected: FAIL because `cloudfunctions/generatePaper/verification-pack.js` does not exist.

- [x] **Step 3: Implement minimal planner**

Implement:

```js
function buildVerificationPack({ subject, paperCode, paperDate, targets, options = {} })
function decorateQuestionsWithPack(questions, pack)
function pageCodeOf({ subject, paperDate, sequence, pageIndex })
function inferTargetType(targetId)
```

Rules:

- Math default: max 3 targets per page.
- Chinese concrete review default: max 8 targets per page.
- Each page gets `pageCode`.
- Each target gets stable `targetId`, `targetType`, `displayName`, `legacyLpCode`.
- Each question gets `questionId`, `pageCode`, `targetId`, `targetType`, `questionRole`.

- [x] **Step 4: Run test to verify GREEN**

Run:

```bash
node --test tests/verification-pack.test.js
```

Expected: PASS.

- [x] **Step 5: Commit**

```bash
git add cloudfunctions/generatePaper/verification-pack.js tests/verification-pack.test.js package.json
git commit -m "feat: add verification task pack planner"
```

---

## Task 2: Store Verification Pack Metadata on Generated Papers

**Files:**
- Modify: `cloudfunctions/generatePaper/index.js`
- Modify: `tests/cloud-functions.test.js`

- [x] **Step 1: Write failing cloud-function test**

Add a test:

```js
test('generatePaper stores verificationPack for many fine bottlenecks', async () => {
  // Build 8 BN-* targets in subjectProfiles.currentBottlenecks candidateBottlenecks.
  // Call generatePaper with all 8.
  // Assert success, paper.verificationPack.pages.length > 1, and paper.bottleneckTargets has all 8.
})
```

- [x] **Step 2: Run RED**

```bash
node --test --test-concurrency=1 tests/cloud-functions.test.js
```

Expected: FAIL because current `generatePaper` still rejects more than 5 targets.

- [x] **Step 3: Implement generation integration**

Modify `generatePaper/index.js`:

- Import planner helpers.
- For `type === 'verification'`, normalize target objects instead of raw strings where possible.
- Allow up to a task-pack cap, e.g. 60 targets, but enforce per-page limits in planner.
- Keep legacy single-page output working for small target lists.
- Save:

```js
verificationPack: {
  packId,
  mode: 'task_pack',
  scheduleStrategy,
  totalTargets,
  totalQuestions,
  totalStudentPages,
  completedStudentPages: 0,
  pages
}
```

- [x] **Step 4: Run targeted tests**

```bash
node --test --test-concurrency=1 tests/cloud-functions.test.js tests/verification-pack.test.js
```

Expected: PASS.

- [x] **Step 5: Commit**

```bash
git add cloudfunctions/generatePaper/index.js tests/cloud-functions.test.js
git commit -m "feat: store verification task packs on papers"
```

---

## Task 3: Print Page Codes in Verification PDFs

**Files:**
- Modify: `cloudfunctions/generatePaper/pdf-renderer.js`
- Modify: `tests/generate-paper-pdf.test.js`

- [x] **Step 1: Write failing PDF renderer test**

Add assertions that:

- Student page header includes the page code.
- Each student page has a unique code.
- `generatePDF` returns `studentPageMetas`.

- [x] **Step 2: Run RED**

```bash
node --test tests/generate-paper-pdf.test.js
```

Expected: FAIL because page code is not printed or returned.

- [x] **Step 3: Implement PDF page code rendering**

Modify renderer:

- Accept `options.verificationPack`.
- Determine page metadata while rendering.
- Print `pageCode` near existing `paperDisplayCode`.
- Add instruction text: `完成本页后，请拍清右上角页编号上传。`
- Return:

```js
{
  buffer,
  studentPages,
  answerPages,
  totalPages,
  studentPageMetas: [
    { pageIndex, pageCode, questionIds, targetIds }
  ]
}
```

- [x] **Step 4: Run PDF tests**

```bash
node --test tests/generate-paper-pdf.test.js
```

Expected: PASS.

- [x] **Step 5: Commit**

```bash
git add cloudfunctions/generatePaper/pdf-renderer.js tests/generate-paper-pdf.test.js
git commit -m "feat: print verification page codes in PDFs"
```

---

## Task 4: Build Page-Aware Verification Evidence Plan

**Files:**
- Modify: `cloudfunctions/analyzePhotos/verification-evidence.js`
- Modify: `tests/verification-evidence.test.js`

- [x] **Step 1: Write failing evidence-plan test**

Add tests that `buildVerificationPlan(paper)`:

- Uses `paper.verificationPack.pages` when present.
- Preserves `pageCode`, `questionIds`, `targetIds`.
- Falls back to legacy `bottleneckTargets` when no pack exists.

- [x] **Step 2: Run RED**

```bash
node --test tests/verification-evidence.test.js
```

Expected: FAIL for missing page-aware fields.

- [x] **Step 3: Implement page-aware plan**

Return plan items shaped like:

```js
{
  targetId,
  lpCode,
  targetType,
  pageCodes: ['MATH-V-20260616-01-P03'],
  expectedQuestionCount,
  questionIds: []
}
```

Keep legacy fields (`lpCode`, `expectedQuestionCount`) for existing aggregation.

- [x] **Step 4: Run tests**

```bash
node --test tests/verification-evidence.test.js tests/cloud-functions.test.js
```

Expected: PASS.

- [x] **Step 5: Commit**

```bash
git add cloudfunctions/analyzePhotos/verification-evidence.js tests/verification-evidence.test.js
git commit -m "feat: build page-aware verification plans"
```

---

## Task 5: Persist Page-Level Verification Results

**Files:**
- Modify: `cloudfunctions/analyzeBatch/index.js`
- Modify: `cloudfunctions/analyzePhotos/index.js`
- Modify: `tests/cloud-functions.test.js`
- Modify: `tests/analyze-batch-result.test.js`

- [x] **Step 1: Write failing tests**

Test that verification analysis:

- Sends page codes to `analyzeBatch`.
- Accepts AI output containing `pageCode`.
- Writes `reports.verificationPageCodes`.
- Writes `reports.verificationPageResults`.
- Updates only uploaded page evidence; missing pages remain missing, not failed.

- [x] **Step 2: Run RED**

```bash
node --test --test-concurrency=1 tests/cloud-functions.test.js tests/analyze-batch-result.test.js
```

Expected: FAIL because page-level fields are not persisted.

- [x] **Step 3: Implement AI prompt and result normalization**

Modify prompt:

- Tell AI to OCR page code from top/right area.
- If page code cannot be read, return empty `pageCode` and lower confidence.
- Return `questionEvidence` keyed by `questionId` when possible.

- [x] **Step 4: Implement report persistence**

Store page evidence without forcing unuploaded pages to fail.

- [x] **Step 5: Run tests**

```bash
node --test --test-concurrency=1 tests/cloud-functions.test.js tests/analyze-batch-result.test.js tests/verification-evidence.test.js
```

Expected: PASS.

- [x] **Step 6: Commit**

```bash
git add cloudfunctions/analyzeBatch/index.js cloudfunctions/analyzePhotos/index.js tests
git commit -m "feat: persist page-level verification evidence"
```

---

## Task 6: Upgrade Generate Verification Page to Plan Preview

**Files:**
- Modify: `miniprogram/pages/generate-verification/generate-verification.js`
- Modify: `miniprogram/pages/generate-verification/generate-verification.wxml`
- Modify: `miniprogram/pages/generate-verification/generate-verification.wxss`
- Modify: `tests/page-flows.test.js`

- [x] **Step 1: Write failing page-flow tests**

Tests:

- Many fine bottlenecks render as page groups, not a long default checkbox list.
- Default action sends all scheduled target IDs, not only selected first five.
- Manual mode still supports explicit selection.

- [x] **Step 2: Run RED**

```bash
node --test tests/page-flows.test.js
```

Expected: FAIL.

- [x] **Step 3: Implement plan preview state**

Add page data:

```js
planMode: 'recommended',
recommendedPackPreview: {
  totalTargets,
  estimatedPages,
  estimatedMinutes,
  pages: []
},
manualModeVisible: false
```

- [x] **Step 4: Update WXML/WXSS**

Show:

- Plan summary card.
- Page cards.
- Advanced manual selection collapsed behind a button.

- [x] **Step 5: Run tests**

```bash
node --test tests/page-flows.test.js
```

Expected: PASS.

- [x] **Step 6: Commit**

```bash
git add miniprogram/pages/generate-verification tests/page-flows.test.js
git commit -m "feat: preview verification task packs"
```

---

## Task 7: Show Task-Pack Progress in Paper Preview and Timeline

**Files:**
- Modify: `miniprogram/pages/paper-preview/paper-preview-presenter.js`
- Modify: `miniprogram/pages/paper-preview/paper-preview.wxml`
- Modify: `miniprogram/utils/paper-display.js`
- Modify: `tests/paper-preview-presenter.test.js`
- Modify: `tests/learning-records.test.js`

- [x] **Step 1: Write failing presenter tests**

Assert:

- Paper preview exposes `packProgressText`.
- Page rows show page code and status.
- Timeline labels a task pack as `验证任务包`.

- [x] **Step 2: Run RED**

```bash
node --test tests/paper-preview-presenter.test.js tests/learning-records.test.js
```

- [x] **Step 3: Implement display helpers**

Add pack-progress functions in `paper-display.js`.

- [x] **Step 4: Update pages**

Display page rows in paper preview.

- [x] **Step 5: Run tests**

```bash
node --test tests/paper-preview-presenter.test.js tests/learning-records.test.js tests/page-flows.test.js
```

Expected: PASS.

- [x] **Step 6: Commit**

```bash
git add miniprogram/pages/paper-preview miniprogram/utils/paper-display.js tests
git commit -m "feat: show verification task pack progress"
```

---

## Task 8: Docs, Deployment Checks, and Cloud Deployment

**Files:**
- Modify: `docs/DATA_DICTIONARY.md`
- Modify: `docs/TEST_MATRIX.md`
- Modify: `docs/DEPLOYMENT.md` if cloud function deploy notes change
- Modify: `tests/deployment-readiness.test.js` if new self-contained module rules are needed

- [x] **Step 1: Update docs**

Document:

- `papers.verificationPack`.
- `reports.verificationPageCodes`.
- `reports.verificationPageEvidence`.
- Page-code upload behavior.
- `studentData.getLearningTimeline` cursor pagination and lightweight timeline summaries.

- [x] **Step 2: Run full local verification**

```bash
npm run check
npm run check:deployment
npm test
```

Expected:

- JS check passes.
- Deployment readiness passes.
- Full test suite passes.

Actual:

- `npm test` → 389/389 PASS.
- `npm run check` → 133 JavaScript files PASS.
- `npm run check:deployment` → 10/10 PASS.
- WeChat DevTools `preview` → PASS, total package 690.3 KB.

- [x] **Step 3: Deploy changed cloud functions**

Deployed individually because the WeChat DevTools CLI treats comma-separated `--names` as one function name.

```bash
/Applications/wechatwebdevtools.app/Contents/MacOS/cli cloud functions deploy --env cloud1-d6gneg68m5a7a3876 --names generatePaper --remote-npm-install --project "/Users/qiming/Downloads/GoogleDrive/AI Learning/miniprogram-learning-diagnostic" --lang zh
/Applications/wechatwebdevtools.app/Contents/MacOS/cli cloud functions deploy --env cloud1-d6gneg68m5a7a3876 --names analyzePhotos --remote-npm-install --project "/Users/qiming/Downloads/GoogleDrive/AI Learning/miniprogram-learning-diagnostic" --lang zh
/Applications/wechatwebdevtools.app/Contents/MacOS/cli cloud functions deploy --env cloud1-d6gneg68m5a7a3876 --names analyzeBatch --remote-npm-install --project "/Users/qiming/Downloads/GoogleDrive/AI Learning/miniprogram-learning-diagnostic" --lang zh
/Applications/wechatwebdevtools.app/Contents/MacOS/cli cloud functions deploy --env cloud1-d6gneg68m5a7a3876 --names studentData --remote-npm-install --project "/Users/qiming/Downloads/GoogleDrive/AI Learning/miniprogram-learning-diagnostic" --lang zh
```

Deployment results:

- `generatePaper` → success true, filesCount 12, packSize 13.0 MB.
- `analyzePhotos` → success true, filesCount 10, packSize 22.4 KB.
- `analyzeBatch` → success true, filesCount 6, packSize 10.6 KB.
- `studentData` → success true, filesCount 3, packSize 5.3 KB.

- [x] **Step 4: Commit docs and final integration**

```bash
git add docs tests cloudfunctions miniprogram
git commit -m "docs: document verification task pack workflow"
git push origin main
```

---

## Rollout Notes

1. Preserve old papers: any paper without `verificationPack` must continue using legacy `bottleneckTargets`.
2. Preserve old reports: any report without `verificationPageEvidence` must continue rendering current evidence fields.
3. Use `verificationPack.mode = 'task_pack'` to gate new UI.
4. Do not update mastery status for unuploaded pages.
5. Do not mark a target improved unless all expected evidence for that target is present and correct.
6. Deploy cloud functions before real-device validation.

---

## Acceptance Checklist

- [x] A paper can contain more than 5 scheduled targets.
- [x] Each student page has a unique `pageCode`.
- [x] Each question has a `questionId`, `targetId`, and `targetType`.
- [x] Uploading one page can update only the targets on that page.
- [x] Missing pages remain pending instead of failed.
- [x] Legacy verification papers still work.
- [x] Chinese concrete error item verification still works.
- [x] Full `npm test` passes.
- [x] `generatePaper`, `analyzePhotos`, `analyzeBatch`, and `studentData` are deployed after cloud changes.

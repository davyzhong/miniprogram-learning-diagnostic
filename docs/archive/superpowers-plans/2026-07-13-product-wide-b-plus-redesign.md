# Product-wide B+ Redesign Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make formal diagnostic reports the center of the product and migrate all 21 user-facing mini-program pages to the approved compact, icon-rich B+ visual system without exceeding package or performance budgets.

**Architecture:** Add one shared formal-diagnosis selector/DTO used by both dashboard endpoints, then expose compact per-subject diagnosis workbenches through existing presenters. Add an additive global B+ WXSS layer and a small semantic icon map, migrate page families without changing their business workflows, and enforce adoption through manifest-driven static tests plus existing flow tests.

**Tech Stack:** WeChat Mini Program WXML/WXSS/CommonJS, CloudBase `wx-server-sdk`, Node.js `node:test`, WeChat DevTools CLI, existing package-size and deployment gates.

**Design spec:** `docs/superpowers/specs/2026-07-13-product-wide-b-plus-redesign-design.md`

**Working-tree constraint:** Existing uncommitted changes in cloud DTO/access files and tests are authoritative input. Inspect and preserve them. Never reset or overwrite them. Use path-scoped or hunk-scoped staging; if a clean feature-only commit cannot be made without including pre-existing changes, leave the task uncommitted and record that fact.

---

## File map

### Shared data and presentation

- Create `cloudfunctions/studentData/formal-diagnosis.js`: formal-diagnosis eligibility, per-subject selection, summary DTO, and subject-scoped query factory.
- Modify `cloudfunctions/studentData/home-dashboard.js`: include `latestDiagnosisReports` in every `perStudent` dashboard entry without client-side requests.
- Modify `cloudfunctions/studentData/timeline-dto.js`: project all lightweight fields required by diagnosis summaries.
- Modify `cloudfunctions/studentData/index.js`: return `latestDiagnosisReports` from `getStudentDashboard` and preserve current DTO extraction work.
- Modify `miniprogram/pages/index/index-presenter.js`: build diagnosis workbenches and family diagnosis coverage.
- Modify `miniprogram/pages/index/index.js` and `miniprogram/pages/student-profile/student-profile.js`: consume the explicit DTO and perform subject-scoped compatibility fallback only.

### Shared B+ system

- Create `miniprogram/utils/ui-icons.js`: stable semantic emoji constants and subject icon helpers for JavaScript/presenter use.
- Modify `miniprogram/app.wxss`: additive `bplus-*` page shell, section, icon, status, trend, action, empty, loading, and accessibility classes.
- Create `tests/bplus-design-system.test.js`: manifest-driven 21-page adoption, icon-label, package-safety, and shared-shell checks.
- Modify `package.json`: include the new test in `test:unit` and `test:coverage`.

### Core diagnosis pages

- Modify `miniprogram/pages/index/{index.js,index.wxml,index.wxss,index-presenter.js}`.
- Modify `miniprogram/pages/student-profile/{student-profile.js,student-profile.wxml,student-profile.wxss}`.
- Modify `miniprogram/pages/subject-home/{subject-home.js,subject-home.wxml,subject-home.wxss,subject-home-presenter.js}`.
- Modify `miniprogram/pages/report/{report.js,report.wxml,report.wxss,report-presenter.js}`.

### Learning loop pages

- Modify `miniprogram/pages/upload/{upload.wxml,upload.wxss}`.
- Modify `miniprogram/pages/upload-history/{upload-history.js,upload-history.wxml,upload-history.wxss,upload-history-presenter.js}`.
- Modify `miniprogram/pages/learning-progress/{learning-progress.wxml,learning-progress.wxss}`.
- Modify `miniprogram/pages/bottleneck-center/{bottleneck-center.wxml,bottleneck-center.wxss}`.
- Modify `miniprogram/pages/bottleneck-detail/{bottleneck-detail.wxml,bottleneck-detail.wxss}`.
- Modify `miniprogram/pages/knowledge-map/{knowledge-map.wxml,knowledge-map.wxss}`.
- Modify `miniprogram/pages/learning-resource/{learning-resource.wxml,learning-resource.wxss,learning-resource-presenter.js}`.
- Modify `miniprogram/pages/generate-verification/{generate-verification.wxml,generate-verification.wxss}`.
- Modify `miniprogram/pages/default-paper/{default-paper.wxml,default-paper.wxss}`.
- Modify `miniprogram/pages/paper-preview/{paper-preview.wxml,paper-preview.wxss,paper-preview-presenter.js}`.

### English, family, and system pages

- Modify `miniprogram/pages/english-practice/{english-practice.wxml,english-practice.wxss}`.
- Modify `miniprogram/pages/english-dictation/{english-dictation.wxml,english-dictation.wxss}`.
- Modify `miniprogram/pages/english-wrong-words/{english-wrong-words.wxml,english-wrong-words.wxss}`.
- Modify `miniprogram/pages/add-student/{add-student.wxml,add-student.wxss}`.
- Modify `miniprogram/pages/join-student/{join-student.wxml,join-student.wxss}`.
- Modify `miniprogram/pages/parent-management/{parent-management.wxml,parent-management.wxss}`.
- Modify `miniprogram/pages/ai-usage/{ai-usage.wxml,ai-usage.wxss,ai-usage-presenter.js}`.

---

### Task 1: Establish a safe baseline around existing user changes

**Files:**
- Inspect: all paths reported by `git status --short`
- Test: `tests/student-data-access.test.js`
- Test: `tests/student-access.test.js`
- Test: `tests/english-vocabulary-cloud.test.js`

- [ ] **Step 1: Capture the exact pre-existing diff and untracked paths**

Run:

```bash
git status --short
git diff -- cloudfunctions/studentData cloudfunctions/studentAccess cloudfunctions/englishVocabulary tests/student-data-access.test.js tests/student-access.test.js tests/english-vocabulary-cloud.test.js
```

Expected: current DTO/access/vocabulary edits are visible and no file is reverted.

- [ ] **Step 2: Run the focused baseline tests**

Run:

```bash
node --test --test-concurrency=1 tests/student-data-access.test.js tests/student-access.test.js tests/english-vocabulary-cloud.test.js
```

Expected: PASS. If not, use `superpowers:systematic-debugging` and repair only the existing incomplete extraction before adding redesign behavior.

- [ ] **Step 3: Record protected files in the task notes**

Expected: later workers are told they are not alone in the codebase and must preserve these on-disk changes.

- [ ] **Step 4: Do not commit this baseline**

Expected: user changes remain intact and unclaimed.

### Task 2: Guarantee the latest formal diagnosis for every subject

**Files:**
- Create: `cloudfunctions/studentData/formal-diagnosis.js`
- Modify: `cloudfunctions/studentData/home-dashboard.js`
- Modify: `cloudfunctions/studentData/timeline-dto.js`
- Modify: `cloudfunctions/studentData/index.js`
- Test: `tests/student-data-access.test.js`

- [ ] **Step 1: Write failing selector and dashboard contract tests**

Add cases proving:

```js
assert.deepEqual(
  result.latestDiagnosisReports.map(report => report.subject),
  ['math', 'chinese']
)
assert.equal(result.latestDiagnosisReports.some(report => report.type === 'verification'), false)
assert.deepEqual(
  home.perStudent['student-1'].latestDiagnosisReports.map(report => report.subject),
  ['math', 'chinese']
)
```

The fixture must contain more than the global dashboard limit of newer math reports followed by an older Chinese diagnosis, plus a newer verification report.

- [ ] **Step 2: Run the test and verify the current contract fails**

Run:

```bash
node --test --test-name-pattern="latest formal diagnosis|diagnosis coverage" tests/student-data-access.test.js
```

Expected: FAIL because the current DTO exposes only a global latest report.

- [ ] **Step 3: Implement the shared selector and DTO**

Create focused exports equivalent to:

```js
const FORMAL_DIAGNOSIS_SUBJECTS = ['math', 'chinese', 'english']

function isFormalDiagnosis(report = {}) {
  return report.status === 'completed'
    && report.type !== 'verification'
    && !report.isArchived
    && !report.archivedAt
    && report.isEffective !== false
}

function latestFormalDiagnoses(reports = []) {
  const bySubject = new Map()
  reports
    .filter(isFormalDiagnosis)
    .sort((a, b) => new Date(b.createdAt || 0) - new Date(a.createdAt || 0))
    .forEach(report => {
      if (FORMAL_DIAGNOSIS_SUBJECTS.includes(report.subject) && !bySubject.has(report.subject)) {
        bySubject.set(report.subject, summarizeFormalDiagnosis(report))
      }
    })
  return FORMAL_DIAGNOSIS_SUBJECTS.map(subject => bySubject.get(subject)).filter(Boolean)
}
```

The query helper must issue subject-scoped reads or batched subject reads with server-side missing-pair fallback; it must not trust the globally limited `reportRows` window.

- [ ] **Step 4: Wire both dashboard endpoints**

Add `latestDiagnosisReports` to `getStudentDashboard` and every `getHomeDashboard().perStudent[id]`. Keep `latestReport`, `latestReportSummary`, and `recentReports` for compatibility.

- [ ] **Step 5: Run focused data tests**

Run:

```bash
node --test --test-concurrency=1 tests/student-data-access.test.js tests/data-layer.test.js tests/contracts.test.js
```

Expected: PASS.

- [ ] **Step 6: Check the cloud-function diff does not erase current DTO extraction**

Run:

```bash
git diff --check -- cloudfunctions/studentData tests/student-data-access.test.js
git diff -- cloudfunctions/studentData/index.js
```

Expected: `publicStudent`, `createHomeDashboard`, and timeline DTO imports remain.

- [ ] **Step 7: Commit only separable redesign hunks**

```bash
git add -p cloudfunctions/studentData tests/student-data-access.test.js
git commit -m "feat: expose latest diagnosis per subject"
```

If hunk staging would mix pre-existing edits, leave the task uncommitted and note it for the final integration commit.

### Task 3: Add the shared B+ design system and migration gate

**Files:**
- Create: `miniprogram/utils/ui-icons.js`
- Modify: `miniprogram/app.wxss`
- Modify: all 21 registered page WXML root nodes
- Create: `tests/bplus-design-system.test.js`
- Modify: `package.json`

- [ ] **Step 1: Write the manifest-driven failing test**

The test parses `miniprogram/app.json`, resolves main and subpackage pages, and asserts:

```js
assert.match(wxml, /class="[^"]*bplus-page/)
assert.match(wxml, /bplus-(section|row|state|action|empty|loading)/)
assert.doesNotMatch(wxml, /bindtap="[^"]+"[^>]*>\s*[›→+×]\s*</)
assert.match(appWxss, /\.bplus-page\s*\{/)
assert.match(appWxss, /\.bplus-icon-label\s*\{/)
assert.match(appWxss, /\.bplus-mini-bars\s*\{/)
assert.doesNotMatch(pageWxss, /\.bplus-(page|section|row|state|action|empty|loading)\s*\{/)
```

Critical icon actions must retain text or an accessibility label. Every page must use the global shell plus at least one shared content/state primitive; page-local WXSS may add page-specific classes but may not redefine the global B+ shell/state primitives. The test reports the missing page path.

- [ ] **Step 2: Run the test and verify all unported pages are named**

Run:

```bash
node --test tests/bplus-design-system.test.js
```

Expected: FAIL listing pages without the B+ root.

- [ ] **Step 3: Add semantic icons and global classes**

`ui-icons.js` exports a frozen map and subject helpers. `app.wxss` adds compact, additive classes for page shells, sections, semantic icon boxes, inline state tokens, CSS mini bars, dense rows, action rows, and loading/error/empty states. Do not add image URLs, base64 assets, icon fonts, or dependencies.

- [ ] **Step 4: Add `bplus-page` to every registered root**

Keep every page's existing root class and subject class. Example:

```xml
<view class="page page-{{subject}} bplus-page">
```

- [ ] **Step 5: Register the test in both unit scripts**

Add `tests/bplus-design-system.test.js` to `test:unit` and `test:coverage` without reordering unrelated scripts.

- [ ] **Step 6: Run static and package checks**

```bash
node --test tests/bplus-design-system.test.js
npm run check
npm run check:size
```

Expected: PASS and main package remains below 800 KB internal budget.

- [ ] **Step 7: Commit**

```bash
git add miniprogram/app.wxss miniprogram/utils/ui-icons.js miniprogram/pages/*/*.wxml tests/bplus-design-system.test.js package.json
git commit -m "feat: add product-wide B+ design system"
```

### Task 4: Build report-first family and learning-profile workbenches

**Files:**
- Modify: `miniprogram/pages/index/index-presenter.js`
- Modify: `miniprogram/pages/index/index.js`
- Modify: `miniprogram/pages/index/index.wxml`
- Modify: `miniprogram/pages/index/index.wxss`
- Modify: `miniprogram/pages/student-profile/student-profile.js`
- Modify: `miniprogram/pages/student-profile/student-profile.wxml`
- Modify: `miniprogram/pages/student-profile/student-profile.wxss`
- Test: `tests/index-presenter.test.js`
- Test: `tests/index-page-flows.test.js`
- Test: `tests/student-profile-page-flows.test.js`

- [ ] **Step 1: Write failing presenter tests for per-subject workbenches**

Assert math and Chinese modules exist, English is absent, verification is ignored, and each module contains `reportUrl`, `judgment`, compact counts, `trend`, `primaryAction`, and `uploadUrl`.

- [ ] **Step 2: Write failing page-flow tests for explicit DTO and compatibility fallback**

Assert the page consumes `latestDiagnosisReports`, never builds guaranteed coverage from `recentReports`, and calls subject-scoped fallback only when the DTO is missing.

- [ ] **Step 3: Run focused tests and observe failure**

```bash
node --test --test-concurrency=1 tests/index-presenter.test.js tests/index-page-flows.test.js tests/student-profile-page-flows.test.js
```

- [ ] **Step 4: Implement diagnosis workbench view models**

Replace the single `reportPanel` as the primary profile presentation with `diagnosisWorkbenches`. Preserve old fields temporarily for callers/tests that still depend on them. Resolve actions from ready verification paper/profile state, then fall back to subject home or upload.

- [ ] **Step 5: Implement the approved dense B+ profile layout**

Render only diagnosed subjects. Each block includes subject icon, formal report identity/date, concise judgment, inline `📝/✅/🔁/⏳` signals, CSS mini trend, `🎯` next action, `📖` full report, and `📤` upload. Remove the oversized KPI grid and redundant hero copy from the profile page.

- [ ] **Step 6: Reinforce the family workbench without duplicating full cards**

Each child card shows diagnosis coverage and a compact latest-diagnosis route. Preserve the existing highest-priority family action.

- [ ] **Step 7: Run tests and static checks**

```bash
node --test --test-concurrency=1 tests/index-presenter.test.js tests/index-page-flows.test.js tests/student-profile-page-flows.test.js tests/bplus-design-system.test.js
npm run check
```

Expected: PASS.

- [ ] **Step 8: Commit**

```bash
git add miniprogram/pages/index miniprogram/pages/student-profile tests/index-presenter.test.js tests/index-page-flows.test.js tests/student-profile-page-flows.test.js
git commit -m "feat: make subject diagnoses the learning profile core"
```

### Task 5: Redesign subject home and formal report detail

**Files:**
- Modify: `miniprogram/pages/subject-home/subject-home-presenter.js`
- Modify: `miniprogram/pages/subject-home/subject-home.js`
- Modify: `miniprogram/pages/subject-home/subject-home.wxml`
- Modify: `miniprogram/pages/subject-home/subject-home.wxss`
- Modify: `miniprogram/pages/report/report-presenter.js`
- Modify: `miniprogram/pages/report/report.js`
- Modify: `miniprogram/pages/report/report.wxml`
- Modify: `miniprogram/pages/report/report.wxss`
- Test: `tests/subject-home-presenter.test.js`
- Test: `tests/subject-home-page-flows.test.js`
- Test: `tests/report-presenter.test.js`
- Test: `tests/report-page-flows.test.js`

- [ ] **Step 1: Write failing report-layer tests**

Assert a diagnosis view exposes `summaryLayer`, `evidenceLayer`, `changeLayer`, section IDs, semantic icons, and compact action data while verification reports preserve their own evidence state.

- [ ] **Step 2: Write failing subject-home latest-formal-diagnosis tests**

Assert a newer verification report does not replace the displayed diagnosis and that missing diagnosis collapses the module.

- [ ] **Step 3: Run focused tests and verify failure**

```bash
node --test --test-concurrency=1 tests/subject-home-presenter.test.js tests/subject-home-page-flows.test.js tests/report-presenter.test.js tests/report-page-flows.test.js
```

- [ ] **Step 4: Implement the layered report presenter**

Map existing report data into summary, diagnostic evidence, and historical change without discarding current bottleneck, question, learning-resource, feedback, PDF, retry, analyzing, partial, or verification states.

- [ ] **Step 5: Add compact section navigation**

Add `onReportSectionTap` in `report.js` with a supported selector-to-offset flow:

```js
const selector = `#report-section-${section}`
wx.createSelectorQuery()
  .select(selector)
  .boundingClientRect()
  .selectViewport()
  .scrollOffset()
  .exec(([rect, viewport]) => {
    if (!rect) return
    wx.pageScrollTo({
      scrollTop: Math.max(0, (viewport && viewport.scrollTop || 0) + rect.top - 12),
      duration: 200
    })
  })
```

Keep all sections in document flow so long reports remain searchable and printable.

- [ ] **Step 6: Rebuild WXML/WXSS around the approved B layout**

The first viewport contains formal identity, concise judgment, inline evidence/change signals, and the next action. Evidence and change sections use dense rows, CSS timelines/bars, and B+ icon labels. Avoid nested cards.

- [ ] **Step 7: Reinforce subject-home report and follow-up state**

Show latest formal diagnosis plus verification/resource progress as a linked follow-up, never as a replacement report.

- [ ] **Step 8: Run focused and regression tests**

```bash
node --test --test-concurrency=1 tests/subject-home-presenter.test.js tests/subject-home-page-flows.test.js tests/report-presenter.test.js tests/report-page-flows.test.js tests/report-quality.test.js tests/report-paper-feedback-loop.test.js
```

Expected: PASS.

- [ ] **Step 9: Commit**

```bash
git add miniprogram/pages/subject-home miniprogram/pages/report tests/subject-home-presenter.test.js tests/subject-home-page-flows.test.js tests/report-presenter.test.js tests/report-page-flows.test.js
git commit -m "feat: redesign subject and diagnostic report views"
```

### Task 6: Migrate upload, history, progress, bottlenecks, map, and resources

**Files:**
- Modify: `miniprogram/pages/upload/{upload.wxml,upload.wxss}`
- Modify: `miniprogram/pages/upload-history/{upload-history.js,upload-history.wxml,upload-history.wxss,upload-history-presenter.js}`
- Modify: `miniprogram/pages/learning-progress/{learning-progress.wxml,learning-progress.wxss}`
- Modify: `miniprogram/pages/bottleneck-center/{bottleneck-center.wxml,bottleneck-center.wxss}`
- Modify: `miniprogram/pages/bottleneck-detail/{bottleneck-detail.wxml,bottleneck-detail.wxss}`
- Modify: `miniprogram/pages/knowledge-map/{knowledge-map.wxml,knowledge-map.wxss}`
- Modify: `miniprogram/pages/learning-resource/{learning-resource.wxml,learning-resource.wxss,learning-resource-presenter.js}`
- Test: corresponding `*-page-flows`, presenter, wiring, and learning-resource tests

- [ ] **Step 1: Add failing family-specific static assertions**

Extend `tests/bplus-design-system.test.js` to require report/history/upload/status icon labels and prohibit oversized standalone KPI grids on these pages.

- [ ] **Step 2: Run relevant tests to capture the pre-migration failure**

```bash
node --test --test-concurrency=1 tests/bplus-design-system.test.js tests/upload-page-flows.test.js tests/upload-history-page-flows.test.js tests/bottleneck-page-flows.test.js tests/knowledge-map-page-controller.test.js tests/knowledge-map-wiring.test.js tests/learning-resource-presenter.test.js
```

- [ ] **Step 3: Migrate upload and analysis states**

Use `📷/📤/⏳/✅/⚠️` for source, queue, analyzing, complete, and error states. Keep the completed report route as the primary command.

- [ ] **Step 4: Migrate history and progress**

Add a diagnostic-report filter, unmistakable record-type icons, compact metadata rows, and CSS timeline graphics. Preserve cleanup, pagination, and navigation behavior.

- [ ] **Step 5: Migrate bottleneck, map, and resource pages**

Use compact severity/status tokens, evidence links, CSS node/progress graphics, effort indicators, completion state, and consistent `🎯` action rows. Do not add images or a chart library.

- [ ] **Step 6: Run the page-family tests**

```bash
node --test --test-concurrency=1 tests/bplus-design-system.test.js tests/upload-page-flows.test.js tests/upload-history-page-flows.test.js tests/bottleneck-page-flows.test.js tests/knowledge-map-page-controller.test.js tests/knowledge-map-wiring.test.js tests/learning-resource-presenter.test.js tests/learning-resource-content-depth.test.js
```

Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add miniprogram/pages/upload miniprogram/pages/upload-history miniprogram/pages/learning-progress miniprogram/pages/bottleneck-center miniprogram/pages/bottleneck-detail miniprogram/pages/knowledge-map miniprogram/pages/learning-resource tests/bplus-design-system.test.js
git commit -m "feat: migrate learning loop to B+ design"
```

### Task 7: Migrate paper and verification flows

**Files:**
- Modify: `miniprogram/pages/generate-verification/{generate-verification.wxml,generate-verification.wxss}`
- Modify: `miniprogram/pages/default-paper/{default-paper.wxml,default-paper.wxss}`
- Modify: `miniprogram/pages/paper-preview/{paper-preview.wxml,paper-preview.wxss,paper-preview-presenter.js}`
- Test: `tests/generate-verification-page-flows.test.js`
- Test: `tests/paper-page-flows.test.js`
- Test: `tests/paper-preview-presenter.test.js`

- [ ] **Step 1: Add failing icon/state assertions for paper flows**

Require stable generation, ready, download, print, upload, and feedback labels with `⏳/✅/📄/⬇️/🖨️/📤/🩺` semantics.

- [ ] **Step 2: Run focused tests and observe failure**

```bash
node --test --test-concurrency=1 tests/generate-verification-page-flows.test.js tests/paper-page-flows.test.js tests/paper-preview-presenter.test.js tests/bplus-design-system.test.js
```

- [ ] **Step 3: Migrate all three paper surfaces**

Use dense generation status, paper metadata, task-pack pages, report feedback, and compact command rows. Preserve PDF, regenerate, download, append, and upload behavior.

- [ ] **Step 4: Run tests**

Run the command from Step 2. Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add miniprogram/pages/generate-verification miniprogram/pages/default-paper miniprogram/pages/paper-preview tests/bplus-design-system.test.js tests/paper-preview-presenter.test.js
git commit -m "feat: migrate paper workflows to B+ design"
```

### Task 8: Migrate the English tool family

**Files:**
- Modify: `miniprogram/pages/english-practice/{english-practice.wxml,english-practice.wxss}`
- Modify: `miniprogram/pages/english-dictation/{english-dictation.wxml,english-dictation.wxss}`
- Modify: `miniprogram/pages/english-wrong-words/{english-wrong-words.wxml,english-wrong-words.wxss}`
- Test: `tests/english-practice-page-flows.test.js`
- Test: `tests/english-dictation-page-flows.test.js`
- Test: `tests/english-devtools-cases.test.js`

- [ ] **Step 1: Add failing English visual-state assertions**

Require icon-led practice mode, playback, recording, judgment, mastery, retry, and history states while retaining text labels.

- [ ] **Step 2: Run focused tests and observe failure**

```bash
node --test --test-concurrency=1 tests/english-practice-page-flows.test.js tests/english-dictation-page-flows.test.js tests/english-devtools-cases.test.js tests/bplus-design-system.test.js
```

- [ ] **Step 3: Migrate practice, dictation, and wrong-word pages**

Use `🔊/🎙️/✍️/✅/❌/🔁/🏆/🕘` consistently, compact progress graphics, and stable button dimensions. Preserve WechatSI playback, recording, submission, and retry behavior.

- [ ] **Step 4: Run tests**

Run the command from Step 2 plus `tests/english-vocabulary.test.js`. Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add miniprogram/pages/english-practice miniprogram/pages/english-dictation miniprogram/pages/english-wrong-words tests/bplus-design-system.test.js
git commit -m "feat: migrate English tools to B+ design"
```

### Task 9: Migrate family and system pages

**Files:**
- Modify: `miniprogram/pages/add-student/{add-student.wxml,add-student.wxss}`
- Modify: `miniprogram/pages/join-student/{join-student.wxml,join-student.wxss}`
- Modify: `miniprogram/pages/parent-management/{parent-management.wxml,parent-management.wxss}`
- Modify: `miniprogram/pages/ai-usage/{ai-usage.wxml,ai-usage.wxss,ai-usage-presenter.js}`
- Test: `tests/parent-management-page-flows.test.js`
- Test: `tests/ai-usage-presenter.test.js`
- Test: `tests/bplus-design-system.test.js`

- [ ] **Step 1: Add failing role, invitation, form, and usage visual assertions**

Critical destructive or permission actions must keep explicit text. Usage graphics must use CSS bars and event-type symbols, not a chart dependency.

- [ ] **Step 2: Run focused tests and observe failure**

```bash
node --test --test-concurrency=1 tests/parent-management-page-flows.test.js tests/ai-usage-presenter.test.js tests/bplus-design-system.test.js
```

- [ ] **Step 3: Migrate student and family management pages**

Use compact form sections, role/permission icons, invitation state, warning state, and clear destructive commands. Preserve validation and access rules.

- [ ] **Step 4: Migrate AI usage**

Use compact totals, CSS proportional bars, semantic event-type icons, and dense cost/token rows. Preserve all estimator disclaimers and source labels.

- [ ] **Step 5: Run tests**

Run the command from Step 2 plus `tests/index-page-flows.test.js`. Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add miniprogram/pages/add-student miniprogram/pages/join-student miniprogram/pages/parent-management miniprogram/pages/ai-usage tests/bplus-design-system.test.js tests/ai-usage-presenter.test.js
git commit -m "feat: complete product-wide B+ migration"
```

### Task 10: Run full regression, package, performance, and visual verification

**Files:**
- Modify as needed: `scripts/devtools-e2e-fullpage.js`
- Create: `docs/test-reports/2026-07-13-b-plus-redesign-verification.md`
- Test: all suites and DevTools scripts

- [ ] **Step 1: Run the complete local gate**

```bash
npm test
npm run check
npm run check:deployment
npm run check:size
```

Expected: all tests pass, static check passes, deployment readiness passes, and main package remains below 800 KB.

- [ ] **Step 2: Run performance baselines**

```bash
npm run perf:timeline
npm run perf:baseline
```

Expected: no material regression against the committed baseline; explain any environment-only variance.

- [ ] **Step 3: Run DevTools core and family E2E**

```bash
npm run test:e2e:doctor
npm run test:e2e:core
npm run test:e2e:english
npm run test:e2e:ai-usage
```

Expected: PASS with no unfinished session.

- [ ] **Step 4: Capture representative visual states at both presets**

Use 375 x 812 and 430 x 932 logical pixels. Capture family workbench, two-diagnosis learning profile, subject home, formal diagnosis, upload, history, paper, English practice, parent management, and AI usage. Also exercise long judgment, no diagnosis, loading, restricted, partial, and retry fixtures.

- [ ] **Step 5: Inspect screenshots and canvas pixels**

Verify no overlaps, clipping, blank regions, unintended nested cards, emoji-induced line shifts, or buttons whose text does not fit. Fix and repeat the affected focused tests/screenshots.

- [ ] **Step 6: Write the verification report**

Record test totals, package size, performance numbers, viewport matrix, screenshot paths, known emoji platform variance, and any residual risk in `docs/test-reports/2026-07-13-b-plus-redesign-verification.md`.

- [ ] **Step 7: Review the final diff for user-change preservation**

```bash
git status --short
git diff --check
git diff --stat
```

Compare the protected paths from Task 1 and confirm no pre-existing logic disappeared.

- [ ] **Step 8: Commit final verification-only changes**

```bash
git add scripts/devtools-e2e-fullpage.js docs/test-reports/2026-07-13-b-plus-redesign-verification.md
git commit -m "test: verify product-wide B+ redesign"
```

Do not stage unrelated user files.

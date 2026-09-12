# Diagnosis History Experience Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the approved current-diagnosis, recent-changes, directly-readable-report experience with reliable three-state bottleneck tracking and restrained visual illustration/icon enhancements.

**Architecture:** Add a pure `profile-summary` domain module under `analyzePhotos` to derive the current diagnosis and user-facing changes from the previous profile plus one effective report. Keep `subjectProfiles` as the current snapshot and `reports` as immutable historical facts. Add focused frontend presenters so WXML renders prepared view data without inferring diagnosis rules.

**Tech Stack:** WeChat Mini Program WXML/WXSS/JavaScript, WeChat Cloud Development database/cloud functions, Node.js built-in test runner.

---

### Task 1: Current Diagnosis Domain Rules

**Files:**
- Create: `cloudfunctions/analyzePhotos/profile-summary.js`
- Create: `tests/profile-summary.test.js`

- [ ] Write failing tests for first discovery, repeated discovery, valid improvement, improvement relapse, ineffective report, and user-facing change summaries.
- [ ] Run `node --test tests/profile-summary.test.js` and confirm the module is missing.
- [ ] Implement pure functions that derive `currentBottlenecks`, `currentSummary`, `nextAction`, `changeSummary`, and `isEffective`.
- [ ] Run `node --test tests/profile-summary.test.js` and confirm all domain-rule tests pass.

### Task 2: Apply Current Diagnosis in `analyzePhotos`

**Files:**
- Modify: `cloudfunctions/analyzePhotos/index.js`
- Modify: `cloudfunctions/analyzePhotos/comparison.js`
- Modify: `tests/cloud-functions.test.js`
- Modify: `tests/comparison.test.js`
- Modify: `tests/coverage-gap.test.js`

- [ ] Write failing cloud-function tests asserting new report fields and `subjectProfiles.currentBottlenecks`.
- [ ] Write a failing verification test proving missing target errors alone do not imply improvement.
- [ ] Run the focused cloud-function and comparison tests and confirm expected failures.
- [ ] Integrate the pure domain module, populate `isEffective`, `changeSummary`, `profileAppliedAt`, and current diagnosis fields.
- [ ] Preserve legacy `pendingBottlenecks` and `improvedBottlenecks` from the same derived state.
- [ ] Run the focused tests and confirm they pass.

### Task 3: Subject Home Presenter and Data Flow

**Files:**
- Create: `miniprogram/pages/subject-home/subject-home-presenter.js`
- Create: `tests/subject-home-presenter.test.js`
- Modify: `miniprogram/pages/subject-home/subject-home.js`
- Modify: `tests/page-flows.test.js`

- [ ] Write failing presenter tests for new data, legacy profile fallback, recent-change fallback, no-data state, and analyzing state.
- [ ] Run `node --test tests/subject-home-presenter.test.js tests/page-flows.test.js`.
- [ ] Implement presenter and update `loadProfile`/`loadRecords` to populate current summary, status counts, current bottlenecks, recent changes, and state flags.
- [ ] Add navigation from recent changes to reports and keep all existing entry actions.
- [ ] Run focused tests and confirm they pass.

### Task 4: Subject Home Visual Experience

**Files:**
- Modify: `miniprogram/pages/subject-home/subject-home.wxml`
- Modify: `miniprogram/pages/subject-home/subject-home.wxss`
- Create: `miniprogram/assets/images/math-diagnostic-guide.png`
- Create: `miniprogram/assets/icons/*.png`
- Modify: `tests/project-integrity.test.js`

- [ ] Add a failing integrity test requiring the approved local illustration and icon assets.
- [ ] Add compressed local image and icon assets.
- [ ] Replace the report-list-first layout with current conclusion, bottleneck statuses, recent changes, and one primary action.
- [ ] Add approved illustration usage for first-use/current diagnosis/analyzing states, with text fallback.
- [ ] Run integrity and page-flow tests.

### Task 5: Directly Readable Report Presenter

**Files:**
- Modify: `miniprogram/pages/report/report-presenter.js`
- Modify: `tests/report-presenter.test.js`
- Modify: `miniprogram/pages/report/report.js`
- Modify: `tests/page-flows.test.js`

- [ ] Write failing presenter tests for report headline, change summary fallback, three-state labels, source image count, and analyzing/failed states.
- [ ] Run focused tests and confirm failures.
- [ ] Implement the report view fields and update report loading to use `currentBottlenecks` for the pending count fallback.
- [ ] Run focused tests and confirm they pass.

### Task 6: Directly Readable Report UI

**Files:**
- Modify: `miniprogram/pages/report/report.wxml`
- Modify: `miniprogram/pages/report/report.wxss`
- Modify: `tests/project-integrity.test.js`

- [ ] Update integrity assertions for the three-section report structure.
- [ ] Rebuild the report page around “本次诊断结论 / 发现的学习卡点 / 本次使用的试卷”.
- [ ] Keep wrong-answer details available as progressive disclosure below the main three sections.
- [ ] Keep PDF download and verification generation as bottom actions.
- [ ] Run integrity, presenter, and page-flow tests.

### Task 7: Documentation and Full Verification

**Files:**
- Modify: `PRD.md`
- Modify: `docs/DATA_DICTIONARY.md`
- Modify: `docs/TEST_MATRIX.md`

- [ ] Document the new profile/report fields, state rules, visual rules, and backward compatibility.
- [ ] Run `npm test`.
- [ ] Run `npm run check`.
- [ ] Run `npm run verify`.
- [ ] Inspect `git diff --check`.
- [ ] Verify the affected pages in WeChat Developer Tools or the available local preview surface, checking text fit, asset rendering, and main interactions.


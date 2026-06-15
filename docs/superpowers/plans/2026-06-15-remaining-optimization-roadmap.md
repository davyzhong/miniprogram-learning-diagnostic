# Remaining Optimization Roadmap Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Finish the remaining 10 optimization items after Phase 1 and Phase 2, moving the MVP from “diagnosis works” to “real-data operations, traceability, review, metrics, and release discipline are reliable.”

**Architecture:** Keep the existing WeChat Mini Program + CloudBase architecture. Add thin, testable presenter/helper modules before touching page UI, keep cloud functions access-aware, and prefer derived views over new database collections unless persistent operational data is required.

**Tech Stack:** WeChat Mini Program, CloudBase cloud functions, Node.js built-in test runner, existing `npm run verify` quality gate, WeChat DevTools CLI preview.

---

## Current Baseline

Phase 1 and Phase 2 are already implemented in code/tests:

- Real-device acceptance document and real-image E2E runner.
- Strict verification evidence judgement.
- Report quality review signals.
- Parent report feedback collection.
- Timeout context and bottleneck-center fallback added during follow-up debugging.

The user explicitly chose to skip further real-device confirmation for now. The remaining work should therefore focus on software-level completion and DevTools/CLI verification.

---

## Remaining 10 Items

### Phase 3: Operational Reliability

6. Cloud function deployment and smoke-check workflow.
7. Real data acceptance runner without physical-device dependency.
8. Dashboard and record-loading performance hardening.

### Phase 4: Traceability And Learning Evidence

9. End-to-end evidence drill-down from summary to source photo/question.
10. Structured cognitive bottleneck library governance.
11. Verification paper lifecycle hardening.

### Phase 5: Parent-Facing Product Clarity

12. Report explanation upgrade.
13. Learning record analytics and cleanup UX.

### Phase 6: Measurement And Release Discipline

14. Product metrics and operational observability.
15. Release, rollback, and documentation sync workflow.

---

## File Map

- `package.json`: Add scripts for deploy checks, real-data smoke tests, metrics checks, and release gates.
- `scripts/`: Add local-only operational scripts that use CloudBase/DevTools where possible.
- `docs/`: Update deployment, testing, release, and data dictionary documentation.
- `miniprogram/utils/cloud.js`: Keep client data access centralized and add any new cloud-function wrappers here.
- `miniprogram/utils/learning-records.js`: Extend timeline/event derivation when needed.
- `miniprogram/utils/bottleneck-view.js`: Extend display metadata for bottleneck library governance.
- `miniprogram/pages/report/*`: Improve report explanation, feedback visibility, and source drill-down.
- `miniprogram/pages/bottleneck-detail/*`: Make evidence chain traceable and less repetitive.
- `miniprogram/pages/upload-history/*`: Strengthen full learning timeline, cleanup, and analytical summaries.
- `miniprogram/pages/paper-preview/*`: Harden verification paper state and linked feedback.
- `cloudfunctions/studentData/*`: Add access-aware, lightweight data reads and traceability details.
- `cloudfunctions/analyzePhotos/*`: Preserve evidence metadata needed by later UI.
- `cloudfunctions/generatePaper/*`: Preserve paper lifecycle metadata.
- `tests/`: Add TDD coverage for each task before implementation.

---

## Task 6: Cloud Function Deployment And Smoke-Check Workflow

**Impact**

Deployment is currently partly manual. Cloud-function changes can pass local tests but still fail when a single function is deployed without shared dependencies or when a function is forgotten.

**Acceptance**

- There is a documented command sequence for deploying all changed cloud functions.
- There is a local smoke-check script that verifies required cloud function folders, package files, config files, and front-end wrappers exist.
- `npm run verify` includes or documents this check.

**Evaluation**

- A new developer can run the documented commands without reading chat history.
- Missing cloud function folders or missing `config.json` fail fast.

**Tests**

- Add `tests/deployment-readiness.test.js`.
- Assert key functions exist: `uploadAndAnalyze`, `analyzePhotos`, `analyzeBatch`, `generatePaper`, `generateReportPDF`, `getAnalysisProgress`, `studentData`, `studentAccess`, `reportFeedback`.
- Assert `miniprogram/utils/cloud.js` exposes wrappers for front-end-used functions.

**Delivery**

- `tests/deployment-readiness.test.js`
- `docs/DEPLOYMENT.md`
- `package.json` script such as `check:deployment`

**Execution Steps**

- [x] Write `tests/deployment-readiness.test.js` with missing-function and wrapper expectations.
- [x] Run `node --test tests/deployment-readiness.test.js` and verify it fails if the script/test references a missing check.
- [x] Add `docs/DEPLOYMENT.md` with DevTools deployment steps and smoke-check commands.
- [x] Add `check:deployment` to `package.json`.
- [x] Run targeted test, `npm run verify`, and `git diff --check`.

---

## Task 7: Real Data Acceptance Runner Without Physical-Device Dependency

**Impact**

The user has real data in the system. We need a repeatable DevTools/CLI acceptance path that does not depend on physical-device confirmation.

**Acceptance**

- A documented smoke route can open the app against real CloudBase data.
- The acceptance report records student, pages checked, expected data, and screenshots/log notes.
- The runner does not upload or commit private images.

**Evaluation**

- It can verify that `钟青羽` has dashboard, report, bottleneck, paper, and learning-record surfaces.
- It identifies whether failures are route, data, permission, or cloud-function issues.

**Tests**

- Add non-network tests for the runner configuration parser.
- Use DevTools CLI preview as the manual gate.

**Delivery**

- `scripts/devtools-real-data-smoke.js` or a documented command-only workflow.
- `docs/test-reports/YYYY-MM-DD-real-data-smoke.md`
- Update `docs/TESTING.md`.

**Execution Steps**

- [x] Write a config helper for real-data smoke target options.
- [x] Add tests for missing student id, route list, and screenshot output paths.
- [x] Implement the runner with no committed secrets and no private images.
- [x] Document how to run it with real project data.
- [x] Run config tests and DevTools preview.

---

## Task 8: Dashboard And Record-Loading Performance Hardening

**Impact**

Large real datasets can make aggregate cloud reads timeout. We already added a fallback for `bottleneck-center`; this task makes that pattern systematic.

**Acceptance**

- Home, student profile, subject home, bottleneck center, report, and learning record pages degrade gracefully when aggregate reads timeout.
- Heavy reads are capped and sorted predictably.
- Timeout logs identify function and action context.

**Evaluation**

- Pages should show partial useful data instead of blank/failed states where legacy collection reads can recover.
- Tests simulate timeout for each aggregate reader.

**Tests**

- Extend `tests/page-flows.test.js` and `tests/data-layer.test.js`.
- Add cases for `getStudentDashboard`, `getSubjectDashboard`, `getLearningTimeline`, and `getReportDetail` timeouts.

**Delivery**

- Page-level fallback logic where missing.
- Data-layer timeout context tests.
- Updated architecture note in `docs/ARCHITECTURE.md`.

**Execution Steps**

- [x] Write failing timeout fallback tests for the remaining pages.
- [x] Implement only the missing fallbacks.
- [x] Keep logs concise and context-rich.
- [x] Run targeted tests, `npm run verify`, and DevTools preview.

---

## Task 9: End-To-End Evidence Drill-Down

**Impact**

Parents need to see why the system believes a card exists. Summary pages should lead to report, report should lead to source image/question evidence, and bottleneck detail should show a clear evidence chain.

**Acceptance**

- Report cards expose source images, OCR summary, duplicate status, and related error details when available.
- Bottleneck detail links each evidence item to a report or paper.
- Learning record items remain the chronological entry point.

**Evaluation**

- A parent can answer: “这个卡点来自哪张试卷、哪几道题？”
- No LP code is used as primary display text.

**Tests**

- Extend `tests/report-presenter.test.js`, `tests/page-flows.test.js`, and `tests/learning-records.test.js`.

**Delivery**

- Presenter updates.
- Page UI updates.
- Data dictionary notes for evidence metadata.

**Execution Steps**

- [x] Write presenter tests for source image and question evidence view models.
- [x] Write page-flow tests for drill-down taps.
- [x] Implement view models first, then WXML/WXSS.
- [x] Run targeted tests and visual preview.

---

## Task 10: Structured Cognitive Bottleneck Library Governance

**Impact**

The app needs stable, parent-readable bottleneck names, aliases, categories, and display rules as reports accumulate.

**Acceptance**

- Bottleneck metadata has one source of truth.
- Math bottlenecks have readable names, short names, parent descriptions, category, and suggested validation style.
- Unknown bottlenecks fall back safely without exposing confusing codes.

**Evaluation**

- New reports and generated papers use consistent terminology.
- The same bottleneck never appears as three different names across pages.

**Tests**

- Extend `tests/bottleneck-view.test.js`, `tests/util.test.js`, and PDF/paper display tests.

**Delivery**

- Shared bottleneck taxonomy module.
- Updated docs in `docs/DATA_DICTIONARY.md`.

**Execution Steps**

- [x] Audit current bottleneck name helpers.
- [x] Write tests for canonical metadata.
- [x] Implement shared metadata with backward-compatible exports.
- [x] Update displays and docs.

---

## Task 11: Verification Paper Lifecycle Hardening

**Impact**

Generated papers should have clear lifecycle states: generated, downloaded, printed/assigned, uploaded for feedback, feedback analyzing, feedback complete.

**Acceptance**

- Paper preview does not repeat downloads unnecessarily.
- Paper status can show whether feedback exists or is in progress.
- Uploading a completed paper links cleanly to the original paper and final report.

**Evaluation**

- Parent knows the next action for a paper without guessing.
- The learning record shows paper and feedback as one connected loop.

**Tests**

- Extend `tests/page-flows.test.js`, `tests/learning-records.test.js`, and paper presenter tests.

**Delivery**

- Paper preview presenter/state update.
- Learning record linking update.
- Optional data dictionary update if metadata changes.

**Execution Steps**

- [x] Write tests for each paper lifecycle state.
- [x] Implement presenter states.
- [x] Update UI labels and actions.
- [x] Verify download idempotency and feedback links.

---

## Task 12: Report Explanation Upgrade

**Impact**

Reports should read like a compact expert explanation: conclusion, evidence, uncertainty, next action.

**Acceptance**

- Report top section has a clear parent-facing conclusion.
- Quality and feedback areas are visible but not noisy.
- Verification reports explain why a card passed, failed, or remains uncertain.

**Evaluation**

- A parent can decide what to do next within 30 seconds.
- Low-quality reports do not sound authoritative.

**Tests**

- Extend `tests/report-presenter.test.js` and page-flow report tests.

**Delivery**

- `report-presenter` improvements.
- Report WXML/WXSS refinements.
- Updated report examples in docs if present.

**Execution Steps**

- [x] Write tests for report explanation sections.
- [x] Implement presenter copy and state.
- [x] Refine UI layout.
- [x] Run report page tests and preview.

---

## Task 13: Learning Record Analytics And Cleanup UX

Status: completed in `feat: improve learning record analytics`.

**Impact**

The learning record is the child’s full evidence timeline. It should summarize days, surface stale tasks, and offer cleanup where safe.

**Acceptance**

- Full timeline remains default, with subject filters.
- Stale analyzing/failed records are understandable.
- Owner can clean stale records with a clear confirmation.

**Evaluation**

- Parents can distinguish completed reports, generated papers, feedback uploads, and stale tasks.
- Cleanup does not remove actual completed evidence.

**Tests**

- Extend `tests/learning-records.test.js`, `tests/page-flows.test.js`, and `tests/student-data-access.test.js`.

**Delivery**

- Timeline presenter updates.
- Cleanup action UX.
- Cloud function tests if cleanup behavior changes.

**Execution Steps**

- [x] Write tests for analytics summary and stale cleanup states.
- [x] Implement view model and UI.
- [x] Ensure cleanup remains permission-gated.
- [x] Verify timeline grouping and filters.

---

## Task 14: Product Metrics And Operational Observability

**Impact**

The MVP needs simple operational metrics: upload success, analysis completion, report quality, verification pass rate, feedback rate.

**Acceptance**

- Metrics are derived from existing data first.
- No sensitive student image content is logged.
- Local script can print a compact metrics summary for one student.

**Evaluation**

- We can answer whether the MVP is improving from week to week.
- Metrics include counts and rates, not just raw lists.

**Tests**

- Add tests for metrics derivation helpers.

**Delivery**

- `scripts/learning-metrics.js` or helper module.
- Docs section in `docs/TESTING.md` or new `docs/METRICS.md`.

**Execution Steps**

- [ ] Define metrics helper input/output shape.
- [ ] Write unit tests with sample reports/papers/feedback.
- [ ] Implement local metrics helper.
- [ ] Document how to run and interpret it.

---

## Task 15: Release, Rollback, And Documentation Sync Workflow

**Impact**

The project now has enough moving parts that release discipline matters. Every release should sync code, cloud functions, docs, tests, and deployment notes.

**Acceptance**

- A release checklist exists.
- Docs state which cloud functions changed and must be deployed.
- Rollback notes explain how to restore previous client/cloud behavior.
- Final release gate includes `npm run verify`, `git diff --check`, and DevTools CLI `preview`.

**Evaluation**

- A future commit can be safely shipped without relying on memory.

**Tests**

- Contract tests for required docs and scripts.

**Delivery**

- `docs/RELEASE_CHECKLIST.md`
- Updated `README.md` or `PROJECT_PLAN.md`
- Optional `npm run release:check`

**Execution Steps**

- [ ] Write contract test for release docs/scripts.
- [ ] Add checklist doc.
- [ ] Add package script if useful.
- [ ] Run full verification and prepare commit/push.

---

## Recommended Commit Order

1. `chore: add deployment readiness checks`
2. `test: add real data smoke workflow`
3. `fix: harden dashboard loading fallbacks`
4. `feat: make learning evidence traceable`
5. `feat: centralize bottleneck taxonomy`
6. `feat: harden verification paper lifecycle`
7. `feat: upgrade report explanations`
8. `feat: improve learning record analytics`
9. `chore: add learning metrics`
10. `docs: add release and rollback checklist`

Each task should run:

```bash
npm run verify
git diff --check
/Applications/wechatwebdevtools.app/Contents/MacOS/cli preview --project "/Users/qiming/Downloads/GoogleDrive/AI Learning/miniprogram-learning-diagnostic" --qr-output terminal --lang zh
```

For cloud function changes, also deploy the changed function before real-data verification.

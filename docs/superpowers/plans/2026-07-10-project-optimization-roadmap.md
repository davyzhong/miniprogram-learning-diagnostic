# Project Optimization Roadmap Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Improve correctness, loading performance, runtime scalability, deployment reproducibility, and observability without changing the learning workflow or weakening access control.

**Architecture:** Keep the native WeChat Mini Program and self-contained CloudBase function model. Introduce explicit lightweight DTOs for page reads, aggregate hot-path requests in cloud functions, make mutable learning records atomic, and turn the CLI suite into an event-driven performance gate. Each phase remains independently deployable and reversible.

**Tech Stack:** Native WeChat Mini Program, CloudBase cloud functions/database/storage, Node.js test runner, WeChat DevTools CLI, miniprogram-automator.

---

## 1. Review Baseline

Review date: 2026-07-10. Code baseline: `3bf636d` on `main`.

Verified health:

- `npm test`: 638/638 passed.
- `npm run test:coverage`: 92.02% line coverage, 86.16% function coverage.
- `npm run check`: 217 JavaScript files passed.
- `npm run test:e2e:doctor`: 5/5 passed.
- `npm run test:e2e:core`: 23/23 passed, 0 page/console errors.
- Page CLI timing: average 5,269 ms, P95 5,489 ms, max 5,489 ms.
- Scenario CLI timing: average 9,000 ms, P95/max 13,826 ms.

The current CLI timings contain fixed waits and are suitable for coarse regression detection only. They are not a reliable measure of first usable render latency.

## 2. Confirmed Findings

| Priority | Finding | Evidence | Consequence |
| --- | --- | --- | --- |
| P1 | Timeline reads full documents from four collections before trimming | `cloudfunctions/studentData/index.js:109-160,468-473` | Large report/paper payloads and DB reads grow faster than visible records |
| P1 | Home performs `1 + N` cloud calls and repeated access/data reads | `miniprogram/pages/index/index.js:101-192` | First paint and cloud cost scale with child count |
| P1 | Joined-student lookup is a serial N+1 | `cloudfunctions/studentAccess/index.js:189-203` | Shared-family home latency scales linearly |
| P1 | English attempts read every word and replace the full attempts array | `cloudfunctions/englishVocabulary/index.js:800-861,870-919` | Per-answer latency grows with vocabulary/session size; concurrent writes can overwrite attempts |
| P1 | AI usage summary silently truncates at 500 events | `cloudfunctions/aiUsage/index.js:124-140` | Monthly token/cost totals become inaccurate for active users |
| P1 | Runtime environment is hard-coded in the client | `miniprogram/app.js:11-14` | Staging/production isolation and rollback are error-prone |
| P1 | Some cloud functions deploy with `latest` dependencies and no per-function lockfile | `cloudfunctions/englishVocabulary/package.json`, `cloudfunctions/learningResource/package.json` | Identical source can deploy different dependency versions |
| P2 | All 20 pages and 168 KB of math seed data are in the main package | `miniprogram/app.json`, `miniprogram/data/math/*` | Cold-start download/parse cost includes rarely used features |
| P2 | Report detail returns full related documents and up to 100 feedback rows before first paint | `cloudfunctions/studentData/index.js:608-662` | Avoidable payload and first-render blocking |
| P2 | Analysis polling scans/sorts all tasks for a report | `cloudfunctions/getAnalysisProgress/index.js:28-37` | Repeated polling becomes slower as retries accumulate |
| P2 | Performance tests measure fixed waits | `scripts/devtools-e2e-fullpage.js:366-501` | Sub-second regressions and improvements remain invisible |
| P2 | Legacy direct-database fallbacks remain on user-facing pages | `miniprogram/utils/cloud.js:63-235` and page fallback branches | Two data-access contracts can return different permissions and payloads |
| P2 | Architecture/performance documents describe obsolete one-image batches and collection counts | `docs/ARCHITECTURE.md`, `docs/PERFORMANCE_ASSESSMENT_2026-06-25.md` | Operational decisions may be made from stale documentation |

## 3. Target Metrics

| Metric | Current | Phase 2 target | Final target |
| --- | ---: | ---: | ---: |
| Home cloud calls, one child | 2 plus fallback risk | 1 | 1 |
| Home cloud calls, N children | `1 + N` | 1 | 1 |
| Timeline collections read | 4 full-document queries | 4 projected queries | 1 event query if scale requires it |
| Timeline payload, first page | Not measured | At least 60% below baseline | Budget enforced in test |
| English word reads per attempt | All words for student | 1 word | 1 word |
| Session attempt update | Full-array replacement | Atomic append | Atomic append |
| AI usage summary completeness | First 500 events | Complete paged aggregation | Complete aggregation with reconciliation test |
| Main package | About 1.1 MB source tree | Below 800 KB | Budget enforced in release check |
| Event-driven page-ready P95 | Not available | Baseline established | No regression above 10% |

## 4. Delivery Sequence

### Task 1: Replace Fixed-Wait Performance Measurements

**Files:**

- Modify: `scripts/devtools-e2e-fullpage.js`
- Create: `scripts/performance-report.js`
- Modify: `package.json`
- Test: `tests/contracts.test.js`
- Document: `docs/TESTING.md`

- [x] Add a test asserting that page timing waits for a page-specific ready predicate rather than an unconditional 1,500 ms delay.
- [x] Run `node --test tests/contracts.test.js` and verify the new assertion fails.
- [x] Add `waitUntilReady(page, spec)` that polls route identity, loading-state disappearance, expected text, and collected page errors with a bounded timeout.
- [x] Record separate `navigationMs`, `readyMs`, assertion time, cloud call count, cloud duration, and payload bytes.
- [x] Add `npm run perf:baseline` to run at least five cold and five warm samples and calculate P50/P90/P95.
- [x] Keep the existing 23 functional assertions unchanged.
- [x] Run `npm run test:e2e:core` and `npm run perf:baseline`; expect 23/23 functional passes and a new event-driven report.
- [x] Commit: `test: establish event-driven mini program performance baseline`.

### Task 2: Fix AI Usage Aggregation Correctness

**Files:**

- Modify: `cloudfunctions/aiUsage/index.js`
- Test: `tests/ai-usage-ledger.test.js`
- Modify: `docs/CLOUD_FUNCTIONS.md`

- [x] Add a test with more than 500 monthly events and assert totals include every event.
- [x] Add a boundary test proving events outside the Beijing month are excluded.
- [x] Run `node --test tests/ai-usage-ledger.test.js`; expect the >500 test to fail.
- [x] Replace the single `.limit(500)` query with cursor pagination, or maintain a transactionally updated monthly aggregate document.
- [x] Return aggregation metadata: `isComplete`, `eventCount`, and `aggregatedAt`.
- [x] Add a reconciliation helper test comparing aggregate output with raw events.
- [x] Run `npm test`; expect 638 existing tests plus the new tests to pass.
- [x] Commit: `fix: make monthly AI usage totals complete`.

### Task 3: Make English Attempt Writes Bounded and Atomic

**Files:**

- Modify: `cloudfunctions/englishVocabulary/index.js`
- Test: `tests/english-vocabulary-cloud.test.js`
- Test: `tests/english-vocabulary.test.js`
- Modify: `docs/DATA_DICTIONARY.md`

- [x] Add a test proving recognition/dictation reads `studentEnglishWords.doc(wordId)` rather than the full student vocabulary.
- [x] Add a concurrent-attempt test that submits two attempts and preserves both.
- [x] Run the focused tests and verify they fail with the current implementation.
- [x] Load the word by document ID and reject it unless `word.studentId === session.studentId`.
- [x] Append attempts with an atomic database command or store attempts as separate `englishPracticeAttempts` documents keyed by session.
- [x] Keep mastery updates idempotent by adding an attempt ID and rejecting duplicates.
- [x] Rebuild session summaries from attempts without returning full attempt history on first paint.
- [x] Run `node --test tests/english-vocabulary*.test.js` and the English DevTools suite.
- [x] Commit: `perf: bound and atomically persist English attempts`.

### Task 4: Add a Single Lightweight Home Dashboard Endpoint

**Files:**

- Modify: `cloudfunctions/studentAccess/index.js`
- Modify: `cloudfunctions/studentData/index.js`
- Modify: `miniprogram/utils/cloud.js`
- Modify: `miniprogram/pages/index/index.js`
- Test: `tests/student-access.test.js`
- Test: `tests/student-data-access.test.js`
- Test: `tests/index-page-flows.test.js`

- [ ] Define `getHomeDashboard` returning accessible students, role/permissions, three subject summaries, latest actionable report summary, and latest paper summary.
- [ ] Add contract tests that forbid full `questions`, `errorDetails`, `pageResults`, and `imageFiles` fields in this response.
- [ ] Add a two-owned/two-shared-child test and assert a bounded number of DB queries with no serial member loop.
- [ ] Run focused tests and verify the endpoint is missing.
- [ ] Batch joined student reads with `command.in` or a bounded `Promise.all` fallback.
- [ ] Query lightweight report/paper projections for all accessible student IDs.
- [ ] Switch the home page to one cloud call and retain its 30-second in-page cache.
- [ ] Keep the legacy path behind a temporary feature flag for one release, then remove it in Task 10.
- [ ] Run `npm test`, `npm run test:e2e:core`, and the new performance baseline.
- [ ] Acceptance: one home cloud call for any tested child count; response payload budget passes.
- [ ] Commit: `perf: aggregate lightweight family home data`.

### Task 5: Project Timeline Fields and Index the Hot Queries

**Files:**

- Modify: `cloudfunctions/studentData/index.js`
- Modify: `cloudfunctions/getAnalysisProgress/index.js`
- Modify: `cloudfunctions/analyzePhotos/index.js`
- Test: `tests/student-data-access.test.js`
- Test: `tests/cloud-functions.test.js`
- Modify: `SETUP.md`
- Modify: `docs/DATA_DICTIONARY.md`

- [ ] Add tests that fail if timeline queries return fields not consumed by `buildTimeline`.
- [ ] Add a test with 100 historical tasks and assert progress reads only the latest task.
- [ ] Add `.field()` projections to reports, papers, English sessions, and resource packs.
- [ ] Change progress and stale-task queries to `orderBy('createdAt', 'desc').limit(...)`.
- [ ] Add the required `(reportId, createdAt)` analysisTasks index to setup/deployment documentation.
- [ ] Measure first-page timeline payload before and after using the existing payload metrics.
- [ ] If projected four-way merging still exceeds budget, create a follow-up `learningEvents` collection written at mutation boundaries; do not introduce it preemptively.
- [ ] Run timeline tests, core E2E, and deployment checks.
- [ ] Acceptance: first-page payload falls by at least 60%; visible ordering remains unchanged.
- [ ] Commit: `perf: project timeline data and index analysis progress`.

### Task 6: Introduce Explicit Report Detail DTOs

**Files:**

- Modify: `cloudfunctions/studentData/index.js`
- Modify: `cloudfunctions/reportFeedback/index.js`
- Modify: `miniprogram/pages/report/report.js`
- Modify: `miniprogram/pages/report/report-presenter.js`
- Test: `tests/student-data-access.test.js`
- Test: `tests/report-page-flows.test.js`

- [ ] Capture the fields actually consumed by `buildReportView` and define a versioned `ReportDetailDTO` contract.
- [ ] Add a payload-budget test with a report containing 20 images, large raw AI fields, a full paper, and 100 feedback rows.
- [ ] Return only linked-paper display metadata needed by the report page.
- [ ] Return current feedback state per visible target; load feedback history only when requested.
- [ ] Preserve full report content required for visible error details, but omit raw AI/debug fields at the cloud boundary.
- [ ] Render the report body before optional feedback history completes.
- [ ] Run report unit/page-flow tests and core E2E.
- [ ] Commit: `perf: return a bounded report detail payload`.

### Task 7: Split the Mini Program Package

**Files:**

- Modify: `miniprogram/app.json`
- Move: non-launch pages into feature roots under `miniprogram/subpackages/`
- Move: `miniprogram/data/math/*` with the math-heavy feature package where dependency rules allow
- Modify: navigation URLs in `miniprogram/pages/**`
- Modify: `tests/deployment-readiness.test.js`
- Modify: `tests/contracts.test.js`

- [ ] Add a release test that calculates main-package bytes and fails above the agreed budget.
- [ ] Record current package size from the DevTools build output.
- [ ] Keep only launch-critical pages in the main package: index, add/join student, and any required redirect surface.
- [ ] Group report/math, paper, English, and account/usage features into coherent subpackages.
- [ ] Verify shared utilities remain in the main package only when imported by main-package pages.
- [ ] Update all route builders and E2E route fixtures.
- [ ] Run deployment checks and every DevTools suite.
- [ ] Acceptance: main package below 800 KB and no route/navigation regression.
- [ ] Commit: `perf: split feature pages from the mini program main package`.

### Task 8: Make Environment and Dependency Builds Reproducible

**Files:**

- Modify: `miniprogram/app.js`
- Modify: `project.config.json` or environment-specific project configuration
- Modify: `cloudfunctions/englishVocabulary/package.json`
- Modify: `cloudfunctions/learningResource/package.json`
- Create: deployment lockfiles or a deterministic cloud-function packaging script
- Modify: `tests/deployment-readiness.test.js`
- Modify: `docs/DEPLOYMENT.md`

- [ ] Add a deployment test rejecting `latest` dependencies and undocumented hard-coded runtime environment IDs.
- [ ] Pin CloudBase/WeChat SDK versions consistently across cloud functions.
- [ ] Generate or check in the lock artifact used by actual cloud-function deployment.
- [ ] Resolve the client environment from build configuration, with explicit development and production values.
- [ ] Add a pre-deploy command that prints environment, function list, dependency versions, and source commit before upload.
- [ ] Run `npm run release:check` and deploy a staging smoke build before production.
- [ ] Commit: `build: make cloud deployments reproducible`.

### Task 9: Operationalize Shared Cloud-Function Modules

**Files:**

- Create: `scripts/sync-cloudfunction-shared.js`
- Modify: source templates for `access.js`, `usage-ledger.js`, and `pricing.js`
- Modify: `tests/deployment-readiness.test.js`
- Modify: `docs/ARCHITECTURE.md`

- [ ] Preserve per-function self-contained deployment; do not use runtime `../_shared` imports.
- [ ] Make one canonical source for each duplicated helper and generate local copies before checks/deploy.
- [ ] Extend the existing hash consistency test to fail with a command showing how to regenerate copies.
- [ ] Document the intentional exception for `regenerateVerificationPaper/access.js` or converge it if behavior should match.
- [ ] Run deployment and permission tests.
- [ ] Commit: `build: generate self-contained cloud function shared modules`.

### Task 10: Retire Legacy Direct-Database Fallbacks

**Files:**

- Modify: `miniprogram/utils/cloud.js`
- Modify: `miniprogram/pages/index/index.js`
- Modify: `miniprogram/pages/student-profile/student-profile.js`
- Modify: `miniprogram/pages/upload-history/upload-history.js`
- Modify: other pages identified by `rg 'cloud.get(Students|Reports|Papers|SubjectProfiles)' miniprogram/pages`
- Test: corresponding `tests/*-page-flows.test.js`

- [ ] Add tests asserting that access-aware cloud function failure produces a retry/error state instead of silently changing data contracts.
- [ ] Remove direct collection reads from authenticated shared-family flows after the aggregate endpoints have shipped successfully.
- [ ] Preserve offline/test adapters through explicit dependency injection, not production database fallback branches.
- [ ] Confirm viewer permissions remain identical across every page.
- [ ] Run permission tests with owner, viewer, revoked member, and unrelated user fixtures.
- [ ] Commit: `refactor: remove legacy client database fallbacks`.

### Task 11: Add Operational Handling for Deletion Requests

**Files:**

- Create: `scripts/process-data-deletion-request.js` or an admin-only cloud function
- Modify: `cloudfunctions/aiUsage/index.js`
- Test: `tests/ai-usage-ledger.test.js`
- Modify: `docs/DEPLOYMENT.md`
- Modify: `docs/RELEASE_CHECKLIST.md`

- [ ] Define allowed status transitions: requested -> processing -> completed/rejected.
- [ ] Add an idempotent dry-run mode listing affected database and storage records.
- [ ] Require operator identity and write an audit note for every transition.
- [ ] Add tests for ownership, repeated execution, partial failure, and recovery.
- [ ] Document response-time ownership and the production runbook.
- [ ] Commit: `feat: operationalize data deletion requests`.

### Task 12: Refresh Documentation and Final Release Gates

**Files:**

- Modify: `README.md`
- Modify: `docs/ARCHITECTURE.md`
- Modify: `docs/PERFORMANCE_ASSESSMENT_2026-06-25.md`
- Modify: `docs/CLOUD_FUNCTIONS.md`
- Modify: `docs/DATA_DICTIONARY.md`
- Modify: `docs/TESTING.md`
- Modify: `docs/RELEASE_CHECKLIST.md`
- Create: `docs/test-reports/<date>-optimization-final-report.md`

- [ ] Update photo batching from 1 to 5 and continuation behavior from 1 invocation batch to 3 where current code does so.
- [ ] Align page/function/collection counts with the repository.
- [ ] Document DTO boundaries, subpackage structure, environment selection, indexes, and performance budgets.
- [ ] Run `rg` checks for obsolete constants and counts.
- [ ] Run `npm run release:check`, every DevTools suite, staging real-cloud smoke, and one real-image diagnosis.
- [ ] Record before/after payload, call count, ready-time, AI workflow duration, and cost metrics.
- [ ] Commit: `docs: publish optimization results and operating baseline`.

## 5. Phase Gates

### Gate A: Correctness and Measurement

Tasks 1-3 complete. Required before performance claims:

- Event-driven baseline exists.
- AI cost summary is complete beyond 500 events.
- English attempts are atomic and bounded.

### Gate B: Hot-Path Performance

Tasks 4-6 complete:

- Home uses one cloud call.
- Timeline payload is at least 60% smaller.
- Report detail payload has an enforced budget.
- No owner/viewer permission regression.

### Gate C: Startup and Operations

Tasks 7-11 complete:

- Main package is below 800 KB.
- Cloud deployments are deterministic.
- Legacy direct DB fallbacks are removed.
- Data deletion requests have an auditable operator path.

### Gate D: Release

Task 12 complete:

- Unit, coverage, static, deployment, CLI E2E, real-cloud, and real-image checks pass.
- Staging metrics meet budgets for three consecutive runs.
- Rollback instructions identify the previous function versions and mini program release.

## 6. Explicit Non-Goals

- Do not replace the native mini program framework.
- Do not add Redis, a separate API server, or a new database solely for optimization.
- Do not parallelize AI calls beyond measured CloudBase timeout and rate-limit safety.
- Do not weaken owner/viewer access checks for fewer database reads.
- Do not introduce a materialized learning event collection unless projected queries still miss the payload/latency budget.

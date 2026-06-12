# Page Responsibility Dedup Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [x]`) syntax for tracking.

**Goal:** Remove repeated diagnostic summary content across the learning profile home, subject home, and verification paper pages by making the subject home a task workbench and the verification page a paper configuration tool.

**Architecture:** Keep the current WeChat Mini Program page structure, but change view-model boundaries. `index-presenter.js` remains the cross-subject learning profile presenter, `subject-home-presenter.js` becomes a subject workbench presenter, and `generate-verification` stays a page-level configuration flow with denser selection UI and optional source details.

**Tech Stack:** WeChat Mini Program WXML/WXSS/JavaScript, existing `utils/cloud.js`, `utils/poller.js`, `utils/util.js`, Node.js built-in test runner.

---

## File Structure

- Modify `miniprogram/pages/subject-home/subject-home-presenter.js`
  - Convert output from diagnosis-summary fields to workbench fields: `subjectTitle`, `primaryTask`, `taskQueue`, `tools`, `latestReportId`, `analysisState`.
- Modify `miniprogram/pages/subject-home/subject-home.js`
  - Bind the new workbench view model, preserve polling/navigation, add task/tool handlers.
- Modify `miniprogram/pages/subject-home/subject-home.wxml`
  - Remove hero illustration, current diagnosis summary, metrics strip, and recent changes.
  - Render subject workbench, primary task, task queue, and tools.
- Modify `miniprogram/pages/subject-home/subject-home.wxss`
  - Re-skin the subject page as a lighter workbench.
- Modify `miniprogram/pages/index/index-presenter.js`
  - Add `priorityHighlights` while keeping compatibility with existing `observations` as needed.
- Modify `miniprogram/pages/index/index.wxml`
  - Rename “学习观察” to “重点提示” and render up to two priority highlights.
- Modify `miniprogram/pages/generate-verification/generate-verification.js`
  - Add selected paper config summary, optional expanded source state, and single-target preselection support.
- Modify `miniprogram/pages/generate-verification/generate-verification.wxml`
  - Remove explanatory tip bar, render configuration-first layout.
- Modify `miniprogram/pages/generate-verification/generate-verification.wxss`
  - Increase density and make it feel like an output configuration screen.
- Modify tests:
  - `tests/subject-home-presenter.test.js`
  - `tests/index-presenter.test.js`
  - `tests/contracts.test.js`
  - `tests/page-flows.test.js`
- Modify docs:
  - `PRD.md`
  - `PROJECT_PLAN.md`
  - `docs/ARCHITECTURE.md`
  - `docs/TESTING.md`
  - `docs/TEST_MATRIX.md`
  - `CHANGELOG.md`

---

## Task 1: Subject Home Workbench

**Files:**
- Modify: `tests/subject-home-presenter.test.js`
- Modify: `tests/contracts.test.js`
- Modify: `tests/page-flows.test.js`
- Modify: `miniprogram/pages/subject-home/subject-home-presenter.js`
- Modify: `miniprogram/pages/subject-home/subject-home.js`
- Modify: `miniprogram/pages/subject-home/subject-home.wxml`
- Modify: `miniprogram/pages/subject-home/subject-home.wxss`

- [x] Write failing presenter tests:
  - A profile with two pending bottlenecks returns `subjectTitle: '数学工作台'`.
  - It returns `primaryTask.actionType === 'verification'`.
  - It returns a `taskQueue` with readable names and evidence text.
  - Empty profile returns primary task `拍照诊断`.

- [x] Write failing contract tests:
  - `subject-home.wxml` does not contain `当前综合诊断`.
  - `subject-home.wxml` does not reference `/assets/images/math-diagnostic-guide.jpg`.
  - `subject-home.wxml` contains `工作台`, `待处理队列`, and `工具`.

- [x] Write/adjust page-flow tests:
  - Subject home loads a workbench view and exposes `view.primaryTask`.
  - Calling the primary action for a pending profile navigates to `generate-verification`.
  - Tapping a task queue row navigates to `generate-verification` with a target code if supported.

- [x] Run focused tests and verify they fail for the expected reason:

```bash
node --test tests/subject-home-presenter.test.js tests/contracts.test.js tests/page-flows.test.js --test-name-pattern="subject home|workbench"
```

- [x] Implement `buildSubjectHomeView(profile, reports, formatRelativeTime, options)`:
  - Accept optional `subjectName`.
  - Normalize current/legacy bottlenecks.
  - Build `taskQueue` from non-improved bottlenecks.
  - Build `primaryTask`:
    - pending queue exists → `生成验证试卷`, `actionType: 'verification'`
    - no diagnosis yet → `拍照诊断`, `actionType: 'diagnosis'`
    - only improved items → `拍照诊断`, `actionType: 'diagnosis'`
  - Build tools for diagnosis, default paper, history, and latest report when a latest report exists.

- [x] Update `subject-home.js`:
  - Pass `subjectName` into the presenter.
  - Use `view.primaryTask.actionType` in `onPrimaryAction`.
  - Add `onTaskTap` and `onToolTap`.
  - Keep existing named handlers for compatibility.

- [x] Replace `subject-home.wxml` with workbench layout:
  - Top bar.
  - Analysis state if present.
  - Workbench header with primary task.
  - Primary action buttons.
  - Task queue.
  - Tools.
  - Empty task queue message.

- [x] Update `subject-home.wxss` to match the lighter workbench.

- [x] Run focused tests and make them pass.

## Task 2: Home Priority Highlights

**Files:**
- Modify: `tests/index-presenter.test.js`
- Modify: `tests/contracts.test.js`
- Modify: `tests/page-flows.test.js`
- Modify: `miniprogram/pages/index/index-presenter.js`
- Modify: `miniprogram/pages/index/index.wxml`
- Modify: `miniprogram/pages/index/index.wxss`

- [x] Write failing presenter tests:
  - `priorityHighlights` exists and contains at most two entries.
  - The first highlight for a math-only diagnosis reads like a priority prompt, not a full card list.

- [x] Write failing contract test:
  - `index.wxml` contains `重点提示`.
  - `index.wxml` no longer contains the section heading `学习观察`.

- [x] Run focused tests and verify they fail.

- [x] Implement `priorityHighlights` in `index-presenter.js`.
  - Reuse current observations as the source.
  - Limit to 2.
  - Keep `observations` as a compatibility alias during this refactor if needed by older tests.

- [x] Update `index.wxml` to render `home.priorityHighlights`.

- [x] Update styles for compact priority rows.

- [x] Run focused tests and make them pass.

## Task 3: Verification Paper Configurator

**Files:**
- Modify: `tests/page-flows.test.js`
- Modify: `tests/contracts.test.js`
- Modify: `miniprogram/pages/generate-verification/generate-verification.js`
- Modify: `miniprogram/pages/generate-verification/generate-verification.wxml`
- Modify: `miniprogram/pages/generate-verification/generate-verification.wxss`

- [x] Write failing tests:
  - Verification page exposes `paperConfig` with selected count, question count, estimated minutes, and paper size.
  - A `targetCode` option preselects only the matching pending bottleneck.
  - Contract: WXML contains `出卷配置` or `试卷设置`, and does not contain the long tip sentence `系统针对每个卡点生成 3 道验证题`.

- [x] Run focused tests and verify they fail.

- [x] Update `generate-verification.js`:
  - Store `targetCode`.
  - Preselect matching target when provided; otherwise keep severity-priority default.
  - Compute `paperConfig`.
  - Keep source expansion deferred; this pass keeps the page focused on A4 paper configuration.

- [x] Update WXML:
  - Replace top tip bar with config header.
  - Render dense target rows.
  - Render config summary card.
  - Keep preview/generate buttons.

- [x] Update WXSS for a compact configurator layout.

- [x] Run focused tests and make them pass.

## Task 4: Documentation and Verification

**Files:**
- Modify: `PRD.md`
- Modify: `PROJECT_PLAN.md`
- Modify: `docs/ARCHITECTURE.md`
- Modify: `docs/TESTING.md`
- Modify: `docs/TEST_MATRIX.md`
- Modify: `CHANGELOG.md`
- Modify: `package.json` only if test files change scripts.

- [x] Update docs to describe:
  - 首页 = 学习档案摘要。
  - 学科主页 = 工作台。
  - 验证页 = 出卷配置器。
  - 诊断解释只在首页和报告页主展示.

- [x] Run all checks:

```bash
npm run verify
git diff --check
```

- [x] Run WeChat Developer Tools preview:

```bash
/Applications/wechatwebdevtools.app/Contents/MacOS/cli preview --project "/Users/qiming/Downloads/GoogleDrive/AI Learning/miniprogram-learning-diagnostic" --qr-output terminal
```

- [x] Run page-flow smoke coverage:
  - Node page harness covers 首页 loading.
  - Node page harness covers 进入数学工作台.
  - Node page harness covers 工作台主按钮进入验证页.
  - Node page harness covers 验证页 targetCode and config summary.
  - WeChat Developer Tools CLI `preview` and `auto` both completed successfully; no project-local miniprogram automator dependency is configured.

- [x] Update test counts in docs after full test output.

- [ ] Commit all changes:

```bash
git add -A
git commit -m "Refine learning diagnostic page responsibilities"
```

# Home/Profile Split Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the app entry adapt to child count: zero children shows empty state, one child shows that child's learning profile directly, and multiple children shows only the family workbench.

**Architecture:** Keep `pages/index/index` as the smart entry. Extract the single-child learning profile into `pages/student-profile/student-profile` for multi-child drill-down, while reusing the existing `index-presenter` view model to avoid duplicated product logic. The family workbench remains powered by `utils/child-workbench.js`, but it no longer co-renders single-child profile sections on the same page.

**Tech Stack:** WeChat Mini Program pages, existing presenter pattern, Node test runner, page harness tests.

---

### Task 1: Lock The Routing Contract With Tests

**Files:**
- Modify: `tests/page-flows.test.js`
- Modify: `tests/index-presenter.test.js`

- [ ] Add tests for `pages/index/index`:
  - zero children: `homeMode === 'empty'`, no `home`, no `childCards`
  - one child: `homeMode === 'single-profile'`, has `home`, no `childCards`
  - multiple children: `homeMode === 'family-workbench'`, has `childCards`, no `home`
- [ ] Update the child workbench presenter test so `profileUrl` points to `/pages/student-profile/student-profile`.
- [ ] Add a page-flow test for `pages/student-profile/student-profile` loading a specific `studentId`.

### Task 2: Add Student Profile Page

**Files:**
- Create: `miniprogram/pages/student-profile/student-profile.js`
- Create: `miniprogram/pages/student-profile/student-profile.wxml`
- Create: `miniprogram/pages/student-profile/student-profile.wxss`
- Create: `miniprogram/pages/student-profile/student-profile.json`
- Modify: `miniprogram/app.json`
- Modify: `miniprogram/utils/traceable-actions.js`

- [ ] Register `pages/student-profile/student-profile`.
- [ ] Route `student-profile` traceable actions to `/pages/student-profile/student-profile?studentId=...`.
- [ ] Reuse `buildLearningProfileHomeView` for the page view model.
- [ ] Load one student's dashboard by `studentId`; keep legacy fallbacks for reports, papers, and subject profiles.
- [ ] Port the single-child profile event handlers from `index.js` so reports, records, bottlenecks, actions, subjects, and parent management remain clickable.

### Task 3: Split Index Rendering Modes

**Files:**
- Modify: `miniprogram/pages/index/index.js`
- Modify: `miniprogram/pages/index/index.wxml`
- Modify: `miniprogram/pages/index/index.wxss`

- [ ] Add `homeMode` to page data.
- [ ] In `loadStudents`:
  - zero children -> `homeMode: 'empty'`
  - one child -> build `home`, `childCards: []`, `homeMode: 'single-profile'`
  - multiple children -> build `childCards`, `home: null`, `homeMode: 'family-workbench'`
- [ ] Keep the single-child profile template only under `homeMode === 'single-profile'`.
- [ ] Keep the family workbench template only under `homeMode === 'family-workbench'`.
- [ ] Make child card body navigate to `student-profile`.

### Task 4: Update Documentation

**Files:**
- Modify: `docs/ARCHITECTURE.md`
- Modify: `docs/TESTING.md`

- [ ] Document the adaptive homepage rule.
- [ ] Update route graph and page list with `student-profile`.
- [ ] Clarify that family workbench is for multiple children only.

### Task 5: Verify

**Commands:**
- `npm run verify`

- [ ] Confirm all unit/page-flow/contract tests pass.
- [ ] Confirm JS syntax check passes.

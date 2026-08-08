# Chinese Verification Paper Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Turn Chinese verification papers into a staged, traceable review loop in which each unresolved original error is retested before any similar-character extension.

**Architecture:** Keep math's fine-bottleneck generation unchanged. For Chinese, derive a compact review policy from each `chineseReviewItem`, pass it through the existing paper generation contract, and persist the selected direct and transfer questions against the original `reviewItemId`. Present the resulting coverage and feedback as readable parent-facing sections in the paper workbench and subject home.

**Tech Stack:** WeChat Mini Program, Node.js cloud functions, CloudBase database, PDFKit, `node:test`.

---

## File Structure

- `cloudfunctions/generatePaper/chinese-review-targets.js`: Pure Chinese review policy and generation prompt contract.
- `cloudfunctions/generatePaper/index.js`: Applies the policy, validates direct coverage, and persists selected targets.
- `cloudfunctions/analyzePhotos/profile-summary.js`: Advances or resets the review stage after item-level evidence.
- `miniprogram/pages/paper-preview/paper-preview-presenter.js`: Builds readable direct-review and similar-review sections.
- `miniprogram/pages/paper-preview/paper-preview.wxml`: Displays Chinese coverage and item-level feedback without internal IDs.
- `miniprogram/pages/subject-home/subject-home-presenter.js`: Summarizes the current review stage and next action.
- `tests/chinese-review-targets.test.js`, `tests/cloud-functions.test.js`, `tests/paper-preview-presenter.test.js`, `tests/subject-home-presenter.test.js`: Regression coverage.

### Task 1: Establish the Chinese Review Policy

**Files:**
- Modify: `cloudfunctions/generatePaper/chinese-review-targets.js`
- Test: `tests/chinese-review-targets.test.js`

- [x] Add a policy builder that maps review pass/fail history and mistake type to a direct method, a parent-facing stage label, and an allowed extension family.
- [x] Require one `direct_review` question for every unresolved review item; allow at most one `similarity_transfer` question per item.
- [x] Test first, then implement and run `node --test tests/chinese-review-targets.test.js`.

### Task 2: Apply the Policy to Paper Generation and Evidence

**Files:**
- Modify: `cloudfunctions/generatePaper/index.js`
- Modify: `cloudfunctions/analyzePhotos/profile-summary.js`
- Test: `tests/cloud-functions.test.js`

- [x] Carry `reviewStage`, `directMethod`, and `extensionFamily` into `papers.chineseReviewTargets` and generated questions.
- [x] Reject missing direct coverage or more than one transfer question for an item.
- [x] Update the review interval after evidence: direct pass advances a stage, failed direct review resets it, transfer evidence informs but never substitutes for direct evidence.
- [x] Run the focused cloud-function suite.

### Task 3: Surface the Review Design in the Mini Program

**Files:**
- Modify: `miniprogram/pages/subject-home/subject-home-presenter.js`
- Modify: `miniprogram/pages/paper-preview/paper-preview-presenter.js`
- Modify: `miniprogram/pages/paper-preview/paper-preview.wxml`
- Test: `tests/subject-home-presenter.test.js`, `tests/paper-preview-presenter.test.js`

- [x] Show a compact parent-facing stage such as “原项复测”“巩固复测”“迁移观察” for each active Chinese error item.
- [x] Show the paper's original-error coverage separately from similar-character extensions; do not expose item IDs or internal type codes.
- [x] Show feedback by original error item with “已通过 / 仍需复测 / 证据不足”.
- [x] Run focused presenter tests.

### Task 4: Document, Verify, and Commit

**Files:**
- Modify: `docs/subject-design/钟青羽语文错项驱动诊断与验证设计文档.md`
- Modify: `CHANGELOG.md`

- [x] Mark implemented policy decisions and explicitly retain future scope for curated similarity dictionaries.
- [x] Run `node --test tests/chinese-review-targets.test.js tests/cloud-functions.test.js tests/paper-preview-presenter.test.js tests/subject-home-presenter.test.js`.
- [x] Run `git diff --check` and commit the implementation.

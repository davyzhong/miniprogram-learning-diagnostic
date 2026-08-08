# Chinese And English Learning Closure Upgrade Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Deliver the approved Chinese dual-track closure and English vocabulary 2.0 while keeping their learning evidence independent from the math report model.

**Architecture:** Extend existing subject dashboard presenters with a common display-only primary action. Add curated relation data and small, dedicated cloud-function actions for Chinese skill tasks and English confusion practice. Preserve the Chinese original-item verification rules and English familiarity/spelling state machine as the only sources of mastery truth.

**Tech Stack:** WeChat Mini Program, CloudBase cloud functions, Node.js `node:test`, existing page harness and presenter conventions.

---

## File Structure

- Modify `miniprogram/pages/subject-home/subject-home-presenter.js`: derive one primary learning action and compact secondary states.
- Modify `miniprogram/pages/subject-home/*`: render and navigate the action without exposing internal IDs.
- Modify `cloudfunctions/englishVocabulary/*`: calculate a server-side daily plan and run non-mastering confusion sessions.
- Create `cloudfunctions/englishVocabulary/english-word-relations.seed.js`: bounded, maintained English confusing-word relations.
- Create `miniprogram/pages/english-confusion/*`: short three-word confusion practice.
- Create `cloudfunctions/studentData/chinese-skill-tasks.js`: template and attempt helpers for three structured Chinese skill tasks.
- Modify `cloudfunctions/studentData/index.js` and `miniprogram/utils/cloud.js`: expose authorized Chinese task actions.
- Create `miniprogram/pages/chinese-skill-task/*` and `miniprogram/pages/chinese-review-detail/*`: task and original-item detail experiences.
- Create `miniprogram/data/chinese/confusion-families.seed.js`: bounded curated Chinese confusion families.
- Modify `cloudfunctions/generatePaper/chinese-review-targets.js`: prefer curated family hints when transfer is allowed.
- Modify focused tests and documentation.

### Task 1: Establish shared task presentation

- [ ] Add presenter tests for Chinese original-item priority and English daily task priority.
- [ ] Implement display-only `primaryLearningAction` and compact secondary status views.
- [ ] Render one primary action on the subject home and route it to existing or new flows.
- [ ] Run focused presenter/page tests.

### Task 2: Ship English vocabulary 2.0 daily planning

- [ ] Add failing tests for `getTodayPlan`, 5/10/20 task sizes, and relation practice that does not mutate mastery.
- [ ] Add bounded relation seed data and deterministic plan selection in `englishVocabulary`.
- [ ] Add cloud adapter methods and task-size query propagation to recognition/dictation pages.
- [ ] Add an English confusion page and subject-home navigation.
- [ ] Run English cloud, unit, and page-flow tests.

### Task 3: Ship Chinese curated transfer and detail

- [ ] Add tests for curated family hints and original-item fallback.
- [ ] Add Chinese confusion family seed data and family lookup helper.
- [ ] Include family hints only for allowed transfer stages in the generation prompt.
- [ ] Add a Chinese review detail page and route each compact review row to it.
- [ ] Run Chinese target, paper, presenter, and page-flow tests.

### Task 4: Ship Chinese reading/expression micro tasks

- [ ] Add tests for task selection, permission checks, idempotent attempts, and status transitions.
- [ ] Add authorized `studentData` actions for loading, starting, and submitting a structured micro task.
- [ ] Add a dedicated Chinese task page with the three approved templates: evidence finding, one-sentence summary, and making a sentence specific.
- [ ] Surface the most relevant micro task only when no due Chinese original-item review exists.
- [ ] Run focused cloud and page-flow tests.

### Task 5: Documentation and strict README refresh

- [ ] Update the subject design docs and root README to describe the delivered behavior and boundaries.
- [ ] Regenerate every README/user-guide image with current anonymized B+ UI, including Chinese and English workbenches.
- [ ] Update captions, accessibility text, and the user guide flow to match screenshots.
- [ ] Run `git diff --check`, focused tests, JS syntax check, and the available DevTools screenshot flows.

# Family Child Card B Layout Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Rebuild each family-home child card around the approved B hierarchy while preserving all existing learning content in a denser layout.

**Architecture:** Keep the current presenter and navigation contracts unchanged. Reorder and simplify only `pages/index` template and styles, with page-flow tests enforcing hierarchy, cardinality, touch targets, and compact dimensions.

**Tech Stack:** WeChat Mini Program WXML/WXSS, CommonJS presenters, Node.js built-in test runner.

---

### Task 1: Lock the B hierarchy in tests

**Files:**
- Modify: `tests/index-page-flows.test.js`

- [ ] Add an exact source-order assertion for quick actions, diagnosis, priority action, metrics, and subjects.
- [ ] Assert quick links no longer render summary copy and subject rows no longer render detail summaries or segment bars.
- [ ] Update compact sizing expectations for the quick controls, diagnosis rows, metrics, and subject entries.
- [ ] Run `node --test tests/index-page-flows.test.js` and confirm the new assertions initially fail.

### Task 2: Reorder and simplify the card template

**Files:**
- Modify: `miniprogram/pages/index/index.wxml`

- [ ] Place the four quick links in one full-width row below identity and before diagnosis, preserving complete titles.
- [ ] Move the gated diagnosis list immediately after quick links.
- [ ] Keep priority and secondary actions directly after diagnosis.
- [ ] Move metrics and status segments below actions.
- [ ] Replace three detailed subject rows with compact single-line subject entries while preserving all three data items and traceable taps.

### Task 3: Implement compact B styling

**Files:**
- Modify: `miniprogram/pages/index/index.wxss`

- [ ] Add a grouped upper header/action treatment without nested cards.
- [ ] Reduce quick links to a stable four-column row below identity, with complete readable titles.
- [ ] Clamp diagnosis summaries to one line and strengthen subject color cues.
- [ ] Reduce metric and action spacing while preserving legibility.
- [ ] Convert subjects to three stable columns with no internal wrapping or layout shift.
- [ ] Add narrow-screen safeguards for 360px and 390px layouts.

### Task 4: Verify behavior and constraints

**Files:**
- Test: `tests/index-page-flows.test.js`
- Test: `tests/index-presenter.test.js`
- Test: `tests/bplus-design-system.test.js`

- [ ] Run the three focused test files.
- [ ] Run `npm run check`.
- [ ] Run `npm run check:size` and keep the main package below 800 KB.
- [ ] Inspect the local family-home page at both 360px and 390px widths and confirm hierarchy, density, truncation, tap affordances, and no horizontal overflow.

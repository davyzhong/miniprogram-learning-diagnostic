# Project Documentation and README Refresh Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Bring every current project document and the GitHub README in sync with the latest main-branch product, engineering baseline, and anonymized interface screenshots.

**Architecture:** Treat code and reproducible commands as the source of truth. Separate GitHub presentation, user guidance, current engineering references, topic indexes, and immutable historical records so each fact has one clear home.

**Tech Stack:** Markdown, HTML image layout supported by GitHub, Mermaid, Node.js scripts, WeChat DevTools automator.

---

### Task 1: Freeze the current baseline

**Files:**
- Modify: `docs/superpowers/specs/2026-07-18-project-documentation-and-readme-refresh-design.md`

- [x] Inventory pages, cloud functions, collections, tests, docs, screenshots, and recent commits.
- [x] Run `npm test` and record the exact result.
- [x] Run syntax and package-size checks and record exact results.

### Task 2: Rebuild the GitHub project page

**Files:**
- Modify: `README.md`

- [x] Replace the duplicated manual with a product-showcase narrative.
- [x] Add product flow, subject differentiation, screenshot gallery, architecture, quick start, quality baseline, and documentation map.
- [x] Ensure every claim points to a current document or reproducible command.

### Task 3: Refresh the visual user guide

**Files:**
- Modify: `docs/user-guide/README.md`
- Modify: `docs/user-guide/images/*.png`
- Modify when required: `scripts/generate-readme-screenshots.js`

- [ ] Generate all 14 anonymized screenshots from current UI mocks. Blocked until WeChat DevTools service port is enabled.
- [ ] Inspect screenshots for clipping, stale layout, PII, internal identifiers, and inconsistent dimensions.
- [x] Rewrite the guide around the current family, diagnosis, verification, Chinese, and English workflows.

### Task 4: Synchronize current product and engineering documents

**Files:**
- Modify: `PRD.md`, `PROJECT_PLAN.md`, `SETUP.md`, `CHANGELOG.md`, `CLAUDE.md`
- Modify: `docs/ARCHITECTURE.md`, `docs/CLOUD_FUNCTIONS.md`, `docs/DATA_DICTIONARY.md`
- Modify: `docs/DEPLOYMENT.md`, `docs/METRICS.md`, `docs/RELEASE_CHECKLIST.md`
- Modify: `docs/TESTING.md`, `docs/TEST_MATRIX.md`, `docs/TROUBLESHOOTING.md`

- [x] Align dates, status, counts, commands, routes, collections, and current UX behavior.
- [x] Remove contradictory baseline statements.
- [x] Add links back to README, user guide, and authoritative topic documents.

### Task 5: Refresh topic indexes

**Files:**
- Modify: `docs/product/README.md`
- Modify: `docs/subject-design/README.md`
- Modify: `docs/subject-design/math/README.md`
- Modify: `docs/subject-design/english/README.md`
- Modify: `docs/subject-design/legacy/README.md`
- Modify: `data/math/README.md`

- [x] Mark current, roadmap, reference, and historical documents clearly.
- [x] Add a recommended reading order and current implementation status.

### Task 6: Validate the documentation set

**Files:**
- Create or modify only if useful: `scripts/check-docs.js`
- Modify: `package.json` only if a reusable documentation check is added.

- [x] Check Markdown relative links and image paths.
- [x] Scan current docs for stale counts and obsolete UI claims.
- [x] Run `git diff --check`, unit tests, syntax checks, and package-size checks.
- [ ] Review the final diff and summarize any environment-limited screenshot work.

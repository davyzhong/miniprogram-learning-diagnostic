# Photo History And OCR Dedup Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Preserve every uploaded worksheet photo, show it in history, and prevent repeated OCR-equivalent pages from inflating diagnostic results.

**Architecture:** Store photo metadata inside each report instead of adding a new collection. `analyzeBatch` returns one result per image; `analyzePhotos` normalizes OCR summaries, marks duplicates against current and historical report photos, and aggregates only unique pages.

**Tech Stack:** WeChat Mini Program, CloudBase cloud functions, Node.js built-in test runner.

---

### Task 1: OCR Summary Deduplication

**Files:**
- Create: `cloudfunctions/analyzePhotos/photo-dedup.js`
- Test: `tests/photo-dedup.test.js`

- [ ] Normalize OCR summaries to stable comparable text.
- [ ] Mark duplicate pages against historical and current-upload photos.
- [ ] Keep all page records and expose `isDuplicate` and `duplicateOf`.

### Task 2: Per-Image Analysis And Report Storage

**Files:**
- Modify: `cloudfunctions/analyzeBatch/index.js`
- Modify: `cloudfunctions/analyzePhotos/index.js`
- Modify: `cloudfunctions/uploadAndAnalyze/index.js`
- Modify: `miniprogram/pages/upload/upload.js`
- Test: `tests/contracts.test.js`

- [ ] Send upload filename and size hints into the report.
- [ ] Require AI output to contain `pageResults` with OCR summaries.
- [ ] Map page results back to cloud file IDs.
- [ ] Exclude duplicate page results from aggregate diagnostic counts.
- [ ] Save enriched `imageFiles` on the report.

### Task 3: Upload History Page

**Files:**
- Create: `miniprogram/pages/upload-history/upload-history.js`
- Create: `miniprogram/pages/upload-history/upload-history.wxml`
- Create: `miniprogram/pages/upload-history/upload-history.wxss`
- Create: `miniprogram/pages/upload-history/upload-history.json`
- Modify: `miniprogram/pages/subject-home/subject-home.js`
- Modify: `miniprogram/pages/subject-home/subject-home.wxml`
- Modify: `miniprogram/app.json`

- [ ] Add a subject-home entry for uploaded photo history.
- [ ] Group photos by report and support original image preview.
- [ ] Display OCR summary and suspected-duplicate state.
- [ ] Fall back to legacy `imageFileIds` for older reports.

### Task 4: Documentation And Verification

**Files:**
- Modify: `PRD.md`
- Modify: `SETUP.md`

- [ ] Document the simplified duplicate policy and report photo schema.
- [ ] Run `npm test`.
- [ ] Run `npm run check`.
- [ ] Run `git diff --check`.

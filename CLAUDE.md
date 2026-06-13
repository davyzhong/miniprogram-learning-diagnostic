# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project

WeChat Mini Program for K-12 learning diagnosis. Parents photograph exam papers; a CloudBase serverless backend uses AI to detect errors and classify them into a bottleneck taxonomy. The mini program then generates targeted verification papers and compares follow-up uploads to track improvement.

No backend secrets are required — CloudBase AI calls authenticate via the current cloud environment identity. The cloud env ID `cloud1-d6gneg68m5a7a3876` is hardcoded in `miniprogram/app.js` and `project.config.json` (`cloudbaseRoot`); changing environments means editing both.

## Commands

There is no CLI build for the mini program itself — compilation, preview, and cloud-function deployment happen in the **WeChat Developer Tools IDE** (compile = 编译, deploy a cloud function = right-click its dir → "上传并部署：云端安装依赖"). Set cloud functions to the platform max timeout of **60s**.

Node.js tasks run from the repo root:

| Action | Command |
|--------|---------|
| Full test suite | `npm test` |
| Tests with coverage | `npm run test:coverage` |
| Run **one** test file | `node --test tests/<file>.test.js` |
| JS syntax check (74 files) | `npm run check` |
| Full verify (tests + syntax) | `npm run verify` |
| Real-image e2e (not in `npm test`) | `npm run test:e2e-real-image` |

`npm test` enumerates test files explicitly (not a glob), so new test files must also be added to the `test` and `test:coverage` scripts in `package.json`. Tests use the Node.js built-in runner (`node --test`), no external framework. Run `npm run verify` after any change before committing.

## Architecture

```
Mini Program (12 pages, WXML/WXSS/JS)
    │  wx.cloud.callFunction()  /  direct wx.cloud.database() reads
    ▼
CloudBase (serverless)
    ├─ uploadAndAnalyze   → creates report record, fire-and-forget starts analyzePhotos
    ├─ analyzePhotos      → splits into batches of 5, calls analyzeBatch serially, dedups, merges, writes report/profile
    ├─ analyzeBatch       → downloads images, calls CloudBase AI vision model (hy3-preview)
    ├─ getAnalysisProgress→ lightweight read on analysisTasks
    ├─ generatePaper      → AI (deepseek-v4-flash) generates questions → pdfkit renders A4 PDF
    ├─ generateReportPDF  → renders diagnosis report PDF, writes back reports.pdfFileId
    ├─ studentAccess      → family member invites + owner-only family management
    └─ studentData        → access-aware reads of student/report/paper/timeline
```

### Cross-cutting patterns (read multiple files before changing these)

- **Server trigger + client polling**: `uploadAndAnalyze` creates the report then starts `analyzePhotos` fire-and-forget; the client returns immediately and relies on polling. Frontend polling builds on the generic `miniprogram/utils/poller.js` (`createPoller`), wrapped by `miniprogram/utils/analysis-poller.js` which classifies analysis state (waiting / in-progress / completed / failed / timeout, including stale-task detection). `subject-home` and `report` pages use this wrapper.
- **Batch pipeline + OCR dedup**: `analyzePhotos` splits images into batches of 5 and processes them serially via `analyzeBatch`, writing progress to `analysisTasks.completedBatches`. The orchestration is split into `analyzePhotos/pipeline.js`; cross-batch and cross-historical-report deduplication lives in `analyzePhotos/photo-dedup.js`.
- **Centralized access control**: `cloudfunctions/_shared/access.js` is the single source of permission checks (`getStudentAccess`, `getLearningResourceAccess`). Every cloud function that touches a student or learning resource must go through it. Co-parents (invited `studentMembers` with role) can operate learning workflows (upload, generate papers, retry analysis, read/download reports); **family-member management stays owner-only**.
- **Bottleneck naming**: Internal IDs are LP-style codes (`LP-001`–`LP-010` math, `LP-101`–`LP-104` Chinese, `LP-201`–`LP-204` English). User-facing surfaces (UI, PDF, report) must show readable summaries like "计算基础" / "审题理解", never raw LP codes. The mapping + alias normalization lives in **two parallel copies** that must stay in sync: `miniprogram/utils/bottleneck-name.js` and `cloudfunctions/_shared/bottleneck-name.js`.
- **Subject constants**: `miniprogram/utils/constants.js` and `cloudfunctions/_shared/constants.js` define the three subjects (math / chinese / english), their display names, codes, and colors. The frontend copy additionally carries short names and per-subject color tokens.
- **Presenter split**: Heavy pages keep UI in `<page>.js` and extract testable logic into `<page>-presenter.js` (see `index`, `upload-history`, `paper-preview`, `report`, `subject-home`). Presenters are plain JS with no `wx` dependency so they can be unit-tested directly.
- **Data access layer**: `miniprogram/utils/cloud.js` wraps `wx.cloud.callFunction` (expecting a `{success, data, error}` envelope — `success === false` throws) and also exposes direct DB reads. Pages and other utils call through it rather than hitting `wx.cloud` directly.
- **PDF generation**: `pdfkit` runs inside cloud functions using a bundled `NotoSansCJKsc-Regular.otf`. A missing font must fail loudly, not produce garbled Chinese.

### Database collections

`students`, `studentMembers` (owner/co-parent access), `studentInvites` (one-time join tokens), `subjectProfiles` (per-subject bottleneck tracking + analysis status), `reports` (diagnosis/verification, with `bottlenecks[]`, `errorDetails[]`, `pdfFileId`), `papers` (generated/default, with `paperKey` for default-paper caching), `analysisTasks` (async job progress). Full schema in `docs/DATA_DICTIONARY.md`.

## Conventions

- `cloudfunctions_old_backup/` is deprecated — do not import from it or use as a reference.
- Cloud function envelopes follow `{success, data, error}`; throw on `success === false` from the client wrapper.
- When adding a subject, subject color, or bottleneck code, update **both** the `_shared/` (backend) and `miniprogram/utils/` (frontend) copies of the relevant constants/mapping file.
- Chinese PDF fonts are bundled inside the cloud function directories — do not configure `FONT_FILE_ID` or external font paths.

## Known gaps

- `analyzePhotos/sendNotification()` is a no-op; the WeChat subscribe-message template has not been applied for, so users get no push on completion (rely on polling + manual retry).
- Default-paper caching (`default-paper.js`) is keyed per-student; cross-student reuse of the same grade/A-B template is not implemented.
- A bottleneck is marked "improved" when a verification upload surfaces no errors for it — the system does not yet distinguish correct answers from blank/ambiguous/OCR-missed responses.

## Reference docs

- `PRD.md` — product requirements (v2.2)
- `PROJECT_PLAN.md` — architecture, data models, progress tracker
- `SETUP.md` — deployment (env, DB setup, font upload)
- `docs/ARCHITECTURE.md`, `docs/CLOUD_FUNCTIONS.md`, `docs/DATA_DICTIONARY.md`, `docs/TESTING.md`, `docs/TROUBLESHOOTING.md`, `docs/TEST_MATRIX.md`

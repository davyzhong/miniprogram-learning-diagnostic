# Parent Management and Time-Aware Bottlenecks Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a lightweight parent-management model where multiple WeChat accounts can view one child profile, while adding time-aware evidence and bottleneck trend tracking for uploaded photos and verification papers.

**Architecture:** Add access-aware cloud functions as the read boundary for shared child data, keep owner-only write operations, and store time semantics directly on reports, image files, papers, verification evidence, and subject profile bottlenecks. Frontend pages become role-aware: owners can manage and act; viewers can read the same child profile.

**Tech Stack:** WeChat Mini Program, WeChat CloudBase database/cloud functions/cloud storage, Node.js cloud functions, existing `node --test` test suite, PDFKit-based PDF generation.

---

## Product Direction

This plan combines two related product changes:

1. **Parent management**
   One child profile can be connected to multiple parent WeChat accounts. Another parent scans an invite and joins the same child profile with read-only permission.

2. **Time-aware learning bottlenecks**
   Uploaded photos, verification papers, and verification feedback become time-stamped evidence. The system can show whether a learning bottleneck is newly found, still frequent, declining, improved, or recurring.

These should be implemented together because both change the meaning of the child profile:

```text
Child profile = shared family learning record + time-series learning evidence
```

## MVP Scope

### In Scope

- Add `studentMembers` and `studentInvites` data models.
- Add lightweight parent management pages:
  - `pages/parent-management/parent-management`
  - `pages/join-student/join-student`
- Let another parent scan or open an invite and join as `viewer`.
- Viewer can read:
  - learning profile home
  - subject home
  - report detail
  - paper preview
  - learning timeline
  - upload history photos/OCR summaries
- Viewer cannot write:
  - upload photos
  - generate papers
  - retry analysis
  - invite/remove parents
  - delete or edit child profile
- Store photo upload time.
- Store verification paper date and render it prominently in the PDF.
- Store bottleneck trend/weight fields on subject profile bottlenecks.
- Update learning timeline to display evidence time clearly.

### Out of Scope

- Full family workspace.
- Multi-admin role transfer.
- Viewer/editor write permission.
- Manual correction of historical paper dates.
- AI-based trend modeling.
- Anonymous external web report sharing.
- Batch data migration.

## Key Product Decisions

### Parent Management

Use a lightweight child-level parent model:

```text
students._id
  -> studentMembers[]
      owner
      viewer
```

Do not copy student records, reports, photos, or papers for the second parent.

### Time Semantics

Use explicit terms:

| Concept | Field | Meaning |
| --- | --- | --- |
| Photo upload time | `imageFiles[].uploadedAt` | When the photo entered the system. This is the only time used for uploaded photos. |
| Report evidence time | `reports.evidenceTime` | The time represented by this report's evidence. First version equals upload/report creation time. |
| Verification paper date | `papers.paperDate` | Date printed prominently on the paper. Defaults to generation date. |
| Paper generation time | `papers.generatedAt` | Exact generation timestamp. |
| Verification upload time | `reports.verificationUploadedAt` | Time a completed verification answer sheet was uploaded. |
| Bottleneck first seen | `currentBottlenecks[].firstSeenAt` | First effective report that observed the bottleneck. |
| Bottleneck last seen | `currentBottlenecks[].lastSeenAt` | Latest diagnosis evidence where it appeared. |
| Bottleneck last verified | `currentBottlenecks[].lastVerifiedAt` | Latest verification evidence for this bottleneck. |
| Bottleneck last passed | `currentBottlenecks[].lastPassedAt` | Latest full and all-correct verification. |
| Bottleneck weight | `currentBottlenecks[].weight` | Simple priority score used for sorting. |
| Bottleneck trend | `currentBottlenecks[].trend` | `new` / `persisting` / `declining` / `improved` / `recurring`. |

## File Structure

### New Cloud Functions

Create:

- `cloudfunctions/studentAccess/index.js`
  - Handles parent-management operations:
    - `getAccessibleStudents`
    - `listMembers`
    - `createInvite`
    - `getInvite`
    - `acceptInvite`
    - `revokeMember`

- `cloudfunctions/studentData/index.js`
  - Handles access-aware read operations:
    - `getStudentDashboard`
    - `getSubjectDashboard`
    - `getLearningTimeline`
    - `getReportDetail`
    - `getPaperDetail`

Rationale:

- Keep direct frontend reads from leaking or failing across `_openid` boundaries.
- Keep shared-data access in cloud functions where current openid can be checked.
- Avoid many tiny cloud functions while the MVP is still evolving.

### Existing Cloud Functions to Modify

- `cloudfunctions/uploadAndAnalyze/index.js`
  - Add owner access check.
  - Add `imageFiles[].uploadedAt`.
  - Add `reports.evidenceTime`.
  - Add `reports.verificationUploadedAt` for verification uploads.

- `cloudfunctions/analyzePhotos/index.js`
  - Preserve `uploadedAt` when enriching image metadata.
  - Pass report evidence time into profile summary.
  - Store time-aware bottleneck fields from profile summary.

- `cloudfunctions/analyzePhotos/profile-summary.js`
  - Add simple weight/trend update rules.
  - Preserve first/last seen and verification timestamps.

- `cloudfunctions/generatePaper/index.js`
  - Add owner access check.
  - Add `paperDate` and `generatedAt`.
  - Pass paper date to PDF renderer.
  - Return `paperDate` in cloud function result.

- `cloudfunctions/generatePaper/pdf-renderer.js`
  - Render date prominently in student pages and answer pages.

- `cloudfunctions/generateReportPDF/index.js`
  - Allow read access for active viewer if PDF already exists or if generation is allowed.
  - Recommended MVP: owner can generate; viewer can download existing PDF through `studentData.getReportDetail`.

- `cloudfunctions/getAnalysisProgress/index.js`
  - Keep owner-only or active-member read depending on whether viewer can see analyzing progress.
  - Recommended MVP: active member can read progress; only owner can retry.

### Frontend Utilities to Modify

- `miniprogram/utils/cloud.js`
  - Add wrappers for `studentAccess` and `studentData`.
  - Route shared read pages through access-aware cloud functions.
  - Keep owner-only actions calling existing write functions.

- `miniprogram/utils/util.js`
  - Add date formatting helpers if missing:
    - `formatPaperDate`
    - `formatTimelineDateTime`
    - `formatTrendText`

### New Pages

Create:

- `miniprogram/pages/parent-management/parent-management.{js,wxml,wxss,json}`
- `miniprogram/pages/join-student/join-student.{js,wxml,wxss,json}`

Register them in:

- `miniprogram/app.json`

### Existing Pages to Modify

- `miniprogram/pages/index/index.js`
- `miniprogram/pages/index/index-presenter.js`
- `miniprogram/pages/index/index.wxml`
- `miniprogram/pages/subject-home/subject-home.js`
- `miniprogram/pages/subject-home/subject-home-presenter.js`
- `miniprogram/pages/subject-home/subject-home.wxml`
- `miniprogram/pages/report/report.js`
- `miniprogram/pages/report/report-presenter.js`
- `miniprogram/pages/report/report.wxml`
- `miniprogram/pages/upload-history/upload-history.js`
- `miniprogram/pages/upload-history/upload-history.wxml`
- `miniprogram/pages/paper-preview/paper-preview.js`
- `miniprogram/pages/paper-preview/paper-preview.wxml`
- `miniprogram/pages/upload/upload.js`
- `miniprogram/pages/generate-verification/generate-verification.js`
- `miniprogram/pages/default-paper/default-paper.js`

### Tests to Modify or Add

Add:

- `tests/student-access.test.js`
- `tests/student-data-access.test.js`
- `tests/time-aware-bottlenecks.test.js`
- `tests/parent-management-page-flows.test.js`

Modify:

- `tests/cloud-functions.test.js`
- `tests/contracts.test.js`
- `tests/generate-paper-pdf.test.js`
- `tests/index-presenter.test.js`
- `tests/page-flows.test.js`
- `tests/profile-summary.test.js`
- `tests/subject-home-presenter.test.js`
- `tests/upload-history` coverage inside `page-flows.test.js` or new focused test.

Update:

- `package.json`
  - Ensure new tests are included in `npm test`.

### Docs to Update

- `docs/DATA_DICTIONARY.md`
- `docs/ARCHITECTURE.md`
- `docs/CLOUD_FUNCTIONS.md`
- `docs/TEST_MATRIX.md`
- `docs/TESTING.md`

## Page Design

### 1. Learning Profile Home

Owner view:

- Header:
  - child name
  - grade
  - latest update
  - `家长管理` entry
- Latest diagnosis card:
  - latest diagnosis headline
  - evidence time
  - top bottlenecks with trend labels
  - primary action: `查看报告`
  - secondary action: `生成验证卷`
- Bottleneck trend strip:
  - `持续出现`
  - `下降中`
  - `已改善`
- Recent timeline:
  - report
  - generated paper
  - verification upload
  - bottleneck weight update

Viewer view:

- Same readable content.
- Replace owner actions with read-only actions:
  - `查看报告`
  - `查看学习记录`
  - `查看验证卷`
- Hide:
  - upload
  - generate paper
  - retry analysis
  - parent invite/remove

### 2. Parent Management Page

Route:

```text
pages/parent-management/parent-management?studentId=xxx
```

Owner state:

- Child summary card:
  - name
  - grade
  - member count
- Member list:
  - `我 · 创建者 / 管理员`
  - other parents as `查看权限`
- Primary action:
  - `邀请另一位家长`
- Invite card after creation:
  - QR code or share card
  - expires date
  - status

Viewer state:

- Child summary.
- Current permission:
  - `你正在以家长身份查看该孩子档案`
- No invite/remove buttons.

### 3. Join Student Page

Route:

```text
pages/join-student/join-student?inviteId=xxx&token=yyy
```

States:

- Loading invite.
- Valid invite:
  - child name
  - grade
  - inviter display
  - readable content list
  - button: `确认加入`
- Already joined:
  - button: `进入学习档案`
- Expired/revoked/invalid:
  - clear explanation
  - button: `返回首页`

### 4. Subject Home

Owner:

- Latest subject diagnosis card.
- Bottleneck queue with trend labels:
  - `新增`
  - `持续出现`
  - `下降中`
  - `已改善`
  - `反复出现`
- Owner actions:
  - upload
  - generate verification paper
  - default paper

Viewer:

- Same latest diagnosis and trend cards.
- Read-only tools:
  - report list
  - learning timeline
  - paper preview

### 5. Verification Paper PDF

Student page header:

```text
学习卡点验证卷
2026年6月13日
姓名 ________   用时 ________
```

Rules:

- Date is large, bold, centered.
- Date appears on answer page as well.
- `paperDate` should be the date displayed in preview and PDF.
- If paper has multiple student pages, continuation pages include title and paper date.

### 6. Paper Preview

Add:

- `试卷日期：2026年6月13日`
- `生成时间：09:40`
- `覆盖卡点：计算基础、审题理解`

### 7. Upload Page

Add user-facing clarification:

```text
照片将按上传时间记录到学习档案。
如果上传的是历史试卷，系统仍以本次上传时间作为证据时间。
```

Keep it short; this is a confidence note, not a long instruction.

### 8. Learning Timeline

Add clearer event labels:

- `上传诊断照片`
  - time = photo/report upload time
- `生成验证试卷`
  - time = `generatedAt`
  - show `paperDate`
- `上传验证作答`
  - time = verification upload time
- `卡点状态更新`
  - time = profile applied time
  - show trend changes

Derived timeline remains the strategy; no separate `learningEvents` collection in this phase.

## Bottleneck Weight Rules

Use simple deterministic rules first.

### Suggested Fields

Each `currentBottlenecks[]` item:

```js
{
  lpCode,
  lpName,
  severity,
  status,
  firstSeenAt,
  lastSeenAt,
  lastVerifiedAt,
  lastPassedAt,
  lastFailedVerificationAt,
  evidenceCount,
  recentErrorCount,
  verificationPassCount,
  verificationFailCount,
  weight,
  trend,
  sourceReportId
}
```

### Weight Updates

Start each newly found bottleneck with base weight:

```text
high: 80
medium: 55
low: 35
```

Diagnosis report:

- If bottleneck appears in unique recent pages:
  - `lastSeenAt = report.evidenceTime`
  - `recentErrorCount += errorCount`
  - `weight += min(15, errorCount * 3)`
  - `trend = 'new'` if first seen, else `persisting`

Verification report:

- If complete and all correct:
  - `lastVerifiedAt = report.evidenceTime`
  - `lastPassedAt = report.evidenceTime`
  - `verificationPassCount += 1`
  - `weight -= 20`
  - If `verificationPassCount >= 2`, `trend = 'improved'`
  - Else `trend = 'declining'`
- If complete but has incorrect answers:
  - `lastVerifiedAt = report.evidenceTime`
  - `lastFailedVerificationAt = report.evidenceTime`
  - `verificationFailCount += 1`
  - `weight += 10`
  - `trend = 'persisting'`

Recurring rule:

- If a bottleneck with `trend = 'improved'` appears again in a later diagnosis:
  - `trend = 'recurring'`
  - `weight = max(weight, 60)`

Clamp:

```text
weight: 0..100
```

Sorting:

```text
weight desc, then lastSeenAt desc
```

## Implementation Tasks

### Task 1: Add Access Data Contracts and Tests

**Files:**
- Create: `tests/student-access.test.js`
- Modify: `docs/DATA_DICTIONARY.md`
- Modify: `docs/CLOUD_FUNCTIONS.md`

- [ ] **Step 1: Write failing tests for access contracts**

Cover:

- owner has access through `students._openid`.
- viewer has access through `studentMembers`.
- revoked member has no access.
- non-member has no access.
- viewer cannot perform owner-only action.

- [ ] **Step 2: Run test to verify it fails**

Run:

```bash
node --test tests/student-access.test.js
```

Expected: FAIL because access helpers/functions do not exist.

- [ ] **Step 3: Implement `studentAccess` cloud function**

Create:

```text
cloudfunctions/studentAccess/index.js
```

Support actions:

```js
{
  action: 'getAccessibleStudents'
}

{
  action: 'listMembers',
  studentId
}

{
  action: 'createInvite',
  studentId
}

{
  action: 'getInvite',
  inviteId,
  token
}

{
  action: 'acceptInvite',
  inviteId,
  token
}

{
  action: 'revokeMember',
  studentId,
  memberOpenId
}
```

- [ ] **Step 4: Run focused tests**

```bash
node --test tests/student-access.test.js
```

Expected: PASS.

- [ ] **Step 5: Update data dictionary**

Document:

- `studentMembers`
- `studentInvites`

- [ ] **Step 6: Commit**

```bash
git add cloudfunctions/studentAccess/index.js tests/student-access.test.js docs/DATA_DICTIONARY.md docs/CLOUD_FUNCTIONS.md
git commit -m "feat: add lightweight parent access contracts"
```

### Task 2: Add Access-Aware Student Data Reads

**Files:**
- Create: `cloudfunctions/studentData/index.js`
- Create: `tests/student-data-access.test.js`
- Modify: `miniprogram/utils/cloud.js`

- [ ] **Step 1: Write failing tests for shared read access**

Cover:

- viewer can read dashboard for joined child.
- viewer can read report detail.
- viewer can read paper detail.
- viewer can read timeline.
- non-member cannot read any child data.

- [ ] **Step 2: Implement `studentData` cloud function**

Actions:

```js
getStudentDashboard
getSubjectDashboard
getLearningTimeline
getReportDetail
getPaperDetail
```

All actions must check:

```text
owner OR active student member
```

- [ ] **Step 3: Return role-aware payloads**

Every top-level payload should include:

```js
{
  role,
  permissions: {
    canView: true,
    canManageParents,
    canUpload,
    canGeneratePaper,
    canRetryAnalysis
  }
}
```

- [ ] **Step 4: Add frontend wrappers**

In `miniprogram/utils/cloud.js`, add:

```js
getAccessibleStudents()
getStudentDashboard(studentId)
getSubjectDashboard(studentId, subject)
getLearningTimeline({ studentId, subject })
getReportDetail(reportId)
getPaperDetail(paperId)
```

- [ ] **Step 5: Run focused tests**

```bash
node --test tests/student-data-access.test.js
```

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add cloudfunctions/studentData/index.js miniprogram/utils/cloud.js tests/student-data-access.test.js
git commit -m "feat: add access-aware student data reads"
```

### Task 3: Add Parent Management Pages

**Files:**
- Create: `miniprogram/pages/parent-management/parent-management.js`
- Create: `miniprogram/pages/parent-management/parent-management.wxml`
- Create: `miniprogram/pages/parent-management/parent-management.wxss`
- Create: `miniprogram/pages/parent-management/parent-management.json`
- Create: `miniprogram/pages/join-student/join-student.js`
- Create: `miniprogram/pages/join-student/join-student.wxml`
- Create: `miniprogram/pages/join-student/join-student.wxss`
- Create: `miniprogram/pages/join-student/join-student.json`
- Modify: `miniprogram/app.json`
- Create/Modify: `tests/parent-management-page-flows.test.js`

- [ ] **Step 1: Write page-flow tests**

Cover:

- owner sees invite button.
- viewer does not see invite button.
- valid invite renders child summary.
- accepted invite navigates to index/student profile.
- invalid invite shows error state.

- [ ] **Step 2: Register pages in `app.json`**

Add:

```json
"pages/parent-management/parent-management",
"pages/join-student/join-student"
```

- [ ] **Step 3: Implement parent-management page**

Main sections:

- child summary
- member list
- invite action
- invite result card

- [ ] **Step 4: Implement join-student page**

Main states:

- loading
- valid invite
- already joined
- invalid/expired
- success

- [ ] **Step 5: Run focused tests**

```bash
node --test tests/parent-management-page-flows.test.js
```

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add miniprogram/app.json miniprogram/pages/parent-management miniprogram/pages/join-student tests/parent-management-page-flows.test.js
git commit -m "feat: add parent management pages"
```

### Task 4: Make Existing Pages Role-Aware

**Files:**
- Modify: `miniprogram/pages/index/index.js`
- Modify: `miniprogram/pages/index/index-presenter.js`
- Modify: `miniprogram/pages/index/index.wxml`
- Modify: `miniprogram/pages/subject-home/subject-home.js`
- Modify: `miniprogram/pages/subject-home/subject-home-presenter.js`
- Modify: `miniprogram/pages/subject-home/subject-home.wxml`
- Modify: `miniprogram/pages/report/report.js`
- Modify: `miniprogram/pages/report/report.wxml`
- Modify: `tests/index-presenter.test.js`
- Modify: `tests/subject-home-presenter.test.js`
- Modify: `tests/page-flows.test.js`

- [ ] **Step 1: Write failing tests for viewer UI**

Cover:

- viewer sees joined child on homepage.
- viewer does not see upload/generate/retry actions.
- viewer can navigate to report and timeline.
- owner sees parent-management entry.

- [ ] **Step 2: Update index loading**

Use:

```js
cloud.getAccessibleStudents()
cloud.getStudentDashboard(activeStudentId)
```

instead of direct owner-only student/report aggregation.

- [ ] **Step 3: Update subject-home loading**

Use:

```js
cloud.getSubjectDashboard(studentId, subject)
```

and hide write tools when permissions disallow them.

- [ ] **Step 4: Update report loading**

Use:

```js
cloud.getReportDetail(reportId)
```

and hide retry/generate actions for viewer.

- [ ] **Step 5: Run focused tests**

```bash
node --test tests/index-presenter.test.js tests/subject-home-presenter.test.js tests/page-flows.test.js
```

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add miniprogram/pages/index miniprogram/pages/subject-home miniprogram/pages/report tests/index-presenter.test.js tests/subject-home-presenter.test.js tests/page-flows.test.js
git commit -m "feat: make learning pages role aware"
```

### Task 5: Add Photo and Report Evidence Time

**Files:**
- Modify: `cloudfunctions/uploadAndAnalyze/index.js`
- Modify: `cloudfunctions/analyzePhotos/index.js`
- Modify: `tests/cloud-functions.test.js`
- Modify: `docs/DATA_DICTIONARY.md`

- [ ] **Step 1: Write failing tests**

Cover:

- `imageFiles[].uploadedAt` is stored on initial report creation.
- `uploadedAt` is preserved after analysis enriches image metadata.
- `reports.evidenceTime` exists.
- verification upload stores `verificationUploadedAt`.

- [ ] **Step 2: Update uploadAndAnalyze**

Set a single upload timestamp:

```js
const uploadedAt = new Date()
```

Use it for:

```js
imageFiles[].uploadedAt
report.createdAt
report.evidenceTime
report.verificationUploadedAt // only for verification reports
```

- [ ] **Step 3: Update analyzePhotos**

When rebuilding `imageFiles`, preserve:

```js
uploadedAt: initial.uploadedAt || report.evidenceTime || report.createdAt
```

- [ ] **Step 4: Run focused tests**

```bash
node --test tests/cloud-functions.test.js
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add cloudfunctions/uploadAndAnalyze/index.js cloudfunctions/analyzePhotos/index.js tests/cloud-functions.test.js docs/DATA_DICTIONARY.md
git commit -m "feat: track evidence time for uploaded photos"
```

### Task 6: Add Verification Paper Dates to Data and PDF

**Files:**
- Modify: `cloudfunctions/generatePaper/index.js`
- Modify: `cloudfunctions/generatePaper/pdf-renderer.js`
- Modify: `miniprogram/pages/paper-preview/paper-preview.js`
- Modify: `miniprogram/pages/paper-preview/paper-preview.wxml`
- Modify: `tests/generate-paper-pdf.test.js`
- Modify: `tests/page-flows.test.js`
- Modify: `docs/DATA_DICTIONARY.md`

- [ ] **Step 1: Write failing PDF tests**

Cover:

- generated PDF contains a large visible paper date.
- `generatePaper` returns `paperDate`.
- saved paper stores `paperDate` and `generatedAt`.
- paper preview displays paper date.

- [ ] **Step 2: Update generatePaper**

Set:

```js
const generatedAt = new Date()
const paperDate = formatDateKey(generatedAt)
```

Save:

```js
generatedAt,
paperDate
```

Return:

```js
paperDate,
generatedAt
```

- [ ] **Step 3: Update PDF renderer**

Change:

```js
generatePDF(questionsData, subject, type)
```

to accept:

```js
generatePDF(questionsData, subject, type, { paperDate })
```

Render date prominently under the title on:

- first student page
- continuation pages
- answer page

- [ ] **Step 4: Update paper preview**

Display:

```text
试卷日期：2026年6月13日
```

- [ ] **Step 5: Run focused tests**

```bash
node --test tests/generate-paper-pdf.test.js tests/page-flows.test.js
```

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add cloudfunctions/generatePaper miniprogram/pages/paper-preview tests/generate-paper-pdf.test.js tests/page-flows.test.js docs/DATA_DICTIONARY.md
git commit -m "feat: print verification paper dates"
```

### Task 7: Add Time-Aware Bottleneck Trend Rules

**Files:**
- Modify: `cloudfunctions/analyzePhotos/profile-summary.js`
- Modify: `cloudfunctions/analyzePhotos/index.js`
- Create: `tests/time-aware-bottlenecks.test.js`
- Modify: `tests/profile-summary.test.js`
- Modify: `docs/DATA_DICTIONARY.md`

- [ ] **Step 1: Write failing trend tests**

Cover:

- new diagnosis creates `trend = 'new'`.
- repeated diagnosis creates `trend = 'persisting'`.
- one passed verification creates `trend = 'declining'`.
- two passed verifications create `trend = 'improved'`.
- improved bottleneck seen again creates `trend = 'recurring'`.
- weights clamp to `0..100`.

- [ ] **Step 2: Extend profile summary model**

Add fields:

```js
firstSeenAt
lastSeenAt
lastVerifiedAt
lastPassedAt
lastFailedVerificationAt
evidenceCount
recentErrorCount
verificationPassCount
verificationFailCount
weight
trend
```

- [ ] **Step 3: Implement deterministic update rules**

Use the rules in this plan. Do not call AI.

- [ ] **Step 4: Update analyzePhotos caller**

Pass:

```js
report.evidenceTime || report.createdAt
```

as the effective evidence time.

- [ ] **Step 5: Run focused tests**

```bash
node --test tests/time-aware-bottlenecks.test.js tests/profile-summary.test.js
```

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add cloudfunctions/analyzePhotos tests/time-aware-bottlenecks.test.js tests/profile-summary.test.js docs/DATA_DICTIONARY.md
git commit -m "feat: track time-aware bottleneck trends"
```

### Task 8: Update Timeline and Report UI for Time

**Files:**
- Modify: `miniprogram/pages/upload-history/upload-history.js`
- Modify: `miniprogram/pages/upload-history/upload-history.wxml`
- Modify: `miniprogram/pages/upload-history/upload-history.wxss`
- Modify: `miniprogram/pages/report/report-presenter.js`
- Modify: `miniprogram/pages/report/report.wxml`
- Modify: `tests/page-flows.test.js`
- Modify: `tests/report-presenter.test.js`

- [ ] **Step 1: Write failing timeline tests**

Cover:

- upload event uses `uploadedAt`/`evidenceTime`.
- paper event shows `paperDate`.
- verification report shows upload time and pass/fail evidence.
- synthetic bottleneck update event appears when `changeSummary` or profile-applied report exists.

- [ ] **Step 2: Update upload-history event builders**

Use:

```js
report.evidenceTime || report.createdAt
paper.generatedAt || paper.createdAt
```

Add chips:

```text
证据时间 6月13日 20:10
试卷日期 6月13日
```

- [ ] **Step 3: Update report presenter**

Add:

```js
evidenceTimeText
trendSummaryText
```

- [ ] **Step 4: Update WXML**

Show evidence time near report header:

```text
证据时间：2026年6月13日 20:10
```

- [ ] **Step 5: Run focused tests**

```bash
node --test tests/page-flows.test.js tests/report-presenter.test.js
```

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add miniprogram/pages/upload-history miniprogram/pages/report tests/page-flows.test.js tests/report-presenter.test.js
git commit -m "feat: show time-aware learning timeline"
```

### Task 9: Update Owner-Only Write Guards

**Files:**
- Modify: `cloudfunctions/uploadAndAnalyze/index.js`
- Modify: `cloudfunctions/generatePaper/index.js`
- Modify: `cloudfunctions/generateReportPDF/index.js`
- Modify: `cloudfunctions/getAnalysisProgress/index.js`
- Modify: `tests/cloud-functions.test.js`
- Modify: `tests/contracts.test.js`

- [ ] **Step 1: Write failing permission tests**

Cover:

- viewer cannot upload.
- viewer cannot generate paper.
- viewer cannot retry analysis.
- viewer can read progress if product keeps it visible.
- non-member cannot access anything.

- [ ] **Step 2: Add owner checks to write functions**

For each write function, verify:

```text
student._openid === currentOpenId
OR active studentMembers role === owner
```

- [ ] **Step 3: Keep error messages user-safe**

Return:

```text
无权执行该操作
```

Do not expose stack traces.

- [ ] **Step 4: Run focused tests**

```bash
node --test tests/cloud-functions.test.js tests/contracts.test.js
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add cloudfunctions tests/cloud-functions.test.js tests/contracts.test.js
git commit -m "fix: enforce owner-only write operations"
```

### Task 10: Final Integration and DevTools Smoke Test

**Files:**
- Modify: `docs/ARCHITECTURE.md`
- Modify: `docs/TEST_MATRIX.md`
- Modify: `docs/TESTING.md`
- Modify: `package.json` if test list changed.

- [ ] **Step 1: Run full local verification**

```bash
npm run verify
```

Expected:

```text
0 failed
Checked JavaScript files
```

- [ ] **Step 2: Run WeChat DevTools preview**

```bash
/Applications/wechatwebdevtools.app/Contents/MacOS/cli preview --project "/Users/qiming/Downloads/GoogleDrive/AI Learning/miniprogram-learning-diagnostic" --qr-format terminal --lang zh
```

Expected:

```text
✔ preview
```

- [ ] **Step 3: Manual/automated smoke checklist**

Check:

- owner sees child profile.
- owner opens parent management.
- owner creates invite.
- viewer accepts invite.
- viewer sees child profile.
- viewer cannot upload/generate.
- owner generates verification paper with large date.
- verification answer upload updates bottleneck trend.
- learning timeline shows evidence time.

- [ ] **Step 4: Update docs**

Update:

- architecture overview
- data dictionary
- cloud function list
- test matrix
- setup/deployment notes

- [ ] **Step 5: Commit**

```bash
git add docs package.json
git commit -m "docs: document parent management and time-aware bottlenecks"
```

## Suggested Execution Order

Recommended order:

1. Access model and tests.
2. Access-aware read functions.
3. Parent management pages.
4. Role-aware existing pages.
5. Photo/report evidence time.
6. Verification paper date in PDF.
7. Bottleneck trend rules.
8. Timeline/report time UI.
9. Owner-only write guards.
10. Full verification and docs.

This order keeps the app usable after each phase and avoids mixing permission changes with trend algorithm changes too early.

## Risks and Mitigations

### Risk: Shared reads are inconsistent if some pages still directly query collections

Mitigation:

- Route all shared-read pages through `studentData`.
- Add contract tests that grep for direct `reports`/`papers` reads in pages where shared access matters.

### Risk: PDF date and upload evidence time are confused

Mitigation:

- Use `paperDate` only for generated verification paper date.
- Use `uploadedAt` only for photos.
- Use `evidenceTime` as report-level display time.

### Risk: Viewer accidentally triggers writes

Mitigation:

- Hide write actions in UI.
- Enforce owner-only checks in cloud functions.
- Test both UI and backend permissions.

### Risk: Trend rules feel too algorithmic too early

Mitigation:

- Keep the first version deterministic and explainable.
- Display trend labels softly:
  - `下降中`
  - `持续出现`
  - `已改善`
  - `反复出现`
- Avoid showing raw `weight` to parents.

## Acceptance Criteria

- A second parent can join a child profile through an invite and see the same child data.
- Viewer cannot perform owner-only actions.
- Uploaded photos store and display upload/evidence time.
- Verification paper PDFs show a large bold date.
- Verification paper records store `paperDate` and `generatedAt`.
- Subject profile bottlenecks contain time/trend/weight fields.
- Timeline shows reports, papers, verification uploads, and bottleneck changes with clear dates.
- Existing single-owner flow still works.
- `npm run verify` passes.
- WeChat DevTools preview passes.


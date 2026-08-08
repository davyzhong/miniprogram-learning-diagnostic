# Learning Record Display Taxonomy Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Rebuild all learning-record-facing surfaces around a four-level display taxonomy so parents see the same learning milestones, paper codes, evidence folding, and transient-state language across the app.

**Architecture:** Keep the existing derived timeline model; do not add a new event collection or database migration. Add a shared presentation layer that classifies existing reports, papers, and photo evidence into main records, folded evidence rows, compact status rows, and hidden tool history. Use that same display contract on the learning record page, home recent records, subject home, report detail, verification generation, and paper workbench so the experience stays consistent instead of becoming a one-page redesign.

**Tech Stack:** WeChat Mini Program WXML/WXSS/JS, existing `utils/cloud.js` data wrappers, CloudBase-derived reports/papers data, Node.js built-in test runner, existing page harness, WeChat DevTools automator.

---

## Scope

This iteration includes:

- A shared learning-record display contract used by all learning-record-facing pages.
- Learning record display taxonomy:
  - Main records: diagnosis report, verification paper, verification feedback.
  - Folded evidence: original photos/OCR, answer upload photos, duplicate indicators.
  - Compact status rows: analyzing, failed, timeout, upload/analysis retry states.
  - Hidden or secondary tool history: default diagnostic paper generation, PDF download/share, generation failure.
- A denser learning record page layout.
- Verification-paper unique code shown wherever the verification paper appears.
- Verification-paper unique code shown in related report, timeline, workbench, and upload/feedback contexts.
- Category-level filter chips: all, diagnosis report, verification paper, verification feedback.
- Visual polish: category color bars, compact text icons, top summary illustration, denser chips.
- Tests for classification, filtering, folded evidence, and DevTools flow.

This iteration excludes:

- New backend collections.
- Full paper/report detail redesign beyond existing navigation.
- New analytics/trend calculations.
- Showing default diagnostic paper generation in the main timeline.
- Turning transient states into permanent standalone history cards.

---

## Display Taxonomy

### Level 1: Main Cards

These appear as independent cards in the learning record timeline:

- `diagnosis-report`
  - Source: completed diagnosis reports.
  - Purpose: learning judgment.
  - Required display: title, summary, readable bottlenecks, related error count, evidence photo count, action to report.

- `verification-paper`
  - Source: generated verification papers.
  - Purpose: next action / printable verification artifact.
  - Required display: unique paper code, covered bottlenecks, question count, page count, status relative to answer upload or feedback.

- `verification-report`
  - Source: completed verification reports.
  - Purpose: feedback result.
  - Required display: improvement summary, associated paper code, improved/persisting counts, action to report.

### Level 2: Folded Evidence Rows

These do not become standalone cards. They are rendered inside the nearest related main card:

- Original paper photos and OCR summaries under `diagnosis-report`.
- Verification answer upload photos under the associated `verification-paper` or `verification-report`.
- Duplicate photo indicators as chips on photo rows.

### Level 3: Compact Status Rows

These are not full cards. They appear as compact state strips under the associated card, or as one small day-level status strip if no completed main card exists yet:

- `analyzing`
- `failed`
- `timeout`
- upload retry state
- analysis retry state

### Level 4: Hidden / Secondary Tool History

These do not appear in the main learning record timeline by default:

- Default diagnostic paper generation.
- PDF download/share actions.
- Paper generation failure.

If a default diagnostic paper later produces an uploaded answer and a diagnosis report, the resulting diagnosis report enters the main timeline.

---

## File Map

### Primary Page

- Create: `miniprogram/utils/learning-records.js`
  - Own shared presentation rules for record kind, display level, paper code, readable bottleneck labels, folded evidence, status rows, and low-frequency suppression.
  - Export pure helpers that can be tested without a page harness.

- Modify: `miniprogram/pages/upload-history/upload-history.js`
  - Use shared record display helpers.
  - Build main events, folded evidence, and compact status rows.
  - Exclude low-frequency tool events from main timeline.
  - Add category filter counts.

- Modify: `miniprogram/pages/upload-history/upload-history.wxml`
  - Replace current large event card with dense main-card layout.
  - Render folded evidence rows under reports and papers.
  - Render compact status strips.
  - Add category filter chips.

- Modify: `miniprogram/pages/upload-history/upload-history.wxss`
  - Add high-density card styles, visual icons, category colors, folded rows, status strips, and compact metrics.

### Cross-Page Display Consistency

- Modify: `miniprogram/pages/index/index-presenter.js`
  - Ensure recent record summaries use the same paper-code language and category naming.
  - Do not surface default diagnostic paper generation as a main recent learning record unless it produced a diagnosis report.

- Modify: `miniprogram/pages/subject-home/subject-home-presenter.js`
  - Ensure subject-home latest diagnosis, in-progress analysis, and recent paper cards use the same title, paper-code, and status language as the learning record page.

- Modify: `miniprogram/pages/report/report-presenter.js`
  - Ensure report detail uses the same readable bottleneck summaries and paper-code references when the report is a verification feedback report.

- Modify: `miniprogram/pages/generate-verification/generate-verification.js`
  - Ensure selected bottleneck chips use the same readable names as records and PDFs, not LP codes.

- Modify: `miniprogram/pages/paper-preview/paper-preview.js`
  - Ensure verification paper workbench displays the same unique paper code and status language used in the timeline.

- Modify: `miniprogram/pages/upload/upload.js`
  - Ensure answer-upload entry points can receive and display the associated verification paper code when uploading completed verification papers.

- Modify: `tests/learning-records.test.js`
  - Add pure unit tests for shared classification and naming rules.

- Modify: `tests/subject-home-presenter.test.js`
  - Add regression coverage for subject-home record wording and paper-code display.

- Modify: `tests/report-presenter.test.js`
  - Add regression coverage for readable bottleneck names and verification-paper references.

- Modify: `scripts/devtools-parent-timeline-e2e.js`
  - Update expectations to verify taxonomy behavior and paper-code visibility.

### Tests

- Modify: `tests/page-flows.test.js`
  - Add page-level tests for folded evidence and status handling.

- Modify: `tests/index-presenter.test.js`
  - Add recent-record regression for verification paper code and low-frequency default paper suppression.

- Modify: `tests/contracts.test.js`
  - Add structural contract: upload history has main cards, folded evidence, compact status, and no standalone analyzing/failed card class.

---

## Task 0: Establish Shared Learning Record Display Contract

**Files:**

- Create: `miniprogram/utils/learning-records.js`
- Create: `tests/learning-records.test.js`

- [ ] **Step 1: Write failing pure helper tests**

Create `tests/learning-records.test.js` with cases for:

- completed diagnosis reports become `diagnosis-report` main records
- verification papers become `verification-paper` main records
- completed verification reports become `verification-report` main records
- analyzing/failed/timeout reports become compact status items
- default diagnostic papers are suppressed from main record lists
- paper code is returned as the first-class display identifier when available
- bottleneck display labels prefer readable summaries over LP codes

Expected shape:

```js
const {
  classifyReportDisplay,
  classifyPaperDisplay,
  paperCodeOf,
  bottleneckLabelOf,
  isMainTimelinePaper,
} = require('../miniprogram/utils/learning-records')

assert.equal(classifyReportDisplay({ status: 'completed', type: 'diagnosis' }).displayLevel, 'main')
assert.equal(classifyReportDisplay({ status: 'analyzing' }).displayLevel, 'status')
assert.equal(isMainTimelinePaper({ type: 'default-diagnosis' }), false)
assert.equal(paperCodeOf({ paperDisplayCode: '数学-20260613-01' }), '数学-20260613-01')
assert.equal(bottleneckLabelOf({ id: 'LP-008', summary: '审题理解' }), '审题理解')
```

- [ ] **Step 2: Run the test and verify it fails**

Run:

```bash
node --test tests/learning-records.test.js
```

Expected: FAIL because `miniprogram/utils/learning-records.js` does not exist yet.

- [ ] **Step 3: Implement shared pure helpers**

Create `miniprogram/utils/learning-records.js`:

```js
const STATUS_REPORT_STATES = new Set(['pending', 'uploading', 'analyzing', 'failed', 'timeout'])

function paperCodeOf(paper) {
  return paper && (paper.paperDisplayCode || paper.paperCode || paper.displayCode || '')
}

function isMainTimelinePaper(paper) {
  return paper && paper.type === 'verification'
}

function classifyReportDisplay(report = {}) {
  if (STATUS_REPORT_STATES.has(report.status)) {
    return { displayLevel: 'status', kind: 'status' }
  }
  if (report.type === 'verification') {
    return { displayLevel: 'main', kind: 'verification-report' }
  }
  return { displayLevel: 'main', kind: 'diagnosis-report' }
}

function classifyPaperDisplay(paper = {}) {
  if (!isMainTimelinePaper(paper)) {
    return { displayLevel: 'hidden', kind: 'tool-history' }
  }
  return { displayLevel: 'main', kind: 'verification-paper' }
}

function bottleneckLabelOf(input) {
  if (!input) return ''
  if (typeof input === 'string') return input
  return input.summary || input.name || input.title || input.label || input.id || ''
}

module.exports = {
  STATUS_REPORT_STATES,
  paperCodeOf,
  isMainTimelinePaper,
  classifyReportDisplay,
  classifyPaperDisplay,
  bottleneckLabelOf,
}
```

- [ ] **Step 4: Run pure helper tests**

Run:

```bash
node --test tests/learning-records.test.js
```

Expected: PASS.

---

## Task 1: Use Display Taxonomy Helpers In Learning Record Page

**Files:**

- Modify: `miniprogram/utils/learning-records.js`
- Modify: `miniprogram/pages/upload-history/upload-history.js`
- Test: `tests/page-flows.test.js`

- [ ] **Step 1: Write failing unit/page-flow tests**

Add a test to `tests/page-flows.test.js` that seeds:

- one completed diagnosis report with `imageFiles`
- one verification paper with `paperDisplayCode`
- one completed verification report associated with that paper
- one analyzing report
- one failed report
- one default diagnostic paper

Expected:

```js
assert.deepEqual(page.data.days[0].events.map(event => event.kind), [
  'verification-report',
  'verification-paper',
  'diagnosis-report'
])
assert.equal(page.data.days[0].statusItems.length, 2)
assert.equal(page.data.days[0].events.find(event => event.kind === 'diagnosis-report').foldedEvidence.length, 2)
assert.equal(page.data.days[0].events.find(event => event.kind === 'verification-paper').paperCode, '数学-20260612-04')
assert.equal(page.data.days[0].events.some(event => event.kind === 'default-paper'), false)
```

- [ ] **Step 2: Run the test and verify it fails**

Run:

```bash
node --test tests/page-flows.test.js
```

Expected: FAIL because `statusItems` and `foldedEvidence` are not yet produced.

- [ ] **Step 3: Import shared taxonomy helpers**

In `miniprogram/pages/upload-history/upload-history.js`, import:

```js
const {
  STATUS_REPORT_STATES,
  classifyReportDisplay,
  classifyPaperDisplay,
  isMainTimelinePaper,
  paperCodeOf,
  bottleneckLabelOf,
} = require('../../utils/learning-records')
```

- [ ] **Step 4: Add status helper**

Add:

```js
function buildStatusItem(report, subjectName = '') {
  const eventTime = report.evidenceTime || report.createdAt
  const statusText = report.status === 'failed'
    ? '分析失败，可进入报告页重试'
    : report.status === 'timeout'
      ? '分析可能超时，可刷新或重试'
      : 'AI 正在分析，完成后会生成诊断报告'

  return {
    id: `status-${report._id}`,
    type: 'status',
    subject: report.subject,
    reportId: report._id,
    title: `${subjectName || recordSubjectName(report)}${report.type === 'verification' ? '验证反馈' : '诊断'}处理中`,
    status: report.status || 'analyzing',
    statusText,
    timeText: timeText(eventTime),
    createdAt: eventTime,
  }
}
```

- [ ] **Step 5: Add folded evidence helper for reports**

Add:

```js
function buildPhotoEvidenceRows(photos = []) {
  return photos.map(photo => ({
    kind: 'photo',
    icon: '片',
    title: photo.fileName || '试卷照片',
    summary: photo.summaryText || photo.ocrSummary || '暂无 OCR 摘要',
    isDuplicate: Boolean(photo.isDuplicate),
    fileID: photo.fileID || '',
    tempFileURL: photo.tempFileURL || '',
  }))
}
```

- [ ] **Step 6: Update `buildReportEvent`**

Change `buildReportEvent` so completed reports receive:

```js
displayLevel: 'main',
foldedEvidence: buildPhotoEvidenceRows(photos),
statusItems: [],
primaryMeta: isVerification ? '验证反馈' : '诊断报告',
```

Verification reports with `paperId` should include the associated `paperCode` when available.

- [ ] **Step 7: Update `buildPaperEvent`**

Accept an optional linked verification report list:

```js
function buildPaperEvent(paper, subjectName = '', fallbackSubject = '', linkedReports = []) {
  const latestLinkedReport = linkedReports[0] || null
  const answerUploads = linkedReports.flatMap(report => getReportPhotos(report))
  return {
    ...
    displayLevel: 'main',
    paperCode,
    foldedEvidence: answerUploads.map(photo => ({
      kind: 'answer-upload',
      icon: '传',
      title: photo.fileName || '验证卷作答照片',
      summary: photo.ocrSummary || '作答照片已上传',
      isDuplicate: Boolean(photo.isDuplicate),
      fileID: photo.fileID || '',
      tempFileURL: photo.tempFileURL || '',
    })),
    statusText: latestLinkedReport
      ? (latestLinkedReport.status === 'completed' ? '已生成验证反馈' : '反馈分析中')
      : '等待打印作答并上传验证'
  }
}
```

- [ ] **Step 8: Split reports into main and status records**

Inside `loadHistory`, after photo URLs are attached:

```js
const statusItems = []
const completedReportEvents = []

reportPhotos.forEach(({ report, photos }) => {
  if (STATUS_REPORT_STATES.has(report.status)) {
    statusItems.push(buildStatusItem(report, recordSubjectName(report, fallbackSubjectName)))
    return
  }
  completedReportEvents.push(buildReportEvent(...))
})
```

- [ ] **Step 9: Exclude low-frequency paper records through the shared helper**

Keep:

```js
.filter(isMainTimelinePaper)
```

- [ ] **Step 10: Group status items by day**

Update `groupEventsByDay(events, statusItems = [])` to return:

```js
{
  dateKey,
  dayLabel,
  events: [],
  statusItems: []
}
```

Status items should be grouped by `createdAt` date and displayed after the day header, before main cards.

- [ ] **Step 11: Run tests**

Run:

```bash
node --test tests/page-flows.test.js
```

Expected: PASS for the new taxonomy test and existing upload-history tests.

---

## Task 2: Redesign Learning Record Page Layout

**Files:**

- Modify: `miniprogram/pages/upload-history/upload-history.wxml`
- Modify: `miniprogram/pages/upload-history/upload-history.wxss`
- Test: `tests/contracts.test.js`
- Test: `tests/page-flows.test.js`

- [ ] **Step 1: Write structural contract tests**

In `tests/contracts.test.js`, add:

```js
test('upload history renders taxonomy-based dense cards instead of system-log cards', () => {
  const view = read('miniprogram/pages/upload-history/upload-history.wxml')
  const style = read('miniprogram/pages/upload-history/upload-history.wxss')

  assert.match(view, /foldedEvidence/)
  assert.match(view, /statusItems/)
  assert.match(view, /paperCode/)
  assert.match(style, /status-strip/)
  assert.match(style, /fold-row/)
  assert.doesNotMatch(view, /分析中<\/text>\s*<text class="event-summary"/)
})
```

- [ ] **Step 2: Run contract test and verify failure**

Run:

```bash
node --test tests/contracts.test.js
```

Expected: FAIL until WXML/WXSS are updated.

- [ ] **Step 3: Replace header with compact summary**

In `upload-history.wxml`, change the header to:

```xml
<view class="header compact-header">
  <view class="header-copy">
    <text class="title">{{titleText}}</text>
    <text class="subtitle">诊断、验证卷和反馈按学习闭环整理。</text>
  </view>
  <view class="header-illustration"></view>
</view>
```

Add a compact metric strip if data is available from `filters`:

```xml
<view class="metric-strip">
  <view class="metric"><text class="metric-value">{{allEvents.length}}</text><text class="metric-label">主记录</text></view>
  <view class="metric"><text class="metric-value">{{filters[1].count}}</text><text class="metric-label">数学</text></view>
  <view class="metric"><text class="metric-value">{{days.length}}</text><text class="metric-label">天数</text></view>
</view>
```

- [ ] **Step 4: Change filters to category-oriented labels**

Keep subject filters if the route is subject-level, but add category-level filter labels in the layout plan. If category filtering is too much for this iteration, keep existing subject filters and only rename the header copy. Do not introduce a second filter row unless tests prove it is needed.

Preferred MVP:

```js
const SUBJECT_FILTERS = [
  { key: '', name: '全部' },
  { key: 'math', name: '数学' },
  { key: 'chinese', name: '语文' },
  { key: 'english', name: '英语' }
]
```

Then visually make these less tall.

- [ ] **Step 5: Render day-level status strips**

In the day group:

```xml
<view class="status-strip" wx:for="{{item.statusItems}}" wx:key="id" wx:for-item="status">
  <text class="status-dot">中</text>
  <text class="status-text">{{status.statusText}}</text>
  <text class="status-time">{{status.timeText}}</text>
</view>
```

- [ ] **Step 6: Render main cards with dense layout**

Replace the current `record-card` body with:

```xml
<view class="record-card record-{{event.kind}}">
  <view class="event-icon">{{event.icon}}</view>
  <view class="event-body">
    <view class="event-topline">
      <text class="event-title">{{event.title}}</text>
      <text class="event-time">{{event.timeText}}</text>
    </view>
    <text class="event-summary">{{event.summary}}</text>
    <view class="chips" wx:if="{{event.chips.length > 0}}">
      <text class="chip {{chip.indexOf('编号') === 0 || chip.indexOf('数学-') === 0 ? 'chip-strong' : ''}}" wx:for="{{event.chips}}" wx:key="*this" wx:for-item="chip">{{chip}}</text>
    </view>
  </view>
</view>
```

If WXML expression support becomes brittle, precompute `chip.strong` in JS instead of using inline conditions.

- [ ] **Step 7: Render folded evidence**

Under each main card:

```xml
<view class="folded-evidence" wx:if="{{event.foldedEvidence.length > 0}}">
  <view
    class="fold-row"
    wx:for="{{event.foldedEvidence}}"
    wx:key="fileID"
    wx:for-item="evidence"
    wx:for-index="photoIndex"
    catchtap="onPreviewFoldedEvidence"
    data-day-index="{{dayIndex}}"
    data-event-index="{{eventIndex}}"
    data-evidence-index="{{photoIndex}}"
  >
    <text class="fold-icon">{{evidence.icon}}</text>
    <view class="fold-copy">
      <text class="fold-title">{{evidence.title}}</text>
      <text class="fold-summary">{{evidence.summary}}</text>
    </view>
    <text class="duplicate-badge" wx:if="{{evidence.isDuplicate}}">疑似重复</text>
  </view>
</view>
```

- [ ] **Step 8: Add folded evidence preview handler**

In `upload-history.js`, add:

```js
onPreviewFoldedEvidence(e) {
  const { dayIndex, eventIndex, evidenceIndex } = e.currentTarget.dataset
  const day = this.data.days[dayIndex]
  const event = day && day.events[eventIndex]
  const evidence = event && event.foldedEvidence && event.foldedEvidence[evidenceIndex]
  if (!evidence || !evidence.tempFileURL) {
    wx.showToast({ title: '原图暂时无法预览', icon: 'none' })
    return
  }
  const urls = (event.foldedEvidence || []).map(item => item.tempFileURL).filter(Boolean)
  wx.previewImage({ current: evidence.tempFileURL, urls })
}
```

Keep `onPreviewPhoto` temporarily if existing WXML still references it during migration; remove after contract tests confirm no use.

- [ ] **Step 9: Update WXSS for density and visuals**

Add or revise:

```css
.compact-header {
  align-items: center;
  display: flex;
  justify-content: space-between;
  margin-bottom: 16rpx;
}

.header-illustration {
  background: linear-gradient(135deg, #e7f0ff, #e8f8ef);
  border: 1rpx solid #dbe8f4;
  border-radius: 28rpx;
  height: 96rpx;
  position: relative;
  width: 96rpx;
}

.record-card {
  border-radius: 12rpx;
  padding: 18rpx 20rpx;
}

.folded-evidence {
  border-top: 1rpx solid #edf2f7;
  margin: 12rpx 0 0 72rpx;
  padding-top: 10rpx;
}

.fold-row {
  align-items: center;
  display: flex;
  gap: 12rpx;
  min-height: 64rpx;
}

.status-strip {
  align-items: center;
  background: #fff8ea;
  border: 1rpx solid #f3dfb9;
  border-radius: 10rpx;
  color: #9a5b00;
  display: flex;
  font-size: 22rpx;
  gap: 12rpx;
  margin: 0 0 12rpx;
  padding: 12rpx 16rpx;
}

.chip-strong {
  background: #e7f0ff;
  color: #2459a5;
  font-weight: 760;
}
```

- [ ] **Step 10: Run focused tests**

Run:

```bash
node --test tests/contracts.test.js tests/page-flows.test.js
```

Expected: PASS.

---

## Task 3: Preserve Verification Paper Code Across Timeline Relations

**Files:**

- Modify: `miniprogram/pages/upload-history/upload-history.js`
- Modify: `tests/page-flows.test.js`
- Modify: `scripts/devtools-parent-timeline-e2e.js`

- [ ] **Step 1: Write failing test for paper code on feedback**

In `tests/page-flows.test.js`, add a verification report with `paperId: 'paper-1'` and a paper with `paperDisplayCode: '数学-20260612-04'`.

Assert:

```js
const feedback = page.data.days[0].events.find(event => event.kind === 'verification-report')
assert.ok(feedback.chips.includes('关联 数学-20260612-04'))
```

- [ ] **Step 2: Run and verify failure**

Run:

```bash
node --test tests/page-flows.test.js
```

Expected: FAIL if feedback cannot look up paper code.

- [ ] **Step 3: Build a paper lookup map in `loadHistory`**

Before building report events:

```js
const paperById = new Map((papers || []).map(paper => [paper._id, paper]))
const verificationReportsByPaperId = new Map()
;(reports || [])
  .filter(report => report.type === 'verification' && report.paperId)
  .forEach(report => {
    const list = verificationReportsByPaperId.get(report.paperId) || []
    list.push(report)
    verificationReportsByPaperId.set(report.paperId, list)
  })
```

- [ ] **Step 4: Pass `paperById` into `buildReportEvent`**

Change function signature:

```js
function buildReportEvent(report, photos, subjectName = '', fallbackSubject = '', options = {}) {
  const linkedPaper = report.paperId && options.paperById ? options.paperById.get(report.paperId) : null
  const paperCode = linkedPaper && (linkedPaper.paperDisplayCode || linkedPaper.paperCode || '')
  ...
}
```

For verification reports, add chip:

```js
isVerification && paperCode ? `关联 ${paperCode}` : ''
```

- [ ] **Step 5: Pass linked reports into `buildPaperEvent`**

When building paper events:

```js
const linkedReports = verificationReportsByPaperId.get(paper._id) || []
return buildPaperEvent(paper, subjectName, activeSubject, linkedReports)
```

- [ ] **Step 6: Update DevTools mock data**

Ensure `scripts/devtools-parent-timeline-e2e.js` has:

```js
paperDisplayCode: '数学-20260613-01'
```

and verifies both:

- timeline includes `数学-20260613-01`
- paper preview includes `验证试卷编号`

- [ ] **Step 7: Run tests**

Run:

```bash
node --test tests/page-flows.test.js
npm run test:devtools-parent-timeline
```

Expected: PASS.

---

## Task 4: Apply Shared Contract Across Related Pages

**Files:**

- Modify: `miniprogram/utils/learning-records.js`
- Modify: `miniprogram/pages/index/index-presenter.js`
- Modify: `miniprogram/pages/subject-home/subject-home-presenter.js`
- Modify: `miniprogram/pages/report/report-presenter.js`
- Modify: `miniprogram/pages/generate-verification/generate-verification.js`
- Modify: `miniprogram/pages/paper-preview/paper-preview.js`
- Modify: `miniprogram/pages/upload/upload.js`
- Modify: `miniprogram/pages/upload-history/upload-history.js`
- Modify: `tests/learning-records.test.js`
- Modify: `tests/index-presenter.test.js`
- Modify: `tests/subject-home-presenter.test.js`
- Modify: `tests/report-presenter.test.js`
- Modify: `tests/page-flows.test.js`

- [ ] **Step 1: Write failing cross-page consistency tests**

Add tests that assert:

- home recent records do not show default diagnostic paper generation as a main learning record
- home recent records show verification paper code when a verification paper is recent
- subject home uses compact status language for in-progress analysis
- report detail shows readable bottleneck names and linked verification-paper code
- generate-verification page shows readable bottleneck labels, not LP-only labels
- paper-preview workbench shows the same paper code as the timeline
- upload page displays the associated paper code when entered from a verification paper workbench

Use exact visible wording shared with the taxonomy:

```js
assert.equal(view.recentRecords.some(record => record.paperId === 'default-paper'), false)
assert.equal(view.recentRecords.find(record => record.paperId === 'paper-1').paperCode, '数学-20260611-01')
assert.match(subjectView.activeStatusText, /AI 正在分析|分析可能超时|可重试/)
assert.match(reportView.paperCodeText, /数学-20260611-01/)
```

- [ ] **Step 2: Run cross-page tests and verify current gaps**

Run:

```bash
node --test tests/index-presenter.test.js tests/subject-home-presenter.test.js tests/report-presenter.test.js tests/page-flows.test.js
```

Expected: FAIL for at least one newly added assertion until the pages consume the shared display helpers.

- [ ] **Step 3: Replace page-local naming with shared helpers**

Use `paperCodeOf`, `bottleneckLabelOf`, `classifyReportDisplay`, and `isMainTimelinePaper` from `miniprogram/utils/learning-records.js` in:

- `index-presenter.js` for recent record title, subtitle, and default-paper suppression.
- `subject-home-presenter.js` for latest status language and recent record summary.
- `report-presenter.js` for readable bottleneck labels and linked verification-paper display.
- `generate-verification.js` for selected bottleneck labels.
- `paper-preview.js` for the workbench paper identifier.
- `upload.js` for "upload answer for paper code" context.

- [ ] **Step 4: Keep full-card vs folded/status rules consistent**

Rules:

- main full-card records are diagnosis report, verification paper, verification feedback
- photo/OCR and answer-upload evidence are folded or nested wherever shown
- analyzing/failed/timeout are inline status hints, not independent record cards
- default diagnostic paper generation is hidden from parent-facing timelines and recent records

- [ ] **Step 5: Run cross-page focused tests**

Run:

```bash
node --test tests/learning-records.test.js tests/index-presenter.test.js tests/subject-home-presenter.test.js tests/report-presenter.test.js tests/page-flows.test.js
```

Expected: PASS.

- [ ] **Step 6: Keep explicit home suppression regression**

In `tests/index-presenter.test.js`, keep the regression seed:

In `tests/index-presenter.test.js`, add papers:

```js
papers: [
  { _id: 'default-paper', subject: 'math', type: 'default-diagnosis', createdAt: '2026-06-11T09:00:00+08:00' },
  { _id: 'paper-1', subject: 'math', type: 'verification', paperDisplayCode: '数学-20260611-01', createdAt: '2026-06-11T11:00:00+08:00', questions: [{}, {}] }
]
```

Assert:

```js
assert.equal(view.recentRecords.some(record => record.paperId === 'default-paper'), false)
assert.equal(view.recentRecords.some(record => record.paperId === 'paper-1'), true)
```

---

## Task 5: Update DevTools End-To-End Acceptance

**Files:**

- Modify: `scripts/devtools-parent-timeline-e2e.js`

- [ ] **Step 1: Update mock data**

Add mock examples for:

- completed diagnosis report
- verification paper with paper code
- verification report linked to the paper
- analyzing report
- failed report
- default diagnostic paper

- [ ] **Step 2: Update assertions**

Require these texts:

```js
requireText(text, [
  '数学诊断报告',
  '生成数学验证试卷',
  '数学验证反馈',
  '数学-20260613-01',
  '原始照片',
])
```

Assert these are not visible as standalone main cards:

```js
assert(!text.includes('生成数学诊断试卷'))
assert(!text.includes('默认诊断试卷'))
```

For status rows, assert compact status text exists if the mock includes an analyzing report:

```js
requireText(text, ['AI 正在分析'])
assert(!text.includes('分析失败\\nAI')) // no full failure card layout
```

- [ ] **Step 3: Add cross-page route checks**

In the same DevTools script, navigate through:

- home page latest record area
- subject home recent/active diagnosis area
- learning record page
- verification paper workbench
- report detail
- upload page opened from verification paper context

Assert the same example code appears consistently:

```js
requireText(text, ['数学-20260613-01'])
```

Assert LP-only labels do not appear in parent-facing record surfaces:

```js
assert(!text.includes('LP-008、LP-001'))
```

- [ ] **Step 4: Run DevTools test**

Run:

```bash
npm run test:devtools-parent-timeline
```

Expected: all scenarios PASS, `failures: 0`, `exceptionCount: 0`.

---

## Task 6: Full Regression And Documentation

**Files:**

- Modify: `docs/TEST_MATRIX.md`
- Modify: `docs/TESTING.md`
- Optional Modify: `docs/DATA_DICTIONARY.md`

- [ ] **Step 1: Update testing docs**

Document that learning record display tests cover:

- main/folded/status/hidden taxonomy
- verification-paper code visibility
- default paper suppression
- DevTools timeline acceptance

- [ ] **Step 2: Run full verification**

Run:

```bash
npm run verify
```

Expected:

- all Node tests PASS
- `scripts/check-js.js` PASS

- [ ] **Step 3: Run DevTools acceptance**

Run:

```bash
npm run test:devtools-parent-timeline
```

Expected:

- all DevTools cases PASS
- no console exceptions

- [ ] **Step 4: Manual visual check in WeChat DevTools**

Open:

- `pages/upload-history/upload-history?studentId=student-e2e&studentName=钟青羽`
- `pages/index/index`
- `pages/subject-home/subject-home?studentId=student-e2e&subject=math`
- `pages/report/report?id=report-e2e`
- `pages/paper-preview/paper-preview?id=paper-e2e`
- `pages/upload/upload?studentId=student-e2e&paperId=paper-e2e`

Check:

- Top header density is lower than current page.
- Only diagnosis report, verification paper, and verification feedback are full cards.
- Photo/OCR and answer upload are folded under related cards.
- Analyzing/failed states are compact status strips, not full cards.
- Default diagnostic paper generation is not shown in main timeline.
- Verification paper code is visible in all related records.
- Home, subject home, report detail, paper workbench, and upload entry use the same paper-code wording.
- Bottleneck labels are readable text labels rather than LP-code-first labels.

- [ ] **Step 5: Commit**

Run:

```bash
git add miniprogram/pages/upload-history \
  miniprogram/utils/learning-records.js \
  miniprogram/pages/index/index-presenter.js \
  miniprogram/pages/subject-home/subject-home-presenter.js \
  miniprogram/pages/report/report-presenter.js \
  miniprogram/pages/generate-verification/generate-verification.js \
  miniprogram/pages/paper-preview/paper-preview.js \
  miniprogram/pages/upload/upload.js \
  tests/learning-records.test.js \
  tests/page-flows.test.js \
  tests/index-presenter.test.js \
  tests/subject-home-presenter.test.js \
  tests/report-presenter.test.js \
  tests/contracts.test.js \
  scripts/devtools-parent-timeline-e2e.js \
  docs/TEST_MATRIX.md \
  docs/TESTING.md
git commit -m "feat: classify learning record timeline display"
```

---

## Acceptance Criteria

- Learning record page has exactly three standalone learning record families:
  - diagnosis report
  - verification paper
  - verification feedback
- Original photos/OCR and answer uploads are folded evidence, not standalone main cards.
- Analyzing/failed/timeout states are compact state strips or associated badges, not standalone history cards.
- Default diagnostic paper generation is suppressed from the main learning record timeline.
- Verification paper code is visible on verification paper cards and associated feedback/upload evidence.
- Verification paper code language is consistent on:
  - home recent records
  - subject home
  - learning record page
  - report detail
  - paper workbench
  - upload answer entry point
- Bottleneck labels are readable summaries across record surfaces, not LP-code-first labels.
- Existing navigation remains unchanged:
  - report card opens report detail
  - paper card opens paper workbench
  - folded photo evidence opens image preview
- `npm run verify` passes.
- `npm run test:devtools-parent-timeline` passes.

---

## Implementation Notes

- Keep the data source as derived reports and papers. Do not add `learningEvents`.
- Keep presentation rules in `miniprogram/utils/learning-records.js`; pages should import helpers instead of redefining paper-code, bottleneck-label, or timeline-kind rules locally.
- Avoid showing internal LP codes in any visible label.
- Avoid adding a second filter system unless needed. The safest first version keeps subject filters and changes the event display taxonomy.
- Treat missing paper codes gracefully:

```js
function paperCodeOf(paper) {
  return paper && (paper.paperDisplayCode || paper.paperCode || '')
}
```

- For old papers without codes, show no code rather than inventing a misleading one in the timeline. The workbench can still fallback to a generated display string.

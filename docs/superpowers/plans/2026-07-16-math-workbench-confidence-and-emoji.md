# Math Workbench Confidence and Emoji Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Restore a small Android/iOS-safe symbol whitelist, compact the math workbench, and present each math bottleneck with traceable numeric evidence and a clearly named composite confidence score.

**Architecture:** Keep symbols in one UI utility and let presenters provide semantic icon values to WXML. Extend the existing `subjectProfiles.currentBottlenecks` merge model with an additive `cumulativeErrorCount`, then reuse the existing confidence builder to expose a dense evidence matrix in math diagnosis reports. Add a token-protected, dry-run-first history backfill phase that selects only final effective reports and never double-counts replaced reports.

**Tech Stack:** WeChat Mini Program WXML/WXSS/CommonJS, WeChat Cloud Functions, Node.js `node:test`, existing B1 design tokens and presenter architecture.

---

## File Map

**Create**

- `miniprogram/utils/ui-symbols.js`: exact seven-symbol whitelist and semantic symbol lookup.
- `cloudfunctions/reanalyzeMathHistory/cumulative-error-backfill.js`: pure report-selection and cumulative-error aggregation helpers.
- `tests/ui-symbols.test.js`: whitelist, fallback, and no-unstable-symbol contract tests.
- `tests/cumulative-error-backfill.test.js`: replacement, duplicate, ineffective-report, and idempotent aggregation tests.

**Modify**

- `miniprogram/pages/subject-home/subject-home-presenter.js`: provide approved map/tool/completion symbols.
- `miniprogram/pages/subject-home/subject-home.wxml`: consume symbols and keep text as the primary label.
- `miniprogram/pages/subject-home/subject-home.wxss`: reduce map and queue typography, padding, and row height.
- `miniprogram/utils/bottleneck-view.js`: expose normalized numeric evidence fields and duration/trend text.
- `miniprogram/pages/report/report-presenter.js`: build math evidence-matrix rows from profile bottlenecks.
- `miniprogram/pages/report/report.wxml`: render compact score and evidence metrics in grouped math cards.
- `miniprogram/pages/report/report.wxss`: style the selected C high-density layout without nested cards.
- `cloudfunctions/analyzePhotos/profile-summary.js`: accumulate `cumulativeErrorCount` during live profile merges.
- `cloudfunctions/reanalyzeMathHistory/profile-summary.js`: mirror the cloud-function-local profile merge behavior.
- `cloudfunctions/reanalyzeMathHistory/index.js`: add protected `backfillCumulativeErrors` dry-run/apply phase.
- `tests/profile-summary.test.js`: cover first discovery, recurrence, verification-only reports, and normalization.
- `tests/bottleneck-view.test.js`: cover composite score and evidence metric normalization.
- `tests/subject-home-presenter.test.js`: cover semantic symbols in the math workbench.
- `tests/subject-home-page-flows.test.js`: cover WXML bindings and compact visual rules.
- `tests/report-presenter.test.js`: cover the numeric math evidence matrix.
- `tests/report-page-flows.test.js`: cover report WXML rendering and labels.
- `tests/bplus-design-system.test.js`: permit only the exact whitelist while continuing to reject all other emoji/symbols.
- `package.json`: register the two new test files in `test:unit` and `test:coverage`.
- `docs/DATA_DICTIONARY.md`: document cumulative errors and clarify confidence score semantics.
- `docs/subject-design/置信度驱动分层验证模型设计文档.md`: document display metrics, score naming, and backfill rules.
- `docs/DEPLOYMENT.md`: add dry-run/apply/verification instructions for the history backfill.

### Task 1: Establish the exact UI symbol whitelist

**Files:**
- Create: `miniprogram/utils/ui-symbols.js`
- Create: `tests/ui-symbols.test.js`
- Modify: `tests/bplus-design-system.test.js`
- Modify: `package.json`

- [ ] **Step 1: Write the failing whitelist utility test**

Add assertions equivalent to:

```js
const { UI_SYMBOLS, symbolOf, isApprovedUiSymbol } = require('../miniprogram/utils/ui-symbols')

assert.deepEqual(Object.values(UI_SYMBOLS), ['🗺️', '📚', '📄', '📸', '📊', '🎯', '✅'])
assert.equal(symbolOf('knowledgeMap'), '🗺️')
assert.equal(symbolOf('unknown'), '')
assert.equal(isApprovedUiSymbol('🗺️'), true)
assert.equal(isApprovedUiSymbol('👨‍👩‍👧'), false)
```

- [ ] **Step 2: Run the focused tests and verify failure**

Run:

```bash
node --test tests/ui-symbols.test.js tests/bplus-design-system.test.js
```

Expected: FAIL because `ui-symbols.js` does not exist and the current design-system test rejects the approved symbols.

- [ ] **Step 3: Implement the central symbol module**

Use a frozen exact-value map:

```js
const UI_SYMBOLS = Object.freeze({
  knowledgeMap: '🗺️',
  learningRecords: '📚',
  paper: '📄',
  camera: '📸',
  report: '📊',
  target: '🎯',
  complete: '✅'
})

const APPROVED_SYMBOLS = new Set(Object.values(UI_SYMBOLS))

function symbolOf(key) {
  return UI_SYMBOLS[key] || ''
}

function isApprovedUiSymbol(value) {
  return APPROVED_SYMBOLS.has(value)
}
```

- [ ] **Step 4: Replace the global prohibition with exact-whitelist validation**

In `tests/bplus-design-system.test.js`, scan UI source text for emoji/symbol graphemes, subtract the seven exact approved sequences, and fail on every remaining decorative pictograph. Keep arrows already used as navigation controls under the existing accessibility test.

- [ ] **Step 5: Register and run the tests**

Run:

```bash
node --test tests/ui-symbols.test.js tests/bplus-design-system.test.js
```

Expected: PASS, with broad emoji families, flags, people, skin tones, and ZWJ sequences still rejected.

- [ ] **Step 6: Commit**

```bash
git add miniprogram/utils/ui-symbols.js tests/ui-symbols.test.js tests/bplus-design-system.test.js package.json
git commit -m "feat: add safe UI symbol whitelist"
```

### Task 2: Compact the math workbench and restore approved visual anchors

**Files:**
- Modify: `miniprogram/pages/subject-home/subject-home-presenter.js`
- Modify: `miniprogram/pages/subject-home/subject-home.wxml`
- Modify: `miniprogram/pages/subject-home/subject-home.wxss`
- Modify: `tests/subject-home-presenter.test.js`
- Modify: `tests/subject-home-page-flows.test.js`

- [ ] **Step 1: Write failing presenter tests**

Assert that the math view exposes:

```js
assert.equal(view.knowledgeMapSymbol, '🗺️')
assert.equal(view.emptyQueueSymbol, '✅')
assert.deepEqual(
  view.tools.map(item => item.icon),
  ['📸', '📄', '📚']
)
```

Also assert Chinese/math tools preserve visible text labels and English-only text marks remain unchanged unless mapped to an approved symbol.

- [ ] **Step 2: Write failing page-density tests**

Read `subject-home.wxml` and `subject-home.wxss` and assert:

- map WXML binds `knowledgeMapSymbol`;
- empty state binds `emptyQueueSymbol`;
- `.map-entry-title` is at most `27rpx`;
- `.map-entry-desc` is at most `21rpx`;
- `.task-row` vertical padding is at most `16rpx`;
- `.row-title` is at most `25rpx`;
- `.row-desc` is at most `21rpx`;
- `.status-icon` is at most `48rpx` square.

- [ ] **Step 3: Run focused tests and verify failure**

Run:

```bash
node --test tests/subject-home-presenter.test.js tests/subject-home-page-flows.test.js
```

Expected: FAIL on missing symbols and oversized CSS rules.

- [ ] **Step 4: Add semantic symbols in the presenter**

Import `symbolOf` and return:

```js
knowledgeMapSymbol: symbolOf('knowledgeMap'),
emptyQueueSymbol: symbolOf('complete')
```

Map non-English tools to `camera`, `paper`, and `learningRecords`. Keep each icon adjacent to its existing `title`; icons must never replace the action name.

- [ ] **Step 5: Bind symbols and compact the layout**

In WXML:

```xml
<text class="map-entry-icon">{{knowledgeMapSymbol}}</text>
...
<view class="empty-icon">{{emptyQueueSymbol}}</view>
```

In WXSS, reduce only the map entry and queue surfaces. Preserve `88rpx` minimum tap targets by applying the compact typography inside a sufficiently tall clickable row, not by shrinking the interaction target below platform guidance.

- [ ] **Step 6: Run focused tests**

Run:

```bash
node --test tests/ui-symbols.test.js tests/bplus-design-system.test.js tests/subject-home-presenter.test.js tests/subject-home-page-flows.test.js
```

Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add miniprogram/pages/subject-home miniprogram/utils/ui-symbols.js tests/subject-home-presenter.test.js tests/subject-home-page-flows.test.js
git commit -m "feat: compact math workbench visuals"
```

### Task 3: Accumulate numeric bottleneck evidence in live diagnosis merges

**Files:**
- Modify: `cloudfunctions/analyzePhotos/profile-summary.js`
- Modify: `cloudfunctions/reanalyzeMathHistory/profile-summary.js`
- Modify: `tests/profile-summary.test.js`

- [ ] **Step 1: Write failing cumulative-error tests**

Cover these exact cases:

```js
assert.equal(first.currentBottlenecks[0].cumulativeErrorCount, 2)
assert.equal(recurrence.currentBottlenecks[0].cumulativeErrorCount, 5)
assert.equal(verificationOnly.currentBottlenecks[0].cumulativeErrorCount, 5)
assert.equal(normalizedLegacy.currentBottlenecks[0].cumulativeErrorCount, 0)
```

Use two diagnosis reports with `errorCount` values `2` and `3`; a verification report without new diagnosis errors must not increase the total.

- [ ] **Step 2: Run the test and verify failure**

Run:

```bash
node --test tests/profile-summary.test.js
```

Expected: FAIL because `cumulativeErrorCount` is missing.

- [ ] **Step 3: Normalize the new field**

Add:

```js
cumulativeErrorCount: Math.max(0, Number(item.cumulativeErrorCount) || 0)
```

to `currentBottlenecks`, legacy pending, and legacy improved normalization in both profile-summary copies.

- [ ] **Step 4: Increment only on diagnosis evidence**

When a report bottleneck is merged:

```js
const recentErrorCount = errorCountOf(bottleneck)
const cumulativeErrorCount =
  (Number(previous && previous.cumulativeErrorCount) || 0) + recentErrorCount
```

Do not increment during verification-target processing. Rely on the existing `profileAppliedAt` guard in `analyzePhotos` for report-level idempotency; do not add a second competing marker.

- [ ] **Step 5: Keep both cloud-function copies behaviorally identical**

Apply the same field normalization and merge expression to `cloudfunctions/reanalyzeMathHistory/profile-summary.js`. Add a test that loads both modules and compares their cumulative-error output for the same fixture.

- [ ] **Step 6: Run focused tests**

Run:

```bash
node --test tests/profile-summary.test.js tests/profile-merge-protection.test.js tests/time-aware-bottlenecks.test.js
```

Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add cloudfunctions/analyzePhotos/profile-summary.js cloudfunctions/reanalyzeMathHistory/profile-summary.js tests/profile-summary.test.js
git commit -m "feat: track cumulative bottleneck errors"
```

### Task 4: Add a dry-run-first historical metric backfill

**Files:**
- Create: `cloudfunctions/reanalyzeMathHistory/cumulative-error-backfill.js`
- Create: `tests/cumulative-error-backfill.test.js`
- Modify: `cloudfunctions/reanalyzeMathHistory/index.js`
- Modify: `package.json`

- [ ] **Step 1: Write failing effective-report selection tests**

Fixtures must include:

- a completed effective diagnosis report;
- an ineffective report;
- an all-photos-duplicate report;
- a source report with `replacedByReportId`;
- its completed final replacement with `reanalysis.sourceReportId`;
- an archived canceled replacement;
- a verification report.

Assert that only the standalone effective diagnosis and the final replacement contribute error counts, and that the source/replacement pair contributes once.

- [ ] **Step 2: Write failing idempotent aggregation tests**

Define the pure output as a map keyed by stable `bottleneckId`, falling back to `lpCode`:

```js
assert.deepEqual(aggregateCumulativeErrors(reports), {
  'BN-DEC-MUL-POINT-COUNT': {
    lpCode: 'LP-001',
    cumulativeErrorCount: 5,
    occurrenceCount: 2
  }
})
```

Calling the helper twice with the same reports must produce the same result; it must not read prior profile totals.

- [ ] **Step 3: Run the new test and verify failure**

Run:

```bash
node --test tests/cumulative-error-backfill.test.js
```

Expected: FAIL because the helper does not exist.

- [ ] **Step 4: Implement pure report selection and aggregation**

The selector must:

```js
report.subject === 'math'
report.type === 'diagnosis'
report.status === 'completed'
report.isEffective !== false
report.allPhotosDuplicate !== true
!report.isArchived
!report.archivedAt
!report.replacedByReportId
```

For replacement chains, use `reanalysis.sourceReportId || originalReportId` as the lineage key and retain only the newest non-archived completed final report. Sum `errorCountOf(bottleneck)` by `bottleneckId || lpCode`, while retaining the parent `lpCode` for fallback matching; never infer totals from `evidenceCount`, `weight`, or multiplication.

- [ ] **Step 5: Add the protected cloud-function phase**

Add `phase === 'backfillCumulativeErrors'` to `index.js`. It must:

1. reuse the existing `MATH_REANALYSIS_TOKEN` authorization;
2. fetch reports by `studentId` or bounded `limit`;
3. aggregate per student;
4. dry-run by default and return proposed per-LP changes;
5. on `apply: true`, patch only matching `currentBottlenecks[]` or independently measurable `candidateBottlenecks[]` with `cumulativeErrorCount` and `evidenceCount`/occurrence count derived from the same selected report set;
6. preserve status, weight, resource plans, and unrelated profile fields;
7. write `metricBackfill.version` and `metricBackfill.completedAt`, overwriting the same version's aggregate rather than incrementing it;
8. return updated/skipped profile counts.

- [ ] **Step 6: Run focused tests**

Run:

```bash
node --test tests/cumulative-error-backfill.test.js tests/math-history-reanalysis.test.js tests/profile-summary.test.js
```

Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add cloudfunctions/reanalyzeMathHistory/cumulative-error-backfill.js cloudfunctions/reanalyzeMathHistory/index.js tests/cumulative-error-backfill.test.js package.json
git commit -m "feat: backfill math bottleneck evidence metrics"
```

### Task 5: Expose normalized score and evidence metrics to report presenters

**Files:**
- Modify: `miniprogram/utils/bottleneck-view.js`
- Modify: `miniprogram/pages/report/report-presenter.js`
- Modify: `tests/bottleneck-view.test.js`
- Modify: `tests/report-presenter.test.js`

- [ ] **Step 1: Write failing confidence normalization tests**

Assert that `buildConfidence` returns:

```js
{
  score: 80,
  scoreLabel: '综合置信分',
  occurrenceCount: 3,
  cumulativeErrorCount: 7,
  recentErrorCount: 2,
  passCount: 1,
  failCount: 2
}
```

Also test clamping to `0..100`, missing dates, and legacy records without cumulative totals.

- [ ] **Step 2: Write failing report-presenter tests**

For a math profile bottleneck, assert:

```js
assert.equal(item.confidenceScore, 80)
assert.equal(item.confidenceScoreLabel, '综合置信分')
assert.equal(item.occurrenceCount, 3)
assert.equal(item.cumulativeErrorCount, 7)
assert.equal(item.recentErrorCount, 2)
assert.equal(item.verificationSummary, '通过 1 · 未通过 2')
assert.equal(item.firstSeenText, '2026-07-01')
assert.equal(item.lastSeenText, '2026-07-16')
assert.equal(item.durationText, '持续 15 天')
```

Explicitly assert that no field or label contains `准确率`.

- [ ] **Step 3: Run focused tests and verify failure**

Run:

```bash
node --test tests/bottleneck-view.test.js tests/report-presenter.test.js
```

Expected: FAIL on missing normalized metrics.

- [ ] **Step 4: Extend `buildConfidence` without changing score semantics**

Keep the existing thresholds and fallback:

```js
weight >= 75  // high
weight >= 45  // medium
evidenceStrength high/medium/other -> 85/60/35
```

Add normalized metric fields and `scoreLabel: '综合置信分'`. This score remains an action-priority confidence composite, not a probability or model accuracy percentage.

- [ ] **Step 5: Build report evidence rows**

In `report-presenter.js`, add date formatting and duration helpers, then attach a compact `evidenceMetrics` array:

```js
[
  { key: 'occurrence', label: '出现', value: '3 次' },
  { key: 'errors', label: '累计错题', value: '7 道' },
  { key: 'recent', label: '最近', value: '2 道' },
  { key: 'verification', label: '复测', value: '通过 1 / 未过 2' }
]
```

For expanded fine bottlenecks without independent long-term metrics, mark the values as inherited from the parent LP rather than fabricating candidate-level counts.

- [ ] **Step 6: Run focused tests**

Run:

```bash
node --test tests/bottleneck-view.test.js tests/report-presenter.test.js
```

Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add miniprogram/utils/bottleneck-view.js miniprogram/pages/report/report-presenter.js tests/bottleneck-view.test.js tests/report-presenter.test.js
git commit -m "feat: expose quantified bottleneck evidence"
```

### Task 6: Render the selected C high-density math report layout

**Files:**
- Modify: `miniprogram/pages/report/report.wxml`
- Modify: `miniprogram/pages/report/report.wxss`
- Modify: `tests/report-page-flows.test.js`

- [ ] **Step 1: Write failing WXML contract tests**

Assert that grouped math items render:

- `综合置信分 {{item.confidenceScore}}`;
- a numeric score bar or track with `item.confidenceScore`;
- every `item.evidenceMetrics`;
- first/last seen and duration when present;
- trend and status as text;
- no `准确率` label.

- [ ] **Step 2: Write failing density-style tests**

Assert stable compact dimensions:

- mini-item padding no more than `18rpx`;
- title no more than `25rpx`;
- evidence label no more than `19rpx`;
- evidence value no more than `23rpx`;
- metric grid uses four fixed tracks or a two-by-two responsive grid;
- no `.card` inside `.card`.

- [ ] **Step 3: Run the page-flow test and verify failure**

Run:

```bash
node --test tests/report-page-flows.test.js
```

Expected: FAIL because the evidence matrix is not rendered.

- [ ] **Step 4: Implement the dense evidence matrix**

Within each grouped bottleneck row:

```xml
<view class="bottleneck-score-row">
  <text class="bottleneck-score-label">{{item.confidenceScoreLabel}}</text>
  <text class="bottleneck-score-value">{{item.confidenceScore}}</text>
</view>
<view class="bottleneck-score-track">
  <view class="bottleneck-score-fill confidence-{{item.confidenceLevel}}" style="width: {{item.confidenceScore}}%;"></view>
</view>
<view class="bottleneck-evidence-grid">
  <view class="bottleneck-evidence-cell" wx:for="{{item.evidenceMetrics}}" wx:key="key">
    <text class="bottleneck-evidence-value">{{item.value}}</text>
    <text class="bottleneck-evidence-label">{{item.label}}</text>
  </view>
</view>
```

Use full-width unframed rows separated by rules; do not create nested decorative cards.

- [ ] **Step 5: Apply B1 semantic colors**

Use:

- high/persisting: priority foreground/background;
- medium/waiting: waiting foreground/background;
- low/informational: informational foreground/background;
- improved: improved foreground/background.

Keep score fill and metric values legible in Android WeChat without relying on emoji glyphs.

- [ ] **Step 6: Run focused report tests**

Run:

```bash
node --test tests/report-presenter.test.js tests/report-page-flows.test.js tests/bplus-design-system.test.js
```

Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add miniprogram/pages/report/report.wxml miniprogram/pages/report/report.wxss tests/report-page-flows.test.js
git commit -m "feat: redesign math report evidence matrix"
```

### Task 7: Document metric semantics and the migration procedure

**Files:**
- Modify: `docs/DATA_DICTIONARY.md`
- Modify: `docs/subject-design/置信度驱动分层验证模型设计文档.md`
- Modify: `docs/DEPLOYMENT.md`

- [ ] **Step 1: Update the data dictionary**

Add:

```markdown
| `cumulativeErrorCount` | Number | 所有最终有效正式诊断中，该卡点相关错题数之和；不包含验证报告、重复照片、无效报告或被替换源报告 | `7` |
```

Clarify:

- `evidenceCount` means number of effective diagnosis occurrences;
- `recentErrorCount` means only the latest effective diagnosis;
- `weight` is the source of the displayed `综合置信分`;
- the score is not `准确率`.

- [ ] **Step 2: Update the confidence design document**

Document the C layout, exact score thresholds, metric derivations, fine-bottleneck inheritance rule, and whitelist symbols:

```text
🗺️ 📚 📄 📸 📊 🎯 ✅
```

- [ ] **Step 3: Add deployment/backfill commands**

Document cloud invocation payloads:

```js
{
  phase: 'backfillCumulativeErrors',
  apply: false,
  studentId: '<optional>',
  reanalysisToken: '<MATH_REANALYSIS_TOKEN>'
}
```

Then repeat with `apply: true`, followed by another dry run whose proposed change count must be `0`.

- [ ] **Step 4: Review docs for prohibited terminology**

Run:

```bash
rg -n "准确率|cumulativeErrorCount|backfillCumulativeErrors|综合置信分" docs
```

Expected: any `准确率` occurrence explicitly says the score is not accuracy; all new field/action names are documented.

- [ ] **Step 5: Commit**

```bash
git add docs/DATA_DICTIONARY.md docs/subject-design/置信度驱动分层验证模型设计文档.md docs/DEPLOYMENT.md
git commit -m "docs: document quantified bottleneck metrics"
```

### Task 8: Full regression, size check, and visual verification

**Files:**
- Modify only if a verification failure reveals a scoped defect.

- [ ] **Step 1: Run the complete unit suite**

Run:

```bash
npm run test:unit
```

Expected: all tests PASS.

- [ ] **Step 2: Run syntax and package-size checks**

Run:

```bash
npm run check
npm run check:size
```

Expected: PASS; main package remains below the project limit.

- [ ] **Step 3: Run focused WeChat DevTools flows**

Run:

```bash
npm run test:e2e:math
```

Expected: math workbench, knowledge map navigation, and diagnosis report flows PASS.

- [ ] **Step 4: Inspect desktop and Android-sized screenshots**

Verify:

- the map icon renders and is followed by `知识地图`;
- no unapproved symbol appears;
- queue typography is visibly smaller but tap rows remain usable;
- two or more bottlenecks fit in the first report viewport where data permits;
- score, occurrence, cumulative/recent errors, and verification evidence are readable without overlap;
- no internal LP/BN code leaks into parent-facing labels.

- [ ] **Step 5: Verify history backfill in dry-run mode**

Deploy `reanalyzeMathHistory`, invoke `backfillCumulativeErrors` with `apply: false`, and inspect proposed totals for at least one profile with a replaced report lineage before applying.

- [ ] **Step 6: Apply and prove idempotency**

Invoke with `apply: true`, then invoke the same dry run again.

Expected: second dry run reports no proposed changes.

- [ ] **Step 7: Final commit if verification required fixes**

```bash
git add <only-files-changed-by-verification>
git commit -m "fix: complete math metric rollout verification"
```

- [ ] **Step 8: Final repository check**

Run:

```bash
git status --short
git log --oneline -8
```

Expected: clean worktree and a readable sequence of scoped commits for symbols, workbench density, metrics, backfill, report UI, and documentation.

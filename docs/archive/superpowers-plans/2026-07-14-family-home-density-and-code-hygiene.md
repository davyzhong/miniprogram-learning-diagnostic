# Family Home Density and Internal Code Hygiene Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the family workbench fully icon-rich and substantially denser while preventing internal identifiers from appearing anywhere in user-facing mini-program text.

**Architecture:** Add one presentation-boundary sanitizer that recognizes internal identifier shapes and converts ID-only values into readable taxonomy names or semantic count fallbacks. Use it in shared paper and timeline presenters, then enforce the rule with manifest-driven tests. Extend the existing child-workbench view model with semantic icons and compact labels, while preserving every current child-card section and navigation path.

**Tech Stack:** WeChat Mini Program WXML/WXSS/CommonJS, Node.js `node:test`, existing taxonomy/paper helpers, WeChat DevTools CLI and `miniprogram-automator`.

**Design spec:** `docs/superpowers/specs/2026-07-14-family-home-density-and-code-hygiene-design.md`

---

## File Map

### Shared presentation safety

- Create `miniprogram/utils/user-facing-text.js`: internal-code detection, mixed-prose sanitization, readable list compaction, and semantic count fallback.
- Modify `miniprogram/utils/paper-display.js`: never use raw target IDs as visible names and expose compact coverage summaries independently from paper codes.
- Create `tests/user-facing-code-hygiene.test.js`: utility behavior plus manifest-driven registered-page and presenter-output gate.
- Modify `package.json`: register the new gate in unit and coverage scripts.

### Learning records and related presenters

- Modify `miniprogram/pages/upload-history/upload-history-presenter.js`: compact paper events, retain human-readable paper codes, and remove raw target joins.
- Modify `miniprogram/pages/upload-history/upload-history.wxml`: remove paper-code row and keep compact lifecycle/action content.
- Modify `miniprogram/pages/upload-history/upload-history.wxss`: reduce card spacing and constrain readable summaries.
- Modify `tests/upload-history-page-flows.test.js`: ID-only legacy fixtures and no-leak assertions.
- Audit and modify as needed:
  - `miniprogram/pages/report/report-presenter.js`
  - `miniprogram/pages/paper-preview/paper-preview-presenter.js`
  - `miniprogram/pages/subject-home/subject-home-presenter.js`
  - `miniprogram/pages/learning-resource/learning-resource-presenter.js`
  - `miniprogram/pages/knowledge-map/knowledge-map-presenter.js`
  - `miniprogram/pages/learning-progress/learning-progress.js`
  - `miniprogram/pages/generate-verification/generate-verification.js`

### Family workbench

- Modify `miniprogram/utils/child-workbench.js`: semantic icon fields, compact metric/action/subject/quick-link labels, and sanitized paper/report summaries.
- Modify `miniprogram/pages/index/index.wxml`: icon-driven household summary and dense child-card primitives.
- Modify `miniprogram/pages/index/index.wxss`: fixed compact dimensions, reduced padding, and responsive two-child visibility.
- Modify `tests/index-presenter.test.js` and `tests/index-page-flows.test.js`: icon contract, section-preservation, and density-class assertions.

### Real-device verification

- Modify `scripts/devtools-e2e-fullpage.js`: assert no internal codes on family/history pages and capture successful QA screenshots for these two pages.
- Create or modify `scripts/devtools-family-density-e2e.js`: assert first-viewport element positions at representative device dimensions.

---

### Task 1: Add the shared user-facing text sanitizer

**Files:**
- Create: `miniprogram/utils/user-facing-text.js`
- Create: `tests/user-facing-code-hygiene.test.js`
- Modify: `package.json`

- [ ] **Step 1: Write failing utility tests**

Add tests equivalent to:

```js
const {
  isInternalIdentifier,
  readableNameOf,
  sanitizeUserText,
  compactReadableTargets
} = require('../miniprogram/utils/user-facing-text')

test('detects internal identifiers without treating paper-facing labels as IDs', () => {
  for (const value of ['BN-DEC-DIV-POINT', 'LP-001', 'ERR-MATH-01', 'MATH-NUM-DEC-MUL-POINT', 'RES-BILI-001']) {
    assert.equal(isInternalIdentifier(value), true)
  }
  assert.equal(isInternalIdentifier('数学-20260712-06'), false)
  assert.equal(isInternalIdentifier('小数除法'), false)
})

test('sanitizes mixed prose and uses semantic count fallbacks', () => {
  assert.equal(readableNameOf('LP-001'), '计算基础')
  assert.equal(readableNameOf('MATH-NUM-DEC-DIV-POINT'), '小数除法中的小数点移动')
  assert.equal(
    sanitizeUserText('复测 BN-A、BN-B、BN-C。纸面作答后上传。', { count: 3, noun: '数学学习卡点' }),
    '复测 3 个数学学习卡点。纸面作答后上传。'
  )
  assert.equal(
    compactReadableTargets(['BN-A', { displayName: '小数除法' }, { title: '单位换算' }], { totalCount: 3 }),
    '小数除法、单位换算等 3 个学习卡点'
  )
})
```

- [ ] **Step 2: Run tests and verify failure**

Run:

```bash
node --test tests/user-facing-code-hygiene.test.js
```

Expected: FAIL because the module does not exist.

- [ ] **Step 3: Implement the focused utility**

Implement exports with no UI or routing dependencies:

```js
const INTERNAL_ID_PATTERNS = [
  /^(?:BN|LP|ERR|NODE|RES|CHI)-[A-Z0-9_-]+$/i,
  /^MATH-(?:NUM|GEO|MEASURE|STAT|ALG|MOD|META)-[A-Z0-9_-]+$/i,
  /^(?:PAGE|TASK-PAGE|VER-PAGE)-[A-Z0-9_-]+$/i,
  /^cloud:\/\//i
]

function isInternalIdentifier(value = '') {
  const text = String(value || '').trim()
  return INTERNAL_ID_PATTERNS.some(pattern => pattern.test(text))
}

function readableNameOf(value, options = {}) {
  if (!value) return ''
  if (typeof value === 'string') {
    const text = value.trim()
    if (!isInternalIdentifier(text)) return text
    return options.resolveIdentifier ? options.resolveIdentifier(text) : resolveKnownIdentifier(text)
  }
  const candidates = [value.displayName, value.displayTitle, value.title, value.targetText, value.lpName, value.name, value.label]
  return candidates.map(text => String(text || '').trim()).find(text => text && !isInternalIdentifier(text)) || ''
}
```

Implement `resolveKnownIdentifier` by composing the existing bottleneck taxonomy (`getBottleneckMeta`/`formatBottleneckDisplayName`) and math knowledge/bottleneck seed lookups; do not create a second taxonomy. Resolve a known ID before applying any count fallback. `sanitizeUserText` must remove unresolved embedded internal-code tokens without destroying adjacent Chinese punctuation. When removed codes were the meaningful object of a sentence, replace the run with `${count} 个${noun}`. `compactReadableTargets` returns at most three unique readable names and falls back to a count or neutral phrase.

- [ ] **Step 4: Register the test**

Add `tests/user-facing-code-hygiene.test.js` to both `test:unit` and `test:coverage` in `package.json`.

- [ ] **Step 5: Run focused checks**

```bash
node --test tests/user-facing-code-hygiene.test.js tests/util.test.js
npm run check
```

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add miniprogram/utils/user-facing-text.js tests/user-facing-code-hygiene.test.js package.json
git commit -m "feat: sanitize user-facing internal codes"
```

### Task 2: Make paper display output readable without raw-ID fallbacks

**Files:**
- Modify: `miniprogram/utils/paper-display.js`
- Test: `tests/paper-display-date.test.js`
- Test: `tests/paper-preview-presenter.test.js`

- [ ] **Step 1: Add failing legacy-paper tests**

Use a paper whose `bottleneckTargets` contains 30 `BN-*` IDs and whose questions have no `lpName`. Assert:

```js
const display = buildPaperDisplay(paper, '数学')
assert.equal(display.bottleneckText, '覆盖 30 个数学学习卡点')
const visibleHierarchy = display.bottleneckHierarchy.groups.map(group => ({
  title: group.title,
  summaryText: group.summaryText,
  families: (group.families || []).map(family => ({
    title: family.title,
    summaryText: family.summaryText,
    items: (family.items || []).map(item => ({
      displayName: item.displayName,
      detailText: item.detailText
    }))
  }))
}))
assert.doesNotMatch(JSON.stringify({
  bottleneckText: display.bottleneckText,
  coverageText: display.coverageText,
  visibleHierarchy
}), /BN-|LP-|ERR-/)
```

Also assert that `paperCode` remains available to paper detail presenters.

- [ ] **Step 2: Run focused tests and verify failure**

```bash
node --test tests/paper-display-date.test.js tests/paper-preview-presenter.test.js
```

Expected: FAIL because raw target IDs can become summaries.

- [ ] **Step 3: Replace visible fallback behavior**

Keep `targetId`, `bottleneckId`, and `lpCode` for grouping and URLs, but build visible fields only from `readableNameOf`. Add a `paperCoverageText(paper, subjectName)` helper that returns:

```js
readableNames.length > 0
  ? `重点复测：${compactReadableTargets(readableNames, { totalCount })}`
  : totalCount > 0
    ? `覆盖 ${totalCount} 个${subjectName}学习卡点`
    : '覆盖本轮重点学习内容'
```

Do not change `paperCodeOf`; paper detail still needs the human paper code.

- [ ] **Step 4: Run paper tests**

```bash
node --test tests/paper-display-date.test.js tests/paper-preview-presenter.test.js tests/paper-page-flows.test.js
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add miniprogram/utils/paper-display.js tests/paper-display-date.test.js tests/paper-preview-presenter.test.js
git commit -m "fix: keep internal targets out of paper labels"
```

### Task 3: Redesign and sanitize the learning record timeline

**Files:**
- Modify: `miniprogram/pages/upload-history/upload-history-presenter.js`
- Modify: `miniprogram/pages/upload-history/upload-history.wxml`
- Modify: `miniprogram/pages/upload-history/upload-history.wxss`
- Modify: `tests/upload-history-page-flows.test.js`

- [ ] **Step 1: Add failing screenshot-regression fixtures**

Create a verification paper fixture matching the reported problem: dozens of `BN-*` targets, one student page, one answer page, and a saved paper display code. Assert the resulting timeline event:

```js
assert.equal(event.showPaperCode, true)
assert.equal(event.paperCode, '数学-20260712-06')
assert.match(event.summary, /覆盖 39 个数学学习卡点|重点复测/)
assert.doesNotMatch(JSON.stringify(event), /BN-|LP-|ERR-/)
assert.ok(event.chips.length <= 3)
```

- [ ] **Step 2: Run and verify failure**

```bash
node --test --test-name-pattern="internal code|compact paper" tests/upload-history-page-flows.test.js
```

Expected: FAIL on raw bottleneck text and overly verbose card content.

- [ ] **Step 3: Build compact paper events**

In `buildPaperEvent`:

- retain `paperCode` and `showPaperCode` as a compact subject/date/sequence identifier;
- use `display.coverageText` rather than `display.bottleneckText`;
- keep at most three actionable chips: question count, page count, return progress;
- use semantic icon `🧪` or `📝` instead of the text glyph `卷`;
- limit summary to readable coverage plus one next-step sentence;
- sanitize all title, summary, status, and chip output.

In `buildReportEvent`, keep at most one compact paper-code relationship chip when it helps distinguish a printed sheet; link the verification relationship through the event action.

- [ ] **Step 4: Simplify WXML and spacing**

Compress `.paper-code-row` into the secondary metadata line. Add compact state/action rows and reduce `.record-card`, `.event-body`, `.chips`, and day-group vertical gaps by 20-30%. Keep the whole card clickable and preserve folded photo evidence.

- [ ] **Step 5: Run timeline tests**

```bash
node --test tests/upload-history-page-flows.test.js tests/learning-records.test.js tests/paper-preview-presenter.test.js
```

Expected: PASS with no internal IDs and with readable paper codes preserved compactly.

- [ ] **Step 6: Commit**

```bash
git add miniprogram/pages/upload-history tests/upload-history-page-flows.test.js
git commit -m "feat: simplify learning record timeline"
```

### Task 4: Audit every registered user-facing surface

**Files:**
- Modify as findings require: listed presenter/controller files in the File Map
- Modify: `tests/user-facing-code-hygiene.test.js`
- Modify: `tests/bplus-design-system.test.js`

- [ ] **Step 1: Add a manifest-derived audit test**

Read all main and subpackage pages from `miniprogram/app.json`. Build a fixture registry with one entry for every registered page, whether the page uses a dedicated presenter or prepares visible data in its controller. Exercise normal, loading, error, empty, and ID-only legacy states that the page supports. Scan WXML visible bindings plus fixture output, while explicitly ignoring `data-*` attributes, route query construction, and internal object keys. Fail with page, state, and field context when visible output contains an internal code or a raw document/file/resource/route identifier.

The registry assertion must prove its keys exactly equal the manifest-derived page list, so a newly registered page fails until it supplies code-hygiene fixtures. Include controller-only surfaces such as `bottleneck-detail`, and cover generic opaque-ID fallbacks in addition to known prefixes. Explicitly classify human paper display codes as readable information so the sanitizer and audit gate preserve them on relevant pages.

Add source-level checks for dangerous visible fallbacks:

```js
assert.doesNotMatch(presenterSource, /displayName\s*\|\|[^\n]*(?:bottleneckId|lpCode|nodeId|targetId)/)
assert.doesNotMatch(controllerSource, /(?:title|label|summary|message|name|text)\s*:\s*[^\n]*(?:documentId|fileId|resourceId|routeId|bottleneckId|lpCode|nodeId|targetId)/)
assert.doesNotMatch(wxmlVisibleText, /\{\{[^}]+(?:documentId|fileId|resourceId|routeId|bottleneckId|lpCode|nodeId|pageCode)[^}]*\}\}/)
```

- [ ] **Step 2: Run the audit and collect all failures once**

```bash
node --test tests/user-facing-code-hygiene.test.js
```

Expected: FAIL listing every remaining surface rather than stopping at the first page.

- [ ] **Step 3: Fix presenters at output boundaries**

For each failure, retain raw IDs in navigation payloads but sanitize visible fields using `readableNameOf`, `sanitizeUserText`, or `compactReadableTargets`. Do not duplicate regexes in page controllers.

- [ ] **Step 4: Add regression fixtures for each repaired presenter**

Each touched presenter or controller receives one ID-only legacy fixture proving it renders a readable fallback and no ID. Include `bottleneck-detail` and every other controller-only page found by the manifest registry. Do not add broad snapshots; assert exact user-facing fields and keep raw IDs only in explicitly allowlisted navigation/data fields.

- [ ] **Step 5: Run the full user-facing presenter set**

```bash
node --test --test-concurrency=1 tests/user-facing-code-hygiene.test.js tests/report-presenter.test.js tests/paper-preview-presenter.test.js tests/subject-home-presenter.test.js tests/learning-resource-presenter.test.js tests/knowledge-map-page-controller.test.js tests/bottleneck-page-flows.test.js tests/generate-verification-page-flows.test.js
```

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add miniprogram tests/user-facing-code-hygiene.test.js tests/bplus-design-system.test.js
git commit -m "fix: prevent internal codes across user pages"
```

### Task 5: Extend the family presenter with a compact icon contract

**Files:**
- Modify: `miniprogram/utils/child-workbench.js`
- Modify: `tests/index-presenter.test.js`

- [ ] **Step 1: Write failing child-card contract tests**

Assert that a representative child card preserves every section and adds semantic icons:

```js
assert.equal(card.statusItems.length, 4)
assert.ok(card.statusItems.every(item => item.icon && item.shortLabel))
assert.ok(card.priorityAction.icon)
assert.equal(card.subjectRows.length, 3)
assert.deepEqual(card.subjectRows.map(item => item.icon), ['📐', '📖', '🔤'])
assert.ok(card.latestDiagnosis.icon)
assert.ok(card.quickLinks.every(item => item.icon))
assert.doesNotMatch(JSON.stringify(card), /BN-|LP-|ERR-/)
assert.match(JSON.stringify(card), /数学-20260712-06/)
```

Also assert the household summary exposes exactly four compact icon metrics:

```js
assert.deepEqual(hero.stats.map(item => item.key), [
  'children', 'pendingActions', 'improvements', 'formalDiagnoses'
])
assert.ok(hero.stats.every(item => item.icon && item.value !== undefined))
```

- [ ] **Step 2: Run and verify failure**

```bash
node --test --test-name-pattern="compact icon contract" tests/index-presenter.test.js
```

- [ ] **Step 3: Add semantic fields using the shared icon map**

Use `UI_ICONS` and `subjectIcon` from `utils/ui-icons.js`. Keep human paper display codes in compact paper summaries and quick links while ensuring internal IDs never enter visible fields. Suggested mapping:

- metrics: `🧩` active, `🧪` waiting, `🔁` persisting, `✅` improved;
- priority: `🧪`, `📤`, or `📚` by action type;
- diagnosis: `🩺` plus subject icon;
- quick links: `📋` diagnosis, `🧾` paper, `🗺️` map, `🕘` records.

Build the household summary as four metrics: children, pending actions, improvements, and formal diagnoses. Each metric has a stable `key`, semantic `icon`, compact label, and numeric value derived from the child cards.

Add short labels and compact summaries in the presenter; WXML must not infer icon meaning or truncate IDs.

- [ ] **Step 4: Run presenter tests**

```bash
node --test tests/index-presenter.test.js tests/index-page-flows.test.js
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add miniprogram/utils/child-workbench.js tests/index-presenter.test.js
git commit -m "feat: add family workbench icon contract"
```

### Task 6: Rebuild the family workbench as a dense B+ surface

**Files:**
- Modify: `miniprogram/pages/index/index.wxml`
- Modify: `miniprogram/pages/index/index.wxss`
- Modify: `tests/index-page-flows.test.js`

- [ ] **Step 1: Add failing static layout assertions**

Require semantic icon elements and dense classes while proving all sections remain:

```js
for (const marker of [
  'family-metric-strip',
  'child-identity-row',
  'child-priority-row',
  'child-subject-status',
  'child-diagnosis-row',
  'child-quick-actions'
]) assert.match(wxml, new RegExp(marker))

assert.match(wxss, /grid-template-columns:\s*repeat\(4/)
assert.match(wxss, /\.child-card\s*\{[^}]*border-radius:\s*(?:12|14|16)rpx/s)
```

- [ ] **Step 2: Run and verify failure**

```bash
node --test --test-name-pattern="family workbench.*dense|redesigned personal" tests/index-page-flows.test.js
```

- [ ] **Step 3: Rewrite family-mode markup**

Keep single-profile markup unchanged. In family mode:

- replace text-only management links with icon plus text;
- make household summary a short icon metric band;
- make identity metadata a two-line maximum row;
- render four metrics as icon/number/label compact cells;
- turn priority and secondary actions into icon rows;
- add subject icons and short state labels;
- keep latest formal diagnosis before quick actions;
- render quick links as four stable icon buttons.

- [ ] **Step 4: Compress family-mode WXSS**

Use stable dimensions and responsive constraints. Target reductions:

- child-card padding: current 22rpx to 14-16rpx;
- child-card radius: current 22rpx to 14-16rpx;
- metric cell minimum height: current 94rpx to 58-66rpx;
- section gaps: current 14-18rpx to 8-10rpx;
- identity avatar: current 76rpx to 56-62rpx.

Keep action hit areas usable by applying minimum heights to clickable rows rather than adding empty card padding.

- [ ] **Step 5: Run family tests**

```bash
node --test tests/index-presenter.test.js tests/index-page-flows.test.js tests/bplus-design-system.test.js
npm run check:size
```

Expected: PASS and package remains under 800 KB.

- [ ] **Step 6: Commit**

```bash
git add miniprogram/pages/index tests/index-page-flows.test.js
git commit -m "feat: densify family B+ workbench"
```

### Task 7: Verify density and no-code behavior in WeChat DevTools

**Files:**
- Modify: `scripts/devtools-e2e-fullpage.js`
- Create: `scripts/devtools-family-density-e2e.js`
- Modify: `package.json`

- [ ] **Step 1: Add DevTools assertions**

Use a two-child fixture containing long child names, long readable concepts, and ID-only legacy data. On the family page and learning history page, retrieve rendered text and assert it does not match:

```js
/(?:BN|LP|ERR|NODE|RES)-[A-Z0-9_-]+|MATH-(?:NUM|GEO|MEASURE|STAT|ALG|MOD|META)-[A-Z0-9_-]+/
```

Use element bounds to enforce:

- at 390 x 844, the household summary and first child's identity, metric, and priority blocks are fully within the viewport, and the second `.child-identity-row` has `bottom <= 844`;
- at 430 x 932, the second `.family-metric-strip` bottom is within the first viewport;
- no card or action row exceeds viewport width;
- adjacent blocks do not overlap, long labels do not clip, and every visible action retains a usable hit area.

- [ ] **Step 2: Save success screenshots**

Always save family and learning-record screenshots under `tmp/e2e/family-density/`. These files are test artifacts and remain untracked.

- [ ] **Step 3: Commit E2E coverage**

```bash
git add scripts/devtools-e2e-fullpage.js scripts/devtools-family-density-e2e.js package.json
git commit -m "test: guard family density and code hygiene"
```

- [ ] **Step 4: Run final verification**

```bash
npm run verify
npm run check:size
npm run test:e2e:core
npm run test:e2e:knowledge-map
node scripts/devtools-family-density-e2e.js
```

Expected:

- all unit tests pass;
- main package remains below 800 KB;
- core E2E reports 23/23;
- knowledge-map E2E passes;
- family density assertions pass at both viewports;
- screenshots contain no internal IDs.

- [ ] **Step 5: Review the final diff**

```bash
git diff --check
git status --short
git log --oneline -8
```

Expected: no whitespace errors, only intended files changed, all implementation tasks committed, and the working tree contains no unintended changes after the final verification.

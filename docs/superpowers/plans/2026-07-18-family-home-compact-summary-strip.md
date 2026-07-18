# Family Home Compact Summary Strip Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the repetitive family overview hero with a non-interactive 64–72rpx summary strip that shows current child-card snapshot totals without changing any child-card workflow.

**Architecture:** Continue deriving the family summary from `buildChildWorkbenchCards()` output, but return compact metrics instead of a second priority-action card. Render those metrics in one accessible, non-clickable WXML row and extend the existing family-density validator to protect height, wrapping, and clipping at supported narrow viewports.

**Tech Stack:** WeChat Mini Program WXML/WXSS/JavaScript, Node.js `node:test`, existing DevTools `miniprogram-automator` density suite.

**Design spec:** `docs/superpowers/specs/2026-07-18-family-home-compact-summary-strip-design.md`

**Dirty-worktree rule:** The implementation files already contain unrelated, uncommitted changes. Read the live file immediately before every patch, edit only the family-summary blocks named below, and never restore a file from `HEAD`. Do not make an intermediate code commit if it would include unrelated hunks from the same file; commit only isolated plan/spec files until the other work is committed or explicit hunk staging is safe.

---

### Task 1: Define the compact snapshot model test-first

**Files:**
- Modify: `tests/index-presenter.test.js` around the existing `buildFamilyWorkbenchHero` assertions
- Modify: `miniprogram/utils/child-workbench.js` in `buildFamilyWorkbenchHero()` only

- [ ] **Step 1: Replace the old action-hero assertions with the compact model contract**

Cover the normal mixed state:

```js
const summary = buildFamilyWorkbenchHero(cards)
assert.equal(summary.label, '家庭今日')
assert.equal(summary.idleText, '')
assert.deepEqual(summary.metrics, [
  { key: 'pending', label: '待处理', value: 2, displayValue: '2', tone: 'waiting' },
  { key: 'pendingUpload', label: '待上传', value: 1, displayValue: '1', tone: 'destructive' },
  { key: 'improved', label: '已改善', value: 1, displayValue: '1', tone: 'improved' }
])
assert.equal(summary.ariaLabel, '家庭今日，2项待处理，1项待上传，1项已改善')
for (const obsolete of ['title', 'summary', 'actionText', 'url', 'kickerSymbol', 'statusSegments']) {
  assert.equal(summary[obsolete], undefined)
}
```

- [ ] **Step 2: Add a four-state table test and overflow test**

Build minimal cards whose `statusItems` contain the exact keys consumed by `numericStatusValue()` and assert:

```text
pending-only  -> idleText '' + pending metric
upload-only   -> idleText '' + pendingUpload metric
improved-only -> idleText '今日无待办' + improved metric
all-zero      -> idleText '今日无待办' + metrics []
value 100     -> value 100 + displayValue '99+'
```

Also assert that empty/non-array card input still returns `null`.

- [ ] **Step 3: Run the complete presenter test file and confirm the old hero contracts fail**

Replace both existing old-model assertion groups: the family hero title/summary/action/url block and the later `statusSegments` aggregation block. Running the whole file is intentional so no stale hero assertion is hidden by a narrow name pattern.

Run:

```bash
node --test tests/index-presenter.test.js
```

Expected: failures reference missing `metrics`, `idleText`, or `ariaLabel`.

- [ ] **Step 4: Implement compact metric helpers inside `child-workbench.js`**

Keep the change local to the family-summary section. A minimal shape is:

```js
function compactMetric(key, label, value, tone) {
  const count = Math.max(0, Number(value) || 0)
  if (count === 0) return null
  return {
    key,
    label,
    value: count,
    displayValue: count > 99 ? '99+' : String(count),
    tone
  }
}

function buildFamilyWorkbenchHero(cards = []) {
  const visibleCards = Array.isArray(cards) ? cards.filter(Boolean) : []
  if (visibleCards.length === 0) return null

  const pending = visibleCards.reduce((sum, card) => (
    sum + numericStatusValue(card, 'analyzing') + numericStatusValue(card, 'pendingVerification')
  ), 0)
  const pendingUpload = visibleCards.reduce((sum, card) => sum + numericStatusValue(card, 'pendingUpload'), 0)
  const improved = visibleCards.reduce((sum, card) => sum + numericStatusValue(card, 'improved'), 0)
  const metrics = [
    compactMetric('pending', '待处理', pending, 'waiting'),
    compactMetric('pendingUpload', '待上传', pendingUpload, 'destructive'),
    compactMetric('improved', '已改善', improved, 'improved')
  ].filter(Boolean)
  const idleText = pending === 0 && pendingUpload === 0 ? '今日无待办' : ''
  const spoken = [idleText, ...metrics.map(item => `${item.value}项${item.label}`)].filter(Boolean)

  return {
    label: '家庭今日',
    metrics,
    idleText,
    ariaLabel: ['家庭今日', ...spoken].join('，')
  }
}
```

Do not touch child-card construction, subject ordering, diagnostics, priority actions, quick links, node-mastery actions, or exports.

- [ ] **Step 5: Run the complete presenter test file and confirm it passes**

Run the Step 3 command. Expected: the entire file passes.

---

### Task 2: Replace only the hero markup and dedicated styles

**Files:**
- Modify: `tests/index-page-flows.test.js` in the family-summary contract test
- Modify: `miniprogram/pages/index/index.wxml` only between the old family hero opening and closing tags
- Modify: `miniprogram/pages/index/index.wxss` only old family-hero selectors and new summary-strip selectors
- Modify: `miniprogram/pages/index/index.js` only the obsolete `familyHeroSymbol` data field if it has no other consumer

- [ ] **Step 1: Replace every old family-hero WXML/WXSS contract before markup changes**

Update all old contracts in `tests/index-page-flows.test.js`, including the restored-sections test, B1 hierarchy test, dense-marker list, traceable family-actions test, and the kicker/status-bar test near the end of the file. Do not leave an assertion for `family-workbench-hero`, `b1-family-summary`, `family-hero-segments`, a hero tap binding, `kickerSymbol`, or `statusSegments`.

Assert that `.family-summary-strip`:

- is gated by family mode and `familyHero`;
- has `aria-label="{{familyHero.ariaLabel}}"`;
- has no `bindtap`, `catchtap`, `data-url`, arrow, symbol, title, summary, action, or segment markup;
- renders `familyHero.label`, optional `familyHero.idleText`, and `familyHero.metrics` with `displayValue` + `label`;
- assigns stable tone classes `family-summary-metric-{{item.tone}}`.

Continue asserting the existing child-card tag keeps `bindtap="onStudentTap"`, identity data attributes, and every traceable child action binding.

- [ ] **Step 2: Add CSS contract assertions**

Assert `.family-summary-strip` uses an explicit fixed height between 64rpx and 72rpx and has:

```text
box-sizing: border-box
display: flex
align-items: center
height: 68rpx
padding no greater than 16rpx horizontally
border-radius no greater than 8rpx
overflow: hidden
```

Assert `.family-summary-metrics` is a non-wrapping flex row with `min-width: 0`, and metric labels use `white-space: nowrap`. Assert no `.family-summary-strip:active` rule exists.

- [ ] **Step 3: Run the focused page contract and confirm it fails**

Run the whole page-flow file so all historical hero contracts are exercised:

```bash
node --test tests/index-page-flows.test.js
```

Expected: the old clickable hero violates the new contract.

- [ ] **Step 4: Replace the old WXML block**

Use this structure, adapting only class names if current local conventions require it:

```xml
<view
  class="family-summary-strip"
  wx:if="{{homeMode === 'family-workbench' && familyHero}}"
  aria-label="{{familyHero.ariaLabel}}"
>
  <text class="family-summary-label">{{familyHero.label}}</text>
  <view class="family-summary-metrics">
    <text class="family-summary-idle" wx:if="{{familyHero.idleText}}">{{familyHero.idleText}}</text>
    <text
      class="family-summary-metric family-summary-metric-{{item.tone}}"
      wx:for="{{familyHero.metrics}}"
      wx:key="key"
    >{{item.displayValue}} {{item.label}}</text>
  </view>
</view>
```

Do not change any line inside the following `.child-workbench-section` or `.child-card` subtree.

- [ ] **Step 5: Replace only dedicated hero CSS**

Remove obsolete `.family-workbench-hero`, `.family-hero-*`, `.b1-family-summary*` and `.family-hero-deco` declarations. If a rule combines a hero selector with personal selectors, remove only the hero selector and retain the rest. Add a compact, non-gradient, non-shadow summary strip using existing B1 semantic colors. Use this executable narrow-screen contract:

```css
.family-summary-strip {
  box-sizing: border-box;
  height: 68rpx;
  margin-top: 10rpx;
  padding: 0 16rpx;
  border: 1rpx solid #b9d8cd;
  border-radius: 8rpx;
  background: #edf7f3;
  display: flex;
  align-items: center;
  gap: 12rpx;
  overflow: hidden;
}

.family-summary-label {
  flex: 0 0 auto;
  color: #285f53;
  font-size: 20rpx;
  font-weight: 800;
  line-height: 28rpx;
  white-space: nowrap;
}

.family-summary-metrics {
  min-width: 0;
  flex: 1;
  display: flex;
  align-items: center;
  justify-content: flex-end;
  gap: 10rpx;
  overflow: hidden;
  white-space: nowrap;
}

.family-summary-idle,
.family-summary-metric {
  flex: 0 0 auto;
  font-size: 19rpx;
  font-weight: 750;
  line-height: 28rpx;
  white-space: nowrap;
}
```

Add restrained semantic tone colors for waiting, destructive, and improved. Do not add pseudo-active state, shadow, gradient, or decorative symbol. The 68rpx height, 28rpx line box, fixed flex items, and clipped metrics row are the 360px fit contract.

- [ ] **Step 6: Remove only the unused symbol binding**

Delete `familyHeroSymbol: symbolOf('familyFull')` from `index.js` only after `rg -n "familyHeroSymbol" miniprogram/pages/index` confirms no remaining consumer. Do not alter other symbol bindings.

- [ ] **Step 7: Run the focused model and page tests**

Run:

```bash
node --test tests/index-presenter.test.js tests/index-page-flows.test.js
```

Expected: all tests pass.

---

### Task 3: Extend the real viewport density guard

**Files:**
- Modify: `tests/family-density-e2e-validator.test.js`
- Modify: `scripts/devtools-family-density-e2e.js`

- [ ] **Step 1: Extend the validator fixture with summary metrics**

Change `householdSummaryRect` from the old 92px hero fixture to a compact height matching 72rpx at each viewport. Add both the stable label and rendered item rectangles:

```js
householdSummaryLabelRect: rect(...),
householdSummaryItemRects: [
  rect(...),
  rect(...),
  rect(...)
]
```

Add failing cases for a summary taller than the converted 72rpx limit, an item outside the summary container, a zero-size label/item, an item taller than the converted 30rpx one-line limit, and an item whose vertical center is misaligned from the stable label by more than 2px.

- [ ] **Step 2: Run validator tests and confirm the new cases fail**

Run:

```bash
node --test tests/family-density-e2e-validator.test.js
```

- [ ] **Step 3: Implement compact-summary geometry checks**

In `validateFamilyDensityMetrics()`:

- calculate the pixel limit as `72 * viewport.width / 750` plus the existing edge tolerance;
- require summary width/height greater than zero;
- reject summary height above the converted limit;
- call `assertContainedBy()` for the stable label and every metric/idle item rect;
- require the stable label and every item height to be no greater than `30 * viewport.width / 750` plus tolerance;
- compare every item's vertical center with `.family-summary-label` and reject a difference greater than 2px, which catches a second line even when it remains inside the container.

Keep existing child identity, card, action, practical-height, and internal-code validations unchanged.

- [ ] **Step 4: Update DevTools metric collection**

Collect `.family-summary-strip`, `.family-summary-label`, every `.family-summary-metric`, and optional `.family-summary-idle` bounding boxes. Store metrics and idle together as `householdSummaryItemRects`. Do not rely only on text content. Keep the existing supported viewport list and two-child checks.

Also validate rendered family text at each viewport:

- `家庭今日` occurs exactly once;
- `家庭今日总览`, `处理今日优先行动`, `可以从这里直接进入最需要处理的一步`, and text matching `今天先看.*学习行动` do not occur;
- the expected compact count labels from the fixture are present.

- [ ] **Step 5: Run the validator and family-focused suite**

Run:

```bash
node --test tests/family-density-e2e-validator.test.js tests/index-presenter.test.js tests/index-page-flows.test.js
```

Expected: all tests pass.

---

### Task 4: Regression verification and delivery

**Files:**
- Verify only; do not broaden implementation scope

- [ ] **Step 1: Check that obsolete family hero UI is gone**

Run:

```bash
rg -n "家庭今日总览|今天先看.*学习行动|处理今日优先行动|family-workbench-hero|family-hero-|b1-family-summary|familyHeroSymbol" miniprogram/pages/index miniprogram/utils/child-workbench.js tests/index-presenter.test.js tests/index-page-flows.test.js
```

Expected: no matches, except a test assertion explicitly checking that obsolete text is absent.

- [ ] **Step 2: Run focused and global offline checks**

```bash
node --test tests/family-density-e2e-validator.test.js tests/index-presenter.test.js tests/index-page-flows.test.js
npm run check
git diff --check
```

Expected: all commands exit 0.

- [ ] **Step 3: Run DevTools density verification when available**

```bash
npm run test:e2e:family-density
```

Expected: 360x800 and 390x844 summary bounds pass and screenshots show the second child earlier. If the WeChat DevTools service port is disabled, record that environmental limitation without weakening offline checks.

- [ ] **Step 4: Review the exact shared-file diff**

Confirm `git diff -- miniprogram/utils/child-workbench.js miniprogram/pages/index/index.js miniprogram/pages/index/index.wxml miniprogram/pages/index/index.wxss tests/index-presenter.test.js tests/index-page-flows.test.js scripts/devtools-family-density-e2e.js tests/family-density-e2e-validator.test.js` contains only the compact-summary changes plus pre-existing concurrent work. Do not stage or commit unrelated hunks.

- [ ] **Step 5: Commit only when shared-file ownership is clear**

If concurrent changes in the same files have already been committed, stage the implementation files and commit:

```bash
git commit -m "feat: compact family home summary"
```

Otherwise leave the verified implementation uncommitted and report the exact overlapping files; never use a broad `git add .`.

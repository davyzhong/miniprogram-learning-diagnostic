# Practical Emoji Compatibility Lab Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Move the temporary seven-symbol homepage panel into a standalone WeChat Mini Program page containing a stable, categorized 202-item practical Emoji compatibility library.

**Architecture:** Keep production-safe symbols in `utils/ui-symbols.js` and place unverified candidates in a separate page-owned manifest. The homepage exposes only a compact text entry. The test page loads one category at a time, records device metadata locally, and copies stable category or item IDs for external feedback without cloud persistence.

**Tech Stack:** WeChat Mini Program JavaScript/WXML/WXSS, Node.js built-in test runner, existing B1 design tokens and page harness.

---

## File Map

- Create `miniprogram/pages/icon-compatibility/emoji-candidates.js`: frozen 14-category, 202-item candidate manifest and validation helpers.
- Create `miniprogram/pages/icon-compatibility/icon-compatibility.js`: page state, environment detection, category navigation, and clipboard handlers.
- Create `miniprogram/pages/icon-compatibility/icon-compatibility.wxml`: category tabs, active-category grid, and stable navigation controls.
- Create `miniprogram/pages/icon-compatibility/icon-compatibility.wxss`: compact B1-compatible test layout.
- Create `miniprogram/pages/icon-compatibility/icon-compatibility.json`: page title.
- Modify `miniprogram/app.json`: register the low-frequency page as a `pages/icon-compatibility` subpackage.
- Modify `miniprogram/pages/index/index.js`: remove temporary test data import/state.
- Modify `miniprogram/pages/index/index.wxml`: replace the expanded panel with the compact test-page entry.
- Modify `miniprogram/pages/index/index.wxss`: remove panel styles and add entry styles.
- Modify `miniprogram/utils/ui-symbols.js`: retain only production whitelist responsibilities.
- Create `tests/emoji-candidates.test.js`: schema, count, code-point, uniqueness, snapshot, and C01 isolation contracts.
- Create `tests/icon-compatibility-page-flows.test.js`: page state, environment fallback, navigation, and clipboard behavior.
- Modify `tests/index-page-flows.test.js`: assert panel removal and standalone-page entry.
- Modify `tests/ui-symbols.test.js`: remove temporary homepage test-list contract.
- Modify `tests/bplus-design-system.test.js`: narrowly exempt only the candidate manifest and update route count.
- Modify `package.json`: include the two new tests in unit and coverage commands.
- Create `docs/performance/emoji-compatibility-lab-baseline.md`: source and DevTools compiled/upload before/after measurements.

### Task 0: Preserve the Dirty Worktree and Record Baselines

**Files:**
- Create: `docs/performance/emoji-compatibility-lab-baseline.md`
- Delete: `docs/superpowers/specs/2026-07-17-family-home-icon-compatibility-test-design.md` (superseded untracked draft created for the temporary panel)

- [ ] **Step 1: Record the existing worktree without resetting it**

Run: `git status --short --branch && git diff -- miniprogram/pages/index/index.js miniprogram/pages/index/index.wxml miniprogram/pages/index/index.wxss miniprogram/utils/ui-symbols.js tests/index-page-flows.test.js tests/ui-symbols.test.js`

Expected: the six temporary-panel files remain modified. Do not reset, checkout, clean, or stash them; Task 4 migrates these exact edits in place. Preserve any unrelated user changes.

- [ ] **Step 2: Record the source-size baseline**

Run: `npm run check:size`

Expected baseline: approximately 680 KB and below the repository's 800 KB source budget. Write the exact output and timestamp into the verification report.

- [ ] **Step 3: Record the DevTools compiled/upload baseline**

Run `WECHAT_DEVTOOLS_CLI=/Applications/wechatwebdevtools.app/Contents/MacOS/cli npm run test:e2e:doctor` and compile the project in DevTools. Read the exact package values from **详情 → 基本信息 → 本地代码 → 代码包大小** and record main-package bytes, DevTools version, and timestamp. This value is mandatory for the `<= 30 KB` delta gate; if the UI does not expose bytes, record the displayed KB precision and mark the exact-byte gate unverified rather than claiming it passed.

- [ ] **Step 4: Remove only the superseded temporary design draft**

Delete the untracked `2026-07-17-family-home-icon-compatibility-test-design.md`; do not delete the approved practical-lab spec.

### Task 1: Freeze and Validate the Candidate Manifest

**Files:**
- Create: `miniprogram/pages/icon-compatibility/emoji-candidates.js`
- Create: `tests/emoji-candidates.test.js`

- [ ] **Step 1: Write failing manifest contract tests**

Test that the module exports 14 categories and exactly 202 items; every category has the exact approved ID, name, nonempty frozen `riskNote`, and items; every item has the exact approved ID, glyph, Chinese label, and Unicode scalar sequence. Freeze the complete `id:glyph:label:sequence` mapping and category metadata in snapshots. Explicitly assert category ID uniqueness, item ID uniqueness, scalar-sequence uniqueness, and deep freezing. Snapshot C01's exact seven mappings and `首批已验证` status, assert all seven C01 glyphs are approved by `isApprovedUiSymbol()`, record the implementation-time seven-symbol `UI_SYMBOLS` baseline separately, and assert that no C02–C14 candidate is approved. Do not permanently require future `UI_SYMBOLS` additions to belong to C01.

- [ ] **Step 2: Run the manifest test and confirm module-not-found failure**

Run: `node --test tests/emoji-candidates.test.js`

Expected: FAIL because `emoji-candidates.js` does not exist.

- [ ] **Step 3: Implement the frozen manifest**

Implement the 202-item normative list from the approved spec. Export deeply frozen `EMOJI_CATEGORIES`, `EMOJI_CANDIDATE_COUNT`, `findCategory(categoryId)`, and `unicodeSequence(glyph)`. Keep C01 exactly equal to the seven current production symbols, but do not import the remaining candidates into `ui-symbols.js`.

- [ ] **Step 4: Run manifest tests**

Run: `node --test tests/emoji-candidates.test.js`

Expected: PASS with 202 unique items and no ID drift.

- [ ] **Step 5: Commit the manifest slice**

```bash
git add miniprogram/pages/icon-compatibility/emoji-candidates.js tests/emoji-candidates.test.js
git commit -m "feat: add practical emoji candidate manifest"
```

### Task 2: Build the Standalone Compatibility Page Controller

**Files:**
- Create: `miniprogram/pages/icon-compatibility/icon-compatibility.js`
- Create: `tests/icon-compatibility-page-flows.test.js`

- [ ] **Step 1: Write failing controller tests**

Use the existing page harness. Assert initial C01 selection, only-current-category state, environment reads using `wx.getDeviceInfo()` and `wx.getAppBaseInfo()`, legacy `wx.getSystemInfoSync()` fallback, unavailable-field fallback, and the complete-failure cases where all APIs are absent or throw produce “环境信息不可用”. Also assert category selection, disabled first/last boundaries, previous/next behavior, and exact clipboard payloads for category and item IDs.

- [ ] **Step 2: Run the controller test and confirm failure**

Run: `node --test tests/icon-compatibility-page-flows.test.js`

Expected: FAIL because the page controller does not exist.

- [ ] **Step 3: Implement minimal page state and handlers**

Keep the complete manifest module-private. Initialize `categoryTabs` as metadata-only objects with no `items` property, plus `activeCategory`, `activeItems`, `activeCategoryIndex`, `activeTabId`, `isFirstCategory`, `isLastCategory`, and `environmentText`. Tests must recursively verify that no inactive glyph or inactive item array enters `page.data`. Add `selectCategory(index)`, `onCategoryTap`, `onPreviousCategory`, `onNextCategory`, `onCopyCategoryId`, and `onCopyItemId`. Guard all optional WeChat APIs and show `wx.showToast({ icon: 'none' })` on clipboard failure.

- [ ] **Step 4: Run controller tests**

Run: `node --test tests/icon-compatibility-page-flows.test.js`

Expected: PASS.

- [ ] **Step 5: Commit the controller slice**

```bash
git add miniprogram/pages/icon-compatibility/icon-compatibility.js tests/icon-compatibility-page-flows.test.js
git commit -m "feat: add emoji compatibility page controller"
```

### Task 3: Render the Test Page and Register Its Route

**Files:**
- Create: `miniprogram/pages/icon-compatibility/icon-compatibility.wxml`
- Create: `miniprogram/pages/icon-compatibility/icon-compatibility.wxss`
- Create: `miniprogram/pages/icon-compatibility/icon-compatibility.json`
- Modify: `miniprogram/app.json`
- Modify: `tests/icon-compatibility-page-flows.test.js`

- [ ] **Step 1: Add failing template and route assertions**

Assert the B1 page root, environment summary, horizontal category scroll view with `scroll-into-view`, active category title, current-category item count, risk note, C01 visible “首批已验证” status, four-column `activeItems` grid, item ID and label, copy bindings, and stable disabled previous/next controls. Assert the route is registered exactly once under a `pages/icon-compatibility` subpackage and not in the main `pages` array.

- [ ] **Step 2: Run tests and confirm missing-template failures**

Run: `node --test tests/icon-compatibility-page-flows.test.js`

Expected: FAIL on missing WXML/WXSS/JSON and route.

- [ ] **Step 3: Implement WXML, WXSS, JSON, and route**

Use a compact four-column grid with fixed item dimensions. Render only `activeItems`, never nested all-category item loops. The active-category heading must render `{{activeItems.length}} 项`, and C01 must render its “首批已验证” status while other categories do not. Use B1 canvas/surface/ink/semantic tokens, 8–12rpx radii, and stable control dimensions. Keep all explanatory icons out of the page except the glyph under test. Register `{ "root": "pages/icon-compatibility", "pages": ["icon-compatibility"] }` in `subPackages`.

- [ ] **Step 4: Run page and design-system tests**

Run: `node --test tests/icon-compatibility-page-flows.test.js tests/bplus-design-system.test.js`

Expected: page tests PASS; the symbol scanner still fails until Task 5 adds the narrow manifest exception.

- [ ] **Step 5: Commit the rendered page**

```bash
git add miniprogram/app.json miniprogram/pages/icon-compatibility tests/icon-compatibility-page-flows.test.js
git commit -m "feat: render categorized emoji compatibility lab"
```

### Task 4: Replace the Homepage Panel With a Compact Entry

**Files:**
- Modify: `miniprogram/pages/index/index.js`
- Modify: `miniprogram/pages/index/index.wxml`
- Modify: `miniprogram/pages/index/index.wxss`
- Modify: `miniprogram/utils/ui-symbols.js`
- Modify: `tests/index-page-flows.test.js`
- Modify: `tests/ui-symbols.test.js`

- [ ] **Step 1: Update tests for the intended homepage contract**

Assert `icon-compatibility-panel`, `iconCompatibilityItems`, and expanded grid styles are absent. Assert one compact `icon-compatibility-entry` appears only in family-workbench mode and routes through `onTraceableUrlTap` to `/pages/icon-compatibility/icon-compatibility`. Keep the seven production whitelist assertions unchanged.

- [ ] **Step 2: Run focused tests and confirm old-panel failures**

Run: `node --test tests/index-page-flows.test.js tests/ui-symbols.test.js`

Expected: FAIL because the old panel remains.

- [ ] **Step 3: Migrate the homepage UI**

Remove `UI_SYMBOL_TEST_ITEMS`, its index import/data field, the expanded WXML panel, and its WXSS rules. Add a compact text-only entry between the title row and family summary with candidate count, short subtitle, and existing traceable navigation behavior.

- [ ] **Step 4: Run focused tests**

Run: `node --test tests/index-page-flows.test.js tests/ui-symbols.test.js`

Expected: PASS.

- [ ] **Step 5: Commit the homepage migration**

```bash
git add miniprogram/pages/index miniprogram/utils/ui-symbols.js tests/index-page-flows.test.js tests/ui-symbols.test.js
git commit -m "feat: move emoji testing off family homepage"
```

### Task 5: Protect Production UI and Wire the Full Test Suite

**Files:**
- Modify: `tests/bplus-design-system.test.js`
- Modify: `package.json`

- [ ] **Step 1: Add the narrow scanner exception test**

Exclude only the exact path `miniprogram/pages/icon-compatibility/emoji-candidates.js` from raw literal scanning. Continue scanning the compatibility page controller/template and every production page, and assert the exemption list equals that one path. Update the registered B1 route count from 24 to 25.

- [ ] **Step 2: Add new tests to npm scripts**

Insert `tests/emoji-candidates.test.js` and `tests/icon-compatibility-page-flows.test.js` into both `test:unit` and `test:coverage` without removing existing tests.

- [ ] **Step 3: Run all relevant contracts**

Run: `node --test --test-concurrency=1 tests/emoji-candidates.test.js tests/icon-compatibility-page-flows.test.js tests/index-page-flows.test.js tests/ui-symbols.test.js tests/bplus-design-system.test.js`

Expected: PASS.

- [ ] **Step 4: Commit test integration**

```bash
git add tests/bplus-design-system.test.js package.json
git commit -m "test: enforce emoji compatibility boundaries"
```

### Task 6: Verify Behavior, Syntax, and Package Budget

**Files:**
- Complete: `docs/performance/emoji-compatibility-lab-baseline.md`
- Modify other files only if verification exposes a defect.

- [ ] **Step 1: Run JavaScript syntax checks**

Run: `npm run check`

Expected: `Checked ... JavaScript files.` with exit code 0.

- [ ] **Step 2: Run the full unit suite**

Run: `npm run test:unit`

Expected: all tests PASS.

- [ ] **Step 3: Run coverage verification**

Run: `npm run test:coverage`

Expected: all configured coverage thresholds PASS, including the new manifest and page controller tests.

- [ ] **Step 4: Measure package size**

Run before and after implementation: `npm run check:size`

Expected: main package remains under the repository's 800 KB source budget. Re-run `WECHAT_DEVTOOLS_CLI=/Applications/wechatwebdevtools.app/Contents/MacOS/cli npm run test:e2e:doctor`, compile, and read after values from **详情 → 基本信息 → 本地代码 → 代码包大小** using the same precision as Task 0. Hard gates: compiled/upload main package `<= 2 MB` and delta `<= 30 KB`. Because the page is a subpackage, also record its compiled size. Store commands, versions, timestamps, before/after values, deltas, and pass/fail conclusions in the named report.

- [ ] **Step 5: Inspect the final diff**

Run: `git diff --check && git status --short && git log --oneline -6`

Expected: no whitespace errors; only intended files changed; implementation commits are present.

- [ ] **Step 6: Perform Android acceptance**

In WeChat DevTools, compile and generate a preview QR code. On Android, record test date, model, Android version, WeChat version, and SDKVersion; confirm the environment summary, C01–C14 navigation, four-column layout, clipboard IDs, and that only one category's glyphs render at a time. Record each category using the approved `pass / fail / uncertain` criteria; VS16 monochrome fallback and split ZWJ/flag/keycap sequences are failures. API-absence behavior is covered deterministically by the controller tests.

- [ ] **Step 7: Commit the verification report**

```bash
git add docs/performance/emoji-compatibility-lab-baseline.md
git commit -m "docs: establish emoji compatibility baseline"
```

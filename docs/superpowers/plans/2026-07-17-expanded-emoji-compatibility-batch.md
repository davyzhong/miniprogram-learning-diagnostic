# Expanded Emoji Compatibility Batch Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a second, exactly 1,000-item Android WeChat Emoji compatibility batch while preserving the verified 202-item first batch and rendering only one category at a time.

**Architecture:** Keep the existing first-batch module immutable. Build a checked-in, normative second-batch manifest from pinned Unicode Emoji 17.0 and CLDR 48.2 sources, generate one compact runtime module inside the existing test subpackage, and expose both datasets through a small batch adapter in the page controller. The page defaults to batch two, remembers one category index per batch, and never places the full 1,202-item collection in `setData`.

**Tech Stack:** WeChat Mini Program WXML/WXSS/CommonJS, Node.js 22 built-in test runner, Unicode Emoji 17.0 data, CLDR 48.2 XML, existing page harness and package-size scripts.

---

## File Structure

**Create**

- `scripts/emoji-compatibility/validate-batch-02-manifest.js`: downloads or reads pinned upstream files, verifies hashes, parses Emoji/CLDR records, and validates the already-authored normative manifest without selecting or reclassifying items.
- `scripts/emoji-compatibility/curate-batch-02-draft.js`: explicitly non-normative, one-off authoring helper that writes only `tmp/batch-02-draft.json`; it is never called by build, verify, tests, or runtime generation.
- `scripts/emoji-compatibility/batch-02-manifest.json`: authoritative 1,000-row public ID, category, order, sequence, label, label-source, and Emoji-version snapshot.
- `scripts/emoji-compatibility/generate-batch-02-runtime.js`: converts the normative manifest to compact runtime tuples without changing selection or labels.
- `miniprogram/pages/icon-compatibility/emoji-candidates-batch-02.js`: generated, frozen second-batch runtime data.
- `tests/emoji-batch-02-builder.test.js`: source parsing, checksum rejection, deterministic selection, and output reproducibility tests.
- `tests/emoji-batch-02.test.js`: normative manifest and runtime module contract tests.
- `scripts/devtools-emoji-compatibility-e2e.js`: DevTools automation for batch/category traversal, rendered-card counts, state restoration, and screenshots.
- `scripts/devtools-emoji-package-metrics.js`: runs DevTools Preview with `--info-output`, parses compiled package information, and enforces package budgets.
- `tests/emoji-compatibility-devtools.test.js`: fixture tests for package-info parsing and executable E2E acceptance helpers.
- `docs/performance/emoji-compatibility-batch-02-baseline.md`: before/after package and rendering baseline.

**Modify**

- `package.json`: add batch build/verify scripts and include new tests in unit and coverage suites.
- `package-lock.json`: pin `adm-zip` and `fast-xml-parser` as development-only source tooling.
- `miniprogram/pages/icon-compatibility/icon-compatibility.js`: batch adapter, independent batch positions, default batch-two state, and batch-ID copying.
- `miniprogram/pages/icon-compatibility/icon-compatibility.wxml`: batch summary and batch selector while keeping one active grid.
- `miniprogram/pages/icon-compatibility/icon-compatibility.wxss`: compact batch controls and long-ID-safe candidate cards.
- `miniprogram/pages/index/index.wxml`: update the entry summary to `1202 项候选 · 2 批次`.
- `tests/icon-compatibility-page-flows.test.js`: batch switching, state restoration, copy, and active-only rendering tests.
- `tests/index-page-flows.test.js`: exact homepage count contract.
- `tests/bplus-design-system.test.js`: exact two-file candidate-literal exemption and production import isolation.
- `tests/user-facing-code-hygiene.test.js`: retain the testing-page exception without widening user-facing internal-code exemptions.

**Do not modify**

- `miniprogram/pages/icon-compatibility/emoji-candidates.js`: immutable first-batch snapshot.
- `miniprogram/utils/ui-symbols.js`: production whitelist remains unchanged.

## Worktree Safety

The repository may contain concurrent user edits. Before implementation, save the initial state without changing it:

```bash
git status --short > tmp/emoji-batch-02-initial-status.txt
git diff -- miniprogram/pages/index/index.wxml > tmp/emoji-batch-02-index-before.patch
git hash-object miniprogram/pages/icon-compatibility/emoji-candidates.js > tmp/emoji-batch-01-worktree-blob.txt
git rev-parse HEAD:miniprogram/pages/icon-compatibility/emoji-candidates.js > tmp/emoji-batch-01-head-blob.txt
```

Never stage unrelated files. For files that were already dirty, inspect both `git diff` and `git diff --cached` before every commit. The homepage summary change must be staged as a synthetic HEAD-based blob containing only the one approved text replacement:

```bash
git show HEAD:miniprogram/pages/index/index.wxml > tmp/index-stage.wxml
perl -0pi -e 's/202 项候选 · 14 类 · Android 真机/1202 项候选 · 2 批次/' tmp/index-stage.wxml
blob=$(git hash-object -w tmp/index-stage.wxml)
git update-index --cacheinfo 100644,$blob,miniprogram/pages/index/index.wxml
git diff --cached --check
git diff --cached -- miniprogram/pages/index/index.wxml
```

After committing, verify that the user's pre-existing homepage diff remains in the worktree. Final delivery reports pre-existing changes separately and does not require a clean worktree.

## Task 1: Freeze Upstream Validation Contracts

**Files:**
- Create: `scripts/emoji-compatibility/validate-batch-02-manifest.js`
- Create: `tests/emoji-batch-02-builder.test.js`
- Modify: `package.json`
- Modify: `package-lock.json`

- [ ] **Step 1: Install development-only archive and XML parsers**

Run:

```bash
npm install --save-dev adm-zip@0.5.16 fast-xml-parser@5.3.4
```

These tools remain outside the miniprogram bundle. `adm-zip` reads the two exact CLDR ZIP entries and `fast-xml-parser` handles XML entities and `annotation` arrays reliably.

- [ ] **Step 2: Write failing tests for literal source contracts and pure imports**

Tests must assert the three exact URLs, literal SHA-256 values, ZIP entry paths, and no import-time fetch or filesystem write:

```js
assert.deepEqual(PINNED_SOURCES.emojiTest, {
  url: 'https://www.unicode.org/Public/17.0.0/emoji/emoji-test.txt',
  sha256: '1d8a944f88d7952f7ef7c5167fef3c67995bcae24543949710231b03a201acda'
})
assert.equal(PINNED_SOURCES.cldr.entries.primary, 'common/annotations/zh.xml')
assert.equal(PINNED_SOURCES.cldr.entries.derived, 'common/annotationsDerived/zh.xml')
```

Add fixtures covering XML entity decoding, primary-over-derived precedence, explicit fallback labels, and C21 “文本呈现”/“Emoji 呈现” suffixes. Stub `global.fetch` and filesystem mutators before `require()` and assert no calls occur.

- [ ] **Step 3: Run the focused test and verify failure**

Run: `node --test tests/emoji-batch-02-builder.test.js`

Expected: FAIL because the validation module does not exist.

- [ ] **Step 4: Implement pure parsers and manifest validation APIs**

Export only validation-oriented APIs:

```js
module.exports = {
  PINNED_SOURCES,
  assertPinnedHash,
  parseEmojiTest,
  parseVariationSequences,
  parseCldrZip,
  validateManifest,
  validateManifestAgainstSources
}
```

`parseEmojiTest` retains qualification/version/source order so every non-C21 row can be proven `fully-qualified`. `parseVariationSequences` retains text/Emoji presentation type. `parseCldrZip` reads the two pinned entries, decodes XML, and applies primary, derived, then manifest fallback precedence. None of these functions selects, adds, removes, orders, or classifies candidates.

- [ ] **Step 5: Implement explicit CLI source caching**

`--verify` reads exact-hash files from `tmp/emoji-compatibility-sources` when present; otherwise it downloads to a newly created temporary directory, verifies hashes before parsing, and may copy valid files into the ignored cache. Imported code never performs network or filesystem side effects.

Add:

```json
"emoji:batch02:verify": "node scripts/emoji-compatibility/validate-batch-02-manifest.js --verify"
```

Add `tests/emoji-batch-02-builder.test.js` to both `test:unit` and `test:coverage`.

- [ ] **Step 6: Run tests and commit the validator**

Run: `node --test tests/emoji-batch-02-builder.test.js`

Expected: PASS for parser fixtures and checksum rejection; manifest-specific tests remain skipped only until Task 2 creates the file.

```bash
git add package.json package-lock.json scripts/emoji-compatibility/validate-batch-02-manifest.js tests/emoji-batch-02-builder.test.js
git diff --cached --check
git commit -m "build: add pinned emoji manifest validation"
```

## Task 2: Author and Freeze the 1,000-Item Manifest

**Files:**
- Create: `scripts/emoji-compatibility/curate-batch-02-draft.js`
- Create: `scripts/emoji-compatibility/batch-02-manifest.json`
- Modify: `tests/emoji-batch-02-builder.test.js`

- [ ] **Step 1: Write the complete failing manifest contract**

Concrete assertions must cover:

```js
assert.equal(manifest.unicodeEmojiVersion, '17.0')
assert.equal(manifest.cldrVersion, '48.2')
assert.deepEqual(manifest.categories.map(item => item.id),
  Array.from({ length: 26 }, (_, i) => `B02-C${String(i + 1).padStart(2, '0')}`))
assert.deepEqual(manifest.categories.map(item => item.count),
  [...Array(20).fill(35), ...Array(6).fill(50)])
assert.equal(manifest.items.slice(0, 700).every(item => Number(item.categoryId.slice(-2)) <= 20), true)
```

For every row assert `B02-Cxx-xxx` ID shape, order/ID agreement, glyph-to-scalar equality, nonempty category `riskNote`, valid `labelSource` (`cldr-primary`, `cldr-derived`, or `fallback`), exact 700/300 split, unique IDs/sequences, and no overlap with the original 202. Validate every non-C21 row against a fully-qualified Emoji 17.0 source row. Validate required FE0E, FE0F, modifier, ZWJ, regional, tag, and `20E3` coverage. C21 must contain 25 adjacent base pairs with exact suffixes.

- [ ] **Step 2: Run tests and verify the missing-manifest failure**

Run: `node --test tests/emoji-batch-02-builder.test.js`

Expected: FAIL with missing `batch-02-manifest.json`.

- [ ] **Step 3: Produce a non-normative draft**

Implement `curate-batch-02-draft.js` as an explicit one-off helper that reads validated upstream records and writes only `tmp/batch-02-draft.json`. It is not exported, has no package script, and is never referenced by verify/runtime commands. Its output is only a starting point for human-readable review; it cannot overwrite the normative manifest.

Run:

```bash
node scripts/emoji-compatibility/curate-batch-02-draft.js
```

- [ ] **Step 4: Author the normative manifest explicitly**

Create `batch-02-manifest.json` from the reviewed draft. It must explicitly enumerate all category metadata and all 1,000 rows with `id`, `categoryId`, `order`, `glyph`, `sequence`, `label`, `labelSource`, and `emojiVersion`. Review all 26 category boundaries, all fallback names, and at least the first/last three rows of each category. After this file exists, it alone defines membership, classification, labels, and order.

- [ ] **Step 5: Validate and freeze every mapping**

Run:

```bash
npm run emoji:batch02:verify
node --test tests/emoji-batch-02-builder.test.js
shasum -a 256 scripts/emoji-compatibility/batch-02-manifest.json
```

Store the manifest SHA-256 as a literal expected value in the test and deep-compare the normalized mapping `ID -> sequence -> category -> order -> label -> labelSource`. Expected summary: 26 categories, 700 practical, 300 high risk, 1,000 total, zero duplicates, zero first-batch overlaps.

- [ ] **Step 6: Commit the helper and normative manifest**

```bash
git add scripts/emoji-compatibility/curate-batch-02-draft.js scripts/emoji-compatibility/batch-02-manifest.json tests/emoji-batch-02-builder.test.js
git diff --cached --check
git commit -m "data: freeze second emoji compatibility batch"
```

## Task 3: Generate the Compact Runtime Module

**Files:**
- Create: `scripts/emoji-compatibility/generate-batch-02-runtime.js`
- Create: `miniprogram/pages/icon-compatibility/emoji-candidates-batch-02.js`
- Create: `tests/emoji-batch-02.test.js`
- Modify: `package.json`

- [ ] **Step 1: Write failing runtime contract tests**

The test must compare every runtime item against the normative manifest and check deep freezing:

```js
test('runtime batch exactly matches the normative manifest', () => {
  assert.equal(BATCH_02.id, 'B02')
  assert.equal(BATCH_02.count, 1000)
  assert.equal(BATCH_02.categories.length, 26)
  assert.deepEqual(flattenRuntime(BATCH_02), normalizeManifest(manifest))
  assertDeepFrozen(BATCH_02)
})
```

- [ ] **Step 2: Run the runtime test and verify failure**

Run: `node --test tests/emoji-batch-02.test.js`

Expected: FAIL because the generated runtime module is missing.

- [ ] **Step 3: Implement the runtime generator**

Generate compact tuples such as `[glyph, label, sequence, emojiVersion]` under category metadata. Construct public item IDs from frozen category ID and item order only inside the generated module. Export:

```js
module.exports = {
  EMOJI_BATCH_02,
  EMOJI_BATCH_02_COUNT,
  findBatch02Category,
  unicodeSequence
}
```

The generator must refuse to overwrite output unless `validateManifest()` passes. It supports `--write` and a side-effect-free `--verify` mode; `--verify` generates the expected bytes in memory and compares them with the checked-in runtime file.

- [ ] **Step 4: Generate the runtime module and verify byte stability**

Add script:

```json
"emoji:batch02:runtime": "node scripts/emoji-compatibility/generate-batch-02-runtime.js --write",
"emoji:batch02:runtime:verify": "node scripts/emoji-compatibility/generate-batch-02-runtime.js --verify"
```

Add `tests/emoji-batch-02.test.js` to both `test:unit` and `test:coverage`. Run write once, then verify twice and confirm no diff.

- [ ] **Step 5: Run candidate tests**

Run:

```bash
node --test tests/emoji-candidates.test.js tests/emoji-batch-02.test.js
```

Expected: PASS. Also run `git rev-parse HEAD:miniprogram/pages/icon-compatibility/emoji-candidates.js` and compare it with `tmp/emoji-batch-01-head-blob.txt`; the original module blob must be unchanged.

- [ ] **Step 6: Commit runtime data**

```bash
git add package.json scripts/emoji-compatibility/generate-batch-02-runtime.js miniprogram/pages/icon-compatibility/emoji-candidates-batch-02.js tests/emoji-batch-02.test.js
git diff --cached --check
git commit -m "feat: add second emoji compatibility dataset"
```

## Task 4: Add Batch-Aware Page State

**Files:**
- Modify: `miniprogram/pages/icon-compatibility/icon-compatibility.js`
- Modify: `tests/icon-compatibility-page-flows.test.js`

- [ ] **Step 1: Rewrite page-flow expectations for batch two default state**

Assert:

```js
assert.equal(page.data.activeBatch.id, 'B02')
assert.equal(page.data.activeCategory.id, 'B02-C01')
assert.equal(page.data.activeItems.length, 35)
assert.equal(page.data.batchTabs.length, 2)
assert.equal(page.data.candidateCount, 1202)
assert.equal(Object.hasOwn(page.data, 'batches'), false)
```

Add explicit overview assertions for `已通过 202`, `待测试 1000`, and `共 1202`. Test switching to batch one, restoring each batch's last category, category boundaries, and copying `B02`, `B02-C03`, and `B02-C03-017`. Invalid negative, nonnumeric, missing, and oversized batch/category indexes must fall back to that batch's first category, never clamp to the last category.

Instrument `setData` in the page harness and assert every batch/category switch payload omits `batches`, full category objects, and inactive items; `activeItems.length` must never exceed 50. Before selecting batch one, no first-batch glyph may appear in page data.

- [ ] **Step 2: Run focused page tests and verify failure**

Run: `node --test tests/icon-compatibility-page-flows.test.js`

Expected: FAIL because the page still initializes at `C01` and has no batch state.

- [ ] **Step 3: Implement a small batch adapter**

Represent each batch internally as:

```js
{
  id: 'B02',
  name: '第二批',
  statusText: '待测试',
  count: 1000,
  categories: EMOJI_BATCH_02.categories
}
```

Keep `lastCategoryIndexByBatch = { B02: 0, B01: 0 }` outside `data`. Implement these exact contracts:

```js
activeState(batchId, categoryIndex) // returns only activeBatch, categoryTabs metadata, activeCategory, activeItems and boundary flags
selectBatch(batchId)                // unknown ID falls back to B02; restores valid saved position
onBatchTap(event)                   // reads event.currentTarget.dataset.id
selectCategory(index)               // any invalid index falls back to index 0
onCopyBatchId(event)                // delegates exact dataset.id to copyPublicId
```

`selectBatch()` and `selectCategory()` call the shared `activeState()` helper. Never pass a full batch or inactive category items into `setData`.

- [ ] **Step 4: Run focused page tests**

Run: `node --test tests/icon-compatibility-page-flows.test.js`

Expected: PASS.

- [ ] **Step 5: Commit controller behavior**

```bash
git add miniprogram/pages/icon-compatibility/icon-compatibility.js tests/icon-compatibility-page-flows.test.js
git diff --cached --check
git commit -m "feat: add emoji compatibility batch navigation"
```

## Task 5: Implement the Batch UI and Long-ID Layout

**Files:**
- Modify: `miniprogram/pages/icon-compatibility/icon-compatibility.wxml`
- Modify: `miniprogram/pages/icon-compatibility/icon-compatibility.wxss`
- Modify: `miniprogram/pages/index/index.wxml`
- Modify: `tests/icon-compatibility-page-flows.test.js`
- Modify: `tests/index-page-flows.test.js`

- [ ] **Step 1: Add failing template and homepage assertions**

Require `batch-tabs`, `onBatchTap`, `onCopyBatchId`, the three exact overview values, active batch status/count, current-category-only iteration, and exact homepage copy:

```js
assert.match(wxml, /class="batch-tabs"/)
assert.match(wxml, /bindtap="onBatchTap"/)
assert.match(wxml, /bindtap="onCopyBatchId"/)
assert.match(wxml, /已通过 202/)
assert.match(wxml, /待测试 1000/)
assert.match(wxml, /共 1202/)
assert.match(wxml, /wx:for="\{\{activeItems\}\}"/)
assert.doesNotMatch(wxml, /batch\.categories|category\.items/)
assert.match(homeWxml, /1202 项候选 · 2 批次/)
```

- [ ] **Step 2: Run focused tests and verify failure**

Run:

```bash
node --test tests/icon-compatibility-page-flows.test.js tests/index-page-flows.test.js
```

Expected: FAIL on missing batch controls and old homepage count.

- [ ] **Step 3: Implement compact batch controls**

Use a two-option segmented control below the environment summary. Each option displays batch name, status, and count without Emoji literals. The second batch is active by default; the first batch content remains unrendered until selected. The batch ID is a separate copy target wired to `onCopyBatchId`; status text is visible independently of color.

- [ ] **Step 4: Make candidate cards safe for long IDs and labels**

Keep the stable four-column grid. Give `.candidate-id` a full-width, single-line container with a smaller but fixed font, and give `.candidate-label` a two-line bounded area. Increase card height only enough to avoid overlap; do not allow glyph, ID, or label length to resize the grid. Add a 320 CSS px narrow-viewport screenshot checkpoint for `B02-C21` and the longest ZWJ item.

- [ ] **Step 5: Run focused UI tests**

Run:

```bash
node --test tests/icon-compatibility-page-flows.test.js tests/index-page-flows.test.js
```

Expected: PASS.

- [ ] **Step 6: Commit the UI**

```bash
git add miniprogram/pages/icon-compatibility/icon-compatibility.wxml miniprogram/pages/icon-compatibility/icon-compatibility.wxss tests/icon-compatibility-page-flows.test.js tests/index-page-flows.test.js
# Stage index.wxml with the synthetic-blob procedure in Worktree Safety; do not use git add on that dirty file.
git diff --cached --check
git diff --cached -- miniprogram/pages/index/index.wxml
git commit -m "feat: present verified and pending emoji batches"
```

## Task 6: Preserve Production Emoji Isolation

**Files:**
- Modify: `tests/bplus-design-system.test.js`
- Modify: `tests/user-facing-code-hygiene.test.js`

- [ ] **Step 1: Update the exact candidate-literal exemption test**

Require exactly:

```js
const UI_LITERAL_EXEMPTIONS = [
  'miniprogram/pages/icon-compatibility/emoji-candidates.js',
  'miniprogram/pages/icon-compatibility/emoji-candidates-batch-02.js'
]
```

Add a deterministic import scan over `.js`, `.wxml`, and `.json` files under `miniprogram/pages`, `miniprogram/components`, `miniprogram/utils`, `miniprogram/app.js`, and `miniprogram/app.json`. The only allowed runtime import path is `miniprogram/pages/icon-compatibility/icon-compatibility.js`; the literal data file may reference itself only through its filename. Fail if `emoji-candidates-batch-02` appears in the main package, `ui-symbols.js`, another page/component, or app bootstrap. Tests and `scripts/emoji-compatibility` are outside this production scan.

Concrete assertion:

```js
assert.deepEqual(findBatch02RuntimeReferences(), [
  'miniprogram/pages/icon-compatibility/icon-compatibility.js'
])
```

- [ ] **Step 2: Run isolation tests and verify the expected failure**

Run:

```bash
node --test tests/bplus-design-system.test.js tests/user-facing-code-hygiene.test.js
```

Expected: initial failure because the exemption assertion still expects one file.

- [ ] **Step 3: Apply the narrow two-file exemption**

Keep controller and WXML files scanned. Update the literal exemption to exactly the two named data files and assert array equality so it cannot widen silently. Do not add the 1,000 candidates to `APPROVED_UI_SYMBOLS` and do not modify `ui-symbols.js`.

- [ ] **Step 4: Run isolation and candidate suites**

Run:

```bash
node --test tests/bplus-design-system.test.js tests/user-facing-code-hygiene.test.js tests/emoji-candidates.test.js tests/emoji-batch-02.test.js
```

Expected: PASS.

- [ ] **Step 5: Commit the isolation boundary**

```bash
git add tests/bplus-design-system.test.js tests/user-facing-code-hygiene.test.js
git diff --cached --check
git commit -m "test: isolate expanded emoji candidates from production UI"
```

## Task 7: Measure Package Size and Runtime Behavior

**Files:**
- Create: `scripts/devtools-emoji-compatibility-e2e.js`
- Create: `scripts/devtools-emoji-package-metrics.js`
- Create: `tests/emoji-compatibility-devtools.test.js`
- Create: `docs/performance/emoji-compatibility-batch-02-baseline.md`
- Modify: `package.json`

- [ ] **Step 1: Write failing automation-helper and package-parser tests**

Use fixture objects shaped like DevTools `--info-output` and assert exact extraction of compiled main, `pages/icon-compatibility` subpackage, and total bytes. Assert missing package fields fail loudly instead of falling back to source sizes. Add pure helpers that validate rendered card IDs/counts and reject stale IDs after category switches.

Run: `node --test tests/emoji-compatibility-devtools.test.js`

Expected: FAIL because the two scripts do not exist.

- [ ] **Step 2: Implement dedicated DevTools automation**

`scripts/devtools-emoji-compatibility-e2e.js` must use the same `miniprogram-automator` loading and CLI discovery pattern as `devtools-cli-doctor.js`. It must:

1. `reLaunch('/pages/icon-compatibility/icon-compatibility')` and assert `B02-C01` plus exactly 35 cards.
2. Navigate through categories C01-C10 and assert each rendered ID starts with the active category and no previous category IDs remain.
3. Open C21 and assert exactly 50 cards.
4. Switch to B01, move to C03, switch to B02 and move to C12, then switch both ways and assert independent restoration.
5. Save screenshots to `tmp/emoji-batch-02-top.png`, `tmp/emoji-batch-02-practical.png`, `tmp/emoji-batch-02-c21.png`, and `tmp/emoji-batch-02-longest.png`.
6. When `EMOJI_REQUIRE_NARROW=1`, fail unless `systemInfo.screenWidth <= 320`; this makes the narrow screenshot criterion measurable rather than inferred.

- [ ] **Step 3: Implement compiled package measurement**

`scripts/devtools-emoji-package-metrics.js` runs this exact command through `execFileSync`:

```bash
/Applications/wechatwebdevtools.app/Contents/MacOS/cli preview \
  --project "$PWD" \
  --qr-format image \
  --qr-output tmp/emoji-batch-02-preview-qr.png \
  --info-output tmp/emoji-batch-02-preview-info.json
```

Parse the resulting info JSON and CLI output for compiled package records. Require main package delta `<= 5 KB` against the recorded baseline, icon test subpackage total `< 250 KB`, and report total bytes. If this DevTools version does not expose compiled package fields, exit nonzero with `compiled package metrics unavailable`; record that limitation and obtain the three values from DevTools package analysis before marking the task complete. Never substitute `check:size` or `perf:baseline` values for compiled values.

Add:

```json
"test:e2e:emoji-compat": "node scripts/devtools-emoji-compatibility-e2e.js",
"perf:emoji-compat": "node scripts/devtools-emoji-package-metrics.js"
```

Add `tests/emoji-compatibility-devtools.test.js` to `test:unit` and `test:coverage`.

- [ ] **Step 4: Run package and page measurements**

Run:

```bash
npm run check:size
npm run perf:emoji-compat
npm run test:e2e:emoji-compat
EMOJI_REQUIRE_NARROW=1 npm run test:e2e:emoji-compat
```

Use the same Preview configuration documented in `docs/performance/emoji-compatibility-lab-baseline.md`. Record baseline icon subpackage size `23,906 bytes`, new compiled main package size, new compiled icon subpackage size, total size, and deltas.

Expected: main package delta `<= 5 KB`, icon test subpackage total `< 250 KB`, configured package limits pass.

- [ ] **Step 5: Inspect visual evidence and Android preview**

Capture a 320 CSS px narrow screenshot and a target-device preview for:

- the top summary and batch selector;
- a practical 35-item category;
- `B02-C21` paired presentation candidates;
- the item with the longest ID/name/ZWJ sequence.

Verify no clipping, overlap, text overflow, or layout shift. The actual Emoji glyph may differ by device; blank boxes or split sequences are compatibility test results, not layout failures.

- [ ] **Step 6: Write the performance baseline**

Document commands, environment, exact sizes, category switch behavior, screenshot paths, and any unavailable DevTools measurement. Do not claim a measurement that the CLI did not produce.

- [ ] **Step 7: Commit automation and baseline**

```bash
git add package.json scripts/devtools-emoji-compatibility-e2e.js scripts/devtools-emoji-package-metrics.js tests/emoji-compatibility-devtools.test.js docs/performance/emoji-compatibility-batch-02-baseline.md
git diff --cached --check
git commit -m "docs: baseline expanded emoji compatibility lab"
```

## Task 8: Full Verification and Delivery

**Files:**
- Modify: only files required by real verification failures

- [ ] **Step 1: Verify generated data is current**

Run:

```bash
npm run emoji:batch02:verify
npm run emoji:batch02:runtime:verify
git diff --exit-code -- scripts/emoji-compatibility/batch-02-manifest.json miniprogram/pages/icon-compatibility/emoji-candidates-batch-02.js
test "$(git rev-parse HEAD:miniprogram/pages/icon-compatibility/emoji-candidates.js)" = "$(cat tmp/emoji-batch-01-head-blob.txt)"
```

Expected: all commands pass and generated files are unchanged.

- [ ] **Step 2: Run focused feature suites**

Run:

```bash
node --test tests/emoji-batch-02-builder.test.js tests/emoji-batch-02.test.js tests/emoji-candidates.test.js tests/icon-compatibility-page-flows.test.js tests/index-page-flows.test.js tests/bplus-design-system.test.js tests/user-facing-code-hygiene.test.js
```

Expected: PASS.

- [ ] **Step 3: Run repository verification**

Run:

```bash
npm run verify
npm run test:coverage
npm run check:size
npm run perf:emoji-compat
npm run test:e2e:emoji-compat
git diff --check
```

Expected: all checks pass; coverage remains at or above configured 80% line/function thresholds.

- [ ] **Step 4: Inspect final repository state**

Run:

```bash
git status --short --branch
git log --oneline -12
diff -u tmp/emoji-batch-02-initial-status.txt <(git status --short | rg -v '^(\?\?| M|M |A ) (scripts/emoji-compatibility|tests/emoji-|scripts/devtools-emoji|docs/performance/emoji-compatibility-batch-02|miniprogram/pages/icon-compatibility)') || true
```

Expected: all task commits are present on `main`, generated files have no drift, and every pre-existing user change is still present unless the user committed it concurrently. A dirty worktree is acceptable when the remaining entries match the recorded pre-existing changes.

- [ ] **Step 5: Create the final integration commit only if verification produced fixes**

```bash
git add <verified-fix-files-that-were-clean-at-start>
# For any initially dirty shared file, use the synthetic-blob staging method and inspect git diff --cached.
git diff --cached --check
git commit -m "fix: finalize expanded emoji compatibility testing"
```

- [ ] **Step 6: Deliver the Android preview workflow**

Provide the user with the Preview QR or exact WeChat DevTools preview instruction, state that batch two defaults open, and request compatibility feedback using `B02-Cxx: pass` or precise `B02-Cxx-xxx` IDs. Do not merge the 1,000 items into the production whitelist until the user reports results.

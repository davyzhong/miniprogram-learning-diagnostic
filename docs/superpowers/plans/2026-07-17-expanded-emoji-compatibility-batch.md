# Expanded Emoji Compatibility Batch Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a second, exactly 1,000-item Android WeChat Emoji compatibility batch while preserving the verified 202-item first batch and rendering only one category at a time.

**Architecture:** Keep the existing first-batch module immutable. Build a checked-in, normative second-batch manifest from pinned Unicode Emoji 17.0 and CLDR 48.2 sources, generate one compact runtime module inside the existing test subpackage, and expose both datasets through a small batch adapter in the page controller. The page defaults to batch two, remembers one category index per batch, and never places the full 1,202-item collection in `setData`.

**Tech Stack:** WeChat Mini Program WXML/WXSS/CommonJS, Node.js 22 built-in test runner, Unicode Emoji 17.0 data, CLDR 48.2 XML, existing page harness and package-size scripts.

---

## File Structure

**Create**

- `scripts/emoji-compatibility/build-batch-02-manifest.js`: downloads or reads pinned upstream files, verifies hashes, parses Emoji/CLDR records, and writes or verifies the normative manifest.
- `scripts/emoji-compatibility/batch-02-category-config.js`: category metadata, quotas, source subgroup mappings, high-risk predicates, and deterministic tie-break rules used only to author the initial manifest.
- `scripts/emoji-compatibility/batch-02-manifest.json`: authoritative 1,000-row public ID, category, order, sequence, label, label-source, and Emoji-version snapshot.
- `scripts/emoji-compatibility/generate-batch-02-runtime.js`: converts the normative manifest to compact runtime tuples without changing selection or labels.
- `miniprogram/pages/icon-compatibility/emoji-candidates-batch-02.js`: generated, frozen second-batch runtime data.
- `tests/emoji-batch-02-builder.test.js`: source parsing, checksum rejection, deterministic selection, and output reproducibility tests.
- `tests/emoji-batch-02.test.js`: normative manifest and runtime module contract tests.
- `docs/performance/emoji-compatibility-batch-02-baseline.md`: before/after package and rendering baseline.

**Modify**

- `package.json`: add batch build/verify scripts and include new tests in unit and coverage suites.
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

## Task 1: Freeze Upstream Source and Builder Contracts

**Files:**
- Create: `scripts/emoji-compatibility/batch-02-category-config.js`
- Create: `scripts/emoji-compatibility/build-batch-02-manifest.js`
- Create: `tests/emoji-batch-02-builder.test.js`
- Modify: `package.json`

- [ ] **Step 1: Write failing tests for pinned-source validation**

Add tests that import pure builder functions without network access and assert the three SHA-256 values from the approved spec:

```js
test('rejects upstream data when a pinned checksum changes', () => {
  assert.throws(
    () => assertPinnedHash(Buffer.from('changed'), PINNED_SOURCES.emojiTest.sha256),
    /checksum mismatch/
  )
})

test('parses only fully-qualified general emoji records', () => {
  const rows = parseEmojiTest(FIXTURE)
  assert.deepEqual(rows.map(row => row.qualification), ['fully-qualified'])
})
```

- [ ] **Step 2: Run the focused builder test and verify failure**

Run: `node --test tests/emoji-batch-02-builder.test.js`

Expected: FAIL because the builder/config modules do not exist.

- [ ] **Step 3: Implement pure source parsers and hash validation**

Export these focused APIs from `build-batch-02-manifest.js`:

```js
module.exports = {
  PINNED_SOURCES,
  assertPinnedHash,
  parseEmojiTest,
  parseVariationSequences,
  parseCldrTts,
  buildManifest,
  verifyManifest
}
```

The CLI path may fetch sources into a temporary directory, but imported functions must not perform network or file writes. Parse `fully-qualified` rows from `emoji-test.txt`; parse both text and Emoji presentation rows from `emoji-variation-sequences.txt`; parse `type="tts"` from `annotations/zh.xml` then `annotationsDerived/zh.xml`.

- [ ] **Step 4: Define deterministic category metadata and initial-authoring rules**

Define all 26 category IDs, names, counts, risk notes, source subgroup mappings, and explicit precedence. The first 20 categories each require 35 non-risk candidates. High-risk assignment order is `B02-C21` paired variations, `B02-C22` modifiers without ZWJ, `B02-C23` profession/gender ZWJ, `B02-C24` family/relationship ZWJ, `B02-C25` regional/tag flags, then `B02-C26` keycaps/recent/long sequences. Source order is the final tie-breaker. These rules author the initial manifest only; the committed manifest becomes normative.

- [ ] **Step 5: Add package scripts and run focused tests**

Add:

```json
"emoji:batch02:build": "node scripts/emoji-compatibility/build-batch-02-manifest.js --write",
"emoji:batch02:verify": "node scripts/emoji-compatibility/build-batch-02-manifest.js --verify"
```

Add `tests/emoji-batch-02-builder.test.js` to `test:unit` and `test:coverage`.

Run: `node --test tests/emoji-batch-02-builder.test.js`

Expected: PASS.

- [ ] **Step 6: Commit the builder contract**

```bash
git add package.json scripts/emoji-compatibility/batch-02-category-config.js scripts/emoji-compatibility/build-batch-02-manifest.js tests/emoji-batch-02-builder.test.js
git commit -m "build: add pinned emoji batch source pipeline"
```

## Task 2: Generate and Freeze the 1,000-Item Manifest

**Files:**
- Create: `scripts/emoji-compatibility/batch-02-manifest.json`
- Modify: `tests/emoji-batch-02-builder.test.js`

- [ ] **Step 1: Add failing manifest acceptance tests**

Assert exact counts, IDs, quotas, uniqueness, cross-batch exclusion, source metadata, and presentation pairs:

```js
test('batch two freezes exactly 1000 unique candidates', () => {
  assert.equal(manifest.items.length, 1000)
  assert.equal(new Set(manifest.items.map(item => item.id)).size, 1000)
  assert.equal(new Set(manifest.items.map(item => item.sequence)).size, 1000)
  assert.deepEqual(categoryCounts(manifest), EXPECTED_QUOTAS)
})

test('B02-C21 contains 25 adjacent FE0E/FE0F pairs', () => {
  const pairs = categoryItems('B02-C21')
  assert.equal(pairs.length, 50)
  assert.equal(countPresentationPairs(pairs), 25)
})
```

Also load `emoji-candidates.js` and assert no second-batch sequence appears in the first 202 sequences.

- [ ] **Step 2: Run tests and verify the missing-manifest failure**

Run: `node --test tests/emoji-batch-02-builder.test.js`

Expected: FAIL with missing `batch-02-manifest.json`.

- [ ] **Step 3: Download pinned upstream artifacts and generate the manifest once**

Run:

```bash
npm run emoji:batch02:build
```

Expected output includes:

```text
Unicode Emoji: 17.0
CLDR: 48.2
Categories: 26
Practical: 700
High risk: 300
Total: 1000
Duplicates: 0
First-batch overlaps: 0
```

Inspect representative rows from every category and confirm labels are meaningful Simplified Chinese. The manifest must explicitly store fallback labels and label-source metadata; it must not depend on a future CLDR download to render.

- [ ] **Step 4: Verify deterministic output**

Run `npm run emoji:batch02:build` twice and compare `shasum -a 256 scripts/emoji-compatibility/batch-02-manifest.json` before and after.

Expected: identical checksum and clean `git diff` after the second run.

- [ ] **Step 5: Run manifest tests**

Run: `node --test tests/emoji-batch-02-builder.test.js`

Expected: PASS with exactly 1,000 items and all 26 quotas.

- [ ] **Step 6: Commit the normative manifest**

```bash
git add scripts/emoji-compatibility/batch-02-manifest.json tests/emoji-batch-02-builder.test.js
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

The generator must refuse to overwrite output unless `verifyManifest()` passes.

- [ ] **Step 4: Generate the runtime module and verify byte stability**

Add script:

```json
"emoji:batch02:runtime": "node scripts/emoji-compatibility/generate-batch-02-runtime.js"
```

Run it twice and confirm the second run produces no diff.

- [ ] **Step 5: Run candidate tests**

Run:

```bash
node --test tests/emoji-candidates.test.js tests/emoji-batch-02.test.js
```

Expected: PASS; the original 202-item module remains byte-for-byte unchanged.

- [ ] **Step 6: Commit runtime data**

```bash
git add package.json scripts/emoji-compatibility/generate-batch-02-runtime.js miniprogram/pages/icon-compatibility/emoji-candidates-batch-02.js tests/emoji-batch-02.test.js
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

Add tests for switching to batch one, restoring each batch's last category, clamping invalid indexes, category boundaries, and copying `B02`, `B02-C03`, and `B02-C03-017`.

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

Keep `lastCategoryIndexByBatch = { B02: 0, B01: 0 }` outside `data`. `selectBatch()` and `selectCategory()` must call one shared `activeState(batch, index)` helper that returns only batch metadata, category metadata, and current items. Do not pass either full batch into `setData`.

- [ ] **Step 4: Run focused page tests**

Run: `node --test tests/icon-compatibility-page-flows.test.js`

Expected: PASS.

- [ ] **Step 5: Commit controller behavior**

```bash
git add miniprogram/pages/icon-compatibility/icon-compatibility.js tests/icon-compatibility-page-flows.test.js
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

Require `batch-tabs`, `onBatchTap`, active batch status/count, current-category-only iteration, and exact homepage copy:

```js
assert.match(wxml, /class="batch-tabs"/)
assert.match(wxml, /bindtap="onBatchTap"/)
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

Use a two-option segmented control below the environment summary. Each option displays batch name, status, and count without Emoji literals. The second batch is active by default; the first batch content remains unrendered until selected.

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
git add miniprogram/pages/icon-compatibility/icon-compatibility.wxml miniprogram/pages/icon-compatibility/icon-compatibility.wxss miniprogram/pages/index/index.wxml tests/icon-compatibility-page-flows.test.js tests/index-page-flows.test.js
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

Add an import scan that fails if `emoji-candidates-batch-02` appears outside the icon-compatibility page directory or tests/scripts.

- [ ] **Step 2: Run isolation tests and verify the expected failure**

Run:

```bash
node --test tests/bplus-design-system.test.js tests/user-facing-code-hygiene.test.js
```

Expected: initial failure because the exemption assertion still expects one file.

- [ ] **Step 3: Apply the narrow two-file exemption**

Keep controller and WXML files scanned. Do not add the 1,000 candidates to `APPROVED_UI_SYMBOLS` and do not modify `ui-symbols.js`.

- [ ] **Step 4: Run isolation and candidate suites**

Run:

```bash
node --test tests/bplus-design-system.test.js tests/user-facing-code-hygiene.test.js tests/emoji-candidates.test.js tests/emoji-batch-02.test.js
```

Expected: PASS.

- [ ] **Step 5: Commit the isolation boundary**

```bash
git add tests/bplus-design-system.test.js tests/user-facing-code-hygiene.test.js
git commit -m "test: isolate expanded emoji candidates from production UI"
```

## Task 7: Measure Package Size and Runtime Behavior

**Files:**
- Create: `docs/performance/emoji-compatibility-batch-02-baseline.md`
- Modify: none unless a measured budget fails

- [ ] **Step 1: Record source and compiled package measurements**

Run:

```bash
npm run check:size
npm run perf:baseline
```

Use the same WeChat DevTools Preview/upload configuration documented in `docs/performance/emoji-compatibility-lab-baseline.md`. Record baseline icon subpackage size `23,906 bytes`, new main package size, new icon subpackage size, total size, and deltas.

Expected: main package delta `<= 5 KB`, icon test subpackage total `< 250 KB`, configured package limits pass.

- [ ] **Step 2: Exercise page switching in DevTools CLI**

Open `pages/icon-compatibility/icon-compatibility`, verify `B02-C01`, navigate across at least 10 categories, switch to the first batch, move to a non-first category, switch back and forth, and confirm each batch restores its own position with no stale or blank grid.

- [ ] **Step 3: Capture visual evidence**

Capture a 320 CSS px narrow screenshot and a target-device preview for:

- the top summary and batch selector;
- a practical 35-item category;
- `B02-C21` paired presentation candidates;
- the item with the longest ID/name/ZWJ sequence.

Verify no clipping, overlap, text overflow, or layout shift. The actual Emoji glyph may differ by device; blank boxes or split sequences are compatibility test results, not layout failures.

- [ ] **Step 4: Write the performance baseline**

Document commands, environment, exact sizes, category switch behavior, screenshot paths, and any unavailable DevTools measurement. Do not claim a measurement that the CLI did not produce.

- [ ] **Step 5: Commit the baseline**

```bash
git add docs/performance/emoji-compatibility-batch-02-baseline.md
git commit -m "docs: baseline expanded emoji compatibility lab"
```

## Task 8: Full Verification and Delivery

**Files:**
- Modify: only files required by real verification failures

- [ ] **Step 1: Verify generated data is current**

Run:

```bash
npm run emoji:batch02:verify
npm run emoji:batch02:runtime
git diff --exit-code -- scripts/emoji-compatibility/batch-02-manifest.json miniprogram/pages/icon-compatibility/emoji-candidates-batch-02.js
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
git diff --check
```

Expected: all checks pass; coverage remains at or above configured 80% line/function thresholds.

- [ ] **Step 4: Inspect final repository state**

Run:

```bash
git status --short --branch
git log --oneline -12
```

Expected: only intentional changes, no generated source drift, and all task commits present on `main`.

- [ ] **Step 5: Create the final integration commit only if verification produced fixes**

```bash
git add <verified-fix-files>
git commit -m "fix: finalize expanded emoji compatibility testing"
```

- [ ] **Step 6: Deliver the Android preview workflow**

Provide the user with the Preview QR or exact WeChat DevTools preview instruction, state that batch two defaults open, and request compatibility feedback using `B02-Cxx: pass` or precise `B02-Cxx-xxx` IDs. Do not merge the 1,000 items into the production whitelist until the user reports results.

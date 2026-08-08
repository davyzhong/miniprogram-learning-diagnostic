# Math Bottleneck Hierarchy Upgrade Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [x]`) syntax for tracking.
>
> **状态（2026-07-17 补记）：已全部完成。** 实现验收见 `docs/test-reports/2026-06-17-math-bottleneck-hierarchy-upgrade.md`（61 个相关测试通过、回填版本 math-full-reanalysis-v2.2-hierarchy）；当时未维护 checkbox，现按验收报告统一补勾。

**Goal:** Upgrade the math learning bottleneck system from flat fine-grained items into a hierarchy that supports diagnosis, parent-facing display, resource recommendation, verification task scheduling, and mastery tracking.

**Architecture:** Add explicit math bottleneck category and family metadata, then normalize every fine bottleneck through a shared hierarchy helper. Reports and workbench pages consume grouped view models; verification generation consumes scheduled page targets instead of raw flat selections.

**Tech Stack:** WeChat Mini Program JavaScript, CloudBase cloud functions, Node.js tests with `node:test`, JSON seed data, existing PDF generation and verification-pack utilities.

## Global Constraints

- Do not remove compatibility with existing `reports.bottlenecks`, `subjectProfiles.currentBottlenecks`, `pendingBottlenecks`, `improvedBottlenecks`, or `papers.bottleneckTargets`.
- Fine bottlenecks and knowledge nodes remain the mastery and evidence atoms; coarse categories are grouping and scheduling layers.
- Parent-facing surfaces must show Chinese readable names, not `MATH-*` or raw `BN-*` IDs.
- Resource cards must show type, platform, action text, and usable URL state; videos must expose an open/copy link path.
- Children must not be sent into platform recommendation feeds; search-query resources are parent screening entries.
- Existing math, Chinese, and English flows must continue to work.
- Review this plan before implementation; do not edit production code until the user approves.

---

## File Structure

- Create: `data/math/bottleneck-categories.seed.json`  
  Owns category and family definitions for math.
- Create: `miniprogram/utils/math-bottleneck-hierarchy.js`  
  Mini Program helper for category/family normalization and grouped parent-facing view models.
- Create: `cloudfunctions/_shared/math-bottleneck-hierarchy.js`  
  Cloud function helper with the same normalization rules, using JSON seeds from cloud function paths.
- Modify: `data/math/bottleneck-taxonomy-v2.seed.json`  
  Add `categoryId`, `categoryTitle`, `familyId`, `familyTitle`, `verificationGrain`, and `recommendedPageTypes` to every fine bottleneck.
- Modify: `data/math/learning-resources.seed.json`  
  Add `categoryIds`, `familyIds`, `displayTitle`, `accessMode`, `actionLabel`, and `resourceRole` where missing.
- Modify: `cloudfunctions/analyzePhotos/math-learning-map-enricher.js`  
  Attach hierarchy metadata to each candidate bottleneck and resource plan.
- Modify: `miniprogram/utils/math-learning-map.js`  
  Render readable node/resource titles and resource actions with links.
- Modify: `miniprogram/utils/bottleneck-view.js`  
  Build grouped category/family/child views for math while preserving flat list functions.
- Modify: `miniprogram/pages/report/report-presenter.js`  
  Add grouped bottleneck sections to diagnosis report view models.
- Modify: `miniprogram/pages/report/report.wxml` and `report.wxss`  
  Render grouped math bottleneck sections and clickable/copyable resource cards.
- Modify: `miniprogram/pages/subject-home/subject-home-presenter.js`, `subject-home.wxml`, `subject-home.wxss`  
  Show category-level queue first, with drill-down child counts and recommended next action.
- Modify: `miniprogram/pages/generate-verification/generate-verification.js`, `.wxml`, `.wxss`  
  Replace flat manual selection as the default with scheduled category/family task pages; keep manual detail selection as advanced fallback.
- Modify: `cloudfunctions/generatePaper/verification-pack.js` and `cloudfunctions/generatePaper/index.js`  
  Accept scheduled targets with `pageType`, `categoryId`, `familyIds`, `nodeIds`, and fine target IDs.
- Modify: `scripts/backfill-math-learning-map.js`  
  Backfill historical reports with hierarchy metadata.
- Test: `tests/math-bottleneck-hierarchy.test.js`
- Test: `tests/math-learning-map-enricher.test.js`
- Test: `tests/bottleneck-view.test.js`
- Test: `tests/report-presenter.test.js`
- Test: `tests/subject-home-presenter.test.js`
- Test: `tests/verification-pack.test.js`
- Test: `tests/generate-paper-pdf.test.js`

---

### Task 1: Add Governed Category and Family Seed Data

**Files:**
- Create: `data/math/bottleneck-categories.seed.json`
- Modify: `data/math/bottleneck-taxonomy-v2.seed.json`
- Test: `tests/math-bottleneck-hierarchy.test.js`

**Interfaces:**
- Produces category records with `categoryId`, `title`, `resourceRole`, `verificationRole`, and `defaultPageType`.
- Produces family records with `familyId`, `categoryId`, `title`, `nodeIds`, `verificationTemplate`, and `resourceStyleHints`.
- Produces fine bottlenecks with `categoryId`, `familyId`, and readable titles.

- [x] **Step 1: Write failing seed integrity tests**

Add tests:

```js
const test = require('node:test')
const assert = require('node:assert/strict')

const categoriesSeed = require('../data/math/bottleneck-categories.seed.json')
const bottleneckSeed = require('../data/math/bottleneck-taxonomy-v2.seed.json')

test('math bottleneck categories define category and family hierarchy', () => {
  assert.ok(categoriesSeed.version)
  assert.ok(Array.isArray(categoriesSeed.categories))
  assert.ok(Array.isArray(categoriesSeed.families))
  assert.ok(categoriesSeed.categories.length >= 7)
  assert.ok(categoriesSeed.families.length >= 10)

  const categoryIds = new Set(categoriesSeed.categories.map(item => item.categoryId))
  for (const family of categoriesSeed.families) {
    assert.ok(categoryIds.has(family.categoryId), `${family.familyId} has unknown category`)
    assert.ok(family.title)
    assert.ok(Array.isArray(family.resourceStyleHints))
  }
})

test('every fine math bottleneck is linked to category and family', () => {
  const categoryIds = new Set(categoriesSeed.categories.map(item => item.categoryId))
  const familyIds = new Set(categoriesSeed.families.map(item => item.familyId))

  for (const bottleneck of bottleneckSeed.bottlenecks) {
    assert.ok(categoryIds.has(bottleneck.categoryId), `${bottleneck.bottleneckId} missing categoryId`)
    assert.ok(familyIds.has(bottleneck.familyId), `${bottleneck.bottleneckId} missing familyId`)
    assert.ok(bottleneck.categoryTitle)
    assert.ok(bottleneck.familyTitle)
    assert.ok(Array.isArray(bottleneck.recommendedPageTypes))
  }
})
```

- [x] **Step 2: Run test to verify it fails**

Run:

```bash
npm test -- tests/math-bottleneck-hierarchy.test.js
```

Expected: fail because `bottleneck-categories.seed.json` does not exist.

- [x] **Step 3: Add seed file and extend fine bottleneck records**

Create the seed file with at least these categories:

```json
{
  "version": "0.1.0",
  "updatedAt": "2026-06-17",
  "subject": "math",
  "categories": [
    {
      "categoryId": "MATH-CAT-CALC-RULE",
      "title": "计算规则",
      "shortTitle": "计算规则",
      "resourceRole": "优先选择步骤拆解、可视化规则和易错对比类资源。",
      "verificationRole": "适合生成同类规则专项页。",
      "defaultPageType": "same_category",
      "displayOrder": 10
    }
  ],
  "families": [
    {
      "familyId": "MATH-FAM-DECIMAL-POINT",
      "categoryId": "MATH-CAT-CALC-RULE",
      "title": "小数点定位与移动",
      "nodeIds": ["MATH-NUM-DEC-MUL-POINT"],
      "verificationTemplate": "先估算数量级，再计算，再解释小数点为什么在这里。",
      "resourceStyleHints": ["步骤拆解", "数量级估算", "错例对比"]
    }
  ]
}
```

Extend every fine bottleneck with:

```json
{
  "categoryId": "MATH-CAT-CALC-RULE",
  "categoryTitle": "计算规则",
  "familyId": "MATH-FAM-DECIMAL-POINT",
  "familyTitle": "小数点定位与移动",
  "verificationGrain": "fine_bottleneck",
  "recommendedPageTypes": ["same_family", "same_node", "mixed_review"]
}
```

- [x] **Step 4: Run seed integrity test**

Run:

```bash
npm test -- tests/math-bottleneck-hierarchy.test.js
```

Expected: pass.

- [x] **Step 5: Commit**

```bash
git add data/math/bottleneck-categories.seed.json data/math/bottleneck-taxonomy-v2.seed.json tests/math-bottleneck-hierarchy.test.js
git commit -m "feat(math): add bottleneck hierarchy seed data"
```

---

### Task 2: Add Shared Hierarchy Normalizers

**Files:**
- Create: `miniprogram/utils/math-bottleneck-hierarchy.js`
- Create: `cloudfunctions/_shared/math-bottleneck-hierarchy.js`
- Test: `tests/math-bottleneck-hierarchy.test.js`

**Interfaces:**
- Produces `normalizeFineBottleneck(candidate)`.
- Produces `groupBottlenecksByHierarchy(items)`.
- Produces `categoryTitleOf(categoryId)` and `familyTitleOf(familyId)`.

- [x] **Step 1: Add failing helper tests**

Append:

```js
const {
  normalizeFineBottleneck,
  groupBottlenecksByHierarchy
} = require('../miniprogram/utils/math-bottleneck-hierarchy')

test('normalizes fine bottleneck hierarchy metadata', () => {
  const normalized = normalizeFineBottleneck({
    bottleneckId: 'BN-DEC-MUL-POINT-COUNT',
    title: '小数乘法中积的小数位数判断错误'
  })

  assert.equal(normalized.categoryTitle, '计算规则')
  assert.equal(normalized.familyTitle, '小数点定位与移动')
  assert.equal(normalized.displayTitle, '小数乘法中积的小数位数判断错误')
})

test('groups bottlenecks by category then family', () => {
  const groups = groupBottlenecksByHierarchy([
    { bottleneckId: 'BN-DEC-MUL-POINT-COUNT' },
    { bottleneckId: 'BN-DEC-MUL-POINT-ESTIMATE' }
  ])

  assert.equal(groups[0].categoryTitle, '计算规则')
  assert.equal(groups[0].families[0].familyTitle, '小数点定位与移动')
  assert.equal(groups[0].families[0].items.length, 2)
})
```

- [x] **Step 2: Run test to verify it fails**

Run:

```bash
npm test -- tests/math-bottleneck-hierarchy.test.js
```

Expected: fail because helper module is missing.

- [x] **Step 3: Implement Mini Program helper**

Implement exports:

```js
const categorySeed = require('../../data/math/bottleneck-categories.seed.json')
const bottleneckSeed = require('../../data/math/bottleneck-taxonomy-v2.seed.json')

const categoriesById = new Map((categorySeed.categories || []).map(item => [item.categoryId, item]))
const familiesById = new Map((categorySeed.families || []).map(item => [item.familyId, item]))
const bottlenecksById = new Map((bottleneckSeed.bottlenecks || []).map(item => [item.bottleneckId, item]))

function categoryTitleOf(categoryId) {
  return (categoriesById.get(categoryId) || {}).title || '待归类'
}

function familyTitleOf(familyId) {
  return (familiesById.get(familyId) || {}).title || '待归类卡点组'
}

function normalizeFineBottleneck(input = {}) {
  const seed = bottlenecksById.get(input.bottleneckId || input.id) || {}
  const categoryId = input.categoryId || seed.categoryId || ''
  const familyId = input.familyId || seed.familyId || ''
  return {
    ...seed,
    ...input,
    categoryId,
    familyId,
    categoryTitle: input.categoryTitle || seed.categoryTitle || categoryTitleOf(categoryId),
    familyTitle: input.familyTitle || seed.familyTitle || familyTitleOf(familyId),
    displayTitle: input.title || input.lpName || seed.title || input.bottleneckId || '待确认细卡点'
  }
}

function groupBottlenecksByHierarchy(items = []) {
  const categoryMap = new Map()
  for (const raw of items || []) {
    const item = normalizeFineBottleneck(raw)
    const categoryKey = item.categoryId || 'UNKNOWN'
    if (!categoryMap.has(categoryKey)) {
      categoryMap.set(categoryKey, {
        categoryId: item.categoryId,
        categoryTitle: item.categoryTitle,
        itemCount: 0,
        families: []
      })
    }
    const category = categoryMap.get(categoryKey)
    let family = category.families.find(value => value.familyId === item.familyId)
    if (!family) {
      family = {
        familyId: item.familyId,
        familyTitle: item.familyTitle,
        itemCount: 0,
        items: []
      }
      category.families.push(family)
    }
    family.items.push(item)
    family.itemCount += 1
    category.itemCount += 1
  }
  return Array.from(categoryMap.values())
}

module.exports = {
  categoryTitleOf,
  familyTitleOf,
  normalizeFineBottleneck,
  groupBottlenecksByHierarchy
}
```

Create the cloud helper with the same public interface and cloud-safe require paths.

- [x] **Step 4: Run helper tests**

Run:

```bash
npm test -- tests/math-bottleneck-hierarchy.test.js
```

Expected: pass.

- [x] **Step 5: Commit**

```bash
git add miniprogram/utils/math-bottleneck-hierarchy.js cloudfunctions/_shared/math-bottleneck-hierarchy.js tests/math-bottleneck-hierarchy.test.js
git commit -m "feat(math): add bottleneck hierarchy helpers"
```

---

### Task 3: Attach Hierarchy Metadata During Diagnosis Enrichment

**Files:**
- Modify: `cloudfunctions/analyzePhotos/math-learning-map-enricher.js`
- Modify: `scripts/backfill-math-learning-map.js`
- Test: `tests/math-learning-map-enricher.test.js`
- Test: `tests/math-history-reanalysis.test.js`

**Interfaces:**
- Consumes `normalizeFineBottleneck(candidate)` from `cloudfunctions/_shared/math-bottleneck-hierarchy.js`.
- Produces candidate payloads with `categoryId`, `categoryTitle`, `familyId`, and `familyTitle`.

- [x] **Step 1: Add failing enrichment assertion**

In `tests/math-learning-map-enricher.test.js`, assert:

```js
assert.equal(candidate.categoryId, 'MATH-CAT-CALC-RULE')
assert.equal(candidate.categoryTitle, '计算规则')
assert.equal(candidate.familyId, 'MATH-FAM-DECIMAL-POINT')
assert.equal(candidate.familyTitle, '小数点定位与移动')
```

- [x] **Step 2: Run test to verify it fails**

Run:

```bash
npm test -- tests/math-learning-map-enricher.test.js
```

Expected: fail because candidate payload does not include explicit hierarchy fields.

- [x] **Step 3: Normalize candidates in `candidatePayload`**

Update `candidatePayload`:

```js
const { normalizeFineBottleneck } = require('../_shared/math-bottleneck-hierarchy')

function candidatePayload(candidate, evidenceStrength, resourceIds) {
  const normalized = normalizeFineBottleneck(candidate)
  return {
    bottleneckId: normalized.bottleneckId,
    title: normalized.title,
    nodeId: normalized.nodeId,
    categoryId: normalized.categoryId,
    categoryTitle: normalized.categoryTitle,
    familyId: normalized.familyId,
    familyTitle: normalized.familyTitle,
    categoryPath: normalized.categoryPath || [],
    evidenceStrength,
    microValidationRequired: true,
    suggestedMicroValidation: (normalized.microValidationRules || []).slice(0, 3),
    recommendedResourceIds: resourceIds
  }
}
```

- [x] **Step 4: Ensure backfill marks hierarchy version**

Set `BACKFILL_VERSION` to a new value such as `math-learning-map-v2.2-hierarchy` and ensure `scripts/backfill-math-learning-map.js` uses the updated enricher.

- [x] **Step 5: Run tests**

Run:

```bash
npm test -- tests/math-learning-map-enricher.test.js tests/math-history-reanalysis.test.js
```

Expected: pass.

- [x] **Step 6: Commit**

```bash
git add cloudfunctions/analyzePhotos/math-learning-map-enricher.js scripts/backfill-math-learning-map.js tests/math-learning-map-enricher.test.js tests/math-history-reanalysis.test.js
git commit -m "feat(math): enrich reports with bottleneck hierarchy"
```

---

### Task 4: Group Bottlenecks for Report and Workbench Display

**Files:**
- Modify: `miniprogram/utils/bottleneck-view.js`
- Modify: `miniprogram/pages/report/report-presenter.js`
- Modify: `miniprogram/pages/subject-home/subject-home-presenter.js`
- Test: `tests/bottleneck-view.test.js`
- Test: `tests/report-presenter.test.js`
- Test: `tests/subject-home-presenter.test.js`

**Interfaces:**
- Produces `buildGroupedBottleneckViews(items, options)`.
- Report view exposes `bottleneckGroups`.
- Subject home view exposes `taskQueueGroups`.

- [x] **Step 1: Add grouped view tests**

Add:

```js
const { buildGroupedBottleneckViews } = require('../miniprogram/utils/bottleneck-view')

test('math bottleneck views group by category and family without losing fine items', () => {
  const groups = buildGroupedBottleneckViews([
    {
      fineBottleneck: true,
      bottleneckId: 'BN-DEC-MUL-POINT-COUNT',
      lpName: '小数乘法中积的小数位数判断错误',
      status: 'persisting',
      subject: 'math'
    }
  ], { subject: 'math' })

  assert.equal(groups[0].categoryTitle, '计算规则')
  assert.equal(groups[0].families[0].familyTitle, '小数点定位与移动')
  assert.equal(groups[0].families[0].items[0].displayName, '小数乘法中积的小数位数判断错误')
})
```

- [x] **Step 2: Run tests to verify failure**

Run:

```bash
npm test -- tests/bottleneck-view.test.js tests/report-presenter.test.js tests/subject-home-presenter.test.js
```

Expected: fail because grouped view model is missing.

- [x] **Step 3: Implement grouped view builder**

In `miniprogram/utils/bottleneck-view.js`, import hierarchy helper and export:

```js
function buildGroupedBottleneckViews(items = [], options = {}) {
  const views = buildBottleneckViews(items, options)
  if ((options.subject || '') !== 'math') return []
  return groupBottlenecksByHierarchy(views).map(group => ({
    ...group,
    title: group.categoryTitle,
    summaryText: `${group.itemCount} 个细分卡点`,
    families: group.families.map(family => ({
      ...family,
      title: family.familyTitle,
      summaryText: `${family.itemCount} 个卡点`
    }))
  }))
}
```

- [x] **Step 4: Wire report and subject home presenters**

`report-presenter.js` should return:

```js
hasBottleneckGroups: report.subject === 'math' && bottleneckGroups.length > 0,
bottleneckGroups
```

`subject-home-presenter.js` should return:

```js
hasTaskQueueGroups: subject === 'math' && taskQueueGroups.length > 0,
taskQueueGroups
```

- [x] **Step 5: Run presenter tests**

Run:

```bash
npm test -- tests/bottleneck-view.test.js tests/report-presenter.test.js tests/subject-home-presenter.test.js
```

Expected: pass.

- [x] **Step 6: Commit**

```bash
git add miniprogram/utils/bottleneck-view.js miniprogram/pages/report/report-presenter.js miniprogram/pages/subject-home/subject-home-presenter.js tests/bottleneck-view.test.js tests/report-presenter.test.js tests/subject-home-presenter.test.js
git commit -m "feat(math): group bottlenecks by hierarchy in views"
```

---

### Task 5: Render Grouped Reports and Clickable Resource Cards

**Files:**
- Modify: `miniprogram/pages/report/report.wxml`
- Modify: `miniprogram/pages/report/report.wxss`
- Modify: `miniprogram/utils/math-learning-map.js`
- Test: `tests/report-presenter.test.js`
- Manual: WeChat DevTools report page smoke test

**Interfaces:**
- Resource view includes `displayTitle`, `typeLabel`, `actionText`, `url`, `hasUrl`, and `usageText`.
- Report page renders grouped bottleneck sections before or alongside flat fallback list.

- [x] **Step 1: Add resource view assertions**

Assert report learning map resource cards expose:

```js
assert.equal(resource.displayTitle, '小数乘法示例：怎样确定积的小数点')
assert.equal(resource.typeLabel, '视频')
assert.equal(resource.hasUrl, true)
assert.match(resource.actionText, /链接/)
```

- [x] **Step 2: Run report test to verify failure if fields are missing**

Run:

```bash
npm test -- tests/report-presenter.test.js
```

Expected: fail only if resource cards are incomplete.

- [x] **Step 3: Update WXML resource card**

Render resource metadata with action:

```xml
<view class="resource-card" wx:for="{{item.resources}}" wx:key="resourceId">
  <view class="resource-meta">
    <text class="resource-role">{{item.role}}</text>
    <text class="resource-type">{{item.typeLabel}}</text>
  </view>
  <text class="resource-title">{{item.platform}} · {{item.displayTitle}}</text>
  <text class="resource-summary">{{item.summary}}</text>
  <button wx:if="{{item.hasUrl}}" data-url="{{item.url}}" bindtap="onCopyResourceUrl">
    {{item.actionText}}
  </button>
</view>
```

- [x] **Step 4: Add copy/open handler if missing**

In `report.js`, add:

```js
onCopyResourceUrl(e) {
  const url = e.currentTarget.dataset.url
  if (!url) {
    wx.showToast({ title: '暂无可用链接', icon: 'none' })
    return
  }
  wx.setClipboardData({
    data: url,
    success: () => wx.showToast({ title: '链接已复制', icon: 'success' })
  })
}
```

- [x] **Step 5: Run tests and DevTools smoke**

Run:

```bash
npm test -- tests/report-presenter.test.js
```

Manual check:

```text
打开数学诊断报告
确认卡点按中文类别分组
确认资源卡显示平台、视频/图文/搜索入口、按钮
确认按钮能复制链接
```

- [x] **Step 6: Commit**

```bash
git add miniprogram/pages/report/report.js miniprogram/pages/report/report.wxml miniprogram/pages/report/report.wxss miniprogram/utils/math-learning-map.js tests/report-presenter.test.js
git commit -m "feat(math): render grouped bottlenecks and resource links"
```

---

### Task 6: Upgrade Verification Scheduling from Flat Selection to Hierarchy Pages

**Files:**
- Modify: `miniprogram/pages/generate-verification/generate-verification.js`
- Modify: `miniprogram/pages/generate-verification/generate-verification.wxml`
- Modify: `miniprogram/pages/generate-verification/generate-verification.wxss`
- Modify: `cloudfunctions/generatePaper/verification-pack.js`
- Modify: `cloudfunctions/generatePaper/index.js`
- Test: `tests/verification-pack.test.js`
- Test: `tests/generate-paper-pdf.test.js`

**Interfaces:**
- Produces `scheduledPages` client-side.
- Cloud function accepts optional `targetPlan.pages[]`.
- `verificationPack.pages[]` carries `pageType`, `categoryId`, `categoryTitle`, `familyIds`, `nodeIds`, and `targetIds`.

- [x] **Step 1: Add verification pack tests**

Add a test that builds a pack from two same-family fine targets:

```js
assert.equal(pack.pages[0].pageType, 'same_family')
assert.equal(pack.pages[0].categoryTitle, '计算规则')
assert.deepEqual(pack.pages[0].targetIds, ['BN-DEC-MUL-POINT-COUNT', 'BN-DEC-MUL-POINT-ESTIMATE'])
```

- [x] **Step 2: Run tests to verify failure**

Run:

```bash
npm test -- tests/verification-pack.test.js tests/generate-paper-pdf.test.js
```

Expected: fail because scheduled hierarchy pages are not represented.

- [x] **Step 3: Build client scheduling model**

In `generate-verification.js`, add:

```js
function buildScheduledTaskPages(selectedItems = []) {
  const groups = groupBottlenecksByHierarchy(selectedItems)
  return groups.flatMap(group => group.families.map(family => ({
    pageType: family.itemCount >= 2 ? 'same_family' : 'micro_confirm',
    categoryId: group.categoryId,
    categoryTitle: group.categoryTitle,
    familyIds: [family.familyId],
    familyTitle: family.familyTitle,
    nodeIds: Array.from(new Set(family.items.map(item => item.nodeId).filter(Boolean))),
    targetIds: family.items.map(item => targetCodeForPaper(item)).filter(Boolean),
    targetNames: family.items.map(item => item.displayName).filter(Boolean)
  })))
}
```

- [x] **Step 4: Pass `targetPlan` to cloud function**

Update generate and preview calls:

```js
targetPlan: {
  strategy: 'hierarchy_pages_v1',
  pages: this.buildScheduledTaskPages(selected)
}
```

- [x] **Step 5: Update cloud pack builder**

`generatePaper/index.js` should read `event.targetPlan` and pass it into `buildVerificationPack`.

`verification-pack.js` should preserve page metadata and decorate questions by page.

- [x] **Step 6: Run tests**

Run:

```bash
npm test -- tests/verification-pack.test.js tests/generate-paper-pdf.test.js
```

Expected: pass.

- [x] **Step 7: Commit**

```bash
git add miniprogram/pages/generate-verification/generate-verification.js miniprogram/pages/generate-verification/generate-verification.wxml miniprogram/pages/generate-verification/generate-verification.wxss cloudfunctions/generatePaper/verification-pack.js cloudfunctions/generatePaper/index.js tests/verification-pack.test.js tests/generate-paper-pdf.test.js
git commit -m "feat(math): schedule verification pages by bottleneck hierarchy"
```

---

### Task 7: Backfill Historical Reports and Rebuild the Current Math Snapshot

**Files:**
- Modify: `scripts/backfill-math-learning-map.js`
- Modify: `cloudfunctions/reanalyzeMathHistory/index.js`
- Test: `tests/math-history-reanalysis.test.js`

**Interfaces:**
- Backfill adds hierarchy fields to existing reports without deleting old fields.
- Current full math snapshot uses fine bottlenecks plus category/family grouping.

- [x] **Step 1: Add migration dry-run assertions**

Add assertions that dry-run output counts:

```js
assert.ok(result.hierarchyBackfilledCount >= 0)
assert.ok(result.reportPreview.bottlenecks[0].candidateBottlenecks[0].categoryId)
```

- [x] **Step 2: Run migration tests**

Run:

```bash
npm test -- tests/math-history-reanalysis.test.js
```

Expected: fail until hierarchy count is implemented.

- [x] **Step 3: Update backfill output**

Backfill should report:

```js
{
  scannedCount,
  changedCount,
  hierarchyBackfilledCount,
  missingHierarchyCount,
  version: 'math-learning-map-v2.2-hierarchy'
}
```

- [x] **Step 4: Run migration tests**

Run:

```bash
npm test -- tests/math-history-reanalysis.test.js
```

Expected: pass.

- [x] **Step 5: Manual dry-run**

Run:

```bash
node scripts/backfill-math-learning-map.js --dry-run
```

Expected: prints changed report count and sample category/family fields.

- [x] **Step 6: Commit**

```bash
git add scripts/backfill-math-learning-map.js cloudfunctions/reanalyzeMathHistory/index.js tests/math-history-reanalysis.test.js
git commit -m "feat(math): backfill bottleneck hierarchy into history"
```

---

### Task 8: Deploy, Smoke Test, and Document the Upgrade

**Files:**
- Modify: `docs/subject-design/README.md`
- Modify: `docs/CLOUD_FUNCTIONS.md`
- Modify: `docs/DATA_DICTIONARY.md`
- Create: `docs/test-reports/2026-06-17-math-bottleneck-hierarchy-upgrade.md`

**Interfaces:**
- Documentation explains category/family/fine bottleneck relationships.
- Smoke report records DevTools checks and cloud deployment status.

- [x] **Step 1: Run full relevant tests**

Run:

```bash
npm test -- tests/math-bottleneck-hierarchy.test.js tests/math-learning-map-enricher.test.js tests/bottleneck-view.test.js tests/report-presenter.test.js tests/subject-home-presenter.test.js tests/verification-pack.test.js tests/generate-paper-pdf.test.js tests/math-history-reanalysis.test.js
```

Expected: all pass.

- [x] **Step 2: Deploy changed cloud functions**

Deploy:

```text
analyzePhotos
generatePaper
reanalyzeMathHistory
```

Expected: cloud functions upload without dependency errors.

- [x] **Step 3: WeChat DevTools smoke test**

Manual test cases:

```text
1. Open math diagnosis report.
2. Confirm grouped bottleneck sections use Chinese titles.
3. Confirm fine bottlenecks are still visible after expanding a group.
4. Confirm knowledge map resources show link actions.
5. Generate a math verification preview.
6. Confirm PDF pages include unique page codes and grouped target summaries.
7. Upload one verification page photo.
8. Confirm evidence updates fine bottleneck and knowledge node, not only category.
```

- [x] **Step 4: Update docs**

Update `DATA_DICTIONARY.md` with:

```text
bottleneckCategories
bottleneckFamilies
reports.bottlenecks[].candidateBottlenecks[].categoryId
reports.bottlenecks[].candidateBottlenecks[].familyId
papers.verificationPack.pages[].pageType
papers.verificationPack.pages[].categoryId
```

Update `CLOUD_FUNCTIONS.md` with the new `targetPlan` request field for `generatePaper`.

- [x] **Step 5: Write smoke test report**

Create `docs/test-reports/2026-06-17-math-bottleneck-hierarchy-upgrade.md` with:

```markdown
# 数学学习卡点层级升级测试报告

## 自动化测试

列出测试命令和结果。

## DevTools 验证

列出页面、操作、预期和实际结果。

## 云函数部署

列出函数名、部署时间和结果。

## 已知风险

记录还未覆盖的真实数据样本或资源链接审核问题。
```

- [x] **Step 6: Commit**

```bash
git add docs/CLOUD_FUNCTIONS.md docs/DATA_DICTIONARY.md docs/subject-design/README.md docs/test-reports/2026-06-17-math-bottleneck-hierarchy-upgrade.md
git commit -m "docs(math): document bottleneck hierarchy upgrade"
```

---

## Self-Review

- Spec coverage: covers hierarchy model, display, resources, verification scheduling, backfill, docs, and tests.
- Placeholder scan: no `TBD` or open-ended implementation steps remain; each task has explicit files and commands.
- Type consistency: category/family/fine bottleneck fields use `categoryId`, `categoryTitle`, `familyId`, `familyTitle`, `nodeId`, and `bottleneckId` consistently.
- Scope control: this plan does not rewrite Chinese or English logic; it only preserves compatibility where shared pages are touched.


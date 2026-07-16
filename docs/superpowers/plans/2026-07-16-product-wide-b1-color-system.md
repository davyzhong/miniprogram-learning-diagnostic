# Product-wide B1 Color System Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Migrate all 24 registered mini-program pages to the approved B1 Warm Multicolor design system, remove decorative emoji, preserve the restored high-density information architecture and every existing learning workflow.

**Architecture:** Define one additive B1 token and primitive layer in `miniprogram/app.wxss`, then migrate page families without changing cloud contracts, presenter responsibilities, permissions, or navigation. A manifest-driven static gate verifies route coverage and emoji removal, focused page-flow tests protect behavior, and WeChat DevTools layout checks enforce first-screen density and cross-platform rendering.

**Tech Stack:** WeChat Mini Program WXML/WXSS/JavaScript, Node.js `node:test`, miniprogram-automator, WeChat DevTools CLI.

---

## Implementation Constraints

- The worktree already contains uncommitted visual-restoration and functional-reintegration changes. Treat those files as the implementation baseline; do not restore them from older commits.
- Task 0 must commit that reviewed baseline before B1 implementation starts. Do not mix baseline restoration with B1 commits.
- Preserve the latest subject diagnosis content on the family homepage and the expanded diagnosis content on the learning profile.
- Preserve Chinese original-wrong-character verification, English learning flows, readable paper numbers, and internal-code filtering.
- Keep AI usage visible only in the family homepage header.
- Do not add icon fonts, remote fonts, decorative images, bitmap assets, SVG assets, or dependencies.
- Existing user-uploaded images, generated PDFs, report content, and `WechatSI` audio integration remain functional.
- Do not remove fields from presenter DTOs merely because an icon field is no longer rendered until all consumers and tests have migrated.
- Use only font weights `400`, `500`, `600`, and `700`.
- Never use directory-wide or wildcard `git add` commands. Stage only the exact files named by the current task.
- Before every commit, run:

```bash
git diff --cached --name-only
git diff --cached --check
git status --short
```

Any staged path absent from the current task's `Files` section must be unstaged before committing. In particular, protect `miniprogram/pages/index/index.js` unless the current task explicitly names it.

## File Structure

### Shared system

- Modify `miniprogram/app.wxss`: B1 foundation, subject, semantic, density, form, button, state, and text-marker primitives.
- Modify `miniprogram/app.json`: B1 navigation and page background colors.
- Modify `miniprogram/pages/bottleneck-center/bottleneck-center.json`: remove stale navy override.
- Modify `miniprogram/pages/bottleneck-detail/bottleneck-detail.json`: remove stale navy override.
- Replace `tests/bplus-design-system.test.js` with B1 route, token, navigation, density-contract, and emoji gates.
- Delete `miniprogram/utils/ui-icons.js` after its final consumer is removed.

### Core workbenches

- Modify `miniprogram/pages/index/index.wxml`
- Modify `miniprogram/pages/index/index.wxss`
- Modify `miniprogram/pages/index/index-presenter.js`
- Modify `miniprogram/utils/child-workbench.js`
- Modify `miniprogram/pages/student-profile/student-profile.wxml`
- Modify `miniprogram/pages/student-profile/student-profile.wxss`

### Subject learning loop

- Modify `miniprogram/pages/subject-home/subject-home.wxml`
- Modify `miniprogram/pages/subject-home/subject-home.wxss`
- Modify `miniprogram/pages/subject-home/subject-home-presenter.js`
- Modify `miniprogram/pages/chinese-review-detail/chinese-review-detail.wxml`
- Modify `miniprogram/pages/chinese-review-detail/chinese-review-detail.wxss`
- Modify `miniprogram/pages/chinese-skill-task/chinese-skill-task.wxml`
- Modify `miniprogram/pages/chinese-skill-task/chinese-skill-task.wxss`
- Modify `miniprogram/pages/english-practice/english-practice.wxml`
- Modify `miniprogram/pages/english-practice/english-practice.wxss`
- Modify `miniprogram/pages/english-dictation/english-dictation.wxml`
- Modify `miniprogram/pages/english-dictation/english-dictation.wxss`
- Modify `miniprogram/pages/english-wrong-words/english-wrong-words.wxml`
- Modify `miniprogram/pages/english-wrong-words/english-wrong-words.wxss`
- Modify `miniprogram/pages/english-confusion/english-confusion.wxml`
- Modify `miniprogram/pages/english-confusion/english-confusion.wxss`

### Diagnosis, progress, and resources

- Modify `miniprogram/pages/report/report.wxml`
- Modify `miniprogram/pages/report/report.wxss`
- Modify `miniprogram/pages/report/report-presenter.js`
- Modify `miniprogram/pages/learning-progress/learning-progress.wxml`
- Modify `miniprogram/pages/learning-progress/learning-progress.wxss`
- Modify `miniprogram/pages/bottleneck-center/bottleneck-center.wxml`
- Modify `miniprogram/pages/bottleneck-center/bottleneck-center.wxss`
- Modify `miniprogram/pages/bottleneck-detail/bottleneck-detail.wxml`
- Modify `miniprogram/pages/bottleneck-detail/bottleneck-detail.wxss`
- Modify `miniprogram/pages/bottleneck-detail/bottleneck-detail.js`
- Modify `miniprogram/pages/knowledge-map/knowledge-map.wxml`
- Modify `miniprogram/pages/knowledge-map/knowledge-map.wxss`
- Modify `miniprogram/pages/knowledge-map/knowledge-map-presenter.js`
- Modify `miniprogram/pages/learning-resource/learning-resource.wxml`
- Modify `miniprogram/pages/learning-resource/learning-resource.wxss`
- Modify `miniprogram/pages/learning-resource/learning-resource-presenter.js`

### Records, upload, and papers

- Modify `miniprogram/pages/upload-history/upload-history.wxml`
- Modify `miniprogram/pages/upload-history/upload-history.wxss`
- Modify `miniprogram/pages/upload-history/upload-history-presenter.js`
- Modify `miniprogram/pages/upload/upload.wxml`
- Modify `miniprogram/pages/upload/upload.wxss`
- Modify `miniprogram/pages/generate-verification/generate-verification.wxml`
- Modify `miniprogram/pages/generate-verification/generate-verification.wxss`
- Modify `miniprogram/pages/default-paper/default-paper.wxml`
- Modify `miniprogram/pages/default-paper/default-paper.wxss`
- Modify `miniprogram/pages/paper-preview/paper-preview.wxml`
- Modify `miniprogram/pages/paper-preview/paper-preview.wxss`

### Forms, management, and data

- Modify `miniprogram/pages/add-student/add-student.wxml`
- Modify `miniprogram/pages/add-student/add-student.wxss`
- Modify `miniprogram/pages/join-student/join-student.wxml`
- Modify `miniprogram/pages/join-student/join-student.wxss`
- Modify `miniprogram/pages/parent-management/parent-management.wxml`
- Modify `miniprogram/pages/parent-management/parent-management.wxss`
- Modify `miniprogram/pages/ai-usage/ai-usage.wxml`
- Modify `miniprogram/pages/ai-usage/ai-usage.wxss`

### Visual verification and docs

- Modify `scripts/devtools-family-density-e2e.js`
- Modify `scripts/devtools-upload-history-layout.js`
- Modify `scripts/devtools-e2e-fullpage.js`
- Create `scripts/devtools-b1-visual-audit.js`
- Create `docs/test-reports/2026-07-16-b1-color-system-verification.md`
- Refresh anonymized files under `docs/user-guide/images/`
- Modify `docs/user-guide/README.md`
- Modify `README.md`

---

### Task 0: Verify and Commit the Existing Restored Functional Baseline

**Files:**
- Modify: `miniprogram/pages/add-student/add-student.wxml`
- Modify: `miniprogram/pages/ai-usage/ai-usage.wxml`
- Modify: `miniprogram/pages/bottleneck-center/bottleneck-center.wxml`
- Modify: `miniprogram/pages/bottleneck-detail/bottleneck-detail.wxml`
- Modify: `miniprogram/pages/default-paper/default-paper.wxml`
- Modify: `miniprogram/pages/english-dictation/english-dictation.wxml`
- Modify: `miniprogram/pages/english-practice/english-practice.wxml`
- Modify: `miniprogram/pages/english-wrong-words/english-wrong-words.wxml`
- Modify: `miniprogram/pages/generate-verification/generate-verification.wxml`
- Modify: `miniprogram/pages/index/index-presenter.js`
- Modify: `miniprogram/pages/index/index.js`
- Modify: `miniprogram/pages/index/index.wxml`
- Modify: `miniprogram/pages/index/index.wxss`
- Modify: `miniprogram/pages/join-student/join-student.wxml`
- Modify: `miniprogram/pages/knowledge-map/knowledge-map.wxml`
- Modify: `miniprogram/pages/learning-progress/learning-progress.wxml`
- Modify: `miniprogram/pages/learning-resource/learning-resource.wxml`
- Modify: `miniprogram/pages/paper-preview/paper-preview.wxml`
- Modify: `miniprogram/pages/paper-preview/paper-preview.wxss`
- Modify: `miniprogram/pages/parent-management/parent-management.wxml`
- Modify: `miniprogram/pages/report/report.wxml`
- Modify: `miniprogram/pages/report/report.wxss`
- Modify: `miniprogram/pages/student-profile/student-profile.wxml`
- Modify: `miniprogram/pages/subject-home/subject-home-presenter.js`
- Modify: `miniprogram/pages/subject-home/subject-home.wxml`
- Modify: `miniprogram/pages/subject-home/subject-home.wxss`
- Modify: `miniprogram/pages/upload-history/upload-history.wxml`
- Modify: `miniprogram/pages/upload-history/upload-history.wxss`
- Modify: `miniprogram/pages/upload/upload.wxml`
- Modify: `miniprogram/utils/child-workbench.js`
- Modify: `tests/bplus-design-system.test.js`
- Modify: `tests/index-page-flows.test.js`
- Modify: `tests/index-presenter.test.js`
- Modify: `tests/subject-home-page-flows.test.js`
- Modify: `tests/subject-home-presenter.test.js`

- [ ] **Step 1: Review the full existing diff as the pre-B1 baseline**

Run:

```bash
git diff --stat
git diff -- miniprogram/pages/index miniprogram/pages/student-profile miniprogram/utils/child-workbench.js
git diff -- miniprogram/pages/subject-home miniprogram/pages/report miniprogram/pages/upload-history
git diff -- tests
```

Confirm the diff contains only the already-approved visual restoration and functional reintegration: diagnosis placement, homepage diagnosis exposure, profile deduplication, compact records, readable codes, Chinese/English flow preservation, and AI-usage placement.

- [ ] **Step 2: Verify the baseline before committing**

Run:

```bash
npm run check
npm test
npm run check:size
git diff --check
```

Expected: PASS.

- [ ] **Step 3: Stage the exact baseline file list**

Use one explicit `git add --` command containing exactly the 35 files listed in this task. Do not stage this plan document or any B1 implementation file.

- [ ] **Step 4: Audit the staged set**

Run:

```bash
git diff --cached --name-only
git diff --cached --check
git status --short
```

Expected: exactly the listed baseline files are staged.

- [ ] **Step 5: Commit**

```bash
git commit -m "feat: restore dense diagnosis workflows"
```

---

### Task 1: Establish B1 Tokens, Route Gate, and Navigation Chrome

**Files:**
- Modify: `tests/bplus-design-system.test.js`
- Modify: `miniprogram/app.wxss`
- Modify: `miniprogram/app.json`
- Modify: `miniprogram/pages/bottleneck-center/bottleneck-center.json`
- Modify: `miniprogram/pages/bottleneck-detail/bottleneck-detail.json`
- Modify: `miniprogram/pages/index/index.wxml`
- Modify: `miniprogram/pages/student-profile/student-profile.wxml`
- Modify: `miniprogram/pages/add-student/add-student.wxml`
- Modify: `miniprogram/pages/subject-home/subject-home.wxml`
- Modify: `miniprogram/pages/upload/upload.wxml`
- Modify: `miniprogram/pages/upload-history/upload-history.wxml`
- Modify: `miniprogram/pages/report/report.wxml`
- Modify: `miniprogram/pages/learning-progress/learning-progress.wxml`
- Modify: `miniprogram/pages/bottleneck-center/bottleneck-center.wxml`
- Modify: `miniprogram/pages/bottleneck-detail/bottleneck-detail.wxml`
- Modify: `miniprogram/pages/knowledge-map/knowledge-map.wxml`
- Modify: `miniprogram/pages/english-practice/english-practice.wxml`
- Modify: `miniprogram/pages/english-dictation/english-dictation.wxml`
- Modify: `miniprogram/pages/english-wrong-words/english-wrong-words.wxml`
- Modify: `miniprogram/pages/chinese-review-detail/chinese-review-detail.wxml`
- Modify: `miniprogram/pages/english-confusion/english-confusion.wxml`
- Modify: `miniprogram/pages/chinese-skill-task/chinese-skill-task.wxml`
- Modify: `miniprogram/pages/learning-resource/learning-resource.wxml`
- Modify: `miniprogram/pages/generate-verification/generate-verification.wxml`
- Modify: `miniprogram/pages/default-paper/default-paper.wxml`
- Modify: `miniprogram/pages/paper-preview/paper-preview.wxml`
- Modify: `miniprogram/pages/parent-management/parent-management.wxml`
- Modify: `miniprogram/pages/join-student/join-student.wxml`
- Modify: `miniprogram/pages/ai-usage/ai-usage.wxml`

- [ ] **Step 1: Replace the old B+ baseline assertion with failing B1 token and route assertions**

Add a token contract similar to:

```js
const B1_TOKENS = [
  '#26383A', '#F8F5EF', '#FFFDFA', '#253436', '#566568', '#778386', '#DEDBD2',
  '#D4483A', '#FDE1DC', '#B37808', '#FAE9B7', '#4168B7', '#E1E8FA',
  '#DF5B3F', '#F8E3DF', '#16775E', '#DFF1E9', '#4168B7', '#E6ECF8',
  '#A36C08', '#F8ECCB',
  '#A52F3A', '#F8DDE1'
]

test('global stylesheet defines the complete B1 token set', () => {
  const wxss = read('miniprogram/app.wxss').toUpperCase()
  for (const token of B1_TOKENS) assert.match(wxss, new RegExp(token))
})

test('all 24 registered routes use the B1 page shell', () => {
  const pages = registeredPages()
  assert.equal(pages.length, 24)
  for (const page of pages) {
    assert.match(read(`${page}.wxml`), /class="[^"]*\bb1-page\b/)
  }
})
```

Add a native navigation assertion for `#26383A` and `#F8F5EF`, and reject page-level `#173f6b` overrides.

Add explicit contracts for every shared primitive introduced in Step 3:

```js
for (const selector of [
  'b1-card', 'b1-dense-row', 'b1-tag', 'b1-segmented', 'b1-button-primary',
  'b1-button-secondary', 'b1-button-destructive', 'b1-state-loading',
  'b1-state-empty', 'b1-state-error', 'b1-chevron', 'b1-hit-target'
]) {
  assert.match(appWxss, new RegExp(`\\.${selector}\\s*\\{`))
}
assert.match(appWxss, /\.b1-hit-target[\s\S]*min-width:\s*88rpx[\s\S]*min-height:\s*88rpx/)
assert.doesNotMatch(appWxss, /font-weight:\s*(?:[89]00|[1-9]50)\b/)
assert.doesNotMatch(appWxss, /(?:https?:|data:|@font-face|\.woff|\.ttf|background-image\s*:)/i)
```

Assert priority and destructive classes use distinct token pairs.

- [ ] **Step 2: Run the focused test and verify it fails**

Run:

```bash
node --test tests/bplus-design-system.test.js
```

Expected: FAIL because B1 tokens, `.b1-page`, and navigation colors do not exist yet.

- [ ] **Step 3: Add B1 tokens and primitives to the global stylesheet**

Add shared classes without renaming page-specific workflow selectors:

```css
page {
  background: #F8F5EF;
  color: #253436;
  font-weight: 400;
  letter-spacing: 0;
}

.b1-page {
  min-height: 100vh;
  overflow-x: hidden;
  background: #F8F5EF;
  color: #253436;
}

.b1-card {
  background: #FFFDFA;
  border: 1rpx solid #DEDBD2;
  border-radius: 10rpx;
}

.b1-subject-chinese { --b1-subject: #D4483A; --b1-subject-soft: #FDE1DC; }
.b1-subject-math { --b1-subject: #B37808; --b1-subject-soft: #FAE9B7; }
.b1-subject-english { --b1-subject: #4168B7; --b1-subject-soft: #E1E8FA; }

.b1-status-priority { color: #DF5B3F; background: #F8E3DF; }
.b1-status-improved { color: #16775E; background: #DFF1E9; }
.b1-status-informational { color: #4168B7; background: #E6ECF8; }
.b1-status-waiting { color: #A36C08; background: #F8ECCB; }
.b1-status-destructive { color: #A52F3A; background: #F8DDE1; }
.b1-status-neutral { color: #778386; background: #F1EEE7; }
```

Also define shared dense rows, tags, segmented controls, primary/secondary/destructive buttons, loading/empty/error states, CSS chevron, and `88rpx × 88rpx` effective hit-area helpers.

- [ ] **Step 4: Migrate navigation colors**

Set:

```json
"navigationBarBackgroundColor": "#26383A",
"backgroundColor": "#F8F5EF"
```

Remove stale page-level navy overrides from both bottleneck JSON files so they inherit the global navigation chrome.

- [ ] **Step 5: Add `b1-page` to all 24 page roots without changing internal structure**

This is a mechanical root-class addition only. Do not change handlers or data bindings in this step.

- [ ] **Step 6: Run the focused test**

Run:

```bash
node --test tests/bplus-design-system.test.js
npm run check:size
```

Expected: PASS; main package remains below `800 KB`.

- [ ] **Step 7: Commit**

Stage only `miniprogram/app.wxss`, `miniprogram/app.json`, the two bottleneck JSON files, the 24 explicitly enumerated WXML root files, and `tests/bplus-design-system.test.js`. Audit the staged list, then commit:

```bash
git commit -m "feat: establish B1 visual system"
```

---

### Task 2: Remove Decorative Emoji from the UI Data Pipeline

**Files:**
- Modify: `tests/bplus-design-system.test.js`
- Modify: `tests/index-presenter.test.js`
- Modify: `tests/subject-home-presenter.test.js`
- Modify: `tests/report-presenter.test.js`
- Modify: `tests/upload-history-page-flows.test.js`
- Modify: `miniprogram/pages/index/index-presenter.js`
- Modify: `miniprogram/utils/child-workbench.js`
- Modify: `miniprogram/pages/subject-home/subject-home-presenter.js`
- Modify: `miniprogram/pages/report/report-presenter.js`
- Modify: `miniprogram/pages/knowledge-map/knowledge-map-presenter.js`
- Modify: `miniprogram/pages/learning-resource/learning-resource-presenter.js`
- Modify: `miniprogram/pages/upload-history/upload-history-presenter.js`
- Modify: `miniprogram/pages/bottleneck-detail/bottleneck-detail.js`
- Modify: `miniprogram/utils/bottleneck-view.js`
- Modify: `miniprogram/utils/util.js`
- Modify: `miniprogram/pages/learning-progress/learning-progress.js`
- Modify: `miniprogram/pages/generate-verification/generate-verification.wxml`
- Modify: `miniprogram/pages/add-student/add-student.wxml`
- Modify: `miniprogram/pages/join-student/join-student.wxml`
- Modify: `miniprogram/pages/default-paper/default-paper.wxml`
- Modify: `miniprogram/pages/learning-resource/learning-resource.wxml`
- Modify: `miniprogram/pages/upload/upload.wxml`
- Modify: all additional `miniprogram/pages/**/*.{wxml,js}` and `miniprogram/utils/**/*.js` files printed by the failing scan before implementation
- Delete: `miniprogram/utils/ui-icons.js`

- [ ] **Step 1: Add a failing repository-authored UI emoji scan**

Implement a scan over:

```js
const UI_SOURCE_ROOTS = ['miniprogram/pages', 'miniprogram/utils']
const UI_EXTENSIONS = new Set(['.wxml', '.js'])
```

Strip comments, then check repository-authored literals with Unicode property escapes and an explicit unstable-symbol pattern:

```js
const PROHIBITED_UI_SYMBOL = /(?:\p{Extended_Pictographic}|\p{Emoji_Presentation}|[\u2190-\u21FF\u2600-\u27BF]|[✓✗✕★◎⌾□▧])/u
```

The narrow allowlist is:

- `+` only when paired with a visible text label such as `拍照/相册`;
- native WeChat API option values only when the AST/text context is exactly `wx.showToast({ icon: 'none'|'success'|'error' })`;
- symbols inside comments or runtime user/generated content.

Do not remove arbitrary `icon:` properties before scanning. The failure output becomes the authoritative file list for this task, and the final scan must print zero violations.

- [ ] **Step 2: Run the scan and capture the initial failure list**

Run:

```bash
node --test tests/bplus-design-system.test.js
```

Expected: FAIL with current `ui-icons.js`, knowledge-map, upload tips, report navigation, resource platform metadata, and other rendered emoji.

- [ ] **Step 3: Replace emoji DTOs with stable text markers**

Use short labels:

```js
const SUBJECT_MARKERS = { math: '数学', chinese: '语文', english: '英语' }
const STATUS_MARKERS = {
  improved: '改善',
  persisting: '持续',
  waiting: '待验证',
  report: '报告',
  verification: '验证'
}
```

For resource platforms, return `shortLabel` values such as `B站`, `小红书`, `平台`, `课程`, and `链接`, not decorative icons.

- [ ] **Step 4: Preserve semantic text in all presenter contracts**

Where WXML currently renders `item.icon`, introduce or reuse a readable `marker`, `shortLabel`, `statusText`, or `subjectName`. Keep IDs and action fields unchanged.

- [ ] **Step 5: Delete the obsolete icon module**

Remove all imports of `miniprogram/utils/ui-icons.js`, then delete it.

- [ ] **Step 6: Run focused presenter and static tests**

Run:

```bash
node --test \
  tests/bplus-design-system.test.js \
  tests/index-presenter.test.js \
  tests/subject-home-presenter.test.js \
  tests/report-presenter.test.js \
  tests/knowledge-map-externalization.test.js \
  tests/learning-resource-presenter.test.js \
  tests/upload-history-page-flows.test.js
```

Expected: PASS.

- [ ] **Step 7: Commit**

Stage only files reported by the initial scan, the five Task 2 test files, and the deleted `ui-icons.js`. Audit the staged list, then commit:

```bash
git commit -m "refactor: replace decorative emoji with B1 markers"
```

---

### Task 3: Migrate the Family Homepage and Learning Profile

**Files:**
- Modify: `tests/index-page-flows.test.js`
- Modify: `tests/index-presenter.test.js`
- Modify: `tests/student-profile-page-flows.test.js`
- Modify: `miniprogram/pages/index/index.wxml`
- Modify: `miniprogram/pages/index/index.wxss`
- Modify: `miniprogram/pages/index/index-presenter.js`
- Modify: `miniprogram/utils/child-workbench.js`
- Modify: `miniprogram/pages/student-profile/student-profile.wxml`
- Modify: `miniprogram/pages/student-profile/student-profile.wxss`
- Modify: `scripts/devtools-family-density-e2e.js`
- Create: `scripts/devtools-profile-density-e2e.js`

- [ ] **Step 1: Add failing B1 hierarchy assertions**

Assert:

- family summary uses `b1-family-summary`;
- the four metrics expose four semantic tone classes;
- each child priority block uses the priority class;
- diagnosis rows expose subject classes;
- the profile renders expanded report cards;
- only the homepage WXML contains the AI-usage route.

- [ ] **Step 2: Tighten the first-screen density validator**

Keep a dedicated `375 × 812` density target and require:

```js
['household summary', metrics.householdSummaryRect],
['first child identity', cards[0].identityRect],
['first child metric strip', cards[0].metricRect],
['first child priority block', cards[0].priorityRect],
['first child diagnosis row', cards[0].diagnosisRects[0]]
```

Keep existing overflow, clipping, overlap, and internal-code assertions.

Create `scripts/devtools-profile-density-e2e.js` with a two-report mock and assert at `375 × 812` that the header, first judgment, signal row, integrated next action, and beginning of the second report are visible.

- [ ] **Step 3: Run focused tests and verify failure**

Run:

```bash
node --test tests/index-page-flows.test.js tests/index-presenter.test.js tests/student-profile-page-flows.test.js
```

Expected: FAIL on missing B1 classes.

- [ ] **Step 4: Restyle the family summary and child cards**

Apply:

- soft green family summary;
- semantic metric surfaces;
- coral priority action;
- Chinese red, mathematics gold, English indigo diagnosis rows and quick actions;
- warm card and canvas colors;
- `18-22rpx` card padding and `10-16rpx` gaps.

Do not remove current four statistics, priority action, three-subject state, diagnosis rows, quick links, or child identity.

- [ ] **Step 5: Restyle the learning profile**

Keep one compact identity header. Render reports with subject accent borders, judgment, semantic signals, and integrated next action. Do not add AI usage or duplicate report/action cards.

- [ ] **Step 6: Run focused tests and density E2E**

Run:

```bash
node --test tests/index-page-flows.test.js tests/index-presenter.test.js tests/student-profile-page-flows.test.js
npm run test:e2e:family-density
node scripts/devtools-profile-density-e2e.js
```

Expected: PASS with the first diagnosis row visible in the first viewport.

Also run explicitly:

```bash
node --test \
  tests/student-access.test.js \
  tests/student-data-access.test.js \
  tests/profile-merge-protection.test.js \
  tests/profile-summary.test.js \
  tests/traceable-actions.test.js
```

- [ ] **Step 7: Commit**

Stage only the files listed for Task 3, audit the staged list, then commit:

```bash
git commit -m "feat: apply B1 to family and profile workbenches"
```

---

### Task 4: Migrate Subject Workbenches and Chinese/English Learning Tools

**Files:**
- Modify: `tests/subject-home-page-flows.test.js`
- Modify: `tests/subject-home-presenter.test.js`
- Modify: `tests/english-practice-page-flows.test.js`
- Modify: `tests/english-dictation-page-flows.test.js`
- Modify: `tests/english-devtools-cases.test.js`
- Modify: `tests/chinese-review-detail-page-flows.test.js`
- Modify: `tests/chinese-review-targets.test.js`
- Modify: `package.json`
- Modify: `miniprogram/pages/subject-home/subject-home.wxml`
- Modify: `miniprogram/pages/subject-home/subject-home.wxss`
- Modify: `miniprogram/pages/subject-home/subject-home-presenter.js`
- Modify: `miniprogram/pages/chinese-review-detail/chinese-review-detail.wxml`
- Modify: `miniprogram/pages/chinese-review-detail/chinese-review-detail.wxss`
- Modify: `miniprogram/pages/chinese-skill-task/chinese-skill-task.wxml`
- Modify: `miniprogram/pages/chinese-skill-task/chinese-skill-task.wxss`
- Modify: `miniprogram/pages/english-practice/english-practice.wxml`
- Modify: `miniprogram/pages/english-practice/english-practice.wxss`
- Modify: `miniprogram/pages/english-dictation/english-dictation.wxml`
- Modify: `miniprogram/pages/english-dictation/english-dictation.wxss`
- Modify: `miniprogram/pages/english-wrong-words/english-wrong-words.wxml`
- Modify: `miniprogram/pages/english-wrong-words/english-wrong-words.wxss`
- Modify: `miniprogram/pages/english-confusion/english-confusion.wxml`
- Modify: `miniprogram/pages/english-confusion/english-confusion.wxss`

- [ ] **Step 1: Add failing subject-aware class assertions**

Assert that:

- subject-home root keeps `page-{{subject}}` and adds B1 classes;
- latest diagnosis remains near the top;
- primary action uses a subject action surface;
- queue markers use stable text;
- English controls use indigo classes and retain text labels;
- Chinese review pages use red classes and preserve original-item/review-stage text.
- original wrong-character/item identity remains rendered and passed into verification navigation;
- review-stage grouping and similar-character transfer targets remain unchanged.

- [ ] **Step 2: Run focused tests and verify failure**

Run:

```bash
node --test \
  tests/subject-home-page-flows.test.js \
  tests/subject-home-presenter.test.js \
  tests/english-practice-page-flows.test.js \
  tests/english-dictation-page-flows.test.js \
  tests/chinese-review-detail-page-flows.test.js \
  tests/chinese-review-targets.test.js
```

- [ ] **Step 3: Apply subject tokens to subject-home**

Use dynamic variables inherited from `page-math`, `page-chinese`, and `page-english`. Replace the map emoji and tool emoji with `知识`, `报告`, `上传`, `记录`, `Aa`, or numbered markers.

- [ ] **Step 4: Apply Chinese B1 styling**

Chinese pages use red subject accents but green for improved states, gold for waiting states, and destructive red only for explicit deletion/error.

- [ ] **Step 5: Apply English B1 styling**

Practice, dictation, wrong words, and confusion pages use indigo for subject ownership. Audio controls retain `播放`, `暂停`, `重播`, `开始听写`, and `下一个` labels. Do not alter WechatSI calls or state transitions.

Before WXML edits, add page-flow assertions that every existing `bindtap`, `bindinput`, `data-action-type`, review item ID, and navigation parameter remains present.

- [ ] **Step 6: Run subject and English regression tests**

Run:

```bash
node --test \
  tests/subject-home-page-flows.test.js \
  tests/subject-home-presenter.test.js \
  tests/english-practice-page-flows.test.js \
  tests/english-dictation-page-flows.test.js \
  tests/english-devtools-cases.test.js \
  tests/english-vocabulary.test.js \
  tests/chinese-review-detail-page-flows.test.js \
  tests/chinese-review-targets.test.js
```

Expected: PASS.

Add both Chinese tests to the `test:unit` script in `package.json` so final verification cannot omit them.

- [ ] **Step 7: Commit**

Stage only Task 4 files, audit the staged list, then commit:

```bash
git commit -m "feat: apply B1 to subject learning loops"
```

---

### Task 5: Migrate Diagnosis, Progress, Bottlenecks, Knowledge Map, and Resources

**Files:**
- Modify: `tests/report-page-flows.test.js`
- Modify: `tests/report-presenter.test.js`
- Modify: `tests/bottleneck-page-flows.test.js`
- Modify: `tests/knowledge-map-page-controller.test.js`
- Modify: `tests/knowledge-map-wiring.test.js`
- Modify: `tests/learning-resource-presenter.test.js`
- Modify: `miniprogram/pages/report/report.wxml`
- Modify: `miniprogram/pages/report/report.wxss`
- Modify: `miniprogram/pages/report/report-presenter.js`
- Modify: `miniprogram/pages/learning-progress/learning-progress.wxml`
- Modify: `miniprogram/pages/learning-progress/learning-progress.wxss`
- Modify: `miniprogram/pages/bottleneck-center/bottleneck-center.wxml`
- Modify: `miniprogram/pages/bottleneck-center/bottleneck-center.wxss`
- Modify: `miniprogram/pages/bottleneck-detail/bottleneck-detail.wxml`
- Modify: `miniprogram/pages/bottleneck-detail/bottleneck-detail.wxss`
- Modify: `miniprogram/pages/bottleneck-detail/bottleneck-detail.js`
- Modify: `miniprogram/pages/knowledge-map/knowledge-map.wxml`
- Modify: `miniprogram/pages/knowledge-map/knowledge-map.wxss`
- Modify: `miniprogram/pages/knowledge-map/knowledge-map-presenter.js`
- Modify: `miniprogram/pages/learning-resource/learning-resource.wxml`
- Modify: `miniprogram/pages/learning-resource/learning-resource.wxss`
- Modify: `miniprogram/pages/learning-resource/learning-resource-presenter.js`

- [ ] **Step 1: Add failing editorial and subject-aware assertions**

Require report section markers to use text labels, progress statuses to use semantic classes, bottleneck pages to derive subject classes dynamically, and resource rows to use platform text labels.

Add route/binding assertions for report section navigation, retry/generate actions, bottleneck task generation, evidence navigation, knowledge-map explanation generation, and resource copy/jump actions.

- [ ] **Step 2: Run focused tests and verify failure**

Run:

```bash
node --test \
  tests/report-page-flows.test.js \
  tests/report-presenter.test.js \
  tests/bottleneck-page-flows.test.js \
  tests/knowledge-map-page-controller.test.js \
  tests/learning-resource-presenter.test.js
```

- [ ] **Step 3: Restyle the diagnosis report as an editorial document**

Keep long-form content neutral. Use subject color on report identity and section rules; semantic colors only on evidence/change/action states. Do not wrap each section in a nested card.

- [ ] **Step 4: Restyle learning progress and bottleneck pages**

Use readable legend text beside every status. The bottleneck center remains cross-subject; apply subject color per row or active filter, not a fixed mathematics theme.

- [ ] **Step 5: Replace map and resource emoji**

Map domains use numbered or abbreviated text markers. Resource sources use readable platform labels and preserve jump/copy behavior.

- [ ] **Step 6: Run focused tests**

Run:

```bash
node --test \
  tests/report-page-flows.test.js \
  tests/report-presenter.test.js \
  tests/bottleneck-page-flows.test.js \
  tests/knowledge-map-externalization.test.js \
  tests/knowledge-map-page-controller.test.js \
  tests/knowledge-map-wiring.test.js \
  tests/learning-resource-presenter.test.js \
  tests/learning-resource-content-depth.test.js
```

Expected: PASS.

- [ ] **Step 7: Commit**

Stage only Task 5 files, audit the staged list, then commit:

```bash
git commit -m "feat: apply B1 to diagnosis and learning insights"
```

---

### Task 6: Migrate Learning Records and Upload

**Files:**
- Modify: `tests/upload-history-page-flows.test.js`
- Modify: `tests/upload-page-flows.test.js`
- Modify: `tests/user-facing-code-hygiene.test.js`
- Modify: `miniprogram/pages/upload-history/upload-history.wxml`
- Modify: `miniprogram/pages/upload-history/upload-history.wxss`
- Modify: `miniprogram/pages/upload-history/upload-history-presenter.js`
- Modify: `miniprogram/pages/upload/upload.wxml`
- Modify: `miniprogram/pages/upload/upload.wxss`
- Modify: `scripts/devtools-upload-history-layout.js`

- [ ] **Step 1: Add failing compact-record and upload guidance assertions**

Require:

- subject accent class per record;
- text marker instead of event emoji;
- readable paper code remains;
- upload tips use text-only short labels;
- image delete control has `aria-label="删除图片"`;
- asynchronous analysis state uses text and CSS, not an hourglass glyph.
- existing image-selection, HEIF conversion, delete-index, submit, and background-analysis bindings remain present.

- [ ] **Step 2: Run focused tests and verify failure**

Run:

```bash
node --test tests/upload-history-page-flows.test.js tests/upload-page-flows.test.js tests/user-facing-code-hygiene.test.js
```

- [ ] **Step 3: Restyle learning records**

Use segmented filters, subject left borders, compact metadata, readable status text, and at most three inline evidence rows. Preserve `数学-YYYYMMDD-NN` and equivalent parent-readable numbers.

- [ ] **Step 4: Restyle upload**

Keep user thumbnails and HEIF conversion badges. Replace photo-tip emoji with four text cells: `光线`, `铺平`, `清晰`, `红笔`. Keep `+` only as a familiar add symbol paired with `拍照/相册`.

- [ ] **Step 5: Extend the layout validator**

At `375 × 812`, require filter controls plus at least two record cards, while retaining existing no-overflow, maximum-card-height, code-height, and internal-code checks.

- [ ] **Step 6: Run focused tests and E2E**

Run:

```bash
node --test tests/upload-history-page-flows.test.js tests/upload-page-flows.test.js tests/user-facing-code-hygiene.test.js
npm run test:e2e:upload-history-layout
```

Expected: PASS.

- [ ] **Step 7: Commit**

Stage only Task 6 files, audit the staged list, then commit:

```bash
git commit -m "feat: apply B1 to records and upload"
```

---

### Task 7: Migrate Verification and Paper Workflows

**Files:**
- Modify: `tests/generate-verification-page-flows.test.js`
- Modify: `tests/paper-page-flows.test.js`
- Modify: `tests/paper-preview-presenter.test.js`
- Modify: `tests/verification-pack.test.js`
- Modify: `miniprogram/pages/generate-verification/generate-verification.wxml`
- Modify: `miniprogram/pages/generate-verification/generate-verification.wxss`
- Modify: `miniprogram/pages/default-paper/default-paper.wxml`
- Modify: `miniprogram/pages/default-paper/default-paper.wxss`
- Modify: `miniprogram/pages/paper-preview/paper-preview.wxml`
- Modify: `miniprogram/pages/paper-preview/paper-preview.wxss`

- [ ] **Step 1: Add failing paper identity and action assertions**

Require a compact paper header, subject class, explicit generation state, and text-first `预览`, `打印`, `下载`, `上传作答`, and `查看反馈` controls.

Add assertions preserving paper ID, subject, source review item ID, source-item identity, preview/upload routes, and generation payload fields.

- [ ] **Step 2: Run focused tests and verify failure**

Run:

```bash
node --test \
  tests/generate-verification-page-flows.test.js \
  tests/paper-page-flows.test.js \
  tests/paper-preview-presenter.test.js \
  tests/verification-pack.test.js
```

- [ ] **Step 3: Apply B1 paper surfaces**

Use Chinese red or mathematics gold for paper identity. Use gold semantic status for waiting/generating, green for ready/completed, and destructive red only for failures.

- [ ] **Step 4: Preserve Chinese verification semantics**

Do not change source-item retention, stage grouping, similar-character transfer items, or paper-generation parameters.

- [ ] **Step 5: Run paper regression tests**

Run:

```bash
node --test \
  tests/generate-verification-page-flows.test.js \
  tests/paper-page-flows.test.js \
  tests/paper-preview-presenter.test.js \
  tests/verification-pack.test.js \
  tests/verification-evidence.test.js \
  tests/auto-verification.test.js
```

Expected: PASS.

- [ ] **Step 6: Commit**

Stage only Task 7 files, audit the staged list, then commit:

```bash
git commit -m "feat: apply B1 to verification papers"
```

---

### Task 8: Migrate Forms, Parent Management, and AI Usage

**Files:**
- Modify: `tests/parent-management-page-flows.test.js`
- Modify: `tests/ai-usage-presenter.test.js`
- Modify: `miniprogram/pages/add-student/add-student.wxml`
- Modify: `miniprogram/pages/add-student/add-student.wxss`
- Modify: `miniprogram/pages/join-student/join-student.wxml`
- Modify: `miniprogram/pages/join-student/join-student.wxss`
- Modify: `miniprogram/pages/parent-management/parent-management.wxml`
- Modify: `miniprogram/pages/parent-management/parent-management.wxss`
- Modify: `miniprogram/pages/ai-usage/ai-usage.wxml`
- Modify: `miniprogram/pages/ai-usage/ai-usage.wxss`

- [ ] **Step 1: Add failing form, destructive-action, and data-color assertions**

Assert compact form groups, neutral-green primary actions, explicit destructive text, and AI usage category classes. Confirm no student-profile AI usage route is introduced.

Add assertions for owner/viewer role behavior, invite creation, member removal permissions, join-code input, and student creation submission bindings.

- [ ] **Step 2: Run focused tests and verify failure**

Run:

```bash
node --test tests/parent-management-page-flows.test.js tests/ai-usage-presenter.test.js tests/index-page-flows.test.js
```

- [ ] **Step 3: Apply B1 to forms**

Use neutral warm cards, colored section headings, stable input borders, clear focus states, and primary buttons with text.

- [ ] **Step 4: Apply B1 to parent management**

Use green for normal management and `#A52F3A/#F8DDE1` only for `移除` or equivalent destructive operations. Preserve role and permission behavior.

- [ ] **Step 5: Apply B1 to AI usage**

Use restrained multicolor totals and ledger categories. Keep the page reachable only through the homepage top-level entry.

- [ ] **Step 6: Run focused tests**

Run:

```bash
node --test \
  tests/parent-management-page-flows.test.js \
  tests/ai-usage-presenter.test.js \
  tests/ai-usage-ledger.test.js \
  tests/index-page-flows.test.js
```

Expected: PASS.

- [ ] **Step 7: Commit**

Stage only Task 8 files, audit the staged list, then commit:

```bash
git commit -m "feat: apply B1 to forms and management"
```

---

### Task 9: Complete the 24-page Audit, Visual Verification, and Documentation

**Files:**
- Modify: `tests/bplus-design-system.test.js`
- Modify: `scripts/devtools-e2e-fullpage.js`
- Create: `scripts/devtools-b1-visual-audit.js`
- Create: `tests/b1-visual-audit-manifest.test.js`
- Modify: `package.json`
- Create: `docs/test-reports/2026-07-16-b1-color-system-verification.md`
- Modify: `docs/user-guide/README.md`
- Modify: `README.md`
- Refresh: `docs/user-guide/images/*.png`
- Modify: `scripts/generate-readme-screenshots.js`

- [ ] **Step 1: Add a complete route audit command**

Create `scripts/devtools-b1-visual-audit.js` that:

- derives all 24 routes from `app.json`;
- launches representative mock states;
- collects viewport width, page width, root class, visible text, and primary interactive rectangles;
- rejects horizontal overflow, blank glyph placeholders, clipped primary controls, and tap targets below `44 × 44` CSS pixels;
- captures Android `360 × 800` and iPhone `390 × 844` screenshots;
- supports a `B1_FONT_SCALE=1.2` run.

Define a 24-entry audit manifest. Every entry contains:

```js
{
  key,
  route,
  query,
  installFixture,
  expectedText,
  requiredSelectors,
  subject,
  screenshotName
}
```

Fixtures must provide the required mock user, permissions, student, report, paper, resource, vocabulary, and usage data before the route launches.

Create `tests/b1-visual-audit-manifest.test.js` that compares the audit manifest to all routes derived from `app.json`, rejects duplicates, and requires every field above.

Add:

```json
"test:e2e:b1-visual": "node scripts/devtools-b1-visual-audit.js"
```

- [ ] **Step 2: Update the full-page core test inventory from 17 to 24 routes**

Add missing routes:

- `learning-progress`
- `knowledge-map`
- `english-wrong-words`
- `chinese-review-detail`
- `english-confusion`
- `chinese-skill-task`
- `ai-usage`

Keep route-specific key text and internal-code assertions.

- [ ] **Step 3: Run static and unit verification**

Run:

```bash
npm run check
npm test
npm run check:size
node --test tests/b1-visual-audit-manifest.test.js
git diff --check
```

Expected:

- all JavaScript checks pass;
- all unit tests pass;
- main package `< 800 KB`;
- no whitespace errors.

- [ ] **Step 4: Run WeChat DevTools verification**

Run:

```bash
npm run test:e2e:doctor
npm run test:e2e:core
npm run test:e2e:family-density
npm run test:e2e:upload-history-layout
node scripts/devtools-profile-density-e2e.js
npm run test:e2e:chinese
npm run test:e2e:english
npm run test:e2e:b1-visual
B1_FONT_SCALE=1.2 npm run test:e2e:b1-visual
```

Expected: PASS. Do not declare completion if DevTools is unavailable; record the exact unavailable step.

The density gates remain `375 × 812` for homepage, profile, and records. The broader visual matrix additionally covers Android `360 × 800` and iPhone `390 × 844`, each at default and `1.2×` font scale.

- [ ] **Step 5: Perform physical Android smoke verification**

Check:

- no square glyphs or blank icon spaces;
- upload thumbnails and deletion controls;
- English playback and dictation state;
- family first-screen density;
- learning profile report hierarchy;
- learning record paper number readability;
- paper preview actions.

- [ ] **Step 6: Refresh anonymized documentation screenshots**

Modify and run:

```bash
node scripts/generate-readme-screenshots.js
```

Regenerate these exact files:

- `docs/user-guide/images/01-family-workbench.png`
- `docs/user-guide/images/02-student-profile.png`
- `docs/user-guide/images/03-subject-workbench.png`
- `docs/user-guide/images/04-report.png`
- `docs/user-guide/images/05-generate-verification.png`
- `docs/user-guide/images/06-paper-preview.png`
- `docs/user-guide/images/07-learning-records.png`
- `docs/user-guide/images/08-parent-management.png`
- `docs/user-guide/images/09-chinese-workbench.png`
- `docs/user-guide/images/10-chinese-review-detail.png`
- `docs/user-guide/images/11-chinese-skill-task.png`
- `docs/user-guide/images/12-english-workbench.png`
- `docs/user-guide/images/13-english-confusion.png`
- `docs/user-guide/images/14-english-wrong-words.png`

Keep the script's mock-data and sensitive-text gate. Extend it to reject real names, 24-character database IDs, UUIDs, invitation codes, `cloud://`, and `wxfile://` text before each screenshot. Update README and user guide captions to describe the B1 color language without implying emoji support.

- [ ] **Step 7: Create the implementation commit**

Stage only code, tests, scripts, package changes, and refreshed screenshots from Task 9. Exclude the verification report. Audit the staged set and commit:

```bash
git commit -m "feat: complete product-wide B1 redesign"
```

Record the resulting SHA.

- [ ] **Step 8: Verify the committed implementation**

Run the full static, unit, size, DevTools, font-scale, and physical Android checks against that SHA. If any code changes are needed, amend with a new implementation commit and rerun all affected checks.

- [ ] **Step 9: Write the verification report**

Record:

- exact implementation commit SHA under test;
- unit test total;
- package size;
- route count;
- viewport matrix;
- screenshot paths;
- Android device result;
- any residual visual risks.

- [ ] **Step 10: Run final verification**

Run:

```bash
npm run verify
npm run check:size
git diff --check
git status --short
```

Expected: all checks pass and only the verification report and documentation captions, if changed after the implementation commit, remain modified.

- [ ] **Step 11: Commit the verification report and final documentation**

Stage only:

- `docs/test-reports/2026-07-16-b1-color-system-verification.md`
- `README.md`
- `docs/user-guide/README.md`

Audit the staged set, then commit:

```bash
git commit -m "docs: record B1 redesign verification"
```

---

## Completion Definition

The implementation is complete only when:

1. All 24 registered pages use the B1 page shell and approved token set.
2. No repository-authored decorative emoji can reach rendered UI.
3. Subject and semantic colors follow the approved meanings.
4. Homepage, learning profile, Chinese verification, English tools, internal-code filtering, paper workflows, permissions, and navigation retain their current behavior.
5. Family homepage, learning profile, and learning records meet first-screen density requirements.
6. Main package remains below `800 KB`.
7. Unit, static, DevTools, and Android smoke verification results are documented.
8. README and the user guide show current anonymized B1 screenshots.

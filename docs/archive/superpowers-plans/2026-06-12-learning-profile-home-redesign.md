# Learning Profile Home Redesign Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the low-density “学习诊断 / 选择学生” entry screen with a single-child “学习档案” home that shows Zhong Qingyu’s integrated learning summary, sample coverage, observations, recent records, next actions, and subject entry points.

**Architecture:** Add a pure home presenter for all summary construction, then wire `pages/index` to load the current student, subject profiles, recent reports, and papers. Keep `subject-home` as the single-subject detail page, keep `upload-history` as the full timeline, and keep `subject-select` as a compatibility route until it can be removed safely.

**Tech Stack:** WeChat Mini Program WXML/WXSS/JavaScript, WeChat Cloud Development database wrappers in `miniprogram/utils/cloud.js`, Node.js built-in test runner.

---

## File Structure

- Create `miniprogram/pages/index/index-presenter.js`
  - Pure presenter that turns student/profile/report/paper data into the “学习档案” view model.
  - No `wx`, no database, no navigation.
- Modify `miniprogram/pages/index/index.js`
  - Load the learning profile home data.
  - Keep student management entry and add navigation handlers for observations, records, actions, and subjects.
- Modify `miniprogram/pages/index/index.wxml`
  - Replace old student-list layout with learning profile home layout.
- Modify `miniprogram/pages/index/index.wxss`
  - Implement the softer “学习档案” visual language.
- Modify `miniprogram/pages/subject-select/subject-select.wxml`
  - Change copy from “选择诊断学科” to a secondary “学科入口” experience.
- Modify `miniprogram/pages/subject-select/subject-select.js`
  - Keep route compatibility and simplify copy/data names only if needed.
- Modify `miniprogram/pages/upload-history/upload-history.js`
  - Ensure it can load all-subject records when `subject` is omitted.
- Modify `miniprogram/pages/upload-history/upload-history.wxml`
  - Ensure title and empty states read as “学习记录” rather than “上传历史”.
- Modify `tests/page-flows.test.js`
  - Add/adjust page-level flow tests for the new homepage.
- Create `tests/index-presenter.test.js`
  - Unit tests for summary, coverage, metrics, observations, records, and empty states.
- Modify `tests/contracts.test.js`
  - Guard against reintroducing the old “选择学生开始诊断” home copy.
- Modify `tests/project-integrity.test.js`
  - Ensure required home illustration assets are present.
- Modify `package.json`
  - Add `tests/index-presenter.test.js` to `npm test` and coverage scripts.
- Modify documentation:
  - `README.md`
  - `PRD.md`
  - `PROJECT_PLAN.md`
  - `docs/ARCHITECTURE.md`
  - `docs/DATA_DICTIONARY.md`
  - `docs/TESTING.md`
  - `docs/TEST_MATRIX.md`

## Data Model for the Home Presenter

Input shape:

```js
{
  student: { _id, name, grade },
  profiles: [
    {
      subject: 'math',
      subjectName: '数学',
      totalReports,
      currentSummary,
      currentBottlenecks,
      pendingBottlenecks,
      improvedBottlenecks,
      updatedAt
    }
  ],
  reports: [
    {
      _id,
      subject,
      type,
      status,
      createdAt,
      changeSummary,
      comparisonSummary,
      summary,
      imageFiles,
      bottlenecks,
      verificationEvidence
    }
  ],
  papers: [
    {
      _id,
      subject,
      type,
      createdAt,
      questions,
      questionCount,
      bottleneckTargets
    }
  ]
}
```

Output shape:

```js
{
  studentName: '钟青羽',
  gradeText: '6年级',
  headline: '数学学习线索已形成，其他学科仍待补充样本',
  summary: '基于近期上传的数学试卷...',
  sampleCoverageText: '样本覆盖：已分析数学试卷；语文、英语暂无有效诊断记录。',
  metrics: [
    { label: '学习观察', value: '2', tone: 'warning' },
    { label: '有效报告', value: '1', tone: 'primary' },
    { label: '最近更新', value: '今天', tone: 'success' }
  ],
  observations: [
    {
      subject: 'math',
      subjectName: '数学',
      title: '数学 · 2 条待验证观察',
      summary: '计算基础、审题理解 · 来源：最近诊断报告',
      statusText: '待验证',
      statusClass: 'pending'
    }
  ],
  recentRecords: [
    {
      kind: 'upload',
      title: '上传数学试卷照片',
      summary: '今天 14:06 · 2 张图片已识别',
      reportId: 'report-1'
    }
  ],
  nextAction: {
    title: '优先完成数学验证试卷',
    summary: '用于确认计算基础和审题理解是否稳定出现。',
    primaryText: '生成验证试卷',
    secondaryText: '上传新试卷',
    subject: 'math'
  },
  subjects: [
    { key: 'math', name: '数学', statusText: '已有观察' },
    { key: 'chinese', name: '语文', statusText: '待采样' },
    { key: 'english', name: '英语', statusText: '待采样' }
  ],
  isEmpty: false
}
```

---

### Task 1: Home Presenter

**Files:**
- Create: `miniprogram/pages/index/index-presenter.js`
- Create: `tests/index-presenter.test.js`
- Modify: `package.json`

- [ ] Write failing tests for a single-student math-only profile.
  - Expected headline: `数学学习线索已形成，其他学科仍待补充样本`
  - Expected coverage: `样本覆盖：已分析数学试卷；语文、英语暂无有效诊断记录。`
  - Expected metrics: learning observations, effective reports, recent update.

- [ ] Run:

```bash
node --test tests/index-presenter.test.js
```

Expected: fail because `index-presenter.js` does not exist.

- [ ] Implement `buildLearningProfileHomeView(input, formatRelativeTime)`.
  - Use `formatBottleneckDisplayName` and `formatBottleneckDisplayList` from `miniprogram/utils/util.js`.
  - Count pending observations from `currentBottlenecks` where `status !== 'improved'`, falling back to `pendingBottlenecks`.
  - Count effective reports from completed reports where `isEffective !== false`.
  - Compute recent update from the latest `profile.updatedAt`, `report.createdAt`, or `paper.createdAt`.

- [ ] Add tests for an all-empty student.
  - Expected headline: `还没有形成有效学习观察`
  - Expected primary action: `上传第一份试卷`
  - Expected subject statuses: all `待采样`.

- [ ] Add tests for verified improvements.
  - When at least one current bottleneck is `improved`, metrics may include `已改善` instead of hiding it.
  - Keep `已改善 0` hidden in empty/early states.

- [ ] Add `tests/index-presenter.test.js` to the `npm test` and `test:coverage` scripts in `package.json`.

- [ ] Run:

```bash
npm test -- --test-name-pattern="learning profile|index presenter"
```

Expected: new presenter tests pass.

### Task 2: Index Page Data Flow

**Files:**
- Modify: `miniprogram/pages/index/index.js`
- Modify: `tests/page-flows.test.js`

- [ ] Write a failing page-flow test: when one student exists, `index` loads and exposes learning profile fields.
  - Mock `cloud.getStudents()`.
  - Mock `cloud.getSubjectProfiles(studentId)`.
  - Mock `cloud.getReports(studentId)`.
  - Mock `cloud.getPapers({ studentId })`.
  - Assert `page.data.home.studentName === '钟青羽'`.
  - Assert `page.data.home.observations[0].title` includes `数学`.

- [ ] Run:

```bash
node --test tests/page-flows.test.js --test-name-pattern="learning profile home"
```

Expected: fail because `index` does not load the home view yet.

- [ ] Refactor `index.js` data shape.

Use:

```js
data: {
  loading: true,
  students: [],
  activeStudentId: '',
  home: null,
  hasStudents: false
}
```

- [ ] Update `loadStudents()` behavior.
  - Load students.
  - If no students, keep empty state.
  - For the single-child MVP, select the first student as active.
  - Load `profiles`, `reports`, and `papers`.
  - Build `home` with the presenter.

- [ ] Add navigation handlers:
  - `onManageStudents()` -> `/pages/add-student/add-student` for first phase.
  - `onObservationTap(e)` -> `/pages/subject-home/subject-home?...`
  - `onSubjectTap(e)` -> `/pages/subject-home/subject-home?...`
  - `onRecordTap(e)` -> report or paper route based on record type.
  - `onViewAllRecords()` -> `/pages/upload-history/upload-history?studentId=...`
  - `onPrimaryAction()` -> generate verification if pending observations exist; otherwise upload.
  - `onSecondaryAction()` -> upload new paper.

- [ ] Run the focused page-flow test.

Expected: pass.

### Task 3: Index Page UI

**Files:**
- Modify: `miniprogram/pages/index/index.wxml`
- Modify: `miniprogram/pages/index/index.wxss`
- Modify: `tests/contracts.test.js`
- Modify: `tests/project-integrity.test.js`

- [ ] Add a failing contract test that `index.wxml` does not contain `选择学生开始诊断`.

- [ ] Add a failing contract test that `index.wxml` contains:
  - `学习档案`
  - `当前综合摘要`
  - `样本覆盖`
  - `学习观察`
  - `学习记录`
  - `下一步建议`

- [ ] Replace the old header/student-card list with the learning profile structure:
  - Hero card with `/assets/images/math-diagnostic-guide.jpg`.
  - Sample coverage band.
  - Metrics strip.
  - Observation list.
  - Recent records list.
  - Next action card.
  - Subject entry cards.

- [ ] Keep the empty state for no students.
  - Use `/assets/images/app-logo-share.jpg`.
  - Copy: `还没有学习档案`.
  - Primary action: `添加第一个孩子`.

- [ ] Update `index.wxss`.
  - Reduce large dark-blue area.
  - Use soft background `#f4f7fa`.
  - Keep cards dense but readable.
  - Avoid nested cards.
  - Ensure fixed bottom add button is removed for non-empty state to reduce visual clutter.

- [ ] Run:

```bash
node --test tests/contracts.test.js tests/project-integrity.test.js
npm test -- --test-name-pattern="student list|learning profile home"
```

Expected: pass.

### Task 4: Learning Records Route Compatibility

**Files:**
- Modify: `miniprogram/pages/upload-history/upload-history.js`
- Modify: `miniprogram/pages/upload-history/upload-history.wxml`
- Modify: `tests/page-flows.test.js`

- [ ] Write a failing page-flow test that `upload-history` loads all-subject records when `subject` is omitted.
  - Mock `getReports(studentId, undefined, 50)`.
  - Mock `getPapers({ studentId })`.
  - Assert the page title is `学习记录`.
  - Assert events include both math diagnosis and verification paper records.

- [ ] Update `upload-history.js`.
  - Treat missing `subject` as all-subject mode.
  - Use `subjectName` only when filtering a single subject.
  - Title rules:
    - all-subject: `钟青羽 · 学习记录`
    - single-subject: `钟青羽 · 数学学习记录`

- [ ] Update record event copy.
  - Upload event: `上传数学试卷照片`
  - Diagnosis event: `数学诊断报告`
  - Verification paper event: `生成数学验证试卷`
  - Verification report event: `数学验证反馈`

- [ ] Run:

```bash
node --test tests/page-flows.test.js --test-name-pattern="upload history|learning records"
```

Expected: pass.

### Task 5: Subject Entry Boundary

**Files:**
- Modify: `miniprogram/pages/subject-select/subject-select.wxml`
- Modify: `miniprogram/pages/subject-select/subject-select.js`
- Modify: `tests/page-flows.test.js`
- Modify: `docs/ARCHITECTURE.md`

- [ ] Update subject-select copy from `为 {{studentName}} 选择诊断学科` to `{{studentName}} 的学科入口`.

- [ ] Keep `onSubjectTap()` behavior unchanged.
  - It still ensures the profile exists.
  - It still navigates to `subject-home`.

- [ ] Add/adjust a page-flow assertion that subject-select is no longer framed as the primary homepage flow.

- [ ] Update `docs/ARCHITECTURE.md`.
  - `index`: learning profile home.
  - `subject-select`: compatibility subject entry.
  - `subject-home`: single-subject detail page.

- [ ] Run:

```bash
node --test tests/page-flows.test.js --test-name-pattern="subject selection"
```

Expected: pass.

### Task 6: Documentation and Verification

**Files:**
- Modify: `README.md`
- Modify: `PRD.md`
- Modify: `PROJECT_PLAN.md`
- Modify: `docs/DATA_DICTIONARY.md`
- Modify: `docs/TESTING.md`
- Modify: `docs/TEST_MATRIX.md`
- Modify: `CHANGELOG.md`

- [ ] Update product docs to describe the new first-screen experience:
  - “学习档案首页”
  - “学习观察”
  - “学习记录”
  - “样本覆盖”

- [ ] Update test counts in docs after adding `tests/index-presenter.test.js`.

- [ ] Run:

```bash
npm test
npm run check
git diff --check
```

Expected:
  - all tests pass
  - JS check passes
  - no whitespace errors

- [ ] Run WeChat Developer Tools preview:

```bash
/Applications/wechatwebdevtools.app/Contents/MacOS/cli preview \
  --project /Users/qiming/Downloads/GoogleDrive/AI\ Learning/miniprogram-learning-diagnostic \
  --qr-output terminal
```

Expected:
  - preview succeeds
  - package stays below WeChat limit
  - homepage renders the learning profile illustration and dense content correctly

## Execution Notes

- Do not remove `subject-select` in this phase. Keep it as a compatibility route.
- Do not introduce AI-generated cross-subject summaries yet. Use deterministic presenter rules.
- Do not implement multi-child switching beyond a simple management/add entry.
- Do not redesign report and verification pages in this phase; only preserve navigation into them.
- The current worktree may already contain unrelated visual asset and copy changes. Do not revert them.

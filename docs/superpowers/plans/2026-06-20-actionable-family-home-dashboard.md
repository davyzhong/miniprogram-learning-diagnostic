# Actionable Family Home Dashboard Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 将多孩子首页升级为“行动优先 + 高信息密度 + 每个区块都可点击”的家庭学习工作台。

**Implementation status (2026-06-20):** 已落地到 `index` 家庭工作台，并扩展到 `index` 单孩子模式与 `student-profile` 个人学习工作台。最终补充设计见 `docs/superpowers/specs/2026-06-20-actionable-family-and-personal-workbenches-design.md`。

**Architecture:** 继续使用 `miniprogram/utils/child-workbench.js` 作为多孩子首页 view model 的唯一聚合层。`index.wxml` 只渲染 `priorityAction`、`secondaryActions`、`subjectRows`、`quickLinks` 这些可点击结构，不再渲染长篇 `latestValue`。路由统一走 `buildTraceableUrl` 和现有 `onTraceableUrlTap`，避免在页面里写重复跳转逻辑。

**Tech Stack:** 微信小程序 WXML/WXSS、Node.js `node:test`、现有 `buildChildWorkbenchCards` presenter、现有 `buildTraceableUrl`、现有 `paper-display`。

## Global Constraints

- 不新增数据库集合。
- 不引入第三方依赖。
- 首页孩子顺序固定为钟青羽在前、钟筱雨在后，其他孩子按 `createdAt` 倒序。
- 首页不展示完整细卡点长列表；每科摘要最多 2 到 3 个关键词。
- 首页每个数字、学科行、快捷入口、行动卡都必须有可点击 URL 或空状态兜底 URL。
- 验证卷在首页只展示编号、页数、题量，不展示完整覆盖细卡点。
- 修改前先写失败测试；每个任务都以测试通过收束。

---

## File Structure

- Modify: `tests/index-presenter.test.js`
  - 增加多孩子排序、可操作 dashboard view model、长验证卷文本收敛的合同测试。
- Modify: `miniprogram/utils/child-workbench.js`
  - 增加家庭孩子排序、`priorityAction`、`secondaryActions`、`quickLinks`、短摘要生成。
- Modify: `miniprogram/pages/index/index.wxml`
  - 替换 `child.latestValue` 和旧 `child.nextAction` 渲染为 B++ 卡片结构。
- Modify: `miniprogram/pages/index/index.wxss`
  - 增加 B++ 首页行动看板样式，并保留旧样式兼容单孩子首页。
- Modify: `tests/page-flows.test.js`
  - 增加首页可点击区块的路由测试，确认主要区块都走真实页面。

---

### Task 1: Lock the New Child Card View Model Contract

**Files:**
- Modify: `tests/index-presenter.test.js`

**Interfaces:**
- Consumes: `buildChildWorkbenchCards(input, formatRelativeTime)`
- Produces: Tests expecting each card to expose:
  - `priorityAction: { title, summary, actionText, url, tone }`
  - `secondaryActions: Array<{ title, summary, url, subject, type }>`
  - `quickLinks: Array<{ key, title, summary, url, disabled }>`
  - sorted card order: 钟青羽, 钟筱雨, then other children

- [ ] **Step 1: Add the failing tests**

Append these tests to `tests/index-presenter.test.js`:

```js
test('family child workbench sorts Qingyu before Xiaoyu and other children', () => {
  const cards = buildChildWorkbenchCards({
    students: [{
      _id: 'student-xiaoyu',
      name: '钟筱雨',
      grade: 2,
      createdAt: '2026-06-20T09:00:00+08:00'
    }, {
      _id: 'student-other',
      name: '小明',
      grade: 4,
      createdAt: '2026-06-20T10:00:00+08:00'
    }, {
      _id: 'student-qingyu',
      name: '钟青羽',
      grade: 6,
      createdAt: '2026-06-19T10:00:00+08:00'
    }]
  }, relative)

  assert.deepEqual(cards.map(card => card.name), ['钟青羽', '钟筱雨', '小明'])
})

test('family child card exposes actionable dashboard sections without long verification text', () => {
  const longSummaries = [
    '小数乘法中小数位数累计规则不稳',
    '除数是小数的除法中被除数小数点移动规则不熟练',
    '小数除法商与补零规则不熟练',
    '异分母分数加减法通分规则不熟练',
    '面积单位换算进率记忆不稳'
  ]
  const cards = buildChildWorkbenchCards({
    students: [{
      _id: 'student-1',
      name: '钟青羽',
      grade: 6,
      createdAt: '2026-06-19T10:00:00+08:00'
    }],
    profilesByStudentId: {
      'student-1': [{
        subject: 'math',
        totalReports: 3,
        updatedAt: '2026-06-20T10:00:00+08:00',
        currentBottlenecks: [
          { lpCode: 'LP-001', lpName: '计算基础', status: 'needs_verification' },
          { lpCode: 'LP-004', lpName: '面积单位换算', status: 'persisting' },
          { lpCode: 'LP-002', lpName: '分数运算', status: 'needs_verification' }
        ]
      }, {
        subject: 'chinese',
        totalReports: 1,
        updatedAt: '2026-06-20T09:00:00+08:00',
        currentBottlenecks: [
          { lpCode: 'LP-104', lpName: '拼音笔顺', status: 'needs_verification' },
          { lpCode: 'LP-101', lpName: '识字词语', status: 'needs_verification' }
        ]
      }, {
        subject: 'english',
        totalReports: 0,
        currentBottlenecks: []
      }]
    },
    reportsByStudentId: {
      'student-1': [{
        _id: 'report-1',
        subject: 'math',
        type: 'diagnosis',
        status: 'completed',
        isEffective: true,
        createdAt: '2026-06-20T08:00:00+08:00',
        summary: '数学完整诊断报告'
      }]
    },
    papersByStudentId: {
      'student-1': [{
        _id: 'paper-1',
        subject: 'math',
        type: 'verification',
        paperDisplayCode: '数学-20260620-01',
        createdAt: '2026-06-20T11:00:00+08:00',
        totalPages: 17,
        questions: Array.from({ length: 59 }, () => ({})),
        bottleneckSummaries: longSummaries
      }]
    }
  }, relative)

  const card = cards[0]
  assert.equal(card.priorityAction.title, '上传数学验证卷作答照片')
  assert.equal(card.priorityAction.actionText, '进入试卷')
  assert.match(card.priorityAction.url, /pages\/paper-preview\/paper-preview/)
  assert.match(card.priorityAction.summary, /数学-20260620-01/)
  assert.match(card.priorityAction.summary, /17页/)
  assert.match(card.priorityAction.summary, /59题/)
  assert.doesNotMatch(card.priorityAction.summary, /小数乘法中小数位数累计规则不稳/)

  assert.deepEqual(card.secondaryActions.map(item => item.subject), ['chinese', 'english'])
  assert.ok(card.secondaryActions.every(item => item.url))

  assert.deepEqual(card.quickLinks.map(item => item.key), [
    'latestReport',
    'currentPaper',
    'knowledgeMap',
    'learningRecords'
  ])
  assert.ok(card.quickLinks.every(item => item.url))
  assert.equal(card.quickLinks.find(item => item.key === 'currentPaper').summary, '数学-20260620-01 · 17页 · 59题')

  assert.equal(card.subjectRows[0].summary, '计算基础、面积单位换算、分数运算')
  assert.equal(card.subjectRows[1].summary, '拼音笔顺、识字词语')
  assert.equal(card.subjectRows[2].summary, '未开始，可从认词练习进入')
  assert.ok(card.subjectRows.every(item => item.url))
})
```

- [ ] **Step 2: Run the focused test and confirm it fails**

Run:

```bash
node --test --test-name-pattern="family child" tests/index-presenter.test.js
```

Expected: FAIL because `priorityAction`, `secondaryActions`, `quickLinks`, and deterministic child sorting do not exist yet.

- [ ] **Step 3: Commit only if this task is being reviewed independently**

Do not commit the failing test alone when executing inline. Keep it staged with Task 2 implementation.

---

### Task 2: Implement Actionable Child Card View Model

**Files:**
- Modify: `miniprogram/utils/child-workbench.js`
- Test: `tests/index-presenter.test.js`

**Interfaces:**
- Produces:
  - `sortFamilyStudents(students: Array<object>): Array<object>`
  - `buildPriorityAction(student, profiles, papers): object`
  - `buildSecondaryActions(student, profiles, papers): Array<object>`
  - `buildQuickLinks(student, reports, papers): Array<object>`
  - `compactBottleneckText(items, maxCount = 3): string`

- [ ] **Step 1: Add helper functions in `child-workbench.js`**

Insert after `newestDate`:

```js
function familyStudentOrder(student = {}) {
  const name = String(student.name || '').trim()
  if (name === '钟青羽') return 0
  if (name === '钟筱雨') return 1
  return 10
}

function sortFamilyStudents(students = []) {
  return [...students].sort((a, b) => {
    const orderDiff = familyStudentOrder(a) - familyStudentOrder(b)
    if (orderDiff !== 0) return orderDiff
    return new Date(b.createdAt || 0) - new Date(a.createdAt || 0)
  })
}

function compactTextFromList(text = '', maxCount = 3) {
  return String(text || '')
    .split('、')
    .map(item => item.trim())
    .filter(Boolean)
    .slice(0, maxCount)
    .join('、')
}

function compactBottleneckText(items = [], maxCount = 3) {
  return compactTextFromList(formatBottleneckDisplayList(items), maxCount)
}
```

- [ ] **Step 2: Replace `buildSubjectRows` summary calculation**

In `buildSubjectRows`, replace the current `summary` expression with:

```js
    const summary = active.length > 0
      ? compactBottleneckText(active)
      : improved.length > 0
        ? `已改善：${compactBottleneckText(improved)}`
        : hidden
          ? '暂未开启持续诊断'
          : key === 'english'
            ? '未开始，可从认词练习进入'
            : (profile.totalReports > 0 ? `${profile.totalReports} 份记录` : '未开始')
```

- [ ] **Step 3: Add paper summary helper**

Insert after `buildLatestValue`:

```js
function currentPaperSummary(paper, subjectName) {
  if (!paper) return ''
  const display = buildPaperDisplay(paper, subjectName)
  return [
    display.paperCode,
    display.totalPages ? `${display.totalPages}页` : '',
    display.questionCount ? `${display.questionCount}题` : ''
  ].filter(Boolean).join(' · ')
}
```

- [ ] **Step 4: Add `buildPriorityAction`**

Insert after `currentPaperSummary`:

```js
function buildPriorityAction(student, profiles, papers) {
  const paper = latestMainPaper(papers)
  if (paper) {
    const subjectName = SUBJECT_NAMES[paper.subject] || paper.subjectName || '数学'
    return {
      type: 'currentPaper',
      title: `上传${subjectName}验证卷作答照片`,
      summary: `${currentPaperSummary(paper, subjectName)}。可以分批做，任意页完成后先拍照上传。`,
      actionText: '进入试卷',
      tone: 'warning',
      url: buildTraceableUrl({ type: 'paper-workbench', id: paper._id })
    }
  }

  const activeSubject = SUBJECTS.find(key => activeBottlenecks(profiles.find(profile => profile.subject === key) || {}).length > 0)
  if (activeSubject) {
    return {
      type: 'subjectVerification',
      title: `处理${SUBJECT_NAMES[activeSubject]}待验证卡点`,
      summary: '进入学科工作台，生成或查看对应验证任务。',
      actionText: '进入学科',
      tone: 'primary',
      url: buildTraceableUrl({
        type: 'subject-home',
        studentId: student._id || '',
        studentName: student.name || '',
        grade: student.grade || '',
        subject: activeSubject,
        subjectName: SUBJECT_NAMES[activeSubject]
      })
    }
  }

  return {
    type: 'firstUpload',
    title: '上传第一份作业',
    summary: '上传作业或试卷后，系统会建立学习档案。',
    actionText: '去上传',
    tone: 'primary',
    url: buildTraceableUrl({
      type: 'upload',
      mode: 'diagnosis',
      studentId: student._id || '',
      studentName: student.name || '',
      grade: student.grade || '',
      subject: 'math',
      subjectName: SUBJECT_NAMES.math
    })
  }
}
```

- [ ] **Step 5: Add `buildSecondaryActions`**

Insert after `buildPriorityAction`:

```js
function buildSecondaryActions(student, profiles, papers) {
  const paper = latestMainPaper(papers)
  const usedSubject = paper && paper.subject ? paper.subject : ''
  const actions = []

  for (const key of SUBJECTS) {
    if (key === usedSubject) continue
    const profile = profiles.find(item => item.subject === key) || {}
    const active = activeBottlenecks(profile)
    if (active.length > 0) {
      actions.push({
        type: 'subjectTask',
        subject: key,
        title: key === 'chinese' ? '下一项：语文复测' : `下一项：${SUBJECT_NAMES[key]}处理`,
        summary: `进入${SUBJECT_NAMES[key]}工作台处理 ${active.length} 项待办。`,
        url: buildTraceableUrl({
          type: 'subject-home',
          studentId: student._id || '',
          studentName: student.name || '',
          grade: student.grade || '',
          subject: key,
          subjectName: SUBJECT_NAMES[key]
        })
      })
    }
  }

  if (!actions.some(item => item.subject === 'english')) {
    actions.push({
      type: 'englishPractice',
      subject: 'english',
      title: '英语入口：认词练习',
      summary: '进入英语个人词库练习。',
      url: buildTraceableUrl({
        type: 'subject-home',
        studentId: student._id || '',
        studentName: student.name || '',
        grade: student.grade || '',
        subject: 'english',
        subjectName: SUBJECT_NAMES.english
      })
    })
  }

  return actions.slice(0, 2)
}
```

- [ ] **Step 6: Add `buildQuickLinks`**

Insert after `buildSecondaryActions`:

```js
function buildQuickLinks(student, reports, papers) {
  const report = latestCompletedReport(reports)
  const paper = latestMainPaper(papers)
  const paperSubjectName = paper ? (SUBJECT_NAMES[paper.subject] || paper.subjectName || '数学') : '数学'

  return [{
    key: 'latestReport',
    title: '最新诊断',
    summary: report ? `${SUBJECT_NAMES[report.subject] || report.subjectName || '学习'}报告` : '暂无诊断',
    disabled: false,
    url: report
      ? buildTraceableUrl({ type: 'report-detail', id: report._id })
      : buildTraceableUrl({
          type: 'upload',
          mode: 'diagnosis',
          studentId: student._id || '',
          studentName: student.name || '',
          grade: student.grade || '',
          subject: 'math',
          subjectName: SUBJECT_NAMES.math
        })
  }, {
    key: 'currentPaper',
    title: '当前试卷',
    summary: paper ? currentPaperSummary(paper, paperSubjectName) : '暂无试卷',
    disabled: false,
    url: paper
      ? buildTraceableUrl({ type: 'paper-workbench', id: paper._id })
      : buildTraceableUrl({
          type: 'subject-home',
          studentId: student._id || '',
          studentName: student.name || '',
          grade: student.grade || '',
          subject: 'math',
          subjectName: SUBJECT_NAMES.math
        })
  }, {
    key: 'knowledgeMap',
    title: '知识地图',
    summary: '卡点+资源',
    disabled: false,
    url: `/pages/knowledge-map/knowledge-map?studentId=${encodeURIComponent(student._id || '')}&studentName=${encodeURIComponent(student.name || '')}&subject=math`
  }, {
    key: 'learningRecords',
    title: '学习记录',
    summary: '完整时间线',
    disabled: false,
    url: buildTraceableUrl({
      type: 'upload-history',
      studentId: student._id || '',
      studentName: student.name || ''
    })
  }]
}
```

- [ ] **Step 7: Wire helpers into `buildChildWorkbenchCards`**

Change:

```js
  return students.map(student => {
```

to:

```js
  return sortFamilyStudents(students).map(student => {
```

Inside the returned object, replace:

```js
      latestValue,
      nextAction
```

with:

```js
      latestValue,
      nextAction,
      priorityAction: buildPriorityAction(student, profiles, papers),
      secondaryActions: buildSecondaryActions(student, profiles, papers),
      quickLinks: buildQuickLinks(student, reports, papers)
```

- [ ] **Step 8: Export helper for focused tests if needed**

At the bottom, change module exports to:

```js
module.exports = {
  buildChildWorkbenchCards,
  profileBottlenecks,
  sortFamilyStudents
}
```

- [ ] **Step 9: Run focused tests**

Run:

```bash
node --test --test-name-pattern="family child" tests/index-presenter.test.js
```

Expected: PASS.

- [ ] **Step 10: Commit**

Run:

```bash
git add tests/index-presenter.test.js miniprogram/utils/child-workbench.js
git commit -m "feat: build actionable family home cards"
```

---

### Task 3: Render the B++ Dashboard in the Home Page

**Files:**
- Modify: `miniprogram/pages/index/index.wxml`
- Test: `tests/page-flows.test.js`

**Interfaces:**
- Consumes `child.priorityAction`, `child.secondaryActions`, `child.subjectRows`, `child.quickLinks`.
- Uses existing `onTraceableUrlTap(e)` handler with `data-url`.

- [ ] **Step 1: Add WXML structure test**

Append to `tests/page-flows.test.js`:

```js
test('index family workbench renders actionable child dashboard sections', () => {
  const fs = require('node:fs')
  const path = require('node:path')
  const wxml = fs.readFileSync(path.resolve(__dirname, '../miniprogram/pages/index/index.wxml'), 'utf8')

  assert.match(wxml, /child\.priorityAction/)
  assert.match(wxml, /child\.secondaryActions/)
  assert.match(wxml, /child\.quickLinks/)
  assert.match(wxml, /data-url="\{\{child\.priorityAction\.url\}\}"/)
  assert.match(wxml, /data-url="\{\{item\.url\}\}"/)
  assert.doesNotMatch(wxml, /child-latest-row/)
})
```

- [ ] **Step 2: Run the test and confirm it fails**

Run:

```bash
node --test --test-name-pattern="index family workbench renders actionable" tests/page-flows.test.js
```

Expected: FAIL because `index.wxml` still renders `child.latestValue` and old `child.nextAction`.

- [ ] **Step 3: Replace old latest/next WXML block**

In `miniprogram/pages/index/index.wxml`, replace the block from:

```xml
        <view
          class="child-latest-row"
          wx:if="{{child.latestValue}}"
          catchtap="onTraceableUrlTap"
          data-url="{{child.latestValue.url}}"
        >
          ...
        </view>

        <view
          class="child-next-row"
          catchtap="onTraceableUrlTap"
          data-url="{{child.nextAction.url}}"
        >
          ...
        </view>
```

with:

```xml
        <view
          class="child-priority-action priority-{{child.priorityAction.tone}}"
          catchtap="onTraceableUrlTap"
          data-url="{{child.priorityAction.url}}"
        >
          <view class="priority-action-main">
            <view>
              <text class="priority-kicker">今日优先行动</text>
              <text class="priority-title">{{child.priorityAction.title}}</text>
              <text class="priority-summary">{{child.priorityAction.summary}}</text>
            </view>
            <text class="priority-button">{{child.priorityAction.actionText}} ›</text>
          </view>
          <view class="secondary-action-grid" wx:if="{{child.secondaryActions.length > 0}}">
            <view
              class="secondary-action-card"
              wx:for="{{child.secondaryActions}}"
              wx:key="type"
              catchtap="onTraceableUrlTap"
              data-url="{{item.url}}"
            >
              <text class="secondary-action-title">{{item.title}} ›</text>
              <text class="secondary-action-summary">{{item.summary}}</text>
            </view>
          </view>
        </view>

        <view class="child-section-label">快捷入口</view>
        <view class="child-quick-grid">
          <view
            class="child-quick-card"
            wx:for="{{child.quickLinks}}"
            wx:key="key"
            catchtap="onTraceableUrlTap"
            data-url="{{item.url}}"
          >
            <text class="quick-title">{{item.title}}</text>
            <text class="quick-summary">{{item.summary}}</text>
          </view>
        </view>
```

- [ ] **Step 4: Add a section label before subject rows**

Immediately before:

```xml
        <view class="child-subject-list">
```

insert:

```xml
        <view class="child-section-label">三科学习状态</view>
```

- [ ] **Step 5: Run WXML structure test**

Run:

```bash
node --test --test-name-pattern="index family workbench renders actionable" tests/page-flows.test.js
```

Expected: PASS.

- [ ] **Step 6: Commit**

Run:

```bash
git add miniprogram/pages/index/index.wxml tests/page-flows.test.js
git commit -m "feat: render actionable family home dashboard"
```

---

### Task 4: Add B++ Homepage Styles

**Files:**
- Modify: `miniprogram/pages/index/index.wxss`
- Test: `tests/page-flows.test.js`

**Interfaces:**
- Consumes classes added in Task 3:
  - `.child-priority-action`
  - `.priority-action-main`
  - `.priority-kicker`
  - `.priority-title`
  - `.priority-summary`
  - `.priority-button`
  - `.secondary-action-grid`
  - `.secondary-action-card`
  - `.child-section-label`
  - `.child-quick-grid`
  - `.child-quick-card`

- [ ] **Step 1: Add CSS class presence test**

Append to `tests/page-flows.test.js`:

```js
test('index family workbench has styles for actionable dashboard sections', () => {
  const fs = require('node:fs')
  const path = require('node:path')
  const wxss = fs.readFileSync(path.resolve(__dirname, '../miniprogram/pages/index/index.wxss'), 'utf8')

  ;[
    '.child-priority-action',
    '.priority-action-main',
    '.priority-kicker',
    '.priority-title',
    '.priority-summary',
    '.priority-button',
    '.secondary-action-grid',
    '.secondary-action-card',
    '.child-section-label',
    '.child-quick-grid',
    '.child-quick-card'
  ].forEach(selector => assert.match(wxss, new RegExp(selector.replace('.', '\\\\.'))))
})
```

- [ ] **Step 2: Run the style test and confirm it fails**

Run:

```bash
node --test --test-name-pattern="index family workbench has styles" tests/page-flows.test.js
```

Expected: FAIL because the new classes do not exist yet.

- [ ] **Step 3: Append B++ styles**

Append to `miniprogram/pages/index/index.wxss` near the existing child card styles:

```css
.child-section-label {
  color: #173f6b;
  font-size: 22rpx;
  font-weight: 850;
  margin: 20rpx 0 10rpx;
}

.child-priority-action {
  margin-top: 18rpx;
  padding: 18rpx;
  border-radius: 18rpx;
  background: #fff7ed;
  border: 1rpx solid #fed7aa;
}

.child-priority-action.priority-primary {
  background: #eff6ff;
  border-color: #bfdbfe;
}

.priority-action-main {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 18rpx;
}

.priority-kicker {
  display: block;
  color: #c2410c;
  font-size: 19rpx;
  font-weight: 900;
  line-height: 1.2;
}

.priority-title {
  display: block;
  color: #1f2937;
  font-size: 25rpx;
  font-weight: 900;
  margin-top: 5rpx;
  line-height: 1.35;
}

.priority-summary {
  display: block;
  color: #64748b;
  font-size: 21rpx;
  line-height: 1.45;
  margin-top: 6rpx;
}

.priority-button {
  flex-shrink: 0;
  padding: 12rpx 18rpx;
  border-radius: 999rpx;
  background: #2563eb;
  color: #fff;
  font-size: 21rpx;
  font-weight: 900;
}

.secondary-action-grid {
  display: grid;
  grid-template-columns: repeat(2, 1fr);
  gap: 10rpx;
  margin-top: 14rpx;
}

.secondary-action-card {
  padding: 12rpx;
  border-radius: 14rpx;
  background: rgba(255, 255, 255, .78);
  border: 1rpx solid #fde7c7;
}

.secondary-action-title {
  display: block;
  color: #1f2937;
  font-size: 21rpx;
  font-weight: 850;
  line-height: 1.3;
}

.secondary-action-summary {
  display: block;
  color: #64748b;
  font-size: 19rpx;
  line-height: 1.35;
  margin-top: 4rpx;
}

.child-quick-grid {
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  gap: 10rpx;
  margin-top: 10rpx;
}

.child-quick-card {
  min-height: 88rpx;
  padding: 12rpx 10rpx;
  border-radius: 16rpx;
  background: #f8fafc;
  border: 1rpx solid #e2e8f0;
  box-sizing: border-box;
}

.quick-title {
  display: block;
  color: #1f2937;
  font-size: 20rpx;
  font-weight: 850;
  line-height: 1.3;
}

.quick-summary {
  display: block;
  color: #64748b;
  font-size: 18rpx;
  line-height: 1.3;
  margin-top: 5rpx;
}
```

- [ ] **Step 4: Run the style test**

Run:

```bash
node --test --test-name-pattern="index family workbench has styles" tests/page-flows.test.js
```

Expected: PASS.

- [ ] **Step 5: Commit**

Run:

```bash
git add miniprogram/pages/index/index.wxss tests/page-flows.test.js
git commit -m "style: add actionable family home dashboard"
```

---

### Task 5: Verify Click Targets and Regression Suite

**Files:**
- Modify: `tests/index-presenter.test.js`
- Modify: `tests/page-flows.test.js`

**Interfaces:**
- Consumes final view model and WXML.
- Produces confidence that visible blocks have real URLs.

- [ ] **Step 1: Add all-visible-blocks-have-url assertion**

In the `family child card exposes actionable dashboard sections without long verification text` test from Task 1, add:

```js
  const visibleUrls = [
    ...card.statusItems.map(item => item.url),
    card.priorityAction.url,
    ...card.secondaryActions.map(item => item.url),
    ...card.subjectRows.map(item => item.url),
    ...card.quickLinks.map(item => item.url)
  ]
  assert.ok(visibleUrls.length >= 14)
  assert.ok(visibleUrls.every(Boolean))
```

- [ ] **Step 2: Run focused presenter tests**

Run:

```bash
node --test tests/index-presenter.test.js
```

Expected: PASS.

- [ ] **Step 3: Run focused page-flow tests**

Run:

```bash
node --test --test-name-pattern="index family workbench" tests/page-flows.test.js
```

Expected: PASS.

- [ ] **Step 4: Run full unit suite**

Run:

```bash
npm test
```

Expected: all tests pass.

- [ ] **Step 5: Run JS check**

Run:

```bash
npm run check
```

Expected: JS check passes.

- [ ] **Step 6: Commit verification adjustments**

Run:

```bash
git add tests/index-presenter.test.js tests/page-flows.test.js
git commit -m "test: verify actionable family home dashboard"
```

If no files changed after Step 1 because the assertion was already committed in Task 2, skip this commit and record that no verification-only diff exists.

---

## Final Verification

Run:

```bash
npm test
npm run check
git status --short
```

Expected:

- `npm test` passes.
- `npm run check` passes.
- `git status --short` is clean after the final commit.

## Rollback Plan

If the new homepage layout causes rendering issues in DevTools:

1. Keep the presenter tests and helpers.
2. Revert only `miniprogram/pages/index/index.wxml` and `miniprogram/pages/index/index.wxss` to the previous rendering.
3. Continue using `priorityAction`, `secondaryActions`, and `quickLinks` in data until the WXML issue is fixed.

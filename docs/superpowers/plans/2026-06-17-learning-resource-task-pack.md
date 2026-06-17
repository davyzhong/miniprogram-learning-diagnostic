# Learning Resource Task Pack Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Turn math bottleneck resource links into in-app learning task packs that a child can open, study, practice, complete, and route into later verification.

**Architecture:** Add a pure task-pack generation layer first, then expose it through a new CloudBase function and a new mini-program page. The first version generates structured text, worked examples, common-mistake contrast, and 3-5 short practice items from existing math bottleneck metadata and resource seeds; external links stay as parent reference only.

**Tech Stack:** WeChat Mini Program JavaScript, CloudBase cloud functions, existing `reports` / `subjectProfiles` / `papers` / `learningResourcePacks` collection, Node.js test runner, current math taxonomy seeds under `data/math`.

## Global Constraints

- First implementation only covers `subject === 'math'`.
- Do not replace the existing report, bottleneck center, bottleneck detail, or verification paper flows.
- Do not send children directly into external platform feeds.
- External resources remain parent reference materials, not the primary child-facing learning surface.
- Generated packs must be short enough for 5-10 minutes of use.
- Every task must run `npm run verify` before commit unless the task explicitly says a narrower red/green unit-test cycle is enough.

---

## Spec Reference

- Product design: `docs/subject-design/钟青羽学习卡点学习材料任务包竞品调研与设计文档.md`
- Math learning map design: `docs/subject-design/钟青羽数学学习地图与资源库升级详细设计.md`
- Math hierarchy design: `docs/subject-design/钟青羽数学学习卡点层级与验证资源调度升级设计文档.md`
- Current resource helper: `miniprogram/utils/math-learning-map.js`
- Current bottleneck detail page: `miniprogram/pages/bottleneck-detail/bottleneck-detail.js`

---

## File Structure

### New Files

- `cloudfunctions/learningResource/index.js`
  - Cloud function entry for generating, reading, completing, and scheduling math learning resource task packs.

- `cloudfunctions/learningResource/package.json`
  - Cloud function dependencies and metadata.

- `cloudfunctions/learningResource/resource-pack-generator.js`
  - Pure generator that converts a bottleneck, knowledge node, and external resources into structured child-facing blocks.

- `miniprogram/pages/learning-resource/learning-resource.js`
  - Page controller for loading, rendering, completing, and routing a task pack.

- `miniprogram/pages/learning-resource/learning-resource.wxml`
  - Child-facing task-pack layout.

- `miniprogram/pages/learning-resource/learning-resource.wxss`
  - Styles for task-pack blocks, practice items, and bottom actions.

- `miniprogram/pages/learning-resource/learning-resource.json`
  - Page config.

- `miniprogram/pages/learning-resource/learning-resource-presenter.js`
  - Pure presenter for compact, testable view models.

- `tests/learning-resource-generator.test.js`
  - Unit tests for pack generation.

- `tests/learning-resource-presenter.test.js`
  - Unit tests for page view model.

- `tests/learning-resource-cloud.test.js`
  - Cloud function tests using existing mock database patterns.

### Modified Files

- `miniprogram/app.json`
  - Register `pages/learning-resource/learning-resource`.

- `miniprogram/utils/cloud.js`
  - Add `generateLearningResourcePack`, `getLearningResourcePack`, `completeLearningResourcePack`, `scheduleResourcePackVerification`.

- `miniprogram/pages/bottleneck-detail/bottleneck-detail.js`
  - Add route handler for “学一下”.

- `miniprogram/pages/bottleneck-detail/bottleneck-detail.wxml`
  - Add learning task-pack panel above the evidence chain.

- `miniprogram/pages/bottleneck-detail/bottleneck-detail.wxss`
  - Style learning task-pack entry.

- `miniprogram/pages/bottleneck-center/bottleneck-center.js`
  - Add card action route to task-pack page.

- `miniprogram/pages/bottleneck-center/bottleneck-center.wxml`
  - Replace ambiguous single “验证” priority with visible `学一下` + `验证`.

- `cloudfunctions/studentData/index.js`
  - Include lightweight learning-resource events in the unified learning timeline.

- `docs/DATA_DICTIONARY.md`
  - Document `learningResourcePacks` fields.

- `docs/CLOUD_FUNCTIONS.md`
  - Document `learningResource` actions.

- `docs/TEST_MATRIX.md`
  - Add resource-pack tests and manual verification rows.

---

## Task 1: Add Pure Math Resource Pack Generator

**Files:**
- Create: `cloudfunctions/learningResource/resource-pack-generator.js`
- Create: `tests/learning-resource-generator.test.js`

**Interfaces:**
- Produces:
  - `buildResourcePackDraft(input): ResourcePackDraft`
  - `buildPracticeItems(input): PracticeItem[]`
  - `normalizeResourcePackTarget(input): ResourceTarget`
- Consumes:
  - Existing math bottleneck objects with fields `bottleneckId`, `lpCode`, `title`, `nodeId`, `categoryPath`, `symptomPatterns`, `repairStrategy`.

- [x] **Step 1: Write failing generator tests**

Add `tests/learning-resource-generator.test.js`:

```js
const test = require('node:test')
const assert = require('node:assert/strict')

const {
  buildResourcePackDraft,
  buildPracticeItems,
  normalizeResourcePackTarget
} = require('../cloudfunctions/learningResource/resource-pack-generator')

test('buildResourcePackDraft creates child-facing blocks from a fine math bottleneck', () => {
  const pack = buildResourcePackDraft({
    studentId: 'student-1',
    subject: 'math',
    sourceReportId: 'report-1',
    target: {
      bottleneckId: 'BN-DEC-MUL-POINT-COUNT',
      lpCode: 'LP-001',
      title: '小数乘法中积的小数位数判断错误',
      nodeId: 'MATH-NUM-DEC-MUL-POINT',
      categoryPath: ['计算基础', '小数乘法', '小数点定位'],
      symptomPatterns: ['数字乘积正确，但小数点位置错误'],
      repairStrategy: ['先统计两个因数的小数位数', '再用估算检查结果数量级']
    },
    resources: [
      {
        resourceId: 'RES-KHAN-DEC-MUL-001',
        displayTitle: '小数乘法示例',
        platform: 'Khan Academy',
        url: 'https://example.com/khan',
        role: '家长参考'
      }
    ]
  })

  assert.equal(pack.subject, 'math')
  assert.equal(pack.status, 'ready')
  assert.equal(pack.title, '小数乘法中积的小数位数判断错误')
  assert.equal(pack.blocks[0].type, 'summary')
  assert.ok(pack.blocks.some(block => block.type === 'concept'))
  assert.ok(pack.blocks.some(block => block.type === 'worked_example'))
  assert.ok(pack.blocks.some(block => block.type === 'common_mistake'))
  assert.ok(pack.blocks.some(block => block.type === 'practice'))
  assert.equal(pack.externalResources.length, 1)
  assert.equal(pack.practiceItems.length, 3)
})

test('buildPracticeItems keeps first version short and card-point-specific', () => {
  const items = buildPracticeItems({
    target: {
      bottleneckId: 'BN-DEC-MUL-POINT-COUNT',
      title: '小数乘法中积的小数位数判断错误'
    }
  })

  assert.equal(items.length, 3)
  assert.ok(items.every(item => item.question && item.answer))
  assert.ok(items.every(item => item.targetId === 'BN-DEC-MUL-POINT-COUNT'))
})

test('normalizeResourcePackTarget preserves legacy LP code fallback', () => {
  const target = normalizeResourcePackTarget({
    lpCode: 'LP-008',
    lpName: '审题理解'
  })

  assert.equal(target.targetId, 'LP-008')
  assert.equal(target.lpCode, 'LP-008')
  assert.equal(target.title, '审题理解')
})
```

- [x] **Step 2: Run RED test**

Run:

```bash
node --test tests/learning-resource-generator.test.js
```

Expected: fail with `Cannot find module '../cloudfunctions/learningResource/resource-pack-generator'`.

- [x] **Step 3: Implement minimal generator**

Create `cloudfunctions/learningResource/resource-pack-generator.js`:

```js
function compactText(value = '', fallback = '') {
  return String(value || fallback || '').replace(/\s+/g, ' ').trim()
}

function normalizeResourcePackTarget(input = {}) {
  const targetId = input.bottleneckId || input.targetId || input.lpCode || input.id || ''
  const lpCode = input.lpCode || (/^LP-\d+/.test(targetId) ? targetId : '')
  const title = compactText(input.title || input.lpName || input.displayName, targetId || '学习卡点')
  return {
    targetId,
    bottleneckId: input.bottleneckId || '',
    lpCode,
    title,
    nodeId: input.nodeId || '',
    categoryPath: Array.isArray(input.categoryPath) ? input.categoryPath : [],
    symptomPatterns: Array.isArray(input.symptomPatterns) ? input.symptomPatterns : [],
    repairStrategy: Array.isArray(input.repairStrategy) ? input.repairStrategy : []
  }
}

function buildDecimalPointPractice(target) {
  return [
    {
      questionId: `${target.targetId || 'math'}-P01`,
      targetId: target.targetId,
      question: '计算：2.4 × 1.5 =',
      answer: '3.6',
      explanation: '24 × 15 = 360，两个因数一共 2 位小数，所以结果是 3.60。'
    },
    {
      questionId: `${target.targetId || 'math'}-P02`,
      targetId: target.targetId,
      question: '计算：0.24 × 1.5 =',
      answer: '0.36',
      explanation: '24 × 15 = 360，两个因数一共 3 位小数，所以结果是 0.360。'
    },
    {
      questionId: `${target.targetId || 'math'}-P03`,
      targetId: target.targetId,
      question: '判断：24 × 0.15 的结果应该接近 36、3.6 还是 0.36？',
      answer: '3.6',
      explanation: '24 × 0.15 可以想成 24 × 0.1 多一点，结果应在 2.4 以上、接近 3.6。'
    }
  ]
}

function buildGenericPractice(target) {
  return [
    {
      questionId: `${target.targetId || 'math'}-P01`,
      targetId: target.targetId,
      question: `用自己的话说一说：${target.title} 最容易错在哪里？`,
      answer: '能说出关键错误点即可。',
      explanation: '先确认孩子能复述卡点，再进入题目练习。'
    },
    {
      questionId: `${target.targetId || 'math'}-P02`,
      targetId: target.targetId,
      question: '做一道同类题，并写下每一步理由。',
      answer: '步骤完整、理由清楚。',
      explanation: '重点观察过程，不只看答案。'
    },
    {
      questionId: `${target.targetId || 'math'}-P03`,
      targetId: target.targetId,
      question: '检查自己的答案是否合理，并写一句检查理由。',
      answer: '能用估算、单位或关系式检查。',
      explanation: '把检查变成固定动作。'
    }
  ]
}

function buildPracticeItems({ target: rawTarget = {} } = {}) {
  const target = normalizeResourcePackTarget(rawTarget)
  if (/DEC-MUL-POINT|小数.*小数点|小数位数/.test(`${target.targetId} ${target.title}`)) {
    return buildDecimalPointPractice(target)
  }
  return buildGenericPractice(target)
}

function buildResourcePackDraft({ studentId, subject = 'math', sourceReportId = '', target: rawTarget = {}, resources = [] } = {}) {
  const target = normalizeResourcePackTarget(rawTarget)
  const practiceItems = buildPracticeItems({ target })
  const firstSymptom = target.symptomPatterns[0] || `这个卡点会影响 ${target.title} 相关题目的稳定性。`
  const repairText = target.repairStrategy.length > 0
    ? target.repairStrategy.join('；')
    : '先复述规则，再看例题，最后做 3 道小练习。'

  return {
    studentId,
    subject,
    sourceType: 'bottleneck',
    sourceReportId,
    lpCode: target.lpCode,
    bottleneckId: target.bottleneckId,
    targetId: target.targetId,
    title: target.title,
    status: 'ready',
    estimatedMinutes: 8,
    version: 1,
    blocks: [
      { type: 'summary', title: '今天补什么', body: target.title },
      { type: 'concept', title: '为什么会错', body: firstSymptom },
      { type: 'worked_example', title: '例题拆解', question: practiceItems[0].question, steps: [practiceItems[0].explanation] },
      { type: 'common_mistake', title: '常见错误对比', mistake: '只看答案，不检查过程。', correction: repairText, explanation: '这一步用来把错误路径和正确路径分开。' },
      { type: 'practice', title: '马上练 3 题', questions: practiceItems }
    ],
    practiceItems,
    externalResources: (resources || []).map(resource => ({
      resourceId: resource.resourceId || '',
      title: resource.displayTitle || resource.title || '',
      platform: resource.platform || '',
      url: resource.url || '',
      role: resource.role || '家长参考'
    })).filter(resource => resource.title || resource.url)
  }
}

module.exports = {
  buildResourcePackDraft,
  buildPracticeItems,
  normalizeResourcePackTarget
}
```

- [x] **Step 4: Run GREEN test**

Run:

```bash
node --test tests/learning-resource-generator.test.js
```

Expected: all tests pass.

- [x] **Step 5: Commit**

Run:

```bash
git add cloudfunctions/learningResource/resource-pack-generator.js tests/learning-resource-generator.test.js
git commit -m "feat: add learning resource pack generator"
```

---

## Task 2: Add Learning Resource Cloud Function

**Files:**
- Create: `cloudfunctions/learningResource/index.js`
- Create: `cloudfunctions/learningResource/package.json`
- Create: `tests/learning-resource-cloud.test.js`
- Modify: `docs/CLOUD_FUNCTIONS.md`
- Modify: `docs/DATA_DICTIONARY.md`

**Interfaces:**
- Consumes:
  - `buildResourcePackDraft(input)` from Task 1.
  - Shared access helper `cloudfunctions/_shared/access.js`.
- Produces actions:
  - `generatePack({ studentId, subject, target, sourceReportId })`
  - `getPack({ packId })`
  - `completePack({ packId, practiceResult })`
  - `scheduleVerification({ packId })`

- [x] **Step 1: Write failing cloud tests**

Add `tests/learning-resource-cloud.test.js`:

```js
const test = require('node:test')
const assert = require('node:assert/strict')

test('learningResource generatePack stores a ready math pack', async () => {
  const { main } = require('../cloudfunctions/learningResource/index')
  const inserted = []
  const db = {
    collection(name) {
      assert.equal(name, 'learningResourcePacks')
      return {
        add: async ({ data }) => {
          inserted.push(data)
          return { _id: 'pack-1' }
        },
        doc() {
          return { get: async () => ({ data: null }) }
        }
      }
    }
  }

  const result = await main({
    action: 'generatePack',
    studentId: 'student-1',
    subject: 'math',
    target: { bottleneckId: 'BN-DEC-MUL-POINT-COUNT', title: '小数乘法中积的小数位数判断错误' }
  }, {
    OPENID: 'owner-1',
    db,
    access: { canOperateLearning: async () => true }
  })

  assert.equal(result.success, true)
  assert.equal(result.packId, 'pack-1')
  assert.equal(inserted[0].status, 'ready')
  assert.equal(inserted[0].subject, 'math')
})
```

- [x] **Step 2: Run RED test**

Run:

```bash
node --test tests/learning-resource-cloud.test.js
```

Expected: fail because `cloudfunctions/learningResource/index.js` does not exist.

- [x] **Step 3: Implement cloud function**

Create `cloudfunctions/learningResource/package.json`:

```json
{
  "name": "learningResource",
  "version": "1.0.0",
  "main": "index.js",
  "dependencies": {
    "wx-server-sdk": "latest"
  }
}
```

Create `cloudfunctions/learningResource/index.js`:

```js
const cloud = require('wx-server-sdk')
const { buildResourcePackDraft } = require('./resource-pack-generator')
const sharedAccess = require('../_shared/access')

cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV })

function nowIso() {
  return new Date().toISOString()
}

function normalizeContext(context = {}) {
  return {
    db: context.db || cloud.database(),
    openid: context.OPENID || '',
    access: context.access || sharedAccess
  }
}

async function assertOperate({ access, db, openid, studentId }) {
  const ok = await access.canOperateLearning(db, studentId, openid)
  if (!ok) {
    const error = new Error('无权操作该学生的学习材料')
    error.code = 'NO_ACCESS'
    throw error
  }
}

async function generatePack(event, context) {
  const { db, openid, access } = normalizeContext(context)
  const studentId = event.studentId || ''
  await assertOperate({ access, db, openid, studentId })
  const draft = buildResourcePackDraft({
    studentId,
    subject: event.subject || 'math',
    sourceReportId: event.sourceReportId || '',
    target: event.target || {},
    resources: event.resources || []
  })
  const data = {
    ...draft,
    _openid: openid,
    createdAt: nowIso(),
    updatedAt: nowIso()
  }
  const result = await db.collection('learningResourcePacks').add({ data })
  return { success: true, packId: result._id, pack: { _id: result._id, ...data } }
}

async function getPack(event, context) {
  const { db } = normalizeContext(context)
  const packId = event.packId || ''
  const result = await db.collection('learningResourcePacks').doc(packId).get()
  return { success: true, pack: result.data || null }
}

async function completePack(event, context) {
  const { db } = normalizeContext(context)
  const packId = event.packId || ''
  const completedAt = nowIso()
  await db.collection('learningResourcePacks').doc(packId).update({
    data: {
      status: 'completed',
      progress: {
        completedAt,
        practiceResult: event.practiceResult || {}
      },
      updatedAt: completedAt
    }
  })
  return { success: true, completedAt }
}

async function scheduleVerification(event, context) {
  const { db } = normalizeContext(context)
  const packId = event.packId || ''
  const scheduledAt = nowIso()
  await db.collection('learningResourcePacks').doc(packId).update({
    data: {
      verificationScheduled: true,
      verificationScheduledAt: scheduledAt,
      updatedAt: scheduledAt
    }
  })
  return { success: true, scheduledAt }
}

async function main(event = {}, context = {}) {
  try {
    if (event.action === 'generatePack') return await generatePack(event, context)
    if (event.action === 'getPack') return await getPack(event, context)
    if (event.action === 'completePack') return await completePack(event, context)
    if (event.action === 'scheduleVerification') return await scheduleVerification(event, context)
    return { success: false, error: '不支持的学习材料操作' }
  } catch (error) {
    return { success: false, error: error.message || '学习材料操作失败', code: error.code || 'LEARNING_RESOURCE_ERROR' }
  }
}

exports.main = main
module.exports = { main }
```

- [x] **Step 4: Run cloud test**

Run:

```bash
node --test tests/learning-resource-cloud.test.js
```

Expected: pass.

- [x] **Step 5: Update docs**

Add to `docs/CLOUD_FUNCTIONS.md`:

```md
## learningResource

Actions:

- `generatePack`: creates a math learning task pack for one bottleneck.
- `getPack`: reads an existing task pack.
- `completePack`: marks a task pack completed and stores lightweight practice result.
- `scheduleVerification`: marks the pack target as queued for later verification.
```

Add to `docs/DATA_DICTIONARY.md`:

```md
## learningResourcePacks

Stores child-facing learning task packs generated from math bottlenecks. External resource links are parent reference only; the child-facing material is stored in `blocks`.
```

- [x] **Step 6: Commit**

Run:

```bash
git add cloudfunctions/learningResource tests/learning-resource-cloud.test.js docs/CLOUD_FUNCTIONS.md docs/DATA_DICTIONARY.md
git commit -m "feat: add learning resource cloud function"
```

---

## Task 3: Add Mini-Program Cloud Client Methods

**Files:**
- Modify: `miniprogram/utils/cloud.js`
- Modify: `tests/contracts.test.js`
- Modify: `tests/deployment-readiness.test.js`

**Interfaces:**
- Produces:
  - `cloud.generateLearningResourcePack(payload)`
  - `cloud.getLearningResourcePack(packId)`
  - `cloud.completeLearningResourcePack(payload)`
  - `cloud.scheduleResourcePackVerification(packId)`

- [x] **Step 1: Add failing contract test**

Add to `tests/contracts.test.js`:

```js
test('cloud client exposes learning resource methods', () => {
  const cloud = require('../miniprogram/utils/cloud')
  assert.equal(typeof cloud.generateLearningResourcePack, 'function')
  assert.equal(typeof cloud.getLearningResourcePack, 'function')
  assert.equal(typeof cloud.completeLearningResourcePack, 'function')
  assert.equal(typeof cloud.scheduleResourcePackVerification, 'function')
})
```

- [x] **Step 2: Run RED test**

Run:

```bash
node --test tests/contracts.test.js
```

Expected: fail because the methods do not exist.

- [x] **Step 3: Implement client methods**

In `miniprogram/utils/cloud.js`, add wrappers using the existing `callFunction` helper style:

```js
function generateLearningResourcePack(payload = {}) {
  return callFunction('learningResource', {
    action: 'generatePack',
    ...payload
  })
}

function getLearningResourcePack(packId) {
  return callFunction('learningResource', {
    action: 'getPack',
    packId
  })
}

function completeLearningResourcePack(payload = {}) {
  return callFunction('learningResource', {
    action: 'completePack',
    ...payload
  })
}

function scheduleResourcePackVerification(packId) {
  return callFunction('learningResource', {
    action: 'scheduleVerification',
    packId
  })
}
```

Export all four functions in the existing `module.exports`.

- [x] **Step 4: Run contract test**

Run:

```bash
node --test tests/contracts.test.js
```

Expected: pass.

- [x] **Step 5: Commit**

Run:

```bash
git add miniprogram/utils/cloud.js tests/contracts.test.js
git commit -m "feat: add learning resource cloud client"
```

---

## Task 4: Add Learning Resource Page and Presenter

**Files:**
- Create: `miniprogram/pages/learning-resource/learning-resource-presenter.js`
- Create: `miniprogram/pages/learning-resource/learning-resource.js`
- Create: `miniprogram/pages/learning-resource/learning-resource.wxml`
- Create: `miniprogram/pages/learning-resource/learning-resource.wxss`
- Create: `miniprogram/pages/learning-resource/learning-resource.json`
- Create: `tests/learning-resource-presenter.test.js`
- Modify: `miniprogram/app.json`

**Interfaces:**
- Consumes:
  - `cloud.getLearningResourcePack(packId)`
  - `cloud.completeLearningResourcePack({ packId, practiceResult })`
  - `cloud.scheduleResourcePackVerification(packId)`
- Produces:
  - A visible task-pack page with `summary`, `concept`, `worked_example`, `common_mistake`, `practice` blocks.

- [x] **Step 1: Write presenter tests**

Add `tests/learning-resource-presenter.test.js`:

```js
const test = require('node:test')
const assert = require('node:assert/strict')
const { buildLearningResourceView } = require('../miniprogram/pages/learning-resource/learning-resource-presenter')

test('buildLearningResourceView renders pack blocks and actions', () => {
  const view = buildLearningResourceView({
    _id: 'pack-1',
    title: '小数乘法中积的小数位数判断错误',
    estimatedMinutes: 8,
    blocks: [
      { type: 'summary', title: '今天补什么', body: '小数点定位' },
      { type: 'practice', title: '马上练 3 题', questions: [{ question: '2.4 × 1.5 =', answer: '3.6' }] }
    ],
    externalResources: [{ title: '小数乘法示例', platform: 'Khan Academy' }]
  })

  assert.equal(view.title, '小数乘法中积的小数位数判断错误')
  assert.equal(view.timeText, '约 8 分钟')
  assert.equal(view.blocks.length, 2)
  assert.equal(view.practiceCount, 1)
  assert.equal(view.parentResourceText, '家长参考 1 个')
})
```

- [x] **Step 2: Run RED test**

Run:

```bash
node --test tests/learning-resource-presenter.test.js
```

Expected: fail because presenter file does not exist.

- [x] **Step 3: Implement presenter**

Create `miniprogram/pages/learning-resource/learning-resource-presenter.js`:

```js
function buildLearningResourceView(pack = {}) {
  const blocks = Array.isArray(pack.blocks) ? pack.blocks : []
  const practiceBlock = blocks.find(block => block.type === 'practice')
  const practiceCount = Array.isArray(practiceBlock?.questions) ? practiceBlock.questions.length : 0
  const parentResourceCount = Array.isArray(pack.externalResources) ? pack.externalResources.length : 0
  return {
    id: pack._id || pack.packId || '',
    title: pack.title || '学习任务包',
    status: pack.status || 'ready',
    timeText: pack.estimatedMinutes ? `约 ${pack.estimatedMinutes} 分钟` : '5-10 分钟',
    blocks,
    practiceCount,
    parentResourceText: parentResourceCount ? `家长参考 ${parentResourceCount} 个` : '',
    canComplete: pack.status !== 'completed',
    completed: pack.status === 'completed'
  }
}

module.exports = { buildLearningResourceView }
```

- [x] **Step 4: Implement page files**

Register page in `miniprogram/app.json`:

```json
"pages/learning-resource/learning-resource"
```

Create `miniprogram/pages/learning-resource/learning-resource.json`:

```json
{
  "navigationBarTitleText": "学习任务包"
}
```

Create page controller:

```js
const cloud = require('../../utils/cloud')
const { buildLearningResourceView } = require('./learning-resource-presenter')

Page({
  data: {
    loading: true,
    packId: '',
    view: null,
    errorText: ''
  },

  onLoad(options = {}) {
    this.setData({ packId: options.packId || '' })
    this.loadPack()
  },

  async loadPack() {
    if (!this.data.packId) {
      this.setData({ loading: false, errorText: '没有找到学习任务包' })
      return
    }
    const result = await cloud.getLearningResourcePack(this.data.packId)
    if (!result.success || !result.pack) {
      this.setData({ loading: false, errorText: result.error || '学习任务包加载失败' })
      return
    }
    this.setData({ loading: false, view: buildLearningResourceView(result.pack) })
  },

  async onCompleteTap() {
    const result = await cloud.completeLearningResourcePack({
      packId: this.data.packId,
      practiceResult: { source: 'manual_complete' }
    })
    if (result.success) {
      wx.showToast({ title: '已完成', icon: 'success' })
      this.loadPack()
    } else {
      wx.showToast({ title: result.error || '保存失败', icon: 'none' })
    }
  },

  async onScheduleTap() {
    const result = await cloud.scheduleResourcePackVerification(this.data.packId)
    wx.showToast({ title: result.success ? '已加入验证' : (result.error || '操作失败'), icon: result.success ? 'success' : 'none' })
  }
})
```

- [x] **Step 5: Add WXML and WXSS**

Create WXML with block rendering:

```xml
<view class="page">
  <view wx:if="{{loading}}" class="loading">正在整理学习任务...</view>
  <view wx:elif="{{errorText}}" class="empty">{{errorText}}</view>
  <view wx:else>
    <view class="hero">
      <text class="kicker">学习任务包</text>
      <text class="title">{{view.title}}</text>
      <text class="meta">{{view.timeText}} · {{view.practiceCount}} 道练习</text>
    </view>

    <view class="block block-{{item.type}}" wx:for="{{view.blocks}}" wx:key="title">
      <text class="block-title">{{item.title}}</text>
      <text class="block-body" wx:if="{{item.body}}">{{item.body}}</text>
      <view wx:if="{{item.steps}}">
        <text class="step" wx:for="{{item.steps}}" wx:for-item="step" wx:key="*this">{{step}}</text>
      </view>
      <view class="practice-row" wx:if="{{item.questions}}" wx:for="{{item.questions}}" wx:for-item="question" wx:key="question">
        <text class="practice-question">{{question.question}}</text>
        <text class="practice-answer">答案：{{question.answer}}</text>
      </view>
    </view>

    <view class="parent-ref" wx:if="{{view.parentResourceText}}">
      <text>{{view.parentResourceText}}，由家长打开参考，不建议孩子直接浏览外部信息流。</text>
    </view>

    <view class="actions">
      <button class="secondary" bindtap="onScheduleTap">加入下次验证</button>
      <button class="primary" bindtap="onCompleteTap" disabled="{{view.completed}}">{{view.completed ? '已完成' : '完成学习'}}</button>
    </view>
  </view>
</view>
```

Create WXSS:

```css
.page { min-height: 100vh; padding: 28rpx; background: #f5f8fc; color: #172033; }
.loading, .empty { padding: 80rpx 24rpx; text-align: center; color: #718096; }
.hero { padding: 32rpx; border-radius: 18rpx; background: linear-gradient(135deg, #eaf5ff, #fff7e8); box-shadow: 0 12rpx 30rpx rgba(26, 54, 93, 0.08); }
.kicker { display: block; color: #2b6cb0; font-size: 24rpx; font-weight: 700; }
.title { display: block; margin-top: 10rpx; color: #10233f; font-size: 40rpx; font-weight: 800; line-height: 1.3; }
.meta { display: block; margin-top: 12rpx; color: #5b6b82; font-size: 26rpx; }
.block { margin-top: 24rpx; padding: 28rpx; border-radius: 18rpx; background: #ffffff; box-shadow: 0 10rpx 24rpx rgba(26, 54, 93, 0.06); }
.block-title { display: block; color: #172033; font-size: 32rpx; font-weight: 800; }
.block-body { display: block; margin-top: 14rpx; color: #42526a; font-size: 28rpx; line-height: 1.7; }
.step { display: block; margin-top: 14rpx; color: #42526a; font-size: 28rpx; line-height: 1.7; }
.practice-row { margin-top: 18rpx; padding: 20rpx; border-radius: 14rpx; background: #f7fafc; }
.practice-question, .practice-answer { display: block; color: #2d3748; font-size: 28rpx; line-height: 1.6; }
.practice-answer { margin-top: 8rpx; color: #4a5568; }
.parent-ref { margin-top: 24rpx; padding: 22rpx; border-radius: 14rpx; background: #fff7e8; color: #7b4b19; font-size: 25rpx; line-height: 1.6; }
.actions { display: flex; gap: 18rpx; margin-top: 30rpx; }
.actions button { flex: 1; height: 88rpx; border-radius: 14rpx; font-size: 30rpx; font-weight: 700; }
.secondary { background: #ffffff; color: #2b6cb0; border: 2rpx solid #2b6cb0; }
.primary { background: #2b6cb0; color: #ffffff; }
```

- [x] **Step 6: Run tests and preview**

Run:

```bash
node --test tests/learning-resource-presenter.test.js
npm run verify
/Applications/wechatwebdevtools.app/Contents/MacOS/cli preview --project "/Users/qiming/Downloads/GoogleDrive/AI Learning/miniprogram-learning-diagnostic" --qr-output terminal
```

Expected: tests pass and preview QR is generated.

- [x] **Step 7: Commit**

Run:

```bash
git add miniprogram/app.json miniprogram/pages/learning-resource tests/learning-resource-presenter.test.js
git commit -m "feat: add learning resource task pack page"
```

---

## Task 5: Add Entry Points From Bottleneck Detail and Center

**Files:**
- Modify: `miniprogram/pages/bottleneck-detail/bottleneck-detail.js`
- Modify: `miniprogram/pages/bottleneck-detail/bottleneck-detail.wxml`
- Modify: `miniprogram/pages/bottleneck-detail/bottleneck-detail.wxss`
- Modify: `miniprogram/pages/bottleneck-center/bottleneck-center.js`
- Modify: `miniprogram/pages/bottleneck-center/bottleneck-center.wxml`
- Modify: `tests/page-flows.test.js`

**Interfaces:**
- Consumes:
  - `cloud.generateLearningResourcePack({ studentId, subject, sourceReportId, target, resources })`.
- Produces:
  - User can tap `学一下` and land on `/pages/learning-resource/learning-resource?packId=...`.

- [x] **Step 1: Add page-flow test**

Add to `tests/page-flows.test.js`:

```js
test('bottleneck detail exposes learning task pack before verification', () => {
  const wxml = fs.readFileSync(path.resolve(__dirname, '../miniprogram/pages/bottleneck-detail/bottleneck-detail.wxml'), 'utf8')
  assert.match(wxml, /学一下/)
  assert.match(wxml, /onOpenLearningResource/)
})
```

- [x] **Step 2: Run RED test**

Run:

```bash
node --test tests/page-flows.test.js
```

Expected: fail because the new action is not present.

- [x] **Step 3: Implement detail-page action**

In `bottleneck-detail.js`, add:

```js
async onOpenLearningResource() {
  const { studentId, subject, bottleneck, lpCode } = this.data
  if (!bottleneck) return
  wx.showLoading({ title: '正在生成任务' })
  const result = await cloud.generateLearningResourcePack({
    studentId,
    subject,
    target: {
      bottleneckId: this.data.bottleneckId || bottleneck.bottleneckId || '',
      lpCode,
      title: bottleneck.displayName,
      nodeId: bottleneck.nodeId || '',
      categoryPath: bottleneck.category ? [bottleneck.category] : [],
      symptomPatterns: bottleneck.parentDescription ? [bottleneck.parentDescription] : [],
      repairStrategy: bottleneck.nextActionText ? [bottleneck.nextActionText] : []
    },
    resources: bottleneck.resources || []
  })
  wx.hideLoading()
  if (!result.success) {
    wx.showToast({ title: result.error || '任务生成失败', icon: 'none' })
    return
  }
  wx.navigateTo({ url: `/pages/learning-resource/learning-resource?packId=${encodeURIComponent(result.packId)}` })
}
```

In `bottleneck-detail.wxml`, add a panel above `卡点证据链`:

```xml
<view class="section learning-section">
  <view class="section-title-line">
    <view>
      <view class="section-heading">学习任务包</view>
      <text class="section-subtitle">先用 5-10 分钟把这个卡点学清楚，再安排验证。</text>
    </view>
  </view>
  <view class="learning-entry" bindtap="onOpenLearningResource">
    <view>
      <text class="learning-title">学一下：{{bottleneck.displayName}}</text>
      <text class="learning-desc">包含微讲解、例题拆解、易错对比和 3 道练习。</text>
    </view>
    <text class="arrow">›</text>
  </view>
</view>
```

Add WXSS:

```css
.learning-entry { display: flex; align-items: center; justify-content: space-between; padding: 28rpx; border-radius: 18rpx; background: #fff7e8; border: 2rpx solid #fed7aa; }
.learning-title { display: block; color: #172033; font-size: 30rpx; font-weight: 800; }
.learning-desc { display: block; margin-top: 8rpx; color: #7b4b19; font-size: 25rpx; line-height: 1.5; }
```

- [x] **Step 4: Add center-card action**

In `bottleneck-center.wxml`, add `学一下` as the primary learning action and keep `验证` as the secondary action for cards that need validation.

In `bottleneck-center.js`, add a route method equivalent to `onOpenLearningResource`, using the tapped card data.

- [x] **Step 5: Run tests and preview**

Run:

```bash
node --test tests/page-flows.test.js
npm run verify
/Applications/wechatwebdevtools.app/Contents/MacOS/cli preview --project "/Users/qiming/Downloads/GoogleDrive/AI Learning/miniprogram-learning-diagnostic" --qr-output terminal
```

Expected: test suite passes; page preview builds.

- [x] **Step 6: Commit**

Run:

```bash
git add miniprogram/pages/bottleneck-detail miniprogram/pages/bottleneck-center tests/page-flows.test.js
git commit -m "feat: open learning packs from bottlenecks"
```

---

## Task 6: Add Learning Resource Events to Unified Learning Records

**Files:**
- Modify: `cloudfunctions/studentData/index.js`
- Modify: `tests/student-data-access.test.js`
- Modify: `miniprogram/pages/upload-history/upload-history-presenter.js` if a new display type is needed

**Interfaces:**
- Consumes:
  - `learningResourcePacks` records.
- Produces:
  - Timeline items with `type: 'learning_resource'`, `title`, `subject`, `status`, `createdAt`.

- [x] **Step 1: Add failing timeline test**

Add to `tests/student-data-access.test.js`:

```js
test('learning timeline includes completed learning resource packs', async () => {
  const result = await getLearningTimeline({
    studentId: 'student-1',
    db: makeDb({
      reports: [],
      papers: [],
      englishPracticeSessions: [],
      learningResourcePacks: [
        {
          _id: 'pack-1',
          _openid: 'owner-1',
          studentId: 'student-1',
          subject: 'math',
          title: '小数乘法中积的小数位数判断错误',
          status: 'completed',
          createdAt: '2026-06-17T08:00:00.000Z',
          updatedAt: '2026-06-17T08:10:00.000Z'
        }
      ]
    }),
    openid: 'owner-1',
    limit: 20
  })

  assert.equal(result.items[0].type, 'learning_resource')
  assert.equal(result.items[0].title, '学习任务包：小数乘法中积的小数位数判断错误')
})
```

- [x] **Step 2: Run RED test**

Run:

```bash
node --test tests/student-data-access.test.js
```

Expected: fail because timeline does not include resource packs.

- [x] **Step 3: Implement timeline query and mapping**

In `cloudfunctions/studentData/index.js`, update learning timeline loading to also query:

```js
db.collection('learningResourcePacks')
  .where({ studentId })
  .orderBy('updatedAt', 'desc')
  .limit(limit)
  .get()
```

Map each pack:

```js
{
  id: pack._id,
  type: 'learning_resource',
  subject: pack.subject,
  title: `学习任务包：${pack.title || '未命名卡点'}`,
  summary: pack.status === 'completed' ? '已完成学习' : '待完成学习',
  status: pack.status,
  createdAt: pack.updatedAt || pack.createdAt
}
```

- [x] **Step 4: Run tests**

Run:

```bash
node --test tests/student-data-access.test.js
npm run verify
```

Expected: all tests pass.

- [x] **Step 5: Commit**

Run:

```bash
git add cloudfunctions/studentData/index.js tests/student-data-access.test.js miniprogram/pages/upload-history/upload-history-presenter.js
git commit -m "feat: show learning packs in timeline"
```

---

## Task 7: Deploy and Manual Verify

**Files:**
- Modify: `docs/TEST_MATRIX.md`
- Create: `docs/test-reports/2026-06-17-learning-resource-task-pack-e2e.md`

- [x] **Step 1: Run full local verification**

Run:

```bash
npm run verify
git diff --check
```

Expected: pass.

- [x] **Step 2: Deploy cloud functions**

Run:

```bash
/Applications/wechatwebdevtools.app/Contents/MacOS/cli cloud functions deploy --env cloud1-d6gneg68m5a7a3876 --names learningResource --remote-npm-install --project "/Users/qiming/Downloads/GoogleDrive/AI Learning/miniprogram-learning-diagnostic"
/Applications/wechatwebdevtools.app/Contents/MacOS/cli cloud functions deploy --env cloud1-d6gneg68m5a7a3876 --names studentData --remote-npm-install --project "/Users/qiming/Downloads/GoogleDrive/AI Learning/miniprogram-learning-diagnostic"
```

Expected: both deployments succeed.

- [x] **Step 3: Generate WeChat preview**

Run:

```bash
/Applications/wechatwebdevtools.app/Contents/MacOS/cli preview --project "/Users/qiming/Downloads/GoogleDrive/AI Learning/miniprogram-learning-diagnostic" --qr-output terminal
```

Expected: preview QR generated.

- [x] **Step 4: Manual E2E checklist**

Create `docs/test-reports/2026-06-17-learning-resource-task-pack-e2e.md` with:

```md
# 学习任务包真机验收报告

- 日期：2026-06-17
- 学生：钟青羽
- 学科：数学

## 路径 1：学习卡点详情页

- [ ] 打开学习档案
- [ ] 进入数学学习卡点
- [ ] 打开任意待验证卡点
- [ ] 点击“学一下”
- [ ] 成功打开学习任务包
- [ ] 页面显示微讲解、例题、易错对比和练习
- [ ] 点击“完成学习”
- [ ] 返回学习记录能看到学习任务包事件

## 路径 2：加入验证

- [ ] 在学习任务包点击“加入下次验证”
- [ ] 操作成功
- [ ] 不影响原有生成验证卷入口

## 结论

- 是否通过：
- 遗留问题：
```

- [x] **Step 5: Commit**

Run:

```bash
git add docs/TEST_MATRIX.md docs/test-reports/2026-06-17-learning-resource-task-pack-e2e.md
git commit -m "test: verify learning resource task pack flow"
```

---

## Task 8: Polish Copy and Reduce Entry Duplication

**Files:**
- Modify: `miniprogram/pages/bottleneck-detail/bottleneck-detail.wxml`
- Modify: `miniprogram/pages/bottleneck-center/bottleneck-center.wxml`
- Modify: `miniprogram/pages/subject-home/subject-home.wxml`
- Modify: `docs/subject-design/钟青羽学习卡点学习材料任务包竞品调研与设计文档.md`

**Goal:** Make the final page responsibilities clear:

- `学习档案`: overall summary and latest records.
- `学科工作台`: subject operations.
- `学习卡点中心`: all current card points and priorities.
- `学习卡点详情`: one card point, evidence, and repair action.
- `学习任务包`: child-facing learning material and short practice.
- `验证卷`: paper-based evidence collection.

- [x] **Step 1: Audit repeated CTAs**

Run:

```bash
rg -n "学一下|学习任务包|生成验证|验证卷|学习材料|推荐资源" miniprogram/pages
```

Expected: list all entry copies.

- [x] **Step 2: Make actions consistent**

Use these labels:

```text
学一下
完成学习
加入下次验证
生成纸面验证卷
查看证据链
```

- [x] **Step 3: Run preview**

Run:

```bash
npm run verify
/Applications/wechatwebdevtools.app/Contents/MacOS/cli preview --project "/Users/qiming/Downloads/GoogleDrive/AI Learning/miniprogram-learning-diagnostic" --qr-output terminal
```

Expected: preview QR generated.

- [x] **Step 4: Commit**

Run:

```bash
git add miniprogram/pages docs/subject-design/钟青羽学习卡点学习材料任务包竞品调研与设计文档.md
git commit -m "chore: polish learning resource entry copy"
```

---

## Acceptance Checklist

- [x] A math bottleneck can open an in-app learning task pack.
- [x] The task pack contains card-point explanation, concept, worked example, common mistake, and 3 practice items.
- [x] The child can finish the pack without opening external links.
- [x] External links are shown only as parent reference.
- [x] Completing the pack writes a learning-record event.
- [x] The pack can be queued for later verification.
- [x] Existing report, bottleneck center, verification paper, and learning records still work.
- [x] `npm run verify` passes.
- [x] WeChat DevTools CLI preview succeeds.
- [x] Cloud functions are deployed before real-device testing.

2026-06-17 execution note:

- Completed Tasks 1-8 in separate commits.
- Deployed `learningResource` and `studentData` cloud functions.
- Final regression: `npm run verify` passed with 407 tests.
- Final WeChat DevTools CLI preview succeeded, package size 723.6 KB.

---

## Execution Notes

Implement this plan in small commits. Do not combine cloud function, page, timeline, and visual polish into one commit. If a task fails because current uncommitted files changed around the same area, stop and inspect `git diff` before editing.

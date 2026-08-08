# Family Members And Verification Workbench Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Upgrade family collaboration and verification paper flow so multiple parents can identify themselves clearly, join with links or invite codes, and complete the full verification paper loop from one workbench.

**Architecture:** Keep the current CloudBase collections and page structure. Extend `studentMembers`, `studentInvites`, `papers`, and verification `reports` with small additive fields; avoid migrations by providing fallbacks for existing data. Use `paper-preview` as the verification paper workbench and derive feedback from the latest verification report linked by `paperId`.

**Tech Stack:** WeChat Mini Program pages/WXML/WXSS, CloudBase cloud functions, Node.js built-in test runner, existing page/cloud-function harnesses, WeChat DevTools automator.

---

## Scope

This iteration includes:

- Family member display name and relation.
- Invite link plus short invite code.
- Join-by-code entry.
- Unique verification paper identity shown in UI, PDF, upload, history, and feedback.
- Verification paper workbench with question preview, upload status, and latest feedback summary.

This iteration excludes:

- Adding parents by WeChat ID.
- Complex role tiers beyond owner/viewer.
- Embedded PDF rendering inside Mini Program.
- New event/timeline collections.

---

## File Map

### Cloud Functions

- Modify: `cloudfunctions/studentAccess/index.js`
  - Add relation/display-name update action.
  - Add invite-code generation and lookup.
  - Store preset relation on invites.
- Modify: `cloudfunctions/generatePaper/index.js`
  - Generate stable `paperCode` and `paperDisplayCode`.
  - Store code fields on `papers`.
- Modify: `cloudfunctions/generatePaper/pdf-renderer.js`
  - Print `paperDisplayCode` in the A4 header.
- Read only unless needed: `cloudfunctions/studentData/index.js`
  - Ensure paper detail returns code fields and linked verification reports if implemented server-side.

### Mini Program Utilities

- Modify: `miniprogram/utils/cloud.js`
  - Add wrappers for updating member profile and joining by code.
- Modify: `miniprogram/utils/util.js` or create `miniprogram/utils/paper-code.js`
  - Shared paper-code fallback formatter if needed.

### Mini Program Pages

- Modify: `miniprogram/pages/parent-management/parent-management.js`
- Modify: `miniprogram/pages/parent-management/parent-management.wxml`
- Modify: `miniprogram/pages/parent-management/parent-management.wxss`
  - Show relation/display name.
  - Add edit flow.
  - Add invite relation selector and invite code display.

- Modify: `miniprogram/pages/join-student/join-student.js`
- Modify: `miniprogram/pages/join-student/join-student.wxml`
- Modify: `miniprogram/pages/join-student/join-student.wxss`
  - Support link token and invite-code modes.
  - Let invited parent confirm relation/display name before joining.

- Modify: `miniprogram/pages/index/index.wxml`
  - Add entry for "输入邀请码" if it does not fit naturally in parent management only.

- Modify: `miniprogram/pages/paper-preview/paper-preview.js`
- Modify: `miniprogram/pages/paper-preview/paper-preview.wxml`
- Modify: `miniprogram/pages/paper-preview/paper-preview.wxss`
  - Convert page into verification workbench.
  - Show paper identity, question preview, upload/analysis/feedback status.

- Modify: `miniprogram/pages/upload/upload.js`
- Modify: `miniprogram/pages/upload/upload.wxml`
  - Show paper code when uploading verification answers.

- Modify: `miniprogram/pages/upload-history/upload-history.js`
- Modify: `miniprogram/pages/index/index-presenter.js`
  - Show paper code in timeline and recent records.

### Tests

- Modify: `tests/student-access.test.js`
- Modify: `tests/parent-management-page-flows.test.js`
- Modify: `tests/cloud-functions.test.js`
- Modify: `tests/generate-paper-pdf.test.js`
- Modify: `tests/page-flows.test.js`
- Modify: `tests/student-data-access.test.js`
- Modify: `tests/contracts.test.js`
- Modify: `scripts/devtools-parent-timeline-e2e.js`

### Docs

- Modify: `docs/DATA_DICTIONARY.md`
- Modify: `docs/CLOUD_FUNCTIONS.md`
- Modify: `docs/TESTING.md`
- Modify: `docs/TEST_MATRIX.md`

---

## Task 1: Add Family Member Relation And Display Name Data Contract

**Files:**

- Modify: `cloudfunctions/studentAccess/index.js`
- Modify: `tests/student-access.test.js`
- Modify: `docs/DATA_DICTIONARY.md`
- Modify: `docs/CLOUD_FUNCTIONS.md`

- [ ] **Step 1: Write failing tests for relation/display name defaults**

Add tests to `tests/student-access.test.js`:

```js
test('owner member receives default display profile and can update viewer relation', async () => {
  const db = createDatabase({
    students: [{ _id: 'student-1', _openid: 'owner-1', name: '钟青羽', grade: 6 }],
    studentMembers: [
      { _id: 'viewer-member', studentId: 'student-1', ownerOpenId: 'owner-1', memberOpenId: 'viewer-1', role: 'viewer', status: 'active' }
    ],
    studentInvites: []
  })
  const owner = loadStudentAccess(db, 'owner-1')

  const before = await owner.main({ action: 'listMembers', studentId: 'student-1' })
  assert.equal(before.success, true)
  assert.equal(before.members.find(item => item.memberOpenId === 'owner-1').relationText, '创建者')

  const updated = await owner.main({
    action: 'updateMemberProfile',
    studentId: 'student-1',
    memberOpenId: 'viewer-1',
    displayName: '青羽爸爸',
    relation: 'father'
  })
  assert.equal(updated.success, true)

  const viewer = db.dump('studentMembers').find(item => item.memberOpenId === 'viewer-1')
  assert.equal(viewer.displayName, '青羽爸爸')
  assert.equal(viewer.relation, 'father')
  assert.equal(viewer.relationText, '爸爸')
})
```

- [ ] **Step 2: Run test and verify failure**

Run:

```bash
node --test tests/student-access.test.js
```

Expected: FAIL because `updateMemberProfile` is not an allowed action and relation defaults are not present.

- [ ] **Step 3: Implement relation helpers**

In `cloudfunctions/studentAccess/index.js`, add:

```js
const RELATIONS = {
  owner: '创建者',
  father: '爸爸',
  mother: '妈妈',
  grandfather: '爷爷',
  grandmother: '奶奶',
  maternal_grandfather: '外公',
  maternal_grandmother: '外婆',
  teacher: '老师',
  other: '其他'
};

function normalizeRelation(relation, fallbackRole = '') {
  if (relation && RELATIONS[relation]) return relation;
  if (fallbackRole === 'owner') return 'owner';
  return 'other';
}

function withMemberDisplay(member) {
  const relation = normalizeRelation(member.relation, member.role);
  return {
    ...member,
    relation,
    relationText: member.relationText || RELATIONS[relation],
    displayName: member.displayName || RELATIONS[relation],
  };
}
```

- [ ] **Step 4: Add `updateMemberProfile` action**

Add the action to `ACTIONS`, validate owner access, and update only active members:

```js
async function updateMemberProfile(openId, studentId, memberOpenId, displayName, relation) {
  const access = await getAccess(studentId, openId);
  if (!access.owner) return failure('无权执行该操作');
  const members = await getMembersByStudent(studentId);
  const target = members.find(member => member.memberOpenId === memberOpenId && member.status === 'active');
  if (!target) return failure('家长成员不存在');

  const normalizedRelation = normalizeRelation(relation, target.role);
  const safeDisplayName = String(displayName || '').trim().slice(0, 20) || RELATIONS[normalizedRelation];
  await db.collection('studentMembers').doc(target._id).update({
    data: {
      displayName: safeDisplayName,
      relation: normalizedRelation,
      relationText: RELATIONS[normalizedRelation],
      updatedAt: now(),
    }
  });
  return success({
    memberOpenId,
    displayName: safeDisplayName,
    relation: normalizedRelation,
    relationText: RELATIONS[normalizedRelation],
  });
}
```

- [ ] **Step 5: Return normalized members from `listMembers`**

Before returning:

```js
members: members.map(withMemberDisplay)
```

- [ ] **Step 6: Run test and verify pass**

Run:

```bash
node --test tests/student-access.test.js
```

Expected: PASS.

- [ ] **Step 7: Update docs**

Update `studentMembers` fields in `docs/DATA_DICTIONARY.md` and `studentAccess` API in `docs/CLOUD_FUNCTIONS.md`.

- [ ] **Step 8: Commit**

```bash
git add cloudfunctions/studentAccess/index.js tests/student-access.test.js docs/DATA_DICTIONARY.md docs/CLOUD_FUNCTIONS.md
git commit -m "feat: add family member display profiles"
```

---

## Task 2: Add Invite Codes And Preset Relations

**Files:**

- Modify: `cloudfunctions/studentAccess/index.js`
- Modify: `tests/student-access.test.js`
- Modify: `docs/DATA_DICTIONARY.md`
- Modify: `docs/CLOUD_FUNCTIONS.md`

- [ ] **Step 1: Write failing tests for invite codes**

Add tests:

```js
test('owner creates invite code with preset relation and parent can join by code', async () => {
  const db = createDatabase({
    students: [{ _id: 'student-1', _openid: 'owner-1', name: '钟青羽', grade: 6 }],
    studentMembers: [],
    studentInvites: []
  })
  const owner = loadStudentAccess(db, 'owner-1')
  const viewer = loadStudentAccess(db, 'viewer-1')

  const invite = await owner.main({
    action: 'createInvite',
    studentId: 'student-1',
    presetRelation: 'mother'
  })
  assert.equal(invite.success, true)
  assert.match(invite.inviteCode, /^[A-Z0-9]{6}$/)
  assert.equal(db.dump('studentInvites')[0].presetRelation, 'mother')

  const preview = await viewer.main({ action: 'getInviteByCode', inviteCode: invite.inviteCode })
  assert.equal(preview.success, true)
  assert.equal(preview.student.name, '钟青羽')
  assert.equal(preview.presetRelationText, '妈妈')

  const accepted = await viewer.main({
    action: 'acceptInviteByCode',
    inviteCode: invite.inviteCode,
    displayName: '青羽妈妈'
  })
  assert.equal(accepted.success, true)
  assert.equal(db.dump('studentMembers')[0].relation, 'mother')
})
```

- [ ] **Step 2: Run test and verify failure**

```bash
node --test tests/student-access.test.js
```

Expected: FAIL on missing actions/fields.

- [ ] **Step 3: Implement code generation**

Use short random uppercase code with collision retry:

```js
function createInviteCode() {
  return crypto.randomBytes(4).toString('base64url').replace(/[^A-Z0-9]/ig, '').toUpperCase().slice(0, 6).padEnd(6, 'X');
}

async function createUniqueInviteCode() {
  for (let i = 0; i < 5; i += 1) {
    const inviteCode = createInviteCode();
    const existing = await getCollectionData('studentInvites', { inviteCode, status: 'active' });
    if (!existing.length) return inviteCode;
  }
  throw new Error('邀请码生成失败');
}
```

- [ ] **Step 4: Store invite code and preset relation**

Extend `createInvite` input:

```js
const presetRelation = normalizeRelation(event.presetRelation || '', 'viewer');
```

Store:

```js
inviteCode,
presetRelation,
presetRelationText: RELATIONS[presetRelation],
```

Return `inviteCode`.

- [ ] **Step 5: Implement get/accept by code**

Add actions:

```js
'getInviteByCode',
'acceptInviteByCode',
```

Implement lookup by `{ inviteCode, status: 'active' }`, reuse existing invite validation and member creation paths.

- [ ] **Step 6: Run tests**

```bash
node --test tests/student-access.test.js
```

Expected: PASS.

- [ ] **Step 7: Update docs**

Document `inviteCode`, `presetRelation`, `presetRelationText`, and code-based APIs.

- [ ] **Step 8: Commit**

```bash
git add cloudfunctions/studentAccess/index.js tests/student-access.test.js docs/DATA_DICTIONARY.md docs/CLOUD_FUNCTIONS.md
git commit -m "feat: support family invite codes"
```

---

## Task 3: Update Family Management UI

**Files:**

- Modify: `miniprogram/pages/parent-management/parent-management.js`
- Modify: `miniprogram/pages/parent-management/parent-management.wxml`
- Modify: `miniprogram/pages/parent-management/parent-management.wxss`
- Modify: `miniprogram/utils/cloud.js`
- Modify: `tests/parent-management-page-flows.test.js`

- [ ] **Step 1: Write failing page-flow tests**

Add tests for:

- Member list shows `displayName` and `relationText`.
- Owner opens edit member action and calls `cloud.updateStudentMemberProfile`.
- Invite button uses selected preset relation and displays invite code.

Example:

```js
test('owner can edit member display name and relation', async () => {
  let updated = null;
  const cloud = {
    listStudentMembers: async () => ({
      student: { _id: 'student-1', name: '钟青羽', grade: 6 },
      role: 'owner',
      permissions: { canManageParents: true },
      members: [{ memberOpenId: 'viewer-1', role: 'viewer', relation: 'father', relationText: '爸爸', displayName: '爸爸', status: 'active' }]
    }),
    updateStudentMemberProfile: async payload => {
      updated = payload;
      return { success: true };
    }
  };
  const { page } = loadPage('miniprogram/pages/parent-management/parent-management.js', {
    modules: { '../../utils/cloud': cloud }
  });
  page.setData({ studentId: 'student-1' });
  await page.loadMembers();
  page.onEditMember({ currentTarget: { dataset: { index: 0 } } });
  page.setData({ editingDisplayName: '青羽爸爸', editingRelation: 'father' });
  await page.onSaveMemberProfile();
  assert.equal(updated.memberOpenId, 'viewer-1');
  assert.equal(updated.displayName, '青羽爸爸');
});
```

- [ ] **Step 2: Run tests and verify failure**

```bash
node --test tests/parent-management-page-flows.test.js
```

Expected: FAIL.

- [ ] **Step 3: Add cloud wrappers**

In `miniprogram/utils/cloud.js`:

```js
async function updateStudentMemberProfile(params) {
  return callFunction('studentAccess', { action: 'updateMemberProfile', ...params });
}
```

Update `module.exports`.

- [ ] **Step 4: Implement member edit state**

Add data:

```js
relationOptions: [
  { key: 'father', name: '爸爸' },
  { key: 'mother', name: '妈妈' },
  { key: 'grandfather', name: '爷爷' },
  { key: 'grandmother', name: '奶奶' },
  { key: 'maternal_grandfather', name: '外公' },
  { key: 'maternal_grandmother', name: '外婆' },
  { key: 'teacher', name: '老师' },
  { key: 'other', name: '其他' }
],
editingMemberIndex: -1,
editingDisplayName: '',
editingRelation: 'other',
inviteRelation: 'mother',
```

- [ ] **Step 5: Implement edit handlers**

Add `onEditMember`, `onCancelEditMember`, `onDisplayNameInput`, `onRelationChange`, `onSaveMemberProfile`.

- [ ] **Step 6: Update WXML/WXSS**

Show each member as:

```text
青羽妈妈
妈妈 · 档案创建者
```

For owner, add a small "编辑" action on non-revoked members.

Add invite relation picker:

```text
邀请身份：妈妈
[生成邀请]
邀请码：QY8392
邀请路径：/pages/join-student...
```

- [ ] **Step 7: Run page tests**

```bash
node --test tests/parent-management-page-flows.test.js
```

Expected: PASS.

- [ ] **Step 8: Commit**

```bash
git add miniprogram/pages/parent-management miniprogram/utils/cloud.js tests/parent-management-page-flows.test.js
git commit -m "feat: improve family member management UI"
```

---

## Task 4: Add Join-By-Code UI

**Files:**

- Modify: `miniprogram/pages/join-student/join-student.js`
- Modify: `miniprogram/pages/join-student/join-student.wxml`
- Modify: `miniprogram/pages/join-student/join-student.wxss`
- Modify: `miniprogram/app.json` only if adding a separate route.
- Modify: `miniprogram/pages/index/index.wxml` if adding an entry from home.
- Modify: `tests/parent-management-page-flows.test.js`
- Modify: `tests/project-integrity.test.js` if route changes.

- [ ] **Step 1: Decide route**

Use existing `pages/join-student/join-student` for both:

- Link mode: `inviteId + token`.
- Code mode: no invite params, user inputs code.

No new page unless WXML becomes unwieldy.

- [ ] **Step 2: Write failing tests**

Test:

- Loading without params shows invite-code input.
- Input code previews child.
- Accept by code navigates home.

- [ ] **Step 3: Implement cloud wrappers**

In `miniprogram/utils/cloud.js`:

```js
async function getStudentInviteByCode(inviteCode) {
  return callFunction('studentAccess', { action: 'getInviteByCode', inviteCode });
}

async function acceptStudentInviteByCode(params) {
  return callFunction('studentAccess', { action: 'acceptInviteByCode', ...params });
}
```

- [ ] **Step 4: Implement code mode state**

Add data:

```js
mode: 'link' | 'code',
inviteCode: '',
displayName: '',
relation: '',
```

- [ ] **Step 5: Implement handlers**

Add `onInviteCodeInput`, `onLookupCode`, `onDisplayNameInput`, `onAcceptCodeInvite`.

- [ ] **Step 6: Update WXML/WXSS**

Code mode should be simple:

```text
输入家庭邀请码
[ QY8392 ]
[查看孩子档案]

找到：钟青羽 · 6年级
身份：妈妈
显示名：[青羽妈妈]
[加入孩子档案]
```

- [ ] **Step 7: Run tests**

```bash
node --test tests/parent-management-page-flows.test.js tests/project-integrity.test.js
```

Expected: PASS.

- [ ] **Step 8: Commit**

```bash
git add miniprogram/pages/join-student miniprogram/pages/index miniprogram/utils/cloud.js tests/parent-management-page-flows.test.js tests/project-integrity.test.js
git commit -m "feat: join family by invite code"
```

---

## Task 5: Generate And Store Unique Verification Paper Codes

**Files:**

- Modify: `cloudfunctions/generatePaper/index.js`
- Modify: `cloudfunctions/generatePaper/pdf-renderer.js`
- Modify: `tests/cloud-functions.test.js`
- Modify: `tests/generate-paper-pdf.test.js`
- Modify: `docs/DATA_DICTIONARY.md`
- Modify: `docs/CLOUD_FUNCTIONS.md`

- [ ] **Step 1: Write failing cloud-function tests**

In `tests/cloud-functions.test.js`, assert generated verification paper has:

```js
assert.match(result.paperCode, /^MATH-\d{8}-\d{2}$/)
assert.match(result.paperDisplayCode, /^数学-\d{8}-\d{2}$/)
assert.equal(db.dump('papers')[0].paperCode, result.paperCode)
```

- [ ] **Step 2: Write failing PDF renderer test**

In `tests/generate-paper-pdf.test.js`, assert `paperDisplayCode` is passed to renderer and appears in text operations if renderer mock supports it.

- [ ] **Step 3: Run tests and verify failure**

```bash
node --test tests/cloud-functions.test.js tests/generate-paper-pdf.test.js
```

Expected: FAIL.

- [ ] **Step 4: Implement paper-code helpers**

In `cloudfunctions/generatePaper/index.js`:

```js
const SUBJECT_CODE = { math: 'MATH', chinese: 'CHN', english: 'ENG' };
const SUBJECT_NAME = { math: '数学', chinese: '语文', english: '英语' };

function formatDateCode(date = new Date()) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}${month}${day}`;
}
```

Generate sequence by querying same subject/date papers:

```js
async function createPaperCodes(studentId, subject, date) {
  const dateCode = formatDateCode(date);
  const prefix = `${SUBJECT_CODE[subject] || 'PAPER'}-${dateCode}-`;
  const existing = await db.collection('papers').where({ studentId, subject, paperDate: normalizedPaperDate }).get();
  const sequence = String((existing.data || []).length + 1).padStart(2, '0');
  return {
    paperCode: `${prefix}${sequence}`,
    paperDisplayCode: `${SUBJECT_NAME[subject] || subject}-${dateCode}-${sequence}`,
  };
}
```

- [ ] **Step 5: Store and return codes**

Add to `papers` record and result:

```js
paperCode,
paperDisplayCode,
```

- [ ] **Step 6: Print code in PDF**

Pass `{ paperDate, paperCode, paperDisplayCode }` into `generatePDF`. In `pdf-renderer.js`, render code in the student page header and answer page header.

- [ ] **Step 7: Run tests**

```bash
node --test tests/cloud-functions.test.js tests/generate-paper-pdf.test.js
```

Expected: PASS.

- [ ] **Step 8: Commit**

```bash
git add cloudfunctions/generatePaper tests/cloud-functions.test.js tests/generate-paper-pdf.test.js docs/DATA_DICTIONARY.md docs/CLOUD_FUNCTIONS.md
git commit -m "feat: add verification paper codes"
```

---

## Task 6: Show Paper Codes Across Existing Views

**Files:**

- Modify: `miniprogram/pages/paper-preview/paper-preview.js`
- Modify: `miniprogram/pages/upload-history/upload-history.js`
- Modify: `miniprogram/pages/index/index-presenter.js`
- Modify: `miniprogram/pages/upload/upload.js`
- Modify: `tests/page-flows.test.js`
- Modify: `tests/index-presenter.test.js`

- [ ] **Step 1: Write failing tests**

Assert:

- Paper preview `paperCodeText` is `数学-20260613-01`.
- Timeline event title or chip includes `数学-20260613-01`.
- Upload verification page displays the code when `paperId` is present and paper detail can be fetched.

- [ ] **Step 2: Run tests and verify failure**

```bash
node --test tests/page-flows.test.js tests/index-presenter.test.js
```

Expected: FAIL.

- [ ] **Step 3: Add fallback display formatter**

In `paper-preview.js` or `utils/paper-code.js`:

```js
function getPaperCodeText(paper) {
  if (paper.paperDisplayCode) return paper.paperDisplayCode;
  if (paper.paperCode) return paper.paperCode;
  return '';
}
```

Use only code fields for old papers if present; do not invent misleading old codes unless required.

- [ ] **Step 4: Update views**

Add code chip/row:

- Paper preview: hero section.
- Upload history: `chips`.
- Home recent records: subtitle or chip.
- Upload page: header text `正在上传：数学-20260613-01`.

- [ ] **Step 5: Run tests**

```bash
node --test tests/page-flows.test.js tests/index-presenter.test.js
```

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add miniprogram/pages/paper-preview miniprogram/pages/upload-history miniprogram/pages/index miniprogram/pages/upload tests/page-flows.test.js tests/index-presenter.test.js
git commit -m "feat: display verification paper codes"
```

---

## Task 7: Refactor Paper Preview Into Verification Workbench

**Files:**

- Modify: `miniprogram/pages/paper-preview/paper-preview.js`
- Modify: `miniprogram/pages/paper-preview/paper-preview.wxml`
- Modify: `miniprogram/pages/paper-preview/paper-preview.wxss`
- Modify: `tests/page-flows.test.js`
- Optional create: `miniprogram/pages/paper-preview/paper-preview-presenter.js`
- Optional test: `tests/paper-preview-presenter.test.js`

- [ ] **Step 1: Create presenter if page logic is too large**

If `paper-preview.js` grows past comfortable size, create:

```text
miniprogram/pages/paper-preview/paper-preview-presenter.js
```

Responsible for:

- `buildQuestionPreview(questions, maxCount)`
- `buildPaperStatus(paper, latestReport)`
- `buildFeedbackSummary(report, paper)`

- [ ] **Step 2: Write failing tests for question preview**

In `tests/page-flows.test.js` or new presenter test:

```js
assert.equal(page.data.questionPreview.length, 3)
assert.equal(page.data.hasMoreQuestions, true)
assert.match(page.data.questionPreview[0].content, /1\+1/)
```

- [ ] **Step 3: Run tests and verify failure**

```bash
node --test tests/page-flows.test.js
```

Expected: FAIL.

- [ ] **Step 4: Add workbench state**

Add to page data:

```js
paperCodeText: '',
questionPreview: [],
allQuestionsExpanded: false,
hasMoreQuestions: false,
workbenchStatus: 'waiting_upload', // waiting_print | waiting_upload | analyzing | completed | failed
workbenchStatusText: '等待上传作答',
feedback: null,
```

- [ ] **Step 5: Build question preview from `paper.questions`**

Preview fields:

```js
{
  number,
  bottleneckName,
  content,
  typeText,
  answerHint
}
```

Use `lpName` or readable bottleneck formatter.

- [ ] **Step 6: Update WXML**

Replace large "PDF 已准备好" card with:

```text
[数学-20260613-01]
数学 · 钟青羽 · 2026-06-13
状态：等待上传作答

试卷内容
1. ...
2. ...
3. ...
[展开全部题目]

完整文件
[打开 PDF] [分享打印]

作答与反馈
[拍照上传这份试卷]
```

- [ ] **Step 7: Update WXSS**

Keep the existing restrained card style. Use compact rows and chips; avoid nested cards.

- [ ] **Step 8: Run tests**

```bash
node --test tests/page-flows.test.js
```

Expected: PASS.

- [ ] **Step 9: Commit**

```bash
git add miniprogram/pages/paper-preview tests/page-flows.test.js
git commit -m "feat: turn paper preview into verification workbench"
```

---

## Task 8: Load And Display Latest Verification Feedback On Workbench

**Files:**

- Modify: `cloudfunctions/studentData/index.js`
- Modify: `miniprogram/utils/cloud.js`
- Modify: `miniprogram/pages/paper-preview/paper-preview.js`
- Modify: `miniprogram/pages/paper-preview/paper-preview.wxml`
- Modify: `tests/student-data-access.test.js`
- Modify: `tests/page-flows.test.js`

- [ ] **Step 1: Decide data source**

Recommended: extend `studentData.getPaperDetail(paperId)` to return:

```js
{
  paper,
  latestVerificationReport,
  permissions
}
```

Find latest `reports` where:

```js
{ paperId, type: 'verification' }
```

- [ ] **Step 2: Write failing cloud-function test**

In `tests/student-data-access.test.js`:

```js
const result = await handler.main({ action: 'getPaperDetail', paperId: 'paper-1' })
assert.equal(result.latestVerificationReport._id, 'report-verify-latest')
```

- [ ] **Step 3: Write failing page-flow test**

In `tests/page-flows.test.js`, mock `getPaperDetail` returning a completed report and assert:

```js
assert.equal(page.data.workbenchStatus, 'completed')
assert.match(page.data.feedback.summary, /部分通过/)
```

- [ ] **Step 4: Run tests and verify failure**

```bash
node --test tests/student-data-access.test.js tests/page-flows.test.js
```

Expected: FAIL.

- [ ] **Step 5: Extend `studentData.getPaperDetail`**

After access check, fetch latest verification report. Preserve old return shape by adding fields, not replacing `paper`.

- [ ] **Step 6: Build feedback summary**

In paper preview:

```js
function buildFeedback(report) {
  if (!report) return null;
  const evidence = report.verificationEvidence || [];
  const passed = evidence.filter(item => item.complete && item.allCorrect).length;
  return {
    statusText: report.status === 'completed' ? '已完成批改' : '分析中',
    resultText: `${passed}/${evidence.length} 个卡点通过验证`,
    summary: report.comparisonSummary || report.summary || '查看验证反馈',
    reportId: report._id
  };
}
```

- [ ] **Step 7: Update workbench status rules**

Rules:

- No report: `waiting_upload`.
- Latest report analyzing: `analyzing`.
- Latest report failed: `failed`.
- Latest report completed: `completed`.

- [ ] **Step 8: Update WXML**

Show feedback section:

```text
验证反馈
已完成批改
计算基础：已改善
审题理解：仍需观察
[查看完整报告]
```

Add handler `onViewFeedbackReport`.

- [ ] **Step 9: Run tests**

```bash
node --test tests/student-data-access.test.js tests/page-flows.test.js
```

Expected: PASS.

- [ ] **Step 10: Commit**

```bash
git add cloudfunctions/studentData miniprogram/utils/cloud.js miniprogram/pages/paper-preview tests/student-data-access.test.js tests/page-flows.test.js
git commit -m "feat: show verification feedback on paper workbench"
```

---

## Task 9: Improve Upload Flow For Verification Answers

**Files:**

- Modify: `miniprogram/pages/upload/upload.js`
- Modify: `miniprogram/pages/upload/upload.wxml`
- Modify: `miniprogram/pages/upload/upload.wxss`
- Modify: `tests/page-flows.test.js`

- [ ] **Step 1: Write failing upload test**

When route includes `mode=verification&paperId=paper-1`, page should load paper detail and show code/name.

- [ ] **Step 2: Run test and verify failure**

```bash
node --test tests/page-flows.test.js
```

Expected: FAIL.

- [ ] **Step 3: Load paper detail in upload page**

If `paperId` exists, call `cloud.getPaperDetail(paperId)` and set:

```js
paperCodeText,
paperName,
paperQuestionCount
```

Do not block upload if detail fetch fails; show route fallback.

- [ ] **Step 4: Update WXML copy**

Show:

```text
正在上传：数学-20260613-01
请拍完整页面和演算过程
```

- [ ] **Step 5: Ensure submit still sends `paperId`**

Existing code already sends `paperId`; keep tests covering it.

- [ ] **Step 6: Run tests**

```bash
node --test tests/page-flows.test.js
```

Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add miniprogram/pages/upload tests/page-flows.test.js
git commit -m "feat: identify verification paper during upload"
```

---

## Task 10: Update DevTools E2E And Project Verification

**Files:**

- Modify: `scripts/devtools-parent-timeline-e2e.js`
- Modify: `docs/test-reports/2026-06-13-parent-management-timeline-e2e.md` or create new dated report.
- Modify: `docs/TESTING.md`
- Modify: `docs/TEST_MATRIX.md`

- [ ] **Step 1: Extend DevTools mock data**

Add:

```js
paperCode: 'MATH-20260613-01',
paperDisplayCode: '数学-20260613-01',
latestVerificationReport: { ... }
```

- [ ] **Step 2: Add E2E assertions**

Assert:

- Parent management displays member relation/name.
- Invite generation displays invite code.
- Paper workbench displays code.
- Paper workbench displays question preview.
- Paper workbench displays feedback when mock report exists.

- [ ] **Step 3: Run DevTools test**

```bash
npm run test:devtools-parent-timeline
```

Expected: PASS with 0 failures.

- [ ] **Step 4: Run full verification**

```bash
npm run verify
```

Expected: all tests pass and JS check passes.

- [ ] **Step 5: Manual real-cloud smoke test**

In WeChat DevTools preview:

1. Open learning profile.
2. Enter parent management.
3. Edit display name/relation.
4. Create invite and note invite code.
5. Open join page in code mode and preview code.
6. Open a verification paper workbench.
7. Confirm paper code, question preview, upload entry, and latest feedback display.

- [ ] **Step 6: Update docs and test report**

Record:

- Commands run.
- DevTools cases covered.
- Any real-cloud writes performed.

- [ ] **Step 7: Commit**

```bash
git add scripts/devtools-parent-timeline-e2e.js docs/TESTING.md docs/TEST_MATRIX.md docs/test-reports
git commit -m "test: cover family and verification workbench flows"
```

---

## Deployment Checklist

- [ ] Run `npm run verify`.
- [ ] Run `npm run test:devtools-parent-timeline`.
- [ ] Deploy changed cloud functions:

```bash
/Applications/wechatwebdevtools.app/Contents/MacOS/cli cloud functions deploy --env cloud1-d6gneg68m5a7a3876 --names studentAccess generatePaper studentData --remote-npm-install --project "/Users/qiming/Downloads/GoogleDrive/AI Learning/miniprogram-learning-diagnostic" --lang zh
```

- [ ] If `pdf-renderer.js` changed only under `generatePaper`, ensure `generatePaper` deploy includes it.
- [ ] Use WeChat DevTools Preview to smoke-test the live cloud functions.
- [ ] If needed, upload a trial version from DevTools after preview passes.

---

## Final Acceptance Criteria

Family collaboration:

- [ ] Owner sees every family member with display name, relation, and role.
- [ ] Owner can edit a member display name and relation.
- [ ] Owner can create invite link and invite code with preset relation.
- [ ] Another parent can join by link.
- [ ] Another parent can join by code.
- [ ] Viewer can read the child's profile but cannot upload, generate papers, or invite parents.

Verification paper workbench:

- [ ] Every new verification paper has `paperCode` and `paperDisplayCode`.
- [ ] The code appears on PDF, workbench, home recent records, learning timeline, upload page, and feedback report context.
- [ ] Workbench shows question preview without opening the PDF.
- [ ] Workbench still supports PDF download/open.
- [ ] Workbench upload button sends `mode=verification` and the correct `paperId`.
- [ ] Workbench shows latest linked verification feedback after answer upload is analyzed.
- [ ] Existing old papers without codes still load gracefully.

Regression:

- [ ] Existing student profile data is not deleted or migrated destructively.
- [ ] Existing reports and papers remain visible in timeline.
- [ ] `npm run verify` passes.
- [ ] DevTools E2E passes.

# English Paper Dictation Voice Flow Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Upgrade the English paper dictation page from manual per-word navigation to a parent-like dictation flow: preview 20 words, start the session, auto-play prompts, wait for writing, and advance on “OK / 好了 / 下一个”.

**Architecture:** Keep the existing cloud session, word selection, upload, and OCR logic intact. Add a front-end dictation state machine inside `english-dictation` with `ready / running / paused / finished / reviewed` phases and `idle / speaking / writing / waitingCommand` playback states, then update page-flow and DevTools E2E tests around that behavior.

**Tech Stack:** WeChat Mini Program page JS/WXML/WXSS, WechatSI plugin, existing `miniprogram/utils/english-voice.js`, Node.js `node:test`, DevTools E2E script fixtures.

## Global Constraints

- Do not change `cloudfunctions/englishVocabulary` selection or OCR judgment logic in this plan.
- Do not write English paper dictation into the math `reports → bottlenecks → papers` chain.
- Keep buttons as stable fallbacks even when voice command support is available.
- The ready phase may show the full 20-word list; the running phase must not keep English answers visible in the main prompt area.
- Default writing wait is 7 seconds, within the requested 5-10 second range.
- Existing upload and OCR flows must continue to work.
- Use TDD: write or update tests before implementation.

---

## File Structure

- Modify: `miniprogram/pages/english-dictation/english-dictation.js`
  - Owns page state, session generation, TTS prompt playback, voice command handling, upload, and cleanup.
- Modify: `miniprogram/pages/english-dictation/english-dictation.wxml`
  - Renders ready/running/finished/reviewed states and the word list.
- Modify: `miniprogram/pages/english-dictation/english-dictation.wxss`
  - Adds styles for the ready word list, running status panel, folded word list, and command controls.
- Modify: `tests/page-flows.test.js`
  - Adds page-level regression tests for the new state machine and preserves upload coverage.
- Modify: `tests/fixtures/english-devtools-test-cases.json`
  - Updates `ENG-DICT-001` expected text and steps to reflect the new flow.
- Modify: `scripts/devtools-english-e2e.js`
  - Updates the English E2E assertions to start the dictation and advance via “OK / 好了 / 下一个”.
- Optional Modify: `docs/subject-design/english/README.md`
  - Link to the new design doc if the implementation branch also updates docs index.

---

### Task 1: Page-Flow Tests For Ready And Running Phases

**Files:**
- Modify: `tests/page-flows.test.js`
- Read: `miniprogram/pages/english-dictation/english-dictation.js`

**Interfaces:**
- Consumes: existing `loadPage`, `createWxMock`, and current `english-dictation` page methods.
- Produces: failing tests that define `dictationPhase`, `playbackState`, `onStartTap()`, and command-driven advancement.

- [ ] **Step 1: Add a failing test for the ready phase showing 20 words**

Add this test near the existing English dictation page tests:

```js
test('English dictation page starts in ready phase with a 20-word preview list', async () => {
  const cloud = {
    generateEnglishPaperDictationSession: async () => ({
      sessionId: 'paper-session-1',
      functionType: 'spelling',
      wordItems: Array.from({ length: 20 }, (_, index) => ({
        queueKey: `word-${index + 1}:0`,
        wordId: `word-${index + 1}`,
        word: `word${index + 1}`,
        meanings: [`词义${index + 1}`],
        unit: `Unit ${Math.floor(index / 5) + 1}`,
        promptType: index % 2 === 0 ? 'chinese' : 'english',
        spellingStatus: index % 3 === 0 ? 'needs_practice' : 'untested'
      }))
    })
  }
  const { page } = loadPage('miniprogram/pages/english-dictation/english-dictation.js', {
    wx: createWxMock(),
    modules: { '../../utils/cloud': cloud }
  })

  await page.onLoad({ studentId: 'student-1', studentName: encodeURIComponent('钟青羽'), grade: '6' })

  assert.equal(page.data.dictationPhase, 'ready')
  assert.equal(page.data.playbackState, 'idle')
  assert.equal(page.data.queue.length, 20)
  assert.equal(page.data.wordListExpanded, true)
  assert.match(page.data.commandHint, /开始/)
  assert.equal(page.data.queue[0].word, 'word1')
  assert.equal(page.data.queue[0].meaningText, '词义1')
})
```

- [ ] **Step 2: Add a failing test for start, auto-play, and voice advancement**

Add this second test near the same group:

```js
test('English dictation page auto-plays after start and advances on OK style commands', async () => {
  const spoken = []
  const timers = []
  const wx = createWxMock({
    createInnerAudioContext: () => ({
      src: '',
      play: () => {},
      stop: () => {},
      destroy: () => {}
    }),
    setTimeout: (fn, ms) => {
      timers.push({ fn, ms })
      return timers.length
    },
    clearTimeout: () => {}
  })
  const cloud = {
    generateEnglishPaperDictationSession: async () => ({
      sessionId: 'paper-session-1',
      functionType: 'spelling',
      wordItems: [
        { queueKey: 'word-1:0', wordId: 'word-1', word: 'science', meanings: ['科学'], promptType: 'chinese' },
        { queueKey: 'word-2:0', wordId: 'word-2', word: 'museum', meanings: ['博物馆'], promptType: 'english' }
      ]
    })
  }
  const { page } = loadPage('miniprogram/pages/english-dictation/english-dictation.js', {
    wx,
    requirePlugin: () => ({
      getRecordRecognitionManager: () => ({ onStop: () => {}, onError: () => {}, start: () => {}, stop: () => {} }),
      textToSpeech: options => {
        spoken.push({ lang: options.lang, content: options.content })
        options.success({ filename: '/tmp/prompt.mp3' })
      }
    }),
    modules: { '../../utils/cloud': cloud }
  })

  await page.onLoad({ studentId: 'student-1' })
  page.onStartTap()

  assert.equal(page.data.dictationPhase, 'running')
  assert.equal(page.data.playbackState, 'writing')
  assert.equal(page.data.wordListExpanded, false)
  assert.deepEqual(spoken[0], { lang: 'zh_CN', content: '科学' })
  assert.equal(timers[0].ms, 7000)

  timers[0].fn()
  assert.equal(page.data.playbackState, 'waitingCommand')
  assert.match(page.data.commandHint, /好了/)

  page.handleVoiceNextCommand('OK')
  assert.equal(page.data.currentIndex, 1)
  assert.equal(page.data.dictationPhase, 'running')
  assert.deepEqual(spoken[1], { lang: 'en_US', content: 'museum' })
})
```

- [ ] **Step 3: Run the focused tests and confirm they fail**

Run:

```bash
node --test --test-name-pattern="English dictation page" tests/page-flows.test.js
```

Expected: FAIL because `dictationPhase`, `playbackState`, `wordListExpanded`, and `onStartTap` do not exist or do not behave as specified.

---

### Task 2: Implement Dictation State Machine In Page JS

**Files:**
- Modify: `miniprogram/pages/english-dictation/english-dictation.js`
- Test: `tests/page-flows.test.js`

**Interfaces:**
- Consumes: current `withDisplayFields`, `stopPromptAudio`, WechatSI `textToSpeech`, existing upload methods.
- Produces:
  - `onStartTap(): void`
  - `startDictation(): void`
  - `playCurrentPrompt(): void`
  - `enterWritingWait(): void`
  - `enterWaitingCommand(): void`
  - `advanceToNextWord(): void`
  - extended `handleVoiceNextCommand(text: string): void`

- [ ] **Step 1: Add state fields to page data**

In `data`, add:

```js
dictationPhase: 'ready',
playbackState: 'idle',
writingWaitSeconds: 7,
writingCountdown: 0,
commandHint: '点击开始听写，或说“开始”。',
wordListExpanded: true,
uploadProgress: ''
```

- [ ] **Step 2: Reset these fields when a session is generated**

In `generateSession()`, when `queue` is set, also set:

```js
dictationPhase: 'ready',
playbackState: 'idle',
writingCountdown: 0,
commandHint: queue.length > 0 ? '点击开始听写，或说“开始”。' : '',
wordListExpanded: true
```

- [ ] **Step 3: Add start and playback methods**

Add these methods to the page object:

```js
onStartTap() {
  this.startDictation()
},

startDictation() {
  if (!this.data.queue.length || this.data.dictationPhase === 'running') return
  this.setData({
    dictationPhase: 'running',
    playbackState: 'speaking',
    currentIndex: this.data.currentIndex || 0,
    currentItem: this.data.queue[this.data.currentIndex || 0] || null,
    wordListExpanded: false,
    commandHint: '正在播放提示。'
  })
  this.playCurrentPrompt()
},

playCurrentPrompt() {
  const current = this.data.currentItem
  if (!current) return
  this.stopPromptAudio()
  this.setData({
    playbackState: 'speaking',
    commandHint: '正在播放提示。'
  })
  const content = current.promptType === 'english' ? current.word : current.meaningText
  const lang = current.promptType === 'english' ? 'en_US' : 'zh_CN'
  if (!this._voicePlugin || !this._voicePlugin.textToSpeech || !content) {
    this.enterWritingWait()
    return
  }
  this._voicePlugin.textToSpeech({
    lang,
    tts: true,
    content,
    success: res => {
      if (res && res.filename) {
        const audio = wx.createInnerAudioContext()
        audio.src = res.filename
        this._promptAudio = audio
        audio.play()
      }
      this.enterWritingWait()
    },
    fail: () => {
      wx.showToast({ title: '播放失败，请直接看提示', icon: 'none' })
      this.enterWritingWait()
    }
  })
},

enterWritingWait() {
  this.clearWritingTimer()
  this.setData({
    playbackState: 'writing',
    writingCountdown: this.data.writingWaitSeconds,
    commandHint: `请书写，约 ${this.data.writingWaitSeconds} 秒后说“好了”。`
  })
  this._writingTimer = (wx.setTimeout || setTimeout)(() => {
    this.enterWaitingCommand()
  }, this.data.writingWaitSeconds * 1000)
},

enterWaitingCommand() {
  this.clearWritingTimer()
  this.setData({
    playbackState: 'waitingCommand',
    writingCountdown: 0,
    commandHint: '写好了就说“好了”“OK”或“下一个”。'
  })
},

clearWritingTimer() {
  if (!this._writingTimer) return
  const clear = wx.clearTimeout || clearTimeout
  clear(this._writingTimer)
  this._writingTimer = null
}
```

- [ ] **Step 4: Add advancement and finish behavior**

Add:

```js
advanceToNextWord() {
  if (!this.data.queue.length) return
  const isLast = this.data.currentIndex + 1 >= this.data.queue.length
  if (isLast) {
    this.clearWritingTimer()
    this.setData({
      dictationPhase: 'finished',
      playbackState: 'idle',
      commandHint: '本轮听写已完成，请拍照上传听写纸。',
      wordListExpanded: false
    })
    return
  }
  const nextIndex = this.data.currentIndex + 1
  this.setData({
    currentIndex: nextIndex,
    currentItem: this.data.queue[nextIndex] || null,
    dictationPhase: 'running',
    playbackState: 'speaking',
    commandHint: '正在播放下一题。'
  })
  this.playCurrentPrompt()
}
```

Update `onNextTap()` to:

```js
onNextTap() {
  if (this.data.dictationPhase === 'running') {
    this.advanceToNextWord()
    return
  }
  const nextIndex = Math.min(this.data.queue.length - 1, this.data.currentIndex + 1)
  this.setData({
    currentIndex: nextIndex,
    currentItem: this.data.queue[nextIndex] || null
  })
}
```

- [ ] **Step 5: Extend voice command parsing**

Replace `handleVoiceNextCommand` with:

```js
handleVoiceNextCommand(text = '') {
  const command = String(text || '').trim()
  if (!command) return
  if (/开始|start/i.test(command) && this.data.dictationPhase === 'ready') {
    this.startDictation()
    return
  }
  if (/重读|再读|repeat/i.test(command) && this.data.dictationPhase === 'running') {
    this.playCurrentPrompt()
    return
  }
  if (/暂停|停一下|pause/i.test(command) && this.data.dictationPhase === 'running') {
    this.clearWritingTimer()
    this.setData({ dictationPhase: 'paused', playbackState: 'idle', commandHint: '已暂停，点击继续或说“继续”。' })
    return
  }
  if (/继续|resume/i.test(command) && this.data.dictationPhase === 'paused') {
    this.setData({ dictationPhase: 'running' })
    this.playCurrentPrompt()
    return
  }
  if (/ok|okay|下一个|下一题|好了|好啦|完成|next/i.test(command)) {
    if (this.data.dictationPhase === 'ready') this.startDictation()
    else if (this.data.dictationPhase === 'running') this.advanceToNextWord()
    return
  }
  wx.showToast({ title: '没有听到有效口令', icon: 'none' })
}
```

- [ ] **Step 6: Update cleanup**

In `cleanupVoice()`, call:

```js
this.clearWritingTimer()
```

- [ ] **Step 7: Run focused tests**

Run:

```bash
node --test --test-name-pattern="English dictation page" tests/page-flows.test.js
```

Expected: PASS for the new and existing English dictation page tests.

---

### Task 3: Update WXML For Ready, Running, And Finished States

**Files:**
- Modify: `miniprogram/pages/english-dictation/english-dictation.wxml`
- Test: `tests/page-flows.test.js`

**Interfaces:**
- Consumes: `dictationPhase`, `playbackState`, `commandHint`, `wordListExpanded`, `queue`, `currentItem`.
- Produces: visible text required by page-flow and DevTools tests.

- [ ] **Step 1: Replace the main dictation body with phase-aware layout**

Inside `<view wx:else class="dictation-wrap">`, render:

```xml
<view class="ready-card" wx:if="{{dictationPhase === 'ready'}}">
  <text class="ready-title">本轮词单</text>
  <text class="ready-desc">共 {{queue.length}} 个词。准备一张纸，按题号一行一个词写英文。</text>
  <button class="primary-btn" bindtap="onStartTap">开始听写</button>
  <text class="voice-hint">{{commandHint}}</text>
  <view class="word-list">
    <view class="word-row" wx:for="{{queue}}" wx:key="queueKey">
      <text class="word-order">{{index + 1}}</text>
      <view class="word-main">
        <text class="word-en">{{item.word}}</text>
        <text class="word-cn">{{item.meaningText}}</text>
      </view>
      <text class="word-meta">{{item.unit || '未分单元'}}</text>
    </view>
  </view>
</view>
```

- [ ] **Step 2: Add the running prompt panel**

Render this when `dictationPhase === 'running' || dictationPhase === 'paused'`:

```xml
<view class="progress-card" wx:elif="{{dictationPhase === 'running' || dictationPhase === 'paused'}}">
  <text class="progress-label">纸面听写进行中</text>
  <text class="progress-value">第 {{currentIndex + 1}} / {{queue.length}} 题</text>
</view>

<view class="prompt-card" wx:if="{{dictationPhase === 'running' || dictationPhase === 'paused'}}">
  <view class="prompt-top">
    <text class="prompt-pill">{{currentItem.promptTypeText}}</text>
    <text class="state-pill state-{{playbackState}}">{{playbackState}}</text>
  </view>
  <text class="prompt-title" wx:if="{{currentItem.promptType === 'chinese'}}">{{currentItem.meaningText}}</text>
  <text class="prompt-title" wx:else>请听英文发音，并在纸上写出这个单词</text>
  <text class="prompt-desc">{{paperInstruction}}</text>
  <text class="command-hint">{{commandHint}}</text>
</view>

<view class="nav-row" wx:if="{{dictationPhase === 'running' || dictationPhase === 'paused'}}">
  <button class="secondary-btn" bindtap="onPlayPromptTap">重读</button>
  <button class="secondary-btn" bindtap="onNextTap">下一个</button>
  <button class="secondary-btn voice-next-btn" bindtap="onVoiceNextTap">{{recordingCommand ? '停止语音' : '说“好了”'}}</button>
</view>
```

- [ ] **Step 3: Add the finished upload panel**

Render upload when `dictationPhase === 'finished' || dictationPhase === 'reviewed' || uploadedPhotoCount > 0`:

```xml
<view class="upload-card" wx:if="{{dictationPhase === 'finished' || dictationPhase === 'reviewed' || uploadedPhotoCount > 0}}">
  <text class="upload-title">完成后上传听写纸</text>
  <text class="upload-desc">本轮 {{queue.length}} 个词已报完。上传后会进行 AI 批改，并把逐词拼写结果写入本次听写记录。</text>
  <button class="primary-btn" loading="{{uploading}}" bindtap="onChoosePhotoTap">拍照上传</button>
  <text class="upload-progress" wx:if="{{uploadProgress}}">{{uploadProgress}}</text>
  <text class="upload-status" wx:if="{{uploadedPhotoCount > 0}}">
    <block wx:if="{{analysisStatus === 'completed'}}">已批改</block>
    <block wx:elif="{{analysisStatus}}">批改中</block>
    <block wx:else>已上传</block>
    · {{uploadedPhotoCount}} 张听写纸
  </text>
</view>
```

- [ ] **Step 4: Run page-flow tests**

Run:

```bash
node --test --test-name-pattern="English dictation page" tests/page-flows.test.js
```

Expected: PASS.

---

### Task 4: Style The New Dictation Flow

**Files:**
- Modify: `miniprogram/pages/english-dictation/english-dictation.wxss`

**Interfaces:**
- Consumes: class names from Task 3.
- Produces: readable high-density mobile layout for ready/running/finished phases.

- [ ] **Step 1: Add ready word list styles**

Append:

```css
.ready-card {
  padding: 30rpx;
  border-radius: 18rpx;
  background: #fff;
  box-shadow: 0 4rpx 18rpx rgba(15, 23, 42, .06);
}

.ready-title {
  display: block;
  color: #25364a;
  font-size: 32rpx;
  font-weight: 800;
}

.ready-desc,
.command-hint {
  display: block;
  color: #64748b;
  font-size: 24rpx;
  line-height: 1.5;
  margin-top: 8rpx;
}

.word-list {
  margin-top: 24rpx;
  display: flex;
  flex-direction: column;
  gap: 12rpx;
}

.word-row {
  display: grid;
  grid-template-columns: 48rpx 1fr auto;
  gap: 14rpx;
  align-items: center;
  padding: 16rpx;
  border-radius: 14rpx;
  background: #f8fafc;
  border: 1rpx solid #e2e8f0;
}

.word-order {
  width: 44rpx;
  height: 44rpx;
  line-height: 44rpx;
  border-radius: 999rpx;
  text-align: center;
  background: #fff7ed;
  color: #9c4f24;
  font-weight: 800;
  font-size: 22rpx;
}

.word-main {
  min-width: 0;
}

.word-en {
  display: block;
  color: #1f2937;
  font-size: 28rpx;
  font-weight: 800;
}

.word-cn,
.word-meta {
  color: #64748b;
  font-size: 22rpx;
  line-height: 1.4;
}
```

- [ ] **Step 2: Add playback state pill styles**

Append:

```css
.state-pill {
  padding: 8rpx 14rpx;
  border-radius: 999rpx;
  font-size: 21rpx;
  font-weight: 750;
  background: #e2e8f0;
  color: #475569;
}

.state-speaking {
  background: #dbeafe;
  color: #1d4ed8;
}

.state-writing {
  background: #fef3c7;
  color: #b45309;
}

.state-waitingCommand {
  background: #dcfce7;
  color: #15803d;
}
```

- [ ] **Step 3: Run JS check**

Run:

```bash
npm run check
```

Expected: PASS.

---

### Task 5: Preserve Upload And Mark Reviewed Phase

**Files:**
- Modify: `miniprogram/pages/english-dictation/english-dictation.js`
- Test: `tests/page-flows.test.js`

**Interfaces:**
- Consumes: existing `uploadDictationPhotos()` behavior.
- Produces: `dictationPhase = reviewed` after completed analysis.

- [ ] **Step 1: Extend the existing upload test assertion**

In `English dictation page creates a paper session and uploads answer photos`, after upload assertions add:

```js
assert.equal(page.data.dictationPhase, 'reviewed')
```

- [ ] **Step 2: Run the focused test and confirm it fails**

Run:

```bash
node --test --test-name-pattern="creates a paper session and uploads answer photos" tests/page-flows.test.js
```

Expected: FAIL because upload currently does not set `dictationPhase`.

- [ ] **Step 3: Set reviewed phase after completed analysis**

In `uploadDictationPhotos()`, after `analyzeEnglishDictationPhoto` succeeds, include:

```js
dictationPhase: 'reviewed'
```

If analysis is not available and the photo is only submitted, set:

```js
dictationPhase: 'finished'
```

- [ ] **Step 4: Run focused tests**

Run:

```bash
node --test --test-name-pattern="English dictation page" tests/page-flows.test.js
```

Expected: PASS.

---

### Task 6: Update English DevTools E2E Case Fixture

**Files:**
- Modify: `tests/fixtures/english-devtools-test-cases.json`
- Test: `tests/english-devtools-cases.test.js`

**Interfaces:**
- Consumes: English E2E case schema.
- Produces: updated `ENG-DICT-001` describing the new interaction.

- [ ] **Step 1: Update `ENG-DICT-001.expectedTexts`**

Replace the current dictation expected texts with:

```json
["纸面听写", "本轮词单", "开始听写", "准备一张纸", "第 1 / 20 题", "说“好了”", "拍照上传"]
```

- [ ] **Step 2: Update `ENG-DICT-001.steps`**

Use:

```json
[
  { "action": "callMethod", "target": "onStartTap", "args": [] },
  { "action": "callMethod", "target": "handleVoiceNextCommand", "args": ["OK"] },
  { "action": "tapText", "selector": "button", "target": "拍照上传" }
]
```

- [ ] **Step 3: Update `ENG-DICT-001.dataAssertions`**

Use:

```json
[
  "dictationPhase starts ready and becomes running",
  "currentIndex advances to 1 after OK",
  "dictationUploads.length=1",
  "analysisStatus=completed",
  "dictationResults.length=2"
]
```

- [ ] **Step 4: Run fixture validation**

Run:

```bash
node --test tests/english-devtools-cases.test.js
```

Expected: PASS.

---

### Task 7: Update DevTools English E2E Script

**Files:**
- Modify: `scripts/devtools-english-e2e.js`

**Interfaces:**
- Consumes: updated page methods from Task 2 and case fixture from Task 6.
- Produces: E2E script that starts dictation before advancing and upload checks.

- [ ] **Step 1: Locate dictation case execution**

Find the section that currently calls:

```js
await page.callMethod('handleVoiceNextCommand', '好了，下一个')
```

- [ ] **Step 2: Start dictation before voice advancement**

Change the sequence to:

```js
await page.callMethod('onStartTap')
await page.callMethod('handleVoiceNextCommand', 'OK')
```

- [ ] **Step 3: Update visible text assertions**

Require the page text to include:

```js
assert(text.includes('本轮词单'), 'paper dictation should show the preview list before start')
assert(text.includes('开始听写'), 'paper dictation should expose a start action')
```

After `onStartTap`, assert the page state:

```js
const runningState = await page.data()
assert(runningState.dictationPhase === 'running', 'paper dictation should enter running phase after start')
assert(runningState.currentIndex === 1, 'paper dictation should advance after OK command')
```

- [ ] **Step 4: Run static check**

Run:

```bash
npm run check
```

Expected: PASS.

---

### Task 8: Optional Docs Index Update

**Files:**
- Optional Modify: `docs/subject-design/english/README.md`

**Interfaces:**
- Consumes: new design doc.
- Produces: discoverable docs index.

- [ ] **Step 1: Add a link to the new design document**

Add one bullet:

```markdown
- [纸面听写语音节奏交互设计](./钟青羽英语纸面听写语音节奏交互设计.md)：定义“20 词预览 → 开始听写 → 自动报题 → 口令推进 → 拍照批改”的页面状态机和验收标准。
```

- [ ] **Step 2: Run a quick docs grep**

Run:

```bash
rg -n "纸面听写语音节奏交互设计|开始听写|waitingCommand" docs/subject-design/english
```

Expected: the new design doc and README entry are discoverable.

---

### Task 9: Full Verification

**Files:**
- Verify only.

**Interfaces:**
- Consumes: all tasks above.
- Produces: evidence that the flow works and no adjacent English features regressed.

- [ ] **Step 1: Run focused page-flow tests**

Run:

```bash
node --test --test-name-pattern="English dictation page" tests/page-flows.test.js
```

Expected: PASS.

- [ ] **Step 2: Run English fixture validation**

Run:

```bash
node --test tests/english-devtools-cases.test.js
```

Expected: PASS.

- [ ] **Step 3: Run English vocabulary tests**

Run:

```bash
node --test tests/english-vocabulary.test.js tests/english-vocabulary-cloud.test.js
```

Expected: PASS.

- [ ] **Step 4: Run project checks**

Run:

```bash
npm run check
npm test
```

Expected: both PASS.

- [ ] **Step 5: Inspect diff**

Run:

```bash
git diff -- miniprogram/pages/english-dictation/english-dictation.js miniprogram/pages/english-dictation/english-dictation.wxml miniprogram/pages/english-dictation/english-dictation.wxss tests/page-flows.test.js tests/fixtures/english-devtools-test-cases.json scripts/devtools-english-e2e.js docs/subject-design/english
```

Expected: diff only touches the English paper dictation interaction, related tests, and docs.

---

## Self-Review Notes

- Spec coverage: ready preview, start action, automatic prompt playback, 7-second writing wait, OK/好了/下一个 advancement, finished upload, OCR preservation, and tests are all mapped to tasks.
- Placeholder scan: no unfinished markers or unspecified implementation steps remain.
- Type consistency: plan uses `dictationPhase`, `playbackState`, `wordListExpanded`, `commandHint`, `onStartTap`, `startDictation`, `playCurrentPrompt`, `enterWritingWait`, `enterWaitingCommand`, and `advanceToNextWord` consistently across tasks.

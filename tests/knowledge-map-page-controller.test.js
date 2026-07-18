// 页面控制器级验收测试：知识地图外显化（不依赖 DevTools）
//
// 用 page-harness 在 vm 沙箱里加载 knowledge-map.js 和 student-profile.js，
// 注入 mock 的 cloud API，验证：
//   1. knowledge-map.onBottleneckTap 点击后调用 cloud.generateLearningResourcePack 并跳转 learning-resource
//      （关键：跳的是 learning-resource，不是 bottleneck-detail）
//   2. knowledge-map.onBottleneckTap 传给云函数的 target 带 bottleneckId 和 nodeId
//   3. knowledge-map 空状态 onUploadTap 跳 upload 页
//   4. student-profile 的 onKnowledgeMapTap 跳 knowledge-map 页（带 studentId+subject=math）
//
// 这是 L2.5 层测试：比 L0 单测更接近真实交互（驱动页面生命周期），
// 但不需要 DevTools 环境，所以 CI 友好。

const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const { loadPage } = require('./helpers/page-harness')
const ROOT = path.resolve(__dirname, '..')

test('knowledge map uses text domain markers and keeps explanation generation wired', () => {
  const wxml = fs.readFileSync(path.join(ROOT, 'miniprogram/pages/knowledge-map/knowledge-map.wxml'), 'utf8')
  const wxss = fs.readFileSync(path.join(ROOT, 'miniprogram/pages/knowledge-map/knowledge-map.wxss'), 'utf8')

  assert.match(wxml, /class="domain-marker"/)
  assert.match(wxml, /(?:bindtap|catchtap)="onBottleneckTap"/)
  assert.match(wxss, /\.b1-subject-math/)
})

test('knowledge-map 置顶摘要行不重复渲染 domain 列表中的同一卡点（密度契约）', () => {
  const wxml = fs.readFileSync(path.join(ROOT, 'miniprogram/pages/knowledge-map/knowledge-map.wxml'), 'utf8')
  const wxss = fs.readFileSync(path.join(ROOT, 'miniprogram/pages/knowledge-map/knowledge-map.wxss'), 'utf8')

  // 同一卡点全页只完整渲染一次：置顶区降级为"最优先：卡点名 ›"轻量摘要行，
  // 点击锚到 domain 条目（onPriorityAnchorTap + id="bn-lpCode"），不再整条渲染第二遍
  assert.match(wxml, /class="priority-row"/)
  assert.match(wxml, /catchtap="onPriorityAnchorTap"[\s\S]*?data-lp-code="\{\{view\.priorityBottleneck\.lpCode\}\}"/)
  assert.match(wxml, /id="bn-\{\{b\.lpCode\}\}"/)
  assert.equal((wxml.match(/view\.priorityBottleneck\.displayName/g) || []).length, 1, '优先卡点名只允许出现一次（摘要行）')
  assert.doesNotMatch(wxml, /priority-card|priority-badge|priority-symptom|priority-action/, '整条重复的 priority 卡已删除')
  assert.doesNotMatch(wxss, /\.priority-card|\.priority-badge|\.priority-symptom|\.priority-action/)

  // 留白预算：bn 条目上下 ≤12rpx、domain header ≤18rpx；掌握度色带与置信度标签保留
  assert.match(wxss, /\.bn-item \{[^}]*padding:\s*(?:[1-9]|1[0-2])rpx\s+(?:[1-9]|1[0-8])rpx/)
  assert.match(wxss, /\.domain-header \{[^}]*padding:\s*(?:[1-9]|1[0-8])rpx\b/)
  assert.match(wxml, /domain-mastery/)
  assert.match(wxml, /bn-confidence \{\{b\.confidenceLevel\}\}/)
})

async function flushAsync(turns = 4) {
  for (let i = 0; i < turns; i += 1) {
    await Promise.resolve()
  }
}

async function loadPageAndWait(page, options = {}) {
  const result = page.onLoad(options)
  if (result && typeof result.then === 'function') {
    await result
  }
  if (page._loadPromise) {
    await page._loadPromise
  }
}

async function waitForPageLoad(page) {
  if (page._loadPromise) {
    await page._loadPromise
    return
  }
  await flushAsync()
}

function buildCloudMock(generatePackResult) {
  return {
    getSubjectProfile: async () => ({
      currentBottlenecks: [{
        lpCode: 'LP-FD', lpName: '小数运算', subject: 'math', status: 'persisting',
        candidateBottlenecks: [
          { bottleneckId: 'BN-DEC-MUL-POINT', title: '积的小数位数判断错误', nodeId: 'MATH-NUM-DEC-MUL-POINT', evidenceStrength: 'high' }
        ]
      }]
    }),
    generateLearningResourcePack: async (payload) => generatePackResult || {
      success: true,
      packId: 'pack-mock-123',
      pack: { _id: 'pack-mock-123', title: '小数乘法讲解' }
    }
  }
}

function loadKnowledgeMapPage(cloudMock) {
  // 不传 overrides —— createWxMock 默认会用 record() 记录所有 wx 调用到 wx.calls
  // 否则一旦传 showLoading: () => {} 会把 record 替换掉，wx.calls 永远空
  const { page, wx } = loadPage('miniprogram/pages/knowledge-map/knowledge-map.js', {
    modules: {
      '../../utils/cloud': cloudMock
    }
  })
  return { page, wx }
}

function loadStudentProfilePage() {
  // 不传 overrides，用默认 record mock
  const { page, wx } = loadPage('miniprogram/pages/student-profile/student-profile.js', {
    modules: {
      '../../utils/cloud': { getStudentDashboard: async () => ({ student: { _id: 's1', name: '钟青羽' }, permissions: {}, subjectProfiles: [], recentReports: [], recentPapers: [] }) },
      '../../utils/util': { formatRelativeTime: () => '刚刚' },
      '../../utils/shared-navigation': {}
    }
  })
  return { page, wx }
}

// ============================================================
// 1. knowledge-map.onBottleneckTap 直跳 learning-resource
// ============================================================

test('knowledge-map 点击卡点直跳 learning-resource（不经过 bottleneck-detail）', async () => {
  const cloudMock = buildCloudMock()
  const { page, wx } = loadKnowledgeMapPage(cloudMock)

  // 模拟 onLoad 设置 studentId
  page.onLoad({ studentId: 'student-1', studentName: '钟青羽', subject: 'math' })
  await waitForPageLoad(page)

  // 构造 dataset 模拟 wxml 传过来的数据
  const fakeEvent = {
    currentTarget: {
      dataset: {
        lpCode: 'LP-FD',
        lpName: '积的小数位数判断错误',
        bottleneckId: 'BN-DEC-MUL-POINT',
        nodeId: 'MATH-NUM-DEC-MUL-POINT'
      }
    }
  }

  await page.onBottleneckTap(fakeEvent)

  // 断言：wx.navigateTo 被调用，且 URL 是 learning-resource（不是 bottleneck-detail）
  const navCall = wx.calls.find(c => c.name === 'navigateTo')
  assert.ok(navCall, '必须调用 wx.navigateTo')
  const url = navCall.payload.url || ''
  assert.match(url, /learning-resource/, '必须跳 learning-resource 页')
  assert.ok(!/bottleneck-detail/.test(url), '不应跳 bottleneck-detail（应跳过中间页）')
  assert.match(url, /packId=pack-mock-123/, 'URL 必须带 packId')
})

test('knowledge-map.onBottleneckTap 把 bottleneckId 和 nodeId 透传给云函数', async () => {
  let capturedPayload = null
  const cloudMock = {
    getSubjectProfile: async () => ({ currentBottlenecks: [] }),
    generateLearningResourcePack: async (payload) => {
      capturedPayload = payload
      return { success: true, packId: 'p1', pack: { _id: 'p1' } }
    }
  }
  const { page, wx } = loadKnowledgeMapPage(cloudMock)
  page.onLoad({ studentId: 's1', subject: 'math' })
  await waitForPageLoad(page)

  await page.onBottleneckTap({
    currentTarget: {
      dataset: {
        lpCode: 'LP-X', lpName: '卡点名', bottleneckId: 'BN-XYZ', nodeId: 'NODE-123'
      }
    }
  })

  assert.ok(capturedPayload, '云函数必须被调用')
  assert.equal(capturedPayload.studentId, 's1')
  assert.equal(capturedPayload.subject, 'math')
  assert.equal(capturedPayload.target.bottleneckId, 'BN-XYZ', 'bottleneckId 必须透传')
  assert.equal(capturedPayload.target.nodeId, 'NODE-123', 'nodeId 必须透传')
  assert.equal(capturedPayload.target.lpCode, 'LP-X', 'lpCode 必须透传')
})

test('knowledge-map.onBottleneckTap 失败时显示 toast 而不崩溃', async () => {
  const cloudMock = {
    getSubjectProfile: async () => ({ currentBottlenecks: [] }),
    generateLearningResourcePack: async () => { throw new Error('云函数挂了') }
  }
  const { page, wx } = loadKnowledgeMapPage(cloudMock)
  page.onLoad({ studentId: 's1', subject: 'math' })
  await waitForPageLoad(page)

  // 不应抛错
  await page.onBottleneckTap({
    currentTarget: { dataset: { lpCode: 'LP-X', lpName: 'X', bottleneckId: 'BN-X', nodeId: 'N-X' } }
  })

  const toastCall = wx.calls.find(c => c.name === 'showToast')
  assert.ok(toastCall, '失败时应弹 toast')
  assert.equal(toastCall.payload.title, '讲解生成失败，请稍后重试')
  // 不应跳转
  const navCall = wx.calls.find(c => c.name === 'navigateTo')
  assert.ok(!navCall, '失败时不应跳转')
})

test('knowledge-map load error hides backend details and preserves route state', async () => {
  const { page } = loadKnowledgeMapPage({
    getSubjectProfile: async () => {
      throw new Error('失败 BN-ERROR-01 cloud://env/file')
    }
  })
  page.setData({ studentId: 'student-route-id', subject: 'math' })

  await page.loadData()

  assert.equal(page.data.errorText, '加载失败，请稍后重试')
  assert.equal(page.data.studentId, 'student-route-id')
})

test('learning-resource load error hides backend details and preserves pack route id', async () => {
  const { page } = loadPage('miniprogram/pages/learning-resource/learning-resource.js', {
    modules: {
      '../../utils/cloud': {
        getLearningResourcePack: async () => ({
          success: false,
          error: '失败 BN-ERROR-01 cloud://env/file'
        })
      }
    }
  })
  page.setData({ packId: '665f8c1a2b3c4d5e6f708192' })

  await page.loadPack()

  assert.equal(page.data.errorText, '学习任务包加载失败，请稍后重试')
  assert.equal(page.data.packId, '665f8c1a2b3c4d5e6f708192')
})

// ============================================================
// 2. knowledge-map 空状态：onUploadTap 跳 upload
// ============================================================

test('knowledge-map.onUploadTap 跳 upload 页（带 studentId 和 subject）', async () => {
  const cloudMock = { getSubjectProfile: async () => ({}), generateLearningResourcePack: async () => ({ success: false }) }
  const { page, wx } = loadKnowledgeMapPage(cloudMock)
  page.onLoad({ studentId: 's1', studentName: '钟青羽', subject: 'math' })
  await waitForPageLoad(page)

  await page.onUploadTap()

  const navCall = wx.calls.find(c => c.name === 'navigateTo')
  assert.ok(navCall)
  assert.match(navCall.payload.url, /\/pages\/upload\/upload/)
  assert.match(navCall.payload.url, /studentId=s1/)
  assert.match(navCall.payload.url, /subject=math/)
})

// ============================================================
// 3. student-profile.onKnowledgeMapTap 跳 knowledge-map
// ============================================================

test('student-profile.onKnowledgeMapTap 跳 knowledge-map（带 studentId 和 subject=math）', async () => {
  const { page, wx } = loadStudentProfilePage()
  // 模拟 loadProfile 后 home 数据已设置
  page.data.home = { studentId: 's1', studentName: '钟青羽' }

  await page.onKnowledgeMapTap()

  const navCall = wx.calls.find(c => c.name === 'navigateTo')
  assert.ok(navCall, '必须调用 navigateTo')
  assert.match(navCall.payload.url, /\/pages\/knowledge-map\/knowledge-map/)
  assert.match(navCall.payload.url, /studentId=s1/)
  assert.match(navCall.payload.url, /subject=math/)
})

test('student-profile.onKnowledgeMapTap 在 home 未加载时弹 toast 不跳转', async () => {
  const { page, wx } = loadStudentProfilePage()
  // home 为 null（未加载）
  page.data.home = null

  await page.onKnowledgeMapTap()

  const toastCall = wx.calls.find(c => c.name === 'showToast')
  assert.ok(toastCall, 'home 缺失时应弹提示')
  const navCall = wx.calls.find(c => c.name === 'navigateTo')
  assert.ok(!navCall, 'home 缺失时不应跳转')
})

// ============================================================
// 4. 防重复点击：generatingLpCode 标记
// ============================================================

test('knowledge-map.onBottleneckTap 防重复点击（第二次点击直接 return）', async () => {
  let callCount = 0
  const cloudMock = {
    getSubjectProfile: async () => ({ currentBottlenecks: [] }),
    generateLearningResourcePack: async () => {
      callCount++
      // 模拟慢响应
      await new Promise(r => setTimeout(r, 10))
      return { success: true, packId: 'p1', pack: { _id: 'p1' } }
    }
  }
  const { page } = loadKnowledgeMapPage(cloudMock)
  page.onLoad({ studentId: 's1', subject: 'math' })
  await waitForPageLoad(page)

  const fakeEvent = {
    currentTarget: { dataset: { lpCode: 'LP-X', lpName: 'X', bottleneckId: 'BN-X', nodeId: 'N-X' } }
  }

  // 并发点击两次（第二次应被 generatingLpCode 拦截）
  await Promise.all([
    page.onBottleneckTap(fakeEvent),
    page.onBottleneckTap(fakeEvent)
  ])

  assert.equal(callCount, 1, '云函数应只被调用 1 次（防重复）')
})

// ============================================================
// 5. learning-resource 页：onPracticeToggle 展开答案
// ============================================================

function loadLearningResourcePage(packData) {
  const { page, wx } = loadPage('miniprogram/pages/learning-resource/learning-resource.js', {
    modules: {
      '../../utils/cloud': {
        getLearningResourcePack: async () => ({ success: true, pack: packData }),
        completeLearningResourcePack: async () => ({ success: true }),
        scheduleResourcePackVerification: async () => ({ success: true }),
      }
    }
  })
  return { page, wx }
}

test('learning-resource 练习题答案默认折叠（revealed=false）', async () => {
  const { page } = loadLearningResourcePage({
    _id: 'pack-1', title: '小数乘法', status: 'ready',
    blocks: [{
      type: 'practice', title: '练三道',
      questions: [{ questionId: 'P01', question: '2.4×1.5=', answer: '3.6', explanation: '关键' }]
    }]
  })
  await loadPageAndWait(page, { packId: 'pack-1' })
  // onLoad 不 await loadPack，需要等一个微任务让 async loadPack 完成
  await new Promise(r => setTimeout(r, 10))
  assert.ok(page.data.view, 'view 必须加载完成')
  const q = page.data.view.practiceBlock.questions[0]
  assert.equal(q.revealed, false, '答案默认必须折叠')
})

test('learning-resource onPracticeToggle 点击后展开答案（revealed=true）', async () => {
  const { page } = loadLearningResourcePage({
    _id: 'pack-1', title: '小数乘法', status: 'ready',
    blocks: [{
      type: 'practice', title: '练三道',
      questions: [{ questionId: 'P01', question: '2.4×1.5=', answer: '3.6', explanation: '关键' }]
    }]
  })
  await loadPageAndWait(page, { packId: 'pack-1' })
  await new Promise(r => setTimeout(r, 10))

  // 点击展开
  await page.onPracticeToggle({ currentTarget: { dataset: { questionId: 'P01' } } })
  assert.equal(page.data.view.practiceBlock.questions[0].revealed, true, '点击后 revealed 应为 true')

  // 再点击收起
  await page.onPracticeToggle({ currentTarget: { dataset: { questionId: 'P01' } } })
  assert.equal(page.data.view.practiceBlock.questions[0].revealed, false, '再点击 revealed 应回到 false')
})

test('learning-resource onPracticeToggle 只切换目标题目，不影响其他题', async () => {
  const { page } = loadLearningResourcePage({
    _id: 'pack-1', title: '小数乘法', status: 'ready',
    blocks: [{
      type: 'practice', title: '练三道',
      questions: [
        { questionId: 'P01', question: '题1', answer: '答1', explanation: '关键1' },
        { questionId: 'P02', question: '题2', answer: '答2', explanation: '关键2' },
        { questionId: 'P03', question: '题3', answer: '答3', explanation: '关键3' },
      ]
    }]
  })
  await loadPageAndWait(page, { packId: 'pack-1' })
  await new Promise(r => setTimeout(r, 10))

  // 只展开 P02
  await page.onPracticeToggle({ currentTarget: { dataset: { questionId: 'P02' } } })

  const qs = page.data.view.practiceBlock.questions
  assert.equal(qs[0].revealed, false, 'P01 不受影响')
  assert.equal(qs[1].revealed, true, 'P02 应展开')
  assert.equal(qs[2].revealed, false, 'P03 不受影响')
})

const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const vm = require('node:vm')

const ROOT = path.resolve(__dirname, '..')
const { createWxMock, loadPage } = require('./helpers/page-harness')

function read(relativePath) {
  return fs.readFileSync(path.join(ROOT, relativePath), 'utf8')
}

// 参照 tests/helpers/page-harness.js 的 vm 沙箱模式加载 Component 定义
function loadComponent(relativePath, properties = {}) {
  const filename = path.join(ROOT, relativePath)
  const source = fs.readFileSync(filename, 'utf8')
  let definition = null
  vm.runInNewContext(source, {
    Component: config => { definition = config },
    console
  }, { filename })
  if (!definition) throw new Error(`${relativePath} did not register a Component`)

  const events = []
  const propertyDefaults = Object.fromEntries(
    Object.entries(definition.properties || {}).map(([key, spec]) => [key, spec.value])
  )
  const instance = {
    ...definition.methods,
    data: {
      ...JSON.parse(JSON.stringify(definition.data || {})),
      ...propertyDefaults,
      ...properties
    },
    setData(update) {
      for (const [key, value] of Object.entries(update)) {
        this.data[key] = value
      }
    },
    triggerEvent(name, detail) {
      events.push({ name, detail })
    }
  }
  return { definition, instance, events }
}

test('status-view renders default text per state', () => {
  for (const [state, expected] of [
    ['loading', '加载中…'],
    ['empty', '暂无内容'],
    ['error', '加载失败，请稍后重试']
  ]) {
    const { definition, instance } = loadComponent('miniprogram/components/status-view/status-view.js', { state })
    definition.lifetimes.attached.call(instance)
    assert.equal(instance.data.displayText, expected)
  }
})

test('status-view prefers custom text and reacts to property changes', () => {
  const { definition, instance } = loadComponent('miniprogram/components/status-view/status-view.js', {
    state: 'error',
    text: '学习任务包加载失败，请稍后重试'
  })
  definition.lifetimes.attached.call(instance)
  assert.equal(instance.data.displayText, '学习任务包加载失败，请稍后重试')

  definition.observers['state, text'].call(instance, 'empty', '')
  assert.equal(instance.data.displayText, '暂无内容')
})

test('status-view retry tap triggers bind:retry event', () => {
  const { instance, events } = loadComponent('miniprogram/components/status-view/status-view.js', {
    state: 'error',
    retryText: '重新加载'
  })
  instance.onRetryTap()
  assert.deepEqual(events, [{ name: 'retry', detail: undefined }])
})

test('status-view component files are complete and symbol-safe', () => {
  const wxml = read('miniprogram/components/status-view/status-view.wxml')
  const json = JSON.parse(read('miniprogram/components/status-view/status-view.json'))
  assert.equal(json.component, true)
  assert.match(wxml, /state === 'error' && retryText/)
  assert.match(wxml, /bindtap="onRetryTap"/)
  assert.doesNotMatch(wxml, /(?:\p{Extended_Pictographic}|\p{Emoji_Presentation})/u)
})

test('knowledge-map / learning-resource / learning-progress / report wire status-view with retry', () => {
  const expectations = [
    ['knowledge-map/knowledge-map', 'loadData'],
    ['learning-resource/learning-resource', 'loadPack'],
    ['learning-progress/learning-progress', 'loadData']
  ]
  for (const [page, retryHandler] of expectations) {
    const config = JSON.parse(read(`miniprogram/pages/${page}.json`))
    assert.equal(config.usingComponents['status-view'], '/components/status-view/status-view', `${page} 未注册 status-view`)
    const wxml = read(`miniprogram/pages/${page}.wxml`)
    assert.match(wxml, /<status-view[^>]*state="error"/, `${page} 缺少错误态`)
    assert.match(wxml, new RegExp(`bind:retry="${retryHandler}"`), `${page} 错误态缺少重试绑定`)
  }

  // report.js 不在本次改动范围：错误块经 onTraceableUrlTap + data-url 重载本页
  const reportConfig = JSON.parse(read('miniprogram/pages/report/report.json'))
  assert.equal(reportConfig.usingComponents['status-view'], '/components/status-view/status-view')
  const reportWxml = read('miniprogram/pages/report/report.wxml')
  assert.match(reportWxml, /<status-view[^>]*state="error"/)
  assert.match(reportWxml, /bind:retry="onTraceableUrlTap"/)
  assert.match(reportWxml, /data-url="\/pages\/report\/report\?id=\{\{reportId\}\}"/)
})

test('learning-progress failure surfaces in-page error block and retry reloads', async () => {
  const wx = createWxMock()
  let calls = 0
  const cloud = {
    getLearningProgress: async () => {
      calls += 1
      if (calls === 1) throw new Error('network down')
      return {
        data: {
          timeline: [{ reportId: 'r1', createdAt: '2026-06-01T00:00:00Z', isVerification: false }],
          bottleneckMatrix: [],
          summary: { totalRounds: 1 },
          overallAdvice: ''
        }
      }
    }
  }
  const { page } = loadPage('miniprogram/pages/learning-progress/learning-progress.js', {
    wx,
    modules: { '../../utils/cloud': cloud }
  })

  page.studentId = 'student-1'
  page.subject = 'math'
  await page.loadData()
  assert.equal(page.data.errorText, '加载失败，请稍后重试')
  assert.equal(page.data.loading, false)

  // 重试（status-view 的 bind:retry="loadData"）
  await page.loadData()
  assert.equal(page.data.errorText, '')
  assert.equal(page.data.timeline.length, 1)
})

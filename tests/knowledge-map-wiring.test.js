// 静态校验：WXML↔JS 绑定一致性 + 云函数 collection 调用容错
//
// 这一组测试用纯文本扫描的方式校验：
//   - knowledge-map.wxml 里用到的 bindtap/catchtap handler 在 .js 里都有定义
//   - knowledge-map.wxml 里用到的 data-* 属性 presenter 里都有产出
//   - student-profile.wxml 里个人行动队列包含知识地图入口并走统一 URL 跳转
//   - learningResource/index.js 里所有 db.collection('learningResourcePacks') 调用都走 helper（不直接调）
//
// 这类"接线"错误编译器查不出来（小程序运行时才会暴露），用静态扫描提前发现。

const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')

const ROOT = path.join(__dirname, '..')

function read(rel) {
  return fs.readFileSync(path.join(ROOT, rel), 'utf8')
}

// ============================================================
// 1. knowledge-map：WXML 用到的 handler 在 JS 里都有定义
// ============================================================

test('knowledge-map.wxml 的所有 bindtap/catchtap handler 在 .js 中都有定义', () => {
  const wxml = read('miniprogram/pages/knowledge-map/knowledge-map.wxml')
  const js = read('miniprogram/pages/knowledge-map/knowledge-map.js')

  const handlers = new Set()
  const re = /\b(?:bindtap|catchtap)="([^"]+)"/g
  let m
  while ((m = re.exec(wxml)) !== null) handlers.add(m[1])

  const missing = []
  for (const h of handlers) {
    // 检查 JS 里是否有 "handlerName(" 或 "handlerName:" 或 "handlerName,"
    const pattern = new RegExp(`\\b${h}\\s*[(:]`)
    if (!pattern.test(js)) missing.push(h)
  }
  assert.deepEqual(missing, [], `knowledge-map.js 缺少这些 handler: ${missing.join(', ')}`)
})

test('knowledge-map.wxml 的 onBottleneckTap 用到的 data-* 属性都有产出', () => {
  const wxml = read('miniprogram/pages/knowledge-map/knowledge-map.wxml')
  const presenter = read('miniprogram/pages/knowledge-map/knowledge-map-presenter.js')

  // 提取 onBottleneckTap 元素上绑定的 data-* 属性名
  const tapBlock = wxml.match(/onBottleneckTap[\s\S]*?data-node-id="[^"]*"/g) || []
  assert.ok(tapBlock.length > 0, '至少有一个 onBottleneckTap 绑定')

  // 关键属性：data-lp-code、data-lp-name、data-bottleneck-id、data-node-id
  // presenter 必须产出对应的字段
  const requiredFields = ['lpCode', 'bottleneckId', 'nodeId', 'displayName', 'symptomText']
  const missing = requiredFields.filter(f => !new RegExp(`\\b${f}\\b`).test(presenter))
  assert.deepEqual(missing, [], `presenter 缺少这些字段: ${missing.join(', ')}`)
})

test('knowledge-map.wxml 不再使用 domain-chevron（折叠箭头应已移除）', () => {
  const wxml = read('miniprogram/pages/knowledge-map/knowledge-map.wxml')
  assert.ok(!/domain-chevron/.test(wxml), 'wxml 不应再出现 domain-chevron（已改为默认展开）')
  assert.ok(!/onDomainTap/.test(wxml), 'wxml 不应再绑定 onDomainTap（已移除折叠交互）')
})

test('knowledge-map domain markers are text-only and not decorative glyphs', () => {
  const presenter = read('miniprogram/pages/knowledge-map/knowledge-map-presenter.js')
  assert.match(presenter, /marker: '01'/)
  assert.match(presenter, /marker: '02'/)
})

// ============================================================
// 2. student-profile：知识地图入口并入个人行动队列
// ============================================================

test('student-profile.wxml 的知识地图入口走个人行动队列和统一 URL 跳转', () => {
  const wxml = read('miniprogram/pages/student-profile/student-profile.wxml')

  assert.match(wxml, /personal-action-queue/, '个人页必须渲染行动队列')
  assert.match(wxml, /home\.personalActionQueue/, '行动队列必须来自 presenter view model')
  assert.match(wxml, /onTraceableUrlTap/, '行动队列必须走统一 URL 跳转')
  assert.match(wxml, /data-url="{{item.url}}"/, '行动队列每个入口必须带 URL')
  assert.doesNotMatch(wxml, /map-compact-bar/, '个人页不再单独渲染旧知识地图紧凑条')
})

test('index-presenter 为个人行动队列产出知识地图入口', () => {
  const presenter = read('miniprogram/pages/index/index-presenter.js')

  assert.match(presenter, /key: 'knowledgeMap'/, '个人行动队列必须包含 knowledgeMap 项')
  assert.match(presenter, /title: '数学知识地图'/, '知识地图入口应使用家长可读标题')
  assert.match(presenter, /knowledgeMapCard\.summary/, '知识地图入口应复用地图摘要')
  assert.match(presenter, /url: knowledgeMapUrl\(student\)/, '知识地图入口必须跳转到知识地图页')
})

// ============================================================
// 3. learningResource 云函数：不再有直接 db.collection('learningResourcePacks') 调用
//    （所有访问必须经过 helper，否则 -502005 时无法容错）
// ============================================================

test('learningResource/index.js 不再有裸的 db.collection("learningResourcePacks") 调用', () => {
  const source = read('cloudfunctions/learningResource/index.js')
  // 移除 PACKS_COLLECTION 常量定义行、helper 内部的调用，剩下如果有直接调用就是问题
  // 我们检查 "db.collection('learningResourcePacks')" 字面量
  const directCalls = source.match(/db\.collection\(['"]learningResourcePacks['"]\)/g) || []
  // 这些直接调用应该只出现在 helper 函数内部（queryPacks/getPackDoc/addPack）
  // 用更精准的方式：检查 generatePack / getPackById / completePack / scheduleVerification 函数体内是否还有直接调用
  const forbiddenContexts = [
    /async function generatePack[\s\S]*?\nasync function/,
    /async function getPackById[\s\S]*?\nasync/,
    /async function completePack[\s\S]*?\nasync/,
    /async function scheduleVerification[\s\S]*?\nasync/,
    /async function getPack[\s\S]*?\nasync/,
  ]
  const offenders = []
  for (const ctx of forbiddenContexts) {
    const match = source.match(ctx)
    if (match && /db\.collection\(['"]learningResourcePacks['"]\)/.test(match[0])) {
      offenders.push(match[0].split('\n')[0])
    }
  }
  assert.deepEqual(offenders, [],
    `这些函数体内仍有裸 db.collection('learningResourcePacks') 调用，必须改用 helper: ${offenders.join(' | ')}`)
})

test('learningResource/index.js 的 helper 函数捕获 -502005 后调用 createCollection', () => {
  const source = read('cloudfunctions/learningResource/index.js')
  // queryPacks、getPackDoc、addPack 三个 helper 都必须有 isMissingCollectionError + createCollection
  const helpers = ['queryPacks', 'getPackDoc', 'addPack']
  for (const h of helpers) {
    const re = new RegExp(`async function ${h}[\\s\\S]*?\\n}\\n`)
    const m = source.match(re)
    assert.ok(m, `helper ${h} 必须存在`)
    assert.match(m[0], /isMissingCollectionError/, `${h} 必须用 isMissingCollectionError 判定`)
    assert.match(m[0], /createCollection/, `${h} 必须在缺失时调用 createCollection`)
  }
})

// ============================================================
// 4. 9 个云函数的 access.js 必须导出 isMissingCollectionError
//    （deployment-readiness.test.js 有副本一致性检查，这里额外校验导出项）
// ============================================================

test('所有云函数的 access.js 都导出 isMissingCollectionError', () => {
  const dirs = fs.readdirSync(path.join(ROOT, 'cloudfunctions'))
    .filter(d => fs.existsSync(path.join(ROOT, 'cloudfunctions', d, 'access.js')))
  assert.ok(dirs.length >= 9, `应该有 9+ 个 access.js，实际 ${dirs.length}`)

  const missing = dirs.filter(d => {
    const src = fs.readFileSync(path.join(ROOT, 'cloudfunctions', d, 'access.js'), 'utf8')
    // exports 里要么有 isMissingCollectionError，要么整体 module.exports 引用
    return !/isMissingCollectionError/.test(src)
  })
  assert.deepEqual(missing, [], `这些云函数的 access.js 没导出 isMissingCollectionError: ${missing.join(', ')}`)
})

// ============================================================
// 5. bottleneck-detail 的 onOpenLearningResource 与 knowledge-map 的 onBottleneckTap
//    都调用同一个 cloud API（保证两条入口的行为一致）
// ============================================================

test('bottleneck-detail 和 knowledge-map 两条"学一下"入口都走 cloud.generateLearningResourcePack', () => {
  const bd = read('miniprogram/pages/bottleneck-detail/bottleneck-detail.js')
  const km = read('miniprogram/pages/knowledge-map/knowledge-map.js')

  assert.match(bd, /cloud\.generateLearningResourcePack/, 'bottleneck-detail 必须调用 cloud.generateLearningResourcePack')
  assert.match(km, /cloud\.generateLearningResourcePack/, 'knowledge-map 必须调用 cloud.generateLearningResourcePack')

  // 两条入口跳转的目标 URL 必须一致
  const bdNav = bd.match(/navigateTo\(\{\s*url:\s*`([^`]+)`/g) || []
  const kmNav = km.match(/navigateTo\(\{\s*url:\s*`([^`]+)`/g) || []
  const bdResourceNav = bdNav.find(u => /learning-resource/.test(u))
  const kmResourceNav = kmNav.find(u => /learning-resource/.test(u))
  assert.ok(bdResourceNav, 'bottleneck-detail 必须有跳 learning-resource 的逻辑')
  assert.ok(kmResourceNav, 'knowledge-map 必须有跳 learning-resource 的逻辑')
})

const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')

const ROOT = path.resolve(__dirname, '..')

function read(relativePath) {
  return fs.readFileSync(path.join(ROOT, relativePath), 'utf8')
}

function registeredPages() {
  const manifest = JSON.parse(read('miniprogram/app.json'))
  const mainPages = (manifest.pages || []).map(page => `miniprogram/${page}`)
  const subPages = (manifest.subPackages || []).flatMap(pkg => (
    (pkg.pages || []).map(page => `miniprogram/${pkg.root}/${page}`)
  ))
  return [...mainPages, ...subPages]
}

test('all registered pages adopt the shared B+ page and content primitives', () => {
  const pages = registeredPages()
  assert.equal(pages.length, 24)

  for (const page of pages) {
    const wxml = read(`${page}.wxml`)
    const wxss = read(`${page}.wxss`)
    assert.match(wxml, /class="[^"]*bplus-page/, `${page}.wxml 缺少 bplus-page`)
    assert.match(
      wxml,
      /bplus-(section|row|state|action|empty|loading)/,
      `${page}.wxml 未使用共享 B+ 内容或状态类`
    )
    assert.doesNotMatch(
      wxss,
      /\.bplus-(page|section|row|state|action|empty|loading)\s*\{/,
      `${page}.wxss 不应重复定义全局 B+ 原语`
    )
  }
})

test('global B+ primitives and semantic icon map stay asset-free', () => {
  const appWxss = read('miniprogram/app.wxss')
  const icons = read('miniprogram/utils/ui-icons.js')

  for (const selector of ['bplus-page', 'bplus-section', 'bplus-icon-label', 'bplus-state', 'bplus-action', 'bplus-mini-bars']) {
    assert.match(appWxss, new RegExp(`\\.${selector}\\s*\\{`), `缺少 .${selector}`)
  }
  assert.doesNotMatch(icons, /(?:https?:|data:|\.png|\.svg|\.woff)/i)
  assert.match(icons, /REPORT/)
  assert.match(icons, /EVIDENCE/)
  assert.match(icons, /NEXT_ACTION/)
})

test('mini program UI does not depend on system emoji glyphs', () => {
  const files = fs.readdirSync(path.join(ROOT, 'miniprogram'), { recursive: true })
    .filter(file => /\.(?:js|wxml|wxss)$/.test(file))

  for (const relativePath of files) {
    const source = read(path.join('miniprogram', relativePath))
    assert.doesNotMatch(
      source,
      /[\u{1F000}-\u{1FAFF}\u{1FC00}-\u{1FFFD}]/u,
      `${relativePath} should use compatible text or CSS visuals instead of emoji`
    )
  }
})

test('critical compact icon controls keep a text label', () => {
  for (const page of registeredPages()) {
    const wxml = read(`${page}.wxml`)
    const iconOnlyControls = wxml.match(/<(?:view|button)[^>]*(?:bindtap|catchtap)="[^"]+"[^>]*>\s*[›→+×]\s*<\/(?:view|button)>/g) || []
    assert.deepEqual(iconOnlyControls, [], `${page}.wxml 存在没有文字标签的关键操作`)
  }
})

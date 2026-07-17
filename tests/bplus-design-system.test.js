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

const UI_SOURCE_ROOTS = ['miniprogram/pages', 'miniprogram/utils']
const UI_EXTENSIONS = new Set(['.wxml', '.js'])
const UI_LITERAL_EXEMPTIONS = [
  'miniprogram/pages/icon-compatibility/emoji-candidates.js',
  'miniprogram/pages/icon-compatibility/emoji-candidates-batch-02.js'
]
const PROHIBITED_UI_SYMBOL = /(?:\p{Extended_Pictographic}|\p{Emoji_Presentation}|[\u2190-\u21FF\u2600-\u27BF]|[✓✗✕★◎⌾□▧])/u
// 白名单唯一来源是 utils/ui-symbols.js（C01-C06 策展集），扫描按其放行
const APPROVED_UI_SYMBOLS = [...new Set(Object.values(require('../miniprogram/utils/ui-symbols').UI_SYMBOLS))]
  .sort((left, right) => [...right].length - [...left].length)

function uiSourceFiles(directory) {
  const absoluteDirectory = path.join(ROOT, directory)
  return fs.readdirSync(absoluteDirectory, { withFileTypes: true }).flatMap(entry => {
    const relativePath = path.join(directory, entry.name)
    if (entry.isDirectory()) return uiSourceFiles(relativePath)
    return UI_EXTENSIONS.has(path.extname(entry.name)) ? [relativePath] : []
  })
}

function runtimeSourceFiles(directory) {
  const absoluteDirectory = path.join(ROOT, directory)
  if (!fs.existsSync(absoluteDirectory)) return []
  return fs.readdirSync(absoluteDirectory, { withFileTypes: true }).flatMap(entry => {
    const relativePath = path.join(directory, entry.name)
    if (entry.isDirectory()) return runtimeSourceFiles(relativePath)
    return ['.js', '.wxml', '.json'].includes(path.extname(entry.name)) ? [relativePath] : []
  })
}

function stripComments(source, extension) {
  if (extension === '.wxml') return source.replace(/<!--[\s\S]*?-->/g, '')
  return source
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/(^|[^:\\])\/\/[^\n]*/gm, '$1')
}

function b1Rules() {
  const appWxss = read('miniprogram/app.wxss')
  const match = appWxss.match(/\/\* B1 FOUNDATION START \*\/([\s\S]*?)\/\* B1 FOUNDATION END \*\//)
  assert.ok(match, 'app.wxss 缺少 B1 foundation 边界')
  return match[1]
}

test('B1 palette tokens preserve the approved subject and semantic meanings', () => {
  const rules = b1Rules()
  const tokens = {
    'ink-strong': '#26383A',
    canvas: '#F8F5EF',
    surface: '#FFFDFA',
    ink: '#253436',
    'ink-muted': '#566568',
    'ink-subtle': '#778386',
    border: '#DEDBD2',
    'subject-chinese-fg': '#D4483A',
    'subject-chinese-bg': '#FDE1DC',
    'subject-math-fg': '#B37808',
    'subject-math-bg': '#FAE9B7',
    'subject-english-fg': '#4168B7',
    'subject-english-bg': '#E1E8FA',
    'priority-fg': '#DF5B3F',
    'priority-bg': '#F8E3DF',
    'improved-fg': '#16775E',
    'improved-bg': '#DFF1E9',
    'informational-fg': '#4168B7',
    'informational-bg': '#E6ECF8',
    'waiting-fg': '#A36C08',
    'waiting-bg': '#F8ECCB',
    'destructive-fg': '#A52F3A',
    'destructive-bg': '#F8DDE1',
    'neutral-fg': '#778386',
    'neutral-bg': '#F1EEE7'
  }

  for (const [name, color] of Object.entries(tokens)) {
    assert.match(
      rules,
      new RegExp(`--b1-${name}:\\s*${color};`, 'i'),
      `B1 token --b1-${name} 应为 ${color}`
    )
  }
})

test('B1 shared primitives, subjects, and semantic classes are global and asset-free', () => {
  const rules = b1Rules()
  const classes = [
    'b1-page', 'b1-card', 'b1-dense-row', 'b1-tag', 'b1-segmented',
    'b1-button-primary', 'b1-button-secondary', 'b1-button-destructive',
    'b1-state-loading', 'b1-state-empty', 'b1-state-error', 'b1-chevron',
    'b1-hit-target', 'b1-subject-chinese', 'b1-subject-math',
    'b1-subject-english', 'b1-priority', 'b1-improved', 'b1-informational',
    'b1-waiting', 'b1-destructive', 'b1-neutral'
  ]

  for (const className of classes) {
    assert.match(rules, new RegExp(`\\.${className}(?:[\\s,:.{]|$)`), `缺少 .${className}`)
  }

  const hitTarget = rules.match(/\.b1-hit-target\s*\{([^}]*)\}/)
  assert.ok(hitTarget, '缺少 .b1-hit-target 规则')
  assert.match(hitTarget[1], /min-width:\s*(?:8[8-9]|9\d|\d{3,})rpx/)
  assert.match(hitTarget[1], /min-height:\s*(?:8[8-9]|9\d|\d{3,})rpx/)

  const card = rules.match(/\.b1-card\s*\{([^}]*)\}/)
  const tag = rules.match(/\.b1-tag\s*\{([^}]*)\}/)
  assert.ok(card, '缺少 .b1-card 规则')
  assert.ok(tag, '缺少 .b1-tag 规则')
  assert.match(card[1], /padding:\s*(?:1[89]|2[0-2])rpx/)
  assert.match(card[1], /border-radius:\s*(?:8|9|10|11|12)rpx/)
  assert.match(tag[1], /border-radius:\s*(?:6|7|8)rpx/)

  const weights = [...rules.matchAll(/font-weight:\s*(\d+)/g)].map(match => Number(match[1]))
  assert.ok(weights.every(weight => [400, 500, 600, 700].includes(weight)), 'B1 仅允许 400/500/600/700 字重')
  assert.doesNotMatch(rules, /(?:url\s*\(|https?:|data:|\.png|\.jpe?g|\.svg|\.webp|\.gif|\.woff|iconfont)/i)
})

test('all 25 registered routes use the B1 page shell without redefining it locally', () => {
  const pages = registeredPages()
  const globalPrimitive = /\.(?:b1-page|b1-card|b1-tag|b1-hit-target)\s*\{/
  assert.equal(pages.length, 25)

  for (const page of pages) {
    const wxml = read(`${page}.wxml`)
    const wxss = read(`${page}.wxss`)
    const root = wxml.match(/<(?:view|scroll-view)\b[^>]*\bclass="([^"]*)"/)
    assert.ok(root, `${page}.wxml 缺少带 class 的页面根节点`)
    assert.match(root[1], /(?:^|\s)b1-page(?:\s|$)/, `${page}.wxml 根节点缺少 b1-page`)
    assert.doesNotMatch(wxss, globalPrimitive, `${page}.wxss 不应重复定义全局 B1 原语`)
  }
})

test('application navigation and page backgrounds use the B1 shell colors', () => {
  const manifest = JSON.parse(read('miniprogram/app.json'))
  assert.equal(manifest.window.navigationBarBackgroundColor, '#26383A')
  assert.equal(manifest.window.backgroundColor, '#F8F5EF')

  for (const pageJson of [
    'miniprogram/pages/bottleneck-center/bottleneck-center.json',
    'miniprogram/pages/bottleneck-detail/bottleneck-detail.json'
  ]) {
    const config = JSON.parse(read(pageJson))
    assert.equal(config.navigationBarBackgroundColor, undefined, `${pageJson} 不应覆盖全局导航背景`)
    assert.equal(config.navigationBarTextStyle, 'white')
    assert.ok(config.navigationBarTitleText)
  }
})

test('critical compact symbol controls keep a text label or accessible label', () => {
  for (const page of registeredPages()) {
    const wxml = read(`${page}.wxml`)
    const iconOnlyControls = wxml.match(/<(?:view|button)[^>]*(?:bindtap|catchtap)="[^"]+"[^>]*>\s*[›→+×‹]\s*<\/(?:view|button)>/g) || []
    const unlabeled = iconOnlyControls.filter(control => !/aria-label="[^"]+"/.test(control))
    assert.deepEqual(unlabeled, [], `${page}.wxml 存在没有文字或无障碍标签的关键操作`)
  }
})

test('repository-authored UI sources contain no decorative emoji or unstable symbols', () => {
  assert.deepEqual(UI_LITERAL_EXEMPTIONS, [
    'miniprogram/pages/icon-compatibility/emoji-candidates.js',
    'miniprogram/pages/icon-compatibility/emoji-candidates-batch-02.js'
  ])
  const violations = UI_SOURCE_ROOTS
    .flatMap(uiSourceFiles)
    .filter(relativePath => !UI_LITERAL_EXEMPTIONS.includes(relativePath))
    .flatMap(relativePath => {
      const source = APPROVED_UI_SYMBOLS.reduce(
        (result, symbol) => result.split(symbol).join(''),
        stripComments(read(relativePath), path.extname(relativePath))
      )
      return source.split(/\r?\n/).flatMap((line, index) => (
        PROHIBITED_UI_SYMBOL.test(line) ? [`${relativePath}:${index + 1}: ${line.trim()}`] : []
      ))
    })

  assert.deepEqual(violations, [], `仓库主动渲染的 UI emoji/不稳定符号：\n${violations.join('\n')}`)
})

test('expanded emoji runtime is imported only by its isolated compatibility controller', () => {
  const roots = ['miniprogram/pages', 'miniprogram/components', 'miniprogram/utils']
  const files = [
    ...roots.flatMap(runtimeSourceFiles),
    'miniprogram/app.js',
    'miniprogram/app.json'
  ]
  const references = files
    .filter(relativePath => relativePath !== 'miniprogram/pages/icon-compatibility/emoji-candidates-batch-02.js')
    .filter(relativePath => read(relativePath).includes('emoji-candidates-batch-02'))
    .sort()

  assert.deepEqual(references, [
    'miniprogram/pages/icon-compatibility/icon-compatibility.js'
  ])
})

function wxssFiles(directory) {
  const absoluteDirectory = path.join(ROOT, directory)
  if (!fs.existsSync(absoluteDirectory)) return []
  return fs.readdirSync(absoluteDirectory, { withFileTypes: true }).flatMap(entry => {
    const relativePath = path.join(directory, entry.name)
    if (entry.isDirectory()) return wxssFiles(relativePath)
    return entry.name.endsWith('.wxss') ? [relativePath] : []
  })
}

test('legacy subject hexes are retired from every miniprogram WXSS (B1 tokens are the single source)', () => {
  // 被淘汰的旧学科色：深蓝 #1f4f82 / 蓝 #2b6cb0 / 棕 #9c4f24 / 橙 #c05621
  const DEPRECATED_HEXES = ['#1f4f82', '#2b6cb0', '#9c4f24', '#c05621']
  const files = ['miniprogram/app.wxss', ...wxssFiles('miniprogram/pages'), ...wxssFiles('miniprogram/components')]
  const violations = files.flatMap(relativePath => {
    const source = read(relativePath)
    return DEPRECATED_HEXES
      .filter(hex => source.toLowerCase().includes(hex))
      .map(hex => `${relativePath} 仍引用已淘汰色值 ${hex}`)
  })

  assert.deepEqual(violations, [], `页面 WXSS 应统一使用 var(--b1-*) token：\n${violations.join('\n')}`)
})

test('JS subject colors stay in sync with the B1 subject tokens', () => {
  const { SUBJECT_COLORS } = require('../miniprogram/utils/constants')
  assert.equal(SUBJECT_COLORS.math.bg.toUpperCase(), '#B37808')
  assert.equal(SUBJECT_COLORS.chinese.bg.toUpperCase(), '#D4483A')
  assert.equal(SUBJECT_COLORS.english.bg.toUpperCase(), '#4168B7')
})

const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const { createWxMock, loadPage } = require('./helpers/page-harness')

const ROOT = path.resolve(__dirname, '..')
const PAGE_JS = 'miniprogram/pages/icon-compatibility/icon-compatibility.js'

test('compatibility page defaults to batch two and keeps only active category items in page data', () => {
  const wx = createWxMock({
    getDeviceInfo: () => ({ model: 'Pixel 9', system: 'Android 16', platform: 'android' }),
    getAppBaseInfo: () => ({ version: '9.0.1', SDKVersion: '3.16.1' })
  })
  const { page } = loadPage(PAGE_JS, { wx })

  page.onLoad()

  assert.equal(page.data.activeBatch.id, 'B02')
  assert.equal(page.data.activeCategory.id, 'B02-C01')
  assert.equal(page.data.activeItems.length, 35)
  assert.equal(page.data.categoryTabs.length, 26)
  assert.equal(page.data.batchTabs.length, 2)
  assert.equal(page.data.candidateCount, 1202)
  assert.equal(Object.hasOwn(page.data, 'batches'), false)
  page.data.categoryTabs.forEach(tab => assert.equal(Object.hasOwn(tab, 'items'), false))
  assert.match(page.data.environmentText, /Pixel 9/)
  assert.match(page.data.environmentText, /Android 16/)
  assert.match(page.data.environmentText, /微信 9\.0\.1/)
  assert.match(page.data.environmentText, /基础库 3\.16\.1/)
  assert.equal(page.data.isFirstCategory, true)
  assert.equal(page.data.isLastCategory, false)

  page.onCategoryTap({ currentTarget: { dataset: { index: 1 } } })
  assert.equal(page.data.activeCategory.id, 'B02-C02')
  assert.equal(page.data.activeItems.length, 35)
  assert.equal(page.data.activeTabId, 'category-B02-C02')
  assert.doesNotMatch(JSON.stringify(page.data), /"id":"C01-01"/)
})

test('compatibility page supports legacy and unavailable environment APIs', () => {
  const legacyWx = createWxMock({
    getSystemInfoSync: () => ({ model: 'Legacy Phone', system: 'Android 12', version: '8.0.50', SDKVersion: '2.32.3' })
  })
  const legacy = loadPage(PAGE_JS, { wx: legacyWx }).page
  legacy.onLoad()
  assert.equal(legacy.data.environmentText, 'Legacy Phone · Android 12 · 微信 8.0.50 · 基础库 2.32.3')

  const absent = loadPage(PAGE_JS, { wx: createWxMock() }).page
  absent.onLoad()
  assert.equal(absent.data.environmentText, '环境信息不可用')

  const throwing = loadPage(PAGE_JS, {
    wx: createWxMock({
      getDeviceInfo: () => { throw new Error('unsupported') },
      getAppBaseInfo: () => { throw new Error('unsupported') },
      getSystemInfoSync: () => { throw new Error('unsupported') }
    })
  }).page
  throwing.onLoad()
  assert.equal(throwing.data.environmentText, '环境信息不可用')
})

test('compatibility page switches batches and restores an independent category position', () => {
  const { page } = loadPage(PAGE_JS)
  page.onLoad()

  page.onPreviousCategory()
  assert.equal(page.data.activeCategory.id, 'B02-C01')
  page.onNextCategory()
  assert.equal(page.data.activeCategory.id, 'B02-C02')

  page.selectCategory(11)
  assert.equal(page.data.activeCategory.id, 'B02-C12')
  page.selectBatch('B01')
  assert.equal(page.data.activeCategory.id, 'C01')
  page.selectCategory(2)
  assert.equal(page.data.activeCategory.id, 'C03')
  page.selectBatch('B02')
  assert.equal(page.data.activeCategory.id, 'B02-C12')
  page.selectBatch('B01')
  assert.equal(page.data.activeCategory.id, 'C03')

  page.selectCategory(13)
  assert.equal(page.data.activeCategory.id, 'C14')
  assert.equal(page.data.isLastCategory, true)
  page.onNextCategory()
  assert.equal(page.data.activeCategory.id, 'C14')
})

test('compatibility page falls back to the active batch first category for invalid input', () => {
  const { page } = loadPage(PAGE_JS)

  page.selectCategory(-1)
  assert.equal(page.data.activeCategory.id, 'B02-C01')
  page.selectCategory('not-a-number')
  assert.equal(page.data.activeCategory.id, 'B02-C01')
  page.selectCategory(999)
  assert.equal(page.data.activeCategory.id, 'B02-C01')

  page.selectBatch('B01')
  page.selectCategory(4)
  page.selectBatch('unknown')
  assert.equal(page.data.activeBatch.id, 'B01')
  assert.equal(page.data.activeCategory.id, 'C01')
})

test('compatibility page copies exact public batch, category, and item IDs', async () => {
  const wx = createWxMock()
  const { page } = loadPage(PAGE_JS, { wx })
  page.onLoad()

  await page.onCopyBatchId({ currentTarget: { dataset: { id: 'B02' } } })
  await page.onCopyCategoryId({ currentTarget: { dataset: { id: 'B02-C03' } } })
  await page.onCopyItemId({ currentTarget: { dataset: { id: 'B02-C03-017' } } })

  const copied = wx.calls.filter(call => call.name === 'setClipboardData').map(call => call.payload.data)
  assert.deepEqual(copied, ['B02', 'B02-C03', 'B02-C03-017'])
})

test('batch and category switches never send inactive collections through setData', () => {
  const { page } = loadPage(PAGE_JS)
  const payloads = []
  const originalSetData = page.setData.bind(page)
  page.setData = update => {
    payloads.push(update)
    originalSetData(update)
  }

  page.selectCategory(20)
  page.selectBatch('B01')
  page.selectCategory(13)
  page.selectBatch('B02')

  payloads.forEach(payload => {
    assert.equal(Object.hasOwn(payload, 'batches'), false)
    assert.equal(Object.hasOwn(payload, 'batchTabs'), false)
    assert.equal(Object.hasOwn(payload, 'categories'), false)
    assert.ok(payload.activeItems.length <= 50)
  })
})

test('compatibility page template renders only active items and registers a subpackage route', () => {
  const wxml = fs.readFileSync(path.join(ROOT, 'miniprogram/pages/icon-compatibility/icon-compatibility.wxml'), 'utf8')
  const wxss = fs.readFileSync(path.join(ROOT, 'miniprogram/pages/icon-compatibility/icon-compatibility.wxss'), 'utf8')
  const pageJson = JSON.parse(fs.readFileSync(path.join(ROOT, 'miniprogram/pages/icon-compatibility/icon-compatibility.json'), 'utf8'))
  const appJson = JSON.parse(fs.readFileSync(path.join(ROOT, 'miniprogram/app.json'), 'utf8'))

  assert.match(wxml, /class="page b1-page"/)
  assert.match(wxml, /class="batch-tabs"/)
  assert.match(wxml, /bindtap="onBatchTap"/)
  assert.match(wxml, /bindtap="onCopyBatchId"/)
  assert.match(wxml, /已通过 202/)
  assert.match(wxml, /待测试 1000/)
  assert.match(wxml, /共 1202/)
  assert.match(wxml, /scroll-into-view="\{\{activeTabId\}\}"/)
  assert.match(wxml, /wx:for="\{\{activeItems\}\}"/)
  assert.doesNotMatch(wxml, /batch\.categories|category\.items/)
  assert.match(wxml, /\{\{activeItems\.length\}\} 项/)
  assert.match(wxml, /\{\{activeBatch\.statusText\}\}/)
  assert.match(wxml, /onCopyCategoryId/)
  assert.match(wxml, /onCopyItemId/)
  assert.match(wxss, /grid-template-columns:\s*repeat\(4,\s*1fr\)/)
  assert.match(wxss, /\.candidate-id[\s\S]*white-space:\s*nowrap/)
  assert.match(wxss, /-webkit-line-clamp:\s*2/)
  assert.equal(pageJson.navigationBarTitleText, '图标兼容性测试')
  assert.equal(appJson.pages.includes('pages/icon-compatibility/icon-compatibility'), false)
  const pkg = appJson.subPackages.find(item => item.root === 'pages/icon-compatibility')
  assert.deepEqual(pkg && pkg.pages, ['icon-compatibility'])
})

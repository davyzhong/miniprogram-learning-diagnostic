#!/usr/bin/env node

const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')

const ROOT = path.resolve(__dirname, '..')
const CLI_PATH = process.env.WECHAT_DEVTOOLS_CLI || '/Applications/wechatwebdevtools.app/Contents/MacOS/cli'
const NARROW = process.env.EMOJI_REQUIRE_NARROW === '1'
const SCREENSHOT_PREFIX = NARROW ? 'emoji-batch-02-narrow' : 'emoji-batch-02'

function loadAutomator() {
  try {
    return require('miniprogram-automator')
  } catch (error) {
    return require('/tmp/learning-diagnostic-automator/node_modules/miniprogram-automator')
  }
}

function validateRenderedCardIds({ activeCategoryId, expectedCount, cardIds }) {
  assert.equal(cardIds.length, expectedCount, 'rendered card count mismatch')
  cardIds.forEach(id => {
    assert.ok(
      typeof id === 'string' && id.startsWith(`${activeCategoryId}-`),
      `stale or foreign card ID: ${id}`
    )
  })
}

function validateRestoredCategory(data, expectedBatchId, expectedCategoryId) {
  assert.equal(data.activeBatch && data.activeBatch.id, expectedBatchId, 'batch restoration mismatch')
  assert.equal(data.activeCategory && data.activeCategory.id, expectedCategoryId, 'category restoration mismatch')
}

async function renderedCardIds(page) {
  const cards = await page.$$('.candidate-item')
  return Promise.all(cards.map(card => card.attribute('data-id')))
}

async function validateCurrentPage(page, categoryId, count) {
  const data = await page.data()
  assert.equal(data.activeCategory.id, categoryId)
  validateRenderedCardIds({
    activeCategoryId: categoryId,
    expectedCount: count,
    cardIds: await renderedCardIds(page)
  })
  return data
}

async function screenshot(miniProgram, suffix) {
  const target = path.join(ROOT, `tmp/${SCREENSHOT_PREFIX}-${suffix}.png`)
  await miniProgram.screenshot({ path: target })
  return target
}

async function runE2E() {
  fs.mkdirSync(path.join(ROOT, 'tmp'), { recursive: true })
  const miniProgram = await loadAutomator().launch({
    cliPath: CLI_PATH,
    projectPath: ROOT,
    trustProject: true,
    timeout: 60000
  })

  try {
    if (NARROW) {
      const info = await miniProgram.systemInfo()
      assert.ok(info.screenWidth <= 320, `narrow run requires screenWidth <= 320, got ${info.screenWidth}`)
    }
    await miniProgram.reLaunch('/pages/icon-compatibility/icon-compatibility')
    await new Promise(resolve => setTimeout(resolve, 1000))
    const page = await miniProgram.currentPage()
    await validateCurrentPage(page, 'B02-C01', 35)
    await screenshot(miniProgram, 'top')

    for (let index = 0; index < 10; index += 1) {
      await page.callMethod('selectCategory', index)
      await validateCurrentPage(page, `B02-C${String(index + 1).padStart(2, '0')}`, 35)
    }
    await screenshot(miniProgram, 'practical')

    await page.callMethod('selectCategory', 20)
    await validateCurrentPage(page, 'B02-C21', 50)
    await screenshot(miniProgram, 'c21')

    await page.callMethod('selectBatch', 'B01')
    await page.callMethod('selectCategory', 2)
    validateRestoredCategory(await page.data(), 'B01', 'C03')
    await page.callMethod('selectBatch', 'B02')
    await page.callMethod('selectCategory', 11)
    validateRestoredCategory(await page.data(), 'B02', 'B02-C12')
    await page.callMethod('selectBatch', 'B01')
    validateRestoredCategory(await page.data(), 'B01', 'C03')
    await page.callMethod('selectBatch', 'B02')
    validateRestoredCategory(await page.data(), 'B02', 'B02-C12')

    await page.callMethod('selectCategory', 25)
    await validateCurrentPage(page, 'B02-C26', 50)
    await screenshot(miniProgram, 'longest')
  } finally {
    await miniProgram.close()
  }
}

module.exports = {
  validateRenderedCardIds,
  validateRestoredCategory,
  runE2E
}

if (require.main === module) {
  runE2E().catch(error => {
    console.error(error.stack || error.message)
    process.exitCode = 1
  })
}

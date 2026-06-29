#!/usr/bin/env node
// AI 用量账本 E2E 验证 —— 通过 devtool automator 真机自动化。
// 验证：账单页渲染、首页入口、内测授权、后端 getSummary 返回结构。
//
// 用法：node scripts/devtools-ai-usage-e2e.js
//   默认用记忆里的钟青羽（studentId 在 REAL_DATA_STUDENT_ID 或参数）。

const fs = require('node:fs')
const path = require('node:path')
const assert = require('node:assert/strict')

const PROJECT_PATH = path.resolve(__dirname, '..')
const CLI_PATH = '/Applications/wechatwebdevtools.app/Contents/MacOS/cli'
const OUTPUT_DIR = path.join(PROJECT_PATH, 'tmp', 'e2e', 'ai-usage')
const STUDENT_ID = process.env.REAL_DATA_STUDENT_ID || '966151a66a29599400006aca3e38ffaf'
const STUDENT_NAME = process.env.REAL_DATA_STUDENT_NAME || '钟青羽'

function loadAutomator() {
  try {
    return require('miniprogram-automator')
  } catch (error) {
    return require('/tmp/learning-diagnostic-automator/node_modules/miniprogram-automator')
  }
}

async function pageText(page) {
  const root = await page.$('.page')
  if (!root) return ''
  return root.text()
}

async function callFunctionFromPage(miniProgram, name, data) {
  // 在小程序运行时里调用云函数，借 evaluate 在 app 上下文里跑。
  await miniProgram.currentPage() || await miniProgram.reLaunch('/pages/index/index')
  return miniProgram.evaluate(([n, d]) => {
    return new Promise((resolve) => {
      // eslint-disable-next-line no-undef
      if (typeof wx === 'undefined' || !wx.cloud) { resolve({ _error: 'no wx.cloud' }); return }
      // eslint-disable-next-line no-undef
      wx.cloud.callFunction({ name: n, data: d, complete: (res) => resolve(res && res.result) })
    })
  }, [name, data])
}

const checks = []

async function main() {
  const automator = loadAutomator()
  fs.mkdirSync(OUTPUT_DIR, { recursive: true })

  console.log('启动 devtool automator...')
  const miniProgram = await automator.launch({
    cliPath: CLI_PATH,
    projectPath: PROJECT_PATH,
    trustProject: true,
    timeout: 60000
  })

  const exceptions = []
  miniProgram.on('console', entry => {
    if (entry.type === 'error') console.log('  [console.error]', entry.message)
  })
  miniProgram.on('exception', entry => exceptions.push(entry))

  try {
    // ── 检查 1：AI 用量账单页能打开并渲染 ──
    await check1_billPage(miniProgram)
    // ── 检查 2：首页 actionQueue 含「AI 用量」入口 ──
    await check2_homeEntry(miniProgram)
    // ── 检查 3：上传页能打开（内测授权逻辑会触发） ──
    await check3_uploadGate(miniProgram)
    // ── 检查 4：后端 getSummary 返回结构正确 ──
    await check4_getSummary(miniProgram)
    // ── 检查 5：后端 getBetaAuth 返回结构正确 ──
    await check5_getBetaAuth(miniProgram)
  } finally {
    await miniProgram.close()
  }

  console.log('\n========== E2E 验证汇总 ==========')
  let failed = 0
  for (const c of checks) {
    const mark = c.status === 'PASS' ? '✓' : '✗'
    console.log(`${mark} ${c.name}: ${c.detail}`)
    if (c.status !== 'PASS') failed += 1
  }
  console.log(`\n异常事件数: ${exceptions.length}`)
  console.log(`通过 ${checks.length - failed}/${checks.length}`)
  if (failed > 0) process.exitCode = 1
}

// 检查 1：账单页渲染
async function check1_billPage(miniProgram) {
  const name = 'AI 用量账单页渲染'
  try {
    const page = await miniProgram.reLaunch('/pages/ai-usage/ai-usage')
    await page.waitFor(2500)
    const text = await pageText(page)
    const shot = path.join(OUTPUT_DIR, 'bill-page.png')
    await miniProgram.screenshot({ path: shot })

    // 强制提示文案（设计文档 §6.1）
    assert.ok(text.includes('内测') && text.includes('估算'), '账单页应含内测估算提示')
    // 月份栏存在
    assert.ok(/\d{4}年\d+月/.test(text), '账单页应含月份标签')
    // 汇总卡片或空态二选一
    const hasSummary = text.includes('本月 token') || text.includes('AI 调用次数')
    const hasEmpty = text.includes('暂无 AI 用量') || text.includes('用量会记录')
    assert.ok(hasSummary || hasEmpty, '账单页应渲染汇总卡片或空态')

    checks.push({ name, status: 'PASS', detail: `渲染正常（${text.length} 字符）；提示与月份栏齐全；${shot}` })
  } catch (error) {
    checks.push({ name, status: 'FAIL', detail: error && error.message })
  }
}

// 检查 2：首页 actionQueue 入口
async function check2_homeEntry(miniProgram) {
  const name = '首页「AI 用量」入口存在'
  try {
    const page = await miniProgram.reLaunch('/pages/index/index')
    await page.waitFor(2000)
    const text = await pageText(page)
    // 入口卡片标题或 actionText
    assert.ok(text.includes('AI 用量') || text.includes('看账本'), '首页 actionQueue 应含 AI 用量入口')
    checks.push({ name, status: 'PASS', detail: 'actionQueue 含「AI 用量」入口' })
  } catch (error) {
    checks.push({ name, status: 'FAIL', detail: error && error.message })
  }
}

// 检查 3：上传页打开（内测授权）
async function check3_uploadGate(miniProgram) {
  const name = '上传页打开 + 内测授权逻辑'
  try {
    const student = encodeURIComponent(STUDENT_NAME)
    const page = await miniProgram.reLaunch(`/pages/upload/upload?mode=diagnosis&studentId=${STUDENT_ID}&subject=math&subjectName=%E6%95%B0%E5%AD%A6&studentName=${student}`)
    await page.waitFor(2500)
    const text = await pageText(page)
    // 上传页应能渲染（标题或上传按钮）；内测授权弹层是 modal，可能已同意不再弹
    const hasUploadUi = text.includes('上传') || text.includes('拍照') || text.includes('分析')
    assert.ok(hasUploadUi, '上传页应渲染上传 UI')
    // 读取页面 data 确认 betaChecking 已结束（授权流程已跑）
    const data = await page.data()
    const betaResolved = data.betaChecking === false
    checks.push({
      name,
      status: betaResolved ? 'PASS' : 'FAIL',
      detail: betaResolved
        ? `授权检查已完成；betaConsented=${data.betaConsented}`
        : `授权检查未结束 betaChecking=${data.betaChecking}`
    })
  } catch (error) {
    checks.push({ name, status: 'FAIL', detail: error && error.message })
  }
}

// 检查 4：后端 getSummary
async function check4_getSummary(miniProgram) {
  const name = 'aiUsage.getSummary 返回结构'
  try {
    const result = await callFunctionFromPage(miniProgram, 'aiUsage', { action: 'getSummary', month: currentMonth() })
    assert.ok(result, 'getSummary 应返回结果')
    assert.equal(result.success, true, `getSummary success 应为 true（实际 ${result.success}, error=${result.error}）`)
    assert.ok(typeof result.callCount === 'number', 'getSummary 应含 callCount')
    assert.ok(Array.isArray(result.byEventType), 'getSummary 应含 byEventType 数组')
    checks.push({
      name, status: 'PASS',
      detail: `本月 ${result.callCount} 次调用，${result.totalTokens} token，估算 ¥${result.totalCostCny}，${result.byEventType.length} 类功能`
    })
  } catch (error) {
    checks.push({ name, status: 'FAIL', detail: error && error.message })
  }
}

// 检查 5：后端 getBetaAuth
async function check5_getBetaAuth(miniProgram) {
  const name = 'aiUsage.getBetaAuth 返回结构'
  try {
    const result = await callFunctionFromPage(miniProgram, 'aiUsage', { action: 'getBetaAuth' })
    assert.ok(result, 'getBetaAuth 应返回结果')
    assert.equal(result.success, true, `getBetaAuth success 应为 true`)
    assert.ok(typeof result.consented === 'boolean', 'getBetaAuth 应含 consented 布尔')
    checks.push({ name, status: 'PASS', detail: `consented=${result.consented}` })
  } catch (error) {
    checks.push({ name, status: 'FAIL', detail: error && error.message })
  }
}

function currentMonth() {
  const d = new Date(Date.now() + 8 * 60 * 60 * 1000)
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`
}

if (require.main === module) {
  main().catch(error => {
    console.error(error && (error.stack || error.message) ? (error.stack || error.message) : error)
    process.exitCode = 1
  })
}

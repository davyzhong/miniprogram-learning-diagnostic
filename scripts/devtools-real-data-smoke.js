#!/usr/bin/env node

const fs = require('node:fs')
const path = require('node:path')
const assert = require('node:assert/strict')
const { parseRealDataSmokeConfig } = require('./real-data-smoke-config')

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

function safeFileName(value) {
  return String(value || 'page').replace(/[^a-zA-Z0-9_-]+/g, '-')
}

async function inspectRoute(miniProgram, route, outputDir) {
  const started = Date.now()
  const page = await miniProgram.reLaunch(route.path)
  await page.waitFor(1800)
  const text = await pageText(page)
  const screenshotPath = path.join(outputDir, `${safeFileName(route.key)}.png`)
  await miniProgram.screenshot({ path: screenshotPath })

  assert.equal(page.path, route.path.replace(/^\//, '').split('?')[0], `${route.name} route should open expected page`)

  return {
    key: route.key,
    name: route.name,
    path: route.path,
    openedPath: page.path,
    status: 'PASS',
    durationMs: Date.now() - started,
    textLength: text.length,
    screenshotPath
  }
}

async function main() {
  const config = parseRealDataSmokeConfig()
  const automator = loadAutomator()
  fs.mkdirSync(config.outputDir, { recursive: true })

  const miniProgram = await automator.launch({
    cliPath: config.cliPath,
    projectPath: config.projectPath,
    trustProject: true,
    timeout: 60000
  })

  const logs = []
  const exceptions = []
  miniProgram.on('console', entry => logs.push(entry))
  miniProgram.on('exception', entry => exceptions.push(entry))

  const results = []
  try {
    for (const route of config.routes) {
      try {
        const result = await inspectRoute(miniProgram, route, config.outputDir)
        results.push(result)
        console.log(`PASS ${route.name} ${route.path}`)
      } catch (error) {
        results.push({
          key: route.key,
          name: route.name,
          path: route.path,
          status: 'FAIL',
          error: error && (error.stack || error.message || String(error))
        })
        console.error(`FAIL ${route.name}: ${error && error.message ? error.message : error}`)
      }
    }
  } finally {
    await miniProgram.close()
  }

  const report = {
    generatedAt: new Date().toISOString(),
    studentId: config.studentId,
    studentName: config.studentName,
    projectPath: config.projectPath,
    outputDir: config.outputDir,
    results,
    consoleCount: logs.length,
    exceptionCount: exceptions.length
  }

  const reportPath = path.join(config.outputDir, 'results.json')
  fs.writeFileSync(reportPath, `${JSON.stringify(report, null, 2)}\n`)

  const failed = results.filter(item => item.status !== 'PASS')
  console.log(`\nReal data smoke report: ${reportPath}`)
  console.log(`Passed ${results.length - failed.length}/${results.length}`)
  if (failed.length > 0) process.exitCode = 1
}

if (require.main === module) {
  main().catch(error => {
    console.error(error && (error.stack || error.message) ? (error.stack || error.message) : error)
    process.exitCode = 1
  })
}

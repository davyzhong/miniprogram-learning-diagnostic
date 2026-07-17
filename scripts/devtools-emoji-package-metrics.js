#!/usr/bin/env node

const fs = require('node:fs')
const path = require('node:path')
const { execFileSync } = require('node:child_process')

const ROOT = path.resolve(__dirname, '..')
const CLI_PATH = process.env.WECHAT_DEVTOOLS_CLI || '/Applications/wechatwebdevtools.app/Contents/MacOS/cli'
const INFO_PATH = path.join(ROOT, 'tmp/emoji-batch-02-preview-info.json')
const QR_PATH = path.join(ROOT, 'tmp/emoji-batch-02-preview-qr.png')
const BASELINE_MAIN_BYTES = 582545
const MAIN_DELTA_BUDGET = 5 * 1024
const ICON_SUBPACKAGE_BUDGET = 250 * 1024

function parseCompiledPackageMetrics(info) {
  const packages = info && info.size && Array.isArray(info.size.packages) ? info.size.packages : []
  const packageSize = name => {
    const record = packages.find(item => item && item.name === name)
    return record && Number.isFinite(record.size) ? record.size : null
  }
  const totalBytes = Number.isFinite(info && info.size && info.size.total)
    ? info.size.total
    : packageSize('TOTAL')
  const mainBytes = packageSize('main')
  const iconSubpackageBytes = packageSize('/pages/icon-compatibility/')
  if (![totalBytes, mainBytes, iconSubpackageBytes].every(Number.isFinite)) {
    throw new Error('compiled package metrics unavailable')
  }
  return { totalBytes, mainBytes, iconSubpackageBytes }
}

function measureCompiledPackages() {
  fs.mkdirSync(path.dirname(INFO_PATH), { recursive: true })
  execFileSync(CLI_PATH, [
    'preview',
    '--project', ROOT,
    '--qr-format', 'image',
    '--qr-output', QR_PATH,
    '--info-output', INFO_PATH
  ], { cwd: ROOT, encoding: 'utf8', stdio: 'inherit', timeout: 120000 })

  const metrics = parseCompiledPackageMetrics(JSON.parse(fs.readFileSync(INFO_PATH, 'utf8')))
  const mainDeltaBytes = metrics.mainBytes - BASELINE_MAIN_BYTES
  if (mainDeltaBytes > MAIN_DELTA_BUDGET) {
    throw new Error(`compiled main package delta ${mainDeltaBytes} exceeds ${MAIN_DELTA_BUDGET} bytes`)
  }
  if (metrics.iconSubpackageBytes >= ICON_SUBPACKAGE_BUDGET) {
    throw new Error(`icon compatibility subpackage ${metrics.iconSubpackageBytes} exceeds budget`)
  }
  return { ...metrics, baselineMainBytes: BASELINE_MAIN_BYTES, mainDeltaBytes }
}

module.exports = { parseCompiledPackageMetrics, measureCompiledPackages }

if (require.main === module) {
  try {
    console.log(JSON.stringify(measureCompiledPackages(), null, 2))
  } catch (error) {
    console.error(error.message)
    process.exitCode = 1
  }
}

#!/usr/bin/env node
/**
 * 主包体积预算检查
 *
 * 统计 miniprogram/ 目录下会被打包进主包的文件体积。
 * 分包页面在 app.json 的 subPackages 中声明后会从主包中扣除。
 *
 * 用法：node scripts/check-main-package-size.js
 * 退出码：0 未超预算；1 超预算
 */

const fs = require('node:fs')
const path = require('node:path')

const root = path.resolve(__dirname, '..')
const miniprogramDir = path.join(root, 'miniprogram')
const BUDGET_KB = 800 // 主包体积预算

function dirSize(dir) {
  let total = 0
  if (!fs.existsSync(dir)) return 0
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const fullPath = path.join(dir, entry.name)
    if (entry.isDirectory()) {
      total += dirSize(fullPath)
    } else if (entry.isFile()) {
      total += fs.statSync(fullPath).size
    }
  }
  return total
}

function main() {
  const appJson = JSON.parse(fs.readFileSync(path.join(miniprogramDir, 'app.json'), 'utf8'))

  // 主包页面（pages 列表）
  const mainPackagePages = new Set(appJson.pages || [])

  // 分包页面（从主包中扣除）
  const subPackageRoots = new Set()
  for (const pkg of (appJson.subPackages || [])) {
    for (const page of (pkg.pages || [])) {
      subPackageRoots.add(path.join(pkg.root, page))
    }
  }

  // 统计各项体积
  const categories = {}

  // pages：只统计主包页面
  let pagesSize = 0
  const pagesDir = path.join(miniprogramDir, 'pages')
  if (fs.existsSync(pagesDir)) {
    for (const entry of fs.readdirSync(pagesDir, { withFileTypes: true })) {
      if (!entry.isDirectory()) continue
      const pagePath = `pages/${entry.name}`
      // 如果页面在主包 pages 列表中，计入主包
      const isInMain = Array.from(mainPackagePages).some(p => p.startsWith(pagePath))
      const isInSub = Array.from(subPackageRoots).some(p => p.startsWith(pagePath))
      if (isInMain && !isInSub) {
        pagesSize += dirSize(path.join(pagesDir, entry.name))
      }
    }
  }
  categories['pages (main package)'] = pagesSize

  // 其他目录全部计入主包
  for (const dir of ['utils', 'data', 'assets', 'components']) {
    categories[dir] = dirSize(path.join(miniprogramDir, dir))
  }

  // app.js, app.json, app.wxss
  for (const file of ['app.js', 'app.json', 'app.wxss']) {
    const filePath = path.join(miniprogramDir, file)
    if (fs.existsSync(filePath)) {
      categories[file] = fs.statSync(filePath).size
    }
  }

  const totalBytes = Object.values(categories).reduce((a, b) => a + b, 0)
  const totalKB = Math.round(totalBytes / 1024)

  console.log('========== 主包体积统计 ==========')
  for (const [cat, size] of Object.entries(categories)) {
    if (size > 0) {
      console.log(`  ${cat.padEnd(25)} ${String(Math.round(size / 1024)).padStart(6)} KB`)
    }
  }
  console.log(`  ${'─'.repeat(35)}`)
  console.log(`  ${'总计'.padEnd(25)} ${String(totalKB).padStart(6)} KB`)
  console.log(`  ${'预算'.padEnd(25)} ${String(BUDGET_KB).padStart(6)} KB`)

  if (totalKB > BUDGET_KB) {
    const over = totalKB - BUDGET_KB
    console.error(`\n✗ 超出预算 ${over} KB`)
    console.error('  建议：将低频页面移入 subPackages 分包')
    process.exit(1)
  } else {
    console.log(`\n✓ 在预算内（剩余 ${BUDGET_KB - totalKB} KB）`)
    process.exit(0)
  }
}

main()

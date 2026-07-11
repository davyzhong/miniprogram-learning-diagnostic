#!/usr/bin/env node
/**
 * 云函数共享文件同步脚本
 *
 * 从 cloudfunctions/_shared-templates/ 的规范源同步共享文件到各云函数根目录。
 * 微信开发者工具跳过下划线开头的目录，所以 _shared-templates 不会被上传。
 * 各云函数通过 require('./access')（根级）引入，不依赖运行时跨目录引用。
 *
 * 用法：
 *   node scripts/sync-cloudfunction-shared.js          # 同步
 *   node scripts/sync-cloudfunction-shared.js --check   # 只检查，不同步（CI 用）
 *
 * 退出码：0 全部一致；1 有差异需要同步
 */

const fs = require('node:fs')
const path = require('node:path')

const root = path.resolve(__dirname, '..')
const templatesDir = path.join(root, 'cloudfunctions', '_shared-templates')

// 共享文件 → 需要同步到的云函数目录列表
const SHARED_FILES = {
  'access.js': [
    'aiUsage', 'englishVocabulary', 'generatePaper', 'generateReportPDF',
    'getAnalysisProgress', 'learningResource', 'reportFeedback',
    'studentAccess', 'studentData', 'uploadAndAnalyze',
    // regenerateVerificationPaper 有独立的 access.js（有意例外），不同步
  ],
  'pricing.js': ['aiUsage', 'analyzeBatch', 'englishVocabulary', 'generatePaper', 'learningResource'],
  'usage-ledger.js': ['aiUsage', 'analyzeBatch', 'englishVocabulary', 'generatePaper', 'learningResource'],
  'constants.js': ['analyzeBatch', 'generatePaper', 'generateReportPDF'],
  'bottleneck-name.js': ['analyzeBatch', 'generatePaper'],
}

function readFileSync(filePath) {
  return fs.readFileSync(filePath, 'utf8')
}

function main() {
  const checkOnly = process.argv.includes('--check')
  let mismatches = 0
  let synced = 0

  for (const [file, targets] of Object.entries(SHARED_FILES)) {
    const sourcePath = path.join(templatesDir, file)
    if (!fs.existsSync(sourcePath)) {
      console.error(`✗ 规范源不存在: cloudfunctions/_shared-templates/${file}`)
      process.exit(1)
    }
    const source = readFileSync(sourcePath)

    for (const target of targets) {
      const targetPath = path.join(root, 'cloudfunctions', target, file)
      if (!fs.existsSync(targetPath)) {
        console.error(`✗ 目标不存在: cloudfunctions/${target}/${file}`)
        mismatches++
        continue
      }
      const targetContent = readFileSync(targetPath)
      if (targetContent !== source) {
        mismatches++
        if (checkOnly) {
          console.error(`  ✗ cloudfunctions/${target}/${file} 与规范源不一致`)
        } else {
          fs.writeFileSync(targetPath, source)
          console.log(`  ✓ 已同步 cloudfunctions/${target}/${file}`)
          synced++
        }
      }
    }
  }

  if (mismatches === 0) {
    console.log('所有共享文件副本与规范源一致。')
    process.exit(0)
  }

  if (checkOnly) {
    console.error(`\n${mismatches} 个文件不一致。运行以下命令同步：`)
    console.error('  node scripts/sync-cloudfunction-shared.js')
    process.exit(1)
  } else {
    console.log(`\n已同步 ${synced} 个文件。`)
    process.exit(0)
  }
}

main()

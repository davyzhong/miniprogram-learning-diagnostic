#!/usr/bin/env node

const fs = require('node:fs')
const path = require('node:path')

const root = path.resolve(__dirname, '..')
const canonicalDocs = [
  'README.md',
  'PRD.md',
  'PROJECT_PLAN.md',
  'SETUP.md',
  'CLAUDE.md',
  'docs/README.md',
  'docs/ARCHITECTURE.md',
  'docs/CLOUD_FUNCTIONS.md',
  'docs/DATA_DICTIONARY.md',
  'docs/DEPLOYMENT.md',
  'docs/EMOJI_COMPATIBILITY_WHITELIST.md',
  'docs/METRICS.md',
  'docs/RELEASE_CHECKLIST.md',
  'docs/SKILL_AND_CLI_DESIGN.md',
  'docs/TESTING.md',
  'docs/TEST_FRAMEWORK_DESIGN.md',
  'docs/TEST_MATRIX.md',
  'docs/TROUBLESHOOTING.md',
  'docs/product/README.md',
  'docs/product/family-learning-workflow.md',
  'docs/product/learning-diagnostic-product-brief.md',
  'docs/product/mvp-roadmap-and-boundaries.md',
  'docs/product/prompt-and-agent-design.md',
  'docs/subject-design/README.md',
  'docs/subject-design/math/README.md',
  'docs/subject-design/math/math-learning-map-roadmap.md',
  'docs/subject-design/english/README.md',
  'docs/subject-design/english/english-written-diagnosis-and-tech-decision.md',
  'docs/subject-design/legacy/README.md',
  'docs/user-guide/README.md',
  'data/math/README.md',
]

const screenshotNames = [
  '01-family-workbench.png',
  '02-student-profile.png',
  '03-subject-workbench.png',
  '04-report.png',
  '05-generate-verification.png',
  '06-paper-preview.png',
  '07-learning-records.png',
  '08-parent-management.png',
  '09-chinese-workbench.png',
  '10-chinese-review-detail.png',
  '11-chinese-skill-task.png',
  '12-english-workbench.png',
  '13-english-confusion.png',
  '14-english-wrong-words.png',
]

const errors = []

function report(message) {
  errors.push(message)
}

function checkLink(source, rawTarget) {
  const target = rawTarget.trim().replace(/^<|>$/g, '').split('#')[0].split('?')[0]
  if (!target || /^(?:https?:|mailto:|tel:)/i.test(target)) return
  if (target.startsWith('/')) {
    report(`${source}: repository documentation must not use absolute local path ${rawTarget}`)
    return
  }
  const decoded = decodeURIComponent(target)
  const resolved = path.resolve(root, path.dirname(source), decoded)
  if (!resolved.startsWith(root + path.sep) || !fs.existsSync(resolved)) {
    report(`${source}: broken relative link ${rawTarget}`)
  }
}

for (const relativePath of canonicalDocs) {
  const absolutePath = path.join(root, relativePath)
  if (!fs.existsSync(absolutePath)) {
    report(`${relativePath}: canonical document is missing`)
    continue
  }
  const content = fs.readFileSync(absolutePath, 'utf8')
  for (const match of content.matchAll(/!?(?:\[[^\]]*\])\(([^)\s]+)(?:\s+['"][^'"]*['"])?\)/g)) {
    checkLink(relativePath, match[1])
  }
  for (const match of content.matchAll(/<(?:img|a)\b[^>]+(?:src|href)=["']([^"']+)["']/gi)) {
    checkLink(relativePath, match[1])
  }
}

const stalePatterns = [
  [/916(?:\s*\/\s*916|\s*个用例)/, 'obsolete 916-test baseline'],
  [/1006(?:\s*\/\s*1006|\s*(?:个|unit tests|常规))/i, 'obsolete 1006-test baseline'],
  [/(?:311|312)\s*(?:个\s*)?(?:JavaScript|JS|文件)/i, 'obsolete JavaScript-file baseline'],
  [/15\s*个(?:云数据库|数据库)?集合/, 'obsolete 15-collection baseline'],
  [/B1[^\n]{0,40}202\s*个已验证 emoji 全量接入/i, 'obsolete first-batch-only UI status'],
]

for (const relativePath of canonicalDocs) {
  const absolutePath = path.join(root, relativePath)
  if (!fs.existsSync(absolutePath)) continue
  const content = fs.readFileSync(absolutePath, 'utf8')
  for (const [pattern, label] of stalePatterns) {
    if (pattern.test(content)) report(`${relativePath}: ${label}`)
  }
}

for (const name of screenshotNames) {
  const relativePath = path.join('docs/user-guide/images', name)
  const absolutePath = path.join(root, relativePath)
  if (!fs.existsSync(absolutePath)) {
    report(`${relativePath}: screenshot is missing`)
    continue
  }
  const data = fs.readFileSync(absolutePath)
  const pngSignature = data.subarray(0, 8).toString('hex')
  if (pngSignature !== '89504e470d0a1a0a') {
    report(`${relativePath}: expected PNG image`)
    continue
  }
  const width = data.readUInt32BE(16)
  const height = data.readUInt32BE(20)
  if (width !== 390 || height !== 753) {
    report(`${relativePath}: expected 390x753, received ${width}x${height}`)
  }
}

if (errors.length) {
  console.error(`Documentation check failed with ${errors.length} issue(s):`)
  errors.forEach(error => console.error(`- ${error}`))
  process.exit(1)
}

console.log(`Checked ${canonicalDocs.length} canonical documents and ${screenshotNames.length} screenshots.`)

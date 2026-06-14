const fs = require('node:fs')
const path = require('node:path')
const { spawnSync } = require('node:child_process')

const root = path.resolve(__dirname, '..')
const roots = ['miniprogram', 'cloudfunctions', 'services', 'cli', 'tests', 'scripts']
const files = []

function collect(dir) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const fullPath = path.join(dir, entry.name)
    if (entry.isDirectory()) {
      collect(fullPath)
    } else if (entry.name.endsWith('.js')) {
      files.push(fullPath)
    }
  }
}

for (const relativePath of roots) {
  collect(path.join(root, relativePath))
}

for (const file of files) {
  const result = spawnSync(process.execPath, ['--check', file], { stdio: 'inherit' })
  if (result.status !== 0) process.exit(result.status || 1)
}

console.log(`Checked ${files.length} JavaScript files.`)

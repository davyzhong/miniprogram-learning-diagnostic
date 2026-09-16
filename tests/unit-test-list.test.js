const test = require('node:test')
const assert = require('node:assert/strict')
const { execFileSync } = require('node:child_process')
const path = require('node:path')
const fs = require('node:fs')

const ROOT = path.resolve(__dirname, '..')

// 守卫：测试清单单源化后，package.json 不得再出现硬编码的 tests/ 文件列表
test('package.json delegates the unit-test list to scripts/list-unit-tests.js', () => {
  const pkg = fs.readFileSync(path.join(ROOT, 'package.json'), 'utf8')
  for (const script of ['test:unit', 'test:coverage']) {
    const m = pkg.match(new RegExp(`"${script}":\\s*"([^"]*)"`))
    assert.ok(m, `${script} should exist`)
    assert.match(m[1], /\$\(node scripts\/list-unit-tests\.js\)/, `${script} should use the generator`)
    assert.doesNotMatch(m[1], /tests\/[a-z0-9-]+\.test\.js/, `${script} must not hardcode test files`)
  }
})

test('list-unit-tests excludes only the documented special suites', () => {
  const out = execFileSync('node', [path.join(ROOT, 'scripts', 'list-unit-tests.js')], { encoding: 'utf8' })
  const listed = new Set(out.trim().split(/\s+/))
  // 排除项确实被排除
  for (const excluded of [
    'tests/e2e-real-cloud.test.js',
    'tests/e2e-real-image.test.js',
    'tests/diagnostic-evaluation-scoring.test.js'
  ]) {
    assert.equal(listed.has(excluded), false, `${excluded} should stay excluded`)
  }
  // 常规套件确实被包含
  assert.equal(listed.has('tests/util.test.js'), true)
  assert.equal(listed.has('tests/poller.test.js'), true)
  // 排除清单与磁盘一致：既不漏掉新文件，也不引用不存在的文件
  const onDisk = fs.readdirSync(path.join(ROOT, 'tests')).filter(f => f.endsWith('.test.js'))
  const excludedOnDisk = onDisk.filter(f => !listed.has(`tests/${f}`))
  const KNOWN_EXCLUSIONS = 9
  assert.equal(excludedOnDisk.length, KNOWN_EXCLUSIONS, `unexpected exclusions: ${excludedOnDisk.join(', ')}`)
})

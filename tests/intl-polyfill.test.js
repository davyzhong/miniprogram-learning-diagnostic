const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('fs')
const path = require('path')

/**
 * 验证 Intl polyfill 的存在与正确性
 * 防止未来误删 app.js 的 require('./utils/intl-polyfill')
 */
test('app.js 顶部引用了 intl-polyfill', () => {
  const app = fs.readFileSync(path.resolve(__dirname, '../miniprogram/app.js'), 'utf8')
  const lines = app.split('\n')
  const requireLine = lines.findIndex(line => line.includes("require('./utils/intl-polyfill')"))
  assert.ok(requireLine >= 0, 'app.js 应该引用 intl-polyfill')
  assert.ok(requireLine < 3, `intl-polyfill 应该在文件顶部引用（实际在第 ${requireLine + 1} 行）`)
})

test('intl-polyfill 文件存在且导出了有效代码', () => {
  const source = fs.readFileSync(path.resolve(__dirname, '../miniprogram/utils/intl-polyfill.js'), 'utf8')
  assert.ok(source.includes('if (typeof Intl === \'undefined\')'), 'polyfill 应包含缺失判断')
  assert.ok(source.includes('DateTimeFormat'), 'polyfill 应提供 DateTimeFormat')
})

test('intl-polyfill 在缺失 Intl 时生效', () => {
  // 模拟 iOS JSC 无 Intl
  const saved = global.Intl
  delete global.Intl

  try {
    require('../miniprogram/utils/intl-polyfill')

    assert.ok(typeof global.Intl !== 'undefined', 'polyfill 应注入 Intl')
    assert.ok(typeof global.Intl.DateTimeFormat === 'function', '应提供 DateTimeFormat 函数')

    const formatter = new global.Intl.DateTimeFormat('en-US', {
      year: 'numeric', month: '2-digit', day: '2-digit',
      hour: '2-digit', minute: '2-digit'
    })
    const result = formatter.format(new Date('2026-06-17T09:30:00+08:00'))
    assert.ok(typeof result === 'string', 'format 应返回字符串')
    assert.ok(result.length > 0, '格式化结果不应为空')
  } finally {
    global.Intl = saved
  }
})

test('intl-polyfill 在已有 Intl 时不覆盖', () => {
  // 模拟有 Intl 的环境
  const saved = global.Intl
  const mockIntl = { DateTimeFormat: function () { return { format: () => 'native' } } }
  global.Intl = mockIntl

  try {
    // 重新 require 时应跳过 polyfill
    delete require.cache[require.resolve('../miniprogram/utils/intl-polyfill')]
    require('../miniprogram/utils/intl-polyfill')

    const formatter = new global.Intl.DateTimeFormat()
    assert.equal(formatter.format(new Date()), 'native', '已有 Intl 时不应被 polyfill 覆盖')
  } finally {
    global.Intl = saved
  }
})

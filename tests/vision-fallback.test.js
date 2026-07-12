// tests/vision-fallback.test.js
// 测试 vision-fallback 降级模块
const test = require('node:test')
const assert = require('node:assert/strict')

// 保存原始 env
const originalEnv = { ...process.env }

test('isFallbackConfigured returns false when no API key', () => {
  delete process.env.FALLBACK_VISION_API_KEY
  const { isFallbackConfigured } = require('../cloudfunctions/analyzeBatch/vision-fallback')
  assert.equal(isFallbackConfigured(), false)
})

test('isFallbackConfigured returns true when API key is set', () => {
  process.env.FALLBACK_VISION_API_KEY = 'test-key-123'
  // 重新 require 以获取新 env
  delete require.cache[require.resolve('../cloudfunctions/analyzeBatch/vision-fallback')]
  const { isFallbackConfigured } = require('../cloudfunctions/analyzeBatch/vision-fallback')
  assert.equal(isFallbackConfigured(), true)
})

test('callFallbackVision returns null when not configured', async () => {
  delete process.env.FALLBACK_VISION_API_KEY
  delete require.cache[require.resolve('../cloudfunctions/analyzeBatch/vision-fallback')]
  const { callFallbackVision } = require('../cloudfunctions/analyzeBatch/vision-fallback')
  const result = await callFallbackVision(['http://example.com/img.jpg'], 'test prompt')
  assert.equal(result, null)
})

test('callFallbackVision throws on HTTP error (invalid endpoint)', async () => {
  process.env.FALLBACK_VISION_API_KEY = 'test-key'
  process.env.FALLBACK_VISION_ENDPOINT = 'http://127.0.0.1:1/nonexistent'
  process.env.FALLBACK_VISION_TIMEOUT_MS = '3000'
  delete require.cache[require.resolve('../cloudfunctions/analyzeBatch/vision-fallback')]
  const { callFallbackVision } = require('../cloudfunctions/analyzeBatch/vision-fallback')
  await assert.rejects(
    () => callFallbackVision(['http://example.com/img.jpg'], 'test'),
    // 连接被拒或超时都算通过
    (err) => /ECONNREFUSED|timeout|超时|状态码|connect|hang up/i.test(err.message)
  )
})

// 恢复 env
test.after(() => {
  for (const key of Object.keys(process.env)) {
    if (key.startsWith('FALLBACK_VISION_')) delete process.env[key]
  }
  Object.assign(process.env, originalEnv)
})

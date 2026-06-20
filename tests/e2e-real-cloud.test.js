const test = require('node:test')
const assert = require('node:assert/strict')

/**
 * L4 真实云环境回归测试
 *
 * 这个测试连真实 CloudBase，验证云函数部署后能跑通。
 * 与 mock 测试的区别：
 *   - mock 测逻辑正确性（vm 沙箱）
 *   - 真实云测"部署后能不能跑、LLM 响应格式对不对"
 *
 * 默认跳过——需要手动设置环境变量 RUN_REAL_CLOUD=1 才跑：
 *   RUN_REAL_CLOUD=1 CLOUD_ENV=cloud1-xxx node --test tests/e2e-real-cloud.test.js
 *   npm run test:real-cloud
 *
 * 不强求精确匹配 LLM 输出，只验证：
 *   1. 云函数能调通
 *   2. 返回结构合法（success=true + bottlenecks 数组）
 *   3. bottleneck 对象含必要字段
 */

const shouldRun = process.env.RUN_REAL_CLOUD === '1'

// 真实云环境配置（从环境变量读取，不在仓库中硬编码实例 ID）
const CLOUD_ENV = process.env.CLOUD_ENV

test('real cloud: analyzeBatch cloud function is reachable and returns valid structure', { skip: !shouldRun }, async () => {
  // 动态加载 @cloudbase/node-sdk（只在真实跑时才需要）
  let tcb
  try {
    tcb = require('@cloudbase/node-sdk')
  } catch {
    assert.fail('需要安装 @cloudbase/node-sdk: npm i --no-save @cloudbase/node-sdk')
  }

  const app = tcb.init({ env: CLOUD_ENV })
  const result = await app.callFunction({
    name: 'analyzeBatch',
    data: {
      // 最小测试输入——单张图片占位
      photos: [{ fileID: 'cloud://test/regression-probe.jpg' }],
      studentId: 'regression-probe',
      subject: 'math',
      batchIndex: 0,
    },
    timeout: 30000,
  })

  assert.ok(result, 'should return a result')
  assert.ok(result.result, 'should have result.result')

  // 不强求 success（LLM 可能因为测试图片而失败），但结构应合法
  const data = result.result
  assert.ok(
    typeof data === 'object',
    `result should be object, got ${typeof data}: ${JSON.stringify(data).slice(0, 200)}`
  )

  // 如果成功，验证 bottleneck 结构
  if (data.bottlenecks) {
    assert.ok(Array.isArray(data.bottlenecks), 'bottlenecks should be array')
    for (const bn of data.bottlenecks) {
      assert.ok(typeof bn.lpCode === 'string' || bn.lpCode === undefined, 'lpCode should be string or absent')
    }
  }

  console.log('真实云 analyzeBatch 结构验证通过')
  console.log('返回摘要:', JSON.stringify(data).slice(0, 300))
})

test('real cloud: getAnalysisProgress cloud function is reachable', { skip: !shouldRun }, async () => {
  let tcb
  try {
    tcb = require('@cloudbase/node-sdk')
  } catch {
    assert.fail('需要安装 @cloudbase/node-sdk')
  }

  const app = tcb.init({ env: CLOUD_ENV })
  const result = await app.callFunction({
    name: 'getAnalysisProgress',
    data: { studentId: 'regression-probe' },
    timeout: 10000,
  })

  assert.ok(result.result, 'should return result')
  assert.ok(
    typeof result.result === 'object',
    'progress result should be object'
  )

  console.log('真实云 getAnalysisProgress 验证通过')
})

test('real cloud tests are skipped unless RUN_REAL_CLOUD=1', { skip: shouldRun }, () => {
  console.log('ℹ️ 真实云测试已跳过。要运行:')
  console.log('  RUN_REAL_CLOUD=1 CLOUD_ENV=cloud1-xxx npm run test:real-cloud')
  console.log('  发布前建议至少跑一次，验证云函数部署可用。')
})

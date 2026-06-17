const automator = require('miniprogram-automator')
const path = require('path')

async function main() {
  console.log('════════ 触发 maintenanceResetPapers ════════')
  const mp = await automator.launch({
    cliPath: '/Applications/wechatwebdevtools.app/Contents/MacOS/cli',
    projectPath: '/Users/qiming/Downloads/GoogleDrive/AI Learning/miniprogram-learning-diagnostic',
    timeout: 60000
  })

  try {
    // 先打开小程序首页确保云环境初始化
    await mp.reLaunch('/pages/index/index')
    await new Promise(r => setTimeout(r, 3000))

    // 第1步：先 list 看当前状态
    console.log('\n[第1步] 查看当前验证试卷...')
    const listResult = await mp.evaluate(async () => {
      const res = await wx.cloud.callFunction({
        name: 'maintenanceResetPapers',
        data: { action: 'list' }
      })
      return res.result
    })
    console.log('当前试卷:', JSON.stringify(listResult, null, 2))

    // 第2步：执行 resetAll
    console.log('\n[第2步] 执行清理 + 重生成...')
    const resetResult = await mp.evaluate(async () => {
      const res = await wx.cloud.callFunction({
        name: 'maintenanceResetPapers',
        data: { action: 'resetAll' }
      })
      return res.result
    })
    console.log('清理结果:', JSON.stringify(resetResult, null, 2))

    console.log('\n════════ 完成 ════════')
  } finally {
    await mp.close()
  }
}

main().catch(e => {
  console.error('执行失败:', e && (e.stack || e.message || String(e)))
  process.exit(1)
})

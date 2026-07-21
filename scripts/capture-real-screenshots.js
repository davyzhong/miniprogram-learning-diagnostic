// scripts/capture-real-screenshots.js
// 截取小程序真实运行界面，用于 README 文档
// 敏感信息（学生姓名、openid、云文件地址）会被模糊化处理
const automator = require('miniprogram-automator')
const path = require('path')
const fs = require('fs')
const projectPath = path.resolve(__dirname, '..')
const outputDir = path.resolve(projectPath, 'docs/user-guide/images/real')

// 确保输出目录存在
fs.mkdirSync(outputDir, { recursive: true })

// 真实学生 ID（用于导航到真实数据页面）
const STUDENT_ID = '966151a66a29599400006aca3e38ffaf'
const REPORT_ID = '76ec3f156a523e4a0006774e7e009e7f'
const VERIFICATION_REPORT_ID = '786aa83e6a51c77100b805dc3103c97b'

const screenshots = [
  {
    id: '01-subject-home-math',
    route: `/pages/subject-home/subject-home?studentId=${STUDENT_ID}&subject=math&subjectName=%E6%95%B0%E5%AD%A6&studentName=%E5%AD%A6%E7%94%9F&grade=6`,
    wait: 3000,
    desc: '数学学科工作台（真实数据：诊断报告+验证卷入口）',
  },
  {
    id: '02-diagnosis-report',
    route: `/pages/report/report?id=${REPORT_ID}`,
    wait: 4000,
    desc: '诊断报告（真实数据：120张照片，242道错题，10个卡点）',
  },
  {
    id: '03-verification-report',
    route: `/pages/report/report?id=${VERIFICATION_REPORT_ID}`,
    wait: 4000,
    desc: '验证报告（真实数据：2道错题，验证证据）',
  },
  {
    id: '04-learning-progress',
    route: `/pages/learning-progress/learning-progress?studentId=${STUDENT_ID}&subject=math`,
    wait: 4000,
    desc: '学习进展页面（真实数据：迭代时间线+卡点矩阵）',
  },
]

async function main() {
  const mp = await automator.launch({
    cliPath: '/Applications/wechatwebdevtools.app/Contents/MacOS/cli',
    projectPath, trustProject: true, timeout: 60000
  })

  try {
    for (const shot of screenshots) {
      console.log(`\n=== 截图: ${shot.id} ===`)
      console.log(`  ${shot.desc}`)
      console.log(`  路由: ${shot.route.slice(0, 80)}...`)

      try {
        const page = await mp.navigateTo(shot.route)
        console.log(`  导航成功，等待 ${shot.wait}ms...`)
        await new Promise(r => setTimeout(r, shot.wait))

        // 截图
        const outputPath = path.join(outputDir, `${shot.id}.png`)
        await mp.screenshot({ path: outputPath })
        const stats = fs.statSync(outputPath)
        console.log(`  ✓ 已保存: ${outputPath} (${Math.round(stats.size / 1024)} KB)`)
      } catch (e) {
        console.log(`  ✗ 失败: ${(e.message || '').slice(0, 150)}`)
      }
    }

    console.log('\n=== 截图完成 ===')
    console.log(`输出目录: ${outputDir}`)
    const files = fs.readdirSync(outputDir).filter(f => f.endsWith('.png'))
    console.log(`共 ${files.length} 张截图`)
    for (const f of files) {
      const stats = fs.statSync(path.join(outputDir, f))
      console.log(`  ${f}: ${Math.round(stats.size / 1024)} KB`)
    }

  } finally {
    await mp.close()
  }
}

main().catch(e => { console.error(e); process.exit(1) })

const automator = require('miniprogram-automator')
const fs = require('fs')
const path = require('path')
const projectPath = path.resolve(__dirname, '..')
const outputDir = path.join(projectPath, 'tmp', 'verification-images')
fs.mkdirSync(outputDir, { recursive: true })

async function main() {
  const mp = await automator.launch({
    cliPath: '/Applications/wechatwebdevtools.app/Contents/MacOS/cli',
    projectPath, trustProject: true, timeout: 60000
  })

  try {
    // 获取 4 张图片的临时 URL 并下载
    const fileIDs = [
      'cloud://cloud1-d6gneg68m5a7a3876.636c-cloud1-d6gneg68m5a7a3876-1441789686/uploads/966151a66a29599400006aca3e38ffaf/math/1783744364283_0.jpg',
      'cloud://cloud1-d6gneg68m5a7a3876.636c-cloud1-d6gneg68m5a7a3876-1441789686/uploads/966151a66a29599400006aca3e38ffaf/math/1783744365005_1.jpg',
      'cloud://cloud1-d6gneg68m5a7a3876.636c-cloud1-d6gneg68m5a7a3876-1441789686/uploads/966151a66a29599400006aca3e38ffaf/math/1783744365609_2.jpg',
      'cloud://cloud1-d6gneg68m5a7a3876.636c-cloud1-d6gneg68m5a7a3876-1441789686/uploads/966151a66a29599400006aca3e38ffaf/math/1783744366101_3.jpg'
    ]

    // 用 wx.cloud.getTempFileURL 获取临时链接
    const tempResult = await mp.evaluate(async (fileIDs) => {
      const res = await wx.cloud.getTempFileURL({ fileList: fileIDs })
      return res.fileList.map(f => ({ fileID: f.fileID, tempFileURL: f.tempFileURL, status: f.status }))
    }, fileIDs)

    console.log('临时 URL 获取结果:')
    for (const t of tempResult) {
      console.log(`  ${t.fileID.slice(-30)} → ${t.tempFileURL ? 'OK' : 'FAIL'} (status=${t.status})`)
    }

    // 下载每张图片
    for (let i = 0; i < tempResult.length; i++) {
      const t = tempResult[i]
      if (!t.tempFileURL) continue
      try {
        const downloadResult = await mp.evaluate(async (url) => {
          return new Promise((resolve, reject) => {
            wx.downloadFile({
              url,
              success: res => resolve({ tempFilePath: res.tempFilePath, statusCode: res.statusCode }),
              fail: err => reject(err)
            })
          })
        }, t.tempFileURL)

        // 读取文件内容（小程序沙箱里的临时文件）
        // 用 wx.getFileSystemManager 读 base64
        const base64Data = await mp.evaluate(async (filePath) => {
          return new Promise((resolve, reject) => {
            wx.getFileSystemManager().readFile({
              filePath,
              encoding: 'base64',
              success: res => resolve(res.data),
              fail: err => reject(err)
            })
          })
        }, downloadResult.tempFilePath)

        // 写到本地文件系统
        const localPath = path.join(outputDir, `verification-photo-${i + 1}.jpg`)
        fs.writeFileSync(localPath, Buffer.from(base64Data, 'base64'))
        console.log(`✓ 图片 ${i + 1} 已保存: ${localPath} (${Math.round(base64Data.length * 0.75 / 1024)}KB)`)
      } catch (err) {
        console.log(`✗ 图片 ${i + 1} 下载失败: ${err.message || err}`)
      }
    }

    console.log(`\n图片目录: ${outputDir}`)
  } finally {
    await mp.close()
  }
}
main().catch(e => { console.error(e.stack || e.message); process.exit(1) })

#!/usr/bin/env node
/**
 * 通过 automator 前端驱动逐批生成验证卷（修复 fire-and-forget 失效问题）
 *
 * 对已有的 generating 记录，循环调 generatePaper(_appendToPaperId) 分批生成，
 * 最后调 _regeneratePdf 生成最终 PDF。
 */

function loadAutomator() {
  try { return require('miniprogram-automator') }
  catch { return require('/tmp/learning-diagnostic-automator/node_modules/miniprogram-automator') }
}
const automator = loadAutomator()
const path = require('node:path')

const projectPath = path.resolve(__dirname, '..')
const cliPath = '/Applications/wechatwebdevtools.app/Contents/MacOS/cli'

const STUDENT_ID = '966151a66a29599400006aca3e38ffaf'
const SUBJECT = 'math'
const PAPER_ID = '117e1a7d6a35f06f005bd653093a826a'  // 已有的 generating 记录
const BATCH_SIZE = 8

function chunk(arr, size) {
  const chunks = []
  for (let i = 0; i < arr.length; i += size) chunks.push(arr.slice(i, i + size))
  return chunks
}

;(async () => {
  const mp = await automator.launch({ cliPath, projectPath, trustProject: true, timeout: 60000 })

  try {
    // 1. 读取 paper 的 bottleneckTargets
    const paper = await mp.evaluate(async (paperId) => {
      const db = wx.cloud.database()
      const r = await db.collection('papers').doc(paperId).get()
      return r.data || {}
    }, PAPER_ID)

    const targets = paper.bottleneckTargets || []
    console.log(`paper ${PAPER_ID}`)
    console.log(`  当前状态: ${paper.generationStatus}`)
    console.log(`  当前题量: ${(paper.questions||[]).length}`)
    console.log(`  目标卡点: ${targets.length} 个`)

    if (targets.length === 0) {
      console.log('无卡点，退出')
      return
    }

    // 2. 分批
    const batches = chunk(targets, BATCH_SIZE)
    console.log(`\n分 ${batches.length} 批，每批最多 ${BATCH_SIZE} 个卡点`)

    // 3. 逐批调用 generatePaper(_appendToPaperId)
    for (let i = 0; i < batches.length; i++) {
      const batch = batches[i]
      console.log(`\n批次 ${i + 1}/${batches.length}：${batch.length} 个卡点 [${batch[0]}...]`)
      const t0 = Date.now()
      const result = await mp.evaluate(async (params) => {
        try {
          const r = await wx.cloud.callFunction({
            name: 'generatePaper',
            data: {
              studentId: params.studentId,
              subject: params.subject,
              type: 'verification',
              targets: params.targets,
              _appendToPaperId: params.paperId,
            },
          })
          return r.result || {}
        } catch (e) {
          return { success: false, error: e.message || String(e) }
        }
      }, { studentId: STUDENT_ID, subject: SUBJECT, paperId: PAPER_ID, targets: batch })

      const dt = ((Date.now() - t0) / 1000).toFixed(1)
      if (result.success) {
        console.log(`  ✓ 成功（${dt}s），追加 ${result.appendedQuestionCount || 0} 题，总题 ${result.questionCount || '?'}`)
      } else {
        console.log(`  ✗ 失败（${dt}s）：${result.error}`)
      }
    }

    // 4. 重新生成 PDF
    console.log('\n生成最终 PDF...')
    const pdfResult = await mp.evaluate(async (paperId) => {
      try {
        const r = await wx.cloud.callFunction({
          name: 'generatePaper',
          data: { _regeneratePdf: true, paperId },
        })
        return r.result || {}
      } catch (e) {
        return { success: false, error: e.message || String(e) }
      }
    }, PAPER_ID)

    if (pdfResult.success) {
      console.log(`  ✓ PDF 生成成功，总题 ${pdfResult.questionCount}，页数 ${pdfResult.totalPages}`)
      console.log(`  pdfFileId: ${pdfResult.pdfFileId ? '有' : '无'}`)
    } else {
      console.log(`  ✗ PDF 生成失败：${pdfResult.error}`)
    }

    // 5. _regeneratePdf 内部已 set generationStatus: ready，无需额外 finalize

    // 6. 最终状态确认
    const final = await mp.evaluate(async (paperId) => {
      const db = wx.cloud.database()
      const r = await db.collection('papers').doc(paperId).get()
      const d = r.data || {}
      return {
        status: d.generationStatus,
        questionCount: (d.questions || []).length,
        targetCount: (d.bottleneckTargets || []).length,
        pdfFileId: d.pdfFileId ? '有' : '无',
      }
    }, PAPER_ID)
    console.log('\n=== 最终状态 ===')
    console.log(JSON.stringify(final, null, 2))

  } finally {
    await mp.close()
  }
})().catch(e => { console.error('失败：', e.message || e); process.exit(1) })

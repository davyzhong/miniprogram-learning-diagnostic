#!/usr/bin/env node
/**
 * 补生成遗漏的卡点题目（追加到已有验证卷）
 *
 * 用法：
 *   node scripts/supplement-verification-batches.js
 *
 * 会自动查出哪些卡点没有题目，分批补生成，最后重新生成 PDF。
 */

function loadAutomator() {
  try { return require('miniprogram-automator') }
  catch { return require('/tmp/learning-diagnostic-automator/node_modules/miniprogram-automator') }
}
const automator = loadAutomator()
const path = require('path')

const projectPath = path.resolve(__dirname, '..')
const cliPath = '/Applications/wechatwebdevtools.app/Contents/MacOS/cli'

const STUDENT_ID = '966151a66a29599400006aca3e38ffaf'
const SUBJECT = 'math'
const PAPER_ID = '117e1a7d6a35f06f005bd653093a826a'
const BATCH_SIZE = 6  // 补生成用小批量，降低超时风险

function chunk(arr, size) {
  const chunks = []
  for (let i = 0; i < arr.length; i += size) chunks.push(arr.slice(i, i + size))
  return chunks
}

;(async () => {
  const mp = await automator.launch({ cliPath, projectPath, trustProject: true, timeout: 60000 })

  try {
    // 1. 读当前 paper，找出遗漏卡点
    const paper = await mp.evaluate(async (paperId) => {
      const db = wx.cloud.database()
      const r = await db.collection('papers').doc(paperId).get()
      return r.data || {}
    }, PAPER_ID)

    const allTargets = paper.bottleneckTargets || []
    const covered = new Set()
    for (const q of (paper.questions || [])) {
      if (q.lpCode) covered.add(q.lpCode)
      if (q.targetId) covered.add(q.targetId)
    }
    const missing = allTargets.filter(t => !covered.has(t))

    console.log(`当前: ${allTargets.length} 目标, ${covered.size} 已覆盖, ${missing.length} 遗漏`)
    if (missing.length === 0) {
      console.log('无遗漏，退出')
      return
    }
    console.log('遗漏卡点:', JSON.stringify(missing))

    // 2. 分批补生成
    const batches = chunk(missing, BATCH_SIZE)
    console.log(`\n分 ${batches.length} 批补生成（每批 ${BATCH_SIZE} 个）`)

    for (let i = 0; i < batches.length; i++) {
      const batch = batches[i]
      console.log(`\n补批次 ${i + 1}/${batches.length}：${batch.length} 个 [${batch[0]}...]`)
      const t0 = Date.now()
      const result = await mp.evaluate(async (params) => {
        try {
          const r = await wx.cloud.callFunction({
            name: 'generatePaper',
            data: {
              studentId: params.studentId, subject: params.subject, type: 'verification',
              targets: params.targets, _appendToPaperId: params.paperId,
            },
          })
          return r.result || {}
        } catch (e) {
          return { success: false, error: e.message || String(e) }
        }
      }, { studentId: STUDENT_ID, subject: SUBJECT, paperId: PAPER_ID, targets: batch })

      const dt = ((Date.now() - t0) / 1000).toFixed(1)
      if (result.success) {
        console.log(`  ✓ ${dt}s，追加 ${result.appendedQuestionCount || 0} 题，总题 ${result.questionCount || '?'}`)
      } else {
        console.log(`  ✗ ${dt}s：${result.error}`)
      }
    }

    // 3. 重新生成 PDF
    console.log('\n重新生成 PDF...')
    const pdfResult = await mp.evaluate(async (paperId) => {
      try {
        const r = await wx.cloud.callFunction({ name: 'generatePaper', data: { _regeneratePdf: true, paperId } })
        return r.result || {}
      } catch (e) { return { success: false, error: e.message || String(e) } }
    }, PAPER_ID)

    if (pdfResult.success) {
      console.log(`✓ PDF 成功，总题 ${pdfResult.questionCount}，页数 ${pdfResult.totalPages}`)
    } else {
      console.log(`✗ PDF 失败：${pdfResult.error}`)
    }

    // 4. 最终统计
    const final = await mp.evaluate(async (paperId) => {
      const db = wx.cloud.database()
      const r = await db.collection('papers').doc(paperId).get()
      const d = r.data || {}
      const qs = d.questions || []
      const byCode = {}
      for (const q of qs) { const c = q.lpCode || q.targetId || '?'; byCode[c] = (byCode[c]||0)+1 }
      const dist = {}
      for (const c of Object.values(byCode)) dist[c] = (dist[c]||0)+1
      return {
        status: d.generationStatus,
        targets: (d.bottleneckTargets||[]).length,
        questions: qs.length,
        covered: Object.keys(byCode).length,
        pages: d.totalPages,
        dist,
      }
    }, PAPER_ID)
    console.log('\n=== 最终结果 ===')
    console.log(JSON.stringify(final, null, 2))

  } finally {
    await mp.close()
  }
})().catch(e => { console.error('失败：', e.message || e); process.exit(1) })

const automator = require('miniprogram-automator')
const path = require('path')
const projectPath = path.resolve(__dirname, '..')

async function main() {
  const mp = await automator.launch({
    cliPath: '/Applications/wechatwebdevtools.app/Contents/MacOS/cli',
    projectPath, trustProject: true, timeout: 60000
  })

  try {
    // 查报告里存的完整数据：imageFiles、errorDetails、pageResults
    const data = await mp.evaluate(async () => {
      const db = wx.cloud.database()
      const res = await db.collection('reports').doc('786aa83e6a51c77100b805dc3103c97b').get()
      const r = res.data

      // 也查关联的试卷内容，看验证卷的题目是什么
      let paperQuestions = null
      try {
        const paperRes = await db.collection('papers').doc(r.paperId).get()
        const p = paperRes.data
        paperQuestions = {
          paperCode: p.paperCode,
          paperDisplayCode: p.paperDisplayCode,
          bottleneckTargets: p.bottleneckTargets || [],
          questionCount: p.questionCount,
          questions: (p.questions || []).slice(0, 10).map(q => ({
            question: (q.question || q.stem || q.content || '').slice(0, 150),
            answer: q.answer || q.correctAnswer || '',
            lpCode: q.lpCode || q.bottleneckCode || ''
          }))
        }
      } catch(e) { paperQuestions = { error: e.message } }

      return JSON.parse(JSON.stringify({
        report: {
          status: r.status,
          type: r.type,
          totalErrors: r.totalErrors,
          summary: r.summary,
          imageFiles: (r.imageFiles || []).map(f => ({
            fileID: f.fileID,
            fileName: f.fileName || '',
            ocrSummary: (f.ocrSummary || '').slice(0, 200),
            isDuplicate: f.isDuplicate || false,
            uploadedAt: f.uploadedAt
          })),
          errorDetails: (r.errorDetails || []).map(e => ({
            question: (e.question || e.questionContent || '').slice(0, 120),
            studentAnswer: e.studentAnswer || '',
            correctAnswer: e.correctAnswer || '',
            lpName: e.lpName || e.displayName || '',
            rootCause: (e.rootCause || '').slice(0, 150),
            pageImageIndex: e.pageImageIndex || e.imageIndex || ''
          })),
          verificationEvidence: (r.verificationEvidence || []).map(ve => ({
            lpCode: ve.lpCode,
            lpName: ve.lpName || '',
            complete: ve.complete,
            allCorrect: ve.allCorrect,
            errorCount: ve.errorCount || 0,
            targetQuestionCount: ve.targetQuestionCount || ve.expectedQuestionCount || 0
          })),
          pageResults: (r.pageResults || []).map(pr => ({
            imageIndex: pr.imageIndex,
            fileID: (pr.fileID || '').slice(0, 60),
            errors: (pr.errors || []).length,
            ocrSummary: (pr.ocrSummary || '').slice(0, 100)
          }))
        },
        paperQuestions
      }))
    })

    console.log('=== 报告关联的图片 ===')
    for (const f of data.report.imageFiles) {
      console.log(`  ${f.fileName || '(无文件名)'}`)
      console.log(`    fileID: ${f.fileID}`)
      console.log(`    OCR摘要: ${f.ocrSummary || '(无)'}`)
      console.log(`    重复: ${f.isDuplicate}`)
    }

    console.log(`\n=== pageResults (${data.report.pageResults.length} 页) ===`)
    for (const pr of data.report.pageResults) {
      console.log(`  图片${pr.imageIndex}: ${pr.errors}个错题 | OCR: ${pr.ocrSummary}`)
    }

    console.log(`\n=== 验证卷原始题目 ===`)
    if (data.paperQuestions && data.paperQuestions.questions) {
      for (let i = 0; i < data.paperQuestions.questions.length; i++) {
        const q = data.paperQuestions.questions[i]
        console.log(`  题${i+1}: ${q.question}`)
        console.log(`    标准答案: ${q.answer} | 卡点: ${q.lpCode}`)
      }
    }

    console.log(`\n=== AI 分析的错题（应该对应图片内容）===`)
    for (let i = 0; i < data.report.errorDetails.length; i++) {
      const e = data.report.errorDetails[i]
      console.log(`  错题${i+1} (图片${e.pageImageIndex || '?'}): ${e.question}`)
      console.log(`    答:${e.studentAnswer} 正确:${e.correctAnswer} 卡点:${e.lpName}`)
      console.log(`    根因: ${e.rootCause}`)
    }

    console.log(`\n=== 验证证据（按卡点判定）===`)
    for (const ve of data.report.verificationEvidence) {
      const verdict = ve.allCorrect ? '✓全对' : `✗有${ve.errorCount}错`
      console.log(`  ${ve.lpName || ve.lpCode}: ${verdict} (complete=${ve.complete})`)
    }

  } finally {
    await mp.close()
  }
}
main().catch(e => { console.error(e.stack || e.message); process.exit(1) })

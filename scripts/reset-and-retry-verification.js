// scripts/reset-and-retry-verification.js
// 重置验证报告状态并重新分析，用于测试 glm-5v-turbo 模型
const automator = require('miniprogram-automator')
const path = require('path')
const projectPath = path.resolve(__dirname, '..')

const REPORT_ID = '786aa83e6a51c77100b805dc3103c97b'

async function main() {
  const mp = await automator.launch({
    cliPath: '/Applications/wechatwebdevtools.app/Contents/MacOS/cli',
    projectPath, trustProject: true, timeout: 60000
  })

  try {
    // 1. 先看当前报告状态
    console.log('=== 当前报告状态 ===')
    const beforeStatus = await mp.evaluate(async (reportId) => {
      const db = wx.cloud.database()
      const _ = db.command
      const reportRes = await db.collection('reports').doc(reportId).get()
      const r = reportRes.data

      // 查关联的 analysisTasks
      const tasksRes = await db.collection('analysisTasks')
        .where({ reportId }).orderBy('createdAt', 'desc').limit(1).get()
      const t = (tasksRes.data || [])[0] || {}

      return JSON.parse(JSON.stringify({
        reportStatus: r.status,
        totalErrors: r.totalErrors || 0,
        taskStatus: t.status,
        taskId: t._id,
        completedBatches: t.completedBatches,
        totalBatches: t.totalBatches,
        taskUpdatedAt: t.updatedAt
      }))
    }, REPORT_ID)
    console.log(JSON.stringify(beforeStatus, null, 2))

    // 2. 重置报告状态为 pending，重置 task 状态
    console.log('\n=== 重置报告和 task 状态 ===')
    const resetResult = await mp.evaluate(async (reportId) => {
      const db = wx.cloud.database()
      const _ = db.command

      // 重置报告
      await db.collection('reports').doc(reportId).update({
        data: {
          status: 'pending',
          totalErrors: null,
          summary: '',
          bottlenecks: [],
          errorDetails: [],
          pageResults: [],
          verificationEvidence: [],
          verificationPageEvidence: [],
          updatedAt: db.serverDate()
        }
      })

      // 重置关联的 task
      const tasksRes = await db.collection('analysisTasks')
        .where({ reportId }).orderBy('createdAt', 'desc').limit(1).get()
      const t = (tasksRes.data || [])[0]
      if (t) {
        await db.collection('analysisTasks').doc(t._id).update({
          data: {
            status: 'pending',
            completedBatches: 0,
            batchResults: [],
            updatedAt: db.serverDate()
          }
        })
        return { reset: true, taskId: t._id }
      }
      return { reset: true, taskId: null }
    }, REPORT_ID)
    console.log('重置结果:', JSON.stringify(resetResult))

    // 3. 触发 analyzePhotos
    console.log('\n=== 触发 analyzePhotos ===')
    const triggerResult = await mp.evaluate(async (reportId) => {
      try {
        const res = await wx.cloud.callFunction({
          name: 'analyzePhotos',
          data: { reportId },
        })
        return JSON.parse(JSON.stringify({ ok: true, result: res.result }))
      } catch (err) {
        return { ok: false, error: (err.message || '').slice(0, 300) }
      }
    }, REPORT_ID)
    console.log('触发结果:', JSON.stringify(triggerResult, null, 2).slice(0, 500))

    // 4. 轮询状态（每 15 秒，最多 5 分钟）
    console.log('\n=== 轮询分析状态 ===')
    for (let i = 0; i < 20; i++) {
      await new Promise(r => setTimeout(r, 15000))
      const status = await mp.evaluate(async (reportId) => {
        const db = wx.cloud.database()
        const reportRes = await db.collection('reports').doc(reportId).get()
        const r = reportRes.data
        const tasksRes = await db.collection('analysisTasks')
          .where({ reportId }).orderBy('createdAt', 'desc').limit(1).get()
        const t = (tasksRes.data || [])[0] || {}
        return JSON.parse(JSON.stringify({
          reportStatus: r.status,
          totalErrors: r.totalErrors || 0,
          error: (r.error || '').slice(0, 200),
          summary: (r.summary || '').slice(0, 100),
          taskStatus: t.status,
          completedBatches: t.completedBatches,
          totalBatches: t.totalBatches,
          batchResults: (t.batchResults || []).map(br => ({
            success: br.success,
            retry: br.retryAttempt,
            error: (br.error || '').slice(0, 150)
          })),
          taskUpdatedAt: t.updatedAt
        }))
      }, REPORT_ID)
      console.log(`[${(i+1)*15}s] report=${status.reportStatus} task=${status.taskStatus} 批次=${status.completedBatches}/${status.totalBatches}`)

      if (status.batchResults.length > 0) {
        for (const br of status.batchResults) {
          console.log(`  批次: success=${br.success} retry=${br.retry} ${br.error}`)
        }
      }
      if (status.reportStatus === 'completed') {
        console.log(`\n✓✓✓ 分析完成！`)
        console.log(`错题数: ${status.totalErrors}`)
        console.log(`摘要: ${status.summary}`)
        break
      }
      if (status.reportStatus === 'failed') {
        console.log(`\n✗ 分析失败: ${status.error}`)
        break
      }
    }

    // 5. 如果完成，查验证报告详情
    console.log('\n=== 查看验证结果详情 ===')
    const detail = await mp.evaluate(async (reportId) => {
      const db = wx.cloud.database()
      const reportRes = await db.collection('reports').doc(reportId).get()
      const r = reportRes.data
      return JSON.parse(JSON.stringify({
        status: r.status,
        totalErrors: r.totalErrors,
        errorDetails: (r.errorDetails || []).slice(0, 15).map(e => ({
          questionContent: (e.questionContent || '').slice(0, 100),
          studentAnswer: (e.studentAnswer || '').slice(0, 50),
          correctAnswer: (e.correctAnswer || '').slice(0, 50),
          lpCode: e.lpCode || '',
          imageIndex: e.imageIndex || e.sourceImageIndex || 0
        })),
        verificationEvidence: (r.verificationEvidence || []).map(v => ({
          lpCode: v.lpCode,
          attemptedQuestionCount: v.attemptedQuestionCount,
          incorrectQuestionCount: v.incorrectQuestionCount,
          evidenceStatus: v.evidenceStatus,
          allCorrect: v.allCorrect
        })),
        verificationPageEvidence: (r.verificationPageEvidence || []).map(p => ({
          pageCode: p.pageCode,
          attemptedQuestionCount: p.attemptedQuestionCount,
          incorrectQuestionCount: p.incorrectQuestionCount
        }))
      }))
    }, REPORT_ID)
    console.log(JSON.stringify(detail, null, 2))

  } finally {
    await mp.close()
  }
}

main().catch(e => { console.error(e.stack || e.message); process.exit(1) })

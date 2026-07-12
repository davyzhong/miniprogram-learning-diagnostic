// scripts/aggregate-and-reanalyze.js
// 把所有历史数学诊断报告的图片合并成一份新报告，用 qwen3.5-plus 重新分析
const automator = require('miniprogram-automator')
const path = require('path')
const projectPath = path.resolve(__dirname, '..')

const STUDENT_ID = '966151a66a29599400006aca3e38ffaf'

async function main() {
  const mp = await automator.launch({
    cliPath: '/Applications/wechatwebdevtools.app/Contents/MacOS/cli',
    projectPath, trustProject: true, timeout: 60000
  })

  try {
    // 1. 收集所有历史报告的图片 fileID
    console.log('=== 收集历史图片 ===')
    const collected = await mp.evaluate(async (studentId) => {
      const db = wx.cloud.database()
      const _ = db.command

      // 获取所有数学诊断报告
      const allReports = []
      let offset = 0
      while (true) {
        const res = await db.collection('reports').where({
          studentId, subject: 'math', type: 'diagnosis'
        }).orderBy('createdAt', 'asc').skip(offset).limit(100).get()
        if (res.data.length === 0) break
        allReports.push(...res.data)
        offset += res.data.length
        if (res.data.length < 100) break
      }

      // 收集所有不重复的 fileID + imageFiles 元数据
      const seenFileIDs = new Set()
      const imageFiles = []
      let sourceReportIds = []

      for (const r of allReports) {
        if (r.isArchived) continue
        sourceReportIds.push(r._id)
        const fileIDs = r.imageFileIds || []
        const fileMeta = new Map((r.imageFiles || []).map(f => [f.fileID, f]))
        for (const fid of fileIDs) {
          if (!seenFileIDs.has(fid)) {
            seenFileIDs.add(fid)
            const meta = fileMeta.get(fid) || {}
            imageFiles.push({
              fileID: fid,
              fileName: meta.fileName || '',
              fileSize: Number(meta.fileSize) || 0,
              uploadedAt: meta.uploadedAt || r.createdAt || '',
            })
          }
        }
      }

      return JSON.parse(JSON.stringify({
        reportCount: allReports.length,
        sourceReportIds,
        uniqueImages: seenFileIDs.size,
        imageFiles,
        openId: (allReports[0] || {})._openid || '',
      }))
    }, STUDENT_ID)

    console.log(`历史报告: ${collected.reportCount} 份`)
    console.log(`不重复图片: ${collected.uniqueImages} 张`)
    console.log(`openid: ${collected.openId}`)

    // 2. 创建一份新的汇总诊断报告
    console.log('\n=== 创建汇总报告 ===')
    const created = await mp.evaluate(async (params) => {
      const db = wx.cloud.database()
      const nowStr = new Date().toISOString()

      const report = {
        studentId: params.studentId,
        subject: 'math',
        subjectName: '数学',
        type: 'diagnosis',
        mode: 'diagnosis',
        sourceType: 'history-aggregate',
        imageFileIds: params.imageFiles.map(f => f.fileID),
        imageFiles: params.imageFiles,
        status: 'pending',
        error: '',
        summary: '',
        totalErrors: 0,
        bottlenecks: [],
        errorDetails: [],
        comparisonSummary: '',
        verificationTargets: [],
        verificationEvidence: [],
        quality: null,
        isEffective: false,
        partialSuccess: false,
        failedBatchCount: 0,
        failedImageFiles: [],
        evidenceTime: nowStr,
        createdAt: nowStr,
        updatedAt: nowStr,
        reanalysis: {
          version: 'math-full-reanalysis-qwen35',
          sourceReportIds: params.sourceReportIds,
          sourceReportCount: params.sourceReportIds.length,
          imageCount: params.imageFiles.length,
          startedAt: nowStr,
          status: 'aggregate_created',
          aggregateCurrentSnapshot: true,
        }
      }

      const addRes = await db.collection('reports').add({ data: report })
      return { reportId: addRes._id }
    }, { studentId: STUDENT_ID, openId: collected.openId, imageFiles: collected.imageFiles, sourceReportIds: collected.sourceReportIds })

    console.log(`汇总报告 ID: ${created.reportId}`)

    // 3. 触发 analyzePhotos 分析这份汇总报告
    console.log('\n=== 触发分析 ===')
    const trigger = await mp.evaluate(async (reportId) => {
      try {
        const res = await wx.cloud.callFunction({ name: 'analyzePhotos', data: { reportId } })
        return JSON.parse(JSON.stringify({ ok: true, result: res.result }))
      } catch (err) {
        return { ok: false, error: (err.message || '').slice(0, 200) }
      }
    }, created.reportId)
    console.log(`触发: ${trigger.ok ? '成功' : '失败'} ${trigger.ok ? JSON.stringify(trigger.result) : trigger.error}`)

    // 4. 轮询（最多 90 分钟，因为 320 张图约 80 分钟）
    console.log('\n=== 轮询分析进度 ===')
    let lastBatches = -1
    for (let i = 0; i < 360; i++) {
      await new Promise(r => setTimeout(r, 15000))
      const status = await mp.evaluate(async (reportId) => {
        const db = wx.cloud.database()
        const r = (await db.collection('reports').doc(reportId).get()).data
        const tasksRes = await db.collection('analysisTasks')
          .where({ reportId }).orderBy('createdAt', 'desc').limit(1).get()
        const t = (tasksRes.data || [])[0] || {}
        return JSON.parse(JSON.stringify({
          reportStatus: r.status,
          completedBatches: t.completedBatches || 0,
          totalBatches: t.totalBatches || 0,
          totalErrors: r.totalErrors || 0,
          summary: (r.summary || '').slice(0, 80),
          error: (r.error || '').slice(0, 100),
        }))
      }, created.reportId)

      if (status.completedBatches !== lastBatches) {
        console.log(`[${(i+1)*15}s] ${status.reportStatus} 批次=${status.completedBatches}/${status.totalBatches} 错题=${status.totalErrors}`)
        lastBatches = status.completedBatches
      }

      if (status.reportStatus === 'completed') {
        console.log(`\n✓✓✓ 分析完成！`)
        console.log(`错题数: ${status.totalErrors}`)
        console.log(`摘要: ${status.summary}`)

        // 显示卡点
        const detail = await mp.evaluate(async (reportId) => {
          const db = wx.cloud.database()
          const r = (await db.collection('reports').doc(reportId).get()).data
          return JSON.parse(JSON.stringify({
            totalErrors: r.totalErrors,
            bottlenecks: (r.bottlenecks || []).map(b => ({
              lpCode: b.lpCode, lpName: b.lpName, errorCount: b.errorCount, severity: b.severity
            })),
            errorDetailCount: (r.errorDetails || []).length,
          }))
        }, created.reportId)
        console.log('\n=== 诊断结果 ===')
        console.log(JSON.stringify(detail, null, 2))
        break
      }
      if (status.reportStatus === 'failed') {
        console.log(`\n✗ 分析失败: ${status.error}`)
        break
      }
    }

    // 5. 归档旧报告
    console.log('\n=== 归档旧报告 ===')
    const archived = await mp.evaluate(async (params) => {
      const db = wx.cloud.database()
      let count = 0
      for (const rid of params.sourceReportIds) {
        await db.collection('reports').doc(rid).update({
          data: { isArchived: true, replacedByReportId: params.aggregateReportId }
        })
        count++
      }
      return { archived: count }
    }, { sourceReportIds: collected.sourceReportIds, aggregateReportId: created.reportId })
    console.log(`已归档 ${archived.archived} 份旧报告`)

  } finally {
    await mp.close()
  }
}

main().catch(e => { console.error(e); process.exit(1) })

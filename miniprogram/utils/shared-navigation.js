// miniprogram/utils/shared-navigation.js
// Shared navigation methods for index and student-profile pages.
// Both pages display the same learning profile home view and need identical
// navigation handlers. The only difference is the student-id data field name
// (activeStudentId on index, studentId on student-profile), resolved by getStudentId().

const { getSubjectName } = require('./constants')
const { createPoller } = require('./poller')

// 验证卷轮询：每 5 秒一次，最多 24 次（2 分钟）
const VERIFICATION_POLL_INTERVAL = 5000
const VERIFICATION_POLL_MAX_ATTEMPTS = 24

const OWNER_PERMISSIONS = {
  canView: true,
  canManageParents: true,
  canUpload: true,
  canGeneratePaper: true,
  canRetryAnalysis: true
}

function getStudentId(page) {
  return (page.data.activeStudent || {})._id || page.data.activeStudentId || page.data.studentId || ''
}

function getStudent(page) {
  return page.data.activeStudent || {}
}

const sharedNavigation = {
  onParentManagement() {
    const studentId = getStudentId(this)
    if (!studentId) {
      wx.showToast({ title: '缺少孩子档案信息', icon: 'none' })
      return
    }
    const url = `/pages/parent-management/parent-management?studentId=${studentId}`
    wx.navigateTo({
      url,
      fail: error => {
        console.error('打开家长管理失败', error)
        wx.redirectTo({
          url,
          fail: redirectError => {
            console.error('重定向家长管理失败', redirectError)
            const message = redirectError && redirectError.errMsg
              ? redirectError.errMsg.replace(/^redirectTo:fail\s*/i, '').slice(0, 18)
              : '请重新编译后再试'
            wx.showToast({ title: message || '家长管理暂时打不开', icon: 'none' })
          }
        })
      }
    })
  },

  navigateToSubject(subject) {
    const student = getStudent(this)
    const studentId = getStudentId(this)
    const subjectName = getSubjectName(subject, '数学')
    wx.navigateTo({
      url: `/pages/subject-home/subject-home?studentId=${student._id || studentId}&subject=${subject}&subjectName=${encodeURIComponent(subjectName)}&studentName=${encodeURIComponent(student.name || '')}&grade=${student.grade || ''}`
    })
  },

  onObservationTap(e) {
    this.navigateToSubject(e.currentTarget.dataset.subject || 'math')
  },

  onHighlightTap(e) {
    this.navigateToSubject(e.currentTarget.dataset.subject || 'math')
  },

  onSubjectTap(e) {
    this.navigateToSubject(e.currentTarget.dataset.subject || e.currentTarget.dataset.key || 'math')
  },

  onTraceableUrlTap(e) {
    const url = e.currentTarget.dataset.url || ''
    if (!url) {
      wx.showToast({ title: '暂时没有可查看内容', icon: 'none' })
      return
    }
    wx.navigateTo({ url })
  },

  onViewAllRecords() {
    const student = getStudent(this)
    const studentId = getStudentId(this)
    wx.navigateTo({
      url: `/pages/upload-history/upload-history?studentId=${student._id || studentId}&studentName=${encodeURIComponent(student.name || '')}`
    })
  },

  findHomeBottleneck(subject, lpCode) {
    const home = this.data.home || {}
    return (home.priorityBottlenecks || []).find(item =>
      item.subject === subject && item.lpCode === lpCode
    ) || null
  },

  onViewAllBottlenecks() {
    const student = getStudent(this)
    const studentId = getStudentId(this)
    wx.navigateTo({
      url: `/pages/bottleneck-center/bottleneck-center?studentId=${student._id || studentId}&studentName=${encodeURIComponent(student.name || '')}`
    })
  },

  /**
   * 验证卷统一入口（委托给纯函数 navigateToVerificationPaper）
   * 所有页面的"查看验证卷"按钮都应调用此方法，保证入口逻辑统一。
   */
  async navigateToVerificationByStatus(studentId, subject, subjectName, studentName, reportId = '') {
    let cloudModule = this._cloud || null
    if (!cloudModule) {
      try { cloudModule = require('./cloud') } catch (e) { cloudModule = null }
    }
    if (!cloudModule || typeof cloudModule.getActiveVerificationPaper !== 'function') {
      // 旧环境兜底：直接跳生成页
      const subjectNameEncoded = encodeURIComponent(subjectName || getSubjectName(subject, '数学'))
      const studentNameEncoded = encodeURIComponent(studentName || '')
      wx.navigateTo({
        url: `/pages/generate-verification/generate-verification?studentId=${studentId}&subject=${subject}&subjectName=${subjectNameEncoded}&studentName=${studentNameEncoded}`
      })
      return
    }
    await navigateToVerificationPaper(cloudModule, { studentId, subject, reportId })
  },

  onBottleneckTap(e) {
    const { subject = 'math', lpCode = '' } = e.currentTarget.dataset
    const student = getStudent(this)
    const studentId = getStudentId(this)
    if (!lpCode) return
    wx.navigateTo({
      url: `/pages/bottleneck-detail/bottleneck-detail?studentId=${student._id || studentId}&subject=${subject}&lpCode=${encodeURIComponent(lpCode)}&studentName=${encodeURIComponent(student.name || '')}`
    })
  },

  async onBottleneckAction(e) {
    const { subject = 'math', lpCode = '' } = e.currentTarget.dataset
    if (!lpCode) return
    const bottleneck = this.findHomeBottleneck(subject, lpCode)
    if (bottleneck && bottleneck.active === false) {
      this.onBottleneckTap(e)
      return
    }
    const student = getStudent(this)
    const studentId = getStudentId(this)
    const subjectName = getSubjectName(subject, '数学')
    await this.navigateToVerificationByStatus(student._id || studentId, subject, subjectName, student.name || '')
  },

  onRecordTap(e) {
    const index = e.currentTarget.dataset.index
    const record = this.data.home && this.data.home.recentRecords[index]
    if (!record) return
    if (record.paperId) {
      wx.navigateTo({ url: `/pages/paper-preview/paper-preview?paperId=${record.paperId}` })
      return
    }
    if (record.reportId) {
      wx.navigateTo({ url: `/pages/report/report?id=${record.reportId}` })
    }
  },

  onPrimaryReportTap() {
    const report = this.data.home && this.data.home.primaryReport
    if (report && report.reportId) {
      wx.navigateTo({ url: `/pages/report/report?id=${report.reportId}` })
    }
  },

  onPrimaryAction() {
    const home = this.data.home || {}
    const student = getStudent(this)
    const studentId = getStudentId(this)
    const subject = home.nextAction && home.nextAction.subject ? home.nextAction.subject : 'math'
    const subjectName = getSubjectName(subject, '数学')
    if (home.nextAction && home.nextAction.primaryText === '查看学习记录') {
      this.onViewAllRecords()
      return
    }
    if (home.nextAction && home.nextAction.primaryText === '生成纸面验证卷') {
      this.navigateToVerificationByStatus(student._id || studentId, subject, subjectName, student.name || '')
      return
    }
    wx.navigateTo({
      url: `/pages/upload/upload?mode=diagnosis&studentId=${student._id || studentId}&subject=${subject}&subjectName=${encodeURIComponent(subjectName)}&studentName=${encodeURIComponent(student.name || '')}&grade=${student.grade || ''}`
    })
  },

  onSecondaryAction() {
    const home = this.data.home || {}
    const student = getStudent(this)
    const studentId = getStudentId(this)
    const subject = home.nextAction && home.nextAction.subject ? home.nextAction.subject : 'math'
    const subjectName = getSubjectName(subject, '数学')
    if (!home.nextAction || !home.nextAction.secondaryText) return
    if (home.nextAction && home.nextAction.secondaryText === '查看学习记录') {
      this.onViewAllRecords()
      return
    }
    wx.navigateTo({
      url: `/pages/upload/upload?mode=diagnosis&studentId=${student._id || studentId}&subject=${subject}&subjectName=${encodeURIComponent(subjectName)}&studentName=${encodeURIComponent(student.name || '')}&grade=${student.grade || ''}`
    })
  },

  onManageStudents() {
    wx.navigateTo({ url: '/pages/add-student/add-student' })
  }
}

/**
 * 验证卷统一入口（纯函数，不依赖 this，任何页面可直接调用）
 *
 * 验证卷在诊断报告完成后已异步自动生成，此函数负责：
 *   ready     → 直接跳预览页
 *   generating→ 提示并轮询，ready 后自动跳预览
 *   failed    → 调 regenerateVerificationPaper 重新生成 + 轮询
 *   none      → 调 regenerateVerificationPaper 首次触发 + 轮询
 *
 * @param {object} cloudModule - cloud 模块（可注入 mock）
 * @param {object} params - { studentId, subject, reportId, onPollStart, onPage }
 * @returns {Promise<{status: string, paperId: string}>}
 */
async function navigateToVerificationPaper(cloudModule, { studentId, subject, reportId = '' }) {
  if (!studentId) {
    wx.showToast({ title: '缺少孩子档案信息', icon: 'none' })
    return { status: 'none', paperId: '' }
  }
  if (!cloudModule || typeof cloudModule.getActiveVerificationPaper !== 'function') {
    return { status: 'none', paperId: '' }
  }

  wx.showLoading({ title: '查看验证卷…' })
  let status = 'none'
  let paperId = ''
  let result = null
  try {
    result = await cloudModule.getActiveVerificationPaper(studentId, subject, reportId)
    status = result.status || 'none'
    paperId = result.paper && result.paper._id ? result.paper._id : ''
  } catch (e) {
    status = 'none'
  }
  wx.hideLoading()

  if (status === 'ready' && paperId) {
    wx.navigateTo({ url: `/pages/paper-preview/paper-preview?paperId=${paperId}` })
    return { status, paperId }
  }

  // generating 且已有批次完成（completedBatches > 0）：说明别的入口正在驱动，只轮询
  const paper = result && result.paper ? result.paper : null
  const progress = paper && paper.generationProgress ? paper.generationProgress : null
  const completedBatches = progress ? (progress.completedBatches || 0) : 0
  const questionCount = paper && Array.isArray(paper.questions) ? paper.questions.length : 0

  if (status === 'generating' && completedBatches > 0) {
    wx.showToast({ title: '验证卷生成中，完成后自动跳转', icon: 'none', duration: 2500 })
    startVerificationPoller(cloudModule, studentId, subject, reportId)
    return { status, paperId }
  }

  // 其余情况（failed / none / generating 但 0 批完成）：
  // 云函数 fire-and-forget 会被进程销毁，所以由前端循环调 generatePaper 分批驱动
  // 如果已有 generating 记录（analyzePhotos 创建），复用它；否则创建新的
  let drivePaperId = paperId
  let batches = []
  let totalBatches = 0

  if (status === 'generating' && drivePaperId && paper && Array.isArray(paper.bottleneckTargets)) {
    // 复用 analyzePhotos 创建的记录，从 bottleneckTargets 重新分批
    batches = chunkTargetsFrontend(paper.bottleneckTargets)
    totalBatches = batches.length
  } else {
    // 创建新记录
    const actionLabel = status === 'failed' ? '重新生成验证卷' : '生成验证卷'
    wx.showLoading({ title: actionLabel + '…' })
    const startResult = await cloudModule.regenerateVerificationPaper({
      studentId, subject, reportId, action: 'start'
    })
    wx.hideLoading()
    if (!startResult || !startResult.success) {
      wx.showToast({ title: (startResult && startResult.error) || '生成失败，请稍后重试', icon: 'none' })
      return { status: 'failed', paperId: '' }
    }
    drivePaperId = startResult.paperId
    batches = startResult.batches || []
    totalBatches = batches.length
  }

  if (totalBatches === 0) {
    wx.showToast({ title: '暂无待验证卡点', icon: 'none' })
    return { status: 'failed', paperId: '' }
  }

  const markFailed = async (message) => {
    const error = message || '验证卷生成失败'
    await cloudModule.regenerateVerificationPaper({
      studentId, subject, reportId, paperId: drivePaperId, action: 'fail', error
    }).catch(() => {})
    wx.hideLoading()
    wx.showToast({ title: '验证卷生成失败，请稍后重试', icon: 'none' })
    return { status: 'failed', paperId: drivePaperId }
  }

  // 前端驱动逐批生成
  for (let i = 0; i < batches.length; i++) {
    wx.showLoading({ title: `生成中 ${i + 1}/${totalBatches} 批…` })
    try {
      const batchResult = await cloudModule.callGeneratePaper({
        studentId, subject, type: 'verification',
        targets: batches[i],
        _appendToPaperId: drivePaperId,
      })
      if (!batchResult || batchResult.success === false) {
        throw new Error((batchResult && batchResult.error) || `第 ${i + 1} 批生成失败`)
      }
    } catch (batchErr) {
      console.warn(`批次 ${i + 1}/${totalBatches} 失败:`, batchErr && batchErr.message)
      return markFailed((batchErr && batchErr.message) || `第 ${i + 1} 批生成失败`)
    }
  }

  // 重新生成 PDF
  wx.showLoading({ title: '生成 PDF…' })
  try {
    const pdfResult = await cloudModule.callGeneratePaper({ _regeneratePdf: true, paperId: drivePaperId })
    if (!pdfResult || pdfResult.success === false) {
      throw new Error((pdfResult && pdfResult.error) || 'PDF 生成失败')
    }
  } catch (pdfErr) {
    console.warn('PDF 重新生成失败:', pdfErr && pdfErr.message)
    return markFailed((pdfErr && pdfErr.message) || 'PDF 生成失败')
  }

  // 标记完成
  const finalizeResult = await cloudModule.regenerateVerificationPaper({
    studentId, subject, reportId, paperId: drivePaperId, action: 'finalize'
  }).catch(err => ({ success: false, error: err && err.message }))
  if (!finalizeResult || finalizeResult.success === false) {
    return markFailed((finalizeResult && finalizeResult.error) || '验证卷生成完成状态写入失败')
  }

  wx.hideLoading()
  wx.navigateTo({ url: `/pages/paper-preview/paper-preview?paperId=${drivePaperId}` })
  return { status: 'ready', paperId: drivePaperId }
}

// 前端分批（与云函数 BATCH_SIZE 一致）
function chunkTargetsFrontend(targets, size = 8) {
  const chunks = []
  const arr = Array.isArray(targets) ? targets : []
  for (let i = 0; i < arr.length; i += size) {
    chunks.push(arr.slice(i, i + size))
  }
  return chunks
}

/**
 * 验证卷轮询（纯函数版，供 navigateToVerificationPaper 使用）
 * 返回 poller 句柄，调用方可 stop()。
 */
let _activePoller = null

function startVerificationPoller(cloudModule, studentId, subject, reportId) {
  if (_activePoller && typeof _activePoller.stop === 'function') {
    _activePoller.stop()
  }
  _activePoller = createPoller({
    intervalMs: VERIFICATION_POLL_INTERVAL,
    maxAttempts: VERIFICATION_POLL_MAX_ATTEMPTS,
    request: async () => cloudModule.getActiveVerificationPaper(studentId, subject, reportId),
    onValue: (result) => {
      const st = result.status || 'none'
      const pid = result.paper && result.paper._id ? result.paper._id : ''
      if (st === 'ready' && pid) {
        wx.navigateTo({ url: `/pages/paper-preview/paper-preview?paperId=${pid}` })
        return false
      }
      if (st === 'failed') {
        wx.showToast({ title: '验证卷生成失败，请稍后重试', icon: 'none', duration: 3000 })
        return false
      }
      return true
    },
    onTimeout: () => {
      wx.showToast({ title: '生成时间较长，请稍后从学科首页查看', icon: 'none', duration: 3000 })
    }
  })
  _activePoller.start()
  return _activePoller
}

function stopVerificationPoller() {
  if (_activePoller && typeof _activePoller.stop === 'function') {
    _activePoller.stop()
    _activePoller = null
  }
}

module.exports = {
  sharedNavigation,
  OWNER_PERMISSIONS,
  navigateToVerificationPaper,
  startVerificationPoller,
  stopVerificationPoller,
  VERIFICATION_POLL_INTERVAL,
  VERIFICATION_POLL_MAX_ATTEMPTS
}

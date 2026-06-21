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
      wx.showToast({ title: '验证卷状态暂不可用', icon: 'none' })
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
    if (home.nextAction && ['下载验证卷', '查看/下载验证卷', '查看验证卷'].includes(home.nextAction.primaryText)) {
      return this.navigateToVerificationByStatus(student._id || studentId, subject, subjectName, student.name || '')
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
 * 验证卷在诊断报告完成后已自动生成/后台生成，此函数只负责：
 *   ready     → 直接跳预览页
 *   generating→ 提示并轮询，ready 后自动跳预览
 *   failed    → 提示后台生成失败
 *   none      → 提示尚无验证卷
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

  if (status === 'generating' || status === 'appending') {
    wx.showToast({ title: '验证卷正在后台生成，完成后自动跳转', icon: 'none', duration: 2500 })
    startVerificationPoller(cloudModule, studentId, subject, reportId)
    return { status, paperId }
  }

  if (status === 'failed') {
    wx.showToast({ title: '验证卷后台生成失败，请稍后重新诊断或查看报告', icon: 'none', duration: 3000 })
    return { status, paperId }
  }

  wx.showToast({ title: '暂无验证卷，请先完成一次诊断', icon: 'none', duration: 2500 })
  return { status: 'none', paperId: '' }
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
    schedule: setTimeout,
    cancel: clearTimeout,
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

// miniprogram/utils/shared-navigation.js
// Shared navigation methods for index and student-profile pages.
// Both pages display the same learning profile home view and need identical
// navigation handlers. The only difference is the student-id data field name
// (activeStudentId on index, studentId on student-profile), resolved by getStudentId().

const { getSubjectName } = require('./constants')

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

  onBottleneckTap(e) {
    const { subject = 'math', lpCode = '' } = e.currentTarget.dataset
    const student = getStudent(this)
    const studentId = getStudentId(this)
    if (!lpCode) return
    wx.navigateTo({
      url: `/pages/bottleneck-detail/bottleneck-detail?studentId=${student._id || studentId}&subject=${subject}&lpCode=${encodeURIComponent(lpCode)}&studentName=${encodeURIComponent(student.name || '')}`
    })
  },

  onBottleneckAction(e) {
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
    wx.navigateTo({
      url: `/pages/generate-verification/generate-verification?studentId=${student._id || studentId}&subject=${subject}&subjectName=${encodeURIComponent(subjectName)}&studentName=${encodeURIComponent(student.name || '')}&targetCode=${encodeURIComponent(lpCode)}`
    })
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
      wx.navigateTo({
        url: `/pages/generate-verification/generate-verification?studentId=${student._id || studentId}&subject=${subject}&subjectName=${encodeURIComponent(subjectName)}&studentName=${encodeURIComponent(student.name || '')}`
      })
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

module.exports = { sharedNavigation, OWNER_PERMISSIONS }

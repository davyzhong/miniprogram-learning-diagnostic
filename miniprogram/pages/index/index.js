// pages/index/index.js
const cloud = require('../../utils/cloud')
const { formatRelativeTime } = require('../../utils/util')
const { buildLearningProfileHomeView } = require('./index-presenter')

const SUBJECT_NAMES = {
  math: '数学',
  chinese: '语文',
  english: '英语'
}

Page({
  data: {
    loading: true,
    students: [],
    activeStudentId: '',
    activeStudent: null,
    hasStudents: false,
    home: null
  },

  onShow() {
    this.loadStudents()
  },

  async loadStudents() {
    this.setData({ loading: true })
    wx.showLoading({ title: '加载中...' })

    try {
      // 1. 加载所有学生
      const students = await cloud.getStudents()
      if (!students.length) {
        this.setData({
          students: [],
          activeStudentId: '',
          activeStudent: null,
          hasStudents: false,
          home: null,
          loading: false
        })
        return
      }

      // 2. 为每个学生加载学科档案统计
      const profileLists = {}
      const viewModels = await Promise.all(students.map(async s => {
        // 年级文字
        const viewModel = {
          ...s,
          gradeText: s.grade ? `${s.grade}年级` : ''
        }

        // 查询该学生的所有学科档案
        try {
          const profiles = await cloud.getSubjectProfiles(s._id)
          profileLists[s._id] = profiles

          let totalReports = 0
          let lastReportAt = null

          profiles.forEach(p => {
            totalReports += (p.totalReports || 0)
            if (p.updatedAt) {
              const t = new Date(p.updatedAt)
              if (!lastReportAt || t > lastReportAt) {
                lastReportAt = t
              }
            }
          })

          viewModel.totalReports = totalReports
          viewModel.lastReportAt = lastReportAt
            ? formatRelativeTime(lastReportAt)
            : ''
        } catch (e) {
          viewModel.totalReports = 0
          viewModel.lastReportAt = ''
        }

        // 默认头像颜色和首字
        if (!viewModel.avatarColor) {
          const colors = ['#4299e1', '#48bb78', '#ed8936', '#9f7aea', '#ed64a6', '#38b2ac']
          viewModel.avatarColor = colors[Math.abs(this.hashCode(s.name)) % colors.length]
        }
        viewModel.avatarText = s.name ? s.name.charAt(0) : ''
        return viewModel
      }))

      const activeStudent = viewModels[0]
      const activeProfiles = profileLists[activeStudent._id] || []
      const reports = typeof cloud.getReports === 'function'
        ? await cloud.getReports(activeStudent._id)
        : []
      const papers = typeof cloud.getPapers === 'function'
        ? await cloud.getPapers({ studentId: activeStudent._id })
        : []
      const home = buildLearningProfileHomeView({
        student: activeStudent,
        profiles: activeProfiles,
        reports,
        papers
      }, formatRelativeTime)

      this.setData({
        students: viewModels,
        activeStudentId: activeStudent._id,
        activeStudent,
        hasStudents: true,
        home,
        loading: false
      })
    } catch (err) {
      console.error('加载学生列表失败', err)
      wx.showToast({ title: '加载失败', icon: 'none' })
      this.setData({ loading: false })
    } finally {
      wx.hideLoading()
    }
  },

  // 点击学生卡片 → 进入学科选择页
  onStudentTap(e) {
    const { id, name, grade } = e.currentTarget.dataset
    wx.navigateTo({
      url: `/pages/subject-select/subject-select?studentId=${id}&name=${encodeURIComponent(name)}&grade=${grade || ''}`
    })
  },

  onManageStudents() {
    this.onAddStudent()
  },

  navigateToSubject(subject) {
    const student = this.data.activeStudent || {}
    const subjectName = SUBJECT_NAMES[subject] || '数学'
    wx.navigateTo({
      url: `/pages/subject-home/subject-home?studentId=${student._id || this.data.activeStudentId}&subject=${subject}&subjectName=${encodeURIComponent(subjectName)}&studentName=${encodeURIComponent(student.name || '')}&grade=${student.grade || ''}`
    })
  },

  onObservationTap(e) {
    this.navigateToSubject(e.currentTarget.dataset.subject || 'math')
  },

  onSubjectTap(e) {
    this.navigateToSubject(e.currentTarget.dataset.subject || e.currentTarget.dataset.key || 'math')
  },

  onViewAllRecords() {
    const student = this.data.activeStudent || {}
    wx.navigateTo({
      url: `/pages/upload-history/upload-history?studentId=${student._id || this.data.activeStudentId}&studentName=${encodeURIComponent(student.name || '')}`
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

  onPrimaryAction() {
    const home = this.data.home || {}
    const student = this.data.activeStudent || {}
    const subject = home.nextAction && home.nextAction.subject ? home.nextAction.subject : 'math'
    const subjectName = SUBJECT_NAMES[subject] || '数学'
    if (home.nextAction && home.nextAction.primaryText === '生成验证试卷') {
      wx.navigateTo({
        url: `/pages/generate-verification/generate-verification?studentId=${student._id || this.data.activeStudentId}&subject=${subject}&subjectName=${encodeURIComponent(subjectName)}&studentName=${encodeURIComponent(student.name || '')}`
      })
      return
    }
    wx.navigateTo({
      url: `/pages/upload/upload?mode=diagnosis&studentId=${student._id || this.data.activeStudentId}&subject=${subject}&subjectName=${encodeURIComponent(subjectName)}&studentName=${encodeURIComponent(student.name || '')}&grade=${student.grade || ''}`
    })
  },

  onSecondaryAction() {
    const home = this.data.home || {}
    const student = this.data.activeStudent || {}
    const subject = home.nextAction && home.nextAction.subject ? home.nextAction.subject : 'math'
    const subjectName = SUBJECT_NAMES[subject] || '数学'
    if (home.nextAction && home.nextAction.secondaryText === '查看学习记录') {
      this.onViewAllRecords()
      return
    }
    wx.navigateTo({
      url: `/pages/upload/upload?mode=diagnosis&studentId=${student._id || this.data.activeStudentId}&subject=${subject}&subjectName=${encodeURIComponent(subjectName)}&studentName=${encodeURIComponent(student.name || '')}&grade=${student.grade || ''}`
    })
  },

  // 添加学生
  onAddStudent() {
    wx.navigateTo({
      url: '/pages/add-student/add-student'
    })
  },

  // 工具函数：简单 hash
  hashCode(str) {
    if (!str) return 0
    let hash = 0
    for (let i = 0; i < str.length; i++) {
      const char = str.charCodeAt(i)
      hash = ((hash << 5) - hash) + char
      hash = hash & hash
    }
    return Math.abs(hash)
  }
})

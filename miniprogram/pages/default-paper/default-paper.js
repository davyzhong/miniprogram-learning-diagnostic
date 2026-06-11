// pages/default-paper/default-paper.js
const app = getApp()

// 默认试卷配置（每个年级 2 套）
const PAPER_CONFIG = {
  1: [
    { key: 'grade1_a', name: '一年级 A 卷', bottleneckCount: 4, questionCount: 12, estimatedMinutes: 25, pages: 1 },
    { key: 'grade1_b', name: '一年级 B 卷', bottleneckCount: 4, questionCount: 12, estimatedMinutes: 25, pages: 1 },
  ],
  2: [
    { key: 'grade2_a', name: '二年级 A 卷', bottleneckCount: 4, questionCount: 14, estimatedMinutes: 30, pages: 1 },
    { key: 'grade2_b', name: '二年级 B 卷', bottleneckCount: 4, questionCount: 14, estimatedMinutes: 30, pages: 1 },
  ],
  3: [
    { key: 'grade3_a', name: '三年级 A 卷', bottleneckCount: 5, questionCount: 16, estimatedMinutes: 35, pages: 2 },
    { key: 'grade3_b', name: '三年级 B 卷', bottleneckCount: 5, questionCount: 16, estimatedMinutes: 35, pages: 2 },
  ],
  4: [
    { key: 'grade4_a', name: '四年级 A 卷', bottleneckCount: 5, questionCount: 18, estimatedMinutes: 40, pages: 2 },
    { key: 'grade4_b', name: '四年级 B 卷', bottleneckCount: 5, questionCount: 18, estimatedMinutes: 40, pages: 2 },
  ],
  5: [
    { key: 'grade5_a', name: '五年级 A 卷', bottleneckCount: 6, questionCount: 20, estimatedMinutes: 45, pages: 2 },
    { key: 'grade5_b', name: '五年级 B 卷', bottleneckCount: 6, questionCount: 20, estimatedMinutes: 45, pages: 2 },
  ],
  6: [
    { key: 'grade6_a', name: '六年级 A 卷', bottleneckCount: 6, questionCount: 20, estimatedMinutes: 45, pages: 2 },
    { key: 'grade6_b', name: '六年级 B 卷', bottleneckCount: 6, questionCount: 20, estimatedMinutes: 45, pages: 2 },
  ],
}

Page({
  data: {
    studentId: '',
    subject: '',
    subjectName: '',
    studentName: '',
    grade: '',
    grades: [1, 2, 3, 4, 5, 6],
    papers: [],
    generating: false,
    generatingKey: ''
  },

  onLoad(options) {
    const { studentId, subject, subjectName, studentName, grade } = options
    this.setData({
      studentId: studentId || '',
      subject: subject || 'math',
      subjectName: decodeURIComponent(subjectName || '数学'),
      studentName: decodeURIComponent(studentName || ''),
      grade: grade || ''
    })
  },

  onShow() {
    if (this.data.grade) {
      this.loadPapers()
    }
  },

  onGradeTap(e) {
    const grade = e.currentTarget.dataset.grade
    this.setData({ grade })
    this.loadPapers()
  },

  // 加载试卷列表（检查是否已生成）
  async loadPapers() {
    const { grade, studentId, subject } = this.data
    if (!grade) return

    const papers = PAPER_CONFIG[grade] || []
    const db = app.db

    // 检查每套试卷是否已生成
    for (let i = 0; i < papers.length; i++) {
      try {
        const res = await db.collection('papers')
          .where({
            studentId,
            subject,
            type: 'default-diagnosis',
            grade: Number(grade),
            key: papers[i].key
          })
          .get()
        papers[i] = { ...papers[i], exists: res.data.length > 0, paperId: res.data[0]?._id || '' }
      } catch (err) {
        papers[i] = { ...papers[i], exists: false, paperId: '' }
      }
    }

    this.setData({ papers })
  },

  // 预览 PDF
  async onPreview(e) {
    const key = e.currentTarget.dataset.key
    const { studentId, subject, grade } = this.data
    wx.showLoading({ title: '生成预览...' })

    try {
      const res = await wx.cloud.callFunction({
        name: 'generatePaper',
        data: {
          studentId,
          subject,
          type: 'default-diagnosis',
          grade: Number(grade),
          key,
          preview: true
        }
      })
      wx.hideLoading()
      if (res.result && res.result.fileID) {
        wx.navigateTo({
          url: `/pages/paper-preview/paper-preview?fileId=${encodeURIComponent(res.result.fileID)}&type=preview`
        })
      }
    } catch (err) {
      console.error('预览失败', err)
      wx.hideLoading()
      wx.showToast({ title: '预览失败', icon: 'none' })
    }
  },

  // 使用这套试卷（生成并跳转）
  async onUsePaper(e) {
    const key = e.currentTarget.dataset.key
    const { studentId, subject, subjectName, studentName, grade, generating } = this.data
    if (generating) return

    this.setData({ generating: true, generatingKey: key })
    wx.showLoading({ title: '生成试卷...' })

    try {
      const res = await wx.cloud.callFunction({
        name: 'generatePaper',
        data: {
          studentId,
          subject,
          type: 'default-diagnosis',
          grade: Number(grade),
          key,
          preview: false
        }
      })

      wx.hideLoading()

      if (res.result && res.result.paperId) {
        wx.showToast({ title: '生成成功', icon: 'success' })
        setTimeout(() => {
          wx.navigateTo({
            url: `/pages/paper-preview/paper-preview?paperId=${res.result.paperId}`
          })
        }, 1000)
      }
    } catch (err) {
      console.error('生成试卷失败', err)
      wx.hideLoading()
      wx.showToast({ title: '生成失败', icon: 'none' })
    } finally {
      this.setData({ generating: false, generatingKey: '' })
    }
  }
})

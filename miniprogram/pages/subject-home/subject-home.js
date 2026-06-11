// pages/subject-home/subject-home.js
const app = getApp()

Page({
  data: {
    studentId: '',
    subject: 'math',
    subjectName: '数学',
    studentName: '',
    grade: '',

    totalReports: 0,
    pendingCount: 0,
    improvedCount: 0,

    analysisStatus: '',   // '' | 'analyzing'
    analysisStatusText: '',
    analysisProgress: 0,

    records: []
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

    this.setNavColor()
  },

  onShow() {
    if (this.data.studentId) {
      this.loadProfile()
      this.loadRecords()
      this.checkAnalysisStatus()
    }
  },

  setNavColor() {
    const { subject } = this.data
    const colors = {
      math:    { bg: '#1a365d', fg: '#ffffff' },
      chinese: { bg: '#1c4532', fg: '#ffffff' },
      english: { bg: '#7b341e', fg: '#ffffff' },
    }
    const c = colors[subject] || colors.math
    wx.setNavigationBarColor({
      frontColor: c.fg,
      backgroundColor: c.bg,
      animation: { duration: 200, timingFunc: 'easeIn' }
    })
  },

  // ========== 加载学科档案 ==========
  async loadProfile() {
    const { studentId, subject } = this.data
    const db = app.db

    try {
      const res = await db.collection('subjectProfiles')
        .where({ studentId, subject })
        .get()

      if (res.data.length > 0) {
        const p = res.data[0]
        const pendingCount = (p.pendingBottlenecks || []).length
        const improvedCount = (p.improvedBottlenecks || []).length

        this.setData({
          totalReports: p.totalReports || 0,
          pendingCount,
          improvedCount,
          analysisStatus: p.analysisStatus || '',
        })
      }
    } catch (err) {
      console.error('加载学科档案失败', err)
    }
  },

  // ========== 加载历史记录 ==========
  async loadRecords() {
    const { studentId, subject } = this.data
    const db = app.db

    try {
      const res = await db.collection('reports')
        .where({ studentId, subject })
        .orderBy('createdAt', 'desc')
        .limit(20)
        .get()

      const records = res.data.map(r => ({
        _id: r._id,
        type: r.type || 'diagnosis',
        bottleneckCount: (r.bottlenecks || []).length,
        status: r.status || 'completed',
        dateText: this.formatTime(r.createdAt)
      }))

      this.setData({ records })
    } catch (err) {
      console.error('加载记录失败', err)
    }
  },

  // ========== 检查分析状态（启动轮询） ==========
  checkAnalysisStatus() {
    // 如果 analysisStatus 是 'analyzing'，启动轮询（每 10 秒查一次 reports 状态）
    const { analysisStatus } = this.data
    if (analysisStatus === 'analyzing') {
      this._pollCount = 0
      this.pollReportStatus()
    }
  },

  // ========== 轮询报告状态 ==========
  pollReportStatus() {
    if (this._pollTimer) clearTimeout(this._pollTimer)

    const poll = async () => {
      try {
        const { studentId, subject } = this.data
        const db = app.db

        // 查询最新的 reports 记录
        const res = await db.collection('reports')
          .where({ studentId, subject })
          .orderBy('createdAt', 'desc')
          .limit(1)
          .get()

        if (res.data.length === 0) return

        const report = res.data[0]
        const status = report.status

        if (status === 'completed') {
          // 分析完成
          wx.showToast({ title: '诊断完成', icon: 'success' })
          this.loadProfile()
          this.loadRecords()
          this.setData({
            analysisStatus: '',
            analysisProgress: 100,
            analysisStatusText: '分析完成'
          })
          return
        }

        if (status === 'failed') {
          wx.showToast({ title: '分析失败，请重试', icon: 'none' })
          this.setData({
            analysisStatus: '',
            analysisProgress: 0,
            analysisStatusText: ''
          })
          return
        }

        // 仍在分析中，更新进度（估算）
        this._pollCount = (this._pollCount || 0) + 1
        const estimatedProgress = Math.min(this._pollCount * 10, 90)  // 最多显示 90%
        this.setData({
          analysisProgress: estimatedProgress,
          analysisStatusText: 'AI 分析中...'
        })

        // 继续轮询（最多 30 次 = 5 分钟）
        if (this._pollCount < 30) {
          this._pollTimer = setTimeout(poll, 10000)  // 10 秒
        } else {
          wx.showToast({ title: '分析时间较长，请稍后查看', icon: 'none' })
          this.setData({
            analysisStatus: '',
            analysisProgress: 0,
            analysisStatusText: ''
          })
        }
      } catch (err) {
        console.error('轮询报告状态失败', err)
      }
    }

    poll()
  },

  // ========== 入口点击 ==========

  onDiagnosisTap() {
    const { studentId, subject, subjectName, studentName, grade } = this.data
    wx.navigateTo({
      url: `/pages/upload/upload?mode=diagnosis&studentId=${studentId}&subject=${subject}&subjectName=${encodeURIComponent(subjectName)}&studentName=${encodeURIComponent(studentName)}&grade=${grade}`
    })
  },

  onVerificationTap() {
    const { studentId, subject, subjectName, studentName } = this.data
    wx.navigateTo({
      url: `/pages/generate-verification/generate-verification?studentId=${studentId}&subject=${subject}&subjectName=${encodeURIComponent(subjectName)}&studentName=${encodeURIComponent(studentName)}`
    })
  },

  onDefaultPaperTap() {
    const { studentId, subject, subjectName, studentName, grade } = this.data
    wx.navigateTo({
      url: `/pages/default-paper/default-paper?studentId=${studentId}&subject=${subject}&subjectName=${encodeURIComponent(subjectName)}&studentName=${encodeURIComponent(studentName)}&grade=${grade}`
    })
  },

  // ========== 记录点击 ==========

  onRecordTap(e) {
    const { id } = e.currentTarget.dataset
    wx.navigateTo({
      url: `/pages/report/report?id=${id}`
    })
  },

  // ========== 返回 ==========

  onBack() {
    wx.navigateBack({ delta: 1 })
  },

  // ========== 工具函数 ==========

  formatTime(ts) {
    if (!ts) return ''
    const d = new Date(ts)
    const now = new Date()
    const diff = (now - d) / 1000

    if (diff < 60) return '刚刚'
    if (diff < 3600) return `${Math.floor(diff / 60)}分钟前`
    if (diff < 86400) return `${Math.floor(diff / 3600)}小时前`
    if (diff < 172800) return '昨天'

    const month = d.getMonth() + 1
    const day = d.getDate()
    return `${month}月${day}日`
  },

  onHide() {
    if (this._pollTimer) clearTimeout(this._pollTimer)
  },

  onUnload() {
    if (this._pollTimer) clearTimeout(this._pollTimer)
  }
})

// pages/generate-verification/generate-verification.js
const cloud = require('../../utils/cloud')

Page({
  data: {
    studentId: '',
    subject: '',
    subjectName: '',
    bottlenecks: [],   // pendingBottlenecks 列表
    selectedCount: 0,
    generating: false,
    previewing: false,
    loading: true
  },

  onLoad(options) {
    const { studentId, subject, subjectName } = options
    this.setData({
      studentId: studentId || '',
      subject: subject || 'math',
      subjectName: decodeURIComponent(subjectName || '数学')
    })
  },

  onShow() {
    this.loadPendingBottlenecks()
  },

  async loadPendingBottlenecks() {
    const { studentId, subject } = this.data
    if (!studentId) return

    this.setData({ loading: true })
    wx.showLoading({ title: '加载中...' })

    try {
      const profile = await cloud.getSubjectProfile(studentId, subject)

      let bottlenecks = []
      if (profile) {
        let selectedHighCount = 0
        bottlenecks = (profile.pendingBottlenecks || []).map(b => {
          const selected = b.severity === 'high' && selectedHighCount < 5
          if (selected) selectedHighCount += 1
          return {
            ...b,
            selected,
            sinceDateText: this.formatDate(b.sinceDate)
          }
        })
      }

      const selectedCount = bottlenecks.filter(b => b.selected).length

      this.setData({ bottlenecks, selectedCount })
    } catch (err) {
      console.error('加载待验证卡点失败', err)
      wx.showToast({ title: '加载失败', icon: 'none' })
    } finally {
      this.setData({ loading: false })
      wx.hideLoading()
    }
  },

  // 切换卡点选中状态
  onToggleBottleneck(e) {
    const idx = e.currentTarget.dataset.index
    const { bottlenecks } = this.data
    const b = bottlenecks[idx]

    // 最多选 5 个
    const selectedCount = bottlenecks.filter(x => x.selected).length
    if (!b.selected && selectedCount >= 5) {
      wx.showToast({ title: '最多选 5 个卡点', icon: 'none' })
      return
    }

    const key = `bottlenecks[${idx}].selected`
    this.setData({ [key]: !b.selected })

    const newSelected = this.data.bottlenecks.filter(x => x.selected).length
    this.setData({ selectedCount: newSelected })
  },

  // 预览 PDF（调用云函数生成临时 PDF）
  async onPreview() {
    const { studentId, subject, bottlenecks } = this.data
    const selected = bottlenecks.filter(b => b.selected)
    if (selected.length === 0 || this.data.previewing) return

    this.setData({ previewing: true })
    wx.showLoading({ title: '生成预览...' })

    try {
      const result = await cloud.callGeneratePaper({
        studentId,
        subject,
        type: 'verification',
        targets: selected.map(b => b.lpCode),
        preview: true
      })

      wx.hideLoading()

      if (result.pdfFileId) {
        // 跳转到试卷预览页
        wx.navigateTo({
          url: `/pages/paper-preview/paper-preview?fileId=${encodeURIComponent(result.pdfFileId)}&type=verification`
        })
      }
    } catch (err) {
      console.error('预览失败', err)
      wx.hideLoading()
      wx.showToast({ title: '预览失败', icon: 'none' })
    } finally {
      this.setData({ previewing: false })
    }
  },

  // 生成试卷（正式生成并保存）
  async onGenerate() {
    const { studentId, subject, subjectName, bottlenecks } = this.data
    const selected = bottlenecks.filter(b => b.selected)
    if (selected.length === 0 || this.data.generating) return

    this.setData({ generating: true })
    wx.showLoading({ title: '生成试卷...' })

    try {
      const result = await cloud.callGeneratePaper({
        studentId,
        subject,
        type: 'verification',
        targets: selected.map(b => b.lpCode),
        preview: false
      })

      wx.hideLoading()

      if (result.paperId) {
        wx.showToast({ title: '生成成功', icon: 'success' })
        // 跳转到试卷预览/打印页
        setTimeout(() => {
          wx.navigateTo({
            url: `/pages/paper-preview/paper-preview?paperId=${result.paperId}`
          })
        }, 1000)
      }
    } catch (err) {
      console.error('生成试卷失败', err)
      wx.hideLoading()
      wx.showToast({ title: '生成失败', icon: 'none' })
    } finally {
      this.setData({ generating: false })
    }
  },

  formatDate(dateStr) {
    if (!dateStr) return ''
    const d = new Date(dateStr)
    const m = d.getMonth() + 1
    const day = d.getDate()
    return `${m}月${day}日`
  }
})

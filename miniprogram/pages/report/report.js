// pages/report/report.js
const cloud = require('../../utils/cloud')
const { formatChineseDateTime } = require('../../utils/util')
const { createPoller } = require('../../utils/poller')
const { buildReportView } = require('./report-presenter')

Page({
  data: {
    reportId: '',
    report: {},
    isVerification: false,
    dateText: '',
    // 预计算字段（WXML 不支持复杂表达式）
    bottleneckCount: 0,
    hasBottlenecks: false,
    bottleneckList: [],       // 带 barWidth、severityText 的列表
    hasErrorDetails: false,
    errorDetailList: [],      // 带 expanded、displayIndex 的列表
    improvedCount: 0,
    worsenedCount: 0,
    pendingCount: 0,
    showNextStep: false,
    analysisStatusText: '',
    analysisProgress: 0,
    generatingPdf: false
  },

  onLoad(options) {
    const id = options.id
    if (id) {
      this.setData({ reportId: id })
      this.loadReport(id)
    }
  },

  async loadReport(id) {
    wx.showLoading({ title: '加载中...' })

    try {
      const report = await cloud.getReport(id)

      if (!report) {
        wx.hideLoading()
        wx.showToast({ title: '报告不存在', icon: 'none' })
        return
      }

      const dateText = formatChineseDateTime(report.createdAt)
      const view = buildReportView(report)

      // 待验证卡点数（从 subjectProfile 获取）
      var pendingCount = 0
      try {
        var profile = await cloud.getSubjectProfile(report.studentId, report.subject)
        if (profile) {
          pendingCount = (profile.pendingBottlenecks || []).length
        }
      } catch (e) { /* ignore */ }

      this.setData({
        report: report,
        dateText: dateText,
        pendingCount: pendingCount,
        ...view
      })

      wx.setNavigationBarTitle({
        title: view.isVerification ? '验证报告' : '诊断报告'
      })

      // 如果正在分析中，启动轮询
      if (report.status === 'analyzing') {
        this.startPolling(id)
      }

    } catch (err) {
      console.error('加载报告失败', err)
      wx.showToast({ title: '加载失败', icon: 'none' })
    } finally {
      wx.hideLoading()
    }
  },

  // ========== 展开/收起错题详情 ==========
  onToggleError(e) {
    var idx = e.currentTarget.dataset.index
    var key = 'errorDetailList[' + idx + '].expanded'
    var current = this.data.errorDetailList[idx]
    this.setData({
      [key]: !current.expanded
    })
  },

  // ========== 生成验证试卷 ==========
  onGenerateVerification() {
    var report = this.data.report
    var studentId = report.studentId
    var subject = report.subject

    // 获取卡点列表，传给验证试卷生成页
    var bottlenecks = (report.bottlenecks || [])
      .map(function(b) { return b.lpCode })
      .join(',')

    wx.navigateTo({
      url: '/pages/generate-verification/generate-verification?studentId=' + studentId + '&subject=' + subject + '&bottlenecks=' + encodeURIComponent(bottlenecks)
    })
  },

  // ========== 分享报告 ==========
  onShare() {
    wx.showToast({ title: '请点击右上角分享', icon: 'none' })
  },

  onShareAppMessage() {
    var report = this.data.report
    return {
      title: (report.studentName || '孩子') + '的学习诊断报告',
      path: '/pages/report/report?id=' + this.data.reportId,
      imageUrl: ''
    }
  },

  // ========== 轮询逻辑 ==========

  startPolling(reportId) {
    if (this._poller) this._poller.stop()
    this._poller = createPoller({
      request: () => cloud.getReport(reportId),
      onValue: (report, attempt) => {
        if (!report) return true
        if (report.status === 'completed') {
          wx.showToast({ title: '诊断完成', icon: 'success' })
          this.loadReport(reportId)
          this.setData({ analysisStatusText: '分析完成', analysisProgress: 100 })
          return false
        }
        if (report.status === 'failed') {
          wx.showToast({ title: '分析失败', icon: 'none' })
          this.setData({ analysisStatusText: '分析失败' })
          return false
        }
        this.setData({
          analysisStatusText: 'AI 分析中...',
          analysisProgress: Math.min(attempt * 10, 90)
        })
        return true
      },
      onError: err => console.error('轮询报告状态失败', err),
      onTimeout: () => {
        wx.showToast({ title: '分析时间较长，请稍后查看', icon: 'none' })
        this.setData({ analysisStatusText: '分析超时，请稍后查看' })
      }
    })
    this._poller.start()
  },

  // ========== 下载 PDF ==========
  async onDownloadPDF() {
    if (this.data.generatingPdf) return
    this.setData({ generatingPdf: true })
    wx.showLoading({ title: '生成 PDF...' })

    try {
      var result = await cloud.callGenerateReportPDF({ reportId: this.data.reportId })

      wx.hideLoading()

      if (result.pdfFileId) {
        wx.cloud.downloadFile({
          fileID: result.pdfFileId,
          success: function(dlRes) {
            wx.openDocument({
              filePath: dlRes.tempFilePath,
              showMenu: true,
              success: function() {},
              fail: function() { wx.showToast({ title: '打开失败', icon: 'none' }) }
            })
          },
          fail: function() { wx.showToast({ title: '下载失败', icon: 'none' }) }
        })
      }
    } catch (err) {
      console.error('生成 PDF 失败', err)
      wx.hideLoading()
      wx.showToast({ title: '生成失败', icon: 'none' })
    } finally {
      this.setData({ generatingPdf: false })
    }
  },

  onHide() {
    if (this._poller) this._poller.stop()
  },

  onUnload() {
    if (this._poller) this._poller.stop()
  }
})

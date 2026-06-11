// pages/report/report.js
const app = getApp()

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
    analysisProgress: 0
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
      const db = app.db
      const res = await db.collection('reports').doc(id).get()
      const report = res.data

      if (!report) {
        wx.hideLoading()
        wx.showToast({ title: '报告不存在', icon: 'none' })
        return
      }

      const isVerification = report.type === 'verification'
      const dateText = this.formatTime(report.createdAt)
      const bottlenecks = report.bottlenecks || []
      const errorDetails = report.errorDetails || []

      // 计算卡点进度条宽度
      const maxErrorCount = bottlenecks.length > 0
        ? Math.max.apply(null, bottlenecks.map(function(b) { return b.errorCount || 0 }))
        : 1

      var bottleneckList = bottlenecks.map(function(b) {
        return Object.assign({}, b, {
          barWidth: Math.round((b.errorCount || 0) / maxErrorCount * 100)
        })
      })

      // 预处理错题列表，加上 expanded 和 displayIndex
      var errorDetailList = errorDetails.map(function(e, i) {
        return Object.assign({}, e, {
          expanded: false,
          displayIndex: (i + 1) + '.'
        })
      })

      // 验证报告：统计改善/加重数
      var improvedCount = 0
      var worsenedCount = 0
      if (isVerification) {
        bottlenecks.forEach(function(b) {
          if (b.status === 'improved') improvedCount++
          if (b.status === 'worsened') worsenedCount++
        })
      }

      // 待验证卡点数（从 subjectProfile 获取）
      var pendingCount = 0
      try {
        var profRes = await db.collection('subjectProfiles')
          .where({
            studentId: report.studentId,
            subject: report.subject
          })
          .get()
        if (profRes.data.length > 0) {
          pendingCount = (profRes.data[0].pendingBottlenecks || []).length
        }
      } catch (e) { /* ignore */ }

      var showNextStep = !isVerification && bottlenecks.length > 0

      this.setData({
        report: report,
        isVerification: isVerification,
        dateText: dateText,
        bottleneckCount: bottlenecks.length,
        hasBottlenecks: bottlenecks.length > 0,
        bottleneckList: bottleneckList,
        hasErrorDetails: errorDetails.length > 0,
        errorDetailList: errorDetailList,
        improvedCount: improvedCount,
        worsenedCount: worsenedCount,
        pendingCount: pendingCount,
        showNextStep: showNextStep
      })

      wx.setNavigationBarTitle({
        title: isVerification ? '验证报告' : '诊断报告'
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
    this._pollCount = 0
    this._pollReportId = reportId
    this.pollReportStatus()
  },

  pollReportStatus() {
    if (this._pollTimer) clearTimeout(this._pollTimer)

    var self = this
    var poll = function() {
      var _pollReportId = self._pollReportId
      if (!_pollReportId) return

      app.db.collection('reports').doc(_pollReportId).get().then(function(res) {
        if (!res.data) return

        var status = res.data.status

        if (status === 'completed') {
          wx.showToast({ title: '诊断完成', icon: 'success' })
          self.loadReport(_pollReportId)
          self.setData({ analysisStatusText: '分析完成' })
          return
        }

        if (status === 'failed') {
          wx.showToast({ title: '分析失败', icon: 'none' })
          self.setData({ analysisStatusText: '分析失败' })
          return
        }

        // 仍在分析中
        self._pollCount = (self._pollCount || 0) + 1
        var estimatedProgress = Math.min(self._pollCount * 10, 90)
        self.setData({
          analysisStatusText: 'AI 分析中...',
          analysisProgress: estimatedProgress
        })

        // 最多轮询 30 次 = 5 分钟
        if (self._pollCount < 30) {
          self._pollTimer = setTimeout(poll, 10000)
        } else {
          wx.showToast({ title: '分析时间较长，请稍后查看', icon: 'none' })
          self.setData({ analysisStatusText: '分析超时，请稍后查看' })
        }
      }).catch(function(err) {
        console.error('轮询报告状态失败', err)
      })
    }

    poll()
  },

  // ========== 下载 PDF ==========
  async onDownloadPDF() {
    wx.showLoading({ title: '生成 PDF...' })

    try {
      var res = await wx.cloud.callFunction({
        name: 'generateReportPDF',
        data: { reportId: this.data.reportId }
      })

      wx.hideLoading()

      if (res.result && res.result.fileID) {
        wx.cloud.downloadFile({
          fileID: res.result.fileID,
          success: function(dlRes) {
            wx.openDocument({
              filePath: dlRes.tempFilePath,
              showMenu: true,
              success: function() { console.log('打开 PDF 成功') },
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
    }
  },

  // ========== 工具函数 ==========
  formatTime(ts) {
    if (!ts) return ''
    var d = new Date(ts)
    var y = d.getFullYear()
    var m = d.getMonth() + 1
    var day = d.getDate()
    var h = d.getHours()
    var min = String(d.getMinutes()).padStart(2, '0')
    return y + '年' + m + '月' + day + '日 ' + h + ':' + min
  },

  onHide() {
    if (this._pollTimer) {
      clearTimeout(this._pollTimer)
      this._pollTimer = null
    }
  },

  onUnload() {
    if (this._pollTimer) {
      clearTimeout(this._pollTimer)
      this._pollTimer = null
    }
  }
})

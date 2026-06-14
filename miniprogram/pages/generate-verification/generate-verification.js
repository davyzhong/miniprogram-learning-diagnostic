// pages/generate-verification/generate-verification.js
const cloud = require('../../utils/cloud')
const { uniqueBottleneckSummaries } = require('../../utils/bottlenecks')
const { buildBottleneckViews, profileBottlenecks } = require('../../utils/bottleneck-view')
const MAX_SELECTED_BOTTLENECKS = 5
const CORE_QUESTIONS_PER_BOTTLENECK = 3
const EXTENSION_QUESTIONS_PER_BOTTLENECK = 2
const QUESTIONS_PER_BOTTLENECK = CORE_QUESTIONS_PER_BOTTLENECK + EXTENSION_QUESTIONS_PER_BOTTLENECK
const SEVERITY_WEIGHT = { high: 80, medium: 55, low: 25 }

function normalizeWeight(item = {}) {
  if (item.weight !== undefined && item.weight !== null) return item.weight
  return SEVERITY_WEIGHT[item.severity] || 0
}

function verificationBottlenecks(profile = {}, targetCodes = []) {
  const raw = profileBottlenecks(profile)
  const targetSet = new Set(targetCodes)
  return buildBottleneckViews(raw
    .filter(item => item.status !== 'improved' || targetSet.has(item.lpCode))
    .map(item => ({
      ...item,
      status: item.status || 'needs_verification',
      weight: normalizeWeight(item),
      subject: profile.subject,
      subjectName: profile.subjectName
    })))
}

Page({
  data: {
    studentId: '',
    subject: '',
    subjectName: '',
    initialTargetCodes: [],
    bottlenecks: [],   // pendingBottlenecks 列表
    selectedCount: 0,
    generating: false,
    previewing: false,
    loading: true,
    selectedSummary: '',
    paperConfig: {
      scopeText: '',
      questionCount: 0,
      estimatedMinutes: 0,
      pages: 1,
      paperSize: 'A4',
      strategyText: ''
    }
  },

  onLoad(options) {
    const { studentId, subject, subjectName, targetCode, bottlenecks } = options
    const initialTargetCodes = this.parseTargetCodes(targetCode, bottlenecks)
    this.setData({
      studentId: studentId || '',
      subject: subject || 'math',
      subjectName: decodeURIComponent(subjectName || '数学'),
      initialTargetCodes
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
        const hasInitialTargets = this.data.initialTargetCodes.length > 0
        bottlenecks = verificationBottlenecks(profile, this.data.initialTargetCodes)
          .map((b, index) => ({
            ...b,
            selected: hasInitialTargets
              ? this.data.initialTargetCodes.includes(b.lpCode)
              : index < MAX_SELECTED_BOTTLENECKS,
            sinceDateText: this.formatDate(b.sinceDate || b.firstSeenAt)
          }))
      }

      this.setSelectionState(bottlenecks)
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
    if (!b.selected && selectedCount >= MAX_SELECTED_BOTTLENECKS) {
      wx.showToast({ title: '最多选 5 个卡点', icon: 'none' })
      return
    }

    const key = `bottlenecks[${idx}].selected`
    this.setData({ [key]: !b.selected })

    this.setSelectionState(this.data.bottlenecks)
  },

  // 预览 PDF（调用云函数生成临时 PDF）
  async onPreview() {
    const { studentId, subject, bottlenecks, paperConfig } = this.data
    const selected = bottlenecks.filter(b => b.selected)
    if (selected.length === 0 || this.data.previewing) return
    const questionCount = this.questionCountForSelection(selected.length, paperConfig.questionCount)

    this.setData({ previewing: true })
    wx.showLoading({ title: '生成预览...' })

    try {
      const result = await cloud.callGeneratePaper({
        studentId,
        subject,
        type: 'verification',
        targets: selected.map(b => b.lpCode),
        questionCount,
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
      wx.showToast({ title: err.message || '预览失败', icon: 'none' })
    } finally {
      this.setData({ previewing: false })
    }
  },

  // 生成试卷（正式生成并保存）
  async onGenerate() {
    const { studentId, subject, subjectName, bottlenecks, paperConfig } = this.data
    const selected = bottlenecks.filter(b => b.selected)
    if (selected.length === 0 || this.data.generating) return
    const questionCount = this.questionCountForSelection(selected.length, paperConfig.questionCount)

    this.setData({ generating: true })
    wx.showLoading({ title: '生成试卷...' })

    try {
      const result = await cloud.callGeneratePaper({
        studentId,
        subject,
        type: 'verification',
        targets: selected.map(b => b.lpCode),
        questionCount,
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
      wx.showToast({ title: err.message || '生成失败', icon: 'none' })
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
  },

  buildSelectedSummary(bottlenecks) {
    return uniqueBottleneckSummaries((bottlenecks || []).filter(item => item.selected)).join('、')
  },

  parseTargetCodes(targetCode, bottlenecks) {
    const values = []
    if (targetCode) values.push(decodeURIComponent(targetCode))
    if (bottlenecks) values.push(...decodeURIComponent(bottlenecks).split(','))
    return Array.from(new Set(values.map(item => item.trim()).filter(Boolean)))
  },

  setSelectionState(bottlenecks) {
    const selectedCount = bottlenecks.filter(b => b.selected).length
    const selectedSummary = this.buildSelectedSummary(bottlenecks)
    this.setData({
      bottlenecks,
      selectedCount,
      selectedSummary,
      paperConfig: this.buildPaperConfig(selectedCount, selectedSummary)
    })
  },

  buildPaperConfig(selectedCount, selectedSummary) {
    const questionCount = this.questionCountForSelection(selectedCount)
    return {
      scopeText: selectedSummary || '未选择学习卡点',
      questionCount,
      estimatedMinutes: Math.max(0, selectedCount * 8),
      pages: Math.max(1, Math.ceil(questionCount / 10)),
      paperSize: 'A4',
      strategyText: `每个卡点 ${CORE_QUESTIONS_PER_BOTTLENECK} 道核心题 + ${EXTENSION_QUESTIONS_PER_BOTTLENECK} 道迁移题`
    }
  },

  questionCountForSelection(selectedCount, configuredCount = 0) {
    const expectedCount = selectedCount * QUESTIONS_PER_BOTTLENECK
    return expectedCount || Number(configuredCount) || 0
  }
})

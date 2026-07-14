// pages/generate-verification/generate-verification.js
// 历史兼容页：主流程中验证卷由诊断报告完成后自动准备。
// 用户进入这里时，只查看自动验证卷状态并跳转到下载页。
const cloud = require('../../utils/cloud')
const { uniqueBottleneckSummaries } = require('../../utils/bottlenecks')
const { buildBottleneckViews, profileBottlenecks, buildConfidence } = require('../../utils/bottleneck-view')
const { groupBottlenecksByHierarchy } = require('../../utils/math-bottleneck-hierarchy')
const { navigateToVerificationPaper, stopVerificationPoller } = require('../../utils/shared-navigation')
const { readableNameOf, compactReadableTargets } = require('../../utils/user-facing-text')

// 置信度分层出题数（与云函数 generatePaper 保持一致）
const CONFIDENCE_HIGH_THRESHOLD = 75
const CONFIDENCE_MEDIUM_THRESHOLD = 45
const QUESTIONS_FOR_HIGH = 3
const QUESTIONS_FOR_MEDIUM = 2
const QUESTIONS_FOR_LOW = 1

function questionsForWeight(weight) {
  const w = Number(weight) || 0
  if (w >= CONFIDENCE_HIGH_THRESHOLD) return QUESTIONS_FOR_HIGH
  if (w >= CONFIDENCE_MEDIUM_THRESHOLD) return QUESTIONS_FOR_MEDIUM
  return QUESTIONS_FOR_LOW
}

const MATH_TARGETS_PER_TASK_PAGE = 4
const CHINESE_TARGETS_PER_TASK_PAGE = 8
const SEVERITY_WEIGHT = { high: 80, medium: 55, low: 25 }
const CHINESE_REVIEW_TYPE_LABELS = {
  character: '汉字',
  word: '词语',
  pinyin: '拼音',
  poem: '古诗文',
  idiom: '成语',
  daily_accumulation: '日积月累',
  reading_skill: '阅读能力',
  writing_skill: '表达能力'
}

function normalizeWeight(item = {}) {
  if (item.weight !== undefined && item.weight !== null) return item.weight
  return SEVERITY_WEIGHT[item.severity] || 0
}

function cleanText(value) {
  return String(value || '').trim()
}

function bottleneckHierarchyLine(item = {}, subject = '') {
  if (subject !== 'math') return item.detailText || ''
  const group = groupBottlenecksByHierarchy([item])[0] || {}
  const family = (group.families || [])[0] || {}
  return [
    group.categoryTitle && group.categoryTitle !== '待归类' ? group.categoryTitle : '',
    family.familyTitle && family.familyTitle !== '待归类卡点组' ? family.familyTitle : ''
  ].filter(Boolean).join(' / ')
}

function isActiveChineseReviewItem(item = {}) {
  return !['mastered', 'archived', 'ignored'].includes(item.status)
}

function chineseReviewTitleOf(item = {}) {
  return cleanText(item.targetText)
    || cleanText(item.expectedAnswer)
    || cleanText(item.sourceContext)
    || '待复测错项'
}

function chineseReviewDetailOf(item = {}) {
  const parts = [
    CHINESE_REVIEW_TYPE_LABELS[item.itemType] || cleanText(item.itemType),
    item.lastWrongAnswer || item.studentAnswer ? `上次写成：${item.lastWrongAnswer || item.studentAnswer}` : '',
    item.sourceContext ? `语境：${item.sourceContext}` : ''
  ].filter(Boolean)
  return parts.join(' · ') || '语文具体错项'
}

function chineseReviewTargets(profile = {}, targetCodes = []) {
  const targetSet = new Set(targetCodes || [])
  return (profile.chineseReviewItems || [])
    .filter(isActiveChineseReviewItem)
    .map((item, index) => {
      const reviewItemId = item.itemId || item.id || ''
      const lpCode = item.relatedLpCode || item.lpCode || 'LP-101'
      return {
        ...item,
        reviewItemId,
        lpCode,
        viewId: reviewItemId || `chinese-review-${index + 1}`,
        displayName: chineseReviewTitleOf(item),
        lpName: chineseReviewTitleOf(item),
        detailText: chineseReviewDetailOf(item),
        hierarchyText: chineseReviewDetailOf(item),
        severity: item.status === 'recurring' ? 'high' : 'medium',
        status: item.status || 'needs_verification',
        weight: item.status === 'recurring' ? 100 : 80,
        isChineseReviewItem: true
      }
    })
    .filter(item => item.displayName)
    .filter(item => targetSet.size === 0
      || targetSet.has(item.reviewItemId)
      || targetSet.has(item.lpCode)
      || targetSet.has(item.viewId))
}

function verificationBottlenecks(profile = {}, targetCodes = []) {
  const raw = profileBottlenecks(profile)
  const chineseTargets = profile.subject === 'chinese'
    ? chineseReviewTargets(profile, targetCodes)
    : []
  const targetSet = new Set(targetCodes)
  const bottleneckTargets = buildBottleneckViews(raw
    .filter(item => item.status !== 'improved' || targetSet.has(item.lpCode))
    .map(item => ({
      ...item,
      status: item.status || 'needs_verification',
      weight: normalizeWeight(item),
      subject: profile.subject,
      subjectName: profile.subjectName
    })), {
    subject: profile.subject,
    subjectName: profile.subjectName,
    expandCandidates: profile.subject === 'math'
  }).map(item => ({
    ...item,
    hierarchyText: bottleneckHierarchyLine(item, profile.subject) || item.detailText || item.evidenceText
  }))
  return chineseTargets.length > 0 ? chineseTargets.concat(bottleneckTargets) : bottleneckTargets
}

function targetMatchesBottleneck(targetCodes = [], bottleneck = {}) {
  const targetSet = new Set(targetCodes)
  return targetSet.has(bottleneck.lpCode)
    || targetSet.has(bottleneck.reviewItemId)
    || targetSet.has(bottleneck.bottleneckId)
    || targetSet.has(bottleneck.viewId)
    || targetSet.has(bottleneck.id)
}

function targetCodeForPaper(bottleneck = {}) {
  return bottleneck.reviewItemId || bottleneck.bottleneckId || bottleneck.lpCode
}

function targetCodesForPaper(bottlenecks = []) {
  const seen = new Set()
  const result = []
  ;(bottlenecks || []).forEach(item => {
    const code = targetCodeForPaper(item)
    if (!code || seen.has(code)) return
    seen.add(code)
    result.push(code)
  })
  return result
}

// 卡点默认全选（兜底页场景：用户想手动生成时，默认覆盖全量）
// 若带 initialTargetCodes（从某卡点入口进来），则只选匹配项。
function applySelectionLimit(bottlenecks = [], initialTargetCodes = []) {
  const hasInitialTargets = initialTargetCodes.length > 0
  return bottlenecks.map(b => {
    const selected = hasInitialTargets ? targetMatchesBottleneck(initialTargetCodes, b) : true
    return { ...b, selected }
  })
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
    loading: true,
    selectedSummary: '',
    paperConfig: {
      scopeText: '',
      questionCount: 0,
      estimatedMinutes: 0,
      pages: 1,
      paperSize: 'A4',
      targetUnitLabel: '卡点数',
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

  async onViewAutoPaper() {
    const { studentId, subject } = this.data
    await navigateToVerificationPaper(cloud, { studentId, subject, reportId: '' })
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
        bottlenecks = applySelectionLimit(
          verificationBottlenecks(profile, this.data.initialTargetCodes)
            .map(b => {
              const sinceDateText = this.formatDate(b.sinceDate || b.firstSeenAt)
              const confidence = buildConfidence(b)
              const expectedQuestions = questionsForWeight(b.weight)
              return {
                ...b,
                sinceDateText,
                rangeText: b.detailText || `首次发现：${sinceDateText || '待补充'}`,
                confidenceLabel: confidence.label,
                confidenceClass: confidence.level,
                expectedQuestions
              }
            }),
          this.data.initialTargetCodes
        )
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

  // 切换卡点选中状态（无上限，用户自由选择）
  onToggleBottleneck(e) {
    const idx = e.currentTarget.dataset.index
    const { bottlenecks } = this.data
    const b = bottlenecks[idx]
    const key = `bottlenecks[${idx}].selected`
    this.setData({ [key]: !b.selected })
    this.setSelectionState(this.data.bottlenecks)
  },

  // 历史兼容：旧测试/旧路由仍可能调用，正式主流程不从这里手动出卷。
  async onGenerate() {
    const { studentId, subject, subjectName, bottlenecks } = this.data
    const selected = bottlenecks.filter(b => b.selected)
    if (selected.length === 0 || this.data.generating) return
    const questionCount = this.questionCountForSelection(selected)
    const targets = targetCodesForPaper(selected)
    const targetPlan = this.targetPlanForSelection(selected)
    if (targets.length === 0) {
      wx.showToast({ title: '学习卡点参数无效', icon: 'none' })
      return
    }

    this.setData({ generating: true })
    wx.showLoading({ title: '准备验证卷...' })

    try {
      const result = await cloud.callGeneratePaper({
        studentId,
        subject,
        type: 'verification',
        targets,
        targetPlan,
        questionCount,
        preview: false
      })

      wx.hideLoading()

      if (result.paperId) {
        wx.showToast({ title: '验证卷已准备', icon: 'success' })
        // 跳转到试卷预览/打印页
        setTimeout(() => {
          wx.navigateTo({
            url: `/pages/paper-preview/paper-preview?paperId=${result.paperId}`
          })
        }, 1000)
      }
    } catch (err) {
      console.error('验证卷准备失败', err)
      wx.hideLoading()
      wx.showToast({ title: err.message || '准备失败', icon: 'none' })
    } finally {
      this.setData({ generating: false })
    }
  },

  formatDate(dateStr) {
    if (!dateStr) return ''
    const d = new Date(dateStr)
    if (Number.isNaN(d.getTime())) return ''
    // 固定北京时间（UTC+8），纯数学偏移，不依赖 Intl
    const shifted = new Date(d.getTime() + 8 * 60 * 60 * 1000)
    return `${shifted.getUTCMonth() + 1}月${shifted.getUTCDate()}日`
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
    const selectedItems = bottlenecks.filter(b => b.selected)
    const selectedCount = selectedItems.length
    const selectedSummary = this.buildSelectedSummary(bottlenecks)
    this.setData({
      bottlenecks,
      selectedCount,
      selectedSummary,
      paperConfig: this.buildPaperConfig(selectedItems, selectedSummary)
    })
  },

  buildScheduledTaskPages(selectedItems = []) {
    if (this.data.subject !== 'math') return []
    const pages = []
    const groups = groupBottlenecksByHierarchy(selectedItems)
    groups.forEach(group => {
      ;(group.families || []).forEach(family => {
        const items = family.items || []
        for (let start = 0; start < items.length; start += MATH_TARGETS_PER_TASK_PAGE) {
          const pageItems = items.slice(start, start + MATH_TARGETS_PER_TASK_PAGE)
          const targetIds = targetCodesForPaper(pageItems)
          const nodeIds = Array.from(new Set(pageItems.flatMap(item => [
            item.nodeId,
            ...(item.nodeIds || []),
            ...(item.familyNodeIds || [])
          ]).filter(Boolean)))
          const targetNames = pageItems.map(item => readableNameOf(item) || '待确认学习卡点')
          pages.push({
            pageIndex: pages.length + 1,
            title: `${family.familyTitle || group.categoryTitle || '专项'}任务页`,
            pageType: pageItems.length >= 2 ? 'same_family' : 'micro_confirm',
            categoryId: group.categoryId || '',
            categoryTitle: group.categoryTitle || '',
            familyIds: family.familyId ? [family.familyId] : [],
            familyTitle: family.familyTitle || '',
            nodeIds,
            targetIds,
            targetNames,
            targetSummary: family.familyTitle || group.categoryTitle || compactReadableTargets(pageItems),
            targetCount: targetIds.length,
            questionCount: this.questionCountForSelection(pageItems),
            scopeText: compactReadableTargets(pageItems)
          })
        }
      })
    })
    return pages
  },

  targetPlanForSelection(selectedItems = []) {
    const pages = this.buildScheduledTaskPages(selectedItems)
    if (pages.length === 0) return null
    return {
      strategy: 'hierarchy_pages_v1',
      pages
    }
  },

  buildChunkedTaskPages(selectedItems = []) {
    const isChinese = this.data.subject === 'chinese'
    const targetsPerPage = isChinese ? CHINESE_TARGETS_PER_TASK_PAGE : MATH_TARGETS_PER_TASK_PAGE
    const pages = []
    for (let start = 0; start < selectedItems.length; start += targetsPerPage) {
      const targets = selectedItems.slice(start, start + targetsPerPage)
      pages.push({
        pageIndex: pages.length + 1,
        title: `任务页 ${pages.length + 1}`,
        targetCount: targets.length,
        questionCount: this.questionCountForSelection(targets),
        targetNames: targets.map(item => readableNameOf(item) || '待确认学习卡点'),
        scopeText: compactReadableTargets(targets)
      })
    }
    return pages
  },

  buildTaskPages(selectedItems = []) {
    const scheduledPages = this.buildScheduledTaskPages(selectedItems)
    const chunkedPages = this.buildChunkedTaskPages(selectedItems)
    const hasUngovernedTargets = selectedItems.some(item => !item.categoryId && !item.familyId)
    if (scheduledPages.length > 0 && !(hasUngovernedTargets && scheduledPages.length > chunkedPages.length)) {
      return scheduledPages
    }
    return chunkedPages
  },

  buildPaperConfig(selectedItemsOrCount, selectedSummary) {
    const selectedItems = Array.isArray(selectedItemsOrCount) ? selectedItemsOrCount : []
    const selectedCount = Array.isArray(selectedItemsOrCount) ? selectedItems.length : Number(selectedItemsOrCount) || 0
    const questionCount = this.questionCountForSelection(selectedItems)
    const isChinese = this.data.subject === 'chinese'
    const taskPages = this.buildTaskPages(selectedItems)
    return {
      scopeText: selectedSummary || '未选择学习卡点',
      questionCount,
      estimatedMinutes: Math.max(0, Math.round(questionCount * 4)),
      pages: Math.max(1, Math.ceil(questionCount / 10)),
      taskPageCount: taskPages.length,
      taskPages,
      paperSize: 'A4',
      targetUnitLabel: isChinese ? '错项数' : '卡点数',
      strategyText: isChinese
        ? '每个错项至少直接复测一次，并补充语境迁移题'
        : '按置信度分层：高置信3题、中置信2题、低置信1题'
    }
  },

  // 题量按置信度累加：Σ questionsForWeight(weight)
  questionCountForSelection(selectedItemsOrCount) {
    const selectedItems = Array.isArray(selectedItemsOrCount) ? selectedItemsOrCount : []
    return selectedItems.reduce((sum, item) => sum + questionsForWeight(item.weight), 0)
  },

  onUnload() {
    stopVerificationPoller()
  }
})

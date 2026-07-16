const { bottleneckLabelOf } = require('../../utils/learning-records')
const {
  buildBottleneckView,
  expandFineBottleneckItems,
  buildGroupedBottleneckViews,
  buildConfidence
} = require('../../utils/bottleneck-view')
const { buildLearningMapReportItems } = require('../../utils/math-learning-map')
const { paperCodeOf } = require('../../utils/paper-display')
const { buildTraceableUrl } = require('../../utils/traceable-actions')
const { reportIllustrationOf } = require('../../utils/page-illustrations')
const { beijingParts } = require('../../utils/util')
const { readableNameOf, sanitizeUserText } = require('../../utils/user-facing-text')

const DEFAULT_SOURCE_EVIDENCE_LIMIT = 3
const DEFAULT_ERROR_DETAIL_LIMIT = 20

function formatDateTime(value) {
  const p = beijingParts(value)
  if (!p) return ''
  const h = String(p.hour).padStart(2, '0')
  const min = String(p.minute).padStart(2, '0')
  return `${p.year}年${p.month}月${p.day}日 ${h}:${min}`
}

function buildTrendSummary(bottlenecks = []) {
  const counts = bottlenecks.reduce((acc, item) => {
    const trend = item.trend || ''
    if (trend) acc[trend] = (acc[trend] || 0) + 1
    return acc
  }, {})
  const parts = [
    counts.recurring ? `${counts.recurring} 个再次出现` : '',
    counts.persisting ? `${counts.persisting} 个持续出现` : '',
    counts.declining ? `${counts.declining} 个下降中` : '',
    counts.improved ? `${counts.improved} 个已改善` : '',
    counts.new ? `${counts.new} 个新发现` : ''
  ].filter(Boolean)
  return parts.length > 0 ? parts.join('，') : ''
}

function qualityViewOf(quality = {}) {
  if (!quality || !quality.status) {
    return {
      hasQuality: false,
      qualityLabel: '',
      qualityClass: '',
      qualityReasons: [],
      qualitySampleSummary: ''
    }
  }

  const map = {
    usable: { label: '证据较充分', className: 'usable' },
    needs_review: { label: '建议复核', className: 'needs-review' },
    insufficient: { label: '样本不足', className: 'insufficient' }
  }
  const meta = map[quality.status] || map.needs_review
  return {
    hasQuality: true,
    qualityLabel: meta.label,
    qualityClass: meta.className,
    qualityReasons: Array.isArray(quality.reasons) ? quality.reasons.slice(0, 2) : [],
    qualitySampleSummary: quality.sampleSummary || ''
  }
}

function evidenceStatusViewOf(status) {
  const map = {
    passed: { statusText: '已通过', statusClass: 'passed' },
    failed: { statusText: '未通过', statusClass: 'failed' },
    incomplete: { statusText: '证据不足', statusClass: 'incomplete' },
    unclear: { statusText: '图像不清', statusClass: 'unclear' },
    missing: { statusText: '证据缺失', statusClass: 'missing' }
  }
  return map[status] || map.missing
}

function evidenceSummaryCounts(items = []) {
  return items.reduce((acc, item) => {
    if (item.statusClass === 'passed') acc.passed += 1
    else if (item.statusClass === 'failed') acc.failed += 1
    else acc.uncertain += 1
    return acc
  }, { passed: 0, failed: 0, uncertain: 0 })
}

function joinParts(parts = []) {
  return parts.filter(Boolean).join('、')
}

const CHINESE_ITEM_TYPE_LABELS = {
  character: '汉字',
  word: '词语',
  pinyin: '拼音',
  poem: '古诗文',
  idiom: '成语',
  daily_accumulation: '日积月累',
  reading_skill: '阅读能力',
  writing_skill: '表达能力'
}

const CHINESE_METHOD_LABELS = {
  dictation: '听写',
  context_fill: '语境填空',
  pinyin_write: '看拼音写词语',
  poem_fill: '古诗文补写',
  sentence_rewrite: '句式改写',
  meaning_choice: '含义辨析',
  error_correction: '错字辨析'
}

function cleanText(value) {
  return String(value || '').trim()
}

function chineseItemTitleOf(item = {}) {
  return cleanText(item.targetText)
    || cleanText(item.expectedAnswer)
    || cleanText(item.sourceContext)
    || '待复测错项'
}

function chineseMethodTextOf(methods = []) {
  const labels = (Array.isArray(methods) ? methods : [])
    .map(method => CHINESE_METHOD_LABELS[method] || cleanText(method))
    .filter(Boolean)
  return labels.length > 0 ? `建议复测：${labels.join('、')}` : '建议复测：听写、语境填空'
}

function buildChineseErrorItemViews(report = {}) {
  if (report.subject !== 'chinese') return []
  return (report.chineseErrorItems || [])
    .map((item, index) => {
      const displayName = chineseItemTitleOf(item)
      const expectedAnswer = cleanText(item.expectedAnswer)
      const studentAnswer = cleanText(item.studentAnswer || item.lastWrongAnswer)
      const sourceContext = cleanText(item.sourceContext)
      const mistakeType = cleanText(item.mistakeType)
      return {
        ...item,
        viewId: item.itemId || `chinese-error-${index + 1}`,
        displayIndex: `${index + 1}.`,
        displayName,
        typeText: CHINESE_ITEM_TYPE_LABELS[item.itemType] || cleanText(item.itemType) || '语文错项',
        answerText: expectedAnswer ? `正确：${expectedAnswer}` : '',
        studentText: studentAnswer ? `上次写成：${studentAnswer}` : '',
        sourceText: sourceContext ? `原文/语境：${sourceContext}` : '',
        mistakeText: mistakeType ? `错误类型：${mistakeType}` : '',
        methodText: chineseMethodTextOf(item.verificationMethods),
        relatedText: item.relatedLpCode ? `归属卡点：${item.relatedLpCode}` : '',
        statusText: '待复测',
        statusClass: 'pending'
      }
    })
    .filter(item => item.displayName)
}

function buildQualityUncertainty(qualityView = {}) {
  if (!qualityView.hasQuality) return ''
  if (qualityView.qualityClass === 'usable') return ''
  const reasons = (qualityView.qualityReasons || []).join('；')
  const suffix = reasons ? `，${reasons}` : ''
  return `当前为${qualityView.qualityLabel}${suffix}，结论只作为待确认线索。`
}

function buildDiagnosisExplanation(report, context = {}) {
  const { headline, sourceImageCount, bottleneckCount, chineseErrorItemCount, qualityView } = context
  const evidenceParts = [
    sourceImageCount ? `${sourceImageCount} 张试卷图片` : '',
    report.totalErrors ? `${report.totalErrors} 道相关错题` : '',
    report.subject === 'chinese' && chineseErrorItemCount ? `${chineseErrorItemCount} 个具体错项` : '',
    bottleneckCount ? `${bottleneckCount} 个学习卡点` : ''
  ]
  const qualityUncertainty = buildQualityUncertainty(qualityView)
  const hasChineseErrorItems = report.subject === 'chinese' && chineseErrorItemCount > 0
  return {
    explanationTitle: '给家长的结论',
    explanationConclusion: headline,
    explanationEvidence: evidenceParts.some(Boolean)
      ? `本次依据${joinParts(evidenceParts)}形成判断。`
      : '本次可用证据较少，建议继续上传清晰试卷后再判断。',
    explanationUncertainty: qualityUncertainty || (bottleneckCount > 0
      ? '这些学习卡点还需要通过验证试卷或后续作答继续确认。'
      : (hasChineseErrorItems
        ? '语文记忆型错项已单独列出，验证卷会优先复测这些字词、诗句或积累项。'
        : '暂未发现明确学习卡点，建议继续积累样本。')),
    explanationActionText: bottleneckCount > 0 || hasChineseErrorItems ? '查看验证卷' : '继续拍照诊断',
    explanationActionType: bottleneckCount > 0 || hasChineseErrorItems ? 'generate-verification' : 'upload-diagnosis',
    explanationActionUrl: bottleneckCount > 0 || hasChineseErrorItems
      ? buildTraceableUrl({
        type: 'generate-verification',
        studentId: report.studentId,
        studentName: report.studentName,
        subject: report.subject
      })
      : buildTraceableUrl({
        type: 'upload',
        mode: 'diagnosis',
        studentId: report.studentId,
        studentName: report.studentName,
        subject: report.subject
      })
  }
}

function buildVerificationEvidenceSummary(counts) {
  const parts = [
    counts.passed ? `已通过 ${counts.passed} 个` : '',
    counts.failed ? `未通过 ${counts.failed} 个` : '',
    counts.uncertain ? `证据不足 ${counts.uncertain} 个` : ''
  ].filter(Boolean)
  return parts.length > 0 ? `本次验证结果：${parts.join('，')}。` : '本次验证还没有形成可读证据。'
}

function buildVerificationExplanation(report, context = {}) {
  const { headline, verificationEvidenceItems, qualityView } = context
  const counts = evidenceSummaryCounts(verificationEvidenceItems)
  let conclusion = headline
  if (counts.failed > 0) {
    conclusion = `本次验证仍有 ${counts.failed} 个学习卡点未通过。`
  } else if (counts.uncertain > 0) {
    conclusion = `本次验证还有 ${counts.uncertain} 个学习卡点证据不足。`
  } else if (counts.passed > 0) {
    conclusion = `本次验证显示 ${counts.passed} 个学习卡点已有改善。`
  }

  const qualityUncertainty = buildQualityUncertainty(qualityView)
  const needsMoreWork = counts.failed > 0 || counts.uncertain > 0
  return {
    explanationTitle: '验证结论',
    explanationConclusion: conclusion,
    explanationEvidence: buildVerificationEvidenceSummary(counts),
    explanationUncertainty: qualityUncertainty || (counts.uncertain > 0
      ? '图像不清、空白或缺失证据不会计入已改善，建议重新上传或补做。'
      : (counts.failed > 0
        ? '未通过项说明相关卡点仍需练习后再验证。'
        : '本次证据完整，可作为阶段性改善记录。')),
    explanationActionText: needsMoreWork ? '继续练习或重新上传验证' : '查看学习卡点变化',
    explanationActionType: needsMoreWork ? 'upload-verification' : 'view-bottlenecks',
    explanationActionUrl: needsMoreWork
      ? buildTraceableUrl({
        type: 'upload',
        mode: 'verification',
        studentId: report.studentId,
        studentName: report.studentName,
        subject: report.subject,
        paperId: report.paperId
      })
      : buildTraceableUrl({
        type: 'bottleneck-center',
        studentId: report.studentId,
        studentName: report.studentName,
        subject: report.subject,
        filter: 'all'
      })
  }
}

function buildReportExplanation(report, context = {}) {
  if (report.type === 'verification') {
    return buildVerificationExplanation(report, context)
  }
  return buildDiagnosisExplanation(report, context)
}

function shouldUseFineBottlenecks(report = {}) {
  return report.subject === 'math'
    && report.type !== 'verification'
    && Array.isArray(report.bottlenecks)
    && report.bottlenecks.some(item => (
      Array.isArray(item.candidateBottlenecks) && item.candidateBottlenecks.length > 0
    ))
}

function buildReportBottleneckViews(report = {}) {
  const raw = (report.bottlenecks || []).map(item => ({
    ...item,
    subject: item.subject || report.subject,
    subjectName: item.subjectName || report.subjectName
  }))
  const options = {
    subject: report.subject,
    subjectName: report.subjectName,
    expandCandidates: shouldUseFineBottlenecks(report)
  }
  return expandFineBottleneckItems(raw, options)
    .map(item => buildBottleneckView(item, options))
}

function buildFineReportHeadline(report = {}, bottleneckList = [], fallback = '') {
  if (!shouldUseFineBottlenecks(report) || bottleneckList.length === 0) return fallback
  const topNames = bottleneckList
    .map(item => item.displayName)
    .filter(Boolean)
    .slice(0, 3)
    .join('、')
  return topNames
    ? `发现 ${bottleneckList.length} 个细分学习卡点，优先关注：${topNames}`
    : `发现 ${bottleneckList.length} 个细分学习卡点`
}

function buildReportSummaryText(report = {}, bottleneckList = []) {
  if (shouldUseFineBottlenecks(report) && bottleneckList.length > 0) {
    return '本页已按细颗粒度卡点展开；粗类只作为归属维度，用于理解这些卡点属于哪一类能力。'
  }
  return sanitizeUserText(report.summary || '', { treatAsId: true, count: bottleneckList.length, noun: '学习卡点' })
}

function reportImageFiles(report = {}) {
  if (Array.isArray(report.imageFiles) && report.imageFiles.length > 0) {
    return report.imageFiles
  }
  return (report.imageFileIds || []).map((fileID, index) => ({
    fileID,
    fileName: `试卷照片${index + 1}`
  }))
}

function sourceIndexOf(error = {}, photos = []) {
  const explicitIndex = Number(error.sourceImageIndex)
  if (Number.isInteger(explicitIndex) && explicitIndex > 0) return explicitIndex
  if (error.sourceFileID) {
    const photoIndex = photos.findIndex(photo => photo.fileID === error.sourceFileID)
    if (photoIndex >= 0) return photoIndex + 1
  }
  return 0
}

function sourceTextOf(index) {
  return index > 0 ? `第${index}张试卷` : ''
}

function buildSourceEvidenceItems(photos = [], errorDetails = []) {
  return photos.map((photo, index) => {
    const sourceIndex = index + 1
    const relatedErrors = errorDetails.filter(error => {
      if (!error || typeof error !== 'object') return false
      if (photo.fileID && error.sourceFileID && photo.fileID === error.sourceFileID) return true
      return Number(error.sourceImageIndex) === sourceIndex
    })
    const relatedWithOcr = relatedErrors.find(item => item.sourceOcrSummary)
    const relatedErrorTexts = relatedErrors
      .map(item => item.questionContent || '')
      .filter(Boolean)
      .slice(0, 3)
    return {
      fileID: photo.fileID || '',
      title: sanitizeUserText(photo.fileName || `试卷照片${sourceIndex}`, { treatAsId: true }),
      sourceText: sourceTextOf(sourceIndex),
      summary: sanitizeUserText(
        photo.ocrSummary || photo.summaryText || (relatedWithOcr && relatedWithOcr.sourceOcrSummary) || '暂无 OCR 摘要',
        { treatAsId: true }
      ),
      duplicateText: photo.isDuplicate ? '疑似重复照片' : '',
      statusText: photo.analysisStatus === 'failed' ? '分析失败' : '已纳入分析',
      relatedErrorCount: relatedErrors.length,
      relatedErrors: relatedErrorTexts,
      relatedErrorText: sanitizeUserText(relatedErrorTexts.join('、'), { treatAsId: true })
    }
  })
}

function normalizeSourceEvidenceLimit(limit) {
  if (limit === Infinity) return Number.MAX_SAFE_INTEGER
  const value = Number(limit)
  if (!Number.isFinite(value)) return DEFAULT_SOURCE_EVIDENCE_LIMIT
  return Math.max(0, Math.floor(value))
}

function normalizeErrorDetailLimit(limit) {
  if (limit === Infinity) return Number.MAX_SAFE_INTEGER
  const value = Number(limit)
  if (!Number.isFinite(value)) return DEFAULT_ERROR_DETAIL_LIMIT
  return Math.max(0, Math.floor(value))
}

function buildReportView(report, options = {}) {
  const isVerification = report.type === 'verification'
  const paperCodeText = paperCodeOf(report.linkedPaper || report.paper)
  const linkedPaper = report.linkedPaper || report.paper || {}

  // 诊断报告展示全量卡点：优先用 profile.currentBottlenecks（合并了所有历史报告），
  // 而非单次 report.bottlenecks（只含本次 AI 识别的卡点）。
  // 验证报告（verification）仍用单次报告卡点，因为它只反映本次验证结果。
  const profile = options.profile || report.profile || null
  const useProfileBottlenecks = !isVerification
    && profile
    && Array.isArray(profile.currentBottlenecks)
    && profile.currentBottlenecks.length > 0
  const reportForBottlenecks = useProfileBottlenecks
    ? { ...report, bottlenecks: profile.currentBottlenecks }
    : report

  const rawBottlenecks = reportForBottlenecks.bottlenecks || []
  const bottlenecks = buildReportBottleneckViews(reportForBottlenecks)
  const errorDetails = report.errorDetails || []
  const sourcePhotos = reportImageFiles(report)
  const chineseErrorItems = buildChineseErrorItemViews(report)
  const maxErrorCount = bottlenecks.length > 0
    ? Math.max(...bottlenecks.map(item => item.errorCount || 0), 1)
    : 1

  const bottleneckList = bottlenecks.map(item => {
    const status = item.status === 'improved'
      ? { statusText: '已有改善', statusClass: 'improved', statusIcon: '改善' }
      : (item.status === 'persisting' || item.status === 'worsened')
        ? { statusText: '持续出现', statusClass: 'persisting', statusIcon: '持续' }
        : { statusText: '需要验证', statusClass: 'pending', statusIcon: '待验证' }
    const displayName = bottleneckLabelOf(item)
    const confidence = buildConfidence(item)
    return {
      ...item,
      ...status,
      displayName,
      confidenceDots: confidence.dots,
      confidenceLabel: confidence.label,
      confidenceLevel: confidence.level,
      confidenceDetail: confidence.detail,
      metaText: item.fineBottleneck && item.evidenceText
        ? item.evidenceText
        : `${item.errorCount || 0} 道相关错题 · ${displayName}`,
      barWidth: Math.round(((item.errorCount || 0) / maxErrorCount) * 100),
      detailUrl: buildTraceableUrl({
        type: 'bottleneck-detail',
        studentId: report.studentId,
        studentName: report.studentName,
        subject: report.subject,
        id: item.lpCode,
        bottleneckId: item.bottleneckId,
        viewId: item.viewId
      })
    }
  })
  const bottleneckGroups = report.subject === 'math'
    ? buildGroupedBottleneckViews(bottleneckList, { subject: report.subject, subjectName: report.subjectName })
    : []
  const learningMapItems = buildLearningMapReportItems(rawBottlenecks)
  const allErrorDetailList = errorDetails.map((item, index) => {
    const detail = item && typeof item === 'object' ? item : { questionContent: String(item || '') }
    const sourceIndex = sourceIndexOf(detail, sourcePhotos)
    return {
      ...detail,
      expanded: false,
      displayIndex: `${index + 1}.`,
      sourceText: sourceTextOf(sourceIndex),
      feedbackTargetId: detail.id || detail._id || `${index + 1}`
    }
  })
  const errorDetailLimit = normalizeErrorDetailLimit(options.errorDetailLimit)
  const errorDetailList = allErrorDetailList.slice(0, errorDetailLimit)
  const hiddenErrorDetailCount = Math.max(0, allErrorDetailList.length - errorDetailList.length)
  const allSourceEvidenceItems = buildSourceEvidenceItems(sourcePhotos, errorDetails)
  const sourceEvidenceLimit = normalizeSourceEvidenceLimit(options.sourceEvidenceLimit)
  const sourceEvidenceItems = allSourceEvidenceItems.slice(0, sourceEvidenceLimit)
  const hiddenSourceEvidenceCount = Math.max(0, allSourceEvidenceItems.length - sourceEvidenceItems.length)
  const verificationEvidenceItems = (report.verificationEvidence || []).map(item => ({
    ...item,
    displayName: bottleneckLabelOf(item),
    ...evidenceStatusViewOf(item.evidenceStatus || (item.complete && item.allCorrect ? 'passed' : 'missing'))
  }))
  const qualityView = qualityViewOf(report.quality)
  const rawHeadline = sanitizeUserText(
    report.changeSummary || report.comparisonSummary || report.summary || '查看本次诊断结果',
    { treatAsId: true, count: bottlenecks.length, noun: '学习卡点' }
  )
  const headline = buildFineReportHeadline(report, bottleneckList, rawHeadline)
  const reportSummaryText = buildReportSummaryText(report, bottleneckList)
  const explanation = buildReportExplanation(report, {
    headline,
    sourceImageCount: sourcePhotos.length,
    bottleneckCount: bottlenecks.length,
    chineseErrorItemCount: chineseErrorItems.length,
    verificationEvidenceItems,
    qualityView
  })
  const reportLayers = [
    { key: 'summary', marker: '结论', label: '结论', count: 1, available: true },
    {
      key: 'evidence',
      marker: '证据',
      label: '证据',
      count: sourcePhotos.length + allErrorDetailList.length + verificationEvidenceItems.length,
      available: sourcePhotos.length + allErrorDetailList.length + verificationEvidenceItems.length > 0
    },
    {
      key: 'change',
      marker: '变化',
      label: '变化',
      count: bottlenecks.length,
      available: bottlenecks.length > 0 || Boolean(report.linkedVerificationReport)
    },
    {
      key: 'action',
      marker: '行动',
      label: '行动',
      count: bottlenecks.length + chineseErrorItems.length,
      available: bottlenecks.length > 0 || chineseErrorItems.length > 0 || Boolean(explanation.explanationActionText)
    }
  ]

  return {
    subjectClass: report.subject === 'chinese' ? 'chinese' : report.subject === 'english' ? 'english' : 'math',
    headline,
    heroIllustration: reportIllustrationOf(isVerification),
    reportSummaryText,
    reportLayers,
    ...explanation,
    paperCodeText,
    paperCodeUrl: paperCodeText ? buildTraceableUrl({
      type: 'paper-workbench',
      id: linkedPaper._id || report.paperId
    }) : '',
    evidenceTimeText: formatDateTime(report.evidenceTime || report.createdAt),
    evidenceTimeUrl: buildTraceableUrl({
      type: 'learning-records',
      studentId: report.studentId,
      studentName: report.studentName,
      subject: report.subject,
      filter: 'evidence-time'
    }),
    trendSummaryText: buildTrendSummary(bottlenecks),
    sourceImageCount: sourcePhotos.length,
    hasSourceEvidence: allSourceEvidenceItems.length > 0,
    sourceEvidenceItems,
    hiddenSourceEvidenceCount,
    hasMoreSourceEvidence: hiddenSourceEvidenceCount > 0,
    ...qualityView,
    metricActions: {
      errorsUrl: buildTraceableUrl({ type: 'report-detail', id: report._id }),
      bottlenecksUrl: buildTraceableUrl({
        type: 'bottleneck-center',
        studentId: report.studentId,
        studentName: report.studentName,
        subject: report.subject,
        filter: isVerification ? 'all' : 'active'
      }),
      sourcesUrl: buildTraceableUrl({
        type: 'learning-records',
        studentId: report.studentId,
        studentName: report.studentName,
        subject: report.subject,
        filter: 'sources'
      })
    },
    isVerification,
    bottleneckCount: bottlenecks.length,
    hasBottlenecks: bottlenecks.length > 0,
    bottleneckList,
    knowledgeMapSnapshot: bottleneckList.slice(0, 5).map(item => ({
      lpCode: item.lpCode || '',
      displayName: item.displayName || item.lpName || '',
      statusText: item.statusText || '',
      statusIcon: item.statusIcon || '待验证',
      statusClass: item.statusClass || 'pending',
      metaText: item.metaText || '',
    })),
    hasKnowledgeMapSnapshot: bottleneckList.length > 0,
    hasBottleneckGroups: bottleneckGroups.length > 0,
    bottleneckGroups,
    showFlatBottleneckList: bottlenecks.length > 0 && bottleneckGroups.length === 0,
    chineseErrorItemCount: chineseErrorItems.length,
    hasChineseErrorItems: chineseErrorItems.length > 0,
    chineseErrorItems,
    hasLearningMap: learningMapItems.length > 0,
    learningMapItems,
    hasErrorDetails: allErrorDetailList.length > 0,
    errorDetailList,
    hiddenErrorDetailCount,
    hasMoreErrorDetails: hiddenErrorDetailCount > 0,
    hasVerificationEvidence: verificationEvidenceItems.length > 0,
    verificationEvidenceItems,
    improvedCount: isVerification
      ? rawBottlenecks.filter(item => item.status === 'improved').length
      : 0,
    worsenedCount: isVerification
      ? rawBottlenecks.filter(item => item.status === 'worsened').length
      : 0,
    showNextStep: !isVerification && (bottlenecks.length > 0 || chineseErrorItems.length > 0),
    ...buildVerificationFeedback(report, { profile, isVerification })
  }
}

// 构建验证反馈区块：诊断报告关联了验证卷且有验证结果时展示
function buildVerificationFeedback(report, options = {}) {
  const { isVerification, profile } = options
  // 只有诊断报告才展示验证反馈（验证报告本身已有验证证据卡片）
  if (isVerification) return { hasVerificationFeedback: false }

  const verReport = report.linkedVerificationReport
  if (!verReport) return { hasVerificationFeedback: false }

  const evidence = verReport.verificationEvidence || []
  const verBottlenecks = verReport.bottlenecks || []

  // 统计验证结果
  const passed = evidence.filter(e => e.evidenceStatus === 'passed').length
  const failed = evidence.filter(e => e.evidenceStatus === 'failed').length
  const uncertain = evidence.filter(e =>
    e.evidenceStatus === 'unclear' || e.evidenceStatus === 'incomplete' || e.evidenceStatus === 'missing'
  ).length
  const total = evidence.length

  // 构建卡点状态变化列表
  // 诊断时的状态从 report.bottlenecks 取，验证后的状态从 verReport.bottlenecks 取
  const diagnosisBottlenecks = report.bottlenecks || []
  const statusChanges = verBottlenecks.map(vb => {
    const diagBn = diagnosisBottlenecks.find(db => db.lpCode === vb.lpCode)
    const beforeStatus = diagBn ? 'found' : 'new'
    const beforeText = beforeStatus === 'found' ? '发现卡点' : '新发现'
    const afterText = vb.status === 'improved' ? '已改善' : (vb.status === 'persisting' || vb.status === 'worsened' ? '仍需练习' : '需要验证')
    return {
      lpCode: vb.lpCode,
      lpName: readableNameOf(vb) || '待确认学习卡点',
      beforeText,
      afterText,
      afterClass: vb.status === 'improved' ? 'improved' : 'persisting',
      errorCount: vb.errorCount || 0,
    }
  })

  // 生成下一步行动建议
  let nextActionText = ''
  let nextActionType = ''
  if (failed > 0) {
    nextActionText = `${failed} 个卡点仍需练习，建议重学相关资源后再做一次微验证`
    nextActionType = 'retry-verification'
  } else if (uncertain > 0) {
    nextActionText = `${uncertain} 个卡点证据不足，建议重新上传清晰的验证卷答题照片`
    nextActionType = 'retry-upload'
  } else if (passed > 0 && failed === 0 && uncertain === 0) {
    nextActionText = '本轮卡点已全部改善，建议继续拍照诊断发现新的学习情况'
    nextActionType = 'continue-diagnosis'
  } else {
    nextActionText = '验证已完成，查看详细验证报告了解改善情况'
    nextActionType = 'view-verification-report'
  }

  // 摘要文案
  const summaryParts = []
  if (passed > 0) summaryParts.push(`${passed} 个已改善`)
  if (failed > 0) summaryParts.push(`${failed} 个仍需练习`)
  if (uncertain > 0) summaryParts.push(`${uncertain} 个证据不足`)
  const summaryText = `已验证 ${total} 个卡点：${summaryParts.join('，')}`

  // 改善的卡点名列表
  const improvedNames = statusChanges
    .filter(s => s.afterClass === 'improved')
    .map(s => s.lpName)

  return {
    hasVerificationFeedback: true,
    verificationFeedbackSummary: summaryText,
    verificationFeedbackPassed: passed,
    verificationFeedbackFailed: failed,
    verificationFeedbackUncertain: uncertain,
    verificationFeedbackTotal: total,
    verificationStatusChanges: statusChanges,
    verificationNextActionText: nextActionText,
    verificationNextActionType: nextActionType,
    verificationReportId: verReport.reportId,
    verificationReportDate: verReport.createdAt,
    verificationComparisonSummary: sanitizeUserText(
      verReport.comparisonSummary || verReport.changeSummary || '',
      { treatAsId: true, count: verBottlenecks.length, noun: '学习卡点' }
    ),
    hasImprovedBottlenecks: improvedNames.length > 0,
    improvedBottleneckNames: improvedNames,
  }
}

module.exports = { buildReportView }

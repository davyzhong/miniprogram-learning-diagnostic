const { bottleneckLabelOf } = require('../../utils/learning-records')
const { buildLearningMapReportItems } = require('../../utils/math-learning-map')
const { paperCodeOf } = require('../../utils/paper-display')
const { buildTraceableUrl } = require('../../utils/traceable-actions')

function pad2(value) {
  return String(value).padStart(2, '0')
}

function formatDateTime(value) {
  if (!value) return ''
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return ''
  return `${date.getFullYear()}年${date.getMonth() + 1}月${date.getDate()}日 ${pad2(date.getHours())}:${pad2(date.getMinutes())}`
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

function buildQualityUncertainty(qualityView = {}) {
  if (!qualityView.hasQuality) return ''
  if (qualityView.qualityClass === 'usable') return ''
  const reasons = (qualityView.qualityReasons || []).join('；')
  const suffix = reasons ? `，${reasons}` : ''
  return `当前为${qualityView.qualityLabel}${suffix}，结论只作为待确认线索。`
}

function buildDiagnosisExplanation(report, context = {}) {
  const { headline, sourceImageCount, bottleneckCount, qualityView } = context
  const evidenceParts = [
    sourceImageCount ? `${sourceImageCount} 张试卷图片` : '',
    report.totalErrors ? `${report.totalErrors} 道相关错题` : '',
    bottleneckCount ? `${bottleneckCount} 个学习卡点` : ''
  ]
  const qualityUncertainty = buildQualityUncertainty(qualityView)
  return {
    explanationTitle: '给家长的结论',
    explanationConclusion: headline,
    explanationEvidence: evidenceParts.some(Boolean)
      ? `本次依据${joinParts(evidenceParts)}形成判断。`
      : '本次可用证据较少，建议继续上传清晰试卷后再判断。',
    explanationUncertainty: qualityUncertainty || (bottleneckCount > 0
      ? '这些学习卡点还需要通过验证试卷或后续作答继续确认。'
      : '暂未发现明确学习卡点，建议继续积累样本。'),
    explanationActionText: bottleneckCount > 0 ? '生成验证试卷' : '继续拍照诊断',
    explanationActionType: bottleneckCount > 0 ? 'generate-verification' : 'upload-diagnosis',
    explanationActionUrl: bottleneckCount > 0
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
      title: photo.fileName || `试卷照片${sourceIndex}`,
      sourceText: sourceTextOf(sourceIndex),
      summary: photo.ocrSummary || photo.summaryText || (relatedWithOcr && relatedWithOcr.sourceOcrSummary) || '暂无 OCR 摘要',
      duplicateText: photo.isDuplicate ? '疑似重复照片' : '',
      statusText: photo.analysisStatus === 'failed' ? '分析失败' : '已纳入分析',
      relatedErrorCount: relatedErrors.length,
      relatedErrors: relatedErrorTexts,
      relatedErrorText: relatedErrorTexts.join('、')
    }
  })
}

function buildReportView(report) {
  const isVerification = report.type === 'verification'
  const paperCodeText = paperCodeOf(report.linkedPaper || report.paper)
  const linkedPaper = report.linkedPaper || report.paper || {}
  const bottlenecks = report.bottlenecks || []
  const errorDetails = report.errorDetails || []
  const sourcePhotos = reportImageFiles(report)
  const maxErrorCount = bottlenecks.length > 0
    ? Math.max(...bottlenecks.map(item => item.errorCount || 0), 1)
    : 1

  const bottleneckList = bottlenecks.map(item => {
    const status = item.status === 'improved'
      ? { statusText: '已有改善', statusClass: 'improved', statusIcon: '✓' }
      : (item.status === 'persisting' || item.status === 'worsened')
        ? { statusText: '持续出现', statusClass: 'persisting', statusIcon: '!' }
        : { statusText: '需要验证', statusClass: 'pending', statusIcon: '?' }
    const displayName = bottleneckLabelOf(item)
    return {
      ...item,
      ...status,
      displayName,
      metaText: `${item.errorCount || 0} 道相关错题 · ${displayName}`,
      barWidth: Math.round(((item.errorCount || 0) / maxErrorCount) * 100),
      detailUrl: buildTraceableUrl({
        type: 'bottleneck-detail',
        studentId: report.studentId,
        studentName: report.studentName,
        subject: report.subject,
        id: item.lpCode
      })
    }
  })
  const learningMapItems = buildLearningMapReportItems(bottlenecks)
  const errorDetailList = errorDetails.map((item, index) => {
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
  const sourceEvidenceItems = buildSourceEvidenceItems(sourcePhotos, errorDetails)
  const verificationEvidenceItems = (report.verificationEvidence || []).map(item => ({
    ...item,
    displayName: bottleneckLabelOf(item),
    ...evidenceStatusViewOf(item.evidenceStatus || (item.complete && item.allCorrect ? 'passed' : 'missing'))
  }))
  const qualityView = qualityViewOf(report.quality)
  const headline = report.changeSummary || report.comparisonSummary || report.summary || '查看本次诊断结果'
  const explanation = buildReportExplanation(report, {
    headline,
    sourceImageCount: sourcePhotos.length,
    bottleneckCount: bottlenecks.length,
    verificationEvidenceItems,
    qualityView
  })

  return {
    headline,
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
    hasSourceEvidence: sourceEvidenceItems.length > 0,
    sourceEvidenceItems,
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
    hasLearningMap: learningMapItems.length > 0,
    learningMapItems,
    hasErrorDetails: errorDetails.length > 0,
    errorDetailList,
    hasVerificationEvidence: verificationEvidenceItems.length > 0,
    verificationEvidenceItems,
    improvedCount: isVerification
      ? bottlenecks.filter(item => item.status === 'improved').length
      : 0,
    worsenedCount: isVerification
      ? bottlenecks.filter(item => item.status === 'worsened').length
      : 0,
    showNextStep: !isVerification && bottlenecks.length > 0
  }
}

module.exports = { buildReportView }

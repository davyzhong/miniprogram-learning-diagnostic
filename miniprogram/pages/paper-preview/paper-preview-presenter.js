const {
  buildPaperDisplay,
  paperBottleneckSummaries,
  paperCodeOf,
  paperPageInfo,
  paperTitleOf
} = require('../../utils/paper-display')
const {
  bottleneckLabelOf,
  bottleneckListText
} = require('../../utils/learning-records')
const { getSubjectName } = require('../../utils/constants')
const { buildTraceableUrl } = require('../../utils/traceable-actions')
const { sanitizeUserText } = require('../../utils/user-facing-text')

function subjectNameOf(subject) {
  return getSubjectName(subject, subject || '')
}

function getPaperName(paper) {
  if (!paper) return ''
  return paperTitleOf(paper)
}

function getPaperCodeText(paper) {
  return paperCodeOf(paper, paper ? subjectNameOf(paper.subject) : '')
}

function buildBottleneckSummaries(paper) {
  return paperBottleneckSummaries(paper)
}

function buildPageSummary(paper) {
  return paperPageInfo(paper).pageSummary
}

function bottleneckCodeOf(question = {}) {
  return question.lpCode || question.bottleneckCode || question.bottleneckId || question.code || ''
}

function buildQuestionPreview(questions = [], expanded = false, context = {}) {
  const source = Array.isArray(questions) ? questions : []
  const visible = expanded ? source : source.slice(0, 4)
  return visible.map((question, index) => ({
    number: question.index || index + 1,
    content: question.content || '题目内容待加载',
    bottleneckName: sanitizeUserText(bottleneckLabelOf(question), {
      treatAsId: true,
      count: 1,
      noun: '学习卡点'
    }).trim(),
    bottleneckUrl: buildTraceableUrl({
      type: 'bottleneck-detail',
      studentId: context.studentId,
      studentName: context.studentName,
      subject: context.subject,
      id: bottleneckCodeOf(question)
    })
  }))
}

const CHINESE_STAGE_TEXT = {
  initial: '原项复测',
  reinforce: '巩固复测',
  consolidate: '迁移观察'
}
const CHINESE_METHOD_TEXT = {
  dictation: '听写',
  pinyin_to_word: '看拼音写词语',
  context_fill: '语境填空',
  character_to_pinyin: '给汉字注音',
  pronunciation_choice: '读音辨析',
  poem_fill: '补写原句',
  idiom_fill: '补全成语'
}

function chineseFeedbackText(evidence = {}) {
  if (!evidence || !evidence.evidenceStatus) return '等待作答反馈'
  if (evidence.evidenceStatus === 'passed') return '本轮已通过'
  if (evidence.evidenceStatus === 'failed') return '仍需复测'
  if (evidence.evidenceStatus === 'unclear') return '图片不清晰，待确认'
  return '作答证据不完整'
}

function buildChineseReviewCoverage(paper = {}, report = null) {
  const targets = Array.isArray(paper.chineseReviewTargets) ? paper.chineseReviewTargets : []
  if (targets.length === 0) return { hasChineseReviewCoverage: false, chineseReviewCoverage: [] }
  const evidenceById = new Map((report && report.chineseReviewEvidence || [])
    .filter(item => item && item.itemId)
    .map(item => [item.itemId, item]))
  const questions = Array.isArray(paper.questions) ? paper.questions : []
  return {
    hasChineseReviewCoverage: true,
    chineseReviewCoverage: targets.map((target, index) => {
      const targetQuestions = questions.filter(question => question.reviewItemId === target.itemId)
      const directCount = targetQuestions.filter(question => question.questionRole === 'direct_review').length
      const transferCount = targetQuestions.filter(question => question.questionRole === 'similarity_transfer').length
      const evidence = evidenceById.get(target.itemId)
      return {
        viewId: target.itemId || `chinese-target-${index + 1}`,
        title: sanitizeUserText(target.targetText || target.expectedAnswer || '语文错项', { noun: '语文错项' }),
        stageText: target.reviewStageText || CHINESE_STAGE_TEXT[target.reviewStage] || '原项复测',
        methodText: CHINESE_METHOD_TEXT[target.directMethod] || '原项复测',
        extensionText: target.allowTransfer && target.extensionFamily ? `${target.extensionFamily}举一反三` : '',
        directText: directCount > 0 ? `原项复测 ${directCount} 题` : '原项复测待生成',
        transferText: transferCount > 0 ? `举一反三 ${transferCount} 题` : '',
        feedbackText: chineseFeedbackText(evidence),
        feedbackClass: evidence && evidence.evidenceStatus || 'waiting'
      }
    })
  }
}

function buildWorkbenchStatus(report, options = {}) {
  if (!report) {
    if (options.pdfDownloaded) {
      return {
        status: 'downloaded',
        text: '已下载，等待作答',
        desc: '如果已经打印并完成纸面作答，可以上传照片进入验证反馈。'
      }
    }
    return {
      status: 'generated',
      text: '试卷已生成',
      desc: '下载 PDF 打印后让孩子纸面作答，完成后回到这里拍照上传验证。'
    }
  }
  if (report.status === 'analyzing' || report.status === 'pending' || report.status === 'uploading') {
    return {
      status: 'analyzing',
      text: '反馈分析中',
      desc: '作答照片已经上传，AI 正在整理批改结果和学习卡点变化。'
    }
  }
  if (report.status === 'failed') {
    return {
      status: 'failed',
      text: '反馈分析失败',
      desc: '这次验证反馈没有完成，可以重新上传作答照片。'
    }
  }
  return {
    status: 'completed',
    text: '已生成验证反馈',
    desc: '可以查看批改结果、评语和学习卡点改善情况。'
  }
}

function buildLifecycleSteps(status) {
  if (status === 'completed') {
    return [
      { key: 'download', text: '试卷已准备', status: 'completed' },
      { key: 'upload', text: '作答已上传', status: 'completed' },
      { key: 'feedback', text: '反馈已完成', status: 'completed' }
    ]
  }
  if (status === 'failed') {
    return [
      { key: 'download', text: '试卷已准备', status: 'completed' },
      { key: 'upload', text: '作答需重传', status: 'failed' },
      { key: 'feedback', text: '反馈未完成', status: 'failed' }
    ]
  }
  if (status === 'analyzing') {
    return [
      { key: 'download', text: '试卷已准备', status: 'completed' },
      { key: 'upload', text: '作答已上传', status: 'completed' },
      { key: 'feedback', text: 'AI 分析中', status: 'active' }
    ]
  }
  if (status === 'downloaded') {
    return [
      { key: 'download', text: 'PDF 已下载', status: 'completed' },
      { key: 'answer', text: '纸面作答', status: 'active' },
      { key: 'feedback', text: '上传验证', status: 'waiting' }
    ]
  }
  return [
    { key: 'download', text: '下载试卷', status: 'active' },
    { key: 'answer', text: '纸面作答', status: 'waiting' },
    { key: 'feedback', text: '上传验证', status: 'waiting' }
  ]
}

function buildPrimaryAction(status, { uploadUrl = '', reportUrl = '' } = {}) {
  return {
    primaryActionType: 'download',
    primaryActionText: '下载验证卷',
    primaryActionUrl: ''
  }
}

function buildSecondaryAction(status, { uploadUrl = '', reportUrl = '' } = {}) {
  if (status === 'completed') {
    return {
      secondaryActionType: 'report',
      secondaryActionText: '查看验证反馈',
      secondaryActionUrl: reportUrl
    }
  }
  if (status === 'analyzing') {
    return {
      secondaryActionType: 'report',
      secondaryActionText: '查看分析进度',
      secondaryActionUrl: reportUrl
    }
  }
  if (status === 'failed') {
    return {
      secondaryActionType: 'upload',
      secondaryActionText: '重新上传作答',
      secondaryActionUrl: uploadUrl
    }
  }
  if (uploadUrl) {
    return {
      secondaryActionType: 'upload',
      secondaryActionText: '上传作答照片',
      secondaryActionUrl: uploadUrl
    }
  }
  return {
    secondaryActionType: '',
    secondaryActionText: '',
    secondaryActionUrl: ''
  }
}

function buildFeedback(report, context = {}) {
  if (!report) {
    return {
      hasFeedback: false,
      reportId: '',
      reportUrl: '',
      title: '暂无验证反馈',
      summary: '上传作答照片后，这里会显示批改结果和学习卡点变化。',
      chips: [],
      chipItems: []
    }
  }

  const evidence = Array.isArray(report.verificationEvidence) ? report.verificationEvidence : []
  const improvedCount = evidence.filter(item => item.complete && item.allCorrect).length
  const bottleneckText = bottleneckListText(report.bottlenecks || [])
  const reportUrl = buildTraceableUrl({ type: 'report-detail', id: report._id })
  const bottleneckUrl = buildTraceableUrl({
    type: 'bottleneck-center',
    studentId: context.studentId,
    studentName: context.studentName,
    subject: context.subject,
    filter: 'active'
  })
  const retryUrl = buildTraceableUrl({
    type: 'upload',
    mode: 'verification',
    studentId: context.studentId,
    studentName: context.studentName,
    subject: context.subject,
    subjectName: context.subjectName,
    grade: context.grade,
    paperId: context.paperId
  })
  const chips = [
    improvedCount > 0 ? `${improvedCount} 个卡点有改善` : '',
    bottleneckText ? `仍需关注：${bottleneckText}` : '',
    report.status === 'failed' ? '可重新上传' : ''
  ].filter(Boolean)
  return {
    hasFeedback: report.status === 'completed',
    reportId: report._id || '',
    reportUrl,
    title: report.status === 'completed' ? '验证反馈已完成' : (report.status === 'failed' ? '验证反馈失败' : '正在分析反馈'),
    summary: report.comparisonSummary || report.changeSummary || report.summary || '反馈报告生成后会在这里展示。',
    chips,
    chipItems: chips.map(text => ({
      text,
      url: text.includes('仍需关注') ? bottleneckUrl : (text.includes('重新上传') ? retryUrl : reportUrl)
    }))
  }
}

function pageCodeSetFromReport(report) {
  const codes = new Set()
  for (const code of report && Array.isArray(report.verificationPageCodes) ? report.verificationPageCodes : []) {
    if (code) codes.add(code)
  }
  for (const item of report && Array.isArray(report.verificationPageEvidence) ? report.verificationPageEvidence : []) {
    if (item && item.pageCode) codes.add(item.pageCode)
  }
  return codes
}

function targetTextOf(targets = []) {
  const source = Array.isArray(targets) ? targets : []
  const text = source
    .map(target => target.displayName || target.title || target.targetText || target.lpName || target.name)
    .filter(Boolean)
    .join('、')
  return sanitizeUserText(text, {
    treatAsId: true,
    count: source.length,
    noun: '学习卡点'
  }).trim()
}

function buildTaskPackView(paper = {}, report = null) {
  const pages = paper.verificationPack && Array.isArray(paper.verificationPack.pages)
    ? paper.verificationPack.pages
    : []
  if (pages.length === 0) {
    return {
      taskPack: {
        hasTaskPack: false,
        totalPages: 0,
        completedPages: 0,
        pendingPages: 0,
        progressText: ''
      },
      taskPackPages: []
    }
  }

  const completedCodes = pageCodeSetFromReport(report)
  const taskPackPages = pages.map((page, index) => {
    const completed = completedCodes.has(page.pageCode)
    return {
      pageIndex: page.pageIndex || index + 1,
      pageCode: page.pageCode || '',
      targetCount: Array.isArray(page.targets) ? page.targets.length : (Array.isArray(page.targetIds) ? page.targetIds.length : 0),
      targetText: targetTextOf(page.targets || []),
      status: completed ? 'completed' : 'pending',
      statusText: completed ? '已回传' : '待回传'
    }
  })
  const completedPages = taskPackPages.filter(page => page.status === 'completed').length
  if (completedPages === 0) {
    return {
      taskPack: {
        hasTaskPack: false,
        totalPages: taskPackPages.length,
        completedPages: 0,
        pendingPages: taskPackPages.length,
        progressText: ''
      },
      taskPackPages: []
    }
  }
  return {
    taskPack: {
      hasTaskPack: true,
      totalPages: taskPackPages.length,
      completedPages,
      pendingPages: Math.max(0, taskPackPages.length - completedPages),
      progressText: `已回传 ${completedPages}/${taskPackPages.length} 页`
    },
    taskPackPages
  }
}

function buildPaperPreviewState({ paper, detail = {}, subjectName = '', studentName = '', pdfDownloaded = false } = {}) {
  const p = paper || detail.paper || {}
  const isVerification = p.type === 'verification'
  const questions = Array.isArray(p.questions) ? p.questions : []
  const latestReport = detail.latestVerificationReport || detail.latestReport || null
  const resolvedSubjectName = subjectName || subjectNameOf(p.subject)
  const resolvedStudentName = (detail.student && detail.student.name) || studentName || ''
  const paperDisplay = buildPaperDisplay(p, resolvedSubjectName)
  const context = {
    studentId: p.studentId || '',
    studentName: resolvedStudentName,
    subject: p.subject || 'math',
    subjectName: resolvedSubjectName,
    grade: p.grade || '',
    paperId: p._id
  }
  const paperCodeUrl = buildTraceableUrl({ type: 'paper-workbench', id: p._id })
  const uploadUrl = buildTraceableUrl({
    type: 'upload',
    mode: isVerification ? 'verification' : 'paper',
    ...context
  })
  const feedback = buildFeedback(latestReport, context)
  const taskPackView = buildTaskPackView(p, latestReport)
  const chineseReviewCoverage = buildChineseReviewCoverage(p, latestReport)
  const reportUrl = latestReport && latestReport._id
    ? buildTraceableUrl({ type: 'report-detail', id: latestReport._id })
    : ''
  const workbenchStatus = buildWorkbenchStatus(latestReport, { pdfDownloaded })
  const primaryAction = buildPrimaryAction(workbenchStatus.status, { uploadUrl, reportUrl })
  const secondaryAction = buildSecondaryAction(workbenchStatus.status, { uploadUrl, reportUrl })

  return {
    paperId: p._id,
    studentId: p.studentId || '',
    subject: p.subject || 'math',
    grade: p.grade || '',
    pdfFileId: p.pdfFileId || '',
    typeText: isVerification ? '验证试卷' : '诊断试卷',
    paperType: isVerification ? 'verification' : 'diagnosis',
    subjectName: resolvedSubjectName,
    studentName: resolvedStudentName,
    paperName: paperDisplay.paperTitle,
    paperCodeText: paperDisplay.paperCode,
    paperDate: p.paperDate || '',
    paperCodeUrl,
    statusUrl: reportUrl || uploadUrl,
    uploadUrl,
    bottleneckCenterUrl: buildTraceableUrl({
      type: 'bottleneck-center',
      studentId: context.studentId,
      studentName: context.studentName,
      subject: context.subject,
      filter: 'active'
    }),
    questionCount: paperDisplay.questionCount,
    estimatedMinutes: p.estimatedMinutes || (paperDisplay.questionCount * 2),
    pages: paperDisplay.totalPages,
    studentPages: paperDisplay.studentPages,
    answerPages: paperDisplay.answerPages,
    pageSummary: paperDisplay.pageSummary,
    bottleneckTargets: p.bottleneckTargets || [],
    bottleneckText: paperDisplay.bottleneckText,
    coverageText: paperDisplay.coverageText,
    bottleneckHierarchy: paperDisplay.bottleneckHierarchy,
    questionPreview: buildQuestionPreview(questions, false, context),
    hasMoreQuestions: questions.length > 4,
    allQuestionsExpanded: false,
    workbenchStatus: workbenchStatus.status,
    workbenchStatusText: workbenchStatus.text,
    workbenchStatusDesc: workbenchStatus.desc,
    lifecycleSteps: buildLifecycleSteps(workbenchStatus.status),
    ...primaryAction,
    ...secondaryAction,
    feedback,
    ...chineseReviewCoverage,
    ...taskPackView,
    pdfReady: !!p.pdfFileId,
    pdfDownloaded,
    uploadBtnText: secondaryAction.secondaryActionText || `作答完成，${isVerification ? '上传验证' : '上传答题'}`
  }
}

module.exports = {
  subjectNameOf,
  getPaperName,
  getPaperCodeText,
  buildBottleneckSummaries,
  buildPageSummary,
  buildQuestionPreview,
  buildChineseReviewCoverage,
  buildWorkbenchStatus,
  buildLifecycleSteps,
  buildPrimaryAction,
  buildSecondaryAction,
  buildFeedback,
  buildTaskPackView,
  buildPaperPreviewState
}

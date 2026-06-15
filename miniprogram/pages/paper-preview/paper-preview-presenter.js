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
    bottleneckName: bottleneckLabelOf(question),
    bottleneckUrl: buildTraceableUrl({
      type: 'bottleneck-detail',
      studentId: context.studentId,
      studentName: context.studentName,
      subject: context.subject,
      id: bottleneckCodeOf(question)
    })
  }))
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
      desc: '先下载 PDF 或分享打印，纸面作答后再回到这里上传验证。'
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
  if (status === 'completed') {
    return {
      primaryActionType: 'report',
      primaryActionText: '查看验证反馈',
      primaryActionUrl: reportUrl
    }
  }
  if (status === 'analyzing') {
    return {
      primaryActionType: 'report',
      primaryActionText: '查看分析进度',
      primaryActionUrl: reportUrl
    }
  }
  if (status === 'failed') {
    return {
      primaryActionType: 'upload',
      primaryActionText: '重新上传作答',
      primaryActionUrl: uploadUrl
    }
  }
  if (status === 'downloaded') {
    return {
      primaryActionType: 'upload',
      primaryActionText: '作答完成，上传验证',
      primaryActionUrl: uploadUrl
    }
  }
  return {
    primaryActionType: 'download',
    primaryActionText: '下载 PDF，准备打印',
    primaryActionUrl: ''
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
  const reportUrl = latestReport && latestReport._id
    ? buildTraceableUrl({ type: 'report-detail', id: latestReport._id })
    : ''
  const workbenchStatus = buildWorkbenchStatus(latestReport, { pdfDownloaded })
  const primaryAction = buildPrimaryAction(workbenchStatus.status, { uploadUrl, reportUrl })

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
    questionPreview: buildQuestionPreview(questions, false, context),
    hasMoreQuestions: questions.length > 4,
    allQuestionsExpanded: false,
    workbenchStatus: workbenchStatus.status,
    workbenchStatusText: workbenchStatus.text,
    workbenchStatusDesc: workbenchStatus.desc,
    lifecycleSteps: buildLifecycleSteps(workbenchStatus.status),
    ...primaryAction,
    feedback,
    pdfReady: !!p.pdfFileId,
    pdfDownloaded,
    uploadBtnText: primaryAction.primaryActionText || `作答完成，${isVerification ? '上传验证' : '上传答题'}`
  }
}

module.exports = {
  subjectNameOf,
  getPaperName,
  getPaperCodeText,
  buildBottleneckSummaries,
  buildPageSummary,
  buildQuestionPreview,
  buildWorkbenchStatus,
  buildLifecycleSteps,
  buildPrimaryAction,
  buildFeedback,
  buildPaperPreviewState
}

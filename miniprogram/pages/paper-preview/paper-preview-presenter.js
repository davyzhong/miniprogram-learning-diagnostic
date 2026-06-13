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

function buildWorkbenchStatus(report) {
  if (!report) {
    return {
      status: 'waiting',
      text: '等待打印作答',
      desc: '下载或分享打印后，让孩子在纸面完成作答，再回到这里上传验证。'
    }
  }
  if (report.status === 'analyzing') {
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
  const workbenchStatus = buildWorkbenchStatus(latestReport)
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
    statusUrl: latestReport && latestReport.status === 'completed' && latestReport._id
      ? buildTraceableUrl({ type: 'report-detail', id: latestReport._id })
      : uploadUrl,
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
    feedback,
    pdfReady: !!p.pdfFileId,
    pdfDownloaded,
    uploadBtnText: `作答完成，${isVerification ? '上传验证' : '上传答题'}`
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
  buildFeedback,
  buildPaperPreviewState
}

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

function buildQuestionPreview(questions = [], expanded = false) {
  const source = Array.isArray(questions) ? questions : []
  const visible = expanded ? source : source.slice(0, 4)
  return visible.map((question, index) => ({
    number: question.index || index + 1,
    content: question.content || '题目内容待加载',
    bottleneckName: bottleneckLabelOf(question)
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

function buildFeedback(report) {
  if (!report) {
    return {
      hasFeedback: false,
      reportId: '',
      title: '暂无验证反馈',
      summary: '上传作答照片后，这里会显示批改结果和学习卡点变化。',
      chips: []
    }
  }

  const evidence = Array.isArray(report.verificationEvidence) ? report.verificationEvidence : []
  const improvedCount = evidence.filter(item => item.complete && item.allCorrect).length
  const bottleneckText = bottleneckListText(report.bottlenecks || [])
  return {
    hasFeedback: report.status === 'completed',
    reportId: report._id || '',
    title: report.status === 'completed' ? '验证反馈已完成' : (report.status === 'failed' ? '验证反馈失败' : '正在分析反馈'),
    summary: report.comparisonSummary || report.changeSummary || report.summary || '反馈报告生成后会在这里展示。',
    chips: [
      improvedCount > 0 ? `${improvedCount} 个卡点有改善` : '',
      bottleneckText ? `仍需关注：${bottleneckText}` : '',
      report.status === 'failed' ? '可重新上传' : ''
    ].filter(Boolean)
  }
}

function buildPaperPreviewState({ paper, detail = {}, subjectName = '', studentName = '', pdfDownloaded = false } = {}) {
  const p = paper || detail.paper || {}
  const isVerification = p.type === 'verification'
  const questions = Array.isArray(p.questions) ? p.questions : []
  const latestReport = detail.latestVerificationReport || detail.latestReport || null
  const resolvedSubjectName = subjectName || subjectNameOf(p.subject)
  const paperDisplay = buildPaperDisplay(p, resolvedSubjectName)
  const workbenchStatus = buildWorkbenchStatus(latestReport)

  return {
    paperId: p._id,
    studentId: p.studentId || '',
    subject: p.subject || 'math',
    grade: p.grade || '',
    pdfFileId: p.pdfFileId || '',
    typeText: isVerification ? '验证试卷' : '诊断试卷',
    paperType: isVerification ? 'verification' : 'diagnosis',
    subjectName: resolvedSubjectName,
    studentName: (detail.student && detail.student.name) || studentName || '',
    paperName: paperDisplay.paperTitle,
    paperCodeText: paperDisplay.paperCode,
    paperDate: p.paperDate || '',
    questionCount: paperDisplay.questionCount,
    estimatedMinutes: p.estimatedMinutes || (paperDisplay.questionCount * 2),
    pages: paperDisplay.totalPages,
    studentPages: paperDisplay.studentPages,
    answerPages: paperDisplay.answerPages,
    pageSummary: paperDisplay.pageSummary,
    bottleneckTargets: p.bottleneckTargets || [],
    bottleneckText: paperDisplay.bottleneckText,
    questionPreview: buildQuestionPreview(questions, false),
    hasMoreQuestions: questions.length > 4,
    allQuestionsExpanded: false,
    workbenchStatus: workbenchStatus.status,
    workbenchStatusText: workbenchStatus.text,
    workbenchStatusDesc: workbenchStatus.desc,
    feedback: buildFeedback(latestReport),
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

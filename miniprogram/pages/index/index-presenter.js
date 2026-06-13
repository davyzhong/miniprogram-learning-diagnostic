const {
  formatBottleneckDisplayName,
  formatBottleneckDisplayList
} = require('../../utils/util')
const {
  bottleneckListText,
  isMainTimelinePaper
} = require('../../utils/learning-records')
const { buildPaperCodeMap, buildPaperDisplay } = require('../../utils/paper-display')
const {
  buildBottleneckViews,
  buildBottleneckStats,
  profileBottlenecks
} = require('../../utils/bottleneck-view')
const {
  SUBJECTS: SUBJECT_KEYS,
  SUBJECT_NAMES,
  SUBJECT_SHORT_NAMES
} = require('../../utils/constants')

const SUBJECTS = SUBJECT_KEYS.map(key => ({
  key,
  name: SUBJECT_NAMES[key],
  shortName: SUBJECT_SHORT_NAMES[key]
}))

function toDate(value) {
  if (!value) return null
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? null : date
}

function newestDate(values) {
  return values
    .map(toDate)
    .filter(Boolean)
    .sort((a, b) => b - a)[0] || null
}

function activeBottlenecks(profile = {}) {
  return profileBottlenecks(profile).filter(item => item.status !== 'improved')
}

function allSubjectBottleneckViews(profileBySubject) {
  const rawItems = SUBJECTS.flatMap(subject => {
    const profile = profileBySubject.get(subject.key) || {}
    return profileBottlenecks(profile).map(item => ({
      ...item,
      subject: subject.key,
      subjectName: subject.name
    }))
  })
  return buildBottleneckViews(rawItems)
}

function hasSubjectEvidence(subject, profile, reports) {
  if (!profile) return reports.some(report => report.subject === subject.key)
  return Boolean(
    profile.totalReports > 0
    || profileBottlenecks(profile).length > 0
    || reports.some(report => report.subject === subject.key)
  )
}

function subjectLabelList(subjects) {
  return subjects.map(item => item.name).join('、')
}

function buildCoverageText(analyzedSubjects, missingSubjects) {
  if (analyzedSubjects.length === 0) return '样本覆盖：暂无有效诊断记录。'
  const analyzedText = `已分析${subjectLabelList(analyzedSubjects)}试卷`
  const missingText = missingSubjects.length > 0
    ? `；${subjectLabelList(missingSubjects)}暂无有效诊断记录`
    : ''
  return `样本覆盖：${analyzedText}${missingText}。`
}

function reportTypeName(report = {}) {
  if (report.type === 'verification') return '验证报告'
  return '诊断报告'
}

function buildReportRecord(report, subjectName, formatRelativeTime) {
  const observationCount = (report.bottlenecks || []).length
  const bottleneckText = bottleneckListText(report.bottlenecks || [])
  return {
    kind: report.type === 'verification' ? 'verification-report' : 'diagnosis-report',
    icon: report.type === 'verification' ? '验' : '报',
    subject: report.subject,
    title: `${subjectName}${reportTypeName(report)}`,
    summary: [
      formatRelativeTime(report.createdAt),
      observationCount > 0 ? `发现 ${observationCount} 条学习观察` : '点击阅读本次报告'
    ].filter(Boolean).join(' · '),
    metaText: [
      bottleneckText ? `关注 ${bottleneckText}` : '',
      report.type === 'verification' ? '验证反馈' : '诊断结果'
    ].filter(Boolean).join(' · '),
    createdAt: report.createdAt,
    reportId: report._id
  }
}

function reportPhotoCount(report = {}) {
  if (Array.isArray(report.imageFiles)) return report.imageFiles.length
  if (Array.isArray(report.imageFileIds)) return report.imageFileIds.length
  return 0
}

function buildPrimaryReport(reports, subjectByKey, formatRelativeTime) {
  const report = (reports || [])
    .filter(item => item.status === 'completed' && (item.isEffective === undefined || item.isEffective === true))
    .sort((a, b) => toDate(b.createdAt) - toDate(a.createdAt))[0]

  if (!report) return null

  const subject = subjectByKey[report.subject] || { name: report.subjectName || '学习' }
  const isVerification = report.type === 'verification'
  const bottleneckText = bottleneckListText(report.bottlenecks || [])
  const photoCount = reportPhotoCount(report)
  const evidenceParts = [
    photoCount > 0 ? `${photoCount} 张照片` : '',
    report.totalErrors > 0 ? `${report.totalErrors} 道相关错题` : '',
    !photoCount && !report.totalErrors ? formatRelativeTime(report.createdAt) : ''
  ].filter(Boolean)

  return {
    kind: isVerification ? 'verification-report' : 'diagnosis-report',
    icon: isVerification ? '验' : '报',
    subject: report.subject,
    title: `最新${subject.name}${isVerification ? '验证反馈' : '诊断报告'}`,
    summary: report.comparisonSummary || report.changeSummary || report.summary || (
      bottleneckText ? `重点关注：${bottleneckText}` : '点击阅读本次报告'
    ),
    bottleneckText,
    evidenceText: evidenceParts.join(' · '),
    reportId: report._id,
    actionText: '阅读完整报告',
    createdAt: report.createdAt
  }
}

function buildPaperRecord(paper, subjectName, formatRelativeTime, paperCodeById) {
  const display = buildPaperDisplay(paper, subjectName, { paperCodeById })
  return {
    kind: 'verification-paper',
    icon: '卷',
    subject: paper.subject,
    title: `${subjectName}验证试卷`,
    summary: [
      formatRelativeTime(paper.createdAt),
      display.paperCode ? `编号 ${display.paperCode}` : '',
      display.questionCount ? `${display.questionCount} 题` : '',
      display.bottleneckText ? `覆盖 ${display.bottleneckText}` : ''
    ].filter(Boolean).join(' · '),
    paperCode: display.paperCode,
    createdAt: paper.createdAt,
    paperId: paper._id
  }
}

function buildRecentRecords(reports, papers, subjectByKey, formatRelativeTime) {
  const records = []
  const paperCodeById = buildPaperCodeMap(papers)
  reports
    .filter(report => report.status === 'completed' && (report.isEffective === undefined || report.isEffective === true))
    .forEach(report => {
      const subject = subjectByKey[report.subject] || { name: report.subjectName || '学习' }
      records.push(buildReportRecord(report, subject.name, formatRelativeTime))
    })

  papers
    .filter(isMainTimelinePaper)
    .forEach(paper => {
      const subject = subjectByKey[paper.subject] || { name: paper.subjectName || '学习' }
      records.push(buildPaperRecord(paper, subject.name, formatRelativeTime, paperCodeById))
    })

  return records
    .sort((a, b) => toDate(b.createdAt) - toDate(a.createdAt))
    .slice(0, 3)
}

function buildPriorityHighlights(profileBySubject) {
  return SUBJECTS.map(subject => {
    const profile = profileBySubject.get(subject.key) || {}
    const active = activeBottlenecks(profile)
    const improved = profileBottlenecks(profile).filter(item => item.status === 'improved')

    if (active.length > 0) {
      return {
        subject: subject.key,
        subjectName: subject.name,
        subjectShortName: subject.shortName,
        title: `${subject.name}有 ${active.length} 个学习卡点待验证`,
        summary: `重点关注：${formatBottleneckDisplayList(active)}`,
        statusText: '建议验证',
        statusClass: 'pending',
        actionText: `进入${subject.name}工作台`
      }
    }

    if (improved.length > 0) {
      return {
        subject: subject.key,
        subjectName: subject.name,
        subjectShortName: subject.shortName,
        title: `${subject.name}近期有改善记录`,
        summary: `已改善：${formatBottleneckDisplayList(improved)}`,
        statusText: '已有改善',
        statusClass: 'improved',
        actionText: `进入${subject.name}工作台`
      }
    }

    return null
  }).filter(Boolean).slice(0, 2)
}

function buildLearningProfileHomeView(input = {}, formatRelativeTime = () => '') {
  const student = input.student || {}
  const reports = input.reports || []
  const papers = input.papers || []
  const permissions = input.permissions || student.permissions || {}
  const canWriteActions = permissions.canUpload !== false || permissions.canGeneratePaper !== false
  const profileBySubject = new Map((input.profiles || []).map(profile => [profile.subject, profile]))
  const subjectByKey = Object.fromEntries(SUBJECTS.map(subject => [subject.key, subject]))

  const subjects = SUBJECTS.map(subject => {
    const profile = profileBySubject.get(subject.key) || {}
    const active = activeBottlenecks(profile)
    const improved = profileBottlenecks(profile).filter(item => item.status === 'improved')
    return {
      key: subject.key,
      name: subject.name,
      shortName: subject.shortName,
      statusText: active.length > 0 || improved.length > 0 ? '已有观察' : '待采样',
      totalReports: profile.totalReports || 0
    }
  })

  const analyzedSubjects = SUBJECTS.filter(subject =>
    hasSubjectEvidence(subject, profileBySubject.get(subject.key), reports)
  )
  const missingSubjects = SUBJECTS.filter(subject =>
    !analyzedSubjects.some(item => item.key === subject.key)
  )
  const allCurrentBottlenecks = SUBJECTS.flatMap(subject =>
    profileBottlenecks(profileBySubject.get(subject.key) || {})
  )
  const pendingBottlenecks = allCurrentBottlenecks.filter(item => item.status !== 'improved')
  const improvedBottlenecks = allCurrentBottlenecks.filter(item => item.status === 'improved')
  const effectiveReports = reports.filter(report =>
    report.status === 'completed' && (report.isEffective === undefined || report.isEffective === true)
  )
  const latest = newestDate([
    ...Array.from(profileBySubject.values()).map(profile => profile.updatedAt),
    ...reports.map(report => report.createdAt),
    ...papers.map(paper => paper.createdAt)
  ])
  const latestText = latest ? formatRelativeTime(latest) : '暂无'

  const priorityHighlights = buildPriorityHighlights(profileBySubject)
  const bottleneckViews = allSubjectBottleneckViews(profileBySubject)
  const bottleneckStats = buildBottleneckStats(bottleneckViews)
  const primarySubject = priorityHighlights[0] && subjectByKey[priorityHighlights[0].subject]
  const pendingNames = formatBottleneckDisplayList(pendingBottlenecks)
  const hasPending = pendingBottlenecks.length > 0
  const hasImprovedOnly = !hasPending && improvedBottlenecks.length > 0
  let headline = '还没有形成有效学习观察'
  if (hasPending && analyzedSubjects.length === 1 && missingSubjects.length > 0) {
    headline = `${analyzedSubjects[0].name}学习线索已形成，其他学科仍待补充样本`
  } else if (hasPending) {
    headline = '已形成待验证学习观察'
  } else if (hasImprovedOnly) {
    headline = '近期验证显示部分学习观察已有改善'
  }

  let summary = '当前还没有形成有效学习观察，建议先上传一份数学或语文试卷。'
  if (hasPending) {
    const analyzedText = subjectLabelList(analyzedSubjects)
    const missingText = missingSubjects.length > 0
      ? `${subjectLabelList(missingSubjects)}还需要后续补充试卷或作业记录。`
      : '可以继续通过新试卷观察是否有新的学习线索。'
    summary = `基于近期上传的${analyzedText}试卷，目前已整理出 ${pendingBottlenecks.length} 条待验证学习观察，主要集中在${pendingNames}。当前结论主要来自${analyzedText}样本，${missingText}`
  } else if (hasImprovedOnly) {
    summary = '近期验证显示部分学习观察已有改善，建议继续通过新试卷观察巩固情况。'
  }

  const metrics = [
    { label: '待验证', value: String(pendingBottlenecks.length), tone: 'warning' },
    { label: '有效报告', value: String(effectiveReports.length), tone: 'primary' },
    improvedBottlenecks.length > 0
      ? { label: '已改善', value: String(improvedBottlenecks.length), tone: 'success' }
      : { label: '最近更新', value: latestText, tone: 'success' }
  ]

  const nextSubject = (primarySubject && primarySubject.key) || 'math'
  const nextAction = canWriteActions
    ? {
        title: hasPending
          ? `优先完成${primarySubject ? primarySubject.name : '数学'}验证试卷`
          : hasImprovedOnly
            ? '继续上传新试卷观察巩固情况'
            : '上传第一份试卷，建立学习档案',
        summary: hasPending
          ? `用于确认${pendingNames}是否稳定出现。`
          : '上传试卷后，系统会整理学习观察和诊断报告。',
        primaryText: hasPending ? '生成验证试卷' : (hasImprovedOnly ? '上传新试卷' : '上传第一份试卷'),
        secondaryText: hasPending ? '上传新试卷' : '查看学习记录',
        subject: nextSubject
      }
    : {
        title: '查看最新学习资料',
        summary: '你当前是共同家长，可以参与学习诊断；如需邀请或移除家庭成员，请联系档案创建者。',
        primaryText: '查看学习记录',
        secondaryText: '',
        subject: nextSubject
      }

  return {
    studentId: student._id || '',
    studentName: student.name || '',
    avatarText: student.name ? student.name.charAt(0) : '',
    gradeText: student.grade ? `${student.grade}年级` : '',
    recentUpdateText: latestText,
    headline,
    summary,
    sampleCoverageText: buildCoverageText(analyzedSubjects, missingSubjects),
    metrics,
    priorityHighlights,
    priorityBottlenecks: bottleneckViews.slice(0, 3),
    bottleneckStats,
    hasBottleneckBoard: bottleneckViews.length > 0,
    observations: priorityHighlights,
    primaryReport: buildPrimaryReport(reports, subjectByKey, formatRelativeTime),
    recentRecords: buildRecentRecords(reports, papers, subjectByKey, formatRelativeTime),
    nextAction,
    permissions,
    canWriteActions,
    subjects,
    isEmpty: false
  }
}

module.exports = {
  buildLearningProfileHomeView,
  SUBJECTS
}

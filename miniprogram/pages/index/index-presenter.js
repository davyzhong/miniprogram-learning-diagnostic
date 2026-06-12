const {
  formatBottleneckDisplayName,
  formatBottleneckDisplayList
} = require('../../utils/util')

const SUBJECTS = [
  { key: 'math', name: '数学', shortName: '数' },
  { key: 'chinese', name: '语文', shortName: '语' },
  { key: 'english', name: '英语', shortName: '英' }
]

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

function profileBottlenecks(profile = {}) {
  if (Array.isArray(profile.currentBottlenecks)) return profile.currentBottlenecks
  return [
    ...(profile.pendingBottlenecks || []).map(item => ({ ...item, status: 'needs_verification' })),
    ...(profile.improvedBottlenecks || []).map(item => ({ ...item, status: 'improved' }))
  ]
}

function activeBottlenecks(profile = {}) {
  return profileBottlenecks(profile).filter(item => item.status !== 'improved')
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

function buildUploadRecord(report, subjectName, formatRelativeTime) {
  const imageCount = Array.isArray(report.imageFiles)
    ? report.imageFiles.length
    : (report.imageFileIds || []).length
  if (imageCount <= 0) return null
  return {
    kind: 'upload',
    icon: '图',
    subject: report.subject,
    title: `上传${subjectName}试卷照片`,
    summary: `${formatRelativeTime(report.createdAt)} · ${imageCount} 张图片已识别`,
    reportId: report._id
  }
}

function buildReportRecord(report, subjectName, formatRelativeTime) {
  const observationCount = (report.bottlenecks || []).length
  return {
    kind: report.type === 'verification' ? 'verification-report' : 'diagnosis-report',
    icon: report.type === 'verification' ? '验' : '报',
    subject: report.subject,
    title: `${subjectName}${reportTypeName(report)}`,
    summary: [
      formatRelativeTime(report.createdAt),
      observationCount > 0 ? `发现 ${observationCount} 条学习观察` : '点击阅读本次报告'
    ].filter(Boolean).join(' · '),
    reportId: report._id
  }
}

function buildRecentRecords(reports, subjectByKey, formatRelativeTime) {
  const records = []
  reports
    .filter(report => report.status === 'completed' && (report.isEffective === undefined || report.isEffective === true))
    .sort((a, b) => toDate(b.createdAt) - toDate(a.createdAt))
    .slice(0, 2)
    .forEach(report => {
      const subject = subjectByKey[report.subject] || { name: report.subjectName || '学习' }
      const uploadRecord = buildUploadRecord(report, subject.name, formatRelativeTime)
      if (uploadRecord) records.push(uploadRecord)
      records.push(buildReportRecord(report, subject.name, formatRelativeTime))
    })
  return records.slice(0, 3)
}

function buildLearningProfileHomeView(input = {}, formatRelativeTime = () => '') {
  const student = input.student || {}
  const reports = input.reports || []
  const papers = input.papers || []
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

  const observations = SUBJECTS.map(subject => {
    const profile = profileBySubject.get(subject.key) || {}
    const active = activeBottlenecks(profile)
    const improved = profileBottlenecks(profile).filter(item => item.status === 'improved')
    const items = active.length > 0 ? active : improved
    if (items.length === 0) return null
    const statusText = active.length > 0 ? '待验证' : '已有改善'
    return {
      subject: subject.key,
      subjectName: subject.name,
      subjectShortName: subject.shortName,
      title: `${subject.name} · ${items.length} 条${statusText}观察`,
      summary: `${formatBottleneckDisplayList(items)} · 来源：最近${active.length > 0 ? '诊断报告' : '验证报告'}`,
      statusText,
      statusClass: active.length > 0 ? 'pending' : 'improved'
    }
  }).filter(Boolean)

  const primarySubject = observations[0] && subjectByKey[observations[0].subject]
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
    { label: '学习观察', value: String(allCurrentBottlenecks.length), tone: 'warning' },
    { label: '有效报告', value: String(effectiveReports.length), tone: 'primary' },
    improvedBottlenecks.length > 0
      ? { label: '已改善', value: String(improvedBottlenecks.length), tone: 'success' }
      : { label: '最近更新', value: latestText, tone: 'success' }
  ]

  const nextSubject = (primarySubject && primarySubject.key) || 'math'
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
    observations,
    recentRecords: buildRecentRecords(reports, subjectByKey, formatRelativeTime),
    nextAction: {
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
    },
    subjects,
    isEmpty: false
  }
}

module.exports = {
  buildLearningProfileHomeView,
  SUBJECTS
}

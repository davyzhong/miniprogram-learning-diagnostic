const {
  formatBottleneckDisplayName,
  formatBottleneckDisplayList,
  formatChineseDateTime
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
const { buildTraceableUrl } = require('../../utils/traceable-actions')
const { sanitizeUserText } = require('../../utils/user-facing-text')

const SUBJECT_MARKERS = { math: '数学', chinese: '语文', english: '英语' }

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
  // 按学科分别构建（数学展开细卡点 BN，与其他页面保持一致的粒度）
  const views = []
  for (const subject of SUBJECTS) {
    const profile = profileBySubject.get(subject.key) || {}
    const rawItems = profileBottlenecks(profile).map(item => ({
      ...item,
      subject: subject.key,
      subjectName: subject.name
    }))
    const subjectViews = buildBottleneckViews(rawItems, {
      subject: subject.key,
      subjectName: subject.name,
      expandCandidates: subject.key === 'math',  // 数学展开细卡点，与学科首页/报告页一致
    })
    views.push(...subjectViews)
  }
  return views
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

// 知识地图卡片：4 领域 + 进度可视化
const DOMAIN_META = [
  { key: '数与代数', marker: '数', short: '数与代数' },
  { key: '图形与几何', marker: '形', short: '图形几何' },
  { key: '统计与概率', marker: '统', short: '统计概率' },
  { key: '综合与实践', marker: '综', short: '综合实践' },
]

function buildKnowledgeMapCard(subjects = [], bottleneckStats = {}) {
  const pending = bottleneckStats.pendingCount || 0
  const improved = bottleneckStats.improvedCount || 0
  const total = bottleneckStats.totalCount || 0
  const hasData = total > 0

  // 按领域分组卡点（从 subjects 的 bottleneckViews 提取）
  const domains = DOMAIN_META.map(meta => {
    // 从 subjects 找该领域的卡点数（简化版：用 subject 级统计）
    return {
      marker: meta.marker,
      name: meta.short,
      pendingCount: 0,
      masteredCount: 0,
      status: 'unknown',
    }
  })

  // 如果有学科数据，用学科粒度填充
  if (subjects.length > 0) {
    const mathSubject = subjects.find(s => s.key === 'math')
    if (mathSubject) {
      // 简化：把卡点统计映射到领域（实际应按 nodeId 的 domain 分类）
      // 第一版用整体统计代替领域细分
      domains[0].pendingCount = pending
      domains[0].masteredCount = improved
      domains[0].status = pending > 0 ? 'active' : (improved > 0 ? 'mastered' : 'unknown')
    }
  }

  return {
    visible: true, // 始终显示卡片，无数据时显示提示文案
    title: '学习地图',
    summary: hasData
      ? `${pending > 0 ? pending + ' 个待修复' : '当前无待修复卡点'}${improved > 0 ? ' · ' + improved + ' 个已改善' : ''}`
      : '上传试卷后生成',
    domains,
    totalPending: pending,
    totalMastered: improved,
  }
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

function reportEvidenceTime(report = {}) {
  if (report.evidenceTime) return report.evidenceTime
  if (report.verificationUploadedAt) return report.verificationUploadedAt
  const firstPhoto = Array.isArray(report.imageFiles)
    ? report.imageFiles.find(item => item && item.uploadedAt)
    : null
  return (firstPhoto && firstPhoto.uploadedAt) || report.createdAt
}

function buildPrimaryReportFinding(totalErrors, bottleneckText) {
  if (totalErrors > 0 && bottleneckText) {
    return `共发现 ${totalErrors} 道相关错题，主要卡点：${bottleneckText}`
  }
  if (totalErrors > 0) return `共发现 ${totalErrors} 道相关错题`
  if (bottleneckText) return `主要卡点：${bottleneckText}`
  return ''
}

function buildPrimaryReport(reports, subjectByKey, formatRelativeTime) {
  const completedReports = (reports || [])
    .filter(item => item.status === 'completed' && (item.isEffective === undefined || item.isEffective === true))
    .sort((a, b) => toDate(b.createdAt) - toDate(a.createdAt))
  const report = completedReports.find(item => item.type !== 'verification') || completedReports[0]

  if (!report) return null

  const subject = subjectByKey[report.subject] || { name: report.subjectName || '学习' }
  const isVerification = report.type === 'verification'
  const bottleneckText = bottleneckListText(report.bottlenecks || [])
  const photoCount = reportPhotoCount(report)
  const generatedAtText = formatChineseDateTime(report.createdAt)
  const evidenceTimeText = formatChineseDateTime(reportEvidenceTime(report))
  const findingText = buildPrimaryReportFinding(report.totalErrors || 0, bottleneckText)
  const infoRows = [
    generatedAtText ? { label: '报告生成', value: generatedAtText } : null,
    evidenceTimeText ? { label: '证据时间', value: evidenceTimeText } : null
  ].filter(Boolean)
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
    summary: sanitizeUserText(report.comparisonSummary || report.changeSummary || report.summary || (
      bottleneckText ? `重点关注：${bottleneckText}` : '点击阅读本次报告'
    ), { treatAsId: true, count: (report.bottlenecks || []).length, noun: '学习卡点' }),
    generatedAtText,
    evidenceTimeText,
    findingText,
    infoRows,
    bottleneckText,
    evidenceText: evidenceParts.join(' · '),
    reportId: report._id,
    url: buildTraceableUrl({ type: 'report-detail', id: report._id }),
    actionText: '阅读完整报告',
    createdAt: report.createdAt
  }
}

function uniqueReports(reports = []) {
  const byId = new Map()
  reports.forEach(report => {
    if (!report || !report._id || byId.has(report._id)) return
    byId.set(report._id, report)
  })
  return Array.from(byId.values())
}

function formalDiagnosisReports(input = {}) {
  const hasExplicitDiagnoses = Array.isArray(input.latestDiagnosisReports)
  const source = hasExplicitDiagnoses ? input.latestDiagnosisReports : (input.reports || [])
  return source.filter(report => (
    report
    && report.subject
    && report.type !== 'verification'
    && report.status !== 'analyzing'
    && report.status !== 'pending'
    && report.status !== 'failed'
    && report.isEffective !== false
  ))
}

function workbenchEvidenceCount(report = {}) {
  if (Number(report.totalErrors) > 0) return Number(report.totalErrors)
  if (Number(report.imageFileCount) > 0) return Number(report.imageFileCount)
  if (Array.isArray(report.imageFiles) && report.imageFiles.length > 0) return report.imageFiles.length
  return (report.bottlenecks || []).reduce((sum, item) => sum + (Number(item.errorCount) || 0), 0)
}

function buildDiagnosisPrimaryAction(student, subject, report, profile, papers) {
  const readyPaper = (papers || []).find(paper => (
    paper.subject === subject.key
    && paper.type === 'verification'
    && (paper.generationStatus === 'ready' || Boolean(paper.pdfFileId))
    && (!paper.triggeredByReport || paper.triggeredByReport === report._id)
  ))
  if (readyPaper) {
    return {
      marker: '试卷',
      text: '查看验证卷',
      summary: '用针对性验证确认报告中的学习卡点。',
      url: buildTraceableUrl({ type: 'paper-workbench', id: readyPaper._id })
    }
  }

  const pending = activeBottlenecks(profile)
  if (pending.length > 0) {
    return {
      marker: '跟进',
      text: `进入${subject.name}跟进`,
      summary: `继续跟进${formatBottleneckDisplayList(pending)}。`,
      url: subjectHomeUrl(student, subject.key)
    }
  }

  return {
    marker: '上传',
    text: '补充新样本',
    summary: '上传新的作业或试卷，观察巩固情况。',
    url: uploadUrl(student, subject.key)
  }
}

function buildDiagnosisWorkbenches(input, profileBySubject, subjectByKey, formatRelativeTime) {
  const student = input.student || {}
  return formalDiagnosisReports(input)
    .sort((a, b) => toDate(b.createdAt) - toDate(a.createdAt))
    .map(report => {
      const subject = subjectByKey[report.subject] || { key: report.subject, name: report.subjectName || '学习' }
      const profile = profileBySubject.get(report.subject) || {}
      const items = profileBottlenecks(profile)
      const improvedCount = items.filter(item => item.status === 'improved').length
      const persistingCount = items.filter(item => item.status === 'persisting').length
      const waitingCount = items.filter(item => item.status !== 'improved' && item.status !== 'persisting').length
      const bottleneckText = bottleneckListText(report.bottlenecks || [])
      const judgment = report.comparisonSummary || report.changeSummary || report.summary || (
        bottleneckText ? `当前重点关注：${bottleneckText}` : '本学科已形成正式诊断。'
      )
      const trendText = improvedCount > 0 && improvedCount >= persistingCount
        ? '稳步改善'
        : persistingCount > 0
          ? '仍需跟进'
          : waitingCount > 0
            ? '等待验证'
            : '已有诊断'
      return {
        key: report.subject,
        subject: report.subject,
        subjectName: subject.name,
        title: `${subject.name}诊断报告`,
        judgment: compactSummary(sanitizeUserText(judgment, { treatAsId: true }), 44),
        generatedAtText: formatChineseDateTime(report.createdAt),
        relativeTimeText: formatRelativeTime(report.createdAt),
        evidenceCount: workbenchEvidenceCount(report),
        improvedCount,
        persistingCount,
        waitingCount,
        trendText,
        trendMarker: improvedCount > 0 ? '改善' : (persistingCount > 0 ? '跟进' : '诊断'),
        reportId: report._id,
        reportUrl: buildTraceableUrl({ type: 'report-detail', id: report._id }),
        primaryAction: buildDiagnosisPrimaryAction(student, subject, report, profile, input.papers || []),
        uploadUrl: uploadUrl(student, report.subject)
      }
    })
}

function compactSummary(text = '', maxLength = 58) {
  const value = String(text || '').replace(/\s+/g, ' ').trim()
  if (value.length <= maxLength) return value
  return `${value.slice(0, maxLength - 1)}…`
}

function studentContext(student = {}) {
  return {
    studentId: student._id || '',
    studentName: student.name || '',
    grade: student.grade || ''
  }
}

function subjectHomeUrl(student, subjectKey) {
  return buildTraceableUrl({
    type: 'subject-home',
    ...studentContext(student),
    subject: subjectKey,
    subjectName: SUBJECT_NAMES[subjectKey] || subjectKey
  })
}

function uploadUrl(student, subjectKey) {
  return buildTraceableUrl({
    type: 'upload',
    ...studentContext(student),
    subject: subjectKey,
    subjectName: SUBJECT_NAMES[subjectKey] || subjectKey
  })
}

function learningRecordsUrl(student, filter = '') {
  return buildTraceableUrl({
    type: 'upload-history',
    ...studentContext(student),
    filter
  })
}

function bottleneckCenterUrl(student, filter = 'active') {
  return buildTraceableUrl({
    type: 'bottleneck-center',
    ...studentContext(student),
    filter
  })
}

function knowledgeMapUrl(student) {
  return `/pages/knowledge-map/knowledge-map?studentId=${encodeURIComponent(student._id || '')}&studentName=${encodeURIComponent(student.name || '')}&subject=math`
}

function generateVerificationUrl(student, subjectKey) {
  return subjectHomeUrl(student, subjectKey)
}

function buildPrimaryActionCard(nextAction, student, canWriteActions) {
  const subject = (nextAction && nextAction.subject) || 'math'
  const primaryText = (nextAction && nextAction.primaryText) || '查看学习记录'
  let url = learningRecordsUrl(student)

  if (primaryText === '下载验证卷' || primaryText === '查看/下载验证卷' || primaryText === '查看验证卷') {
    url = generateVerificationUrl(student, subject)
  } else if (primaryText === '上传新试卷' || primaryText === '上传第一份试卷') {
    url = uploadUrl(student, subject)
  } else if (!canWriteActions) {
    url = learningRecordsUrl(student)
  }

  return {
    key: 'todayAction',
    title: (nextAction && nextAction.title) || '查看学习记录',
    summary: compactSummary((nextAction && nextAction.summary) || '进入学习记录查看最近状态。', 72),
    actionText: primaryText,
    subject,
    url
  }
}

function buildReportPanel(primaryReport, student) {
  if (primaryReport) {
    return {
      ...primaryReport,
      visible: true,
      url: primaryReport.url || buildTraceableUrl({ type: 'report-detail', id: primaryReport.reportId })
    }
  }

  return {
    visible: true,
    kind: 'empty-report',
    icon: '报',
    title: '暂无诊断报告',
    summary: '上传一份试卷或作业后，会在这里形成可追踪的诊断报告。',
    findingText: '',
    generatedAtText: '',
    evidenceTimeText: '',
    bottleneckText: '',
    evidenceText: '',
    actionText: '上传作业',
    url: uploadUrl(student, 'math')
  }
}

function buildPersonalActionQueue(student, nextSubject, bottleneckStats, knowledgeMapCard, recentRecords) {
  const activeCount = bottleneckStats.activeCount || bottleneckStats.pendingCount || 0
  const persistingCount = bottleneckStats.persistingCount || 0
  const improvedCount = bottleneckStats.improvedCount || 0
  const latestRecord = recentRecords && recentRecords[0]

  return [{
    key: 'bottleneckCenter',
    title: activeCount > 0 ? '学习卡点修复' : (improvedCount > 0 ? '已改善记录' : '学习卡点'),
    summary: activeCount > 0
      ? `待跟进 ${activeCount} 个${persistingCount > 0 ? ` · 持续出现 ${persistingCount} 个` : ''}`
      : (improvedCount > 0 ? `${improvedCount} 个卡点已有改善` : '暂无待处理卡点，可继续补充样本'),
    actionText: '查看卡点',
    url: bottleneckCenterUrl(student, activeCount > 0 ? 'active' : (improvedCount > 0 ? 'improved' : ''))
  }, {
    key: 'uploadEvidence',
    title: '上传新作业',
    summary: '补充新的照片样本，让诊断和复测更准。',
    actionText: '去上传',
    url: uploadUrl(student, nextSubject || 'math')
  }, {
    key: 'knowledgeMap',
    title: '数学知识地图',
    summary: knowledgeMapCard.summary || '查看知识节点、卡点和学习资源。',
    actionText: '看地图',
    url: knowledgeMapUrl(student)
  }, {
    key: 'learningRecords',
    title: '学习记录',
    summary: latestRecord ? compactSummary(latestRecord.summary || latestRecord.title, 34) : '查看历史报告、试卷和上传记录。',
    actionText: '看记录',
    url: learningRecordsUrl(student)
  }]
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
  const reports = uniqueReports([...(input.reports || []), ...formalDiagnosisReports(input)])
  const papers = input.papers || []
  const permissions = input.permissions || student.permissions || {}
  const canWriteActions = permissions.canUpload !== false || permissions.canGeneratePaper !== false
  const profileBySubject = new Map((input.profiles || []).map(profile => [profile.subject, profile]))
  const subjectByKey = Object.fromEntries(SUBJECTS.map(subject => [subject.key, subject]))

  const subjects = SUBJECTS.map(subject => {
    const profile = profileBySubject.get(subject.key) || {}
    const active = activeBottlenecks(profile)
    const improved = profileBottlenecks(profile).filter(item => item.status === 'improved')
    const summary = active.length > 0
      ? `待处理：${formatBottleneckDisplayList(active)}`
      : improved.length > 0
        ? `已改善：${formatBottleneckDisplayList(improved)}`
        : (profile.totalReports > 0 ? `${profile.totalReports} 份学习记录` : '暂无学习样本')
    return {
      key: subject.key,
      name: subject.name,
      shortName: subject.shortName,
      statusText: active.length > 0 || improved.length > 0 ? '已有观察' : '待采样',
      totalReports: profile.totalReports || 0,
      summary,
      actionText: `进入${subject.name}工作台`,
      url: subjectHomeUrl(student, subject.key)
    }
  })

  const analyzedSubjects = SUBJECTS.filter(subject =>
    hasSubjectEvidence(subject, profileBySubject.get(subject.key), reports)
  )
  const missingSubjects = SUBJECTS.filter(subject =>
    !analyzedSubjects.some(item => item.key === subject.key)
  )
  const priorityHighlights = buildPriorityHighlights(profileBySubject)
  const bottleneckViews = allSubjectBottleneckViews(profileBySubject)
  const bottleneckStats = buildBottleneckStats(bottleneckViews)
  // pending/improved 统一从展开后的 bottleneckViews 取（与学科首页/报告页同口径）
  const pendingBottlenecks = bottleneckViews.filter(item => item.status !== 'improved')
  const improvedBottlenecks = bottleneckViews.filter(item => item.status === 'improved')
  const effectiveReports = reports.filter(report =>
    report.status === 'completed' && (report.isEffective === undefined || report.isEffective === true)
  )
  const latest = newestDate([
    ...Array.from(profileBySubject.values()).map(profile => profile.updatedAt),
    ...reports.map(report => report.createdAt),
    ...papers.map(paper => paper.createdAt)
  ])
  const latestText = latest ? formatRelativeTime(latest) : '暂无'

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
          ? `下载${primarySubject ? primarySubject.name : '数学'}验证试卷`
          : hasImprovedOnly
            ? '继续上传新试卷观察巩固情况'
            : '上传第一份试卷，建立学习档案',
        summary: hasPending
          ? `系统会根据诊断报告自动准备纸面验证卷，用于确认${pendingNames}是否稳定出现。`
          : '上传试卷后，系统会整理学习观察和诊断报告。',
        primaryText: hasPending ? '下载验证卷' : (hasImprovedOnly ? '上传新试卷' : '上传第一份试卷'),
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

  const primaryReport = buildPrimaryReport(reports, subjectByKey, formatRelativeTime)
  const diagnosisWorkbenches = buildDiagnosisWorkbenches(input, profileBySubject, subjectByKey, formatRelativeTime)
  const recentRecords = buildRecentRecords(reports, papers, subjectByKey, formatRelativeTime)
  const knowledgeMapCard = buildKnowledgeMapCard(subjects, bottleneckStats)
  const primaryActionCard = buildPrimaryActionCard(nextAction, student, canWriteActions)
  const reportPanel = buildReportPanel(primaryReport, student)
  const personalActionQueue = buildPersonalActionQueue(student, nextSubject, bottleneckStats, knowledgeMapCard, recentRecords)
  const personalHero = {
    title: headline,
    summary: compactSummary(summary, 88),
    actionText: primaryActionCard.actionText,
    url: primaryActionCard.url
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
    primaryReport,
    diagnosisWorkbenches,
    diagnosisDataUnavailable: Boolean(input.diagnosisDataUnavailable),
    reportPanel,
    recentRecords,
    knowledgeMapCard,
    nextAction,
    personalHero,
    primaryActionCard,
    personalActionQueue,
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

const { formatBottleneckDisplayName, formatBottleneckDisplayList } = require('./util')
const { buildPaperDisplay } = require('./paper-display')
const { profileBottlenecks } = require('./bottleneck-view')
const {
  SUBJECTS,
  SUBJECT_NAMES,
  SUBJECT_SHORT_NAMES
} = require('./constants')
const { buildTraceableUrl } = require('./traceable-actions')

function listFor(mapOrObject, id) {
  if (!mapOrObject) return []
  if (mapOrObject instanceof Map) return mapOrObject.get(id) || []
  return mapOrObject[id] || []
}

function activeBottlenecks(profile = {}) {
  return profileBottlenecks(profile).filter(item => item.status !== 'improved')
}

function improvedBottlenecks(profile = {}) {
  return profileBottlenecks(profile).filter(item => item.status === 'improved')
}

function newestDate(values = []) {
  return values
    .filter(Boolean)
    .map(value => new Date(value))
    .filter(date => !Number.isNaN(date.getTime()))
    .sort((a, b) => b - a)[0] || null
}

function isSixthGradeQingyu(student = {}) {
  const name = String(student.name || '').trim()
  const grade = String(student.grade || '').trim()
  const isQingyu = name === '钟青羽' || name === '钟青宇'
  const isSixthGrade = grade === '6' || grade.includes('六')
  return isQingyu && isSixthGrade
}

function familyStudentOrder(student = {}) {
  if (isSixthGradeQingyu(student)) return 0
  if (String(student.name || '').trim() === '钟筱雨') return 1
  return 10
}

function sortFamilyStudents(students = []) {
  return [...students].sort((a, b) => {
    const orderDiff = familyStudentOrder(a) - familyStudentOrder(b)
    if (orderDiff !== 0) return orderDiff
    return new Date(b.createdAt || 0) - new Date(a.createdAt || 0)
  })
}

function latestCompletedReport(reports = []) {
  return reports
    .filter(report => report.status === 'completed' && (report.isEffective === undefined || report.isEffective === true))
    .sort((a, b) => new Date(b.createdAt || 0) - new Date(a.createdAt || 0))[0] || null
}

function latestMainPaper(papers = []) {
  return papers
    .filter(paper => paper.type === 'verification' || paper.paperDisplayCode || paper.paperCode)
    .sort((a, b) => new Date(b.generatedAt || b.createdAt || 0) - new Date(a.generatedAt || a.createdAt || 0))[0] || null
}

function compactPaperCoverageText(display = {}) {
  const summaries = Array.isArray(display.bottleneckSummaries) ? display.bottleneckSummaries.filter(Boolean) : []
  if (summaries.length === 0) return ''
  if (summaries.length <= 3) return `覆盖 ${summaries.join('、')}`
  return `覆盖 ${summaries.length} 个训练点`
}

function compactTextFromList(values = [], maxCount = 3) {
  const names = []
  const seen = new Set()
  values.forEach(value => {
    const formatted = typeof value === 'string'
      ? String(value || '').trim()
      : formatBottleneckDisplayName(value)
    const explicit = typeof value === 'object' && value !== null
      ? String(value.summary || value.name || value.title || value.displayName || value.label || value.lpName || '').trim()
      : ''
    const name = explicit && !/[（(]/.test(explicit) && !/[错误失败混淆不足偏差]$/.test(explicit)
      ? explicit
      : formatted
    if (!name || seen.has(name)) return
    seen.add(name)
    names.push(name)
  })
  return names.slice(0, maxCount).join('、')
}

function compactBottleneckText(items = [], maxCount = 3) {
  return compactTextFromList(items, maxCount)
}

function subjectMeta(key) {
  return {
    key,
    name: SUBJECT_NAMES[key],
    shortName: SUBJECT_SHORT_NAMES[key]
  }
}

function paperShortSummary(paper, subjectName = '') {
  if (!paper) return ''
  const display = buildPaperDisplay(paper, subjectName || SUBJECT_NAMES[paper.subject] || paper.subjectName || '学习')
  return [
    display.paperCode,
    display.totalPages ? `${display.totalPages}页` : '',
    display.questionCount ? `${display.questionCount}题` : ''
  ].filter(Boolean).join(' · ')
}

function knowledgeMapUrl(student, subject = 'math') {
  return `/pages/knowledge-map/knowledge-map?studentId=${encodeURIComponent(student._id || '')}&studentName=${encodeURIComponent(student.name || '')}&subject=${encodeURIComponent(subject)}`
}

function subjectAction(student, subject, filter = '') {
  return {
    type: filter ? 'bottleneck-center' : 'subject-home',
    studentId: student._id || '',
    studentName: student.name || '',
    grade: student.grade || '',
    subject: subject.key,
    subjectName: subject.name,
    filter
  }
}

function statusItem(key, label, value, tone, action) {
  return {
    key,
    label,
    value: String(value || 0),
    tone,
    url: buildTraceableUrl(action)
  }
}

function subjectActionText(key, hidden) {
  if (hidden) return '查看说明 ›'
  if (key === 'english') return '开始练习 ›'
  return '进入学科 ›'
}

function buildSubjectRows(student, profilesBySubject) {
  return SUBJECTS.map(key => {
    const subject = subjectMeta(key)
    const profile = profilesBySubject.get(key) || {}
    const hidden = Boolean(profile.hidden || profile.visible === false)
    const active = activeBottlenecks(profile)
    const improved = improvedBottlenecks(profile)
    const summary = active.length > 0
      ? compactBottleneckText(active)
      : improved.length > 0
        ? `已改善：${compactBottleneckText(improved)}`
        : hidden
          ? '暂未开启持续诊断'
          : key === 'english'
            ? (profile.totalReports > 0 ? `${profile.totalReports} 份记录` : '未开始，可从认词练习进入')
            : (profile.totalReports > 0 ? `${profile.totalReports} 份记录` : '未开始')
    return {
      key,
      name: subject.name,
      shortName: subject.shortName,
      summary,
      statusText: hidden ? '隐藏' : (active.length > 0 ? `${active.length} 待办` : (improved.length > 0 ? '有改善' : `${profile.totalReports || 0} 记录`)),
      actionText: subjectActionText(key, hidden),
      hidden,
      url: buildTraceableUrl(hidden
        ? {
            type: 'empty-state-info',
            studentId: student._id || '',
            studentName: student.name || '',
            subject: key,
            title: `${subject.name}暂未开启`
          }
        : subjectAction(student, subject))
    }
  })
}

function buildLatestValue(student, reports, papers, subjectByKey) {
  const report = latestCompletedReport(reports)
  const paper = latestMainPaper(papers)
  if (paper && (!report || new Date(paper.generatedAt || paper.createdAt || 0) >= new Date(report.createdAt || 0))) {
    const subjectName = SUBJECT_NAMES[paper.subject] || paper.subjectName || '学习'
    const display = buildPaperDisplay(paper, subjectName)
    const coverageText = compactPaperCoverageText(display)
    return {
      kind: 'paper',
      title: `${subjectName}验证试卷`,
      summary: [
        display.paperCode ? `编号 ${display.paperCode}` : '',
        display.questionCount ? `${display.questionCount} 题` : '',
        coverageText
      ].filter(Boolean).join(' · ') || '查看验证试卷',
      code: display.paperCode,
      url: buildTraceableUrl({ type: 'paper-workbench', id: paper._id })
    }
  }
  if (report) {
    const subject = subjectByKey[report.subject] || { name: report.subjectName || '学习' }
    const count = Array.isArray(report.bottlenecks) ? report.bottlenecks.length : 0
    return {
      kind: 'report',
      title: `${subject.name}${report.type === 'verification' ? '验证反馈' : '诊断报告'}`,
      summary: report.summary || (count > 0 ? `发现 ${count} 个学习卡点` : '查看完整报告'),
      url: buildTraceableUrl({ type: 'report-detail', id: report._id })
    }
  }
  return null
}

function buildNextAction(student, profiles, papers) {
  const paper = latestMainPaper(papers)
  if (paper) {
    const subjectName = SUBJECT_NAMES[paper.subject] || paper.subjectName || '数学'
    const display = buildPaperDisplay(paper, subjectName)
    return {
      title: '下一步',
      summary: display.paperCode
        ? `回到 ${display.paperCode} 上传作答照片`
        : '回到验证试卷工作台上传作答照片',
      actionText: '进入试卷',
      url: buildTraceableUrl({ type: 'paper-workbench', id: paper._id })
    }
  }
  const activeSubject = SUBJECTS.find(key => activeBottlenecks(profiles.find(profile => profile.subject === key) || {}).length > 0) || 'math'
  return {
    title: '下一步',
    summary: '上传试卷或下载已自动准备的纸面验证卷，继续补充学习证据。',
    actionText: '进入学科',
    url: buildTraceableUrl({
      type: 'subject-home',
      studentId: student._id || '',
      studentName: student.name || '',
      grade: student.grade || '',
      subject: activeSubject,
      subjectName: SUBJECT_NAMES[activeSubject]
    })
  }
}

function activeSubjectEntries(profiles = []) {
  return SUBJECTS
    .map(key => {
      const profile = profiles.find(item => item.subject === key) || { subject: key }
      return {
        key,
        subject: subjectMeta(key),
        profile,
        active: activeBottlenecks(profile)
      }
    })
    .filter(item => item.active.length > 0)
}

function buildPriorityAction(student, profiles = [], papers = []) {
  const paper = latestMainPaper(papers)
  if (paper) {
    const subjectName = SUBJECT_NAMES[paper.subject] || paper.subjectName || '数学'
    const summary = paperShortSummary(paper, subjectName)
    return {
      type: 'current-paper',
      subject: paper.subject || 'math',
      title: `上传${subjectName}验证卷作答照片`,
      summary: summary
        ? `${summary}。可以分批做，任意页完成后先拍照上传。`
        : '验证卷已生成，可以分批完成后拍照上传。',
      actionText: '进入试卷',
      tone: 'paper',
      url: buildTraceableUrl({ type: 'paper-workbench', id: paper._id })
    }
  }

  const activeEntry = activeSubjectEntries(profiles)[0]
  if (activeEntry) {
    return {
      type: 'verification-paper-status',
      subject: activeEntry.key,
      title: `查看${activeEntry.subject.name}验证卷`,
      summary: `${compactBottleneckText(activeEntry.active)}等待验证，系统会自动准备纸面题，准备好后可下载打印。`,
      actionText: '查看/下载',
      tone: 'verification',
      url: buildTraceableUrl({
        type: 'subject-home',
        studentId: student._id || '',
        studentName: student.name || '',
        grade: student.grade || '',
        subject: activeEntry.key,
        subjectName: activeEntry.subject.name
      })
    }
  }

  return {
    type: 'first-upload',
    subject: 'math',
    title: '上传第一份作业',
    summary: '先上传一份数学或语文作业，建立可追踪的学习档案。',
    actionText: '开始上传',
    tone: 'upload',
    url: buildTraceableUrl({
      type: 'upload',
      studentId: student._id || '',
      studentName: student.name || '',
      grade: student.grade || '',
      subject: 'math',
      subjectName: SUBJECT_NAMES.math
    })
  }
}

function buildSecondaryActions(student, profiles = [], primaryAction = {}) {
  const primarySubject = primaryAction.subject || ''
  return SUBJECTS
    .filter(key => key !== primarySubject)
    .slice(0, 2)
    .map(key => {
      const subject = subjectMeta(key)
      const profile = profiles.find(item => item.subject === key) || {}
      const active = activeBottlenecks(profile)
      const hasActive = active.length > 0
      const isEnglishStart = key === 'english' && !hasActive
      return {
        type: hasActive ? 'subject-bottlenecks' : 'subject-entry',
        subject: key,
        title: hasActive
          ? `${subject.name}复习/复测`
          : (isEnglishStart ? '英语认词/听写入口' : `${subject.name}学习入口`),
        summary: hasActive
          ? `重点：${compactBottleneckText(active)}`
          : (isEnglishStart ? '进入英语工作台，开始认词或纸面听写。' : `进入${subject.name}工作台，补充第一批学习证据。`),
        url: buildTraceableUrl(subjectAction(student, subject))
      }
    })
}

function buildQuickLinks(student, reports = [], papers = []) {
  const latestReport = latestCompletedReport(reports)
  const paper = latestMainPaper(papers)
  const reportSubjectName = latestReport ? (SUBJECT_NAMES[latestReport.subject] || latestReport.subjectName || '学习') : ''
  const paperSubjectName = paper ? (SUBJECT_NAMES[paper.subject] || paper.subjectName || '数学') : ''

  return [{
    key: 'latestReport',
    title: '最新诊断',
    summary: latestReport ? `${reportSubjectName} · ${latestReport.type === 'verification' ? '验证反馈' : '诊断报告'}` : '暂无诊断，先上传作业',
    url: latestReport
      ? buildTraceableUrl({ type: 'report-detail', id: latestReport._id })
      : buildTraceableUrl({
          type: 'upload',
          studentId: student._id || '',
          studentName: student.name || '',
          grade: student.grade || '',
          subject: 'math',
          subjectName: SUBJECT_NAMES.math
        })
  }, {
    key: 'currentPaper',
    title: '当前试卷',
    summary: paper ? paperShortSummary(paper, paperSubjectName) : '暂无试卷，先进入学科',
    url: paper
      ? buildTraceableUrl({ type: 'paper-workbench', id: paper._id })
      : buildTraceableUrl({
          type: 'subject-home',
          studentId: student._id || '',
          studentName: student.name || '',
          grade: student.grade || '',
          subject: 'math',
          subjectName: SUBJECT_NAMES.math
        })
  }, {
    key: 'knowledgeMap',
    title: '知识地图',
    summary: '查看知识节点、卡点和资源',
    url: knowledgeMapUrl(student, 'math')
  }, {
    key: 'learningRecords',
    title: '学习记录',
    summary: '查看完整时间线',
    url: buildTraceableUrl({
      type: 'upload-history',
      studentId: student._id || '',
      studentName: student.name || ''
    })
  }]
}

function buildChildWorkbenchCards(input = {}, formatRelativeTime = () => '') {
  const students = input.students || []
  const profilesByStudentId = input.profilesByStudentId || {}
  const reportsByStudentId = input.reportsByStudentId || {}
  const papersByStudentId = input.papersByStudentId || {}
  const subjectByKey = Object.fromEntries(SUBJECTS.map(key => [key, { key, name: SUBJECT_NAMES[key] }]))

  return sortFamilyStudents(students).map(student => {
    const profiles = listFor(profilesByStudentId, student._id)
    const reports = listFor(reportsByStudentId, student._id)
    const papers = listFor(papersByStudentId, student._id)
    const profileMap = new Map(profiles.map(profile => [profile.subject, profile]))
    const allActive = profiles.flatMap(activeBottlenecks)
    const allImproved = profiles.flatMap(improvedBottlenecks)
    const analyzingCount = reports.filter(report => report.status === 'analyzing' || report.status === 'pending').length
    const pendingUploadCount = papers.filter(paper => {
      const linked = reports.some(report => report.paperId === paper._id)
      return (paper.type === 'verification' || paper.paperDisplayCode || paper.paperCode) && !linked
    }).length
    const latest = newestDate([
      ...profiles.map(profile => profile.updatedAt),
      ...reports.map(report => report.evidenceTime || report.createdAt),
      ...papers.map(paper => paper.generatedAt || paper.createdAt)
    ])
    const statusItems = [
      statusItem('analyzing', '分析中点', analyzingCount, 'warning', {
        type: 'learning-records',
        studentId: student._id,
        studentName: student.name,
        filter: 'analyzing'
      }),
      statusItem('pendingVerification', '待验证点', allActive.length, 'primary', {
        type: 'bottleneck-center',
        studentId: student._id,
        studentName: student.name,
        filter: 'active'
      }),
      statusItem('pendingUpload', '待上传点', pendingUploadCount, 'danger', {
        type: 'learning-records',
        studentId: student._id,
        studentName: student.name,
        filter: 'pending-upload'
      }),
      statusItem('improved', '已改善点', allImproved.length, 'success', {
        type: 'bottleneck-center',
        studentId: student._id,
        studentName: student.name,
        filter: 'improved'
      })
    ]
    const todoCount = analyzingCount + allActive.length + pendingUploadCount
    const latestValue = buildLatestValue(student, reports, papers, subjectByKey)
    const nextAction = buildNextAction(student, profiles, papers)
    const priorityAction = buildPriorityAction(student, profiles, papers)
    const secondaryActions = buildSecondaryActions(student, profiles, priorityAction)
    const quickLinks = buildQuickLinks(student, reports, papers)

    return {
      id: student._id || '',
      name: student.name || '孩子档案',
      avatarText: student.name ? student.name.charAt(0) : '学',
      gradeText: student.grade ? `${student.grade}年级` : '',
      roleText: student.role === 'viewer' ? '共同家长' : '家庭档案',
      memberText: student.memberCount ? `共同家长 ${student.memberCount} 人` : '',
      recentUpdateText: latest ? formatRelativeTime(latest) : '暂无更新',
      statusText: todoCount > 0 ? `${todoCount} 项待处理` : '无待办',
      statusClass: todoCount > 0 ? 'pending' : 'clear',
      profileUrl: buildTraceableUrl({
        type: 'student-profile',
        studentId: student._id || '',
        title: `${student.name || '孩子'}学习档案`
      }),
      statusItems,
      subjectRows: buildSubjectRows(student, profileMap),
      latestValue,
      nextAction,
      priorityAction,
      secondaryActions,
      quickLinks
    }
  })
}

function numericStatusValue(card, key) {
  const item = (card.statusItems || []).find(status => status.key === key)
  const value = Number(item && item.value)
  return Number.isFinite(value) ? value : 0
}

function buildFamilyWorkbenchHero(cards = []) {
  const visibleCards = Array.isArray(cards) ? cards.filter(Boolean) : []
  if (visibleCards.length === 0) return null

  const totalTodos = visibleCards.reduce((sum, card) => {
    return sum
      + numericStatusValue(card, 'analyzing')
      + numericStatusValue(card, 'pendingVerification')
      + numericStatusValue(card, 'pendingUpload')
  }, 0)
  const totalPendingVerification = visibleCards.reduce((sum, card) => {
    return sum + numericStatusValue(card, 'pendingVerification')
  }, 0)
  const focusCard = visibleCards.find(card => numericStatusValue(card, 'pendingUpload') > 0)
    || visibleCards.find(card => numericStatusValue(card, 'pendingVerification') > 0)
    || visibleCards.find(card => numericStatusValue(card, 'analyzing') > 0)
    || visibleCards[0]
  const focusAction = focusCard.priorityAction || focusCard.nextAction || {}
  const focusName = focusCard.name || '孩子'
  const pendingText = totalPendingVerification > 0
    ? `${totalPendingVerification} 个学习卡点等待处理`
    : '当前没有待验证卡点'

  return {
    imageSrc: '/assets/images/math-diagnostic-guide.jpg',
    title: totalTodos > 0
      ? `今天先看${focusName}的学习行动`
      : '今天的家庭学习状态很清爽',
    summary: totalTodos > 0
      ? `${pendingText}，可以从这里直接进入最需要处理的一步。`
      : '没有堆积任务时，可以进入学习记录或学科工作台补充新的学习证据。',
    actionText: totalTodos > 0 ? '处理今日优先行动' : '查看学习档案',
    url: focusAction.url || focusCard.profileUrl || '',
    stats: [
      { label: '孩子', value: String(visibleCards.length) },
      { label: '待办', value: String(totalTodos) },
      { label: '待验证', value: String(totalPendingVerification) }
    ]
  }
}

module.exports = {
  buildChildWorkbenchCards,
  buildFamilyWorkbenchHero,
  profileBottlenecks
}

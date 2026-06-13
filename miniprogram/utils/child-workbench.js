const { formatBottleneckDisplayList } = require('./util')
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

function buildSubjectRows(student, profilesBySubject) {
  return SUBJECTS.map(key => {
    const subject = {
      key,
      name: SUBJECT_NAMES[key],
      shortName: SUBJECT_SHORT_NAMES[key]
    }
    const profile = profilesBySubject.get(key) || {}
    const hidden = Boolean(profile.hidden || profile.visible === false)
    const active = activeBottlenecks(profile)
    const improved = improvedBottlenecks(profile)
    const summary = active.length > 0
      ? formatBottleneckDisplayList(active)
      : improved.length > 0
        ? `已改善：${formatBottleneckDisplayList(improved)}`
        : hidden
          ? '暂未开启持续诊断'
          : (profile.totalReports > 0 ? `${profile.totalReports} 份记录` : '未开始')
    return {
      key,
      name: subject.name,
      shortName: subject.shortName,
      summary,
      statusText: hidden ? '隐藏' : (active.length > 0 ? `${active.length} 待办` : (improved.length > 0 ? '有改善' : `${profile.totalReports || 0} 记录`)),
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
    return {
      kind: 'paper',
      title: `${subjectName}验证试卷`,
      summary: [
        display.paperCode ? `编号 ${display.paperCode}` : '',
        display.questionCount ? `${display.questionCount} 题` : '',
        display.bottleneckText ? `覆盖 ${display.bottleneckText}` : ''
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
    summary: '上传试卷或生成验证卷，继续补充学习证据。',
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

function buildChildWorkbenchCards(input = {}, formatRelativeTime = () => '') {
  const students = input.students || []
  const profilesByStudentId = input.profilesByStudentId || {}
  const reportsByStudentId = input.reportsByStudentId || {}
  const papersByStudentId = input.papersByStudentId || {}
  const subjectByKey = Object.fromEntries(SUBJECTS.map(key => [key, { key, name: SUBJECT_NAMES[key] }]))

  return students.map(student => {
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
      statusItem('analyzing', '分析中', analyzingCount, 'warning', {
        type: 'learning-records',
        studentId: student._id,
        studentName: student.name,
        filter: 'analyzing'
      }),
      statusItem('pendingVerification', '待验证', allActive.length, 'primary', {
        type: 'bottleneck-center',
        studentId: student._id,
        studentName: student.name,
        filter: 'active'
      }),
      statusItem('pendingUpload', '待上传', pendingUploadCount, 'danger', {
        type: 'learning-records',
        studentId: student._id,
        studentName: student.name,
        filter: 'pending-upload'
      }),
      statusItem('improved', '已改善', allImproved.length, 'success', {
        type: 'bottleneck-center',
        studentId: student._id,
        studentName: student.name,
        filter: 'improved'
      })
    ]
    const todoCount = analyzingCount + allActive.length + pendingUploadCount
    const latestValue = buildLatestValue(student, reports, papers, subjectByKey)
    const nextAction = buildNextAction(student, profiles, papers)

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
      nextAction
    }
  })
}

module.exports = {
  buildChildWorkbenchCards,
  profileBottlenecks
}

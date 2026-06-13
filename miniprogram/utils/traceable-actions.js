const TRACEABLE_TYPES = new Set([
  'student-profile',
  'subject-home',
  'report-detail',
  'paper-workbench',
  'bottleneck-center',
  'bottleneck-detail',
  'generate-verification',
  'upload',
  'learning-records',
  'upload-history',
  'parent-management',
  'permission-info',
  'empty-state-info'
])

function clean(value) {
  if (value === undefined || value === null) return ''
  return String(value)
}

function query(params = {}) {
  return Object.entries(params)
    .filter(([, value]) => value !== undefined && value !== null && value !== '')
    .map(([key, value]) => `${key}=${encodeURIComponent(String(value))}`)
    .join('&')
}

function withQuery(path, params) {
  const qs = query(params)
  return qs ? `${path}?${qs}` : path
}

function normalizeTraceableAction(action) {
  if (!action || typeof action !== 'object') return null
  const type = clean(action.type)
  if (!TRACEABLE_TYPES.has(type)) return null
  return {
    ...action,
    type,
    studentId: clean(action.studentId),
    subject: clean(action.subject),
    id: clean(action.id),
    filter: clean(action.filter),
    title: clean(action.title)
  }
}

function isTraceableAction(action) {
  return Boolean(normalizeTraceableAction(action))
}

function buildTraceableUrl(action) {
  const normalized = normalizeTraceableAction(action)
  if (!normalized) return null

  const {
    type,
    studentId,
    studentName,
    subject,
    subjectName,
    grade,
    id,
    filter,
    title
  } = normalized

  if (type === 'student-profile') {
    return withQuery('/pages/index/index', { studentId, mode: 'student-profile', title })
  }

  if (type === 'subject-home') {
    return withQuery('/pages/subject-home/subject-home', {
      studentId,
      subject,
      subjectName,
      studentName,
      grade
    })
  }

  if (type === 'report-detail') {
    return withQuery('/pages/report/report', { id })
  }

  if (type === 'paper-workbench') {
    return withQuery('/pages/paper-preview/paper-preview', { paperId: id || normalized.paperId })
  }

  if (type === 'bottleneck-center') {
    return withQuery('/pages/bottleneck-center/bottleneck-center', {
      studentId,
      studentName,
      subject,
      status: filter,
      title
    })
  }

  if (type === 'bottleneck-detail') {
    return withQuery('/pages/bottleneck-detail/bottleneck-detail', {
      studentId,
      subject,
      lpCode: id || normalized.lpCode,
      studentName
    })
  }

  if (type === 'generate-verification') {
    return withQuery('/pages/generate-verification/generate-verification', {
      studentId,
      subject,
      subjectName,
      studentName,
      targetCode: id || normalized.lpCode
    })
  }

  if (type === 'upload') {
    return withQuery('/pages/upload/upload', {
      mode: normalized.mode || 'diagnosis',
      studentId,
      subject,
      subjectName,
      studentName,
      grade,
      paperId: id || normalized.paperId
    })
  }

  if (type === 'learning-records' || type === 'upload-history') {
    return withQuery('/pages/upload-history/upload-history', {
      studentId,
      studentName,
      subject,
      filter,
      empty: normalized.empty ? 1 : '',
      title
    })
  }

  if (type === 'parent-management') {
    return withQuery('/pages/parent-management/parent-management', { studentId })
  }

  if (type === 'permission-info') {
    return withQuery('/pages/parent-management/parent-management', {
      studentId,
      mode: 'permission',
      title
    })
  }

  if (type === 'empty-state-info') {
    return withQuery('/pages/upload-history/upload-history', {
      studentId,
      studentName,
      subject,
      filter,
      empty: 1,
      title
    })
  }

  return null
}

function fallbackTraceableAction(kind, context = {}) {
  const base = {
    studentId: context.studentId || '',
    studentName: context.studentName || '',
    subject: context.subject || '',
    filter: context.filter || '',
    title: context.title || ''
  }
  if (kind === 'permission') {
    return { ...base, type: 'permission-info' }
  }
  return { ...base, type: 'empty-state-info' }
}

module.exports = {
  buildTraceableUrl,
  fallbackTraceableAction,
  isTraceableAction,
  normalizeTraceableAction
}

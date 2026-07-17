const SUBJECTS = ['math', 'chinese', 'english']

const SUBJECT_NAMES = {
  math: '数学',
  chinese: '语文',
  english: '英语'
}

const SUBJECT_SHORT_NAMES = {
  math: '数',
  chinese: '语',
  english: '英'
}

// 学科色唯一来源：与 app.wxss B1 token（--b1-subject-*-fg）保持一致
const SUBJECT_COLORS = {
  math: { bg: '#B37808', fg: '#ffffff' },
  chinese: { bg: '#D4483A', fg: '#ffffff' },
  english: { bg: '#4168B7', fg: '#ffffff' }
}

const RELATION_OPTIONS = [
  { key: 'father', name: '爸爸' },
  { key: 'mother', name: '妈妈' },
  { key: 'grandfather', name: '爷爷' },
  { key: 'grandmother', name: '奶奶' },
  { key: 'maternal_grandfather', name: '外公' },
  { key: 'maternal_grandmother', name: '外婆' },
  { key: 'teacher', name: '老师' },
  { key: 'other', name: '其他' }
]

function getSubjectName(subject, fallback = '') {
  return SUBJECT_NAMES[subject] || fallback || ''
}

function normalizeSubject(subject, fallback = '') {
  return SUBJECT_NAMES[subject] ? subject : fallback
}

function getSubjectColor(subject) {
  return SUBJECT_COLORS[subject] || SUBJECT_COLORS.math
}

module.exports = {
  SUBJECTS,
  SUBJECT_NAMES,
  SUBJECT_SHORT_NAMES,
  SUBJECT_COLORS,
  RELATION_OPTIONS,
  getSubjectName,
  normalizeSubject,
  getSubjectColor,
}

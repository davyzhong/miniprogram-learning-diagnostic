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

const SUBJECT_COLORS = {
  math: { bg: '#1f4f82', fg: '#ffffff' },
  chinese: { bg: '#276749', fg: '#ffffff' },
  english: { bg: '#9c4f24', fg: '#ffffff' }
}

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
  getSubjectName,
  normalizeSubject,
  getSubjectColor,
}

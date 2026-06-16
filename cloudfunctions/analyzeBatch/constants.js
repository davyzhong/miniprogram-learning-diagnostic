const SUBJECTS = ['math', 'chinese', 'english'];

const SUBJECT_NAMES = {
  math: '数学',
  chinese: '语文',
  english: '英语',
};

const SUBJECT_CODES = {
  math: 'MATH',
  chinese: 'CHN',
  english: 'ENG',
};

function getSubjectName(subject, fallback = '') {
  return SUBJECT_NAMES[subject] || fallback || '';
}

function getSubjectCode(subject, fallback = 'PAPER') {
  return SUBJECT_CODES[subject] || fallback;
}

module.exports = {
  SUBJECTS,
  SUBJECT_NAMES,
  SUBJECT_CODES,
  getSubjectName,
  getSubjectCode,
};

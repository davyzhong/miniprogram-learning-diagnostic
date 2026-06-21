const SUBJECT_ILLUSTRATIONS = {
  math: {
    alt: '数学学科'
  },
  chinese: {
    alt: '语文学科'
  },
  english: {
    alt: '英语学科'
  }
}

const PAGE_ILLUSTRATIONS = {
  diagnosticReport: {
    alt: '诊断报告'
  },
  verificationReport: {
    alt: '验证报告'
  },
  verificationPaper: {
    alt: '生成验证试卷'
  },
  knowledgeMap: {
    alt: '知识地图'
  },
  learningResource: {
    alt: '学习资源'
  },
  uploadPhoto: {
    alt: '拍照上传'
  },
  learningHistory: {
    alt: '学习记录'
  },
  englishPractice: {
    alt: '英语认词练习'
  },
  englishDictation: {
    alt: '英语纸面听写'
  },
  englishWrongWords: {
    alt: '英语错词本'
  }
}

function inferSubjectKey(subject, subjectName) {
  const raw = String(subject || '').toLowerCase()
  if (SUBJECT_ILLUSTRATIONS[raw]) return raw

  const name = String(subjectName || '')
  if (name.includes('语')) return 'chinese'
  if (name.includes('英')) return 'english'
  return 'math'
}

function subjectIllustrationOf(subject, subjectName) {
  return SUBJECT_ILLUSTRATIONS[inferSubjectKey(subject, subjectName)]
}

function reportIllustrationOf(isVerification) {
  return isVerification ? PAGE_ILLUSTRATIONS.verificationReport : PAGE_ILLUSTRATIONS.diagnosticReport
}

function pageIllustrationOf(key) {
  return PAGE_ILLUSTRATIONS[key] || SUBJECT_ILLUSTRATIONS.math
}

module.exports = {
  SUBJECT_ILLUSTRATIONS,
  PAGE_ILLUSTRATIONS,
  subjectIllustrationOf,
  reportIllustrationOf,
  pageIllustrationOf
}

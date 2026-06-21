const SUBJECT_ILLUSTRATIONS = {
  math: {
    imageSrc: '/assets/images/subject-math-hero.jpg',
    alt: '数学学科插图：数字、几何图形和解题草稿'
  },
  chinese: {
    imageSrc: '/assets/images/subject-chinese-hero.jpg',
    alt: '语文学科插图：阅读、字词和古诗积累'
  },
  english: {
    imageSrc: '/assets/images/subject-english-hero.jpg',
    alt: '英语学科插图：单词卡、听说练习和词库'
  }
}

const PAGE_ILLUSTRATIONS = {
  diagnosticReport: {
    imageSrc: '/assets/images/diagnostic-report-hero.jpg',
    alt: '诊断报告插图：放大镜、错题线索和分析结论'
  },
  verificationReport: {
    imageSrc: '/assets/images/verification-report-hero.jpg',
    alt: '验证报告插图：验证试卷、勾选结果和复测证据'
  },
  verificationPaper: {
    imageSrc: '/assets/images/verification-paper-hero.jpg',
    alt: '生成验证试卷插图：A4 试卷、铅笔和页面编号'
  },
  knowledgeMap: {
    imageSrc: '/assets/images/knowledge-map-hero.jpg',
    alt: '知识地图插图：知识节点、路线和学习路径'
  },
  learningResource: {
    imageSrc: '/assets/images/learning-resource-hero.jpg',
    alt: '学习资源插图：视频、讲解和练习材料'
  },
  uploadPhoto: {
    imageSrc: '/assets/images/upload-photo-hero.jpg',
    alt: '拍照上传插图：手机拍摄纸面作业'
  },
  learningHistory: {
    imageSrc: '/assets/images/learning-history-hero.jpg',
    alt: '学习记录插图：时间线、报告和试卷归档'
  },
  englishPractice: {
    imageSrc: '/assets/images/english-practice-hero.jpg',
    alt: '英语认词练习插图：单词卡和口语回答'
  },
  englishDictation: {
    imageSrc: '/assets/images/english-dictation-hero.jpg',
    alt: '英语纸面听写插图：耳机、听写纸和铅笔'
  },
  englishWrongWords: {
    imageSrc: '/assets/images/english-wrong-words-hero.jpg',
    alt: '英语错词本插图：薄弱词卡片和复习标记'
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

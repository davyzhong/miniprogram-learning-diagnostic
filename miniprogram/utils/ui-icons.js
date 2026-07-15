const UI_ICONS = Object.freeze({
  PROFILE: '学',
  DIAGNOSIS: '诊',
  DIAGNOSIS_LIST: '报',
  REPORT: '读',
  EVIDENCE: '题',
  IMPROVED: '已',
  PERSISTING: '再',
  WAITING: '待',
  VERIFICATION: '验',
  NEXT_ACTION: '重',
  PAPER: '卷',
  PAPER_SUMMARY: '单',
  UPLOAD: '传',
  CAMERA: '拍',
  BOTTLENECK: '点',
  KNOWLEDGE_MAP: '图',
  HISTORY: '档',
  TIME: '时',
  INSIGHT: '提',
  SUCCESS: '已',
  WARNING: '注',
  ERROR: '×',
  RETRY: '更',
  DOWNLOAD: '下',
  PRINT: '打',
  AUDIO: '听',
  RECORD: '录',
  WRITE: '写',
  COST: '费',
  FAMILY: '家',
  ADD: '+',
})

const SUBJECT_ICONS = Object.freeze({
  math: '数',
  chinese: '语',
  english: '英',
})

function subjectIcon(subject) {
  return SUBJECT_ICONS[subject] || '学'
}

module.exports = { UI_ICONS, SUBJECT_ICONS, subjectIcon }

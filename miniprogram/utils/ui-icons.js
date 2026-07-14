const UI_ICONS = Object.freeze({
  PROFILE: '📚',
  DIAGNOSIS: '🩺',
  DIAGNOSIS_LIST: '📋',
  REPORT: '📖',
  EVIDENCE: '📝',
  IMPROVED: '✅',
  PERSISTING: '🔁',
  WAITING: '⏳',
  VERIFICATION: '🧪',
  NEXT_ACTION: '🎯',
  PAPER: '📄',
  PAPER_SUMMARY: '🧾',
  UPLOAD: '📤',
  CAMERA: '📷',
  BOTTLENECK: '🧩',
  KNOWLEDGE_MAP: '🗺️',
  HISTORY: '🗂️',
  TIME: '🕘',
  INSIGHT: '💡',
  SUCCESS: '✅',
  WARNING: '⚠️',
  ERROR: '❌',
  RETRY: '🔄',
  DOWNLOAD: '⬇️',
  PRINT: '🖨️',
  AUDIO: '🔊',
  RECORD: '🎙️',
  WRITE: '✍️',
  COST: '💰',
  FAMILY: '👨‍👩‍👧',
  ADD: '➕',
})

const SUBJECT_ICONS = Object.freeze({
  math: '📐',
  chinese: '🀄',
  english: '🔤',
})

function subjectIcon(subject) {
  return SUBJECT_ICONS[subject] || '📘'
}

module.exports = { UI_ICONS, SUBJECT_ICONS, subjectIcon }

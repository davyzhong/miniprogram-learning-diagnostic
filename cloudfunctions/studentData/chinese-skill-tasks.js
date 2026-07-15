const TASKS = [
  { id: 'find-evidence', type: 'reading_evidence', title: '回原文找依据', method: '先圈出原文里支持答案的句子，再写一句理由。', prompt: '小明把雨伞借给同学。你从哪句话看出他乐于帮助别人？', answerHint: '他把雨伞借给同学', minLength: 4 },
  { id: 'one-sentence-summary', type: 'reading_summary', title: '一句话概括', method: '用“谁，做了什么，结果怎样”说完整。', prompt: '小明放学时看见同学没带伞，于是把自己的雨伞借给了他。', answerHint: '小明把雨伞借给没带伞的同学', minLength: 8 },
  { id: 'make-specific', type: 'writing_specific', title: '把句子写具体', method: '补上动作、神态或看到的细节。', prompt: '把“天气很好”改写得更具体。', answerHint: '写出阳光、天空或风等具体细节', minLength: 8 }
]

function taskFor(profile = {}) {
  const bottlenecks = profile.currentBottlenecks || profile.pendingBottlenecks || []
  const text = JSON.stringify(bottlenecks).toLowerCase()
  if (/概括|段意/.test(text)) return TASKS[1]
  if (/表达|写作|作文|具体/.test(text)) return TASKS[2]
  return TASKS[0]
}

function verdict(answer, task) {
  const text = String(answer || '').trim()
  if (!text) return 'unclear'
  return text.length >= Number(task.minLength || 4) ? 'passed' : 'needs_followup'
}

module.exports = { TASKS, taskFor, verdict }

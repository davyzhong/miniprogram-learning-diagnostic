// 微验证页视图模型：围绕单个细卡点的 3-6 道小题，家长陪同当场判定对错。
// 判定数据全部在客户端流转，提交时一次性把 verdicts 发给云函数。
const { symbolOf } = require('../../utils/ui-symbols')

function buildQuestionViews(questions = [], verdicts = []) {
  return questions.map((question, index) => {
    const verdict = verdicts[index] || ''
    return {
      index: question.index || index + 1,
      content: question.content,
      answer: question.answer,
      observation: question.observation || '',
      verdict,
      verdictText: verdict === 'correct' ? '答对了' : (verdict === 'incorrect' ? '答错了' : ''),
      // 判定后才显示参考答案与观察点，避免孩子先看答案
      showAnswer: Boolean(verdict),
    }
  })
}

function buildMicroValidationView({ bnTitle = '', questions = [], verdicts = [], status = 'in_progress', result = null } = {}) {
  const questionViews = buildQuestionViews(questions, verdicts)
  const answeredCount = questionViews.filter(q => q.verdict).length
  const totalCount = questionViews.length
  const canSubmit = status === 'in_progress' && totalCount > 0 && answeredCount === totalCount
  return {
    bnTitle,
    questions: questionViews,
    answeredCount,
    totalCount,
    progressText: totalCount > 0 ? `已判定 ${answeredCount}/${totalCount} 题` : '',
    canSubmit,
    completed: status === 'completed',
    result: result || null,
  }
}

function buildMicroValidationResultView({ passVerdict = '', correctCount = 0, totalCount = 0, bnTitle = '' } = {}) {
  const passed = passVerdict === 'passed'
  return {
    passed,
    icon: passed ? symbolOf('complete') : symbolOf('pin'),
    title: passed ? '已排除这个疑似卡点' : '确认这是一个真实卡点',
    summary: passed
      ? `${correctCount}/${totalCount} 题正确。这个节点已回到未观察状态，后续有新证据再跟踪。`
      : `${correctCount}/${totalCount} 题正确。建议先用学习资源重学「${bnTitle}」，再做变式练习。`,
    actionText: passed ? '返回知识地图' : '去重学',
  }
}

module.exports = { buildMicroValidationView, buildMicroValidationResultView }

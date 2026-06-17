function buildLearningResourceView(pack = {}) {
  const blocks = Array.isArray(pack.blocks) ? pack.blocks : []
  const practiceBlock = blocks.find(block => block.type === 'practice')
  const practiceCount = Array.isArray(practiceBlock && practiceBlock.questions)
    ? practiceBlock.questions.length
    : 0
  const parentResourceCount = Array.isArray(pack.externalResources)
    ? pack.externalResources.length
    : 0
  const estimatedMinutes = Number(pack.estimatedMinutes) || 0
  const completed = pack.status === 'completed'

  return {
    id: pack._id || pack.packId || '',
    title: pack.title || '学习任务包',
    status: pack.status || 'ready',
    timeText: estimatedMinutes ? `约 ${estimatedMinutes} 分钟` : '5-10 分钟',
    blocks,
    practiceCount,
    parentResourceText: parentResourceCount ? `家长参考 ${parentResourceCount} 个` : '',
    canComplete: !completed,
    completed
  }
}

module.exports = { buildLearningResourceView }

function compactText(value = '', fallback = '') {
  return String(value || fallback || '').replace(/\s+/g, ' ').trim()
}

function normalizeResourcePackTarget(input = {}) {
  const targetId = input.bottleneckId || input.targetId || input.lpCode || input.id || ''
  const lpCode = input.lpCode || (/^LP-\d+/.test(targetId) ? targetId : '')
  const title = compactText(input.title || input.lpName || input.displayName, targetId || '学习卡点')
  return {
    targetId,
    bottleneckId: input.bottleneckId || '',
    lpCode,
    title,
    nodeId: input.nodeId || '',
    categoryPath: Array.isArray(input.categoryPath) ? input.categoryPath : [],
    symptomPatterns: Array.isArray(input.symptomPatterns) ? input.symptomPatterns : [],
    repairStrategy: Array.isArray(input.repairStrategy) ? input.repairStrategy : []
  }
}

function buildDecimalPointPractice(target) {
  return [
    {
      questionId: `${target.targetId || 'math'}-P01`,
      targetId: target.targetId,
      question: '计算：2.4 × 1.5 =',
      answer: '3.6',
      explanation: '24 × 15 = 360，两个因数一共 2 位小数，所以结果是 3.60。'
    },
    {
      questionId: `${target.targetId || 'math'}-P02`,
      targetId: target.targetId,
      question: '计算：0.24 × 1.5 =',
      answer: '0.36',
      explanation: '24 × 15 = 360，两个因数一共 3 位小数，所以结果是 0.360。'
    },
    {
      questionId: `${target.targetId || 'math'}-P03`,
      targetId: target.targetId,
      question: '判断：24 × 0.15 的结果应该接近 36、3.6 还是 0.36？',
      answer: '3.6',
      explanation: '24 × 0.15 可以想成 24 × 0.1 多一点，结果应在 2.4 以上、接近 3.6。'
    }
  ]
}

function buildGenericPractice(target) {
  return [
    {
      questionId: `${target.targetId || 'math'}-P01`,
      targetId: target.targetId,
      question: `用自己的话说一说：${target.title} 最容易错在哪里？`,
      answer: '能说出关键错误点即可。',
      explanation: '先确认孩子能复述卡点，再进入题目练习。'
    },
    {
      questionId: `${target.targetId || 'math'}-P02`,
      targetId: target.targetId,
      question: '做一道同类题，并写下每一步理由。',
      answer: '步骤完整、理由清楚。',
      explanation: '重点观察过程，不只看答案。'
    },
    {
      questionId: `${target.targetId || 'math'}-P03`,
      targetId: target.targetId,
      question: '检查自己的答案是否合理，并写一句检查理由。',
      answer: '能用估算、单位或关系式检查。',
      explanation: '把检查变成固定动作。'
    }
  ]
}

function buildPracticeItems({ target: rawTarget = {} } = {}) {
  const target = normalizeResourcePackTarget(rawTarget)
  if (/DEC-MUL-POINT|小数.*小数点|小数位数/.test(`${target.targetId} ${target.title}`)) {
    return buildDecimalPointPractice(target)
  }
  return buildGenericPractice(target)
}

function buildResourcePackDraft({ studentId, subject = 'math', sourceReportId = '', target: rawTarget = {}, resources = [] } = {}) {
  const target = normalizeResourcePackTarget(rawTarget)
  const practiceItems = buildPracticeItems({ target })
  const firstSymptom = target.symptomPatterns[0] || `这个卡点会影响 ${target.title} 相关题目的稳定性。`
  const repairText = target.repairStrategy.length > 0
    ? target.repairStrategy.join('；')
    : '先复述规则，再看例题，最后做 3 道小练习。'

  return {
    studentId,
    subject,
    sourceType: 'bottleneck',
    sourceReportId,
    lpCode: target.lpCode,
    bottleneckId: target.bottleneckId,
    targetId: target.targetId,
    title: target.title,
    status: 'ready',
    estimatedMinutes: 8,
    version: 1,
    blocks: [
      { type: 'summary', title: '今天补什么', body: target.title },
      { type: 'concept', title: '为什么会错', body: firstSymptom },
      { type: 'worked_example', title: '例题拆解', question: practiceItems[0].question, steps: [practiceItems[0].explanation] },
      { type: 'common_mistake', title: '常见错误对比', mistake: '只看答案，不检查过程。', correction: repairText, explanation: '这一步用来把错误路径和正确路径分开。' },
      { type: 'practice', title: '马上练 3 题', questions: practiceItems }
    ],
    practiceItems,
    externalResources: (resources || []).map(resource => ({
      resourceId: resource.resourceId || '',
      title: resource.displayTitle || resource.title || '',
      platform: resource.platform || '',
      url: resource.url || '',
      role: resource.role || '家长参考'
    })).filter(resource => resource.title || resource.url)
  }
}

module.exports = {
  buildResourcePackDraft,
  buildPracticeItems,
  normalizeResourcePackTarget
}

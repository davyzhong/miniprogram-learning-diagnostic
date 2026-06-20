// 学习任务包草稿生成器
//
// 设计：优先用 bottleneck-taxonomy-v2.seed.json 的结构化数据填充 5-6 个板块，
// 让每个卡点都有具体内容（症状、根因、验证规则、修复策略、达标证据、真实错例）。
// taxonomy 加载失败时降级到简单模板。
//
// 云函数运行时 data/ 目录不会随云函数上传，所以用 try/catch 多路径解析：
// 本地开发/E2E 能加载到 seed，真机降级到 LLM 或模板。

const path = require('path')
const fs = require('fs')

function resolveData(fileName) {
  const candidates = [
    path.join(__dirname, '../../data/math', fileName),
    path.join(__dirname, '../../../data/math', fileName),
    path.join(__dirname, 'data/math', fileName),
  ]
  for (const candidate of candidates) {
    try { if (fs.existsSync(candidate)) return candidate } catch (e) {}
  }
  return null
}

let taxonomyMap = null
let taxonomyLoaded = false
function loadTaxonomy() {
  if (taxonomyLoaded) return taxonomyMap
  taxonomyLoaded = true
  try {
    const seedPath = resolveData('bottleneck-taxonomy-v2.seed.json')
    if (!seedPath) return null
    const seed = JSON.parse(fs.readFileSync(seedPath, 'utf8'))
    taxonomyMap = {}
    for (const bn of (seed.bottlenecks || [])) {
      taxonomyMap[bn.bottleneckId] = bn
    }
  } catch (e) {
    taxonomyMap = null
  }
  return taxonomyMap
}

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

// 从 taxonomy 的 sourceEvidence + microValidationRules 构造针对性练习题
function buildPracticeFromTaxonomy(taxonomyBn, target) {
  const evidences = (taxonomyBn && taxonomyBn.sourceEvidence) || []
  const rules = (taxonomyBn && taxonomyBn.microValidationRules) || []
  const title = target.title || (taxonomyBn && taxonomyBn.title) || '这个卡点'

  // 第一题：用 sourceEvidence 里的真实错例
  const q1 = evidences.length > 0
    ? {
        questionId: `${target.targetId || 'math'}-P01`,
        targetId: target.targetId,
        question: `下面的计算哪里错了？${evidences[0]}`,
        answer: '见解释',
        explanation: rules.length > 0 ? rules[0] : '先算整数乘积，再数小数位数。',
      }
    : {
        questionId: `${target.targetId || 'math'}-P01`,
        targetId: target.targetId,
        question: `做一道 ${title} 相关的题目，写出完整步骤。`,
        answer: '步骤完整即可',
        explanation: '重点观察过程，不只看答案。',
      }

  // 第二题：用 microValidationRules 的验证规则
  const q2 = rules.length > 0
    ? {
        questionId: `${target.targetId || 'math'}-P02`,
        targetId: target.targetId,
        question: rules.length > 1 ? rules[1] : rules[0],
        answer: '按要求完成',
        explanation: '这是验证是否掌握的关键动作。',
      }
    : {
        questionId: `${target.targetId || 'math'}-P02`,
        targetId: target.targetId,
        question: `再练一道 ${title} 的变式题。`,
        answer: '答案正确',
        explanation: '变式题检验是否能迁移。',
      }

  // 第三题：迁移应用（如果有第二个 sourceEvidence 就用，否则用 masteryEvidence）
  const mastery = (taxonomyBn && taxonomyBn.masteryEvidence) || []
  const q3 = evidences.length > 1
    ? {
        questionId: `${target.targetId || 'math'}-P03`,
        targetId: target.targetId,
        question: `换一组数字再做一次：${evidences[1]}`,
        answer: '见解释',
        explanation: rules.length > 2 ? rules[2] : '同样的方法，不同的数字。',
      }
    : {
        questionId: `${target.targetId || 'math'}-P03`,
        targetId: target.targetId,
        question: mastery.length > 0 ? `自检：${mastery[0]}` : `用自己的话解释 ${title} 的关键规则。`,
        answer: '能清楚解释',
        explanation: '能解释规则才算真懂。',
      }

  return [q1, q2, q3]
}

// 旧的硬编码练习题（taxonomy 加载失败时的 fallback）
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
  const taxonomy = loadTaxonomy()
  const taxonomyBn = taxonomy && target.bottleneckId ? taxonomy[target.bottleneckId] : null

  // 优先用 taxonomy 的真实错例和验证规则生成练习
  if (taxonomyBn && ((taxonomyBn.sourceEvidence && taxonomyBn.sourceEvidence.length > 0)
      || (taxonomyBn.microValidationRules && taxonomyBn.microValidationRules.length > 0))) {
    return buildPracticeFromTaxonomy(taxonomyBn, target)
  }

  // fallback：旧的硬编码练习
  if (/DEC-MUL-POINT|小数.*小数点|小数位数/.test(`${target.targetId} ${target.title}`)) {
    return buildDecimalPointPractice(target)
  }
  return buildGenericPractice(target)
}

function buildResourcePackDraft({ studentId, subject = 'math', sourceReportId = '', target: rawTarget = {}, resources = [] } = {}) {
  const target = normalizeResourcePackTarget(rawTarget)
  const taxonomy = loadTaxonomy()
  const taxonomyBn = taxonomy && target.bottleneckId ? taxonomy[target.bottleneckId] : null

  const practiceItems = buildPracticeItems({ target })
  const symptoms = (taxonomyBn && taxonomyBn.symptomPatterns) || target.symptomPatterns || []
  const rootCauses = (taxonomyBn && taxonomyBn.rootCauseSignals) || []
  const repairSteps = (taxonomyBn && taxonomyBn.repairStrategy) || target.repairStrategy || []
  const masteryEvidence = (taxonomyBn && taxonomyBn.masteryEvidence) || []
  const sourceEvidence = (taxonomyBn && taxonomyBn.sourceEvidence) || []

  // === 5 个结构化板块，全部用 taxonomy 真实数据填充 ===

  // 板块 1：这个卡点是什么（summary）
  const summaryBody = taxonomyBn
    ? `${taxonomyBn.title}。优先级：${taxonomyBn.priority || '中'}，修复成本：${taxonomyBn.repairCost || '低'}，对后续影响：${taxonomyBn.impact || '中'}。`
    : target.title

  // 板块 2：为什么会这样错（concept）—— 症状 + 根因
  const conceptParts = []
  if (symptoms.length > 0) {
    conceptParts.push('典型症状：')
    symptoms.slice(0, 3).forEach((s, i) => conceptParts.push(`  ${i + 1}. ${s}`))
  }
  if (rootCauses.length > 0) {
    conceptParts.push('根因信号：')
    rootCauses.slice(0, 3).forEach((r, i) => conceptParts.push(`  ${i + 1}. ${r}`))
  }
  if (sourceEvidence.length > 0) {
    conceptParts.push('真实错例：')
    sourceEvidence.slice(0, 2).forEach((e, i) => conceptParts.push(`  ${i + 1}. ${e}`))
  }
  const conceptBody = conceptParts.length > 0
    ? conceptParts.join('\n')
    : `这个卡点会影响 ${target.title} 相关题目的稳定性。`

  // 板块 3：正确的解题路径（worked_example）
  const exampleQuestion = practiceItems[0].question
  const exampleSteps = repairSteps.length > 0
    ? repairSteps.slice(0, 4)
    : (practiceItems[0].explanation ? [practiceItems[0].explanation] : ['先确认孩子能复述卡点的关键错误点，再做练习。'])

  // 板块 4：容易踩的坑（common_mistake）
  const mistakeText = symptoms.length > 0 ? symptoms[0] : '只看答案，不检查过程。'
  const correctionText = repairSteps.length > 0
    ? repairSteps.join('；')
    : '先复述规则，再看例题，最后做 3 道小练习。'
  const mistakeExplanation = rootCauses.length > 0
    ? rootCauses.slice(0, 2).join('；')
    : '把错误路径和正确路径分开，才能精准修复。'

  // 板块 5：练三道（practice）—— 已在 practiceItems 里

  // 板块 6：怎么算学会了（mastery_check）—— 新增
  const masteryBody = masteryEvidence.length > 0
    ? masteryEvidence.slice(0, 3).map((m, i) => `${i + 1}. ${m}`).join('\n')
    : '能独立完成 3 道变式题且小数点/关键步骤均正确。'

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
    version: 2,
    cacheVersion: 2,
    llmEnhanced: false,
    taxonomyEnhanced: !!taxonomyBn,
    blocks: [
      { type: 'summary', title: '这个卡点是什么', body: summaryBody },
      { type: 'concept', title: '为什么会这样错', body: conceptBody },
      { type: 'worked_example', title: '正确的解题路径', question: exampleQuestion, steps: exampleSteps },
      { type: 'common_mistake', title: '容易踩的坑', mistake: mistakeText, correction: correctionText, explanation: mistakeExplanation },
      { type: 'practice', title: '练三道', questions: practiceItems },
      { type: 'mastery_check', title: '怎么算学会了', body: masteryBody },
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
  buildPracticeFromTaxonomy,
  normalizeResourcePackTarget,
  loadTaxonomy
}

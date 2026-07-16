const { readableNameOf, sanitizeUserText } = require('../../utils/user-facing-text')

// 资源平台优先级（数字越小越靠前）
const PLATFORM_PRIORITY = {
  'B站': 1,
  '哔哩哔哩': 1,
  '小红书': 2,
  '国家中小学智慧教育平台': 3,
  '国家智慧教育平台': 3,
  'Khan Academy': 4,
  'Khan Academy 中文版': 4,
  '可汗学院': 4,
  '可汗学院中文版': 4,
  '均一教育平台': 5,
}

// 平台图标和跳转方式
const PLATFORM_META = {
  'B站': { shortLabel: 'B站', canJump: true, appType: 'bilibili' },
  '哔哩哔哩': { shortLabel: 'B站', canJump: true, appType: 'bilibili' },
  '小红书': { shortLabel: '小红书', canJump: true, appType: 'xhs' },
  '国家中小学智慧教育平台': { shortLabel: '平台', canJump: false },
  '国家智慧教育平台': { shortLabel: '平台', canJump: false },
  'Khan Academy': { shortLabel: '课程', canJump: false },
  'Khan Academy 中文版': { shortLabel: '课程', canJump: false },
  '可汗学院': { shortLabel: '课程', canJump: false },
  '可汗学院中文版': { shortLabel: '课程', canJump: false },
  '均一教育平台': { shortLabel: '平台', canJump: false },
}

function getPlatformMeta(platform) {
  return PLATFORM_META[platform] || { shortLabel: '链接', canJump: false }
}

function getPlatformPriority(platform) {
  return PLATFORM_PRIORITY[platform] || 99
}

function buildExternalResourceCards(externalResources = []) {
  return externalResources
    .map(resource => {
      const platform = resource.platform || '未知'
      const meta = getPlatformMeta(platform)
      return {
        resourceId: resource.resourceId || '',
        platform,
        platformLabel: platform,
        shortLabel: meta.shortLabel,
        title: readableNameOf(resource) || '学习资源',
        role: resource.role || '家长参考',
        url: resource.url || '',
        hasUrl: !!resource.url,
        canJump: meta.canJump && !!resource.url,
        actionText: meta.canJump ? `打开${platform}观看` : '复制链接打开',
        priority: getPlatformPriority(platform),
      }
    })
    .sort((a, b) => a.priority - b.priority)
}

// 把 blocks 数组拆分成结构化字段，供 wxml 精准渲染
function extractBlocks(blocks = []) {
  const find = (type) => blocks.find(b => b.type === type) || null
  const practiceBlock = find('practice')
  // 给每道练习题加 revealed: false 初始状态（答案默认折叠）
  if (practiceBlock && Array.isArray(practiceBlock.questions)) {
    practiceBlock.questions = practiceBlock.questions.map(q => ({ ...q, revealed: false }))
  }
  return {
    summaryBlock: find('summary'),
    conceptBlock: find('concept'),
    workedExampleBlock: find('worked_example'),
    commonMistakeBlock: find('common_mistake'),
    practiceBlock: practiceBlock,
    masteryBlock: find('mastery_check'),
  }
}

function buildLearningResourceView(pack = {}) {
  const blocks = Array.isArray(pack.blocks) ? pack.blocks : []
  const extracted = extractBlocks(blocks)
  const practiceBlock = extracted.practiceBlock
  const practiceCount = practiceBlock && Array.isArray(practiceBlock.questions)
    ? practiceBlock.questions.length
    : 0
  const externalResources = Array.isArray(pack.externalResources) ? pack.externalResources : []
  const resourceCards = buildExternalResourceCards(externalResources)
  const estimatedMinutes = Number(pack.estimatedMinutes) || 0
  const completed = pack.status === 'completed'

  return {
    id: pack._id || pack.packId || '',
    title: sanitizeUserText(pack.title || '学习任务包', { treatAsId: true }),
    status: pack.status || 'ready',
    timeText: estimatedMinutes ? `约 ${estimatedMinutes} 分钟` : '5-10 分钟',
    // 结构化板块（每个都是独立字段，wxml 用 wx:if 精准渲染）
    summaryBlock: extracted.summaryBlock,
    conceptBlock: extracted.conceptBlock,
    workedExampleBlock: extracted.workedExampleBlock,
    commonMistakeBlock: extracted.commonMistakeBlock,
    practiceBlock: extracted.practiceBlock,
    masteryBlock: extracted.masteryBlock,
    practiceCount,
    parentResourceText: resourceCards.length ? `家长参考 ${resourceCards.length} 个` : '',
    resourceCards,
    hasExternalResources: resourceCards.length > 0,
    canComplete: !completed,
    completed,
    // 标记是否有任何实质内容（用于空状态判断）
    hasContent: !!(extracted.summaryBlock || extracted.conceptBlock || extracted.practiceBlock),
  }
}

module.exports = { buildLearningResourceView, buildExternalResourceCards, extractBlocks }

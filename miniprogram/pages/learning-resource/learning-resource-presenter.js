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
  'B站': { icon: '📺', canJump: true, appType: 'bilibili' },
  '哔哩哔哩': { icon: '📺', canJump: true, appType: 'bilibili' },
  '小红书': { icon: '📕', canJump: true, appType: 'xhs' },
  '国家中小学智慧教育平台': { icon: '🏫', canJump: false },
  '国家智慧教育平台': { icon: '🏫', canJump: false },
  'Khan Academy': { icon: '🎓', canJump: false },
  'Khan Academy 中文版': { icon: '🎓', canJump: false },
  '可汗学院': { icon: '🎓', canJump: false },
  '可汗学院中文版': { icon: '🎓', canJump: false },
  '均一教育平台': { icon: '📚', canJump: false },
}

function getPlatformMeta(platform) {
  return PLATFORM_META[platform] || { icon: '🔗', canJump: false }
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
        icon: meta.icon,
        title: resource.title || resource.resourceId || '学习资源',
        role: resource.role || '家长参考',
        url: resource.url || '',
        hasUrl: !!resource.url,
        canJump: meta.canJump && !!resource.url,
        actionText: meta.canJump ? `打开${platform}观看 →` : '复制链接打开 →',
        priority: getPlatformPriority(platform),
      }
    })
    .sort((a, b) => a.priority - b.priority)
}

function buildLearningResourceView(pack = {}) {
  const blocks = Array.isArray(pack.blocks) ? pack.blocks : []
  const practiceBlock = blocks.find(block => block.type === 'practice')
  const practiceCount = Array.isArray(practiceBlock && practiceBlock.questions)
    ? practiceBlock.questions.length
    : 0
  const externalResources = Array.isArray(pack.externalResources) ? pack.externalResources : []
  const resourceCards = buildExternalResourceCards(externalResources)
  const estimatedMinutes = Number(pack.estimatedMinutes) || 0
  const completed = pack.status === 'completed'

  return {
    id: pack._id || pack.packId || '',
    title: pack.title || '学习任务包',
    status: pack.status || 'ready',
    timeText: estimatedMinutes ? `约 ${estimatedMinutes} 分钟` : '5-10 分钟',
    blocks,
    practiceCount,
    parentResourceText: resourceCards.length ? `家长参考 ${resourceCards.length} 个` : '',
    resourceCards,
    hasExternalResources: resourceCards.length > 0,
    canComplete: !completed,
    completed
  }
}

module.exports = { buildLearningResourceView, buildExternalResourceCards }

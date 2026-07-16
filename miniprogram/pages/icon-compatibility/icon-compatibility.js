const { EMOJI_CATEGORIES, EMOJI_CANDIDATE_COUNT } = require('./emoji-candidates')

function categoryMeta(category) {
  return {
    id: category.id,
    name: category.name,
    riskNote: category.riskNote,
    statusText: category.statusText,
    count: category.items.length
  }
}

function safeSystemCall(method) {
  if (typeof wx[method] !== 'function') return null
  try {
    return wx[method]() || null
  } catch (error) {
    return null
  }
}

function environmentText() {
  const device = safeSystemCall('getDeviceInfo') || {}
  const app = safeSystemCall('getAppBaseInfo') || {}
  const legacy = safeSystemCall('getSystemInfoSync') || {}
  const model = device.model || legacy.model || ''
  const system = device.system || legacy.system || ''
  const version = app.version || legacy.version || ''
  const sdkVersion = app.SDKVersion || legacy.SDKVersion || ''
  const parts = [
    model,
    system,
    version ? `微信 ${version}` : '',
    sdkVersion ? `基础库 ${sdkVersion}` : ''
  ].filter(Boolean)
  return parts.length ? parts.join(' · ') : '环境信息不可用'
}

const CATEGORY_TABS = EMOJI_CATEGORIES.map(categoryMeta)
const FIRST_CATEGORY = EMOJI_CATEGORIES[0]

Page({
  data: {
    candidateCount: EMOJI_CANDIDATE_COUNT,
    categoryTabs: CATEGORY_TABS,
    activeCategory: categoryMeta(FIRST_CATEGORY),
    activeItems: FIRST_CATEGORY.items,
    activeCategoryIndex: 0,
    activeTabId: 'category-C01',
    isFirstCategory: true,
    isLastCategory: false,
    environmentText: '环境信息不可用'
  },

  onLoad() {
    this.setData({ environmentText: environmentText() })
  },

  selectCategory(index) {
    const safeIndex = Math.max(0, Math.min(Number(index) || 0, EMOJI_CATEGORIES.length - 1))
    const category = EMOJI_CATEGORIES[safeIndex]
    this.setData({
      activeCategory: categoryMeta(category),
      activeItems: category.items,
      activeCategoryIndex: safeIndex,
      activeTabId: `category-${category.id}`,
      isFirstCategory: safeIndex === 0,
      isLastCategory: safeIndex === EMOJI_CATEGORIES.length - 1
    })
  },

  onCategoryTap(event) {
    this.selectCategory(event.currentTarget.dataset.index)
  },

  onPreviousCategory() {
    if (this.data.isFirstCategory) return
    this.selectCategory(this.data.activeCategoryIndex - 1)
  },

  onNextCategory() {
    if (this.data.isLastCategory) return
    this.selectCategory(this.data.activeCategoryIndex + 1)
  },

  copyPublicId(id) {
    if (!id || typeof wx.setClipboardData !== 'function') {
      wx.showToast({ title: '复制失败', icon: 'none' })
      return Promise.resolve()
    }
    try {
      const result = wx.setClipboardData({ data: id })
      return result && typeof result.then === 'function'
        ? result.catch(() => wx.showToast({ title: '复制失败', icon: 'none' }))
        : Promise.resolve()
    } catch (error) {
      wx.showToast({ title: '复制失败', icon: 'none' })
      return Promise.resolve()
    }
  },

  onCopyCategoryId(event) {
    return this.copyPublicId(event.currentTarget.dataset.id)
  },

  onCopyItemId(event) {
    return this.copyPublicId(event.currentTarget.dataset.id)
  }
})

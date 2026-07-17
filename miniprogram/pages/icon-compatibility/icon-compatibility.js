const { EMOJI_CATEGORIES, EMOJI_CANDIDATE_COUNT } = require('./emoji-candidates')
const { EMOJI_BATCH_02, EMOJI_BATCH_02_COUNT } = require('./emoji-candidates-batch-02')

function categoryMeta(category) {
  return {
    id: category.id,
    name: category.name,
    riskNote: category.riskNote,
    statusText: category.statusText,
    count: category.count || category.items.length
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

const BATCHES = [
  {
    id: 'B02',
    name: '第二批',
    statusText: '待测试',
    count: EMOJI_BATCH_02_COUNT,
    categories: EMOJI_BATCH_02.categories
  },
  {
    id: 'B01',
    name: '第一批',
    statusText: '已通过',
    count: EMOJI_CANDIDATE_COUNT,
    categories: EMOJI_CATEGORIES
  }
]
const BATCH_TABS = BATCHES.map(({ id, name, statusText, count }) => ({ id, name, statusText, count }))
const lastCategoryIndexByBatch = { B02: 0, B01: 0 }

function findBatch(batchId) {
  return BATCHES.find(batch => batch.id === batchId) || null
}

function batchMeta(batch) {
  return {
    id: batch.id,
    name: batch.name,
    statusText: batch.statusText,
    count: batch.count
  }
}

function validCategoryIndex(index, categoryCount) {
  const numeric = Number(index)
  return Number.isInteger(numeric) && numeric >= 0 && numeric < categoryCount ? numeric : 0
}

function activeState(batchId, categoryIndex) {
  const batch = findBatch(batchId) || BATCHES[0]
  const safeIndex = validCategoryIndex(categoryIndex, batch.categories.length)
  const category = batch.categories[safeIndex]
  return {
    activeBatch: batchMeta(batch),
    categoryTabs: batch.categories.map(categoryMeta),
    activeCategory: categoryMeta(category),
    activeItems: category.items,
    activeCategoryIndex: safeIndex,
    activeTabId: `category-${category.id}`,
    isFirstCategory: safeIndex === 0,
    isLastCategory: safeIndex === batch.categories.length - 1
  }
}

const INITIAL_STATE = activeState('B02', 0)

Page({
  data: {
    candidateCount: EMOJI_CANDIDATE_COUNT + EMOJI_BATCH_02_COUNT,
    batchTabs: BATCH_TABS,
    ...INITIAL_STATE,
    environmentText: '环境信息不可用'
  },

  onLoad() {
    this.setData({ environmentText: environmentText() })
  },

  selectCategory(index) {
    const currentBatch = findBatch(this.data.activeBatch && this.data.activeBatch.id) || BATCHES[0]
    const state = activeState(currentBatch.id, index)
    lastCategoryIndexByBatch[currentBatch.id] = state.activeCategoryIndex
    this.setData(state)
  },

  selectBatch(batchId) {
    const currentBatch = findBatch(this.data.activeBatch && this.data.activeBatch.id)
    const requestedBatch = findBatch(batchId)
    if (!requestedBatch) {
      this.setData(activeState(currentBatch ? currentBatch.id : 'B02', 0))
      return
    }
    if (currentBatch) {
      lastCategoryIndexByBatch[currentBatch.id] = validCategoryIndex(
        this.data.activeCategoryIndex,
        currentBatch.categories.length
      )
    }
    this.setData(activeState(requestedBatch.id, lastCategoryIndexByBatch[requestedBatch.id]))
  },

  onBatchTap(event) {
    this.selectBatch(event.currentTarget.dataset.id)
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

  onCopyBatchId(event) {
    return this.copyPublicId(event.currentTarget.dataset.id)
  },

  onCopyItemId(event) {
    return this.copyPublicId(event.currentTarget.dataset.id)
  }
})

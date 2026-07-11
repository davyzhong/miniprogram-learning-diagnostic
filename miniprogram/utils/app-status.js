// 统一状态感知体系 —— App 级全局单例 + 页面混入 helper。
//
// appStatus 是整个小程序共享的状态 store 实例。
// bindPageStatus 提供声明式的页面接入：页面只需定义 handlers，
// 自动管理事件订阅/退订生命周期。

const { createStatusStore, EVENTS, OP_TYPES, OP_STATUS } = require('./status-store')

// 全局唯一实例（整个小程序共享）
const appStatus = createStatusStore()

// 记录已经混入的页面实例，防止重复绑定
const boundPages = new WeakSet()

// 页面混入：自动在页面生命周期中管理事件订阅。
//
// 用法（在 Page({}) 的 onLoad 中调用）：
//   this._statusUnsub = bindPageStatus(this, {
//     studentIdGetter: () => this.data.studentId,
//     subjectGetter: () => this.data.subject,
//     handlers: {
//       onOperationCompleted: (op) => { this.loadProfile({ force: true }) },
//       onOperationChanged: (op) => { this.setData({ ... }) }
//     }
//   })
//
// 退订在 onUnload 自动处理，也可手动调返回的 unsubscribe 函数。
function bindPageStatus(pageInstance, options = {}) {
  if (!pageInstance || boundPages.has(pageInstance)) return () => {}
  boundPages.add(pageInstance)

  const {
    studentIdGetter = () => '',
    subjectGetter = () => '',
    handlers = {}
  } = options

  const {
    onOperationChanged = () => {},
    onOperationCompleted = () => {},
    onOperationRegistered = () => {},
    onCacheInvalidated = () => {}
  } = handlers

  // 过滤：只通知与当前页面相关的操作（同学生、同学科）
  function isRelevant(op) {
    const pageStudentId = studentIdGetter()
    const pageSubject = subjectGetter()
    // 学生 ID 不匹配则跳过（空学生 ID 表示全局关注，不过滤）
    if (pageStudentId && op.studentId && op.studentId !== pageStudentId) return false
    // 学科不匹配且页面有明确学科则跳过
    if (pageSubject && op.subject && op.subject !== pageSubject) return false
    return true
  }

  const unsubChanged = appStatus.on(EVENTS.OPERATION_CHANGED, op => {
    if (isRelevant(op)) onOperationChanged(op)
  })
  const unsubCompleted = appStatus.on(EVENTS.OPERATION_COMPLETED, op => {
    if (isRelevant(op)) onOperationCompleted(op)
  })
  const unsubRegistered = appStatus.on(EVENTS.OPERATION_REGISTERED, op => {
    if (isRelevant(op)) onOperationRegistered(op)
  })
  const unsubCache = appStatus.on(EVENTS.CACHE_INVALIDATED, payload => {
    onCacheInvalidated(payload)
  })

  // 返回退订函数（页面 onUnload 时调）
  const unsubscribe = () => {
    unsubChanged()
    unsubCompleted()
    unsubRegistered()
    unsubCache()
    boundPages.delete(pageInstance)
  }

  // 自动绑定 onUnload（如果页面没有自定义的话也能退订）
  const originalOnUnload = pageInstance.onUnload
  pageInstance.onUnload = function () {
    unsubscribe()
    if (typeof originalOnUnload === 'function') originalOnUnload.call(this)
  }

  // 把 unsubscribe 也挂到实例上，方便手动调用
  pageInstance._statusUnsub = unsubscribe

  return unsubscribe
}

module.exports = {
  appStatus,
  bindPageStatus,
  OP_TYPES,
  OP_STATUS,
  EVENTS
}

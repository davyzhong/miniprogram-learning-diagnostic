// 统一状态感知体系 —— 全局状态 Store + 事件总线。
//
// 纯 JS 实现（不依赖 wx），用于跟踪所有异步操作的 in-flight 状态，
// 并在操作状态变更时通过事件总线通知所有订阅的页面。
//
// 设计文档见 docs/subject-design/统一状态感知体系设计说明.md

// 操作类型枚举（覆盖所有异步操作）
const OP_TYPES = {
  ANALYSIS: 'analysis',                    // 拍照诊断分析
  VERIFICATION_ANALYSIS: 'verification_analysis', // 验证卷答题分析
  VERIFICATION_PAPER: 'verification_paper', // 验证卷自动生成
  REPORT_PDF: 'report_pdf',                // 报告 PDF 生成
  DICTATION_GRADING: 'dictation_grading'    // 英语听写批改
}

// 操作状态枚举
const OP_STATUS = {
  PENDING: 'pending',
  ANALYZING: 'analyzing',
  GENERATING: 'generating',
  COMPLETED: 'completed',
  FAILED: 'failed'
}

// 活跃状态集合（非终态）
const ACTIVE_STATUSES = new Set([OP_STATUS.PENDING, OP_STATUS.ANALYZING, OP_STATUS.GENERATING])

// 事件类型
const EVENTS = {
  OPERATION_CHANGED: 'operation:changed',
  OPERATION_REGISTERED: 'operation:registered',
  OPERATION_COMPLETED: 'operation:completed',
  CACHE_INVALIDATED: 'cache:invalidated'
}

function opKey(studentId, subject, opType) {
  return `${studentId || ''}:${subject || ''}:${opType}`
}

function createStatusStore() {
  // key → operation 对象
  const operations = new Map()
  // event → Set<handler>
  const listeners = new Map()

  function on(event, handler) {
    if (!listeners.has(event)) listeners.set(event, new Set())
    listeners.get(event).add(handler)
    // 返回退订函数
    return () => off(event, handler)
  }

  function off(event, handler) {
    const set = listeners.get(event)
    if (set) set.delete(handler)
  }

  function emit(event, payload) {
    const set = listeners.get(event)
    if (!set) return
    // 复制一份避免回调中增删导致迭代异常
    for (const handler of [...set]) {
      try {
        handler(payload)
      } catch (err) {
        console.error('[status-store] handler error', err)
      }
    }
  }

  // 注册或更新一个操作的状态
  function registerOperation(entry) {
    const {
      studentId = '',
      subject = '',
      opType,
      status,
      progress = 0,
      progressText = '',
      label = '',
      reportId = '',
      paperId = '',
      detail = {}
    } = entry

    if (!opType || !status) return null

    const key = opKey(studentId, subject, opType)
    const prev = operations.get(key) || {}
    const wasActive = ACTIVE_STATUSES.has(prev.status)
    const isActive = ACTIVE_STATUSES.has(status)

    const operation = {
      key,
      studentId,
      subject,
      opType,
      status,
      progress: Math.max(0, Math.min(100, Number(progress) || 0)),
      progressText: progressText || prev.progressText || '',
      label: label || prev.label || '',
      reportId: reportId || prev.reportId || '',
      paperId: paperId || prev.paperId || '',
      detail: { ...prev.detail, ...detail },
      updatedAt: Date.now()
    }
    operations.set(key, operation)

    emit(EVENTS.OPERATION_CHANGED, operation)

    if (!wasActive && isActive) {
      emit(EVENTS.OPERATION_REGISTERED, operation)
    }

    // 从活跃变为完成/失败
    if (wasActive && !isActive) {
      emit(EVENTS.OPERATION_COMPLETED, operation)
    }

    return operation
  }

  function getOperation(studentId, subject, opType) {
    return operations.get(opKey(studentId, subject, opType)) || null
  }

  function getOperations(studentId, subject) {
    const result = []
    for (const op of operations.values()) {
      if (studentId && op.studentId !== studentId) continue
      if (subject && op.subject !== subject) continue
      result.push(op)
    }
    return result
  }

  function getActiveOperations(studentId) {
    return getOperations(studentId).filter(op => ACTIVE_STATUSES.has(op.status))
  }

  function hasActiveOperation(studentId, subject, opType) {
    const op = getOperation(studentId, subject, opType)
    return Boolean(op && ACTIVE_STATUSES.has(op.status))
  }

  function clear() {
    operations.clear()
  }

  function clearForStudent(studentId) {
    for (const [key, op] of operations) {
      if (op.studentId === studentId) operations.delete(key)
    }
  }

  return {
    on,
    off,
    emit,
    registerOperation,
    getOperation,
    getOperations,
    getActiveOperations,
    hasActiveOperation,
    clear,
    clearForStudent,
    // 暴露常量供外部引用
    OP_TYPES,
    OP_STATUS,
    EVENTS,
    ACTIVE_STATUSES
  }
}

module.exports = {
  createStatusStore,
  OP_TYPES,
  OP_STATUS,
  EVENTS,
  ACTIVE_STATUSES
}
